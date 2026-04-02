'use client';

import { cn } from '@/lib/utils';
import type { ManaColor } from '@/engine/types';

interface ManaColorPickerProps {
  colors: (ManaColor | 'C')[];
  onPick: (color: ManaColor | 'C') => void;
  onCancel: () => void;
  className?: string;
}

const COLOR_STYLES: Record<string, { bg: string; label: string; symbol: string }> = {
  W: { bg: 'bg-amber-100 hover:bg-amber-200 text-amber-900', label: 'White', symbol: 'W' },
  U: { bg: 'bg-blue-500 hover:bg-blue-600 text-white', label: 'Blue', symbol: 'U' },
  B: { bg: 'bg-gray-800 hover:bg-gray-900 text-gray-200', label: 'Black', symbol: 'B' },
  R: { bg: 'bg-red-500 hover:bg-red-600 text-white', label: 'Red', symbol: 'R' },
  G: { bg: 'bg-green-600 hover:bg-green-700 text-white', label: 'Green', symbol: 'G' },
  C: { bg: 'bg-gray-400 hover:bg-gray-500 text-gray-900', label: 'Colorless', symbol: 'C' },
};

export function ManaColorPicker({ colors, onPick, onCancel, className }: ManaColorPickerProps) {
  return (
    <div
      className={cn(
        'absolute z-50 flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-card/95 p-2 shadow-xl backdrop-blur-sm',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
        Choose mana
      </span>
      <div className="flex gap-1">
        {colors.map((color) => {
          const style = COLOR_STYLES[color] || COLOR_STYLES.C;
          return (
            <button
              key={color}
              onClick={() => onPick(color)}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-110',
                style.bg
              )}
              title={`Add {${style.symbol}} — ${style.label}`}
            >
              {style.symbol}
            </button>
          );
        })}
      </div>
      <button
        onClick={onCancel}
        className="text-[9px] text-muted-foreground hover:text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
