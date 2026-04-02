import type { GameState, GameAction } from '@/engine/types';
import type { AIDecision } from './types';

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

  // Priority order for the heuristic AI:
  // 1. Play a land if possible
  const playLand = legalActions.find((a) => a.type === 'PLAY_LAND');
  if (playLand) {
    return { action: playLand, reasoning: 'Playing a land for mana development' };
  }

  // 2. Tap untapped lands for mana (before casting)
  const tapActions = legalActions.filter((a) => a.type === 'TAP_FOR_MANA');

  // 3. Cast the highest-CMC affordable spell
  const castActions = legalActions.filter((a) => a.type === 'CAST_SPELL');
  if (castActions.length > 0) {
    // Need mana first — tap all available lands
    // The game loop will handle sequencing; for now, prioritize casting
    const bestCast = castActions[0]; // simplified: just pick first available
    return { action: bestCast, reasoning: 'Casting a spell' };
  }

  // 4. If we can tap for mana, do it (might be needed later)
  // Skip this to avoid tapping unnecessarily

  // 5. Declare attackers — attack with eligible creatures, targeting weakest opponent
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

  // 6. Declare blockers — block the largest incoming attacker if we'd take lethal
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
