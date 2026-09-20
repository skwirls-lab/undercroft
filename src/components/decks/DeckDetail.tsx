'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  ArrowLeft, Swords, Pencil, Check, MoreHorizontal, FileText, RefreshCw, Trash2, Crown,
  Loader2, Library, Lock, Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alcove, Eyebrow } from '@/components/brand/Alcove';
import { ManaSymbol } from '@/components/game/ManaSymbol';
import { useDeckStore, parseDecklist, deckTotals, mergeEntries, type Deck, type DeckEntry } from '@/store/deckStore';
import { useCardRecords } from '@/hooks/useCardRecords';
import { useEntitlements } from '@/hooks/useEntitlements';
import { groupDeck, deckColorIdentity, manaCurve, frontFace, verifyEntries, primeCardRecord } from '@/lib/deckCards';
import type { ScryfallCardRecord } from '@/lib/cardTypes';
import { CardTile } from './CardTile';
import { CardLightbox } from './CardLightbox';
import { CardSearchPanel } from './CardSearchPanel';
import { DeckCheckBadge, DeckCheckDialog } from './DeckCheck';
import { checkDeck, canBeCommander, fitsIdentity } from '@/lib/deckRules';
import { AccentDot, ShelfDialog } from './Shelves';
import { rise, riseStagger, settle } from '@/lib/motion';
import { cn } from '@/lib/utils';

/**
 * One deck, laid out to be read: commander art across the top, the list below grouped by
 * type with every card shown as itself. Editing is a mode, not a separate screen — flip it
 * on and each tile grows a stepper, the name becomes a field, and a search box appears for
 * adding cards. Every change saves as it happens; there is no save button to forget.
 */
export function DeckDetail({ deckId }: { deckId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deck = useDeckStore((s) => s.decks.find((d) => d.id === deckId));
  const isSyncing = useDeckStore((s) => s.isSyncing);
  const shelves = useDeckStore((s) => s.shelves);
  const { updateDeck, removeDeck, moveDeckToShelf, addShelf } = useDeckStore();
  const { can } = useEntitlements();
  const canEdit = can('deck.edit');

  // `?edit=1` (from "New deck") opens straight into edit mode with the search box ready.
  const [editing, setEditing] = useState(() => searchParams.get('edit') === '1');
  // The name is drafted locally while editing and written once on Done, not per keystroke:
  // every store update is a Firestore write.
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  /** A search result being read, before it is in the deck. */
  const [previewRecord, setPreviewRecord] = useState<ScryfallCardRecord | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);

  const names = useMemo(() => (deck ? deck.cards.map((c) => c.cardName) : []), [deck]);
  const { records } = useCardRecords(names);

  const sections = useMemo(() => (deck ? groupDeck(deck.cards, records, deck.commanderName) : []), [deck, records]);
  const identity = useMemo(() => (deck ? deckColorIdentity(deck.cards, records, deck.commanderName) : []), [deck, records]);
  const curve = useMemo(() => (deck ? manaCurve(deck.cards, records) : []), [deck, records]);
  const commanderRecord = deck?.commanderName ? records.get(deck.commanderName) ?? null : null;
  const banner = commanderRecord ? frontFace(commanderRecord).art : undefined;
  const check = useMemo(() => checkDeck(deck ?? { cards: [], commanderName: '' }, records), [deck, records]);

  // ── Edits ───────────────────────────────────────────────────────────────────
  // Optimistic: the store (and Firestore behind it) updates at once; verification of any
  // name that changed follows and patches the flags in.

  const commit = useCallback((cards: DeckEntry[], extra: Partial<Deck> = {}) => {
    updateDeck(deckId, { cards, ...deckTotals(cards), ...extra });
  }, [deckId, updateDeck]);

  const patchVerified = useCallback((verified: DeckEntry[], only: Set<string>) => {
    const latest = useDeckStore.getState().decks.find((d) => d.id === deckId);
    if (!latest) return;
    const byName = new Map(verified.map((e) => [e.cardName, e]));
    const cards = latest.cards.map((e) => {
      if (!only.has(e.cardName)) return e;
      const v = byName.get(e.cardName);
      return v ? { ...e, resolved: v.resolved, scryfallId: v.scryfallId, oracleId: v.oracleId, forgeName: v.forgeName, forgeResolved: v.forgeResolved } : e;
    });
    commit(cards);
  }, [deckId, commit]);

  const setQuantity = useCallback((name: string, qty: number) => {
    if (!deck) return;
    commit(deck.cards.map((e) => (e.cardName === name ? { ...e, quantity: Math.max(1, qty) } : e)));
  }, [deck, commit]);

  const removeCard = useCallback((name: string) => {
    if (!deck) return;
    commit(deck.cards.filter((e) => e.cardName !== name), deck.commanderName === name ? { commanderName: '' } : {});
    setOpenCard((c) => (c === name ? null : c));
  }, [deck, commit]);

  const addCard = useCallback(async (rec: ScryfallCardRecord) => {
    if (!deck) return;
    // The one rule enforced at the door: a card outside the commander's colours never goes in.
    // Everything else (size, singleton) is reported by the deck check, since a deck in progress
    // is allowed to be wrong on the way to being right.
    const cmd = deck.commanderName ? records.get(deck.commanderName) : null;
    if (cmd && rec.name !== deck.commanderName && !fitsIdentity(rec, cmd.color_identity ?? [])) {
      toast.error(`${rec.name} is outside ${deck.commanderName}'s colour identity.`);
      return;
    }
    primeCardRecord(rec);
    const existing = deck.cards.find((e) => e.cardName === rec.name);
    const next = existing
      ? deck.cards.map((e) => (e.cardName === rec.name ? { ...e, quantity: e.quantity + 1 } : e))
      : [...deck.cards, { cardName: rec.name, quantity: 1, resolved: true, scryfallId: rec.id, oracleId: rec.oracle_id } satisfies DeckEntry];
    commit(next);
    if (existing) return;
    try {
      const report = await verifyEntries(next, new Set([rec.name]));
      patchVerified(report.cards, new Set([rec.name]));
      if (report.forgeUnresolvable.includes(rec.name)) toast.warning(`${rec.name} is not in the Forge engine yet — it will be skipped in games.`);
    } catch (err) {
      console.error('[DeckDetail] verify after add failed:', err);
    }
  }, [deck, records, commit, patchVerified]);

  const makeCommander = useCallback((name: string) => {
    if (!deck) return;
    const rec = records.get(name);
    if (rec && !canBeCommander(rec)) { toast.error(`${name} cannot be a commander.`); return; }
    const has = deck.cards.some((e) => e.cardName === name);
    commit(has ? deck.cards : [...deck.cards, { cardName: name, quantity: 1 }], { commanderName: name });
    toast.success(`${name} now leads the deck.`);
  }, [deck, records, commit]);

  const reverify = useCallback(async (cards?: DeckEntry[], extra: Partial<Deck> = {}) => {
    const source = cards ?? deck?.cards;
    if (!source) return;
    setVerifying(true);
    try {
      const report = await verifyEntries(source);
      commit(report.cards, extra);
      const problems = report.unresolved.length + report.forgeUnresolvable.length;
      if (problems === 0) toast.success(`All ${report.total} cards verified.`);
      else toast.warning(`${report.unresolved.length} not found, ${report.forgeUnresolvable.length} not in Forge.`);
    } catch (err) {
      console.error('[DeckDetail] verify failed:', err);
      toast.error('Could not verify the deck. Try again in a moment.');
    } finally {
      setVerifying(false);
    }
  }, [deck, commit]);

  const replaceFromText = useCallback((text: string) => {
    const parsed = parseDecklist(text);
    const cards = mergeEntries(parsed.cards);
    const commanderName = parsed.commanderName;
    if (cards.length === 0) { toast.error('No cards found in that list.'); return; }
    setTextOpen(false);
    void reverify(cards, { commanderName: commanderName || deck?.commanderName || '' });
  }, [deck, reverify]);

  const startEditing = () => { setNameDraft(deck?.name ?? ''); setEditing(true); };
  const finishEditing = () => {
    const next = nameDraft?.trim();
    if (deck && next && next !== deck.name) updateDeck(deck.id, { name: next });
    setNameDraft(null);
    setEditing(false);
  };

  const confirmDelete = () => {
    if (!deck) return;
    removeDeck(deck.id);
    toast(`${deck.name} was removed from the vault.`);
    router.replace('/decks');
  };

  // ── Not found / loading ─────────────────────────────────────────────────────

  if (!deck) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 px-5 py-20 text-center">
        {isSyncing ? (
          <><Loader2 className="h-6 w-6 animate-spin text-gold" /><p className="text-sm text-muted-foreground">Opening the vault…</p></>
        ) : (
          <>
            <Library className="h-8 w-8 text-muted-foreground/50" />
            <p className="font-display text-xl font-bold">No such deck</p>
            <p className="max-w-sm text-sm text-muted-foreground">It may have been deleted, or the link belongs to another account.</p>
            <Link href="/decks"><Button variant="outline" className="gap-1.5 border-gold/30 text-gold hover:bg-gold/10 hover:text-gold"><ArrowLeft /> Back to the vault</Button></Link>
          </>
        )}
      </div>
    );
  }

  const shelf = shelves.find((s) => s.id === deck.shelfId) ?? null;
  // Always from the entries: a stored total can lag behind an edit made elsewhere.
  const total = deck.cards.reduce((s, c) => s + c.quantity, 0);
  const lands = sections.find((s) => s.group === 'Lands')?.count ?? 0;
  const nonland = curve.reduce((a, b) => a + b, 0);
  const avgMv = nonland > 0 ? (curve.reduce((sum, n, mv) => sum + n * mv, 0) / nonland).toFixed(2) : '–';
  const openEntry = openCard ? deck.cards.find((e) => e.cardName === openCard) ?? null : null;
  const inDeck = new Map(deck.cards.map((c) => [c.cardName, c.quantity]));
  const curveMax = Math.max(1, ...curve);

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-5 pb-12 pt-6 sm:px-10 sm:pt-8">
        {/* Back */}
        <Link href="/decks" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-gold">
          <ArrowLeft className="h-4 w-4" /> The vault{shelf ? <><span className="text-border">/</span><AccentDot accent={shelf.accent} />{shelf.name}</> : null}
        </Link>

        {/* Header alcove with commander art */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={settle}>
          <Alcove lit className="relative">
            {banner && (
              <div className="pointer-events-none absolute inset-0">
                <Image src={banner} alt="" fill sizes="1200px" className="object-cover object-[center_20%] opacity-[0.28] blur-[2px] saturate-[0.85]" unoptimized priority />
                <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/70 to-card" />
                <div className="absolute inset-0 bg-gradient-to-r from-card via-transparent to-card/60" />
              </div>
            )}

            <div className="relative flex flex-col gap-5 px-5 pb-5 pt-12 sm:px-8 sm:pb-7 sm:pt-14">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="eyebrow">Commander deck</p>
                    {identity.length > 0 && (
                      <span className="flex items-center gap-0.5">{identity.map((c) => <ManaSymbol key={c} symbol={c} size="sm" />)}</span>
                    )}
                  </div>

                  {editing ? (
                    <Input
                      value={nameDraft ?? deck.name}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={() => { const next = nameDraft?.trim(); if (next && next !== deck.name) updateDeck(deck.id, { name: next }); }}
                      aria-label="Deck name"
                      className="mt-2 h-12 max-w-xl border-gold/40 bg-background/60 font-display text-2xl font-bold sm:text-3xl"
                    />
                  ) : (
                    <h1 className="mt-1.5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{deck.name}</h1>
                  )}

                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <Crown className="h-4 w-4 text-gold" />
                    {deck.commanderName ? (
                      <button type="button" onClick={() => setOpenCard(deck.commanderName)} className="font-medium text-foreground underline-offset-4 hover:text-gold hover:underline">{deck.commanderName}</button>
                    ) : (
                      <span className="italic">No commander — open a legendary creature and make it one</span>
                    )}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex shrink-0 items-center gap-2">
                  {editing ? (
                    <Button onClick={finishEditing} className="gap-1.5 bg-gold text-gold-foreground hover:bg-gold/90"><Check /> Done</Button>
                  ) : (
                    <>
                      <Link href={`/game?deck=${encodeURIComponent(deck.id)}`}>
                        <Button className="gap-1.5 bg-gold text-gold-foreground shadow-[0_0_24px_var(--gold-glow)] hover:bg-gold/90"><Swords /> Play</Button>
                      </Link>
                      <Button
                        variant="outline"
                        onClick={() => canEdit && startEditing()}
                        disabled={!canEdit}
                        title={canEdit ? undefined : 'Deck editing is a Patron feature'}
                        className="gap-1.5 border-border/60 text-foreground"
                      >
                        {canEdit ? <Pencil /> : <Lock />} Edit
                      </Button>
                    </>
                  )}

                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More actions" className="border-border/60 text-foreground" />}>
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {/* A menu label is a group part in Base UI and must sit inside a group. */}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Shelf</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => moveDeckToShelf(deck.id, null)} className={cn(!deck.shelfId && 'text-gold')}>
                          <Library /> In the open
                        </DropdownMenuItem>
                        {shelves.map((s) => (
                          <DropdownMenuItem key={s.id} onClick={() => moveDeckToShelf(deck.id, s.id)} className={cn(deck.shelfId === s.id && 'text-gold')}>
                            <AccentDot accent={s.accent} className="mx-1" /> {s.name}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => setShelfOpen(true)} disabled={!can('vault.shelves')}>
                          <span className="mx-1 text-xs">+</span> New shelf…
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setTextOpen(true)} disabled={!canEdit}><FileText /> Edit as text</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => reverify()} disabled={verifying}><RefreshCw /> Re-verify cards</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> Delete deck</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Stats strip */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border/40 pt-4 text-sm">
                <Stat value={String(total)} label="cards" warn={total !== 100} />
                <Stat value={String(lands)} label="lands" />
                <Stat value={avgMv} label="avg. mana value" />
                <div className="flex items-end gap-[3px]" aria-label="Mana curve" title="Mana curve, 0 to 7+">
                  {curve.map((n, mv) => (
                    <div key={mv} className="flex flex-col items-center gap-1">
                      <div className="w-3 rounded-sm bg-gold/70" style={{ height: `${Math.max(2, Math.round((n / curveMax) * 28))}px` }} />
                      <span className="text-[9px] tabular-nums text-muted-foreground">{mv === 7 ? '7+' : mv}</span>
                    </div>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <DeckCheckBadge check={check} verifying={verifying} onClick={() => setCheckOpen(true)} />
                </div>
              </div>
            </div>
          </Alcove>
        </motion.div>

        {/* Add cards — edit mode only */}
        <AnimatePresence initial={false}>
          {editing && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={settle} className="mt-4">
              <Alcove flat className="px-4 pb-4 pt-4 sm:px-5">
                <Eyebrow className="mb-3"><span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Add cards</span></Eyebrow>
                <CardSearchPanel
                  identity={commanderRecord ? (commanderRecord.color_identity ?? []) : null}
                  inDeck={inDeck}
                  onAdd={addCard}
                  onOpen={(rec) => setPreviewRecord(rec)}
                  autoFocus={searchParams.get('edit') === '1'}
                />
              </Alcove>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sections */}
        <motion.div variants={riseStagger(0.05, 0.1)} initial="hidden" animate="show" className="mt-8 flex flex-col gap-8">
          {sections.map((section) => (
            <motion.section key={section.group} variants={rise} className="flex flex-col gap-3">
              <Eyebrow>{section.group} <span className="ml-1 text-gold/40">· {section.count}</span></Eyebrow>
              <div className={cn('grid gap-2.5 sm:gap-3', section.group === 'Commander' ? 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7' : 'grid-cols-3 sm:grid-cols-5 lg:grid-cols-7')}>
                <AnimatePresence initial={false}>
                  {section.entries.map(({ entry, record }) => (
                    <CardTile
                      key={entry.cardName}
                      entry={entry}
                      record={record}
                      isCommander={section.group === 'Commander'}
                      editing={editing}
                      onOpen={() => setOpenCard(entry.cardName)}
                      onQuantity={(q) => setQuantity(entry.cardName, q)}
                      onRemove={() => removeCard(entry.cardName)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.section>
          ))}

          {deck.cards.length === 0 && (
            <Alcove flat className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="font-display text-lg font-bold">This deck is empty</p>
              <p className="max-w-sm text-sm text-muted-foreground">Press Edit and search for cards above, or paste a list with “Edit as text”.</p>
            </Alcove>
          )}
        </motion.div>
      </div>

      {/* Reader — a deck card with edit controls, or a search result read-only */}
      <CardLightbox
        entry={previewRecord ? { cardName: previewRecord.name, quantity: 0, resolved: true } : openEntry}
        record={previewRecord ?? (openEntry ? records.get(openEntry.cardName) ?? null : null)}
        isCommander={!previewRecord && !!openEntry && openEntry.cardName === deck.commanderName}
        onClose={() => { setOpenCard(null); setPreviewRecord(null); }}
        onQuantity={canEdit && !previewRecord ? (q) => openEntry && setQuantity(openEntry.cardName, q) : undefined}
        onRemove={canEdit && !previewRecord ? () => openEntry && removeCard(openEntry.cardName) : undefined}
        onMakeCommander={canEdit && !previewRecord ? () => openEntry && makeCommander(openEntry.cardName) : undefined}
      />

      <DeckCheckDialog open={checkOpen} onOpenChange={setCheckOpen} check={check} onOpenCard={(name) => { setCheckOpen(false); setOpenCard(name); }} />

      {/* Edit as text */}
      <Dialog open={textOpen} onOpenChange={setTextOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Edit as text</DialogTitle>
            <DialogDescription>Replace the whole list. Same formats as import — Moxfield, Archidekt, plain text.</DialogDescription>
          </DialogHeader>
          {textOpen && <TextEditor deck={deck} onSave={replaceFromText} />}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Delete {deck.name}?</DialogTitle>
            <DialogDescription>The deck leaves the vault for good. Your cards are only names — nothing else is lost — but there is no undo.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} className="text-foreground">Keep it</Button>
            <Button variant="destructive" onClick={confirmDelete} className="gap-1.5"><Trash2 /> Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      <ShelfDialog
        open={shelfOpen}
        onOpenChange={setShelfOpen}
        onSave={(name, accent) => { const s = addShelf(name, accent); moveDeckToShelf(deck.id, s.id); }}
      />
    </div>
  );
}

function Stat({ value, label, warn }: { value: string; label: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn('font-display text-xl font-bold tabular-nums', warn ? 'text-amber-300' : 'text-foreground')}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function deckToText(deck: Deck): string {
  const lines: string[] = [];
  if (deck.commanderName) lines.push(`Commander: ${deck.commanderName}`, '');
  for (const e of deck.cards) {
    if (e.cardName === deck.commanderName) continue;
    lines.push(`${e.quantity} ${e.cardName}`);
  }
  return lines.join('\n');
}

function TextEditor({ deck, onSave }: { deck: Deck; onSave: (text: string) => void }) {
  const [text, setText] = useState(() => deckToText(deck));
  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        aria-label="Decklist"
        className="min-h-[320px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button onClick={() => onSave(text)} disabled={!text.trim()} className="gap-1.5 bg-gold text-gold-foreground hover:bg-gold/90"><RefreshCw /> Replace &amp; verify</Button>
    </div>
  );
}
