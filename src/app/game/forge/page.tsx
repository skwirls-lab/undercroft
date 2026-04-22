'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForgeGameStore, mapChoiceToUI, getChoicePrompt, getChoiceCards } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { GameBoard } from '@/components/game/GameBoard';
import { GameLog } from '@/components/game/GameLog';
import { CardPreviewProvider } from '@/components/game/CardPreviewContext';
import { CardPreviewPanel } from '@/components/game/CardPreviewPanel';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Loader2,
  Shield,
  Zap,
  Flag,
  RotateCcw,
} from 'lucide-react';
import type { ForgeCard, ForgeChoiceRequest } from '@/lib/forgeClient';

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
          <main className="flex-1 overflow-auto p-3">
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

            {/* Choice prompt from Forge server */}
            {pendingChoice && (
              <ChoicePanel choice={pendingChoice} onRespond={respondToChoice} />
            )}

            {/* The existing GameBoard reads from useGameStore (populated by adapter) */}
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

// ============================================================
// Choice panel — Forge server sends choice_request messages
// instead of legal actions. This panel renders those choices.
// ============================================================

function ChoicePanel({ choice, onRespond }: {
  choice: ForgeChoiceRequest;
  onRespond: (requestId: string, payload: Record<string, unknown>) => void;
}) {
  const uiType = mapChoiceToUI(choice.choiceType);
  const prompt = getChoicePrompt(choice);
  const cards = getChoiceCards(choice);
  const data = choice.data as Record<string, unknown>;
  const options = (data.options || []) as Array<{ id: string; label: string; description?: string }>;

  return (
    <div className="mb-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-cyan-400">{prompt}</h3>
      </div>

      {/* Card options */}
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {cards.map((card: ForgeCard, i: number) => (
            <button
              key={card.id ?? i}
              onClick={() => onRespond(choice.requestId, { selectedCardId: card.id, selectedIndex: i })}
              className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium
                         text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              {card.name}
              {card.manaCost && <span className="ml-1 text-muted-foreground">{card.manaCost}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Generic options */}
      {options.length > 0 && cards.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {options.map((opt, i) => (
            <Button
              key={opt.id ?? i}
              variant="secondary"
              size="sm"
              onClick={() => onRespond(choice.requestId, { selectedId: opt.id, selectedIndex: i })}
            >
              {opt.label || opt.id}
            </Button>
          ))}
        </div>
      )}

      {/* Binary choice (yes/no) */}
      {uiType === 'confirm' && cards.length === 0 && options.length === 0 && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { result: true })}>Yes</Button>
          <Button size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { result: false })}>No</Button>
        </div>
      )}

      {/* Mulligan */}
      {uiType === 'mulligan' && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onRespond(choice.requestId, { keepHand: true })}>
            <Shield className="mr-1 h-3.5 w-3.5" /> Keep
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { keepHand: false })}>
            Mulligan
          </Button>
        </div>
      )}

      {/* Fallback: pass/done for unknown types */}
      {uiType === 'unknown' && cards.length === 0 && options.length === 0 && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => onRespond(choice.requestId, { pass: true })}>
            Pass / Done
          </Button>
          <p className="text-xs text-muted-foreground self-center">
            Unhandled choice type: {choice.choiceType}
          </p>
        </div>
      )}

      {/* Debug data */}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground">Raw data</summary>
        <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/50 p-2 text-xs text-muted-foreground">
          {JSON.stringify(choice, null, 2)}
        </pre>
      </details>
    </div>
  );
}
