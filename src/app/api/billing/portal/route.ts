import { NextResponse } from 'next/server';
import { requireUser, AuthError, jsonError } from '@/lib/server/auth';
import { getStripe, siteUrl } from '@/lib/server/stripe';
import { customerIdFor } from '@/lib/server/billingStore';

export const dynamic = 'force-dynamic';

/** POST /api/billing/portal — a Customer Portal link for managing or cancelling. */
export async function POST(request: Request) {
  let uid: string;
  try {
    ({ uid } = await requireUser(request));
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.status, 'unauthenticated', err.message);
    throw err;
  }
  const stripe = getStripe();
  if (!stripe) return jsonError(503, 'disabled', 'Billing is not configured on this deployment.');
  const customer = await customerIdFor(uid);
  if (!customer) return jsonError(404, 'no-customer', 'No subscription is linked to this account.');
  try {
    const session = await stripe.billingPortal.sessions.create({ customer, return_url: `${siteUrl(request)}/` });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[billing] portal', err);
    return jsonError(502, 'upstream', 'Could not open the billing portal.');
  }
}
