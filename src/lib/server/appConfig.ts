import 'server-only';
import { adminDb } from './firebaseAdmin';
import { parseAppConfig, type AppConfig } from '@/lib/appConfig';

/**
 * `config/app`, read through the Admin SDK and cached briefly per lambda instance. Thirty
 * seconds is short enough that the admin's kill switch bites almost at once and long enough
 * that a burst of requests does not re-read the document each time.
 */

const TTL_MS = 30_000;
let cached: { at: number; value: AppConfig } | null = null;

export async function getAppConfig(): Promise<AppConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const snap = await adminDb().doc('config/app').get();
  const value = parseAppConfig(snap.exists ? (snap.data() as Record<string, unknown>) : null);
  cached = { at: Date.now(), value };
  return value;
}

/** Tests and the admin panel's own writes call this so a fresh read follows. */
export function invalidateAppConfig(): void {
  cached = null;
}
