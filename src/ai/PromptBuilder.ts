import type { GameState, GameAction, CardInstance } from '@/engine/types';
import { getCardsInZone } from '@/engine/GameState';

export function buildAIPrompt(
  state: GameState,
  playerId: string,
  legalActions: GameAction[]
): string {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return '';

  const hand = getCardsInZone(state, playerId, 'hand');
  const battlefield = getCardsInZone(state, playerId, 'battlefield');
  const commanders = getCardsInZone(state, playerId, 'command');

  let prompt = `You are an AI playing a Magic: The Gathering Commander game.\n`;
  prompt += `Your name: ${player.name}\n\n`;

  if (commanders.length > 0) {
    prompt += `YOUR COMMANDER: ${commanders.map((c) => c.cardData.name).join(', ')}\n\n`;
  }

  // Game state overview
  prompt += `=== GAME STATE ===\n`;
  prompt += `Turn: ${state.turn.turnNumber}\n`;
  prompt += `Phase: ${state.turn.phase} — Step: ${state.turn.step}\n`;
  prompt += `Active player: ${state.players.find((p) => p.id === state.turn.activePlayerId)?.name || 'Unknown'}\n\n`;

  // Life totals
  prompt += `=== LIFE TOTALS ===\n`;
  for (const p of state.players) {
    const marker = p.id === playerId ? '(YOU)' : '';
    const status = p.hasLost ? ' [ELIMINATED]' : p.hasConceded ? ' [CONCEDED]' : '';
    prompt += `${p.name} ${marker}: ${p.life} life${status}\n`;
  }
  prompt += `\n`;

  // Your mana pool
  const { manaPool } = player;
  const manaStr = Object.entries(manaPool)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  prompt += `=== YOUR MANA POOL ===\n`;
  prompt += manaStr || '(empty)';
  prompt += `\n\n`;

  // Your hand
  prompt += `=== YOUR HAND (${hand.length} cards) ===\n`;
  hand.forEach((card, i) => {
    prompt += `${i + 1}. ${formatCard(card)}\n`;
  });
  prompt += `\n`;

  // Your battlefield
  prompt += `=== YOUR BATTLEFIELD ===\n`;
  if (battlefield.length === 0) {
    prompt += `(empty)\n`;
  } else {
    for (const card of battlefield) {
      const tapped = card.tapped ? ' [TAPPED]' : '';
      prompt += `- ${card.cardData.name}${tapped}`;
      if (card.cardData.power) {
        prompt += ` (${card.cardData.power}/${card.cardData.toughness})`;
      }
      if (card.damage > 0) prompt += ` [${card.damage} damage]`;
      prompt += `\n`;
    }
  }
  prompt += `\n`;

  // Opponents' battlefields
  for (const opp of state.players.filter((p) => p.id !== playerId)) {
    if (opp.hasLost || opp.hasConceded) continue;
    const oppBattlefield = getCardsInZone(state, opp.id, 'battlefield');
    prompt += `=== ${opp.name.toUpperCase()}'S BATTLEFIELD ===\n`;
    if (oppBattlefield.length === 0) {
      prompt += `(empty)\n`;
    } else {
      for (const card of oppBattlefield) {
        const tapped = card.tapped ? ' [TAPPED]' : '';
        prompt += `- ${card.cardData.name}${tapped}`;
        if (card.cardData.power) {
          prompt += ` (${card.cardData.power}/${card.cardData.toughness})`;
        }
        prompt += `\n`;
      }
    }
    prompt += `\n`;
  }

  // Legal actions
  prompt += `=== YOUR LEGAL ACTIONS ===\n`;
  prompt += `Choose ONE action by responding with ONLY the letter (e.g., "A").\n\n`;

  legalActions.forEach((action, i) => {
    const letter = String.fromCharCode(65 + i); // A, B, C...
    prompt += `${letter}) ${describeAction(action, state)}\n`;
  });

  prompt += `\nRespond with ONLY the letter of your chosen action. No explanation needed.`;

  return prompt;
}

function formatCard(card: CardInstance): string {
  let str = `${card.cardData.name}`;
  if (card.cardData.manaCost) str += ` ${card.cardData.manaCost}`;
  str += ` — ${card.cardData.typeLine}`;
  if (card.cardData.power) {
    str += ` (${card.cardData.power}/${card.cardData.toughness})`;
  }
  if (card.cardData.oracleText) {
    const truncated =
      card.cardData.oracleText.length > 120
        ? card.cardData.oracleText.slice(0, 120) + '...'
        : card.cardData.oracleText;
    str += ` — "${truncated}"`;
  }
  return str;
}

function describeAction(action: GameAction, state: GameState): string {
  switch (action.type) {
    case 'PLAY_LAND': {
      const card = state.cardInstances.get(
        action.payload.cardInstanceId as string
      );
      return `Play land: ${card?.cardData.name || 'Unknown'}`;
    }
    case 'CAST_SPELL': {
      const card = state.cardInstances.get(
        action.payload.cardInstanceId as string
      );
      return `Cast: ${card?.cardData.name || 'Unknown'} (${card?.cardData.manaCost || '?'})`;
    }
    case 'TAP_FOR_MANA': {
      const card = state.cardInstances.get(
        action.payload.cardInstanceId as string
      );
      return `Tap for mana: ${card?.cardData.name || 'Unknown'}`;
    }
    case 'DECLARE_ATTACKERS': {
      const ids = action.payload.eligibleAttackerIds as string[];
      const names = ids
        .map((id) => state.cardInstances.get(id)?.cardData.name || '?')
        .join(', ');
      return `Declare attackers (eligible: ${names})`;
    }
    case 'DECLARE_BLOCKERS':
      return `Declare blockers`;
    case 'PASS_PRIORITY':
      return `Pass priority`;
    case 'CONCEDE':
      return `Concede the game`;
    default:
      return `${action.type}`;
  }
}

export function parseAIResponse(
  response: string,
  legalActions: GameAction[]
): GameAction | null {
  const cleaned = response.trim().toUpperCase();

  // Try single letter match
  if (cleaned.length === 1) {
    const index = cleaned.charCodeAt(0) - 65; // A=0, B=1, etc.
    if (index >= 0 && index < legalActions.length) {
      return legalActions[index];
    }
  }

  // Try to find a letter in the response
  const match = cleaned.match(/\b([A-Z])\b/);
  if (match) {
    const index = match[1].charCodeAt(0) - 65;
    if (index >= 0 && index < legalActions.length) {
      return legalActions[index];
    }
  }

  return null;
}
