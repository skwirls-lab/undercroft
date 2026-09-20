/**
 * FIREBASE_SERVICE_ACCOUNT as it arrives from an environment editor: intact, base64,
 * with a double-escaped private key, or wrong — each with the message the owner needs.
 *
 * Run: npm run test:service-account
 */
import { parseServiceAccount, ConfigError } from '../src/lib/serviceAccount';

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function fails(raw: string | undefined, pattern: RegExp): boolean {
  try { parseServiceAccount(raw); return false; } catch (err) { return err instanceof ConfigError && pattern.test(err.message); }
}

const key = '-----BEGIN PRIVATE KEY-----\nMIIabc\ndef==\n-----END PRIVATE KEY-----\n';
const account = { type: 'service_account', project_id: 'undercroft-prod', client_email: 'svc@undercroft-prod.iam.gserviceaccount.com', private_key: key };
const json = JSON.stringify(account);

check('the file as pasted parses', parseServiceAccount(json).project_id === 'undercroft-prod');
check('pretty-printed JSON parses', parseServiceAccount(JSON.stringify(account, null, 2)).client_email === account.client_email);
check('base64 of the file parses', parseServiceAccount(Buffer.from(json).toString('base64')).private_key === key);
const doubled = JSON.stringify({ ...account, private_key: key.replace(/\n/g, '\\n') });
check('a double-escaped private key is repaired', parseServiceAccount(doubled).private_key === key);
check('unset → says to set it', fails(undefined, /not set/));
check('empty → says to set it', fails('   ', /not set/));
check('not JSON → says so', fails('{"type": "service_account", ', /not valid JSON/));
check('the web-app config is refused with a pointer to the right key', fails(JSON.stringify({ apiKey: 'x', projectId: 'p' }), /missing project_id|Service accounts/));
check('a key that is not PEM is refused', fails(JSON.stringify({ ...account, private_key: 'nope' }), /PEM/));

console.log(failures === 0 ? '\nAll service-account tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
