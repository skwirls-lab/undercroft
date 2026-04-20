// ============================================================
// Forge Lookup — Runtime loader for pre-built Forge card data
// ============================================================
// Loads forge-cards.json (built by scripts/build-forge-data.ts)
// and provides a lookup-by-name function used by the EffectResolver
// as the primary effect resolution source.
// ============================================================

import type { SpellEffect } from './SpellEffectParser';
import type { ManaCost } from './types';

export interface ForgeCardEntry {
  effects: SpellEffect[];
  keywords: string[];
  triggers: { mode: string; effects: SpellEffect[]; condition?: string }[];
  activatedAbilities: { cost: string; effects: SpellEffect[] }[];
  manaAbilities: { cost: string; produced: string; amount: number }[];
}

interface ForgeCardsLookup {
  version: string;
  generatedAt: string;
  cardCount: number;
  cards: Record<string, ForgeCardEntry>;
}

let forgeData: ForgeCardsLookup | null = null;
let loadPromise: Promise<void> | null = null;
let loadFailed = false;

/**
 * Load the Forge card data from the pre-built JSON file.
 * Safe to call multiple times — will only load once.
 * Loads asynchronously and non-blocking; lookups before load
 * completes will return null (triggering regex fallback).
 */
export function initForgeData(): Promise<void> {
  if (forgeData) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const resp = await fetch('/data/forge-cards.json');
      if (!resp.ok) {
        console.warn('[ForgeLookup] Failed to load forge-cards.json:', resp.status);
        loadFailed = true;
        return;
      }
      const data: ForgeCardsLookup = await resp.json();
      forgeData = data;
      console.log(
        `[ForgeLookup] Loaded ${data.cardCount} Forge card entries (v${data.version}, generated ${data.generatedAt})`
      );
    } catch (err) {
      console.warn('[ForgeLookup] Error loading forge-cards.json:', err);
      loadFailed = true;
    }
  })();

  return loadPromise;
}

/**
 * Look up a card by name in the Forge data.
 * Returns null if not found or data not yet loaded.
 */
export function lookupForgeCard(cardName: string): ForgeCardEntry | null {
  if (!forgeData) return null;
  const key = cardName.toLowerCase();
  return forgeData.cards[key] ?? null;
}

/**
 * Get the spell effects for a card from Forge data.
 * Returns null if card is not in Forge data (caller should fall back to regex).
 */
export function getForgeEffects(cardName: string): SpellEffect[] | null {
  const entry = lookupForgeCard(cardName);
  if (!entry) return null;
  if (entry.effects.length === 0) return null;
  return entry.effects;
}

/**
 * Get keywords for a card from Forge data.
 */
export function getForgeKeywords(cardName: string): string[] | null {
  const entry = lookupForgeCard(cardName);
  if (!entry) return null;
  if (entry.keywords.length === 0) return null;
  return entry.keywords;
}

// ============================================================
// Forge Activated Ability Cost Parser
// ============================================================

export interface ActivatedAbilityCost {
  tap: boolean;                  // Requires tapping the source
  sacrificeSelf: boolean;        // Sacrifice the source card
  sacrificeType?: string;        // Sacrifice another permanent of this type (e.g. 'Creature')
  sacrificeCount: number;        // How many to sacrifice
  manaCost: ManaCost;            // Mana portion of the cost
  lifePayment: number;           // Pay N life
  discardCount: number;          // Discard N cards
  discardType?: string;          // Type of card to discard
  exileFromGraveyard: number;    // Exile N cards from graveyard
}

export interface ParsedActivatedAbility {
  cost: ActivatedAbilityCost;
  effects: SpellEffect[];
  costString: string;            // Original Forge cost string for display
  requiresTarget: boolean;       // Whether any effect needs a target
  description?: string;          // Human-readable description
}

/**
 * Parse a Forge cost string into a structured cost object.
 * Examples:
 *   "T" → { tap: true }
 *   "T Sac<1/CARDNAME>" → { tap: true, sacrificeSelf: true }
 *   "2 B T" → { tap: true, manaCost: { generic: 2, B: 1 } }
 *   "1 GP T Sac<1/Creature>" → { tap: true, manaCost: { generic: 1 }, sacrificeType: 'Creature' }
 */
export function parseForgeAbilityCost(costStr: string): ActivatedAbilityCost {
  const cost: ActivatedAbilityCost = {
    tap: false,
    sacrificeSelf: false,
    sacrificeCount: 0,
    manaCost: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0, X: 0 },
    lifePayment: 0,
    discardCount: 0,
    exileFromGraveyard: 0,
  };

  if (!costStr) return cost;

  // Split on spaces but keep Sac<...> together
  const tokens: string[] = [];
  let i = 0;
  while (i < costStr.length) {
    if (costStr[i] === ' ') { i++; continue; }
    // Check for Sac<...>
    if (costStr.substring(i).startsWith('Sac<')) {
      const end = costStr.indexOf('>', i);
      if (end >= 0) {
        tokens.push(costStr.substring(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    // Check for Discard<...>
    if (costStr.substring(i).startsWith('Discard<')) {
      const end = costStr.indexOf('>', i);
      if (end >= 0) {
        tokens.push(costStr.substring(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    // Check for ExileFromGrave<...>
    if (costStr.substring(i).startsWith('ExileFromGrave<')) {
      const end = costStr.indexOf('>', i);
      if (end >= 0) {
        tokens.push(costStr.substring(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    // Check for PayLife<...>
    if (costStr.substring(i).startsWith('PayLife<')) {
      const end = costStr.indexOf('>', i);
      if (end >= 0) {
        tokens.push(costStr.substring(i, end + 1));
        i = end + 1;
        continue;
      }
    }
    // Regular token
    let end = costStr.indexOf(' ', i);
    if (end < 0) end = costStr.length;
    tokens.push(costStr.substring(i, end));
    i = end;
  }

  for (const token of tokens) {
    if (token === 'T') {
      cost.tap = true;
    } else if (token.startsWith('Sac<')) {
      // Sac<1/CARDNAME> or Sac<1/Creature>
      const inner = token.substring(4, token.length - 1);
      const slashIdx = inner.indexOf('/');
      if (slashIdx >= 0) {
        const count = parseInt(inner.substring(0, slashIdx), 10) || 1;
        const type = inner.substring(slashIdx + 1);
        if (type === 'CARDNAME') {
          cost.sacrificeSelf = true;
        } else {
          cost.sacrificeType = type;
          cost.sacrificeCount = count;
        }
      }
    } else if (token.startsWith('PayLife<')) {
      const inner = token.substring(8, token.length - 1);
      cost.lifePayment = parseInt(inner, 10) || 0;
    } else if (token.startsWith('Discard<')) {
      const inner = token.substring(8, token.length - 1);
      const slashIdx = inner.indexOf('/');
      if (slashIdx >= 0) {
        cost.discardCount = parseInt(inner.substring(0, slashIdx), 10) || 1;
        cost.discardType = inner.substring(slashIdx + 1);
      } else {
        cost.discardCount = parseInt(inner, 10) || 1;
      }
    } else if (token.startsWith('ExileFromGrave<')) {
      const inner = token.substring(15, token.length - 1);
      cost.exileFromGraveyard = parseInt(inner, 10) || 1;
    } else if (token === 'W') {
      cost.manaCost.W++;
    } else if (token === 'U') {
      cost.manaCost.U++;
    } else if (token === 'B') {
      cost.manaCost.B++;
    } else if (token === 'R') {
      cost.manaCost.R++;
    } else if (token === 'G') {
      cost.manaCost.G++;
    } else if (token === 'C') {
      // Don't confuse with tap cost 'T' already handled
      cost.manaCost.C++;
    } else if (token === 'X') {
      cost.manaCost.X++;
    } else {
      // Try parsing as generic mana (e.g. '2', '3')
      const num = parseInt(token, 10);
      if (!isNaN(num)) {
        cost.manaCost.generic += num;
      }
      // Ignore unrecognized tokens (e.g. hybrid mana 'GP', 'UR', etc.)
    }
  }

  return cost;
}

/**
 * Get parsed activated abilities for a card from Forge data.
 * Returns null if card not found or has no activated abilities.
 */
export function getForgeActivatedAbilities(cardName: string): ParsedActivatedAbility[] | null {
  const entry = lookupForgeCard(cardName);
  if (!entry) return null;
  if (entry.activatedAbilities.length === 0) return null;

  return entry.activatedAbilities.map(ab => {
    const cost = parseForgeAbilityCost(ab.cost);
    const requiresTarget = ab.effects.some(e => e.requiresTarget);
    return {
      cost,
      effects: ab.effects,
      costString: ab.cost,
      requiresTarget,
    };
  });
}

/**
 * Check if Forge data is loaded and available.
 */
export function isForgeDataLoaded(): boolean {
  return forgeData !== null;
}

/**
 * Check if Forge data load was attempted but failed.
 */
export function hasForgeDataFailed(): boolean {
  return loadFailed;
}

/**
 * Get stats about loaded Forge data.
 */
export function getForgeDataStats(): { loaded: boolean; cardCount: number; version: string } {
  if (!forgeData) return { loaded: false, cardCount: 0, version: '' };
  return {
    loaded: true,
    cardCount: forgeData.cardCount,
    version: forgeData.version,
  };
}
