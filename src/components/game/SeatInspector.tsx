'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Heart, Droplets, BookOpen, Hand as HandIcon, Skull, Ban, Crown, Swords, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COMMANDER_DAMAGE_LETHAL } from '@/lib/constants';
import { getCardsInZone, getZoneCardCount } from '@/lib/ZoneManager';
import type { GameState, CardInstance, PlayerState } from '@/lib/gameTypes';
import { CardView } from './CardView';
import { ManaPoolDisplay } from './ManaPoolDisplay';
import { ManaCostDisplay, OracleText } from './ManaSymbol';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * A closer look at one seat, on demand and mid-game: life, poison, library and hand counts,
 * commander damage taken from every opposing commander against the 21 that ends a game, and
 * the graveyard, exile and command zone laid out as cards you can read.
 *
 * Opens from the (i) on any plaque or the board header. Tabs across the top switch seats
 * without closing, because the question is usually "and what about the other two?".
 */

interface SeatInspectorProps {
  gameState: GameState;
  /** Which seat to show; null keeps the dialog closed. */
  playerId: string | null;
  currentPlayerId: string;
  onSelectPlayer: (id: string) => void;
  onClose: () => void;
}

type ZoneTab = 'graveyard' | 'exile' | 'command';

const POISON_LETHAL = 10;

function cardsIn(gameState: GameState, playerId: string, zone: string): CardInstance[] {
  return getCardsInZone(gameState, playerId, zone)
    .map((id) => gameState.cardInstances.get(id))
    .filter((c): c is CardInstance => !!c);
}

/** The commander of a seat: whatever sits in the command zone, else a legendary creature on the field. */
function commanderOf(gameState: GameState, playerId: string): CardInstance | undefined {
  const lower = (c: CardInstance) => (c.cardData.typeLine || '').toLowerCase();
  const cmd = cardsIn(gameState, playerId, 'command');
  return cmd.find((c) => lower(c).includes('legendary') || lower(c).includes('planeswalker')) ?? cmd[0]
    ?? cardsIn(gameState, playerId, 'battlefield').find((c) => lower(c).includes('legendary') && lower(c).includes('creature'));
}

export function SeatInspector({ gameState, playerId, currentPlayerId, onSelectPlayer, onClose }: SeatInspectorProps) {
  const [tab, setTab] = useState<ZoneTab>('graveyard');
  const [reading, setReading] = useState<CardInstance | null>(null);
  const narrow = useMediaQuery('(max-width: 640px)');

  const player = playerId ? gameState.players.find((p) => p.id === playerId) : undefined;

  // Every opposing commander, with the damage this seat has taken from it — zero included, so
  // the list is the same shape all game and a number that starts moving is easy to notice.
  const commanderDamage = useMemo(() => {
    if (!player) return [];
    const rows = gameState.players
      .filter((p) => p.id !== player.id)
      .map((p) => {
        const cmd = commanderOf(gameState, p.id);
        const name = cmd?.cardData.name;
        const amount = name ? player.commanderDamageReceived[name] ?? 0 : 0;
        return { key: p.id, owner: p, name: name ?? 'No commander', art: cmd?.cardData.imageUris?.artCrop, amount };
      });
    // Damage recorded under a name no seat currently shows (a commander that changed hands, say).
    const shown = new Set(rows.map((r) => r.name));
    for (const [name, amount] of Object.entries(player.commanderDamageReceived ?? {})) {
      if (amount > 0 && !shown.has(name)) rows.push({ key: `orphan-${name}`, owner: undefined as unknown as PlayerState, name, art: undefined, amount });
    }
    return rows.sort((a, b) => b.amount - a.amount);
  }, [gameState, player]);

  if (!player) return <Dialog open={false} onOpenChange={() => {}} />;

  const isMe = player.id === currentPlayerId;
  const commander = commanderOf(gameState, player.id);
  const zoneCards = cardsIn(gameState, player.id, tab);
  const counts = {
    library: getZoneCardCount(gameState, player.id, 'library'),
    hand: getZoneCardCount(gameState, player.id, 'hand'),
    graveyard: getZoneCardCount(gameState, player.id, 'graveyard'),
    exile: getZoneCardCount(gameState, player.id, 'exile'),
    command: getZoneCardCount(gameState, player.id, 'command'),
  };
  const lifeTone = player.life <= 10 ? 'text-red-300' : player.life <= 20 ? 'text-amber-200' : 'text-foreground';
  const cardSize = narrow ? { w: 92, h: 129 } : { w: 108, h: 151 };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) { setReading(null); onClose(); } }}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={false} data-dev-inspector>
        {/* Seat tabs */}
        <div className="flex items-center gap-1 border-b border-border/40 px-2 pt-2" role="tablist" aria-label="Seat">
          {gameState.players.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === player.id}
              onClick={() => { setReading(null); onSelectPlayer(p.id); }}
              className={cn(
                'relative flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-t-lg px-2 text-sm font-medium transition-colors',
                p.id === player.id ? 'text-gold' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="truncate">{p.id === currentPlayerId ? 'You' : p.name}</span>
              {p.id === player.id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-gold" />}
            </button>
          ))}
          <button type="button" onClick={onClose} aria-label="Close" className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {/* Identity + vitals */}
          <div className="relative overflow-hidden">
            {commander?.cardData.imageUris?.artCrop && (
              <div className="pointer-events-none absolute inset-0">
                <Image src={commander.cardData.imageUris.artCrop} alt="" fill sizes="800px" className="object-cover object-[50%_25%] opacity-30 saturate-[1.1]" unoptimized />
                <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background" />
              </div>
            )}
            <div className="relative flex flex-col gap-3 px-4 pb-3 pt-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <DialogTitle className="flex items-center gap-2 font-display text-2xl font-bold leading-tight">
                    <span className="truncate">{player.name}</span>
                    {player.isAI && <span className="rounded bg-muted/70 px-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">AI</span>}
                    {player.hasLost && <Skull className="h-4 w-4 text-destructive" />}
                  </DialogTitle>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Crown className={cn('h-3.5 w-3.5 shrink-0', counts.command === 0 ? 'text-green-400' : 'text-gold/70')} />
                    <span className="truncate">{commander?.cardData.name ?? 'No commander'}</span>
                    {commander && <span className="shrink-0 text-xs text-muted-foreground/70">· {counts.command === 0 ? 'on the battlefield' : 'in the command zone'}</span>}
                  </p>
                </div>
                <div className={cn('flex shrink-0 items-center gap-1.5 font-display text-4xl font-bold tabular-nums', lifeTone)}>
                  <Heart className="h-6 w-6 text-red-400" />{player.life}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                <Tile icon={Droplets} label="Poison" value={`${player.poisonCounters}`} sub={`of ${POISON_LETHAL}`} tone={player.poisonCounters >= 7 ? 'danger' : player.poisonCounters > 0 ? 'warn' : undefined} />
                <Tile icon={BookOpen} label="Library" value={`${counts.library}`} />
                <Tile icon={HandIcon} label="Hand" value={`${counts.hand}`} />
                <Tile icon={Skull} label="Graveyard" value={`${counts.graveyard}`} />
                <Tile icon={Ban} label="Exile" value={`${counts.exile}`} className="col-span-2 sm:col-span-1" />
              </div>

              {Object.values(player.manaPool).some((n) => n > 0) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider">Mana pool</span>
                  <ManaPoolDisplay manaPool={player.manaPool} compact />
                </div>
              )}
            </div>
          </div>

          {/* Commander damage */}
          <section className="border-t border-border/40 px-4 py-3 sm:px-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/70">
              <Swords className="h-3.5 w-3.5" /> Commander damage taken
              <span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground">{COMMANDER_DAMAGE_LETHAL} from one commander is lethal</span>
            </h3>
            {commanderDamage.length === 0 ? (
              <p className="text-sm text-muted-foreground">No opponents.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {commanderDamage.map((row) => {
                  const pct = Math.min(100, Math.round((row.amount / COMMANDER_DAMAGE_LETHAL) * 100));
                  const lethal = row.amount >= COMMANDER_DAMAGE_LETHAL;
                  const danger = !lethal && row.amount >= COMMANDER_DAMAGE_LETHAL - 6;
                  return (
                    <li key={row.key} className="flex items-center gap-3">
                      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-muted/40 ring-1 ring-border/60">
                        {row.art && <Image src={row.art} alt="" fill sizes="32px" className="object-cover" unoptimized />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm">
                            <span className="font-medium text-foreground">{row.name}</span>
                            {row.owner && <span className="text-muted-foreground"> · {row.owner.id === currentPlayerId ? 'you' : row.owner.name}</span>}
                          </p>
                          <span className={cn('shrink-0 text-sm font-bold tabular-nums', lethal ? 'text-red-300' : danger ? 'text-amber-300' : 'text-foreground')}>
                            {row.amount}<span className="text-xs font-normal text-muted-foreground">/{COMMANDER_DAMAGE_LETHAL}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted/40">
                          <div className={cn('h-full rounded-full transition-[width] duration-500', lethal ? 'bg-red-500' : danger ? 'bg-amber-400' : 'bg-gold/70')} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Zones */}
          <section className="border-t border-border/40 px-4 py-3 sm:px-5">
            <div className="mb-3 flex items-center gap-1 rounded-lg border border-border/50 bg-background/40 p-1" role="tablist" aria-label="Zone">
              {([['graveyard', 'Graveyard', Skull, counts.graveyard], ['exile', 'Exile', Ban, counts.exile], ['command', 'Command', Crown, counts.command]] as const).map(([key, label, Icon, n]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => { setTab(key); setReading(null); }}
                  className={cn('flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors', tab === key ? 'bg-gold text-gold-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                  <Icon className="h-3.5 w-3.5" /> {label} <span className={cn('text-xs tabular-nums', tab === key ? 'opacity-80' : 'opacity-60')}>{n}</span>
                </button>
              ))}
            </div>

            <div className={cn('flex gap-3', narrow ? 'flex-col' : 'flex-row')}>
              <div className="min-w-0 flex-1">
                {zoneCards.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                    {tab === 'graveyard' ? 'Nothing in the graveyard.' : tab === 'exile' ? 'Nothing in exile.' : isMe ? 'Your commander is on the battlefield.' : 'Their commander is on the battlefield.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2" role="list" aria-label={`${tab} cards`}>
                    {/* Newest last in the zone order; show newest first so the last thing that died is first. */}
                    {[...zoneCards].reverse().map((card) => (
                      <div key={card.instanceId} role="listitem">
                        <CardView card={card} mode="art" size={cardSize} preview={false} onClick={() => setReading(card)} selected={reading?.instanceId === card.instanceId} />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reader */}
              <AnimatePresence>
                {reading && (
                  <motion.aside
                    key={reading.instanceId}
                    initial={{ opacity: 0, x: narrow ? 0 : 12, y: narrow ? 8 : 0 }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className={cn('shrink-0 rounded-xl border border-border/50 bg-black/40 p-3', narrow ? 'w-full' : 'w-[240px]')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-base font-bold leading-tight">{reading.cardData.name}</p>
                      <button type="button" onClick={() => setReading(null)} aria-label="Close reader" className="shrink-0 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                    </div>
                    {reading.cardData.manaCost && <ManaCostDisplay manaCost={reading.cardData.manaCost} size="sm" className="mt-1" />}
                    {reading.cardData.typeLine && <p className="mt-1 text-xs italic text-sky-300/70">{reading.cardData.typeLine}</p>}
                    {(reading.cardData.imageUris?.normal || reading.cardData.cardFaces?.[0]?.imageUris?.normal) && (
                      <div className="relative mt-2 aspect-[488/680] w-full overflow-hidden rounded-[5.5%]">
                        <Image src={(reading.cardData.imageUris?.normal || reading.cardData.cardFaces?.[0]?.imageUris?.normal)!} alt={reading.cardData.name} fill sizes="240px" className="object-cover" unoptimized />
                      </div>
                    )}
                    {reading.cardData.oracleText && (
                      <div className="scroll-thin mt-2 max-h-[30vh] overflow-y-auto text-[13px] text-foreground/90">
                        <OracleText text={reading.cardData.oracleText} />
                      </div>
                    )}
                    {reading.cardData.power != null && (
                      <p className="mt-2 text-sm font-bold">{reading.cardData.power}/{reading.cardData.toughness}</p>
                    )}
                  </motion.aside>
                )}
              </AnimatePresence>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Tile({ icon: Icon, label, value, sub, tone, className }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; tone?: 'warn' | 'danger'; className?: string }) {
  return (
    <div className={cn('plaque flex flex-col rounded-lg px-2.5 py-2', className)}>
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" /> {label}</span>
      <span className={cn('font-display text-xl font-bold tabular-nums leading-tight', tone === 'danger' ? 'text-red-300' : tone === 'warn' ? 'text-green-400' : 'text-foreground')}>
        {value}{sub && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{sub}</span>}
      </span>
    </div>
  );
}
