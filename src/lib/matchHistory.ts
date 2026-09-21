/**
 * The record of a finished match: who played what, who won and how, what each seat did,
 * and the Archivist's recap if one was asked for. Built once from the final state, the
 * described event log and the server's outcome, then written under the player's profile.
 *
 * Pure, so it can be tested without a browser. Every optional field is null rather than
 * undefined: Firestore refuses undefined values.
 */

import type { ForgeGameState, GameOverPayload } from '@/lib/forgeClient';
import { describeLossReason, type LogEvent } from '@/lib/gameLog';

export type MatchResult = 'won' | 'lost' | 'draw' | 'abandoned';

export interface MatchSeat {
  name: string;
  isYou: boolean;
  isAI: boolean;
  deckName: string | null;
  commander: string | null;
  finalLife: number;
  poison: number;
  won: boolean;
  eliminated: boolean;
  /** A GameLossReason name from the engine, or null. */
  lossReason: string | null;
  lossSpell: string | null;
  eliminatedTurn: number | null;
  /** Finishing place: 1 for the winner, then by elimination order (last out places highest). */
  place: number | null;
  spellsCast: number;
  damageDealt: number;
  lifeLost: number;
}

export interface MatchRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  result: MatchResult;
  winner: string | null;
  /** The condition that ended the game, in plain words (from the last seat to fall). */
  winCondition: string | null;
  turns: number;
  seatCount: number;
  you: { deckId: string | null; deckName: string; commander: string | null };
  seats: MatchSeat[];
  recap: { text: string; at: number } | null;
}

/** What the setup screen knows before the first card is dealt. */
export interface MatchMeta {
  deckId: string | null;
  deckName: string;
  commander: string | null;
  opponents: Array<{ name: string; deckName: string; commander: string | null; source: 'house' | 'vault' }>;
}

export interface BuildMatchInput {
  id: string;
  startedAt: number;
  endedAt: number;
  meta: MatchMeta | null;
  youName: string;
  state: ForgeGameState | null;
  events: LogEvent[];
  outcome: GameOverPayload | null;
  /** The player left before the game ended (disconnect, new game). */
  abandoned: boolean;
}

function str(v: unknown): string { return typeof v === 'string' ? v : v == null ? '' : String(v); }
function num(v: unknown): number { return typeof v === 'number' ? v : Number(v ?? 0) || 0; }

export function buildMatchRecord(input: BuildMatchInput): MatchRecord {
  const { meta, youName, state, events, outcome } = input;

  // Seats: the server's outcome list when present, else the last state, else the setup.
  const names: Array<{ name: string; isAI: boolean }> = outcome?.seats?.length
    ? outcome.seats.map((s) => ({ name: s.name, isAI: s.isAI }))
    : state?.players.length
      ? state.players.map((p) => ({ name: p.name, isAI: p.isAI }))
      : [{ name: youName, isAI: false }, ...(meta?.opponents ?? []).map((o) => ({ name: o.name, isAI: true }))];

  // Per-seat tallies from the described log.
  const spells = new Map<string, number>();
  const damage = new Map<string, number>();
  const lifeLost = new Map<string, number>();
  const lostAt = new Map<string, number>();
  const lostOrder: string[] = [];
  const lossFromLog = new Map<string, { reason: string; spell: string }>();
  for (const e of events) {
    const type = str(e.eventType ?? e.type);
    if (type === 'SPELL_CAST' && !e.isAbility) {
      const who = str(e.playerName);
      if (who) spells.set(who, (spells.get(who) ?? 0) + 1);
    } else if (type === 'DAMAGE_DEALT') {
      const src = str(e.sourceController);
      if (src) damage.set(src, (damage.get(src) ?? 0) + num(e.amount));
    } else if (type === 'LIFE_CHANGED') {
      const who = str(e.playerName);
      const delta = num(e.delta);
      if (who && delta < 0) lifeLost.set(who, (lifeLost.get(who) ?? 0) - delta);
    } else if (type === 'PLAYER_LOST') {
      const who = str(e.playerName);
      if (who && !lostAt.has(who)) {
        lostAt.set(who, num(e.turn));
        lostOrder.push(who);
        lossFromLog.set(who, { reason: str(e.reason), spell: str(e.spell) });
      }
    }
  }

  const resolveName = (n: string) => (n === 'You' ? youName : n);
  const tally = (m: Map<string, number>, name: string) => (m.get(name) ?? 0) + (name === youName ? m.get('You') ?? 0 : 0);

  const winnerName = outcome?.winner && outcome.winner !== 'draw' ? outcome.winner : null;
  const seats: MatchSeat[] = names.map(({ name, isAI }) => {
    const out = outcome?.seats?.find((s) => s.name === name) ?? null;
    const st = state?.players.find((p) => p.name === name) ?? null;
    const isYou = name === youName;
    const opp = meta?.opponents.find((o) => o.name === name) ?? null;
    const lossLog = lossFromLog.get(name);
    const eliminated = !!(out?.eliminated ?? st?.eliminated ?? lostAt.has(name));
    return {
      name,
      isYou,
      isAI,
      deckName: isYou ? meta?.deckName ?? null : opp?.deckName ?? null,
      commander: isYou ? meta?.commander ?? null : opp?.commander ?? null,
      finalLife: out?.life ?? st?.life ?? 0,
      poison: out?.poison ?? st?.poison ?? 0,
      won: out?.won ?? (winnerName === name),
      eliminated,
      lossReason: out?.lossReason ?? st?.lossReason ?? (lossLog?.reason || null),
      lossSpell: out?.lossSpell ?? st?.lossSpell ?? (lossLog?.spell || null),
      eliminatedTurn: lostAt.has(name) ? lostAt.get(name)! : null,
      place: null,
      spellsCast: tally(spells, name),
      damageDealt: tally(damage, name),
      lifeLost: tally(lifeLost, name),
    };
  });

  // Places: the winner first; everyone else by how late they fell (unknown order last).
  const order = [...seats].sort((a, b) => {
    if (a.won !== b.won) return a.won ? -1 : 1;
    const ai = lostOrder.indexOf(resolveName(a.name));
    const bi = lostOrder.indexOf(resolveName(b.name));
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return -1;
    if (bi === -1) return 1;
    return bi - ai;
  });
  order.forEach((s, i) => { s.place = i + 1; });

  const you = seats.find((s) => s.isYou) ?? null;
  let result: MatchResult;
  if (input.abandoned) result = 'abandoned';
  else if (you?.won || (winnerName && winnerName === youName)) result = 'won';
  else if (!winnerName && !outcome?.seats?.some((s) => s.won)) result = 'draw';
  else result = 'lost';

  // The game ended when the last seat fell: that seat's reason is the win condition.
  const lastOut = lostOrder.length > 0 ? seats.find((s) => s.name === lostOrder[lostOrder.length - 1]) ?? null : null;
  const decisive = lastOut ?? seats.filter((s) => s.eliminated && !s.won).sort((a, b) => (b.eliminatedTurn ?? 0) - (a.eliminatedTurn ?? 0))[0] ?? null;
  const winCondition = result === 'abandoned' ? null : decisive?.lossReason ? describeLossReason(decisive.lossReason, decisive.lossSpell ?? undefined) : null;

  return {
    id: input.id,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    result,
    winner: result === 'abandoned' ? null : winnerName,
    winCondition,
    turns: outcome?.turns ?? state?.turn.turnNumber ?? 0,
    seatCount: seats.length,
    you: { deckId: meta?.deckId ?? null, deckName: meta?.deckName ?? 'your deck', commander: meta?.commander ?? null },
    seats,
    recap: null,
  };
}

/** "Won on turn 12 by commander damage", "Lost on turn 9 — life reached 0", "Left on turn 4". */
export function summarizeResult(m: MatchRecord): string {
  const you = m.seats.find((s) => s.isYou);
  switch (m.result) {
    case 'won': return `Won on turn ${m.turns}${m.winCondition ? ` — ${m.winCondition}` : ''}`;
    case 'lost': {
      const how = you?.lossReason ? describeLossReason(you.lossReason, you.lossSpell ?? undefined) : null;
      return `Lost${you?.eliminatedTurn ? ` on turn ${you.eliminatedTurn}` : m.turns ? ` on turn ${m.turns}` : ''}${how ? ` — ${how}` : ''}`;
    }
    case 'draw': return `Draw after ${m.turns} turns`;
    default: return `Left on turn ${m.turns}`;
  }
}

/** Aggregate line for the top of the history page. */
export function historyTotals(matches: MatchRecord[]): { games: number; wins: number; losses: number; winRate: number | null; avgTurns: number | null } {
  const finished = matches.filter((m) => m.result !== 'abandoned');
  const wins = finished.filter((m) => m.result === 'won').length;
  const losses = finished.filter((m) => m.result === 'lost').length;
  const withTurns = finished.filter((m) => m.turns > 0);
  return {
    games: matches.length,
    wins,
    losses,
    winRate: finished.length > 0 ? wins / finished.length : null,
    avgTurns: withTurns.length > 0 ? withTurns.reduce((s, m) => s + m.turns, 0) / withTurns.length : null,
  };
}
