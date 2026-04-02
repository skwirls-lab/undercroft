import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseDb } from './config';
import type { Deck, DeckEntry } from '@/store/deckStore';

// ─── User Profile ─────────────────────────────────────

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: unknown;
  lastLoginAt: unknown;
}

export async function upsertUserProfile(user: {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  const userRef = doc(db, 'users', user.uid);
  const existing = await getDoc(userRef);

  if (existing.exists()) {
    await updateDoc(userRef, {
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      lastLoginAt: serverTimestamp(),
    });
  } else {
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    });
  }
}

// ─── Decks ────────────────────────────────────────────

function deckToFirestore(deck: Deck): DocumentData {
  return {
    name: deck.name,
    commanderName: deck.commanderName,
    cards: deck.cards.map((c) => ({
      cardName: c.cardName,
      quantity: c.quantity,
      resolved: c.resolved ?? false,
      scryfallId: c.scryfallId ?? null,
    })),
    format: deck.format,
    resolvedCount: deck.resolvedCount,
    unresolvedCount: deck.unresolvedCount,
    totalCards: deck.totalCards,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  };
}

function deckFromFirestore(id: string, data: DocumentData): Deck {
  return {
    id,
    name: data.name || 'Unnamed',
    commanderName: data.commanderName || '',
    cards: (data.cards || []).map((c: DocumentData) => ({
      cardName: c.cardName,
      quantity: c.quantity,
      resolved: c.resolved ?? false,
      scryfallId: c.scryfallId ?? undefined,
    })) as DeckEntry[],
    format: data.format || 'commander',
    resolvedCount: data.resolvedCount ?? 0,
    unresolvedCount: data.unresolvedCount ?? 0,
    totalCards: data.totalCards ?? 0,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
  };
}

export async function loadDecks(uid: string): Promise<Deck[]> {
  const db = getFirebaseDb();
  if (!db) return [];

  const decksRef = collection(db, 'users', uid, 'decks');
  const q = query(decksRef, orderBy('updatedAt', 'desc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((d) => deckFromFirestore(d.id, d.data()));
}

export async function saveDeck(uid: string, deck: Deck): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  const deckRef = doc(db, 'users', uid, 'decks', deck.id);
  await setDoc(deckRef, deckToFirestore(deck));
}

export async function updateDeckInFirestore(
  uid: string,
  deckId: string,
  updates: Partial<Deck>
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  const deckRef = doc(db, 'users', uid, 'decks', deckId);
  const data: DocumentData = { updatedAt: Date.now() };

  if (updates.name !== undefined) data.name = updates.name;
  if (updates.commanderName !== undefined) data.commanderName = updates.commanderName;
  if (updates.cards !== undefined) {
    data.cards = updates.cards.map((c) => ({
      cardName: c.cardName,
      quantity: c.quantity,
      resolved: c.resolved ?? false,
      scryfallId: c.scryfallId ?? null,
    }));
  }
  if (updates.format !== undefined) data.format = updates.format;
  if (updates.resolvedCount !== undefined) data.resolvedCount = updates.resolvedCount;
  if (updates.unresolvedCount !== undefined) data.unresolvedCount = updates.unresolvedCount;
  if (updates.totalCards !== undefined) data.totalCards = updates.totalCards;

  await updateDoc(deckRef, data);
}

export async function deleteDeckFromFirestore(
  uid: string,
  deckId: string
): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;

  const deckRef = doc(db, 'users', uid, 'decks', deckId);
  await deleteDoc(deckRef);
}
