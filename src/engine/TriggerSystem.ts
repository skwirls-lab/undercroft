// ============================================================
// Trigger System — Parses and resolves triggered abilities
// ============================================================

import type { CardInstance, CardData, GameState, GameEvent, StackItem } from './types';
import { parseSpellEffects, type SpellEffect } from './SpellEffectParser';

// --- Trigger Types ---

export type TriggerCondition =
  | 'etb_self'          // When THIS enters the battlefield
  | 'etb_other'         // When ANOTHER creature enters the battlefield under your control
  | 'dies_self'         // When THIS creature dies
  | 'dies_other'        // When another creature you control dies
  | 'attacks_self'      // When THIS creature attacks
  | 'deals_damage_self' // When THIS creature deals damage
  | 'cast_spell'        // When you cast a spell
  | 'upkeep'            // At the beginning of your upkeep
  | 'end_step';         // At the beginning of your end step

export interface ParsedTrigger {
  condition: TriggerCondition;
  effects: SpellEffect[];
  effectText: string;  // Raw effect text for display
}

// --- Oracle Text Trigger Parsing ---

/**
 * Parse oracle text for triggered abilities.
 * Returns an array of parsed triggers found in the text.
 */
export function parseTriggers(oracleText: string): ParsedTrigger[] {
  if (!oracleText) return [];
  const text = oracleText.toLowerCase();
  const triggers: ParsedTrigger[] = [];

  // --- ETB Self: "When ~ enters the battlefield" or "When ~ enters" ---
  const etbSelfRe = /when (?:~|this creature|this permanent|it) enters(?: the battlefield)?[,.]?\s*(.+?)(?:\.|$)/i;
  const etbSelfMatch = text.match(etbSelfRe);
  if (etbSelfMatch) {
    const effectText = etbSelfMatch[1].trim();
    const effects = parseETBEffectText(effectText);
    if (effects.length > 0) {
      triggers.push({ condition: 'etb_self', effects, effectText });
    }
  }

  // --- Dies Self: "When ~ dies" ---
  const diesSelfRe = /when (?:~|this creature|this permanent|it) dies[,.]?\s*(.+?)(?:\.|$)/i;
  const diesSelfMatch = text.match(diesSelfRe);
  if (diesSelfMatch) {
    const effectText = diesSelfMatch[1].trim();
    const effects = parseETBEffectText(effectText);
    if (effects.length > 0) {
      triggers.push({ condition: 'dies_self', effects, effectText });
    }
  }

  // --- ETB Other: "Whenever a creature enters the battlefield under your control" ---
  const etbOtherRe = /whenever (?:a|another) creature enters(?: the battlefield)?[^,.]*(?: under your control)?[,.]?\s*(.+?)(?:\.|$)/i;
  const etbOtherMatch = text.match(etbOtherRe);
  if (etbOtherMatch) {
    const effectText = etbOtherMatch[1].trim();
    const effects = parseETBEffectText(effectText);
    if (effects.length > 0) {
      triggers.push({ condition: 'etb_other', effects, effectText });
    }
  }

  // --- Dies Other: "Whenever a creature you control dies" / "Whenever another creature dies" ---
  const diesOtherRe = /whenever (?:a|another) creature (?:you control )?dies[,.]?\s*(.+?)(?:\.|$)/i;
  const diesOtherMatch = text.match(diesOtherRe);
  if (diesOtherMatch) {
    const effectText = diesOtherMatch[1].trim();
    const effects = parseETBEffectText(effectText);
    if (effects.length > 0) {
      triggers.push({ condition: 'dies_other', effects, effectText });
    }
  }

  return triggers;
}

/**
 * Parse the effect portion of a triggered ability.
 * This handles common patterns like "draw a card", "each opponent loses 1 life",
 * "you gain 1 life", "create a 1/1 token", etc.
 */
function parseETBEffectText(effectText: string): SpellEffect[] {
  const effects: SpellEffect[] = [];
  const text = effectText.toLowerCase();

  // "draw a card" / "draw two cards"
  const drawRe = /(?:you )?draw (\d+|a|an|one|two|three|four|five) cards?/;
  const drawMatch = text.match(drawRe);
  if (drawMatch) {
    effects.push({
      type: 'draw',
      amount: parseWordNum(drawMatch[1]),
      targetType: 'self',
      requiresTarget: false,
    });
  }

  // "you gain N life"
  const gainLifeRe = /(?:you )?gain (\d+) life/;
  const gainLifeMatch = text.match(gainLifeRe);
  if (gainLifeMatch) {
    effects.push({
      type: 'gain_life',
      amount: parseInt(gainLifeMatch[1], 10),
      targetType: 'self',
      requiresTarget: false,
    });
  }

  // "each opponent loses N life"
  const loseLifeRe = /each opponent loses (\d+) life/;
  const loseLifeMatch = text.match(loseLifeRe);
  if (loseLifeMatch) {
    effects.push({
      type: 'lose_life',
      amount: parseInt(loseLifeMatch[1], 10),
      targetType: 'each_opponent',
      requiresTarget: false,
    });
  }

  // "target player loses N life"
  const targetLoseRe = /target (?:player|opponent) loses (\d+) life/;
  const targetLoseMatch = text.match(targetLoseRe);
  if (targetLoseMatch) {
    effects.push({
      type: 'lose_life',
      amount: parseInt(targetLoseMatch[1], 10),
      targetType: 'player',
      requiresTarget: true,
    });
  }

  // "deals N damage to any target / target creature / each opponent"
  const damageRe = /deals? (\d+) damage to (any target|target creature|target player|target creature or player|each opponent|each player|each creature)/;
  const damageMatch = text.match(damageRe);
  if (damageMatch) {
    const amount = parseInt(damageMatch[1], 10);
    const target = damageMatch[2];
    let targetType: SpellEffect['targetType'] = 'any';
    let requiresTarget = true;
    if (target === 'target creature') targetType = 'creature';
    else if (target === 'target player') targetType = 'player';
    else if (target === 'each opponent') { targetType = 'each_opponent'; requiresTarget = false; }
    else if (target === 'each player') { targetType = 'each_player'; requiresTarget = false; }
    effects.push({ type: 'damage', targetType, amount, requiresTarget });
  }

  // "destroy target creature/permanent"
  const destroyRe = /destroy target (creature|permanent|artifact|enchantment)/;
  const destroyMatch = text.match(destroyRe);
  if (destroyMatch) {
    effects.push({
      type: 'destroy',
      targetType: destroyMatch[1] === 'permanent' ? 'permanent' : destroyMatch[1] as SpellEffect['targetType'],
      requiresTarget: true,
    });
  }

  // "exile target creature/permanent"
  const exileRe = /exile target (creature|permanent|artifact|enchantment)/;
  const exileMatch = text.match(exileRe);
  if (exileMatch) {
    effects.push({
      type: 'exile',
      targetType: exileMatch[1] === 'permanent' ? 'permanent' : exileMatch[1] as SpellEffect['targetType'],
      requiresTarget: true,
    });
  }

  // "return target creature to its owner's hand"
  const bounceRe = /return target (creature|permanent|nonland permanent) to its owner's hand/;
  const bounceMatch = text.match(bounceRe);
  if (bounceMatch) {
    effects.push({
      type: 'bounce',
      targetType: bounceMatch[1] === 'permanent' || bounceMatch[1] === 'nonland permanent' ? 'permanent' : 'creature',
      requiresTarget: true,
    });
  }

  // "target creature gets +X/+Y until end of turn"
  const pumpRe = /target creature gets ([+-]\d+)\/([+-]\d+)/;
  const pumpMatch = text.match(pumpRe);
  if (pumpMatch) {
    effects.push({
      type: 'pump',
      targetType: 'creature',
      power: parseInt(pumpMatch[1], 10),
      toughness: parseInt(pumpMatch[2], 10),
      duration: 'until_end_of_turn',
      requiresTarget: true,
    });
  }

  // "create a N/N ... token" — handled separately in token system
  const tokenRe = /creates? (?:a |an |(\d+) )?(\d+)\/(\d+)/;
  const tokenMatch = text.match(tokenRe);
  if (tokenMatch) {
    effects.push({
      type: 'create_token' as SpellEffect['type'],
      amount: tokenMatch[1] ? parseInt(tokenMatch[1], 10) : 1,
      power: parseInt(tokenMatch[2], 10),
      toughness: parseInt(tokenMatch[3], 10),
      requiresTarget: false,
    } as SpellEffect);
  }

  // "put a +1/+1 counter on" (target creature or ~)
  const counterRe = /put (?:a |an |(\d+) )\+1\/\+1 counters? on/;
  const counterMatch = text.match(counterRe);
  if (counterMatch) {
    effects.push({
      type: 'add_counter' as SpellEffect['type'],
      amount: counterMatch[1] ? parseInt(counterMatch[1], 10) : 1,
      requiresTarget: text.includes('target'),
      targetType: text.includes('target') ? 'creature' : 'self',
    } as SpellEffect);
  }

  // "each opponent discards a card"
  const discardRe = /each opponent discards (\d+|a|an|one|two) cards?/;
  const discardMatch = text.match(discardRe);
  if (discardMatch) {
    effects.push({
      type: 'discard',
      amount: parseWordNum(discardMatch[1]),
      targetType: 'each_opponent',
      requiresTarget: false,
    });
  }

  // "target player discards a card"
  const targetDiscardRe = /target (?:player|opponent) discards (\d+|a|an|one|two) cards?/;
  const targetDiscardMatch = text.match(targetDiscardRe);
  if (targetDiscardMatch) {
    effects.push({
      type: 'discard',
      amount: parseWordNum(targetDiscardMatch[1]),
      targetType: 'player',
      requiresTarget: true,
    });
  }

  return effects;
}

const WORD_NUMS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
};
function parseWordNum(s: string): number {
  return WORD_NUMS[s] || parseInt(s, 10) || 1;
}

// --- Trigger Checking ---

/**
 * Check for ETB triggers when a card enters the battlefield.
 * Returns StackItems for any triggered abilities that should go on the stack.
 */
export function checkETBTriggers(
  state: GameState,
  enteredCard: CardInstance,
  stackIdGenerator: () => string
): StackItem[] {
  const stackItems: StackItem[] = [];

  // 1. Check the entering card itself for ETB self triggers
  const selfTriggers = parseTriggers(enteredCard.cardData.oracleText);
  for (const trigger of selfTriggers) {
    if (trigger.condition === 'etb_self') {
      // Non-targeted ETB effects resolve immediately as a triggered ability on stack
      stackItems.push({
        id: stackIdGenerator(),
        type: 'ability',
        sourceInstanceId: enteredCard.instanceId,
        controllerId: enteredCard.controllerId,
        cardData: enteredCard.cardData,
        targets: [], // Targeted triggers would need target selection — MVP: auto-select or skip
        xValue: undefined,
      });
    }
  }

  // 2. Check other permanents on the battlefield for "whenever a creature enters" triggers
  if (enteredCard.cardData.typeLine.toLowerCase().includes('creature')) {
    for (const [id, card] of state.cardInstances) {
      if (id === enteredCard.instanceId) continue;
      if (card.zone !== 'battlefield') continue;
      const triggers = parseTriggers(card.cardData.oracleText);
      for (const trigger of triggers) {
        if (trigger.condition === 'etb_other' && card.controllerId === enteredCard.controllerId) {
          stackItems.push({
            id: stackIdGenerator(),
            type: 'ability',
            sourceInstanceId: card.instanceId,
            controllerId: card.controllerId,
            cardData: card.cardData,
            targets: [],
            xValue: undefined,
          });
        }
      }
    }
  }

  return stackItems;
}

/**
 * Check for death triggers when a card goes to the graveyard from the battlefield.
 * Returns StackItems for any triggered abilities that should go on the stack.
 */
export function checkDeathTriggers(
  state: GameState,
  diedCard: CardInstance,
  stackIdGenerator: () => string
): StackItem[] {
  const stackItems: StackItem[] = [];

  // Only creature deaths trigger "dies" abilities
  if (!diedCard.cardData.typeLine.toLowerCase().includes('creature')) return stackItems;

  // 1. Check the dying card itself for "When ~ dies" triggers
  const selfTriggers = parseTriggers(diedCard.cardData.oracleText);
  for (const trigger of selfTriggers) {
    if (trigger.condition === 'dies_self') {
      stackItems.push({
        id: stackIdGenerator(),
        type: 'ability',
        sourceInstanceId: diedCard.instanceId,
        controllerId: diedCard.controllerId,
        cardData: diedCard.cardData,
        targets: [],
        xValue: undefined,
      });
    }
  }

  // 2. Check other permanents for "whenever a creature you control dies" triggers
  for (const [id, card] of state.cardInstances) {
    if (id === diedCard.instanceId) continue;
    if (card.zone !== 'battlefield') continue;
    const triggers = parseTriggers(card.cardData.oracleText);
    for (const trigger of triggers) {
      if (trigger.condition === 'dies_other' && card.controllerId === diedCard.controllerId) {
        stackItems.push({
          id: stackIdGenerator(),
          type: 'ability',
          sourceInstanceId: card.instanceId,
          controllerId: card.controllerId,
          cardData: card.cardData,
          targets: [],
          xValue: undefined,
        });
      }
    }
  }

  return stackItems;
}

/**
 * Resolve a triggered ability's effects.
 * Similar to spell effect resolution but uses the trigger's parsed effects.
 */
export function getTriggeredEffects(cardData: CardData, triggerCondition: TriggerCondition): SpellEffect[] {
  const triggers = parseTriggers(cardData.oracleText);
  for (const trigger of triggers) {
    if (trigger.condition === triggerCondition) {
      return trigger.effects;
    }
  }
  return [];
}
