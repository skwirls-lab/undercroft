import type { CardData, CardInstance, ManaColor } from './types';
import { lookupForgeCard } from './ForgeLookup';

// ============================================================
// Oracle Text Parser — extracts game-relevant abilities from
// card data including oracle text, type line, and produced_mana.
// ============================================================

const ALL_COLORS: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

// --- Mana Production ---

/**
 * Determine which colors of mana a land can produce when tapped.
 * Uses Scryfall's producedMana as the primary source, then falls
 * back to oracle text / type-line parsing.
 *
 * Returns an array of producible mana symbols (e.g. ['W','U'] for
 * a Hallowed Fountain, or ['C'] for Wastes).
 */
export function getLandProducibleColors(cardData: CardData): (ManaColor | 'C')[] {
  // 1. Try Scryfall producedMana field (most reliable)
  if (cardData.producedMana && cardData.producedMana.length > 0) {
    const colors: (ManaColor | 'C')[] = [];
    for (const m of cardData.producedMana) {
      if (ALL_COLORS.includes(m as ManaColor)) {
        if (!colors.includes(m as ManaColor)) colors.push(m as ManaColor);
      } else if (m === 'C' && !colors.includes('C')) {
        colors.push('C');
      }
    }
    if (colors.length > 0) return colors;
  }

  // 2. Parse basic land types from type line
  //    e.g. "Land — Plains Island" means it taps for W or U
  const typeLine = cardData.typeLine.toLowerCase();
  const typeColors = getColorsFromBasicLandTypes(typeLine);
  if (typeColors.length > 0) return typeColors;

  // 3. Parse oracle text for "Add {X}" patterns
  const oracleColors = getColorsFromOracleText(cardData.oracleText || '');
  if (oracleColors.length > 0) return oracleColors;

  // 4. Infer from card name (basic lands)
  const nameColors = getColorsFromLandName(cardData.name);
  if (nameColors.length > 0) return nameColors;

  // Fallback: only return colorless if oracle text suggests mana production
  // Lands like Fabled Passage that sacrifice for effects are NOT mana producers
  if (hasManaAbility(cardData)) {
    return ['C'];
  }
  return [];
}

/**
 * Check basic land subtypes in the type line.
 * "Plains" → W, "Island" → U, "Swamp" → B, "Mountain" → R, "Forest" → G
 */
function getColorsFromBasicLandTypes(typeLine: string): (ManaColor | 'C')[] {
  const colors: (ManaColor | 'C')[] = [];
  if (typeLine.includes('plains')) colors.push('W');
  if (typeLine.includes('island')) colors.push('U');
  if (typeLine.includes('swamp')) colors.push('B');
  if (typeLine.includes('mountain')) colors.push('R');
  if (typeLine.includes('forest')) colors.push('G');
  return colors;
}

/**
 * Parse oracle text for mana production patterns:
 * - "{T}: Add {W}." (basic)
 * - "{T}: Add {W} or {U}." (dual)
 * - "{T}: Add {W}, {U}, or {B}." (tri)
 * - "{T}: Add one mana of any color." (five-color)
 * - "{T}: Add {C}." (colorless)
 * - "{T}: Add {C}{C}." (double colorless like Sol Ring-style lands)
 */
function getColorsFromOracleText(oracleText: string): (ManaColor | 'C')[] {
  const text = oracleText.toLowerCase();
  const colors: (ManaColor | 'C')[] = [];

  // "any color" → all five
  if (text.includes('add one mana of any color') || text.includes('adds one mana of any color')) {
    return ['W', 'U', 'B', 'R', 'G'];
  }

  // "any type" → all five (e.g. Reflecting Pool patterns)
  if (text.includes('any type')) {
    return ['W', 'U', 'B', 'R', 'G'];
  }

  // Match all {X} symbols in "add" clauses
  const addPatterns = text.match(/add\s+[^.]*\./g) || [];
  for (const clause of addPatterns) {
    const symbols = clause.match(/\{([wubrgc])\}/g) || [];
    for (const sym of symbols) {
      const letter = sym.replace(/[{}]/g, '').toUpperCase();
      if (ALL_COLORS.includes(letter as ManaColor) && !colors.includes(letter as ManaColor)) {
        colors.push(letter as ManaColor);
      }
      if (letter === 'C' && !colors.includes('C')) {
        colors.push('C');
      }
    }
  }

  return colors;
}

/**
 * Fallback: infer color from basic land names.
 */
function getColorsFromLandName(name: string): (ManaColor | 'C')[] {
  const n = name.toLowerCase();
  if (n === 'plains') return ['W'];
  if (n === 'island') return ['U'];
  if (n === 'swamp') return ['B'];
  if (n === 'mountain') return ['R'];
  if (n === 'forest') return ['G'];
  if (n === 'wastes') return ['C'];
  return [];
}

/**
 * Check if a land actually has a mana ability (taps to produce mana).
 * Lands like Fabled Passage that tap+sacrifice to search are NOT mana producers.
 * Uses Forge data if available, otherwise analyzes oracle text.
 */
export function hasManaAbility(cardData: CardData): boolean {
  // 1. Check Forge data first
  const forgeEntry = lookupForgeCard(cardData.name);
  if (forgeEntry) {
    return forgeEntry.manaAbilities.length > 0;
  }

  // 2. Check Scryfall producedMana — but only trust it if oracle text confirms
  //    Scryfall lists producedMana for fetch lands too (since they can get lands that produce)
  const oracle = (cardData.oracleText || '').toLowerCase();

  // If oracle has "{t}: add" it's a mana ability
  if (/\{t\}\s*:\s*add\b/.test(oracle)) return true;

  // If oracle has "{t}," followed by sacrifice/pay/discard, it's NOT a simple mana ability
  if (/\{t\}\s*,\s*(sacrifice|pay|discard|remove|exile)/.test(oracle)) return false;

  // Basic land types in the type line always have intrinsic mana abilities
  const typeLine = cardData.typeLine.toLowerCase();
  if (/\b(plains|island|swamp|mountain|forest)\b/.test(typeLine)) return true;

  // If the card has producedMana from Scryfall AND no complex activated abilities, trust it
  if (cardData.producedMana && cardData.producedMana.length > 0) {
    // But filter out fetch-land patterns
    if (oracle.includes('search your library') || oracle.includes('sacrifice')) return false;
    return true;
  }

  return false;
}

// --- DFC Face Helpers ---

/**
 * For dual-faced cards on the battlefield, return CardData reflecting
 * only the active face.  Uses the `flipped` flag — false = front, true = back.
 * Single-faced cards are returned as-is.
 */
export function getEffectiveLandCardData(card: CardInstance): CardData {
  const { cardData } = card;
  if (!cardData.cardFaces || cardData.cardFaces.length < 2) return cardData;

  const face = card.flipped ? cardData.cardFaces[1] : cardData.cardFaces[0];
  return {
    ...cardData,
    name: face.name,
    manaCost: face.manaCost,
    typeLine: face.typeLine,
    oracleText: face.oracleText,
    power: face.power,
    toughness: face.toughness,
    imageUris: face.imageUris || cardData.imageUris,
    // Clear aggregated producedMana so parser uses face-specific oracle text
    producedMana: undefined,
  };
}

// --- ETB Effects ---

/**
 * Check if a land enters the battlefield tapped.
 * Parses oracle text for common patterns.
 */
export function entersTapped(cardData: CardData): boolean {
  const text = (cardData.oracleText || '').toLowerCase();

  // Direct statements
  if (text.includes('enters the battlefield tapped')) return true;
  if (text.includes('enters tapped')) return true;

  return false;
}

/**
 * Check if a land has a conditional "enters tapped unless" clause.
 * Returns 'always_tapped' | 'conditional' | 'untapped'
 *
 * For now we treat conditional lands as entering tapped (conservative).
 * A future improvement would evaluate the condition at play time.
 */
export function getETBTappedStatus(cardData: CardData): 'always_tapped' | 'conditional' | 'untapped' {
  const text = (cardData.oracleText || '').toLowerCase();

  if (!text.includes('enters the battlefield tapped') && !text.includes('enters tapped')) {
    return 'untapped';
  }

  // "unless" patterns: shock lands, check lands, etc.
  if (text.includes('unless')) return 'conditional';

  // "you may pay" patterns: shock lands
  if (text.includes('you may pay')) return 'conditional';

  return 'always_tapped';
}

// --- Mana symbol helpers for display ---

const MANA_SYMBOL_MAP: Record<string, string> = {
  W: '☀', // Plains / White
  U: '💧', // Island / Blue
  B: '💀', // Swamp / Black
  R: '🔥', // Mountain / Red
  G: '🌲', // Forest / Green
  C: '◇',  // Colorless
};

export function getManaSymbolDisplay(color: ManaColor | 'C'): string {
  return MANA_SYMBOL_MAP[color] || color;
}

export function getManaColorName(color: ManaColor | 'C'): string {
  const names: Record<string, string> = {
    W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colorless',
  };
  return names[color] || color;
}
