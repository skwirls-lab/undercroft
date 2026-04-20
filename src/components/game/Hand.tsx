'use client';

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView } from './CardView';
import type { CardInstance, GameAction } from '@/engine/types';

interface HandProps {
  cards: CardInstance[];
  legalActions: GameAction[];
  onPlayCard: (card: CardInstance) => void;
  isActive: boolean;
  className?: string;
}

export function Hand({ cards, legalActions, onPlayCard, isActive, className }: HandProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playableCardIds = new Set(
    legalActions
      .filter((a) => a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL')
      .map((a) => a.payload.cardInstanceId as string)
  );

  // Debounced hover to prevent rapid switching between overlapping cards
  const handleHoverEnter = (index: number) => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredIndex(index);
    }, 60);
  };

  const handleHoverLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setHoveredIndex(null);
  };

  if (cards.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-4 text-sm text-muted-foreground/40 italic', className)}>
        No cards in hand
      </div>
    );
  }

  // Fan layout with ArtView-sized cards (96x132)
  const fanSpread = Math.min(50, 420 / cards.length);

  return (
    <div className={cn('relative flex items-end justify-center', className)} style={{ minHeight: 170 }}>
      {cards.map((card, index) => {
        const isPlayable = isActive && playableCardIds.has(card.instanceId);
        const isHovered = hoveredIndex === index;
        const offset = (index - (cards.length - 1) / 2) * fanSpread;
        const rotation = (index - (cards.length - 1) / 2) * 0.7;

        return (
          <motion.div
            key={card.instanceId}
            className="absolute"
            style={{ zIndex: isHovered ? 50 : index, transformOrigin: 'bottom center' }}
            animate={{
              x: offset,
              y: isHovered ? -24 : 5,
              rotate: isHovered ? 0 : rotation,
              scale: isHovered ? 1.1 : 0.97,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            onMouseEnter={() => handleHoverEnter(index)}
            onMouseLeave={handleHoverLeave}
          >
            <CardView
              card={card}
              mode="art"
              onClick={() => isPlayable ? onPlayCard(card) : undefined}
              highlighted={isPlayable}
              interactive
              className={cn(
                isPlayable && 'ring-2 ring-green-400/60 shadow-[0_0_16px_rgba(34,197,94,0.35)] cursor-pointer',
                isPlayable && isHovered && 'ring-green-400/80 shadow-[0_0_24px_rgba(34,197,94,0.5)]',
                !isActive && 'opacity-40 saturate-50'
              )}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
