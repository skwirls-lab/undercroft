'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView } from './CardView';
import { Button } from '@/components/ui/button';
import { useCardPreview } from './CardPreviewContext';
import type { CardInstance, GameAction } from '@/lib/gameTypes';
import { Play, X, Eye } from 'lucide-react';

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

      {/* Action bar — slides up when a card is selected */}
      <AnimatePresence>
        {selectedCard && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className="flex items-center gap-2 mb-2 z-50 rounded-xl border border-border/30 bg-card/80 backdrop-blur-sm px-3 py-1.5 shadow-lg"
          >
            <Eye className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
            <span className="text-xs text-muted-foreground truncate max-w-[160px]">
              {selectedCard.cardData.name}
            </span>
            {isSelectedPlayable ? (
              <Button
                size="sm"
                onClick={handlePlay}
                className="h-7 px-3 text-xs bg-green-600 hover:bg-green-500 text-white gap-1 ml-1"
              >
                <Play className="h-3 w-3" />
                Play
              </Button>
            ) : (
              <span className="text-[10px] text-muted-foreground/50 ml-1 italic">
                {isActive ? 'Not playable' : 'Not your turn'}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

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
                y: isSelected ? -30 : 5,
                rotate: isSelected ? 0 : rotation,
                scale: isSelected ? 1.12 : 0.97,
              }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              onClick={() => handleCardTap(index, card)}
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
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
