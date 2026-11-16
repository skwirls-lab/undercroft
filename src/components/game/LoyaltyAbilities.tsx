'use client';

import { cn } from '@/lib/utils';
import type { LoyaltyAbility } from '@/lib/loyalty';

/**
 * A planeswalker's loyalty abilities as the card prints them: the cost in its badge, the text
 * beside it. Used in the reader and in the chooser, where each row may be a button.
 */
export function LoyaltyCost({ label, size = 'sm' }: { label: string; size?: 'sm' | 'md' }) {
  const negative = label.startsWith('−') || label.startsWith('-');
  const positive = label.startsWith('+');
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-black tabular-nums text-white shadow-sm',
        size === 'sm' ? 'min-w-[2.1em] px-[0.3em] py-[0.1em] text-[0.85em]' : 'min-w-[2.4em] px-[0.35em] py-[0.15em]',
        positive && 'bg-[oklch(0.5_0.12_150)]',
        negative && 'bg-[oklch(0.5_0.16_25)]',
        !positive && !negative && 'bg-[oklch(0.45_0.03_260)]'
      )}
      style={{ clipPath: 'polygon(50% 0, 100% 18%, 100% 72%, 50% 100%, 0 72%, 0 18%)' }}
      aria-label={`Loyalty cost ${label}`}
    >
      {label}
    </span>
  );
}

export function LoyaltyAbilityList({ abilities, fontSize, gap }: { abilities: LoyaltyAbility[]; fontSize: string; gap: string }) {
  return (
    <ul className="flex flex-col" style={{ gap, fontSize }}>
      {abilities.map((a, i) => (
        <li key={i} className="flex items-start gap-[0.5em] leading-snug">
          <LoyaltyCost label={a.label} />
          <span className="text-white/85">{a.text}</span>
        </li>
      ))}
    </ul>
  );
}
