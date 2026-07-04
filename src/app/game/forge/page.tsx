'use client';

import React, { useEffect, useMemo, useCallback, useState } from 'react';
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
import { ManaCostDisplay, OracleText } from '@/components/game/ManaSymbol';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import type { CardInstance } from '@/lib/gameTypes';
import {
  ArrowLeft,
  Loader2,
  Flag,
  RotateCcw,
  Play,
  Hand as HandIcon,
  ChevronUp,
  X,
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
    // Backend sends data.sources as [{id, name, type}, ...] objects
    const sources = (data.sources || []) as Array<{ id: number }>;
    return {
      sourceIdSet: new Set(sources.map((s) => `forge-${s.id}`)),
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

  // Compact layout detection — short height (landscape mobile, small windows)
  const isCompact = useMediaQuery('(max-height: 600px)');
  const [handExpanded, setHandExpanded] = useState(false);

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
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        {/* Top bar — collapses to icon-only on compact */}
        <header className={cn(
          'flex items-center justify-between border-b border-border/30 shrink-0',
          isCompact ? 'px-2 py-0.5' : 'px-4 py-2'
        )}>
          <div className="flex items-center gap-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className={cn(isCompact && 'h-7 w-7 p-0')}>
                <ArrowLeft className="h-3.5 w-3.5" />
                {!isCompact && <span className="ml-1">Home</span>}
              </Button>
            </Link>
            {!isCompact && (
              <h2 className="text-sm font-semibold tracking-tight text-gold">
                Undercroft
              </h2>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={concede}
              className={cn('gap-1 text-red-400', isCompact && 'h-7 w-7 p-0')}
              title="Concede"
            >
              <Flag className="h-3.5 w-3.5" />
              {!isCompact && 'Concede'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { disconnect(); router.push('/game'); }}
              className={cn('gap-1 text-muted-foreground', isCompact && 'h-7 w-7 p-0')}
              title="New Game"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {!isCompact && 'New Game'}
            </Button>
          </div>
        </header>

        {/* Full-width main area — no sidebar */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main className="flex-1 min-h-0 overflow-hidden flex flex-col">

            {/* Game Over banner */}
            {isGameOver && (
              <div className={cn(
                'shrink-0 mx-2 mt-2 rounded-xl border border-gold/30 bg-gold/10 text-center',
                isCompact ? 'p-2' : 'p-4'
              )}>
                <h2 className={cn(isCompact ? 'text-base' : 'text-xl', 'font-bold text-gold')}>Game Over</h2>
                <p className="mt-1 text-sm">{winner === 'draw' ? 'Draw!' : `Winner: ${winner}`}</p>
                <Button size="sm" className="mt-2" onClick={() => { disconnect(); router.push('/game'); }}>
                  New Game
                </Button>
              </div>
            )}

            {/* Board — overflow-hidden, NO scroll at all — gets ALL remaining space */}
            <div className="flex-1 min-h-0 overflow-hidden p-1">
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

            {/* Bottom bar — full on tall viewports, peek strip on compact */}
            {isCompact ? (
              /* ===== COMPACT: peek strip ===== */
              <div
                className="shrink-0 h-[40px] border-t border-border/20 bg-background/95 backdrop-blur-xl shadow-[0_-4px_16px_rgba(0,0,0,0.3)] flex items-center px-3 cursor-pointer"
                onClick={() => setHandExpanded(true)}
              >
                <HandIcon className="h-4 w-4 text-muted-foreground/60 mr-2" />
                <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                  Hand · {handCards.length}
                </span>
                {commandZoneCards.length > 0 && (
                  <span className="text-[11px] text-muted-foreground/40 ml-2">· Cmd {commandZoneCards.length}</span>
                )}
                {hasPriority && !isGameOver && (
                  <span className="ml-auto text-[10px] text-emerald-400/60 font-medium">Your turn</span>
                )}
                <ChevronUp className="h-4 w-4 text-muted-foreground/40 ml-2" />
              </div>
            ) : (
              /* ===== FULL: standard bottom bar ===== */
              <div className="shrink-0 h-[186px] border-t border-border/20 bg-background/90 backdrop-blur-xl shadow-[0_-8px_32px_rgba(0,0,0,0.35)] flex items-stretch overflow-hidden">

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
                <div className="hidden lg:flex lg:flex-col w-[220px] shrink-0 border-l border-border/20 overflow-hidden">
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
            )}
          </main>
        </div>
      </div>

      {/* Compact hand overlay — full-screen when expanded */}
      <AnimatePresence>
        {isCompact && handExpanded && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2">
                <HandIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Hand · {handCards.length}</span>
                {commandZoneCards.length > 0 && (
                  <span className="text-xs text-muted-foreground/50">· Commander</span>
                )}
              </div>
              <button
                onClick={() => setHandExpanded(false)}
                className="rounded-lg bg-muted/30 p-1.5 text-muted-foreground hover:bg-muted/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {/* Commander cards */}
              {commandZoneCards.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">Commander</p>
                  <div className="flex flex-wrap gap-2">
                    {commandZoneCards.map(card => {
                      const canCast = legalActions.some(
                        a => a.type === 'CAST_SPELL' && (a.payload as Record<string,unknown>).cardInstanceId === card.instanceId
                      );
                      return (
                        <CommanderCard
                          key={card.instanceId}
                          card={card}
                          canCast={canCast}
                          onPlay={() => { handleForgePlayCard(card); setHandExpanded(false); }}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
              {/* Hand cards */}
              <div className="flex flex-wrap gap-2 justify-center">
                <Hand
                  cards={handCards}
                  legalActions={handLegalActions}
                  onPlayCard={(card) => { handleForgePlayCard(card); setHandExpanded(false); }}
                  isActive={!!hasPriority && !isGameOver}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <CardPreviewFloating isCompact={isCompact} handExpanded={handExpanded} />
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
function CardPreviewFloating({ isCompact, handExpanded }: { isCompact?: boolean; handExpanded?: boolean }) {
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

  // Hide preview when hand overlay is open
  if (handExpanded) return null;

  return (
    <AnimatePresence>
      {previewCard && (
        <motion.div
          key={previewCard.instanceId}
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 6 }}
          transition={{ duration: 0.12 }}
          className={cn(
            'fixed left-1/2 -translate-x-1/2 z-30 flex items-start gap-2',
            isCompact ? 'bottom-[48px]' : 'bottom-[194px]'
          )}
        style={{ pointerEvents: 'none' }}
        >
          {/* Card image — non-interactive */}
          <div className="w-[220px] shrink-0 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10" style={{ pointerEvents: 'none' }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={previewCard.cardData.name} className="w-full" />
            ) : (
              <div className="aspect-[5/7] bg-card/80 border border-border/30 flex items-center justify-center p-3">
                <p className="text-xs text-center text-muted-foreground">{previewCard.cardData.name}</p>
              </div>
            )}
          </div>
          {/* Card details text panel — pointer-events-auto so oracle text is scrollable */}
          <div
            data-card-preview-safe
            className="w-[220px] shrink-0 rounded-xl bg-black/85 border border-white/10 p-3 flex flex-col gap-1.5 shadow-2xl backdrop-blur-sm"
            style={{ pointerEvents: 'auto' }}
          >
            <div className="font-bold text-sm text-white leading-tight">{previewCard.cardData.name}</div>
            {previewCard.cardData.manaCost && (
              <div className="flex items-center gap-0.5">
                <ManaCostDisplay manaCost={previewCard.cardData.manaCost} size="md" />
              </div>
            )}
            {previewCard.cardData.typeLine && (
              <div className="text-sky-300/70 text-[11px] italic border-b border-white/10 pb-1.5">
                {previewCard.cardData.typeLine}
              </div>
            )}
            {previewCard.cardData.oracleText && (
              <div className="text-white/80 text-[11px] max-h-[140px] overflow-y-auto">
                <OracleText text={previewCard.cardData.oracleText} />
              </div>
            )}
            {previewCard.cardData.power !== undefined && (
              <div className="mt-auto pt-1.5 border-t border-white/10 text-right font-bold text-sm text-white/90">
                {previewCard.cardData.power}/{previewCard.cardData.toughness}
              </div>
            )}
            {!previewCard.cardData.oracleText && !previewCard.cardData.typeLine && (
              <div className="text-muted-foreground/50 text-[11px] italic">No card data</div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
