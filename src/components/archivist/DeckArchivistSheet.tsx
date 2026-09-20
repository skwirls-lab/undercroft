'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { BookOpen, Sparkles, ArrowLeftRight, Map, MessageCircleQuestion, Check, Loader2, Send } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useArchivist } from '@/hooks/useArchivist';
import { IMPROVE_GOALS, type ImproveGoal, type Swap, type DeckContext } from '@/lib/archivist/types';
import { parseSwaps } from '@/lib/archivist/prompts';
import { loadCardRecords, frontFace } from '@/lib/deckCards';
import { fitsIdentity } from '@/lib/deckRules';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { ManaCostDisplay } from '@/components/game/ManaSymbol';
import { Answer } from './Answer';
import { ArchivistNotice, Thinking, UsageLine } from './Notice';
import { useArchivistAccess, stateFromError } from './access';
import { cn } from '@/lib/utils';

export type DeckTask = 'improve' | 'swaps' | 'strategy' | 'ask';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The deck as the Archivist reads it; built by the page from live records and the check. */
  context: DeckContext;
  /** Names in the deck, for validating swaps and for the reader. */
  deckNames: Set<string>;
  /** Apply a swap the player accepted. The page owns the write. */
  onSwap: (remove: string, add: ScryfallCardRecord) => Promise<void> | void;
  onOpenCard: (name: string) => void;
  /** Ask this task as soon as the sheet opens (the harness and deep links). */
  initialTask?: DeckTask | null;
  /** False while the page is still loading card records; nothing is asked until they are in. */
  ready?: boolean;
}

/** A swap that survived validation: the card exists and fits the commander's colours. */
interface ResolvedSwap extends Swap {
  record: ScryfallCardRecord;
}

const TASKS: Array<{ id: DeckTask; label: string; hint: string; icon: typeof Sparkles }> = [
  { id: 'improve', label: 'Improve this deck', hint: 'What works, what holds it back, what to change.', icon: Sparkles },
  { id: 'swaps', label: 'Suggest swaps', hint: 'One-for-one cuts and adds, verified before you see them.', icon: ArrowLeftRight },
  { id: 'strategy', label: 'How do I pilot it?', hint: 'Game plan, opening hands, key lines, what beats it.', icon: Map },
  { id: 'ask', label: 'Ask a question', hint: 'Anything about this deck or the rules.', icon: MessageCircleQuestion },
];

/**
 * The deck page's consultation. Three prepared questions and a free one; the swaps task
 * comes back as tiles with Apply, and only after every suggested card has been looked up and
 * checked against the commander's colours, so nothing the model made up can reach the deck.
 */
export function DeckArchivistSheet({ open, onOpenChange, context, deckNames, onSwap, onOpenCard, initialTask, ready = true }: Props) {
  const access = useArchivistAccess('archivist.deck');
  const { answer, streaming, error, ask, reset } = useArchivist();
  const [task, setTask] = useState<DeckTask | null>(null);
  const [goal, setGoal] = useState<ImproveGoal>('general');
  const [question, setQuestion] = useState('');
  const [swaps, setSwaps] = useState<ResolvedSwap[] | null>(null);
  const [dropped, setDropped] = useState(0);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  const run = useCallback(async (which: DeckTask, q = question, g = goal) => {
    setTask(which);
    setSwaps(null);
    setDropped(0);
    setAsked(true);
    if (which === 'improve') { await ask({ task: 'deck.improve', deck: context, goal: g }); return; }
    if (which === 'strategy') { await ask({ task: 'deck.strategy', deck: context }); return; }
    if (which === 'ask') { if (!q.trim()) return; await ask({ task: 'rules.question', question: q.trim(), deck: context }); return; }
    const raw = await ask({ task: 'deck.swaps', deck: context, goal: g });
    if (raw == null) return;
    const parsed = parseSwaps(raw, deckNames, context.commander?.name ?? '');
    const records = await loadCardRecords(parsed.map((s) => s.add));
    const identity = context.commander?.identity ?? null;
    const kept: ResolvedSwap[] = [];
    for (const s of parsed) {
      const rec = records.get(s.add);
      if (!rec) continue;
      if (identity && !fitsIdentity(rec, identity)) continue;
      kept.push({ ...s, record: rec });
    }
    setSwaps(kept);
    setDropped(parsed.length - kept.length);
  }, [ask, context, deckNames, goal, question]);

  // Deep link: ask once when opened with a task.
  const autoRef = useRef(false);
  useEffect(() => {
    if (!open || !ready || !initialTask || autoRef.current || access.state !== 'ok') return;
    const t = setTimeout(() => { if (!autoRef.current) { autoRef.current = true; void run(initialTask); } }, 0);
    return () => clearTimeout(t);
  }, [open, ready, initialTask, access.state, run]);

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) { reset(); setTask(null); setSwaps(null); setAsked(false); setApplied(new Set()); }
  };

  const apply = async (s: ResolvedSwap) => {
    setBusy(s.remove);
    try {
      await onSwap(s.remove, s.record);
      setApplied((prev) => new Set(prev).add(s.remove));
    } finally {
      setBusy(null);
    }
  };

  const errState = error ? stateFromError(error) : null;

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg" data-dev-archivist-sheet>
        <SheetHeader className="border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold"><BookOpen className="h-5 w-5" /></span>
            <div className="min-w-0">
              <SheetTitle className="font-display text-xl">The Archivist</SheetTitle>
              <SheetDescription className="truncate">On {context.name}{context.commander ? ` · ${context.commander.name}` : ''}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 py-5">
          {access.state !== 'ok' && !streaming && <ArchivistNotice state={access.state} message={access.message} />}
          {(access.state === 'ok' || streaming) && (
            <>
              {/* Goal, shared by improve and swaps */}
              <div className="flex flex-col gap-2">
                <span className="eyebrow">Goal</span>
                <div className="flex flex-wrap gap-1.5">
                  {IMPROVE_GOALS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setGoal(g.id)}
                      disabled={streaming}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                        goal === g.id ? 'border-gold/60 bg-gold/10 text-gold' : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground'
                      )}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {TASKS.filter((t) => t.id !== 'ask').map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void run(t.id)}
                    disabled={streaming || !ready}
                    data-dev-archivist-task={t.id}
                    className={cn(
                      'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-left transition-colors disabled:opacity-60',
                      task === t.id ? 'border-gold/50 bg-gold/[0.06]' : 'border-border/50 hover:border-gold/40 hover:bg-card/60'
                    )}
                  >
                    <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{t.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{t.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); void run('ask'); }}
                className="flex items-center gap-2"
              >
                <Input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask about this deck or the rules…"
                  disabled={streaming}
                  aria-label="Ask the Archivist"
                  className="h-10"
                  data-dev-archivist-question
                />
                <Button type="submit" size="icon" disabled={streaming || !ready || !question.trim()} aria-label="Ask" className="h-10 w-10 shrink-0 bg-gold text-gold-foreground hover:bg-gold/90">
                  <Send className="h-4 w-4" />
                </Button>
              </form>

            </>
          )}

          {/* The answer stays even when the last request used the month's allowance */}
          {(asked || streaming) && (
                <div className="flex flex-col gap-3 border-t border-border/40 pt-4" aria-live="polite">
                  {streaming && !answer && <Thinking />}
                  {error && errState && <ArchivistNotice state={errState} message={error.message} />}
                  {task === 'swaps' ? (
                    <SwapList swaps={swaps} dropped={dropped} streaming={streaming} applied={applied} busy={busy} onApply={apply} onOpenCard={onOpenCard} />
                  ) : (
                    answer && <Answer text={answer} onCard={onOpenCard} />
                  )}
                  {!streaming && (answer || swaps) && (
                    <div className="flex items-center justify-between pt-1">
                      <UsageLine used={access.used} allowed={access.allowed} />
                      <span className="text-[11px] text-muted-foreground">The Archivist can be wrong. Check before you sleeve.</span>
                    </div>
                  )}
                </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SwapList({ swaps, dropped, streaming, applied, busy, onApply, onOpenCard }: {
  swaps: ResolvedSwap[] | null;
  dropped: number;
  streaming: boolean;
  applied: Set<string>;
  busy: string | null;
  onApply: (s: ResolvedSwap) => void;
  onOpenCard: (name: string) => void;
}) {
  if (streaming) return <Thinking label="The Archivist is weighing the list…" />;
  if (!swaps) return null;
  if (swaps.length === 0) return <p className="text-sm text-muted-foreground">No swap survived checking — every suggestion was either unknown or outside the commander&apos;s colours. Try another goal.</p>;
  return (
    <div className="flex flex-col gap-2" data-dev-swaps>
      {swaps.map((s) => {
        const face = frontFace(s.record);
        const done = applied.has(s.remove);
        return (
          <div key={s.remove} className={cn('flex items-center gap-3 rounded-xl border p-2.5 transition-colors', done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/50')}>
            <button type="button" onClick={() => onOpenCard(s.add)} className="relative h-16 w-[46px] shrink-0 overflow-hidden rounded-[4px] border border-border/50 bg-muted" aria-label={`Read ${s.add}`}>
              {face.image && <Image src={face.image} alt="" fill sizes="46px" className="object-cover" unoptimized />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1.5 text-sm">
                <button type="button" onClick={() => onOpenCard(s.remove)} className="text-muted-foreground line-through decoration-destructive/60 hover:text-foreground">{s.remove}</button>
                <ArrowLeftRight className="h-3 w-3 text-gold" />
                <button type="button" onClick={() => onOpenCard(s.add)} className="font-semibold hover:text-gold">{s.add}</button>
                <ManaCostDisplay manaCost={face.manaCost} size="xs" />
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{s.reason}</p>
            </div>
            <Button
              size="sm"
              variant={done ? 'outline' : 'default'}
              disabled={done || busy === s.remove}
              onClick={() => onApply(s)}
              className={cn('h-8 shrink-0 gap-1 text-xs', !done && 'bg-gold text-gold-foreground hover:bg-gold/90')}
            >
              {busy === s.remove ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <><Check className="h-3.5 w-3.5" /> Done</> : 'Apply'}
            </Button>
          </div>
        );
      })}
      {dropped > 0 && (
        <p className="text-[11px] text-muted-foreground">{dropped} suggestion{dropped === 1 ? ' was' : 's were'} left out: unknown card or outside the commander&apos;s colours.</p>
      )}
    </div>
  );
}
