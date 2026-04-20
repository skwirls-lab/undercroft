'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { TurnState } from '@/engine/types';

interface PhaseTrackerProps {
  turn: TurnState;
  activePlayerName: string;
  className?: string;
}

const PHASES = [
  { key: 'beginning', label: 'Begin', short: 'B', icon: '◈' },
  { key: 'precombat_main', label: 'Main 1', short: 'M1', icon: '◆' },
  { key: 'combat', label: 'Combat', short: 'C', icon: '⚔' },
  { key: 'postcombat_main', label: 'Main 2', short: 'M2', icon: '◆' },
  { key: 'ending', label: 'End', short: 'E', icon: '◈' },
] as const;

export function PhaseTracker({ turn, activePlayerName, className }: PhaseTrackerProps) {
  const activeIndex = PHASES.findIndex((p) => p.key === turn.phase);

  return (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-xl border border-border/30 bg-card/60 backdrop-blur-md px-4 py-2',
      className
    )}>
      {/* Turn info — left side */}
      <div className="flex items-center gap-2 shrink-0">
        <AnimatePresence mode="wait">
          <motion.span
            key={turn.turnNumber}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="text-[10px] font-semibold uppercase tracking-widest text-gold/80"
          >
            Turn {turn.turnNumber}
          </motion.span>
        </AnimatePresence>
        <span className="text-xs font-bold text-foreground">{activePlayerName}</span>
      </div>

      {/* Phase gems — center */}
      <div className="flex items-center gap-1">
        {PHASES.map((phase, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;

          return (
            <div key={phase.key} className="flex items-center">
              <div
                className={cn(
                  'relative flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors duration-200',
                  isPast && 'text-muted-foreground/70',
                  isActive && 'text-gold',
                  !isActive && !isPast && 'text-muted-foreground/30'
                )}
                title={phase.label}
              >
                {/* Sliding active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="phase-indicator"
                    className="absolute inset-0 rounded-md bg-gold/20 border border-gold/40 shadow-[0_0_12px_rgba(212,169,68,0.3)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                {isPast && (
                  <div className="absolute inset-0 rounded-md bg-muted/40" />
                )}
                <span className={cn(
                  'relative text-xs',
                  isActive && 'text-gold',
                  isPast && 'text-muted-foreground/50'
                )}>
                  {phase.icon}
                </span>
                <span className="relative hidden sm:inline">{phase.label}</span>
                <span className="relative sm:hidden">{phase.short}</span>
              </div>
              {/* Connector line between phases */}
              {i < PHASES.length - 1 && (
                <div className={cn(
                  'h-px w-2 mx-0.5 transition-colors duration-300',
                  i < activeIndex ? 'bg-gold/40' : 'bg-border/20'
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Current step — right side */}
      <AnimatePresence mode="wait">
        <motion.div
          key={turn.step}
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ duration: 0.15 }}
          className="text-[10px] font-medium text-muted-foreground capitalize shrink-0"
        >
          {turn.step.replace(/_/g, ' ')}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
