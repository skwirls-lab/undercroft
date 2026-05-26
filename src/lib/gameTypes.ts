/**
 * Consolidated game state types for MTG Undercroft frontend.
 * This replaces the deleted @/engine/* modules with WebSocket-compatible types.
 */

// ===================================================================
// Mana Colors
// ===================================================================

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

// ===================================================================
// Phase and Step Types
// ===================================================================

export type Phase = 'beginning' | 'precombat_main' | 'combat' | 'postcombat_main' | 'ending';

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

// ===================================================================
// Zone Types
// ===================================================================

export type ZoneType = 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command' | 'library';

export interface Zone {
  type: ZoneType;
  ownerId: string;
  cards: string[];
}

// ===================================================================
// Card Data Types
// ===================================================================

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
  producedMana?: ManaColor[];
  layout: 'normal' | 'basic' | 'plot';
  legalities: Record<string, string>;
  imageUris?: {
    small?: string;
    normal?: string;
    large?: string;
    artCrop?: string;
  };
  cardFaces?: Array<CardData>;
}

// ===================================================================
// Card Instance Types
// ===================================================================

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
  attachedTo?: string;
  attachments: string[];
  damage: number;
  summoningSick: boolean;
  modifiedPower?: number;
  modifiedToughness?: number;
  abilities: Array<{
    name: string;
    text: string;
    type: 'static' | 'triggered' | 'activated';
    cost?: string;
    targetCount?: number;
  }>;
}

// ===================================================================
// Player State Types
// ===================================================================

export interface ManaPool {
  W: number;
  U: number;
  B: number;
  R: number;
  G: number;
  C: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  life: number;
  manaPool: ManaPool;
  commanderDamageReceived: Record<string, number>;
  commanderCastCount: Record<string, number>;
  hasLost: boolean;
  hasConceded: boolean;
  poisonCounters: number;
  landPlayedThisTurn: boolean;
  mulliganCount: number;
  hasKeptHand: boolean;
}

// ===================================================================
// Turn State Types
// ===================================================================

export interface TurnState {
  turnNumber: number;
  activePlayerId: string;
  phase: Phase;
  step: Step;
  landsPlayedThisTurn: number;
  maxLandsPerTurn: number;
  extraCombatPhases: number;
}

// ===================================================================
// Priority State Types
// ===================================================================

export interface PriorityState {
  playerWithPriority: string;
  passedPlayers: Set<string>;
  waitingForResponse: boolean;
}

// ===================================================================
// Stack Item Types
// ===================================================================

export type StackItemType = 'spell' | 'ability';

export interface StackItem {
  id: string;
  type: StackItemType;
  sourceInstanceId: string;
  controllerId: string;
  cardData?: CardData;
  targets: Array<{
    instanceId: string;
    targetPlayerId?: string;
  }>;
}

// ===================================================================
// Combat State Types
// ===================================================================

export interface CombatState {
  attackers: Array<{
    instanceId: string;
    defenderInstanceId?: string;
    cardData: CardData;
    power: number;
    toughness: number;
    tapped: boolean;
    attackingPlayerId: string;
    defendingPlayerId?: string;
  }>;
  blockers: Array<{
    instanceId: string;
    blockerInstanceId: string;
    cardData: CardData;
    power: number;
    toughness: number;
    tapped: boolean;
    blockingPlayerId: string;
    blockedBy?: Array<{ instanceId: string; cardData: CardData }>;
  }>;
  phase?: 'declaring_attackers' | 'declaring_blockers' | 'damage';
  step?: Step;
}

export interface AttackerDeclaration {
  attackerInstanceId: string;
  defendingPlayerId: string;
}

export interface BlockerAssignment {
  blockerInstanceId: string;
  attackerInstanceId: string;
}

// ===================================================================
// Game Event Types
// ===================================================================

export type GameEventType =
  | 'LIFE_CHANGED'
  | 'DAMAGE_DEALT'
  | 'DAMAGE_RECEIVED'
  | 'CARD_PLAYED'
  | 'CARD_DESTROYED'
  | 'CARD_EXILED'
  | 'CARD_SACRIFICED'
  | 'CARD_DRAWN'
  | 'CARD_DISCARDED'
  | 'CARD_MULLIGANED'
  | 'CARD_TUCKED'
  | 'CARD_PUT_ON_TOP'
  | 'CARD_COUNTER_ADDED'
  | 'CARD_COUNTER_REMOVED'
  | 'CARD_DAMAGE_DEALT'
  | 'CARD_DAMAGE_RECEIVED'
  | 'CARD_LIFE_GAINED'
  | 'CARD_LIFE_LOST'
  | 'CARD_POWER_CHANGED'
  | 'CARD_TAPPED'
  | 'CARD_UNTAPPED'
  | 'CARD_FLIPPED'
  | 'CARD_FLIP_COMPLETED'
  | 'CARD_FACIAL_TURNED'
  | 'CARD_LAYDOWN'
  | 'CARD_REMOVED_FROM_GAME'
  | 'CARD_RETURNED_TO_HAND'
  | 'CARD_RETURNED_TO_BATTLEFIELD'
  | 'CARD_RETURNED_TO_LIBRARY'
  | 'CARD_SAVED'
  | 'CARD_STATE_CHANGED'
  | 'COMMANDER_DAMAGED'
  | 'COMMANDER_DIED'
  | 'COMMANDER_TAPPED'
  | 'COMMANDER_UNTAPPED'
  | 'COMMANDER_LIFE_GAINED'
  | 'COMMANDER_LIFE_LOST'
  | 'COMMANDER_POWER_CHANGED'
  | 'COMMANDER_TAPED'
  | 'COMMANDER_UNTAPPED'
  | 'COMMANDER_FLIPPED'
  | 'COMMANDER_FLIP_COMPLETED'
  | 'COMMANDER_FACIAL_TURNED'
  | 'COMMANDER_LAYDOWN'
  | 'COMMANDER_REMOVED_FROM_GAME'
  | 'COMMANDER_RETURNED_TO_HAND'
  | 'COMMANDER_RETURNED_TO_BATTLEFIELD'
  | 'COMMANDER_RETURNED_TO_LIBRARY'
  | 'COMMANDER_SAVED'
  | 'COMMANDER_STATE_CHANGED'
  | 'TURN_STARTED'
  | 'TURN_ENDED'
  | 'PHASE_CHANGED'
  | 'STEP_CHANGED'
  | 'PRIORITY_PASSED'
  | 'PRIORITY_GAINED'
  | 'PLAYER_WON'
  | 'PLAYER_LOST'
  | 'GAME_OVER'
  | 'GAME_STARTED'
  | 'SPELL_CAST'
  | 'SPELL_RESOLVED'
  | 'CREATURE_ATTACKED'
  | 'CREATURE_BLOCKED'
  | 'MANA_ADDED';

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  cardInstanceId?: string;
  data?: Record<string, unknown>;
  timestamp: number;
  id?: string;
}

export interface GameEvent {
  type: GameEventType;
  playerId?: string;
  cardInstanceId?: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

// ===================================================================
// Game State Types
// ===================================================================

export interface GameState {
  id: string;
  players: PlayerState[];
  cardInstances: Map<string, CardInstance>;
  zones: Map<string, Zone>;
  stack: StackItem[];
  turn: TurnState;
  priority: PriorityState;
  combat?: CombatState;
  pendingChoice?: PendingChoice;
  events: GameEvent[];
  winner: string | null;
  isGameOver: boolean;
  mulliganPhase: boolean;
}

export interface PendingChoice {
  type: 'confirm_ability' | 'choose_cards' | 'choose_targets' | 'mulligan' | 'search_library';
  playerId: string;
  cardInstanceIds?: string[];
  targets?: Array<{ instanceId: string; targetPlayerId?: string }>;
  prompt?: string;
  minChoices?: number;
  maxChoices?: number;
}

// ===================================================================
// Game Action Types
// ===================================================================

export type GameActionType =
  | 'PLAY_LAND'
  | 'CAST_SPELL'
  | 'ACTIVATE_ABILITY'
  | 'TAP_FOR_MANA'
  | 'PASS_PRIORITY'
  | 'RESOLVE_CHOICE'
  | 'UNTAP_PERMANENT'
  | 'CONCEDE'
  | 'DECLARE_ATTACKERS'
  | 'DECLARE_BLOCKERS'
  | 'KEEP_HAND'
  | 'MULLIGAN';

export interface GameAction {
  type: GameActionType;
  playerId: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

// ===================================================================
// Card Database Types
// ===================================================================

export interface ScryfallCardRecord {
  id: string;
  oracle_id?: string;
  name: string;
  image_uris?: {
    small?: string;
    normal?: string;
    large?: string;
    not_found?: string;
    art_crop?: string;
    border_crop?: string;
    png?: string;
  };
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  produced_mana?: string[];
  layout: 'normal' | 'basic' | 'plot';
  legalities: Record<string, string>;
}

export interface ScryfallCardImage {
  small: string;
  normal: string;
  large: string;
}

// ===================================================================
// Audio SFX Types
// ===================================================================

export type AudioSFX =
  | 'sfxTapLand'
  | 'sfxCastSpell'
  | 'sfxPlayCard'
  | 'sfxDamage'
  | 'sfxLifeGain'
  | 'sfxTurnStart'
  | 'sfxGameOver'
  | 'sfxPassPriority';
