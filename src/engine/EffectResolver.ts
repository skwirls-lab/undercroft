// ============================================================
// Effect Resolver — Applies parsed spell effects to game state
// ============================================================

import type { GameState, GameEvent, StackItem, CardData, ManaColor } from './types';
import { moveCard } from './ZoneManager';
import { drawCards } from './TurnManager';
import { parseSpellEffects, type SpellEffect } from './SpellEffectParser';
import { getCardsInZone, createCardInstance, getZoneKey } from './GameState';
import { hasIndestructible } from './ActionValidator';

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
