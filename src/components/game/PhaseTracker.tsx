'use client';

import { cn } from '@/lib/utils';
import type { TurnState } from '@/engine/types';

interface PhaseTrackerProps {
  turn: TurnState;
  activePlayerName: string;
  className?: string;
}

const PHASES = [
  { key: 'beginning', label: 'Begin', short: 'B' },
  { key: 'precombat_main', label: 'Main 1', short: 'M1' },
  { key: 'combat', label: 'Combat', short: 'C' },
  { key: 'postcombat_main', label: 'Main 2', short: 'M2' },
  { key: 'ending', label: 'End', short: 'E' },
] as const;

export function PhaseTracker({ turn, activePlayerName, className }: PhaseTrackerProps) {
  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      {/* Turn info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Turn {turn.turnNumber}</span>
        <span className="text-foreground font-medium">{activePlayerName}</span>
      </div>

      {/* Phase track */}
      <div className="flex items-center gap-0.5">
        {PHASES.map((phase) => {
          const isActive = turn.phase === phase.key;
          const isPast = PHASES.findIndex((p) => p.key === turn.phase) > PHASES.findIndex((p) => p.key === phase.key);

          return (
            <div
              key={phase.key}
              className={cn(
                'flex items-center justify-center rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                isActive && 'bg-primary text-primary-foreground',
                isPast && 'bg-muted/50 text-muted-foreground',
                !isActive && !isPast && 'bg-muted/20 text-muted-foreground/50'
              )}
              title={phase.label}
            >
              <span className="hidden sm:inline">{phase.label}</span>
              <span className="sm:hidden">{phase.short}</span>
            </div>
          );
        })}
      </div>

      {/* Current step */}
      <div className="text-[10px] text-muted-foreground capitalize">
        {turn.step.replace(/_/g, ' ')}
      </div>
    </div>
  );
}
