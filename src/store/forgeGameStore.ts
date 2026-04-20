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
  startGame: (deckList: string[], commander?: string, playerName?: string) => void;
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
      },

      onChoiceRequest: (choice) => {
        set({ pendingChoice: choice });
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

  startGame: (deckList, commander, playerName) => {
    const { client } = get();
    if (client) {
      set({
        gameState: null,
        pendingChoice: null,
        gameEvents: [],
        isGameOver: false,
        winner: null,
      });
      client.startGame(deckList, commander, playerName);
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
