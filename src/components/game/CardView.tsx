'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { CardInstance } from '@/engine/types';
import { getLandProducibleColors, getEffectiveLandCardData } from '@/engine/OracleTextParser';
import { useCardPreview } from './CardPreviewContext';

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
  return card.cardData.layout === 'token' || card.cardData.typeLine.toLowerCase().startsWith('token');
}

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
  W: 'bg-gradient-to-br from-amber-50 to-amber-200 text-amber-900 border border-amber-300',
  U: 'bg-gradient-to-br from-blue-400 to-blue-600 text-white border border-blue-300',
  B: 'bg-gradient-to-br from-zinc-700 to-zinc-900 text-zinc-100 border border-zinc-600',
  R: 'bg-gradient-to-br from-red-500 to-red-700 text-white border border-red-400',
  G: 'bg-gradient-to-br from-green-500 to-green-700 text-white border border-green-400',
  C: 'bg-gradient-to-br from-zinc-300 to-zinc-500 text-zinc-900 border border-zinc-400',
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
    if (card.cardData.typeLine.toLowerCase().includes('land')) return 'border-amber-700/80 shadow-[0_0_8px_rgba(180,83,9,0.2)]';
    return 'border-zinc-500/80 shadow-[0_0_8px_rgba(113,113,122,0.2)]';
  }
  if (colors.length > 1) return 'border-amber-400/80 shadow-[0_0_8px_rgba(251,191,36,0.2)]';
  const colorMap: Record<string, string> = {
    W: 'border-amber-200/80 shadow-[0_0_8px_rgba(253,230,138,0.2)]',
    U: 'border-blue-500/80 shadow-[0_0_8px_rgba(59,130,246,0.2)]',
    B: 'border-zinc-700/80 shadow-[0_0_8px_rgba(63,63,70,0.2)]',
    R: 'border-red-500/80 shadow-[0_0_8px_rgba(239,68,68,0.2)]',
    G: 'border-green-500/80 shadow-[0_0_8px_rgba(34,197,94,0.2)]',
  };
  return colorMap[colors[0]] || 'border-zinc-500/80';
}

// ==================== PIP VIEW ====================
// Compact view for opponents — mini art + name + P/T
function PipView({ card, className }: { card: CardInstance; className?: string }) {
  const face = getActiveFace(card);
  const isCreature = face.typeLine.toLowerCase().includes('creature');
  const isLand = face.typeLine.toLowerCase().includes('land');
  const isTapped = card.tapped;
  const artCropUrl = face.artCrop;

  // For lands, show producible mana dots instead of mana cost pips
  const effectiveData = getEffectiveLandCardData(card);
  const landColors = isLand ? getLandProducibleColors(effectiveData) : [];

  return (
    <div
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md border px-1 text-[10px] font-medium leading-none transition-all',
        getCardColorClass(card),
        isTapped ? 'rotate-3 opacity-60' : '',
        'bg-card/90 backdrop-blur-sm',
        className
      )}
    >
      {/* Mini art thumbnail */}
      {artCropUrl && !isLand ? (
        <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded">
          <Image src={artCropUrl} alt="" fill sizes="24px" className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="flex shrink-0 gap-0.5">
          {isLand ? (
            landColors.slice(0, 3).map((color) => {
              const colorClass = MANA_COLORS[color] || 'bg-zinc-500 text-white';
              return (
                <span key={color} className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold', colorClass)}>
                  {color}
                </span>
              );
            })
          ) : (
            getManaSymbols(card.cardData.manaCost).slice(0, 3).map((sym, i) => {
              const colorClass = MANA_COLORS[sym] || 'bg-zinc-500 text-white';
              return (
                <span key={i} className={cn('flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold', colorClass)}>
                  {sym.length <= 2 ? sym : ''}
                </span>
              );
            })
          )}
        </div>
      )}

      {/* Name */}
      <span className="truncate text-foreground/90 min-w-0">
        {face.name.length > 18 ? face.name.slice(0, 16) + '…' : face.name}
      </span>

      {/* Right side badges */}
      <div className="ml-auto flex items-center gap-1 shrink-0">
        {/* Counters */}
        {(card.counters['+1/+1'] || 0) > 0 && (
          <span className="text-[8px] font-bold text-green-400">+{card.counters['+1/+1']}</span>
        )}
        {/* Equipment */}
        {card.attachments.length > 0 && (
          <span className="text-[7px] font-bold text-amber-400">EQ</span>
        )}
        {/* Token */}
        {isToken(card) && (
          <span className="text-[7px] font-bold text-purple-400">TKN</span>
        )}
        {/* Damage */}
        {card.damage > 0 && (
          <span className="text-[9px] font-bold text-red-400">-{card.damage}</span>
        )}
        {/* P/T */}
        {isCreature && card.cardData.power && (() => {
          const pt = getDisplayPT(card);
          return (
            <span className={cn(
              'rounded px-1 py-0.5 text-[9px] font-bold',
              pt.boosted ? 'bg-green-900/60 text-green-300' : 'bg-black/40 text-white'
            )}>
              {pt.power}/{pt.toughness}
            </span>
          );
        })()}
      </div>
    </div>
  );
}

// ==================== ART CROP VIEW ====================
// Battlefield card — art crop with name/P/T frame overlay
function ArtView({ card, className }: { card: CardInstance; className?: string }) {
  const face = getActiveFace(card);
  const isCreature = face.typeLine.toLowerCase().includes('creature');
  const isTapped = card.tapped;
  const artCropUrl = face.artCrop;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border-2 transition-all group',
        getCardColorClass(card),
        isTapped ? 'rotate-[4deg] brightness-75' : '',
        'h-[132px] w-[96px]',
        className
      )}
    >
      {artCropUrl ? (
        <Image
          src={artCropUrl}
          alt={face.name}
          fill
          sizes="96px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-card px-1 text-center text-[10px] text-muted-foreground">
          {face.name}
        </div>
      )}

      {/* Top dark strip for mana cost */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-0.5 bg-gradient-to-b from-black/60 to-transparent px-1 pt-0.5 pb-3">
        {getManaSymbols(face.manaCost).slice(0, 5).map((sym, i) => {
          const colorClass = MANA_COLORS[sym] || 'bg-zinc-500 text-white';
          return (
            <span key={i} className={cn('flex h-3.5 w-3.5 items-center justify-center rounded-full text-[7px] font-bold shadow-sm', colorClass)}>
              {sym.length <= 2 ? sym : ''}
            </span>
          );
        })}
      </div>

      {/* Name overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-1.5 pb-1 pt-5">
        <p className="truncate text-[10px] font-semibold leading-tight text-white drop-shadow-md">
          {face.name}
        </p>
      </div>

      {/* P/T badge — bottom right corner, larger */}
      {isCreature && card.cardData.power && (() => {
        const pt = getDisplayPT(card);
        return (
          <div className={cn(
            'absolute right-0 bottom-0 rounded-tl-md px-1.5 py-0.5 text-[11px] font-black shadow-lg',
            pt.boosted ? 'bg-green-800 text-green-200' : 'bg-black/80 text-white'
          )}>
            {pt.power}/{pt.toughness}
          </div>
        );
      })()}

      {/* Token badge */}
      {isToken(card) && (
        <div className="absolute left-0 bottom-3.5 rounded-r bg-purple-600/90 px-1 py-0.5 text-[7px] font-bold text-purple-100 shadow">
          TOKEN
        </div>
      )}

      {/* Equipment attached indicator */}
      {card.attachments.length > 0 && (
        <div className="absolute right-0 top-5 rounded-l bg-amber-600/90 px-1 py-0.5 text-[7px] font-bold text-amber-100 shadow">
          EQ
        </div>
      )}

      {/* Damage indicator */}
      {card.damage > 0 && (
        <div className="absolute left-0 top-0.5 rounded-r bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
          -{card.damage}
        </div>
      )}

      {/* Tapped overlay */}
      {isTapped && (
        <div className="absolute inset-0 bg-black/20" />
      )}

      {/* Keyword badges (combat-relevant) */}
      {isCreature && card.cardData.keywords.length > 0 && (
        <div className="absolute left-0.5 top-5 flex flex-col gap-0.5">
          {card.cardData.keywords
            .filter((k) => ['Flying', 'Deathtouch', 'Lifelink', 'Trample', 'First Strike', 'Double Strike', 'Vigilance', 'Reach', 'Defender', 'Haste', 'Flash', 'Hexproof', 'Indestructible', 'Menace'].includes(k))
            .slice(0, 3)
            .map((kw) => (
              <span key={kw} className="rounded bg-black/70 px-1 text-[7px] font-semibold text-amber-300 leading-tight shadow-sm">
                {kw}
              </span>
            ))}
        </div>
      )}

      {/* Counter badges */}
      {Object.entries(card.counters).length > 0 && (
        <div className="absolute left-0.5 bottom-4 flex gap-0.5">
          {Object.entries(card.counters).map(([type, count]) => (
            <span key={type} className={cn('rounded px-1 text-[8px] font-bold text-white shadow-sm',
              type === '+1/+1' ? 'bg-green-600/90' : 'bg-purple-600/90'
            )}>
              {count > 1 ? `${count}x` : ''}{type}
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
  const face = getActiveFace(card);
  const imageUrl = face.normal;

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
          alt={face.name}
          fill
          sizes="190px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full flex-col gap-2 bg-card p-3">
          <p className="text-sm font-bold">{face.name}</p>
          <p className="text-[10px] text-muted-foreground">{face.manaCost}</p>
          <p className="text-xs text-muted-foreground">{face.typeLine}</p>
          <p className="flex-1 text-[10px] leading-tight text-foreground/80">
            {face.oracleText}
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
  const { setPreviewCard } = useCardPreview();

  return (
    <div
      className={cn(
        'relative inline-block transition-all duration-150',
        interactive && 'cursor-pointer hover:brightness-110',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg',
        highlighted && 'card-glow-strong',
        combatRole === 'attacking' && 'ring-2 ring-red-500/80 ring-offset-1 ring-offset-background rounded-lg shadow-[0_0_12px_rgba(239,68,68,0.4)]',
        combatRole === 'blocking' && 'ring-2 ring-blue-500/80 ring-offset-1 ring-offset-background rounded-lg shadow-[0_0_12px_rgba(59,130,246,0.4)]',
        className
      )}
      onClick={() => onClick?.(card)}
      onDoubleClick={() => onDoubleClick?.(card)}
      onMouseEnter={() => interactive && setPreviewCard(card)}
      onMouseLeave={() => interactive && setPreviewCard(null)}
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

    </div>
  );
}

export { PipView, ArtView, FullView };
