import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/server/stripe';
import { firestoreBillingStore } from '@/lib/server/billingStore';
import { applyBillingEvent } from '@/lib/billing';

export const dynamic = 'force-dynamic';

/**
 * POST /api/billing/webhook — Stripe calls this. The raw body is verified against
 * STRIPE_WEBHOOK_SECRET before anything is read; the event is then applied through the
 * pure policy in lib/billing with the Firestore store (idempotent by event id).
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: 'not configured' }, { status: 503 });

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    console.error('[billing] bad signature', err);
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  try {
    const outcome = await applyBillingEvent(
      { id: event.id, type: event.type, data: { object: event.data.object as unknown as Record<string, unknown> } },
      firestoreBillingStore()
    );
    console.log(`[billing] ${event.type} ${event.id}: ${outcome}`);
    return NextResponse.json({ received: true, outcome });
  } catch (err) {
    // A 500 makes Stripe retry, which the idempotency ledger tolerates.
    console.error('[billing] apply failed', err);
    return NextResponse.json({ error: 'apply failed' }, { status: 500 });
  }
}
