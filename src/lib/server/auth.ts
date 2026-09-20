import 'server-only';
import { NextResponse } from 'next/server';
import { adminAuth } from './firebaseAdmin';

/**
 * Who is calling. The client sends its Firebase ID token as a bearer token; the Admin SDK
 * verifies the signature and expiry. Nothing else identifies a caller — not a cookie, not a
 * uid in the body.
 */
export interface Caller {
  uid: string;
  email: string | null;
}

export class AuthError extends Error {
  status = 401;
}

export async function requireUser(request: Request): Promise<Caller> {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new AuthError('Sign in to use this.');
  try {
    const decoded = await adminAuth().verifyIdToken(match[1]);
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    throw new AuthError('Your session has expired. Sign in again.');
  }
}

/** A JSON error response with a machine-readable code the client switches on. */
export function jsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
