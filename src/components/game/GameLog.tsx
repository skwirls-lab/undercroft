'use client';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { GameEvent } from '@/engine/types';

interface GameLogProps {
  events: GameEvent[];
  currentPlayerId?: string;
  className?: string;
}

const EVENT_ICONS: Partial<Record<GameEvent['type'], string>> = {
  GAME_STARTED: '🎮',
  TURN_STARTED: '🔄',
  PHASE_CHANGED: '⏩',
  CARD_DRAWN: '🃏',
  CARD_PLAYED: '📥',
  SPELL_CAST: '✨',
  SPELL_RESOLVED: '✅',
  CREATURE_ATTACKED: '⚔️',
  CREATURE_BLOCKED: '🛡️',
  DAMAGE_DEALT: '💥',
  LIFE_CHANGED: '❤️',
  CARD_DESTROYED: '💀',
  CARD_TAPPED: '↩️',
  CARD_UNTAPPED: '↪️',
  MANA_ADDED: '💎',
  PLAYER_LOST: '☠️',
  PLAYER_WON: '🏆',
  GAME_OVER: '🏁',
};

function formatEvent(event: GameEvent, currentPlayerId?: string): string {
  const icon = EVENT_ICONS[event.type] || '•';
  const data = event.data;
  const isOwnEvent = !currentPlayerId || event.playerId === currentPlayerId;

  switch (event.type) {
    case 'GAME_STARTED':
      return `${icon} Game started with ${data.playerCount} players`;
    case 'TURN_STARTED':
      return `${icon} Turn ${data.turnNumber}`;
    case 'PHASE_CHANGED':
      return `${icon} ${String(data.phase).replace(/_/g, ' ')}`;
    case 'CARD_DRAWN':
      return isOwnEvent
        ? `${icon} Drew ${data.cardName}`
        : `${icon} Opponent drew a card`;
    case 'CARD_PLAYED':
      return `${icon} Played ${data.cardName}`;
    case 'SPELL_CAST':
      return `${icon} Cast ${data.cardName}`;
    case 'SPELL_RESOLVED':
      return `${icon} ${data.cardName} resolved`;
    case 'CREATURE_ATTACKED':
      return `${icon} ${data.cardName} attacks`;
    case 'CREATURE_BLOCKED':
      return `${icon} ${data.blockerName} blocks`;
    case 'DAMAGE_DEALT':
      return `${icon} ${data.amount} damage dealt`;
    case 'LIFE_CHANGED':
      return `${icon} Life → ${data.newLife}`;
    case 'CARD_DESTROYED':
      return `${icon} ${data.cardName} destroyed`;
    case 'CARD_TAPPED':
      return `${icon} Tapped ${data.cardName}`;
    case 'CARD_UNTAPPED':
      return `${icon} Untapped ${data.cardName}`;
    case 'MANA_ADDED':
      return `${icon} +${data.amount} {${data.color}} mana`;
    case 'PLAYER_LOST':
      return `${icon} Player eliminated (${data.reason})`;
    case 'PLAYER_WON':
      return `${icon} ${data.playerName} wins!`;
    case 'GAME_OVER':
      return `${icon} Game over`;
    default:
      return `• ${event.type}`;
  }
}

export function GameLog({ events, currentPlayerId, className }: GameLogProps) {
  // Show last 100 events, newest first
  const displayEvents = events.slice(-100).reverse();

  return (
    <div className={cn('flex flex-col rounded-xl border border-border/30 bg-card/30 overflow-hidden', className)}>
      <div className="border-b border-border/20 px-3 py-1.5 text-xs font-medium text-muted-foreground shrink-0">
        Game Log
      </div>
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
    </div>
  );
}
