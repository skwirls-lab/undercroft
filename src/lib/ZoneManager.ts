/**
 * ZoneManager — Utility functions for querying game zones.
 * This replaces the deleted @/engine/ZoneManager module.
 */

import type { GameState, ZoneType } from '@/lib/gameTypes';

// ===================================================================
// Get Cards in a Specific Zone
// ===================================================================

export function getCardsInZone(gameState: GameState, playerId: string, zoneType: string): string[] {
  const zones = gameState.zones;
  
  // Build the zone key - format is "playerId:zoneType" to match forgeStateAdapter
  const zoneKey = `${playerId}:${zoneType}`;
  
  const zone = zones.get(zoneKey);
  if (!zone) {
    return [];
  }
  
  return zone.cards;
}

// ===================================================================
// Get Zone Card Count
// ===================================================================

export function getZoneCardCount(gameState: GameState, playerId: string, zoneType: string): number {
  const cards = getCardsInZone(gameState, playerId, zoneType);
  return cards.length;
}
