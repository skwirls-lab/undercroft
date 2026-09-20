/**
 * The billing policy against recorded Stripe event shapes and an in-memory store:
 * activation, cancellation, an admin grant left alone, and a replayed event ignored.
 *
 * Run: npm run test:billing
 */
import { applyBillingEvent, type BillingStore, type PlanPatch } from '../src/lib/billing';
import { EMPTY_PLAN_PROFILE, type PlanProfile } from '../src/lib/plan';

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function memoryStore(seed: Record<string, Partial<PlanProfile> & { stripeCustomerId?: string }> = {}) {
  const users = new Map<string, PlanProfile & { stripeCustomerId?: string; stripeSubscriptionId?: string | null }>();
  for (const [uid, p] of Object.entries(seed)) users.set(uid, { ...EMPTY_PLAN_PROFILE, ...p });
  const events = new Set<string>();
  const store: BillingStore = {
    async claimEvent(id) { if (events.has(id)) return false; events.add(id); return true; },
    async linkCustomer(uid, customerId, subscriptionId) { const u = users.get(uid) ?? { ...EMPTY_PLAN_PROFILE }; users.set(uid, { ...u, stripeCustomerId: customerId, stripeSubscriptionId: subscriptionId ?? u.stripeSubscriptionId ?? null }); },
    async uidForCustomer(customerId) { for (const [uid, u] of users) if (u.stripeCustomerId === customerId) return uid; return null; },
    async getProfile(uid) { return users.get(uid) ?? null; },
    async setPlan(uid, patch: PlanPatch) { const u = users.get(uid) ?? { ...EMPTY_PLAN_PROFILE }; users.set(uid, { ...u, ...patch, planNote: null }); },
    async setStatus(uid, status) { const u = users.get(uid); if (u) users.set(uid, { ...u, subscriptionStatus: status }); },
  };
  return { store, users };
}

const checkout = (id: string, uid: string, customer = 'cus_1', paid = true) => ({
  id, type: 'checkout.session.completed',
  data: { object: { mode: 'subscription', payment_status: paid ? 'paid' : 'unpaid', client_reference_id: uid, metadata: { uid }, customer, subscription: 'sub_1' } },
});
const sub = (id: string, type: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, type, data: { object: { id: 'sub_1', customer: 'cus_1', status, ...extra } },
});

async function main() {
console.log('activation');
{
  const { store, users } = memoryStore({ alice: {} });
  check('checkout links the customer and makes a Patron', (await applyBillingEvent(checkout('evt_1', 'alice'), store)) === 'patron' && users.get('alice')?.plan === 'patron' && users.get('alice')?.planSource === 'stripe' && users.get('alice')?.stripeCustomerId === 'cus_1');
  check('the subscription event keeps it', (await applyBillingEvent(sub('evt_2', 'customer.subscription.updated', 'active'), store)) === 'patron');
  check('an unpaid checkout only links', (await applyBillingEvent(checkout('evt_3', 'bob', 'cus_2', false), store)) === 'linked' && users.get('bob')?.plan === 'free');
  check('trialing counts as Patron', (await applyBillingEvent(sub('evt_4', 'customer.subscription.updated', 'trialing'), store)) === 'patron');
  check('the customer object may be expanded', (await applyBillingEvent({ id: 'evt_5', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', customer: { id: 'cus_1' }, status: 'active' } } }, store)) === 'patron');
}

console.log('cancellation');
{
  const { store, users } = memoryStore({ alice: { plan: 'patron', planSource: 'stripe', stripeCustomerId: 'cus_1' } });
  const end = 1_800_000_000;
  check('cancel at period end stays Patron until then', (await applyBillingEvent(sub('evt_1', 'customer.subscription.updated', 'active', { cancel_at_period_end: true, current_period_end: end }), store)) === 'patron' && users.get('alice')?.patronUntil === end * 1000 && users.get('alice')?.subscriptionStatus === 'canceling');
  check('deleted subscription → free', (await applyBillingEvent(sub('evt_2', 'customer.subscription.deleted', 'canceled'), store)) === 'free' && users.get('alice')?.plan === 'free' && users.get('alice')?.planSource === null);
  check('past_due → free', (await applyBillingEvent(sub('evt_3', 'customer.subscription.updated', 'past_due'), store)) === 'free');
  check('payment failed notes the status', (await applyBillingEvent({ id: 'evt_4', type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } }, store)) === 'status' && users.get('alice')?.subscriptionStatus === 'past_due');
}

console.log('admin grants');
{
  const { store, users } = memoryStore({ alice: { plan: 'patron', planSource: 'admin', planNote: 'Owner', stripeCustomerId: 'cus_1' } });
  check('a cancelled subscription never revokes an admin grant', (await applyBillingEvent(sub('evt_1', 'customer.subscription.deleted', 'canceled'), store)) === 'admin-kept' && users.get('alice')?.plan === 'patron' && users.get('alice')?.planSource === 'admin' && users.get('alice')?.planNote === 'Owner');
  check('an active subscription does not overwrite an admin grant', (await applyBillingEvent(sub('evt_2', 'customer.subscription.updated', 'active'), store)) === 'admin-kept' && users.get('alice')?.planSource === 'admin');
  check('a paid checkout does not overwrite an admin grant', (await applyBillingEvent(checkout('evt_3', 'alice'), store)) === 'admin-kept');
}

console.log('robustness');
{
  const { store } = memoryStore({ alice: {} });
  check('first delivery applies', (await applyBillingEvent(checkout('evt_1', 'alice'), store)) === 'patron');
  check('a replayed event is ignored', (await applyBillingEvent(checkout('evt_1', 'alice'), store)) === 'duplicate');
  check('an unknown customer is reported, not crashed', (await applyBillingEvent(sub('evt_2', 'customer.subscription.updated', 'active', { customer: 'cus_nobody' }), store)) === 'unknown-customer');
  check('unrelated events are ignored', (await applyBillingEvent({ id: 'evt_3', type: 'charge.succeeded', data: { object: {} } }, store)) === 'ignored');
  check('a checkout with no uid is ignored', (await applyBillingEvent({ id: 'evt_4', type: 'checkout.session.completed', data: { object: { mode: 'subscription', payment_status: 'paid', customer: 'cus_9' } } }, store)) === 'ignored');
}


  console.log(failures === 0 ? '\nAll billing tests passed.' : `\n${failures} failure(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
