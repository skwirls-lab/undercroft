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
} from '@/lib/gameTypes';
import { getCardsInZone } from '@/lib/ZoneManager';
import { canBlock, hasFlying } from '@/lib/ActionValidator';
import {
  Swords,
  Shield,
  Target,
  X,
  ChevronRight,
} from 'lucide-react';

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

  const showAttackerSelection =
    isActivePlayer &&
    phase === 'combat' &&
    step === 'declare_attackers' &&
    !combat;

  const showBlockerSelection =
    !isActivePlayer &&
    phase === 'combat' &&
    step === 'declare_blockers';

  if (showAttackerSelection) {
    return <AttackerSelector gameState={gameState} currentPlayerId={currentPlayerId} legalActions={legalActions} onConfirm={onDeclareAttackers} onSkip={onSkipCombat} className={className} />;
  }

  if (showBlockerSelection && combat) {
    return <BlockerSelector gameState={gameState} currentPlayerId={currentPlayerId} combat={combat} onConfirm={onDeclareBlockers} className={className} />;
  }

  return null;
}

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
  const [selectedAttackers, setSelectedAttackers] = useState<Set<string>>(new Set());
  const [activeDefender, setActiveDefender] = useState<string | null>(null);

  const opponents = useMemo(
    () => gameState.players.filter((p) => p.id !== currentPlayerId && !p.hasLost && !p.hasConceded),
    [gameState.players, currentPlayerId]
  );

  const eligibleAttackerIds = useMemo(() => {
    const action = legalActions.find((a) => a.type === 'DECLARE_ATTACKERS');
    return (action?.payload.eligibleAttackerIds as string[]) || [];
  }, [legalActions]);

  const eligibleCreatures = useMemo(
    () => eligibleAttackerIds.map((id) => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c),
    [eligibleAttackerIds, gameState.cardInstances]
  );

  const defaultDefender = opponents[0]?.id || '';

  const toggleAttacker = useCallback(
    (cardId: string) => {
      setSelectedAttackers((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) {
          next.delete(cardId);
        } else {
          next.add(cardId);
        }
        return next;
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    const declarations: AttackerAssignment[] = eligibleCreatures.map((card) => ({
      attackerId: card.instanceId,
      defendingPlayerId: activeDefender || defaultDefender,
    }));
    onConfirm(declarations);
  }, [eligibleCreatures, activeDefender, defaultDefender, onConfirm]);

  if (eligibleCreatures.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn('flex flex-col items-center gap-3 rounded-xl border border-border/30 bg-card/40 p-4', className)}
      >
        <p className="text-sm text-muted-foreground">No creatures available to attack</p>
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
      className={cn('flex flex-col gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4', className)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-red-400" />
          <span className="text-sm font-semibold text-red-300">Declare Attackers</span>
          <span className="text-xs text-muted-foreground">({selectedAttackers.size} selected)</span>
        </div>
      </div>

      {opponents.length > 1 && (
        <div className="flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Attack target:</span>
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
              {opp.name} <span className="ml-1 text-[10px] opacity-60">({opp.life} HP)</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {eligibleCreatures.map((card) => (
          <div key={card.instanceId} className="relative">
            <div
              onClick={() => toggleAttacker(card.instanceId)}
              className={cn(
                'cursor-pointer rounded-lg transition-all',
                selectedAttackers.has(card.instanceId)
                  ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-background'
                  : 'opacity-70 hover:opacity-100'
              )}
            >
              <CardView card={card} mode="art" interactive={false} />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleConfirm} disabled={selectedAttackers.size === 0} className="gap-1 bg-red-600 hover:bg-red-700">
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
  const [blockerAssignments, setBlockerAssignments] = useState<Map<string, string>>(new Map());
  const [selectedBlocker, setSelectedBlocker] = useState<string | null>(null);

  // Get attackers targeting this player as CardInstance objects
  const incomingAttackers = useMemo(
    () => combat.attackers.filter((a) => a.defendingPlayerId === currentPlayerId).map(attacker => {
      return gameState.cardInstances.get(attacker.instanceId);
    }).filter((c): c is CardInstance => !!c),
    [combat.attackers, currentPlayerId, gameState.cardInstances]
  );

  const eligibleBlockers = useMemo(() => {
    const battlefield = getCardsInZone(gameState, currentPlayerId, 'battlefield' as any);
    // Map string IDs to CardInstance objects first
    const blockerInstances = battlefield.map((id) => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c);
    return blockerInstances.filter(canBlock);
  }, [gameState, currentPlayerId]);

  const assignBlocker = useCallback(
    (attackerId: string) => {
      if (!selectedBlocker) return;
      setBlockerAssignments((prev) => {
        const next = new Map(prev);
        if (next.get(selectedBlocker) === attackerId) {
          next.delete(selectedBlocker);
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

  const totalIncoming = incomingAttackers.reduce((sum, a) => sum + parseInt(a.cardData.power || '0', 10), 0);
  const unblockedDamage = incomingAttackers.reduce((sum, a) => {
    const blockedBy = [...blockerAssignments.entries()].filter(([aid]) => aid === a.instanceId);
    if (blockedBy.length > 0) return sum;
    return sum + parseInt(a.cardData.power || '0', 10);
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex flex-col gap-3 rounded-xl border border-blue-500/30 bg-blue-950/20 p-4', className)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold text-blue-300">Declare Blockers</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-red-400">{totalIncoming} incoming</span>
          {blockerAssignments.size > 0 && (
            <span className="text-amber-400">{unblockedDamage} unblocked</span>
          )}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-red-400/70">
          Incoming Attackers ({incomingAttackers.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {incomingAttackers.map((attacker) => (
            <div key={attacker.instanceId} className="flex flex-col items-center gap-1">
              <CardView card={attacker} mode="art" interactive={false} />
              {[...blockerAssignments.entries()].filter(([aid]) => aid === attacker.instanceId).length > 0 && (
                <div className="flex gap-0.5">
                  {[...blockerAssignments.entries()].filter(([aid]) => aid === attacker.instanceId).map(([bid]) => {
                    const blocker = gameState.cardInstances.get(bid);
                    if (!blocker) return null;
                    return (
                      <div key={bid} onClick={() => removeBlocker(bid)} className="cursor-pointer" title="Click to remove blocker">
                        <CardView card={blocker} mode="pip" interactive={false} highlighted />
                      </div>
                    );
                  })}
                </div>
              )}
              {hasFlying(attacker.cardData) && (
                <span className="text-[8px] font-medium text-sky-400">Flying</span>
              )}
              {[...blockerAssignments.entries()].filter(([aid]) => aid === attacker.instanceId).length === 0 && (
                <span className="text-[9px] font-medium text-red-400">Unblocked ({attacker.cardData.power || '0'} dmg)</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {eligibleBlockers.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-blue-400/70">
            Your Creatures — click to select, then click an attacker
          </div>
          <div className="flex flex-wrap gap-1.5">
            {eligibleBlockers.map((card) => (
              <div
                key={card.instanceId}
                onClick={() => {
                  if (blockerAssignments.has(card.instanceId)) {
                    removeBlocker(card.instanceId);
                  } else {
                    setSelectedBlocker(selectedBlocker === card.instanceId ? null : card.instanceId);
                  }
                }}
                className={cn(
                  'cursor-pointer rounded-lg transition-all',
                  selectedBlocker === card.instanceId && 'ring-2 ring-blue-400 ring-offset-1 ring-offset-background',
                  blockerAssignments.has(card.instanceId) && 'opacity-50',
                  selectedBlocker !== card.instanceId && !blockerAssignments.has(card.instanceId) && 'opacity-80 hover:opacity-100'
                )}
              >
                <CardView card={card} mode="art" interactive={false} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleConfirm} className="gap-1 bg-blue-600 hover:bg-blue-700">
          <Shield className="h-3.5 w-3.5" />
          Confirm Blocks ({blockerAssignments.size})
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onConfirm([])} className="gap-1">
          <X className="h-3.5 w-3.5" />
          No Blocks
        </Button>
      </div>
    </motion.div>
  );
}
