import { create } from 'zustand';
import { useForgeGameStore } from '@/store/forgeGameStore';
import type { GameState, GameAction, GameEvent } from '@/lib/gameTypes';
import {
  sfxTapLand, sfxCastSpell, sfxPlayCard, sfxDamage,
  sfxLifeGain, sfxTurnStart, sfxGameOver, sfxPassPriority
} from '@/lib/audio';

interface GameStore {
  gameState: GameState | null;
  legalActions: GameAction[];
  events: GameEvent[];
  isProcessing: boolean;
  autoPassUntilNextTurn: boolean;
  lockedTappedIds: Set<string>;

  // Forge server mode
  forgeMode: boolean;
  forgePendingRequestId: string | null;
  forgeRespondFn: ((requestId: string, payload: Record<string, unknown>) => void) | null;

  performAction: (action: GameAction) => void;
  resetGame: () => void;
  setAutoPass: (enabled: boolean) => void;

  // Forge state injection
  setForgeState: (gameState: GameState, events?: GameEvent[]) => void;
  enterForgeMode: () => void;
  setForgeLegalActions: (
    actions: GameAction[],
    requestId: string,
    respondFn: (requestId: string, payload: Record<string, unknown>) => void
  ) => void;
  clearForgeLegalActions: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  legalActions: [],
  events: [],
  isProcessing: false,
  aiControllers: new Map(),
  autoPassUntilNextTurn: false,
  lockedTappedIds: new Set(),
  forgeMode: false,
  forgePendingRequestId: null,
  forgeRespondFn: null,

  enterForgeMode: () => {
    set({
      forgeMode: true,
      gameState: null,
      legalActions: [],
      events: [],
      isProcessing: false,
      autoPassUntilNextTurn: false,
      lockedTappedIds: new Set(),
      forgePendingRequestId: null,
      forgeRespondFn: null,
    });
  },

  setForgeState: (gameState, events) => {
    set({
      gameState,
      events: events ?? get().events,
      // Don't clear legalActions here — they're managed by setForgeLegalActions
      isProcessing: false,
    });
  },

  performAction: (action) => {
    const { gameState: prevState, forgeMode, forgePendingRequestId, forgeRespondFn } = get();
    
    if (forgeMode) {
      // NOTE: there is deliberately no auto-pass here. This branch used to call
      // client.handlePriorityPass(), which sent a `priority_response` message the server does
      // not accept (ForgeServer handles only start_game/choice_response/concede/ping). The
      // server answered with an `error`, the pending choice future was never completed, and
      // the game stalled for the full 30-minute CHOICE_TIMEOUT_SECONDS.
      //
      // Auto-pass is handled correctly in forgeGameStore's choose_action handler, which
      // replies to the real requestId via sendChoiceResponse. With no pending request there
      // is nothing for the server to receive anyway, so dropping the action is correct.
      if (!forgePendingRequestId || !forgeRespondFn) {
        console.warn('[Forge] No pending request — action dropped');
        return;
      }
      // Mark the round-trip so the UI can show pending feedback (see forgeGameStore).
      useForgeGameStore.getState().setAwaitingServer(true);

      if (action.type === 'PASS_PRIORITY') {
        forgeRespondFn(forgePendingRequestId, { pass: true });
      } else {
        const forgeIdx = action.payload?.forgeAbilityIndex as number | undefined;
        if (forgeIdx != null) {
          forgeRespondFn(forgePendingRequestId, { abilityIndex: forgeIdx });
        } else {
          console.warn('[Forge] No forgeAbilityIndex in payload — action dropped');
          return;
        }
      }
      set({ forgePendingRequestId: null, forgeRespondFn: null, legalActions: [] });
      return;
    }

    // In local engine mode (deprecated but kept for compatibility)
    if (!get().gameState) return;

    // Lock tapped lands when mana is consumed (casting a spell) or passing priority
    // This prevents the exploit: tap land → cast spell → untap land → re-tap
    let newLockedIds = get().lockedTappedIds;
    if ((action.type === 'PASS_PRIORITY' || action.type === 'CAST_SPELL') && prevState) {
      const newLocked = new Set(newLockedIds);
      for (const [id, card] of prevState.cardInstances) {
        if (card.tapped && card.controllerId === action.playerId) {
          newLocked.add(id);
        }
      }
      newLockedIds = newLocked;
    }

    // TODO: In local engine mode, process action through GameEngine
    // For now, just update state with the action's payload info
    console.log('[GameStore] Local engine mode - action performed:', action.type);

    // Play SFX based on action type (only for human actions)
    if (!prevState?.players.find(p => p.id === action.playerId)?.isAI) {
      switch (action.type) {
        case 'TAP_FOR_MANA': sfxTapLand(); break;
        case 'CAST_SPELL': sfxCastSpell(); break;
        case 'PLAY_LAND': sfxPlayCard(); break;
        case 'PASS_PRIORITY': sfxPassPriority(); break;
      }
    }

    // Play SFX for notable events
    for (const evt of get().events) {
      if (evt.type === 'DAMAGE_DEALT') sfxDamage();
      else if (evt.type === 'LIFE_CHANGED' && (evt.data?.amount as number) > 0) sfxLifeGain();
      else if (evt.type === 'TURN_STARTED' && evt.data?.playerId === 'player-human') sfxTurnStart();
      else if (evt.type === 'PLAYER_WON' || evt.type === 'GAME_OVER') sfxGameOver();
    }

    // Lock lands that ETB tapped — they must not be untappable via undo
    if (action.type === 'PLAY_LAND') {
      const cardId = action.payload.cardInstanceId as string;
      const card = prevState?.cardInstances.get(cardId);
      if (card?.tapped) {
        const newLocked = new Set(newLockedIds);
        newLocked.add(cardId);
        newLockedIds = newLocked;
      }
    }

    // Clear locks if the step/phase changed (fresh priority window)
    const stepChanged = prevState && (
      get().gameState?.turn.step !== prevState.turn.step ||
      get().gameState?.turn.phase !== prevState.turn.phase ||
      get().gameState?.turn.turnNumber !== prevState.turn.turnNumber
    );
    if (stepChanged) {
      newLockedIds = new Set();
    }

    set({
      lockedTappedIds: newLockedIds,
    });
  },

  resetGame: () => {
    set({
      gameState: null,
      legalActions: [],
      events: [],
      isProcessing: false,
      autoPassUntilNextTurn: false,
      lockedTappedIds: new Set(),
      forgeMode: false,
      forgePendingRequestId: null,
      forgeRespondFn: null,
    });
  },

  setAutoPass: (enabled) => set({ autoPassUntilNextTurn: enabled }),

  setForgeLegalActions: (actions, requestId, respondFn) => {
    set({
      legalActions: actions,
      forgePendingRequestId: requestId,
      forgeRespondFn: respondFn,
    });
  },

  clearForgeLegalActions: () => {
    set({
      legalActions: [],
      forgePendingRequestId: null,
      forgeRespondFn: null,
    });
  },
}));
