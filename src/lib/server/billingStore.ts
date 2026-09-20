import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebaseAdmin';
import { parsePlanProfile } from '@/lib/plan';
import type { BillingStore, PlanPatch } from '@/lib/billing';

/**
 * The Firestore side of billing. `stripeEvents/{id}` is the idempotency ledger: the claim
 * is a create inside a transaction, so two deliveries of one event cannot both apply.
 */
export function firestoreBillingStore(): BillingStore {
  const db = adminDb();
  return {
    async claimEvent(id, type) {
      const ref = db.doc(`stripeEvents/${id}`);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) return false;
        tx.set(ref, { type, at: FieldValue.serverTimestamp() });
        return true;
      });
    },
    async linkCustomer(uid, customerId, subscriptionId) {
      await db.doc(`users/${uid}`).set({ stripeCustomerId: customerId, ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}) }, { merge: true });
    },
    async uidForCustomer(customerId) {
      const q = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
      return q.empty ? null : q.docs[0].id;
    },
    async getProfile(uid) {
      const snap = await db.doc(`users/${uid}`).get();
      return snap.exists ? parsePlanProfile(snap.data() as Record<string, unknown>) : null;
    },
    async setPlan(uid, patch: PlanPatch) {
      await db.doc(`users/${uid}`).set({ ...patch, planNote: null }, { merge: true });
    },
    async setStatus(uid, status) {
      await db.doc(`users/${uid}`).set({ subscriptionStatus: status }, { merge: true });
    },
  };
}

/** The Stripe customer id on a profile, if checkout has ever linked one. */
export async function customerIdFor(uid: string): Promise<string | null> {
  const snap = await adminDb().doc(`users/${uid}`).get();
  const v = snap.exists ? (snap.data() as Record<string, unknown>).stripeCustomerId : null;
  return typeof v === 'string' && v ? v : null;
}
