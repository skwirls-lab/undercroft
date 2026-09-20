'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { cn } from '@/lib/utils';
import { CardView, type CardSize, type CombatRole } from './CardView';
import { StackDisplay } from './StackDisplay';
import { CommanderDamage } from './CommanderDamage';
import { ManaColorPicker } from './ManaColorPicker';
import { ManaPoolDisplay } from './ManaPoolDisplay';
import { useFitToRow } from '@/hooks/useFitToRow';
import { getCardsInZone, getZoneCardCount } from '@/lib/ZoneManager';
import { cardArrive } from '@/lib/motion';
import type { CardInstance, GameState, GameAction, CombatState, ManaColor } from '@/lib/gameTypes';
import { Heart, Crown, Sword, Gem, Library, X, ChevronLeft, ChevronRight, Skull, Ban, BookOpen, Hand as HandIcon, Droplets, Info } from 'lucide-react';

/**
 * The expanded board for one player: what you open when you tap a seat.
 *
 * Three commitments, each answering a specific complaint:
 *
 * 1. Nothing here scrolls vertically. Every zone row measures its own box and sizes its
 *    cards to fit (useFitToRow), so a commander plus six creatures plus four other
 *    permanents plus eight lands plus a nine-card hand is a layout problem the component
 *    solves, not one it hands to the scrollbar. The hand is a sideways strip — a thumb
 *    gesture, not a page scroll.
 * 2. The command zone sits at the head of the creatures row, not on a row of its own.
 *    That is where it sits on a table, and it returns a full row of height to the board.
 * 3. Switching players is a swipe (or ← →), and the player tabs across the top are real
 *    targets, not 16px chevrons.
 *
 * The overlay covers the table only; the page's priority bar and hand strip stay visible
 * beneath it. So your own hand is on screen under every board, including opponents' —
 * deciding what to do about their board is exactly when you need to see what you hold.
 */

export interface TargetingInfo {
  cardName: string;
  validTargetIds: Set<string>;
}

export interface BoardViewProps {
  gameState: GameState;
  viewedPlayerId: string;
  onViewPlayer: (id: string) => void;
  onClose: () => void;
  /** Open the seat inspector for the viewed player. */
  onInspect?: (id: string) => void;
  currentPlayerId: string;
  hasPriority: boolean;
  /** Legal actions for the current player; the board only lights affordances on your own seat. */
  legalActions: GameAction[];
  combat?: CombatState;

  targeting?: TargetingInfo | null;
  onSelectTarget?: (targetId: string) => void;
  onCancelTargeting?: () => void;

  onTapLand: (card: CardInstance) => void;
  onUntapLand?: (card: CardInstance) => void;
  onCastCommander?: (card: CardInstance) => void;
  onEquipClick?: (card: CardInstance) => void;
  onActivateAbility?: (card: CardInstance) => void;

  pendingManaChoice?: { cardInstanceId: string; actions: GameAction[] } | null;
  onManaColorPicked?: (color: ManaColor | 'C') => void;
  onCancelManaChoice?: () => void;

  manaPaymentSourceIds?: Set<string>;
  manaPaymentInfo?: { manaCost: string; spellName: string };
  onTapForManaPayment?: (cardInstanceId: string) => void;
  onCancelManaPayment?: () => void;
}

const ART_ASPECT = 1.4; // height / width for an art-crop card

function combatRole(cardId: string, combat?: CombatState | null): CombatRole {
  if (!combat) return 'none';
  if (combat.attackers.some((a) => a.instanceId === cardId)) return 'attacking';
  if (combat.blockers.some((b) => b.instanceId === cardId)) return 'blocking';
  return 'none';
}

export function BoardView(props: BoardViewProps) {
  const {
    gameState, viewedPlayerId, onViewPlayer, onClose, onInspect, currentPlayerId, hasPriority, legalActions, combat,
    targeting, onSelectTarget, onCancelTargeting,
    onTapLand, onUntapLand, onCastCommander, onEquipClick, onActivateAbility,
    pendingManaChoice, onManaColorPicked, onCancelManaChoice,
    manaPaymentSourceIds, manaPaymentInfo, onTapForManaPayment, onCancelManaPayment,
  } = props;

  const players = gameState.players;
  const viewed = players.find((p) => p.id === viewedPlayerId) ?? players[0];
  const isMe = viewed.id === currentPlayerId;
  const idx = players.findIndex((p) => p.id === viewed.id);
  const [slideDir, setSlideDir] = useState(0);

  const go = useCallback(
    (dir: 1 | -1) => {
      if (players.length < 2) return;
      setSlideDir(dir);
      onViewPlayer(players[(idx + dir + players.length) % players.length].id);
    },
    [players, idx, onViewPlayer]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const { offset, velocity } = info;
      if (Math.abs(offset.x) < 56 && Math.abs(velocity.x) < 480) return;
      go(offset.x < 0 ? 1 : -1);
    },
    [go]
  );

  // ── Zones for the viewed player ────────────────────────────────────────────
  const instances = gameState.cardInstances;
  const bf = useMemo(
    () => getCardsInZone(gameState, viewed.id, 'battlefield').map((id) => instances.get(id)).filter((c): c is CardInstance => !!c),
    [gameState, viewed.id, instances]
  );
  const commandZone = useMemo(
    () =>
      getCardsInZone(gameState, viewed.id, 'command')
        .map((id) => instances.get(id))
        .filter((c): c is CardInstance => !!c)
        .filter((c) => { const t = c.cardData.typeLine.toLowerCase(); return t.includes('legendary') || t.includes('planeswalker'); }),
    [gameState, viewed.id, instances]
  );
  const attached = useMemo(() => new Set(bf.filter((c) => c.attachedTo).map((c) => c.instanceId)), [bf]);
  const creatures = bf.filter((c) => c.cardData.typeLine.toLowerCase().includes('creature'));
  const lands = bf.filter((c) => c.cardData.typeLine.toLowerCase().includes('land'));
  const others = bf.filter((c) => {
    const t = c.cardData.typeLine.toLowerCase();
    return !t.includes('creature') && !t.includes('land') && !attached.has(c.instanceId);
  });

  // ── Affordances (only meaningful on your own seat with priority) ──────────
  const mine = isMe && hasPriority ? legalActions : [];
  const idsOf = (pred: (a: GameAction) => boolean) => new Set(mine.filter(pred).map((a) => a.payload.cardInstanceId as string));
  const tappable = idsOf((a) => a.type === 'TAP_FOR_MANA');
  const untappable = idsOf((a) => a.type === 'UNTAP_PERMANENT');
  const castableCommander = idsOf((a) => a.type === 'CAST_SPELL' && a.payload.fromZone === 'command');
  const equippable = idsOf((a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'equip');
  const activatable = idsOf((a) => a.type === 'ACTIVATE_ABILITY' && a.payload.ability === 'forge_activated');
  const targets = targeting?.validTargetIds;

  const decorate = (card: CardInstance) => {
    const isTarget = targets?.has(card.instanceId) ?? false;
    const canEquip = equippable.has(card.instanceId);
    const canActivate = activatable.has(card.instanceId);
    return {
      highlighted: isTarget || canEquip || canActivate,
      className: cn(
        isTarget && 'affordance-target cursor-crosshair',
        !isTarget && (canEquip || canActivate) && 'affordance-actionable'
      ),
      onClick: (c: CardInstance) => {
        if (isTarget) onSelectTarget?.(c.instanceId);
        else if (canEquip) onEquipClick?.(c);
        else if (canActivate) onActivateAbility?.(c);
      },
      combatRole: combatRole(card.instanceId, combat),
    };
  };

  const commander = commandZone[0];
  const commanderCastable = commander ? castableCommander.has(commander.instanceId) : false;

  const playerIsTarget = targets?.has(viewed.id) ?? false;

  return (
    <motion.div
      key="board-view"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 z-40 flex flex-col bg-background/[0.97] backdrop-blur-md"
    >
      {/* ── Player tabs ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-stretch border-b border-border/40 bg-card/40">
        {players.length > 1 && (
          <button onClick={() => go(-1)} aria-label="Previous player" className="hidden w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-gold sm:flex">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="no-scrollbar flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {players.map((p) => {
            const active = p.id === viewed.id;
            const you = p.id === currentPlayerId;
            const turn = gameState.turn.activePlayerId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => { setSlideDir(players.findIndex((q) => q.id === p.id) > idx ? 1 : -1); onViewPlayer(p.id); }}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'relative flex min-w-[92px] shrink-0 flex-col items-start justify-center gap-0.5 px-3 py-1.5 text-left transition-colors sm:flex-1',
                  active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
                style={{ minHeight: 44 }}
              >
                <span className="flex w-full items-center gap-1.5">
                  <span className="truncate text-[12px] font-semibold">{p.name}</span>
                  {you && <span className="eyebrow text-[9px] tracking-[0.12em]">you</span>}
                  {turn && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70" title="Active player" />}
                </span>
                <span className="flex items-center gap-2 text-[11px] tabular-nums">
                  <span className="flex items-center gap-0.5 text-red-300"><Heart className="h-3 w-3" />{p.life}</span>
                  <CommanderDamage damage={p.commanderDamageReceived} compact />
                </span>
                {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold shadow-[0_0_8px_var(--gold-glow-strong)]" />}
              </button>
            );
          })}
        </div>
        {players.length > 1 && (
          <button onClick={() => go(1)} aria-label="Next player" className="hidden w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-gold sm:flex">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
        <button onClick={onClose} aria-label="Close board" className="flex w-11 shrink-0 items-center justify-center border-l border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── Context strip: stack, targeting, mana payment ───────────────────── */}
      <div className="flex shrink-0 flex-col gap-1 px-2 pt-1.5 empty:hidden">
        <AnimatePresence>{gameState.stack.length > 0 && <StackDisplay stack={gameState.stack} />}</AnimatePresence>
        <AnimatePresence>
          {targeting && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-950/40 px-3 py-1.5 text-xs text-cyan-200">
              <span className="relative h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-cyan-400 opacity-75" /><span className="absolute inset-0 rounded-full bg-cyan-400" /></span>
              Choose a target for <strong>{targeting.cardName}</strong>
              <button onClick={onCancelTargeting} className="ml-auto rounded p-1 text-cyan-400 hover:bg-cyan-500/10" aria-label="Cancel targeting"><X className="h-3.5 w-3.5" /></button>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {manaPaymentInfo && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/[0.06] px-3 py-1.5 text-xs">
              <span>Pay <strong className="font-mono">{manaPaymentInfo.manaCost}</strong> for <strong>{manaPaymentInfo.spellName}</strong> — tap lands</span>
              <button onClick={onCancelManaPayment} className="ml-auto rounded px-1.5 py-0.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground">Cancel</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Seat header ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex shrink-0 items-center gap-3 px-3 pb-1 pt-2',
          playerIsTarget && 'cursor-crosshair rounded-lg bg-cyan-950/30 ring-1 ring-cyan-400/60'
        )}
        onClick={() => playerIsTarget && onSelectTarget?.(viewed.id)}
      >
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className={cn('truncate font-display text-lg font-bold', playerIsTarget && 'text-cyan-300')}>
            {viewed.name}
            {playerIsTarget && <span className="ml-1.5 text-xs font-sans text-cyan-400">(target)</span>}
          </h2>
          {viewed.hasLost && <Skull className="h-4 w-4 text-destructive" />}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/80">
          <span className="flex items-center gap-1" title="Library"><BookOpen className="h-3.5 w-3.5" />{getZoneCardCount(gameState, viewed.id, 'library')}</span>
          <span className="flex items-center gap-1" title="Graveyard"><Skull className="h-3.5 w-3.5" />{getZoneCardCount(gameState, viewed.id, 'graveyard')}</span>
          <span className="flex items-center gap-1" title="Exile"><Ban className="h-3.5 w-3.5" />{getZoneCardCount(gameState, viewed.id, 'exile')}</span>
          {!isMe && <span className="flex items-center gap-1" title="Cards in hand"><HandIcon className="h-3.5 w-3.5" />{getZoneCardCount(gameState, viewed.id, 'hand')}</span>}
          {viewed.poisonCounters > 0 && <span className="flex items-center gap-0.5 text-green-400"><Droplets className="h-3.5 w-3.5" />{viewed.poisonCounters}</span>}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {onInspect && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onInspect(viewed.id); }}
              aria-label={`Details for ${viewed.name}`}
              title="Details: commander damage, graveyard, exile"
              data-dev-inspect-board={viewed.id}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-foreground/70 ring-1 ring-white/10 transition-colors hover:bg-gold hover:text-gold-foreground"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          )}
          <ManaPoolDisplay manaPool={viewed.manaPool} compact />
          <span className={cn('flex items-center gap-1 font-display text-2xl font-bold tabular-nums', viewed.life <= 10 ? 'text-red-300' : viewed.life <= 20 ? 'text-amber-200' : 'text-foreground')}>
            <Heart className="h-4 w-4 text-red-400" />{viewed.life}
          </span>
        </div>
      </div>

      {/* ── Battlefield: swipeable, fit-to-space ────────────────────────────── */}
      <motion.div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-1 touch-pan-y"
        drag={players.length > 1 ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        dragMomentum={false}
        onDragEnd={onDragEnd}
      >
        <AnimatePresence mode="popLayout" initial={false} custom={slideDir}>
          <motion.div
            key={viewed.id}
            custom={slideDir}
            initial={{ opacity: 0, x: slideDir * 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: slideDir * -36 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-0 flex-1 flex-col gap-1.5"
          >
            {(creatures.length > 0 || commander) && (
              <ZoneRow
                icon={<Sword className="h-3 w-3" />}
                label="Creatures"
                count={creatures.length}
                grow={3}
                cards={creatures}
                leading={
                  commander
                    ? (size) => (
                        <div className="relative flex shrink-0 items-start">
                          <div
                            onClick={() => (commanderCastable ? onCastCommander?.(commander) : undefined)}
                            className={cn('relative', commanderCastable && 'cursor-pointer')}
                            title={commanderCastable ? 'Cast commander' : 'Commander (in command zone)'}
                          >
                            <CardView card={commander} mode="art" size={size} interactive highlighted={commanderCastable} className={cn(commanderCastable && 'affordance-actionable card-glow-strong')} />
                            <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gold text-gold-foreground shadow-md" title="Command zone">
                              <Crown className="h-3 w-3" />
                            </span>
                          </div>
                          <span className="mx-1.5 w-px self-stretch bg-gradient-to-b from-transparent via-gold/40 to-transparent" style={{ height: size.h }} />
                        </div>
                      )
                    : undefined
                }
                render={(card, size) => {
                  const d = decorate(card);
                  return <CardView card={card} mode="art" size={size} interactive onClick={d.onClick} highlighted={d.highlighted} className={d.className} combatRole={d.combatRole} />;
                }}
              />
            )}

            {others.length > 0 && (
              <ZoneRow
                icon={<Gem className="h-3 w-3" />}
                label="Other"
                count={others.length}
                grow={2}
                cards={others}
                render={(card, size) => {
                  const d = decorate(card);
                  return <CardView card={card} mode="art" size={size} interactive onClick={d.onClick} highlighted={d.highlighted} className={d.className} />;
                }}
              />
            )}

            {lands.length > 0 && (
              <LandRow
                lands={lands}
                tappable={tappable}
                untappable={untappable}
                activatable={activatable}
                paymentSources={manaPaymentSourceIds}
                pendingManaChoice={pendingManaChoice}
                onTap={onTapLand}
                onUntap={onUntapLand}
                onActivate={onActivateAbility}
                onTapForPayment={onTapForManaPayment}
                onManaColorPicked={onManaColorPicked}
                onCancelManaChoice={onCancelManaChoice}
              />
            )}

            {bf.length === 0 && !commander && (
              <div className="flex flex-1 items-center justify-center text-sm italic text-muted-foreground/40">No permanents on the battlefield</div>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

    </motion.div>
  );
}

// ─── Zone row: measures itself, sizes its cards ──────────────────────────────

function ZoneRow({
  icon, label, count, grow, cards, leading, render,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  grow: number;
  cards: CardInstance[];
  leading?: (size: CardSize) => React.ReactNode;
  render: (card: CardInstance, size: CardSize) => React.ReactNode;
}) {
  const GAP = 6;
  const { ref, cardW, cardH } = useFitToRow<HTMLDivElement>({
    count: cards.length + (leading ? 1 : 0) + (leading ? 0.25 : 0), // the divider takes a sliver
    gap: GAP,
    aspect: ART_ASPECT,
    maxW: 150,
    minW: 54,
    maxLines: 2,
  });
  const size: CardSize = { w: cardW, h: cardH };

  return (
    <div className="flex min-h-0 flex-col" style={{ flex: `${grow} 1 0%` }}>
      <div className="flex shrink-0 items-center gap-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
        {icon}
        {label}
        <span className="tabular-nums text-muted-foreground/40">{count}</span>
      </div>
      <div ref={ref} className="min-h-0 flex-1">
        {cardW > 0 && (
          <div className="flex flex-wrap content-start items-start" style={{ gap: GAP }}>
            {leading?.(size)}
            <AnimatePresence initial={false}>
              {cards.map((card) => (
                <motion.div key={card.instanceId} variants={cardArrive} initial="initial" animate="animate" exit="exit" layout className="shrink-0">
                  {render(card, size)}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Land row: grouped chips ─────────────────────────────────────────────────

function LandRow({
  lands, tappable, untappable, activatable, paymentSources, pendingManaChoice,
  onTap, onUntap, onActivate, onTapForPayment, onManaColorPicked, onCancelManaChoice,
}: {
  lands: CardInstance[];
  tappable: Set<string>;
  untappable: Set<string>;
  activatable: Set<string>;
  paymentSources?: Set<string>;
  pendingManaChoice?: { cardInstanceId: string; actions: GameAction[] } | null;
  onTap: (c: CardInstance) => void;
  onUntap?: (c: CardInstance) => void;
  onActivate?: (c: CardInstance) => void;
  onTapForPayment?: (id: string) => void;
  onManaColorPicked?: (color: ManaColor | 'C') => void;
  onCancelManaChoice?: () => void;
}) {
  // Eight Forests are one fact, not eight chips. Group by name; act on the first untapped one.
  const groups = useMemo(() => {
    const m = new Map<string, CardInstance[]>();
    for (const l of lands) {
      const k = l.cardData.name;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(l);
    }
    return [...m.entries()];
  }, [lands]);

  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex items-center gap-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
        <Library className="h-3 w-3" />
        Lands
        <span className="tabular-nums text-muted-foreground/40">{lands.length}</span>
        <span className="ml-1 text-green-400/80">{lands.filter((l) => !l.tapped).length} untapped</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {groups.map(([name, group]) => {
          const untapped = group.filter((l) => !l.tapped);
          const actor = untapped[0] ?? group[0];
          const paySource = group.find((l) => paymentSources?.has(l.instanceId) && !l.tapped);
          const canTap = untapped.some((l) => tappable.has(l.instanceId));
          const canActivate = group.some((l) => activatable.has(l.instanceId));
          const canUntap = group.some((l) => untappable.has(l.instanceId));
          const pending = group.find((l) => pendingManaChoice?.cardInstanceId === l.instanceId);
          const actionable = !!paySource || canTap || canActivate;
          return (
            <div key={name} className="relative">
              <div
                onClick={() => {
                  if (paySource && onTapForPayment) { onTapForPayment(paySource.instanceId); return; }
                  if (pending) return;
                  const t = untapped.find((l) => tappable.has(l.instanceId));
                  if (t) onTap(t);
                  else if (canActivate) onActivate?.(group.find((l) => activatable.has(l.instanceId))!);
                  else if (canUntap && onUntap) onUntap(group.find((l) => untappable.has(l.instanceId))!);
                }}
                className={cn(actionable && 'cursor-pointer')}
                title={paySource ? 'Tap for mana payment' : canTap ? 'Tap for mana' : canActivate ? 'Activate ability' : canUntap ? 'Untap' : undefined}
              >
                <CardView
                  card={actor}
                  mode="pip"
                  interactive={actionable}
                  highlighted={actionable || !!pending}
                  className={cn(
                    actionable && 'affordance-actionable',
                    !actionable && canUntap && 'affordance-latent',
                    pending && 'affordance-selected'
                  )}
                />
              </div>
              {group.length > 1 && (
                <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold tabular-nums text-background shadow">
                  {untapped.length}/{group.length}
                </span>
              )}
              {pending && onManaColorPicked && onCancelManaChoice && (
                <ManaColorPicker
                  colors={pendingManaChoice!.actions.map((a) => a.payload.manaColor as ManaColor | 'C')}
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
  );
}
