/**
 * Reading FIREBASE_SERVICE_ACCOUNT tolerantly. Pure, so it can be tested without the Admin
 * SDK: the JSON as pasted, or base64 of it; a private key whose newlines arrived
 * double-escaped is repaired; anything else fails with a message that says what to fix.
 */

/** Thrown when the server side is not set up; routes turn it into a 500, not a 401. */
export class ConfigError extends Error {
  status = 500;
}

export interface ServiceAccount { project_id: string; client_email: string; private_key: string }

export function parseServiceAccount(raw: string | undefined): ServiceAccount {
  if (!raw || !raw.trim()) throw new ConfigError('FIREBASE_SERVICE_ACCOUNT is not set on the server. Paste the service-account JSON into the Vercel environment (Production and Preview) and redeploy.');
  const text = raw.trim();
  let json: Partial<ServiceAccount> | null = null;
  try {
    json = JSON.parse(text) as Partial<ServiceAccount>;
  } catch {
    // Maybe base64 of the JSON.
    try {
      const decoded = Buffer.from(text, 'base64').toString('utf8');
      if (decoded.trim().startsWith('{')) json = JSON.parse(decoded) as Partial<ServiceAccount>;
    } catch { /* fall through */ }
  }
  if (!json || typeof json !== 'object') throw new ConfigError('FIREBASE_SERVICE_ACCOUNT is not valid JSON. It must be the whole service-account file (it starts with {"type": "service_account"), or base64 of it.');
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new ConfigError('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key. Use the service-account key from Firebase Console → Project settings → Service accounts → Generate new private key, not the web-app config.');
  }
  // "\\n" inside the key means the newlines were escaped once more on the way in.
  const privateKey = json.private_key.includes('\\n') ? json.private_key.replace(/\\n/g, '\n') : json.private_key;
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) throw new ConfigError('FIREBASE_SERVICE_ACCOUNT private_key is not a PEM key.');
  return { project_id: json.project_id, client_email: json.client_email, private_key: privateKey };
}
