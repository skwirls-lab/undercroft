import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './config';
import { parseAppConfig, DEFAULT_APP_CONFIG, type AppConfig } from '@/lib/appConfig';

/**
 * The client side of `config/app`. Any signed-in player may read it (allowances, the
 * notice, whether the Archivist is resting); only an admin may write it, and the rules say
 * so. In development mock mode there is no Firestore, so the defaults stand in.
 */

export async function loadAppConfig(): Promise<AppConfig> {
  const db = getFirebaseDb();
  if (!db) return DEFAULT_APP_CONFIG;
  const snap = await getDoc(doc(db, 'config', 'app'));
  return parseAppConfig(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
}

export async function saveAppConfig(patch: Partial<AppConfig>): Promise<void> {
  const db = getFirebaseDb();
  if (!db) return;
  await setDoc(doc(db, 'config', 'app'), { ...patch, updatedAt: Date.now() }, { merge: true });
}
