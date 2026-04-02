'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useDeckStore, type DeckEntry } from '@/store/deckStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuth } from '@/lib/firebase/auth';
import { CardDatabase } from '@/cards/CardDatabase';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Search,
  Cloud,
  CloudOff,
  LogIn,
} from 'lucide-react';

export default function DecksPage() {
  const { decks, removeDeck, importDeckFromText, updateDeck, isSyncing, syncedUserId } = useDeckStore();
  const { cardDataLoaded } = useSettingsStore();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckText, setDeckText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    resolved: number;
    unresolved: string[];
    total: number;
  } | null>(null);

  const handleImport = useCallback(async () => {
    if (!deckName.trim() || !deckText.trim()) return;
    setImporting(true);
    setImportResult(null);

    try {
      // Parse and create the deck first
      const deck = importDeckFromText(deckText, deckName);

      // If card data is loaded, resolve card names against IndexedDB
      if (cardDataLoaded) {
        const cardDb = CardDatabase.getInstance();
        const uniqueNames = [...new Set(deck.cards.map((c) => c.cardName))];
        const resolved = await cardDb.resolveCardNames(uniqueNames);

        // Update each card entry with resolution status
        const updatedCards: DeckEntry[] = deck.cards.map((entry) => {
          const card = resolved.get(entry.cardName);
          return {
            ...entry,
            resolved: card !== null && card !== undefined,
            scryfallId: card?.id,
          };
        });

        const resolvedCount = updatedCards.filter((c) => c.resolved).length;
        const unresolvedNames = updatedCards
          .filter((c) => !c.resolved)
          .map((c) => c.cardName);
        const uniqueUnresolved = [...new Set(unresolvedNames)];

        updateDeck(deck.id, {
          cards: updatedCards,
          resolvedCount,
          unresolvedCount: uniqueUnresolved.length,
        });

        setImportResult({
          resolved: resolvedCount,
          unresolved: uniqueUnresolved,
          total: updatedCards.length,
        });
      } else {
        setImportResult({
          resolved: 0,
          unresolved: [],
          total: deck.cards.length,
        });
      }
    } finally {
      setImporting(false);
    }
  }, [deckName, deckText, cardDataLoaded, importDeckFromText, updateDeck]);

  const handleResolve = useCallback(async (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;

    const cardDb = CardDatabase.getInstance();
    const uniqueNames = [...new Set(deck.cards.map((c) => c.cardName))];
    const resolved = await cardDb.resolveCardNames(uniqueNames);

    const updatedCards: DeckEntry[] = deck.cards.map((entry) => {
      const card = resolved.get(entry.cardName);
      return {
        ...entry,
        resolved: card !== null && card !== undefined,
        scryfallId: card?.id,
      };
    });

    const resolvedCount = updatedCards.filter((c) => c.resolved).length;
    const unresolvedNames = [...new Set(updatedCards.filter((c) => !c.resolved).map((c) => c.cardName))];

    updateDeck(deckId, {
      cards: updatedCards,
      resolvedCount,
      unresolvedCount: unresolvedNames.length,
    });
  }, [decks, updateDeck]);

  const closeAndReset = () => {
    setImportOpen(false);
    setDeckName('');
    setDeckText('');
    setImportResult(null);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border/50 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </Link>
          <h2 className="text-lg font-semibold tracking-tight">My Decks</h2>
        </div>

        <Dialog open={importOpen} onOpenChange={(open) => { if (!open) closeAndReset(); else setImportOpen(true); }}>
          <DialogTrigger
            render={
              <Button size="sm" className="gap-1">
                <Plus className="h-4 w-4" />
                Import Deck
              </Button>
            }
          />
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-gold" />
                Import Decklist
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {!cardDataLoaded && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-400">
                  <p className="font-medium">Card database not loaded</p>
                  <p className="mt-1 text-xs text-amber-400/70">
                    Import will save card names, but can&apos;t verify them until you load
                    the card database in{' '}
                    <Link href="/settings" className="underline">
                      Settings
                    </Link>
                    .
                  </p>
                </div>
              )}

              {importResult ? (
                // Show import results
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    {importResult.unresolved.length === 0 ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="text-green-400">
                          All {importResult.resolved} cards resolved successfully!
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                        <span>
                          {importResult.resolved} of {importResult.total} cards resolved.{' '}
                          {importResult.unresolved.length} not found.
                        </span>
                      </>
                    )}
                  </div>

                  {importResult.unresolved.length > 0 && (
                    <div className="max-h-32 overflow-y-auto rounded border border-border/30 bg-card/50 p-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Unresolved cards:
                      </p>
                      {importResult.unresolved.map((name) => (
                        <p key={name} className="text-xs text-destructive">
                          {name}
                        </p>
                      ))}
                    </div>
                  )}

                  <Button onClick={closeAndReset}>Done</Button>
                </div>
              ) : (
                // Show import form
                <>
                  <div>
                    <Label htmlFor="deckName">Deck Name</Label>
                    <Input
                      id="deckName"
                      placeholder="My Commander Deck"
                      value={deckName}
                      onChange={(e) => setDeckName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="deckText">
                      Decklist (one card per line, e.g. &quot;1 Sol Ring&quot;)
                    </Label>
                    <textarea
                      id="deckText"
                      className="mt-1 min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={`Commander: Atraxa, Praetors' Voice\n1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n38 Plains\n...`}
                      value={deckText}
                      onChange={(e) => setDeckText(e.target.value)}
                    />
                  </div>
                  <Button
                    onClick={handleImport}
                    disabled={!deckName.trim() || !deckText.trim() || importing}
                    className="gap-2"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Resolving cards...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4" />
                        Import &amp; Resolve
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <main className="mx-auto w-full max-w-2xl p-6">
        {/* Sync status banner */}
        {!authLoading && !user && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-400">
              <CloudOff className="h-4 w-4 shrink-0" />
              <span>Sign in to save decks to the cloud</span>
            </div>
            <Button size="sm" variant="ghost" onClick={signInWithGoogle} className="gap-1 text-amber-400 hover:text-amber-300">
              <LogIn className="h-3.5 w-3.5" />
              Sign in
            </Button>
          </div>
        )}
        {isSyncing && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border/30 bg-card/30 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your decks...
          </div>
        )}
        {user && syncedUserId && !isSyncing && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-2 text-xs text-green-400">
            <Cloud className="h-3.5 w-3.5" />
            Synced to cloud as {user.displayName || user.email}
          </div>
        )}

        {decks.length === 0 && !isSyncing ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border/50 bg-card">
              <Upload className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No decks yet. Import a decklist to get started.
            </p>
            <Button onClick={() => setImportOpen(true)} className="gap-1">
              <Plus className="h-4 w-4" />
              Import Your First Deck
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {decks.map((deck) => {
              const totalCards = deck.totalCards || deck.cards.reduce((s, c) => s + c.quantity, 0);
              const hasResolution = deck.resolvedCount > 0 || deck.unresolvedCount > 0;
              const fullyResolved = hasResolution && deck.unresolvedCount === 0;

              return (
                <Card key={deck.id}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{deck.name}</CardTitle>
                      {fullyResolved && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {hasResolution && !fullyResolved && (
                        <AlertCircle className="h-4 w-4 text-amber-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {cardDataLoaded && !hasResolution && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResolve(deck.id)}
                          className="gap-1 text-muted-foreground"
                          title="Resolve card names against database"
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeDeck(deck.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {deck.commanderName || 'No commander set'} &middot;{' '}
                      {totalCards} cards &middot; {deck.format}
                    </p>
                    {hasResolution && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {deck.resolvedCount} resolved
                        {deck.unresolvedCount > 0 && (
                          <span className="text-amber-500">
                            {' '}&middot; {deck.unresolvedCount} unresolved
                          </span>
                        )}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
