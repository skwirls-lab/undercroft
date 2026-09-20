import { NextResponse } from 'next/server';
import { requireUser, AuthError, jsonError } from '@/lib/server/auth';
import { adminDb } from '@/lib/server/firebaseAdmin';
import { getAppConfig } from '@/lib/server/appConfig';
import { allowanceFor } from '@/lib/metering';
import { parsePlanProfile, resolvePlan, usageThisMonth } from '@/lib/plan';

export const dynamic = 'force-dynamic';

/**
 * Who am I, as the server sees it: the resolved plan, this month's Archivist usage and the
 * allowance that applies. The client shows this in Settings; it is also the smallest possible
 * proof that the token-verification path works end to end on a deployment.
 */
export async function GET(request: Request) {
  try {
    const caller = await requireUser(request);
    const [snap, config] = await Promise.all([adminDb().doc(`users/${caller.uid}`).get(), getAppConfig()]);
    const profile = parsePlanProfile(snap.exists ? (snap.data() as Record<string, unknown>) : null);
    const plan = resolvePlan(profile);
    const usage = usageThisMonth(profile);
    return NextResponse.json({
      uid: caller.uid,
      plan,
      planSource: profile.planSource,
      patronUntil: profile.patronUntil,
      usage,
      allowance: allowanceFor(plan, config),
      archivistEnabled: config.archivistEnabled,
    });
  } catch (err) {
    if (err instanceof AuthError) return jsonError(err.status, 'unauthenticated', err.message);
    console.error('[api/me]', err);
    return jsonError(500, 'server', 'Something went wrong on the server.');
  }
}
