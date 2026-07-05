'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { CardInstance } from '@/lib/gameTypes';
import { getLandProducibleColors, getEffectiveLandCardData } from '@/lib/OracleTextParser';
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
  // Token check based on type line or name
  const typeLine = card.cardData.typeLine.toLowerCase();
  const name = card.cardData.name.toLowerCase();
  return typeLine.includes('token') || name.includes('token');
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
  const effectiveData = getEffectiveLandCardData(card.cardData);
  const landColors = isLand ? getLandProducibleColors(card.cardData) : [];

  return (
    <div
      className={cn(
        'flex items-center rounded-md border font-medium leading-none transition-all',
        'h-[clamp(28px,4vmin,1000px)] gap-[clamp(4px,0.6vmin,1000px)] px-[clamp(4px,0.5vmin,1000px)] text-[clamp(9px,1.4vmin,1000px)]',
        getCardColorClass(card),
        isTapped ? 'rotate-3 opacity-60' : '',
        'bg-card/90 backdrop-blur-sm',
        className
      )}
    >
      {/* Mini art thumbnail */}
      {artCropUrl && !isLand ? (
        <div className="relative shrink-0 overflow-hidden rounded" style={{ width: 'clamp(20px,3vmin,1000px)', height: 'clamp(20px,3vmin,1000px)' }}>
          <Image src={artCropUrl} alt="" fill sizes="24px" className="object-cover" unoptimized />
        </div>
      ) : (
        <div className="flex shrink-0 gap-0.5">
          {isLand
            ? landColors.slice(0, 3).map((color) => (
                <ManaSymbol key={color} symbol={color} size="xs" />
              ))
            : parseManaSymbols(card.cardData.manaCost).slice(0, 3).map((sym, i) => (
                <ManaSymbol key={i} symbol={sym} size="xs" />
              ))
          }
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
          <span className="font-bold text-green-400" style={{ fontSize: 'clamp(7px,1vmin,1000px)' }}>+{card.counters['+1/+1']}</span>
        )}
        {/* Attachments */}
        {card.attachmentNames.length > 0 && (
          <span className="font-bold text-amber-400" style={{ fontSize: 'clamp(6px,0.9vmin,1000px)' }} title={card.attachmentNames.join(', ')}>
            {card.attachmentNames.length}x⚔
          </span>
        )}
        {/* Token */}
        {isToken(card) && (
          <span className="font-bold text-purple-400" style={{ fontSize: 'clamp(6px,0.9vmin,1000px)' }}>TKN</span>
        )}
        {/* Damage */}
        {card.damage > 0 && (
          <span className="font-bold text-red-400" style={{ fontSize: 'clamp(8px,1.2vmin,1000px)' }}>-{card.damage}</span>
        )}
        {/* P/T */}
        {isCreature && card.cardData.power && (() => {
          const pt = getDisplayPT(card);
          return (
            <span className={cn(
              'rounded font-bold',
              pt.boosted ? 'bg-green-900/60 text-green-300' : 'bg-black/40 text-white'
            )} style={{ fontSize: 'clamp(8px,1.2vmin,1000px)', padding: 'clamp(1px,0.2vmin,1000px) clamp(3px,0.4vmin,1000px)' }}>
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
        className
      )}
      style={{ width: 'clamp(72px,10vmin,1000px)', height: 'clamp(100px,14vmin,1000px)' }}
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
      <div className="absolute inset-x-0 top-0 flex items-center justify-end bg-gradient-to-b from-black/60 to-transparent" style={{ gap: 'clamp(2px,0.3vmin,1000px)', padding: 'clamp(2px,0.3vmin,1000px) clamp(3px,0.4vmin,1000px) clamp(8px,1.2vmin,1000px)' }}>
        {parseManaSymbols(face.manaCost).slice(0, 5).map((sym, i) => (
          <ManaSymbol key={i} symbol={sym} size="xs" className="shadow-sm" />
        ))}
      </div>

      {/* Name overlay at bottom */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent" style={{ padding: 'clamp(12px,2vmin,1000px) clamp(4px,0.6vmin,1000px) clamp(3px,0.4vmin,1000px)' }}>
        <p className="truncate font-semibold leading-tight text-white drop-shadow-md" style={{ fontSize: 'clamp(9px,1.4vmin,1000px)' }}>
          {face.name}
        </p>
      </div>

      {/* P/T badge — bottom right corner, larger */}
      {isCreature && card.cardData.power && (() => {
        const pt = getDisplayPT(card);
        return (
          <div className={cn(
            'absolute right-0 bottom-0 rounded-tl-md font-black shadow-lg',
            pt.boosted ? 'bg-green-800 text-green-200' : 'bg-black/80 text-white'
          )} style={{ fontSize: 'clamp(10px,1.6vmin,1000px)', padding: 'clamp(1px,0.2vmin,1000px) clamp(4px,0.6vmin,1000px)' }}>
            {pt.power}/{pt.toughness}
          </div>
        );
      })()}

      {/* Token badge */}
      {isToken(card) && (
        <div className="absolute left-0 bottom-3.5 rounded-r bg-purple-600/90 font-bold text-purple-100 shadow" style={{ fontSize: 'clamp(6px,0.9vmin,1000px)', padding: 'clamp(1px,0.2vmin,1000px) clamp(3px,0.4vmin,1000px)' }}>
          TOKEN
        </div>
      )}

      {/* Attachments indicator */}
      {card.attachmentNames.length > 0 && (
        <div className="absolute right-0 top-5 rounded-l bg-amber-600/90 font-bold text-amber-100 shadow truncate" style={{ fontSize: 'clamp(6px,0.9vmin,1000px)', padding: 'clamp(1px,0.2vmin,1000px) clamp(3px,0.4vmin,1000px)', maxWidth: 'clamp(50px,8vmin,1000px)' }} title={card.attachmentNames.join(', ')}>
          {card.attachmentNames.length === 1 ? card.attachmentNames[0] : `${card.attachmentNames.length} attached`}
        </div>
      )}

      {/* Damage indicator */}
      {card.damage > 0 && (
        <div className="absolute left-0 top-0.5 rounded-r bg-red-600/90 font-bold text-white shadow" style={{ fontSize: 'clamp(9px,1.3vmin,1000px)', padding: 'clamp(1px,0.2vmin,1000px) clamp(4px,0.6vmin,1000px)' }}>
          -{card.damage}
        </div>
      )}

      {/* Tapped overlay */}
      {isTapped && (
        <div className="absolute inset-0 bg-black/20" />
      )}

      {/* Modifier indicator — single icon when card has keywords or counters */}
      {(() => {
        const hasKeywords = card.cardData.keywords.length > 0;
        const hasCounters = Object.keys(card.counters).length > 0;
        if (!hasKeywords && !hasCounters) return null;
        const counterCount = Object.values(card.counters).reduce((s, v) => s + v, 0);
        return (
          <div className="absolute left-0 top-5 flex flex-col" style={{ gap: 'clamp(1px,0.2vmin,1000px)' }}>
            {hasKeywords && (
              <span className="rounded-r bg-amber-600/90 font-bold text-amber-100 shadow" style={{ fontSize: 'clamp(7px,1vmin,1000px)', padding: 'clamp(1px,0.15vmin,1000px) clamp(3px,0.4vmin,1000px)' }} title={card.cardData.keywords.join(', ')}>
                ★{card.cardData.keywords.length}
              </span>
            )}
            {hasCounters && (
              <span className="rounded-r bg-green-600/90 font-bold text-green-100 shadow" style={{ fontSize: 'clamp(7px,1vmin,1000px)', padding: 'clamp(1px,0.15vmin,1000px) clamp(3px,0.4vmin,1000px)' }} title={Object.entries(card.counters).map(([t,c]) => `${c}x ${t}`).join(', ')}>
                ◆{counterCount}
              </span>
            )}
          </div>
        );
      })()}
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
        className
      )}
      style={{ width: 'clamp(140px,20vmin,1000px)', height: 'clamp(196px,28vmin,1000px)' }}
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
      data-card-preview-safe
      className={cn(
        'relative inline-block transition-all duration-150',
        interactive && 'cursor-pointer hover:brightness-110',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg',
        highlighted && 'card-glow-strong',
        combatRole === 'attacking' && 'ring-2 ring-red-500/80 ring-offset-1 ring-offset-background rounded-lg shadow-[0_0_12px_rgba(239,68,68,0.4)]',
        combatRole === 'blocking' && 'ring-2 ring-blue-500/80 ring-offset-1 ring-offset-background rounded-lg shadow-[0_0_12px_rgba(59,130,246,0.4)]',
        className
      )}
      onClick={() => { setPreviewCard(card); onClick?.(card); }}
      onDoubleClick={() => onDoubleClick?.(card)}
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
