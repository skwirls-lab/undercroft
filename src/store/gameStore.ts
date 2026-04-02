import { create } from 'zustand';
import type { GameState, GameAction, GameEvent, CardData } from '@/engine/types';
import { GameEngine } from '@/engine/GameEngine';
import { AIPlayerController } from '@/ai/AIPlayerController';
import type { AIPlayerConfig } from '@/ai/types';

interface GameStore {
  engine: GameEngine | null;
  gameState: GameState | null;
  legalActions: GameAction[];
  events: GameEvent[];
  isProcessing: boolean;
  aiControllers: Map<string, AIPlayerController>;
  autoPassUntilNextTurn: boolean;
  lockedTappedIds: Set<string>;

  initGame: (
    players: Array<{ id: string; name: string; isAI: boolean }>,
    decks: Map<string, CardData[]>,
    aiConfigs?: AIPlayerConfig[]
  ) => void;
  performAction: (action: GameAction) => void;
  processAITurn: () => Promise<void>;
  resetGame: () => void;
  setAutoPass: (enabled: boolean) => void;
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

  initGame: (players, decks, aiConfigs) => {
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
    const { engine, gameState: prevState } = get();
    if (!engine) return;

    // If passing priority, lock all currently tapped lands for this player
    let newLockedIds = get().lockedTappedIds;
    if (action.type === 'PASS_PRIORITY' && prevState) {
      const newLocked = new Set(newLockedIds);
      for (const [id, card] of prevState.cardInstances) {
        if (card.tapped && card.controllerId === action.playerId) {
          newLocked.add(id);
        }
      }
      newLockedIds = newLocked;
    }

    const result = engine.processAction(action);

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
    const { engine, gameState, aiControllers } = get();
    if (!engine || !gameState || gameState.isGameOver) return;

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
    });
  },

  setAutoPass: (enabled) => set({ autoPassUntilNextTurn: enabled }),
}));
