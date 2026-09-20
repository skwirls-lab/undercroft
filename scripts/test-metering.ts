/**
 * The pure parts of usage metering: does a call fit, and which allowance applies.
 * The Firestore transaction around them is exercised by the rules/emulator suite and by
 * the deployed /api/me; here only the arithmetic is under test.
 *
 * Run: npm run test:metering
 */
import { fits, allowanceFor } from '../src/lib/metering';
import { DEFAULT_APP_CONFIG } from '../src/lib/appConfig';

let failures = 0;
function check(name: string, ok: boolean) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}`); }
}

check('a fresh month fits', fits(0, 10));
check('the last call fits', fits(9, 10));
check('at the allowance nothing fits', !fits(10, 10));
check('over the allowance nothing fits', !fits(11, 10));
check('a zero allowance never fits', !fits(0, 0));
check('free allowance comes from the config', allowanceFor('free', DEFAULT_APP_CONFIG) === DEFAULT_APP_CONFIG.allowance.free);
check('patron allowance comes from the config', allowanceFor('patron', { ...DEFAULT_APP_CONFIG, allowance: { free: 1, patron: 42 } }) === 42);

console.log(failures === 0 ? '\nAll metering tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
