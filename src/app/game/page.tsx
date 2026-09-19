'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useDeckStore } from '@/store/deckStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { FORGE_SERVER_URL, prewarmForgeServer } from '@/lib/forgeConfig';
import { pickRandomAIDeck, aiDeckToForgeFormat } from '@/lib/aiDecks';
import { Swords, Bot, Loader2, AlertCircle, WifiOff } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { Keystone } from '@/components/brand/Keystone';
import { cn } from '@/lib/utils';
import { Crown, Check } from 'lucide-react';

/**
 * Forge game client for WebSocket communication.
 */

/**
 * Build a simple Goblin demo deck string list - Krenko + lands + goblins
 */
function buildGoblinDemo(): string[] {
  const base = ['1 Goblin Guide', '1 Monastery Swiftspear', '1 Goblin Rabblemaster',
    '1 Goblin Chieftain', '1 Siege-Gang Commander', '1 Skirk Prospector',
    '1 Goblin Warchief', '1 Mogg War Marshal', '1 Goblin Chainwhirler'];
  return [...base, ...Array(38).fill('1 Mountain')];
}

/**
 * Convert a user deck from the store into the "N CardName" format.
 */
function buildForgeDeck(deck: ReturnType<typeof useDeckStore.getState>['decks'][0]) {
  const deckList: string[] = [];
  let commander: string | undefined;

  if (deck.commanderName) {
    commander = deck.commanderName;
  }

  for (const entry of deck.cards) {
    // Skip the commander line if it's also in the main list
    if (commander && entry.cardName === commander) continue;
    // Use forgeName if the card needed a substitution (e.g., reprint → original)
    const name = entry.forgeName || entry.cardName;
    deckList.push(`${entry.quantity} ${name}`);
  }

  return { deckList, commander };
}

export default function GameSetupPage() {
  return <AuthGuard><GameSetupContent /></AuthGuard>;
}

function GameSetupContent() {
  const router = useRouter();
  const { decks, isSyncing } = useDeckStore();
  const { connect, startGame, connectionStatus } = useForgeGameStore();
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [aiCount, setAiCount] = useState(1);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [connectPhase, setConnectPhase] = useState('Connecting...');
  const selectedDeck = decks.find((d) => d.id === selectedDeckId);
  // While decks are still loading from Firestore we must not treat "none" as "none exist".
  const canStart = selectedDeckId !== null || (decks.length === 0 && !isSyncing);

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

      const usedNames: string[] = [];
      const aiDecks = Array.from({ length: aiCount }, () => {
        const picked = pickRandomAIDeck(usedNames);
        usedNames.push(picked.name);
        return aiDeckToForgeFormat(picked);
      });

      let allDecks: Array<{ deckList: string[]; commander?: string }>;
      if (selectedDeck) {
        allDecks = [buildForgeDeck(selectedDeck), ...aiDecks];
      } else if (decks.length === 0) {
        allDecks = [{ deckList: buildGoblinDemo(), commander: 'Krenko, Mob Boss' }, ...aiDecks];
      } else {
        throw new Error('Please select a deck to continue.');
      }

      setConnectPhase('Dealing opening hands...');
      const playerDeck = allDecks[0];
      startGame(
        playerDeck.deckList,
        playerDeck.commander ?? undefined,
        'Player',
        aiCount,
        allDecks.slice(1),
      );
      setTimeout(() => router.push('/game/forge'), 500);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Failed to connect to game server.');
      setStarting(false);
    } finally {
      clearTimeout(slow);
      clearTimeout(slower);
    }
  }, [aiCount, connect, connectionStatus, decks.length, router, selectedDeck, startGame]);

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
                return (
                  <button
                    key={deck.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedDeckId(deck.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                      selected
                        ? 'border-gold/60 bg-gold/[0.07] shadow-[0_0_24px_var(--gold-glow-soft)]'
                        : 'border-border/50 hover:border-border hover:bg-card/60'
                    )}
                  >
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1', selected ? 'bg-gold text-gold-foreground ring-gold/60' : 'bg-gold/10 text-gold ring-gold/20')}>
                      {selected ? <Check className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
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
              {[1, 2, 3].map((count) => (
                <button
                  key={count}
                  role="radio"
                  aria-checked={aiCount === count}
                  onClick={() => setAiCount(count)}
                  className={cn(
                    'flex h-11 w-14 items-center justify-center rounded-lg font-display text-xl font-bold transition-all',
                    aiCount === count ? 'bg-gold text-gold-foreground shadow-[0_0_20px_var(--gold-glow)]' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4 text-gold/70" />
              {aiCount === 1 ? 'Head to head' : aiCount === 2 ? 'Three-player pod' : 'Full four-player pod'}
            </div>
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
    </div>
  );
}
