import type {
  GameState,
  PlayerState,
  CardInstance,
  CardData,
  Zone,
  ZoneType,
  ManaPool,
  TurnState,
  PriorityState,
} from './types';
import { COMMANDER_STARTING_LIFE } from '@/lib/constants';

let nextInstanceId = 0;
function generateInstanceId(): string {
  return `inst_${Date.now()}_${nextInstanceId++}`;
}

function generateGameId(): string {
  return `game_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyManaPool(): ManaPool {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export function createPlayer(
  id: string,
  name: string,
  isAI: boolean
): PlayerState {
  return {
    id,
    name,
    isAI,
    life: COMMANDER_STARTING_LIFE,
    manaPool: createEmptyManaPool(),
    commanderDamageReceived: {},
    commanderCastCount: {},
    hasLost: false,
    hasConceded: false,
    poisonCounters: 0,
    landPlayedThisTurn: false,
    mulliganCount: 0,
    hasKeptHand: false,
  };
}

export function createZone(type: ZoneType, ownerId: string): Zone {
  return { type, ownerId, cards: [] };
}

export function getZoneKey(type: ZoneType, ownerId: string): string {
  return `${type}:${ownerId}`;
}

export function createCardInstance(
  cardData: CardData,
  ownerId: string,
  zone: ZoneType
): CardInstance {
  return {
    instanceId: generateInstanceId(),
    cardData,
    ownerId,
    controllerId: ownerId,
    zone,
    tapped: false,
    flipped: false,
    faceDown: false,
    counters: {},
    attachments: [],
    damage: 0,
    summoningSick: false,
    abilities: [],
  };
}

export function createInitialGameState(
  players: Array<{ id: string; name: string; isAI: boolean }>
): GameState {
  const playerStates = players.map((p) => createPlayer(p.id, p.name, p.isAI));

  const zones = new Map<string, Zone>();
  const zoneTypes: ZoneType[] = [
    'library',
    'hand',
    'battlefield',
    'graveyard',
    'exile',
    'command',
    'stack',
  ];
  for (const player of playerStates) {
    for (const zoneType of zoneTypes) {
      const key = getZoneKey(zoneType, player.id);
      zones.set(key, createZone(zoneType, player.id));
    }
  }

  // Randomize who goes first
  const startingPlayerIndex = Math.floor(Math.random() * playerStates.length);
  const startingPlayer = playerStates[startingPlayerIndex];

  const turn: TurnState = {
    turnNumber: 0,
    activePlayerId: startingPlayer.id,
    phase: 'beginning',
    step: 'untap',
    landsPlayedThisTurn: 0,
    maxLandsPerTurn: 1,
    extraCombatPhases: 0,
  };

  const priority: PriorityState = {
    playerWithPriority: startingPlayer.id,
    passedPlayers: new Set(),
    waitingForResponse: false,
  };

  return {
    id: generateGameId(),
    players: playerStates,
    cardInstances: new Map(),
    zones,
    stack: [],
    turn,
    priority,
    combat: null,
    pendingChoice: null,
    events: [],
    winner: null,
    isGameOver: false,
    mulliganPhase: true,
  };
}

export function getPlayerZone(
  state: GameState,
  playerId: string,
  zoneType: ZoneType
): Zone | undefined {
  return state.zones.get(getZoneKey(zoneType, playerId));
}

export function getCardsInZone(
  state: GameState,
  playerId: string,
  zoneType: ZoneType
): CardInstance[] {
  const zone = getPlayerZone(state, playerId, zoneType);
  if (!zone) return [];
  return zone.cards
    .map((id) => state.cardInstances.get(id))
    .filter((c): c is CardInstance => c !== undefined);
}

export function getActivePlayer(state: GameState): PlayerState | undefined {
  return state.players.find((p) => p.id === state.turn.activePlayerId);
}

export function getAlivePlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.hasLost && !p.hasConceded);
}
