'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
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
import { useAuth } from '@/lib/firebase/auth';
import {

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
import { AuthGuard } from '@/components/AuthGuard';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { motion } from 'framer-motion';
import { rise, riseStagger } from '@/lib/motion';
import { Crown } from 'lucide-react';

export default function DecksPage() {
  return <AuthGuard><DecksContent /></AuthGuard>;
}

function DecksContent() {
  const { decks, removeDeck, importDeckFromText, updateDeck, isSyncing, syncedUserId, syncFailed, loadFromFirestore } = useDeckStore();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const [importOpen, setImportOpen] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckText, setDeckText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    resolved: number;
    unresolved: string[];
    forgeSubstituted: Array<{ original: string; forgeName: string }>;
    forgeUnresolvable: string[];
    total: number;
  } | null>(null);
  const [importStep, setImportStep] = useState<string>('');

  const handleImport = useCallback(async () => {
    if (!deckName.trim() || !deckText.trim()) return;
    setImporting(true);
    setImportResult(null);

    try {
      // Step 1: Parse and create the deck
      setImportStep('Parsing decklist…');
      const deck = importDeckFromText(deckText, deckName);

      // Step 2: Resolve card names against Firestore/Scryfall
      setImportStep('Resolving cards in Scryfall…');
      const { resolveCardNames } = await import('@/lib/firebase/cards');
      const uniqueNames = [...new Set(deck.cards.map((c) => c.cardName))];
      const resolved = await resolveCardNames(uniqueNames);

      // Build initial card entries with Scryfall resolution
      let updatedCards: DeckEntry[] = deck.cards.map((entry) => {
        const card = resolved.get(entry.cardName);
        return {
          ...entry,
          resolved: card !== null && card !== undefined,
          scryfallId: card?.id,
          oracleId: card?.oracle_id,
        };
      });

      const resolvedCount = updatedCards.filter((c) => c.resolved).length;
      const unresolvedNames = [...new Set(updatedCards.filter((c) => !c.resolved).map((c) => c.cardName))];

      // Step 3: Check resolved cards against Forge
      setImportStep('Verifying cards in Forge engine…');
      const { resolveCardsForForge } = await import('@/lib/forgeCardCheck');
      const cardsForForge = updatedCards
        .filter((c) => c.resolved)
        .map((c) => ({ cardName: c.cardName, oracleId: c.oracleId }));

      const forgeResult = await resolveCardsForForge(cardsForForge);

      // Update cards with Forge resolution status
      const substitutedEntries: Array<{ original: string; forgeName: string }> = [];
      updatedCards = updatedCards.map((entry) => {
        if (!entry.resolved) {
          return { ...entry, forgeResolved: false };
        }
        if (forgeResult.direct.includes(entry.cardName)) {
          return { ...entry, forgeResolved: true };
        }
        const forgeName = forgeResult.substituted.get(entry.cardName);
        if (forgeName) {
          if (!substitutedEntries.find((s) => s.original === entry.cardName)) {
            substitutedEntries.push({ original: entry.cardName, forgeName });
          }
          return { ...entry, forgeResolved: true, forgeName };
        }
        return { ...entry, forgeResolved: false };
      });

      updateDeck(deck.id, {
        cards: updatedCards,
        resolvedCount,
        unresolvedCount: unresolvedNames.length,
      });

      setImportResult({
        resolved: resolvedCount,
        unresolved: unresolvedNames,
        forgeSubstituted: substitutedEntries,
        forgeUnresolvable: forgeResult.unresolvable,
        total: updatedCards.length,
      });
    } finally {
      setImporting(false);
      setImportStep('');
    }
  }, [deckName, deckText, importDeckFromText, updateDeck]);

  const handleResolve = useCallback(async (deckId: string) => {
    const deck = decks.find((d) => d.id === deckId);
    if (!deck) return;

    const { resolveCardNames } = await import('@/lib/firebase/cards');
    const uniqueNames = [...new Set(deck.cards.map((c) => c.cardName))];
    const resolved = await resolveCardNames(uniqueNames);

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
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-end justify-between gap-4 px-5 pb-4 pt-8 sm:px-10 sm:pt-12">
        <div className="flex flex-col gap-1.5">
          <p className="eyebrow">The vault</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">My Decks</h1>
        </div>

        <Dialog open={importOpen} onOpenChange={(open) => { if (!open) closeAndReset(); else setImportOpen(true); }}>
          <DialogTrigger
            render={
              <Button size="sm" className="gap-1.5 bg-gold text-gold-foreground hover:bg-gold/90">
                <Plus className="h-4 w-4" />
                Import Deck
              </Button>
            }
          />
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-xl">
                <Upload className="h-5 w-5 text-gold" />
                Import Decklist
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              {importResult ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-sm">
                    {importResult.unresolved.length === 0 ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                        <span className="text-green-400">All {importResult.resolved} cards resolved in Scryfall.</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                        <span>
                          {importResult.resolved} of {importResult.total} cards resolved in Scryfall.{' '}
                          {importResult.unresolved.length} not found.
                        </span>
                      </>
                    )}
                  </div>

                  {importResult.forgeSubstituted.length === 0 && importResult.forgeUnresolvable.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      <span className="text-green-400">All cards verified in Forge engine.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      <span>
                        Forge engine:{' '}
                        {importResult.forgeSubstituted.length > 0 && `${importResult.forgeSubstituted.length} substituted`}
                        {importResult.forgeSubstituted.length > 0 && importResult.forgeUnresolvable.length > 0 && ', '}
                        {importResult.forgeUnresolvable.length > 0 && `${importResult.forgeUnresolvable.length} unavailable`}
                      </span>
                    </div>
                  )}

                  {importResult.unresolved.length > 0 && (
                    <div className="max-h-28 overflow-y-auto rounded border border-border/30 bg-card/50 p-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Not found in Scryfall:</p>
                      {importResult.unresolved.map((name) => (
                        <p key={name} className="text-xs text-destructive">{name}</p>
                      ))}
                    </div>
                  )}

                  {importResult.forgeSubstituted.length > 0 && (
                    <div className="max-h-28 overflow-y-auto rounded border border-blue-500/20 bg-blue-500/5 p-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-blue-400/70">Forge substitutions (reprints → originals):</p>
                      {importResult.forgeSubstituted.map((sub) => (
                        <p key={sub.original} className="text-xs text-blue-300">
                          {sub.original} → <span className="font-medium text-blue-400">{sub.forgeName}</span>
                        </p>
                      ))}
                    </div>
                  )}

                  {importResult.forgeUnresolvable.length > 0 && (
                    <div className="max-h-28 overflow-y-auto rounded border border-red-500/20 bg-red-500/5 p-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-red-400/70">Not found in Forge (won&apos;t work in-game):</p>
                      {importResult.forgeUnresolvable.map((name) => (
                        <p key={name} className="text-xs text-red-400">{name}</p>
                      ))}
                    </div>
                  )}

                  <Button onClick={closeAndReset} className="bg-gold text-gold-foreground hover:bg-gold/90">Done</Button>
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="deckName">Deck Name</Label>
                    <Input id="deckName" placeholder="My Commander Deck" value={deckName} onChange={(e) => setDeckName(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="deckText">Decklist (one card per line, e.g. &quot;1 Sol Ring&quot;)</Label>
                    <textarea
                      id="deckText"
                      className="mt-1 min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder={`Commander: Atraxa, Praetors' Voice\n1 Sol Ring\n1 Arcane Signet\n1 Command Tower\n38 Plains\n...`}
                      value={deckText}
                      onChange={(e) => setDeckText(e.target.value)}
                    />
                    <p className="mt-1.5 text-xs text-muted-foreground">Moxfield, Archidekt, MTGGoldfish and plain-text exports all work.</p>
                  </div>
                  <Button
                    onClick={handleImport}
                    disabled={!deckName.trim() || !deckText.trim() || importing}
                    className="gap-2 bg-gold text-gold-foreground hover:bg-gold/90"
                  >
                    {importing ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />{importStep || 'Resolving cards...'}</>
                    ) : (
                      <><Upload className="h-4 w-4" />Import &amp; Resolve</>
                    )}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 pb-10 sm:px-10">
        {/* Sync status */}
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
        {user && syncedUserId && !isSyncing && syncFailed && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <CloudOff className="h-4 w-4 shrink-0" />
              <span>
                Couldn&apos;t load your decks. This list is empty because the load failed, not because you have no
                decks — don&apos;t re-import yet.
              </span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => loadFromFirestore(syncedUserId)} className="shrink-0 gap-1 text-destructive hover:text-destructive">
              Retry
            </Button>
          </div>
        )}
        {user && syncedUserId && !isSyncing && !syncFailed && (
          <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
            <Cloud className="h-3.5 w-3.5 text-gold/70" />
            Synced to cloud as {user.displayName || user.email}
          </div>
        )}

        {decks.length === 0 && !isSyncing && !syncFailed ? (
          <Alcove className="flex flex-col items-center gap-4 px-6 pb-12 pt-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20">
              <Upload className="h-8 w-8" />
            </div>
            <p className="font-display text-xl font-bold">The vault is empty</p>
            <p className="max-w-sm text-sm text-muted-foreground">Import a decklist to get started. Paste from Moxfield, Archidekt or anywhere else.</p>
            <Button onClick={() => setImportOpen(true)} className="gap-1.5 bg-gold text-gold-foreground hover:bg-gold/90">
              <Plus className="h-4 w-4" />
              Import Your First Deck
            </Button>
          </Alcove>
        ) : (
          <>
            <Eyebrow className="mb-4">{decks.length} deck{decks.length === 1 ? '' : 's'}</Eyebrow>
            <motion.div variants={riseStagger(0.06)} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {decks.map((deck) => {
                const totalCards = deck.totalCards || deck.cards.reduce((sum, c) => sum + c.quantity, 0);
                const hasResolution = deck.resolvedCount > 0 || deck.unresolvedCount > 0;
                const fullyResolved = hasResolution && deck.unresolvedCount === 0;

                return (
                  <motion.div key={deck.id} variants={rise}>
                    <Alcove className="group flex h-full flex-col px-5 pb-4 pt-8 transition-colors hover:border-gold/30">
                      <div className="mb-3 flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/20">
                          <Crown className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-display text-lg font-bold leading-tight">{deck.name}</h3>
                          <p className="truncate text-sm text-muted-foreground">{deck.commanderName || 'No commander set'}</p>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/30 pt-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{totalCards} cards</span>
                          {hasResolution && (
                            <>
                              <span className="text-border">·</span>
                              {fullyResolved ? (
                                <span className="flex items-center gap-1 text-green-400"><CheckCircle2 className="h-3.5 w-3.5" />Ready</span>
                              ) : (
                                <span className="flex items-center gap-1 text-amber-400"><AlertCircle className="h-3.5 w-3.5" />{deck.unresolvedCount} unresolved</span>
                              )}
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {!hasResolution && (
                            <Button variant="ghost" size="icon-sm" onClick={() => handleResolve(deck.id)} className="text-muted-foreground hover:text-gold" title="Resolve card names against database" aria-label="Resolve card names">
                              <Search className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon-sm" onClick={() => removeDeck(deck.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete deck">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Alcove>
                  </motion.div>
                );
              })}
            </motion.div>
          </>
        )}
      </main>
    </div>
  );
}
