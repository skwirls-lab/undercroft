'use client';

import { LogIn, RotateCcw, ServerCrash, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeServerError, type ServerError } from '@/lib/serverErrors';

/**
 * What the player sees when the game server says no, or a game dies under them. Before this
 * there was nothing to see: a refused start sat on "Loading game…" and a dead game was a
 * board that never answered again.
 */
export function ServerErrorScreen({ error, onRetry, onBack }: {
  error: ServerError;
  /** Start the same matchup again. Absent when there is nothing to replay. */
  onRetry?: () => void;
  onBack: () => void;
}) {
  const view = describeServerError(error);
  const Icon = error.code === 'server_full' ? Users : error.code === 'auth_required' || error.code === 'auth_unavailable' ? LogIn : ServerCrash;
  const primary =
    view.action === 'refresh' ? () => window.location.reload()
    : view.action === 'retry' ? onRetry
    : undefined;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4" data-dev-server-error={error.code}>
      <div role="alert" className="w-full max-w-md rounded-xl border border-gold/40 bg-card p-6 text-center shadow-2xl">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-xl font-semibold">{view.title}</h1>
        <p className="mt-2 text-sm text-foreground/90">{view.body}</p>
        {view.note && <p className="mt-2 text-sm text-muted-foreground">{view.note}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primary && view.actionLabel && (
            <Button onClick={primary} className="bg-gold text-gold-foreground hover:bg-gold/90">
              {view.action !== 'refresh' && <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden />}
              {view.actionLabel}
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>Back to setup</Button>
        </div>
      </div>
    </div>
  );
}
