'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDeckStore, type Deck, type Shelf, type ShelfAccent } from '@/store/deckStore';
import { useAuth } from '@/lib/firebase/auth';
import { useCardRecords } from '@/hooks/useCardRecords';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useTour } from '@/hooks/useTour';
import { TourOverlay } from '@/components/tour/Tour';
import { verifyEntries, assessDeck, frontFace, type VerifyReport } from '@/lib/deckCards';
import { LegalityBadge } from '@/components/decks/DeckCheck';
import {
  Plus, Trash2, Upload, Loader2, CheckCircle2, AlertCircle, Cloud, CloudOff, LogIn, Crown, MoreHorizontal, Library, Pencil, Lock,
} from 'lucide-react';
import { AuthGuard } from '@/components/AuthGuard';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { AccentDot, ShelfChip, ShelfDialog } from '@/components/decks/Shelves';
import { NewDeckDialog } from '@/components/decks/NewDeckDialog';
import { rise, riseStagger } from '@/lib/motion';
import { cn } from '@/lib/utils';

export default function DecksPage() {
  return <AuthGuard><DecksContent /></AuthGuard>;
}

type Filter = 'all' | 'open' | string;

function DecksContent() {
  const {
    decks, shelves, removeDeck, importDeckFromText, updateDeck, moveDeckToShelf, addShelf, renameShelf, removeShelf,
    isSyncing, syncedUserId, syncFailed, loadFromFirestore,
  } = useDeckStore();
  const { user, loading: authLoading, signInWithGoogle } = useAuth();
  const { can, limit } = useEntitlements();

  const [filter, setFilter] = useState<Filter>('all');
  const [shelfDialog, setShelfDialog] = useState<{ open: boolean; shelf: Shelf | null }>({ open: false, shelf: null });
  const [newDeckOpen, setNewDeckOpen] = useState(false);

  // Import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckText, setDeckText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importStep, setImportStep] = useState('');
  const [importResult, setImportResult] = useState<VerifyReport | null>(null);

  const tour = useTour('vault', { ready: !isSyncing && !authLoading && !!user });
  const maxDecks = limit('vault.maxDecks');
  const atDeckLimit = decks.length >= maxDecks;
  const canShelve = can('vault.shelves');

  const commanderNames = useMemo(() => decks.map((d) => d.commanderName).filter(Boolean), [decks]);
  const { records } = useCardRecords(commanderNames);

  const currentShelf = shelves.find((s) => s.id === filter) ?? null;
  const visible = useMemo(() => {
    const sorted = [...decks].sort((a, b) => b.updatedAt - a.updatedAt);
    if (filter === 'all') return sorted;
    if (filter === 'open') return sorted.filter((d) => !d.shelfId);
    return sorted.filter((d) => d.shelfId === filter);
  }, [decks, filter]);
  const openCount = decks.filter((d) => !d.shelfId).length;

  const handleImport = useCallback(async () => {
    if (!deckName.trim() || !deckText.trim()) return;
    setImporting(true);
    setImportResult(null);
    try {
      setImportStep('Parsing decklist…');
      const deck = importDeckFromText(deckText, deckName);
      if (currentShelf) moveDeckToShelf(deck.id, currentShelf.id);
      setImportStep('Resolving cards…');
      const report = await verifyEntries(deck.cards);
      setImportStep('Checking Commander rules…');
      const legality = await assessDeck({ cards: report.cards, commanderName: deck.commanderName });
      updateDeck(deck.id, { cards: report.cards, resolvedCount: report.resolved, unresolvedCount: report.unresolved.length, legality });
      setImportResult(report);
    } finally {
      setImporting(false);
      setImportStep('');
    }
  }, [deckName, deckText, importDeckFromText, updateDeck, moveDeckToShelf, currentShelf]);

  const closeAndReset = () => {
    setImportOpen(false);
    setDeckName('');
    setDeckText('');
    setImportResult(null);
  };

  const saveShelf = (name: string, accent: ShelfAccent) => {
    if (shelfDialog.shelf) renameShelf(shelfDialog.shelf.id, name, accent);
    else { const s = addShelf(name, accent); setFilter(s.id); }
  };

  return (
    <div className="flex flex-1 flex-col">
      {tour.active && <TourOverlay tour={tour.tour} onDone={tour.finish} />}
      <header className="mx-auto flex w-full max-w-6xl items-end justify-between gap-4 px-5 pb-4 pt-8 sm:px-10 sm:pt-12">
        <div className="flex flex-col gap-1.5">
          <p className="eyebrow">The vault</p>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">My Decks</h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            disabled={atDeckLimit}
            onClick={() => setNewDeckOpen(true)}
            title={atDeckLimit ? `The free vault holds ${maxDecks} decks` : undefined}
            data-dev-new-deck
            data-tour="vault-new"
            className="gap-1.5 bg-gold text-gold-foreground hover:bg-gold/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            {atDeckLimit ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            New Deck
          </Button>
        <Dialog open={importOpen} onOpenChange={(open) => { if (!open) closeAndReset(); else setImportOpen(true); }}>
          <DialogTrigger
            render={
              <Button size="sm" variant="outline" disabled={atDeckLimit} title={atDeckLimit ? `The free vault holds ${maxDecks} decks` : undefined} className="gap-1.5 border-border/60 text-foreground" data-tour="vault-import">
                <Upload className="h-4 w-4" />
                Import
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
                <ImportReport report={importResult} onDone={closeAndReset} />
              ) : (
                <>
                  <div>
                    <Label htmlFor="deckName">Deck Name</Label>
                    <Input id="deckName" placeholder="My Commander Deck" value={deckName} onChange={(e) => setDeckName(e.target.value)} className="mt-1" />
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
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Moxfield, Archidekt, MTGGoldfish and plain-text exports all work.
                      {currentShelf && <> Filed on <span className="text-foreground">{currentShelf.name}</span>.</>}
                    </p>
                  </div>
                  <Button onClick={handleImport} disabled={!deckName.trim() || !deckText.trim() || importing} className="gap-2 bg-gold text-gold-foreground hover:bg-gold/90">
                    {importing ? <><Loader2 className="h-4 w-4 animate-spin" />{importStep || 'Resolving cards…'}</> : <><Upload className="h-4 w-4" />Import &amp; Resolve</>}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 pb-10 sm:px-10">
        {/* Sync status */}
        {!authLoading && !user && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-amber-400"><CloudOff className="h-4 w-4 shrink-0" /><span>Sign in to save decks to the cloud</span></div>
            <Button size="sm" variant="ghost" onClick={signInWithGoogle} className="gap-1 text-amber-400 hover:text-amber-300"><LogIn className="h-3.5 w-3.5" />Sign in</Button>
          </div>
        )}
        {isSyncing && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border/30 bg-card/30 px-4 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your decks...</div>
        )}
        {user && syncedUserId && !isSyncing && syncFailed && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <CloudOff className="h-4 w-4 shrink-0" />
              <span>Couldn&apos;t load your decks. This list is empty because the load failed, not because you have no decks — don&apos;t re-import yet.</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => loadFromFirestore(syncedUserId)} className="shrink-0 gap-1 text-destructive hover:text-destructive">Retry</Button>
          </div>
        )}
        {user && syncedUserId && !isSyncing && !syncFailed && (
          <div className="mb-5 flex items-center gap-2 text-xs text-muted-foreground">
            <Cloud className="h-3.5 w-3.5 text-gold/70" />
            Synced to cloud as {user.displayName || user.email}
            {Number.isFinite(maxDecks) && <span className="ml-auto tabular-nums">{decks.length} / {maxDecks} decks</span>}
          </div>
        )}

        {decks.length === 0 && !isSyncing && !syncFailed ? (
          <Alcove className="flex flex-col items-center gap-4 px-6 pb-12 pt-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold ring-1 ring-gold/20"><Upload className="h-8 w-8" /></div>
            <p className="font-display text-xl font-bold">The vault is empty</p>
            <p className="max-w-sm text-sm text-muted-foreground">Build a deck from a commander up, or paste a list from Moxfield, Archidekt or anywhere else.</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => setNewDeckOpen(true)} className="gap-1.5 bg-gold text-gold-foreground hover:bg-gold/90"><Plus className="h-4 w-4" />Build a Deck</Button>
              <Button variant="outline" onClick={() => setImportOpen(true)} className="gap-1.5 border-border/60 text-foreground"><Upload className="h-4 w-4" />Import a List</Button>
            </div>
          </Alcove>
        ) : (
          <>
            {/* Shelf strip */}
            <div role="tablist" aria-label="Shelves" data-tour="vault-shelves" className="no-scrollbar -mx-5 mb-5 flex items-center gap-2 overflow-x-auto px-5 sm:-mx-0 sm:flex-wrap sm:px-0">
              <ShelfChip label="All decks" count={decks.length} selected={filter === 'all'} onClick={() => setFilter('all')} />
              {shelves.map((s) => (
                <ShelfChip key={s.id} label={s.name} accent={s.accent} count={decks.filter((d) => d.shelfId === s.id).length} selected={filter === s.id} onClick={() => setFilter(s.id)} />
              ))}
              {shelves.length > 0 && openCount > 0 && (
                <ShelfChip label="In the open" count={openCount} selected={filter === 'open'} onClick={() => setFilter('open')} />
              )}
              {currentShelf && (
                <Button variant="ghost" size="icon-sm" aria-label={`Edit shelf ${currentShelf.name}`} onClick={() => setShelfDialog({ open: true, shelf: currentShelf })} className="shrink-0 text-muted-foreground hover:text-gold"><Pencil /></Button>
              )}
              <button
                type="button"
                onClick={() => canShelve && setShelfDialog({ open: true, shelf: null })}
                disabled={!canShelve}
                title={canShelve ? undefined : 'Shelves are a Patron feature'}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border/60 px-3.5 text-sm text-muted-foreground transition-colors hover:border-gold/50 hover:text-gold disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:text-muted-foreground"
              >
                {canShelve ? <Plus className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />} New shelf
              </button>
            </div>

            <Eyebrow className="mb-4">
              {currentShelf ? currentShelf.name : filter === 'open' ? 'In the open' : 'All decks'}
              <span className="ml-1 text-gold/40">· {visible.length}</span>
            </Eyebrow>

            {visible.length === 0 ? (
              <Alcove flat className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <p className="font-display text-lg font-bold">Nothing on this shelf yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">Import a deck while this shelf is selected, or move one here from its menu.</p>
              </Alcove>
            ) : (
              <motion.div key={filter} variants={riseStagger(0.05)} initial="hidden" animate="show" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence initial={false}>
                  {visible.map((deck) => (
                    <motion.div key={deck.id} variants={rise} layout exit={{ opacity: 0, scale: 0.96 }}>
                      <DeckCard
                        deck={deck}
                        art={deck.commanderName ? (records.get(deck.commanderName) ? frontFace(records.get(deck.commanderName)!).art : undefined) : undefined}
                        shelf={shelves.find((s) => s.id === deck.shelfId) ?? null}
                        shelves={shelves}
                        canShelve={canShelve}
                        onMove={(id) => moveDeckToShelf(deck.id, id)}
                        onNewShelf={() => setShelfDialog({ open: true, shelf: null })}
                        onDelete={() => removeDeck(deck.id)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </>
        )}
      </main>

      <NewDeckDialog open={newDeckOpen} onOpenChange={setNewDeckOpen} shelfId={currentShelf?.id ?? null} />

      <ShelfDialog
        open={shelfDialog.open}
        onOpenChange={(open) => setShelfDialog((s) => ({ ...s, open }))}
        shelf={shelfDialog.shelf}
        onSave={saveShelf}
        onDelete={shelfDialog.shelf ? () => { removeShelf(shelfDialog.shelf!.id); setFilter('all'); } : undefined}
      />
    </div>
  );
}

// ─── Deck card ───────────────────────────────────────────────────────────────

interface DeckCardProps {
  deck: Deck;
  art?: string;
  shelf: Shelf | null;
  shelves: Shelf[];
  canShelve: boolean;
  onMove: (shelfId: string | null) => void;
  onNewShelf: () => void;
  onDelete: () => void;
}

function DeckCard({ deck, art, shelf, shelves, canShelve, onMove, onNewShelf, onDelete }: DeckCardProps) {
  const totalCards = deck.cards.reduce((sum, c) => sum + c.quantity, 0);

  // The arch cap clips the top corners, so nothing interactive lives up there. The link covers
  // the art and title; the footer row holds the status and the menu, side by side.
  return (
    <Alcove className="group flex h-full flex-col transition-colors hover:border-gold/30">
      <Link href={`/decks/${encodeURIComponent(deck.id)}`} className="flex flex-1 flex-col focus-visible:outline-none">
        <div className="relative h-28 overflow-hidden">
          {art ? (
            <Image src={art} alt="" fill sizes="480px" className="object-cover object-[center_25%] transition-transform duration-700 group-hover:scale-105" unoptimized />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.80_0.12_75/0.16),transparent_65%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          <div className="absolute bottom-3 left-5 flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold ring-1 ring-gold/30 backdrop-blur-sm">
            <Crown className="h-5 w-5" />
          </div>
        </div>
        <div className="px-5 pb-3 pt-2">
          <h3 className="truncate font-display text-lg font-bold leading-tight transition-colors group-hover:text-gold">{deck.name}</h3>
          <p className="truncate text-sm text-muted-foreground">{deck.commanderName || 'No commander set'}</p>
        </div>
      </Link>

      <div className="mx-5 flex items-center gap-2 border-t border-border/30 py-2.5 text-xs text-muted-foreground">
        <span className="shrink-0">{totalCards} cards</span>
        <span className="text-border">·</span>
        <span data-tour="vault-badge" className="flex shrink-0 items-center"><LegalityBadge legality={deck.legality} /></span>
        {shelf && <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate"><AccentDot accent={shelf.accent} /><span className="truncate">{shelf.name}</span></span>}

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${deck.name}`} className={cn('shrink-0 text-muted-foreground hover:text-gold', !shelf && 'ml-auto')} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {/* A menu label is a group part in Base UI and must sit inside a group. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">Move to shelf</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onMove(null)} className={cn(!deck.shelfId && 'text-gold')}><Library /> In the open</DropdownMenuItem>
              {shelves.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => onMove(s.id)} className={cn(deck.shelfId === s.id && 'text-gold')}><AccentDot accent={s.accent} className="mx-1" /> {s.name}</DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={onNewShelf} disabled={!canShelve}><Plus /> New shelf…</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}><Trash2 /> Delete deck</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Alcove>
  );
}

// ─── Import report ───────────────────────────────────────────────────────────

function ImportReport({ report, onDone }: { report: VerifyReport; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        {report.unresolved.length === 0 ? (
          <><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-green-400">All {report.resolved} cards resolved in Scryfall.</span></>
        ) : (
          <><AlertCircle className="h-5 w-5 text-amber-500" /><span>{report.resolved} of {report.total} cards resolved in Scryfall. {report.unresolved.length} not found.</span></>
        )}
      </div>

      {report.forgeSubstituted.length === 0 && report.forgeUnresolvable.length === 0 ? (
        <div className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-5 w-5 text-green-500" /><span className="text-green-400">All cards verified in Forge engine.</span></div>
      ) : (
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-5 w-5 text-amber-500" />
          <span>
            Forge engine:{' '}
            {report.forgeSubstituted.length > 0 && `${report.forgeSubstituted.length} substituted`}
            {report.forgeSubstituted.length > 0 && report.forgeUnresolvable.length > 0 && ', '}
            {report.forgeUnresolvable.length > 0 && `${report.forgeUnresolvable.length} unavailable`}
          </span>
        </div>
      )}

      {report.unresolved.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded border border-border/30 bg-card/50 p-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Not found in Scryfall:</p>
          {report.unresolved.map((name) => <p key={name} className="text-xs text-destructive">{name}</p>)}
        </div>
      )}
      {report.forgeSubstituted.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded border border-blue-500/20 bg-blue-500/5 p-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-blue-400/70">Forge substitutions (reprints → originals):</p>
          {report.forgeSubstituted.map((sub) => <p key={sub.original} className="text-xs text-blue-300">{sub.original} → <span className="font-medium text-blue-400">{sub.forgeName}</span></p>)}
        </div>
      )}
      {report.forgeUnresolvable.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded border border-red-500/20 bg-red-500/5 p-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-red-400/70">Not found in Forge (won&apos;t work in-game):</p>
          {report.forgeUnresolvable.map((name) => <p key={name} className="text-xs text-red-400">{name}</p>)}
        </div>
      )}

      <Button onClick={onDone} className="bg-gold text-gold-foreground hover:bg-gold/90">Done</Button>
    </div>
  );
}
