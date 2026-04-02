'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useDeckStore } from '@/store/deckStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { CardDatabase, scryfallToCardData } from '@/cards/CardDatabase';
import type { CardData } from '@/engine/types';
import type { AIPlayerConfig } from '@/ai/types';
import { ArrowLeft, Swords, Bot, Loader2, AlertCircle } from 'lucide-react';

const AI_NAMES = ['Archmage Niv', 'Elara the Wise', 'Grothak Ironscale'];

// Generate a simple test deck of basic lands + vanilla creatures for demo purposes
// In production this will resolve from the Scryfall IndexedDB cache
function generateTestDeck(colorIdentity: string): CardData[] {
  const cards: CardData[] = [];
  const base: Omit<CardData, 'name' | 'typeLine' | 'manaCost' | 'cmc' | 'colors' | 'colorIdentity' | 'power' | 'toughness' | 'oracleText'> = {
    scryfallId: '',
    oracleId: '',
    keywords: [],
    layout: 'normal',
    legalities: { commander: 'legal' },
    producedMana: undefined,
    imageUris: undefined,
    cardFaces: undefined,
  };

  // Commander
  cards.push({
    ...base,
    scryfallId: `cmd-${colorIdentity}`,
    name: `Test Commander (${colorIdentity})`,
    typeLine: 'Legendary Creature — Human Wizard',
    manaCost: `{${colorIdentity}}{${colorIdentity}}{3}`,
    cmc: 5,
    colors: [colorIdentity] as CardData['colors'],
    colorIdentity: [colorIdentity] as CardData['colorIdentity'],
    power: '4',
    toughness: '4',
    oracleText: 'Vigilance',
    keywords: ['Vigilance'],
  });

  // 38 basic lands
  const landNames: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
  const landName = landNames[colorIdentity] || 'Plains';
  for (let i = 0; i < 38; i++) {
    cards.push({
      ...base,
      scryfallId: `land-${colorIdentity}-${i}`,
      name: landName,
      typeLine: `Basic Land — ${landName}`,
      manaCost: '',
      cmc: 0,
      colors: [],
      colorIdentity: [colorIdentity] as CardData['colorIdentity'],
      power: undefined,
      toughness: undefined,
      oracleText: `{T}: Add {${colorIdentity}}.`,
      producedMana: [colorIdentity],
    });
  }

  // Fill remaining with simple creatures at various costs
  const creatureTemplates = [
    { cost: 1, p: '1', t: '1', count: 8 },
    { cost: 2, p: '2', t: '2', count: 12 },
    { cost: 3, p: '3', t: '3', count: 10 },
    { cost: 4, p: '4', t: '3', count: 8 },
    { cost: 5, p: '5', t: '5', count: 6 },
    { cost: 6, p: '6', t: '6', count: 5 },
    { cost: 7, p: '7', t: '7', count: 4 },
    { cost: 8, p: '8', t: '8', count: 3 },
    { cost: 9, p: '10', t: '10', count: 2 },
    { cost: 10, p: '12', t: '12', count: 3 },
  ];

  let idx = 0;
  for (const tmpl of creatureTemplates) {
    for (let i = 0; i < tmpl.count; i++) {
      cards.push({
        ...base,
        scryfallId: `creature-${colorIdentity}-${idx}`,
        name: `${landName} ${tmpl.cost === 1 ? 'Scout' : tmpl.cost <= 3 ? 'Warrior' : tmpl.cost <= 5 ? 'Knight' : 'Champion'} (${tmpl.p}/${tmpl.t}) #${idx + 1}`,
        typeLine: 'Creature — Human Soldier',
        manaCost: `{${colorIdentity}}${tmpl.cost > 1 ? `{${tmpl.cost - 1}}` : ''}`,
        cmc: tmpl.cost,
        colors: [colorIdentity] as CardData['colors'],
        colorIdentity: [colorIdentity] as CardData['colorIdentity'],
        power: tmpl.p,
        toughness: tmpl.t,
        oracleText: '',
      });
      idx++;
    }
  }

  return cards.slice(0, 100); // Commander decks are 100 cards
}

export default function GameSetupPage() {
  const router = useRouter();
  const { decks } = useDeckStore();
  const { initGame } = useGameStore();
  const { aiProvider } = useSettingsStore();
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [aiCount, setAiCount] = useState(3);
  const [starting, setStarting] = useState(false);

  const { cardDataLoaded, setCardDataLoaded } = useSettingsStore();
  const [hasCardData, setHasCardData] = useState(cardDataLoaded);
  const selectedDeck = decks.find((d) => d.id === selectedDeckId);

  // Verify IndexedDB has card data on mount (syncs stale persisted flag)
  useEffect(() => {
    CardDatabase.getInstance().isLoaded().then((loaded) => {
      setHasCardData(loaded);
      if (loaded && !cardDataLoaded) setCardDataLoaded(loaded);
    });
  }, [cardDataLoaded, setCardDataLoaded]);
  const canStart = selectedDeckId !== null || decks.length === 0; // Allow demo mode if no decks

  /**
   * Resolve a user deck's card entries into CardData[] from IndexedDB.
   * Falls back to test deck if resolution fails.
   */
  async function resolveUserDeck(deckId: string): Promise<CardData[]> {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return generateTestDeck('W');

    const cardDb = CardDatabase.getInstance();
    const resolvedMap = await cardDb.resolveCardNames(
      deck.cards.map((c) => c.cardName)
    );

    const cardDataList: CardData[] = [];
    for (const entry of deck.cards) {
      const scryfall = resolvedMap.get(entry.cardName);
      if (scryfall) {
        const data = scryfallToCardData(scryfall);
        for (let i = 0; i < entry.quantity; i++) {
          cardDataList.push(data);
        }
      }
    }

    // If we got less than 60 cards, pad with basic lands
    if (cardDataList.length < 60) {
      const padding = generateTestDeck('W');
      while (cardDataList.length < 100 && padding.length > 0) {
        cardDataList.push(padding.shift()!);
      }
    }

    return cardDataList.slice(0, 100);
  }

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
              Commander is a 4-player format. Choose how many AI opponents.
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

        {/* Start */}
        <Button
          size="lg"
          disabled={!canStart || starting}
          className="w-full gap-2"
          onClick={async () => {
            setStarting(true);

            const humanId = 'player-human';
            const colorPool = ['W', 'U', 'B', 'R', 'G'];

            const players = [
              { id: humanId, name: 'You', isAI: false },
              ...Array.from({ length: aiCount }, (_, i) => ({
                id: `ai-${i}`,
                name: AI_NAMES[i] || `AI ${i + 1}`,
                isAI: true,
              })),
            ];

            // Build decks map
            const deckMap = new Map<string, CardData[]>();

            // Human deck — resolve from IndexedDB if a real deck is selected, else test deck
            if (selectedDeckId && hasCardData) {
              const resolvedDeck = await resolveUserDeck(selectedDeckId);
              deckMap.set(humanId, resolvedDeck);
            } else {
              const humanColor = colorPool[0];
              deckMap.set(humanId, generateTestDeck(humanColor));
            }

            // AI decks (always test decks for now)
            for (let i = 0; i < aiCount; i++) {
              const color = colorPool[(i + 1) % colorPool.length];
              deckMap.set(`ai-${i}`, generateTestDeck(color));
            }

            // AI configs
            const aiConfigs: AIPlayerConfig[] = Array.from(
              { length: aiCount },
              (_, i) => ({
                playerId: `ai-${i}`,
                name: AI_NAMES[i] || `AI ${i + 1}`,
                personality: 'balanced',
                providerConfig: aiProvider || undefined,
                useFallback: !aiProvider,
              })
            );

            initGame(players, deckMap, aiConfigs);
            router.push('/game/play');
          }}
        >
          {starting ? (
            <><Loader2 className="h-5 w-5 animate-spin" /> Starting...</>
          ) : (
            <><Swords className="h-5 w-5" /> Start Game ({aiCount + 1} players)</>
          )}
        </Button>

        {/* Quick start without a deck */}
        {decks.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            No deck selected — a test deck will be generated for demo purposes.
          </p>
        )}
      </main>
    </div>
  );
}
