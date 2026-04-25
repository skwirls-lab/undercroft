'use client';

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PlayerField } from './PlayerField';
import { Hand } from './Hand';
import { PhaseTracker } from './PhaseTracker';
import { CombatControls } from './CombatControls';
import { StackDisplay } from './StackDisplay';
import { SearchPicker } from './SearchPicker';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { getCardsInZone } from '@/engine/GameState';
import { getZoneCardCount } from '@/engine/ZoneManager';
import type { CardInstance, GameAction, ManaColor } from '@/engine/types';
import { ArrowRight, Flag, Loader2, FastForward, X } from 'lucide-react';

interface GameBoardProps {
  currentPlayerId: string;
  className?: string;
}

// Targeting mode: player selected a spell that requires a target
interface TargetingState {
  cardInstanceId: string;
  cardName: string;
  actions: GameAction[]; // All CAST_SPELL actions for this card (one per valid target)
  validTargetIds: Set<string>; // Quick lookup of valid target IDs
}

export function GameBoard({ currentPlayerId, className }: GameBoardProps) {
  const { gameState, legalActions, events, isProcessing, performAction, autoPassUntilNextTurn, setAutoPass, lockedTappedIds } = useGameStore();

  // Filter out UNTAP_PERMANENT for locked cards
  const filteredLegalActions = legalActions.filter(
    (a) => !(a.type === 'UNTAP_PERMANENT' && lockedTappedIds.has(a.payload.cardInstanceId as string))
  );

  // Targeting mode state
  const [targeting, setTargeting] = useState<TargetingState | null>(null);

  const handlePlayCard = useCallback(
    (card: CardInstance) => {
      if (!gameState) return;

      // Find all cast/play actions for this card
      const cardActions = legalActions.filter(
        (a) =>
          (a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL') &&
          a.payload.cardInstanceId === card.instanceId
      );

      console.log('[GameBoard] handlePlayCard', {
        cardId: card.instanceId,
        cardName: card.cardData.name,
        totalLegalActions: legalActions.length,
        matchingActions: cardActions.length,
        allActionCardIds: legalActions.filter(a => a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL').map(a => a.payload.cardInstanceId),
      });

      if (cardActions.length === 0) return;

      // If there's a PLAY_LAND action, play it immediately
      const landAction = cardActions.find((a) => a.type === 'PLAY_LAND');
      if (landAction) {
        performAction(landAction);
        return;
      }

      // Check if this is a targeted spell (multiple actions for same card = different targets)
      const hasTargets = cardActions.some(
        (a) => a.payload.targets && (a.payload.targets as string[]).length > 0
      );

      if (!hasTargets) {
        // Non-targeted spell — cast immediately
        performAction(cardActions[0]);
      } else {
        // Targeted spell — enter targeting mode
        const validTargetIds = new Set(
          cardActions.map((a) => a.payload.targetId as string).filter(Boolean)
        );
        setTargeting({
          cardInstanceId: card.instanceId,
          cardName: card.cardData.name,
          actions: cardActions,
          validTargetIds,
        });
      }
    },
    [gameState, legalActions, performAction]
  );

  // Handle target selection during targeting mode
  const handleSelectTarget = useCallback(
    (targetId: string) => {
      if (!targeting) return;
      const action = targeting.actions.find(
        (a) => a.payload.targetId === targetId
      );
      if (action) {
        performAction(action);
        setTargeting(null);
      }
    },
    [targeting, performAction]
  );

  const cancelTargeting = useCallback(() => setTargeting(null), []);

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

  // Equipment equip handling
  const handleEquipClick = useCallback(
    (card: CardInstance) => {
      const equipActions = filteredLegalActions.filter(
        (a) =>
          a.type === 'ACTIVATE_ABILITY' &&
          a.payload.ability === 'equip' &&
          a.payload.cardInstanceId === card.instanceId
      );
      if (equipActions.length === 0) return;
      // Enter targeting mode for equip (reuse targeting state)
      const validTargetIds = new Set(
        equipActions.map((a) => a.payload.targetId as string).filter(Boolean)
      );
      setTargeting({
        cardInstanceId: card.instanceId,
        cardName: `Equip ${card.cardData.name}`,
        actions: equipActions,
        validTargetIds,
      });
    },
    [filteredLegalActions]
  );

  // Forge-powered activated ability handling
  const handleActivateAbility = useCallback(
    (card: CardInstance) => {
      const abilityActions = filteredLegalActions.filter(
        (a) =>
          a.type === 'ACTIVATE_ABILITY' &&
          a.payload.ability === 'forge_activated' &&
          a.payload.cardInstanceId === card.instanceId
      );
      if (abilityActions.length === 0) return;

      // Check if any ability needs a target
      const hasTarget = abilityActions.some((a) => a.payload.targetId);
      if (hasTarget) {
        // Enter targeting mode
        const validTargetIds = new Set(
          abilityActions.map((a) => a.payload.targetId as string).filter(Boolean)
        );
        setTargeting({
          cardInstanceId: card.instanceId,
          cardName: `Activate ${card.cardData.name}`,
          actions: abilityActions,
          validTargetIds,
        });
      } else {
        // Non-targeted ability — just perform the first one
        performAction(abilityActions[0]);
      }
    },
    [filteredLegalActions, performAction]
  );

  // Handle pending choice resolution (search library, etc.)
  const handleResolveChoice = useCallback(
    (chosenCardIds: string[]) => {
      if (!gameState?.pendingChoice) return;
      performAction({
        type: 'RESOLVE_CHOICE',
        playerId: currentPlayerId,
        payload: { chosenCardIds },
        timestamp: Date.now(),
      });
    },
    [gameState?.pendingChoice, currentPlayerId, performAction]
  );

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
    <div className={cn('relative flex flex-col gap-2.5', className)}>
      {/* Warm ambient battlefield glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_40%,rgba(120,80,30,0.08),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_20%_80%,rgba(60,40,20,0.06),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_20%,rgba(80,60,30,0.05),transparent)]" />
      </div>

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
            validTargetIds={targeting?.validTargetIds}
            onSelectTarget={targeting ? handleSelectTarget : undefined}
          />
        ))}
      </div>

      {/* Mulligan phase UI */}
      <AnimatePresence>
      {gameState.mulliganPhase && hasPriority && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="flex flex-col items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-6 py-4 shadow-lg"
        >
          <span className="text-sm font-semibold text-primary">
            Mulligan Phase
          </span>
          <span className="text-xs text-muted-foreground">
            {currentPlayer && currentPlayer.mulliganCount > 0
              ? `Mulligan #${currentPlayer.mulliganCount} — you will put ${currentPlayer.mulliganCount} card${currentPlayer.mulliganCount > 1 ? 's' : ''} on the bottom after keeping`
              : 'Look at your opening hand. Keep or mulligan?'}
          </span>
          <div className="flex gap-3">
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                const action = legalActions.find((a) => a.type === 'KEEP_HAND');
                if (action) performAction(action);
              }}
              className="px-4"
            >
              Keep Hand ({7 - (currentPlayer?.mulliganCount || 0)} cards)
            </Button>
            {legalActions.some((a) => a.type === 'MULLIGAN') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const action = legalActions.find((a) => a.type === 'MULLIGAN');
                  if (action) performAction(action);
                }}
                className="px-4"
              >
                Mulligan
              </Button>
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Stack display */}
      <AnimatePresence>
        {gameState.stack.length > 0 && (
          <StackDisplay stack={gameState.stack} />
        )}
      </AnimatePresence>

      {/* Targeting overlay banner */}
      <AnimatePresence>
        {targeting && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="flex items-center gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/40 backdrop-blur-sm px-4 py-2.5 shadow-[0_0_16px_rgba(6,182,212,0.1)]"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
            </span>
            <span className="text-sm text-cyan-200">
              Choose a target for <strong className="text-cyan-100">{targeting.cardName}</strong>
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={cancelTargeting}
              className="ml-auto h-7 w-7 p-0 text-cyan-400 hover:text-cyan-200"
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Action bar — prominent, contextual */}
      <div className={cn(
        'flex items-center gap-4 rounded-2xl border px-5 py-3 w-full max-w-3xl self-center mx-auto relative z-20 my-2 transition-all duration-300',
        hasPriority && !gameState.isGameOver
          ? 'border-gold/40 bg-gold/5 shadow-[0_0_24px_rgba(212,169,68,0.15)]'
          : 'border-border/30 bg-card/60 backdrop-blur-xl shadow-lg'
      )}>
        {/* Status indicator */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-gold shrink-0" />}
          {hasPriority && !isProcessing && !gameState.isGameOver && (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: 'oklch(0.78 0.14 75)' }} />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: 'oklch(0.78 0.14 75)' }} />
            </span>
          )}
          <span className={cn(
            'text-sm font-medium',
            gameState.isGameOver ? 'text-foreground' :
            hasPriority ? 'text-gold' : 'text-muted-foreground'
          )}>
            {gameState.isGameOver
              ? (gameState.winner
                  ? `${gameState.players.find((p) => p.id === gameState.winner)?.name} wins!`
                  : 'Draw')
              : isProcessing
                ? 'AI is thinking...'
                : hasPriority
                  ? (isMyTurn
                      ? inCombatPhase ? 'Combat Phase' : 'Your Turn'
                      : 'You have priority')
                  : `${gameState.players.find((p) => p.id === gameState.priority.playerWithPriority)?.name}'s turn`}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          {/* Primary action: Pass */}
          <Button
            size="sm"
            onClick={handlePassPriority}
            disabled={!hasPriority || gameState.isGameOver || showCombatControls}
            className={cn(
              'h-8 gap-1.5 px-4 text-xs font-semibold transition-all',
              hasPriority && !gameState.isGameOver && !showCombatControls
                ? 'bg-gold text-gold-foreground hover:bg-gold/90 shadow-[0_0_12px_rgba(212,169,68,0.3)]'
                : ''
            )}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Pass
          </Button>
          {/* Auto-pass */}
          <Button
            size="sm"
            variant={autoPassUntilNextTurn ? 'default' : 'outline'}
            onClick={() => setAutoPass(!autoPassUntilNextTurn)}
            className={cn(
              'h-8 gap-1 px-3 text-xs',
              autoPassUntilNextTurn && 'bg-amber-600 hover:bg-amber-700 text-white'
            )}
            title="Auto-pass priority until your next turn"
          >
            <FastForward className="h-3.5 w-3.5" />
            Auto
          </Button>
          {/* Concede */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleConcede}
            disabled={gameState.isGameOver}
            className="h-8 gap-1 px-3 text-xs text-destructive/70 hover:text-destructive"
          >
            <Flag className="h-3.5 w-3.5" />
          </Button>
        </div>
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
          onEquipClick={handleEquipClick}
          onActivateAbility={handleActivateAbility}
          pendingManaChoice={pendingManaChoice}
          onManaColorPicked={handleManaColorPicked}
          onCancelManaChoice={() => setPendingManaChoice(null)}
          validTargetIds={targeting?.validTargetIds}
          onSelectTarget={targeting ? handleSelectTarget : undefined}
        />
      )}

      {/* Hand (bottom) */}
      <div className="relative border-t border-border/15 pt-3">
        <div className="mb-1.5 flex items-center justify-between px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
            Hand · {handCards.length}
          </span>
        </div>
        <Hand
          cards={handCards}
          legalActions={hasPriority ? filteredLegalActions : []}
          onPlayCard={handlePlayCard}
          isActive={hasPriority}
        />
      </div>

      {/* Game over overlay */}
      <AnimatePresence>
        {gameState.isGameOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-3xl"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25, delay: 0.5 }}
              className="flex flex-col items-center gap-4 rounded-2xl border border-gold/40 bg-card/95 px-10 py-8 shadow-2xl"
            >
              {gameState.winner === currentPlayerId ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.8 }}
                    className="text-5xl"
                  >
                    👑
                  </motion.div>
                  <h2 className="text-2xl font-black tracking-tight text-gold">Victory!</h2>
                  <p className="text-sm text-muted-foreground">You have won the game</p>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.8 }}
                    className="text-5xl"
                  >
                    💀
                  </motion.div>
                  <h2 className="text-2xl font-black tracking-tight text-destructive">Defeat</h2>
                  <p className="text-sm text-muted-foreground">
                    {gameState.winner
                      ? `${gameState.players.find((p) => p.id === gameState.winner)?.name} wins`
                      : 'The game ended in a draw'}
                  </p>
                </>
              )}

              {/* Game stats */}
              <div className="flex gap-6 mt-2 text-xs text-muted-foreground">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg font-bold text-foreground">{gameState.turn.turnNumber}</span>
                  <span>Turns</span>
                </div>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg font-bold text-foreground">{currentPlayer?.life ?? 0}</span>
                  <span>Life</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Confirm ability dialog (sacrifice confirmation) */}
      <AnimatePresence>
        {gameState.pendingChoice &&
          gameState.pendingChoice.type === 'confirm_ability' &&
          gameState.pendingChoice.playerId === currentPlayerId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="flex flex-col items-center gap-4 rounded-xl border border-amber-500/30 bg-card/95 px-8 py-6 shadow-2xl"
              >
                <h3 className="text-sm font-semibold text-foreground">{gameState.pendingChoice.prompt}</h3>
                <div className="flex gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => performAction({
                      type: 'RESOLVE_CHOICE',
                      playerId: currentPlayerId,
                      payload: { confirmed: false },
                      timestamp: Date.now(),
                    })}
                    className="border-border/30 text-muted-foreground hover:bg-muted/20"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => performAction({
                      type: 'RESOLVE_CHOICE',
                      playerId: currentPlayerId,
                      payload: { confirmed: true },
                      timestamp: Date.now(),
                    })}
                    className="bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Sacrifice
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
      </AnimatePresence>

      {/* Search Picker overlay for library search choices */}
      <AnimatePresence>
        {gameState.pendingChoice &&
          gameState.pendingChoice.type === 'search_library' &&
          gameState.pendingChoice.playerId === currentPlayerId && (
            <SearchPicker
              pendingChoice={gameState.pendingChoice}
              cards={
                (gameState.pendingChoice.cardInstanceIds || [])
                  .map(id => gameState.cardInstances.get(id))
                  .filter((c): c is CardInstance => !!c)
              }
              onConfirm={handleResolveChoice}
            />
          )}
      </AnimatePresence>
    </div>
  );
}
