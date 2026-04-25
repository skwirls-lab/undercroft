import { create } from 'zustand';
import type { GameState, GameAction, GameEvent, CardData } from '@/engine/types';
import { GameEngine } from '@/engine/GameEngine';
import { AIPlayerController } from '@/ai/AIPlayerController';
import type { AIPlayerConfig } from '@/ai/types';
import {
  sfxTapLand, sfxCastSpell, sfxPlayCard, sfxDamage,
  sfxLifeGain, sfxTurnStart, sfxGameOver, sfxPassPriority
} from '@/lib/audio';
import { initForgeData } from '@/engine/ForgeLookup';

interface GameStore {
  engine: GameEngine | null;
  gameState: GameState | null;
  legalActions: GameAction[];
  events: GameEvent[];
  isProcessing: boolean;
  aiControllers: Map<string, AIPlayerController>;
  autoPassUntilNextTurn: boolean;
  lockedTappedIds: Set<string>;

  // Forge server mode
  forgeMode: boolean;
  forgePendingRequestId: string | null;
  forgeRespondFn: ((requestId: string, payload: Record<string, unknown>) => void) | null;

  initGame: (
    players: Array<{ id: string; name: string; isAI: boolean }>,
    decks: Map<string, CardData[]>,
    aiConfigs?: AIPlayerConfig[]
  ) => void;
  performAction: (action: GameAction) => void;
  processAITurn: () => Promise<void>;
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
  engine: null,
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
      engine: null,
      gameState: null,
      legalActions: [],
      events: [],
      isProcessing: false,
      aiControllers: new Map(),
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

  initGame: (players, decks, aiConfigs) => {
    // Load Forge card data (fire-and-forget; lookups before load return null → regex fallback)
    initForgeData();

    const engine = new GameEngine(players, decks);
    const result = engine.startGame();

    const aiControllers = new Map<string, AIPlayerController>();
    if (aiConfigs) {
      for (const config of aiConfigs) {
        aiControllers.set(config.playerId, new AIPlayerController(config));
      }
    }

    set({
      engine,
      gameState: result.newState,
      legalActions: result.legalActions,
      events: result.events,
      aiControllers,
    });
  },

  performAction: (action) => {
    const { engine, gameState: prevState, forgeMode, forgePendingRequestId, forgeRespondFn } = get();
    if (forgeMode) {
      // In forge mode, map game actions to WebSocket choice responses
      console.log('[Forge] performAction', {
        type: action.type,
        hasPendingRequest: !!forgePendingRequestId,
        hasRespondFn: !!forgeRespondFn,
        payload: action.payload,
      });
      if (!forgePendingRequestId || !forgeRespondFn) {
        console.warn('[Forge] No pending request — action dropped');
        return;
      }
      if (action.type === 'PASS_PRIORITY') {
        console.log('[Forge] Sending pass response for request', forgePendingRequestId);
        forgeRespondFn(forgePendingRequestId, { pass: true });
      } else {
        const forgeIdx = action.payload?.forgeAbilityIndex as number | undefined;
        if (forgeIdx != null) {
          console.log('[Forge] Sending abilityIndex', forgeIdx, 'for request', forgePendingRequestId);
          forgeRespondFn(forgePendingRequestId, { abilityIndex: forgeIdx });
        } else {
          console.warn('[Forge] No forgeAbilityIndex in payload — action dropped');
          return;
        }
      }
      set({ forgePendingRequestId: null, forgeRespondFn: null, legalActions: [] });
      return;
    }
    if (!engine) return;

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

    const result = engine.processAction(action);

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
    for (const evt of result.events) {
      if (evt.type === 'DAMAGE_DEALT') sfxDamage();
      else if (evt.type === 'LIFE_CHANGED' && (evt.data?.amount as number) > 0) sfxLifeGain();
      else if (evt.type === 'TURN_STARTED' && evt.data?.playerId === 'player-human') sfxTurnStart();
      else if (evt.type === 'PLAYER_WON' || evt.type === 'GAME_OVER') sfxGameOver();
    }

    // Lock lands that ETB tapped — they must not be untappable via undo
    if (action.type === 'PLAY_LAND') {
      const cardId = action.payload.cardInstanceId as string;
      const card = result.newState.cardInstances.get(cardId);
      if (card?.tapped) {
        const newLocked = new Set(newLockedIds);
        newLocked.add(cardId);
        newLockedIds = newLocked;
      }
    }

    // Clear locks if the step/phase changed (fresh priority window)
    const stepChanged = prevState && (
      result.newState.turn.step !== prevState.turn.step ||
      result.newState.turn.phase !== prevState.turn.phase ||
      result.newState.turn.turnNumber !== prevState.turn.turnNumber
    );
    if (stepChanged) {
      newLockedIds = new Set();
    }

    set({
      gameState: result.newState,
      legalActions: result.legalActions,
      events: [...get().events, ...result.events],
      lockedTappedIds: newLockedIds,
    });
  },

  processAITurn: async () => {
    const { engine, gameState, aiControllers, forgeMode } = get();
    if (forgeMode) return; // Server handles AI turns
    if (!engine || !gameState || gameState.isGameOver) return;

    // Handle pending choices for AI players first
    if (gameState.pendingChoice) {
      const choicePlayer = gameState.players.find(p => p.id === gameState.pendingChoice!.playerId);
      if (choicePlayer?.isAI) {
        set({ isProcessing: true });
        await new Promise((resolve) => setTimeout(resolve, 300));
        const pending = gameState.pendingChoice;
        let payload: Record<string, unknown> = {};
        if (pending.type === 'confirm_ability') {
          payload = { confirmed: true };
        } else {
          // AI auto-picks the first matching card for search
          const chosenCardIds = pending.cardInstanceIds && pending.cardInstanceIds.length > 0
            ? [pending.cardInstanceIds[0]]
            : [];
          payload = { chosenCardIds };
        }
        const result = engine.processAction({
          type: 'RESOLVE_CHOICE',
          playerId: pending.playerId,
          payload,
          timestamp: Date.now(),
        });
        set({
          gameState: result.newState,
          legalActions: result.legalActions,
          events: [...get().events, ...result.events],
          isProcessing: false,
        });
        return;
      }
      return; // Human player has pending choice — don't process AI turn
    }

    const currentPlayerId = gameState.priority.playerWithPriority;
    const currentPlayer = gameState.players.find((p) => p.id === currentPlayerId);
    if (!currentPlayer?.isAI) return;

    const controller = aiControllers.get(currentPlayerId);
    if (!controller) return;

    set({ isProcessing: true });

    try {
      const legalActions = engine.getLegalActionsForPlayer(currentPlayerId);
      const decision = await controller.makeDecision(gameState, legalActions);

      // Small delay to make AI actions visible
      await new Promise((resolve) => setTimeout(resolve, 500));

      const result = engine.processAction(decision.action);
      set({
        gameState: result.newState,
        legalActions: result.legalActions,
        events: [...get().events, ...result.events],
      });
    } catch (error) {
      console.error('AI turn error:', error);
    } finally {
      set({ isProcessing: false });
    }
  },

  resetGame: () => {
    set({
      engine: null,
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
