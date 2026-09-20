'use client';

import { BookOpen, Lock, Hourglass, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AccessState } from './access';

/** The Archivist's one-line notices: resting, Patron-only, out of requests, or an error. */
export function ArchivistNotice({ state, message, className }: { state: AccessState | 'error'; message: string; className?: string }) {
  const Icon = state === 'resting' ? BookOpen : state === 'patron' ? Lock : state === 'quota' ? Hourglass : AlertTriangle;
  const title = state === 'resting' ? 'The Archivist is resting' : state === 'patron' ? 'A Patron feature' : state === 'quota' ? 'Out of requests' : 'Something went wrong';
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border border-border/50 bg-card/60 px-4 py-3', className)} role="status">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', state === 'error' ? 'text-destructive' : 'text-gold')} />
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function Thinking({ label = 'The Archivist is consulting the records…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" /> {label}
    </p>
  );
}

/** A meter line, "13 of 300 this month". */
export function UsageLine({ used, allowed, className }: { used: number; allowed: number; className?: string }) {
  return <span className={cn('text-[11px] tabular-nums text-muted-foreground', className)}>{used} of {allowed} this month</span>;
}
