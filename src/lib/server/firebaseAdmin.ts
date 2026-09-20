import 'server-only';
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * The Admin SDK, initialised once per lambda instance from the same service-account JSON
 * the card-sync GitHub Action uses (`FIREBASE_SERVICE_ACCOUNT`). Admin writes bypass the
 * security rules, which is exactly why plan changes and usage counters go through here and
 * never through the browser.
 *
 * Throws a clear error when the variable is missing so a misconfigured deployment fails on
 * the first request with a message that says what to set, not a stack trace from deep inside
 * the SDK.
 */

let app: App | null = null;

export function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) { app = existing; return app; }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set on the server. Paste the service-account JSON into the Vercel environment.');
  let json: Record<string, string>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON.');
  }
  app = initializeApp({ credential: cert(json), projectId: json.project_id });
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}
