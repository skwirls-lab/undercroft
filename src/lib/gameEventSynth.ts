import type { ForgeGameState, ForgeGameEvent } from '@/lib/forgeClient';

/**
 * Derive log events from two consecutive server states.
 *
 * The Forge bridge sends full state snapshots, not an event stream, so the log is
 * reconstructed by diffing. Pulled out of the store as a pure function so it can be tested:
 * the previous inline version emitted "drew a card" for every card in every opening hand —
 * 28 lines in a four-player game, plus seven more per mulligan — before turn 1 existed,
 * because the first snapshot arrives before hands are dealt and the second has seven cards
 * in each.
 *
 * Forge's PhaseHandler reports turn 0 until the first turn actually begins, which gives a
 * clean line: while the turn number is 0 the game is still being set up, and per-card
 * hand/battlefield diffs are not player actions. Crossing from 0 to 1 is the one moment
 * that is worth a line, and it gets exactly one.
 */
export function synthesizeGameEvents(
  prevState: ForgeGameState | null,
  state: ForgeGameState
): ForgeGameEvent[] {
  const events: ForgeGameEvent[] = [];
  const humanPlayer = state.players.find((p) => !p.isAI);
  const humanId = humanPlayer?.id;

  if (!prevState) {
    events.push({ eventType: 'GAME_STARTED' });
    return events;
  }

  const prevTurn = prevState.turn?.turnNumber ?? 0;
  const curTurn = state.turn?.turnNumber ?? 0;
  const gameStarting = prevTurn === 0 && curTurn >= 1;
  const preGame = curTurn === 0;

  // --- Turn & phase ---
  if (gameStarting) {
    events.push({ eventType: 'OPENING_HANDS' });
  }
  if (prevTurn !== curTurn && curTurn >= 1) {
    events.push({
      eventType: 'TURN_STARTED',
      turnNumber: curTurn,
      activePlayer: state.turn.activePlayer,
    });
  }
  // Only log major phase changes (not every micro-step)
  const MAJOR_PHASES = new Set(['MAIN1', 'MAIN2', 'COMBAT', 'BEGIN_COMBAT', 'END_OF_COMBAT', 'CLEANUP']);
  if (!preGame && prevState.turn.phase !== state.turn.phase && MAJOR_PHASES.has(state.turn.phase)) {
    events.push({ eventType: 'PHASE_CHANGED', phase: state.turn.phase, activePlayer: state.turn.activePlayer });
  }

  // Everything below describes what players did with cards. During setup (mulligans, the
  // deal) and on the transition into turn 1, hands and boards change without anyone acting.
  if (preGame || gameStarting) {
    // Life can still legitimately change pre-game (e.g. a Leyline reveal won't, but a
    // mulligan penalty variant might). Keep it; it is one line, not seven.
    for (const player of state.players) {
      const prev = prevState.players.find((p) => p.id === player.id);
      if (prev && prev.life !== player.life) {
        events.push(lifeEvent(player, prev.life, player.id === humanId));
      }
    }
    return events;
  }

  // --- Spells resolved (left the stack) — once, not per player ---
  const curStackIds = new Set(state.stack.map((s) => s.cardId).filter((id) => id != null));
  for (const item of prevState.stack) {
    if (item.cardId != null && !curStackIds.has(item.cardId)) {
      events.push({ eventType: 'SPELL_RESOLVED', cardName: item.cardName, controller: item.controller });
    }
  }

  const prevStackIdSet = new Set(prevState.stack.map((s) => s.cardId).filter((id) => id != null));

  for (const player of state.players) {
    const prev = prevState.players.find((p) => p.id === player.id);
    if (!prev) continue;
    const isHuman = player.id === humanId;
    const label = isHuman ? 'You' : player.name;

    if (prev.life !== player.life) {
      events.push(lifeEvent(player, prev.life, isHuman));
    }

    // --- Cards drawn (hand grew) ---
    const prevHandIds = new Set(prev.hand.map((c) => c.id));
    const newHandCards = player.hand.filter((c) => !prevHandIds.has(c.id));
    for (const card of newHandCards) {
      events.push({
        eventType: 'CARD_DRAWN',
        playerName: label,
        cardName: isHuman ? card.name : null,
        isOwn: isHuman,
      });
    }

    // --- Cards leaving hand (played/cast) ---
    const curHandIds = new Set(player.hand.map((c) => c.id));
    const leftHand = prev.hand.filter((c) => !curHandIds.has(c.id));
    for (const card of leftHand) {
      const onStack = state.stack.find((s) => s.cardId === card.id);
      const onBattlefield = player.battlefield.find((c) => c.id === card.id);
      if (onStack) {
        events.push({ eventType: 'SPELL_CAST', cardName: card.name, playerName: label });
      } else if (onBattlefield) {
        events.push({ eventType: 'CARD_PLAYED', cardName: card.name, playerName: label });
      }
    }

    // --- Permanents dying (battlefield → graveyard) ---
    const prevBfIds = new Set(prev.battlefield.map((c) => c.id));
    const prevGyIds = new Set(prev.graveyard.map((c) => c.id));
    for (const card of player.graveyard) {
      if (prevBfIds.has(card.id) && !prevGyIds.has(card.id)) {
        events.push({ eventType: 'CARD_DESTROYED', cardName: card.name, playerName: label });
      }
    }

    // --- New permanents entering from somewhere other than hand or stack (tokens, triggers) ---
    for (const card of player.battlefield) {
      if (!prevBfIds.has(card.id) && !prevHandIds.has(card.id) && !prevStackIdSet.has(card.id)) {
        events.push({ eventType: 'CARD_PLAYED', cardName: card.name, playerName: label });
      }
    }
  }

  return events;
}

function lifeEvent(
  player: ForgeGameState['players'][number],
  prevLife: number,
  isHuman: boolean
): ForgeGameEvent {
  return {
    eventType: 'LIFE_CHANGED',
    playerName: isHuman ? 'You' : player.name,
    newLife: player.life,
    delta: player.life - prevLife,
  };
}
