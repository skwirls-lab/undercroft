'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Search, Loader2, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { searchCards, frontFace } from '@/lib/deckCards';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { ManaCostDisplay } from '@/components/game/ManaSymbol';
import { cn } from '@/lib/utils';

interface AddCardSearchProps {
  /** Names already in the deck, to mark what a pick would duplicate. */
  inDeck: Set<string>;
  onAdd: (record: ScryfallCardRecord) => void;
  className?: string;
}

/**
 * Type a few letters, pick a card. Results come from the shared card database by name prefix
 * — the same names deck import resolves against, so anything you can add here will resolve.
 */
export function AddCardSearch({ inDeck, onAdd, className }: AddCardSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScryfallCardRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Results are only shown while the query is long enough, so a cleared box needs no reset.
  const showResults = query.trim().length >= 2;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      searchCards(q, 10)
        .then((r) => { if (alive) { setResults(r); setActive(0); } })
        .catch((err) => console.error('[AddCardSearch]', err))
        .finally(() => { if (alive) setSearching(false); });
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  const pick = (rec: ScryfallCardRecord) => {
    onAdd(rec);
    setQuery('');
    setResults([]);
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && showResults && results[active]) { e.preventDefault(); pick(results[active]); }
            if (e.key === 'Escape') { setQuery(''); setResults([]); }
          }}
          placeholder="Add a card — start typing its name"
          aria-label="Add a card"
          className="h-11 rounded-xl border-border/60 bg-background/60 pl-10 pr-10 text-base sm:text-sm"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gold" />}
      </div>

      {showResults && results.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border/60 bg-popover p-1 shadow-2xl">
          {results.map((rec, i) => {
            const face = frontFace(rec);
            const dup = inDeck.has(rec.name);
            return (
              <li key={rec.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(rec)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors', i === active ? 'bg-gold/10' : 'hover:bg-muted/40')}
                >
                  <div className="relative h-11 w-8 shrink-0 overflow-hidden rounded-[3px] bg-muted">
                    {face.image && <Image src={face.image} alt="" fill sizes="32px" className="object-cover" unoptimized />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{rec.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{face.typeLine}</p>
                  </div>
                  {face.manaCost && <ManaCostDisplay manaCost={face.manaCost} size="xs" className="shrink-0" />}
                  <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', dup ? 'bg-amber-500/15 text-amber-300' : 'bg-gold/15 text-gold')}>
                    {dup ? '+1 more' : <Plus className="h-3 w-3" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
