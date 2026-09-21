'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ScrollText, X } from 'lucide-react';
import { describeEvent, indexOfYourLastTurn, type LogTone } from '@/lib/gameLog';
import type { GameEvent } from '@/lib/gameTypes';

interface EventTickerProps {
  events: GameEvent[];
  currentPlayerId?: string;
  /** The human seat's name, so lines about them read as "You". */
  youName?: string;
  className?: string;
}

const TONE_CLASS: Record<LogTone, string> = {
  turn: 'font-semibold text-foreground',
  phase: 'text-muted-foreground/50 italic',
  good: 'text-emerald-300/90',
  bad: 'text-amber-300/90',
  danger: 'text-red-300',
  muted: 'text-muted-foreground/60',
  normal: 'text-muted-foreground',
};

/** A GameEvent as the log describes it: the event's own fields plus its type. */
function raw(ev: GameEvent): Record<string, unknown> {
  return { ...(ev.data ?? {}), eventType: ev.type };
}

/**
 * The last few things that happened, newest first, with runs of the same kind by the same
 * player folded into one ("Krenko AI created 4 tokens"). Mana, phases and untaps never make
 * the strip; the full log has them behind a switch.
 */
function consolidateRecent(events: GameEvent[], youName: string | undefined, maxItems = 6): string[] {
  if (events.length === 0) return [];
  const recent = events.slice(-40);
  const lines: string[] = [];
  let i = recent.length - 1;

  while (i >= 0 && lines.length < maxItems) {
    const ev = recent[i];
    const data = ev.data || {};
    const who = (data.playerName as string) || '';
    if (ev.type === 'GAME_STARTED' || ev.type === 'OPENING_HANDS') { i--; continue; }

    const line = describeEvent(raw(ev), youName);
    if (!line || line.detail) { i--; continue; }

    // Fold consecutive events of the same kind by the same player.
    let count = 1;
    let j = i - 1;
    while (j >= 0 && recent[j].type === ev.type && ((recent[j].data || {}).playerName as string) === who) { count++; j--; }

    const seat = who === youName || who === 'You' ? 'You' : who;
    let text = line.text;
    if (count > 1) {
      switch (ev.type) {
        case 'CARD_DRAWN': text = `${seat} drew ${count} cards`; break;
        case 'CARD_PLAYED': text = `${seat} played ${count} cards`; break;
        case 'SPELL_CAST': text = `${seat} cast ${count} spells`; break;
        case 'TOKEN_CREATED': text = `${seat} created ${count} tokens`; break;
        case 'SPELL_RESOLVED': text = `${count} spells resolved`; break;
        case 'CARD_DESTROYED': text = `${count} permanents went to the graveyard`; break;
        case 'CREATURE_ATTACKED': text = `${count} creatures attack${seat ? ` (${seat})` : ''}`; break;
        default: count = 1; j = i - 1; // not foldable: show the newest only
      }
    }
    lines.push(text);
    i = j;
  }
  return lines;
}

interface Row { key: string; text: string; tone: LogTone; detail: boolean; type: string; turn: number }

export function EventTicker({ events, youName, className }: EventTickerProps) {
  const [logOpen, setLogOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [sinceMyTurn, setSinceMyTurn] = useState(false);

  const tickerLines = useMemo(() => consolidateRecent(events, youName), [events, youName]);

  const rows = useMemo<Row[]>(() => {
    const rawEvents = events.map(raw);
    const start = sinceMyTurn ? indexOfYourLastTurn(rawEvents, youName) : 0;
    const out: Row[] = [];
    for (let i = start; i < events.length; i++) {
      const line = describeEvent(rawEvents[i], youName);
      if (!line) continue;
      if (line.detail && !showDetail) continue;
      out.push({ key: events[i].id || String(i), text: line.text, tone: line.tone, detail: line.detail, type: events[i].type, turn: Number(events[i].data?.turn ?? 0) });
    }
    return out.reverse();
  }, [events, youName, showDetail, sinceMyTurn]);

  return (
    <>
      {/* Thin ticker strip */}
      <button
        data-tour="board-ticker"
        onClick={() => setLogOpen(true)}
        className={cn(
          'flex items-center text-left w-full shrink-0 border-b border-border/10',
          'bg-card/30 hover:bg-card/50 transition-colors',
          className
        )}
        style={{ padding: 'clamp(2px,0.5vmin,1000px) clamp(6px,1.5vmin,1000px)', gap: 'clamp(4px,1vmin,1000px)', minHeight: 'clamp(22px,3.5vh,1000px)' }}
      >
        <ScrollText className="text-gold/40 shrink-0" style={{ width: 'clamp(12px,2.5vmin,1000px)', height: 'clamp(12px,2.5vmin,1000px)' }} />
        <div className="flex-1 min-w-0 flex items-center overflow-hidden" style={{ gap: 'clamp(4px,1vmin,1000px)' }}>
          {tickerLines.length > 0 ? (
            tickerLines.map((line, i) => (
              <span key={i} className="text-muted-foreground/70 shrink-0 whitespace-nowrap" style={{ fontSize: 'clamp(9px,2vmin,1000px)' }}>
                {line}
                {i < tickerLines.length - 1 && <span className="text-border/30" style={{ marginLeft: 'clamp(4px,0.8vmin,1000px)' }}>·</span>}
              </span>
            ))
          ) : (
            <span className="text-muted-foreground/30 italic" style={{ fontSize: 'clamp(9px,2vmin,1000px)' }}>No events yet</span>
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
            data-dev-game-log
          >
            <div className="flex items-center justify-between border-b border-border/30 shrink-0" style={{ padding: 'clamp(6px,1vmin,1000px) clamp(10px,2vmin,1000px)' }}>
              <div className="flex items-center" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
                <ScrollText className="text-gold/60" style={{ width: 'clamp(14px,2.5vmin,1000px)', height: 'clamp(14px,2.5vmin,1000px)' }} />
                <span className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)' }}>Game Log</span>
                <span className="text-muted-foreground/50" style={{ fontSize: 'clamp(11px,2vmin,1000px)' }}>({rows.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <LogToggle on={sinceMyTurn} onClick={() => setSinceMyTurn((v) => !v)} title="Only what happened since your last turn began">Since my last turn</LogToggle>
                <LogToggle on={showDetail} onClick={() => setShowDetail((v) => !v)} title="Mana taps, phases and counters">Details</LogToggle>
                <button
                  onClick={() => setLogOpen(false)}
                  className="rounded-lg bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  style={{ padding: 'clamp(4px,0.8vmin,1000px)' }}
                  aria-label="Close the log"
                >
                  <X style={{ width: 'clamp(18px,3vmin,1000px)', height: 'clamp(18px,3vmin,1000px)' }} />
                </button>
              </div>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col" style={{ gap: 'clamp(2px,0.3vmin,1000px)', padding: 'clamp(6px,1.2vmin,1000px)' }}>
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className={cn('leading-relaxed', TONE_CLASS[row.tone], row.type === 'TURN_STARTED' && 'border-t border-border/10')}
                    style={{
                      fontSize: 'clamp(11px,2vmin,1000px)',
                      marginTop: row.type === 'TURN_STARTED' ? 'clamp(6px,1vmin,1000px)' : undefined,
                      paddingTop: row.type === 'TURN_STARTED' ? 'clamp(4px,0.6vmin,1000px)' : undefined,
                      paddingLeft: row.type === 'TURN_STARTED' || row.type === 'GAME_OVER' || row.type === 'GAME_STARTED' ? undefined : 'clamp(8px,1.5vmin,1000px)',
                    }}
                  >
                    {row.text}
                  </div>
                ))}
                {rows.length === 0 && (
                  <div className="text-center text-muted-foreground/50" style={{ padding: 'clamp(20px,4vmin,1000px) 0', fontSize: 'clamp(11px,2vmin,1000px)' }}>
                    {sinceMyTurn ? 'Nothing has happened since your last turn began.' : 'Game log will appear here'}
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

function LogToggle({ on, onClick, title, children }: { on: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors', on ? 'border-gold/50 bg-gold/15 text-gold' : 'border-border/40 text-muted-foreground hover:border-gold/40 hover:text-foreground')}
    >
      {children}
    </button>
  );
}
