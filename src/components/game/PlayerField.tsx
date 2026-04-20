'use client';

import { useRef, useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView, type CombatRole } from './CardView';
import { ManaPoolDisplay } from './ManaPoolDisplay';
import type { CardInstance, PlayerState, GameAction, CombatState, ManaColor } from '@/engine/types';
import { ManaColorPicker } from './ManaColorPicker';
import { Heart, Skull, Droplets, Crown, Library, ArchiveX, ZapOff, Sword, Gem } from 'lucide-react';

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
  pendingManaChoice?: { cardInstanceId: string; actions: GameAction[] } | null;
  onManaColorPicked?: (color: ManaColor | 'C') => void;
  onCancelManaChoice?: () => void;
  validTargetIds?: Set<string>;
  onSelectTarget?: (targetId: string) => void;
  className?: string;
}

function getCardCombatRole(cardId: string, combat?: CombatState | null): CombatRole {
  if (!combat) return 'none';
  if (combat.attackers.some((a) => a.attackerInstanceId === cardId)) return 'attacking';
  if (combat.blockers.some((b) => b.blockerInstanceId === cardId)) return 'blocking';
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
  legalActions,
  combat,
  onTapLand,
  onUntapLand,
  onCastCommander,
  onCardClick,
  onEquipClick,
  pendingManaChoice,
  onManaColorPicked,
  onCancelManaChoice,
  validTargetIds,
  onSelectTarget,
  className,
}: PlayerFieldProps) {
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
      !c.cardData.typeLine.toLowerCase().includes('land')
  );

  // Use pip mode for opponents, art mode for current user
  const cardMode = isCurrentUser ? 'art' : 'pip';

  // Commander art for backdrop
  const commanderCard = commandZone[0]
    || battlefield.find(c => c.cardData.typeLine.toLowerCase().includes('legendary'));
  const commanderArtUrl = commanderCard?.cardData.imageUris?.artCrop
    || commanderCard?.cardData.cardFaces?.[0]?.imageUris?.artCrop;

  return (
    <div
      className={cn(
        'relative rounded-2xl border p-4 transition-all overflow-hidden',
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
        <div className="absolute inset-0 pointer-events-none">
          <Image
            src={commanderArtUrl}
            alt=""
            fill
            sizes="600px"
            className="object-cover opacity-[0.15] scale-125 saturate-[1.2]"
            unoptimized
          />
          {/* Warm vignette overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/50 to-background/30" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-background/60" />
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

      {/* Command zone */}
      {commandZone.length > 0 && (
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
                    mode={isCurrentUser ? 'art' : 'pip'}
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
      <div className="relative flex flex-col gap-3">
        {/* Creatures row */}
        {creatures.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              <Sword className="h-3 w-3" />
              Creatures ({creatures.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence>
              {creatures.map((card) => {
                const isTarget = validTargetIds?.has(card.instanceId);
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
                      onClick={(c) => isTarget ? onSelectTarget?.(c.instanceId) : undefined}
                      combatRole={getCardCombatRole(card.instanceId, combat)}
                      highlighted={isTarget}
                      interactive
                      className={cn(
                        isTarget && 'ring-2 ring-cyan-500/60 cursor-crosshair'
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
            <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              <Gem className="h-3 w-3" />
              Other ({otherPermanents.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AnimatePresence>
              {otherPermanents.map((card) => {
                const isTarget = validTargetIds?.has(card.instanceId);
                const canEquip = equippableIds.has(card.instanceId);
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
                        else undefined;
                      }}
                      highlighted={isTarget || canEquip}
                      interactive
                      className={cn(
                        isTarget && 'ring-2 ring-cyan-500/60 cursor-crosshair',
                        canEquip && !isTarget && 'ring-2 ring-amber-500/60 cursor-pointer'
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
          <div className="pt-2 border-t border-border/10">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              <Library className="h-3 w-3" />
              Lands ({lands.length})
            </div>
            <div className="flex flex-wrap gap-1">
              <AnimatePresence>
              {lands.map((card) => {
                const canTap = tappableLandIds.has(card.instanceId);
                const canUntap = untappableLandIds.has(card.instanceId);
                const hasPendingChoice = pendingManaChoice?.cardInstanceId === card.instanceId;
                return (
                  <motion.div
                    key={card.instanceId}
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    layout
                    className={cn('relative', (canTap || canUntap) && 'cursor-pointer')}
                  >
                    <div
                      onClick={() => {
                        if (hasPendingChoice) return; // picker is open
                        if (canTap) onTapLand(card);
                        else if (canUntap && onUntapLand) onUntapLand(card);
                        // preview handled by context hover
                      }}
                      title={canUntap ? 'Click to untap' : canTap ? 'Click to tap for mana' : undefined}
                    >
                      <CardView
                        card={card}
                        mode="pip"
                        highlighted={canTap || hasPendingChoice}
                        interactive
                        className={cn(
                          canUntap && !canTap && 'ring-1 ring-amber-500/50',
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
    </div>
  );
}
