'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView } from './CardView';
import type { CardInstance, GameAction } from '@/engine/types';

interface HandProps {
  cards: CardInstance[];
  legalActions: GameAction[];
  onPlayCard: (card: CardInstance) => void;
  onCardClick?: (card: CardInstance) => void;
  isActive: boolean;
  className?: string;
}

export function Hand({ cards, legalActions, onPlayCard, onCardClick, isActive, className }: HandProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const playableCardIds = new Set(
    legalActions
      .filter((a) => a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL')
      .map((a) => a.payload.cardInstanceId as string)
  );

  if (cards.length === 0) {
    return (
      <div className={cn('flex items-center justify-center py-4 text-sm text-muted-foreground', className)}>
        No cards in hand
      </div>
    );
  }

  // Fan layout: cards overlap slightly, hovered card lifts up
  const fanSpread = Math.min(60, 600 / cards.length);

  return (
    <div className={cn('relative flex items-end justify-center', className)} style={{ minHeight: 280 }}>
      {cards.map((card, index) => {
        const isPlayable = isActive && playableCardIds.has(card.instanceId);
        const isHovered = hoveredIndex === index;
        const offset = (index - (cards.length - 1) / 2) * fanSpread;
        const rotation = (index - (cards.length - 1) / 2) * 1.5;

        return (
          <motion.div
            key={card.instanceId}
            className="absolute"
            style={{ zIndex: isHovered ? 50 : index }}
            animate={{
              x: offset,
              y: isHovered ? -30 : 0,
              rotate: isHovered ? 0 : rotation,
              scale: isHovered ? 1.08 : 1,
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <CardView
              card={card}
              mode="full"
              onClick={() => isPlayable ? onPlayCard(card) : onCardClick?.(card)}
              highlighted={isPlayable}
              interactive
              className={cn(
                isPlayable && 'ring-2 ring-green-500/50 cursor-pointer',
                !isActive && 'opacity-50'
              )}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
