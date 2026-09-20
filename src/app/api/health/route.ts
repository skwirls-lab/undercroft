import { NextResponse } from 'next/server';
import { adminStatus } from '@/lib/server/firebaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health — is the server side set up? Booleans and project ids only, never a
 * secret. Open it in a browser after a deploy: every row should read ok / true, and the
 * two project ids must match, or sign-ins cannot be verified and every API call is a 401.
 */
export async function GET() {
  const admin = adminStatus();
  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;
  const problems: string[] = [];
  if (!admin.ok) problems.push(admin.error ?? 'Admin SDK failed to start.');
  else if (clientProjectId && admin.projectId !== clientProjectId) problems.push(`Project mismatch: the service account is for "${admin.projectId}" but the app signs users into "${clientProjectId}".`);
  if (!process.env.OPENROUTER_API_KEY) problems.push('OPENROUTER_API_KEY is not set: the Archivist cannot answer (ARCHIVIST_STUB=1 would answer from a script).');
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID || !process.env.STRIPE_WEBHOOK_SECRET) problems.push('Stripe is not fully configured (STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET): Become a Patron will be unavailable.');

  return NextResponse.json({
    ok: problems.length === 0,
    firebaseAdmin: { ok: admin.ok, projectId: admin.projectId, serviceAccount: admin.clientEmail, error: admin.error },
    clientProjectId,
    archivist: { keySet: !!process.env.OPENROUTER_API_KEY, stub: process.env.ARCHIVIST_STUB === '1' },
    billing: { secretKey: !!process.env.STRIPE_SECRET_KEY, priceId: !!process.env.STRIPE_PRICE_ID, webhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET },
    entitlementsEnforced: process.env.NEXT_PUBLIC_ENFORCE_ENTITLEMENTS === '1',
    problems,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
