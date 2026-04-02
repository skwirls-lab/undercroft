import type { GameState, CardInstance, ZoneType, GameEvent } from './types';
import { getZoneKey } from './GameState';

function createEvent(type: GameEvent['type'], playerId: string, data: Record<string, unknown> = {}): GameEvent {
  return {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    playerId,
    data,
    timestamp: Date.now(),
  };
}

export function moveCard(
  state: GameState,
  cardInstanceId: string,
  toZone: ZoneType,
  toOwnerId?: string
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const cardInstance = state.cardInstances.get(cardInstanceId);
  if (!cardInstance) return { state, events };

  const fromZone = cardInstance.zone;
  const fromOwnerId = cardInstance.ownerId;
  const targetOwnerId = toOwnerId || fromOwnerId;

  const newZones = new Map(state.zones);
  const newCardInstances = new Map(state.cardInstances);

  // Remove from source zone
  const fromKey = getZoneKey(fromZone, fromOwnerId);
  const sourceZone = newZones.get(fromKey);
  if (sourceZone) {
    newZones.set(fromKey, {
      ...sourceZone,
      cards: sourceZone.cards.filter((id) => id !== cardInstanceId),
    });
  }

  // Add to destination zone
  const toKey = getZoneKey(toZone, targetOwnerId);
  const destZone = newZones.get(toKey);
  if (destZone) {
    newZones.set(toKey, {
      ...destZone,
      cards: [...destZone.cards, cardInstanceId],
    });
  }

  // Update card instance
  const updatedCard: CardInstance = {
    ...cardInstance,
    zone: toZone,
    // Reset battlefield-specific state when leaving battlefield
    ...(fromZone === 'battlefield' && toZone !== 'battlefield'
      ? {
          tapped: false,
          damage: 0,
          counters: {},
          attachments: [],
          attachedTo: undefined,
          summoningSick: false,
          modifiedPower: undefined,
          modifiedToughness: undefined,
        }
      : {}),
    // Set summoning sickness when entering battlefield
    ...(toZone === 'battlefield' && fromZone !== 'battlefield'
      ? { summoningSick: true }
      : {}),
  };
  newCardInstances.set(cardInstanceId, updatedCard);

  events.push(createEvent('ZONE_TRANSFER', cardInstance.controllerId, {
    cardInstanceId,
    cardName: cardInstance.cardData.name,
    from: fromZone,
    to: toZone,
  }));

  return {
    state: { ...state, zones: newZones, cardInstances: newCardInstances },
    events,
  };
}

export function shuffleZone(
  state: GameState,
  playerId: string,
  zoneType: ZoneType
): GameState {
  const newZones = new Map(state.zones);
  const key = getZoneKey(zoneType, playerId);
  const zone = newZones.get(key);
  if (!zone) return state;

  const shuffled = [...zone.cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  newZones.set(key, { ...zone, cards: shuffled });
  return { ...state, zones: newZones };
}

export function addCardToZone(
  state: GameState,
  cardInstance: CardInstance,
  zoneType: ZoneType,
  ownerId: string,
  position: 'top' | 'bottom' = 'top'
): GameState {
  const newZones = new Map(state.zones);
  const newCardInstances = new Map(state.cardInstances);
  const key = getZoneKey(zoneType, ownerId);
  const zone = newZones.get(key);

  if (!zone) return state;

  const updatedCard = { ...cardInstance, zone: zoneType };
  newCardInstances.set(cardInstance.instanceId, updatedCard);

  const newCards = [...zone.cards];
  if (position === 'top') {
    newCards.unshift(cardInstance.instanceId);
  } else {
    newCards.push(cardInstance.instanceId);
  }

  newZones.set(key, { ...zone, cards: newCards });

  return { ...state, zones: newZones, cardInstances: newCardInstances };
}

export function getZoneCardCount(
  state: GameState,
  playerId: string,
  zoneType: ZoneType
): number {
  const key = getZoneKey(zoneType, playerId);
  return state.zones.get(key)?.cards.length || 0;
}
