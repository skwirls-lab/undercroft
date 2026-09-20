'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Crown, Loader2, Search, ArrowRight, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeckStore, type Deck } from '@/store/deckStore';
import { searchCards } from '@/lib/cardSearch';
import { frontFace, primeCardRecord, verifyEntries, assessDeck } from '@/lib/deckCards';
import { identityOf } from '@/lib/deckRules';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { ManaSymbol } from '@/components/game/ManaSymbol';
import { cn } from '@/lib/utils';
import { CommanderIdeas } from '@/components/archivist/CommanderIdeas';

interface NewDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shelf to file the new deck on, if one is selected in the vault. */
  shelfId?: string | null;
}

/**
 * Start a deck from nothing: pick a commander, name the deck, and land on its page in edit
 * mode with the search box ready. The commander comes first because it decides everything
 * else — the colours you can play and the name the deck will probably get.
 */
export function NewDeckDialog({ open, onOpenChange, shelfId }: NewDeckDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {open && <NewDeckForm shelfId={shelfId ?? null} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewDeckForm({ shelfId, onDone }: { shelfId: string | null; onDone: () => void }) {
  const router = useRouter();
  const { addDeck, updateDeck } = useDeckStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScryfallCardRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [commander, setCommander] = useState<ScryfallCardRecord | null>(null);
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const active = query.trim().length >= 2;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      searchCards(query, { commanderOnly: true, limit: 12 })
        .then((r) => { if (alive) setResults(r.cards); })
        .catch((err) => console.error('[NewDeck]', err))
        .finally(() => { if (alive) setSearching(false); });
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [query, active]);

  const pick = (rec: ScryfallCardRecord) => {
    setCommander(rec);
    // Suggest a name from the commander's first name — "Atraxa" from "Atraxa, Praetors' Voice".
    if (!nameTouched) setName(rec.name.split(',')[0].split(' // ')[0].trim());
  };

  const create = async () => {
    if (!commander || !name.trim()) return;
    setCreating(true);
    primeCardRecord(commander);
    const deck: Deck = {
      id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      commanderName: commander.name,
      cards: [{ cardName: commander.name, quantity: 1, resolved: true, scryfallId: commander.id, oracleId: commander.oracle_id }],
      format: 'commander',
      resolvedCount: 1,
      unresolvedCount: 0,
      totalCards: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      shelfId,
    };
    addDeck(deck);
    onDone();
    router.push(`/decks/${encodeURIComponent(deck.id)}?edit=1`);
    // Forge check in the background; the page shows the result when it lands.
    try {
      const report = await verifyEntries(deck.cards);
      const legality = await assessDeck({ cards: report.cards, commanderName: deck.commanderName });
      updateDeck(deck.id, { cards: report.cards, legality });
    } catch (err) {
      console.error('[NewDeck] verify failed:', err);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display text-xl"><Crown className="h-5 w-5 text-gold" /> New deck</DialogTitle>
        <DialogDescription>Choose a commander first. Its colours decide what the deck can hold.</DialogDescription>
      </DialogHeader>

      {commander ? (
        <CommanderRow rec={commander} selected onClick={() => { setCommander(null); setQuery(''); setResults([]); }} action="Change" />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="cmdr-search">Commander</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="cmdr-search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search legendary creatures — e.g. “atraxa”" className="h-11 pl-10 text-base sm:text-sm" data-dev-cmdr-search />
            {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gold" />}
          </div>
          {active && results.length > 0 && (
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
              {results.map((rec) => <CommanderRow key={rec.id} rec={rec} onClick={() => pick(rec)} action="Choose" />)}
            </div>
          )}
          {active && !searching && results.length === 0 && (
            <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">No legendary creature matches “{query.trim()}”.</p>
          )}
          {!active && <CommanderIdeas onPick={pick} />}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="new-deck-name">Deck name</Label>
        <Input id="new-deck-name" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder="Name it after the plan" maxLength={60} className="h-10" />
      </div>

      <Button type="submit" disabled={!commander || !name.trim() || creating} className="gap-2 bg-gold text-gold-foreground hover:bg-gold/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100">
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        Create and start adding cards
      </Button>
    </form>
  );
}

function CommanderRow({ rec, selected, onClick, action }: { rec: ScryfallCardRecord; selected?: boolean; onClick: () => void; action: string }) {
  const face = frontFace(rec);
  const identity = identityOf(rec);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all',
        selected ? 'border-gold/60 bg-gold/[0.07] shadow-[0_0_20px_var(--gold-glow-soft)]' : 'border-border/50 hover:border-gold/40 hover:bg-card/60'
      )}
    >
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[4px] bg-muted">
        {face.image && <Image src={face.image} alt="" fill sizes="40px" className="object-cover" unoptimized />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{rec.name}</p>
        <p className="truncate text-xs text-muted-foreground">{face.typeLine}</p>
        <span className="mt-1 flex items-center gap-0.5">
          {identity.length === 0 ? <ManaSymbol symbol="C" size="xs" /> : identity.map((c) => <ManaSymbol key={c} symbol={c} size="xs" />)}
        </span>
      </div>
      <span className={cn('flex shrink-0 items-center gap-1 text-xs font-medium', selected ? 'text-gold' : 'text-muted-foreground')}>
        {selected && <Check className="h-3.5 w-3.5" />}{action}
      </span>
    </button>
  );
}
