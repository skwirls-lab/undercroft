'use client';

import { Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMMANDER_DAMAGE_LETHAL } from '@/lib/constants';

/**
 * Commander damage taken by one player, keyed by the commander that dealt it.
 *
 * This data has always arrived from the server (GameStateSerializer writes a `commanderDamage`
 * map per player, and forgeStateAdapter maps it to `commanderDamageReceived`) but nothing ever
 * rendered it — so a loss to commander damage arrived with no warning at all. 21 from a single
 * commander is lethal, which makes this a rules requirement rather than a nicety.
 */
export function CommanderDamage({
  damage,
  compact = false,
  className,
}: {
  /** commander name -> damage dealt to this player */
  damage: Record<string, number>;
  /** Tighter presentation for the collapsed stat boxes. */
  compact?: boolean;
  className?: string;
}) {
  const entries = Object.entries(damage ?? {}).filter(([, n]) => n > 0);
  if (entries.length === 0) return null;

  // Worst first — that is the one that might end the game.
  entries.sort((a, b) => b[1] - a[1]);

  return (
    <div
      className={cn('flex items-center flex-wrap', className)}
      style={{ gap: compact ? 'clamp(3px,0.8vmin,1000px)' : 'clamp(4px,1vmin,1000px)' }}
    >
      {!compact && (
        <span
          className="uppercase tracking-wider text-muted-foreground/70"
          style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}
        >
          Cmd dmg
        </span>
      )}
      {entries.map(([name, amount]) => {
        const lethal = amount >= COMMANDER_DAMAGE_LETHAL;
        // Two away is the point where it changes how you block, so warn before it is too late.
        const danger = !lethal && amount >= COMMANDER_DAMAGE_LETHAL - 6;
        return (
          <span
            key={name}
            title={`${amount} commander damage from ${name} (${COMMANDER_DAMAGE_LETHAL} is lethal)`}
            aria-label={`${amount} of ${COMMANDER_DAMAGE_LETHAL} commander damage from ${name}`}
            className={cn(
              'inline-flex items-center rounded font-semibold tabular-nums',
              lethal
                ? 'bg-red-500/25 text-red-200 ring-1 ring-red-400/60'
                : danger
                  ? 'bg-red-500/15 text-red-300'
                  : 'bg-muted/40 text-muted-foreground'
            )}
            style={{
              gap: 'clamp(2px,0.4vmin,1000px)',
              padding: 'clamp(1px,0.3vmin,1000px) clamp(3px,0.7vmin,1000px)',
              fontSize: 'clamp(9px,1.6vmin,1000px)',
            }}
          >
            <Swords
              className="shrink-0 opacity-70"
              style={{ width: 'clamp(8px,1.4vmin,1000px)', height: 'clamp(8px,1.4vmin,1000px)' }}
            />
            {compact ? amount : `${amount}/${COMMANDER_DAMAGE_LETHAL}`}
            {!compact && (
              <span className="truncate opacity-70" style={{ maxWidth: 'clamp(60px,10vmin,160px)' }}>
                {name}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
