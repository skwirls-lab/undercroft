'use client';

import { useState } from 'react';
import Image from 'next/image';
import { BookOpen, Send, Loader2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useArchivist } from '@/hooks/useArchivist';
import { parseIdeas } from '@/lib/archivist/prompts';
import type { CommanderIdea } from '@/lib/archivist/types';
import { searchCards } from '@/lib/cardSearch';
import { frontFace } from '@/lib/deckCards';
import { identityOf } from '@/lib/deckRules';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { ManaSymbol } from '@/components/game/ManaSymbol';
import { ArchivistNotice, Thinking } from './Notice';
import { useArchivistAccess, stateFromError } from './access';
import { cn } from '@/lib/utils';

interface Resolved extends CommanderIdea { record: ScryfallCardRecord }

/**
 * "I like tokens and green" → five commanders, each looked up through the commander search
 * before it is shown, so a name the model misspelt or invented never appears as a choice.
 */
export function CommanderIdeas({ onPick }: { onPick: (rec: ScryfallCardRecord) => void }) {
  const access = useArchivistAccess('archivist.ideas');
  const { streaming, error, ask } = useArchivist();
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState('');
  const [ideas, setIdeas] = useState<Resolved[] | null>(null);
  const [resolving, setResolving] = useState(false);

  const run = async () => {
    if (!wish.trim()) return;
    setIdeas(null);
    const raw = await ask({ task: 'commander.ideas', wish: wish.trim() });
    if (raw == null) return;
    setResolving(true);
    try {
      const parsed = parseIdeas(raw);
      const found = await Promise.all(parsed.map(async (idea) => {
        try {
          const r = await searchCards(idea.name, { commanderOnly: true, limit: 3 });
          const rec = r.cards.find((c) => c.name.toLowerCase() === idea.name.toLowerCase()) ?? r.cards.find((c) => c.name.toLowerCase().startsWith(idea.name.toLowerCase().split(',')[0]));
          return rec ? { ...idea, record: rec } : null;
        } catch { return null; }
      }));
      setIdeas(found.filter((x): x is Resolved => !!x));
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-card/40 px-3 py-2.5" data-dev-ideas>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground" aria-expanded={open}>
        <BookOpen className="h-3.5 w-3.5 text-gold" />
        <span className="flex-1">Not sure? Ask the Archivist for commander ideas.</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {access.state !== 'ok' && !streaming && !resolving && <ArchivistNotice state={access.state} message={access.message} />}
          {(access.state === 'ok' || streaming || resolving) && (
            <div className="flex items-center gap-2">
              <Input value={wish} onChange={(e) => setWish(e.target.value)} placeholder="e.g. tokens and green, or a dragon deck on a budget" disabled={streaming} maxLength={200} className="h-9 text-sm" aria-label="What kind of deck do you want to build?" data-dev-ideas-wish onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }} />
              <Button type="button" size="icon" onClick={() => void run()} disabled={streaming || resolving || !wish.trim()} aria-label="Ask for ideas" className="h-9 w-9 shrink-0 bg-gold text-gold-foreground hover:bg-gold/90">
                {streaming || resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          )}
            {(streaming || resolving) && <Thinking label={resolving ? 'Checking the names against the records…' : undefined} />}
            {error && <ArchivistNotice state={stateFromError(error)} message={error.message} />}
            {ideas && ideas.length === 0 && <p className="text-xs text-muted-foreground">None of the suggestions could be verified. Try different words.</p>}
            {ideas && ideas.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {ideas.map((i) => {
                  const face = frontFace(i.record);
                  const identity = identityOf(i.record);
                  return (
                    <button key={i.record.id} type="button" onClick={() => onPick(i.record)} className="flex w-full items-center gap-3 rounded-lg border border-border/50 p-2 text-left transition-colors hover:border-gold/40 hover:bg-card/60">
                      <div className="relative h-12 w-[34px] shrink-0 overflow-hidden rounded-[3px] bg-muted">
                        {face.image && <Image src={face.image} alt="" fill sizes="34px" className="object-cover" unoptimized />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold">{i.record.name}
                          <span className="flex items-center gap-0.5">{identity.length === 0 ? <ManaSymbol symbol="C" size="xs" /> : identity.map((c) => <ManaSymbol key={c} symbol={c} size="xs" />)}</span>
                        </p>
                        <p className="text-xs leading-snug text-muted-foreground">{i.why}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      )}
    </div>
  );
}
