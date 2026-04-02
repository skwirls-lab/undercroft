'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/store/gameStore';
import { GameBoard } from '@/components/game/GameBoard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';

const HUMAN_PLAYER_ID = 'player-human';

export default function GamePlayPage() {
  const { gameState, isProcessing, processAITurn, resetGame, autoPassUntilNextTurn, setAutoPass, performAction, legalActions } = useGameStore();
  const aiLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI turn loop — when the player with priority is AI, process their turn
  useEffect(() => {
    if (!gameState || gameState.isGameOver || isProcessing) return;

    const currentPriorityPlayer = gameState.players.find(
      (p) => p.id === gameState.priority.playerWithPriority
    );

    if (currentPriorityPlayer?.isAI) {
      aiLoopRef.current = setTimeout(() => {
        processAITurn();
      }, 600);
    } else if (
      autoPassUntilNextTurn &&
      currentPriorityPlayer &&
      !currentPriorityPlayer.isAI &&
      currentPriorityPlayer.id === HUMAN_PLAYER_ID
    ) {
      // Auto-pass is enabled — check if it's our turn starting (disable auto-pass)
      if (gameState.turn.activePlayerId === HUMAN_PLAYER_ID && gameState.turn.step === 'untap') {
        setAutoPass(false);
      } else {
        // Auto-pass priority
        const passAction = legalActions.find((a: { type: string }) => a.type === 'PASS_PRIORITY');
        if (passAction) {
          aiLoopRef.current = setTimeout(() => {
            performAction(passAction);
          }, 100);
        }
      }
    }

    return () => {
      if (aiLoopRef.current) clearTimeout(aiLoopRef.current);
    };
  }, [gameState, isProcessing, processAITurn, autoPassUntilNextTurn, setAutoPass, performAction, legalActions]);

  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">No active game. Start one from the game setup page.</p>
        <Link href="/game">
          <Button variant="secondary">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Game Setup
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Home
            </Button>
          </Link>
          <h2 className="text-sm font-semibold tracking-tight text-gold">
            Undercroft
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetGame();
            }}
            className="gap-1 text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </header>

      {/* Game board */}
      <main className="flex-1 overflow-auto p-3">
        <GameBoard currentPlayerId={HUMAN_PLAYER_ID} />
      </main>
    </div>
  );
}
