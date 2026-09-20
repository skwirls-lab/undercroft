'use client';

import { useCallback, useRef, useState } from 'react';
import { askArchivist, ArchivistError } from '@/lib/archivist/client';
import type { ArchivistPayload, ChatMessage } from '@/lib/archivist/types';
import { useDeckStore } from '@/store/deckStore';
import { monthKey } from '@/lib/plan';

/**
 * One in-flight question at a time, streamed into `answer`. Errors keep their code so the UI
 * can offer the right thing: sign in, become a Patron, wait for next month, or try again.
 * After a successful call the local usage meter is bumped from the response headers, so the
 * Settings meter is right without a reload.
 */
export function useArchivist() {
  const [answer, setAnswer] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ArchivistError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(async (payload: ArchivistPayload, history: ChatMessage[] = []): Promise<string | null> => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnswer('');
    setError(null);
    setStreaming(true);
    try {
      const result = await askArchivist(payload, history, (chunk) => setAnswer((a) => a + chunk), ctrl.signal);
      if (result.used != null) bumpUsage(result.used);
      return result.text;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return null;
      const e = err instanceof ArchivistError ? err : new ArchivistError('server', 'The Archivist could not answer.');
      setError(e);
      if (e.allowance) bumpUsage(e.allowance.used);
      return null;
    } finally {
      if (abortRef.current === ctrl) setStreaming(false);
    }
  }, []);

  const cancel = useCallback(() => { abortRef.current?.abort(); setStreaming(false); }, []);
  const reset = useCallback(() => { abortRef.current?.abort(); setAnswer(''); setError(null); setStreaming(false); }, []);

  return { answer, streaming, error, ask, cancel, reset };
}

/** Reflect the server's count in the profile so the meter moves at once. */
function bumpUsage(used: number) {
  const month = monthKey();
  useDeckStore.setState((s) => {
    const prev = s.profile.usage[month] ?? { archivist: 0, tokensIn: 0, tokensOut: 0 };
    if (prev.archivist === used) return s;
    return { profile: { ...s.profile, usage: { ...s.profile.usage, [month]: { ...prev, archivist: used } } } };
  });
}
