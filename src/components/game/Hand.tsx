'use client';

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView, type CardSize } from './CardView';
import { useCardPreview } from './CardPreviewContext';
import type { CardInstance, GameAction } from '@/lib/gameTypes';
import { Play } from 'lucide-react';

interface HandProps {
  cards: CardInstance[];
  legalActions: GameAction[];
  onPlayCard: (card: CardInstance) => void;
  isActive: boolean;
  /**
   * fan   — overlapping arc, the original
   * grid  — flat wrap
   * strip — one horizontal line at a fixed card size, scrolls sideways with a thumb; the
   *         board view uses this so the hand never adds vertical height to the screen
   */
  layout?: 'fan' | 'grid' | 'strip';
  /** Card size for the strip layout. */
  cardSize?: CardSize;
  className?: string;
}

export function Hand({ cards, legalActions, onPlayCard, isActive, layout = 'fan', cardSize, className }: HandProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { setPreviewCard, previewCard } = useCardPreview();

  // Deselect when previewCard is cleared externally (board click) or changed to a different card
  useEffect(() => {
    if (selectedIndex === null) return;
    const selectedCard = cards[selectedIndex];
    if (!previewCard || previewCard.instanceId !== selectedCard?.instanceId) {
      setSelectedIndex(null);
    }
  }, [previewCard?.instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const playableCardIds = new Set(
    legalActions.filter((a) => a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL').map((a) => a.payload.cardInstanceId as string)
  );

  const handleCardTap = useCallback(
    (index: number, card: CardInstance) => {
      if (selectedIndex === index) {
        setSelectedIndex(null);
        setPreviewCard(null);
      } else {
        setSelectedIndex(index);
        setPreviewCard(card);
      }
    },
    [selectedIndex, setPreviewCard]
  );

  const handlePlay = useCallback(() => {
    if (selectedIndex === null) return;
    const card = cards[selectedIndex];
    if (!card) return;
    setSelectedIndex(null);
    setPreviewCard(null);
    onPlayCard(card);
  }, [selectedIndex, cards, onPlayCard, setPreviewCard]);

  if (cards.length === 0) {
    return (
      <div className={cn('flex items-center justify-center italic text-muted-foreground/40', className)} style={{ padding: 'clamp(8px,1.5vmin,1000px)', fontSize: 'clamp(12px,2vmin,1000px)' }}>
        No cards in hand
      </div>
    );
  }

  const cardClasses = (isPlayable: boolean, isSelected: boolean) =>
    cn(
      'transition-shadow',
      isPlayable && !isSelected && 'affordance-actionable',
      isSelected && 'affordance-selected',
      !isActive && !isSelected && 'opacity-50 saturate-50',
      isActive && !isPlayable && !isSelected && 'opacity-60 saturate-[0.6]'
    );

  const playOverlay = (isPlayable: boolean, small = false) => (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center rounded-lg"
    >
      {isPlayable ? (
        <button
          className="pointer-events-auto flex touch-manipulation items-center gap-1 rounded-full bg-gold font-bold text-gold-foreground shadow-lg shadow-black/50 hover:bg-gold/90 active:bg-gold/80"
          style={small ? { fontSize: 11, padding: '4px 10px' } : { fontSize: 'clamp(10px,1.8vmin,13px)', padding: 'clamp(3px,0.5vmin,5px) clamp(8px,1.5vmin,12px)' }}
          onClick={(e) => { e.stopPropagation(); handlePlay(); }}
        >
          <Play className="h-3 w-3" />
          Play
        </button>
      ) : (
        <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white/80">{isActive ? 'Not playable' : 'Not your turn'}</span>
      )}
    </motion.div>
  );

  // ─── STRIP LAYOUT: one line, fixed size, sideways scroll ───
  if (layout === 'strip') {
    const size = cardSize ?? { w: 72, h: 100 };
    return (
      <div className={cn('no-scrollbar flex items-end overflow-x-auto overflow-y-visible select-none', className)} style={{ gap: Math.max(4, Math.round(size.w * 0.08)), padding: `${Math.round(size.h * 0.1)}px 12px 4px` }}>
        {cards.map((card, index) => {
          const isPlayable = isActive && playableCardIds.has(card.instanceId);
          const isSelected = selectedIndex === index;
          return (
            <motion.div
              key={card.instanceId}
              className="relative shrink-0 cursor-pointer touch-manipulation"
              style={{ zIndex: isSelected ? 50 : 1 }}
              animate={{ y: isSelected ? -Math.round(size.h * 0.1) : 0, scale: isSelected ? 1.06 : 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onClick={(e) => { e.stopPropagation(); handleCardTap(index, card); }}
            >
              <CardView card={card} mode="art" size={size} highlighted={isPlayable} interactive={false} className={cardClasses(isPlayable, isSelected)} />
              <AnimatePresence>{isSelected && playOverlay(isPlayable, true)}</AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    );
  }

  // ─── GRID LAYOUT: flat wrap, no overlap ───
  if (layout === 'grid') {
    return (
      <div className={cn('flex flex-wrap items-end justify-center select-none', className)} style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
        {cards.map((card, index) => {
          const isPlayable = isActive && playableCardIds.has(card.instanceId);
          const isSelected = selectedIndex === index;
          return (
            <motion.div
              key={card.instanceId}
              className="relative cursor-pointer touch-manipulation"
              style={{ zIndex: isSelected ? 50 : 1 }}
              animate={{ scale: isSelected ? 1.08 : 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onClick={(e) => { e.stopPropagation(); handleCardTap(index, card); }}
            >
              <CardView card={card} mode="art" size={cardSize} highlighted={isPlayable} interactive={false} className={cardClasses(isPlayable, isSelected)} />
              <AnimatePresence>{isSelected && playOverlay(isPlayable)}</AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    );
  }

  // ─── FAN LAYOUT: overlapping fan ───
  const fanSpread = Math.min(52, 440 / cards.length);
  return (
    <div className={cn('relative flex select-none flex-col items-center', className)}>
      <div className="relative flex w-full items-end justify-center" style={{ minHeight: 148 }}>
        {cards.map((card, index) => {
          const isPlayable = isActive && playableCardIds.has(card.instanceId);
          const isSelected = selectedIndex === index;
          const offset = (index - (cards.length - 1) / 2) * fanSpread;
          const rotation = (index - (cards.length - 1) / 2) * 0.8;
          return (
            <motion.div
              key={card.instanceId}
              className="absolute cursor-pointer touch-manipulation"
              style={{ zIndex: isSelected ? 50 : index + 1, transformOrigin: 'bottom center' }}
              animate={{ x: offset, y: isSelected ? -36 : 5, rotate: isSelected ? 0 : rotation, scale: isSelected ? 1.1 : 0.97 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onClick={(e) => { e.stopPropagation(); handleCardTap(index, card); }}
            >
              <CardView card={card} mode="art" highlighted={isPlayable} interactive={false} className={cardClasses(isPlayable, isSelected)} />
              <AnimatePresence>{isSelected && playOverlay(isPlayable)}</AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
