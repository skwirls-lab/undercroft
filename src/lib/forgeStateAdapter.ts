/**
 * ForgeStateAdapter — converts Forge server state into our local GameState format
 * so the existing UI components (GameBoard, PlayerField, Hand, CardView, etc.)
 * work without modification.
 */

import type {
  GameState, PlayerState, CardInstance, CardData, Zone, ZoneType,
  StackItem, TurnState, PriorityState, ManaPool, Phase, Step,
} from '@/engine/types';
import type { ForgeGameState, ForgePlayer, ForgeCard, ForgeStackItem } from '@/lib/forgeClient';

// Forge phase names → our Phase type
const PHASE_MAP: Record<string, Phase> = {
  'UNTAP': 'beginning',
  'UPKEEP': 'beginning',
  'DRAW': 'beginning',
  'MAIN1': 'precombat_main',
  'COMBAT_BEGIN': 'combat',
  'COMBAT_DECLARE_ATTACKERS': 'combat',
  'COMBAT_DECLARE_BLOCKERS': 'combat',
  'COMBAT_FIRST_STRIKE_DAMAGE': 'combat',
  'COMBAT_DAMAGE': 'combat',
  'COMBAT_END': 'combat',
  'MAIN2': 'postcombat_main',
  'END_OF_TURN': 'ending',
  'CLEANUP': 'ending',
};

// Forge phase names → our Step type
const STEP_MAP: Record<string, Step> = {
  'UNTAP': 'untap',
  'UPKEEP': 'upkeep',
  'DRAW': 'draw',
  'MAIN1': 'main',
  'COMBAT_BEGIN': 'beginning_of_combat',
  'COMBAT_DECLARE_ATTACKERS': 'declare_attackers',
  'COMBAT_DECLARE_BLOCKERS': 'declare_blockers',
  'COMBAT_FIRST_STRIKE_DAMAGE': 'first_strike_damage',
  'COMBAT_DAMAGE': 'combat_damage',
  'COMBAT_END': 'end_of_combat',
  'MAIN2': 'main',
  'END_OF_TURN': 'end_step',
  'CLEANUP': 'cleanup',
};

/**
 * Convert a ForgeGameState from the server into our local GameState.
 *
 * @param forgeState - The state from the Forge server
 * @param humanPlayerId - The local player's forge ID (numeric), used to assign our string player IDs
 */
export function adaptForgeState(forgeState: ForgeGameState): GameState {
  const cardInstances = new Map<string, CardInstance>();
  const zones = new Map<string, Zone>();
  const players: PlayerState[] = [];

  // Map Forge player IDs (numeric) to string IDs
  const playerIdMap = new Map<number, string>();
  for (const fp of forgeState.players) {
    const id = fp.isAI ? `ai-${fp.id}` : 'player-human';
    playerIdMap.set(fp.id, id);
  }

  // Convert each player
  for (const fp of forgeState.players) {
    const pid = playerIdMap.get(fp.id)!;

    const manaPool: ManaPool = {
      W: fp.manaPool?.white ?? 0,
      U: fp.manaPool?.blue ?? 0,
      B: fp.manaPool?.black ?? 0,
      R: fp.manaPool?.red ?? 0,
      G: fp.manaPool?.green ?? 0,
      C: fp.manaPool?.colorless ?? 0,
    };

    const playerState: PlayerState = {
      id: pid,
      name: fp.name,
      isAI: fp.isAI,
      life: fp.life,
      manaPool,
      commanderDamageReceived: fp.commanderDamage ?? {},
      commanderCastCount: {},
      hasLost: false,
      hasConceded: false,
      poisonCounters: fp.poison ?? 0,
      landPlayedThisTurn: false,
      mulliganCount: 0,
      hasKeptHand: true,
    };
    players.push(playerState);

    // Convert zones
    const zoneEntries: [ZoneType, ForgeCard[]][] = [
      ['hand', fp.hand ?? []],
      ['battlefield', fp.battlefield ?? []],
      ['graveyard', fp.graveyard ?? []],
      ['exile', fp.exile ?? []],
      ['command', fp.command ?? []],
    ];

    for (const [zoneType, forgeCards] of zoneEntries) {
      const cardIds: string[] = [];

      for (const fc of forgeCards) {
        const instanceId = `forge-${fc.id}`;
        cardIds.push(instanceId);

        const cardData = forgeCardToCardData(fc);
        const cardInstance: CardInstance = {
          instanceId,
          cardData,
          ownerId: pid,
          controllerId: fc.controllerId != null ? (playerIdMap.get(fc.controllerId) ?? pid) : pid,
          zone: zoneType,
          tapped: fc.tapped ?? false,
          flipped: fc.flipped ?? false,
          faceDown: fc.faceDown ?? false,
          counters: fc.counters ?? {},
          attachedTo: undefined,
          attachments: [],
          damage: fc.damage ?? 0,
          summoningSick: fc.sick ?? false,
          abilities: [],
        };

        // Handle equipment/aura attachments
        if (fc.equippedBy) {
          cardInstance.attachments.push(
            ...fc.equippedBy.map((eq) => `forge-${eq.id}`)
          );
        }
        if (fc.enchantedBy) {
          cardInstance.attachments.push(
            ...fc.enchantedBy.map((a) => `forge-${a.id}`)
          );
        }

        cardInstances.set(instanceId, cardInstance);
      }

      zones.set(`${zoneType}:${pid}`, {
        type: zoneType,
        ownerId: pid,
        cards: cardIds,
      });
    }

    // Library zone (no card data, just count)
    const libCards: string[] = [];
    for (let i = 0; i < (fp.librarySize ?? 0); i++) {
      const libId = `forge-lib-${fp.id}-${i}`;
      libCards.push(libId);
    }
    zones.set(`library:${pid}`, {
      type: 'library',
      ownerId: pid,
      cards: libCards,
    });
  }

  // Turn state
  const forgePhase = forgeState.turn?.phase ?? 'MAIN1';
  const activePlayerId = playerIdMap.get(forgeState.turn?.activePlayerId ?? 0) ?? 'player-human';

  const turn: TurnState = {
    turnNumber: forgeState.turn?.turnNumber ?? 1,
    activePlayerId,
    phase: PHASE_MAP[forgePhase] ?? 'precombat_main',
    step: STEP_MAP[forgePhase] ?? 'main',
    landsPlayedThisTurn: 0,
    maxLandsPerTurn: 1,
    extraCombatPhases: 0,
  };

  // Priority
  const priorityPlayerName = forgeState.turn?.priorityPlayer ?? '';
  const priorityPlayer = forgeState.players.find((p) => p.name === priorityPlayerName);
  const priorityPlayerId = priorityPlayer ? (playerIdMap.get(priorityPlayer.id) ?? activePlayerId) : activePlayerId;

  const priority: PriorityState = {
    playerWithPriority: priorityPlayerId,
    passedPlayers: new Set<string>(),
    waitingForResponse: false,
  };

  // Stack
  const stack: StackItem[] = (forgeState.stack ?? []).map((si, i) => ({
    id: `stack-${i}`,
    type: si.cardId != null ? 'spell' as const : 'ability' as const,
    sourceInstanceId: si.cardId != null ? `forge-${si.cardId}` : `stack-src-${i}`,
    controllerId: (() => {
      const controllerPlayer = forgeState.players.find((p) => p.name === si.controller);
      return controllerPlayer ? (playerIdMap.get(controllerPlayer.id) ?? activePlayerId) : activePlayerId;
    })(),
    cardData: si.cardName ? { name: si.cardName, typeLine: '', manaCost: '', cmc: 0, oracleText: si.description, colors: [], colorIdentity: [], keywords: [], scryfallId: '', oracleId: '', layout: 'normal', legalities: {} } as CardData : undefined,
    targets: [],
  }));

  return {
    id: `forge-${forgeState.gameId ?? 0}`,
    players,
    cardInstances,
    zones,
    stack,
    turn,
    priority,
    combat: null, // TODO: map combat state
    pendingChoice: null, // Handled separately by forgeGameStore
    events: [],
    winner: null,
    isGameOver: forgeState.isGameOver ?? false,
    mulliganPhase: forgePhase === 'MULLIGAN',
  };
}

/**
 * Convert a ForgeCard to our CardData format.
 * This creates a synthetic CardData without Scryfall images.
 * Images can be looked up later via the CardDatabase by name.
 */
function forgeCardToCardData(fc: ForgeCard): CardData {
  // Parse mana cost string to extract colors
  const colors: CardData['colors'] = [];
  const costStr = fc.manaCost ?? '';
  if (costStr.includes('W')) colors.push('W');
  if (costStr.includes('U')) colors.push('U');
  if (costStr.includes('B')) colors.push('B');
  if (costStr.includes('R')) colors.push('R');
  if (costStr.includes('G')) colors.push('G');

  // Calculate CMC from mana cost
  let cmc = 0;
  const manaSymbols = costStr.match(/\{([^}]+)\}/g) ?? [];
  for (const sym of manaSymbols) {
    const inner = sym.replace(/[{}]/g, '');
    const num = parseInt(inner, 10);
    if (!isNaN(num)) {
      cmc += num;
    } else {
      cmc += 1; // Each colored symbol is 1 mana
    }
  }

  // Determine produced mana for lands
  let producedMana: string[] | undefined;
  const typeLine = fc.typeLine ?? '';
  if (typeLine.includes('Land')) {
    producedMana = [];
    const oracleText = fc.oracleText ?? '';
    if (typeLine.includes('Plains') || oracleText.includes('{W}')) producedMana.push('W');
    if (typeLine.includes('Island') || oracleText.includes('{U}')) producedMana.push('U');
    if (typeLine.includes('Swamp') || oracleText.includes('{B}')) producedMana.push('B');
    if (typeLine.includes('Mountain') || oracleText.includes('{R}')) producedMana.push('R');
    if (typeLine.includes('Forest') || oracleText.includes('{G}')) producedMana.push('G');
    if (producedMana.length === 0) producedMana.push('C');
  }

  return {
    scryfallId: '',
    oracleId: '',
    name: fc.name ?? '???',
    manaCost: costStr,
    cmc,
    typeLine,
    oracleText: fc.oracleText ?? '',
    colors,
    colorIdentity: colors,
    keywords: fc.keywords ?? [],
    power: fc.basePower != null ? String(fc.basePower) : (fc.power != null ? String(fc.power) : undefined),
    toughness: fc.baseToughness != null ? String(fc.baseToughness) : (fc.toughness != null ? String(fc.toughness) : undefined),
    loyalty: fc.loyalty != null ? String(fc.loyalty) : undefined,
    producedMana,
    layout: 'normal',
    legalities: { commander: 'legal' },
    imageUris: undefined, // Will be resolved from Scryfall cache if available
    cardFaces: undefined,
  };
}
