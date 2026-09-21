/**
 * Firestore security rules, exercised against the emulator.
 *
 *   npm run test:rules
 *   (= npx firebase-tools emulators:exec --only firestore --project demo-undercroft "node scripts/test-rules.mjs")
 *
 * The admin allowlist in the real rules file holds a placeholder UID; the test substitutes
 * its own admin UID so the same rules text is under test. What is checked is the shape of the
 * permissions, which is what a mistake would break: a player promoting themselves, a player
 * reading another's profile, an admin editing anything but the plan fields, config being
 * writable by a player, stats being writable by anyone.
 */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, deleteDoc } from 'firebase/firestore';

const ADMIN = 'admin-uid';
const ALICE = 'alice-uid';
const BOB = 'bob-uid';

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').replace("'PASTE_YOUR_FIREBASE_UID_HERE'", `'${ADMIN}'`);

const env = await initializeTestEnvironment({
  projectId: 'demo-undercroft',
  firestore: { rules, host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ?? '127.0.0.1', port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ?? 8080) },
});

let failures = 0;
async function check(name, promise) {
  try { await promise; console.log(`  ✓ ${name}`); }
  catch (err) { failures++; console.log(`  ✗ ${name} — ${err?.message?.split('\n')[0]}`); }
}

// Seed with rules off.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', ALICE), { uid: ALICE, email: 'alice@example.com', plan: 'free', shelves: [] });
  await setDoc(doc(db, 'users', BOB), { uid: BOB, email: 'bob@example.com', plan: 'patron', planSource: 'stripe', shelves: [] });
  await setDoc(doc(db, 'config', 'app'), { archivistEnabled: true, notice: '' });
  await setDoc(doc(db, 'stats', '2026-09'), { calls: 3 });
  await setDoc(doc(db, 'cards', 'c1'), { name: 'Sol Ring' });
});

const alice = env.authenticatedContext(ALICE).firestore();
const admin = env.authenticatedContext(ADMIN).firestore();
const anon = env.unauthenticatedContext().firestore();

console.log('profiles');
await check('a player reads their own profile', assertSucceeds(getDoc(doc(alice, 'users', ALICE))));
await check('a player cannot read another profile', assertFails(getDoc(doc(alice, 'users', BOB))));
await check('a player cannot list profiles', assertFails(getDocs(query(collection(alice, 'users'), where('email', '==', 'bob@example.com')))));
await check('a player updates their shelves', assertSucceeds(updateDoc(doc(alice, 'users', ALICE), { shelves: [{ id: 's1', name: 'Tourney', accent: 'gold', createdAt: 1 }] })));
await check('a player cannot promote themselves', assertFails(updateDoc(doc(alice, 'users', ALICE), { plan: 'patron' })));
await check('a player cannot set planSource', assertFails(updateDoc(doc(alice, 'users', ALICE), { planSource: 'admin' })));
await check('a player cannot reset their usage', assertFails(updateDoc(doc(alice, 'users', ALICE), { usage: {} })));
await check('a player cannot touch Stripe fields', assertFails(updateDoc(doc(alice, 'users', ALICE), { subscriptionStatus: 'active' })));
await check('a new profile cannot be created with a plan', assertFails(setDoc(doc(env.authenticatedContext('carol').firestore(), 'users', 'carol'), { uid: 'carol', plan: 'patron' })));
await check('a new profile without a plan is fine', assertSucceeds(setDoc(doc(env.authenticatedContext('carol').firestore(), 'users', 'carol'), { uid: 'carol', email: 'c@example.com' })));
await check('a player deletes their own profile', assertSucceeds(deleteDoc(doc(env.authenticatedContext('carol').firestore(), 'users', 'carol'))));

console.log('admin');
await check('an admin reads any profile', assertSucceeds(getDoc(doc(admin, 'users', ALICE))));
await check('an admin looks a player up by email', assertSucceeds(getDocs(query(collection(admin, 'users'), where('email', '==', 'alice@example.com')))));
await check('an admin grants Patron', assertSucceeds(updateDoc(doc(admin, 'users', ALICE), { plan: 'patron', planSource: 'admin', patronUntil: null, planNote: 'tester' })));
await check('an admin revokes Patron', assertSucceeds(updateDoc(doc(admin, 'users', ALICE), { plan: 'free', planSource: null, patronUntil: null, planNote: null })));
await check("an admin cannot edit a player's shelves", assertFails(updateDoc(doc(admin, 'users', ALICE), { shelves: [] })));
await check("an admin cannot edit a player's usage", assertFails(updateDoc(doc(admin, 'users', ALICE), { usage: {} })));
await check('an admin cannot mix plan and other fields', assertFails(updateDoc(doc(admin, 'users', ALICE), { plan: 'patron', email: 'x' })));
await check("an admin cannot delete a player's profile", assertFails(deleteDoc(doc(admin, 'users', ALICE))));

console.log('config and stats');
await check('a player reads the app config', assertSucceeds(getDoc(doc(alice, 'config', 'app'))));
await check('a player cannot write the app config', assertFails(updateDoc(doc(alice, 'config', 'app'), { archivistEnabled: false })));
await check('an admin writes the app config', assertSucceeds(setDoc(doc(admin, 'config', 'app'), { archivistEnabled: false }, { merge: true })));
await check('a signed-out visitor cannot read the app config', assertFails(getDoc(doc(anon, 'config', 'app'))));
await check('a player cannot read the stats', assertFails(getDoc(doc(alice, 'stats', '2026-09'))));
await check('an admin reads the stats', assertSucceeds(getDoc(doc(admin, 'stats', '2026-09'))));
await check('nobody writes the stats from a browser', assertFails(setDoc(doc(admin, 'stats', '2026-09'), { calls: 0 })));
await check('nobody writes the log from a browser', assertFails(setDoc(doc(admin, 'archivistLog', 'x'), { uid: 'x' })));
await check('a player cannot read the log', assertFails(getDoc(doc(alice, 'archivistLog', 'x'))));
await check('nobody writes the Stripe ledger from a browser', assertFails(setDoc(doc(admin, 'stripeEvents', 'evt_1'), { type: 'x' })));
await check('a player cannot read the Stripe ledger', assertFails(getDoc(doc(alice, 'stripeEvents', 'evt_1'))));
await check('a player cannot link a Stripe customer to themselves', assertFails(updateDoc(doc(alice, 'users', ALICE), { stripeCustomerId: 'cus_1' })));

console.log('cards and decks');
await check('a player reads a card', assertSucceeds(getDoc(doc(alice, 'cards', 'c1'))));
await check('a signed-out visitor cannot read cards', assertFails(getDoc(doc(anon, 'cards', 'c1'))));
await check('a player cannot write cards', assertFails(setDoc(doc(alice, 'cards', 'c2'), { name: 'x' })));
await check('a player writes their own deck', assertSucceeds(setDoc(doc(alice, 'users', ALICE, 'decks', 'd1'), { name: 'Deck' })));
await check("a player cannot read another's deck", assertFails(getDoc(doc(alice, 'users', BOB, 'decks', 'd1'))));
await check('a player writes their own match record', assertSucceeds(setDoc(doc(alice, 'users', ALICE, 'matches', 'm1'), { result: 'won', turns: 12 })));
await check("a player cannot read another's match history", assertFails(getDoc(doc(alice, 'users', BOB, 'matches', 'm1'))));
await check("a player cannot write another's match history", assertFails(setDoc(doc(alice, 'users', BOB, 'matches', 'm2'), { result: 'lost' })));
await check('an unknown collection is closed', assertFails(setDoc(doc(alice, 'anything', 'x'), { a: 1 })));

await env.cleanup();
console.log(failures === 0 ? '\nAll rules tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
