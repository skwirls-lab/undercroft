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
import type { ScryfallCardRecord } from '@/lib/cardTypes';

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
/**
 * Of two printings of the same card, is `a` the one to show? The sync marks the oldest
 * ordinary paper printing `preferred`; before a sync has run, the earliest release wins.
 */
export function betterPrinting(a: ScryfallCardRecord, b: ScryfallCardRecord): boolean {
  if (!!a.preferred !== !!b.preferred) return !!a.preferred;
  const ra = a.released_at ?? '9999';
  const rb = b.released_at ?? '9999';
  if (ra !== rb) return ra < rb;
  return false;
}

/** A record in our shape from a Scryfall card object, for a card the database does not hold yet. */
export function recordFromScryfall(card: Record<string, unknown>): ScryfallCardRecord | null {
  if (typeof card?.name !== 'string' || typeof card?.id !== 'string') return null;
  const images = (u: unknown) => {
    const o = (u ?? {}) as Record<string, string>;
    return { small: o.small || '', normal: o.normal || '', large: o.large || '', art_crop: o.art_crop || '', border_crop: o.border_crop || '', png: o.png || '' };
  };
  const legalities = (card.legalities ?? {}) as Record<string, string>;
  const rec: ScryfallCardRecord = {
    id: card.id,
    oracle_id: typeof card.oracle_id === 'string' ? card.oracle_id : '',
    name: card.name,
    mana_cost: typeof card.mana_cost === 'string' ? card.mana_cost : '',
    cmc: typeof card.cmc === 'number' ? card.cmc : 0,
    type_line: typeof card.type_line === 'string' ? card.type_line : '',
    oracle_text: typeof card.oracle_text === 'string' ? card.oracle_text : '',
    colors: Array.isArray(card.colors) ? (card.colors as string[]) : [],
    color_identity: Array.isArray(card.color_identity) ? (card.color_identity as string[]) : [],
    keywords: Array.isArray(card.keywords) ? (card.keywords as string[]) : [],
    layout: typeof card.layout === 'string' ? card.layout : 'normal',
    legalities: { commander: legalities.commander ?? 'not_legal' },
    set: typeof card.set === 'string' ? card.set : '',
    set_name: typeof card.set_name === 'string' ? card.set_name : '',
    rarity: typeof card.rarity === 'string' ? card.rarity : '',
    released_at: typeof card.released_at === 'string' ? card.released_at : undefined,
  } as ScryfallCardRecord;
  if (typeof card.power === 'string') rec.power = card.power;
  if (typeof card.toughness === 'string') rec.toughness = card.toughness;
  if (typeof card.loyalty === 'string') rec.loyalty = card.loyalty;
  if (card.image_uris) rec.image_uris = images(card.image_uris);
  if (Array.isArray(card.card_faces)) {
    rec.card_faces = (card.card_faces as Array<Record<string, unknown>>).map((f) => ({
      name: typeof f.name === 'string' ? f.name : '',
      mana_cost: typeof f.mana_cost === 'string' ? f.mana_cost : '',
      type_line: typeof f.type_line === 'string' ? f.type_line : '',
      oracle_text: typeof f.oracle_text === 'string' ? f.oracle_text : '',
      ...(typeof f.power === 'string' ? { power: f.power } : {}),
      ...(typeof f.toughness === 'string' ? { toughness: f.toughness } : {}),
      ...(f.image_uris ? { image_uris: images(f.image_uris) } : {}),
    })) as ScryfallCardRecord['card_faces'];
  }
  return rec;
}

const SCRYFALL_HEADERS = { 'User-Agent': 'Undercroft/1.0', Accept: 'application/json' };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One name → the printing to show, from our collection. The preferred printing is asked for
 * first (two equality filters, served by Firestore's index merging); failing that, a few
 * printings of the name and the best of them. Never the whole pile: a basic land has
 * hundreds of printings, and the old `in` query pulled every one of them for every deck.
 */
async function lookupByName(cardsRef: ReturnType<typeof collection>, name: string): Promise<ScryfallCardRecord | null> {
  try {
    const pref = await getDocs(query(cardsRef, where('name', '==', name), where('preferred', '==', true), firestoreLimit(1)));
    if (!pref.empty) return pref.docs[0].data() as ScryfallCardRecord;
  } catch (err) {
    console.warn('[cards] preferred lookup failed, falling back', (err as Error)?.message);
  }
  const snap = await getDocs(query(cardsRef, where('name', '==', name), firestoreLimit(8)));
  let best: ScryfallCardRecord | null = null;
  for (const d of snap.docs) {
    const rec = d.data() as ScryfallCardRecord;
    if (!best || betterPrinting(rec, best)) best = rec;
  }
  return best;
}

/** Scryfall, for a name the collection does not know: the oldest paper printing if it exists at all. */
async function lookupOnScryfall(name: string): Promise<ScryfallCardRecord | null> {
  try {
    const q = `!"${name.replace(/"/g, '')}" game:paper prefer:oldest`;
    let res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards`, { headers: SCRYFALL_HEADERS });
    if (res.ok) {
      const data = await res.json();
      const first = Array.isArray(data?.data) ? data.data[0] : null;
      if (first) return recordFromScryfall(first);
    }
    await pause(100);
    res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`, { headers: SCRYFALL_HEADERS });
    if (res.ok) return recordFromScryfall(await res.json());
  } catch (err) {
    console.error(`Failed to resolve ${name} via Scryfall:`, err);
  }
  return null;
}

/**
 * Resolve card names to records: exact name, then the spelling variations an export can
 * produce, then a prefix match for a double-faced name given by its front face, then
 * Scryfall itself (a card newer than our last sync still resolves; the sync catches up later).
 */
export async function resolveCardNames(names: string[]): Promise<Map<string, ScryfallCardRecord | null>> {
  const results = new Map<string, ScryfallCardRecord | null>();
  const uniqueNames = [...new Set(names)];
  const db = getFirebaseDb();
  if (!db) {
    uniqueNames.forEach((name) => results.set(name, null));
    return results;
  }
  const cardsRef = collection(db, 'cards');

  const resolveOne = async (name: string): Promise<ScryfallCardRecord | null> => {
    const exact = await lookupByName(cardsRef, name);
    if (exact) return exact;

    for (const variant of normalizeCardName(name)) {
      if (variant === name) continue;
      const rec = await lookupByName(cardsRef, variant);
      if (rec) return rec;
    }

    // A double-faced card given by its front face: "Sink into Stupor" for "Sink into Stupor // Soporific Springs".
    for (const variant of normalizeCardName(name)) {
      const snap = await getDocs(query(cardsRef, where('name', '>=', variant), where('name', '<=', variant + ''), firestoreLimit(5)));
      for (const d of snap.docs) {
        const rec = d.data() as ScryfallCardRecord;
        if (cardNameMatches(rec.name, variant)) return rec;
      }
    }

    const fromScryfall = await lookupOnScryfall(name);
    if (!fromScryfall) return null;
    // Prefer our own copy of the same card when we have one under another spelling.
    if (fromScryfall.oracle_id) {
      const snap = await getDocs(query(cardsRef, where('oracle_id', '==', fromScryfall.oracle_id), firestoreLimit(8)));
      let best: ScryfallCardRecord | null = null;
      for (const d of snap.docs) {
        const rec = d.data() as ScryfallCardRecord;
        if (!best || betterPrinting(rec, best)) best = rec;
      }
      if (best) return best;
    }
    return fromScryfall;
  };

  // A few at a time: parallel enough to be quick, serial enough to be polite to Scryfall.
  const CONCURRENCY = 8;
  for (let i = 0; i < uniqueNames.length; i += CONCURRENCY) {
    const chunk = uniqueNames.slice(i, i + CONCURRENCY);
    const found = await Promise.all(chunk.map(async (name) => {
      try { return await resolveOne(name); } catch (err) { console.error(`[cards] resolve failed for ${name}:`, err); return null; }
    }));
    chunk.forEach((name, j) => results.set(name, found[j]));
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
