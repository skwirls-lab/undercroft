/**
 * OracleTextParser — Utility functions for parsing card oracle text and extracting game data.
 * This replaces the deleted @/engine/OracleTextParser module.
 */

import type { CardData, CardInstance, ManaColor } from '@/lib/gameTypes';

// ===================================================================
// Mana Color Name Mapping
// ===================================================================

export function getManaColorName(color: ManaColor): string {
  const names: Record<ManaColor, string> = {
    W: 'White',
    U: 'Blue',
    B: 'Black',
    R: 'Red',
    G: 'Green',
    C: 'Colorless',
  };
  return names[color] ?? '';
}

// ===================================================================
// ETB Tapped Status
// ===================================================================

export type ETBTappedStatus = 'always_tapped' | 'conditional' | 'untapped';

export function getETBTappedStatus(cardInstance: { tapped: boolean; summoningSick: boolean }): ETBTappedStatus {
  // A card is considered "tapped upon entering battlefield" if it's currently tapped AND has summoning sickness
  if (cardInstance.tapped && cardInstance.summoningSick) {
    return 'always_tapped';
  }
  return 'untapped';
}

// ===================================================================
// Land Producible Colors
// ===================================================================

export function getLandProducibleColors(card: CardData | CardInstance): ManaColor[] {
  const oracleText = (card as CardData).oracleText ?? '';
  const colors: ManaColor[] = [];
  
  // Check for explicit mana symbols in oracle text
  if (/\{W\}/.test(oracleText)) colors.push('W');
  if (/\{U\}/.test(oracleText)) colors.push('U');
  if (/\{B\}/.test(oracleText)) colors.push('B');
  if (/\{R\}/.test(oracleText)) colors.push('R');
  if (/\{G\}/.test(oracleText)) colors.push('G');
  
  // If no colored mana, default to colorless for lands
  if (colors.length === 0) {
    colors.push('C');
  }
  
  return colors;
}

// ===================================================================
// Effective Land Card Data
// ===================================================================

export function getEffectiveLandCardData(card: CardData | CardInstance): CardData {
  // For lands, we need to ensure the producedMana is set correctly
  const cardData = 'cardData' in card ? card.cardData : card;
  const oracleText = cardData.oracleText ?? '';
  const typeLine = cardData.typeLine ?? '';
  
  let producedMana: ManaColor[] | undefined;
  
  if (typeLine.toLowerCase().includes('land')) {
    // Parse mana symbols from oracle text for lands
    producedMana = [];
    
    // Check each color
    if (/\{W\}/.test(oracleText)) producedMana.push('W');
    if (/\{U\}/.test(oracleText)) producedMana.push('U');
    if (/\{B\}/.test(oracleText)) producedMana.push('B');
    if (/\{R\}/.test(oracleText)) producedMana.push('R');
    if (/\{G\}/.test(oracleText)) producedMana.push('G');
    
    // Default to colorless if no colored mana
    if (producedMana.length === 0) {
      producedMana.push('C');
    }
  }
  
  return cardData;
}
