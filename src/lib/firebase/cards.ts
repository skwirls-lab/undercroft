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
 * Normalize card name for matching (handle apostrophes, case, double-faced cards, etc.)
 */
function normalizeCardName(name: string): string[] {
  // Generate variations to try
  const variations: string[] = [];
  
  // Original
  variations.push(name);
  
  // Title case
  const titleCase = name.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
  variations.push(titleCase);
  
  // Replace straight apostrophe with curly apostrophe (U+2019)
  const curlyApostrophe = name.replace(/'/g, '\u2019');
  variations.push(curlyApostrophe);
  
  // Title case with curly apostrophe
  const titleCaseCurly = titleCase.replace(/'/g, '\u2019');
  variations.push(titleCaseCurly);
  
  // Remove duplicates
  return [...new Set(variations)];
}

/**
 * Check if a stored card name matches the search name
 * Handles double-faced cards (e.g., "Sink into Stupor // Soporific Springs" matches "Sink into Stupor")
 */
function cardNameMatches(storedName: string, searchName: string): boolean {
  // Exact match
  if (storedName === searchName) return true;
  
  // Check if stored name is a double-faced card and search name matches the front face
  if (storedName.includes(' // ')) {
    const frontFace = storedName.split(' // ')[0].trim();
    if (frontFace === searchName) return true;
  }
  
  return false;
}

/**
 * Get a card by its name (case-insensitive)
 * Tries multiple variations to handle apostrophes and capitalization
 */
export async function getCardByName(name: string): Promise<ScryfallCardRecord | null> {
  const db = getFirebaseDb();
  if (!db) return null;

  const cardsRef = collection(db, 'cards');
  const variations = normalizeCardName(name);
  
  // Try each variation
  for (const variant of variations) {
    const q = query(cardsRef, where('name', '==', variant), firestoreLimit(1));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return snapshot.docs[0].data() as ScryfallCardRecord;
    }
  }

  return null;
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
    
    // Try exact match first
    let q = query(cardsRef, where('name', 'in', batch));
    let snapshot = await getDocs(q);
    const found = new Map(snapshot.docs.map(d => [d.data().name, d.data() as ScryfallCardRecord]));
    
    // For unmatched names, try all variations AND double-faced card prefix search
    const unmatched = batch.filter(name => !found.has(name));
    if (unmatched.length > 0) {
      // Generate all variations for unmatched names
      const allVariations = new Map<string, string>(); // variant -> original name
      unmatched.forEach(name => {
        const variations = normalizeCardName(name);
        variations.forEach(variant => {
          if (variant !== name) { // Skip original since we already tried it
            allVariations.set(variant, name);
          }
        });
      });
      
      // Try all variations (in batches of 10)
      const variantNames = Array.from(allVariations.keys());
      for (let j = 0; j < variantNames.length; j += 10) {
        const variantBatch = variantNames.slice(j, j + 10);
        q = query(cardsRef, where('name', 'in', variantBatch));
        snapshot = await getDocs(q);
        
        // Map results back to original names
        snapshot.docs.forEach(doc => {
          const cardName = doc.data().name;
          const originalName = allVariations.get(cardName);
          if (originalName && !found.has(originalName)) {
            found.set(originalName, doc.data() as ScryfallCardRecord);
          }
        });
      }
      
      // Still unmatched? Try prefix search for double-faced cards
      const stillUnmatched = unmatched.filter(name => !found.has(name));
      for (const name of stillUnmatched) {
        // Try prefix search (for double-faced cards like "Sink into Stupor // Soporific Springs")
        const variations = normalizeCardName(name);
        for (const variant of variations) {
          if (found.has(name)) break; // Already found
          
          q = query(
            cardsRef,
            where('name', '>=', variant),
            where('name', '<=', variant + '\uf8ff'),
            firestoreLimit(5)
          );
          snapshot = await getDocs(q);
          
          // Check if any result is a double-faced card matching our search
          for (const doc of snapshot.docs) {
            const cardData = doc.data();
            if (cardNameMatches(cardData.name, variant)) {
              found.set(name, cardData as ScryfallCardRecord);
              break;
            }
          }
        }
      }
    }
    
    // Set results
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
