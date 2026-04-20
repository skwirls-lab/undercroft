// ============================================================
// Forge Lookup — Runtime loader for pre-built Forge card data
// ============================================================
// Loads forge-cards.json (built by scripts/build-forge-data.ts)
// and provides a lookup-by-name function used by the EffectResolver
// as the primary effect resolution source.
// ============================================================

import type { SpellEffect } from './SpellEffectParser';

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
