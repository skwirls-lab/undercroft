'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, X } from 'lucide-react';
import type { GameEvent } from '@/lib/gameTypes';

interface EventTickerProps {
  events: GameEvent[];
  currentPlayerId?: string;
  className?: string;
}

/** Consolidate consecutive events of the same type + player into one summary */
function consolidateRecent(events: GameEvent[], maxItems = 6): string[] {
  if (events.length === 0) return [];
  const recent = events.slice(-30);
  const lines: string[] = [];
  let i = recent.length - 1;

  while (i >= 0 && lines.length < maxItems) {
    const ev = recent[i];
    const data = ev.data || {};
    const who = (data.playerName as string) || '';

    // Skip phase/turn noise for the ticker
    if (ev.type === 'PHASE_CHANGED' || ev.type === 'GAME_STARTED') {
      i--;
      continue;
    }

    if (ev.type === 'TURN_STARTED') {
      lines.push(`Turn ${data.turnNumber ?? '?'} — ${(data.activePlayer as string) || who}`);
      i--;
      continue;
    }

    // Count consecutive identical events (same type + same player)
    let count = 1;
    let j = i - 1;
    while (j >= 0 && recent[j].type === ev.type) {
      const jData = recent[j].data || {};
      if ((jData.playerName as string) === who) {
        count++;
        j--;
      } else break;
    }

    const card = (data.cardName as string) || '';
    let text = '';
    switch (ev.type) {
      case 'CARD_DRAWN':
        text = data.isOwn
          ? (count > 1 ? `You drew ${count} cards` : `You drew ${card || 'a card'}`)
          : (count > 1 ? `${who} drew ${count} cards` : `${who} drew a card`);
        break;
      case 'CARD_PLAYED':
        text = count > 1 ? `${who} played ${count} cards` : `${who || 'Played'} ${card}`;
        break;
      case 'SPELL_CAST':
        text = count > 1 ? `${who} cast ${count} spells` : `${who} cast ${card}`;
        break;
      case 'SPELL_RESOLVED':
        text = count > 1 ? `${count} spells resolved` : `${card} resolved`;
        break;
      case 'LIFE_CHANGED': {
        const delta = data.delta as number;
        const sign = delta > 0 ? '+' : '';
        text = `${who} ${sign}${delta} life → ${data.newLife}`;
        break;
      }
      case 'CARD_DESTROYED':
        text = count > 1 ? `${count} permanents destroyed` : `${card} destroyed`;
        break;
      case 'DAMAGE_DEALT':
        text = `${data.amount} dmg → ${(data.targetName as string) || '?'}`;
        break;
      case 'CREATURE_ATTACKED':
        text = `${card || who} attacks`;
        break;
      case 'MANA_ADDED':
        // skip mana noise in ticker
        i = j;
        i--;
        continue;
      case 'CARD_TAPPED':
      case 'CARD_UNTAPPED':
        // skip tap/untap noise
        i = j;
        i--;
        continue;
      default:
        text = String(ev.type).replace(/_/g, ' ').toLowerCase();
    }

    lines.push(text);
    i = j;
  }

  return lines;
}

function formatEventFull(event: GameEvent): string {
  const data = event.data || {};
  const who = (data.playerName as string) || '';
  const card = (data.cardName as string) || '';

  switch (event.type) {
    case 'GAME_STARTED': return '▸ Game started';
    case 'TURN_STARTED': return `─ Turn ${data.turnNumber ?? 1} — ${(data.activePlayer as string) || who}`;
    case 'PHASE_CHANGED': return `› ${String(data.phase ?? '').replace(/_/g, ' ')}`;
    case 'CARD_DRAWN': return data.isOwn ? `+ Drew ${card || 'a card'}` : `+ ${who} drew a card`;
    case 'CARD_PLAYED': return `▼ ${who ? `${who} played` : 'Played'} ${card}`;
    case 'SPELL_CAST': return `✦ ${who ? `${who} cast` : 'Cast'} ${card}`;
    case 'SPELL_RESOLVED': return `✓ ${card} resolved`;
    case 'CREATURE_ATTACKED': return `⚔ ${card || who} attacks`;
    case 'CREATURE_BLOCKED': return `◆ ${(data.blockerName as string) || ''} blocks ${card}`;
    case 'DAMAGE_DEALT': return `• ${data.amount ?? 0} damage → ${(data.targetName as string) || '?'}`;
    case 'LIFE_CHANGED': { const d = data.delta as number; return `♥ ${who} ${d > 0 ? '+' : ''}${d} → ${data.newLife}`; }
    case 'CARD_DESTROYED': return `✖ ${card} destroyed`;
    case 'CARD_TAPPED': return `↻ ${card} tapped`;
    case 'CARD_UNTAPPED': return `↺ ${card} untapped`;
    case 'MANA_ADDED': return `◇ +${data.amount ?? 0} ${data.color ?? ''} mana`;
    case 'PLAYER_LOST': return `☠ ${who} eliminated`;
    case 'PLAYER_WON': return `★ ${who || card} wins!`;
    case 'GAME_OVER': return '■ Game over';
    default: return `• ${String(event.type).replace(/_/g, ' ').toLowerCase()}`;
  }
}

export function EventTicker({ events, currentPlayerId, className }: EventTickerProps) {
  const [logOpen, setLogOpen] = useState(false);
  const tickerLines = useMemo(() => consolidateRecent(events, 4), [events]);
  const displayEvents = useMemo(() => events.slice(-100).reverse(), [events]);

  return (
    <>
      {/* Thin ticker strip */}
      <button
        onClick={() => setLogOpen(true)}
        className={cn(
          'flex items-center gap-2 px-2 py-0.5 text-left w-full shrink-0 border-b border-border/10',
          'bg-card/30 hover:bg-card/50 transition-colors min-h-[22px]',
          className
        )}
      >
        <ScrollText className="h-3 w-3 text-gold/40 shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          {tickerLines.length > 0 ? (
            tickerLines.map((line, i) => (
              <span key={i} className="text-[10px] text-muted-foreground/70 shrink-0 whitespace-nowrap">
                {line}
                {i < tickerLines.length - 1 && <span className="text-border/30 ml-2">·</span>}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-muted-foreground/30 italic">No events yet</span>
          )}
        </div>
      </button>

      {/* Full log overlay */}
      <AnimatePresence>
        {logOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/30 shrink-0">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-gold/60" />
                <span className="text-sm font-semibold">Game Log</span>
                <span className="text-xs text-muted-foreground/50">({events.length})</span>
              </div>
              <button
                onClick={() => setLogOpen(false)}
                className="rounded-lg bg-muted/30 p-1.5 text-muted-foreground hover:bg-muted/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col gap-0.5 p-3">
                {displayEvents.map((event, i) => (
                  <div
                    key={event.id || i}
                    className={cn(
                      'text-[11px] leading-relaxed',
                      event.type === 'TURN_STARTED' && 'mt-2 font-semibold text-foreground border-t border-border/10 pt-1',
                      event.type === 'PLAYER_WON' && 'font-bold text-primary',
                      event.type === 'PLAYER_LOST' && 'text-destructive',
                      event.type !== 'TURN_STARTED' && event.type !== 'PLAYER_WON' && event.type !== 'PLAYER_LOST' && 'text-muted-foreground'
                    )}
                  >
                    {formatEventFull(event)}
                  </div>
                ))}
                {displayEvents.length === 0 && (
                  <div className="py-8 text-center text-xs text-muted-foreground/50">
                    Game log will appear here
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
