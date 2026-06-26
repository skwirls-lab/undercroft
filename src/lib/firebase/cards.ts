/**
 * Firestore card data access layer
 * Cards are stored in a global 'cards' collection that all users can read
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  limit as firestoreLimit,
  type DocumentData,
} from 'firebase/firestore';
import { getFirebaseDb } from './config';
import type { ScryfallCardRecord } from '@/lib/db';

/**
 * Get a card by its Scryfall ID
 */
export async function getCardById(id: string): Promise<ScryfallCardRecord | null> {
  const db = getFirebaseDb();
  if (!db) return null;

  const cardRef = doc(db, 'cards', id);
  const cardSnap = await getDoc(cardRef);

  if (!cardSnap.exists()) return null;

  return cardSnap.data() as ScryfallCardRecord;
}

/**
 * Get a card by its name (case-insensitive)
 */
export async function getCardByName(name: string): Promise<ScryfallCardRecord | null> {
  const db = getFirebaseDb();
  if (!db) return null;

  // Firestore doesn't support case-insensitive queries, so we need to normalize
  // For now, we'll do an exact match and rely on the client to handle case
  const cardsRef = collection(db, 'cards');
  const q = query(cardsRef, where('name', '==', name), firestoreLimit(1));
  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  return snapshot.docs[0].data() as ScryfallCardRecord;
}

/**
 * Search for cards by name prefix (for autocomplete)
 */
export async function searchCardsByName(namePrefix: string, limit = 20): Promise<ScryfallCardRecord[]> {
  const db = getFirebaseDb();
  if (!db) return [];

  // Firestore range query for prefix matching
  const cardsRef = collection(db, 'cards');
  const q = query(
    cardsRef,
    where('name', '>=', namePrefix),
    where('name', '<=', namePrefix + '\uf8ff'),
    firestoreLimit(limit)
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map(d => d.data() as ScryfallCardRecord);
}

/**
 * Resolve multiple card names to their Scryfall data
 * Returns a map of name → card data (or null if not found)
 */
export async function resolveCardNames(names: string[]): Promise<Map<string, ScryfallCardRecord | null>> {
  const results = new Map<string, ScryfallCardRecord | null>();
  
  // Batch resolve cards
  // Note: Firestore has a limit of 10 items per 'in' query, so we need to batch
  const uniqueNames = [...new Set(names)];
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + BATCH_SIZE);
    
    const db = getFirebaseDb();
    if (!db) {
      batch.forEach(name => results.set(name, null));
      continue;
    }

    const cardsRef = collection(db, 'cards');
    const q = query(cardsRef, where('name', 'in', batch));
    const snapshot = await getDocs(q);

    // Map results
    const found = new Map(snapshot.docs.map(d => [d.data().name, d.data() as ScryfallCardRecord]));
    batch.forEach(name => {
      results.set(name, found.get(name) || null);
    });
  }

  return results;
}

/**
 * Check if the cards collection has been populated
 */
export async function isCardsCollectionPopulated(): Promise<boolean> {
  const db = getFirebaseDb();
  if (!db) return false;

  try {
    const cardsRef = collection(db, 'cards');
    const q = query(cardsRef, firestoreLimit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch {
    return false;
  }
}
