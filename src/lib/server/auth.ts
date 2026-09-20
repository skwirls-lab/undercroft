import 'server-only';
import { NextResponse } from 'next/server';
import { adminAuth, ConfigError } from './firebaseAdmin';

export { ConfigError };

/**
 * Who is calling. The client sends its Firebase ID token as a bearer token; the Admin SDK
 * verifies the signature and expiry. Nothing else identifies a caller — not a cookie, not a
 * uid in the body.
 *
 * Two kinds of failure, kept apart on purpose: a token that does not verify is a 401 the
 * player can fix by signing in again; a server that cannot verify anything (no service
 * account, wrong project) is a ConfigError the deployment's owner must fix, reported as a
 * 500 with the reason in the logs and on /api/health.
 */
export interface Caller {
  uid: string;
  email: string | null;
}

export class AuthError extends Error {
  status = 401;
  constructor(message: string, public code: string = 'unauthenticated') { super(message); }
}

export async function requireUser(request: Request): Promise<Caller> {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new AuthError('Sign in to use this.');

  const auth = adminAuth(); // throws ConfigError when the server side is not set up
  try {
    const decoded = await auth.verifyIdToken(match[1]);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch (err) {
    const code = (err as { code?: string })?.code ?? 'unknown';
    const message = (err as Error)?.message ?? '';
    console.error(`[auth] verifyIdToken failed (${code}): ${message.split('\n')[0]}`);
    if (code === 'auth/id-token-expired') throw new AuthError('Your session has expired. Sign in again.', 'expired');
    if (/incorrect "aud"|incorrect "iss"|audience|issuer/i.test(message)) {
      // The token is for a different Firebase project than the service account: a setup error.
      throw new ConfigError('The Firebase service account on the server belongs to a different project than the app signs users into. Compare the project ids on /api/health.');
    }
    throw new AuthError('Your sign-in could not be verified. Sign out and in again.');
  }
}

/** A JSON error response with a machine-readable code the client switches on. */
export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** The one place a route turns an auth or setup failure into a response. */
export function errorResponse(err: unknown): NextResponse | null {
  if (err instanceof AuthError) return jsonError(err.status, err.code, err.message);
  if (err instanceof ConfigError) {
    console.error('[config]', err.message);
    return jsonError(500, 'server-config', 'This deployment is not fully set up yet. The owner can see what is missing at /api/health.');
  }
  return null;
}
