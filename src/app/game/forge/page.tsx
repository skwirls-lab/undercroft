'use client';

import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useGameStore } from '@/store/gameStore';
import { GameBoard } from '@/components/game/GameBoard';
import { Hand } from '@/components/game/Hand';
import { CardPreviewProvider, useCardPreview } from '@/components/game/CardPreviewContext';
import { ForgeChoiceOverlay } from '@/components/game/ForgeChoiceOverlay';
import { EventTicker } from '@/components/game/EventTicker';
import { Button } from '@/components/ui/button';
import { getCardsInZone } from '@/lib/ZoneManager';
import { cn } from '@/lib/utils';
import { CardView } from '@/components/game/CardView';
import { ManaCostDisplay, OracleText } from '@/components/game/ManaSymbol';
import type { CardInstance } from '@/lib/gameTypes';
import { PhaseTracker } from '@/components/game/PhaseTracker';
import {
  ArrowLeft,
  Loader2,
  Flag,
  RotateCcw,
  Play,
  Hand as HandIcon,
  ChevronUp,
  X,
  ArrowRight,
  FastForward,
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

  const { gameState, legalActions, performAction, isProcessing, autoPassUntilNextTurn, setAutoPass } = useGameStore();

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

  const [handExpanded, setHandExpanded] = useState(false);

  // Action bar state
  const hasPriorityForActions = gameState?.priority.playerWithPriority === HUMAN_PLAYER_ID;
  const isMyTurn = gameState?.turn.activePlayerId === HUMAN_PLAYER_ID;
  const inCombatPhase = gameState?.turn.phase === 'combat';

  const handlePassPriority = useCallback(() => {
    const action = legalActions.find((a: { type: string }) => a.type === 'PASS_PRIORITY');
    if (action) performAction(action);
  }, [legalActions, performAction]);

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

  // Game in progress — unified layout for all screen sizes
  return (
    <CardPreviewProvider>
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        {/* ─── HEADER: nav | phase tracker | nav buttons ─── */}
        <header className="flex items-center gap-1 border-b border-border/30 shrink-0 px-2 py-0.5 min-h-[36px]">
          <Link href="/" className="shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Home">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          </Link>
          {gameState && (
            <div className="flex-1 min-w-0 mx-1">
              <PhaseTracker
                turn={gameState.turn}
                activePlayerName={gameState.players.find(p => p.id === gameState.turn.activePlayerId)?.name || '?'}
                className="!rounded-lg !px-2 !py-0.5 !border-0 !bg-transparent !backdrop-blur-none !shadow-none"
              />
            </div>
          )}
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={concede} className="h-7 w-7 p-0 text-red-400" title="Concede">
              <Flag className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { disconnect(); router.push('/game'); }} className="h-7 w-7 p-0 text-muted-foreground" title="New Game">
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        </header>

        {/* ─── EVENT TICKER: recent events, click for full log ─── */}
        <EventTicker
          events={gameEvents.map((e, i) => ({
            type: String(e.eventType) as 'CARD_PLAYED',
            data: e as Record<string, unknown>,
            timestamp: Date.now() - (gameEvents.length - i) * 100,
            id: `f${i}`,
          }))}
          currentPlayerId={HUMAN_PLAYER_ID}
        />

        {/* ─── MAIN: stat boxes (via GameBoard) ─── */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* Game Over banner */}
          {isGameOver && (
            <div className="shrink-0 mx-2 mt-1 rounded-xl border border-gold/30 bg-gold/10 text-center p-2">
              <h2 className="text-base font-bold text-gold">Game Over</h2>
              <p className="text-xs mt-0.5">{winner === 'draw' ? 'Draw!' : `Winner: ${winner}`}</p>
              <Button size="sm" className="mt-1 h-7 text-xs" onClick={() => { disconnect(); router.push('/game'); }}>New Game</Button>
            </div>
          )}
          <GameBoard
            currentPlayerId={HUMAN_PLAYER_ID}
            hideHand
            hideCommandZone
            hidePhaseTracker
            hideActionBar
            className="h-full"
            manaPaymentSourceIds={manaPaymentData?.sourceIdSet}
            manaPaymentInfo={manaPaymentData ? { manaCost: manaPaymentData.manaCost, spellName: manaPaymentData.spellName } : undefined}
            onTapForManaPayment={manaPaymentData ? handleTapForManaPayment : undefined}
            onCancelManaPayment={manaPaymentData ? handleCancelManaPayment : undefined}
          />
          <ForgeChoiceOverlay />
        </div>

        {/* ─── PRIORITY BAR: centered above hand ─── */}
        <div className={cn(
          'shrink-0 flex items-center justify-center gap-2 px-3 py-1 border-t border-border/20',
          hasPriorityForActions && !isGameOver ? 'bg-gold/5' : 'bg-card/30'
        )}>
          {isProcessing && <Loader2 className="h-3 w-3 animate-spin text-gold" />}
          {hasPriorityForActions && !isProcessing && !isGameOver && (
            <span className="relative flex h-2 w-2">
              <span className="absolute h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: 'oklch(0.78 0.14 75)' }} />
              <span className="relative h-2 w-2 rounded-full" style={{ backgroundColor: 'oklch(0.78 0.14 75)' }} />
            </span>
          )}
          <span className={cn('text-[11px] font-medium', hasPriorityForActions ? 'text-gold' : 'text-muted-foreground/60')}>
            {isGameOver ? 'Game Over'
              : isProcessing ? 'AI thinking...'
              : hasPriorityForActions ? (isMyTurn ? (inCombatPhase ? 'Combat Phase' : 'Your Turn') : 'You have priority')
              : `${gameState?.players.find(p => p.id === gameState?.priority.playerWithPriority)?.name}'s turn`}
          </span>
          <Button
            size="sm"
            onClick={handlePassPriority}
            disabled={!hasPriorityForActions || isGameOver}
            className={cn(
              'h-6 gap-1 px-2.5 text-[10px] font-semibold',
              hasPriorityForActions && !isGameOver ? 'bg-gold text-gold-foreground hover:bg-gold/90' : ''
            )}
          >
            <ArrowRight className="h-2.5 w-2.5" /> Pass
          </Button>
          <Button
            size="sm"
            variant={autoPassUntilNextTurn ? 'default' : 'outline'}
            onClick={() => setAutoPass(!autoPassUntilNextTurn)}
            className={cn('h-6 px-2 text-[10px]', autoPassUntilNextTurn && 'bg-amber-600 hover:bg-amber-700 text-white')}
            title="Auto-pass"
          >
            <FastForward className="h-2.5 w-2.5" />
          </Button>
        </div>

        {/* ─── COLLAPSED HAND: peek strip, tap to expand ─── */}
        <div
          className="shrink-0 border-t border-border/20 bg-background/95 backdrop-blur-xl shadow-[0_-4px_16px_rgba(0,0,0,0.3)] flex items-center px-3 cursor-pointer"
          style={{ height: 'clamp(32px, 5vh, 44px)' }}
          onClick={() => setHandExpanded(true)}
        >
          <HandIcon className="h-3.5 w-3.5 text-muted-foreground/60 mr-2" />
          <span className="text-[clamp(9px,1.2vmin,12px)] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Hand · {handCards.length}
          </span>
          {commandZoneCards.length > 0 && (
            <span className="text-[clamp(9px,1.2vmin,12px)] text-muted-foreground/40 ml-2">· Cmd {commandZoneCards.length}</span>
          )}
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40 ml-auto" />
        </div>
      </div>

      {/* ─── HAND OVERLAY: full-screen, commander + hand in one row ─── */}
      <AnimatePresence>
        {handExpanded && (
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
                <span className="text-sm font-semibold">Hand · {handCards.length + commandZoneCards.length}</span>
              </div>
              <button onClick={() => setHandExpanded(false)} className="rounded-lg bg-muted/30 p-1.5 text-muted-foreground hover:bg-muted/50">
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* All cards in ONE scrollable row: commander(s) + hand */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <div className="flex flex-wrap gap-2 justify-center items-end">
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

      <CardPreviewFloating handExpanded={handExpanded} />
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
function CardPreviewFloating({ handExpanded }: { handExpanded?: boolean }) {
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
          className="fixed left-1/2 -translate-x-1/2 z-[60] flex items-start gap-2 bottom-[80px]"
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
