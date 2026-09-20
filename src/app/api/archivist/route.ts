import { NextResponse } from 'next/server';
import { requireUser, errorResponse, jsonError } from '@/lib/server/auth';
import { getAppConfig } from '@/lib/server/appConfig';
import { reserveCall, recordCall, QuotaError } from '@/lib/server/metering';
import { resolvePlan } from '@/lib/plan';
import { can } from '@/lib/entitlements';
import { buildMessages, isJsonTask, taskFeature } from '@/lib/archivist/prompts';
import type { ArchivistRequest, ArchivistPayload } from '@/lib/archivist/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TASKS = new Set(['deck.improve', 'deck.swaps', 'deck.strategy', 'commander.ideas', 'match.advice', 'rules.question', 'game.recap']);

/**
 * POST /api/archivist — one endpoint for every task.
 *
 *   auth → master switch → plan gate → reserve one call → build the prompt → OpenRouter →
 *   stream the answer back as plain text → record tokens
 *
 * Prose tasks stream (text/plain, chunk by chunk). JSON tasks (swaps, ideas) return the whole
 * body at once; the client validates every card name before anything reaches a deck.
 * The Archivist's usage headers ride on the response so the client can update its meter
 * without another round trip.
 *
 * ARCHIVIST_STUB=1 answers from a canned script instead of calling the model — for previews
 * and for testing the full path without spending anything. Auth and metering still apply.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  let body: ArchivistRequest;
  try {
    body = (await request.json()) as ArchivistRequest;
  } catch {
    return jsonError(400, 'bad-request', 'Malformed request.');
  }
  const payload = body?.payload as ArchivistPayload | undefined;
  if (!payload || typeof payload !== 'object' || !TASKS.has(payload.task)) {
    return jsonError(400, 'bad-request', 'Unknown task.');
  }
  const history = Array.isArray(body.messages) ? body.messages.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-8) : [];

  let uid: string;
  try {
    uid = (await requireUser(request)).uid;
  } catch (err) {
    const res = errorResponse(err);
    if (res) return res;
    throw err;
  }

  const config = await getAppConfig();
  if (!config.archivistEnabled) {
    return jsonError(503, 'disabled', config.notice || 'The Archivist is resting. Try again later.');
  }

  // Plan gate, then the allowance. Both are the server's call; the client only mirrors them.
  let allowance;
  try {
    const reserved = await reserveCall(uid, config);
    allowance = reserved.allowance;
    const plan = resolvePlan(reserved.profile);
    // Enforced here regardless of the client's launch switch: the switch governs vault and
    // pod limits, not what the server will spend on a request.
    if (!can(plan, taskFeature(payload.task), true)) {
      return jsonError(402, 'patron', 'That is a Patron feature.');
    }
  } catch (err) {
    if (err instanceof QuotaError) {
      return NextResponse.json({ error: { code: 'quota', message: err.message }, allowance: err.allowance }, { status: 429 });
    }
    console.error('[archivist] metering', err);
    return jsonError(500, 'server', 'Could not check your allowance.');
  }

  const messages = buildMessages(payload, history);
  const json = isJsonTask(payload.task);
  const headers = {
    'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Archivist-Used': String(allowance.used),
    'X-Archivist-Allowed': String(allowance.allowed),
    'X-Archivist-Model': config.archivistModel,
  };

  // Stub: a canned answer with the same shape, no upstream call.
  if (process.env.ARCHIVIST_STUB === '1') {
    const text = json
      ? (payload.task === 'deck.swaps'
          ? JSON.stringify({ swaps: [{ remove: 'Cultivate', add: 'Three Visits', reason: 'Same ramp, one mana cheaper.' }] })
          : JSON.stringify({ ideas: [{ name: 'Krenko, Mob Boss', why: 'Goblins, wide and fast.' }] }))
      : `## Stub answer\n\nThe Archivist is running from a canned script (ARCHIVIST_STUB=1). The task was **${payload.task}**.`;
    void recordCall({ uid, task: payload.task, model: 'stub', tokensIn: 0, tokensOut: 0, ms: Date.now() - startedAt, ok: true });
    return new Response(text, { headers });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[archivist] OPENROUTER_API_KEY is not set');
    return jsonError(503, 'disabled', 'The Archivist is not configured on this deployment.');
  }

  // Every task streams from the model, JSON ones included (the client parses the whole text
  // when it ends). The response starts the moment we have the headers: Vercel's gateway
  // gives a function only seconds to answer before it reports a 504, and a model can take
  // longer than that to send its first token. The upstream call therefore happens inside the
  // stream; a failure after the headers are out is written into the body as a line the
  // player can read.
  const upstreamBody: Record<string, unknown> = {
    model: config.archivistModel,
    messages,
    max_tokens: json ? 900 : 700,
    temperature: json ? 0.3 : 0.5,
    stream: true,
    stream_options: { include_usage: true },
    ...(json ? { response_format: { type: 'json_object' } } : {}),
    // Advice, not proofs: a thinking phase adds seconds before the first word for no gain.
    reasoning: { enabled: false },
  };

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const promptChars = messages.reduce((s, m) => s + m.content.length, 0);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let outChars = 0;
      let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      const finish = (ok: boolean) => void recordCall({
        uid, task: payload.task, model: config.archivistModel,
        tokensIn: usage?.prompt_tokens ?? Math.round(promptChars / 4),
        tokensOut: usage?.completion_tokens ?? Math.round(outChars / 4),
        ms: Date.now() - startedAt, ok,
      });
      const fail = (message: string) => {
        controller.enqueue(encoder.encode(json ? '' : `\n\n*${message}*`));
        controller.close();
        finish(false);
      };

      let upstream: Response;
      try {
        upstream = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? 'https://undercroft.app',
            'X-Title': 'Undercroft',
          },
          body: JSON.stringify(upstreamBody),
          signal: AbortSignal.timeout(55_000),
        });
      } catch (err) {
        console.error('[archivist] upstream fetch failed', err);
        return fail('The Archivist could not reach the model. Try again in a moment.');
      }
      console.log(`[archivist] ${payload.task} upstream ${upstream.status} after ${Date.now() - startedAt}ms (model ${config.archivistModel})`);

      if (!upstream.ok || !upstream.body) {
        const detail = await upstream.text().catch(() => '');
        console.error('[archivist] upstream', upstream.status, detail.slice(0, 500));
        return fail(upstream.status === 429 ? 'The model is busy. Try again in a moment.' : upstream.status === 404 || upstream.status === 400 ? 'The model this deployment is set to was not accepted (check the model id in Settings → Administration).' : 'The model returned an error.');
      }

      const reader = upstream.body.getReader();
      let buffer = '';
      let firstTokenAt = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const data = t.slice(5).trim();
            if (data === '[DONE]') continue;
            try {
              const evt = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }>; usage?: typeof usage; error?: { message?: string } };
              if (evt.error?.message) { console.error('[archivist] model error', evt.error.message); return fail('The model returned an error.'); }
              if (evt.usage) usage = evt.usage;
              const delta = evt.choices?.[0]?.delta?.content;
              if (delta) {
                if (!firstTokenAt) { firstTokenAt = Date.now(); console.log(`[archivist] first token after ${firstTokenAt - startedAt}ms`); }
                outChars += delta.length;
                controller.enqueue(encoder.encode(delta));
              }
            } catch { /* keep-alive comments and partial lines */ }
          }
        }
        if (!outChars) console.warn('[archivist] the model sent no content');
        controller.close();
        finish(true);
      } catch (err) {
        console.error('[archivist] stream', err);
        fail('The Archivist lost the thread. Try again.');
      }
    },
  });

  return new Response(stream, { headers });
}
