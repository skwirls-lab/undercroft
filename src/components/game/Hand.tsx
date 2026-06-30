'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView } from './CardView';
import { useCardPreview } from './CardPreviewContext';
import type { CardInstance, GameAction } from '@/lib/gameTypes';
import { Play } from 'lucide-react';

interface HandProps {
  cards: CardInstance[];
  legalActions: GameAction[];
  onPlayCard: (card: CardInstance) => void;
  isActive: boolean;
  className?: string;
}

export function Hand({ cards, legalActions, onPlayCard, isActive, className }: HandProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const { setPreviewCard } = useCardPreview();

  const playableCardIds = new Set(
    legalActions
      .filter((a) => a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL')
      .map((a) => a.payload.cardInstanceId as string)
  );

  const handleCardTap = useCallback((index: number, card: CardInstance) => {
    if (selectedIndex === index) {
      setSelectedIndex(null);
      setPreviewCard(null);
    } else {
      setSelectedIndex(index);
      setPreviewCard(card);
    }
  }, [selectedIndex, setPreviewCard]);

  const handlePlay = useCallback(() => {
    if (selectedIndex === null) return;
    const card = cards[selectedIndex];
    if (!card) return;
    setSelectedIndex(null);
    setPreviewCard(null);
    onPlayCard(card);
  }, [selectedIndex, cards, onPlayCard, setPreviewCard]);

  const handleCancel = useCallback(() => {
    setSelectedIndex(null);
    setPreviewCard(null);
  }, [setPreviewCard]);

  if (cards.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-3 text-sm text-muted-foreground/40 italic', className)}>
        No cards in hand
      </div>
    );
  }

  const fanSpread = Math.min(52, 440 / cards.length);
  const selectedCard = selectedIndex !== null ? cards[selectedIndex] : null;
  const isSelectedPlayable = selectedCard ? (isActive && playableCardIds.has(selectedCard.instanceId)) : false;

  return (
    <div className={cn('relative flex flex-col items-center select-none', className)}>
      {/* Fan of cards */}
      <div
        className="relative flex items-end justify-center w-full"
        style={{ minHeight: 148 }}
      >
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
              animate={{
                x: offset,
                y: isSelected ? -36 : 5,
                rotate: isSelected ? 0 : rotation,
                scale: isSelected ? 1.1 : 0.97,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onClick={(e) => { e.stopPropagation(); handleCardTap(index, card); }}
            >
              <CardView
                card={card}
                mode="art"
                highlighted={isPlayable}
                interactive={false}
                className={cn(
                  'transition-shadow',
                  isPlayable && !isSelected && 'ring-2 ring-green-400/50 shadow-[0_0_14px_rgba(34,197,94,0.3)]',
                  isSelected && isPlayable && 'ring-2 ring-green-400/90 shadow-[0_0_28px_rgba(34,197,94,0.6)]',
                  isSelected && !isPlayable && 'ring-2 ring-sky-400/70 shadow-[0_0_20px_rgba(56,189,248,0.35)]',
                  !isActive && !isSelected && 'opacity-50 saturate-50',
                )}
              />

              {/* In-card play button — appears directly on the selected card */}
              <AnimatePresence>
                {isSelected && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    className="absolute inset-0 flex flex-col items-center justify-center rounded-lg pointer-events-none"
                  >
                    {isPlayable ? (
                      <button
                        className="pointer-events-auto bg-green-500 hover:bg-green-400 active:bg-green-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-lg shadow-green-900/60 flex items-center gap-1 touch-manipulation"
                        onClick={(e) => { e.stopPropagation(); handlePlay(); }}
                      >
                        <Play className="h-2.5 w-2.5" />
                        Play
                      </button>
                    ) : (
                      <span className="bg-black/60 text-white/70 text-[9px] px-2 py-0.5 rounded-full">
                        {isActive ? 'Not playable' : 'Not your turn'}
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
