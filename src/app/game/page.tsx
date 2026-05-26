'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDeckStore } from '@/store/deckStore';
import { useForgeGameStore } from '@/store/forgeGameStore';
import { FORGE_SERVER_URL } from '@/lib/forgeConfig';
import { ArrowLeft, Swords, Bot, Loader2, AlertCircle, WifiOff } from 'lucide-react';

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
    deckList.push(`${entry.quantity} ${entry.cardName}`);
  }

  return { deckList, commander };
}

export default function GameSetupPage() {
  const router = useRouter();
  const { decks } = useDeckStore();
  const { connect, startGame, connectionStatus } = useForgeGameStore();
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [aiCount, setAiCount] = useState(1);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const selectedDeck = decks.find((d) => d.id === selectedDeckId);
  const canStart = selectedDeckId !== null || decks.length === 0;

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
            {decks.length === 0 ? (
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
          onClick={async () => {
            setStarting(true);
            setStartError(null);

            try {
              // Connect to Forge server if not already connected
              if (connectionStatus !== 'connected') {
                await connect(FORGE_SERVER_URL);
              }

      // Build deck list from selected deck, or use a demo deck
      let allDecks: Array<{ deckList: string[]; commander?: string }>;

      if (selectedDeck) {
        const myForgeDeck = buildForgeDeck(selectedDeck);

        allDecks = aiCount === 0 ? [myForgeDeck] : [
          myForgeDeck, // Player's deck FIRST in array
          ...Array(aiCount).fill({ deckList: Array(42).fill('1 Goblin Gullet'), commander: 'Goblin Gullet' }), // AI opponents
        ];
      } else {
        // Demo deck for player, and dummy decks for AIs
        const demoDeck = { deckList: buildGoblinDemo(), commander: 'Krenko, Mob Boss' };

        allDecks = aiCount === 0 ? [demoDeck] : [
          demoDeck, // Player's deck FIRST in array
          ...Array(aiCount).fill({ deckList: Array(42).fill('1 Goblin Gullet'), commander: 'Goblin Gullet' }), // AI opponents
        ];
      }

      console.log('[Game Setup] Starting game with', aiCount === 0 ? 'solo mode' : `${allDecks.length} players`, `- commanders:`, allDecks.map(d => d.commander || 'Goblin Gullet'));

      // Send start_game to server - player's deck is first in allDecks array
      startGame(allDecks[0].deckList, allDecks[0].commander ?? undefined, 'Player', aiCount);

      setTimeout(() => router.push('/game/forge'), 500);
    } catch (e) {
              setStartError(e instanceof Error ? e.message : 'Failed to connect to game server');
              setStarting(false);
            }
          }}
        >
          {starting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Connecting...</>
          ) : (
            <><Swords className="h-5 w-5" /> Start Game</>
          )}
        </Button>

        {startError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>{startError}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-xs"
              onClick={() => { setStartError(null); setStarting(false); }}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Quick start without a deck */}
        {decks.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            No deck selected — a demo deck will be used.
          </p>
        )}
      </main>
    </div>
  );
}
