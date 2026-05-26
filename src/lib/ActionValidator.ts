/**
 * ActionValidator — Utility functions for validating game actions.
 * This replaces the deleted @/engine/ActionValidator module.
 */

import type { CardData, CardInstance } from '@/lib/gameTypes';

// ===================================================================
// Flying Keyword Check
// ===================================================================

export function hasFlying(cardData: CardData): boolean {
  const keywords = cardData.keywords ?? [];
  return keywords.includes('Flying');
}

// ===================================================================
// Can Block Validator (simplified - just checks tapped status)
// ===================================================================

export function canBlock(blockerCard: CardInstance): boolean {
  // A creature can block if it's not already tapped
  return !blockerCard.tapped;
}

// ===================================================================
// Has Priority Validator
// ===================================================================

export function hasPriority(
  playerId: string,
  gameState: { priority: { playerWithPriority: string } },
): boolean {
  return playerId === gameState.priority.playerWithPriority;
}
