'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SeatPlaque, type SeatStats } from './SeatPlaque';
import { BoardView } from './BoardView';
import { Hand } from './Hand';
import { CardView } from './CardView';
import { PhaseTracker } from './PhaseTracker';
import { CombatControls } from './CombatControls';
import { StackDisplay } from './StackDisplay';
import { SearchPicker } from './SearchPicker';
import { Button } from '@/components/ui/button';
import { Keystone } from '@/components/brand/Keystone';
import { useGameStore } from '@/store/gameStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { getCardsInZone, getZoneCardCount } from '@/lib/ZoneManager';
import type { CardInstance, GameAction, GameState, ManaColor } from '@/lib/gameTypes';
import { ArrowRight, FastForward, X } from 'lucide-react';

interface GameBoardProps {
  currentPlayerId: string;
  className?: string;
  hideHand?: boolean;
  hidePhaseTracker?: boolean;
  hideActionBar?: boolean;
  // Forge-style mana payment: lands the player can tap to pay for a spell
  manaPaymentSourceIds?: Set<string>;
  manaPaymentInfo?: { manaCost: string; spellName: string };
  onTapForManaPayment?: (cardInstanceId: string) => void;
  onCancelManaPayment?: () => void;
  // External control of the expanded board
  externalExpandedPlayerId?: string | null;
  onExpandedPlayerChange?: (playerId: string | null) => void;
}

// Targeting mode: player selected a spell that requires a target
interface TargetingState {
  cardInstanceId: string;
  cardName: string;
  actions: GameAction[]; // All CAST_SPELL actions for this card (one per valid target)
  validTargetIds: Set<string>; // Quick lookup of valid target IDs
}

/** Everything a seat plaque shows, derived once per render. */
function seatStats(gameState: GameState, playerId: string): SeatStats {
  const inst = gameState.cardInstances;
  const bf = getCardsInZone(gameState, playerId, 'battlefield').map((id) => inst.get(id)).filter((c): c is CardInstance => !!c);
  const cmd = getCardsInZone(gameState, playerId, 'command').map((id) => inst.get(id)).filter((c): c is CardInstance => !!c);
  const lower = (c: CardInstance) => (c.cardData.typeLine || '').toLowerCase();
  const creatures = bf.filter((c) => lower(c).includes('creature')).length;
  const lands = bf.filter((c) => lower(c).includes('land')).length;
  const commander = cmd.find((c) => lower(c).includes('legendary') || lower(c).includes('planeswalker')) ?? cmd[0]
    ?? bf.find((c) => lower(c).includes('legendary') && lower(c).includes('creature'));
  return {
    library: getZoneCardCount(gameState, playerId, 'library'),
    graveyard: getZoneCardCount(gameState, playerId, 'graveyard'),
    exile: getZoneCardCount(gameState, playerId, 'exile'),
    handSize: getZoneCardCount(gameState, playerId, 'hand'),
    creatures,
    lands,
    other: bf.length - creatures - lands,
    commanderOnField: cmd.length === 0,
    commanderArt: commander?.cardData.imageUris?.artCrop || commander?.cardData.cardFaces?.[0]?.imageUris?.artCrop,
    commanderName: commander?.cardData.name,
  };
}

export function GameBoard({
  currentPlayerId, className, hideHand, hidePhaseTracker, hideActionBar,
  manaPaymentSourceIds, manaPaymentInfo, onTapForManaPayment, onCancelManaPayment,
  externalExpandedPlayerId, onExpandedPlayerChange,
}: GameBoardProps) {
  const { gameState, legalActions, isProcessing, performAction, autoPassUntilNextTurn, setAutoPass, lockedTappedIds, forgeMode } = useGameStore();
  const { setPendingAbilitySelection } = useForgeGameStore();
  const narrow = useMediaQuery('(max-width: 640px)');

  // Filter out UNTAP_PERMANENT for locked cards
  const filteredLegalActions = legalActions.filter(
    (a) => !(a.type === 'UNTAP_PERMANENT' && lockedTappedIds.has(a.payload.cardInstanceId as string))
  );

  // Targeting mode state
  const [targeting, setTargeting] = useState<TargetingState | null>(null);

  // Expanded board — which player's field is being viewed
  const [expandedPlayerIdInternal, setExpandedPlayerIdInternal] = useState<string | null>(null);
  const expandedPlayerId = externalExpandedPlayerId !== undefined ? externalExpandedPlayerId : expandedPlayerIdInternal;
  const setExpandedPlayerId = useCallback((id: string | null) => {
    setExpandedPlayerIdInternal(id);
    onExpandedPlayerChange?.(id);
  }, [onExpandedPlayerChange]);

  const handlePlayCard = useCallback(
    (card: CardInstance) => {
      if (!gameState) return;
      const cardActions = legalActions.filter(
        (a) => (a.type === 'PLAY_LAND' || a.type === 'CAST_SPELL') && a.payload.cardInstanceId === card.instanceId
      );
      if (cardActions.length === 0) return;

      const landAction = cardActions.find((a) => a.type === 'PLAY_LAND');
      if (landAction) { performAction(landAction); return; }

      const hasTargets = cardActions.some((a) => a.payload.targets && (a.payload.targets as string[]).length > 0);
      if (!hasTargets) {
        // Several legal plays for one card means several modes (kicker, Adventure, MDFC,
        // flashback, cycling, split halves). Casting cardActions[0] made the rest unreachable.
        if (cardActions.length > 1) {
          setPendingAbilitySelection({ cardInstanceId: card.instanceId, cardName: card.cardData.name, actions: cardActions });
          return;
        }
        performAction(cardActions[0]);
      } else {
        const validTargetIds = new Set(cardActions.map((a) => a.payload.targetId as string).filter(Boolean));
        setTargeting({ cardInstanceId: card.instanceId, cardName: card.cardData.name, actions: cardActions, validTargetIds });
      }
    },
    [gameState, legalActions, performAction, setPendingAbilitySelection]
  );

  const handleSelectTarget = useCallback(
    (targetId: string) => {
      if (!targeting) return;
      const action = targeting.actions.find((a) => a.payload.targetId === targetId);
      if (action) { performAction(action); setTargeting(null); }
    },
    [targeting, performAction]
  );
  const cancelTargeting = useCallback(() => setTargeting(null), []);

  // Multi-color land: pending mana choice state
  const [pendingManaChoice, setPendingManaChoice] = useState<{ cardInstanceId: string; actions: GameAction[] } | null>(null);

  const handleTapLand = useCallback(
    (card: CardInstance) => {
      const tapActions = legalActions.filter((a) => a.type === 'TAP_FOR_MANA' && a.payload.cardInstanceId === card.instanceId);
      if (tapActions.length === 0) return;
      if (tapActions.length === 1) performAction(tapActions[0]);
      else setPendingManaChoice({ cardInstanceId: card.instanceId, actions: tapActions });
    },
    [legalActions, performAction]
  );

  const handleManaColorPicked = useCallback(
    (color: ManaColor | 'C') => {
      if (!pendingManaChoice) return;
      const action = pendingManaChoice.actions.find((a) => a.payload.manaColor === color);
      if (action) performAction(action);
      setPendingManaChoice(null);
    },
    [pendingManaChoice, performAction]
  );

  const handleUntapLand = useCallback(
    (card: CardInstance) => {
      const action = legalActions.find((a) => a.type === 'UNTAP_PERMANENT' && a.payload.cardInstanceId === card.instanceId);
      if (action) performAction(action);
    },
    [legalActions, performAction]
  );

  const handleCastCommander = useCallback(
    (card: CardInstance) => {
      const action = legalActions.find((a) => a.type === 'CAST_SPELL' && a.payload.cardInstanceId === card.instanceId && a.payload.fromZone === 'command');
      if (action) performAction(action);
    },
    [legalActions, performAction]
  );

  const handleEquipClick = useCallback(
    (card: CardInstance) => {
      const equipActions = filteredLegalActions.filter((a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'equip' && a.payload.cardInstanceId === card.instanceId);
      if (equipActions.length === 0) return;
      const validTargetIds = new Set(equipActions.map((a) => a.payload.targetId as string).filter(Boolean));
      setTargeting({ cardInstanceId: card.instanceId, cardName: `Equip ${card.cardData.name}`, actions: equipActions, validTargetIds });
    },
    [filteredLegalActions]
  );

  const handleActivateAbility = useCallback(
    (card: CardInstance) => {
      const abilityActions = filteredLegalActions.filter((a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'forge_activated' && a.payload.cardInstanceId === card.instanceId);
      if (abilityActions.length === 0) return;
      const hasTarget = abilityActions.some((a) => a.payload.targetId);
      if (hasTarget) {
        const validTargetIds = new Set(abilityActions.map((a) => a.payload.targetId as string).filter(Boolean));
        setTargeting({ cardInstanceId: card.instanceId, cardName: `Activate ${card.cardData.name}`, actions: abilityActions, validTargetIds });
      } else {
        performAction(abilityActions[0]);
      }
    },
    [filteredLegalActions, performAction]
  );

  const handleResolveChoice = useCallback(
    (chosenCardIds: string[]) => {
      if (!gameState?.pendingChoice) return;
      performAction({ type: 'RESOLVE_CHOICE', playerId: currentPlayerId, payload: { chosenCardIds }, timestamp: Date.now() });
    },
    [gameState?.pendingChoice, currentPlayerId, performAction]
  );

  const handlePassPriority = useCallback(() => {
    const action = legalActions.find((a) => a.type === 'PASS_PRIORITY');
    if (action) performAction(action);
  }, [legalActions, performAction]);

  const handleDeclareAttackers = useCallback(
    (declarations: Array<{ attackerId: string; defendingPlayerId: string }>) => {
      performAction({ type: 'DECLARE_ATTACKERS', playerId: currentPlayerId, payload: { attackerDeclarations: declarations }, timestamp: Date.now() });
    },
    [currentPlayerId, performAction]
  );

  const handleDeclareBlockers = useCallback(
    (assignments: Array<{ blockerId: string; attackerId: string }>) => {
      performAction({
        type: 'DECLARE_BLOCKERS',
        playerId: currentPlayerId,
        payload: { blockerAssignments: assignments.map((a) => ({ blockerId: a.blockerId, attackerId: a.attackerId })) },
        timestamp: Date.now(),
      });
    },
    [currentPlayerId, performAction]
  );

  const handleSkipCombat = useCallback(() => {
    performAction({ type: 'PASS_PRIORITY', playerId: currentPlayerId, payload: {}, timestamp: Date.now() });
  }, [currentPlayerId, performAction]);

  // Seat stats, once per state
  const stats = useMemo(() => {
    if (!gameState) return new Map<string, SeatStats>();
    return new Map(gameState.players.map((p) => [p.id, seatStats(gameState, p.id)]));
  }, [gameState]);

  if (!gameState) {
    return <div className="flex h-96 items-center justify-center text-muted-foreground">No active game</div>;
  }

  const currentPlayer = gameState.players.find((p) => p.id === currentPlayerId);
  const opponents = gameState.players.filter((p) => p.id !== currentPlayerId);
  const activePlayer = gameState.players.find((p) => p.id === gameState.turn.activePlayerId);
  const hasPriority = gameState.priority.playerWithPriority === currentPlayerId;
  const isMyTurn = gameState.turn.activePlayerId === currentPlayerId;
  const handCards = getCardsInZone(gameState, currentPlayerId, 'hand').map((id) => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c);
  const combat = gameState.combat;
  const inCombatPhase = gameState.turn.phase === 'combat';
  const step = gameState.turn.step;
  // Native combat controls are never shown in Forge mode — Forge drives all combat UI.
  const showCombatControls =
    !forgeMode && hasPriority && inCombatPhase && !isProcessing && !gameState.isGameOver &&
    ((isMyTurn && step === 'declare_attackers' && !combat) || (!isMyTurn && step === 'declare_blockers' && combat?.phase === 'declaring_blockers'));

  return (
    <div className={cn('relative flex flex-col', className)}>
      {!hidePhaseTracker && (
        <div className="shrink-0">
          <PhaseTracker turn={gameState.turn} activePlayerName={activePlayer?.name || 'Unknown'} />
        </div>
      )}

      {/* ─── THE TABLE: one plaque per seat ─── */}
      <div className="flex min-h-0 flex-1 flex-col gap-[clamp(6px,1.2vmin,10px)] p-[clamp(6px,1.2vmin,10px)]">
        {/* Opponents: a row on wide screens, a compact list on phones */}
        <div
          className={cn(
            'grid min-h-0 gap-[clamp(6px,1.2vmin,10px)]',
            narrow ? 'shrink-0 grid-cols-1' : 'flex-1',
            !narrow && opponents.length === 1 && 'grid-cols-1',
            !narrow && opponents.length === 2 && 'grid-cols-2',
            !narrow && opponents.length >= 3 && 'grid-cols-3'
          )}
        >
          {opponents.map((opp) => (
            <SeatPlaque
              key={opp.id}
              player={opp}
              stats={stats.get(opp.id)!}
              isYou={false}
              isActiveTurn={gameState.turn.activePlayerId === opp.id}
              hasPriority={gameState.priority.playerWithPriority === opp.id}
              compact={narrow}
              onOpen={() => setExpandedPlayerId(opp.id)}
            />
          ))}
        </div>

        {/* You */}
        {currentPlayer && (
          <div className={cn('flex min-h-0 flex-col', narrow ? 'flex-1' : 'flex-[1.15]')}>
            <SeatPlaque
              player={currentPlayer}
              stats={stats.get(currentPlayerId)!}
              isYou
              isActiveTurn={isMyTurn}
              hasPriority={hasPriority && !gameState.isGameOver}
              onOpen={() => setExpandedPlayerId(currentPlayerId)}
            />
          </div>
        )}
      </div>

      {/* ─── INLINE CONTEXT: stack, targeting, mana, combat — only when no board is open ─── */}
      {!expandedPlayerId && (
        <div className="z-20 flex shrink-0 flex-col gap-1 px-[clamp(6px,1.2vmin,10px)]">
          <AnimatePresence>{gameState.stack.length > 0 && <StackDisplay stack={gameState.stack} />}</AnimatePresence>
          <AnimatePresence>
            {targeting && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-3 py-1.5 text-xs text-cyan-200">
                <span className="relative h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-cyan-400 opacity-75" /><span className="absolute inset-0 rounded-full bg-cyan-400" /></span>
                Choose a target for <strong>{targeting.cardName}</strong> — open a board to pick
                <Button size="sm" variant="ghost" onClick={cancelTargeting} className="ml-auto h-6 w-6 p-0 text-cyan-400" aria-label="Cancel targeting"><X className="h-3.5 w-3.5" /></Button>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {manaPaymentInfo && onCancelManaPayment && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/[0.06] px-3 py-1.5 text-xs">
                <span>Pay <strong className="font-mono">{manaPaymentInfo.manaCost}</strong> for <strong>{manaPaymentInfo.spellName}</strong> — open your board to tap lands</span>
                <Button size="sm" variant="ghost" onClick={onCancelManaPayment} className="ml-auto h-6 px-1.5 text-xs">Cancel</Button>
              </motion.div>
            )}
          </AnimatePresence>
          {showCombatControls && (
            <CombatControls gameState={gameState} currentPlayerId={currentPlayerId} legalActions={legalActions}
              onDeclareAttackers={handleDeclareAttackers} onDeclareBlockers={handleDeclareBlockers} onSkipCombat={handleSkipCombat} />
          )}
        </div>
      )}

      {/* Action bar — hidden when rendered externally (e.g. in page footer) */}
      {!hideActionBar && (
        <div className={cn('z-20 mx-auto my-1 flex shrink-0 items-center gap-3 rounded-xl border px-4 py-2', hasPriority && !gameState.isGameOver ? 'border-gold/40 bg-gold/5' : 'border-border/30 bg-card/60')}>
          <span className={cn('text-xs font-medium', hasPriority ? 'text-gold' : 'text-muted-foreground')}>
            {hasPriority ? (isMyTurn ? 'Your Turn' : 'Priority') : `${gameState.players.find((p) => p.id === gameState.priority.playerWithPriority)?.name}'s turn`}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" onClick={handlePassPriority} disabled={!hasPriority || gameState.isGameOver} className="h-7 gap-1 px-3 text-xs text-foreground"><ArrowRight className="h-3 w-3" />Pass</Button>
            <Button size="sm" variant={autoPassUntilNextTurn ? 'default' : 'outline'} onClick={() => setAutoPass(!autoPassUntilNextTurn)} className={cn('h-7 px-2 text-xs', autoPassUntilNextTurn && 'bg-amber-600 text-white')}><FastForward className="h-3 w-3" /></Button>
          </div>
        </div>
      )}

      {!hideHand && (
        <div className="shrink-0 border-t border-border/20 bg-background/90 px-2 pb-1 pt-1">
          <Hand cards={handCards} legalActions={hasPriority ? filteredLegalActions : []} onPlayCard={handlePlayCard} isActive={hasPriority} />
        </div>
      )}

      {/* ─── MULLIGAN OVERLAY ─── */}
      <AnimatePresence>
        {gameState.mulliganPhase && hasPriority && (
          <motion.div key="mulligan-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md">
            <div className="mb-4 flex flex-col items-center gap-1">
              <Keystone size={56} />
              <span className="font-display text-2xl font-bold text-foreground">
                {currentPlayer && currentPlayer.mulliganCount > 0 ? `Mulligan #${currentPlayer.mulliganCount}` : 'Opening Hand'}
              </span>
              <span className="text-sm text-muted-foreground">{7 - (currentPlayer?.mulliganCount || 0)} cards — keep this hand or mulligan?</span>
            </div>
            <div className="mb-5 flex flex-wrap items-center justify-center gap-2 px-4">
              {handCards.map((card) => (
                <motion.div key={card.instanceId} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                  <CardView card={card} mode="art" interactive={false} />
                </motion.div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button className="h-10 bg-gold px-5 text-gold-foreground hover:bg-gold/90" onClick={() => { const a = legalActions.find((x) => x.type === 'KEEP_HAND'); if (a) performAction(a); }}>
                Keep ({7 - (currentPlayer?.mulliganCount || 0)})
              </Button>
              {legalActions.some((a) => a.type === 'MULLIGAN') && (
                <Button variant="outline" className="h-10 px-5" onClick={() => { const a = legalActions.find((x) => x.type === 'MULLIGAN'); if (a) performAction(a); }}>
                  Mulligan
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── EXPANDED BOARD ─── */}
      <AnimatePresence>
        {expandedPlayerId && gameState.players.some((p) => p.id === expandedPlayerId) && (
          <BoardView
            key="board"
            gameState={gameState}
            viewedPlayerId={expandedPlayerId}
            onViewPlayer={setExpandedPlayerId}
            onClose={() => setExpandedPlayerId(null)}
            currentPlayerId={currentPlayerId}
            hasPriority={hasPriority}
            legalActions={filteredLegalActions}
            combat={combat}
            targeting={targeting ? { cardName: targeting.cardName, validTargetIds: targeting.validTargetIds } : null}
            onSelectTarget={handleSelectTarget}
            onCancelTargeting={cancelTargeting}
            onTapLand={handleTapLand}
            onUntapLand={handleUntapLand}
            onCastCommander={handleCastCommander}
            onEquipClick={handleEquipClick}
            onActivateAbility={handleActivateAbility}
            pendingManaChoice={pendingManaChoice}
            onManaColorPicked={handleManaColorPicked}
            onCancelManaChoice={() => setPendingManaChoice(null)}
            manaPaymentSourceIds={manaPaymentSourceIds}
            manaPaymentInfo={manaPaymentInfo}
            onTapForManaPayment={onTapForManaPayment}
            onCancelManaPayment={onCancelManaPayment}
          />
        )}
      </AnimatePresence>

      {/* Game over overlay */}
      <AnimatePresence>
        {gameState.isGameOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }} className="absolute inset-0 z-50 flex items-center justify-center rounded-3xl bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.5 }} className="alcove alcove-lit arch-top flex flex-col items-center gap-3 rounded-b-2xl px-10 pb-7 pt-12">
              {gameState.winner === currentPlayerId ? (
                <>
                  <Keystone size={88} />
                  <h2 className="font-display text-3xl font-bold tracking-tight text-gold">Victory</h2>
                  <p className="text-sm text-muted-foreground">You have won the game</p>
                </>
              ) : (
                <>
                  <span className="text-5xl">💀</span>
                  <h2 className="font-display text-3xl font-bold tracking-tight text-destructive">Defeat</h2>
                  <p className="text-sm text-muted-foreground">
                    {gameState.winner ? `${gameState.players.find((p) => p.id === gameState.winner)?.name} wins` : 'The game ended in a draw'}
                  </p>
                </>
              )}
              <div className="mt-2 flex gap-8 text-xs text-muted-foreground">
                <div className="flex flex-col items-center"><span className="font-display text-xl font-bold text-foreground">{gameState.turn.turnNumber}</span><span>Turns</span></div>
                <div className="flex flex-col items-center"><span className="font-display text-xl font-bold text-foreground">{currentPlayer?.life ?? 0}</span><span>Life</span></div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm ability dialog (sacrifice confirmation) */}
      <AnimatePresence>
        {gameState.pendingChoice && gameState.pendingChoice.type === 'confirm_ability' && gameState.pendingChoice.playerId === currentPlayerId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }} className="prompt-panel prompt-action flex flex-col items-center gap-4 px-6 py-5">
              <h3 className="text-sm font-semibold text-foreground">{gameState.pendingChoice.prompt}</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => performAction({ type: 'RESOLVE_CHOICE', playerId: currentPlayerId, payload: { confirmed: false }, timestamp: Date.now() })}>Cancel</Button>
                <Button size="sm" className="bg-gold text-gold-foreground hover:bg-gold/90" onClick={() => performAction({ type: 'RESOLVE_CHOICE', playerId: currentPlayerId, payload: { confirmed: true }, timestamp: Date.now() })}>Sacrifice</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Picker overlay for library search choices */}
      <AnimatePresence>
        {gameState.pendingChoice && gameState.pendingChoice.type === 'search_library' && gameState.pendingChoice.playerId === currentPlayerId && (
          <SearchPicker
            pendingChoice={gameState.pendingChoice}
            cards={(gameState.pendingChoice.cardInstanceIds || []).map((id) => gameState.cardInstances.get(id)).filter((c): c is CardInstance => !!c)}
            onConfirm={handleResolveChoice}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
