'use client';

import { useEffect, useState } from 'react';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { loadCardRecords } from '@/lib/deckCards';

const EMPTY = new Map<string, ScryfallCardRecord | null>();

/**
 * Card records for a set of names, loaded once and cached across screens. While a new set is
 * loading the previous records are kept, so a deck edit does not blank the grid.
 */
export function useCardRecords(names: string[]) {
  const key = names.join('\u0000');
  const [state, setState] = useState<{ key: string; records: Map<string, ScryfallCardRecord | null> }>({ key: '', records: EMPTY });

  useEffect(() => {
    if (names.length === 0) return;
    let alive = true;
    loadCardRecords(names)
      .then((records) => { if (alive) setState({ key, records }); })
      .catch((err) => console.error('[useCardRecords] load failed:', err));
    return () => { alive = false; };
    // `key` is the names, joined; the array identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { records: state.records, loading: names.length > 0 && state.key !== key };
}
