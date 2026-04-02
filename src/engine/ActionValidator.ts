import type { GameState, GameAction, CardInstance } from './types';
import { getCardsInZone, getActivePlayer } from './GameState';
import { isMainPhase, isActivePlayer, hasPriority } from './TurnManager';
import { parseManaCost, canPayManaCost } from './ManaSystem';
import { getLandProducibleColors } from './OracleTextParser';

export function isLand(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('land');
}

export function isCreature(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('creature');
}

export function isInstant(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('instant');
}

export function isSorcery(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('sorcery');
}

export function hasFlash(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'flash');
}

export function hasHaste(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'haste');
}

export function hasFlying(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'flying');
}

export function hasReach(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'reach');
}

export function hasDefender(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'defender');
}

export function hasDeathtouch(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'deathtouch');
}

export function hasLifelink(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'lifelink');
}

export function hasTrample(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'trample');
}

export function hasFirstStrike(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'first strike');
}

export function hasDoubleStrike(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'double strike');
}

export function hasVigilance(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'vigilance');
}

export function canAttack(card: CardInstance): boolean {
  if (!isCreature(card)) return false;
  if (card.tapped) return false;
  if (hasDefender(card)) return false;
  if (card.summoningSick && !hasHaste(card)) return false;
  return true;
}

export function canBlock(card: CardInstance): boolean {
  if (!isCreature(card)) return false;
  if (card.tapped) return false;
  return true;
}

/**
 * Check if a specific blocker can legally block a specific attacker.
 * Enforces flying/reach rules.
 */
export function canBlockAttacker(blocker: CardInstance, attacker: CardInstance): boolean {
  if (!canBlock(blocker)) return false;
  // Flying creatures can only be blocked by creatures with flying or reach
  if (hasFlying(attacker) && !hasFlying(blocker) && !hasReach(blocker)) return false;
  return true;
}

export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  const actions: GameAction[] = [];
  const now = Date.now();

  if (state.isGameOver) return actions;
  if (!hasPriority(state, playerId)) return actions;

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasLost || player.hasConceded) return actions;

  // Always can pass priority
  actions.push({
    type: 'PASS_PRIORITY',
    playerId,
    payload: {},
    timestamp: now,
  });

  // Always can concede
  actions.push({
    type: 'CONCEDE',
    playerId,
    payload: {},
    timestamp: now,
  });

  const hand = getCardsInZone(state, playerId, 'hand');
  const isActive = isActivePlayer(state, playerId);
  const isMain = isMainPhase(state);
  const stackEmpty = state.stack.length === 0;

  // Play land (main phase, active player, stack empty, hasn't played land)
  if (isActive && isMain && stackEmpty && !player.landPlayedThisTurn) {
    for (const card of hand) {
      if (isLand(card)) {
        actions.push({
          type: 'PLAY_LAND',
          playerId,
          payload: { cardInstanceId: card.instanceId },
          timestamp: now,
        });
      }
    }
  }

  // Cast spells from hand
  for (const card of hand) {
    if (isLand(card)) continue;

    const cost = parseManaCost(card.cardData.manaCost);
    const canAfford = canPayManaCost(player.manaPool, cost);

    if (isInstant(card) || hasFlash(card)) {
      // Instants and flash can be cast anytime with priority
      if (canAfford) {
        actions.push({
          type: 'CAST_SPELL',
          playerId,
          payload: { cardInstanceId: card.instanceId },
          timestamp: now,
        });
      }
    } else if (isActive && isMain && stackEmpty) {
      // Sorcery-speed spells
      if (canAfford) {
        actions.push({
          type: 'CAST_SPELL',
          playerId,
          payload: { cardInstanceId: card.instanceId },
          timestamp: now,
        });
      }
    }
  }

  // Cast commander from command zone (sorcery speed + commander tax)
  if (isActive && isMain && stackEmpty) {
    const commandZone = getCardsInZone(state, playerId, 'command');
    for (const card of commandZone) {
      const baseCost = parseManaCost(card.cardData.manaCost);
      // Commander tax: +{2} for each previous cast from command zone
      const castCount = player.commanderCastCount[card.instanceId] || 0;
      const taxedCost = { ...baseCost, generic: baseCost.generic + castCount * 2 };
      const canAfford = canPayManaCost(player.manaPool, taxedCost);
      if (canAfford) {
        actions.push({
          type: 'CAST_SPELL',
          playerId,
          payload: { cardInstanceId: card.instanceId, fromZone: 'command' },
          timestamp: now,
        });
      }
    }
  }

  // Tap lands for mana (one action per producible color)
  const battlefield = getCardsInZone(state, playerId, 'battlefield');
  for (const card of battlefield) {
    if (isLand(card) && !card.tapped) {
      const producible = getLandProducibleColors(card.cardData);
      for (const color of producible) {
        actions.push({
          type: 'TAP_FOR_MANA',
          playerId,
          payload: { cardInstanceId: card.instanceId, manaColor: color },
          timestamp: now,
        });
      }
    }
  }

  // Untap permanents that were tapped this priority window (undo accidental taps)
  // Only allow untapping lands that the player tapped for mana (mana still in pool)
  for (const card of battlefield) {
    if (card.tapped && isLand(card)) {
      actions.push({
        type: 'UNTAP_PERMANENT',
        playerId,
        payload: { cardInstanceId: card.instanceId },
        timestamp: now,
      });
    }
  }

  // Declare attackers (active player, declare attackers step)
  // Always offer this action so the player can skip combat even with no creatures
  if (
    isActive &&
    state.turn.phase === 'combat' &&
    state.turn.step === 'declare_attackers' &&
    !state.combat
  ) {
    const eligibleAttackers = battlefield.filter(canAttack);
    actions.push({
      type: 'DECLARE_ATTACKERS',
      playerId,
      payload: {
        eligibleAttackerIds: eligibleAttackers.map((c) => c.instanceId),
      },
      timestamp: now,
    });
  }

  // Declare blockers (defending player, declare blockers step)
  // Always offer this action so the defender can choose not to block even with no creatures
  if (
    state.turn.phase === 'combat' &&
    state.turn.step === 'declare_blockers' &&
    state.combat &&
    !isActive
  ) {
    const isDefending = state.combat.attackers.some(
      (a) => a.defendingPlayerId === playerId
    );
    if (isDefending) {
      const eligibleBlockers = battlefield.filter(canBlock);
      actions.push({
        type: 'DECLARE_BLOCKERS',
        playerId,
        payload: {
          eligibleBlockerIds: eligibleBlockers.map((c) => c.instanceId),
        },
        timestamp: now,
      });
    }
  }

  return actions;
}
