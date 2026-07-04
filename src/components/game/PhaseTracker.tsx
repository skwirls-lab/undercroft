'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { TurnState } from '@/lib/gameTypes';

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
      'flex items-center justify-between rounded-xl border border-border/30 bg-card/60 backdrop-blur-md',
      className
    )} style={{ gap: 'clamp(6px,1.5vmin,1000px)', padding: 'clamp(4px,0.6vmin,1000px) clamp(8px,1.5vmin,1000px)' }}>
      {/* Turn info — left side */}
      <div className="flex items-center shrink-0" style={{ gap: 'clamp(4px,1vmin,1000px)' }}>
        <AnimatePresence mode="wait">
          <motion.span
            key={turn.turnNumber}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            className="font-semibold uppercase tracking-widest text-gold/80" style={{ fontSize: 'clamp(9px,1.5vmin,1000px)' }}
          >
            Turn {turn.turnNumber}
          </motion.span>
        </AnimatePresence>
        <span className="font-bold text-foreground" style={{ fontSize: 'clamp(11px,1.8vmin,1000px)' }}>{activePlayerName}</span>
      </div>

      {/* Phase gems — center */}
      <div className="flex items-center" style={{ gap: 'clamp(2px,0.4vmin,1000px)' }}>
        {PHASES.map((phase, i) => {
          const isActive = i === activeIndex;
          const isPast = i < activeIndex;

          return (
            <div key={phase.key} className="flex items-center">
              <div
                className={cn(
                  'relative flex items-center rounded-md font-semibold transition-colors duration-200',
                  `gap-[clamp(2px,0.4vmin,1000px)] px-[clamp(4px,1vmin,1000px)] py-[clamp(2px,0.4vmin,1000px)]`,
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
                  'relative',
                  isActive && 'text-gold',
                  isPast && 'text-muted-foreground/50'
                )} style={{ fontSize: 'clamp(10px,1.5vmin,1000px)' }}>
                  {phase.icon}
                </span>
                <span className="relative hidden sm:inline" style={{ fontSize: 'clamp(9px,1.3vmin,1000px)' }}>{phase.label}</span>
                <span className="relative sm:hidden" style={{ fontSize: 'clamp(9px,1.3vmin,1000px)' }}>{phase.short}</span>
              </div>
              {/* Connector line between phases */}
              {i < PHASES.length - 1 && (
                <div
                  className={cn('transition-colors duration-300', i < activeIndex ? 'bg-gold/40' : 'bg-border/20')}
                  style={{ height: '1px', width: 'clamp(4px,0.6vmin,1000px)', margin: '0 clamp(1px,0.2vmin,1000px)' }}
                />
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
          className="font-medium text-muted-foreground capitalize shrink-0" style={{ fontSize: 'clamp(9px,1.3vmin,1000px)' }}
        >
          {turn.step.replace(/_/g, ' ')}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
