/**
 * forgeGameStore — Zustand store that bridges the Forge server protocol
 * to our existing React UI components.
 *
 * This replaces the local gameStore's engine usage with WebSocket calls.
 * The UI components (GameBoard, PlayerField, Hand, etc.) remain unchanged —
 * they read the same state shape and dispatch the same actions.
 */

import { create } from 'zustand';
import {
  ForgeGameClient,
  ForgeGameState,
  ForgeChoiceRequest,
  ForgeGameEvent,
  ForgeCard,
  ForgePlayer,
  ConnectionStatus,
} from '@/lib/forgeClient';
import { adaptForgeState } from '@/lib/forgeStateAdapter';
import { useGameStore } from '@/store/gameStore';
import type { GameAction, GameState, CardData } from '@/lib/gameTypes';

// ===================================================================
// Image URL cache — persists for the game session so we don't
// re-fetch Firestore for the same card name on every state update
// ===================================================================
const imageUrisCache = new Map<string, CardData['imageUris'] | null>();

async function enrichAndUpdateImages(adapted: GameState) {
  const namesToFetch: string[] = [];
  for (const [, instance] of adapted.cardInstances) {
    const name = instance.cardData.name;
    if (!name || name === '???' || imageUrisCache.has(name)) continue;
    namesToFetch.push(name);
  }

  const uniqueNames = [...new Set(namesToFetch)];
  if (uniqueNames.length > 0) {
    try {
      const { resolveCardNames } = await import('@/lib/firebase/cards');
      const resolved = await resolveCardNames(uniqueNames);

      for (const [name, card] of resolved) {
        if (card?.image_uris) {
          imageUrisCache.set(name, {
            artCrop: card.image_uris.art_crop || undefined,
            normal: card.image_uris.normal || undefined,
            small: card.image_uris.small || undefined,
            large: card.image_uris.large || undefined,
          });
        } else {
          imageUrisCache.set(name, null);
        }
      }
    } catch (err) {
      console.error('[ForgeGameStore] Failed to fetch card images:', err);
      return;
    }
  }

  // Enrich card instances that are still missing imageUris
  const enrichedInstances = new Map(adapted.cardInstances);
  let anyChanged = false;

  for (const [id, instance] of enrichedInstances) {
    const name = instance.cardData.name;
    const cachedUris = imageUrisCache.get(name);
    if (cachedUris !== undefined && !instance.cardData.imageUris) {
      enrichedInstances.set(id, {
        ...instance,
        cardData: { ...instance.cardData, imageUris: cachedUris ?? undefined },
      });
      anyChanged = true;
    }
  }

  if (anyChanged) {
    useGameStore.getState().setForgeState({ ...adapted, cardInstances: enrichedInstances });
  }
}

// Re-use existing UI types where possible
export interface ForgeGameStoreState {
  // Connection
  connectionStatus: ConnectionStatus;
  client: ForgeGameClient | null;

  // Game state (mapped from Forge server)
  gameState: ForgeGameState | null;
  pendingChoice: ForgeChoiceRequest | null;
  gameEvents: ForgeGameEvent[];
  isGameOver: boolean;
  winner: string | null;

  // Actions
  connect: (serverUrl: string) => Promise<void>;
  disconnect: () => void;
  startGame: (deckList: string[], commander?: string, playerName?: string, aiCount?: number) => void;
  respondToChoice: (requestId: string, payload: Record<string, unknown>) => void;
  concede: () => void;

  // Helpers
  getHumanPlayer: () => ForgePlayer | null;
  getAIPlayer: () => ForgePlayer | null;
}

export const useForgeGameStore = create<ForgeGameStoreState>((set, get) => ({
  // Initial state
  connectionStatus: 'disconnected',
  client: null,
  gameState: null,
  pendingChoice: null,
  gameEvents: [],
  isGameOver: false,
  winner: null,

  connect: async (serverUrl: string) => {
    const client = new ForgeGameClient(serverUrl, {
      onConnectionChange: (status) => {
        set({ connectionStatus: status });
      },

      onGameState: (state) => {
        const prevState = get().gameState;
        set({ gameState: state });

        // Generate synthetic game events from state changes for the GameLog
        const syntheticEvents: ForgeGameEvent[] = [];
        if (!prevState) {
          syntheticEvents.push({ eventType: 'GAME_STARTED' });
        } else {
          if (prevState.turn.turnNumber !== state.turn.turnNumber) {
            syntheticEvents.push({ eventType: 'TURN_STARTED', turnNumber: state.turn.turnNumber, activePlayer: state.turn.activePlayer } as ForgeGameEvent);
          }
          if (prevState.turn.phase !== state.turn.phase) {
            syntheticEvents.push({ eventType: 'PHASE_CHANGED', phase: state.turn.phase } as ForgeGameEvent);
          }
          for (const player of state.players) {
            const prev = prevState.players.find((p) => p.id === player.id);
            if (prev && prev.life !== player.life) {
              syntheticEvents.push({ eventType: 'LIFE_CHANGED', playerName: player.name, newLife: player.life, oldLife: prev.life } as ForgeGameEvent);
            }
          }
        }
        if (syntheticEvents.length > 0) {
          set((prev) => ({ gameEvents: [...prev.gameEvents.slice(-90), ...syntheticEvents] }));
        }

        // Push adapted state into the main gameStore so existing UI components work
        const adapted = adaptForgeState(state);
        useGameStore.getState().setForgeState(adapted);
        // Async: enrich card instances with Scryfall artwork (cached after first fetch)
        enrichAndUpdateImages(adapted);
        // Diagnostic: trace zone contents
        for (const p of adapted.players) {
          const hand = adapted.zones.get(`${p.id}:hand`);
          const bf = adapted.zones.get(`${p.id}:battlefield`);
          const gy = adapted.zones.get(`${p.id}:graveyard`);
          const cmd = adapted.zones.get(`${p.id}:command`);
          console.log(`[Forge] game_state zones for ${p.name} (${p.id}): hand=${hand?.cards.length ?? 0}, bf=${bf?.cards.length ?? 0}, gy=${gy?.cards.length ?? 0}, cmd=${cmd?.cards.length ?? 0}, life=${p.life}`);
          if (bf && bf.cards.length > 0) {
            console.log(`[Forge]   battlefield:`, bf.cards.map(id => {
              const c = adapted.cardInstances.get(id);
              return c ? `${id}(${c.cardData.name}, tapped=${c.tapped})` : id;
            }));
          }
        }
        if (adapted.stack.length > 0) {
          console.log(`[Forge] stack:`, adapted.stack.map(s => s.cardData?.name ?? s.id));
        }
      },

      onChoiceRequest: (choice) => {
        if (choice.choiceType === 'choose_action') {
          // Convert Forge legalPlays → synthetic GameActions for GameBoard
          const gs = useGameStore.getState();
          const gameState = gs.gameState;
          const data = choice.data as Record<string, unknown>;
          const legalPlays = (data.legalPlays || []) as Array<{
            index: number; description: string; cardName?: string;
            cardId?: number; isSpell?: boolean; isAbility?: boolean;
          }>;
          const canPass = data.canPassPriority as boolean;
          const isMainPhase = data.isMainPhase as boolean;

          // Auto-pass: skip non-main phases / opponent turns when enabled
          if (gs.autoPassUntilNextTurn && canPass) {
            const isMyTurn = gameState?.turn.activePlayerId === 'player-human';
            if (isMainPhase && isMyTurn) {
              useGameStore.getState().setAutoPass(false);
            } else {
              get().client?.sendChoiceResponse(choice.requestId, { pass: true });
              return;
            }
          }

          const actions: GameAction[] = [];
          for (const play of legalPlays) {
            if (play.cardId == null) continue;
            const instanceId = `forge-${play.cardId}`;
            const card = gameState?.cardInstances.get(instanceId);

            let actionType: string;
            if (!card) {
              console.log(`[Forge] action for ${play.cardName}(${instanceId}): card NOT FOUND in gameState`);
              actionType = play.isSpell ? 'CAST_SPELL' : 'ACTIVATE_ABILITY';
            } else if (card.zone === 'hand') {
              actionType = card.cardData.typeLine?.toLowerCase().includes('land')
                ? 'PLAY_LAND' : 'CAST_SPELL';
            } else if (card.zone === 'battlefield') {
              // NOTE: Mana abilities (TAP_FOR_MANA) are NOT sent from the backend anymore.
              // They are handled separately during mana payment flow.
              // All battlefield abilities from legalPlays are now activated abilities.
              actionType = 'ACTIVATE_ABILITY';
            } else if (card.zone === 'command') {
              actionType = 'CAST_SPELL';
            } else {
              actionType = 'ACTIVATE_ABILITY';
            }

            const payload: Record<string, unknown> = {
              cardInstanceId: instanceId,
              forgeAbilityIndex: play.index,
            };
            if (actionType === 'ACTIVATE_ABILITY') payload.ability = 'forge_activated';
            if (card?.zone === 'command') payload.fromZone = 'command';

            actions.push({
              type: actionType as GameAction['type'],
              playerId: 'player-human',
              payload,
              timestamp: Date.now(),
            });
          }

          // Synthetic PASS_PRIORITY so GameBoard's Pass button works
          if (canPass) {
            actions.push({
              type: 'PASS_PRIORITY',
              playerId: 'player-human',
              payload: {},
              timestamp: Date.now(),
            });
          }

          // Push to gameStore — GameBoard will highlight cards & wire clicks
          const respondFn = (rid: string, p: Record<string, unknown>) => {
            console.log('[Forge] respondFn called', { rid, payload: p, hasClient: !!get().client });
            get().client?.sendChoiceResponse(rid, p);
          };
          console.log('[Forge] setForgeLegalActions', {
            requestId: choice.requestId,
            actionCount: actions.length,
            actionTypes: actions.map(a => `${a.type}:${a.payload.cardInstanceId}`),
          });
          useGameStore.getState().setForgeLegalActions(actions, choice.requestId, respondFn);
          set({ pendingChoice: null });
        } else {
          // Non-action choices: show overlay, clear forge legal actions
          console.log('[Forge] non-action choice received', {
            choiceType: choice.choiceType,
            requestId: choice.requestId,
            dataKeys: Object.keys(choice.data || {}),
            data: choice.data,
          });
          useGameStore.getState().clearForgeLegalActions();
          set({ pendingChoice: choice });
        }
      },

      onGameEvent: (event) => {
        set((prev) => ({
          gameEvents: [...prev.gameEvents.slice(-100), event], // Keep last 100 events
        }));
      },

      onGameOver: (payload) => {
        set({
          isGameOver: true,
          winner: payload.winner,
          pendingChoice: null,
        });
      },

      onError: (message) => {
        console.error('[ForgeGameStore] Server error:', message);
      },
    });

    set({ client });
    await client.connect();
  },

  disconnect: () => {
    const { client } = get();
    client?.disconnect();
    imageUrisCache.clear();
    set({
      client: null,
      connectionStatus: 'disconnected',
      gameState: null,
      pendingChoice: null,
      gameEvents: [],
      isGameOver: false,
      winner: null,
    });
  },

  startGame: (deckList, commander, playerName, aiCount) => {
    const { client } = get();
    if (client) {
      set({
        gameState: null,
        pendingChoice: null,
        gameEvents: [],
        isGameOver: false,
        winner: null,
      });
      // Put the main game store into forge mode so existing UI components render correctly
      useGameStore.getState().enterForgeMode();
      client.startGame(deckList, commander, playerName, aiCount);
    }
  },

  respondToChoice: (requestId, payload) => {
    const { client } = get();
    if (client) {
      set({ pendingChoice: null });
      client.sendChoiceResponse(requestId, payload);
    }
  },

  concede: () => {
    const { client } = get();
    client?.concede();
  },

  getHumanPlayer: () => {
    const { gameState } = get();
    return gameState?.players.find((p) => !p.isAI) ?? null;
  },

  getAIPlayer: () => {
    const { gameState } = get();
    return gameState?.players.find((p) => p.isAI) ?? null;
  },
}));

// ===================================================================
// Choice type → UI mapping helpers
// These functions help map Forge's choice requests to our existing
// UI components (SearchPicker, CombatControls, confirm dialogs, etc.)
// ===================================================================

export type UIChoiceType =
  | 'action_menu'      // Choose what to play (main priority prompt)
  | 'target_select'    // Choose targets for a spell/ability
  | 'card_select'      // Choose cards from a list (search, discard, sacrifice)
  | 'confirm'          // Yes/no confirmation
  | 'mulligan'         // Keep/mulligan hand
  | 'combat_attack'    // Declare attackers
  | 'combat_block'     // Declare blockers
  | 'damage_assign'    // Assign combat damage
  | 'scry'             // Scry top/bottom
  | 'type_select'      // Choose a card type/color
  | 'mode_select'      // Choose modes for a modal spell
  | 'unknown';

/** Map a Forge choice_request.choiceType to a UI category */
export function mapChoiceToUI(choiceType: string): UIChoiceType {
  switch (choiceType) {
    case 'choose_action':
      return 'action_menu';
    case 'choose_targets':
    case 'choose_single_entity':
      return 'target_select';
    case 'choose_cards':
    case 'choose_entities':
    case 'choose_permanents_sacrifice':
    case 'choose_permanents_destroy':
    case 'choose_discard':
    case 'mulligan_tuck':
      return 'card_select';
    case 'confirm_action':
    case 'confirm_replacement':
    case 'play_trigger':
    case 'put_on_top':
      return 'confirm';
    case 'mulligan':
      return 'mulligan';
    case 'declare_attackers':
      return 'combat_attack';
    case 'declare_blockers':
      return 'combat_block';
    case 'assign_combat_damage':
      return 'damage_assign';
    case 'scry':
      return 'scry';
    case 'choose_type':
      return 'type_select';
    case 'choose_modes':
    case 'choose_ability':
    case 'choose_single_spell':
    case 'choose_spell_abilities':
      return 'mode_select';
    default:
      return 'unknown';
  }
}

/** Extract display-friendly prompt from a choice request */
export function getChoicePrompt(choice: ForgeChoiceRequest): string {
  const data = choice.data as Record<string, string>;
  return data.prompt || data.message || `Choose: ${choice.choiceType}`;
}

/** Extract card options from a choice request */
export function getChoiceCards(choice: ForgeChoiceRequest): ForgeCard[] {
  const data = choice.data as Record<string, unknown>;
  return (data.options || data.cards || data.hand || data.possibleAttackers || data.possibleBlockers || []) as ForgeCard[];
}
