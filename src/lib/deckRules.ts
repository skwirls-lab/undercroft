/**
 * Commander deck legality, as far as it can be judged from card records.
 *
 * The rules checked: exactly 100 cards including the commander; a commander that is a
 * legendary creature (or says it can be your commander); one copy of everything except basic
 * lands and cards that say otherwise; every card inside the commander's colour identity; and
 * every card known to the card database and to the Forge engine, without which it cannot be
 * played here at all. Partners, backgrounds and companions are not modelled: one commander.
 */

import type { ScryfallCardRecord } from '@/lib/cardTypes';
import type { DeckEntry } from '@/store/deckStore';

export const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;
export type Color = (typeof WUBRG)[number];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

/** Can this card lead a deck? Legendary creatures, or anything that says so on the card. */
export function canBeCommander(rec: ScryfallCardRecord): boolean {
  const type = rec.type_line ?? '';
  const front = rec.card_faces?.[0];
  const t = (front?.type_line ?? type).toLowerCase();
  if (t.includes('legendary') && t.includes('creature')) return true;
  const text = `${rec.oracle_text ?? ''}\n${rec.card_faces?.map((f) => f.oracle_text).join('\n') ?? ''}`;
  return /can be your commander/i.test(text);
}

export function isBasicLand(rec: ScryfallCardRecord): boolean {
  return /\bbasic\b/i.test(rec.type_line ?? '') || BASIC_LAND_NAMES.has(rec.name);
}

/** The basic lands by name, so a deck is judged right even before their records have loaded. */
export const BASIC_LAND_NAMES: ReadonlySet<string> = new Set([
  'Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes',
  'Snow-Covered Plains', 'Snow-Covered Island', 'Snow-Covered Swamp', 'Snow-Covered Mountain', 'Snow-Covered Forest', 'Snow-Covered Wastes',
]);

/** How many copies a deck may hold: unlimited for basics and "any number" cards, N for "up to N", else one. */
export function maxCopies(rec: ScryfallCardRecord): number {
  if (isBasicLand(rec)) return Infinity;
  const text = `${rec.oracle_text ?? ''}\n${rec.card_faces?.map((f) => f.oracle_text).join('\n') ?? ''}`;
  if (/a deck can have any number of cards named/i.test(text)) return Infinity;
  const upTo = text.match(/a deck can have up to (\w+) cards named/i);
  if (upTo) {
    const n = NUMBER_WORDS[upTo[1].toLowerCase()] ?? parseInt(upTo[1], 10);
    if (Number.isFinite(n)) return n;
  }
  return 1;
}

/** Colour identity in WUBRG order. */
export function identityOf(rec: ScryfallCardRecord): Color[] {
  const set = new Set(rec.color_identity ?? []);
  return WUBRG.filter((c) => set.has(c));
}

/** True when every colour of `card` is within `identity`. Colourless cards fit anywhere. */
export function fitsIdentity(card: ScryfallCardRecord, identity: readonly string[]): boolean {
  const allowed = new Set(identity);
  return (card.color_identity ?? []).every((c) => allowed.has(c));
}

export type IssueKind =
  | 'no-commander'
  | 'bad-commander'
  | 'size'
  | 'duplicate'
  | 'off-identity'
  | 'unknown'
  | 'not-legal'
  | 'not-in-forge';

export interface DeckIssue {
  kind: IssueKind;
  /** One line, in the player's terms. */
  message: string;
  /** Cards the issue concerns, when it concerns cards. */
  cards?: string[];
}

export interface DeckCheck {
  issues: DeckIssue[];
  /** No rules problems. Unknown or Forge-missing cards still count as problems: they cannot be played. */
  legal: boolean;
  total: number;
  identity: Color[] | null;
}

/**
 * The part of a check worth keeping on the deck document: enough for the vault and the setup
 * screen to say "legal" or "3 issues" without loading a hundred card records per deck. The
 * deck page recomputes the full check live and refreshes this whenever it changes.
 */
export interface DeckLegality {
  legal: boolean;
  issues: number;
  /** One line per issue, in the player's terms. */
  summary: string[];
  checkedAt: number;
}

export function summarizeCheck(check: DeckCheck): DeckLegality {
  return { legal: check.legal, issues: check.issues.length, summary: check.issues.map((i) => i.message), checkedAt: Date.now() };
}

/** Same verdict, ignoring the timestamp. */
export function sameLegality(a: DeckLegality | null | undefined, b: DeckLegality): boolean {
  return !!a && a.legal === b.legal && a.issues === b.issues && a.summary.join('\n') === b.summary.join('\n');
}

export function checkDeck(
  deck: { cards: DeckEntry[]; commanderName: string },
  records: Map<string, ScryfallCardRecord | null>
): DeckCheck {
  const issues: DeckIssue[] = [];
  const total = deck.cards.reduce((s, c) => s + c.quantity, 0);
  const commander = deck.commanderName ? records.get(deck.commanderName) ?? null : null;
  const identity = commander ? identityOf(commander) : null;

  // Commander
  if (!deck.commanderName) {
    issues.push({ kind: 'no-commander', message: 'No commander. Open a legendary creature and make it one.' });
  } else if (!deck.cards.some((c) => c.cardName === deck.commanderName)) {
    issues.push({ kind: 'no-commander', message: `${deck.commanderName} is named as commander but is not in the deck.`, cards: [deck.commanderName] });
  } else if (commander && !canBeCommander(commander)) {
    issues.push({ kind: 'bad-commander', message: `${deck.commanderName} cannot be a commander — it is not a legendary creature.`, cards: [deck.commanderName] });
  }

  // Size
  if (total !== 100) {
    const diff = 100 - total;
    issues.push({ kind: 'size', message: diff > 0 ? `${total} cards — ${diff} more to reach 100.` : `${total} cards — ${-diff} too many.` });
  }

  // Singleton
  const dupes: string[] = [];
  for (const e of deck.cards) {
    const rec = records.get(e.cardName);
    const max = rec ? maxCopies(rec) : BASIC_LAND_NAMES.has(e.cardName) ? Infinity : 1;
    if (e.quantity > max) dupes.push(`${e.cardName} ×${e.quantity}`);
  }
  if (dupes.length) issues.push({ kind: 'duplicate', message: `${dupes.length} card${dupes.length === 1 ? '' : 's'} over the singleton limit.`, cards: dupes });

  // Colour identity
  if (identity) {
    const off = deck.cards
      .filter((e) => e.cardName !== deck.commanderName)
      .filter((e) => { const r = records.get(e.cardName); return r && !fitsIdentity(r, identity); })
      .map((e) => e.cardName);
    if (off.length) issues.push({ kind: 'off-identity', message: `${off.length} card${off.length === 1 ? '' : 's'} outside the commander's colour identity.`, cards: off });
  }

  // Known, legal, playable
  const unknown = deck.cards.filter((e) => e.resolved === false || (e.resolved !== true && !records.get(e.cardName))).map((e) => e.cardName);
  if (unknown.length) issues.push({ kind: 'unknown', message: `${unknown.length} name${unknown.length === 1 ? '' : 's'} not found in the card database.`, cards: unknown });

  const banned = deck.cards
    .filter((e) => { const r = records.get(e.cardName); const l = r?.legalities?.commander; return r && l && l !== 'legal'; })
    .map((e) => e.cardName);
  if (banned.length) issues.push({ kind: 'not-legal', message: `${banned.length} card${banned.length === 1 ? '' : 's'} not legal in Commander.`, cards: banned });

  const noForge = deck.cards.filter((e) => e.resolved && e.forgeResolved === false).map((e) => e.cardName);
  if (noForge.length) issues.push({ kind: 'not-in-forge', message: `${noForge.length} card${noForge.length === 1 ? '' : 's'} not in the Forge engine yet — skipped in games.`, cards: noForge });

  return { issues, legal: issues.length === 0, total, identity };
}
