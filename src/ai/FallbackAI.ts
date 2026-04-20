import type { GameState, GameAction, CardInstance } from '@/engine/types';
import type { AIDecision } from './types';

// Get a card's CMC from its card data
function getCardCMC(state: GameState, cardInstanceId: string): number {
  const card = state.cardInstances.get(cardInstanceId);
  return card?.cardData.cmc || 0;
}

// Evaluate how good a target is for removal (higher = better to remove)
function evaluateRemovalTarget(state: GameState, targetId: string, aiPlayerId: string): number {
  const card = state.cardInstances.get(targetId);
  if (!card) return 0;
  // Prefer removing opponent creatures over own
  const isOpponent = card.controllerId !== aiPlayerId;
  const power = parseInt(card.cardData.power || '0', 10);
  const toughness = parseInt(card.cardData.toughness || '0', 10);
  return (isOpponent ? 100 : -50) + power * 3 + toughness * 2 + card.cardData.cmc;
}

// Evaluate how good a damage target is (higher = better)
function evaluateDamageTarget(state: GameState, targetId: string, aiPlayerId: string): number {
  // Is it a player?
  const player = state.players.find((p) => p.id === targetId);
  if (player) {
    // Prefer opponents, especially low-life ones
    return player.id !== aiPlayerId ? (100 - player.life) : -100;
  }
  // It's a creature — same as removal evaluation
  return evaluateRemovalTarget(state, targetId, aiPlayerId);
}

// Pick the best cast action from available options
function pickBestCastAction(
  state: GameState,
  castActions: GameAction[],
  playerId: string
): GameAction {
  // Group by card instance
  const byCard = new Map<string, GameAction[]>();
  for (const action of castActions) {
    const cardId = action.payload.cardInstanceId as string;
    if (!byCard.has(cardId)) byCard.set(cardId, []);
    byCard.get(cardId)!.push(action);
  }

  let bestAction = castActions[0];
  let bestScore = -Infinity;

  for (const [cardId, actions] of byCard) {
    const card = state.cardInstances.get(cardId);
    if (!card) continue;

    const oracleText = (card.cardData.oracleText || '').toLowerCase();
    const isRemoval = oracleText.includes('destroy') || oracleText.includes('exile');
    const isDamage = oracleText.includes('damage');
    const isCounterSpell = oracleText.includes('counter target spell');

    for (const action of actions) {
      let score = card.cardData.cmc; // base: prefer higher CMC spells
      const targetId = action.payload.targetId as string | undefined;

      if (isCounterSpell && state.stack.length > 0) {
        // Counter spells are high priority when stack has opponent spells
        score += 200;
      } else if (isRemoval && targetId) {
        score += evaluateRemovalTarget(state, targetId, playerId);
      } else if (isDamage && targetId) {
        score += evaluateDamageTarget(state, targetId, playerId);
      } else if (!targetId) {
        // Non-targeted spells (creatures, draw, gain life, etc.)
        score += card.cardData.cmc;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }
  }

  return bestAction;
}

export function makeFallbackDecision(
  state: GameState,
  legalActions: GameAction[],
  playerId: string
): AIDecision {
  if (legalActions.length === 0) {
    return {
      action: {
        type: 'PASS_PRIORITY',
        playerId,
        payload: {},
        timestamp: Date.now(),
      },
    };
  }

  // Handle mulligan decisions
  const mulliganAction = legalActions.find((a) => a.type === 'MULLIGAN');
  const keepAction = legalActions.find((a) => a.type === 'KEEP_HAND');
  if (keepAction && state.mulliganPhase) {
    const player = state.players.find((p) => p.id === playerId);
    if (player) {
      const hand = [...state.cardInstances.values()].filter(
        (c) => c.zone === 'hand' && c.ownerId === playerId
      );
      const landCount = hand.filter((c) =>
        c.cardData.typeLine.toLowerCase().includes('land')
      ).length;
      const nonLandCount = hand.length - landCount;

      // Keep if: 2+ lands and 2+ non-lands, or already mulliganed 2+ times
      const shouldKeep = (landCount >= 2 && nonLandCount >= 2) || player.mulliganCount >= 2;

      if (shouldKeep || !mulliganAction) {
        return { action: keepAction, reasoning: `Keeping hand (${landCount} lands, ${nonLandCount} spells, mulligan #${player.mulliganCount})` };
      } else {
        return { action: mulliganAction, reasoning: `Mulliganing (${landCount} lands, ${nonLandCount} spells — need better hand)` };
      }
    }
  }

  // If stack has items and it's not our turn, just pass priority
  // (AI doesn't try to respond with instants yet — can be improved later)
  const hasStackItems = state.stack.length > 0;

  // Priority order for the heuristic AI:
  // 1. Play a land if possible
  const playLand = legalActions.find((a) => a.type === 'PLAY_LAND');
  if (playLand) {
    return { action: playLand, reasoning: 'Playing a land for mana development' };
  }

  // 2. Tap untapped lands for mana (before casting)
  const tapActions = legalActions.filter((a) => a.type === 'TAP_FOR_MANA');

  // 3. Cast spells — pick the best one intelligently
  const castActions = legalActions.filter((a) => a.type === 'CAST_SPELL');

  // If stack has opponent spells, try instant-speed responses first
  if (castActions.length > 0 && hasStackItems) {
    const instantActions = castActions.filter((a) => {
      const card = state.cardInstances.get(a.payload.cardInstanceId as string);
      if (!card) return false;
      const kw = card.cardData.keywords.map((k) => k.toLowerCase());
      const tl = card.cardData.typeLine.toLowerCase();
      return tl.includes('instant') || kw.includes('flash');
    });
    if (instantActions.length > 0) {
      const bestCast = pickBestCastAction(state, instantActions, playerId);
      const card = state.cardInstances.get(bestCast.payload.cardInstanceId as string);
      return {
        action: bestCast,
        reasoning: `Responding with ${card?.cardData.name || 'an instant'}`,
      };
    }
  }

  if (castActions.length > 0 && !hasStackItems) {
    const bestCast = pickBestCastAction(state, castActions, playerId);
    const card = state.cardInstances.get(bestCast.payload.cardInstanceId as string);
    const targetId = bestCast.payload.targetId as string | undefined;
    const targetCard = targetId ? state.cardInstances.get(targetId) : undefined;
    const targetPlayer = targetId ? state.players.find((p) => p.id === targetId) : undefined;
    const targetName = targetCard?.cardData.name || targetPlayer?.name || '';

    return {
      action: bestCast,
      reasoning: `Casting ${card?.cardData.name || 'a spell'}${targetName ? ` targeting ${targetName}` : ''}`,
    };
  }

  // 3b. Use forge-powered activated abilities (non-targeted first, then targeted)
  const forgeAbilityActions = legalActions.filter(
    (a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'forge_activated'
  );
  if (forgeAbilityActions.length > 0) {
    // Prefer non-targeted abilities (like Fabled Passage search)
    const nonTargeted = forgeAbilityActions.filter((a) => !a.payload.targetId);
    if (nonTargeted.length > 0) {
      const card = state.cardInstances.get(nonTargeted[0].payload.cardInstanceId as string);
      return {
        action: nonTargeted[0],
        reasoning: `Activating ${card?.cardData.name || 'permanent'} ability`,
      };
    }
    // For targeted abilities, pick the first one (simple heuristic)
    const card = state.cardInstances.get(forgeAbilityActions[0].payload.cardInstanceId as string);
    return {
      action: forgeAbilityActions[0],
      reasoning: `Activating ${card?.cardData.name || 'permanent'} targeted ability`,
    };
  }

  // 3c. Equip equipment to best creature
  const equipActions = legalActions.filter((a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'equip');
  if (equipActions.length > 0) {
    // Pick equip action targeting creature with highest power
    let bestEquip = equipActions[0];
    let bestPower = -1;
    for (const action of equipActions) {
      const target = state.cardInstances.get(action.payload.targetId as string);
      if (target) {
        const power = parseInt(target.cardData.power || '0', 10);
        if (power > bestPower) { bestPower = power; bestEquip = action; }
      }
    }
    const equip = state.cardInstances.get(bestEquip.payload.cardInstanceId as string);
    const target = state.cardInstances.get(bestEquip.payload.targetId as string);
    return {
      action: bestEquip,
      reasoning: `Equipping ${equip?.cardData.name || 'equipment'} to ${target?.cardData.name || 'creature'}`,
    };
  }

  // 4. Declare attackers — attack with eligible creatures, targeting weakest opponent
  const declareAttackers = legalActions.find(
    (a) => a.type === 'DECLARE_ATTACKERS'
  );
  if (declareAttackers) {
    const eligibleIds = declareAttackers.payload.eligibleAttackerIds as string[];
    const defenders = state.players.filter(
      (p) => p.id !== playerId && !p.hasLost && !p.hasConceded
    );

    if (defenders.length > 0 && eligibleIds.length > 0) {
      // Target the opponent with the lowest life
      const sortedDefenders = [...defenders].sort((a, b) => a.life - b.life);
      const primaryTarget = sortedDefenders[0].id;

      // Use per-attacker targeting: spread attacks if multiple opponents are low
      const declarations = eligibleIds.map((attackerId) => ({
        attackerId,
        defendingPlayerId: primaryTarget,
      }));

      return {
        action: {
          type: 'DECLARE_ATTACKERS',
          playerId,
          payload: { attackerDeclarations: declarations },
          timestamp: Date.now(),
        },
        reasoning: `Attacking ${sortedDefenders[0].name} (${sortedDefenders[0].life} life) with ${eligibleIds.length} creatures`,
      };
    }
  }

  // 5. Declare blockers — block the largest incoming attacker if we'd take lethal
  const declareBlockers = legalActions.find(
    (a) => a.type === 'DECLARE_BLOCKERS'
  );
  if (declareBlockers) {
    const player = state.players.find((p) => p.id === playerId);
    const eligibleBlockerIds = declareBlockers.payload.eligibleBlockerIds as string[];

    if (state.combat && player) {
      const incomingAttackers = state.combat.attackers
        .filter((a) => a.defendingPlayerId === playerId)
        .map((a) => ({
          declaration: a,
          card: state.cardInstances.get(a.attackerInstanceId),
        }))
        .filter((a) => a.card)
        .sort((a, b) => {
          const pa = parseInt(a.card!.cardData.power || '0', 10);
          const pb = parseInt(b.card!.cardData.power || '0', 10);
          return pb - pa; // largest power first
        });

      const totalIncoming = incomingAttackers.reduce(
        (sum, a) => sum + parseInt(a.card!.cardData.power || '0', 10),
        0
      );

      // Block if incoming damage >= 40% of current life or would be lethal
      const assignments: Array<{ blockerId: string; attackerId: string }> = [];
      if (totalIncoming >= player.life * 0.4) {
        const availableBlockers = [...eligibleBlockerIds];
        for (const attacker of incomingAttackers) {
          if (availableBlockers.length === 0) break;
          // Assign a blocker to the biggest attacker
          const blockerId = availableBlockers.shift()!;
          assignments.push({
            blockerId,
            attackerId: attacker.declaration.attackerInstanceId,
          });
        }
      }

      return {
        action: {
          type: 'DECLARE_BLOCKERS',
          playerId,
          payload: { blockerAssignments: assignments },
          timestamp: Date.now(),
        },
        reasoning:
          assignments.length > 0
            ? `Blocking ${assignments.length} attackers (${totalIncoming} incoming damage)`
            : `Not blocking (${totalIncoming} damage is manageable at ${player.life} life)`,
      };
    }

    return {
      action: {
        type: 'DECLARE_BLOCKERS',
        playerId,
        payload: { blockerAssignments: [] },
        timestamp: Date.now(),
      },
      reasoning: 'No combat state, skipping blocks',
    };
  }

  // Default: pass priority
  const passAction = legalActions.find((a) => a.type === 'PASS_PRIORITY');
  return {
    action: passAction || {
      type: 'PASS_PRIORITY',
      playerId,
      payload: {},
      timestamp: Date.now(),
    },
    reasoning: 'No beneficial action available, passing priority',
  };
}
