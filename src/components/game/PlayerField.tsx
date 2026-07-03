'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView, type CombatRole } from './CardView';
import { ManaPoolDisplay } from './ManaPoolDisplay';
import type { CardInstance, PlayerState, GameAction, CombatState, ManaColor } from '@/lib/gameTypes';
import { ManaColorPicker } from './ManaColorPicker';
import { Heart, Skull, Droplets, Crown, Library, ArchiveX, ZapOff, Sword, Gem, X, ChevronRight } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const cardEnter = { opacity: 0, scale: 0.7, y: 12 };
const cardAnimate = { opacity: 1, scale: 1, y: 0 };
const cardExit = { opacity: 0, scale: 0.5, y: -10 };
const cardSpring = { type: 'spring' as const, stiffness: 500, damping: 30 };

interface PlayerFieldProps {
  player: PlayerState;
  battlefield: CardInstance[];
  commandZone: CardInstance[];
  graveyardCount: number;
  exileCount: number;
  libraryCount: number;
  isActivePlayer: boolean;
  isCurrentUser: boolean;
  legalActions: GameAction[];
  combat?: CombatState | null;
  onTapLand: (card: CardInstance) => void;
  onUntapLand?: (card: CardInstance) => void;
  onCastCommander?: (card: CardInstance) => void;
  onCardClick?: (card: CardInstance) => void;
  onEquipClick?: (card: CardInstance) => void;
  onActivateAbility?: (card: CardInstance) => void;
  pendingManaChoice?: { cardInstanceId: string; actions: GameAction[] } | null;
  onManaColorPicked?: (color: ManaColor | 'C') => void;
  onCancelManaChoice?: () => void;
  validTargetIds?: Set<string>;
  onSelectTarget?: (targetId: string) => void;
  // Forge-style mana payment: highlight these lands, clicking taps for mana
  manaPaymentSourceIds?: Set<string>;
  onTapForManaPayment?: (cardInstanceId: string) => void;
  hideCommandZone?: boolean;
  className?: string;
}

function getCardCombatRole(cardId: string, combat?: CombatState | null): CombatRole {
  if (!combat) return 'none';
  if (combat.attackers.some((a) => a.instanceId === cardId)) return 'attacking';
  if (combat.blockers.some((b) => b.instanceId === cardId)) return 'blocking';
  return 'none';
}

export function PlayerField({
  player,
  battlefield,
  commandZone,
  graveyardCount,
  exileCount,
  libraryCount,
  isActivePlayer,
  isCurrentUser,
  hideCommandZone,
  legalActions,
  combat,
  onTapLand,
  onUntapLand,
  onCastCommander,
  onCardClick,
  onEquipClick,
  onActivateAbility,
  pendingManaChoice,
  onManaColorPicked,
  onCancelManaChoice,
  validTargetIds,
  onSelectTarget,
  manaPaymentSourceIds,
  onTapForManaPayment,
  className,
}: PlayerFieldProps) {
  // Detect compact viewport — triggers on narrow width OR short height (landscape mobile)
  const isNarrow = useMediaQuery('(max-width: 1024px)');
  const isShort = useMediaQuery('(max-height: 600px)');
  const isMobile = isNarrow || isShort;

  // Track life changes for animation
  const prevLifeRef = useRef(player.life);
  const [lifeDelta, setLifeDelta] = useState<number | null>(null);

  useEffect(() => {
    const delta = player.life - prevLifeRef.current;
    if (delta !== 0) {
      setLifeDelta(delta);
      prevLifeRef.current = player.life;
      const timer = setTimeout(() => setLifeDelta(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [player.life]);

  const tappableLandIds = new Set(
    legalActions
      .filter((a) => a.type === 'TAP_FOR_MANA')
      .map((a) => a.payload.cardInstanceId as string)
  );
  const untappableLandIds = new Set(
    legalActions
      .filter((a) => a.type === 'UNTAP_PERMANENT')
      .map((a) => a.payload.cardInstanceId as string)
  );
  const castableCommanderIds = new Set(
    legalActions
      .filter((a) => a.type === 'CAST_SPELL' && a.payload.fromZone === 'command')
      .map((a) => a.payload.cardInstanceId as string)
  );

  const equippableIds = new Set(
    legalActions
      .filter((a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'equip')
      .map((a) => a.payload.cardInstanceId as string)
  );

  const activatableIds = new Set(
    legalActions
      .filter((a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'forge_activated')
      .map((a) => a.payload.cardInstanceId as string)
  );

  // Build a set of card IDs that are attached to something (equipment on a creature, aura on a creature)
  // These should NOT appear standalone in the "Other" row — they show as badges on their host
  const attachedCardIds = new Set<string>();
  for (const card of battlefield) {
    if (card.attachedTo) {
      attachedCardIds.add(card.instanceId);
    }
  }

  // Separate battlefield into creature and non-creature permanents
  const creatures = battlefield.filter((c) =>
    c.cardData.typeLine.toLowerCase().includes('creature')
  );
  const lands = battlefield.filter((c) =>
    c.cardData.typeLine.toLowerCase().includes('land')
  );
  const otherPermanents = battlefield.filter(
    (c) =>
      !c.cardData.typeLine.toLowerCase().includes('creature') &&
      !c.cardData.typeLine.toLowerCase().includes('land') &&
      !attachedCardIds.has(c.instanceId)
  );

  // Use pip mode for opponents, art mode for current user
  const cardMode = isCurrentUser ? 'art' : 'pip';

  // Commander art for backdrop
  const commanderCard = commandZone.find(c =>
    c.cardData.typeLine.toLowerCase().includes('legendary') ||
    c.cardData.typeLine.toLowerCase().includes('planeswalker')
  ) || commandZone[0]
    || battlefield.find(c => c.cardData.typeLine.toLowerCase().includes('legendary'));
  const commanderArtUrl = commanderCard?.cardData.imageUris?.artCrop
    || commanderCard?.cardData.cardFaces?.[0]?.imageUris?.artCrop;

  return (
    <div
      className={cn(
        'relative rounded-2xl border transition-all overflow-hidden flex flex-col',
        isCurrentUser ? 'p-4' : 'p-2',
        isActivePlayer 
          ? 'border-gold/40 bg-gold/[0.03] shadow-[0_0_20px_rgba(212,169,68,0.08)] ring-1 ring-gold/20' 
          : isCurrentUser
            ? 'border-border/40 bg-card/50 shadow-lg'
            : 'border-border/20 bg-card/20',
        player.hasLost && 'opacity-40 grayscale',
        className
      )}
    >
      {/* Commander art backdrop */}
      {commanderArtUrl && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
          <Image
            src={commanderArtUrl}
            alt=""
            fill
            sizes="600px"
            className="object-cover object-top opacity-[0.28] scale-110 saturate-[1.4] blur-[1px]"
            unoptimized
          />
          {/* Vignette layers — heavier at edges, lighter in center to let art breathe */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-background/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-background/70" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/60 to-transparent" />
        </div>
      )}
      {/* Player info bar */}
      <div
        className={cn(
          'relative mb-3 flex items-center justify-between',
          validTargetIds?.has(player.id) && 'cursor-crosshair rounded-xl ring-2 ring-cyan-500/60 bg-cyan-950/20 px-3 py-2 -mx-1 -my-1'
        )}
        onClick={() => validTargetIds?.has(player.id) && onSelectTarget?.(player.id)}
      >
        <div className="flex items-center gap-2.5">
          {/* Player name + AI badge */}
          <span className={cn(
            'text-sm font-bold',
            validTargetIds?.has(player.id) ? 'text-cyan-300' :
            isActivePlayer ? 'text-gold' : 'text-foreground'
          )}>
            {player.name}
            {validTargetIds?.has(player.id) && <span className="ml-1 text-[10px] text-cyan-400">(target)</span>}
          </span>
          {player.isAI && (
            <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              AI
            </span>
          )}
          {player.hasLost && (
            <Skull className="h-4 w-4 text-destructive" />
          )}

          {/* Zone counters — inline with name */}
          <div className="flex items-center gap-2.5 text-[10px] font-semibold text-muted-foreground/60 ml-1">
            <span className="flex items-center gap-1" title="Library"><Library className="h-3 w-3" />{libraryCount}</span>
            <span className="flex items-center gap-1" title="Graveyard"><ArchiveX className="h-3 w-3" />{graveyardCount}</span>
            <span className="flex items-center gap-1" title="Exile"><ZapOff className="h-3 w-3" />{exileCount}</span>
          </div>
        </div>

        {/* Life + counters + mana — right side */}
        <div className="flex items-center gap-3">
          <ManaPoolDisplay manaPool={player.manaPool} compact />

          {player.poisonCounters > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-green-900/30 px-2 py-0.5 text-green-400">
              <Droplets className="h-3.5 w-3.5" />
              <span className="text-xs font-bold">{player.poisonCounters}</span>
            </div>
          )}

          <div className="relative">
            <motion.div
              key={player.life}
              initial={{ scale: 1.3 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1',
                player.life <= 10 ? 'bg-red-900/40 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.2)]' :
                player.life <= 20 ? 'bg-amber-900/30 text-amber-400' :
                'bg-muted/40 text-foreground'
              )}
            >
              <Heart className="h-4 w-4" />
              <span className="text-base font-black tabular-nums">{player.life}</span>
            </motion.div>
            {/* Life change delta badge */}
            <AnimatePresence>
              {lifeDelta !== null && (
                <motion.span
                  key={`delta-${Date.now()}`}
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: lifeDelta < 0 ? 16 : -16 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1 }}
                  className={cn(
                    'absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-black pointer-events-none',
                    lifeDelta > 0 ? 'text-green-400' : 'text-red-400'
                  )}
                >
                  {lifeDelta > 0 ? `+${lifeDelta}` : lifeDelta}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Command zone — for opponents, inline with info bar; for current user, separate row */}
      {!hideCommandZone && commandZone.length > 0 && isCurrentUser && (
        <div className="relative mb-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-primary/70">
            <Crown className="h-3 w-3" />
            Command Zone
          </div>
          <div className="flex flex-wrap gap-1">
            {commandZone.map((card) => {
              const canCast = castableCommanderIds.has(card.instanceId);
              return (
                <div
                  key={card.instanceId}
                  onClick={() => canCast ? onCastCommander?.(card) : onCardClick?.(card)}
                  className={cn(canCast && 'cursor-pointer')}
                  title={canCast ? 'Click to cast commander' : undefined}
                >
                  <CardView
                    card={card}
                    mode="art"
                    highlighted={canCast}
                    interactive
                    className={cn(
                      canCast && 'ring-2 ring-green-500/60 card-glow-strong'
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Battlefield */}
      {isMobile ? (
        <MobileBattlefield
          creatures={creatures}
          otherPermanents={otherPermanents}
          lands={lands}
          commandZone={hideCommandZone ? [] : commandZone}
          castableCommanderIds={castableCommanderIds}
          onCastCommander={onCastCommander}
          cardMode={cardMode}
          combat={combat}
          validTargetIds={validTargetIds}
          activatableIds={activatableIds}
          equippableIds={equippableIds}
          tappableLandIds={tappableLandIds}
          untappableLandIds={untappableLandIds}
          manaPaymentSourceIds={manaPaymentSourceIds}
          pendingManaChoice={pendingManaChoice}
          onSelectTarget={onSelectTarget}
          onActivateAbility={onActivateAbility}
          onEquipClick={onEquipClick}
          onTapLand={onTapLand}
          onUntapLand={onUntapLand}
          onTapForManaPayment={onTapForManaPayment}
          onManaColorPicked={onManaColorPicked}
          onCancelManaChoice={onCancelManaChoice}
          onCardClick={onCardClick}
          isEmpty={battlefield.length === 0}
        />
      ) : (
      <div className={cn(
        'relative flex-1 min-h-0 flex flex-col overflow-hidden',
        isCurrentUser ? 'gap-3' : 'gap-1'
      )}>
        {/* Opponent inline command zone */}
        {!hideCommandZone && commandZone.length > 0 && !isCurrentUser && (
          <div className="flex items-center gap-1">
            <Crown className="h-3 w-3 text-primary/50 shrink-0" />
            <div className="flex gap-1 overflow-hidden">
              {commandZone.map((card) => (
                <CardView key={card.instanceId} card={card} mode="pip" interactive />
              ))}
            </div>
          </div>
        )}

        {/* Creatures row */}
        {creatures.length > 0 && (
          <div>
            <div className={cn(
              'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50',
              isCurrentUser ? 'mb-1.5' : 'mb-0.5'
            )}>
              <Sword className="h-3 w-3" />
              Creatures ({creatures.length})
            </div>
            <div className={cn('flex gap-1.5', isCurrentUser ? 'flex-wrap' : 'flex-nowrap overflow-hidden')}>
              <AnimatePresence>
              {creatures.map((card) => {
                const isTarget = validTargetIds?.has(card.instanceId);
                const canActivate = activatableIds.has(card.instanceId);
                return (
                  <motion.div
                    key={card.instanceId}
                    initial={cardEnter}
                    animate={cardAnimate}
                    exit={cardExit}
                    transition={cardSpring}
                    layout
                  >
                    <CardView
                      card={card}
                      mode={cardMode}
                      onClick={(c) => {
                        if (isTarget) onSelectTarget?.(c.instanceId);
                        else if (canActivate) onActivateAbility?.(c);
                      }}
                      combatRole={getCardCombatRole(card.instanceId, combat)}
                      highlighted={isTarget || canActivate}
                      interactive
                      className={cn(
                        isTarget && 'ring-2 ring-cyan-500/60 cursor-crosshair',
                        canActivate && !isTarget && 'ring-2 ring-emerald-500/60 cursor-pointer'
                      )}
                    />
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Other permanents row */}
        {otherPermanents.length > 0 && (
          <div>
            <div className={cn(
              'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50',
              isCurrentUser ? 'mb-1.5' : 'mb-0.5'
            )}>
              <Gem className="h-3 w-3" />
              Other ({otherPermanents.length})
            </div>
            <div className={cn('flex gap-1.5', isCurrentUser ? 'flex-wrap' : 'flex-nowrap overflow-hidden')}>
              <AnimatePresence>
              {otherPermanents.map((card) => {
                const isTarget = validTargetIds?.has(card.instanceId);
                const canEquip = equippableIds.has(card.instanceId);
                const canActivate = activatableIds.has(card.instanceId);
                return (
                  <motion.div
                    key={card.instanceId}
                    initial={cardEnter}
                    animate={cardAnimate}
                    exit={cardExit}
                    transition={cardSpring}
                    layout
                  >
                    <CardView
                      card={card}
                      mode={cardMode}
                      onClick={(c) => {
                        if (isTarget) onSelectTarget?.(c.instanceId);
                        else if (canEquip) onEquipClick?.(c);
                        else if (canActivate) onActivateAbility?.(c);
                      }}
                      highlighted={isTarget || canEquip || canActivate}
                      interactive
                      className={cn(
                        isTarget && 'ring-2 ring-cyan-500/60 cursor-crosshair',
                        canEquip && !isTarget && 'ring-2 ring-amber-500/60 cursor-pointer',
                        canActivate && !isTarget && !canEquip && 'ring-2 ring-emerald-500/60 cursor-pointer'
                      )}
                    />
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Lands row */}
        {lands.length > 0 && (
          <div className={cn(isCurrentUser && 'pt-2 border-t border-border/10')}>
            <div className={cn(
              'flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50',
              isCurrentUser ? 'mb-1' : 'mb-0.5'
            )}>
              <Library className="h-3 w-3" />
              Lands ({lands.length})
            </div>
            <div className={cn('flex gap-1', isCurrentUser ? 'flex-wrap' : 'flex-nowrap overflow-hidden')}>
              <AnimatePresence>
              {lands.map((card) => {
                const isManaPaymentSource = manaPaymentSourceIds?.has(card.instanceId);
                const canTap = tappableLandIds.has(card.instanceId);
                const canUntap = untappableLandIds.has(card.instanceId);
                const canActivate = activatableIds.has(card.instanceId);
                const hasPendingChoice = pendingManaChoice?.cardInstanceId === card.instanceId;
                return (
                  <motion.div
                    key={card.instanceId}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    layout
                    className={cn('relative', (isManaPaymentSource || canTap || canUntap || canActivate) && 'cursor-pointer')}
                  >
                    <div
                      onClick={() => {
                        // Forge-style: during mana payment, clicking a source taps it
                        if (isManaPaymentSource && onTapForManaPayment) {
                          onTapForManaPayment(card.instanceId);
                          return;
                        }
                        if (hasPendingChoice) return; // picker is open
                        if (canTap) onTapLand(card);
                        else if (canActivate) onActivateAbility?.(card);
                        else if (canUntap && onUntapLand) onUntapLand(card);
                      }}
                      title={isManaPaymentSource ? 'Click to tap for mana payment' : canActivate ? 'Click to activate ability' : canUntap ? 'Click to untap' : canTap ? 'Click to tap for mana' : undefined}
                    >
                      <CardView
                        card={card}
                        mode="pip"
                        highlighted={isManaPaymentSource || canTap || canActivate || hasPendingChoice}
                        interactive
                        className={cn(
                          isManaPaymentSource && 'ring-2 ring-emerald-400/70 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
                          !isManaPaymentSource && canActivate && !canTap && 'ring-2 ring-emerald-500/60',
                          !isManaPaymentSource && canUntap && !canTap && !canActivate && 'ring-1 ring-amber-500/50',
                          hasPendingChoice && 'ring-2 ring-primary'
                        )}
                      />
                    </div>
                    {/* Mana color picker for multi-color lands */}
                    {hasPendingChoice && onManaColorPicked && onCancelManaChoice && (
                      <ManaColorPicker
                        colors={pendingManaChoice.actions.map((a) => a.payload.manaColor as ManaColor | 'C')}
                        onPick={onManaColorPicked}
                        onCancel={onCancelManaChoice}
                        className="-top-16 left-1/2 -translate-x-1/2"
                      />
                    )}
                  </motion.div>
                );
              })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Empty battlefield */}
        {battlefield.length === 0 && (
          <div className="flex items-center justify-center py-6 text-xs text-muted-foreground/30 italic">
            No permanents on the battlefield
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ==================== MOBILE BATTLEFIELD ====================
// Collapsed zone rows that expand to full-screen overlays on tap

interface MobileBattlefieldProps {
  creatures: CardInstance[];
  otherPermanents: CardInstance[];
  lands: CardInstance[];
  commandZone: CardInstance[];
  castableCommanderIds: Set<string>;
  onCastCommander?: (card: CardInstance) => void;
  cardMode: 'pip' | 'art';
  combat?: CombatState | null;
  validTargetIds?: Set<string>;
  activatableIds: Set<string>;
  equippableIds: Set<string>;
  tappableLandIds: Set<string>;
  untappableLandIds: Set<string>;
  manaPaymentSourceIds?: Set<string>;
  pendingManaChoice?: { cardInstanceId: string; actions: GameAction[] } | null;
  onSelectTarget?: (targetId: string) => void;
  onActivateAbility?: (card: CardInstance) => void;
  onEquipClick?: (card: CardInstance) => void;
  onTapLand: (card: CardInstance) => void;
  onUntapLand?: (card: CardInstance) => void;
  onTapForManaPayment?: (cardInstanceId: string) => void;
  onManaColorPicked?: (color: ManaColor | 'C') => void;
  onCancelManaChoice?: () => void;
  onCardClick?: (card: CardInstance) => void;
  isEmpty: boolean;
}

function MobileBattlefield({
  creatures,
  otherPermanents,
  lands,
  commandZone,
  castableCommanderIds,
  onCastCommander,
  cardMode,
  combat,
  validTargetIds,
  activatableIds,
  equippableIds,
  tappableLandIds,
  untappableLandIds,
  manaPaymentSourceIds,
  pendingManaChoice,
  onSelectTarget,
  onActivateAbility,
  onEquipClick,
  onTapLand,
  onUntapLand,
  onTapForManaPayment,
  onManaColorPicked,
  onCancelManaChoice,
  onCardClick,
  isEmpty,
}: MobileBattlefieldProps) {
  const [expandedZone, setExpandedZone] = useState<'creatures' | 'other' | 'lands' | 'command' | null>(null);

  // Get summary stats for a zone
  const creatureSummary = creatures.map(c => {
    const p = c.cardData.power ?? '?';
    const t = c.cardData.toughness ?? '?';
    const counters = c.counters['+1/+1'] || 0;
    const tapped = c.tapped;
    return { name: c.cardData.name, p, t, counters, tapped, attacking: getCardCombatRole(c.instanceId, combat) === 'attacking' };
  });

  const tappedLandCount = lands.filter(l => l.tapped).length;
  const untappedLandCount = lands.length - tappedLandCount;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col gap-1">
      {/* Command zone summary row */}
      {commandZone.length > 0 && (
        <button
          onClick={() => setExpandedZone('command')}
          className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-left w-full"
        >
          <Crown className="h-3.5 w-3.5 text-primary/70 shrink-0" />
          <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-wide shrink-0">
            Command ({commandZone.length})
          </span>
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-hidden">
            {commandZone.map((c, i) => (
              <span key={i} className="text-[9px] font-mono px-1 py-0.5 rounded bg-primary/10 text-primary/80 shrink-0 truncate max-w-[100px]">
                {c.cardData.name}
              </span>
            ))}
          </div>
          <ChevronRight className="h-3 w-3 text-primary/30 shrink-0" />
        </button>
      )}

      {/* Creatures summary row */}
      {creatures.length > 0 && (
        <button
          onClick={() => setExpandedZone('creatures')}
          className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-950/20 px-2.5 py-1.5 text-left w-full"
        >
          <Sword className="h-3.5 w-3.5 text-red-400 shrink-0" />
          <span className="text-[10px] font-semibold text-red-300 uppercase tracking-wide shrink-0">
            Creatures ({creatures.length})
          </span>
          <div className="flex-1 min-w-0 flex gap-1.5 overflow-hidden">
            {creatureSummary.slice(0, 4).map((c, i) => (
              <span key={i} className={cn(
                'text-[9px] font-mono px-1 py-0.5 rounded shrink-0',
                c.tapped ? 'bg-red-900/30 text-red-400/50' : 'bg-red-900/40 text-red-200',
                c.attacking && 'ring-1 ring-red-400'
              )}>
                {c.name.length > 8 ? c.name.slice(0, 7) + '\u2026' : c.name} {c.p}/{c.t}{c.counters > 0 ? ` +${c.counters}` : ''}
              </span>
            ))}
            {creatures.length > 4 && (
              <span className="text-[9px] text-red-400/60">+{creatures.length - 4}</span>
            )}
          </div>
          <ChevronRight className="h-3 w-3 text-red-400/40 shrink-0" />
        </button>
      )}

      {/* Other permanents summary row */}
      {otherPermanents.length > 0 && (
        <button
          onClick={() => setExpandedZone('other')}
          className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-950/20 px-2.5 py-1.5 text-left w-full"
        >
          <Gem className="h-3.5 w-3.5 text-purple-400 shrink-0" />
          <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wide shrink-0">
            Other ({otherPermanents.length})
          </span>
          <div className="flex-1 min-w-0 flex gap-1 overflow-hidden">
            {otherPermanents.slice(0, 3).map((c, i) => (
              <span key={i} className="text-[9px] font-mono px-1 py-0.5 rounded bg-purple-900/30 text-purple-200 shrink-0 truncate max-w-[80px]">
                {c.cardData.name}
              </span>
            ))}
            {otherPermanents.length > 3 && (
              <span className="text-[9px] text-purple-400/60">+{otherPermanents.length - 3}</span>
            )}
          </div>
          <ChevronRight className="h-3 w-3 text-purple-400/40 shrink-0" />
        </button>
      )}

      {/* Lands summary row */}
      {lands.length > 0 && (
        <button
          onClick={() => setExpandedZone('lands')}
          className="flex items-center gap-2 rounded-lg border border-amber-600/20 bg-amber-950/20 px-2.5 py-1.5 text-left w-full"
        >
          <Library className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide">
            Lands ({lands.length})
          </span>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-[9px] text-green-400 font-semibold">{untappedLandCount} untapped</span>
            {tappedLandCount > 0 && (
              <span className="text-[9px] text-amber-400/50">{tappedLandCount} tapped</span>
            )}
          </div>
          <ChevronRight className="h-3 w-3 text-amber-400/40 shrink-0" />
        </button>
      )}

      {/* Empty battlefield */}
      {isEmpty && (
        <div className="flex items-center justify-center py-3 text-[10px] text-muted-foreground/30 italic">
          No permanents
        </div>
      )}

      {/* Expanded zone overlay */}
      <AnimatePresence>
        {expandedZone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-md"
          >
            {/* Header */}
            <div className={cn(
              'flex items-center justify-between px-4 py-3 border-b shrink-0',
              expandedZone === 'command' && 'border-primary/30 bg-primary/10',
              expandedZone === 'creatures' && 'border-red-500/30 bg-red-950/30',
              expandedZone === 'other' && 'border-purple-500/30 bg-purple-950/30',
              expandedZone === 'lands' && 'border-amber-600/30 bg-amber-950/30',
            )}>
              <div className="flex items-center gap-2">
                {expandedZone === 'command' && <Crown className="h-4 w-4 text-primary/70" />}
                {expandedZone === 'creatures' && <Sword className="h-4 w-4 text-red-400" />}
                {expandedZone === 'other' && <Gem className="h-4 w-4 text-purple-400" />}
                {expandedZone === 'lands' && <Library className="h-4 w-4 text-amber-400" />}
                <span className="text-sm font-semibold capitalize">
                  {expandedZone === 'command' ? 'Command Zone' : expandedZone === 'other' ? 'Other Permanents' : expandedZone} ({
                    expandedZone === 'command' ? commandZone.length :
                    expandedZone === 'creatures' ? creatures.length :
                    expandedZone === 'other' ? otherPermanents.length :
                    lands.length
                  })
                </span>
              </div>
              <button
                onClick={() => setExpandedZone(null)}
                className="rounded-lg bg-muted/30 p-1.5 text-muted-foreground hover:bg-muted/50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable card grid */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-wrap gap-2 justify-center">
                {/* Command zone expanded */}
                {expandedZone === 'command' && commandZone.map(card => {
                  const canCast = castableCommanderIds.has(card.instanceId);
                  return (
                    <div key={card.instanceId}>
                      <CardView
                        card={card}
                        mode="art"
                        onClick={(c) => {
                          if (canCast) onCastCommander?.(c);
                          else onCardClick?.(c);
                        }}
                        highlighted={canCast}
                        interactive
                        className={cn(
                          canCast && 'ring-2 ring-green-500/60'
                        )}
                      />
                    </div>
                  );
                })}

                {expandedZone === 'creatures' && creatures.map(card => {
                  const isTarget = validTargetIds?.has(card.instanceId);
                  const canActivate = activatableIds.has(card.instanceId);
                  return (
                    <div key={card.instanceId}>
                      <CardView
                        card={card}
                        mode="art"
                        onClick={(c) => {
                          if (isTarget) onSelectTarget?.(c.instanceId);
                          else if (canActivate) onActivateAbility?.(c);
                          else onCardClick?.(c);
                        }}
                        combatRole={getCardCombatRole(card.instanceId, combat)}
                        highlighted={isTarget || canActivate}
                        interactive
                        className={cn(
                          isTarget && 'ring-2 ring-cyan-500/60',
                          canActivate && !isTarget && 'ring-2 ring-emerald-500/60'
                        )}
                      />
                    </div>
                  );
                })}

                {expandedZone === 'other' && otherPermanents.map(card => {
                  const isTarget = validTargetIds?.has(card.instanceId);
                  const canEquip = equippableIds.has(card.instanceId);
                  const canActivate = activatableIds.has(card.instanceId);
                  return (
                    <div key={card.instanceId}>
                      <CardView
                        card={card}
                        mode="art"
                        onClick={(c) => {
                          if (isTarget) onSelectTarget?.(c.instanceId);
                          else if (canEquip) onEquipClick?.(c);
                          else if (canActivate) onActivateAbility?.(c);
                          else onCardClick?.(c);
                        }}
                        highlighted={isTarget || canEquip || canActivate}
                        interactive
                        className={cn(
                          isTarget && 'ring-2 ring-cyan-500/60',
                          canEquip && !isTarget && 'ring-2 ring-amber-500/60',
                          canActivate && !isTarget && !canEquip && 'ring-2 ring-emerald-500/60'
                        )}
                      />
                    </div>
                  );
                })}

                {expandedZone === 'lands' && lands.map(card => {
                  const isManaPaymentSource = manaPaymentSourceIds?.has(card.instanceId);
                  const canTap = tappableLandIds.has(card.instanceId);
                  const canUntap = untappableLandIds.has(card.instanceId);
                  const canActivate = activatableIds.has(card.instanceId);
                  const hasPendingChoice = pendingManaChoice?.cardInstanceId === card.instanceId;
                  return (
                    <div key={card.instanceId} className="relative">
                      <div
                        onClick={() => {
                          if (isManaPaymentSource && onTapForManaPayment) {
                            onTapForManaPayment(card.instanceId);
                            return;
                          }
                          if (hasPendingChoice) return;
                          if (canTap) onTapLand(card);
                          else if (canActivate) onActivateAbility?.(card);
                          else if (canUntap && onUntapLand) onUntapLand(card);
                          else onCardClick?.(card);
                        }}
                      >
                        <CardView
                          card={card}
                          mode="pip"
                          highlighted={isManaPaymentSource || canTap || canActivate || hasPendingChoice}
                          interactive
                          className={cn(
                            isManaPaymentSource && 'ring-2 ring-emerald-400/70',
                            !isManaPaymentSource && canActivate && !canTap && 'ring-2 ring-emerald-500/60',
                            !isManaPaymentSource && canUntap && !canTap && !canActivate && 'ring-1 ring-amber-500/50',
                            hasPendingChoice && 'ring-2 ring-primary'
                          )}
                        />
                      </div>
                      {hasPendingChoice && onManaColorPicked && onCancelManaChoice && (
                        <ManaColorPicker
                          colors={pendingManaChoice.actions.map((a) => a.payload.manaColor as ManaColor | 'C')}
                          onPick={onManaColorPicked}
                          onCancel={onCancelManaChoice}
                          className="-top-16 left-1/2 -translate-x-1/2"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
