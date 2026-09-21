/**
 * The price list under both positions of the launch switch, and plan resolution.
 *
 * Run: npm run test:entitlements
 */
import { can, limit, FEATURES, LIMITS, patronOnlyFeatures, type Feature, type Limit } from '../src/lib/entitlements';
import { resolvePlan, parsePlanProfile, monthKey, usageThisMonth } from '../src/lib/plan';
import { parseAppConfig, DEFAULT_APP_CONFIG } from '../src/lib/appConfig';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('switch off');
for (const f of Object.keys(FEATURES) as Feature[]) {
  check(`free may ${f} while enforcement is off`, can('free', f, false));
}
for (const l of Object.keys(LIMITS) as Limit[]) {
  check(`${l} is unbounded (or the engine max) while enforcement is off`, limit('free', l, false) >= LIMITS[l].patron);
}

console.log('switch on');
// Everything that is play is free: pod size, opponent choice and shelves never gate.
check('shelves are free', can('free', 'vault.shelves', true) && can('patron', 'vault.shelves', true));
check('choosing opponent decks is free', can('free', 'opponents.choose', true) && can('patron', 'opponents.choose', true));
check('four-player pods are free', can('free', 'game.fourPlayer', true) && can('patron', 'game.fourPlayer', true));
check('deck advice is on both plans', can('free', 'archivist.deck', true) && can('patron', 'archivist.deck', true));
check('the match assistant is Patron-only', !can('free', 'archivist.match', true) && can('patron', 'archivist.match', true));
check('free vault holds 2 decks', limit('free', 'vault.maxDecks', true) === 2);
check('patron vault is unbounded', limit('patron', 'vault.maxDecks', true) === Infinity);
check('every plan seats 3 AI opponents', limit('free', 'game.maxAI', true) === 3 && limit('patron', 'game.maxAI', true) === 3);
check('the only Patron-only rows are the Archivist tasks', patronOnlyFeatures().every((f) => f.startsWith('archivist.')) && patronOnlyFeatures().length === 3);
check('the vault limit is the one play-adjacent gate', limit('free', 'vault.maxDecks', true) === 2);

console.log('plan resolution');
const now = Date.parse('2026-09-20T00:00:00Z');
check('free is free', resolvePlan({ plan: 'free', patronUntil: null }, now) === 'free');
check('patron with no expiry is patron', resolvePlan({ plan: 'patron', patronUntil: null }, now) === 'patron');
check('patron with a future expiry is patron', resolvePlan({ plan: 'patron', patronUntil: now + 1 }, now) === 'patron');
check('patron with a past expiry is free', resolvePlan({ plan: 'patron', patronUntil: now - 1 }, now) === 'free');
check('expiry exactly now is free', resolvePlan({ plan: 'patron', patronUntil: now }, now) === 'free');

const profile = parsePlanProfile({ plan: 'patron', planSource: 'admin', patronUntil: 123, planNote: 'test', usage: { '2026-09': { archivist: 3, tokensIn: '9', tokensOut: 10 } }, junk: 1 });
check('parsePlanProfile keeps known fields', profile.plan === 'patron' && profile.planSource === 'admin' && profile.patronUntil === 123 && profile.planNote === 'test');
check('parsePlanProfile coerces bad numbers to zero', profile.usage['2026-09'].tokensIn === 0 && profile.usage['2026-09'].tokensOut === 10);
check('parsePlanProfile tolerates nothing', parsePlanProfile(null).plan === 'free' && parsePlanProfile(undefined).usage !== undefined);
check('unknown planSource reads as null', parsePlanProfile({ planSource: 'gift' }).planSource === null);
check('monthKey is UTC year-month', monthKey(new Date('2026-09-20T23:59:59Z')) === '2026-09' && monthKey(new Date('2026-01-01T00:00:00Z')) === '2026-01');
check('usageThisMonth is zero for a fresh month', usageThisMonth(profile, new Date('2026-10-02T00:00:00Z')).archivist === 0);
check('usageThisMonth reads the current month', usageThisMonth(profile, new Date('2026-09-15T00:00:00Z')).archivist === 3);

console.log('app config');
const cfg = parseAppConfig({ archivistEnabled: false, archivistModel: '  x/y  ', allowance: { free: -1, patron: 500 }, notice: 'hi', costPerMillionIn: 0.5 });
check('parseAppConfig keeps valid values', cfg.archivistEnabled === false && cfg.archivistModel === 'x/y' && cfg.allowance.patron === 500 && cfg.notice === 'hi' && cfg.costPerMillionIn === 0.5);
check('parseAppConfig rejects a negative allowance', cfg.allowance.free === DEFAULT_APP_CONFIG.allowance.free);
check('parseAppConfig of nothing is the defaults', JSON.stringify(parseAppConfig(null)) === JSON.stringify(DEFAULT_APP_CONFIG));
check('default model is the one asked for', DEFAULT_APP_CONFIG.archivistModel.includes('deepseek'));

console.log(failures === 0 ? '\nAll entitlement tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
