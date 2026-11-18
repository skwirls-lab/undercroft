/**
 * Game-server errors the player is told about: parsing the server's payload and choosing what
 * to show and offer.
 *
 *   npm run test:server-errors
 */

import assert from 'node:assert/strict';
import { describeServerError, parseServerError } from '../src/lib/serverErrors';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; } catch (err) { console.error(`✗ ${name}`); throw err; }
}

test('parses the coded errors the server sends', () => {
  const full = parseServerError({ code: 'server_full', message: 'Every table on the game server is taken right now. Try again in a few minutes.', activeGames: 8, maxGames: 8 });
  assert.deepEqual(full, { code: 'server_full', message: 'Every table on the game server is taken right now. Try again in a few minutes.', activeGames: 8, maxGames: 8 });
  assert.equal(parseServerError({ code: 'game_crashed', message: 'The game server ran out of memory and had to end this game.' })?.code, 'game_crashed');
  assert.equal(parseServerError({ code: 'auth_required', message: 'Sign in' })?.code, 'auth_required');
});

test('errors without a known code are not shown (an older server, or a non-fatal one)', () => {
  assert.equal(parseServerError({ message: 'Server error: something' }), null);
  assert.equal(parseServerError({ code: 'something_new', message: 'x' }), null);
  assert.equal(parseServerError(null), null);
  assert.equal(parseServerError('boom'), null);
});

test('a full server offers a retry and says nothing was started', () => {
  const view = describeServerError({ code: 'server_full', message: '', maxGames: 8 });
  assert.equal(view.action, 'retry');
  assert.match(view.body, /All 8 tables are in use/);
  assert.match(view.body, /Nothing was started/);
  assert.match(describeServerError({ code: 'server_full', message: '', maxGames: 1 }).body, /Its one table is in use/);
  assert.doesNotMatch(describeServerError({ code: 'server_full', message: '' }).body, /tables? (is|are) in use/);
});

test('a missing sign-in offers a refresh, not a retry that would fail the same way', () => {
  const view = describeServerError({ code: 'auth_required', message: '' });
  assert.equal(view.action, 'refresh');
  assert.equal(view.actionLabel, 'Refresh the page');
});

test('a crashed game says it was not the player and offers the same matchup again', () => {
  const view = describeServerError({ code: 'game_crashed', message: 'The game server ran out of memory and had to end this game.' });
  assert.equal(view.title, 'This game has stopped');
  assert.match(view.body, /ran out of memory/);
  assert.match(view.note ?? '', /Nothing you did caused this/);
  assert.equal(view.action, 'retry');
});

test('a failed start shows the server\'s reason and only offers the way back', () => {
  const view = describeServerError({ code: 'start_failed', message: 'The game could not be started: no commander' });
  assert.match(view.body, /no commander/);
  assert.equal(view.action, 'none');
  assert.equal(view.actionLabel, null);
});

test('sign-in service unreachable is a retry', () => {
  assert.equal(describeServerError({ code: 'auth_unavailable', message: '' }).action, 'retry');
});

console.log(`server-errors: ${passed} tests passed`);
