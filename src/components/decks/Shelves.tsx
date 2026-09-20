'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, Trash2 } from 'lucide-react';
import { SHELF_ACCENTS, type Shelf, type ShelfAccent } from '@/store/deckStore';
import { cn } from '@/lib/utils';

/**
 * Shelves are the vault's folders: one level, a name, and one of six accents — the five
 * colours and gold. The accent is decoration with a purpose: a shelf of red decks reads as
 * red from across the room.
 */

export const ACCENT_DOT: Record<ShelfAccent, string> = {
  gold: 'bg-gold',
  W: 'bg-[oklch(0.93_0.03_90)]',
  U: 'bg-[oklch(0.62_0.15_250)]',
  B: 'bg-[oklch(0.45_0.03_300)]',
  R: 'bg-[oklch(0.60_0.20_28)]',
  G: 'bg-[oklch(0.60_0.15_145)]',
};

export const ACCENT_LABEL: Record<ShelfAccent, string> = {
  gold: 'Gold', W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green',
};

export function AccentDot({ accent, className }: { accent: ShelfAccent; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full ring-1 ring-black/30', ACCENT_DOT[accent], className)} />;
}

interface ShelfChipProps {
  label: string;
  accent?: ShelfAccent;
  count?: number;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}

/** A shelf tab in the vault's filter strip. */
export function ShelfChip({ label, accent, count, selected, onClick, className }: ShelfChipProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-all',
        selected ? 'border-gold/60 bg-gold/10 text-foreground shadow-[0_0_18px_var(--gold-glow-soft)]' : 'border-border/50 text-muted-foreground hover:border-border hover:text-foreground',
        className
      )}
    >
      {accent && <AccentDot accent={accent} />}
      <span className="truncate">{label}</span>
      {count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', selected ? 'bg-gold/20 text-gold' : 'bg-muted/60')}>{count}</span>}
    </button>
  );
}

interface ShelfDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing shelf. */
  shelf?: Shelf | null;
  onSave: (name: string, accent: ShelfAccent) => void;
  onDelete?: () => void;
}

/** Create or rename a shelf. Deleting a shelf never deletes its decks; they return to the open. */
export function ShelfDialog({ open, onOpenChange, shelf, onSave, onDelete }: ShelfDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && <ShelfForm shelf={shelf ?? null} onSave={onSave} onDelete={onDelete} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ShelfForm({ shelf, onSave, onDelete, onDone }: { shelf: Shelf | null; onSave: ShelfDialogProps['onSave']; onDelete?: () => void; onDone: () => void }) {
  const [name, setName] = useState(shelf?.name ?? '');
  const [accent, setAccent] = useState<ShelfAccent>(shelf?.accent ?? 'gold');
  const editing = !!shelf;

  const submit = () => {
    if (!name.trim()) return;
    onSave(name.trim(), accent);
    onDone();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-5">
      <DialogHeader>
        <DialogTitle className="font-display text-xl">{editing ? 'Edit shelf' : 'New shelf'}</DialogTitle>
        <DialogDescription>{editing ? 'Rename it or change its colour. Its decks stay where they are.' : 'A shelf holds any decks you file on it. Name it by theme, power level, owner — whatever helps you find things.'}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-2">
        <Label htmlFor="shelf-name">Name</Label>
        <Input id="shelf-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tournament, Casual, Testing" maxLength={40} className="h-10" />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Accent</Label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Shelf accent">
          {SHELF_ACCENTS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={accent === a}
              aria-label={ACCENT_LABEL[a]}
              onClick={() => setAccent(a)}
              className={cn('flex h-9 w-9 items-center justify-center rounded-full ring-2 transition-all', ACCENT_DOT[a], accent === a ? 'ring-foreground scale-110' : 'ring-transparent hover:ring-border')}
            >
              {accent === a && <Check className={cn('h-4 w-4', a === 'W' || a === 'gold' ? 'text-black' : 'text-white')} />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {editing && onDelete && (
          <Button type="button" variant="destructive" size="sm" onClick={() => { onDelete(); onDone(); }} className="gap-1.5">
            <Trash2 /> Delete shelf
          </Button>
        )}
        <Button type="submit" disabled={!name.trim()} className="ml-auto bg-gold text-gold-foreground hover:bg-gold/90">
          {editing ? 'Save' : 'Create shelf'}
        </Button>
      </div>
    </form>
  );
}
