// ============================================================
// Undercroft Game Engine — Core Type Definitions
// ============================================================

// --- Mana & Costs ---

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

export interface ManaPool {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number; // colorless
}

export interface ManaCost {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
  generic: number;
  X: number;
}

// --- Zones ---

export type ZoneType =
  | 'library'
  | 'hand'
  | 'battlefield'
  | 'graveyard'
  | 'exile'
  | 'command'
  | 'stack';

export interface Zone {
  type: ZoneType;
  ownerId: string;
  cards: string[]; // CardInstance IDs
}

// --- Cards ---

export interface CardData {
  scryfallId: string;
  oracleId: string;
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  colors: ManaColor[];
  colorIdentity: ManaColor[];
  keywords: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  producedMana?: string[];
  layout: string;
  imageUris?: {
    small: string;
    normal: string;
    large: string;
    artCrop: string;
    borderCrop: string;
    png: string;
  };
  cardFaces?: Array<{
    name: string;
    manaCost: string;
    typeLine: string;
    oracleText: string;
    power?: string;
    toughness?: string;
    imageUris?: {
      small: string;
      normal: string;
      large: string;
      artCrop: string;
      borderCrop: string;
      png: string;
    };
  }>;
  legalities: Record<string, string>;
}

export interface CardInstance {
  instanceId: string;
  cardData: CardData;
  ownerId: string;
  controllerId: string;
  zone: ZoneType;
  tapped: boolean;
  flipped: boolean;
  faceDown: boolean;
  counters: Record<string, number>;
  attachedTo?: string;    // instanceId of host
  attachments: string[];  // instanceIds of attached cards
  damage: number;
  summoningSick: boolean;
  modifiedPower?: number;
  modifiedToughness?: number;
  abilities: AbilityInstance[];
}

// --- Abilities ---

export type AbilityType = 'activated' | 'triggered' | 'static' | 'mana';

export interface AbilityInstance {
  id: string;
  sourceInstanceId: string;
  type: AbilityType;
  text: string;
  cost?: string;
}

// --- Stack ---

export interface StackItem {
  id: string;
  type: 'spell' | 'ability';
  sourceInstanceId: string;
  controllerId: string;
  cardData?: CardData;
  abilityInstance?: AbilityInstance;
  targets: string[];
  xValue?: number;
}

// --- Combat ---

export interface AttackerDeclaration {
  attackerInstanceId: string;
  defendingPlayerId: string;
}

export interface BlockerDeclaration {
  blockerInstanceId: string;
  blockedAttackerInstanceId: string;
}

export interface CombatState {
  attackers: AttackerDeclaration[];
  blockers: BlockerDeclaration[];
  damageAssignment: Map<string, Array<{ targetId: string; amount: number }>>;
  phase: 'declaring_attackers' | 'declaring_blockers' | 'assigning_damage' | 'resolved';
}

// --- Turn Structure ---

export type Phase =
  | 'beginning'
  | 'precombat_main'
  | 'combat'
  | 'postcombat_main'
  | 'ending';

export type Step =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'main'
  | 'beginning_of_combat'
  | 'declare_attackers'
  | 'declare_blockers'
  | 'first_strike_damage'
  | 'combat_damage'
  | 'end_of_combat'
  | 'end_step'
  | 'cleanup';

export interface TurnState {
  turnNumber: number;
  activePlayerId: string;
  phase: Phase;
  step: Step;
  landsPlayedThisTurn: number;
  maxLandsPerTurn: number;
  extraCombatPhases: number;
}

// --- Priority ---

export interface PriorityState {
  playerWithPriority: string;
  passedPlayers: Set<string>;
  waitingForResponse: boolean;
}

// --- Player ---

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  life: number;
  manaPool: ManaPool;
  commanderDamageReceived: Record<string, number>; // commanderInstanceId -> damage
  commanderCastCount: Record<string, number>;       // commanderInstanceId -> times cast
  hasLost: boolean;
  hasConceded: boolean;
  poisonCounters: number;
  landPlayedThisTurn: boolean;
  mulliganCount: number;    // How many mulligans taken (London mulligan)
  hasKeptHand: boolean;     // Whether this player has finalized their hand
}

// --- Game Actions ---

export type GameActionType =
  | 'PLAY_LAND'
  | 'CAST_SPELL'
  | 'ACTIVATE_ABILITY'
  | 'ACTIVATE_MANA_ABILITY'
  | 'DECLARE_ATTACKERS'
  | 'DECLARE_BLOCKERS'
  | 'ASSIGN_COMBAT_DAMAGE'
  | 'PASS_PRIORITY'
  | 'MULLIGAN'
  | 'KEEP_HAND'
  | 'CHOOSE_TARGET'
  | 'CHOOSE_MODE'
  | 'PAY_COST'
  | 'CONCEDE'
  | 'TAP_FOR_MANA'
  | 'UNTAP_PERMANENT';

export interface GameAction {
  type: GameActionType;
  playerId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// --- Game Events (log) ---

export type GameEventType =
  | 'GAME_STARTED'
  | 'TURN_STARTED'
  | 'PHASE_CHANGED'
  | 'STEP_CHANGED'
  | 'CARD_DRAWN'
  | 'CARD_PLAYED'
  | 'SPELL_CAST'
  | 'SPELL_RESOLVED'
  | 'SPELL_COUNTERED'
  | 'ABILITY_ACTIVATED'
  | 'ABILITY_TRIGGERED'
  | 'ABILITY_RESOLVED'
  | 'CREATURE_ATTACKED'
  | 'CREATURE_BLOCKED'
  | 'DAMAGE_DEALT'
  | 'LIFE_CHANGED'
  | 'CARD_DESTROYED'
  | 'CARD_EXILED'
  | 'CARD_RETURNED'
  | 'CARD_TAPPED'
  | 'CARD_UNTAPPED'
  | 'ZONE_TRANSFER'
  | 'COUNTER_ADDED'
  | 'COUNTER_REMOVED'
  | 'MANA_ADDED'
  | 'MANA_SPENT'
  | 'PLAYER_LOST'
  | 'PLAYER_WON'
  | 'GAME_OVER'
  | 'MULLIGAN_TAKEN'
  | 'HAND_KEPT';

export interface GameEvent {
  id: string;
  type: GameEventType;
  playerId?: string;
  data: Record<string, unknown>;
  timestamp: number;
}

// --- Game State (top-level) ---

export interface GameState {
  id: string;
  players: PlayerState[];
  cardInstances: Map<string, CardInstance>;
  zones: Map<string, Zone>;  // key = `${zoneType}:${ownerId}`
  stack: StackItem[];
  turn: TurnState;
  priority: PriorityState;
  combat: CombatState | null;
  events: GameEvent[];
  winner: string | null;
  isGameOver: boolean;
  mulliganPhase: boolean;
}

// --- Engine Result ---

export interface ActionResult {
  newState: GameState;
  events: GameEvent[];
  legalActions: GameAction[];
  error?: string;
}
