'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { GameEvent } from '@/lib/gameTypes';

interface GameLogProps {
  events: GameEvent[];
  currentPlayerId?: string;
  collapsible?: boolean;
  className?: string;
}

const EVENT_ICONS: Partial<Record<GameEvent['type'], string>> = {
  GAME_STARTED: '▸',
  TURN_STARTED: '─',
  PHASE_CHANGED: '›',
  CARD_DRAWN: '+',
  CARD_PLAYED: '▼',
  SPELL_CAST: '✦',
  SPELL_RESOLVED: '✓',
  CREATURE_ATTACKED: '⚔',
  CREATURE_BLOCKED: '◆',
  DAMAGE_DEALT: '•',
  LIFE_CHANGED: '♥',
  CARD_DESTROYED: '✖',
  CARD_TAPPED: '↻',
  CARD_UNTAPPED: '↺',
  MANA_ADDED: '◇',
  PLAYER_LOST: '☠',
  PLAYER_WON: '★',
  GAME_OVER: '■',
};

function formatEvent(event: GameEvent, _currentPlayerId?: string): string {
  const icon = EVENT_ICONS[event.type] || '•';
  const data = event.data;
  const who = (data?.playerName as string) || '';
  const card = (data?.cardName as string) || '';

  const PHASE_LABELS: Record<string, string> = {
    MAIN1: 'Main Phase 1',
    MAIN2: 'Main Phase 2',
    COMBAT: 'Combat',
    BEGIN_COMBAT: 'Begin Combat',
    END_OF_COMBAT: 'End of Combat',
    CLEANUP: 'Cleanup',
    UPKEEP: 'Upkeep',
    DRAW: 'Draw Step',
    END: 'End Step',
  };

  switch (event.type) {
    case 'GAME_STARTED':
      return `${icon} Game started`;
    case 'TURN_STARTED': {
      const active = (data?.activePlayer as string) || '';
      return `${icon} Turn ${data?.turnNumber ?? 1}${active ? ` — ${active}` : ''}`;
    }
    case 'PHASE_CHANGED': {
      const phase = String(data?.phase ?? '');
      const activeP = (data?.activePlayer as string) || '';
      const label = PHASE_LABELS[phase] || phase.replace(/_/g, ' ');
      return `${icon} ${label}${activeP ? ` (${activeP})` : ''}`;
    }
    case 'CARD_DRAWN':
      if (data?.isOwn) {
        return card ? `${icon} You drew ${card}` : `${icon} You drew a card`;
      }
      return `${icon} ${who || 'Opponent'} drew a card`;
    case 'CARD_PLAYED':
      return card
        ? `${icon} ${who ? `${who} played` : 'Played'} ${card}`
        : `${icon} ${who || 'Player'} played a card`;
    case 'SPELL_CAST':
      return card
        ? `${icon} ${who ? `${who} cast` : 'Cast'} ${card}`
        : `${icon} ${who || 'Player'} cast a spell`;
    case 'SPELL_RESOLVED': {
      const ctrl = (data?.controller as string) || '';
      return card
        ? `${icon} ${card} resolved${ctrl ? ` (${ctrl})` : ''}`
        : `${icon} Spell resolved`;
    }
    case 'CREATURE_ATTACKED':
      return `${icon} ${card || who} attacks`;
    case 'CREATURE_BLOCKED':
      return `${icon} ${(data?.blockerName as string) || ''} blocks ${card}`;
    case 'DAMAGE_DEALT':
      return `${icon} ${data?.amount ?? 0} damage to ${(data?.targetName as string) || 'target'}`;
    case 'LIFE_CHANGED': {
      const delta = data?.delta as number;
      const sign = delta > 0 ? '+' : '';
      return `${icon} ${who || 'Player'} life ${sign}${delta} → ${data?.newLife}`;
    }
    case 'CARD_DESTROYED':
      return card
        ? `${icon} ${card} was destroyed${who ? ` (${who})` : ''}`
        : `${icon} Permanent destroyed`;
    case 'CARD_TAPPED':
      return `${icon} ${card} tapped`;
    case 'CARD_UNTAPPED':
      return `${icon} ${card} untapped`;
    case 'MANA_ADDED':
      return `${icon} +${data?.amount ?? 0} ${data?.color ?? ''} mana`;
    case 'PLAYER_LOST':
      return `${icon} ${who || 'Player'} eliminated`;
    case 'PLAYER_WON':
      return `${icon} ${who || card} wins!`;
    case 'GAME_OVER':
      return `${icon} Game over`;
    default:
      return `• ${String(event.type).replace(/_/g, ' ').toLowerCase()}`;
  }
}

export function GameLog({ events, currentPlayerId, collapsible = true, className }: GameLogProps) {
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
                {formatEvent(event, currentPlayerId)}
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
