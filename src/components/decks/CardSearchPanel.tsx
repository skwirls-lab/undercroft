'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Loader2, Plus, Check, Ban, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { searchCards, type SearchResult } from '@/lib/cardSearch';
import { frontFace } from '@/lib/deckCards';
import { fitsIdentity } from '@/lib/deckRules';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { ManaCostDisplay, ManaSymbol } from '@/components/game/ManaSymbol';
import { cardArrive } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface CardSearchPanelProps {
  /** The commander's colour identity, or null when there is no commander to judge by. */
  identity: readonly string[] | null;
  /** Names already in the deck with their counts. */
  inDeck: Map<string, number>;
  onAdd: (record: ScryfallCardRecord) => void;
  onOpen?: (record: ScryfallCardRecord) => void;
  autoFocus?: boolean;
  className?: string;
}

/**
 * The builder's search: type a few letters and the matches appear as cards, ranked the way
 * Commander players expect. Cards outside the commander's colour identity are shown but
 * cannot be added, with the reason on the tile, so a player learns the rule by seeing it
 * rather than by being told after the fact.
 */
export function CardSearchPanel({ identity, inDeck, onAdd, onOpen, autoFocus, className }: CardSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [onlyIdentity, setOnlyIdentity] = useState(true);
  const [result, setResult] = useState<SearchResult>({ cards: [], source: 'database' });
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filterIdentity = identity && onlyIdentity ? identity : null;
  const active = query.trim().length >= 2;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const t = setTimeout(() => {
      setSearching(true);
      searchCards(query, { identity: filterIdentity, limit: 24 })
        .then((r) => { if (alive) setResult(r); })
        .catch((err) => console.error('[CardSearchPanel]', err))
        .finally(() => { if (alive) setSearching(false); });
    }, 220);
    return () => { alive = false; clearTimeout(t); };
    // filterIdentity is derived from identity + onlyIdentity; joining keeps the dep stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, active, filterIdentity?.join('')]);

  const cards = active ? result.cards : [];

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            autoFocus={autoFocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
            placeholder="Search for a card to add — e.g. “rift”, “sol ring”, “counter”"
            aria-label="Search for a card to add"
            data-dev-search
            className="h-11 rounded-xl border-border/60 bg-background/60 pl-10 pr-10 text-base sm:text-sm"
          />
          {searching ? (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gold" />
          ) : query ? (
            <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {identity && (
          <button
            type="button"
            role="switch"
            aria-checked={onlyIdentity}
            onClick={() => setOnlyIdentity((v) => !v)}
            className={cn(
              'flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-sm transition-colors',
              onlyIdentity ? 'border-gold/50 bg-gold/10 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground'
            )}
          >
            <span className={cn('flex h-4 w-7 items-center rounded-full p-0.5 transition-colors', onlyIdentity ? 'bg-gold' : 'bg-muted')}>
              <span className={cn('h-3 w-3 rounded-full bg-background transition-transform', onlyIdentity && 'translate-x-3')} />
            </span>
            Only
            <span className="flex items-center gap-0.5">
              {identity.length === 0 ? <ManaSymbol symbol="C" size="sm" /> : identity.map((c) => <ManaSymbol key={c} symbol={c} size="sm" />)}
            </span>
          </button>
        )}
      </div>

      {!active ? (
        <p className="px-1 text-xs text-muted-foreground">
          Results are ranked by how often the card shows up in Commander decks.{identity ? ' Cards outside your commander’s colours are marked and cannot be added.' : ''}
        </p>
      ) : cards.length === 0 && !searching ? (
        <p className="rounded-xl border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
          No cards match “{query.trim()}”{filterIdentity ? ' in your commander’s colours' : ''}.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8" role="list" aria-label="Search results">
          <AnimatePresence initial={false}>
            {cards.map((rec) => {
              const face = frontFace(rec);
              const count = inDeck.get(rec.name) ?? 0;
              const offColour = !!identity && !fitsIdentity(rec, identity);
              return (
                <motion.div key={rec.id} role="listitem" variants={cardArrive} initial="initial" animate="animate" exit="exit" layout className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpen?.(rec)}
                    aria-label={`${rec.name}, read`}
                    className={cn(
                      'relative block aspect-[488/680] w-full overflow-hidden rounded-[6.5%] border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
                      offColour ? 'border-destructive/40 opacity-60 saturate-50' : 'border-border/60 hover:border-gold/40'
                    )}
                  >
                    {face.image ? (
                      <Image src={face.image} alt={rec.name} fill sizes="(max-width: 640px) 33vw, 160px" className="object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full flex-col bg-gradient-to-b from-[oklch(0.25_0.014_55)] to-[oklch(0.14_0.012_55)] p-[7%]">
                        <p className="font-display text-[clamp(10px,1.1vw+4px,13px)] font-bold leading-tight">{rec.name}</p>
                        <p className="mt-1 text-[clamp(8px,0.8vw+3px,10px)] text-muted-foreground">{face.typeLine}</p>
                      </div>
                    )}
                    {offColour && (
                      <span className="absolute inset-x-[5%] top-[4%] flex items-center justify-center gap-1 rounded-md bg-destructive/90 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                        <Ban className="h-3 w-3" /> Off-colour
                      </span>
                    )}
                    {count > 0 && !offColour && (
                      <span className="absolute left-[5%] top-[4%] flex items-center gap-1 rounded-md bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <Check className="h-3 w-3" /> {count > 1 ? `×${count}` : 'In deck'}
                      </span>
                    )}
                  </button>

                  <div className="mt-1.5 flex items-start gap-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold leading-tight">{rec.name}</p>
                      <div className="mt-0.5 flex items-center gap-1">
                        {face.manaCost && <ManaCostDisplay manaCost={face.manaCost} size="xs" />}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAdd(rec)}
                      disabled={offColour}
                      aria-label={offColour ? `${rec.name} is outside the commander's colours` : `Add ${rec.name}`}
                      title={offColour ? 'Outside your commander’s colour identity' : count > 0 ? 'Add another copy' : 'Add to deck'}
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        offColour ? 'cursor-not-allowed bg-muted/40 text-muted-foreground' : 'bg-gold text-gold-foreground shadow hover:bg-gold/90 active:translate-y-px'
                      )}
                    >
                      {offColour ? <Ban className="h-3.5 w-3.5" /> : <Plus className="h-4 w-4" />}
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
