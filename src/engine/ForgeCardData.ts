// ============================================================
// Forge Card Data — Types and loader for Forge script card data
// ============================================================
// Forge scripts use a structured DSL where each card has hand-written
// ability definitions. This module defines the intermediate format and
// provides a loader for the pre-built JSON lookup.
//
// License: Forge is GPL v3. Any data derived from Forge scripts
// must also be distributed under GPL v3.
// ============================================================

import type { SpellEffect, EffectType, TargetType } from './SpellEffectParser';

// --- Raw parsed representation of a single Forge ability line ---
export interface ForgeAbility {
  // The API type from Forge (e.g. 'DealDamage', 'Destroy', 'Draw', 'Scry', etc.)
  api: string;
  // Whether this is a spell ability (SP$), activated ability (AB$), or chained (DB$)
  abilityType: 'spell' | 'activated' | 'chained';
  // Raw key-value parameters from the Forge DSL
  params: Record<string, string>;
  // Sub-abilities (chained via SubAbility$)
  subAbilities: ForgeAbility[];
}

// --- A trigger definition from T: lines ---
export interface ForgeTrigger {
  mode: string;                        // e.g. 'ChangesZone', 'SpellCast', 'Drawn'
  params: Record<string, string>;      // All trigger parameters
  executeAbility?: ForgeAbility;       // The ability executed when triggered
}

// --- A keyword from K: lines ---
export interface ForgeKeyword {
  keyword: string;      // e.g. 'Flying', 'Evoke', 'Trample'
  params?: string;      // Optional parameter (e.g. Evoke cost '2 U')
}

// --- Complete parsed card data from a Forge script ---
export interface ForgeCardScript {
  name: string;
  manaCost?: string;
  types?: string;
  pt?: string;                         // e.g. '2/2'
  keywords: ForgeKeyword[];
  abilities: ForgeAbility[];
  triggers: ForgeTrigger[];
  oracle?: string;
  // SVars that define sub-abilities and computed values
  svars: Record<string, string>;
}

// --- The slim format we store in the JSON lookup for runtime use ---
export interface ForgeCardEntry {
  // Pre-converted SpellEffect[] ready for the EffectResolver
  effects: SpellEffect[];
  // Keywords for the engine (flying, trample, etc.)
  keywords: string[];
  // Trigger definitions in a simplified format
  triggers: ForgeSimpleTrigger[];
  // Activated abilities (non-mana)
  activatedAbilities: ForgeSimpleActivated[];
  // Mana abilities
  manaAbilities: ForgeSimpleMana[];
}

export interface ForgeSimpleTrigger {
  mode: string;                // 'etb', 'dies', 'spell_cast', 'drawn', etc.
  effects: SpellEffect[];      // What happens when triggered
  condition?: string;          // Filter string (e.g. 'Card.Self', 'Card.OppOwn')
}

export interface ForgeSimpleActivated {
  cost: string;                // e.g. 'T', '2 B, T', '1, Sac<CARDNAME>'
  effects: SpellEffect[];
}

export interface ForgeSimpleMana {
  cost: string;                // e.g. 'T'
  produced: string;            // e.g. 'G', 'Any', 'C'
  amount: number;
}

// ============================================================
// Forge Ability → SpellEffect converter
// ============================================================

/**
 * Convert a Forge API type + params into our SpellEffect format.
 * This is the core bridge between the two systems.
 */
export function forgeAbilityToEffects(ability: ForgeAbility): SpellEffect[] {
  const effects: SpellEffect[] = [];
  const effect = convertSingleAbility(ability);
  if (effect) effects.push(effect);

  // Recursively convert sub-abilities
  for (const sub of ability.subAbilities) {
    effects.push(...forgeAbilityToEffects(sub));
  }

  return effects;
}

function convertSingleAbility(ability: ForgeAbility): SpellEffect | null {
  const p = ability.params;
  const api = ability.api;

  switch (api) {
    case 'DealDamage':
      return {
        type: 'damage',
        amount: parseForgeNum(p['NumDmg']),
        targetType: mapForgeTarget(p['ValidTgts']),
        requiresTarget: !!p['ValidTgts'],
      };

    case 'Destroy':
      return {
        type: 'destroy',
        targetType: mapForgeTarget(p['ValidTgts']),
        requiresTarget: !!p['ValidTgts'],
        filter: p['ValidTgts'],
      };

    case 'DestroyAll':
      return {
        type: 'destroy_all',
        targetType: mapForgeValidCards(p['ValidCards']),
        requiresTarget: false,
        filter: p['ValidCards'],
      };

    case 'Draw':
      return {
        type: 'draw',
        amount: parseForgeNum(p['NumCards']),
        requiresTarget: false,
      };

    case 'GainLife':
      return {
        type: 'gain_life',
        amount: parseForgeNum(p['LifeAmount']),
        requiresTarget: false,
      };

    case 'LoseLife':
      return {
        type: 'lose_life',
        amount: parseForgeNum(p['LifeAmount']),
        targetType: mapForgeTarget(p['ValidTgts'] || p['Defined']),
        requiresTarget: !!p['ValidTgts'],
      };

    case 'Pump':
      return {
        type: 'pump',
        power: parseForgeSignedNum(p['NumAtt']),
        toughness: parseForgeSignedNum(p['NumDef']),
        targetType: mapForgeTarget(p['ValidTgts']),
        requiresTarget: !!p['ValidTgts'],
        duration: 'until_end_of_turn',
      };

    case 'PumpAll':
      return {
        type: 'pump',
        power: parseForgeSignedNum(p['NumAtt']),
        toughness: parseForgeSignedNum(p['NumDef']),
        targetType: mapForgeValidCards(p['ValidCards']),
        requiresTarget: false,
        duration: 'until_end_of_turn',
        filter: p['ValidCards'],
      };

    case 'Counter':
      return {
        type: 'counter_spell',
        targetType: 'spell',
        requiresTarget: true,
      };

    case 'Scry':
      return {
        type: 'scry',
        amount: parseForgeNum(p['ScryNum']),
        requiresTarget: false,
      };

    case 'Surveil':
      return {
        type: 'surveil',
        amount: parseForgeNum(p['SurveilNum']),
        requiresTarget: false,
      };

    case 'Mill':
      return {
        type: 'mill',
        amount: parseForgeNum(p['NumCards']),
        targetType: p['ValidTgts'] ? mapForgeTarget(p['ValidTgts']) : 'self',
        requiresTarget: !!p['ValidTgts'],
      };

    case 'Discard':
      return {
        type: 'discard',
        amount: parseForgeNum(p['NumCards']),
        targetType: mapForgeTarget(p['ValidTgts'] || p['Defined']),
        requiresTarget: !!p['ValidTgts'],
      };

    case 'Sacrifice':
      return {
        type: 'sacrifice',
        amount: parseForgeNum(p['Amount']),
        filter: p['SacValid'] || 'permanent',
        requiresTarget: false,
      };

    case 'Fight':
      return {
        type: 'fight',
        targetType: 'creature',
        requiresTarget: true,
      };

    case 'Tap':
      return {
        type: 'tap',
        targetType: mapForgeTarget(p['ValidTgts']),
        requiresTarget: !!p['ValidTgts'],
      };

    case 'TapAll':
      return {
        type: 'tap',
        targetType: mapForgeValidCards(p['ValidCards']),
        requiresTarget: false,
        filter: p['ValidCards'],
      };

    case 'Untap':
      return {
        type: 'untap',
        targetType: mapForgeTarget(p['ValidTgts']),
        requiresTarget: !!p['ValidTgts'],
      };

    case 'UntapAll':
      return {
        type: 'untap',
        targetType: mapForgeValidCards(p['ValidCards']),
        requiresTarget: false,
        filter: p['ValidCards'],
      };

    case 'Token':
      return {
        type: 'create_token',
        amount: parseForgeNum(p['TokenAmount']),
        tokenName: p['TokenScript'] || 'token',
        requiresTarget: false,
      };

    case 'PutCounter':
      return {
        type: 'add_counter',
        counterType: mapForgeCounterType(p['CounterType']),
        amount: parseForgeNum(p['CounterNum']),
        targetType: mapForgeTarget(p['ValidTgts']),
        requiresTarget: !!p['ValidTgts'],
      };

    case 'ChangeZone': {
      const origin = (p['Origin'] || '').toLowerCase();
      const dest = (p['Destination'] || '').toLowerCase();

      // Library → Battlefield = ramp / put onto battlefield
      if (origin === 'library' && dest === 'battlefield') {
        return {
          type: 'put_land_onto_battlefield',
          searchFilter: p['ChangeType'] || 'Land',
          requiresTarget: false,
        };
      }

      // Library → Hand = search/tutor
      if (origin === 'library' && dest === 'hand') {
        return {
          type: 'search_library',
          searchFilter: p['ChangeType'] || 'any',
          destination: 'hand',
          requiresTarget: false,
        };
      }

      // Graveyard → Hand or Battlefield = return from graveyard
      if (origin === 'graveyard') {
        return {
          type: 'return_from_graveyard',
          destination: dest,
          targetType: mapForgeTarget(p['ValidTgts']),
          requiresTarget: !!p['ValidTgts'],
        };
      }

      // Battlefield → Exile = exile
      if (origin === 'battlefield' && dest === 'exile') {
        return {
          type: 'exile',
          targetType: mapForgeTarget(p['ValidTgts']),
          requiresTarget: !!p['ValidTgts'],
        };
      }

      // Battlefield → Hand = bounce
      if (origin === 'battlefield' && dest === 'hand') {
        return {
          type: 'bounce' as EffectType,
          targetType: mapForgeTarget(p['ValidTgts']),
          requiresTarget: !!p['ValidTgts'],
        };
      }

      // Battlefield → Graveyard via ChangeZone (sacrifice-like)
      if (origin === 'battlefield' && dest === 'graveyard') {
        return {
          type: 'sacrifice',
          targetType: mapForgeTarget(p['ValidTgts']),
          requiresTarget: !!p['ValidTgts'],
        };
      }

      // Battlefield → Library (tuck effects like Chaos Warp)
      if (origin === 'battlefield' && dest === 'library') {
        return {
          type: 'bounce' as EffectType,
          targetType: mapForgeTarget(p['ValidTgts']),
          requiresTarget: !!p['ValidTgts'],
        };
      }

      return null;
    }

    case 'ChangeZoneAll': {
      const origin = (p['Origin'] || '').toLowerCase();
      const dest = (p['Destination'] || '').toLowerCase();

      if (dest === 'exile') {
        return {
          type: 'exile_all',
          filter: p['ChangeType'] || p['ValidCards'],
          requiresTarget: false,
        };
      }
      if (dest === 'graveyard' && origin === 'battlefield') {
        return {
          type: 'destroy_all',
          filter: p['ChangeType'] || p['ValidCards'],
          requiresTarget: false,
        };
      }
      return null;
    }

    case 'Explore':
      return {
        type: 'scry',
        amount: 1,
        requiresTarget: false,
      };

    case 'Poison':
      return {
        type: 'damage',
        amount: parseForgeNum(p['Num']),
        targetType: mapForgeTarget(p['ValidTgts'] || p['Defined']),
        requiresTarget: !!p['ValidTgts'],
      };

    case 'Fog':
      // Prevent all combat damage — we don't have a proper type yet, skip
      return null;

    case 'GainControl':
      // Steal effects — complex, skip for MVP
      return null;

    default:
      return null;
  }
}

// --- Helpers ---

function parseForgeNum(val: string | undefined): number {
  if (!val) return 1;
  const n = parseInt(val, 10);
  return isNaN(n) ? 1 : n;
}

function parseForgeSignedNum(val: string | undefined): number {
  if (!val) return 0;
  return parseInt(val, 10) || 0;
}

function mapForgeTarget(val: string | undefined): TargetType {
  if (!val) return 'any';
  const v = val.toLowerCase();
  if (v.startsWith('creature')) return 'creature';
  if (v.startsWith('player')) return 'player';
  if (v.startsWith('permanent')) return 'permanent';
  if (v.startsWith('artifact')) return 'artifact';
  if (v.startsWith('enchantment')) return 'enchantment';
  if (v.startsWith('planeswalker')) return 'planeswalker';
  if (v === 'spell' || v === 'card') return 'spell';
  if (v === 'you') return 'self';
  if (v === 'opponent') return 'each_opponent';
  if (v === 'any') return 'any';
  return 'any';
}

function mapForgeValidCards(val: string | undefined): TargetType {
  if (!val) return 'any';
  const v = val.toLowerCase();
  if (v.startsWith('creature')) return 'creature';
  if (v.startsWith('artifact')) return 'artifact';
  if (v.startsWith('enchantment')) return 'enchantment';
  if (v.startsWith('land')) return 'permanent';
  return 'any';
}

function mapForgeCounterType(val: string | undefined): string {
  if (!val) return '+1/+1';
  if (val === 'P1P1') return '+1/+1';
  if (val === 'M1M1') return '-1/-1';
  if (val === 'LOYALTY') return 'loyalty';
  return val.toLowerCase();
}

// ============================================================
// Forge Script File Parser — Parses raw .txt files into ForgeCardScript
// ============================================================

/**
 * Parse a Forge card script file contents into structured data.
 */
export function parseForgeScript(contents: string, svarsMap?: Record<string, string>): ForgeCardScript {
  const lines = contents.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const result: ForgeCardScript = {
    name: '',
    keywords: [],
    abilities: [],
    triggers: [],
    svars: {},
  };

  // First pass: collect all SVars
  for (const line of lines) {
    if (line.startsWith('SVar:')) {
      const rest = line.substring(5);
      const colonIdx = rest.indexOf(':');
      if (colonIdx > 0) {
        const svarName = rest.substring(0, colonIdx);
        const svarValue = rest.substring(colonIdx + 1);
        result.svars[svarName] = svarValue;
      }
    }
  }

  // Merge external SVars if provided
  if (svarsMap) {
    Object.assign(result.svars, svarsMap);
  }

  // Second pass: parse everything
  for (const line of lines) {
    if (line.startsWith('Name:')) {
      result.name = line.substring(5);
    } else if (line.startsWith('ManaCost:')) {
      result.manaCost = line.substring(9);
    } else if (line.startsWith('Types:')) {
      result.types = line.substring(6);
    } else if (line.startsWith('PT:')) {
      result.pt = line.substring(3);
    } else if (line.startsWith('Oracle:')) {
      result.oracle = line.substring(7);
    } else if (line.startsWith('K:')) {
      const kwLine = line.substring(2);
      const colonIdx = kwLine.indexOf(':');
      if (colonIdx > 0) {
        result.keywords.push({
          keyword: kwLine.substring(0, colonIdx),
          params: kwLine.substring(colonIdx + 1),
        });
      } else {
        result.keywords.push({ keyword: kwLine });
      }
    } else if (line.startsWith('A:')) {
      const abilityStr = line.substring(2);
      const ability = parseForgeAbilityString(abilityStr, result.svars);
      if (ability) result.abilities.push(ability);
    } else if (line.startsWith('T:')) {
      const trigStr = line.substring(2);
      const trigger = parseForgeTriggerString(trigStr, result.svars);
      if (trigger) result.triggers.push(trigger);
    }
  }

  return result;
}

/**
 * Parse a Forge ability string like:
 * "SP$ DealDamage | ValidTgts$ Any | NumDmg$ 3 | SpellDescription$ ..."
 */
function parseForgeAbilityString(str: string, svars: Record<string, string>): ForgeAbility | null {
  const parts = str.split('|').map(s => s.trim());
  if (parts.length === 0) return null;

  const params: Record<string, string> = {};
  let api = '';
  let abilityType: ForgeAbility['abilityType'] = 'spell';

  for (const part of parts) {
    const dollarIdx = part.indexOf('$');
    if (dollarIdx < 0) continue;

    const key = part.substring(0, dollarIdx).trim();
    const value = part.substring(dollarIdx + 1).trim();

    if (key === 'SP' || key === 'AB' || key === 'DB') {
      api = value;
      if (key === 'AB') abilityType = 'activated';
      if (key === 'DB') abilityType = 'chained';
    } else {
      params[key] = value;
    }
  }

  if (!api) return null;

  // Resolve sub-abilities from SVars
  const subAbilities: ForgeAbility[] = [];
  if (params['SubAbility'] && svars[params['SubAbility']]) {
    const sub = parseForgeAbilityString(svars[params['SubAbility']], svars);
    if (sub) subAbilities.push(sub);
  }

  return { api, abilityType, params, subAbilities };
}

/**
 * Parse a Forge trigger string like:
 * "Mode$ ChangesZone | Origin$ Any | Destination$ Battlefield | ValidCard$ Card.Self | Execute$ TrigDraw | ..."
 */
function parseForgeTriggerString(str: string, svars: Record<string, string>): ForgeTrigger | null {
  const parts = str.split('|').map(s => s.trim());
  const params: Record<string, string> = {};

  for (const part of parts) {
    const dollarIdx = part.indexOf('$');
    if (dollarIdx < 0) continue;
    const key = part.substring(0, dollarIdx).trim();
    const value = part.substring(dollarIdx + 1).trim();
    params[key] = value;
  }

  const mode = params['Mode'];
  if (!mode) return null;

  // Resolve the Execute ability
  let executeAbility: ForgeAbility | undefined;
  if (params['Execute'] && svars[params['Execute']]) {
    executeAbility = parseForgeAbilityString(svars[params['Execute']], svars) ?? undefined;
  }

  return { mode, params, executeAbility };
}

// ============================================================
// Full pipeline: ForgeCardScript → ForgeCardEntry
// ============================================================

/**
 * Convert a parsed Forge card script into the slim runtime format.
 */
export function forgeScriptToEntry(script: ForgeCardScript): ForgeCardEntry {
  const entry: ForgeCardEntry = {
    effects: [],
    keywords: script.keywords.map(k => k.keyword.toLowerCase()),
    triggers: [],
    activatedAbilities: [],
    manaAbilities: [],
  };

  // Convert spell abilities into effects
  for (const ability of script.abilities) {
    if (ability.api === 'Mana') {
      // Mana ability — separate track
      entry.manaAbilities.push({
        cost: ability.params['Cost'] || 'T',
        produced: ability.params['Produced'] || 'C',
        amount: parseForgeNum(ability.params['Amount']),
      });
    } else if (ability.abilityType === 'activated') {
      // Activated ability
      entry.activatedAbilities.push({
        cost: ability.params['Cost'] || '',
        effects: forgeAbilityToEffects(ability),
      });
    } else {
      // Spell ability (cast effect)
      entry.effects.push(...forgeAbilityToEffects(ability));
    }
  }

  // Convert triggers
  for (const trigger of script.triggers) {
    const mode = mapForgeTriggerMode(trigger.mode);
    const effects: SpellEffect[] = [];
    if (trigger.executeAbility) {
      effects.push(...forgeAbilityToEffects(trigger.executeAbility));
    }

    entry.triggers.push({
      mode,
      effects,
      condition: trigger.params['ValidCard'] || trigger.params['ValidActivatingPlayer'],
    });
  }

  return entry;
}

function mapForgeTriggerMode(mode: string): string {
  const map: Record<string, string> = {
    'ChangesZone': 'zone_change',
    'SpellCast': 'spell_cast',
    'Drawn': 'drawn',
    'Attacks': 'attacks',
    'Blocks': 'blocks',
    'DamageDone': 'damage_dealt',
    'BecomesTarget': 'becomes_target',
    'LandPlayed': 'land_played',
    'TurnBegin': 'turn_begin',
    'Phase': 'phase',
    'Untaps': 'untaps',
    'Sacrificed': 'sacrificed',
    'Countered': 'countered',
    'Evolved': 'evolved',
    'LifeGained': 'life_gained',
    'LifeLost': 'life_lost',
  };
  return map[mode] || mode.toLowerCase();
}
