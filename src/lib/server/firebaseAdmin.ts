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
 * A misconfigured deployment fails on the first request with a message that says what to
 * fix (see /api/health), never as a 401 that looks like the player's fault. The value is
 * read tolerantly: the JSON as pasted, or base64 of it, and a private key whose newlines
 * arrived double-escaped (a common result of pasting into an environment editor) is repaired.
 */

import { parseServiceAccount, ConfigError, type ServiceAccount } from '@/lib/serviceAccount';

export { ConfigError };

let app: App | null = null;

export function readServiceAccount(): ServiceAccount {
  return parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
}

export function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) { app = existing; return app; }
  const json = readServiceAccount();
  try {
    app = initializeApp({ credential: cert({ projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key }), projectId: json.project_id });
  } catch (err) {
    throw new ConfigError(`The Firebase Admin SDK could not start from FIREBASE_SERVICE_ACCOUNT: ${(err as Error).message}`);
  }
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function adminAuth(): Auth {
  return getAuth(getAdminApp());
}

/** For /api/health: does the server side start, and for which project? Never the secret. */
export function adminStatus(): { ok: boolean; projectId: string | null; clientEmail: string | null; error: string | null } {
  try {
    const json = readServiceAccount();
    getAdminApp();
    return { ok: true, projectId: json.project_id ?? null, clientEmail: json.client_email ?? null, error: null };
  } catch (err) {
    return { ok: false, projectId: null, clientEmail: null, error: (err as Error).message };
  }
}
