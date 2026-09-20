/**
 * What a Stripe event means for a player's plan, as a pure function over a small store
 * interface, so the whole policy is testable with recorded events and no Firestore:
 *
 *   - checkout.session.completed      link the Stripe customer to the uid; Patron from now
 *   - customer.subscription.*         active or trialing → Patron (source stripe);
 *                                     anything else → free — unless the plan was granted by
 *                                     an admin, which billing never touches
 *   - invoice.payment_failed          note the status; the subscription event decides the plan
 *   - anything else                   ignored
 *
 * Every event is claimed by id first, so a redelivered webhook is a no-op.
 */

import type { PlanProfile, PlanSource } from '@/lib/plan';

export interface BillingEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface PlanPatch {
  plan: 'free' | 'patron';
  planSource: PlanSource | null;
  patronUntil: number | null;
  subscriptionStatus: string | null;
  stripeSubscriptionId: string | null;
}

export interface BillingStore {
  /** Record the event id; false when it was seen before. */
  claimEvent(id: string, type: string): Promise<boolean>;
  linkCustomer(uid: string, customerId: string, subscriptionId: string | null): Promise<void>;
  uidForCustomer(customerId: string): Promise<string | null>;
  getProfile(uid: string): Promise<PlanProfile | null>;
  setPlan(uid: string, patch: PlanPatch): Promise<void>;
  setStatus(uid: string, status: string): Promise<void>;
}

export type BillingOutcome =
  | 'duplicate' | 'ignored' | 'linked' | 'patron' | 'free' | 'admin-kept' | 'unknown-customer' | 'status';

const ACTIVE = new Set(['active', 'trialing']);

export async function applyBillingEvent(event: BillingEvent, store: BillingStore): Promise<BillingOutcome> {
  if (!(await store.claimEvent(event.id, event.type))) return 'duplicate';
  const obj = event.data.object;

  if (event.type === 'checkout.session.completed') {
    const uid = str(obj.client_reference_id) ?? str((obj.metadata as Record<string, unknown> | undefined)?.uid);
    const customer = idOf(obj.customer);
    const subscription = idOf(obj.subscription);
    if (!uid || !customer) return 'ignored';
    await store.linkCustomer(uid, customer, subscription);
    if (obj.mode === 'subscription' && (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required')) {
      const profile = await store.getProfile(uid);
      if (profile?.planSource === 'admin' && profile.plan === 'patron') return 'admin-kept';
      await store.setPlan(uid, { plan: 'patron', planSource: 'stripe', patronUntil: null, subscriptionStatus: 'active', stripeSubscriptionId: subscription });
      return 'patron';
    }
    return 'linked';
  }

  if (event.type.startsWith('customer.subscription.')) {
    const customer = idOf(obj.customer);
    if (!customer) return 'ignored';
    const uid = await store.uidForCustomer(customer);
    if (!uid) return 'unknown-customer';
    const profile = await store.getProfile(uid);
    const status = str(obj.status) ?? (event.type.endsWith('deleted') ? 'canceled' : null);
    const subscriptionId = str(obj.id);
    // An admin grant is the owner's decision; Stripe never overrides it in either direction.
    if (profile?.planSource === 'admin' && profile.plan === 'patron') {
      if (status) await store.setStatus(uid, status);
      return 'admin-kept';
    }
    if (status && ACTIVE.has(status) && event.type !== 'customer.subscription.deleted') {
      const cancelAtEnd = obj.cancel_at_period_end === true;
      const periodEnd = num(obj.current_period_end);
      await store.setPlan(uid, {
        plan: 'patron',
        planSource: 'stripe',
        // A cancelled-at-period-end subscription stays Patron until the period ends.
        patronUntil: cancelAtEnd && periodEnd ? periodEnd * 1000 : null,
        subscriptionStatus: cancelAtEnd ? 'canceling' : status,
        stripeSubscriptionId: subscriptionId,
      });
      return 'patron';
    }
    await store.setPlan(uid, { plan: 'free', planSource: null, patronUntil: null, subscriptionStatus: status, stripeSubscriptionId: subscriptionId });
    return 'free';
  }

  if (event.type === 'invoice.payment_failed') {
    const customer = idOf(obj.customer);
    const uid = customer ? await store.uidForCustomer(customer) : null;
    if (!uid) return 'unknown-customer';
    await store.setStatus(uid, 'past_due');
    return 'status';
  }

  return 'ignored';
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
/** Stripe sends related objects either as an id or expanded; both carry the id. */
function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') return (v as { id: string }).id;
  return null;
}
