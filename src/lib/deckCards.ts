/**
 * Card data for deck screens, and the one resolution pipeline every deck edit goes through.
 *
 * Deck documents hold names and quantities, nothing more — images, types and rules text come
 * from the shared `cards` collection at view time. This module is the only place that reads
 * them for the vault, so the cache, the grouping rules and the dev-mock substitute live
 * together and every deck screen agrees on what a "creature" is.
 */

import type { ScryfallCardRecord } from '@/lib/cardTypes';
import type { DeckEntry } from '@/store/deckStore';
import { isDevMock } from '@/lib/devMock';

// ─── Lookup ──────────────────────────────────────────────────────────────────

const recordCache = new Map<string, ScryfallCardRecord | null>();

/**
 * Card records for a list of names. Cached for the session; names that are not in the
 * database resolve to null and stay null, so a deck full of typos does not re-query on
 * every render.
 */
export async function loadCardRecords(names: string[]): Promise<Map<string, ScryfallCardRecord | null>> {
  const wanted = [...new Set(names.filter(Boolean))];
  const missing = wanted.filter((n) => !recordCache.has(n));

  if (missing.length > 0) {
    if (isDevMock()) {
      const { lookupMockCards } = await import('@/dev/mockCards');
      for (const [name, rec] of lookupMockCards(missing)) recordCache.set(name, rec);
    } else {
      const { resolveCardNames } = await import('@/lib/firebase/cards');
      const resolved = await resolveCardNames(missing);
      for (const [name, rec] of resolved) recordCache.set(name, rec);
    }
  }

  const out = new Map<string, ScryfallCardRecord | null>();
  for (const n of wanted) out.set(n, recordCache.get(n) ?? null);
  return out;
}

/** Name-prefix search for the add-card box. Case-insensitive on the first letter only, which is what Firestore can do. */
export async function searchCards(prefix: string, limit = 12): Promise<ScryfallCardRecord[]> {
  const q = prefix.trim();
  if (q.length < 2) return [];
  if (isDevMock()) {
    const { searchMockCards } = await import('@/dev/mockCards');
    return searchMockCards(q, limit);
  }
  const { searchCardsByName } = await import('@/lib/firebase/cards');
  const cap = q.charAt(0).toUpperCase() + q.slice(1);
  const seen = new Map<string, ScryfallCardRecord>();
  for (const variant of new Set([cap, q])) {
    const found = await searchCardsByName(variant, limit);
    for (const rec of found) if (!seen.has(rec.name)) seen.set(rec.name, rec);
    if (seen.size >= limit) break;
  }
  return [...seen.values()].slice(0, limit);
}

// ─── Faces and images ────────────────────────────────────────────────────────

export interface CardFaceView {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image?: string;
  art?: string;
}

/** The front face, flattened. Double-faced cards keep the front's image and text. */
export function frontFace(rec: ScryfallCardRecord): CardFaceView {
  const face = rec.card_faces?.[0];
  const uris = rec.image_uris ?? face?.image_uris;
  return {
    name: rec.name,
    manaCost: face?.mana_cost ?? rec.mana_cost ?? '',
    typeLine: face?.type_line ?? rec.type_line ?? '',
    oracleText: face?.oracle_text ?? rec.oracle_text ?? '',
    power: face?.power ?? rec.power,
    toughness: face?.toughness ?? rec.toughness,
    loyalty: rec.loyalty,
    image: uris?.normal || uris?.large || uris?.small,
    art: uris?.art_crop,
  };
}

// ─── Grouping ────────────────────────────────────────────────────────────────

export type CardGroup =
  | 'Commander'
  | 'Creatures'
  | 'Planeswalkers'
  | 'Instants'
  | 'Sorceries'
  | 'Artifacts'
  | 'Enchantments'
  | 'Battles'
  | 'Lands'
  | 'Other';

export const GROUP_ORDER: readonly CardGroup[] = [
  'Commander', 'Creatures', 'Planeswalkers', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Battles', 'Lands', 'Other',
];

/** Which section a card sits in. Lands first so Dryad Arbor counts as a land, then by primary type. */
export function groupFor(typeLine: string | undefined): CardGroup {
  const t = (typeLine ?? '').split(' // ')[0].toLowerCase();
  if (!t) return 'Other';
  if (t.includes('land')) return 'Lands';
  if (t.includes('creature')) return 'Creatures';
  if (t.includes('planeswalker')) return 'Planeswalkers';
  if (t.includes('instant')) return 'Instants';
  if (t.includes('sorcery')) return 'Sorceries';
  if (t.includes('artifact')) return 'Artifacts';
  if (t.includes('enchantment')) return 'Enchantments';
  if (t.includes('battle')) return 'Battles';
  return 'Other';
}

export interface GroupedEntry {
  entry: DeckEntry;
  record: ScryfallCardRecord | null;
}

export interface DeckSection {
  group: CardGroup;
  entries: GroupedEntry[];
  /** Sum of quantities in the section. */
  count: number;
}

export function groupDeck(
  cards: DeckEntry[],
  records: Map<string, ScryfallCardRecord | null>,
  commanderName: string
): DeckSection[] {
  const buckets = new Map<CardGroup, GroupedEntry[]>();
  for (const entry of cards) {
    const record = records.get(entry.cardName) ?? null;
    const group: CardGroup = commanderName && entry.cardName === commanderName ? 'Commander' : groupFor(record?.type_line);
    if (!buckets.has(group)) buckets.set(group, []);
    buckets.get(group)!.push({ entry, record });
  }
  const sections: DeckSection[] = [];
  for (const group of GROUP_ORDER) {
    const entries = buckets.get(group);
    if (!entries || entries.length === 0) continue;
    entries.sort((a, b) => {
      const ca = a.record?.cmc ?? 99;
      const cb = b.record?.cmc ?? 99;
      return ca !== cb ? ca - cb : a.entry.cardName.localeCompare(b.entry.cardName);
    });
    sections.push({ group, entries, count: entries.reduce((s, e) => s + e.entry.quantity, 0) });
  }
  return sections;
}

// ─── Stats ───────────────────────────────────────────────────────────────────

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

/** Colour identity of the deck in WUBRG order. Commander's identity if known, else the union of the cards'. */
export function deckColorIdentity(
  cards: DeckEntry[],
  records: Map<string, ScryfallCardRecord | null>,
  commanderName: string
): string[] {
  const cmd = commanderName ? records.get(commanderName) : null;
  if (cmd?.color_identity?.length) return WUBRG.filter((c) => cmd.color_identity.includes(c));
  const union = new Set<string>();
  for (const e of cards) for (const c of records.get(e.cardName)?.color_identity ?? []) union.add(c);
  return WUBRG.filter((c) => union.has(c));
}

/** Mana curve over nonland cards: index = mana value, capped at 7+. */
export function manaCurve(cards: DeckEntry[], records: Map<string, ScryfallCardRecord | null>): number[] {
  const curve = new Array<number>(8).fill(0);
  for (const e of cards) {
    const rec = records.get(e.cardName);
    if (!rec || groupFor(rec.type_line) === 'Lands') continue;
    const mv = Math.min(7, Math.max(0, Math.round(rec.cmc ?? 0)));
    curve[mv] += e.quantity;
  }
  return curve;
}

// ─── Resolution pipeline ─────────────────────────────────────────────────────

export interface VerifyReport {
  cards: DeckEntry[];
  resolved: number;
  unresolved: string[];
  forgeSubstituted: Array<{ original: string; forgeName: string }>;
  forgeUnresolvable: string[];
  total: number;
}

/**
 * Resolve entries against the card database, then against Forge. Used by import and by every
 * edit, so a card added from the deck page gets the same substitution a pasted list would.
 * Pass `only` to limit the work to the names that changed; other entries keep their flags.
 */
export async function verifyEntries(entries: DeckEntry[], only?: Set<string>): Promise<VerifyReport> {
  const targets = only ? entries.filter((e) => only.has(e.cardName)) : entries;
  const names = [...new Set(targets.map((e) => e.cardName))];

  let resolvedMap: Map<string, ScryfallCardRecord | null>;
  if (isDevMock()) {
    resolvedMap = await loadCardRecords(names);
  } else {
    const { resolveCardNames } = await import('@/lib/firebase/cards');
    resolvedMap = await resolveCardNames(names);
    for (const [n, r] of resolvedMap) recordCache.set(n, r);
  }

  let cards: DeckEntry[] = entries.map((entry) => {
    if (only && !only.has(entry.cardName)) return entry;
    const rec = resolvedMap.get(entry.cardName);
    return {
      ...entry,
      resolved: rec != null,
      scryfallId: rec?.id,
      oracleId: rec?.oracle_id,
      forgeName: undefined,
      forgeResolved: undefined,
    };
  });

  const forgeInput = cards
    .filter((c) => c.resolved && (!only || only.has(c.cardName)))
    .map((c) => ({ cardName: c.cardName, oracleId: c.oracleId }));

  const substituted: Array<{ original: string; forgeName: string }> = [];
  let forgeUnresolvable: string[] = [];

  if (forgeInput.length > 0) {
    let forgeResult: { direct: string[]; substituted: Map<string, string>; unresolvable: string[] };
    if (isDevMock()) {
      forgeResult = { direct: forgeInput.map((c) => c.cardName), substituted: new Map(), unresolvable: [] };
    } else {
      const { resolveCardsForForge } = await import('@/lib/forgeCardCheck');
      forgeResult = await resolveCardsForForge(forgeInput);
    }
    forgeUnresolvable = forgeResult.unresolvable;
    cards = cards.map((entry) => {
      if (only && !only.has(entry.cardName)) return entry;
      if (!entry.resolved) return { ...entry, forgeResolved: false };
      if (forgeResult.direct.includes(entry.cardName)) return { ...entry, forgeResolved: true };
      const forgeName = forgeResult.substituted.get(entry.cardName);
      if (forgeName) {
        if (!substituted.some((s) => s.original === entry.cardName)) substituted.push({ original: entry.cardName, forgeName });
        return { ...entry, forgeResolved: true, forgeName };
      }
      return { ...entry, forgeResolved: false };
    });
  }

  const resolved = cards.filter((c) => c.resolved).length;
  const unresolved = [...new Set(cards.filter((c) => c.resolved === false).map((c) => c.cardName))];
  return { cards, resolved, unresolved, forgeSubstituted: substituted, forgeUnresolvable, total: cards.length };
}
