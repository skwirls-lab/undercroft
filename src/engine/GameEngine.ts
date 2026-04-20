import type {
  GameState,
  GameAction,
  ActionResult,
  GameEvent,
  CardData,
  ManaColor,
  StackItem,
} from './types';
import {
  createInitialGameState,
  createCardInstance,
  getCardsInZone,
  getAlivePlayers,
  getZoneKey,
} from './GameState';
import { moveCard, shuffleZone, addCardToZone } from './ZoneManager';
import {
  advanceStep,
  performUntapStep,
  performDrawStep,
  drawCards,
} from './TurnManager';
import { parseManaCost, payManaCost, addMana } from './ManaSystem';
import {
  getLegalActions,
  isLand,
  hasDeathtouch,
  hasLifelink,
  hasTrample,
  hasFirstStrike,
  hasDoubleStrike,
  getEffectivePower,
  getEffectiveToughness,
  hasIndestructible,
} from './ActionValidator';
import { entersTapped, getLandProducibleColors, getEffectiveLandCardData } from './OracleTextParser';
import { resolveSpellEffects, areTargetsValid } from './EffectResolver';
import { parseSpellEffects, type SpellEffect } from './SpellEffectParser';
import type { ActivatedAbilityCost } from './ForgeLookup';
import { checkETBTriggers, checkDeathTriggers, getTriggeredEffects, parseTriggers } from './TriggerSystem';

function createEvent(
  type: GameEvent['type'],
  playerId: string,
  data: Record<string, unknown> = {}
): GameEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    playerId,
    data,
    timestamp: Date.now(),
  };
}

function inferManaFromLand(cardData: CardData): ManaColor | 'C' {
  const text = (cardData.oracleText || '').toLowerCase();
  const name = cardData.name.toLowerCase();
  const produced = cardData.producedMana;

  if (produced && produced.length === 1) {
    const m = produced[0];
    if (['W', 'U', 'B', 'R', 'G'].includes(m)) return m as ManaColor;
  }

  if (name.includes('plains') || text.includes('add {w}')) return 'W';
  if (name.includes('island') || text.includes('add {u}')) return 'U';
  if (name.includes('swamp') || text.includes('add {b}')) return 'B';
  if (name.includes('mountain') || text.includes('add {r}')) return 'R';
  if (name.includes('forest') || text.includes('add {g}')) return 'G';

  return 'C';
}

export class GameEngine {
  private state: GameState;

  constructor(
    players: Array<{ id: string; name: string; isAI: boolean }>,
    decks: Map<string, CardData[]>
  ) {
    this.state = createInitialGameState(players);
    this.setupDecks(decks);
  }

  private setupDecks(decks: Map<string, CardData[]>) {
    for (const player of this.state.players) {
      const deck = decks.get(player.id);
      if (!deck) continue;

      for (const cardData of deck) {
        const instance = createCardInstance(cardData, player.id, 'library');

        // Check if this is a commander (for now, check if legendary creature)
        const isCommander =
          cardData.typeLine.toLowerCase().includes('legendary') &&
          cardData.typeLine.toLowerCase().includes('creature');

        this.state.cardInstances.set(instance.instanceId, instance);

        if (isCommander && this.getCommandZoneCards(player.id).length === 0) {
          // First legendary creature goes to command zone
          this.state = addCardToZone(
            this.state,
            { ...instance, zone: 'command' },
            'command',
            player.id
          );
        } else {
          this.state = addCardToZone(
            this.state,
            instance,
            'library',
            player.id
          );
        }
      }

      // Shuffle library
      this.state = shuffleZone(this.state, player.id, 'library');
    }
  }

  private getCommandZoneCards(playerId: string) {
    return getCardsInZone(this.state, playerId, 'command');
  }

  getState(): GameState {
    return this.state;
  }

  getLegalActionsForPlayer(playerId: string): GameAction[] {
    // During mulligan phase, only return mulligan actions
    if (this.state.mulliganPhase) {
      return this.getMulliganActions(playerId);
    }
    return getLegalActions(this.state, playerId);
  }

  startGame(): ActionResult {
    const events: GameEvent[] = [];

    // Draw initial hands (7 cards each)
    for (const player of this.state.players) {
      const result = drawCards(this.state, player.id, 7);
      this.state = result.state;
      events.push(...result.events);
    }

    // Enter mulligan phase — players decide to keep or mulligan
    this.state.mulliganPhase = true;
    this.state.turn.turnNumber = 0; // Pre-game

    // First player gets mulligan priority first
    this.state.priority = {
      playerWithPriority: this.state.turn.activePlayerId,
      passedPlayers: new Set(),
      waitingForResponse: false,
    };

    events.push(
      createEvent('GAME_STARTED', this.state.turn.activePlayerId, {
        playerCount: this.state.players.length,
      })
    );

    this.state.events.push(...events);

    return {
      newState: this.state,
      events,
      legalActions: this.getMulliganActions(this.state.turn.activePlayerId),
    };
  }

  private getMulliganActions(playerId: string): GameAction[] {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.hasKeptHand) return [];

    const now = Date.now();
    const actions: GameAction[] = [];

    // Keep hand
    actions.push({
      type: 'KEEP_HAND',
      playerId,
      payload: {},
      timestamp: now,
    });

    // Mulligan (only if they haven't mulliganed down to 1 card)
    const handSize = 7 - player.mulliganCount;
    if (handSize > 1) {
      actions.push({
        type: 'MULLIGAN',
        playerId,
        payload: {},
        timestamp: now,
      });
    }

    return actions;
  }

  private finishMulliganPhase(): ActionResult {
    const events: GameEvent[] = [];

    this.state.mulliganPhase = false;
    this.state.turn.turnNumber = 1;

    events.push(
      createEvent('TURN_STARTED', this.state.turn.activePlayerId, {
        turnNumber: 1,
      })
    );

    // Perform untap step for first turn
    const untapResult = performUntapStep(this.state);
    this.state = untapResult.state;
    events.push(...untapResult.events);

    // Set priority to active player
    this.state.priority = {
      playerWithPriority: this.state.turn.activePlayerId,
      passedPlayers: new Set(),
      waitingForResponse: false,
    };

    this.state.events.push(...events);

    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(
        this.state.turn.activePlayerId
      ),
    };
  }

  processAction(action: GameAction): ActionResult {
    const events: GameEvent[] = [];

    switch (action.type) {
      case 'MULLIGAN':
        return this.processMulligan(action);
      case 'KEEP_HAND':
        return this.processKeepHand(action);
      case 'PLAY_LAND':
        return this.processPlayLand(action);
      case 'CAST_SPELL':
        return this.processCastSpell(action);
      case 'TAP_FOR_MANA':
        return this.processTapForMana(action);
      case 'UNTAP_PERMANENT':
        return this.processUntapPermanent(action);
      case 'PASS_PRIORITY':
        return this.processPassPriority(action);
      case 'DECLARE_ATTACKERS':
        return this.processDeclareAttackers(action);
      case 'DECLARE_BLOCKERS':
        return this.processDeclareBlockers(action);
      case 'ACTIVATE_ABILITY':
        return this.processActivateAbility(action);
      case 'CONCEDE':
        return this.processConcede(action);
      default:
        return {
          newState: this.state,
          events: [],
          legalActions: this.getLegalActionsForPlayer(action.playerId),
          error: `Unknown action type: ${action.type}`,
        };
    }
  }

  private processMulligan(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const playerId = action.playerId;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return this.errorResult('Player not found');

    // Shuffle entire hand back into library
    const hand = getCardsInZone(this.state, playerId, 'hand');
    for (const card of hand) {
      const moveResult = moveCard(this.state, card.instanceId, 'library');
      this.state = moveResult.state;
    }
    this.state = shuffleZone(this.state, playerId, 'library');

    // Increment mulligan count
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === playerId ? { ...p, mulliganCount: p.mulliganCount + 1 } : p
      ),
    };

    // Draw 7 new cards
    const drawResult = drawCards(this.state, playerId, 7);
    this.state = drawResult.state;
    events.push(...drawResult.events);

    const updatedPlayer = this.state.players.find((p) => p.id === playerId)!;
    events.push(
      createEvent('MULLIGAN_TAKEN', playerId, {
        mulliganCount: updatedPlayer.mulliganCount,
        handSize: 7,
        willPutBack: updatedPlayer.mulliganCount,
      })
    );

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getMulliganActions(playerId),
    };
  }

  private processKeepHand(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const playerId = action.playerId;
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return this.errorResult('Player not found');

    // London mulligan: put N cards on bottom of library (N = mulliganCount)
    const putBackCount = player.mulliganCount;
    if (putBackCount > 0) {
      const hand = getCardsInZone(this.state, playerId, 'hand');
      // Auto-select cards to put back: highest CMC non-lands first
      const sorted = [...hand].sort((a, b) => {
        const aIsLand = a.cardData.typeLine.toLowerCase().includes('land');
        const bIsLand = b.cardData.typeLine.toLowerCase().includes('land');
        if (aIsLand !== bIsLand) return aIsLand ? 1 : -1; // non-lands first
        return b.cardData.cmc - a.cardData.cmc; // highest CMC first
      });
      const toPutBack = sorted.slice(0, putBackCount);
      for (const card of toPutBack) {
        const moveResult = moveCard(this.state, card.instanceId, 'library');
        this.state = moveResult.state;
      }
    }

    // Mark player as having kept
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === playerId ? { ...p, hasKeptHand: true } : p
      ),
    };

    events.push(
      createEvent('HAND_KEPT', playerId, {
        mulliganCount: player.mulliganCount,
        finalHandSize: 7 - player.mulliganCount,
      })
    );

    // Check if all players have kept
    const allKept = this.state.players.every((p) => p.hasKeptHand);
    if (allKept) {
      // End mulligan phase and start the game
      this.state.events.push(...events);
      return this.finishMulliganPhase();
    }

    // Advance to next player who hasn't kept yet
    const alivePlayers = getAlivePlayers(this.state);
    const currentIndex = alivePlayers.findIndex((p) => p.id === playerId);
    let nextPlayer: typeof alivePlayers[0] | undefined;
    for (let i = 1; i <= alivePlayers.length; i++) {
      const candidate = alivePlayers[(currentIndex + i) % alivePlayers.length];
      if (!candidate.hasKeptHand) {
        nextPlayer = candidate;
        break;
      }
    }

    if (nextPlayer) {
      this.state = {
        ...this.state,
        priority: {
          playerWithPriority: nextPlayer.id,
          passedPlayers: new Set(),
          waitingForResponse: false,
        },
      };
    }

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: nextPlayer
        ? this.getMulliganActions(nextPlayer.id)
        : [],
    };
  }

  private processActivateAbility(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const ability = action.payload.ability as string;

    if (ability === 'equip') {
      return this.processEquip(action);
    }

    if (ability === 'forge_activated') {
      return this.processForgeActivatedAbility(action);
    }

    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(action.playerId),
      error: `Unknown ability: ${ability}`,
    };
  }

  private processForgeActivatedAbility(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const cardId = action.payload.cardInstanceId as string;
    const targetId = action.payload.targetId as string | undefined;
    const forgeCost = action.payload.forgeCost as ActivatedAbilityCost;
    const forgeEffects = action.payload.forgeEffects as SpellEffect[];

    const card = this.state.cardInstances.get(cardId);
    const player = this.state.players.find((p) => p.id === action.playerId);
    if (!card || !player) return this.errorResult('Invalid activated ability');

    // --- Pay costs ---

    // 1. Tap cost
    if (forgeCost.tap) {
      const newInstances = new Map(this.state.cardInstances);
      newInstances.set(cardId, { ...card, tapped: true });
      this.state = { ...this.state, cardInstances: newInstances };
    }

    // 2. Mana cost
    const manaCostTotal = forgeCost.manaCost.W + forgeCost.manaCost.U + forgeCost.manaCost.B +
      forgeCost.manaCost.R + forgeCost.manaCost.G + forgeCost.manaCost.C + forgeCost.manaCost.generic;
    if (manaCostTotal > 0) {
      const payResult = payManaCost(player.manaPool, forgeCost.manaCost);
      if (!payResult) return this.errorResult('Cannot pay mana cost');
      this.state = {
        ...this.state,
        players: this.state.players.map((p) =>
          p.id === action.playerId ? { ...p, manaPool: payResult } : p
        ),
      };
    }

    // 3. Life payment
    if (forgeCost.lifePayment > 0) {
      this.state = {
        ...this.state,
        players: this.state.players.map((p) =>
          p.id === action.playerId
            ? { ...p, life: p.life - forgeCost.lifePayment }
            : p
        ),
      };
      events.push(
        createEvent('LIFE_CHANGED', action.playerId, {
          amount: -forgeCost.lifePayment,
          reason: 'ability_cost',
        })
      );
    }

    // 4. Sacrifice self
    if (forgeCost.sacrificeSelf) {
      const moveResult = moveCard(this.state, cardId, 'graveyard');
      this.state = moveResult.state;
      events.push(...moveResult.events);
      events.push(
        createEvent('CARD_DESTROYED', action.playerId, {
          cardInstanceId: cardId,
          cardName: card.cardData.name,
        })
      );
    }

    // 5. Sacrifice other (MVP: auto-pick first valid candidate)
    if (forgeCost.sacrificeType && forgeCost.sacrificeCount > 0) {
      const sacType = forgeCost.sacrificeType.toLowerCase();
      const bf = getCardsInZone(this.state, action.playerId, 'battlefield');
      const candidates = bf.filter(
        (c) =>
          c.controllerId === action.playerId &&
          c.instanceId !== cardId &&
          c.cardData.typeLine.toLowerCase().includes(sacType)
      );
      for (let i = 0; i < forgeCost.sacrificeCount && i < candidates.length; i++) {
        const sacCard = candidates[i];
        const sacResult = moveCard(this.state, sacCard.instanceId, 'graveyard');
        this.state = sacResult.state;
        events.push(...sacResult.events);
        events.push(
          createEvent('CARD_DESTROYED', action.playerId, {
            cardInstanceId: sacCard.instanceId,
            cardName: sacCard.cardData.name,
          })
        );
      }
    }

    // --- Resolve effects ---
    // Build a synthetic StackItem for the EffectResolver
    const syntheticStackItem: StackItem = {
      id: `ability_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: 'ability',
      sourceInstanceId: cardId,
      controllerId: action.playerId,
      targets: targetId ? [targetId] : [],
      cardData: card.cardData,
    };

    const resolution = resolveSpellEffects(this.state, syntheticStackItem, forgeEffects);
    this.state = resolution.state;
    events.push(...resolution.events);

    // Emit ability activated event
    events.push(
      createEvent('ABILITY_ACTIVATED', action.playerId, {
        cardInstanceId: cardId,
        cardName: card.cardData.name,
        ability: 'activated',
        targetId,
      })
    );

    // Check SBAs after ability resolution
    this.checkStateBasedActions(events);

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(action.playerId),
    };
  }

  private processEquip(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const equipmentId = action.payload.cardInstanceId as string;
    const targetId = action.payload.targetId as string;
    const equipCost = action.payload.equipCost as number;

    const equipment = this.state.cardInstances.get(equipmentId);
    const target = this.state.cardInstances.get(targetId);
    const player = this.state.players.find((p) => p.id === action.playerId);
    if (!equipment || !target || !player) return this.errorResult('Invalid equip');

    // Pay equip cost (generic mana)
    const cost = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: equipCost, X: 0 };
    const payResult = payManaCost(player.manaPool, cost);
    if (!payResult) return this.errorResult('Cannot pay equip cost');

    // Update mana pool
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === action.playerId ? { ...p, manaPool: payResult } : p
      ),
    };

    // Detach from previous creature if already equipped
    const newCardInstances = new Map(this.state.cardInstances);
    if (equipment.attachedTo) {
      const oldHost = newCardInstances.get(equipment.attachedTo);
      if (oldHost) {
        newCardInstances.set(equipment.attachedTo, {
          ...oldHost,
          attachments: oldHost.attachments.filter((a) => a !== equipmentId),
        });
      }
    }

    // Attach to new creature
    const updatedEquipment = newCardInstances.get(equipmentId)!;
    newCardInstances.set(equipmentId, { ...updatedEquipment, attachedTo: targetId });
    const updatedTarget = newCardInstances.get(targetId)!;
    newCardInstances.set(targetId, {
      ...updatedTarget,
      attachments: [...updatedTarget.attachments.filter((a) => a !== equipmentId), equipmentId],
    });

    this.state = { ...this.state, cardInstances: newCardInstances };

    events.push(
      createEvent('ABILITY_ACTIVATED', action.playerId, {
        cardInstanceId: equipmentId,
        cardName: equipment.cardData.name,
        ability: 'equip',
        targetId,
        targetName: target.cardData.name,
      })
    );

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(action.playerId),
    };
  }

  private processPlayLand(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const cardId = action.payload.cardInstanceId as string;
    const card = this.state.cardInstances.get(cardId);
    if (!card) return this.errorResult('Card not found');

    const player = this.state.players.find((p) => p.id === action.playerId);
    if (!player) return this.errorResult('Player not found');

    // Move card from hand to battlefield
    const moveResult = moveCard(this.state, cardId, 'battlefield');
    this.state = moveResult.state;
    events.push(...moveResult.events);

    // For DFC cards, determine which face is the land face and set flipped accordingly
    if (card.cardData.cardFaces && card.cardData.cardFaces.length >= 2) {
      const frontIsLand = card.cardData.cardFaces[0].typeLine.toLowerCase().includes('land');
      const backIsLand = card.cardData.cardFaces[1].typeLine.toLowerCase().includes('land');
      // If only the back face is a land, flip to back; otherwise keep front
      const shouldFlip = !frontIsLand && backIsLand;
      const newCardInstances = new Map(this.state.cardInstances);
      const updatedCard = newCardInstances.get(cardId);
      if (updatedCard) {
        newCardInstances.set(cardId, { ...updatedCard, flipped: shouldFlip });
        this.state = { ...this.state, cardInstances: newCardInstances };
      }
    }

    // Check if land enters tapped (use effective face data for DFC cards)
    const currentCard = this.state.cardInstances.get(cardId);
    const effectiveData = currentCard ? getEffectiveLandCardData(currentCard) : card.cardData;
    if (isLand(card) && entersTapped(effectiveData)) {
      const newCardInstances = new Map(this.state.cardInstances);
      const updatedCard = newCardInstances.get(cardId);
      if (updatedCard) {
        newCardInstances.set(cardId, { ...updatedCard, tapped: true });
        this.state = { ...this.state, cardInstances: newCardInstances };
      }
    }

    // Mark land played
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === action.playerId ? { ...p, landPlayedThisTurn: true } : p
      ),
      turn: {
        ...this.state.turn,
        landsPlayedThisTurn: this.state.turn.landsPlayedThisTurn + 1,
      },
    };

    events.push(
      createEvent('CARD_PLAYED', action.playerId, {
        cardInstanceId: cardId,
        cardName: card.cardData.name,
      })
    );

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(action.playerId),
    };
  }

  private stackCounter = 0;

  private generateStackItemId(): string {
    return `stack_${Date.now()}_${++this.stackCounter}`;
  }

  private processCastSpell(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const cardId = action.payload.cardInstanceId as string;
    const fromZone = (action.payload.fromZone as string) || 'hand';
    const targets = (action.payload.targets as string[]) || [];
    const card = this.state.cardInstances.get(cardId);
    if (!card) return this.errorResult('Card not found');

    const player = this.state.players.find((p) => p.id === action.playerId);
    if (!player) return this.errorResult('Player not found');

    // Calculate cost (with commander tax if from command zone)
    const baseCost = parseManaCost(card.cardData.manaCost);
    let cost = baseCost;
    if (fromZone === 'command') {
      const castCount = player.commanderCastCount[cardId] || 0;
      cost = { ...baseCost, generic: baseCost.generic + castCount * 2 };
    }

    // Pay mana cost
    const newPool = payManaCost(player.manaPool, cost);
    if (!newPool) return this.errorResult('Cannot pay mana cost');

    // Update player mana (and commander cast count if from command zone)
    this.state = {
      ...this.state,
      players: this.state.players.map((p) => {
        if (p.id !== action.playerId) return p;
        const updated = { ...p, manaPool: newPool };
        if (fromZone === 'command') {
          updated.commanderCastCount = {
            ...p.commanderCastCount,
            [cardId]: (p.commanderCastCount[cardId] || 0) + 1,
          };
        }
        return updated;
      }),
    };

    events.push(
      createEvent('SPELL_CAST', action.playerId, {
        cardInstanceId: cardId,
        cardName: card.cardData.name,
        manaCost: card.cardData.manaCost,
        fromZone,
      })
    );

    // Push spell onto the stack
    const stackItem: StackItem = {
      id: this.generateStackItemId(),
      type: 'spell',
      sourceInstanceId: cardId,
      controllerId: action.playerId,
      cardData: card.cardData,
      targets,
    };

    // Move card to stack zone
    const moveResult = moveCard(this.state, cardId, 'stack');
    this.state = {
      ...moveResult.state,
      stack: [...moveResult.state.stack, stackItem],
    };

    // Reset priority — caster gets priority first (can respond to own spell)
    this.state = {
      ...this.state,
      priority: {
        playerWithPriority: action.playerId,
        passedPlayers: new Set(),
        waitingForResponse: false,
      },
    };

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(action.playerId),
    };
  }

  private processTapForMana(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const cardId = action.payload.cardInstanceId as string;
    const card = this.state.cardInstances.get(cardId);
    if (!card) return this.errorResult('Card not found');

    // Tap the land
    const newCardInstances = new Map(this.state.cardInstances);
    newCardInstances.set(cardId, { ...card, tapped: true });
    this.state = { ...this.state, cardInstances: newCardInstances };

    // Use mana color from action payload (set by ActionValidator per producible color)
    const manaColor = (action.payload.manaColor as string as ManaColor | 'C') || inferManaFromLand(card.cardData);
    const player = this.state.players.find((p) => p.id === action.playerId);
    if (!player) return this.errorResult('Player not found');

    const newPool = addMana(player.manaPool, manaColor);
    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === action.playerId ? { ...p, manaPool: newPool } : p
      ),
    };

    events.push(
      createEvent('CARD_TAPPED', action.playerId, {
        cardInstanceId: cardId,
        cardName: card.cardData.name,
      })
    );
    events.push(
      createEvent('MANA_ADDED', action.playerId, {
        color: manaColor,
        amount: 1,
      })
    );

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(action.playerId),
    };
  }

  private processUntapPermanent(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const cardId = action.payload.cardInstanceId as string;
    const card = this.state.cardInstances.get(cardId);
    if (!card) return this.errorResult('Card not found');
    if (!card.tapped) return this.errorResult('Card is not tapped');

    // Untap the card
    const newCardInstances = new Map(this.state.cardInstances);
    newCardInstances.set(cardId, { ...card, tapped: false });
    this.state = { ...this.state, cardInstances: newCardInstances };

    // If it's a land, refund the mana it produced.
    // Since we don't track which color was chosen, remove 1 mana from any
    // producible color that is currently in the pool.
    if (isLand(card)) {
      const producible = getLandProducibleColors(card.cardData);
      const player = this.state.players.find((p) => p.id === action.playerId);
      if (player) {
        const newPool = { ...player.manaPool };
        let refunded = false;
        for (const color of producible) {
          if (newPool[color] > 0) {
            newPool[color] -= 1;
            refunded = true;
            break;
          }
        }
        if (refunded) {
          this.state = {
            ...this.state,
            players: this.state.players.map((p) =>
              p.id === action.playerId ? { ...p, manaPool: newPool } : p
            ),
          };
        }
      }
    }

    events.push(
      createEvent('CARD_UNTAPPED', action.playerId, {
        cardInstanceId: cardId,
        cardName: card.cardData.name,
      })
    );

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(action.playerId),
    };
  }

  private processPassPriority(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const alivePlayers = getAlivePlayers(this.state);

    const newPriority = { ...this.state.priority };
    newPriority.passedPlayers = new Set(this.state.priority.passedPlayers);
    newPriority.passedPlayers.add(action.playerId);

    // Check if all players have passed
    const allPassed = alivePlayers.every((p) =>
      newPriority.passedPlayers.has(p.id)
    );

    if (allPassed) {
      if (this.state.stack.length > 0) {
        // Resolve top of stack
        const resolveResult = this.resolveTopStackItem();
        this.state = resolveResult.state;
        events.push(...resolveResult.events);

        // Run state-based actions after resolution
        this.runFullSBACheck(events);

        // After resolving, active player gets priority (fresh round)
        this.state = {
          ...this.state,
          priority: {
            playerWithPriority: this.state.turn.activePlayerId,
            passedPlayers: new Set(),
            waitingForResponse: false,
          },
        };
      } else {
        // Stack is empty and all passed — advance to next step/phase
        const advanceResult = advanceStep(this.state);
        this.state = advanceResult.state;
        events.push(...advanceResult.events);

        // Handle special steps
        if (this.state.turn.step === 'untap') {
          const untapResult = performUntapStep(this.state);
          this.state = untapResult.state;
          events.push(...untapResult.events);
          // Auto-advance past untap (no priority in untap)
          const nextStep = advanceStep(this.state);
          this.state = nextStep.state;
          events.push(...nextStep.events);
        }

        if (this.state.turn.step === 'draw') {
          const drawResult = performDrawStep(this.state);
          this.state = drawResult.state;
          events.push(...drawResult.events);
        }

        // Cleanup step: reset until-end-of-turn effects
        if (this.state.turn.step === 'cleanup') {
          this.resetEndOfTurnEffects();
        }
      }
    } else {
      // Pass to next player
      const currentIndex = alivePlayers.findIndex(
        (p) => p.id === action.playerId
      );
      const nextPlayer =
        alivePlayers[(currentIndex + 1) % alivePlayers.length];
      newPriority.playerWithPriority = nextPlayer.id;
      this.state = { ...this.state, priority: newPriority };
    }

    // Check win condition
    this.checkWinCondition(events);

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(
        this.state.priority.playerWithPriority
      ),
    };
  }

  private resolveTopStackItem(): { state: GameState; events: GameEvent[] } {
    const events: GameEvent[] = [];
    if (this.state.stack.length === 0) {
      return { state: this.state, events };
    }

    const stack = [...this.state.stack];
    const item = stack.pop()!;
    let newState = { ...this.state, stack };

    const card = newState.cardInstances.get(item.sourceInstanceId);
    if (!card) {
      return { state: newState, events };
    }

    // --- Triggered ability resolution ---
    if (item.type === 'ability') {
      const cardData = item.cardData || card.cardData;
      // Determine which trigger condition fired based on context
      const triggers = parseTriggers(cardData.oracleText);
      let triggerEffects = triggers.length > 0 ? triggers[0].effects : [];
      // Try to match the right trigger (etb_self first, then dies_self)
      for (const t of triggers) {
        if (t.condition === 'etb_self' || t.condition === 'etb_other' ||
            t.condition === 'dies_self' || t.condition === 'dies_other') {
          triggerEffects = t.effects;
          break;
        }
      }
      // Resolve effects using the EffectResolver
      const effectResult = resolveSpellEffects(newState, item, triggerEffects);
      newState = effectResult.state;
      events.push(...effectResult.events);

      events.push(
        createEvent('ABILITY_RESOLVED', item.controllerId, {
          cardInstanceId: item.sourceInstanceId,
          cardName: cardData.name,
        })
      );
      return { state: newState, events };
    }

    // --- Spell resolution ---

    // Fizzle check: if spell requires targets and all targets are invalid
    const spellEffects = parseSpellEffects(card.cardData.oracleText);
    const hasTargetedEffects = spellEffects.some((e) => e.requiresTarget);
    if (hasTargetedEffects && item.targets.length > 0 && !areTargetsValid(newState, item)) {
      // Spell fizzles — move to graveyard without resolving
      const moveResult = moveCard(newState, item.sourceInstanceId, 'graveyard');
      newState = moveResult.state;
      events.push(
        createEvent('SPELL_COUNTERED', item.controllerId, {
          cardInstanceId: item.sourceInstanceId,
          cardName: card.cardData.name,
          reason: 'fizzle',
        })
      );
      return { state: newState, events };
    }

    const typeLine = card.cardData.typeLine.toLowerCase();
    const isPermanent =
      typeLine.includes('creature') ||
      typeLine.includes('artifact') ||
      typeLine.includes('enchantment') ||
      typeLine.includes('planeswalker');

    if (isPermanent) {
      // Permanent spells enter the battlefield
      const moveResult = moveCard(newState, item.sourceInstanceId, 'battlefield');
      newState = moveResult.state;

      // Also resolve any ETB-relevant effects from oracle text
      const effectResult = resolveSpellEffects(newState, item);
      newState = effectResult.state;
      events.push(...effectResult.events);

      // Check for ETB triggers
      const enteredCard = newState.cardInstances.get(item.sourceInstanceId);
      if (enteredCard) {
        const etbItems = checkETBTriggers(newState, enteredCard, () => this.generateStackItemId());
        if (etbItems.length > 0) {
          newState = { ...newState, stack: [...newState.stack, ...etbItems] };
          for (const etb of etbItems) {
            events.push(
              createEvent('ABILITY_TRIGGERED', etb.controllerId, {
                cardInstanceId: etb.sourceInstanceId,
                cardName: etb.cardData?.name || 'Unknown',
                trigger: 'etb',
              })
            );
          }
        }
      }
    } else {
      // Non-permanent spells: resolve effects, then go to graveyard
      const effectResult = resolveSpellEffects(newState, item);
      newState = effectResult.state;
      events.push(...effectResult.events);

      const moveResult = moveCard(newState, item.sourceInstanceId, 'graveyard');
      newState = moveResult.state;
    }

    events.push(
      createEvent('SPELL_RESOLVED', item.controllerId, {
        cardInstanceId: item.sourceInstanceId,
        cardName: card.cardData.name,
      })
    );

    return { state: newState, events };
  }

  private resetEndOfTurnEffects() {
    const newCardInstances = new Map(this.state.cardInstances);
    for (const [id, card] of newCardInstances) {
      if (card.zone !== 'battlefield') continue;
      if (card.modifiedPower !== undefined || card.modifiedToughness !== undefined) {
        newCardInstances.set(id, {
          ...card,
          modifiedPower: undefined,
          modifiedToughness: undefined,
        });
      }
    }
    this.state = { ...this.state, cardInstances: newCardInstances };
  }

  private runFullSBACheck(events: GameEvent[]) {
    // Lethal damage on creatures
    this.checkStateBasedActions(events);

    // Player death checks (life, commander damage, poison)
    for (const player of this.state.players) {
      if (player.hasLost || player.hasConceded) continue;

      let reason = '';
      if (player.life <= 0) {
        reason = 'life_zero';
      } else if (player.poisonCounters >= 10) {
        reason = 'poison';
      } else {
        // Commander damage: 21+ from any single commander
        for (const [, dmg] of Object.entries(player.commanderDamageReceived)) {
          if (dmg >= 21) {
            reason = 'commander_damage';
            break;
          }
        }
      }

      if (reason) {
        this.state = {
          ...this.state,
          players: this.state.players.map((p) =>
            p.id === player.id ? { ...p, hasLost: true } : p
          ),
        };
        events.push(
          createEvent('PLAYER_LOST', player.id, { reason })
        );
      }
    }

    // Legend rule: if a player controls two+ legends with the same name,
    // destroy all but one (keep the newest — last in the zone list)
    this.checkLegendRule(events);
  }

  private checkLegendRule(events: GameEvent[]) {
    const legendsByPlayer = new Map<string, Map<string, string[]>>();

    for (const [id, card] of this.state.cardInstances) {
      if (card.zone !== 'battlefield') continue;
      const typeLine = card.cardData.typeLine.toLowerCase();
      if (!typeLine.includes('legendary')) continue;

      const key = card.controllerId;
      if (!legendsByPlayer.has(key)) legendsByPlayer.set(key, new Map());
      const playerLegends = legendsByPlayer.get(key)!;
      const name = card.cardData.name;
      if (!playerLegends.has(name)) playerLegends.set(name, []);
      playerLegends.get(name)!.push(id);
    }

    for (const [, playerLegends] of legendsByPlayer) {
      for (const [, ids] of playerLegends) {
        if (ids.length <= 1) continue;
        // Keep the last one (newest), destroy the rest
        const toDestroy = ids.slice(0, -1);
        for (const id of toDestroy) {
          const card = this.state.cardInstances.get(id);
          if (!card) continue;
          const moveResult = moveCard(this.state, id, 'graveyard');
          this.state = moveResult.state;
          events.push(
            createEvent('CARD_DESTROYED', card.controllerId, {
              cardInstanceId: id,
              cardName: card.cardData.name,
              reason: 'legend_rule',
            })
          );
        }
      }
    }
  }

  private checkWinCondition(events: GameEvent[]) {
    const stillAlive = getAlivePlayers(this.state);
    if (stillAlive.length === 1 && !this.state.isGameOver) {
      this.state = {
        ...this.state,
        winner: stillAlive[0].id,
        isGameOver: true,
      };
      events.push(
        createEvent('PLAYER_WON', stillAlive[0].id, {
          playerName: stillAlive[0].name,
        })
      );
      events.push(createEvent('GAME_OVER', stillAlive[0].id, {}));
    } else if (stillAlive.length === 0 && !this.state.isGameOver) {
      this.state = { ...this.state, isGameOver: true };
      events.push(createEvent('GAME_OVER', '', { result: 'draw' }));
    }
  }

  private processDeclareAttackers(action: GameAction): ActionResult {
    const events: GameEvent[] = [];

    // Support two payload formats:
    // 1. Per-attacker targeting (Commander): attackerDeclarations: {attackerId, defendingPlayerId}[]
    // 2. Legacy single-target: attackerInstanceIds: string[], defendingPlayerId: string
    const declarations = action.payload.attackerDeclarations as
      | Array<{ attackerId: string; defendingPlayerId: string }>
      | undefined;
    const legacyIds = action.payload.attackerInstanceIds as string[] | undefined;
    const legacyDefender = action.payload.defendingPlayerId as string | undefined;

    let attackerPairs: Array<{ attackerId: string; defendingPlayerId: string }> = [];

    if (declarations && declarations.length > 0) {
      attackerPairs = declarations;
    } else if (legacyIds && legacyIds.length > 0 && legacyDefender) {
      attackerPairs = legacyIds.map((id) => ({ attackerId: id, defendingPlayerId: legacyDefender }));
    }

    if (attackerPairs.length === 0) {
      // No attackers — skip to end of combat
      const advanceResult = advanceStep(this.state);
      this.state = advanceResult.state;
      events.push(...advanceResult.events);
    } else {
      // Tap attackers and create combat state
      const newCardInstances = new Map(this.state.cardInstances);
      const attackers = [];

      for (const { attackerId, defendingPlayerId } of attackerPairs) {
        const card = newCardInstances.get(attackerId);
        if (card) {
          // Tap attacker (unless it has vigilance)
          const hasVigilance = card.cardData.keywords.some(
            (k) => k.toLowerCase() === 'vigilance'
          );
          if (!hasVigilance) {
            newCardInstances.set(attackerId, { ...card, tapped: true });
          }
          attackers.push({
            attackerInstanceId: attackerId,
            defendingPlayerId,
          });
          events.push(
            createEvent('CREATURE_ATTACKED', action.playerId, {
              cardInstanceId: attackerId,
              cardName: card.cardData.name,
              defendingPlayerId,
            })
          );
        }
      }

      // Determine the first defending player to get priority for blockers
      const defenderIds = [...new Set(attackers.map((a) => a.defendingPlayerId))];
      const firstDefender = defenderIds[0] || action.playerId;

      this.state = {
        ...this.state,
        cardInstances: newCardInstances,
        combat: {
          attackers,
          blockers: [],
          damageAssignment: new Map(),
          phase: 'declaring_blockers',
        },
        turn: {
          ...this.state.turn,
          step: 'declare_blockers',
        },
        priority: {
          playerWithPriority: firstDefender,
          passedPlayers: new Set(),
          waitingForResponse: false,
        },
      };

      events.push(
        createEvent('STEP_CHANGED', action.playerId, {
          phase: 'combat',
          step: 'declare_blockers',
        })
      );
    }

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(
        this.state.priority.playerWithPriority
      ),
    };
  }

  private processDeclareBlockers(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const blockerAssignments = action.payload.blockerAssignments as
      | Array<{ blockerId: string; attackerId: string }>
      | undefined;

    if (this.state.combat) {
      if (blockerAssignments) {
        this.state.combat = {
          ...this.state.combat,
          blockers: blockerAssignments.map((b) => ({
            blockerInstanceId: b.blockerId,
            blockedAttackerInstanceId: b.attackerId,
          })),
          phase: 'assigning_damage',
        };

        for (const b of blockerAssignments) {
          const blocker = this.state.cardInstances.get(b.blockerId);
          events.push(
            createEvent('CREATURE_BLOCKED', action.playerId, {
              blockerInstanceId: b.blockerId,
              blockerName: blocker?.cardData.name || 'Unknown',
              attackerInstanceId: b.attackerId,
            })
          );
        }
      }

      // Resolve combat damage (simplified)
      this.resolveCombatDamage(events);

      // After combat resolves, advance to end_of_combat step and return priority to active player
      this.state = {
        ...this.state,
        turn: {
          ...this.state.turn,
          step: 'end_of_combat',
        },
        priority: {
          playerWithPriority: this.state.turn.activePlayerId,
          passedPlayers: new Set(),
          waitingForResponse: false,
        },
      };
    }

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: this.getLegalActionsForPlayer(
        this.state.priority.playerWithPriority
      ),
    };
  }

  private resolveCombatDamage(events: GameEvent[]) {
    if (!this.state.combat) return;
    const combat = this.state.combat;

    const newCardInstances = new Map(this.state.cardInstances);
    let newPlayers = [...this.state.players];
    const deathtouchVictims = new Set<string>();

    // Helper: deal damage from a creature to another creature
    const dealDamageToCreature = (
      sourceId: string,
      targetId: string,
      amount: number,
      sourceCard: ReturnType<typeof newCardInstances.get>,
    ) => {
      if (amount <= 0 || !sourceCard) return;
      const target = newCardInstances.get(targetId);
      if (!target) return;

      newCardInstances.set(targetId, { ...target, damage: target.damage + amount });

      events.push(createEvent('DAMAGE_DEALT', sourceCard.controllerId, {
        source: sourceId, target: targetId, amount, type: 'combat',
      }));

      // Track deathtouch victims for SBA
      if (hasDeathtouch(sourceCard)) {
        deathtouchVictims.add(targetId);
      }

      // Lifelink: controller gains life equal to damage dealt
      if (hasLifelink(sourceCard)) {
        newPlayers = newPlayers.map((p) =>
          p.id === sourceCard.controllerId ? { ...p, life: p.life + amount } : p
        );
        events.push(createEvent('LIFE_CHANGED', sourceCard.controllerId, {
          newLife: newPlayers.find((p) => p.id === sourceCard.controllerId)?.life || 0,
          reason: 'lifelink',
        }));
      }
    };

    // Helper: deal damage from a creature to a player
    const dealDamageToPlayer = (
      sourceId: string,
      playerId: string,
      amount: number,
      sourceCard: ReturnType<typeof newCardInstances.get>,
    ) => {
      if (amount <= 0 || !sourceCard) return;
      newPlayers = newPlayers.map((p) =>
        p.id === playerId ? { ...p, life: p.life - amount } : p
      );
      events.push(createEvent('DAMAGE_DEALT', sourceCard.controllerId, {
        source: sourceId, target: playerId, amount, type: 'combat',
      }));
      events.push(createEvent('LIFE_CHANGED', playerId, {
        newLife: newPlayers.find((p) => p.id === playerId)?.life || 0,
      }));

      // Lifelink
      if (hasLifelink(sourceCard)) {
        newPlayers = newPlayers.map((p) =>
          p.id === sourceCard.controllerId ? { ...p, life: p.life + amount } : p
        );
        events.push(createEvent('LIFE_CHANGED', sourceCard.controllerId, {
          newLife: newPlayers.find((p) => p.id === sourceCard.controllerId)?.life || 0,
          reason: 'lifelink',
        }));
      }
    };

    // Helper: check if a creature is dead (lethal damage or deathtouch)
    const isLethal = (card: ReturnType<typeof newCardInstances.get>) => {
      if (!card) return false;
      return card.damage >= getEffectiveToughness(card, newCardInstances);
    };

    // Separate attackers into first-strike and normal-strike groups
    const allAttackers = combat.attackers;
    const hasAnyFirstStrike = allAttackers.some((a) => {
      const c = newCardInstances.get(a.attackerInstanceId);
      return c && (hasFirstStrike(c) || hasDoubleStrike(c));
    });
    const hasAnyBlockerFirstStrike = combat.blockers.some((b) => {
      const c = newCardInstances.get(b.blockerInstanceId);
      return c && (hasFirstStrike(c) || hasDoubleStrike(c));
    });
    const needsFirstStrikeStep = hasAnyFirstStrike || hasAnyBlockerFirstStrike;

    // Process damage in up to 2 steps: first strike, then normal
    const damageSteps = needsFirstStrikeStep ? ['first_strike', 'normal'] : ['normal'];

    for (const step of damageSteps) {
      for (const attacker of allAttackers) {
        const attackerCard = newCardInstances.get(attacker.attackerInstanceId);
        if (!attackerCard) continue;
        // Skip dead attackers (killed in first strike step)
        if (isLethal(attackerCard)) continue;

        const isFS = hasFirstStrike(attackerCard);
        const isDS = hasDoubleStrike(attackerCard);

        // Determine if this attacker deals damage in this step
        const dealsInFirstStrike = isFS || isDS;
        const dealsInNormal = !isFS || isDS; // non-FS creatures deal in normal; DS deals in both
        if (step === 'first_strike' && !dealsInFirstStrike) continue;
        if (step === 'normal' && !dealsInNormal) continue;

        const attackerPower = getEffectivePower(attackerCard, newCardInstances);
        if (attackerPower <= 0) continue;

        const blockers = combat.blockers.filter(
          (b) => b.blockedAttackerInstanceId === attacker.attackerInstanceId
        );

        if (blockers.length === 0) {
          // Unblocked — damage to defending player
          dealDamageToPlayer(
            attacker.attackerInstanceId,
            attacker.defendingPlayerId,
            attackerPower,
            attackerCard,
          );
        } else {
          // Blocked — distribute damage to blockers
          let remainingDamage = attackerPower;
          const attackerHasDeathtouch = hasDeathtouch(attackerCard);
          const attackerHasTrample = hasTrample(attackerCard);

          for (const blocker of blockers) {
            if (remainingDamage <= 0) break;
            const blockerCard = newCardInstances.get(blocker.blockerInstanceId);
            if (!blockerCard) continue;
            // Skip dead blockers
            if (isLethal(blockerCard)) continue;

            const blockerToughness = getEffectiveToughness(blockerCard, newCardInstances);
            const existingDamage = blockerCard.damage;
            const remainingToughness = blockerToughness - existingDamage;

            // Deathtouch: 1 damage is enough to be lethal
            const lethalForBlocker = attackerHasDeathtouch
              ? Math.min(1, remainingToughness)
              : remainingToughness;

            const damageToBlocker = Math.min(remainingDamage, Math.max(0, lethalForBlocker));
            dealDamageToCreature(attacker.attackerInstanceId, blocker.blockerInstanceId, damageToBlocker, attackerCard);
            remainingDamage -= damageToBlocker;
          }

          // Trample: excess damage goes to defending player
          if (attackerHasTrample && remainingDamage > 0) {
            dealDamageToPlayer(
              attacker.attackerInstanceId,
              attacker.defendingPlayerId,
              remainingDamage,
              attackerCard,
            );
          }
        }
      }

      // Blockers deal damage to attackers in this step
      for (const blocker of combat.blockers) {
        const blockerCard = newCardInstances.get(blocker.blockerInstanceId);
        if (!blockerCard) continue;
        if (isLethal(blockerCard)) continue;

        const isFS = hasFirstStrike(blockerCard);
        const isDS = hasDoubleStrike(blockerCard);
        const dealsInFirstStrike = isFS || isDS;
        const dealsInNormal = !isFS || isDS;
        if (step === 'first_strike' && !dealsInFirstStrike) continue;
        if (step === 'normal' && !dealsInNormal) continue;

        const blockerPower = parseInt(blockerCard.cardData.power || '0', 10);
        if (blockerPower <= 0) continue;

        dealDamageToCreature(
          blocker.blockerInstanceId,
          blocker.blockedAttackerInstanceId,
          blockerPower,
          blockerCard,
        );
      }

      // After first strike step, run SBA to remove dead creatures before normal damage
      if (step === 'first_strike') {
        this.state = { ...this.state, cardInstances: newCardInstances, players: newPlayers };
        this.checkStateBasedActions(events, deathtouchVictims);
        // Refresh references after SBA may have moved cards
        // newCardInstances is now stale, re-sync
        for (const [id, card] of this.state.cardInstances) {
          newCardInstances.set(id, card);
        }
        newPlayers = [...this.state.players];
      }
    }

    // Track commander damage for unblocked attackers
    for (const attacker of allAttackers) {
      const attackerCard = newCardInstances.get(attacker.attackerInstanceId);
      if (!attackerCard) continue;

      // Check if this creature is a commander (legendary creature in command zone origin)
      const isCommanderCard =
        attackerCard.cardData.typeLine.toLowerCase().includes('legendary') &&
        attackerCard.cardData.typeLine.toLowerCase().includes('creature');

      if (isCommanderCard) {
        const blockers = combat.blockers.filter(
          (b) => b.blockedAttackerInstanceId === attacker.attackerInstanceId
        );
        if (blockers.length === 0) {
          // Unblocked commander — track damage dealt to defending player
          const attackerPower = parseInt(attackerCard.cardData.power || '0', 10);
          if (attackerPower > 0) {
            newPlayers = newPlayers.map((p) => {
              if (p.id !== attacker.defendingPlayerId) return p;
              return {
                ...p,
                commanderDamageReceived: {
                  ...p.commanderDamageReceived,
                  [attacker.attackerInstanceId]:
                    (p.commanderDamageReceived[attacker.attackerInstanceId] || 0) + attackerPower,
                },
              };
            });
          }
        }
      }
    }

    this.state = {
      ...this.state,
      cardInstances: newCardInstances,
      players: newPlayers,
      combat: null,
    };

    // Check for lethal damage on creatures (state-based actions)
    this.checkStateBasedActions(events, deathtouchVictims);

    // Run full SBA check (player deaths from life/commander damage/poison)
    this.runFullSBACheck(events);
  }

  private checkStateBasedActions(events: GameEvent[], deathtouchVictims?: Set<string>) {
    const toDestroy: string[] = [];

    for (const [id, card] of this.state.cardInstances) {
      if (card.zone !== 'battlefield') continue;
      if (!card.cardData.typeLine.toLowerCase().includes('creature')) continue;

      const toughness = getEffectiveToughness(card, this.state.cardInstances);

      // 0 toughness = dies regardless of indestructible
      if (toughness <= 0) {
        toDestroy.push(id);
        continue;
      }

      // Indestructible creatures can't be destroyed by damage
      if (hasIndestructible(card)) continue;

      // Lethal damage OR deathtouch (any damage from deathtouch source is lethal)
      if (card.damage >= toughness || (deathtouchVictims?.has(id) && card.damage > 0)) {
        toDestroy.push(id);
      }
    }

    for (const id of toDestroy) {
      const card = this.state.cardInstances.get(id);
      if (!card) continue;

      // Check death triggers BEFORE moving to graveyard (need battlefield state)
      const deathItems = checkDeathTriggers(this.state, card, () => this.generateStackItemId());

      const moveResult = moveCard(this.state, id, 'graveyard');
      this.state = moveResult.state;

      events.push(
        createEvent('CARD_DESTROYED', card.controllerId, {
          cardInstanceId: id,
          cardName: card.cardData.name,
          reason: 'lethal_damage',
        })
      );

      // Put death triggers on the stack
      if (deathItems.length > 0) {
        this.state = { ...this.state, stack: [...this.state.stack, ...deathItems] };
        for (const dt of deathItems) {
          events.push(
            createEvent('ABILITY_TRIGGERED', dt.controllerId, {
              cardInstanceId: dt.sourceInstanceId,
              cardName: dt.cardData?.name || 'Unknown',
              trigger: 'dies',
            })
          );
        }
      }
    }
  }

  private processConcede(action: GameAction): ActionResult {
    const events: GameEvent[] = [];

    this.state = {
      ...this.state,
      players: this.state.players.map((p) =>
        p.id === action.playerId ? { ...p, hasConceded: true } : p
      ),
    };

    events.push(
      createEvent('PLAYER_LOST', action.playerId, { reason: 'conceded' })
    );

    const stillAlive = getAlivePlayers(this.state);
    if (stillAlive.length === 1) {
      this.state = {
        ...this.state,
        winner: stillAlive[0].id,
        isGameOver: true,
      };
      events.push(
        createEvent('PLAYER_WON', stillAlive[0].id, {
          playerName: stillAlive[0].name,
        })
      );
      events.push(createEvent('GAME_OVER', stillAlive[0].id, {}));
    }

    this.state.events.push(...events);
    return {
      newState: this.state,
      events,
      legalActions: [],
    };
  }

  private errorResult(error: string): ActionResult {
    return {
      newState: this.state,
      events: [],
      legalActions: this.getLegalActionsForPlayer(
        this.state.priority.playerWithPriority
      ),
      error,
    };
  }
}
