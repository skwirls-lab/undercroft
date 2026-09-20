/**
 * What the client sends the Archivist and what comes back. Shared by the route handler, the
 * prompt builders and the client, so the wire shape is one definition.
 */

import type { ArchivistTask } from '@/lib/metering';
export type { ArchivistTask };

export type ImproveGoal = 'general' | 'lower-curve' | 'more-ramp' | 'more-draw' | 'more-removal' | 'synergy' | 'budget';

export const IMPROVE_GOALS: Array<{ id: ImproveGoal; label: string }> = [
  { id: 'general', label: 'Overall' },
  { id: 'lower-curve', label: 'Lower the curve' },
  { id: 'more-ramp', label: 'More ramp' },
  { id: 'more-draw', label: 'More card draw' },
  { id: 'more-removal', label: 'More removal' },
  { id: 'synergy', label: 'Tighter synergy' },
  { id: 'budget', label: 'On a budget' },
];

/** A deck as the Archivist sees it: names, types, costs, the curve, and what the check said. */
export interface DeckContext {
  name: string;
  commander: { name: string; typeLine: string; oracleText: string; identity: string[] } | null;
  cards: Array<{ name: string; qty: number; type: string; mv: number; cost: string }>;
  total: number;
  lands: number;
  curve: number[];
  issues: string[];
}

/** A match as the Archivist sees it. Opponents' hands are never included. */
export interface MatchContext {
  turn: number;
  phase: string;
  step: string;
  activePlayer: string;
  youHavePriority: boolean;
  you: {
    name: string;
    life: number;
    poison: number;
    commanderDamage: Record<string, number>;
    commander: { name: string; zone: 'command' | 'battlefield' | 'elsewhere'; castCount: number } | null;
    hand: Array<{ name: string; cost: string; type: string; oracle: string }>;
    battlefield: Array<{ name: string; type: string; tapped: boolean; pt?: string }>;
    graveyard: string[];
    libraryCount: number;
    manaAvailable: number;
  };
  opponents: Array<{
    name: string;
    life: number;
    poison: number;
    commander: string | null;
    commanderDamageFromYou: number;
    handSize: number;
    libraryCount: number;
    creatures: Array<{ name: string; pt?: string; tapped: boolean }>;
    others: string[];
    lands: number;
  }>;
  stack: Array<{ name: string; controller: string; description: string }>;
  /** Deduplicated action types the engine allows right now, e.g. CAST_SPELL, PLAY_LAND. */
  legalActions: string[];
  /** Names of cards you could cast or play right now. */
  playable: string[];
}

export interface RecapContext {
  youWon: boolean;
  winner: string;
  turns: number;
  finalLife: Record<string, number>;
  /** Log lines, oldest first, already formatted. */
  events: string[];
  deckName: string;
  commander: string | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type ArchivistPayload =
  | { task: 'deck.improve'; deck: DeckContext; goal: ImproveGoal }
  | { task: 'deck.swaps'; deck: DeckContext; goal: ImproveGoal }
  | { task: 'deck.strategy'; deck: DeckContext }
  | { task: 'commander.ideas'; wish: string }
  | { task: 'match.advice'; match: MatchContext; question: string }
  | { task: 'rules.question'; question: string; match?: MatchContext }
  | { task: 'game.recap'; recap: RecapContext };

export interface ArchivistRequest {
  payload: ArchivistPayload;
  /** Earlier turns of the same conversation (match advice, rules), oldest first. */
  messages?: ChatMessage[];
}

/** A structured swap the swaps task returns; `add` is validated by the client before display. */
export interface Swap {
  remove: string;
  add: string;
  reason: string;
}

export interface CommanderIdea {
  name: string;
  why: string;
}

export type ArchivistErrorCode = 'unauthenticated' | 'disabled' | 'patron' | 'quota' | 'bad-request' | 'upstream' | 'server' | 'network';
