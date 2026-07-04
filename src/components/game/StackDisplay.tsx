'use client';

import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { StackItem, CardInstance } from '@/lib/gameTypes';
import { Layers } from 'lucide-react';
import { useCardPreview } from './CardPreviewContext';

// Build a lightweight CardInstance-like object from stack item data for preview
function stackItemToPreviewCard(item: StackItem): CardInstance | null {
  if (!item.cardData) return null;
  return {
    instanceId: item.sourceInstanceId || item.id,
    cardData: item.cardData,
    ownerId: item.controllerId,
    controllerId: item.controllerId,
    zone: 'stack' as any,
    tapped: false,
    flipped: false,
    faceDown: false,
    counters: {},
    attachments: [],
    attachmentNames: [],
    attachedTo: undefined,
    abilities: [],
    summoningSick: false,
    damage: 0,
    modifiedPower: 0,
    modifiedToughness: 0,
  };
}

interface StackDisplayProps {
  stack: StackItem[];
  className?: string;
}

export function StackDisplay({ stack, className }: StackDisplayProps) {
  const { previewCard, setPreviewCard } = useCardPreview();

  const handleClick = useCallback((item: StackItem) => {
    const preview = stackItemToPreviewCard(item);
    if (!preview) return;
    // Toggle: if already previewing this card, clear it
    if (previewCard?.instanceId === preview.instanceId) {
      setPreviewCard(null);
    } else {
      setPreviewCard(preview);
    }
  }, [previewCard, setPreviewCard]);

  if (stack.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'flex items-center rounded-xl border border-amber-500/30 bg-amber-950/30 backdrop-blur-sm shadow-[0_0_16px_rgba(245,158,11,0.1)]',
        className
      )}
      style={{ gap: 'clamp(8px,1.5vmin,1000px)', padding: 'clamp(6px,1vmin,1000px) clamp(10px,2vmin,1000px)' }}
    >
      <div className="flex items-center shrink-0" style={{ gap: 'clamp(4px,0.6vmin,1000px)' }}>
        <Layers className="text-amber-400" style={{ width: 'clamp(14px,2.5vmin,1000px)', height: 'clamp(14px,2.5vmin,1000px)' }} />
        <span className="font-bold uppercase tracking-widest text-amber-400/70" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}>
          Stack
        </span>
      </div>
      <div className="bg-amber-500/20 shrink-0" style={{ width: '1px', height: 'clamp(14px,2.5vmin,1000px)' }} />
      <div className="flex items-center flex-wrap" style={{ gap: 'clamp(4px,0.8vmin,1000px)' }}>
        <AnimatePresence>
          {[...stack].reverse().map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.8, x: -8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.6, x: 8 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30, delay: i * 0.05 }}
              layout
              className={cn(
                'rounded-md font-semibold cursor-pointer',
                i === 0
                  ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/50 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                  : 'bg-muted/20 text-muted-foreground/80'
              )}
              style={{ padding: 'clamp(3px,0.5vmin,1000px) clamp(6px,1.2vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
              onClick={() => handleClick(item)}
            >
              {item.cardData?.name || 'Unknown'}
              {item.targets.length > 0 && (
                <span className="ml-1.5 text-amber-400/50">→</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
