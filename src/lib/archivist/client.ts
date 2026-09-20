'use client';

import { getFirebaseAuth } from '@/lib/firebase/config';
import { isDevMock } from '@/lib/devMock';
import { useDeckStore } from '@/store/deckStore';
import { useAppConfigStore } from '@/store/appConfigStore';
import { usageThisMonth } from '@/lib/plan';
import type { ArchivistPayload, ChatMessage, ArchivistErrorCode } from './types';

/**
 * Talking to /api/archivist from the browser. Streams the answer chunk by chunk, turns the
 * server's error codes into one typed error the UI can switch on, and in development mock
 * mode answers from a canned script so screens render without a server or a key.
 */

export class ArchivistError extends Error {
  constructor(public code: ArchivistErrorCode, message: string, public allowance?: { used: number; allowed: number }) {
    super(message);
  }
}

export interface ArchivistResult {
  text: string;
  used: number | null;
  allowed: number | null;
  model: string | null;
}

export async function askArchivist(
  payload: ArchivistPayload,
  history: ChatMessage[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<ArchivistResult> {
  if (isDevMock()) return mockAnswer(payload, onChunk, signal);

  const auth = getFirebaseAuth();
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new ArchivistError('unauthenticated', 'Sign in to ask the Archivist.');

  let res: Response;
  try {
    res = await fetch('/api/archivist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ payload, messages: history }),
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ArchivistError('network', 'Could not reach the Archivist.');
  }

  if (!res.ok) {
    let code: ArchivistErrorCode = 'server';
    let message = 'The Archivist could not answer.';
    let allowance: { used: number; allowed: number } | undefined;
    try {
      const data = await res.json();
      code = (data?.error?.code as ArchivistErrorCode) ?? code;
      message = data?.error?.message ?? message;
      allowance = data?.allowance;
    } catch { /* body was not JSON */ }
    throw new ArchivistError(code, message, allowance);
  }

  const used = num(res.headers.get('X-Archivist-Used'));
  const allowed = num(res.headers.get('X-Archivist-Allowed'));
  const model = res.headers.get('X-Archivist-Model');

  if (!res.body) {
    const text = await res.text();
    onChunk(text);
    return { text, used, allowed, model };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) { text += chunk; onChunk(chunk); }
  }
  return { text, used, allowed, model };
}

function num(v: string | null): number | null {
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Development mock ────────────────────────────────────────────────────────

const MOCK: Record<ArchivistPayload['task'], string> = {
  'deck.improve': `## What works\n\nAtraxa does the heavy lifting: proliferate turns every counter into a clock, and **Doubling Season** with **Deepglow Skate** is the kind of redundancy the plan wants.\n\n## What holds it back\n\n- 17 lands in a 41-card list is fine; in 100 it will not be. Plan for 36–37.\n- Only two pieces of interaction. Four-colour decks can afford **Anguished Unmaking** *and* a wipe.\n- The curve peaks at four; there is nothing to do on turn two.\n\n## What to change\n\n- Cut **Mulldrifter** for **Rhystic Study** — the draw comes earlier and asks nothing of the board.\n- Add **Arcane Signet** and **Fellwar Stone** — turn-two plays that make Atraxa arrive on four.\n- Add **Toxic Deluge** — the wipe that spares your walkers.`,
  'deck.swaps': JSON.stringify({ swaps: [
    { remove: 'Mulldrifter', add: 'Dragonlord Dromoka', reason: 'A body that shuts off interaction on your turn; the draw was never the point.' },
    { remove: 'Cultivate', add: 'Three Visits', reason: 'Same ramp, one mana cheaper.' },
    { remove: 'Thraben Inspector', add: 'Esper Sentinel', reason: 'A one-drop that taxes opponents instead of one clue.' },
    { remove: 'Serra Angel', add: 'Lightning Bolt', reason: 'Cheap interaction.' },
    { remove: 'Walking Ballista', add: 'Scroll of the Unwritten Archive', reason: 'Card advantage.' },
  ] }),
  'deck.strategy': `## Game plan\n\nLand Atraxa on turn four, stabilise with removal, then let proliferate compound every planeswalker and counter you have. You win by attrition, not a single blow.\n\n## Opening hands\n\nKeep three lands and a rock. Mulligan any seven without a play before turn three.\n\n## Key lines\n\n- **Doubling Season** into **Elspeth, Sun's Champion** ultimates the turn she lands.\n- **Deepglow Skate** doubles every counter on the board; hold it until three walkers are out.\n\n## Protect these\n\nAtraxa above all — commander tax on a four-colour cost hurts. Keep **Counterspell** for the wipe, not for value spells.\n\n## What beats it\n\nFast aggro before turn four, and any deck that can exile the commander.`,
  'commander.ideas': JSON.stringify({ ideas: [
    { name: 'Krenko, Mob Boss', why: 'Doubles your goblins every turn; wide, fast, and simple to pilot.' },
    { name: "Atraxa, Praetors' Voice", why: 'Four colours and proliferate for a counters or planeswalker deck.' },
    { name: 'The Ur-Dragon', why: 'Every dragon ever printed, and a discount on all of them.' },
  ] }),
  'match.advice': `Pass priority on Counterspell — you cannot save Ancestral Recall and **Swords to Plowshares** is better spent on a creature.\n\nThen, in your main phase:\n\n1. Play **Forest**.\n2. Cast **Rhystic Study** (three mana): it taxes both opponents from now on.\n3. Hold **Counterspell** with the remaining two mana for the Ur-Dragon's next big play.\n\nDo not attack with Serra Angel into Krenko's nine goblins; the trade is bad and you need the blocker. Krenko AI is at 18 with 12 commander damage already — Atraxa gets there in two swings.`,
  'rules.question': `The stack resolves last in, first out. When Counterspell targets Ancestral Recall, Counterspell is on top and resolves first; if it resolves, Ancestral Recall is countered and never resolves.\n\nYou can respond only while you have priority, which you are given after each spell or ability is put on the stack.`,
  'game.recap': `## What decided it\n\nKrenko's board grew unchecked from turn three. You held **Toxic Deluge** two turns too long; by the time you cast it, Skullclamp had already drawn him eight cards.\n\n## The turning point\n\nTurn six, when Ur-Dragon resolved with no counter up.\n\n## Next time\n\n- Wipe early against a token deck; the second wave is weaker than the first.\n- Keep two mana open on the Ur-Dragon player's turn from turn six on.`,
};

async function mockAnswer(payload: ArchivistPayload, onChunk: (t: string) => void, signal?: AbortSignal): Promise<ArchivistResult> {
  const text = MOCK[payload.task];
  const isJson = payload.task === 'deck.swaps' || payload.task === 'commander.ideas';
  // The meter moves by one per answer, as the server's would.
  const { profile, plan } = useDeckStore.getState();
  const config = useAppConfigStore.getState().config;
  const used = usageThisMonth(profile).archivist + 1;
  const allowed = plan === 'patron' ? config.allowance.patron : config.allowance.free;
  if (isJson) { onChunk(text); return { text, used, allowed, model: 'mock' }; }
  const words = text.split(/(\s+)/);
  let out = '';
  for (const w of words) {
    if (signal?.aborted) break;
    await new Promise((r) => setTimeout(r, 12));
    out += w;
    onChunk(w);
  }
  return { text: out, used, allowed, model: 'mock' };
}
