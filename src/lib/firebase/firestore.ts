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
import type { Deck, DeckEntry, Shelf } from '@/store/deckStore';
import { parsePlan, type Plan } from '@/lib/entitlements';

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

/**
 * Every field of a card entry is persisted. An earlier version dropped `forgeName`,
 * `forgeResolved` and `oracleId`, which meant a deck that imported cleanly (reprint names
 * substituted for Forge's originals) silently lost those substitutions on the next page load
 * and then failed to find half its cards when a game started.
 */
function entryToFirestore(c: DeckEntry): DocumentData {
  return {
    cardName: c.cardName,
    quantity: c.quantity,
    resolved: c.resolved ?? false,
    scryfallId: c.scryfallId ?? null,
    oracleId: c.oracleId ?? null,
    forgeName: c.forgeName ?? null,
    forgeResolved: c.forgeResolved ?? null,
  };
}

function entryFromFirestore(c: DocumentData): DeckEntry {
  return {
    cardName: c.cardName,
    quantity: c.quantity,
    resolved: c.resolved ?? false,
    scryfallId: c.scryfallId ?? undefined,
    oracleId: c.oracleId ?? undefined,
    forgeName: c.forgeName ?? undefined,
    forgeResolved: c.forgeResolved ?? undefined,
  };
}

function deckToFirestore(deck: Deck): DocumentData {
  return {
    name: deck.name,
    commanderName: deck.commanderName,
    cards: deck.cards.map(entryToFirestore),
    format: deck.format,
    resolvedCount: deck.resolvedCount,
    unresolvedCount: deck.unresolvedCount,
    totalCards: deck.totalCards,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
    shelfId: deck.shelfId ?? null,
  };
}

function deckFromFirestore(id: string, data: DocumentData): Deck {
  return {
    id,
    name: data.name || 'Unnamed',
    commanderName: data.commanderName || '',
    cards: (data.cards || []).map(entryFromFirestore),
    format: data.format || 'commander',
    resolvedCount: data.resolvedCount ?? 0,
    unresolvedCount: data.unresolvedCount ?? 0,
    totalCards: data.totalCards ?? 0,
    createdAt: data.createdAt ?? Date.now(),
    updatedAt: data.updatedAt ?? Date.now(),
    shelfId: data.shelfId ?? null,
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
  if (updates.cards !== undefined) data.cards = updates.cards.map(entryToFirestore);
  if (updates.shelfId !== undefined) data.shelfId = updates.shelfId;
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

// ─── Vault profile: shelves and plan ─────────────────

/**
 * Shelves live on the profile document rather than in their own collection. A player has a
 * handful at most, they are always loaded together, and keeping them on `users/{uid}` means
 * no new security rule is needed — the owner-only rule on the profile already covers them.
 *
 * `plan` is read here too. Nothing in the client writes it; see lib/entitlements.
 */
export interface VaultProfile {
  shelves: Shelf[];
  plan: Plan;
}

const SHELF_ACCENTS = new Set(['gold', 'W', 'U', 'B', 'R', 'G']);

export async function loadVaultProfile(uid: string): Promise<VaultProfile> {
  const db = getFirebaseDb();
  if (!db) return { shelves: [], plan: 'free' };

  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.exists() ? snap.data() : {};
  const shelves: Shelf[] = Array.isArray(data.shelves)
    ? data.shelves
        .filter((s: DocumentData) => typeof s?.id === 'string' && typeof s?.name === 'string')
        .map((s: DocumentData) => ({
          id: s.id,
          name: s.name,
          accent: SHELF_ACCENTS.has(s.accent) ? s.accent : 'gold',
          createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
        }))
    : [];
  return { shelves, plan: parsePlan(data.plan) };
}

export async function saveShelves(uid: string, shelves: Shelf[]): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  // merge: the profile may not exist yet if the upsert is still in flight.
  await setDoc(
    doc(db, 'users', uid),
    { shelves: shelves.map((s) => ({ id: s.id, name: s.name, accent: s.accent, createdAt: s.createdAt })) },
    { merge: true }
  );
}
