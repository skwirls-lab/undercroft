// ============================================================
// Effect Resolver — Applies parsed spell effects to game state
// ============================================================

import type { GameState, GameEvent, StackItem, CardData, ManaColor } from './types';
import { moveCard, shuffleZone } from './ZoneManager';
import { drawCards } from './TurnManager';
import { parseSpellEffects, type SpellEffect } from './SpellEffectParser';
import { getCardsInZone, createCardInstance, getZoneKey } from './GameState';
import { hasIndestructible, getEffectivePower, getEffectiveToughness } from './ActionValidator';

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

// Resolve all effects of a spell/ability that just came off the stack.
// effectsOverride allows triggered abilities to supply pre-parsed effects.
export function resolveSpellEffects(
  state: GameState,
  stackItem: StackItem,
  effectsOverride?: SpellEffect[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const card = state.cardInstances.get(stackItem.sourceInstanceId);
  const cardData = stackItem.cardData || card?.cardData;
  if (!cardData) return { state, events };

  const effects = effectsOverride || parseSpellEffects(cardData.oracleText);
  if (effects.length === 0) return { state, events };

  let newState = state;
  const targets = stackItem.targets;

  for (const effect of effects) {
    // Validate targets are still legal before applying
    if (effect.requiresTarget && targets.length === 0) continue;

    const result = applyEffect(newState, effect, stackItem.controllerId, targets);
    newState = result.state;
    events.push(...result.events);
  }

  return { state: newState, events };
}

// Check if a spell's targets are all still valid (for fizzle check)
export function areTargetsValid(
  state: GameState,
  stackItem: StackItem
): boolean {
  const card = state.cardInstances.get(stackItem.sourceInstanceId);
  if (!card) return false;

  const effects = parseSpellEffects(card.cardData.oracleText);
  const targetedEffects = effects.filter((e) => e.requiresTarget);

  // If spell has no targeted effects, it doesn't fizzle
  if (targetedEffects.length === 0) return true;

  // All targets must still be valid
  for (const targetId of stackItem.targets) {
    // Check if target is a player
    const targetPlayer = state.players.find((p) => p.id === targetId);
    if (targetPlayer && !targetPlayer.hasLost && !targetPlayer.hasConceded) continue;

    // Check if target is a card on the battlefield
    const targetCard = state.cardInstances.get(targetId);
    if (targetCard && targetCard.zone === 'battlefield') continue;

    // Check if target is a stack item (for counter spells)
    if (state.stack.some((item) => item.id === targetId)) continue;

    // Target is no longer valid
    return false;
  }

  return true;
}

function applyEffect(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  switch (effect.type) {
    case 'destroy':
      return applyDestroy(state, controllerId, targets);
    case 'exile':
      return applyExile(state, controllerId, targets);
    case 'bounce':
      return applyBounce(state, controllerId, targets);
    case 'damage':
      return applyDamage(state, effect, controllerId, targets);
    case 'draw':
      return applyDraw(state, effect, controllerId, targets);
    case 'pump':
      return applyPump(state, effect, targets);
    case 'gain_life':
      return applyGainLife(state, effect, controllerId);
    case 'lose_life':
      return applyLoseLife(state, effect, controllerId, targets);
    case 'discard':
      return applyDiscard(state, effect, controllerId, targets);
    case 'counter_spell':
      return applyCounterSpell(state, controllerId, targets);
    case 'destroy_all':
      return applyDestroyAll(state, effect, controllerId);
    case 'exile_all':
      return applyExileAll(state, effect, controllerId);
    case 'tap':
      return applyTap(state, controllerId, targets);
    case 'untap':
      return applyUntap(state, controllerId, targets);
    case 'create_token':
      return applyCreateToken(state, effect, controllerId);
    case 'add_counter':
      return applyAddCounter(state, effect, controllerId, targets);
    case 'scry':
      return applyScry(state, effect, controllerId);
    case 'surveil':
      return applySurveil(state, effect, controllerId);
    case 'mill':
      return applyMill(state, effect, controllerId, targets);
    case 'search_library':
      return applySearchLibrary(state, effect, controllerId);
    case 'put_land_onto_battlefield':
      return applyPutLandOntoBattlefield(state, effect, controllerId);
    case 'return_from_graveyard':
      return applyReturnFromGraveyard(state, effect, controllerId, targets);
    case 'create_treasure':
      return applyCreateTreasure(state, effect, controllerId);
    case 'fight':
      return applyFight(state, controllerId, targets);
    case 'sacrifice':
      return applySacrifice(state, effect, controllerId);
    case 'each_draw':
      return applyEachDraw(state, effect, controllerId);
    default:
      return { state, events: [] };
  }
}

// --- Individual effect implementations ---

function applyDestroy(
  state: GameState,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const targetId of targets) {
    const target = state.cardInstances.get(targetId);
    if (!target || target.zone !== 'battlefield') continue;
    if (hasIndestructible(target)) continue; // Indestructible prevents destroy effects
    const moveResult = moveCard(state, targetId, 'graveyard');
    state = moveResult.state;
    events.push(
      createEvent('CARD_DESTROYED', controllerId, {
        cardInstanceId: targetId,
        cardName: target.cardData.name,
        reason: 'spell_effect',
      })
    );
  }
  return { state, events };
}

function applyExile(
  state: GameState,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const targetId of targets) {
    const target = state.cardInstances.get(targetId);
    if (!target || target.zone !== 'battlefield') continue;
    const moveResult = moveCard(state, targetId, 'exile');
    state = moveResult.state;
    events.push(
      createEvent('CARD_EXILED', controllerId, {
        cardInstanceId: targetId,
        cardName: target.cardData.name,
      })
    );
  }
  return { state, events };
}

function applyBounce(
  state: GameState,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const targetId of targets) {
    const target = state.cardInstances.get(targetId);
    if (!target || target.zone !== 'battlefield') continue;
    const moveResult = moveCard(state, targetId, 'hand');
    state = moveResult.state;
    events.push(
      createEvent('CARD_RETURNED', controllerId, {
        cardInstanceId: targetId,
        cardName: target.cardData.name,
        toZone: 'hand',
      })
    );
  }
  return { state, events };
}

function applyDamage(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 0;
  if (amount <= 0) return { state, events };

  if (effect.targetType === 'each_opponent') {
    const opponents = state.players.filter(
      (p) => p.id !== controllerId && !p.hasLost && !p.hasConceded
    );
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.id !== controllerId && !p.hasLost && !p.hasConceded) {
          return { ...p, life: p.life - amount };
        }
        return p;
      }),
    };
    for (const opp of opponents) {
      events.push(
        createEvent('DAMAGE_DEALT', controllerId, {
          source: 'spell',
          target: opp.id,
          amount,
          type: 'spell',
        })
      );
      events.push(
        createEvent('LIFE_CHANGED', opp.id, {
          newLife: state.players.find((p) => p.id === opp.id)?.life ?? 0,
        })
      );
    }
  } else if (effect.targetType === 'each_player') {
    state = {
      ...state,
      players: state.players.map((p) => {
        if (!p.hasLost && !p.hasConceded) {
          return { ...p, life: p.life - amount };
        }
        return p;
      }),
    };
    for (const p of state.players.filter(
      (p) => !p.hasLost && !p.hasConceded
    )) {
      events.push(
        createEvent('DAMAGE_DEALT', controllerId, {
          source: 'spell',
          target: p.id,
          amount,
          type: 'spell',
        })
      );
      events.push(createEvent('LIFE_CHANGED', p.id, { newLife: p.life }));
    }
  } else {
    // Targeted damage
    for (const targetId of targets) {
      const targetPlayer = state.players.find((p) => p.id === targetId);
      if (targetPlayer) {
        state = {
          ...state,
          players: state.players.map((p) =>
            p.id === targetId ? { ...p, life: p.life - amount } : p
          ),
        };
        events.push(
          createEvent('DAMAGE_DEALT', controllerId, {
            source: 'spell',
            target: targetId,
            amount,
            type: 'spell',
          })
        );
        events.push(
          createEvent('LIFE_CHANGED', targetId, {
            newLife: state.players.find((p) => p.id === targetId)?.life ?? 0,
          })
        );
      } else {
        const targetCard = state.cardInstances.get(targetId);
        if (targetCard && targetCard.zone === 'battlefield') {
          const newCardInstances = new Map(state.cardInstances);
          newCardInstances.set(targetId, {
            ...targetCard,
            damage: targetCard.damage + amount,
          });
          state = { ...state, cardInstances: newCardInstances };
          events.push(
            createEvent('DAMAGE_DEALT', controllerId, {
              source: 'spell',
              target: targetId,
              amount,
              type: 'spell',
              cardName: targetCard.cardData.name,
            })
          );
        }
      }
    }
  }

  return { state, events };
}

function applyDraw(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 1;

  if (effect.targetType === 'self' || !effect.requiresTarget) {
    const result = drawCards(state, controllerId, amount);
    state = result.state;
    events.push(...result.events);
  } else if (effect.targetType === 'player') {
    for (const targetId of targets) {
      const result = drawCards(state, targetId, amount);
      state = result.state;
      events.push(...result.events);
    }
  }

  return { state, events };
}

function applyPump(
  state: GameState,
  effect: SpellEffect,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const powerMod = effect.power || 0;
  const toughnessMod = effect.toughness || 0;
  const newCardInstances = new Map(state.cardInstances);

  for (const targetId of targets) {
    const target = newCardInstances.get(targetId);
    if (!target || target.zone !== 'battlefield') continue;

    const basePower = parseInt(target.cardData.power || '0', 10);
    const baseToughness = parseInt(target.cardData.toughness || '0', 10);
    const currentPower = target.modifiedPower ?? basePower;
    const currentToughness = target.modifiedToughness ?? baseToughness;

    newCardInstances.set(targetId, {
      ...target,
      modifiedPower: currentPower + powerMod,
      modifiedToughness: currentToughness + toughnessMod,
    });
  }

  return { state: { ...state, cardInstances: newCardInstances }, events };
}

function applyGainLife(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 0;
  state = {
    ...state,
    players: state.players.map((p) =>
      p.id === controllerId ? { ...p, life: p.life + amount } : p
    ),
  };
  events.push(
    createEvent('LIFE_CHANGED', controllerId, {
      newLife: state.players.find((p) => p.id === controllerId)?.life ?? 0,
      reason: 'gain_life',
    })
  );
  return { state, events };
}

function applyLoseLife(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 0;

  if (effect.targetType === 'each_opponent') {
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.id !== controllerId && !p.hasLost && !p.hasConceded) {
          return { ...p, life: p.life - amount };
        }
        return p;
      }),
    };
    for (const p of state.players.filter(
      (p) => p.id !== controllerId && !p.hasLost && !p.hasConceded
    )) {
      events.push(
        createEvent('LIFE_CHANGED', p.id, {
          newLife: p.life,
          reason: 'lose_life',
        })
      );
    }
  } else {
    for (const targetId of targets) {
      state = {
        ...state,
        players: state.players.map((p) =>
          p.id === targetId ? { ...p, life: p.life - amount } : p
        ),
      };
      events.push(
        createEvent('LIFE_CHANGED', targetId, {
          newLife: state.players.find((p) => p.id === targetId)?.life ?? 0,
          reason: 'lose_life',
        })
      );
    }
  }

  return { state, events };
}

function applyDiscard(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 1;

  const playerIds =
    effect.targetType === 'each_opponent'
      ? state.players
          .filter((p) => p.id !== controllerId && !p.hasLost && !p.hasConceded)
          .map((p) => p.id)
      : targets;

  for (const playerId of playerIds) {
    const hand = getCardsInZone(state, playerId, 'hand');
    // Discard from end of hand (simplified — no player choice for MVP)
    const toDiscard = hand.slice(0, amount);
    for (const card of toDiscard) {
      const moveResult = moveCard(state, card.instanceId, 'graveyard');
      state = moveResult.state;
      events.push(
        createEvent('CARD_DESTROYED', playerId, {
          cardInstanceId: card.instanceId,
          cardName: card.cardData.name,
          reason: 'discard',
        })
      );
    }
  }

  return { state, events };
}

function applyCounterSpell(
  state: GameState,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];

  for (const targetStackItemId of targets) {
    const stackIndex = state.stack.findIndex(
      (item) => item.id === targetStackItemId
    );
    if (stackIndex === -1) continue;

    const item = state.stack[stackIndex];
    const newStack = state.stack.filter((_, i) => i !== stackIndex);
    state = { ...state, stack: newStack };

    // Move countered card to graveyard
    const moveResult = moveCard(state, item.sourceInstanceId, 'graveyard');
    state = moveResult.state;

    events.push(
      createEvent('SPELL_COUNTERED', controllerId, {
        cardInstanceId: item.sourceInstanceId,
        cardName: item.cardData?.name || 'Unknown',
      })
    );
  }

  return { state, events };
}

function applyDestroyAll(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const filter = effect.filter || 'creatures';
  const toDestroy: string[] = [];

  for (const [id, card] of state.cardInstances) {
    if (card.zone !== 'battlefield') continue;
    const typeLine = card.cardData.typeLine.toLowerCase();
    if (filter === 'creatures' && typeLine.includes('creature'))
      toDestroy.push(id);
    else if (filter === 'permanents') toDestroy.push(id);
    else if (filter === 'nonland permanents' && !typeLine.includes('land'))
      toDestroy.push(id);
    else if (filter === 'artifacts' && typeLine.includes('artifact'))
      toDestroy.push(id);
    else if (filter === 'enchantments' && typeLine.includes('enchantment'))
      toDestroy.push(id);
  }

  for (const id of toDestroy) {
    const card = state.cardInstances.get(id);
    if (!card) continue;
    const moveResult = moveCard(state, id, 'graveyard');
    state = moveResult.state;
    events.push(
      createEvent('CARD_DESTROYED', controllerId, {
        cardInstanceId: id,
        cardName: card.cardData.name,
        reason: 'destroy_all',
      })
    );
  }

  return { state, events };
}

function applyExileAll(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const filter = effect.filter || 'creatures';
  const toExile: string[] = [];

  for (const [id, card] of state.cardInstances) {
    if (card.zone !== 'battlefield') continue;
    const typeLine = card.cardData.typeLine.toLowerCase();
    if (filter === 'creatures' && typeLine.includes('creature'))
      toExile.push(id);
    else if (filter === 'permanents') toExile.push(id);
    else if (filter === 'nonland permanents' && !typeLine.includes('land'))
      toExile.push(id);
    else if (filter === 'artifacts' && typeLine.includes('artifact'))
      toExile.push(id);
    else if (filter === 'enchantments' && typeLine.includes('enchantment'))
      toExile.push(id);
  }

  for (const id of toExile) {
    const card = state.cardInstances.get(id);
    if (!card) continue;
    const moveResult = moveCard(state, id, 'exile');
    state = moveResult.state;
    events.push(
      createEvent('CARD_EXILED', controllerId, {
        cardInstanceId: id,
        cardName: card.cardData.name,
      })
    );
  }

  return { state, events };
}

function applyTap(
  state: GameState,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const newCardInstances = new Map(state.cardInstances);
  for (const targetId of targets) {
    const target = newCardInstances.get(targetId);
    if (!target || target.zone !== 'battlefield' || target.tapped) continue;
    newCardInstances.set(targetId, { ...target, tapped: true });
    events.push(
      createEvent('CARD_TAPPED', controllerId, {
        cardInstanceId: targetId,
        cardName: target.cardData.name,
      })
    );
  }
  return { state: { ...state, cardInstances: newCardInstances }, events };
}

function applyUntap(
  state: GameState,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const newCardInstances = new Map(state.cardInstances);
  for (const targetId of targets) {
    const target = newCardInstances.get(targetId);
    if (!target || target.zone !== 'battlefield' || !target.tapped) continue;
    newCardInstances.set(targetId, { ...target, tapped: false });
    events.push(
      createEvent('CARD_UNTAPPED', controllerId, {
        cardInstanceId: targetId,
        cardName: target.cardData.name,
      })
    );
  }
  return { state: { ...state, cardInstances: newCardInstances }, events };
}

function applyCreateToken(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const count = effect.amount || 1;
  const power = effect.power || 1;
  const toughness = effect.toughness || 1;
  const tokenName = effect.tokenName || 'Token';
  const colors: ManaColor[] = (effect.tokenColors || [])
    .map((c) => {
      const colorMap: Record<string, ManaColor> = {
        white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G',
      };
      return colorMap[c.toLowerCase()];
    })
    .filter((c): c is ManaColor => !!c);

  let newState = state;

  for (let i = 0; i < count; i++) {
    // Create a synthetic CardData for the token
    const tokenCardData: CardData = {
      scryfallId: `token_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      oracleId: '',
      name: tokenName,
      manaCost: '',
      cmc: 0,
      typeLine: `Token Creature — ${tokenName}`,
      oracleText: '',
      colors,
      colorIdentity: colors,
      keywords: effect.tokenKeywords || [],
      power: String(power),
      toughness: String(toughness),
      layout: 'token',
      legalities: {},
    };

    const instance = createCardInstance(tokenCardData, controllerId, 'battlefield');

    // Add token to cardInstances and battlefield zone
    const newCardInstances = new Map(newState.cardInstances);
    newCardInstances.set(instance.instanceId, { ...instance, controllerId });
    const zoneKey = getZoneKey('battlefield', controllerId);
    const newZones = new Map(newState.zones);
    const zone = newZones.get(zoneKey);
    if (zone) {
      newZones.set(zoneKey, { ...zone, cards: [...zone.cards, instance.instanceId] });
    }
    newState = { ...newState, cardInstances: newCardInstances, zones: newZones };

    events.push(
      createEvent('ZONE_TRANSFER', controllerId, {
        cardInstanceId: instance.instanceId,
        cardName: tokenName,
        toZone: 'battlefield',
        isToken: true,
        power,
        toughness,
      })
    );
  }

  return { state: newState, events };
}

function applyAddCounter(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 1;
  const counterType = effect.counterType || '+1/+1';
  const newCardInstances = new Map(state.cardInstances);

  // Determine which cards get counters
  let targetIds = targets;
  if (effect.targetType === 'self') {
    // "Put a +1/+1 counter on ~" — find the source card on the stack context
    // For triggered abilities, the source is the card itself
    // We use controllerId's creatures as a fallback — this gets resolved in GameEngine
    targetIds = [];
  }

  for (const targetId of targetIds) {
    const target = newCardInstances.get(targetId);
    if (!target || target.zone !== 'battlefield') continue;

    const currentCounters = target.counters[counterType] || 0;
    newCardInstances.set(targetId, {
      ...target,
      counters: { ...target.counters, [counterType]: currentCounters + amount },
    });

    events.push(
      createEvent('COUNTER_ADDED', controllerId, {
        cardInstanceId: targetId,
        cardName: target.cardData.name,
        counterType,
        amount,
        newTotal: currentCounters + amount,
      })
    );
  }

  return { state: { ...state, cardInstances: newCardInstances }, events };
}

// --- Scry: look at top N, auto-decide keep/bottom (MVP heuristic) ---
function applyScry(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 1;
  const library = getCardsInZone(state, controllerId, 'library');
  if (library.length === 0) return { state, events };

  const scried = library.slice(0, amount);
  const zoneKey = getZoneKey('library', controllerId);
  const zones = new Map(state.zones);
  const libZone = zones.get(zoneKey);
  if (!libZone) return { state, events };

  // Count lands on battlefield
  const landCount = getCardsInZone(state, controllerId, 'battlefield')
    .filter((c) => c.cardData.typeLine.toLowerCase().includes('land')).length;
  const needsLand = landCount < 4;

  // Split into keep-on-top and send-to-bottom
  const keepOnTop: string[] = [];
  const sendToBottom: string[] = [];

  for (const card of scried) {
    const typeLine = card.cardData.typeLine.toLowerCase();
    const isLand = typeLine.includes('land');
    // Keep lands if we need them, keep creatures and spells, bottom excess lands
    if ((isLand && needsLand) || !isLand) {
      keepOnTop.push(card.instanceId);
    } else {
      sendToBottom.push(card.instanceId);
    }
  }

  // Reorder: keepOnTop first, then remaining library, then sendToBottom
  const currentCards = [...libZone.cards];
  const remainingLibrary = currentCards.filter(
    (id) => !keepOnTop.includes(id) && !sendToBottom.includes(id)
  );
  const newCards = [...keepOnTop, ...remainingLibrary, ...sendToBottom];
  zones.set(zoneKey, { ...libZone, cards: newCards });

  const scriedNames = scried.map((c) => c.cardData.name).join(', ');
  const bottomNames = sendToBottom
    .map((id) => state.cardInstances.get(id)?.cardData.name)
    .filter(Boolean)
    .join(', ');

  events.push(
    createEvent('ABILITY_RESOLVED', controllerId, {
      effect: 'scry',
      amount,
      scriedCards: scriedNames,
      bottomedCards: bottomNames || 'none',
    })
  );

  return { state: { ...state, zones }, events };
}

// --- Surveil: like scry but send to graveyard instead of bottom ---
function applySurveil(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 1;
  const library = getCardsInZone(state, controllerId, 'library');
  if (library.length === 0) return { state, events };

  const surveiled = library.slice(0, amount);

  // Heuristic: put lands we don't need into graveyard, keep spells on top
  const landCount = getCardsInZone(state, controllerId, 'battlefield')
    .filter((c) => c.cardData.typeLine.toLowerCase().includes('land')).length;
  const needsLand = landCount < 4;

  let newState = state;
  for (const card of surveiled) {
    const isLand = card.cardData.typeLine.toLowerCase().includes('land');
    // Send to graveyard if we don't need it
    if ((isLand && !needsLand) || (!isLand && card.cardData.cmc > 5)) {
      const moveResult = moveCard(newState, card.instanceId, 'graveyard');
      newState = moveResult.state;
      events.push(
        createEvent('ZONE_TRANSFER', controllerId, {
          cardInstanceId: card.instanceId,
          cardName: card.cardData.name,
          fromZone: 'library',
          toZone: 'graveyard',
          reason: 'surveil',
        })
      );
    }
  }

  events.push(
    createEvent('ABILITY_RESOLVED', controllerId, {
      effect: 'surveil',
      amount,
    })
  );

  return { state: newState, events };
}

// --- Mill: move top N cards from library to graveyard ---
function applyMill(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 1;

  // Determine who gets milled
  const playerIds =
    effect.targetType === 'self' || !effect.requiresTarget
      ? [controllerId]
      : targets.filter((t) => state.players.some((p) => p.id === t));

  let newState = state;
  for (const playerId of playerIds) {
    const library = getCardsInZone(newState, playerId, 'library');
    const toMill = library.slice(0, amount);

    for (const card of toMill) {
      const moveResult = moveCard(newState, card.instanceId, 'graveyard');
      newState = moveResult.state;
      events.push(
        createEvent('ZONE_TRANSFER', playerId, {
          cardInstanceId: card.instanceId,
          cardName: card.cardData.name,
          fromZone: 'library',
          toZone: 'graveyard',
          reason: 'mill',
        })
      );
    }
  }

  return { state: newState, events };
}

// --- Search library for a card and put into hand ---
function applySearchLibrary(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const library = getCardsInZone(state, controllerId, 'library');
  const filter = (effect.searchFilter || 'any').toLowerCase();

  // Find the first matching card in library
  const found = library.find((card) => {
    const typeLine = card.cardData.typeLine.toLowerCase();
    if (filter === 'any') return true;
    if (filter === 'basic land') return typeLine.includes('basic') && typeLine.includes('land');
    if (filter === 'land') return typeLine.includes('land');
    if (filter === 'forest') return typeLine.includes('forest');
    if (filter === 'island') return typeLine.includes('island');
    if (filter === 'mountain') return typeLine.includes('mountain');
    if (filter === 'plains') return typeLine.includes('plains');
    if (filter === 'swamp') return typeLine.includes('swamp');
    return false;
  });

  let newState = state;
  if (found) {
    const moveResult = moveCard(newState, found.instanceId, 'hand');
    newState = moveResult.state;
    events.push(
      createEvent('ZONE_TRANSFER', controllerId, {
        cardInstanceId: found.instanceId,
        cardName: found.cardData.name,
        fromZone: 'library',
        toZone: 'hand',
        reason: 'search',
      })
    );
  }

  // Shuffle library after searching
  newState = shuffleZone(newState, controllerId, 'library');

  return { state: newState, events };
}

// --- Put land from library onto battlefield (ramp) ---
function applyPutLandOntoBattlefield(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const library = getCardsInZone(state, controllerId, 'library');
  const filter = (effect.searchFilter || 'basic land').toLowerCase();

  // Find first matching land
  const found = library.find((card) => {
    const typeLine = card.cardData.typeLine.toLowerCase();
    if (filter === 'basic land') return typeLine.includes('basic') && typeLine.includes('land');
    if (filter === 'land') return typeLine.includes('land');
    if (filter === 'forest') return typeLine.includes('forest');
    if (filter === 'island') return typeLine.includes('island');
    if (filter === 'mountain') return typeLine.includes('mountain');
    if (filter === 'plains') return typeLine.includes('plains');
    if (filter === 'swamp') return typeLine.includes('swamp');
    return false;
  });

  let newState = state;
  if (found) {
    const moveResult = moveCard(newState, found.instanceId, 'battlefield');
    newState = moveResult.state;

    // Land enters tapped (most ramp spells say "tapped")
    const newCardInstances = new Map(newState.cardInstances);
    const landCard = newCardInstances.get(found.instanceId);
    if (landCard) {
      newCardInstances.set(found.instanceId, { ...landCard, tapped: true });
      newState = { ...newState, cardInstances: newCardInstances };
    }

    events.push(
      createEvent('ZONE_TRANSFER', controllerId, {
        cardInstanceId: found.instanceId,
        cardName: found.cardData.name,
        fromZone: 'library',
        toZone: 'battlefield',
        reason: 'ramp',
        entersTapped: true,
      })
    );
  }

  // Shuffle library
  newState = shuffleZone(newState, controllerId, 'library');

  return { state: newState, events };
}

// --- Return card from graveyard ---
function applyReturnFromGraveyard(
  state: GameState,
  effect: SpellEffect,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const destination = (effect.destination || 'hand') as 'hand' | 'battlefield';

  let newState = state;
  if (effect.requiresTarget && targets.length > 0) {
    for (const targetId of targets) {
      const card = newState.cardInstances.get(targetId);
      if (!card || card.zone !== 'graveyard') continue;
      const moveResult = moveCard(newState, targetId, destination);
      newState = moveResult.state;
      events.push(
        createEvent('CARD_RETURNED', controllerId, {
          cardInstanceId: targetId,
          cardName: card.cardData.name,
          fromZone: 'graveyard',
          toZone: destination,
        })
      );
    }
  } else {
    // Non-targeted: pick the best creature from our graveyard (MVP heuristic)
    const graveyard = getCardsInZone(newState, controllerId, 'graveyard');
    const match = graveyard.find((c) => {
      const typeLine = c.cardData.typeLine.toLowerCase();
      if (effect.targetType === 'creature') return typeLine.includes('creature');
      if (effect.targetType === 'artifact') return typeLine.includes('artifact');
      return typeLine.includes('creature') || typeLine.includes('artifact');
    });
    if (match) {
      const moveResult = moveCard(newState, match.instanceId, destination);
      newState = moveResult.state;
      events.push(
        createEvent('CARD_RETURNED', controllerId, {
          cardInstanceId: match.instanceId,
          cardName: match.cardData.name,
          fromZone: 'graveyard',
          toZone: destination,
        })
      );
    }
  }

  return { state: newState, events };
}

// --- Create Treasure tokens ---
function applyCreateTreasure(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const count = effect.amount || 1;
  let newState = state;

  for (let i = 0; i < count; i++) {
    const tokenCardData: CardData = {
      scryfallId: `treasure_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      oracleId: '',
      name: 'Treasure',
      manaCost: '',
      cmc: 0,
      typeLine: 'Token Artifact — Treasure',
      oracleText: '{T}, Sacrifice this artifact: Add one mana of any color.',
      colors: [],
      colorIdentity: [],
      keywords: [],
      layout: 'token',
      legalities: {},
    };

    const instance = createCardInstance(tokenCardData, controllerId, 'battlefield');
    const newCardInstances = new Map(newState.cardInstances);
    newCardInstances.set(instance.instanceId, { ...instance, controllerId });
    const zoneKey = getZoneKey('battlefield', controllerId);
    const newZones = new Map(newState.zones);
    const zone = newZones.get(zoneKey);
    if (zone) {
      newZones.set(zoneKey, { ...zone, cards: [...zone.cards, instance.instanceId] });
    }
    newState = { ...newState, cardInstances: newCardInstances, zones: newZones };

    events.push(
      createEvent('ZONE_TRANSFER', controllerId, {
        cardInstanceId: instance.instanceId,
        cardName: 'Treasure',
        toZone: 'battlefield',
        isToken: true,
      })
    );
  }

  return { state: newState, events };
}

// --- Fight: two creatures deal damage equal to their power to each other ---
function applyFight(
  state: GameState,
  controllerId: string,
  targets: string[]
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (targets.length < 2) return { state, events };

  const [ours, theirs] = targets;
  const ourCard = state.cardInstances.get(ours);
  const theirCard = state.cardInstances.get(theirs);
  if (!ourCard || !theirCard) return { state, events };
  if (ourCard.zone !== 'battlefield' || theirCard.zone !== 'battlefield') return { state, events };

  const ourPower = getEffectivePower(ourCard, state.cardInstances);
  const theirPower = getEffectivePower(theirCard, state.cardInstances);

  const newCardInstances = new Map(state.cardInstances);

  // Our creature deals damage to theirs
  const theirUpdated = newCardInstances.get(theirs)!;
  newCardInstances.set(theirs, { ...theirUpdated, damage: theirUpdated.damage + ourPower });

  // Their creature deals damage to ours
  const ourUpdated = newCardInstances.get(ours)!;
  newCardInstances.set(ours, { ...ourUpdated, damage: ourUpdated.damage + theirPower });

  events.push(
    createEvent('DAMAGE_DEALT', controllerId, {
      source: ours,
      target: theirs,
      amount: ourPower,
      type: 'fight',
    })
  );
  events.push(
    createEvent('DAMAGE_DEALT', theirCard.controllerId, {
      source: theirs,
      target: ours,
      amount: theirPower,
      type: 'fight',
    })
  );

  return { state: { ...state, cardInstances: newCardInstances }, events };
}

// --- Sacrifice: controller sacrifices a permanent (MVP: auto-pick weakest) ---
function applySacrifice(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const filter = (effect.filter || 'creature').toLowerCase();
  const battlefield = getCardsInZone(state, controllerId, 'battlefield');

  const candidates = battlefield.filter((c) => {
    const typeLine = c.cardData.typeLine.toLowerCase();
    if (filter === 'creature') return typeLine.includes('creature');
    if (filter === 'artifact') return typeLine.includes('artifact');
    if (filter === 'enchantment') return typeLine.includes('enchantment');
    return true;
  });

  if (candidates.length === 0) return { state, events };

  // Pick the weakest (lowest CMC)
  const toSacrifice = candidates.reduce((weakest, card) =>
    card.cardData.cmc < weakest.cardData.cmc ? card : weakest
  );

  const moveResult = moveCard(state, toSacrifice.instanceId, 'graveyard');
  events.push(
    createEvent('CARD_DESTROYED', controllerId, {
      cardInstanceId: toSacrifice.instanceId,
      cardName: toSacrifice.cardData.name,
      reason: 'sacrifice',
    })
  );

  return { state: moveResult.state, events };
}

// --- Each player/opponent draws cards ---
function applyEachDraw(
  state: GameState,
  effect: SpellEffect,
  controllerId: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const amount = effect.amount || 1;
  let newState = state;

  const playerIds =
    effect.targetType === 'each_opponent'
      ? state.players
          .filter((p) => p.id !== controllerId && !p.hasLost && !p.hasConceded)
          .map((p) => p.id)
      : state.players
          .filter((p) => !p.hasLost && !p.hasConceded)
          .map((p) => p.id);

  for (const playerId of playerIds) {
    const result = drawCards(newState, playerId, amount);
    newState = result.state;
    events.push(...result.events);
  }

  return { state: newState, events };
}
