/**
 * What an AI seat plays.
 *
 * Three kinds of choice, resolved to one shape the server understands:
 *   surprise  — a house deck picked at random when the game starts, never the same one twice
 *               in a pod (the behaviour before this existed)
 *   house     — a specific built-in deck
 *   vault     — one of the player's own imported decks, so a brew can be tested against a
 *               known opponent rather than whatever the dice roll
 */

import { AI_DECKS, pickRandomAIDeck, type AIDeck } from '@/lib/aiDecks';
import type { Deck } from '@/store/deckStore';

export type OpponentChoice =
  | { kind: 'surprise' }
  | { kind: 'house'; name: string }
  | { kind: 'vault'; deckId: string };

export const SURPRISE: OpponentChoice = { kind: 'surprise' };

/** The wire shape for one deck in `start_game`. `name` labels the seat in-game. */
export interface ForgeDeckPayload {
  deckList: string[];
  commander?: string;
  name?: string;
}

/** Convert a vault deck into the "N Card Name" lines Forge parses, honouring substitutions. */
export function vaultDeckToForge(deck: Deck): ForgeDeckPayload {
  const deckList: string[] = [];
  const commander = deck.commanderName || undefined;
  for (const entry of deck.cards) {
    // Skip the commander line if it is also in the main list
    if (commander && entry.cardName === commander) continue;
    // Use forgeName if the card needed a substitution (e.g., reprint → original)
    const name = entry.forgeName || entry.cardName;
    deckList.push(`${entry.quantity} ${name}`);
  }
  return { deckList, commander, name: deck.name };
}

export function houseDeckToForge(deck: AIDeck): ForgeDeckPayload {
  return { deckList: [...deck.cards], commander: deck.commander, name: deck.name };
}

/** Human-readable summary for a seat's chip. */
export function describeChoice(choice: OpponentChoice, vault: Deck[]): { title: string; subtitle: string } {
  switch (choice.kind) {
    case 'surprise':
      return { title: 'Surprise me', subtitle: 'A random house deck' };
    case 'house': {
      const d = AI_DECKS.find((x) => x.name === choice.name);
      return d ? { title: d.name, subtitle: d.commander } : { title: 'House deck', subtitle: choice.name };
    }
    case 'vault': {
      const d = vault.find((x) => x.id === choice.deckId);
      return d ? { title: d.name, subtitle: d.commanderName || 'No commander' } : { title: 'Missing deck', subtitle: 'It is no longer in your vault' };
    }
  }
}

/** A vault deck can be handed to an AI only if it has a commander and something to play. */
export function vaultDeckPlayableByAI(deck: Deck): boolean {
  return !!deck.commanderName && deck.cards.length >= 2;
}

/**
 * Resolve every seat to a concrete deck. Surprise seats draw from the house decks not already
 * chosen for this pod, so two "surprise" opponents never bring the same list. Vault decks that
 * have since been deleted fall back to a surprise pick rather than failing the start.
 */
export function resolveOpponents(choices: OpponentChoice[], vault: Deck[]): ForgeDeckPayload[] {
  const usedHouse = choices.flatMap((c) => (c.kind === 'house' ? [c.name] : []));
  const out: ForgeDeckPayload[] = [];
  const usedNames = new Set<string>();

  for (const choice of choices) {
    let payload: ForgeDeckPayload;
    if (choice.kind === 'house') {
      const d = AI_DECKS.find((x) => x.name === choice.name);
      payload = d ? houseDeckToForge(d) : houseDeckToForge(pickRandomAIDeck(usedHouse));
    } else if (choice.kind === 'vault') {
      const d = vault.find((x) => x.id === choice.deckId);
      payload = d && vaultDeckPlayableByAI(d) ? vaultDeckToForge(d) : houseDeckToForge(pickRandomAIDeck(usedHouse));
    } else {
      const picked = pickRandomAIDeck(usedHouse);
      usedHouse.push(picked.name);
      payload = houseDeckToForge(picked);
    }
    // Seat names must be unique or the log cannot tell two players apart.
    let name = payload.name ?? 'AI Opponent';
    let n = 2;
    while (usedNames.has(name)) name = `${payload.name ?? 'AI Opponent'} ${n++}`;
    usedNames.add(name);
    out.push({ ...payload, name });
  }
  return out;
}
