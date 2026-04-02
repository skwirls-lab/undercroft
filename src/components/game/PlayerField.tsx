'use client';

import { cn } from '@/lib/utils';
import { CardView, type CombatRole } from './CardView';
import { ManaPoolDisplay } from './ManaPoolDisplay';
import type { CardInstance, PlayerState, GameAction, CombatState, ManaColor } from '@/engine/types';
import { ManaColorPicker } from './ManaColorPicker';
import { Heart, Skull, Shield, Droplets, Crown } from 'lucide-react';

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
  pendingManaChoice?: { cardInstanceId: string; actions: GameAction[] } | null;
  onManaColorPicked?: (color: ManaColor | 'C') => void;
  onCancelManaChoice?: () => void;
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
  pendingManaChoice,
  onManaColorPicked,
  onCancelManaChoice,
  className,
}: PlayerFieldProps) {
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

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        isActivePlayer ? 'border-primary/40 bg-primary/5' : 'border-border/30 bg-card/30',
        player.hasLost && 'opacity-40',
        className
      )}
    >
      {/* Player info bar */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Player name + AI badge */}
          <span className={cn(
            'text-sm font-semibold',
            isActivePlayer ? 'text-primary' : 'text-foreground'
          )}>
            {player.name}
          </span>
          {player.isAI && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
              AI
            </span>
          )}
          {player.hasLost && (
            <Skull className="h-3.5 w-3.5 text-destructive" />
          )}
        </div>

        {/* Life + counters */}
        <div className="flex items-center gap-3">
          <ManaPoolDisplay manaPool={player.manaPool} compact />

          {player.poisonCounters > 0 && (
            <div className="flex items-center gap-0.5 text-green-400">
              <Droplets className="h-3 w-3" />
              <span className="text-xs font-bold">{player.poisonCounters}</span>
            </div>
          )}

          <div className={cn(
            'flex items-center gap-1 rounded-lg px-2 py-0.5',
            player.life <= 10 ? 'bg-red-900/30 text-red-400' :
            player.life <= 20 ? 'bg-amber-900/30 text-amber-400' :
            'bg-muted/50 text-foreground'
          )}>
            <Heart className="h-3.5 w-3.5" />
            <span className="text-sm font-bold">{player.life}</span>
          </div>
        </div>
      </div>

      {/* Zone counters */}
      <div className="mb-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>Library: {libraryCount}</span>
        <span>Grave: {graveyardCount}</span>
        <span>Exile: {exileCount}</span>
      </div>

      {/* Command zone */}
      {commandZone.length > 0 && (
        <div className="mb-2">
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
                      'ring-2 ring-primary/40',
                      canCast && 'ring-green-500/60 card-glow-strong'
                    )}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Battlefield */}
      <div className="flex flex-col gap-2">
        {/* Creatures row */}
        {creatures.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Creatures ({creatures.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {creatures.map((card) => (
                <CardView
                  key={card.instanceId}
                  card={card}
                  mode={cardMode}
                  onClick={onCardClick}
                  combatRole={getCardCombatRole(card.instanceId, combat)}
                  interactive
                />
              ))}
            </div>
          </div>
        )}

        {/* Other permanents row */}
        {otherPermanents.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Other ({otherPermanents.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {otherPermanents.map((card) => (
                <CardView
                  key={card.instanceId}
                  card={card}
                  mode={cardMode}
                  onClick={onCardClick}
                  interactive
                />
              ))}
            </div>
          </div>
        )}

        {/* Lands row */}
        {lands.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Lands ({lands.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {lands.map((card) => {
                const canTap = tappableLandIds.has(card.instanceId);
                const canUntap = untappableLandIds.has(card.instanceId);
                const hasPendingChoice = pendingManaChoice?.cardInstanceId === card.instanceId;
                return (
                  <div
                    key={card.instanceId}
                    className={cn('relative', (canTap || canUntap) && 'cursor-pointer')}
                  >
                    <div
                      onClick={() => {
                        if (hasPendingChoice) return; // picker is open
                        if (canTap) onTapLand(card);
                        else if (canUntap && onUntapLand) onUntapLand(card);
                        else if (onCardClick) onCardClick(card);
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
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty battlefield */}
        {battlefield.length === 0 && (
          <div className="flex items-center justify-center py-4 text-xs text-muted-foreground/50">
            No permanents
          </div>
        )}
      </div>
    </div>
  );
}
