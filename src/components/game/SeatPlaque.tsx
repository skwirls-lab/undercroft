'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CommanderDamage } from './CommanderDamage';
import type { PlayerState } from '@/lib/gameTypes';
import { Heart, BookOpen, Skull, Ban, Crown, Swords, Sparkles, TreePine, ChevronRight, Droplets, Info } from 'lucide-react';

/**
 * One seat at the table: a stone plaque with the player's name, life, zone counts and
 * commander damage, over their commander's art. Tapping opens their board.
 *
 * Life changes pulse the plaque (red for loss, green for gain) so a hit registers without
 * having to read the number — the main view is mostly numbers, and this is the one place
 * motion earns its keep there.
 */
export interface SeatStats {
  library: number;
  graveyard: number;
  exile: number;
  creatures: number;
  other: number;
  lands: number;
  handSize: number;
  commanderOnField: boolean;
  commanderArt?: string;
  commanderName?: string;
}

interface SeatPlaqueProps {
  player: PlayerState;
  stats: SeatStats;
  isYou: boolean;
  isActiveTurn: boolean;
  hasPriority: boolean;
  compact?: boolean;
  onOpen: () => void;
  /** Open the seat inspector (stats, commander damage, graveyard and exile). */
  onInspect?: () => void;
}

export function SeatPlaque({ player, stats, isYou, isActiveTurn, hasPriority, compact, onOpen, onInspect }: SeatPlaqueProps) {
  // Direction of the last life change, read in render against the previous value and
  // committed after. The pulse itself is a one-shot CSS animation on an element keyed by
  // life, so it restarts on every change and ends on its own — no timers, no state.
  const prevLife = useRef(player.life);
  const pulse: 'loss' | 'gain' | null =
    player.life < prevLife.current ? 'loss' : player.life > prevLife.current ? 'gain' : null;
  useEffect(() => {
    prevLife.current = player.life;
  }, [player.life]);

  const lifeTone = player.life <= 10 ? 'text-red-300' : player.life <= 20 ? 'text-amber-200' : 'text-foreground';

  return (
    <button
      data-dev-open={player.id}
      onClick={onOpen}
      className={cn(
        'group relative flex h-full min-h-0 w-full flex-1 overflow-hidden rounded-xl border text-left transition-[border-color,box-shadow,transform] duration-300 active:scale-[0.99]',
        'plaque',
        isYou && hasPriority && 'border-gold/50 shadow-[0_0_28px_-6px_var(--gold-glow)]',
        !isYou && isActiveTurn && 'border-foreground/30',
        player.hasLost && 'opacity-40 grayscale',
        compact ? 'flex-row items-center gap-3 px-3 py-2' : 'flex-col justify-end p-[clamp(10px,2vmin,18px)]'
      )}
    >
      {/* Commander art behind, heavily vignetted */}
      {stats.commanderArt && (
        <div className="pointer-events-none absolute inset-0">
          <Image src={stats.commanderArt} alt="" fill sizes="600px" className="object-cover object-[50%_20%] opacity-[0.32] saturate-[1.2]" unoptimized />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-card/20" />
        </div>
      )}
      {pulse && <span key={player.life} className={cn('pointer-events-none absolute inset-0 rounded-xl', pulse === 'loss' ? 'pulse-loss' : 'pulse-gain')} />}
      {/* Active-turn marker: a thin light along the top edge, deliberately not gold */}
      {isActiveTurn && <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/50 to-transparent" />}
      {onInspect && !compact && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Details for ${player.name}`}
          title="Details: commander damage, graveyard, exile"
          data-dev-inspect={player.id}
          onClick={(e) => { e.stopPropagation(); onInspect(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onInspect(); } }}
          className="absolute right-[clamp(8px,1.5vmin,14px)] top-[clamp(8px,1.5vmin,14px)] z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-foreground/70 ring-1 ring-white/10 backdrop-blur-sm transition-colors hover:bg-gold hover:text-gold-foreground"
        >
          <Info className="h-3.5 w-3.5" />
        </span>
      )}

      {compact ? (
        <>
          <div className="relative flex min-w-0 flex-1 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">{player.name}</span>
              {player.isAI && <span className="rounded bg-muted/70 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">AI</span>}
              <Crown className={cn('h-3.5 w-3.5 shrink-0', stats.commanderOnField ? 'text-green-400' : 'text-muted-foreground/30')} />
            </div>
            <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted-foreground/70">
              <Mini icon={BookOpen} n={stats.library} />
              <Mini icon={Skull} n={stats.graveyard} />
              <Mini icon={Swords} n={stats.creatures} />
              <Mini icon={TreePine} n={stats.lands} />
              <span className="text-muted-foreground/40">·</span>
              <span>{stats.handSize} in hand</span>
              {player.poisonCounters > 0 && <span className="flex items-center gap-0.5 text-green-400"><Droplets className="h-3 w-3" />{player.poisonCounters}</span>}
            </div>
            <CommanderDamage damage={player.commanderDamageReceived} compact className="mt-1" />
          </div>
          {onInspect && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Details for ${player.name}`}
              title="Details: commander damage, graveyard, exile"
              data-dev-inspect={player.id}
              onClick={(e) => { e.stopPropagation(); onInspect(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onInspect(); } }}
              className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/45 text-foreground/70 ring-1 ring-white/10 transition-colors hover:bg-gold hover:text-gold-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          )}
          <div className={cn('relative flex items-center gap-1 font-display text-2xl font-bold tabular-nums', lifeTone)}>
            <Heart className="h-4 w-4 text-red-400" />
            {player.life}
          </div>
          <ChevronRight className="relative h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
        </>
      ) : (
        <>
          <div className={cn('relative flex items-start justify-between gap-2', onInspect && 'pr-9')}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate font-display font-bold" style={{ fontSize: 'clamp(15px,3vmin,22px)' }}>{player.name}</span>
                {player.isAI && <span className="rounded bg-muted/70 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">AI</span>}
              </div>
              {stats.commanderName && (
                <div className="mt-0.5 flex items-center gap-1 truncate text-muted-foreground" style={{ fontSize: 'clamp(10px,1.8vmin,12px)' }}>
                  <Crown className={cn('h-3 w-3 shrink-0', stats.commanderOnField ? 'text-green-400' : 'text-muted-foreground/40')} />
                  <span className="truncate">{stats.commanderName}</span>
                </div>
              )}
            </div>
            <div className={cn('flex shrink-0 items-center gap-1 font-display font-bold tabular-nums', lifeTone)} style={{ fontSize: 'clamp(22px,5vmin,40px)', lineHeight: 1 }}>
              <Heart className="text-red-400" style={{ width: 'clamp(14px,3vmin,22px)', height: 'clamp(14px,3vmin,22px)' }} />
              {player.life}
            </div>
          </div>

          <div className="relative mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-[clamp(6px,1.5vmin,12px)] text-muted-foreground/70" style={{ fontSize: 'clamp(11px,2vmin,13px)' }}>
            <Mini icon={BookOpen} n={stats.library} label="Library" />
            <Mini icon={Skull} n={stats.graveyard} label="Graveyard" />
            <Mini icon={Ban} n={stats.exile} label="Exile" />
            <span className="text-border">|</span>
            <Mini icon={Swords} n={stats.creatures} label="Creatures" />
            <Mini icon={Sparkles} n={stats.other} label="Other permanents" />
            <Mini icon={TreePine} n={stats.lands} label="Lands" />
            {!isYou && (
              <>
                <span className="text-border">|</span>
                <span title="Cards in hand">{stats.handSize} in hand</span>
              </>
            )}
            {player.poisonCounters > 0 && <span className="flex items-center gap-0.5 text-green-400"><Droplets className="h-3.5 w-3.5" />{player.poisonCounters}</span>}
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
          </div>
          <CommanderDamage damage={player.commanderDamageReceived} compact={!isYou} className="relative mt-1.5" />
        </>
      )}
    </button>
  );
}

function Mini({ icon: Icon, n, label }: { icon: React.ComponentType<{ className?: string }>; n: number; label?: string }) {
  return (
    <span className="flex items-center gap-1 tabular-nums" title={label}>
      <Icon className="h-[1.1em] w-[1.1em] shrink-0" />
      {n}
    </span>
  );
}
