'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { Answer } from '@/components/archivist/Answer';
import { useAuth } from '@/lib/firebase/auth';
import { useMatchHistoryStore } from '@/store/matchHistoryStore';
import { describeLossReason } from '@/lib/gameLog';
import { historyTotals, summarizeResult, type MatchRecord, type MatchSeat } from '@/lib/matchHistory';
import { rise, riseStagger } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { BookOpen, ChevronRight, Crown, Loader2, ScrollText, Skull, Swords, Trash2, Trophy, DoorOpen, Handshake } from 'lucide-react';

const RESULT_STYLE: Record<MatchRecord['result'], { label: string; className: string; icon: React.ReactNode }> = {
  won: { label: 'Won', className: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300', icon: <Trophy className="h-3 w-3" /> },
  lost: { label: 'Lost', className: 'border-red-400/40 bg-red-500/10 text-red-300', icon: <Skull className="h-3 w-3" /> },
  draw: { label: 'Draw', className: 'border-border/60 bg-muted/30 text-muted-foreground', icon: <Handshake className="h-3 w-3" /> },
  abandoned: { label: 'Left', className: 'border-border/60 bg-muted/30 text-muted-foreground', icon: <DoorOpen className="h-3 w-3" /> },
};

function when(ts: number): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function duration(m: MatchRecord): string {
  const mins = Math.max(1, Math.round((m.endedAt - m.startedAt) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`;
}

export function ResultChip({ result, className }: { result: MatchRecord['result']; className?: string }) {
  const s = RESULT_STYLE[result];
  return <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', s.className, className)}>{s.icon}{s.label}</span>;
}

/** One line naming the table: "Atraxa Superfriends vs Krenko AI, Ur-Dragon AI, Control AI". */
export function tableLine(m: MatchRecord): { yours: string; opponents: string } {
  const opps = m.seats.filter((s) => !s.isYou).map((s) => s.commander ?? s.deckName ?? s.name);
  return { yours: m.you.commander ?? m.you.deckName, opponents: opps.join(', ') };
}

/**
 * The History page: every match on record, newest first, with the totals across them. Tap a
 * match for the seats, what each one did, how each one fell, and the Archivist's recap if
 * one was asked for at the time.
 */
export function MatchHistory() {
  const { user } = useAuth();
  const { matches, loading, failed, load } = useMatchHistoryStore();
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { if (user?.uid) void load(user.uid); }, [user?.uid, load]);

  const totals = historyTotals(matches);
  const open = openId ? matches.find((m) => m.id === openId) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <motion.div variants={riseStagger(0.06, 0)} initial="hidden" animate="show" className="flex flex-col gap-6">
        <motion.div variants={rise}>
          <Eyebrow>The ledger</Eyebrow>
          <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Match history</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Every game you finish is written down here: who sat where, who won and how, what each seat did, and what the Archivist made of it.
          </p>
        </motion.div>

        {matches.length > 0 && (
          <motion.div variants={rise} className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-dev-history-totals>
            <Stat label="Games" value={String(totals.games)} />
            <Stat label="Record" value={`${totals.wins}–${totals.losses}`} />
            <Stat label="Win rate" value={totals.winRate == null ? '—' : `${Math.round(totals.winRate * 100)}%`} />
            <Stat label="Avg. turns" value={totals.avgTurns == null ? '—' : totals.avgTurns.toFixed(1)} />
          </motion.div>
        )}

        {loading && matches.length === 0 ? (
          <motion.div variants={rise} className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Opening the ledger…</motion.div>
        ) : failed && matches.length === 0 ? (
          <motion.div variants={rise}><Alcove flat className="p-5 text-sm text-red-300">The history could not be loaded. Check your connection and reload.</Alcove></motion.div>
        ) : matches.length === 0 ? (
          <motion.div variants={rise}>
            <Alcove flat className="flex flex-col items-start gap-3 p-6">
              <ScrollText className="h-6 w-6 text-gold/70" />
              <p className="text-sm text-muted-foreground">No matches yet. Finish a game and it will be recorded here, with the Archivist&apos;s recap if you ask for one at the end.</p>
              <Link href="/game" className="inline-flex items-center gap-1.5 text-sm font-medium text-gold hover:underline"><Swords className="h-4 w-4" /> Start a game</Link>
            </Alcove>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-3" data-dev-history-list>
            {matches.map((m) => {
              const t = tableLine(m);
              return (
                <motion.button
                  key={m.id}
                  variants={rise}
                  type="button"
                  onClick={() => setOpenId(m.id)}
                  className="group block w-full text-left"
                  data-dev-history-row
                >
                  <Alcove flat className="flex items-center gap-4 px-4 py-3 transition-colors group-hover:border-gold/30 sm:px-5">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1', m.result === 'won' ? 'bg-gold/10 text-gold ring-gold/25' : 'bg-muted/30 text-muted-foreground ring-border/40')}>
                      <Crown className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ResultChip result={m.result} />
                        <span className="truncate text-sm font-semibold">{t.yours}</span>
                        <span className="text-xs text-muted-foreground">vs {t.opponents}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {summarizeResult(m)} · {m.seatCount} seats · {duration(m)} · {when(m.endedAt)}
                        {m.recap && <span className="ml-1 inline-flex items-center gap-0.5 text-gold/80"><BookOpen className="h-3 w-3" /> recap</span>}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                  </Alcove>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>

      <MatchDetailSheet match={open} onClose={() => setOpenId(null)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Alcove flat className="px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-bold tabular-nums">{value}</p>
    </Alcove>
  );
}

function seatFate(s: MatchSeat): string {
  if (s.won) return 'Won';
  if (!s.eliminated) return 'Standing';
  const how = s.lossReason ? describeLossReason(s.lossReason, s.lossSpell ?? undefined) : 'eliminated';
  return `Out${s.eliminatedTurn ? ` on turn ${s.eliminatedTurn}` : ''} — ${how}`;
}

export function MatchDetailSheet({ match, onClose }: { match: MatchRecord | null; onClose: () => void }) {
  const remove = useMatchHistoryStore((s) => s.remove);
  const [confirm, setConfirm] = useState(false);
  const m = match;
  const seats = m ? [...m.seats].sort((a, b) => (a.place ?? 99) - (b.place ?? 99)) : [];
  return (
    <Sheet open={!!m} onOpenChange={(v) => { if (!v) { setConfirm(false); onClose(); } }}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg" data-dev-match-sheet>
        {m && (
          <>
            <SheetHeader className="border-b border-border/40 pb-4">
              <div className="flex items-center gap-2">
                <ResultChip result={m.result} />
                <span className="text-xs text-muted-foreground">{when(m.endedAt)} · {duration(m)}</span>
              </div>
              <SheetTitle className="font-display text-xl">{tableLine(m).yours} <span className="text-base font-normal text-muted-foreground">vs {tableLine(m).opponents}</span></SheetTitle>
              <SheetDescription>{summarizeResult(m)}{m.you.deckName && m.you.commander ? ` · ${m.you.deckName}` : ''}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 py-4">
              <section>
                <Eyebrow>Seats</Eyebrow>
                <div className="mt-2 flex flex-col gap-2">
                  {seats.map((s) => (
                    <div key={s.name} className={cn('rounded-xl border px-3 py-2.5', s.isYou ? 'border-gold/30 bg-gold/[0.05]' : 'border-border/40 bg-card/40')} data-dev-match-seat>
                      <div className="flex items-start gap-2">
                        {s.place != null && <span className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', s.won ? 'bg-gold text-gold-foreground' : 'bg-muted/40 text-muted-foreground')}>{s.place}</span>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{s.isYou ? 'You' : s.name}{s.commander ? <span className="font-normal text-muted-foreground"> · {s.commander}</span> : ''}</p>
                          <p className={cn('text-xs', s.won ? 'text-gold' : s.eliminated ? 'text-red-300/90' : 'text-muted-foreground')}>{seatFate(s)}</p>
                        </div>
                      </div>
                      <div className="mt-1.5 grid grid-cols-4 gap-2 text-center text-[11px] text-muted-foreground">
                        <Cell label="Life" value={String(s.finalLife)} />
                        <Cell label="Spells" value={String(s.spellsCast)} />
                        <Cell label="Dmg dealt" value={String(s.damageDealt)} />
                        <Cell label="Life lost" value={String(s.lifeLost)} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <Eyebrow>The Archivist&apos;s recap</Eyebrow>
                {m.recap ? (
                  <div className="mt-2 rounded-xl border border-gold/20 bg-gold/[0.04] px-3 py-2.5" data-dev-match-recap>
                    <Answer text={m.recap.text} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No recap was asked for. At the end of a game, <span className="text-foreground/80">Ask the Archivist what happened</span> writes one here.</p>
                )}
              </section>

              <section className="flex items-center justify-between border-t border-border/40 pt-4">
                <span className="text-[11px] text-muted-foreground">{m.turns} turns · {m.seatCount} seats</span>
                {confirm ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Remove this match?</span>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>Keep</Button>
                    <Button size="sm" variant="destructive" onClick={() => { void remove(m.id); setConfirm(false); onClose(); }}>Remove</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setConfirm(true)}><Trash2 className="h-3.5 w-3.5" /> Remove</Button>
                )}
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-black/20 py-1">
      <div className="font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</div>
    </div>
  );
}
