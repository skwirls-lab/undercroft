'use client';

import { cn } from '@/lib/utils';
import type { ManaPool } from '@/engine/types';

interface ManaPoolDisplayProps {
  manaPool: ManaPool;
  compact?: boolean;
  className?: string;
}

const MANA_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  W: { bg: 'bg-amber-50', text: 'text-amber-900', label: 'W' },
  U: { bg: 'bg-blue-600', text: 'text-white', label: 'U' },
  B: { bg: 'bg-zinc-800', text: 'text-zinc-300', label: 'B' },
  R: { bg: 'bg-red-600', text: 'text-white', label: 'R' },
  G: { bg: 'bg-green-700', text: 'text-white', label: 'G' },
  C: { bg: 'bg-zinc-400', text: 'text-zinc-900', label: 'C' },
};

export function ManaPoolDisplay({ manaPool, compact = false, className }: ManaPoolDisplayProps) {
  const total = Object.values(manaPool).reduce((a, b) => a + b, 0);

  if (total === 0 && compact) return null;

  const entries = Object.entries(manaPool).filter(
    ([, v]) => v > 0 || !compact
  ) as [keyof ManaPool, number][];

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {entries.map(([color, count]) => {
        const style = MANA_STYLES[color];
        if (!style) return null;
        const isEmpty = count === 0;

        return (
          <div
            key={color}
            className={cn(
              'flex items-center justify-center rounded-full font-bold transition-all',
              style.bg,
              style.text,
              isEmpty && 'opacity-30',
              compact ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs'
            )}
            title={`${color}: ${count}`}
          >
            {count}
          </div>
        );
      })}
    </div>
  );
}
