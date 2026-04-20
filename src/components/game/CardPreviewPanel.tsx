'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { useCardPreview } from './CardPreviewContext';
import type { CardInstance } from '@/engine/types';

function getActiveFace(card: CardInstance) {
  const { cardData } = card;
  if (!cardData.cardFaces || cardData.cardFaces.length < 2) {
    return {
      name: cardData.name,
      typeLine: cardData.typeLine,
      oracleText: cardData.oracleText,
      manaCost: cardData.manaCost,
      power: cardData.power,
      toughness: cardData.toughness,
      normal: cardData.imageUris?.normal,
    };
  }
  const face = card.flipped ? cardData.cardFaces[1] : cardData.cardFaces[0];
  return {
    name: face.name,
    typeLine: face.typeLine,
    oracleText: face.oracleText,
    manaCost: face.manaCost,
    power: face.power,
    toughness: face.toughness,
    normal: face.imageUris?.normal || cardData.imageUris?.normal,
  };
}

interface CardPreviewPanelProps {
  className?: string;
}

export function CardPreviewPanel({ className }: CardPreviewPanelProps) {
  const { previewCard } = useCardPreview();

  // Resolve active face for DFC cards
  const face = previewCard ? getActiveFace(previewCard) : null;
  const imageUrl = face?.normal;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
        Card Preview
      </div>

      <AnimatePresence mode="wait">
        {previewCard && face ? (
          <motion.div
            key={previewCard.instanceId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt={face.name}
                width={240}
                height={336}
                className="rounded-xl shadow-2xl w-full"
                unoptimized
              />
            ) : (
              <div className="rounded-xl border border-border/30 bg-card/80 p-4 aspect-[5/7]">
                <h3 className="font-bold text-sm text-foreground">
                  {face.name}
                </h3>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {face.manaCost}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1.5 border-t border-border/20 pt-1.5">
                  {face.typeLine}
                </p>
                {face.oracleText && (
                  <p className="text-[10px] mt-2 leading-relaxed text-foreground/80 whitespace-pre-line">
                    {face.oracleText}
                  </p>
                )}
                {face.power && (
                  <p className="text-sm font-bold text-foreground mt-2">
                    {face.power}/{face.toughness}
                  </p>
                )}
              </div>
            )}

            {/* Card info below image */}
            <div className="mt-2 space-y-0.5">
              <p className="text-xs font-semibold text-foreground truncate">
                {face.name}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {face.typeLine}
              </p>
              {face.oracleText && imageUrl && (
                <p className="text-[10px] leading-relaxed text-muted-foreground/80 mt-1 line-clamp-6">
                  {face.oracleText}
                </p>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center aspect-[5/7] rounded-xl border border-dashed border-border/15 bg-card/10"
          >
            <p className="text-[10px] text-muted-foreground/30 italic">
              Hover a card to preview
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
