/**
 * ZoneManager — Utility functions for querying game zones.
 * This replaces the deleted @/engine/ZoneManager module.
 */

import type { GameState, ZoneType } from '@/lib/gameTypes';

// ===================================================================
// Get Cards in a Specific Zone
// ===================================================================

export function getCardsInZone(gameState: GameState, zoneType: string, playerId?: string): string[] {
  const zones = gameState.zones;
  
  // Build the zone key
  const zoneKey = playerId ? `${zoneType}:${playerId}` : zoneType;
  
  const zone = zones.get(zoneKey);
  if (!zone) {
    return [];
  }
  
  return zone.cards;
}

// ===================================================================
// Get Zone Card Count
// ===================================================================

export function getZoneCardCount(gameState: GameState, zoneType: string, playerId?: string): number {
  const cards = getCardsInZone(gameState, zoneType, playerId);
  return cards.length;
}
