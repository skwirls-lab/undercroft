'use client';

import React, { useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { GameBoard } from '@/components/game/GameBoard';
import { GameLog } from '@/components/game/GameLog';
import { CardPreviewProvider } from '@/components/game/CardPreviewContext';
import { CardPreviewPanel } from '@/components/game/CardPreviewPanel';
import { ForgeChoiceOverlay } from '@/components/game/ForgeChoiceOverlay';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Loader2,
  Shield,
  Flag,
  RotateCcw,
} from 'lucide-react';

// ============================================================
// Forge Game Page — uses our existing UI components (GameBoard,
// PlayerField, Hand, CardView, etc.) with Forge server state
// pushed through the adapter into useGameStore.
// ============================================================

const HUMAN_PLAYER_ID = 'player-human';

export default function ForgeGamePage() {
  const router = useRouter();
  const {
    connectionStatus,
    gameState: forgeState,
    pendingChoice,
    gameEvents,
    isGameOver,
    winner,
    disconnect,
    respondToChoice,
    concede,
  } = useForgeGameStore();

  const { gameState, events } = useGameStore();

  // Forge-style mana payment: detect mana_payment choice and extract source IDs
  const isManaPayment = pendingChoice?.choiceType === 'mana_payment';
  const manaPaymentData = useMemo(() => {
    if (!isManaPayment || !pendingChoice) return null;
    const data = pendingChoice.data as Record<string, unknown>;
    const sourceIds = (data.sourceIds || []) as number[];
    return {
      sourceIdSet: new Set(sourceIds.map((id: number) => `forge-${id}`)),
      manaCost: (data.manaCost as string) || '?',
      spellName: (data.spellName as string) || 'spell',
      requestId: pendingChoice.requestId,
    };
  }, [isManaPayment, pendingChoice]);

  const handleTapForManaPayment = useCallback((cardInstanceId: string) => {
    if (!manaPaymentData) return;
    // Convert forge-{id} back to numeric id
    const numId = parseInt(cardInstanceId.replace('forge-', ''), 10);
    respondToChoice(manaPaymentData.requestId, { cardId: numId });
  }, [manaPaymentData, respondToChoice]);

  const handleCancelManaPayment = useCallback(() => {
    if (!manaPaymentData) return;
    respondToChoice(manaPaymentData.requestId, { cancel: true });
  }, [manaPaymentData, respondToChoice]);

  // If not connected, redirect back to setup
  useEffect(() => {
    if (connectionStatus === 'disconnected' || connectionStatus === 'error') {
      router.replace('/game');
    }
  }, [connectionStatus, router]);

  // Still connecting or waiting for first game state / choice
  if (connectionStatus !== 'connected' || (!gameState && !isGameOver && !pendingChoice)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
        <p className="text-muted-foreground">Loading game...</p>
      </div>
    );
  }

  // Game in progress — uses existing GameBoard + sidebar
  return (
    <CardPreviewProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        {/* Top bar — matches /game/play layout */}
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
              onClick={concede}
              className="gap-1 text-red-400"
            >
              <Flag className="h-3.5 w-3.5" />
              Concede
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { disconnect(); router.push('/game'); }}
              className="gap-1 text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New Game
            </Button>
          </div>
        </header>

        {/* Two-column layout: game board + sidebar */}
        <div className="flex flex-1 min-h-0">
          {/* Main game area */}
          <main className="flex-1 overflow-auto p-3 flex flex-col">
            {/* Game Over overlay */}
            {isGameOver && (
              <div className="mb-4 rounded-xl border border-gold/30 bg-gold/10 p-6 text-center">
                <h2 className="text-2xl font-bold text-gold">Game Over</h2>
                <p className="mt-2 text-lg">{winner === 'draw' ? 'Draw!' : `Winner: ${winner}`}</p>
                <Button className="mt-4" onClick={() => { disconnect(); router.push('/game'); }}>
                  New Game
                </Button>
              </div>
            )}

            {/* The existing GameBoard reads from useGameStore (populated by adapter) */}
            {/* choose_action is integrated into GameBoard via synthetic legalActions */}
            <GameBoard
              currentPlayerId={HUMAN_PLAYER_ID}
              className="flex-1"
              manaPaymentSourceIds={manaPaymentData?.sourceIdSet}
              manaPaymentInfo={manaPaymentData ? { manaCost: manaPaymentData.manaCost, spellName: manaPaymentData.spellName } : undefined}
              onTapForManaPayment={manaPaymentData ? handleTapForManaPayment : undefined}
              onCancelManaPayment={manaPaymentData ? handleCancelManaPayment : undefined}
            />

            {/* Non-action choice overlays (mulligan, sacrifice, targets, etc.) positioned near bottom */}
            <ForgeChoiceOverlay />
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
