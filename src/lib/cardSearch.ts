/**
 * Card search for the deck builder.
 *
 * Scryfall answers first: it matches words anywhere in a name, filters by colour identity and
 * commander-eligibility on its side, and ranks by how often EDHREC sees a card, which is what
 * "search" means to a Commander player. Every card it returns is the same shape as the records
 * in our card collection, so a result can go straight into a deck. If Scryfall is unreachable
 * the shared card collection answers with a name-prefix match, filtered here. In development
 * mock mode the pocket database answers.
 */

import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { isDevMock } from '@/lib/devMock';
import { canBeCommander, fitsIdentity } from '@/lib/deckRules';

export interface SearchOptions {
  /** Restrict to cards inside this colour identity. `[]` means colourless only; null/undefined means no filter. */
  identity?: readonly string[] | null;
  /** Only cards that can lead a deck. */
  commanderOnly?: boolean;
  limit?: number;
}

export interface SearchResult {
  cards: ScryfallCardRecord[];
  source: 'scryfall' | 'database' | 'mock';
}

const SCRYFALL = 'https://api.scryfall.com';

/** The Scryfall query string for a search. Exported for tests. */
export function buildScryfallQuery(text: string, opts: SearchOptions = {}): string {
  const parts: string[] = [];
  const t = text.trim();
  // A bare word matches names; quoting keeps multi-word input as one name fragment.
  if (t) parts.push(/\s/.test(t) ? `name:"${t.replace(/"/g, '')}"` : t);
  parts.push('legal:commander');
  if (opts.commanderOnly) parts.push('is:commander');
  if (opts.identity) parts.push(`id<=${opts.identity.length ? opts.identity.join('').toLowerCase() : 'c'}`);
  return parts.join(' ');
}

async function searchScryfall(text: string, opts: SearchOptions): Promise<ScryfallCardRecord[]> {
  const q = buildScryfallQuery(text, opts);
  const url = `${SCRYFALL}/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=edhrec`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 404) return []; // Scryfall's "no cards matched"
    if (!res.ok) throw new Error(`Scryfall ${res.status}`);
    const data = (await res.json()) as { data?: ScryfallCardRecord[] };
    return (data.data ?? []).slice(0, opts.limit ?? 24);
  } finally {
    clearTimeout(timer);
  }
}

function applyFilters(cards: ScryfallCardRecord[], opts: SearchOptions): ScryfallCardRecord[] {
  let out = cards.filter((c) => (c.legalities?.commander ?? 'legal') === 'legal');
  if (opts.commanderOnly) out = out.filter(canBeCommander);
  if (opts.identity) out = out.filter((c) => fitsIdentity(c, opts.identity!));
  return out.slice(0, opts.limit ?? 24);
}

/**
 * Search by name. Two characters minimum; fewer returns nothing rather than everything.
 */
export async function searchCards(text: string, opts: SearchOptions = {}): Promise<SearchResult> {
  const q = text.trim();
  if (q.length < 2) return { cards: [], source: 'database' };

  if (isDevMock()) {
    const { searchMockCards } = await import('@/dev/mockCards');
    return { cards: applyFilters(searchMockCards(q, 100), opts), source: 'mock' };
  }

  try {
    return { cards: await searchScryfall(q, opts), source: 'scryfall' };
  } catch (err) {
    console.warn('[cardSearch] Scryfall unavailable, falling back to the card database:', err);
  }

  const { searchCardsByName } = await import('@/lib/firebase/cards');
  const cap = q.charAt(0).toUpperCase() + q.slice(1);
  const seen = new Map<string, ScryfallCardRecord>();
  for (const variant of new Set([cap, q])) {
    for (const rec of await searchCardsByName(variant, 40)) if (!seen.has(rec.name)) seen.set(rec.name, rec);
  }
  return { cards: applyFilters([...seen.values()], opts), source: 'database' };
}
