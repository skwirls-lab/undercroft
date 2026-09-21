/**
 * Match records under the player's profile: users/{uid}/matches/{matchId}. Owner-only, like
 * decks; see firestore.rules.
 */

import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from './config';
import type { MatchRecord } from '@/lib/matchHistory';

export async function saveMatch(uid: string, record: MatchRecord): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  await setDoc(doc(db, 'users', uid, 'matches', record.id), record);
}

export async function loadMatches(uid: string, max = 100): Promise<MatchRecord[]> {
  const db = getFirebaseDb();
  if (!db) return [];
  const q = query(collection(db, 'users', uid, 'matches'), orderBy('endedAt', 'desc'), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...(d.data() as MatchRecord), id: d.id }));
}

export async function saveMatchRecap(uid: string, matchId: string, text: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  await updateDoc(doc(db, 'users', uid, 'matches', matchId), { recap: { text, at: Date.now() } });
}

export async function deleteMatch(uid: string, matchId: string): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  await deleteDoc(doc(db, 'users', uid, 'matches', matchId));
}
