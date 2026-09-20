import { NextResponse } from 'next/server';
import { requireUser, AuthError, jsonError } from '@/lib/server/auth';
import { getStripe, stripePriceId, siteUrl } from '@/lib/server/stripe';
import { customerIdFor } from '@/lib/server/billingStore';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/checkout — start a Patron subscription. Creates a Stripe Checkout
 * Session tied to the caller's uid (client_reference_id and metadata) and returns its URL;
 * the webhook does the rest when the payment lands.
 */
export async function POST(request: Request) {
  let uid: string; let email: string | null;
  try {
    ({ uid, email } = await requireUser(request));
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.status, 'unauthenticated', err.message);
    throw err;
  }
  const stripe = getStripe();
  const price = stripePriceId();
  if (!stripe || !price) return jsonError(503, 'disabled', 'Billing is not configured on this deployment.');

  const base = siteUrl(request);
  try {
    const existing = await customerIdFor(uid);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      client_reference_id: uid,
      metadata: { uid },
      ...(existing ? { customer: existing } : { customer_email: email ?? undefined }),
      allow_promotion_codes: true,
      success_url: `${base}/?patron=welcome`,
      cancel_url: `${base}/?patron=cancel`,
    });
    if (!session.url) return jsonError(502, 'upstream', 'Stripe did not return a checkout link.');
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing] checkout', err);
    return jsonError(502, 'upstream', 'Could not start checkout. Try again in a moment.');
  }
}
