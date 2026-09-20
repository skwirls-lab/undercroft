import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { monthKey, parsePlanProfile, resolvePlan, type PlanProfile } from '@/lib/plan';
import type { AppConfig } from '@/lib/appConfig';
import { fits, allowanceFor, QuotaError, type Allowance, type ArchivistTask } from '@/lib/metering';

export { fits, allowanceFor, QuotaError, type Allowance, type ArchivistTask };

/**
 * Counting the Archivist's use, per player, per calendar month.
 *
 * The count is reserved BEFORE the model is called and reconciled with real token numbers
 * after, in two transactions, so a burst of parallel requests cannot all slip under the
 * allowance at once and a request that fails after the reservation still costs one call
 * (the model was asked; that is the thing being rationed). Monthly totals also go to
 * `stats/{YYYY-MM}` for the admin panel, and every call leaves a row in `archivistLog` so a
 * surprising bill can be traced to a player and a task.
 */

/**
 * Load the caller's profile, resolve their plan, and reserve one call this month if the
 * allowance permits. Throws QuotaError otherwise. Returns the plan and the new count.
 */
export async function reserveCall(uid: string, config: AppConfig): Promise<{ profile: PlanProfile; allowance: Allowance }> {
  const db = adminDb();
  const ref = db.doc(`users/${uid}`);
  const month = monthKey();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const profile = parsePlanProfile(snap.exists ? (snap.data() as Record<string, unknown>) : null);
    const plan = resolvePlan(profile);
    const allowed = allowanceFor(plan, config);
    const used = profile.usage[month]?.archivist ?? 0;
    if (!fits(used, allowed)) throw new QuotaError({ plan, used, allowed });
    tx.set(ref, { usage: { [month]: { archivist: FieldValue.increment(1) } } }, { merge: true });
    return { profile, allowance: { plan, used: used + 1, allowed } };
  });
}

/** After the model answers: record tokens on the profile, the month stats and the log. */
export async function recordCall(args: {
  uid: string;
  task: ArchivistTask;
  model: string;
  tokensIn: number;
  tokensOut: number;
  ms: number;
  ok: boolean;
}): Promise<void> {
  const db = adminDb();
  const month = monthKey();
  const batch = db.batch();
  batch.set(db.doc(`users/${args.uid}`), {
    usage: { [month]: { tokensIn: FieldValue.increment(args.tokensIn), tokensOut: FieldValue.increment(args.tokensOut) } },
  }, { merge: true });
  batch.set(db.doc(`stats/${month}`), {
    calls: FieldValue.increment(1),
    failed: FieldValue.increment(args.ok ? 0 : 1),
    tokensIn: FieldValue.increment(args.tokensIn),
    tokensOut: FieldValue.increment(args.tokensOut),
    byTask: { [args.task]: FieldValue.increment(1) },
    updatedAt: Date.now(),
  }, { merge: true });
  batch.set(db.collection('archivistLog').doc(), {
    uid: args.uid,
    task: args.task,
    model: args.model,
    tokensIn: args.tokensIn,
    tokensOut: args.tokensOut,
    ms: args.ms,
    ok: args.ok,
    at: Date.now(),
  });
  await batch.commit();
}
