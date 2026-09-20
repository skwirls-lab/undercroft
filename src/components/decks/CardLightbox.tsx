'use client';

import Image from 'next/image';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Crown, Minus, Plus, Trash2 } from 'lucide-react';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import type { DeckEntry } from '@/store/deckStore';
import { frontFace } from '@/lib/deckCards';
import { ManaCostDisplay, OracleText } from '@/components/game/ManaSymbol';
import { cn } from '@/lib/utils';

interface CardLightboxProps {
  entry: DeckEntry | null;
  record: ScryfallCardRecord | null;
  isCommander: boolean;
  /** Edit controls are shown when these are provided. */
  onQuantity?: (qty: number) => void;
  onRemove?: () => void;
  onMakeCommander?: () => void;
  onClose: () => void;
}

/**
 * The reader for a card in the vault: the scan at a size you can actually read, with the
 * rules text beside it for the cases where the scan is small, missing, or in a font from
 * 1994. Edit actions live here too so a card can be tuned without leaving the reading view.
 */
export function CardLightbox({ entry, record, isCommander, onQuantity, onRemove, onMakeCommander, onClose }: CardLightboxProps) {
  const face = record ? frontFace(record) : null;
  const canEdit = !!onQuantity;
  const isLegendaryCreature = !!face && /legendary/i.test(face.typeLine) && /creature/i.test(face.typeLine);

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-3xl" showCloseButton>
        {entry && (
          <div className="grid gap-0 sm:grid-cols-[minmax(0,300px)_1fr]">
            <div className="relative flex items-start justify-center bg-black/40 p-4 sm:p-6">
              {face?.image ? (
                <Image src={face.image} alt={face.name} width={488} height={680} className="w-full max-w-[300px] rounded-[5.5%] shadow-2xl" unoptimized priority />
              ) : (
                <div className="flex aspect-[488/680] w-full max-w-[300px] flex-col rounded-[5.5%] border border-border/40 bg-gradient-to-b from-[oklch(0.25_0.014_55)] to-[oklch(0.14_0.012_55)] p-5">
                  <p className="font-display text-lg font-bold leading-tight">{entry.cardName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{face?.typeLine || 'Not found in the card database'}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <div>
                <DialogTitle className="font-display text-2xl font-bold leading-tight">{entry.cardName}</DialogTitle>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {face?.manaCost && <ManaCostDisplay manaCost={face.manaCost} size="md" />}
                  {face?.typeLine && <span>{face.typeLine}</span>}
                  {face?.power != null && <span className="font-semibold text-foreground">{face.power}/{face.toughness}</span>}
                  {face?.loyalty && <span className="font-semibold text-foreground">Loyalty {face.loyalty}</span>}
                </div>
              </div>

              {face?.oracleText ? (
                <OracleText text={face.oracleText} className="text-[15px] text-foreground/90" />
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  {record ? 'No rules text.' : 'This name did not match a card. Check the spelling, or remove it and search for the card you meant.'}
                </p>
              )}

              <div className="mt-auto flex flex-col gap-3 border-t border-border/40 pt-4">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Flag ok={entry.resolved !== false && !!record} label={record ? 'In card database' : 'Not in card database'} />
                  {entry.resolved && <Flag ok={entry.forgeResolved !== false} label={entry.forgeResolved === false ? 'Not playable in Forge' : entry.forgeName && entry.forgeName !== entry.cardName ? `Plays as ${entry.forgeName}` : 'Playable in Forge'} />}
                  {isCommander && <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 font-semibold text-gold"><Crown className="h-3 w-3" /> Commander</span>}
                </div>

                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center overflow-hidden rounded-lg border border-border/60">
                      <Button variant="ghost" size="icon-sm" aria-label="One fewer" disabled={entry.quantity <= 1} onClick={() => onQuantity?.(entry.quantity - 1)} className="rounded-none text-foreground"><Minus /></Button>
                      <span className="min-w-[2.5rem] text-center text-sm font-bold tabular-nums">{entry.quantity}</span>
                      <Button variant="ghost" size="icon-sm" aria-label="One more" onClick={() => onQuantity?.(entry.quantity + 1)} className="rounded-none text-foreground"><Plus /></Button>
                    </div>
                    {!isCommander && onMakeCommander && (
                      <Button variant="outline" size="sm" onClick={onMakeCommander} disabled={!isLegendaryCreature && !!record} title={!isLegendaryCreature && record ? 'Only a legendary creature can lead the deck' : undefined} className="gap-1.5 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold">
                        <Crown /> Make commander
                      </Button>
                    )}
                    <Button variant="destructive" size="sm" onClick={onRemove} className="ml-auto gap-1.5">
                      <Trash2 /> Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium', ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-destructive/10 text-destructive')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-emerald-400' : 'bg-destructive')} />
      {label}
    </span>
  );
}
