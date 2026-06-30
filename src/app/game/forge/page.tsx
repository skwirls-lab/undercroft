'use client';

import React, { useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { GameBoard } from '@/components/game/GameBoard';
import { Hand } from '@/components/game/Hand';
import { GameLog } from '@/components/game/GameLog';
import { CardPreviewProvider, useCardPreview } from '@/components/game/CardPreviewContext';
import { ForgeChoiceOverlay } from '@/components/game/ForgeChoiceOverlay';
import { Button } from '@/components/ui/button';
import { getCardsInZone } from '@/lib/ZoneManager';
import { cn } from '@/lib/utils';
import { CardView } from '@/components/game/CardView';
import type { CardInstance } from '@/lib/gameTypes';
import {
  ArrowLeft,
  Loader2,
  Flag,
  RotateCcw,
  Play,
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

  const { gameState, legalActions, performAction } = useGameStore();

  // Hand data — derived from gameStore so the hand can live outside GameBoard
  const handCardIds = gameState ? getCardsInZone(gameState, HUMAN_PLAYER_ID, 'hand') : [];
  const handCards = handCardIds
    .map(id => gameState?.cardInstances.get(id))
    .filter((c): c is CardInstance => !!c);

  const commandZoneIds = gameState ? getCardsInZone(gameState, HUMAN_PLAYER_ID, 'command') : [];
  const commandZoneCards = commandZoneIds
    .map(id => gameState?.cardInstances.get(id))
    .filter((c): c is CardInstance => !!c)
    .filter(c => {
      const typeLine = (c.cardData.typeLine || '').toLowerCase();
      return typeLine.includes('legendary') || typeLine.includes('planeswalker');
    });
  const hasPriority = gameState?.priority.playerWithPriority === HUMAN_PLAYER_ID;
  const handLegalActions = hasPriority ? legalActions : [];

  const handleForgePlayCard = useCallback((card: CardInstance) => {
    const cardActions = legalActions.filter(
      a => (a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL') &&
        a.payload.cardInstanceId === card.instanceId
    );
    if (cardActions.length > 0) performAction(cardActions[0]);
  }, [legalActions, performAction]);

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

        {/* Full-width main area — no sidebar */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">

            {/* Game Over banner */}
            {isGameOver && (
              <div className="shrink-0 mx-2 mt-2 rounded-xl border border-gold/30 bg-gold/10 p-4 text-center">
                <h2 className="text-xl font-bold text-gold">Game Over</h2>
                <p className="mt-1 text-base">{winner === 'draw' ? 'Draw!' : `Winner: ${winner}`}</p>
                <Button className="mt-3" onClick={() => { disconnect(); router.push('/game'); }}>
                  New Game
                </Button>
              </div>
            )}

            {/* Board — overflow-hidden, NO scroll at all */}
            <div className="flex-1 min-h-0 overflow-hidden p-1.5">
              <GameBoard
                currentPlayerId={HUMAN_PLAYER_ID}
                hideHand
                hideCommandZone
                className="h-full"
                manaPaymentSourceIds={manaPaymentData?.sourceIdSet}
                manaPaymentInfo={manaPaymentData ? { manaCost: manaPaymentData.manaCost, spellName: manaPaymentData.spellName } : undefined}
                onTapForManaPayment={manaPaymentData ? handleTapForManaPayment : undefined}
                onCancelManaPayment={manaPaymentData ? handleCancelManaPayment : undefined}
              />
              <ForgeChoiceOverlay />
            </div>

            {/* Bottom bar — card preview | commander+hand | game log */}
            <div className="shrink-0 border-t border-border/20 bg-background/90 backdrop-blur-xl shadow-[0_-8px_32px_rgba(0,0,0,0.35)] flex items-stretch">

              {/* Center: Commander (if any) + Hand */}
              <div className="flex-1 min-w-0 px-2 pt-1 pb-1 flex flex-col">
                <div className="mb-0.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                      Hand · {handCards.length}
                    </span>
                    {commandZoneCards.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/30 uppercase tracking-widest font-semibold">
                        · Commander
                      </span>
                    )}
                  </div>
                  {hasPriority && !isGameOver && (
                    <span className="text-[10px] text-muted-foreground/40 italic">tap · play</span>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  {/* Commander zone cards */}
                  {commandZoneCards.map(card => {
                    const canCast = legalActions.some(
                      a => a.type === 'CAST_SPELL' && (a.payload as Record<string,unknown>).cardInstanceId === card.instanceId
                    );
                    return (
                      <CommanderCard
                        key={card.instanceId}
                        card={card}
                        canCast={canCast}
                        onPlay={() => handleForgePlayCard(card)}
                      />
                    );
                  })}
                  {/* Hand */}
                  <div className="flex-1 min-w-0">
                    <Hand
                      cards={handCards}
                      legalActions={handLegalActions}
                      onPlayCard={handleForgePlayCard}
                      isActive={!!hasPriority && !isGameOver}
                    />
                  </div>
                </div>
              </div>

              {/* Right: Game Log (desktop only) */}
              <div className="hidden lg:block w-[200px] shrink-0 border-l border-border/20 overflow-hidden">
                <GameLog
                  events={gameEvents.map((e, i) => ({
                    type: String(e.eventType) as 'CARD_PLAYED',
                    data: e as Record<string, unknown>,
                    timestamp: Date.now() - (gameEvents.length - i) * 100,
                    id: `f${i}`,
                  }))}
                  currentPlayerId={HUMAN_PLAYER_ID}
                  collapsible={false}
                  className="h-full rounded-none border-0"
                />
              </div>
            </div>
          </main>
        </div>
      </div>
      <CardPreviewFloating />
    </CardPreviewProvider>
  );
}

// ============================================================
// CommanderCard — needs useCardPreview() so must be a child
// of CardPreviewProvider (not called at ForgeGamePage top level)
// ============================================================
function CommanderCard({
  card,
  canCast,
  onPlay,
}: {
  card: CardInstance;
  canCast: boolean;
  onPlay: () => void;
}) {
  const { previewCard, setPreviewCard } = useCardPreview();
  const isSelected = previewCard?.instanceId === card.instanceId;

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isSelected) {
      setPreviewCard(null);
    } else {
      setPreviewCard(card);
    }
  };

  const handlePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewCard(null);
    onPlay();
  };

  return (
    <div className="shrink-0 flex flex-col items-center gap-0.5">
      <span className={cn(
        'text-[8px] font-bold uppercase tracking-wider',
        canCast ? 'text-gold' : 'text-muted-foreground/30'
      )}>⚜ Cmd</span>
      <div
        onClick={handleTap}
        className={cn(
          'relative rounded-lg transition-all duration-150 cursor-pointer',
          isSelected && 'ring-2 ring-white/60 scale-110 z-10',
          !isSelected && canCast && 'ring-2 ring-gold/60 shadow-[0_0_14px_rgba(212,169,68,0.35)]',
          !canCast && 'opacity-60 saturate-0'
        )}
      >
        <CardView card={card} mode="art" highlighted={canCast} interactive={false} />
        {isSelected && canCast && (
          <div className="absolute inset-x-0 bottom-1 flex justify-center pointer-events-none">
            <button
              className="pointer-events-auto bg-green-500 hover:bg-green-400 active:bg-green-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg shadow-green-900/60 flex items-center gap-1 touch-manipulation"
              onClick={handlePlay}
            >
              <Play className="h-2.5 w-2.5" />
              Play
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// CardPreviewFloating — fixed overlay, no layout impact
// ============================================================
function CardPreviewFloating() {
  const { previewCard, setPreviewCard } = useCardPreview();
  const imageUrl = previewCard?.cardData.imageUris?.normal
    ?? previewCard?.cardData.cardFaces?.[0]?.imageUris?.normal;

  // Dismiss on any click that is NOT on a card element (data-card-preview-safe).
  // Uses rAF delay so the click that opened the preview doesn't immediately close it.
  useEffect(() => {
    if (!previewCard) return;
    let raf: number;
    let handler: ((e: MouseEvent) => void) | null = null;
    raf = requestAnimationFrame(() => {
      handler = (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest('[data-card-preview-safe]')) return;
        setPreviewCard(null);
        document.removeEventListener('click', handler!);
      };
      document.addEventListener('click', handler);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (handler) document.removeEventListener('click', handler);
    };
  }, [previewCard?.instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {previewCard && (
        <motion.div
          key={previewCard.instanceId}
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 6 }}
          transition={{ duration: 0.12 }}
          className="fixed bottom-56 left-4 z-30 w-[200px] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10 pointer-events-none"
        >
          {imageUrl ? (
            // Plain <img> avoids next/image domain whitelist requirement for external URLs
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={previewCard.cardData.name} className="w-full" />
          ) : (
            <div className="aspect-[5/7] bg-card/80 border border-border/30 flex items-center justify-center p-3">
              <p className="text-xs text-center text-muted-foreground">{previewCard.cardData.name}</p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
