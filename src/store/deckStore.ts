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

export const useDeckStore = create<DeckStore>((set, get) => ({
  decks: [],
  activeDeckId: null,
  syncedUserId: null,
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
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//') && !l.startsWith('#'));

    const cards: DeckEntry[] = [];
    let commanderName = '';

    for (const line of lines) {
      // Handle "COMMANDER:" prefix
      if (line.toLowerCase().startsWith('commander:')) {
        commanderName = line.slice('commander:'.length).trim();
        cards.push({ cardName: commanderName, quantity: 1 });
        continue;
      }

      // Handle formats like "1 Sol Ring" or "1x Sol Ring"
      const match = line.match(/^(\d+)x?\s+(.+)$/);
      if (match) {
        const quantity = parseInt(match[1], 10);
        const cardName = match[2].trim();
        cards.push({ cardName, quantity });
      } else {
        // Just a card name, assume quantity 1
        cards.push({ cardName: line, quantity: 1 });
      }
    }

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
    set({ isSyncing: true });
    try {
      const decks = await loadDecks(uid);
      set({ decks, syncedUserId: uid, isSyncing: false });
    } catch (error) {
      console.error('Failed to load decks from Firestore:', error);
      set({ syncedUserId: uid, isSyncing: false });
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
    set({ syncedUserId: null, decks: [], activeDeckId: null });
  },
}));
