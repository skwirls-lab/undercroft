'use client';

import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { PlayerField } from './PlayerField';
import { Hand } from './Hand';
import { PhaseTracker } from './PhaseTracker';
import { GameLog } from './GameLog';
import { CombatControls } from './CombatControls';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { getCardsInZone } from '@/engine/GameState';
import { getZoneCardCount } from '@/engine/ZoneManager';
import type { CardInstance, GameAction, ManaColor } from '@/engine/types';
import { CardDetailPanel } from './CardDetailPanel';
import { ArrowRight, Flag, Loader2, FastForward } from 'lucide-react';

interface GameBoardProps {
  currentPlayerId: string;
  className?: string;
}

export function GameBoard({ currentPlayerId, className }: GameBoardProps) {
  const { gameState, legalActions, events, isProcessing, performAction, autoPassUntilNextTurn, setAutoPass, lockedTappedIds } = useGameStore();

  // Filter out UNTAP_PERMANENT for locked cards
  const filteredLegalActions = legalActions.filter(
    (a) => !(a.type === 'UNTAP_PERMANENT' && lockedTappedIds.has(a.payload.cardInstanceId as string))
  );

  const handlePlayCard = useCallback(
    (card: CardInstance) => {
      if (!gameState) return;
      // Find the matching legal action
      const action = legalActions.find(
        (a) =>
          (a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL') &&
          a.payload.cardInstanceId === card.instanceId
      );
      if (action) performAction(action);
    },
    [gameState, legalActions, performAction]
  );

  // Multi-color land: pending mana choice state
  const [pendingManaChoice, setPendingManaChoice] = useState<{
    cardInstanceId: string;
    actions: GameAction[];
  } | null>(null);

  const handleTapLand = useCallback(
    (card: CardInstance) => {
      const tapActions = legalActions.filter(
        (a) =>
          a.type === 'TAP_FOR_MANA' &&
          a.payload.cardInstanceId === card.instanceId
      );
      if (tapActions.length === 0) return;
      if (tapActions.length === 1) {
        performAction(tapActions[0]);
      } else {
        // Multi-color land — show picker
        setPendingManaChoice({ cardInstanceId: card.instanceId, actions: tapActions });
      }
    },
    [legalActions, performAction]
  );

  const handleManaColorPicked = useCallback(
    (color: ManaColor | 'C') => {
      if (!pendingManaChoice) return;
      const action = pendingManaChoice.actions.find(
        (a) => a.payload.manaColor === color
      );
      if (action) performAction(action);
      setPendingManaChoice(null);
    },
    [pendingManaChoice, performAction]
  );

  const handleUntapLand = useCallback(
    (card: CardInstance) => {
      const action = legalActions.find(
        (a) =>
          a.type === 'UNTAP_PERMANENT' &&
          a.payload.cardInstanceId === card.instanceId
      );
      if (action) performAction(action);
    },
    [legalActions, performAction]
  );

  const handleCastCommander = useCallback(
    (card: CardInstance) => {
      const action = legalActions.find(
        (a) =>
          a.type === 'CAST_SPELL' &&
          a.payload.cardInstanceId === card.instanceId &&
          a.payload.fromZone === 'command'
      );
      if (action) performAction(action);
    },
    [legalActions, performAction]
  );

  // Card inspect panel
  const [inspectedCard, setInspectedCard] = useState<CardInstance | null>(null);
  const handleInspectCard = useCallback((card: CardInstance) => {
    setInspectedCard((prev) => (prev?.instanceId === card.instanceId ? null : card));
  }, []);

  const handlePassPriority = useCallback(() => {
    const action = legalActions.find((a) => a.type === 'PASS_PRIORITY');
    if (action) performAction(action);
  }, [legalActions, performAction]);

  const handleConcede = useCallback(() => {
    const action = legalActions.find((a) => a.type === 'CONCEDE');
    if (action) performAction(action);
  }, [legalActions, performAction]);

  const handleDeclareAttackers = useCallback(
    (declarations: Array<{ attackerId: string; defendingPlayerId: string }>) => {
      performAction({
        type: 'DECLARE_ATTACKERS',
        playerId: currentPlayerId,
        payload: { attackerDeclarations: declarations },
        timestamp: Date.now(),
      });
    },
    [currentPlayerId, performAction]
  );

  const handleDeclareBlockers = useCallback(
    (assignments: Array<{ blockerId: string; attackerId: string }>) => {
      performAction({
        type: 'DECLARE_BLOCKERS',
        playerId: currentPlayerId,
        payload: {
          blockerAssignments: assignments.map((a) => ({
            blockerId: a.blockerId,
            attackerId: a.attackerId,
          })),
        },
        timestamp: Date.now(),
      });
    },
    [currentPlayerId, performAction]
  );

  const handleSkipCombat = useCallback(() => {
    // Declare attackers with empty list to skip combat
    performAction({
      type: 'DECLARE_ATTACKERS',
      playerId: currentPlayerId,
      payload: { attackerDeclarations: [] },
      timestamp: Date.now(),
    });
  }, [currentPlayerId, performAction]);

  if (!gameState) {
    return (
      <div className="flex h-96 items-center justify-center text-muted-foreground">
        No active game
      </div>
    );
  }

  const currentPlayer = gameState.players.find((p) => p.id === currentPlayerId);
  const opponents = gameState.players.filter((p) => p.id !== currentPlayerId);
  const activePlayer = gameState.players.find(
    (p) => p.id === gameState.turn.activePlayerId
  );
  const hasPriority = gameState.priority.playerWithPriority === currentPlayerId;
  const isMyTurn = gameState.turn.activePlayerId === currentPlayerId;
  const handCards = getCardsInZone(gameState, currentPlayerId, 'hand');
  const combat = gameState.combat;
  const inCombatPhase = gameState.turn.phase === 'combat';
  const step = gameState.turn.step;
  // Only show combat controls during interactive combat steps, not beginning_of_combat/combat_damage/end_of_combat
  const showCombatControls =
    hasPriority &&
    inCombatPhase &&
    !isProcessing &&
    !gameState.isGameOver &&
    ((isMyTurn && step === 'declare_attackers' && !combat) ||
     (!isMyTurn && step === 'declare_blockers' && combat?.phase === 'declaring_blockers'));

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Phase tracker */}
      <PhaseTracker
        turn={gameState.turn}
        activePlayerName={activePlayer?.name || 'Unknown'}
      />

      {/* Opponent fields (top) */}
      <div className={cn(
        'grid gap-2',
        opponents.length === 1 && 'grid-cols-1',
        opponents.length === 2 && 'grid-cols-2',
        opponents.length >= 3 && 'grid-cols-3'
      )}>
        {opponents.map((opp) => (
          <PlayerField
            key={opp.id}
            player={opp}
            battlefield={getCardsInZone(gameState, opp.id, 'battlefield')}
            commandZone={getCardsInZone(gameState, opp.id, 'command')}
            graveyardCount={getZoneCardCount(gameState, opp.id, 'graveyard')}
            exileCount={getZoneCardCount(gameState, opp.id, 'exile')}
            libraryCount={getZoneCardCount(gameState, opp.id, 'library')}
            isActivePlayer={gameState.turn.activePlayerId === opp.id}
            isCurrentUser={false}
            legalActions={[]}
            combat={combat}
            onTapLand={() => {}}
            onCardClick={handleInspectCard}
          />
        ))}
      </div>

      {/* Combat controls (shown during combat phase) */}
      {showCombatControls && (
        <CombatControls
          gameState={gameState}
          currentPlayerId={currentPlayerId}
          legalActions={legalActions}
          onDeclareAttackers={handleDeclareAttackers}
          onDeclareBlockers={handleDeclareBlockers}
          onSkipCombat={handleSkipCombat}
        />
      )}

      {/* Action bar — always visible, buttons disabled when not actionable */}
      <div className="flex items-center gap-2 rounded-lg border border-border/30 bg-card/20 px-3 py-1.5">
        {/* Status label */}
        <span className="text-xs text-muted-foreground min-w-0 shrink">
          {gameState.isGameOver
            ? (gameState.winner
                ? `Game Over — ${gameState.players.find((p) => p.id === gameState.winner)?.name} wins!`
                : 'Game Over — Draw')
            : isProcessing
              ? 'AI is thinking...'
              : hasPriority
                ? (isMyTurn
                    ? inCombatPhase ? 'Combat' : 'Your turn'
                    : 'You have priority')
                : `Waiting for ${gameState.players.find((p) => p.id === gameState.priority.playerWithPriority)?.name}...`}
        </span>

        {isProcessing && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={handlePassPriority}
            disabled={!hasPriority || gameState.isGameOver || showCombatControls}
            className="h-7 gap-1 px-2 text-xs"
          >
            <ArrowRight className="h-3 w-3" />
            Pass
          </Button>
          <Button
            size="sm"
            variant={autoPassUntilNextTurn ? 'default' : 'outline'}
            onClick={() => setAutoPass(!autoPassUntilNextTurn)}
            className={`h-7 gap-1 px-2 text-xs ${autoPassUntilNextTurn ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}`}
            title="Auto-pass priority until your next turn"
          >
            <FastForward className="h-3 w-3" />
            Auto
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleConcede}
            disabled={gameState.isGameOver}
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
          >
            <Flag className="h-3 w-3" />
            Concede
          </Button>
        </div>
      </div>

      {/* Game log + card detail panel row */}
      <div className="flex gap-3">
        <GameLog events={events} currentPlayerId={currentPlayerId} className="h-32 lg:h-40 flex-1 min-w-0" />
        {inspectedCard && (
          <CardDetailPanel
            card={inspectedCard}
            onClose={() => setInspectedCard(null)}
            className="shrink-0"
          />
        )}
      </div>

      {/* Current player field */}
      {currentPlayer && (
        <PlayerField
          player={currentPlayer}
          battlefield={getCardsInZone(gameState, currentPlayerId, 'battlefield')}
          commandZone={getCardsInZone(gameState, currentPlayerId, 'command')}
          graveyardCount={getZoneCardCount(gameState, currentPlayerId, 'graveyard')}
          exileCount={getZoneCardCount(gameState, currentPlayerId, 'exile')}
          libraryCount={getZoneCardCount(gameState, currentPlayerId, 'library')}
          isActivePlayer={isMyTurn}
          isCurrentUser
          legalActions={hasPriority ? filteredLegalActions : []}
          combat={combat}
          onTapLand={handleTapLand}
          onUntapLand={handleUntapLand}
          onCastCommander={handleCastCommander}
          onCardClick={handleInspectCard}
          pendingManaChoice={pendingManaChoice}
          onManaColorPicked={handleManaColorPicked}
          onCancelManaChoice={() => setPendingManaChoice(null)}
        />
      )}

      {/* Hand (bottom) */}
      <div className="relative border-t border-border/20 pt-2">
        <div className="mb-1 flex items-center justify-between px-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Hand ({handCards.length})
          </span>
        </div>
        <Hand
          cards={handCards}
          legalActions={hasPriority ? filteredLegalActions : []}
          onPlayCard={handlePlayCard}
          onCardClick={handleInspectCard}
          isActive={hasPriority}
        />
      </div>
    </div>
  );
}
