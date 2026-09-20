'use client';

import { Check, Minus, Crown } from 'lucide-react';
import { FEATURES, LIMITS, PATRON_PRICE_LABEL, type Feature } from '@/lib/entitlements';
import { DEFAULT_APP_CONFIG } from '@/lib/appConfig';
import { cn } from '@/lib/utils';

/**
 * Free beside Patron, one row per thing that differs, read straight from the price list so
 * the table cannot drift from what the gates enforce. Shown on the landing page before
 * sign-in and anywhere else the two tiers need comparing at a glance.
 */

type Cell = boolean | string;
interface Row { label: string; free: Cell; patron: Cell }

const ORDER: Feature[] = ['vault.shelves', 'opponents.choose', 'game.fourPlayer', 'archivist.match', 'archivist.recap', 'archivist.ideas'];

export function planRows(): Row[] {
  const rows: Row[] = [
    { label: 'Decks in the vault', free: `${LIMITS['vault.maxDecks'].free}`, patron: 'Unlimited' },
    { label: 'Deck builder and deck check', free: true, patron: true },
    { label: 'AI opponents per game', free: `Up to ${LIMITS['game.maxAI'].free}`, patron: `Up to ${LIMITS['game.maxAI'].patron}` },
    { label: 'The Archivist: deck advice and rules questions', free: `${DEFAULT_APP_CONFIG.allowance.free} a month`, patron: `${DEFAULT_APP_CONFIG.allowance.patron} a month` },
  ];
  for (const f of ORDER) {
    const rule = FEATURES[f];
    rows.push({ label: rule.label, free: rule.plans.includes('free'), patron: rule.plans.includes('patron') });
  }
  rows.push({ label: 'Lessons, Apprentice mode and tutorials', free: true, patron: true });
  return rows;
}

function CellView({ value, patron }: { value: Cell; patron?: boolean }) {
  if (value === true) return <Check className={cn('mx-auto h-4 w-4', patron ? 'text-gold' : 'text-emerald-300')} aria-label="Included" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" aria-label="Not included" />;
  return <span className={cn('text-sm', patron && 'font-medium text-foreground')}>{value}</span>;
}

export function PlanComparison({ className, compact }: { className?: string; compact?: boolean }) {
  const rows = planRows();
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border/50 bg-card/60', className)} data-dev-plan-comparison>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border/40">
            <th scope="col" className={cn('px-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground', compact ? 'py-2.5' : 'py-3.5 sm:px-5')}>What you get</th>
            <th scope="col" className={cn('w-[26%] px-2 text-center', compact ? 'py-2.5' : 'py-3.5')}>
              <span className="block font-display text-base font-bold">Free</span>
              <span className="block text-[11px] text-muted-foreground">for everyone</span>
            </th>
            <th scope="col" className={cn('w-[26%] px-2 text-center', compact ? 'py-2.5' : 'py-3.5')}>
              <span className="flex items-center justify-center gap-1.5 font-display text-base font-bold text-gold"><Crown className="h-4 w-4" /> Patron</span>
              <span className="block text-[11px] text-muted-foreground">{PATRON_PRICE_LABEL}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={cn('border-b border-border/25 last:border-b-0', i % 2 ? 'bg-background/20' : '')}>
              <th scope="row" className={cn('px-4 text-sm font-normal text-foreground/90', compact ? 'py-2' : 'py-2.5 sm:px-5')}>{r.label}</th>
              <td className={cn('px-2 text-center text-muted-foreground', compact ? 'py-2' : 'py-2.5')}><CellView value={r.free} /></td>
              <td className={cn('px-2 text-center', compact ? 'py-2' : 'py-2.5')}><CellView value={r.patron} patron /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
