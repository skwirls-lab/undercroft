'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView } from './CardView';
import { Button } from '@/components/ui/button';
import type {
  CardInstance,
  GameState,
  GameAction,
  CombatState,
} from '@/engine/types';
import { getCardsInZone } from '@/engine/GameState';
import { canBlock, canBlockAttacker, hasFlying } from '@/engine/ActionValidator';
import {
  Swords,
  Shield,
  Target,
  X,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────

interface AttackerAssignment {
  attackerId: string;
  defendingPlayerId: string;
}

interface BlockerAssignment {
  blockerId: string;
  attackerId: string;
}

interface CombatControlsProps {
  gameState: GameState;
  currentPlayerId: string;
  legalActions: GameAction[];
  onDeclareAttackers: (declarations: AttackerAssignment[]) => void;
  onDeclareBlockers: (assignments: BlockerAssignment[]) => void;
  onSkipCombat: () => void;
  className?: string;
}

// ─── Main Component ───────────────────────────────────

export function CombatControls({
  gameState,
  currentPlayerId,
  legalActions,
  onDeclareAttackers,
  onDeclareBlockers,
  onSkipCombat,
  className,
}: CombatControlsProps) {
  const isActivePlayer = gameState.turn.activePlayerId === currentPlayerId;
  const phase = gameState.turn.phase;
  const step = gameState.turn.step;
  const combat = gameState.combat;

  // Show combat controls only during combat phase when human has priority
  const showAttackerSelection =
    isActivePlayer &&
    phase === 'combat' &&
    step === 'declare_attackers' &&
    !combat;

  const showBlockerSelection =
    !isActivePlayer &&
    phase === 'combat' &&
    step === 'declare_blockers' &&
    combat?.phase === 'declaring_blockers' &&
    combat.attackers.some((a) => a.defendingPlayerId === currentPlayerId);

  const showCombatSummary =
    combat &&
    (combat.phase === 'assigning_damage' || combat.phase === 'resolved');

  if (showAttackerSelection) {
    return (
      <AttackerSelector
        gameState={gameState}
        currentPlayerId={currentPlayerId}
        legalActions={legalActions}
        onConfirm={onDeclareAttackers}
        onSkip={onSkipCombat}
        className={className}
      />
    );
  }

  if (showBlockerSelection && combat) {
    return (
      <BlockerSelector
        gameState={gameState}
        currentPlayerId={currentPlayerId}
        combat={combat}
        onConfirm={onDeclareBlockers}
        className={className}
      />
    );
  }

  if (showCombatSummary && combat) {
    return <CombatSummary gameState={gameState} combat={combat} className={className} />;
  }

  return null;
}

// ─── Attacker Selector ────────────────────────────────

interface AttackerSelectorProps {
  gameState: GameState;
  currentPlayerId: string;
  legalActions: GameAction[];
  onConfirm: (declarations: AttackerAssignment[]) => void;
  onSkip: () => void;
  className?: string;
}

function AttackerSelector({
  gameState,
  currentPlayerId,
  legalActions,
  onConfirm,
  onSkip,
  className,
}: AttackerSelectorProps) {
  // Track selected attackers and their targets
  const [selectedAttackers, setSelectedAttackers] = useState<
    Map<string, string>
  >(new Map()); // attackerId -> defendingPlayerId
  const [activeDefender, setActiveDefender] = useState<string | null>(null);

  const opponents = useMemo(
    () =>
      gameState.players.filter(
        (p) => p.id !== currentPlayerId && !p.hasLost && !p.hasConceded
      ),
    [gameState.players, currentPlayerId]
  );

  // Get eligible attacker IDs from legal actions
  const eligibleAttackerIds = useMemo(() => {
    const action = legalActions.find((a) => a.type === 'DECLARE_ATTACKERS');
    return (action?.payload.eligibleAttackerIds as string[]) || [];
  }, [legalActions]);

  const eligibleCreatures = useMemo(
    () =>
      eligibleAttackerIds
        .map((id) => gameState.cardInstances.get(id))
        .filter((c): c is CardInstance => c !== undefined),
    [eligibleAttackerIds, gameState.cardInstances]
  );

  // Set first opponent as default target
  const defaultDefender = opponents[0]?.id || '';

  const toggleAttacker = useCallback(
    (cardId: string) => {
      setSelectedAttackers((prev) => {
        const next = new Map(prev);
        if (next.has(cardId)) {
          next.delete(cardId);
        } else {
          next.set(cardId, activeDefender || defaultDefender);
        }
        return next;
      });
    },
    [activeDefender, defaultDefender]
  );

  const handleConfirm = useCallback(() => {
    const declarations: AttackerAssignment[] = [];
    for (const [attackerId, defendingPlayerId] of selectedAttackers) {
      declarations.push({ attackerId, defendingPlayerId });
    }
    onConfirm(declarations);
  }, [selectedAttackers, onConfirm]);

  if (eligibleCreatures.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex flex-col items-center gap-3 rounded-xl border border-border/30 bg-card/40 p-4',
          className
        )}
      >
        <p className="text-sm text-muted-foreground">
          No creatures available to attack
        </p>
        <Button size="sm" variant="secondary" onClick={onSkip} className="gap-1">
          <ChevronRight className="h-3.5 w-3.5" />
          Skip Combat
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-red-400" />
          <span className="text-sm font-semibold text-red-300">
            Declare Attackers
          </span>
          <span className="text-xs text-muted-foreground">
            ({selectedAttackers.size} selected)
          </span>
        </div>
      </div>

      {/* Target selector (for Commander multi-opponent) */}
      {opponents.length > 1 && (
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Attack target:
          </span>
          {opponents.map((opp) => (
            <button
              key={opp.id}
              onClick={() => setActiveDefender(opp.id)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs font-medium transition-colors',
                (activeDefender || defaultDefender) === opp.id
                  ? 'border-red-500/50 bg-red-500/20 text-red-300'
                  : 'border-border/30 text-muted-foreground hover:border-border'
              )}
            >
              {opp.name}
              <span className="ml-1 text-[10px] opacity-60">
                ({opp.life} HP)
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Eligible creatures */}
      <div className="flex flex-wrap gap-1.5">
        {eligibleCreatures.map((card) => {
          const isSelected = selectedAttackers.has(card.instanceId);
          const targetId = selectedAttackers.get(card.instanceId);
          const targetName = opponents.find((o) => o.id === targetId)?.name;

          return (
            <div key={card.instanceId} className="relative">
              <div
                onClick={() => toggleAttacker(card.instanceId)}
                className={cn(
                  'cursor-pointer rounded-lg transition-all',
                  isSelected
                    ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-background'
                    : 'opacity-70 hover:opacity-100'
                )}
              >
                <CardView card={card} mode="art" interactive={false} />
              </div>
              {/* Attack target badge */}
              {isSelected && targetName && opponents.length > 1 && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded bg-red-600 px-1.5 py-0.5 text-[8px] font-bold text-white whitespace-nowrap">
                  → {targetName}
                </div>
              )}
              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
                  <Swords className="h-3 w-3" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={selectedAttackers.size === 0}
          className="gap-1 bg-red-600 hover:bg-red-700"
        >
          <Swords className="h-3.5 w-3.5" />
          Attack ({selectedAttackers.size})
        </Button>
        <Button size="sm" variant="ghost" onClick={onSkip} className="gap-1">
          <X className="h-3.5 w-3.5" />
          Skip Combat
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Blocker Selector ─────────────────────────────────

interface BlockerSelectorProps {
  gameState: GameState;
  currentPlayerId: string;
  combat: CombatState;
  onConfirm: (assignments: BlockerAssignment[]) => void;
  className?: string;
}

function BlockerSelector({
  gameState,
  currentPlayerId,
  combat,
  onConfirm,
  className,
}: BlockerSelectorProps) {
  // Track blocker assignments: blockerId -> attackerId
  const [blockerAssignments, setBlockerAssignments] = useState<
    Map<string, string>
  >(new Map());
  const [selectedBlocker, setSelectedBlocker] = useState<string | null>(null);

  // Get attackers targeting this player
  const incomingAttackers = useMemo(
    () =>
      combat.attackers
        .filter((a) => a.defendingPlayerId === currentPlayerId)
        .map((a) => ({
          declaration: a,
          card: gameState.cardInstances.get(a.attackerInstanceId),
        }))
        .filter(
          (a): a is { declaration: typeof a.declaration; card: CardInstance } =>
            a.card !== undefined
        ),
    [combat.attackers, currentPlayerId, gameState.cardInstances]
  );

  // Get eligible blockers
  const eligibleBlockers = useMemo(() => {
    const battlefield = getCardsInZone(
      gameState,
      currentPlayerId,
      'battlefield'
    );
    return battlefield.filter(canBlock);
  }, [gameState, currentPlayerId]);

  const assignBlocker = useCallback(
    (attackerId: string) => {
      if (!selectedBlocker) return;
      setBlockerAssignments((prev) => {
        const next = new Map(prev);
        // If this blocker was assigned elsewhere, remove old assignment
        if (next.get(selectedBlocker) === attackerId) {
          next.delete(selectedBlocker); // toggle off
        } else {
          next.set(selectedBlocker, attackerId);
        }
        return next;
      });
      setSelectedBlocker(null);
    },
    [selectedBlocker]
  );

  const removeBlocker = useCallback((blockerId: string) => {
    setBlockerAssignments((prev) => {
      const next = new Map(prev);
      next.delete(blockerId);
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const assignments: BlockerAssignment[] = [];
    for (const [blockerId, attackerId] of blockerAssignments) {
      assignments.push({ blockerId, attackerId });
    }
    onConfirm(assignments);
  }, [blockerAssignments, onConfirm]);

  // Calculate total incoming damage
  const totalIncoming = incomingAttackers.reduce(
    (sum, a) => sum + parseInt(a.card.cardData.power || '0', 10),
    0
  );
  const unblockedDamage = incomingAttackers.reduce((sum, a) => {
    const blockedBy = [...blockerAssignments.entries()].filter(
      ([, aid]) => aid === a.declaration.attackerInstanceId
    );
    if (blockedBy.length > 0) return sum;
    return sum + parseInt(a.card.cardData.power || '0', 10);
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-blue-500/30 bg-blue-950/20 p-4',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold text-blue-300">
            Declare Blockers
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-red-400">
            {totalIncoming} incoming
          </span>
          {blockerAssignments.size > 0 && (
            <span className="text-amber-400">
              {unblockedDamage} unblocked
            </span>
          )}
        </div>
      </div>

      {/* Incoming attackers */}
      <div>
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-red-400/70">
          Incoming Attackers ({incomingAttackers.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {incomingAttackers.map(({ declaration, card }) => {
            const blockersForThis = [...blockerAssignments.entries()]
              .filter(([, aid]) => aid === declaration.attackerInstanceId)
              .map(([bid]) => gameState.cardInstances.get(bid))
              .filter((c): c is CardInstance => c !== undefined);

            return (
              <div key={declaration.attackerInstanceId} className="flex flex-col items-center gap-1">
                <div
                  onClick={() => {
                    if (selectedBlocker) {
                      const blockerCard = gameState.cardInstances.get(selectedBlocker);
                      if (blockerCard && canBlockAttacker(blockerCard, card)) {
                        assignBlocker(declaration.attackerInstanceId);
                      }
                    }
                  }}
                  className={cn(
                    'rounded-lg transition-all',
                    selectedBlocker
                      ? (() => {
                          const blockerCard = gameState.cardInstances.get(selectedBlocker);
                          const canLegallyBlock = blockerCard && canBlockAttacker(blockerCard, card);
                          return canLegallyBlock
                            ? 'cursor-pointer ring-2 ring-dashed ring-blue-400/50 hover:ring-blue-400'
                            : 'opacity-40 cursor-not-allowed';
                        })()
                      : '',
                    blockersForThis.length > 0 && 'ring-2 ring-blue-500'
                  )}
                >
                  <CardView card={card} mode="art" interactive={false} />
                </div>
                {/* Show assigned blockers below */}
                {blockersForThis.length > 0 && (
                  <div className="flex gap-0.5">
                    {blockersForThis.map((blocker) => (
                      <div
                        key={blocker.instanceId}
                        onClick={() => removeBlocker(blocker.instanceId)}
                        className="cursor-pointer"
                        title="Click to remove blocker"
                      >
                        <CardView
                          card={blocker}
                          mode="pip"
                          interactive={false}
                          highlighted
                        />
                      </div>
                    ))}
                  </div>
                )}
                {/* Keywords indicator */}
                {hasFlying(card) && (
                  <span className="text-[8px] font-medium text-sky-400">Flying</span>
                )}
                {/* Unblocked label */}
                {blockersForThis.length === 0 && (
                  <span className="text-[9px] font-medium text-red-400">
                    Unblocked ({card.cardData.power || '0'} dmg)
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Available blockers */}
      {eligibleBlockers.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-blue-400/70">
            Your Creatures — click to select, then click an attacker
          </div>
          <div className="flex flex-wrap gap-1.5">
            {eligibleBlockers.map((card) => {
              const isAssigned = blockerAssignments.has(card.instanceId);
              const isSelected = selectedBlocker === card.instanceId;

              return (
                <div
                  key={card.instanceId}
                  onClick={() => {
                    if (isAssigned) {
                      removeBlocker(card.instanceId);
                    } else {
                      setSelectedBlocker(
                        isSelected ? null : card.instanceId
                      );
                    }
                  }}
                  className={cn(
                    'cursor-pointer rounded-lg transition-all',
                    isSelected && 'ring-2 ring-blue-400 ring-offset-1 ring-offset-background',
                    isAssigned && 'opacity-50',
                    !isSelected && !isAssigned && 'opacity-80 hover:opacity-100'
                  )}
                >
                  <CardView card={card} mode="art" interactive={false} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={handleConfirm}
          className="gap-1 bg-blue-600 hover:bg-blue-700"
        >
          <Shield className="h-3.5 w-3.5" />
          Confirm Blocks ({blockerAssignments.size})
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onConfirm([])}
          className="gap-1"
        >
          <X className="h-3.5 w-3.5" />
          No Blocks
        </Button>
      </div>
    </motion.div>
  );
}

// ─── Combat Summary ───────────────────────────────────

interface CombatSummaryProps {
  gameState: GameState;
  combat: CombatState;
  className?: string;
}

function CombatSummary({ gameState, combat, className }: CombatSummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        'flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3',
        className
      )}
    >
      <Swords className="h-4 w-4 text-amber-400" />
      <span className="text-sm text-amber-300">
        Combat resolving — {combat.attackers.length} attacker
        {combat.attackers.length !== 1 ? 's' : ''}
        {combat.blockers.length > 0 &&
          `, ${combat.blockers.length} blocker${combat.blockers.length !== 1 ? 's' : ''}`}
      </span>
    </motion.div>
  );
}

// ─── Utility: Get combat state for a card ─────────────

export type CombatRole = 'attacking' | 'blocking' | 'none';

export function getCardCombatRole(
  cardInstanceId: string,
  combat: CombatState | null
): CombatRole {
  if (!combat) return 'none';
  if (combat.attackers.some((a) => a.attackerInstanceId === cardInstanceId))
    return 'attacking';
  if (combat.blockers.some((b) => b.blockerInstanceId === cardInstanceId))
    return 'blocking';
  return 'none';
}

export function getAttackTarget(
  cardInstanceId: string,
  combat: CombatState | null
): string | null {
  if (!combat) return null;
  const decl = combat.attackers.find(
    (a) => a.attackerInstanceId === cardInstanceId
  );
  return decl?.defendingPlayerId || null;
}
