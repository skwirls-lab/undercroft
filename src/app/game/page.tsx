'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDeckStore, type Deck } from '@/store/deckStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { FORGE_SERVER_URL, prewarmForgeServer } from '@/lib/forgeConfig';
import { AI_DECKS } from '@/lib/aiDecks';
import { SURPRISE, describeChoice, resolveOpponents, vaultDeckPlayableByAI, vaultDeckToForge, type OpponentChoice } from '@/lib/opponentDecks';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useCardRecords } from '@/hooks/useCardRecords';
import { frontFace } from '@/lib/deckCards';
import { Swords, Bot, Loader2, AlertCircle, WifiOff, Crown, Check, Dices, Library, Lock, ChevronRight } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { Keystone } from '@/components/brand/Keystone';
import { ManaSymbol } from '@/components/game/ManaSymbol';
import { cn } from '@/lib/utils';

/**
 * Build a simple Goblin demo deck string list - Krenko + lands + goblins
 */
function buildGoblinDemo(): string[] {
  const base = ['1 Goblin Guide', '1 Monastery Swiftspear', '1 Goblin Rabblemaster',
    '1 Goblin Chieftain', '1 Siege-Gang Commander', '1 Skirk Prospector',
    '1 Goblin Warchief', '1 Mogg War Marshal', '1 Goblin Chainwhirler'];
  return [...base, ...Array(38).fill('1 Mountain')];
}

export default function GameSetupPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <GameSetupContent />
      </Suspense>
    </AuthGuard>
  );
}

function GameSetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { decks, isSyncing } = useDeckStore();
  const { connect, startGame, connectionStatus } = useForgeGameStore();
  const { can } = useEntitlements();

  // `?deck=` arrives from a deck's Play button. It preselects; the player can still change it.
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(() => searchParams.get('deck'));
  const [aiCount, setAiCount] = useState(1);
  const [opponents, setOpponents] = useState<OpponentChoice[]>([SURPRISE, SURPRISE, SURPRISE]);
  const [pickerSeat, setPickerSeat] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [connectPhase, setConnectPhase] = useState('Connecting...');

  const selectedDeck = decks.find((d) => d.id === selectedDeckId);
  // While decks are still loading from Firestore we must not treat "none" as "none exist".
  const canStart = !!selectedDeck || (decks.length === 0 && !isSyncing);
  const canCustomOpponents = can('ai.customDecks');
  const canFourPlayer = can('game.fourPlayer');

  const commanderNames = useMemo(() => decks.map((d) => d.commanderName).filter(Boolean), [decks]);
  const { records } = useCardRecords(commanderNames);
  const artFor = (deck: Deck) => (deck.commanderName && records.get(deck.commanderName) ? frontFace(records.get(deck.commanderName)!).art : undefined);

  // The Forge server sleeps when idle on Railway. Nudge it awake as soon as the player reaches
  // this screen so the container is usually warm by the time they press Start.
  useEffect(() => { prewarmForgeServer(); }, []);

  const handleStartGame = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    setConnectPhase('Connecting...');

    // Escalate the copy while a cold start is in progress, so a long wait reads as expected
    // behaviour rather than a hang.
    const slow = setTimeout(() => setConnectPhase('Waking the game server...'), 3000);
    const slower = setTimeout(() => setConnectPhase('Still waking (first launch is slow)...'), 12000);

    try {
      if (connectionStatus !== 'connected') {
        await connect(FORGE_SERVER_URL);
      }

      const aiDecks = resolveOpponents(opponents.slice(0, aiCount), decks);

      let playerDeck: { deckList: string[]; commander?: string };
      if (selectedDeck) {
        playerDeck = vaultDeckToForge(selectedDeck);
      } else if (decks.length === 0) {
        playerDeck = { deckList: buildGoblinDemo(), commander: 'Krenko, Mob Boss' };
      } else {
        throw new Error('Please select a deck to continue.');
      }

      setConnectPhase('Dealing opening hands...');
      startGame(playerDeck.deckList, playerDeck.commander ?? undefined, 'Player', aiCount, aiDecks);
      setTimeout(() => router.push('/game/forge'), 500);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Failed to connect to game server.');
      setStarting(false);
    } finally {
      clearTimeout(slow);
      clearTimeout(slower);
    }
  }, [aiCount, connect, connectionStatus, decks, opponents, router, selectedDeck, startGame]);

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-3xl flex-col gap-1.5 px-5 pb-4 pt-8 sm:px-10 sm:pt-12">
        <p className="eyebrow">Shuffle up</p>
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">New Game</h1>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-10 sm:px-10">
        {/* Deck Selection */}
        <Alcove className="px-5 pb-5 pt-12 sm:px-6">
          <Eyebrow className="mx-1 mb-4">Your deck</Eyebrow>
          {isSyncing && decks.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your decks...
            </div>
          ) : decks.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">No decks yet. A demo deck will be used, or import one first.</p>
              <Link href="/decks">
                <Button variant="outline" size="sm" className="border-gold/30 text-gold hover:bg-gold/10 hover:text-gold">Go to Decks</Button>
              </Link>
            </div>
          ) : (
            <div className="grid gap-2" role="radiogroup" aria-label="Your deck">
              {decks.map((deck) => {
                const hasResolution = deck.resolvedCount > 0 || deck.unresolvedCount > 0;
                const fullyResolved = hasResolution && deck.unresolvedCount === 0;
                const selected = selectedDeckId === deck.id;
                const art = artFor(deck);
                return (
                  <button
                    key={deck.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedDeckId(deck.id)}
                    className={cn(
                      'relative flex items-center gap-3 overflow-hidden rounded-xl border p-3 text-left transition-all',
                      selected
                        ? 'border-gold/60 bg-gold/[0.07] shadow-[0_0_24px_var(--gold-glow-soft)]'
                        : 'border-border/50 hover:border-border hover:bg-card/60'
                    )}
                  >
                    <div className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1', selected ? 'bg-gold text-gold-foreground ring-gold/60' : 'bg-gold/10 text-gold ring-gold/20')}>
                      {art && !selected && <Image src={art} alt="" fill sizes="40px" className="object-cover opacity-80" unoptimized />}
                      <span className="relative">{selected ? <Check className="h-5 w-5" /> : art ? null : <Crown className="h-5 w-5" />}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{deck.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {deck.commanderName || 'No commander'} &middot; {deck.totalCards || deck.cards.reduce((sum, c) => sum + c.quantity, 0)} cards
                        {hasResolution && (
                          <span className={fullyResolved ? 'text-green-400' : 'text-amber-400'}>
                            {' '}&middot; {fullyResolved ? 'Ready' : `${deck.unresolvedCount} unresolved`}
                          </span>
                        )}
                      </p>
                    </div>
                    {hasResolution && !fullyResolved && <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />}
                  </button>
                );
              })}
            </div>
          )}
        </Alcove>

        {/* AI Opponents */}
        <Alcove className="px-5 pb-5 pt-12 sm:px-6">
          <Eyebrow className="mx-1 mb-4">Opponents</Eyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl border border-border/50 bg-background/40 p-1" role="radiogroup" aria-label="Number of AI opponents">
              {[1, 2, 3].map((count) => {
                const locked = count === 3 && !canFourPlayer;
                return (
                  <button
                    key={count}
                    role="radio"
                    aria-checked={aiCount === count}
                    disabled={locked}
                    title={locked ? 'Four-player pods are a Patron feature' : undefined}
                    onClick={() => setAiCount(count)}
                    className={cn(
                      'flex h-11 w-14 items-center justify-center rounded-lg font-display text-xl font-bold transition-all',
                      aiCount === count ? 'bg-gold text-gold-foreground shadow-[0_0_20px_var(--gold-glow)]' : 'text-muted-foreground hover:text-foreground',
                      locked && 'opacity-40'
                    )}
                  >
                    {locked ? <Lock className="h-4 w-4" /> : count}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4 text-gold/70" />
              {aiCount === 1 ? 'Head to head' : aiCount === 2 ? 'Three-player pod' : 'Full four-player pod'}
            </div>
          </div>

          {/* One row per seat: what it plays, and a way to change it */}
          <div className="mt-4 grid gap-2">
            {Array.from({ length: aiCount }, (_, i) => {
              const choice = opponents[i];
              const desc = describeChoice(choice, decks);
              const vaultDeck = choice.kind === 'vault' ? decks.find((d) => d.id === choice.deckId) : undefined;
              const art = vaultDeck ? artFor(vaultDeck) : undefined;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => canCustomOpponents && setPickerSeat(i)}
                  disabled={!canCustomOpponents}
                  title={canCustomOpponents ? undefined : 'Choosing opponent decks is a Patron feature'}
                  data-dev-seat={i}
                  className="group flex items-center gap-3 rounded-xl border border-border/50 p-3 text-left transition-all hover:border-gold/40 hover:bg-card/60 disabled:cursor-not-allowed disabled:hover:border-border/50 disabled:hover:bg-transparent"
                >
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40 text-muted-foreground ring-1 ring-border/60">
                    {art && <Image src={art} alt="" fill sizes="40px" className="object-cover opacity-80" unoptimized />}
                    {!art && (choice.kind === 'surprise' ? <Dices className="h-5 w-5" /> : <Bot className="h-5 w-5" />)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Opponent {i + 1}</p>
                    <p className="truncate font-semibold">{desc.title}</p>
                    <p className="truncate text-sm text-muted-foreground">{desc.subtitle}</p>
                  </div>
                  {canCustomOpponents ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-gold opacity-80 transition-opacity group-hover:opacity-100">Change <ChevronRight className="h-3.5 w-3.5" /></span>
                  ) : (
                    <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })}
          </div>
        </Alcove>

        {/* Start Game */}
        <Button
          size="lg"
          disabled={!canStart || starting}
          className="h-14 w-full gap-2.5 rounded-xl bg-gold text-base font-bold text-gold-foreground shadow-[0_0_32px_var(--gold-glow)] hover:bg-gold/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none"
          onClick={handleStartGame}
        >
          {starting ? (
            <><Keystone size={28} loading /> {connectPhase}</>
          ) : (
            <><Swords className="h-5 w-5" /> Start Game</>
          )}
        </Button>

        {!canStart && !starting && (
          <p className="text-center text-xs text-muted-foreground">
            {isSyncing ? 'Loading your decks...' : 'Select a deck above to continue.'}
          </p>
        )}

        {startError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span className="min-w-0">{startError}</span>
            <div className="ml-auto flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" className="text-xs" onClick={handleStartGame}>Retry</Button>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setStartError(null); setStarting(false); }}>Dismiss</Button>
            </div>
          </div>
        )}

        {decks.length === 0 && !isSyncing && (
          <p className="text-center text-xs text-muted-foreground">No deck selected — a demo deck will be used.</p>
        )}
      </main>

      <OpponentPicker
        seat={pickerSeat}
        current={pickerSeat !== null ? opponents[pickerSeat] : null}
        vault={decks}
        artFor={artFor}
        onClose={() => setPickerSeat(null)}
        onPick={(choice) => {
          if (pickerSeat === null) return;
          setOpponents((prev) => prev.map((c, i) => (i === pickerSeat ? choice : c)));
          setPickerSeat(null);
        }}
      />
    </div>
  );
}

// ─── Opponent picker ─────────────────────────────────────────────────────────

interface OpponentPickerProps {
  seat: number | null;
  current: OpponentChoice | null;
  vault: Deck[];
  artFor: (deck: Deck) => string | undefined;
  onClose: () => void;
  onPick: (choice: OpponentChoice) => void;
}

/**
 * What one AI seat plays. Three sections: leave it to chance, one of the house decks, or a
 * deck from the vault — including the one you are about to play, if a mirror is the test.
 */
function OpponentPicker({ seat, current, vault, artFor, onClose, onPick }: OpponentPickerProps) {
  const playable = vault.filter(vaultDeckPlayableByAI);
  const unplayable = vault.length - playable.length;
  const isCurrent = (c: OpponentChoice) =>
    !!current && current.kind === c.kind &&
    (c.kind === 'surprise' || (c.kind === 'house' && current.kind === 'house' && current.name === c.name) || (c.kind === 'vault' && current.kind === 'vault' && current.deckId === c.deckId));

  return (
    <Dialog open={seat !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-dev-picker>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Opponent {seat !== null ? seat + 1 : ''} plays…</DialogTitle>
          <DialogDescription>Test your brew against a known matchup, or let the dice decide.</DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 flex-col gap-5">
          <PickRow
            icon={<Dices className="h-5 w-5" />}
            title="Surprise me"
            subtitle="A random house deck, different from the other seats"
            selected={isCurrent(SURPRISE)}
            onClick={() => onPick(SURPRISE)}
          />

          <section className="flex flex-col gap-2">
            <Eyebrow>House decks</Eyebrow>
            {AI_DECKS.map((d) => (
              <PickRow
                key={d.name}
                icon={<span className="flex items-center gap-0.5">{d.colors.split('').map((c) => <ManaSymbol key={c} symbol={c} size="sm" />)}</span>}
                title={d.name}
                subtitle={`${d.commander} — ${d.strategy}`}
                selected={isCurrent({ kind: 'house', name: d.name })}
                onClick={() => onPick({ kind: 'house', name: d.name })}
              />
            ))}
          </section>

          <section className="flex flex-col gap-2">
            <Eyebrow>Your vault</Eyebrow>
            {playable.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/60 px-4 py-5 text-center text-sm text-muted-foreground">
                {vault.length === 0 ? 'No decks in the vault yet.' : 'A deck needs a commander before an AI can pilot it.'}
              </p>
            ) : (
              playable.map((d) => (
                <PickRow
                  key={d.id}
                  art={artFor(d)}
                  icon={<Library className="h-5 w-5" />}
                  title={d.name}
                  subtitle={`${d.commanderName} · ${d.totalCards || d.cards.reduce((s, c) => s + c.quantity, 0)} cards${d.unresolvedCount > 0 ? ` · ${d.unresolvedCount} unresolved` : ''}`}
                  selected={isCurrent({ kind: 'vault', deckId: d.id })}
                  onClick={() => onPick({ kind: 'vault', deckId: d.id })}
                />
              ))
            )}
            {unplayable > 0 && playable.length > 0 && (
              <p className="px-1 text-xs text-muted-foreground">{unplayable} deck{unplayable === 1 ? '' : 's'} hidden: no commander set.</p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickRow({ icon, art, title, subtitle, selected, onClick }: { icon: React.ReactNode; art?: string; title: string; subtitle: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-all',
        selected ? 'border-gold/60 bg-gold/[0.07] shadow-[0_0_20px_var(--gold-glow-soft)]' : 'border-border/50 hover:border-gold/40 hover:bg-card/60'
      )}
    >
      <div className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1', selected ? 'bg-gold text-gold-foreground ring-gold/60' : 'bg-muted/40 text-muted-foreground ring-border/60')}>
        {art && !selected && <Image src={art} alt="" fill sizes="40px" className="object-cover opacity-80" unoptimized />}
        <span className="relative">{selected ? <Check className="h-5 w-5" /> : art ? null : icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-foreground">{title}</p>
        <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </button>
  );
}
