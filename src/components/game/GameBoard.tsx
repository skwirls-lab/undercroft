'use client';

import { useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { PlayerField } from './PlayerField';
import { Hand } from './Hand';
import { CardView } from './CardView';
import { PhaseTracker } from './PhaseTracker';
import { CombatControls } from './CombatControls';
import { StackDisplay } from './StackDisplay';
import { SearchPicker } from './SearchPicker';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { getCardsInZone } from '@/lib/ZoneManager';
import { getZoneCardCount } from '@/lib/ZoneManager';
import type { CardInstance, GameAction, ManaColor } from '@/lib/gameTypes';
import { ArrowRight, Flag, Loader2, FastForward, X, Heart, BookOpen, Skull, Ban, Crown, Swords, Sparkles, TreePine, ChevronRight } from 'lucide-react';

interface GameBoardProps {
  currentPlayerId: string;
  className?: string;
  hideHand?: boolean;
  hideCommandZone?: boolean;
  hidePhaseTracker?: boolean;
  hideActionBar?: boolean;
  // Forge-style mana payment: lands the player can tap to pay for a spell
  manaPaymentSourceIds?: Set<string>;
  manaPaymentInfo?: { manaCost: string; spellName: string };
  onTapForManaPayment?: (cardInstanceId: string) => void;
  onCancelManaPayment?: () => void;
  // External control of expanded player overlay
  externalExpandedPlayerId?: string | null;
  onExpandedPlayerChange?: (playerId: string | null) => void;
  // Hand content to embed inside expanded battlefield for current player
  expandedHandContent?: React.ReactNode;
}

// Targeting mode: player selected a spell that requires a target
interface TargetingState {
  cardInstanceId: string;
  cardName: string;
  actions: GameAction[]; // All CAST_SPELL actions for this card (one per valid target)
  validTargetIds: Set<string>; // Quick lookup of valid target IDs
}

export function GameBoard({ currentPlayerId, className, hideHand, hideCommandZone, hidePhaseTracker, hideActionBar, manaPaymentSourceIds, manaPaymentInfo, onTapForManaPayment, onCancelManaPayment, externalExpandedPlayerId, onExpandedPlayerChange, expandedHandContent }: GameBoardProps) {
  const { gameState, legalActions, events, isProcessing, performAction, autoPassUntilNextTurn, setAutoPass, lockedTappedIds, forgeMode } = useGameStore();
  const { pendingChoice } = useForgeGameStore();

  console.log('[GameBoard] init:', { currentPlayerId, hasGameState: !!gameState });

  // Debug: show all zone card counts for current player
  if (currentPlayerId) {
    console.log('[GameBoard] adapter zone contents for', currentPlayerId, ':', 
      Array.from(gameState?.zones.keys() ?? []).filter(k => k.includes(currentPlayerId)).map((z: string) => ({
        key: z,
        cardsLen: gameState?.zones.get(z)?.cards.length ?? 0,
        cardIds: gameState?.zones.get(z)?.cards || [],
      })));
  }

  // Filter out UNTAP_PERMANENT for locked cards
  const filteredLegalActions = legalActions.filter(
    (a) => !(a.type === 'UNTAP_PERMANENT' && lockedTappedIds.has(a.payload.cardInstanceId as string))
  );

  // Targeting mode state
  const [targeting, setTargeting] = useState<TargetingState | null>(null);

  // Expanded battlefield overlay — which player's field is being viewed
  const [expandedPlayerIdInternal, setExpandedPlayerIdInternal] = useState<string | null>(null);
  // Sync with external control: external prop takes precedence
  const expandedPlayerId = externalExpandedPlayerId !== undefined ? externalExpandedPlayerId : expandedPlayerIdInternal;
  const setExpandedPlayerId = useCallback((id: string | null) => {
    setExpandedPlayerIdInternal(id);
    onExpandedPlayerChange?.(id);
  }, [onExpandedPlayerChange]);

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
    // Skip combat by passing priority when no creatures to attack/declare
    performAction({
      type: 'PASS_PRIORITY',
      playerId: currentPlayerId,
      payload: {},
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
  console.log("[GameBoard] player", currentPlayerId, "has", handCards.length, "cards in hand");
  console.log("[GameBoard] hand from adapter zones:", { player: currentPlayerId, zoneKey: `${currentPlayerId}:hand`, cardsCount: gameState.zones.get(`${currentPlayerId}:hand`)?.cards.length ?? "no-zone", cardInstancesCount: gameState.cardInstances.size });
  const combat = gameState.combat;
  const inCombatPhase = gameState.turn.phase === 'combat';
  const step = gameState.turn.step;
  // Only show native combat controls during interactive combat steps
  // IMPORTANT: Completely disable native combat controls when in Forge mode - Forge handles all combat UI
  const showCombatControls =
    !forgeMode && // Never show native combat controls in Forge mode
    hasPriority &&
    inCombatPhase &&
    !isProcessing &&
    !gameState.isGameOver &&
    ((isMyTurn && step === 'declare_attackers' && !combat) ||
     (!isMyTurn && step === 'declare_blockers' && combat?.phase === 'declaring_blockers'));

  return (
    <div className={cn('relative flex flex-col', className)}>
      {/* Warm ambient battlefield glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_40%,rgba(120,80,30,0.08),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_20%_80%,rgba(60,40,20,0.06),transparent)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_20%,rgba(80,60,30,0.05),transparent)]" />
      </div>

      {/* ─── TOP: phase tracker (when not hidden) ─── */}
      {!hidePhaseTracker && (
        <div className="shrink-0">
          <PhaseTracker
            turn={gameState.turn}
            activePlayerName={activePlayer?.name || 'Unknown'}
          />
        </div>
      )}

      {/* ─── STAT BOXES: all players ─── */}
      <div className="flex-1 min-h-0 flex flex-col gap-[clamp(6px,1.5vmin,1000px)] p-[clamp(6px,1.5vmin,1000px)] overflow-hidden">

        {/* Opponent stat boxes */}
        <div className={cn(
          'grid flex-1 min-h-0 gap-[clamp(6px,1.5vmin,1000px)]',
          opponents.length === 1 && 'grid-cols-1 grid-rows-1',
          opponents.length === 2 && 'grid-cols-2 grid-rows-1',
          opponents.length >= 3 && 'grid-cols-3 grid-rows-1'
        )}>
          {opponents.map((opp) => {
            const oppBf = getCardsInZone(gameState, opp.id, 'battlefield' as any)
              .map(id => gameState.cardInstances.get(id))
              .filter((c): c is CardInstance => !!c);
            const oppCmd = getCardsInZone(gameState, opp.id, 'command' as any)
              .map(id => gameState.cardInstances.get(id))
              .filter((c): c is CardInstance => !!c);
            const creatureCount = oppBf.filter(c => (c.cardData.typeLine || '').toLowerCase().includes('creature')).length;
            const landCount = oppBf.filter(c => (c.cardData.typeLine || '').toLowerCase().includes('land')).length;
            const otherCount = oppBf.length - creatureCount - landCount;
            const cmdOnField = oppCmd.length === 0; // empty command zone = commander is on battlefield
            const cmdArt = oppCmd[0]?.cardData.imageUris?.artCrop || oppCmd[0]?.cardData.cardFaces?.[0]?.imageUris?.artCrop;

            return (
              <button
                key={opp.id}
                onClick={() => setExpandedPlayerId(opp.id)}
                className={cn(
                  'rounded-[clamp(8px,1.5vmin,1000px)] border transition-all text-left',
                  'p-[clamp(8px,2vmin,1000px)] flex flex-col justify-center gap-[clamp(4px,1vmin,1000px)]',
                  'hover:bg-card/60 active:scale-[0.98]',
                  gameState.turn.activePlayerId === opp.id
                    ? 'border-gold/40 bg-gold/5 shadow-[0_0_12px_rgba(212,169,68,0.1)]'
                    : 'border-border/20 bg-card/30'
                )}
              >
                {/* Row 1: name + life + commander */}
                <div className="flex items-center" style={{ gap: 'clamp(4px,1.5vmin,1000px)' }}>
                  <span style={{ fontSize: 'clamp(11px,2.5vmin,1000px)' }} className="font-semibold text-foreground truncate flex-1">
                    {opp.name}
                  </span>
                  <div className="flex items-center" style={{ gap: 'clamp(3px,0.8vmin,1000px)' }}>
                    <Heart className="text-red-400 shrink-0" style={{ width: 'clamp(12px,3vmin,1000px)', height: 'clamp(12px,3vmin,1000px)' }} />
                    <span style={{ fontSize: 'clamp(12px,3.5vmin,1000px)' }} className="font-bold text-red-300">{opp.life}</span>
                  </div>
                  <Crown
                    className={cn('shrink-0', cmdOnField ? 'text-green-400' : 'text-muted-foreground/30')}
                    style={{ width: 'clamp(12px,2.5vmin,1000px)', height: 'clamp(12px,2.5vmin,1000px)' }}
                  />
                </div>
                {/* Row 2: zone counts */}
                <div className="flex items-center text-muted-foreground/60" style={{ gap: 'clamp(6px,2vmin,1000px)' }}>
                  <StatIcon icon={BookOpen} count={getZoneCardCount(gameState, opp.id, 'library')} label="Lib" />
                  <StatIcon icon={Skull} count={getZoneCardCount(gameState, opp.id, 'graveyard')} label="GY" />
                  <StatIcon icon={Ban} count={getZoneCardCount(gameState, opp.id, 'exile')} label="Ex" />
                  <span className="text-border/20" style={{ fontSize: 'clamp(8px,2vmin,1000px)' }}>|</span>
                  <StatIcon icon={Swords} count={creatureCount} label="Crt" />
                  <StatIcon icon={Sparkles} count={otherCount} label="Oth" />
                  <StatIcon icon={TreePine} count={landCount} label="Lnd" />
                  <ChevronRight className="ml-auto shrink-0 text-muted-foreground/20" style={{ width: 'clamp(12px,2.5vmin,1000px)', height: 'clamp(12px,2.5vmin,1000px)' }} />
                </div>
              </button>
            );
          })}
        </div>

        {/* Player stat box */}
        {currentPlayer && (
          <button
            onClick={() => setExpandedPlayerId(currentPlayerId)}
            className={cn(
              'rounded-[clamp(10px,2vmin,1000px)] border transition-all text-left flex-1 min-h-0',
              'p-[clamp(10px,2.5vmin,1000px)] flex flex-col justify-center gap-[clamp(6px,1.5vmin,1000px)]',
              'hover:bg-card/60 active:scale-[0.99]',
              hasPriority && !gameState.isGameOver
                ? 'border-gold/40 bg-gold/5 shadow-[0_0_16px_rgba(212,169,68,0.12)]'
                : 'border-border/20 bg-card/30'
            )}
          >
            {(() => {
              const myBf = getCardsInZone(gameState, currentPlayerId, 'battlefield' as any)
                .map(id => gameState.cardInstances.get(id))
                .filter((c): c is CardInstance => !!c);
              const myCmd = getCardsInZone(gameState, currentPlayerId, 'command' as any)
                .map(id => gameState.cardInstances.get(id))
                .filter((c): c is CardInstance => !!c);
              const myCreatures = myBf.filter(c => (c.cardData.typeLine || '').toLowerCase().includes('creature')).length;
              const myLands = myBf.filter(c => (c.cardData.typeLine || '').toLowerCase().includes('land')).length;
              const myOther = myBf.length - myCreatures - myLands;
              const myCmdOnField = myCmd.length === 0;

              return (
                <>
                  <div className="flex items-center" style={{ gap: 'clamp(6px,2vmin,1000px)' }}>
                    <span style={{ fontSize: 'clamp(13px,3.5vmin,1000px)' }} className="font-semibold text-foreground truncate flex-1">
                      {currentPlayer.name}
                    </span>
                    <div className="flex items-center" style={{ gap: 'clamp(4px,1vmin,1000px)' }}>
                      <Heart className="text-red-400 shrink-0" style={{ width: 'clamp(14px,4vmin,1000px)', height: 'clamp(14px,4vmin,1000px)' }} />
                      <span style={{ fontSize: 'clamp(14px,4.5vmin,1000px)' }} className="font-bold text-red-300">{currentPlayer.life}</span>
                    </div>
                    <Crown
                      className={cn('shrink-0', myCmdOnField ? 'text-green-400' : 'text-muted-foreground/30')}
                      style={{ width: 'clamp(14px,3.5vmin,1000px)', height: 'clamp(14px,3.5vmin,1000px)' }}
                    />
                  </div>
                  <div className="flex items-center text-muted-foreground/60" style={{ gap: 'clamp(8px,2.5vmin,1000px)' }}>
                    <StatIcon icon={BookOpen} count={getZoneCardCount(gameState, currentPlayerId, 'library')} label="Lib" size="lg" />
                    <StatIcon icon={Skull} count={getZoneCardCount(gameState, currentPlayerId, 'graveyard')} label="GY" size="lg" />
                    <StatIcon icon={Ban} count={getZoneCardCount(gameState, currentPlayerId, 'exile')} label="Ex" size="lg" />
                    <span className="text-border/20" style={{ fontSize: 'clamp(10px,3vmin,1000px)' }}>|</span>
                    <StatIcon icon={Swords} count={myCreatures} label="Crt" size="lg" />
                    <StatIcon icon={Sparkles} count={myOther} label="Oth" size="lg" />
                    <StatIcon icon={TreePine} count={myLands} label="Lnd" size="lg" />
                    <ChevronRight className="ml-auto shrink-0 text-muted-foreground/20" style={{ width: 'clamp(14px,3.5vmin,1000px)', height: 'clamp(14px,3.5vmin,1000px)' }} />
                  </div>
                </>
              );
            })()}
          </button>
        )}
      </div>{/* end STAT BOXES */}

      {/* ─── INLINE OVERLAYS: stack, targeting, mana, combat, mulligan ─── */}
      <div className="shrink-0 z-20 flex flex-col gap-1 px-[clamp(6px,1.5vmin,20px)]">
        {/* Mulligan overlay is rendered as a full-screen modal below */}
        <AnimatePresence>
          {gameState.stack.length > 0 && <StackDisplay stack={gameState.stack} />}
        </AnimatePresence>
        <AnimatePresence>
          {targeting && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center rounded-lg border border-cyan-500/30 bg-cyan-950/40" style={{ gap: 'clamp(6px,1.2vmin,1000px)', padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)' }}>
              <span className="relative" style={{ width: 'clamp(8px,1.2vmin,1000px)', height: 'clamp(8px,1.2vmin,1000px)' }}><span className="absolute inset-0 animate-ping rounded-full bg-cyan-400 opacity-75" /><span className="absolute inset-0 rounded-full bg-cyan-400" /></span>
              <span className="text-cyan-200" style={{ fontSize: 'clamp(11px,2vmin,1000px)' }}>Target: <strong>{targeting.cardName}</strong></span>
              <Button size="sm" variant="ghost" onClick={cancelTargeting} className="ml-auto p-0 text-cyan-400" style={{ width: 'clamp(20px,3vh,1000px)', height: 'clamp(20px,3vh,1000px)' }}><X style={{ width: 'clamp(12px,1.8vmin,1000px)', height: 'clamp(12px,1.8vmin,1000px)' }} /></Button>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {manaPaymentInfo && onCancelManaPayment && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center rounded-lg border border-emerald-500/30 bg-emerald-950/40" style={{ gap: 'clamp(6px,1.2vmin,1000px)', padding: 'clamp(4px,0.8vmin,1000px) clamp(8px,1.5vmin,1000px)' }}>
              <span className="text-emerald-200" style={{ fontSize: 'clamp(11px,2vmin,1000px)' }}>Pay <strong className="font-mono">{manaPaymentInfo.manaCost}</strong> for <strong>{manaPaymentInfo.spellName}</strong></span>
              <Button size="sm" variant="ghost" onClick={onCancelManaPayment} className="ml-auto text-emerald-400" style={{ height: 'clamp(20px,3vh,1000px)', padding: '0 clamp(4px,0.6vmin,1000px)', fontSize: 'clamp(10px,1.8vmin,1000px)' }}><X style={{ width: 'clamp(12px,1.8vmin,1000px)', height: 'clamp(12px,1.8vmin,1000px)' }} /> Cancel</Button>
            </motion.div>
          )}
        </AnimatePresence>
        {showCombatControls && (
          <CombatControls gameState={gameState} currentPlayerId={currentPlayerId} legalActions={legalActions}
            onDeclareAttackers={handleDeclareAttackers} onDeclareBlockers={handleDeclareBlockers} onSkipCombat={handleSkipCombat} />
        )}
      </div>

      {/* Action bar — hidden when rendered externally (e.g. in page header) */}
      {!hideActionBar && (
        <div className={cn(
          'shrink-0 flex items-center gap-3 rounded-xl border px-4 py-2 mx-auto my-1 z-20',
          hasPriority && !gameState.isGameOver ? 'border-gold/40 bg-gold/5' : 'border-border/30 bg-card/60'
        )}>
          <span className={cn('text-xs font-medium', hasPriority ? 'text-gold' : 'text-muted-foreground')}>
            {hasPriority ? (isMyTurn ? 'Your Turn' : 'Priority') : `${gameState.players.find(p => p.id === gameState.priority.playerWithPriority)?.name}'s turn`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" onClick={handlePassPriority} disabled={!hasPriority || gameState.isGameOver} className="h-7 gap-1 px-3 text-xs"><ArrowRight className="h-3 w-3" />Pass</Button>
            <Button size="sm" variant={autoPassUntilNextTurn ? 'default' : 'outline'} onClick={() => setAutoPass(!autoPassUntilNextTurn)} className={cn('h-7 px-2 text-xs', autoPassUntilNextTurn && 'bg-amber-600 text-white')}><FastForward className="h-3 w-3" /></Button>
          </div>
        </div>
      )}

      {/* Hand — rendered here only if forge page is NOT handling it externally */}
      {!hideHand && (
        <div className="shrink-0 border-t border-border/20 bg-background/90 px-2 pt-1 pb-1">
          <Hand
            cards={handCards.map(id => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c)}
            legalActions={hasPriority ? filteredLegalActions : []}
            onPlayCard={handlePlayCard}
            isActive={hasPriority}
          />
        </div>
      )}

      {/* ─── MULLIGAN OVERLAY ─── */}
      <AnimatePresence>
        {gameState.mulliganPhase && hasPriority && (
          <motion.div
            key="mulligan-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md"
          >
            {/* Header */}
            <div className="flex flex-col items-center" style={{ gap: 'clamp(4px,0.8vmin,1000px)', marginBottom: 'clamp(12px,2.5vmin,1000px)' }}>
              <span className="font-black text-primary tracking-wide" style={{ fontSize: 'clamp(20px,4vmin,1000px)' }}>
                {currentPlayer && currentPlayer.mulliganCount > 0 ? `Mulligan #${currentPlayer.mulliganCount}` : 'Opening Hand'}
              </span>
              <span className="text-muted-foreground" style={{ fontSize: 'clamp(12px,2vmin,1000px)' }}>
                {7 - (currentPlayer?.mulliganCount || 0)} cards — Keep this hand or mulligan?
              </span>
            </div>

            {/* Card grid */}
            <div className="flex flex-wrap items-center justify-center" style={{ gap: 'clamp(8px,1.5vmin,1000px)', padding: '0 clamp(16px,3vmin,1000px)', marginBottom: 'clamp(16px,3vmin,1000px)' }}>
              {handCards.map(id => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c).map((card) => (
                <motion.div
                  key={card.instanceId}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <CardView card={card} mode="art" interactive={false} />
                </motion.div>
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center" style={{ gap: 'clamp(8px,1.5vmin,1000px)' }}>
              <Button
                variant="default"
                style={{ height: 'clamp(36px,5.5vmin,1000px)', padding: '0 clamp(16px,3vmin,1000px)', fontSize: 'clamp(14px,2.5vmin,1000px)', borderRadius: 'clamp(8px,1.2vmin,1000px)' }}
                onClick={() => { const a = legalActions.find(a => a.type === 'KEEP_HAND'); if (a) performAction(a); }}
              >
                Keep ({7 - (currentPlayer?.mulliganCount || 0)})
              </Button>
              {legalActions.some(a => a.type === 'MULLIGAN') && (
                <Button
                  variant="outline"
                  style={{ height: 'clamp(36px,5.5vmin,1000px)', padding: '0 clamp(16px,3vmin,1000px)', fontSize: 'clamp(14px,2.5vmin,1000px)', borderRadius: 'clamp(8px,1.2vmin,1000px)' }}
                  onClick={() => { const a = legalActions.find(a => a.type === 'MULLIGAN'); if (a) performAction(a); }}
                >
                  Mulligan
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── EXPANDED BATTLEFIELD OVERLAY ─── */}
      <AnimatePresence>
        {expandedPlayerId && (() => {
          const ep = gameState.players.find(p => p.id === expandedPlayerId);
          if (!ep) return null;
          const isMe = expandedPlayerId === currentPlayerId;
          return (
            <motion.div
              key={expandedPlayerId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 flex flex-col bg-background/95 backdrop-blur-md"
            >
              {/* Overlay header */}
              <div className="flex items-center justify-between border-b border-border/30 shrink-0" style={{ padding: 'clamp(6px,1vmin,1000px) clamp(10px,2vmin,1000px)' }}>
                <div className="flex items-center" style={{ gap: 'clamp(6px,1.2vmin,1000px)' }}>
                  <span className="font-semibold" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)' }}>{ep.name}</span>
                  <span className="text-red-400 flex items-center" style={{ fontSize: 'clamp(11px,2vmin,1000px)', gap: 'clamp(3px,0.5vmin,1000px)' }}><Heart style={{ width: 'clamp(12px,2vmin,1000px)', height: 'clamp(12px,2vmin,1000px)' }} /> {ep.life}</span>
                </div>
                <button onClick={() => setExpandedPlayerId(null)} className="rounded-lg bg-muted/30 text-muted-foreground hover:bg-muted/50" style={{ padding: 'clamp(4px,0.8vmin,1000px)' }}>
                  <X style={{ width: 'clamp(18px,3vmin,1000px)', height: 'clamp(18px,3vmin,1000px)' }} />
                </button>
              </div>
              {/* Full battlefield — scrollable */}
              <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: 'clamp(4px,0.8vmin,1000px)' }}>
                <PlayerField
                  player={ep}
                  battlefield={getCardsInZone(gameState, expandedPlayerId, 'battlefield' as any).map(id => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c)}
                  commandZone={getCardsInZone(gameState, expandedPlayerId, 'command' as any).map(id => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c).filter(c => { const tl = (c.cardData.typeLine || '').toLowerCase(); return tl.includes('legendary') || tl.includes('planeswalker'); })}
                  graveyardCount={getZoneCardCount(gameState, expandedPlayerId, 'graveyard')}
                  exileCount={getZoneCardCount(gameState, expandedPlayerId, 'exile')}
                  libraryCount={getZoneCardCount(gameState, expandedPlayerId, 'library')}
                  isActivePlayer={gameState.turn.activePlayerId === expandedPlayerId}
                  isCurrentUser={isMe}
                  legalActions={isMe && hasPriority ? filteredLegalActions : []}
                  combat={combat}
                  onTapLand={isMe ? handleTapLand : () => {}}
                  onUntapLand={isMe ? handleUntapLand : undefined}
                  onCastCommander={isMe ? handleCastCommander : undefined}
                  onEquipClick={isMe ? handleEquipClick : undefined}
                  onActivateAbility={isMe ? handleActivateAbility : undefined}
                  pendingManaChoice={isMe ? pendingManaChoice : undefined}
                  onManaColorPicked={isMe ? handleManaColorPicked : undefined}
                  manaPaymentSourceIds={isMe ? manaPaymentSourceIds : undefined}
                  onTapForManaPayment={isMe ? onTapForManaPayment : undefined}
                  validTargetIds={targeting?.validTargetIds}
                  onSelectTarget={targeting ? handleSelectTarget : undefined}
                  forceArtMode
                />
              </div>
              {/* Hand section pinned at bottom — not inside scroll container */}
              {isMe && expandedHandContent && (
                <div className="shrink-0 border-t border-border/30 overflow-y-auto" style={{ padding: 'clamp(6px,1vmin,1000px) clamp(8px,1.5vmin,1000px)', maxHeight: '35vh' }}>
                  {expandedHandContent}
                </div>
              )}
            </motion.div>
          );
        })()}
      </AnimatePresence>

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
              className="flex flex-col items-center rounded-2xl border border-gold/40 bg-card/95 shadow-2xl"
              style={{ gap: 'clamp(12px,2.5vmin,1000px)', padding: 'clamp(20px,4vmin,1000px) clamp(30px,6vmin,1000px)' }}
            >
              {gameState.winner === currentPlayerId ? (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.8 }}
                    style={{ fontSize: 'clamp(36px,8vmin,1000px)' }}
                  >
                    👑
                  </motion.div>
                  <h2 className="font-black tracking-tight text-gold" style={{ fontSize: 'clamp(18px,4vmin,1000px)' }}>Victory!</h2>
                  <p className="text-muted-foreground" style={{ fontSize: 'clamp(12px,2vmin,1000px)' }}>You have won the game</p>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.8 }}
                    style={{ fontSize: 'clamp(36px,8vmin,1000px)' }}
                  >
                    💀
                  </motion.div>
                  <h2 className="font-black tracking-tight text-destructive" style={{ fontSize: 'clamp(18px,4vmin,1000px)' }}>Defeat</h2>
                  <p className="text-muted-foreground" style={{ fontSize: 'clamp(12px,2vmin,1000px)' }}>
                    {gameState.winner
                      ? `${gameState.players.find((p) => p.id === gameState.winner)?.name} wins`
                      : 'The game ended in a draw'}
                  </p>
                </>
              )}

              {/* Game stats */}
              <div className="flex text-muted-foreground" style={{ gap: 'clamp(16px,4vmin,1000px)', marginTop: 'clamp(6px,1vmin,1000px)', fontSize: 'clamp(11px,1.8vmin,1000px)' }}>
                <div className="flex flex-col items-center" style={{ gap: 'clamp(2px,0.4vmin,1000px)' }}>
                  <span className="font-bold text-foreground" style={{ fontSize: 'clamp(16px,3vmin,1000px)' }}>{gameState.turn.turnNumber}</span>
                  <span>Turns</span>
                </div>
                <div className="flex flex-col items-center" style={{ gap: 'clamp(2px,0.4vmin,1000px)' }}>
                  <span className="font-bold text-foreground" style={{ fontSize: 'clamp(16px,3vmin,1000px)' }}>{currentPlayer?.life ?? 0}</span>
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
                className="flex flex-col items-center rounded-xl border border-amber-500/30 bg-card/95 shadow-2xl"
                style={{ gap: 'clamp(12px,2.5vmin,1000px)', padding: 'clamp(16px,3vmin,1000px) clamp(24px,5vmin,1000px)' }}
              >
                <h3 className="font-semibold text-foreground" style={{ fontSize: 'clamp(13px,2.5vmin,1000px)' }}>{gameState.pendingChoice.prompt}</h3>
                <div className="flex" style={{ gap: 'clamp(8px,1.5vmin,1000px)' }}>
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
                    style={{ height: 'clamp(28px,4vh,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
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
                    style={{ height: 'clamp(28px,4vh,1000px)', padding: '0 clamp(12px,2vmin,1000px)', fontSize: 'clamp(11px,2vmin,1000px)' }}
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

/** Compact icon + count for stat boxes */
function StatIcon({ icon: Icon, count, label, size = 'sm' }: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  count: number;
  label: string;
  size?: 'sm' | 'lg';
}) {
  const iconSize = size === 'lg' ? 'clamp(14px,3.5vmin,1000px)' : 'clamp(11px,2.5vmin,1000px)';
  const textSize = size === 'lg' ? 'text-[clamp(12px,3vmin,1000px)]' : 'text-[clamp(10px,2.2vmin,1000px)]';
  return (
    <div className="flex items-center" style={{ gap: 'clamp(2px,0.5vmin,1000px)' }} title={label}>
      <Icon style={{ width: iconSize, height: iconSize }} className="shrink-0" />
      <span className={cn(textSize, 'font-medium tabular-nums')}>{count}</span>
    </div>
  );
}
