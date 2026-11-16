/**
 * Planeswalkers, read off the card.
 *
 * Forge sends a planeswalker's legal loyalty abilities as plain legal plays described as
 * "+2: Look at the top card…", "0: Draw three cards…", "-1: Return target creature…". It only
 * sends the ones that can be activated right now, so a player looking at a planeswalker with
 * three abilities and no legal play saw nothing at all. The oracle text has every ability
 * ("[+2]: …" lines), so the client reads them from there, matches each to a legal play when
 * one exists, and otherwise says why it is unavailable.
 *
 * Pure, so it can be tested without a browser.
 */

import type { CardInstance, GameAction } from '@/lib/gameTypes';

export interface LoyaltyAbility {
  /** Signed loyalty change: +2, 0, -3. null when the cost is X ("−X: …"). */
  cost: number | null;
  /** "+2", "0", "−3", "−X" — typeset with a real minus sign. */
  label: string;
  text: string;
}

const LINE = /^\s*(?:\[\s*)?([+\-−–]?)\s*(\d+|X)\s*\]?\s*:\s*(.+?)\s*$/;

function normalizeSign(s: string): '+' | '-' | '' {
  if (s === '+') return '+';
  if (s === '-' || s === '−' || s === '–') return '-';
  return '';
}

/** One entry per "[+1]: …" / "−3: …" / "0: …" line of rules text. Other lines are ignored. */
export function parseLoyaltyAbilities(oracleText: string | undefined | null): LoyaltyAbility[] {
  if (!oracleText) return [];
  const out: LoyaltyAbility[] = [];
  for (const raw of oracleText.split('\n')) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const sign = normalizeSign(m[1]);
    const amount = m[2];
    const text = m[3];
    if (amount === 'X') {
      out.push({ cost: null, label: `${sign === '-' ? '−' : sign}X`, text });
      continue;
    }
    const n = parseInt(amount, 10);
    const cost = sign === '-' ? -n : n;
    out.push({ cost, label: cost > 0 ? `+${cost}` : cost < 0 ? `−${-cost}` : '0', text });
  }
  return out;
}

export function isPlaneswalker(card: Pick<CardInstance, 'cardData'>): boolean {
  return card.cardData.typeLine.toLowerCase().includes('planeswalker');
}

/** Loyalty on the battlefield: the counters, falling back to the printed value. */
export function currentLoyalty(card: Pick<CardInstance, 'cardData' | 'counters'>): number | null {
  const fromCounters = card.counters?.loyalty;
  if (typeof fromCounters === 'number') return fromCounters;
  const printed = card.cardData.loyalty;
  if (printed == null || printed === '') return null;
  const n = parseInt(printed, 10);
  return Number.isNaN(n) ? null : n;
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Split a server description "−3: Destroy target creature." into its cost and text. */
export function splitLoyaltyDescription(description: string): { label: string; cost: number | null; text: string } | null {
  const m = LINE.exec(description);
  if (!m) return null;
  const sign = normalizeSign(m[1]);
  if (m[2] === 'X') return { label: `${sign === '-' ? '−' : sign}X`, cost: null, text: m[3] };
  const n = parseInt(m[2], 10);
  const cost = sign === '-' ? -n : n;
  return { label: cost > 0 ? `+${cost}` : cost < 0 ? `−${-cost}` : '0', cost, text: m[3] };
}

/**
 * The legal play that is this ability, if the server offered one. Matched on the loyalty
 * cost and the opening words of the rules text, since Forge's description is the card's own
 * SpellDescription with the cost in front.
 */
export function matchLoyaltyAction(ability: LoyaltyAbility, actions: GameAction[]): GameAction | undefined {
  const want = squash(ability.text).slice(0, 40);
  let fallback: GameAction | undefined;
  for (const a of actions) {
    const desc = typeof a.payload.forgeDescription === 'string' ? a.payload.forgeDescription : '';
    const parsed = splitLoyaltyDescription(desc);
    if (!parsed) continue;
    const sameCost = parsed.cost === ability.cost && parsed.label === ability.label;
    const sameText = squash(parsed.text).slice(0, 40) === want;
    if (sameCost && sameText) return a;
    if (sameCost && !fallback) fallback = a;
  }
  return fallback;
}

export interface LoyaltyContext {
  hasPriority: boolean;
  isMyTurn: boolean;
  isMainPhase: boolean;
  stackEmpty: boolean;
  /** This planeswalker already activated a loyalty ability this turn. */
  activatedThisTurn: boolean;
}

/** Why an ability without a legal play cannot be used now, in a few words. */
export function loyaltyUnavailableReason(ability: LoyaltyAbility, card: Pick<CardInstance, 'cardData' | 'counters'>, ctx: LoyaltyContext): string {
  const loyalty = currentLoyalty(card);
  if (ability.cost != null && ability.cost < 0 && loyalty != null && loyalty < -ability.cost) {
    return `Needs ${-ability.cost} loyalty (has ${loyalty})`;
  }
  if (ctx.activatedThisTurn) return 'Already used a loyalty ability this turn';
  if (!ctx.isMyTurn) return 'Only on your turn';
  if (!ctx.isMainPhase) return 'Only in a main phase';
  if (!ctx.stackEmpty) return 'Wait for the stack to empty';
  if (!ctx.hasPriority) return 'Not your priority';
  return 'Nothing it can target right now';
}

/**
 * Did this planeswalker activate a loyalty ability this turn? Read from the described log:
 * an ability activation names its card, and the store stamps every event with the turn.
 */
export function activatedLoyaltyThisTurn(
  events: ReadonlyArray<Record<string, unknown>>,
  cardName: string,
  turn: number | undefined,
  youName?: string
): boolean {
  if (turn == null) return false;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const type = (e.eventType ?? e.type) as string | undefined;
    if (typeof e.turn === 'number' && e.turn < turn) break;
    if (type !== 'SPELL_CAST' || !e.isAbility) continue;
    if (e.cardName !== cardName) continue;
    if (youName && typeof e.playerName === 'string' && e.playerName !== youName && e.playerName !== 'You') continue;
    const desc = typeof e.description === 'string' ? e.description : '';
    if (splitLoyaltyDescription(desc.startsWith(cardName) ? desc.slice(cardName.length).replace(/^\s*[-–—:]\s*/, '') : desc)) return true;
  }
  return false;
}

/** Label for the single action button on a battlefield card. */
export function cardActionLabel(card: Pick<CardInstance, 'cardData'>, actions: GameAction[]): string {
  if (actions.length === 0) return '';
  if (isPlaneswalker(card)) return 'Loyalty';
  if (actions.length > 1) return `${actions.length} abilities`;
  const a = actions[0];
  if (a.type === 'CAST_SPELL') return 'Cast';
  if (a.payload.ability === 'equip') return 'Equip';
  return 'Activate';
}
