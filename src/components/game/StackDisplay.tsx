'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { StackItem } from '@/engine/types';
import { Layers } from 'lucide-react';

interface StackDisplayProps {
  stack: StackItem[];
  className?: string;
}

export function StackDisplay({ stack, className }: StackDisplayProps) {
  if (stack.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-950/30 backdrop-blur-sm px-4 py-2.5 shadow-[0_0_16px_rgba(245,158,11,0.1)]',
        className
      )}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <Layers className="h-4 w-4 text-amber-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">
          Stack
        </span>
      </div>
      <div className="h-4 w-px bg-amber-500/20 shrink-0" />
      <div className="flex items-center gap-2 flex-wrap">
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
                'rounded-md px-2.5 py-1 text-xs font-semibold',
                i === 0
                  ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/50 shadow-[0_0_8px_rgba(245,158,11,0.2)]'
                  : 'bg-muted/20 text-muted-foreground/80'
              )}
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
