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
import type { GameAction } from '@/engine/types';

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
        set({ gameState: state });
        // Push adapted state into the main gameStore so existing UI components work
        const adapted = adaptForgeState(state);
        // Diagnostic: trace zone contents
        for (const p of adapted.players) {
          const hand = adapted.zones.get(`hand:${p.id}`);
          const bf = adapted.zones.get(`battlefield:${p.id}`);
          const gy = adapted.zones.get(`graveyard:${p.id}`);
          const cmd = adapted.zones.get(`command:${p.id}`);
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
        useGameStore.getState().setForgeState(adapted);
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
              actionType = card.cardData.typeLine?.toLowerCase().includes('land')
                ? 'TAP_FOR_MANA' : 'ACTIVATE_ABILITY';
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
          console.log('[Forge] non-action choice received', { choiceType: choice.choiceType, requestId: choice.requestId, dataKeys: Object.keys(choice.data || {}) });
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
