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
import { ManaCostDisplay, OracleText } from '@/components/game/ManaSymbol';
import type { CardInstance } from '@/lib/gameTypes';
import { PhaseTracker } from '@/components/game/PhaseTracker';
import {
  ArrowLeft,
  Loader2,
  Flag,
  RotateCcw,
  Hand as HandIcon,
  ChevronUp,
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

  // Unified expanded overlay: null = collapsed, playerId = expanded battlefield (with hand for current player)
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);

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
        <header className="flex items-center border-b border-border/30 shrink-0" style={{ gap: 'clamp(4px,1vmin,1000px)', padding: 'clamp(2px,0.5vmin,1000px) clamp(6px,1.5vmin,1000px)', minHeight: 'clamp(32px,5vh,1000px)' }}>
          <Link href="/" className="shrink-0">
            <Button variant="ghost" size="sm" className="p-0" style={{ width: 'clamp(28px,4vh,1000px)', height: 'clamp(28px,4vh,1000px)' }} title="Home">
              <ArrowLeft style={{ width: 'clamp(14px,2.5vmin,1000px)', height: 'clamp(14px,2.5vmin,1000px)' }} />
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
          <div className="flex items-center shrink-0" style={{ gap: 'clamp(2px,0.5vmin,1000px)' }}>
            <Button variant="ghost" size="sm" onClick={concede} className="p-0 text-red-400" style={{ width: 'clamp(28px,4vh,1000px)', height: 'clamp(28px,4vh,1000px)' }} title="Concede">
              <Flag style={{ width: 'clamp(12px,2.5vmin,1000px)', height: 'clamp(12px,2.5vmin,1000px)' }} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { disconnect(); router.push('/game'); }} className="p-0 text-muted-foreground" style={{ width: 'clamp(28px,4vh,1000px)', height: 'clamp(28px,4vh,1000px)' }} title="New Game">
              <RotateCcw style={{ width: 'clamp(12px,2.5vmin,1000px)', height: 'clamp(12px,2.5vmin,1000px)' }} />
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
            externalExpandedPlayerId={expandedPlayerId}
            onExpandedPlayerChange={setExpandedPlayerId}
            expandedHandContent={
              <div>
                <div className="flex items-center" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(4px,0.6vmin,1000px)' }}>
                  <HandIcon className="text-muted-foreground/60" style={{ width: 'clamp(12px,2vmin,1000px)', height: 'clamp(12px,2vmin,1000px)' }} />
                  <span className="font-bold uppercase tracking-wider text-muted-foreground/60" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}>Hand · {handCards.length}</span>
                </div>
                <div className="flex flex-wrap items-end" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
                  <Hand
                    cards={handCards}
                    legalActions={handLegalActions}
                    onPlayCard={(card) => { handleForgePlayCard(card); setExpandedPlayerId(null); }}
                    isActive={!!hasPriority && !isGameOver}
                    layout="grid"
                  />
                </div>
              </div>
            }
          />
          <ForgeChoiceOverlay />
        </div>

        {/* ─── PRIORITY BAR: centered above hand ─── */}
        <div className={cn(
          'shrink-0 flex items-center justify-center border-t border-border/20',
          hasPriorityForActions && !isGameOver ? 'bg-gold/5' : 'bg-card/30'
        )} style={{ gap: 'clamp(6px,1.5vmin,1000px)', padding: 'clamp(6px,1.2vmin,1000px) clamp(8px,2vmin,1000px)' }}>
          {isProcessing && <Loader2 className="animate-spin text-gold" style={{ width: 'clamp(14px,2.5vmin,1000px)', height: 'clamp(14px,2.5vmin,1000px)' }} />}
          {hasPriorityForActions && !isProcessing && !isGameOver && (
            <span className="relative" style={{ width: 'clamp(8px,1.5vmin,1000px)', height: 'clamp(8px,1.5vmin,1000px)' }}>
              <span className="absolute inset-0 animate-ping rounded-full opacity-75" style={{ backgroundColor: 'oklch(0.78 0.14 75)' }} />
              <span className="absolute inset-0 rounded-full" style={{ backgroundColor: 'oklch(0.78 0.14 75)' }} />
            </span>
          )}
          <span className={cn('font-semibold', hasPriorityForActions ? 'text-gold' : 'text-muted-foreground/60')} style={{ fontSize: 'clamp(11px,2.5vmin,1000px)' }}>
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
              'font-semibold',
              hasPriorityForActions && !isGameOver ? 'bg-gold text-gold-foreground hover:bg-gold/90' : ''
            )}
            style={{ height: 'clamp(28px,4.5vh,1000px)', padding: '0 clamp(10px,2vmin,1000px)', fontSize: 'clamp(10px,2vmin,1000px)', gap: 'clamp(3px,0.6vmin,1000px)' }}
          >
            <ArrowRight style={{ width: 'clamp(12px,2vmin,1000px)', height: 'clamp(12px,2vmin,1000px)' }} /> Pass
          </Button>
          <Button
            size="sm"
            variant={autoPassUntilNextTurn ? 'default' : 'outline'}
            onClick={() => setAutoPass(!autoPassUntilNextTurn)}
            className={cn(autoPassUntilNextTurn && 'bg-amber-600 hover:bg-amber-700 text-white')}
            style={{ height: 'clamp(28px,4.5vh,1000px)', padding: '0 clamp(8px,2vmin,1000px)', fontSize: 'clamp(10px,2vmin,1000px)' }}
            title="Auto-pass"
          >
            <FastForward style={{ width: 'clamp(12px,2vmin,1000px)', height: 'clamp(12px,2vmin,1000px)' }} />
          </Button>
        </div>

        {/* ─── COLLAPSED HAND: peek strip, tap to expand ─── */}
        <div
          className="shrink-0 border-t border-border/20 bg-background/95 backdrop-blur-xl shadow-[0_-4px_16px_rgba(0,0,0,0.3)] flex items-center cursor-pointer"
          style={{ height: 'clamp(36px, 6vh, 1000px)', padding: '0 clamp(8px,2vmin,1000px)' }}
          onClick={() => setExpandedPlayerId(HUMAN_PLAYER_ID)}
        >
          <HandIcon className="text-muted-foreground/60" style={{ width: 'clamp(14px,2.5vmin,1000px)', height: 'clamp(14px,2.5vmin,1000px)', marginRight: 'clamp(6px,1.2vmin,1000px)' }} />
          <span className="font-semibold text-muted-foreground/70 uppercase tracking-wider" style={{ fontSize: 'clamp(10px,2.2vmin,1000px)' }}>
            Hand · {handCards.length}
          </span>
          {commandZoneCards.length > 0 && (
            <span className="text-muted-foreground/40" style={{ fontSize: 'clamp(10px,2.2vmin,1000px)', marginLeft: 'clamp(4px,1vmin,1000px)' }}>· Cmd {commandZoneCards.length}</span>
          )}
          <ChevronUp className="text-muted-foreground/40 ml-auto" style={{ width: 'clamp(14px,2.5vmin,1000px)', height: 'clamp(14px,2.5vmin,1000px)' }} />
        </div>
      </div>

      <CardPreviewFloating />
    </CardPreviewProvider>
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

  // Card preview is always visible (z-[60] ensures it floats above everything)

  return (
    <AnimatePresence>
      {previewCard && (
        <motion.div
          key={previewCard.instanceId}
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 6 }}
          transition={{ duration: 0.12 }}
          className="fixed left-1/2 -translate-x-1/2 z-[60] flex items-start"
        style={{ pointerEvents: 'none', bottom: 'clamp(60px,10vh,1000px)', gap: 'clamp(6px,1vmin,1000px)' }}
        >
          {/* Card image — non-interactive */}
          <div className="shrink-0 rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10" style={{ width: 'clamp(180px,22vmin,1000px)', pointerEvents: 'none' }}>
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt={previewCard.cardData.name} className="w-full" />
            ) : (
              <div className="aspect-[5/7] bg-card/80 border border-border/30 flex items-center justify-center" style={{ padding: 'clamp(6px,1vmin,1000px)' }}>
                <p className="text-center text-muted-foreground" style={{ fontSize: 'clamp(11px,1.8vmin,1000px)' }}>{previewCard.cardData.name}</p>
              </div>
            )}
          </div>
          {/* Card details text panel — pointer-events-auto so oracle text is scrollable */}
          <div
            data-card-preview-safe
            className="shrink-0 rounded-xl bg-black/85 border border-white/10 flex flex-col shadow-2xl backdrop-blur-sm"
            style={{ pointerEvents: 'auto', width: 'clamp(180px,22vmin,1000px)', padding: 'clamp(8px,1.5vmin,1000px)', gap: 'clamp(4px,0.8vmin,1000px)' }}
          >
            <div className="font-bold text-white leading-tight" style={{ fontSize: 'clamp(12px,2vmin,1000px)' }}>{previewCard.cardData.name}</div>
            {previewCard.cardData.manaCost && (
              <div className="flex items-center gap-0.5">
                <ManaCostDisplay manaCost={previewCard.cardData.manaCost} size="md" />
              </div>
            )}
            {previewCard.cardData.typeLine && (
              <div className="text-sky-300/70 italic border-b border-white/10" style={{ fontSize: 'clamp(10px,1.6vmin,1000px)', paddingBottom: 'clamp(4px,0.6vmin,1000px)' }}>
                {previewCard.cardData.typeLine}
              </div>
            )}
            {previewCard.cardData.oracleText && (
              <div className="text-white/80 overflow-y-auto" style={{ fontSize: 'clamp(10px,1.6vmin,1000px)', maxHeight: 'clamp(100px,16vmin,1000px)' }}>
                <OracleText text={previewCard.cardData.oracleText} />
              </div>
            )}
            {previewCard.cardData.power !== undefined && (
              <div className="mt-auto border-t border-white/10 text-right font-bold text-white/90" style={{ fontSize: 'clamp(12px,2vmin,1000px)', paddingTop: 'clamp(4px,0.6vmin,1000px)' }}>
                {previewCard.cardData.power}/{previewCard.cardData.toughness}
              </div>
            )}
            {!previewCard.cardData.oracleText && !previewCard.cardData.typeLine && (
              <div className="text-muted-foreground/50 italic" style={{ fontSize: 'clamp(10px,1.6vmin,1000px)' }}>No card data</div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
