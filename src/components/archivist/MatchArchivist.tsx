'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Send, Compass, ScrollText, X, Square } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useArchivist } from '@/hooks/useArchivist';
import { useGameStore } from '@/store/gameStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useDeckStore } from '@/store/deckStore';
import { matchContext, recapContext } from '@/lib/archivist/context';
import type { ChatMessage } from '@/lib/archivist/types';
import { Answer } from './Answer';
import { ArchivistNotice, Thinking, UsageLine } from './Notice';
import { useArchivistAccess, stateFromError } from './access';
import { useMatchHistoryStore } from '@/store/matchHistoryStore';
import { cn } from '@/lib/utils';

export type MatchAsk = 'advice' | 'recap';

interface Props {
  youId: string;
  onClose: () => void;
  /** Docked beside the board (desktop) or a bottom sheet (phone). */
  mode: 'docked' | 'sheet';
  /** Ask this the moment the panel mounts (the game-over button and the harness). */
  initialAsk?: MatchAsk | null;
}

/**
 * The Archivist at the table. Nothing leaves the browser until the player asks; the answer
 * is about the board as it stands when they do. The conversation lasts one turn: a new turn
 * is a new question, since the state the earlier answers were about is gone.
 */
export function MatchArchivist({ youId, onClose, mode, initialAsk }: Props) {
  const inner = <Panel youId={youId} onClose={onClose} docked={mode === 'docked'} initialAsk={initialAsk} />;
  if (mode === 'docked') {
    return (
      <aside className="flex h-full w-[min(340px,34vw)] shrink-0 flex-col border-l border-border/40 bg-background/80 backdrop-blur-xl" data-dev-archivist-panel>
        {inner}
      </aside>
    );
  }
  return (
    <Sheet open onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="bottom" showCloseButton={false} className="flex flex-col gap-0 overflow-hidden rounded-t-2xl border-border/40 p-0 data-[side=bottom]:h-[72dvh] data-[side=bottom]:max-h-[72dvh]" data-dev-archivist-panel>
        <SheetTitle className="sr-only">The Archivist</SheetTitle>
        {inner}
      </SheetContent>
    </Sheet>
  );
}

function Panel({ youId, onClose, docked, initialAsk }: { youId: string; onClose: () => void; docked: boolean; initialAsk?: MatchAsk | null }) {
  const gameState = useGameStore((s) => s.gameState);
  const legalActions = useGameStore((s) => s.legalActions);
  const gameEvents = useForgeGameStore((s) => s.gameEvents);
  const isGameOver = useForgeGameStore((s) => s.isGameOver) || !!gameState?.isGameOver;
  const winner = useForgeGameStore((s) => s.winner);
  const lastStart = useForgeGameStore((s) => s.lastStartPayload);
  const decks = useDeckStore((s) => s.decks);

  const adviceAccess = useArchivistAccess('archivist.match');
  const recapAccess = useArchivistAccess('archivist.recap');
  const { answer, streaming, error, ask, cancel } = useArchivist();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  // One conversation per turn.
  const turn = gameState?.turn.turnNumber ?? 0;
  const [seenTurn, setSeenTurn] = useState(turn);
  if (turn !== seenTurn) { setSeenTurn(turn); setMessages([]); }

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [answer, messages.length, pending]);

  const deck = lastStart?.commander ? decks.find((d) => d.commanderName === lastStart.commander) ?? null : null;

  const send = useCallback(async (kind: MatchAsk, text = '') => {
    if (!gameState) return;
    const shown = kind === 'recap' ? 'What happened in that game?' : (text.trim() || 'What should I do this turn?');
    setPending(shown);
    setQuestion('');
    const history = messages;
    const result = kind === 'recap'
      ? await ask({ task: 'game.recap', recap: recapContext(gameEvents as Array<Record<string, unknown>>, gameState, youId, winner, deck ? { name: deck.name, commanderName: deck.commanderName } : (lastStart?.commander ? { name: 'your deck', commanderName: lastStart.commander } : null)) })
      : await ask({ task: 'match.advice', match: matchContext(gameState, legalActions, youId), question: text.trim() }, history);
    setPending(null);
    if (result != null) setMessages((m) => [...m, { role: 'user', content: shown }, { role: 'assistant', content: result }]);
    // A recap is worth keeping: it goes on the match's record, readable from the history.
    if (result != null && kind === 'recap') {
      const matchId = useForgeGameStore.getState().matchId;
      if (matchId) void useMatchHistoryStore.getState().setRecap(matchId, result);
    }
  }, [ask, gameState, legalActions, gameEvents, youId, winner, deck, lastStart, messages]);

  // Ask once, on the next tick, so the panel paints before the request starts.
  const autoRef = useRef(false);
  useEffect(() => {
    if (!initialAsk || autoRef.current || !gameState) return;
    const access = initialAsk === 'recap' ? recapAccess : adviceAccess;
    if (access.state !== 'ok') return;
    const t = setTimeout(() => { if (!autoRef.current) { autoRef.current = true; void send(initialAsk); } }, 0);
    return () => clearTimeout(t);
  }, [initialAsk, gameState, adviceAccess, recapAccess, send]);

  const access = isGameOver ? recapAccess : adviceAccess;
  const errState = error ? stateFromError(error) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/40 px-3 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold"><BookOpen className="h-3.5 w-3.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm font-bold leading-tight">The Archivist</p>
          <p className="truncate text-[10px] text-muted-foreground">{isGameOver ? 'The game is over.' : `Turn ${turn} · asks nothing until you do`}</p>
        </div>
        <UsageLine used={access.used} allowed={access.allowed} className="hidden sm:inline" />
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close the Archivist" className="text-muted-foreground"><X className="h-4 w-4" /></Button>
      </header>

      <div ref={listRef} className={cn('archivist-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3', docked ? '' : 'pb-2')} aria-live="polite">
        {access.state !== 'ok' && !pending && messages.length === 0 ? (
          <ArchivistNotice state={access.state} message={access.message} />
        ) : messages.length === 0 && !pending ? (
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            {isGameOver
              ? 'Ask what decided the game and what to do differently.'
              : 'Ask what to do this turn, or anything about the board or the rules. The Archivist sees your hand, every battlefield and the stack, never an opponent’s hand.'}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => <Bubble key={i} message={m} />)}
            {pending && (
              <>
                <Bubble message={{ role: 'user', content: pending }} />
                <div className="rounded-xl border border-gold/20 bg-gold/[0.04] px-3 py-2.5">
                  {answer ? <Answer text={answer} /> : <Thinking />}
                </div>
              </>
            )}
            {error && errState && <ArchivistNotice state={errState} message={error.message} />}
            {access.state !== 'ok' && !pending && !error && <ArchivistNotice state={access.state} message={access.message} />}
          </div>
        )}
      </div>

      {(access.state === 'ok' || streaming) && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border/40 px-3 py-2.5">
          <div className="flex gap-2">
            {isGameOver ? (
              <Button size="sm" onClick={() => void send('recap')} disabled={streaming || !gameState} data-dev-archivist-ask="recap" className="h-8 flex-1 gap-1.5 bg-gold text-xs text-gold-foreground hover:bg-gold/90">
                <ScrollText className="h-3.5 w-3.5" /> What happened?
              </Button>
            ) : (
              <Button size="sm" onClick={() => void send('advice')} disabled={streaming || !gameState} data-dev-archivist-ask="advice" className="h-8 flex-1 gap-1.5 bg-gold text-xs text-gold-foreground hover:bg-gold/90">
                <Compass className="h-3.5 w-3.5" /> What should I do this turn?
              </Button>
            )}
            {streaming && (
              <Button size="sm" variant="outline" onClick={cancel} aria-label="Stop" className="h-8 w-8 p-0"><Square className="h-3 w-3" /></Button>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (question.trim()) void send('advice', question); }} className="flex items-center gap-2">
            <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={isGameOver ? 'Ask about the game…' : 'Ask about the board or the rules…'} disabled={streaming} aria-label="Ask the Archivist" className="h-8 text-xs" data-dev-archivist-question />
            <Button type="submit" size="icon" disabled={streaming || !question.trim()} aria-label="Send" className="h-8 w-8 shrink-0 bg-gold text-gold-foreground hover:bg-gold/90"><Send className="h-3.5 w-3.5" /></Button>
          </form>
        </div>
      )}
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return <p className="self-end rounded-xl border border-border/40 bg-card/70 px-3 py-1.5 text-xs text-foreground/80">{message.content}</p>;
  }
  return (
    <div className="rounded-xl border border-gold/20 bg-gold/[0.04] px-3 py-2.5">
      <Answer text={message.content} />
    </div>
  );
}
