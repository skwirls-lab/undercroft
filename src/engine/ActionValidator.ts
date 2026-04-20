import type { GameState, GameAction, CardInstance } from './types';
import { getCardsInZone, getActivePlayer } from './GameState';
import { isMainPhase, isActivePlayer, hasPriority } from './TurnManager';
import { parseManaCost, canPayManaCost, totalMana, convertedManaCost } from './ManaSystem';
import { getLandProducibleColors, getEffectiveLandCardData, hasManaAbility } from './OracleTextParser';
import { parseSpellEffects, spellRequiresTarget, type TargetType } from './SpellEffectParser';
import { getForgeActivatedAbilities, type ActivatedAbilityCost } from './ForgeLookup';

export function isLand(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('land');
}

export function isCreature(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('creature');
}

export function isInstant(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('instant');
}

export function isSorcery(card: CardInstance): boolean {
  return card.cardData.typeLine.toLowerCase().includes('sorcery');
}

export function hasFlash(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'flash');
}

export function hasHaste(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'haste');
}

export function hasFlying(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'flying');
}

export function hasReach(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'reach');
}

export function hasDefender(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'defender');
}

export function hasDeathtouch(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'deathtouch');
}

export function hasLifelink(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'lifelink');
}

export function hasTrample(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'trample');
}

export function hasFirstStrike(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'first strike');
}

export function hasDoubleStrike(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'double strike');
}

export function hasVigilance(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'vigilance');
}

export function hasHexproof(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'hexproof');
}

export function hasShroud(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'shroud');
}

export function hasIndestructible(card: CardInstance): boolean {
  return card.cardData.keywords.some((k) => k.toLowerCase() === 'indestructible');
}

export function hasWard(card: CardInstance): { has: boolean; cost?: number } {
  const wardKw = card.cardData.keywords.find((k) => k.toLowerCase().startsWith('ward'));
  if (!wardKw) return { has: false };
  const match = wardKw.match(/ward\s*\{?(\d+)\}?/i);
  return { has: true, cost: match ? parseInt(match[1], 10) : 2 };
}

// Parse equip cost from oracle text: "Equip {2}" → 2
export function getEquipCost(card: CardInstance): number | null {
  const match = card.cardData.oracleText.match(/equip\s*\{(\d+)\}/i);
  if (match) return parseInt(match[1], 10);
  const match2 = card.cardData.oracleText.match(/equip\s+(\d+)/i);
  if (match2) return parseInt(match2[1], 10);
  return null;
}

// Parse equipment P/T bonus: "Equipped creature gets +X/+Y" → [X, Y]
export function getEquipmentBonus(card: CardInstance): { power: number; toughness: number } | null {
  const match = card.cardData.oracleText.match(/equipped creature gets ([+-]\d+)\/([+-]\d+)/i);
  if (!match) return null;
  return { power: parseInt(match[1], 10), toughness: parseInt(match[2], 10) };
}

export function isEquipment(card: CardInstance): boolean {
  const typeLine = card.cardData.typeLine.toLowerCase();
  return typeLine.includes('equipment') || getEquipCost(card) !== null;
}

// Effective P/T including +1/+1 counters, pump effects, and equipment bonuses
export function getEffectivePower(card: CardInstance, allCards?: Map<string, CardInstance>): number {
  const base = parseInt(card.cardData.power || '0', 10);
  const counters = card.counters['+1/+1'] || 0;
  const pump = card.modifiedPower || 0;
  let equipBonus = 0;
  if (allCards && card.attachments.length > 0) {
    for (const attachId of card.attachments) {
      const attachment = allCards.get(attachId);
      if (attachment) {
        const bonus = getEquipmentBonus(attachment);
        if (bonus) equipBonus += bonus.power;
      }
    }
  }
  return base + counters + pump + equipBonus;
}

export function getEffectiveToughness(card: CardInstance, allCards?: Map<string, CardInstance>): number {
  const base = parseInt(card.cardData.toughness || '0', 10);
  const counters = card.counters['+1/+1'] || 0;
  const pump = card.modifiedToughness || 0;
  let equipBonus = 0;
  if (allCards && card.attachments.length > 0) {
    for (const attachId of card.attachments) {
      const attachment = allCards.get(attachId);
      if (attachment) {
        const bonus = getEquipmentBonus(attachment);
        if (bonus) equipBonus += bonus.toughness;
      }
    }
  }
  return base + counters + pump + equipBonus;
}

export function canAttack(card: CardInstance): boolean {
  if (!isCreature(card)) return false;
  if (card.tapped) return false;
  if (hasDefender(card)) return false;
  if (card.summoningSick && !hasHaste(card)) return false;
  return true;
}

export function canBlock(card: CardInstance): boolean {
  if (!isCreature(card)) return false;
  if (card.tapped) return false;
  return true;
}

/**
 * Check if a specific blocker can legally block a specific attacker.
 * Enforces flying/reach rules.
 */
export function canBlockAttacker(blocker: CardInstance, attacker: CardInstance): boolean {
  if (!canBlock(blocker)) return false;
  // Flying creatures can only be blocked by creatures with flying or reach
  if (hasFlying(attacker) && !hasFlying(blocker) && !hasReach(blocker)) return false;
  return true;
}

// Check if a permanent can be targeted by a given player
function canBeTargeted(card: CardInstance, byPlayerId: string): boolean {
  // Shroud: can't be targeted by anyone
  if (hasShroud(card)) return false;
  // Hexproof: can't be targeted by opponents (controller can still target)
  if (hasHexproof(card) && card.controllerId !== byPlayerId) return false;
  return true;
}

// Get valid targets for a spell effect's target type
function getValidTargets(
  state: GameState,
  casterId: string,
  targetType: TargetType
): string[] {
  const targets: string[] = [];

  if (targetType === 'creature') {
    for (const [id, card] of state.cardInstances) {
      if (card.zone === 'battlefield' && card.cardData.typeLine.toLowerCase().includes('creature') && canBeTargeted(card, casterId)) {
        targets.push(id);
      }
    }
  } else if (targetType === 'permanent') {
    for (const [id, card] of state.cardInstances) {
      if (card.zone === 'battlefield' && canBeTargeted(card, casterId)) targets.push(id);
    }
  } else if (targetType === 'artifact') {
    for (const [id, card] of state.cardInstances) {
      if (card.zone === 'battlefield' && card.cardData.typeLine.toLowerCase().includes('artifact') && canBeTargeted(card, casterId)) {
        targets.push(id);
      }
    }
  } else if (targetType === 'enchantment') {
    for (const [id, card] of state.cardInstances) {
      if (card.zone === 'battlefield' && card.cardData.typeLine.toLowerCase().includes('enchantment') && canBeTargeted(card, casterId)) {
        targets.push(id);
      }
    }
  } else if (targetType === 'planeswalker') {
    for (const [id, card] of state.cardInstances) {
      if (card.zone === 'battlefield' && card.cardData.typeLine.toLowerCase().includes('planeswalker') && canBeTargeted(card, casterId)) {
        targets.push(id);
      }
    }
  } else if (targetType === 'player') {
    for (const p of state.players) {
      if (!p.hasLost && !p.hasConceded && p.id !== casterId) {
        targets.push(p.id);
      }
    }
  } else if (targetType === 'any') {
    // Any target = any creature on battlefield or any player
    for (const [id, card] of state.cardInstances) {
      if (card.zone === 'battlefield' && card.cardData.typeLine.toLowerCase().includes('creature') && canBeTargeted(card, casterId)) {
        targets.push(id);
      }
    }
    for (const p of state.players) {
      if (!p.hasLost && !p.hasConceded) targets.push(p.id);
    }
  } else if (targetType === 'spell') {
    // Target a spell on the stack
    for (const item of state.stack) {
      if (item.controllerId !== casterId) {
        targets.push(item.id);
      }
    }
  }

  return targets;
}

// Generate CAST_SPELL actions for a card, handling targeting
function generateCastActions(
  state: GameState,
  playerId: string,
  card: CardInstance,
  fromZone: string | undefined,
  now: number
): GameAction[] {
  const actions: GameAction[] = [];
  const oracleText = card.cardData.oracleText || '';
  const effects = parseSpellEffects(oracleText);
  const targetedEffects = effects.filter((e) => e.requiresTarget);

  if (targetedEffects.length === 0) {
    // Non-targeted spell — single action
    actions.push({
      type: 'CAST_SPELL',
      playerId,
      payload: {
        cardInstanceId: card.instanceId,
        ...(fromZone ? { fromZone } : {}),
        targets: [],
      },
      timestamp: now,
    });
  } else {
    // Targeted spell — one action per valid target
    // Use the first targeted effect's target type to determine valid targets
    const primaryTargetType = targetedEffects[0].targetType!;
    const validTargets = getValidTargets(state, playerId, primaryTargetType);

    for (const targetId of validTargets) {
      actions.push({
        type: 'CAST_SPELL',
        playerId,
        payload: {
          cardInstanceId: card.instanceId,
          ...(fromZone ? { fromZone } : {}),
          targets: [targetId],
          targetId, // convenience field for UI
        },
        timestamp: now,
      });
    }
  }

  return actions;
}

export function getLegalActions(state: GameState, playerId: string): GameAction[] {
  const actions: GameAction[] = [];
  const now = Date.now();

  if (state.isGameOver) return actions;

  // If there's a pending choice, the only action available is RESOLVE_CHOICE
  if (state.pendingChoice && state.pendingChoice.playerId === playerId) {
    // No actions are generated here — the UI reads pendingChoice directly
    // and sends a RESOLVE_CHOICE action with the player's selection
    return actions;
  }

  if (!hasPriority(state, playerId)) return actions;

  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.hasLost || player.hasConceded) return actions;

  // Always can pass priority
  actions.push({
    type: 'PASS_PRIORITY',
    playerId,
    payload: {},
    timestamp: now,
  });

  // Always can concede
  actions.push({
    type: 'CONCEDE',
    playerId,
    payload: {},
    timestamp: now,
  });

  const hand = getCardsInZone(state, playerId, 'hand');
  const isActive = isActivePlayer(state, playerId);
  const isMain = isMainPhase(state);
  const stackEmpty = state.stack.length === 0;
  const canCastSorcerySpeed = isActive && isMain && stackEmpty;

  // Play land (sorcery speed, stack must be empty)
  if (canCastSorcerySpeed && !player.landPlayedThisTurn) {
    for (const card of hand) {
      if (isLand(card)) {
        actions.push({
          type: 'PLAY_LAND',
          playerId,
          payload: { cardInstanceId: card.instanceId },
          timestamp: now,
        });
      }
    }
  }

  // Cast spells from hand
  for (const card of hand) {
    if (isLand(card)) continue;

    const cost = parseManaCost(card.cardData.manaCost);
    const canAfford = canPayManaCost(player.manaPool, cost);
    if (!canAfford) continue;

    if (isInstant(card) || hasFlash(card)) {
      // Instants and flash can be cast anytime with priority
      actions.push(...generateCastActions(state, playerId, card, undefined, now));
    } else if (canCastSorcerySpeed) {
      // Sorcery-speed spells (creatures, sorceries, enchantments, artifacts, planeswalkers)
      actions.push(...generateCastActions(state, playerId, card, undefined, now));
    }
  }

  // Cast commander from command zone (sorcery speed + commander tax)
  if (canCastSorcerySpeed) {
    const commandZone = getCardsInZone(state, playerId, 'command');
    for (const card of commandZone) {
      const baseCost = parseManaCost(card.cardData.manaCost);
      const castCount = player.commanderCastCount[card.instanceId] || 0;
      const taxedCost = { ...baseCost, generic: baseCost.generic + castCount * 2 };
      const canAfford = canPayManaCost(player.manaPool, taxedCost);
      if (canAfford) {
        actions.push(...generateCastActions(state, playerId, card, 'command', now));
      }
    }
  }

  // Tap lands for mana (mana abilities don't use the stack — always available)
  // Only lands with actual mana abilities (e.g. NOT Fabled Passage, fetch lands, etc.)
  const battlefield = getCardsInZone(state, playerId, 'battlefield');
  for (const card of battlefield) {
    if (isLand(card) && !card.tapped) {
      const effectiveData = getEffectiveLandCardData(card);
      if (!hasManaAbility(effectiveData)) continue;
      const producible = getLandProducibleColors(effectiveData);
      if (producible.length === 0) continue;
      for (const color of producible) {
        actions.push({
          type: 'TAP_FOR_MANA',
          playerId,
          payload: { cardInstanceId: card.instanceId, manaColor: color },
          timestamp: now,
        });
      }
    }
  }

  // Untap permanents (undo accidental taps)
  for (const card of battlefield) {
    if (card.tapped && isLand(card)) {
      actions.push({
        type: 'UNTAP_PERMANENT',
        playerId,
        payload: { cardInstanceId: card.instanceId },
        timestamp: now,
      });
    }
  }

  // Equip equipment (sorcery speed)
  if (canCastSorcerySpeed) {
    for (const card of battlefield) {
      if (!isEquipment(card)) continue;
      const equipCost = getEquipCost(card);
      if (equipCost === null) continue;

      // Check if player can pay generic equip cost
      const totalMana = Object.values(player.manaPool).reduce((sum, v) => sum + v, 0);
      if (totalMana < equipCost) continue;

      // Generate one equip action per valid target creature you control
      const myCreatures = battlefield.filter(
        (c) => isCreature(c) && c.controllerId === playerId && c.instanceId !== card.attachedTo
      );
      for (const target of myCreatures) {
        actions.push({
          type: 'ACTIVATE_ABILITY',
          playerId,
          payload: {
            cardInstanceId: card.instanceId,
            ability: 'equip',
            targetId: target.instanceId,
            equipCost,
          },
          timestamp: now,
        });
      }
    }
  }

  // Forge-powered activated abilities (non-mana, non-equip)
  // These are available at instant speed unless they require tap on a summoning-sick creature
  for (const card of battlefield) {
    if (card.controllerId !== playerId) continue;
    const forgeAbilities = getForgeActivatedAbilities(card.cardData.name);
    if (!forgeAbilities) continue;

    for (let abilityIdx = 0; abilityIdx < forgeAbilities.length; abilityIdx++) {
      const ab = forgeAbilities[abilityIdx];
      const cost = ab.cost;

      // Skip abilities with no effects (we can't execute them yet)
      if (ab.effects.length === 0) continue;

      // Check tap cost: card must be untapped + not summoning-sick for creatures
      if (cost.tap && card.tapped) continue;
      if (cost.tap && isCreature(card) && card.summoningSick) continue;

      // Check mana affordability
      if (!canPayManaCost(player.manaPool, cost.manaCost)) continue;

      // Check life payment
      if (cost.lifePayment > 0 && player.life <= cost.lifePayment) continue;

      // Check sacrifice self: card must still be on battlefield (always true here)
      // Check sacrifice other: must have a valid permanent to sacrifice
      if (cost.sacrificeType && cost.sacrificeCount > 0) {
        const sacType = cost.sacrificeType.toLowerCase();
        const sacCandidates = battlefield.filter(c =>
          c.controllerId === playerId &&
          c.instanceId !== card.instanceId &&
          c.cardData.typeLine.toLowerCase().includes(sacType)
        );
        if (sacCandidates.length < cost.sacrificeCount) continue;
      }

      // Check discard cost
      if (cost.discardCount > 0) {
        const hand = getCardsInZone(state, playerId, 'hand');
        if (hand.length < cost.discardCount) continue;
      }

      // Generate action(s)
      if (ab.requiresTarget) {
        // For targeted abilities, generate one action per valid target
        // MVP: target creatures on battlefield
        const validTargets = battlefield.filter(c => {
          if (ab.effects[0]?.targetType === 'creature') return isCreature(c);
          if (ab.effects[0]?.targetType === 'permanent') return true;
          if (ab.effects[0]?.targetType === 'player') return false;
          return true;
        });
        // Also add player targets for damage abilities
        const playerTargets: string[] = [];
        if (ab.effects.some(e => e.type === 'damage' && (e.targetType === 'any' || e.targetType === 'player'))) {
          for (const p of state.players) {
            if (!p.hasLost && !p.hasConceded) playerTargets.push(p.id);
          }
        }
        for (const target of validTargets) {
          actions.push({
            type: 'ACTIVATE_ABILITY',
            playerId,
            payload: {
              cardInstanceId: card.instanceId,
              ability: 'forge_activated',
              abilityIndex: abilityIdx,
              targetId: target.instanceId,
              forgeCost: cost,
              forgeEffects: ab.effects,
            },
            timestamp: now,
          });
        }
        for (const targetPlayerId of playerTargets) {
          actions.push({
            type: 'ACTIVATE_ABILITY',
            playerId,
            payload: {
              cardInstanceId: card.instanceId,
              ability: 'forge_activated',
              abilityIndex: abilityIdx,
              targetId: targetPlayerId,
              forgeCost: cost,
              forgeEffects: ab.effects,
            },
            timestamp: now,
          });
        }
      } else {
        // Non-targeted ability
        actions.push({
          type: 'ACTIVATE_ABILITY',
          playerId,
          payload: {
            cardInstanceId: card.instanceId,
            ability: 'forge_activated',
            abilityIndex: abilityIdx,
            forgeCost: cost,
            forgeEffects: ab.effects,
          },
          timestamp: now,
        });
      }
    }
  }

  // Declare attackers (active player, declare attackers step, stack empty)
  if (
    isActive &&
    state.turn.phase === 'combat' &&
    state.turn.step === 'declare_attackers' &&
    !state.combat &&
    stackEmpty
  ) {
    const eligibleAttackers = battlefield.filter(canAttack);
    actions.push({
      type: 'DECLARE_ATTACKERS',
      playerId,
      payload: {
        eligibleAttackerIds: eligibleAttackers.map((c) => c.instanceId),
      },
      timestamp: now,
    });
  }

  // Declare blockers (defending player, declare blockers step, stack empty)
  if (
    state.turn.phase === 'combat' &&
    state.turn.step === 'declare_blockers' &&
    state.combat &&
    !isActive &&
    stackEmpty
  ) {
    const isDefending = state.combat.attackers.some(
      (a) => a.defendingPlayerId === playerId
    );
    if (isDefending) {
      const eligibleBlockers = battlefield.filter(canBlock);
      actions.push({
        type: 'DECLARE_BLOCKERS',
        playerId,
        payload: {
          eligibleBlockerIds: eligibleBlockers.map((c) => c.instanceId),
        },
        timestamp: now,
      });
    }
  }

  return actions;
}
