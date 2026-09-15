'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDeckStore } from '@/store/deckStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { FORGE_SERVER_URL, prewarmForgeServer } from '@/lib/forgeConfig';
import { pickRandomAIDeck, aiDeckToForgeFormat, AI_DECKS } from '@/lib/aiDecks';
import { ArrowLeft, Swords, Bot, Loader2, AlertCircle, WifiOff } from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';

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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border/50 px-6 py-4">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <h2 className="text-lg font-semibold tracking-tight">New Game</h2>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
        {/* Deck Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Swords className="h-5 w-5 text-gold" />
              Select Your Deck
            </CardTitle>
            <CardDescription>
              Choose a Commander deck to play with.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSyncing && decks.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your decks...
              </div>
            ) : decks.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No decks yet. Import or create one first.
                </p>
                <Link href="/decks">
                  <Button variant="secondary" size="sm">
                    Go to Decks
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-2">
                {decks.map((deck) => {
                  const hasResolution = deck.resolvedCount > 0 || deck.unresolvedCount > 0;
                  const fullyResolved = hasResolution && deck.unresolvedCount === 0;
                  return (
                    <button
                      key={deck.id}
                      onClick={() => setSelectedDeckId(deck.id)}
                      className={`flex items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                        selectedDeckId === deck.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border/50 hover:border-border'
                      }`}
                    >
                      <div>
                        <p className="font-medium">{deck.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {deck.commanderName || 'No commander'} &middot;{' '}
                          {deck.totalCards || deck.cards.reduce((s, c) => s + c.quantity, 0)} cards
                          {hasResolution && (
                            <span className={fullyResolved ? 'text-green-500' : 'text-amber-500'}>
                              {' '}&middot; {fullyResolved ? 'All resolved' : `${deck.unresolvedCount} unresolved`}
                            </span>
                          )}
                        </p>
                      </div>
                      {hasResolution && !fullyResolved && (
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Opponents */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-gold" />
              AI Opponents
            </CardTitle>
            <CardDescription>
              Choose how many AI opponents to play against.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {[1, 2, 3].map((count) => (
                <button
                  key={count}
                  onClick={() => setAiCount(count)}
                  className={`flex h-12 w-12 items-center justify-center rounded-lg border text-lg font-semibold transition-colors ${
                    aiCount === count
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/50 text-muted-foreground hover:border-border'
                  }`}
                >
                  {count}
                </button>
              ))}
              <span className="text-sm text-muted-foreground">
                AI player{aiCount !== 1 ? 's' : ''}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Start Game */}
        <Button
          size="lg"
          disabled={!canStart || starting}
          className="w-full gap-2"
          onClick={handleStartGame}
        >
          {starting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> {connectPhase}</>
          ) : (
            <><Swords className="h-5 w-5" /> Start Game</>
          )}
        </Button>

        {/* Say why the button is dead, instead of just disabling it. */}
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
              <Button variant="ghost" size="sm" className="text-xs" onClick={handleStartGame}>
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => { setStartError(null); setStarting(false); }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Quick start without a deck */}
        {decks.length === 0 && !isSyncing && (
          <p className="text-center text-xs text-muted-foreground">
            No deck selected — a demo deck will be used.
          </p>
        )}
      </main>
    </div>
  );
}
