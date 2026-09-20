'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Minus, Plus, X, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import type { DeckEntry } from '@/store/deckStore';
import { frontFace } from '@/lib/deckCards';
import { ManaCostDisplay } from '@/components/game/ManaSymbol';
import { cardArrive } from '@/lib/motion';

interface CardTileProps {
  entry: DeckEntry;
  record: ScryfallCardRecord | null;
  isCommander?: boolean;
  /** Show the quantity stepper and remove control. */
  editing?: boolean;
  onOpen?: () => void;
  onQuantity?: (qty: number) => void;
  onRemove?: () => void;
  className?: string;
}

/** Type-line tint for the no-image slab. */
function slabTone(typeLine: string): string {
  const t = typeLine.toLowerCase();
  if (t.includes('land')) return 'from-[oklch(0.26_0.035_100)]';
  if (t.includes('creature')) return 'from-[oklch(0.27_0.035_40)]';
  if (t.includes('planeswalker')) return 'from-[oklch(0.27_0.05_300)]';
  if (t.includes('artifact')) return 'from-[oklch(0.27_0.012_60)]';
  if (t.includes('enchantment')) return 'from-[oklch(0.26_0.04_320)]';
  if (t.includes('instant') || t.includes('sorcery')) return 'from-[oklch(0.26_0.04_240)]';
  return 'from-[oklch(0.25_0.014_55)]';
}

/**
 * One card in a deck grid: the scan when there is one, a carved slab otherwise. The whole
 * tile opens the reader; in edit mode a stepper and a remove button sit on top of it and stop
 * the click from propagating.
 */
export function CardTile({ entry, record, isCommander, editing, onOpen, onQuantity, onRemove, className }: CardTileProps) {
  const face = record ? frontFace(record) : null;
  const unresolved = entry.resolved === false || (!record && entry.resolved !== true);
  const forgeMissing = entry.resolved && entry.forgeResolved === false;

  return (
    <motion.div variants={cardArrive} initial="initial" animate="animate" exit="exit" layout className={cn('relative', className)}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${entry.cardName}, ${entry.quantity} in deck`}
        data-card-tile
        className={cn(
          'group relative block aspect-[488/680] w-full overflow-hidden rounded-[6.5%] border text-left transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60',
          isCommander ? 'border-gold/70 shadow-[0_0_28px_var(--gold-glow)]' : 'border-border/60 hover:border-gold/40 hover:shadow-[0_8px_24px_-8px_oklch(0_0_0/0.8)]',
          unresolved && 'border-destructive/50',
          forgeMissing && 'border-amber-500/50'
        )}
      >
        {face?.image ? (
          <Image src={face.image} alt={face.name} fill sizes="(max-width: 640px) 33vw, 200px" className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" unoptimized />
        ) : (
          <div className={cn('flex h-full w-full flex-col bg-gradient-to-b to-[oklch(0.14_0.012_55)] p-[7%]', slabTone(face?.typeLine ?? ''))}>
            <div className="flex items-start justify-between gap-1">
              <p className="font-display text-[clamp(10px,1.1vw+4px,14px)] font-bold leading-[1.1] text-foreground">{entry.cardName}</p>
              {face?.manaCost && <ManaCostDisplay manaCost={face.manaCost} size="xs" className="mt-0.5 shrink-0" />}
            </div>
            <p className="mt-1 truncate text-[clamp(8px,0.8vw+3px,11px)] text-muted-foreground">
              {face?.typeLine || (unresolved ? 'Not found in card database' : 'Loading…')}
            </p>
            {face?.oracleText && (
              <p className="mt-2 line-clamp-[7] text-[clamp(8px,0.7vw+3px,10px)] leading-snug text-foreground/75">{face.oracleText}</p>
            )}
            {face?.power != null && (
              <p className="mt-auto self-end rounded bg-black/40 px-1.5 py-0.5 text-[clamp(9px,0.9vw+3px,12px)] font-bold text-foreground">{face.power}/{face.toughness}</p>
            )}
          </div>
        )}

        {/* Quantity — only when it is not one; singleton is the norm */}
        {entry.quantity > 1 && (
          <span className="absolute bottom-[4%] left-[5%] rounded-md bg-black/80 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white ring-1 ring-white/15">
            ×{entry.quantity}
          </span>
        )}

        {isCommander && (
          <span className="absolute left-[5%] top-[4%] flex items-center gap-1 rounded-md bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-foreground shadow">
            <Crown className="h-3 w-3" /> Commander
          </span>
        )}

        {(unresolved || forgeMissing) && (
          <span className={cn('absolute right-[5%] top-[4%] rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow', unresolved ? 'bg-destructive text-white' : 'bg-amber-500 text-black')}>
            {unresolved ? 'Unknown' : 'No Forge'}
          </span>
        )}
      </button>

      {editing && (
        <div className={cn('absolute inset-x-[5%] bottom-[4%] flex items-center gap-1', isCommander ? 'justify-end' : 'justify-between')} onClick={(e) => e.stopPropagation()}>
          {/* The commander is one card by definition; it gets no stepper. */}
          {!isCommander && <div className="flex items-center overflow-hidden rounded-md bg-black/85 ring-1 ring-white/15">
            <button type="button" aria-label="One fewer" onClick={() => onQuantity?.(Math.max(1, entry.quantity - 1))} disabled={entry.quantity <= 1} className="flex h-7 w-7 items-center justify-center text-white hover:bg-white/10 disabled:opacity-30">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[1.5rem] text-center text-xs font-bold tabular-nums text-white">{entry.quantity}</span>
            <button type="button" aria-label="One more" onClick={() => onQuantity?.(entry.quantity + 1)} className="flex h-7 w-7 items-center justify-center text-white hover:bg-white/10">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>}
          <button type="button" aria-label={`Remove ${entry.cardName}`} onClick={onRemove} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/85 text-white ring-1 ring-white/15 hover:bg-destructive hover:text-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </motion.div>
  );
}
