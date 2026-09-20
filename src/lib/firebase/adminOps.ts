import { collection, doc, getDoc, getDocs, limit as qLimit, query, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from './config';
import { isDevMock } from '@/lib/devMock';
import { parsePlanProfile, monthKey, type PlanProfile, type PlanSource } from '@/lib/plan';

/**
 * What the admin panel does to other people's documents. Every call here is refused by the
 * security rules unless the caller's UID is on the admin allowlist, so the UI gate in
 * `isAdminUid` is a convenience and the rules are the lock.
 */

export interface AdminUserRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  profile: PlanProfile;
}

export interface MonthStats {
  calls: number;
  failed: number;
  tokensIn: number;
  tokensOut: number;
  byTask: Record<string, number>;
  updatedAt: number | null;
}

const EMPTY_STATS: MonthStats = { calls: 0, failed: 0, tokensIn: 0, tokensOut: 0, byTask: {}, updatedAt: null };

export async function findUserByEmail(email: string): Promise<AdminUserRow | null> {
  const needle = email.trim().toLowerCase();
  if (!needle) return null;
  if (isDevMock()) {
    const { mockAdminUsers } = await import('@/dev/mockAdmin');
    return mockAdminUsers.find((u) => u.email?.toLowerCase() === needle) ?? null;
  }
  const db = getFirebaseDb();
  if (!db) return null;
  const snap = await getDocs(query(collection(db, 'users'), where('email', '==', needle), qLimit(1)));
  if (snap.empty) {
    // Emails are stored as Google reports them; try the exact case too.
    const exact = await getDocs(query(collection(db, 'users'), where('email', '==', email.trim()), qLimit(1)));
    if (exact.empty) return null;
    return rowFrom(exact.docs[0].id, exact.docs[0].data());
  }
  return rowFrom(snap.docs[0].id, snap.docs[0].data());
}

export async function getUserRow(uid: string): Promise<AdminUserRow | null> {
  if (isDevMock()) {
    const { mockAdminUsers } = await import('@/dev/mockAdmin');
    return mockAdminUsers.find((u) => u.uid === uid) ?? null;
  }
  const db = getFirebaseDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? rowFrom(snap.id, snap.data()) : null;
}

/**
 * Grant or revoke Patron by hand. `planSource: 'admin'` marks the grant so the billing
 * webhook leaves it alone; revoking clears the source so a later Stripe event can take over.
 */
export async function setUserPlan(uid: string, grant: { patron: boolean; until?: number | null; note?: string | null }): Promise<void> {
  if (isDevMock()) {
    const { mockAdminUsers } = await import('@/dev/mockAdmin');
    const u = mockAdminUsers.find((x) => x.uid === uid);
    if (u) u.profile = { ...u.profile, plan: grant.patron ? 'patron' : 'free', planSource: grant.patron ? 'admin' : null, patronUntil: grant.until ?? null, planNote: grant.note ?? null };
    return;
  }
  const db = getFirebaseDb();
  if (!db) return;
  const source: PlanSource | null = grant.patron ? 'admin' : null;
  await updateDoc(doc(db, 'users', uid), {
    plan: grant.patron ? 'patron' : 'free',
    planSource: source,
    patronUntil: grant.patron ? grant.until ?? null : null,
    planNote: grant.note ?? null,
  });
}

export async function getMonthStats(month = monthKey()): Promise<MonthStats> {
  if (isDevMock()) {
    const { mockMonthStats } = await import('@/dev/mockAdmin');
    return mockMonthStats;
  }
  const db = getFirebaseDb();
  if (!db) return EMPTY_STATS;
  const snap = await getDoc(doc(db, 'stats', month));
  if (!snap.exists()) return EMPTY_STATS;
  const d = snap.data();
  return {
    calls: num(d.calls),
    failed: num(d.failed),
    tokensIn: num(d.tokensIn),
    tokensOut: num(d.tokensOut),
    byTask: d.byTask && typeof d.byTask === 'object' ? Object.fromEntries(Object.entries(d.byTask).map(([k, v]) => [k, num(v)])) : {},
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : null,
  };
}

function rowFrom(uid: string, data: Record<string, unknown>): AdminUserRow {
  return {
    uid,
    email: typeof data.email === 'string' ? data.email : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    profile: parsePlanProfile(data),
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
