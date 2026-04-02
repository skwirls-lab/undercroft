'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { CardInstance } from '@/engine/types';
import { getLandProducibleColors } from '@/engine/OracleTextParser';

export type CardViewMode = 'pip' | 'art' | 'full';

export type CombatRole = 'attacking' | 'blocking' | 'none';

interface CardViewProps {
  card: CardInstance;
  mode?: CardViewMode;
  onClick?: (card: CardInstance) => void;
  onDoubleClick?: (card: CardInstance) => void;
  selected?: boolean;
  highlighted?: boolean;
  interactive?: boolean;
  combatRole?: CombatRole;
  className?: string;
}

const MANA_COLORS: Record<string, string> = {
  W: 'bg-amber-50 text-amber-900',
  U: 'bg-blue-600 text-white',
  B: 'bg-zinc-900 text-zinc-300',
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

function getCardColorClass(card: CardInstance): string {
  const colors = card.cardData.colors;
  if (!colors || colors.length === 0) {
    if (card.cardData.typeLine.toLowerCase().includes('land')) return 'border-amber-800/60';
    return 'border-zinc-500/60';
  }
  if (colors.length > 1) return 'border-amber-400/60';
  const colorMap: Record<string, string> = {
    W: 'border-amber-100/60',
    U: 'border-blue-500/60',
    B: 'border-zinc-600/60',
    R: 'border-red-500/60',
    G: 'border-green-500/60',
  };
  return colorMap[colors[0]] || 'border-zinc-500/60';
}

// ==================== PIP VIEW ====================
// Tiny compact view — colored bar + name + P/T
function PipView({ card, className }: { card: CardInstance; className?: string }) {
  const isCreature = card.cardData.typeLine.toLowerCase().includes('creature');
  const isLand = card.cardData.typeLine.toLowerCase().includes('land');
  const isTapped = card.tapped;

  // For lands, show producible mana dots instead of mana cost pips
  const landColors = isLand ? getLandProducibleColors(card.cardData) : [];

  return (
    <div
      className={cn(
        'flex h-6 items-center gap-1 rounded border px-1.5 text-[10px] font-medium leading-none transition-all',
        getCardColorClass(card),
        isTapped ? 'rotate-12 opacity-70' : '',
        'bg-card/80 backdrop-blur-sm',
        className
      )}
    >
      {/* Mana cost pips (non-lands) or producible mana dots (lands) */}
      <div className="flex gap-0.5">
        {isLand ? (
          landColors.slice(0, 5).map((color) => {
            const colorClass = MANA_COLORS[color] || 'bg-zinc-500 text-white';
            return (
              <span
                key={color}
                className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold', colorClass)}
              >
                {color}
              </span>
            );
          })
        ) : (
          getManaSymbols(card.cardData.manaCost).slice(0, 4).map((sym, i) => {
            const colorClass = MANA_COLORS[sym] || 'bg-zinc-500 text-white';
            return (
              <span
                key={i}
                className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold', colorClass)}
              >
                {sym.length <= 2 ? sym : ''}
              </span>
            );
          })
        )}
      </div>

      {/* Name */}
      <span className="truncate text-foreground/90">
        {card.cardData.name.length > 16 ? card.cardData.name.slice(0, 14) + '…' : card.cardData.name}
      </span>

      {/* P/T */}
      {isCreature && card.cardData.power && (
        <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
          {card.modifiedPower ?? card.cardData.power}/{card.modifiedToughness ?? card.cardData.toughness}
        </span>
      )}

      {/* Damage indicator */}
      {card.damage > 0 && (
        <span className="shrink-0 text-[9px] font-bold text-red-400">
          -{card.damage}
        </span>
      )}
    </div>
  );
}

// ==================== ART CROP VIEW ====================
// Medium size — art crop image + name overlay + P/T badge
function ArtView({ card, className }: { card: CardInstance; className?: string }) {
  const isCreature = card.cardData.typeLine.toLowerCase().includes('creature');
  const isTapped = card.tapped;
  const artCropUrl = card.cardData.imageUris?.artCrop || card.cardData.cardFaces?.[0]?.imageUris?.artCrop;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border-2 transition-all',
        getCardColorClass(card),
        isTapped ? 'rotate-6 opacity-80' : '',
        'h-[72px] w-[100px]',
        className
      )}
    >
      {artCropUrl ? (
        <Image
          src={artCropUrl}
          alt={card.cardData.name}
          fill
          sizes="100px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-card text-[10px] text-muted-foreground">
          {card.cardData.name}
        </div>
      )}

      {/* Name overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-3">
        <p className="truncate text-[10px] font-semibold leading-tight text-white">
          {card.cardData.name}
        </p>
      </div>

      {/* P/T badge */}
      {isCreature && card.cardData.power && (
        <div className="absolute right-0.5 top-0.5 rounded bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white">
          {card.modifiedPower ?? card.cardData.power}/{card.modifiedToughness ?? card.cardData.toughness}
        </div>
      )}

      {/* Damage indicator (creatures without keywords — keywords section handles it otherwise) */}
      {isCreature && card.cardData.keywords.length === 0 && card.damage > 0 && (
        <div className="absolute left-0.5 top-0.5 rounded bg-red-600/90 px-1 py-0.5 text-[9px] font-bold text-white">
          -{card.damage}
        </div>
      )}
      {!isCreature && card.damage > 0 && (
        <div className="absolute left-0.5 top-0.5 rounded bg-red-600/90 px-1 py-0.5 text-[9px] font-bold text-white">
          -{card.damage}
        </div>
      )}

      {/* Tapped indicator */}
      {isTapped && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="text-[10px] font-bold text-white/70">TAPPED</span>
        </div>
      )}

      {/* Keyword badges (combat-relevant) */}
      {isCreature && card.cardData.keywords.length > 0 && (
        <div className="absolute left-0.5 top-0.5 flex flex-col gap-0.5">
          {card.damage > 0 && (
            <span className="rounded bg-red-600/90 px-1 py-0.5 text-[8px] font-bold text-white">
              -{card.damage}
            </span>
          )}
          {card.cardData.keywords
            .filter((k) => ['Flying', 'Deathtouch', 'Lifelink', 'Trample', 'First Strike', 'Double Strike', 'Vigilance', 'Reach', 'Defender', 'Haste', 'Flash', 'Hexproof', 'Indestructible', 'Menace'].includes(k))
            .slice(0, 3)
            .map((kw) => (
              <span key={kw} className="rounded bg-black/70 px-1 text-[7px] font-semibold text-amber-300 leading-tight">
                {kw}
              </span>
            ))}
        </div>
      )}

      {/* Counter badges */}
      {Object.entries(card.counters).length > 0 && (
        <div className="absolute left-0.5 bottom-5 flex gap-0.5">
          {Object.entries(card.counters).map(([type, count]) => (
            <span key={type} className="rounded bg-purple-600/80 px-1 text-[8px] font-bold text-white">
              {count} {type.slice(0, 3)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== FULL CARD VIEW ====================
// Full card image — used for hand cards and hover/click previews
function FullView({ card, className }: { card: CardInstance; className?: string }) {
  const imageUrl = card.cardData.imageUris?.normal || card.cardData.cardFaces?.[0]?.imageUris?.normal;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border-2 shadow-lg transition-all',
        getCardColorClass(card),
        'h-[264px] w-[190px]',
        className
      )}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={card.cardData.name}
          fill
          sizes="190px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full flex-col gap-2 bg-card p-3">
          <p className="text-sm font-bold">{card.cardData.name}</p>
          <p className="text-[10px] text-muted-foreground">{card.cardData.manaCost}</p>
          <p className="text-xs text-muted-foreground">{card.cardData.typeLine}</p>
          <p className="flex-1 text-[10px] leading-tight text-foreground/80">
            {card.cardData.oracleText}
          </p>
          {card.cardData.power && (
            <p className="self-end text-sm font-bold">
              {card.cardData.power}/{card.cardData.toughness}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== CARD HOVER PREVIEW ====================
function CardHoverPreview({ card }: { card: CardInstance }) {
  const imageUrl = card.cardData.imageUris?.large || card.cardData.imageUris?.normal || card.cardData.cardFaces?.[0]?.imageUris?.large;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="pointer-events-none fixed z-50 rounded-xl border border-border/50 shadow-2xl"
      style={{ width: 250, height: 349 }}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={card.cardData.name}
          width={250}
          height={349}
          className="rounded-xl"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full flex-col gap-2 rounded-xl bg-card p-4">
          <p className="text-base font-bold">{card.cardData.name}</p>
          <p className="text-xs text-muted-foreground">{card.cardData.manaCost}</p>
          <p className="text-sm text-muted-foreground">{card.cardData.typeLine}</p>
          <p className="flex-1 text-xs leading-relaxed text-foreground/80">
            {card.cardData.oracleText}
          </p>
          {card.cardData.power && (
            <p className="self-end text-lg font-bold">
              {card.cardData.power}/{card.cardData.toughness}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ==================== MAIN COMPONENT ====================
export function CardView({
  card,
  mode = 'art',
  onClick,
  onDoubleClick,
  selected = false,
  highlighted = false,
  interactive = true,
  combatRole = 'none',
  className,
}: CardViewProps) {
  const [hovered, setHovered] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (!interactive) return;
    setHovered(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setHoverPosition({
      x: rect.right + 12,
      y: Math.max(8, rect.top - 50),
    });
  };

  return (
    <div
      className={cn(
        'relative inline-block transition-transform',
        interactive && 'cursor-pointer',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg',
        highlighted && 'card-glow-strong',
        combatRole === 'attacking' && 'ring-2 ring-red-500 ring-offset-1 ring-offset-background rounded-lg',
        combatRole === 'blocking' && 'ring-2 ring-blue-500 ring-offset-1 ring-offset-background rounded-lg',
        className
      )}
      onClick={() => onClick?.(card)}
      onDoubleClick={() => onDoubleClick?.(card)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHovered(false)}
    >
      {mode === 'pip' && <PipView card={card} />}
      {mode === 'art' && <ArtView card={card} />}
      {mode === 'full' && <FullView card={card} />}

      {/* Combat role badge */}
      {combatRole === 'attacking' && (
        <div className="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="m21 11-6 6"/></svg>
        </div>
      )}
      {combatRole === 'blocking' && (
        <div className="absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
        </div>
      )}

      {/* Hover preview (only for pip and art modes) */}
      <AnimatePresence>
        {hovered && mode !== 'full' && (
          <div
            style={{
              position: 'fixed',
              left: hoverPosition.x,
              top: hoverPosition.y,
              zIndex: 100,
            }}
          >
            <CardHoverPreview card={card} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { PipView, ArtView, FullView, CardHoverPreview };
