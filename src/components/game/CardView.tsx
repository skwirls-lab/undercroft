'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { CardInstance } from '@/lib/gameTypes';
import { getLandProducibleColors } from '@/lib/OracleTextParser';
import { useCardPreview } from './CardPreviewContext';
import { ManaSymbol, parseManaSymbols } from './ManaSymbol';

// Resolve the active face for DFC cards on the battlefield
function getActiveFace(card: CardInstance) {
  const { cardData } = card;
  if (!cardData.cardFaces || cardData.cardFaces.length < 2) {
    return {
      name: cardData.name,
      typeLine: cardData.typeLine,
      oracleText: cardData.oracleText,
      manaCost: cardData.manaCost,
      power: cardData.power,
      toughness: cardData.toughness,
      artCrop: cardData.imageUris?.artCrop,
      normal: cardData.imageUris?.normal,
    };
  }
  const face = card.flipped ? cardData.cardFaces[1] : cardData.cardFaces[0];
  return {
    name: face.name,
    typeLine: face.typeLine,
    oracleText: face.oracleText,
    manaCost: face.manaCost,
    power: face.power,
    toughness: face.toughness,
    artCrop: face.imageUris?.artCrop || cardData.imageUris?.artCrop,
    normal: face.imageUris?.normal || cardData.imageUris?.normal,
  };
}

// Calculate effective P/T including counters, pump, and equipment
function getDisplayPT(card: CardInstance): { power: string; toughness: string; boosted: boolean } {
  const basePower = parseInt(card.cardData.power || '0', 10);
  const baseToughness = parseInt(card.cardData.toughness || '0', 10);
  const counterBonus = card.counters['+1/+1'] || 0;
  const pumpPower = card.modifiedPower || 0;
  const pumpToughness = card.modifiedToughness || 0;
  const effectivePower = basePower + counterBonus + pumpPower;
  const effectiveToughness = baseToughness + counterBonus + pumpToughness;
  const boosted = counterBonus > 0 || pumpPower !== 0 || pumpToughness !== 0;
  return { power: String(effectivePower), toughness: String(effectiveToughness), boosted };
}

function isToken(card: CardInstance): boolean {
  const typeLine = card.cardData.typeLine.toLowerCase();
  const name = card.cardData.name.toLowerCase();
  return typeLine.includes('token') || name.includes('token');
}

export type CardViewMode = 'pip' | 'art' | 'full';
export type CombatRole = 'attacking' | 'blocking' | 'none';
export interface CardSize {
  w: number;
  h: number;
}

interface CardViewProps {
  card: CardInstance;
  mode?: CardViewMode;
  /** Explicit pixel size. When absent, the card sizes itself from the viewport. */
  size?: CardSize;
  onClick?: (card: CardInstance) => void;
  onDoubleClick?: (card: CardInstance) => void;
  selected?: boolean;
  highlighted?: boolean;
  interactive?: boolean;
  combatRole?: CombatRole;
  className?: string;
}

/** Frame colour by the card's colour identity — the one place colour is decorative. */
function getCardColorClass(card: CardInstance): string {
  const colors = card.cardData.colors;
  if (!colors || colors.length === 0) {
    if (card.cardData.typeLine.toLowerCase().includes('land')) return 'border-amber-700/70';
    return 'border-zinc-500/60';
  }
  if (colors.length > 1) return 'border-amber-400/70';
  const colorMap: Record<string, string> = {
    W: 'border-amber-100/70',
    U: 'border-blue-400/70',
    B: 'border-zinc-600/80',
    R: 'border-red-500/70',
    G: 'border-green-500/70',
  };
  return colorMap[colors[0]] || 'border-zinc-500/60';
}

/** Type-line accent for the no-art slab, so a glance still says "creature" or "land". */
function slabTone(typeLine: string): string {
  const t = typeLine.toLowerCase();
  if (t.includes('creature')) return 'from-[oklch(0.24_0.03_40)]';
  if (t.includes('land')) return 'from-[oklch(0.22_0.03_100)]';
  if (t.includes('planeswalker')) return 'from-[oklch(0.24_0.04_300)]';
  if (t.includes('artifact')) return 'from-[oklch(0.24_0.01_60)]';
  if (t.includes('enchantment')) return 'from-[oklch(0.22_0.03_320)]';
  if (t.includes('instant') || t.includes('sorcery')) return 'from-[oklch(0.22_0.03_240)]';
  return 'from-[oklch(0.22_0.014_55)]';
}

// ==================== PIP VIEW ====================
// Compact chip — lands, and opponents' boards at a glance.
function PipView({ card, className }: { card: CardInstance; className?: string }) {
  const face = getActiveFace(card);
  const isCreature = face.typeLine.toLowerCase().includes('creature');
  const isLand = face.typeLine.toLowerCase().includes('land');
  const isTapped = card.tapped;
  const artCropUrl = face.artCrop;
  const landColors = isLand ? getLandProducibleColors(card.cardData) : [];

  return (
    <div
      className={cn(
        'flex items-center rounded-md border font-medium leading-none transition-all',
        'h-[clamp(26px,3.6vmin,34px)] gap-[clamp(4px,0.6vmin,6px)] px-[clamp(5px,0.6vmin,8px)] text-[clamp(10px,1.4vmin,12px)]',
        getCardColorClass(card),
        isTapped ? 'rotate-[6deg] opacity-55' : '',
        'bg-card/90 backdrop-blur-sm',
        className
      )}
    >
      {artCropUrl && !isLand ? (
        <div className="relative shrink-0 overflow-hidden rounded" style={{ width: 'clamp(18px,2.6vmin,24px)', height: 'clamp(18px,2.6vmin,24px)' }}>
          <Image src={artCropUrl} alt="" fill sizes="24px" className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="flex shrink-0 gap-0.5">
          {isLand
            ? landColors.slice(0, 3).map((color) => <ManaSymbol key={color} symbol={color} size="xs" />)
            : parseManaSymbols(card.cardData.manaCost).slice(0, 3).map((sym, i) => <ManaSymbol key={i} symbol={sym} size="xs" />)}
        </div>
      )}

      <span className="min-w-0 truncate text-foreground/90">
        {face.name.length > 18 ? face.name.slice(0, 16) + '…' : face.name}
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {(card.counters['+1/+1'] || 0) > 0 && <span className="text-[0.85em] font-bold text-green-400">+{card.counters['+1/+1']}</span>}
        {card.attachmentNames.length > 0 && (
          <span className="text-[0.75em] font-bold text-amber-400" title={card.attachmentNames.join(', ')}>{card.attachmentNames.length}x⚔</span>
        )}
        {isToken(card) && <span className="text-[0.75em] font-bold text-purple-400">TKN</span>}
        {card.damage > 0 && <span className="text-[0.85em] font-bold text-red-400">-{card.damage}</span>}
        {isCreature && card.cardData.power && (() => {
          const pt = getDisplayPT(card);
          return (
            <span className={cn('rounded px-1 py-px text-[0.85em] font-bold', pt.boosted ? 'bg-green-900/60 text-green-300' : 'bg-black/40 text-white')}>
              {pt.power}/{pt.toughness}
            </span>
          );
        })()}
      </div>
    </div>
  );
}

// ==================== ART CROP VIEW ====================
// Battlefield card — art crop with a name plate; every dimension derives from --card-w so
// the card scales as one object when the row resizes it.
function ArtView({ card, size, className }: { card: CardInstance; size?: CardSize; className?: string }) {
  const face = getActiveFace(card);
  const isCreature = face.typeLine.toLowerCase().includes('creature');
  const isTapped = card.tapped;
  const artCropUrl = face.artCrop;
  const pt = isCreature && card.cardData.power ? getDisplayPT(card) : null;
  const hasArt = !!artCropUrl;

  // A custom property is not in CSSProperties' type; it is in the browser's.
  const style = {
    width: size ? size.w : 'clamp(72px,10vmin,140px)',
    height: size ? size.h : 'clamp(100px,14vmin,196px)',
    ['--card-w' as string]: size ? `${size.w}px` : 'clamp(72px,10vmin,140px)',
  } as React.CSSProperties;

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[calc(var(--card-w)*0.09)] border-[1.5px] transition-[filter,transform] duration-300',
        getCardColorClass(card),
        isTapped ? 'rotate-[7deg] brightness-[0.62] saturate-[0.7]' : '',
        className
      )}
      style={style}
    >
      {hasArt ? (
        <Image src={artCropUrl} alt={face.name} fill sizes="200px" className="object-cover" unoptimized />
      ) : (
        // No art yet (or none available): a carved slab that still tells you what the card is.
        <div className={cn('flex h-full w-full flex-col justify-between bg-gradient-to-b to-[oklch(0.14_0.012_55)] p-[calc(var(--card-w)*0.07)]', slabTone(face.typeLine))}>
          <div className="min-h-0 flex-1 overflow-hidden pt-[calc(var(--card-w)*0.16)]">
            <p className="font-display font-bold leading-[1.05] text-foreground" style={{ fontSize: 'calc(var(--card-w) * 0.13)' }}>
              {face.name}
            </p>
            <p className="mt-[calc(var(--card-w)*0.03)] truncate text-muted-foreground" style={{ fontSize: 'calc(var(--card-w) * 0.085)' }}>
              {face.typeLine.replace(/^(Legendary |Basic )?/, '').split(' — ')[0]}
            </p>
          </div>
        </div>
      )}

      {/* Mana cost, top right */}
      <div
        className="absolute inset-x-0 top-0 flex items-center justify-end bg-gradient-to-b from-black/70 to-transparent"
        style={{ gap: 'calc(var(--card-w) * 0.02)', padding: 'calc(var(--card-w) * 0.035) calc(var(--card-w) * 0.045) calc(var(--card-w) * 0.12)' }}
      >
        {parseManaSymbols(face.manaCost).slice(0, 6).map((sym, i) => (
          <ManaSymbol key={i} symbol={sym} size="xs" className="shadow-sm" style={{ width: 'calc(var(--card-w) * 0.13)', height: 'calc(var(--card-w) * 0.13)', fontSize: 'calc(var(--card-w) * 0.07)' }} />
        ))}
      </div>

      {/* Name plate, bottom — only over art; the slab already shows the name */}
      {hasArt && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/92 via-black/70 to-transparent" style={{ padding: 'calc(var(--card-w) * 0.16) calc(var(--card-w) * 0.06) calc(var(--card-w) * 0.045)' }}>
          <p className="truncate font-semibold leading-tight text-white drop-shadow-md" style={{ fontSize: 'calc(var(--card-w) * 0.115)', paddingRight: pt ? 'calc(var(--card-w) * 0.42)' : undefined }}>
            {face.name}
          </p>
        </div>
      )}

      {/* P/T, bottom right */}
      {pt && (
        <div
          className={cn('absolute bottom-0 right-0 rounded-tl-md font-black tabular-nums shadow-lg', pt.boosted ? 'bg-green-800 text-green-100' : 'bg-black/85 text-white')}
          style={{ fontSize: 'calc(var(--card-w) * 0.13)', padding: 'calc(var(--card-w) * 0.015) calc(var(--card-w) * 0.06)' }}
        >
          {pt.power}/{pt.toughness}
        </div>
      )}

      {/* Token */}
      {isToken(card) && (
        <div className="absolute left-0 rounded-r bg-purple-600/90 font-bold text-purple-100 shadow" style={{ top: 'calc(var(--card-w) * 0.2)', fontSize: 'calc(var(--card-w) * 0.075)', padding: '1px calc(var(--card-w) * 0.05)' }}>
          TOKEN
        </div>
      )}

      {/* Attachments */}
      {card.attachmentNames.length > 0 && (
        <div className="absolute right-0 truncate rounded-l bg-amber-600/90 font-bold text-amber-50 shadow" style={{ top: 'calc(var(--card-w) * 0.36)', fontSize: 'calc(var(--card-w) * 0.075)', padding: '1px calc(var(--card-w) * 0.05)', maxWidth: '80%' }}>
          {card.attachmentNames.length === 1 ? card.attachmentNames[0] : `${card.attachmentNames.length} attached`}
        </div>
      )}

      {/* Damage */}
      {card.damage > 0 && (
        <div className="absolute left-0 top-[2%] rounded-r bg-red-600/90 font-bold text-white shadow" style={{ fontSize: 'calc(var(--card-w) * 0.1)', padding: '1px calc(var(--card-w) * 0.06)' }}>
          -{card.damage}
        </div>
      )}

      {/* Modifier dot — keywords or counters present. Bottom-left, clear of the name. */}
      {(card.cardData.keywords.length > 0 || Object.keys(card.counters).length > 0) && (
        <div className="absolute rounded-full bg-gold shadow-[0_0_6px_var(--gold-glow-strong)]" style={{ left: 'calc(var(--card-w) * 0.05)', bottom: 'calc(var(--card-w) * 0.05)', width: 'calc(var(--card-w) * 0.08)', height: 'calc(var(--card-w) * 0.08)' }} />
      )}

      {/* Summoning sick */}
      {card.summoningSick && isCreature && (
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(0,0,0,0.18)_6px_8px)]" title="Summoning sick" />
      )}
    </div>
  );
}

// ==================== FULL CARD VIEW ====================
function FullView({ card, size, className }: { card: CardInstance; size?: CardSize; className?: string }) {
  const face = getActiveFace(card);
  const imageUrl = face.normal;
  const style = size ? { width: size.w, height: size.h } : { width: 'clamp(140px,20vmin,1000px)', height: 'clamp(196px,28vmin,1000px)' };

  return (
    <div className={cn('relative overflow-hidden rounded-xl border-2 shadow-lg transition-all', getCardColorClass(card), className)} style={style}>
      {imageUrl ? (
        <Image src={imageUrl} alt={face.name} fill sizes="190px" className="object-cover" unoptimized />
      ) : (
        <div className="flex h-full w-full flex-col gap-2 bg-card p-3">
          <p className="font-display text-sm font-bold">{face.name}</p>
          <p className="text-[10px] text-muted-foreground">{face.manaCost}</p>
          <p className="text-xs text-muted-foreground">{face.typeLine}</p>
          <p className="flex-1 text-[10px] leading-tight text-foreground/80">{face.oracleText}</p>
          {card.cardData.power && <p className="self-end text-sm font-bold">{card.cardData.power}/{card.cardData.toughness}</p>}
        </div>
      )}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================
export function CardView({
  card,
  mode = 'art',
  size,
  onClick,
  onDoubleClick,
  selected = false,
  highlighted = false,
  interactive = true,
  combatRole = 'none',
  className,
}: CardViewProps) {
  const { setPreviewCard } = useCardPreview();

  return (
    <div
      data-card-preview-safe
      className={cn(
        'relative inline-block transition-all duration-150',
        interactive && 'cursor-pointer hover:brightness-110',
        selected && 'rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background',
        highlighted && 'card-glow-strong',
        combatRole === 'attacking' && 'rounded-lg shadow-[0_0_12px_rgba(239,68,68,0.4)] ring-2 ring-red-500/80 ring-offset-1 ring-offset-background',
        combatRole === 'blocking' && 'rounded-lg shadow-[0_0_12px_rgba(59,130,246,0.4)] ring-2 ring-blue-500/80 ring-offset-1 ring-offset-background',
        className
      )}
      onClick={() => { setPreviewCard(card); onClick?.(card); }}
      onDoubleClick={() => onDoubleClick?.(card)}
    >
      {mode === 'pip' && <PipView card={card} />}
      {mode === 'art' && <ArtView card={card} size={size} />}
      {mode === 'full' && <FullView card={card} size={size} />}

      {combatRole === 'attacking' && (
        <div className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="m21 11-6 6"/></svg>
        </div>
      )}
      {combatRole === 'blocking' && (
        <div className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white shadow-md">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
        </div>
      )}
    </div>
  );
}

export { PipView, ArtView, FullView };
