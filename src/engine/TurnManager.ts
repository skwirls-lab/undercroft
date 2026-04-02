import type { GameState, Phase, Step, GameEvent, PlayerState } from './types';
import { getAlivePlayers, getCardsInZone } from './GameState';
import { emptyManaPool } from './ManaSystem';

const PHASE_STEPS: Record<Phase, Step[]> = {
  beginning: ['untap', 'upkeep', 'draw'],
  precombat_main: ['main'],
  combat: [
    'beginning_of_combat',
    'declare_attackers',
    'declare_blockers',
    'combat_damage',
    'end_of_combat',
  ],
  postcombat_main: ['main'],
  ending: ['end_step', 'cleanup'],
};

const PHASE_ORDER: Phase[] = [
  'beginning',
  'precombat_main',
  'combat',
  'postcombat_main',
  'ending',
];

function createEvent(type: GameEvent['type'], playerId: string, data: Record<string, unknown> = {}): GameEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    playerId,
    data,
    timestamp: Date.now(),
  };
}

export function advanceStep(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const currentPhase = state.turn.phase;
  const currentStep = state.turn.step;
  const steps = PHASE_STEPS[currentPhase];
  const stepIndex = steps.indexOf(currentStep);

  let newState = { ...state, turn: { ...state.turn }, priority: { ...state.priority } };

  if (stepIndex < steps.length - 1) {
    // Next step in current phase
    newState.turn.step = steps[stepIndex + 1];
    events.push(createEvent('STEP_CHANGED', newState.turn.activePlayerId, {
      phase: currentPhase,
      step: newState.turn.step,
    }));
  } else {
    // Advance to next phase
    const result = advancePhase(newState);
    newState = result.state;
    events.push(...result.events);
  }

  // Reset priority for new step
  newState.priority.playerWithPriority = newState.turn.activePlayerId;
  newState.priority.passedPlayers = new Set();

  return { state: newState, events };
}

export function advancePhase(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const currentPhaseIndex = PHASE_ORDER.indexOf(state.turn.phase);

  let newState = { ...state, turn: { ...state.turn }, priority: { ...state.priority } };

  if (currentPhaseIndex < PHASE_ORDER.length - 1) {
    // Next phase
    const nextPhase = PHASE_ORDER[currentPhaseIndex + 1];
    newState.turn.phase = nextPhase;
    newState.turn.step = PHASE_STEPS[nextPhase][0];
    events.push(createEvent('PHASE_CHANGED', newState.turn.activePlayerId, {
      phase: nextPhase,
      step: newState.turn.step,
    }));
  } else {
    // End of turn — advance to next player's turn
    const result = advanceTurn(newState);
    newState = result.state;
    events.push(...result.events);
  }

  return { state: newState, events };
}

export function advanceTurn(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const alivePlayers = getAlivePlayers(state);

  if (alivePlayers.length <= 1) {
    return { state, events };
  }

  const currentIndex = alivePlayers.findIndex(
    (p) => p.id === state.turn.activePlayerId
  );
  const nextPlayer = alivePlayers[(currentIndex + 1) % alivePlayers.length];

  const newState: GameState = {
    ...state,
    turn: {
      turnNumber: state.turn.turnNumber + 1,
      activePlayerId: nextPlayer.id,
      phase: 'beginning',
      step: 'untap',
      landsPlayedThisTurn: 0,
      maxLandsPerTurn: 1,
      extraCombatPhases: 0,
    },
    priority: {
      playerWithPriority: nextPlayer.id,
      passedPlayers: new Set(),
      waitingForResponse: false,
    },
    combat: null,
    players: state.players.map((p) =>
      p.id === nextPlayer.id
        ? { ...p, manaPool: emptyManaPool(), landPlayedThisTurn: false }
        : { ...p, manaPool: emptyManaPool() }
    ),
  };

  events.push(createEvent('TURN_STARTED', nextPlayer.id, {
    turnNumber: newState.turn.turnNumber,
  }));

  return { state: newState, events };
}

export function performUntapStep(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const activePlayerId = state.turn.activePlayerId;
  const battlefield = getCardsInZone(state, activePlayerId, 'battlefield');

  const newCardInstances = new Map(state.cardInstances);

  for (const card of battlefield) {
    if (card.tapped) {
      const untapped = {
        ...card,
        tapped: false,
        summoningSick: false,
      };
      newCardInstances.set(card.instanceId, untapped);
      events.push(createEvent('CARD_UNTAPPED', activePlayerId, {
        cardInstanceId: card.instanceId,
        cardName: card.cardData.name,
      }));
    } else {
      // Still clear summoning sickness
      const updated = { ...card, summoningSick: false };
      newCardInstances.set(card.instanceId, updated);
    }
  }

  return {
    state: { ...state, cardInstances: newCardInstances },
    events,
  };
}

export function performDrawStep(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const activePlayerId = state.turn.activePlayerId;

  // Skip draw on turn 1 for first player (Commander variant rule)
  if (state.turn.turnNumber === 1) {
    return { state, events };
  }

  return drawCards(state, activePlayerId, 1);
}

export function drawCards(
  state: GameState,
  playerId: string,
  count: number
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let newState = { ...state };
  const newCardInstances = new Map(state.cardInstances);
  const newZones = new Map(state.zones);

  const libraryKey = `library:${playerId}`;
  const handKey = `hand:${playerId}`;
  const library = { ...newZones.get(libraryKey)!, cards: [...(newZones.get(libraryKey)?.cards || [])] };
  const hand = { ...newZones.get(handKey)!, cards: [...(newZones.get(handKey)?.cards || [])] };

  for (let i = 0; i < count; i++) {
    if (library.cards.length === 0) {
      // Player loses for drawing from empty library
      newState = {
        ...newState,
        players: newState.players.map((p) =>
          p.id === playerId ? { ...p, hasLost: true } : p
        ),
      };
      events.push(createEvent('PLAYER_LOST', playerId, { reason: 'empty_library' }));
      break;
    }

    const cardId = library.cards.shift()!;
    hand.cards.push(cardId);

    const cardInstance = newCardInstances.get(cardId);
    if (cardInstance) {
      newCardInstances.set(cardId, { ...cardInstance, zone: 'hand' });
    }

    events.push(createEvent('CARD_DRAWN', playerId, {
      cardInstanceId: cardId,
      cardName: cardInstance?.cardData.name || 'Unknown',
    }));
  }

  newZones.set(libraryKey, library);
  newZones.set(handKey, hand);

  return {
    state: { ...newState, cardInstances: newCardInstances, zones: newZones },
    events,
  };
}

export function isMainPhase(state: GameState): boolean {
  return (
    state.turn.phase === 'precombat_main' ||
    state.turn.phase === 'postcombat_main'
  );
}

export function isActivePlayer(state: GameState, playerId: string): boolean {
  return state.turn.activePlayerId === playerId;
}

export function hasPriority(state: GameState, playerId: string): boolean {
  return state.priority.playerWithPriority === playerId;
}
