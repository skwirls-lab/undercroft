import type {
  GameState,
  GameAction,
  ActionResult,
  GameEvent,
  CardData,
  ManaColor,
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
} from './ActionValidator';
import { entersTapped, getLandProducibleColors } from './OracleTextParser';

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

    this.state.turn.turnNumber = 1;
    this.state.mulliganPhase = false;

    events.push(
      createEvent('GAME_STARTED', this.state.turn.activePlayerId, {
        playerCount: this.state.players.length,
      })
    );
    events.push(
      createEvent('TURN_STARTED', this.state.turn.activePlayerId, {
        turnNumber: 1,
      })
    );

    // Perform untap step for first turn
    const untapResult = performUntapStep(this.state);
    this.state = untapResult.state;
    events.push(...untapResult.events);

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

    // Check if land enters tapped (oracle text parsing)
    if (isLand(card) && entersTapped(card.cardData)) {
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

  private processCastSpell(action: GameAction): ActionResult {
    const events: GameEvent[] = [];
    const cardId = action.payload.cardInstanceId as string;
    const fromZone = (action.payload.fromZone as string) || 'hand';
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

    // For MVP: resolve immediately (skip stack for simplicity in v1)
    // Creatures/artifacts/enchantments go to battlefield
    // Sorceries/instants go to graveyard after resolving
    const typeLine = card.cardData.typeLine.toLowerCase();
    const isPermanent =
      typeLine.includes('creature') ||
      typeLine.includes('artifact') ||
      typeLine.includes('enchantment') ||
      typeLine.includes('planeswalker');

    if (isPermanent) {
      const moveResult = moveCard(this.state, cardId, 'battlefield');
      this.state = moveResult.state;
      events.push(...moveResult.events);
    } else {
      const moveResult = moveCard(this.state, cardId, 'graveyard');
      this.state = moveResult.state;
      events.push(...moveResult.events);
    }

    events.push(
      createEvent('SPELL_RESOLVED', action.playerId, {
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
        // Resolve top of stack (future implementation)
        // For now, just clear and advance
      }

      // Advance to next step/phase
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
      legalActions: this.getLegalActionsForPlayer(
        this.state.priority.playerWithPriority
      ),
    };
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
      const toughness = parseInt(card.cardData.toughness || '0', 10);
      return card.damage >= toughness;
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

        const attackerPower = parseInt(attackerCard.cardData.power || '0', 10);
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

            const blockerToughness = parseInt(blockerCard.cardData.toughness || '0', 10);
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

    this.state = {
      ...this.state,
      cardInstances: newCardInstances,
      players: newPlayers,
      combat: null,
    };

    // Check for lethal damage on creatures (state-based actions)
    this.checkStateBasedActions(events, deathtouchVictims);

    // Check for player deaths
    for (const player of this.state.players) {
      if (player.life <= 0 && !player.hasLost) {
        this.state = {
          ...this.state,
          players: this.state.players.map((p) =>
            p.id === player.id ? { ...p, hasLost: true } : p
          ),
        };
        events.push(
          createEvent('PLAYER_LOST', player.id, { reason: 'life_zero' })
        );
      }
    }
  }

  private checkStateBasedActions(events: GameEvent[], deathtouchVictims?: Set<string>) {
    const toDestroy: string[] = [];

    for (const [id, card] of this.state.cardInstances) {
      if (card.zone !== 'battlefield') continue;
      if (!card.cardData.typeLine.toLowerCase().includes('creature')) continue;

      const toughness = parseInt(card.cardData.toughness || '0', 10);
      // Lethal damage OR deathtouch (any damage from deathtouch source is lethal)
      if (card.damage >= toughness || (deathtouchVictims?.has(id) && card.damage > 0)) {
        toDestroy.push(id);
      }
    }

    for (const id of toDestroy) {
      const card = this.state.cardInstances.get(id);
      if (!card) continue;

      const moveResult = moveCard(this.state, id, 'graveyard');
      this.state = moveResult.state;

      events.push(
        createEvent('CARD_DESTROYED', card.controllerId, {
          cardInstanceId: id,
          cardName: card.cardData.name,
          reason: 'lethal_damage',
        })
      );
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
