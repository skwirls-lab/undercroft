'use client';

import { cn } from '@/lib/utils';
import type { CardInstance } from '@/engine/types';
import { getLandProducibleColors, getManaColorName, getETBTappedStatus } from '@/engine/OracleTextParser';
import { X } from 'lucide-react';

interface CardDetailPanelProps {
  card: CardInstance;
  onClose: () => void;
  className?: string;
}

const MANA_COLORS: Record<string, string> = {
  W: 'bg-amber-50 text-amber-900',
  U: 'bg-blue-600 text-white',
  B: 'bg-zinc-900 text-zinc-300 border border-zinc-600',
  R: 'bg-red-600 text-white',
  G: 'bg-green-700 text-white',
  C: 'bg-zinc-400 text-zinc-800',
};

function getManaSymbols(manaCost: string): string[] {
  const symbols: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(manaCost)) !== null) {
    symbols.push(match[1]);
  }
  return symbols;
}

export function CardDetailPanel({ card, onClose, className }: CardDetailPanelProps) {
  const { cardData } = card;
  const isCreature = cardData.typeLine.toLowerCase().includes('creature');
  const isLand = cardData.typeLine.toLowerCase().includes('land');
  const symbols = getManaSymbols(cardData.manaCost);
  const producibleColors = isLand ? getLandProducibleColors(cardData) : [];
  const etbStatus = isLand ? getETBTappedStatus(cardData) : 'untapped';

  return (
    <div
      className={cn(
        'rounded-xl border border-border/40 bg-card/95 backdrop-blur-md shadow-xl p-3 w-64',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-foreground leading-tight truncate">
            {cardData.name}
          </h3>
          {/* Mana cost */}
          {symbols.length > 0 && (
            <div className="flex gap-0.5 mt-1">
              {symbols.map((sym, i) => {
                const colorClass = MANA_COLORS[sym] || 'bg-zinc-500 text-white';
                return (
                  <span
                    key={i}
                    className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold', colorClass)}
                  >
                    {sym.length <= 2 ? sym : ''}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Type line */}
      <p className="text-[11px] font-medium text-muted-foreground border-t border-border/20 pt-1.5 mb-1.5">
        {cardData.typeLine}
      </p>

      {/* Oracle text */}
      {cardData.oracleText && (
        <div className="text-[11px] leading-relaxed text-foreground/85 whitespace-pre-line mb-2">
          {cardData.oracleText}
        </div>
      )}

      {/* Keywords */}
      {cardData.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {cardData.keywords.map((kw) => (
            <span key={kw} className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* Land mana production info */}
      {isLand && producibleColors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2 border-t border-border/20 pt-1.5">
          <span className="text-[10px] text-muted-foreground">Produces:</span>
          {producibleColors.map((color) => {
            const colorClass = MANA_COLORS[color] || 'bg-zinc-500 text-white';
            return (
              <span
                key={color}
                className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold', colorClass)}
                title={getManaColorName(color)}
              >
                {color}
              </span>
            );
          })}
          {etbStatus === 'always_tapped' && (
            <span className="text-[9px] text-amber-400 ml-1">ETB tapped</span>
          )}
          {etbStatus === 'conditional' && (
            <span className="text-[9px] text-amber-400/70 ml-1">ETB tapped (conditional)</span>
          )}
        </div>
      )}

      {/* P/T and stats */}
      <div className="flex items-center gap-3 border-t border-border/20 pt-1.5 text-[10px] text-muted-foreground">
        {isCreature && cardData.power && (
          <span className="font-bold text-foreground text-xs">
            {card.modifiedPower ?? cardData.power}/{card.modifiedToughness ?? cardData.toughness}
          </span>
        )}
        {cardData.cmc > 0 && <span>CMC {cardData.cmc}</span>}
        {card.tapped && <span className="text-amber-400">Tapped</span>}
        {isCreature && card.summoningSick && <span className="text-blue-400">Summoning sick</span>}
        {card.damage > 0 && <span className="text-red-400">{card.damage} dmg</span>}
      </div>
    </div>
  );
}
