'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useGameStore } from '@/store/gameStore';
import { GameBoard } from '@/components/game/GameBoard';
import { GameLog } from '@/components/game/GameLog';
import { CardPreviewProvider } from '@/components/game/CardPreviewContext';
import { CardPreviewPanel } from '@/components/game/CardPreviewPanel';
import { Button } from '@/components/ui/button';
import { ArrowLeft, RotateCcw } from 'lucide-react';

const HUMAN_PLAYER_ID = 'player-human';

export default function GamePlayPage() {
  const { gameState, events, isProcessing, processAITurn, resetGame, autoPassUntilNextTurn, setAutoPass, performAction, legalActions } = useGameStore();
  const aiLoopRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI turn loop — when the player with priority is AI, process their turn
  useEffect(() => {
    if (!gameState || gameState.isGameOver || isProcessing) return;

    const currentPriorityPlayer = gameState.players.find(
      (p) => p.id === gameState.priority.playerWithPriority
    );

    // Handle AI pending choices (e.g., sacrifice confirm, search library)
    const aiHasPendingChoice = gameState.pendingChoice &&
      gameState.players.find(p => p.id === gameState.pendingChoice!.playerId)?.isAI;

    if (currentPriorityPlayer?.isAI || aiHasPendingChoice) {
      aiLoopRef.current = setTimeout(() => {
        processAITurn();
      }, 600);
    } else if (
      autoPassUntilNextTurn &&
      currentPriorityPlayer &&
      !currentPriorityPlayer.isAI &&
      currentPriorityPlayer.id === HUMAN_PLAYER_ID &&
      !gameState.pendingChoice
    ) {
      if (gameState.turn.activePlayerId === HUMAN_PLAYER_ID && gameState.turn.step === 'untap') {
        setAutoPass(false);
      } else {
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
    <CardPreviewProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between border-b border-border/30 px-4 py-2 shrink-0">
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

        {/* Two-column layout: game board + sidebar */}
        <div className="flex flex-1 min-h-0">
          {/* Main game area — scrollable */}
          <main className="flex-1 overflow-auto p-3">
            <GameBoard currentPlayerId={HUMAN_PLAYER_ID} />
          </main>

          {/* Right sidebar — card preview + game log */}
          <aside className="hidden lg:flex w-[260px] shrink-0 border-l border-border/20 bg-card/10 flex-col overflow-hidden">
            <div className="p-3 shrink-0">
              <CardPreviewPanel />
            </div>
            <div className="flex-1 min-h-0 border-t border-border/10">
              <GameLog
                events={events}
                currentPlayerId={HUMAN_PLAYER_ID}
                collapsible={false}
                className="h-full rounded-none border-0"
              />
            </div>
          </aside>
        </div>
      </div>
    </CardPreviewProvider>
  );
}
