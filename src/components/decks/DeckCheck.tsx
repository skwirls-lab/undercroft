'use client';

import { CheckCircle2, AlertCircle, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DeckCheck as DeckCheckResult } from '@/lib/deckRules';
import { cn } from '@/lib/utils';

/**
 * The deck's standing against the Commander rules, as one line in the header and, on tap, the
 * full list with the cards each issue concerns. Card names open the reader so a problem can
 * be fixed from where it is reported.
 */

export function DeckCheckBadge({ check, verifying, onClick, className }: { check: DeckCheckResult; verifying?: boolean; onClick: () => void; className?: string }) {
  const n = check.issues.length;
  return (
    <button
      type="button"
      onClick={onClick}
      data-dev-check
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors',
        verifying
          ? 'border-border/60 text-muted-foreground'
          : check.legal
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15',
        className
      )}
    >
      {verifying ? (
        <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gold/30 border-t-gold" /> Verifying…</>
      ) : check.legal ? (
        <><CheckCircle2 className="h-4 w-4" /> Legal · {check.total} cards</>
      ) : (
        <><AlertCircle className="h-4 w-4" /> {n} issue{n === 1 ? '' : 's'}</>
      )}
    </button>
  );
}

export function DeckCheckDialog({ open, onOpenChange, check, onOpenCard }: { open: boolean; onOpenChange: (o: boolean) => void; check: DeckCheckResult; onOpenCard: (name: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl"><ShieldCheck className="h-5 w-5 text-gold" /> Deck check</DialogTitle>
          <DialogDescription>
            100 cards, one commander, one of each card, everything in the commander’s colours, and everything the engine can play.
          </DialogDescription>
        </DialogHeader>

        {check.legal ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            All clear. {check.total} cards, ready to shuffle up.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {check.issues.map((issue, i) => (
              <li key={`${issue.kind}-${i}`} className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
                <p className="flex items-start gap-2 text-sm text-foreground">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>{issue.message}</span>
                </p>
                {issue.cards && issue.cards.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                    {issue.cards.slice(0, 40).map((name) => {
                      const bare = name.replace(/ ×\d+$/, '');
                      return (
                        <button key={name} type="button" onClick={() => onOpenCard(bare)} className="rounded-md bg-background/60 px-2 py-0.5 text-xs text-foreground/90 ring-1 ring-border/60 hover:ring-gold/50">
                          {name}
                        </button>
                      );
                    })}
                    {issue.cards.length > 40 && <span className="text-xs text-muted-foreground">+{issue.cards.length - 40} more</span>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
