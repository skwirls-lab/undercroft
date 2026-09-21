'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { GameEvent } from '@/lib/gameTypes';
import { describeEvent } from '@/lib/gameLog';

interface GameLogProps {
  events: GameEvent[];
  currentPlayerId?: string;
  youName?: string;
  collapsible?: boolean;
  className?: string;
}

function formatEvent(event: GameEvent, youName?: string): string {
  const line = describeEvent({ ...(event.data ?? {}), eventType: event.type }, youName);
  return line ? line.text : String(event.type).replace(/_/g, ' ').toLowerCase();
}

export function GameLog({ events, youName, collapsible = true, className }: GameLogProps) {
  const [expanded, setExpanded] = useState(!collapsible);
  const isOpen = !collapsible || expanded;
  // Show last 100 events, newest first
  const displayEvents = events.slice(-100).reverse();

  return (
    <div className={cn(
      'flex flex-col rounded-xl border border-border/20 bg-card/40 overflow-hidden transition-all duration-300',
      collapsible ? (expanded ? 'h-48 lg:h-64' : 'h-10') : 'flex-1 min-h-0',
      className
    )}>
      {collapsible && (
        <button 
          onClick={() => setExpanded(!expanded)}
          className="flex h-10 w-full items-center justify-between border-b border-border/10 px-3 text-xs font-semibold text-muted-foreground shrink-0 hover:bg-muted/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-gold/60" /> Game Log
            <span className="text-muted-foreground/40 font-normal">({events.length})</span>
          </span>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      )}

      {!collapsible && (
        <div className="flex h-8 items-center px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 shrink-0">
          Game Log
        </div>
      )}

      {isOpen && (
        <ScrollArea className="flex-1 min-h-0">
          <div className="flex flex-col gap-0.5 p-2">
            {displayEvents.map((event, i) => (
              <div
                key={event.id || i}
                className={cn(
                  'text-[11px] leading-relaxed',
                  event.type === 'TURN_STARTED' && 'mt-1 font-semibold text-foreground border-t border-border/10 pt-1',
                  event.type === 'PLAYER_WON' && 'font-bold text-primary',
                  event.type === 'PLAYER_LOST' && 'text-destructive',
                  event.type !== 'TURN_STARTED' &&
                    event.type !== 'PLAYER_WON' &&
                    event.type !== 'PLAYER_LOST' &&
                    'text-muted-foreground'
                )}
              >
                {formatEvent(event, youName)}
              </div>
            ))}
            {displayEvents.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground/50">
                Game log will appear here
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
