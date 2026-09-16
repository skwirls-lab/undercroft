import { create } from 'zustand';
import {
  loadDecks,
  saveDeck,
  updateDeckInFirestore,
  deleteDeckFromFirestore,
} from '@/lib/firebase/firestore';

export interface DeckEntry {
  cardName: string;
  quantity: number;
  resolved?: boolean;
  scryfallId?: string;
  oracleId?: string;
  forgeName?: string;       // Forge-compatible name if different from cardName (e.g., reprint → original)
  forgeResolved?: boolean;  // Whether the card (or its equivalent) exists in Forge's database
}

export interface Deck {
  id: string;
  name: string;
  commanderName: string;
  cards: DeckEntry[];
  format: string;
  resolvedCount: number;
  unresolvedCount: number;
  totalCards: number;
  createdAt: number;
  updatedAt: number;
}

interface DeckStore {
  decks: Deck[];
  activeDeckId: string | null;
  syncedUserId: string | null;
  isSyncing: boolean;
  /** True when the last Firestore load failed — the deck list on screen is not authoritative. */
  syncFailed: boolean;

  addDeck: (deck: Deck) => void;
  removeDeck: (id: string) => void;
  updateDeck: (id: string, updates: Partial<Deck>) => void;
  setActiveDeck: (id: string | null) => void;
  importDeckFromText: (text: string, name: string) => Deck;

  // Firestore sync
  loadFromFirestore: (uid: string) => Promise<void>;
  syncDeckToFirestore: (deck: Deck) => Promise<void>;
  clearSync: () => void;
}

/**
 * Parse a decklist pasted from Moxfield, Archidekt, MTGGoldfish, TappedOut, EDHREC or plain text.
 *
 * The previous implementation stripped every `//` line as a comment and only recognised an
 * explicit `Commander:` prefix — so a stock Moxfield export (where the commander is marked by a
 * `// Commander` section header, or simply sits alone in the first block) imported with no
 * commander at all. It also kept set codes and collector numbers as part of the card name, and
 * turned category headers like `Creatures (30)` into a card.
 *
 * Handled here:
 *   `1 Sol Ring`, `1x Sol Ring`, `Sol Ring`            quantity forms
 *   `1 Sol Ring (LTR) 305`                             set code + collector number
 *   `1x Sol Ring (c21) 263 [Ramp]`                     Archidekt category brackets
 *   `1 Atraxa, Praetors' Voice *CMDR*`                 inline commander marker
 *   `// Commander` / `Commander:` / `[Commander]`      commander section headers
 *   `Creatures (30)`, `SIDEBOARD:`                     headers and sections to skip
 *   first single-card block, when nothing else marks a commander (Moxfield/MTGGoldfish default)
 */
export function parseDecklist(text: string): { cards: DeckEntry[]; commanderName: string } {
  const rawLines = text.split('\n').map((l) => l.trim());

  const cards: DeckEntry[] = [];
  let commanderName = '';

  const SKIP_SECTION = /^(sideboard|sb|maybeboard|considering|tokens?|planes?)\b[:\s]*$/i;
  // A category header has no leading quantity: `Creatures (30)`, `Lands 38`, `Deck`.
  const CATEGORY_HEADER = /^[A-Za-z][A-Za-z '/-]*\s*(\(\d+\)|\d+)?$/;

  let inCommanderSection = false;
  let inSkippedSection = false;
  let sawExplicitCommander = false;
  let blockIndex = 0;
  const blockStart: Record<number, number> = {};

  for (const raw of rawLines) {
    if (!raw) {
      // A blank line ends a block; Moxfield separates the commander from the deck this way.
      if (blockStart[blockIndex] !== undefined) blockIndex++;
      inCommanderSection = false;
      inSkippedSection = false;
      continue;
    }

    const isComment = raw.startsWith('//') || raw.startsWith('#');
    const headerBody = raw.replace(/^(\/\/|#)\s*/, '').trim();

    if (/^commanders?\b[:\s]*$/i.test(headerBody)) {
      inCommanderSection = true;
      inSkippedSection = false;
      continue;
    }
    if (SKIP_SECTION.test(headerBody)) {
      inSkippedSection = true;
      inCommanderSection = false;
      continue;
    }
    // `Commander: Atraxa, Praetors' Voice` — name on the same line.
    const inlineCommander = headerBody.match(/^commanders?\s*[:\-]\s*(.+)$/i);
    if (inlineCommander) {
      const nm = cleanCardName(inlineCommander[1]);
      if (nm) {
        commanderName = nm;
        sawExplicitCommander = true;
        if (blockStart[blockIndex] === undefined) blockStart[blockIndex] = cards.length;
        cards.push({ cardName: nm, quantity: 1 });
      }
      continue;
    }
    if (isComment) continue;
    if (inSkippedSection) continue;

    const match = raw.match(/^(\d+)\s*x?\s+(.+)$/i);
    let quantity = 1;
    let body = raw;
    if (match) {
      quantity = parseInt(match[1], 10);
      body = match[2];
    } else if (CATEGORY_HEADER.test(raw) && raw.split(/\s+/).length <= 3) {
      continue; // header like `Creatures (30)`, not a card
    }

    const isMarkedCommander =
      /\*CMDR\*/i.test(body) || /\[[^\]]*commander[^\]]*\]/i.test(body);
    const cardName = cleanCardName(body);
    if (!cardName) continue;

    if (blockStart[blockIndex] === undefined) blockStart[blockIndex] = cards.length;
    cards.push({ cardName, quantity });

    if ((inCommanderSection || isMarkedCommander) && !sawExplicitCommander) {
      commanderName = cardName;
      sawExplicitCommander = true;
    }
  }

  // Moxfield/MTGGoldfish default: commander alone in the first block, then a blank line.
  if (!commanderName && blockIndex > 0 && cards.length > 1 && blockStart[1] === 1 && cards[0].quantity === 1) {
    commanderName = cards[0].cardName;
  }

  return { cards, commanderName };
}

/** Strip set codes, collector numbers, category brackets and commander markers from a card name. */
function cleanCardName(input: string): string {
  return input
    .replace(/\*CMDR\*/gi, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)\s*\d*\s*$/g, '')
    .replace(/\s+\d+\s*$/g, '')
    .trim();
}

export const useDeckStore = create<DeckStore>((set, get) => ({
  decks: [],
  activeDeckId: null,
  syncedUserId: null,
  syncFailed: false,
  isSyncing: false,

  addDeck: (deck) => {
    set((state) => ({ decks: [...state.decks, deck] }));
    // Persist to Firestore in background
    const { syncedUserId } = get();
    if (syncedUserId) {
      saveDeck(syncedUserId, deck).catch(console.error);
    }
  },

  removeDeck: (id) => {
    set((state) => ({
      decks: state.decks.filter((d) => d.id !== id),
      activeDeckId: state.activeDeckId === id ? null : state.activeDeckId,
    }));
    const { syncedUserId } = get();
    if (syncedUserId) {
      deleteDeckFromFirestore(syncedUserId, id).catch(console.error);
    }
  },

  updateDeck: (id, updates) => {
    set((state) => ({
      decks: state.decks.map((d) =>
        d.id === id ? { ...d, ...updates, updatedAt: Date.now() } : d
      ),
    }));
    const { syncedUserId } = get();
    if (syncedUserId) {
      updateDeckInFirestore(syncedUserId, id, updates).catch(console.error);
    }
  },

  setActiveDeck: (id) => set({ activeDeckId: id }),

  importDeckFromText: (text, name) => {
    const { cards, commanderName } = parseDecklist(text);

    const totalCards = cards.reduce((s, c) => s + c.quantity, 0);
    const deck: Deck = {
      id: `deck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      commanderName,
      cards,
      format: 'commander',
      resolvedCount: 0,
      unresolvedCount: 0,
      totalCards,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    get().addDeck(deck);
    return deck;
  },

  // ─── Firestore Sync ─────────────────────────────────

  loadFromFirestore: async (uid) => {
    // Drop whatever is in memory before loading a different account's decks. Without this a
    // direct account switch (signInWithPopup while already signed in never emits a null user,
    // so clearSync does not run) could leave the previous user's decks on screen.
    const { syncedUserId: previousUid } = get();
    if (previousUid && previousUid !== uid) {
      set({ decks: [], activeDeckId: null });
    }

    set({ isSyncing: true, syncedUserId: uid, syncFailed: false });
    try {
      const decks = await loadDecks(uid);
      // A fast A -> B switch can let A's request resolve after B's. Applying it would show B
      // another user's decks, and any later edit would write them into B's account.
      if (get().syncedUserId !== uid) return;
      set({ decks, isSyncing: false, syncFailed: false });
    } catch (error) {
      console.error('Failed to load decks from Firestore:', error);
      if (get().syncedUserId !== uid) return;
      // Never fall back to stale data on failure — an empty list is wrong but safe, whereas
      // the previous account's decks are wrong AND get written to this account on any edit.
      set({ decks: [], activeDeckId: null, isSyncing: false, syncFailed: true });
    }
  },

  syncDeckToFirestore: async (deck) => {
    const { syncedUserId } = get();
    if (!syncedUserId) return;
    try {
      await saveDeck(syncedUserId, deck);
    } catch (error) {
      console.error('Failed to sync deck to Firestore:', error);
    }
  },

  clearSync: () => {
    set({ syncedUserId: null, decks: [], activeDeckId: null, syncFailed: false });
  },
}));
