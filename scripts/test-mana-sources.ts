/**
 * The mana payment prompt's pips: what each source makes, from the server's `produces` or
 * from the rules text.
 *
 *   npm run test:mana-sources
 */

import assert from 'node:assert/strict';
import { ANY_MANA, describeManaSymbols, manaSourceSymbols, manaSymbolsFromOracle } from '../src/lib/manaSources';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; } catch (err) { console.error(`✗ ${name}`); throw err; }
}

test('reads symbols out of "Add" clauses', () => {
  assert.deepEqual(manaSymbolsFromOracle('({T}: Add {U}.)'), ['U']);
  assert.deepEqual(manaSymbolsFromOracle('{T}: Add {C}{C}.'), ['C', 'C']);
  assert.deepEqual(manaSymbolsFromOracle('({T}: Add {G} or {U}.)'), ['G', 'U']);
  assert.deepEqual(manaSymbolsFromOracle('{T}: Add {W}.\n{T}: Add {B}.'), ['W', 'B']);
});

test('reads "any colour" in words, with a count', () => {
  assert.deepEqual(manaSymbolsFromOracle("{T}: Add one mana of any color in your commander's color identity."), [ANY_MANA]);
  assert.deepEqual(manaSymbolsFromOracle('{T}: Add one mana of any color.'), [ANY_MANA]);
  assert.deepEqual(manaSymbolsFromOracle('{T}, Sacrifice this artifact: Add one mana of any color.'), [ANY_MANA]);
  assert.deepEqual(manaSymbolsFromOracle('{T}: Add two mana in any combination of colors.'), [ANY_MANA, ANY_MANA]);
  assert.deepEqual(manaSymbolsFromOracle('{T}: Add one mana of any type that a land you control could produce.'), [ANY_MANA]);
});

test('ignores text that is not a mana ability', () => {
  assert.deepEqual(manaSymbolsFromOracle('Flying\nWhenever you add mana, draw a card.'), []);
  assert.deepEqual(manaSymbolsFromOracle(undefined), []);
});

test('prefers the server\'s produces and repeats a single symbol by amount', () => {
  assert.deepEqual(manaSourceSymbols({ produces: ['C'], amount: 2 }), ['C', 'C']);
  assert.deepEqual(manaSourceSymbols({ produces: ['W', 'U'], amount: 1 }), ['W', 'U']);
  assert.deepEqual(manaSourceSymbols({ produces: ['Any'] }), [ANY_MANA]);
  // Two colours with amount 2 (a bounce land makes one of each): no repetition.
  assert.deepEqual(manaSourceSymbols({ produces: ['G', 'U'], amount: 2 }), ['G', 'U']);
});

test('falls back to the rules text, then to colourless', () => {
  assert.deepEqual(manaSourceSymbols({ oracleText: '{T}: Add {R}.' }), ['R']);
  assert.deepEqual(manaSourceSymbols({}, '({T}: Add {B}.)'), ['B']);
  assert.deepEqual(manaSourceSymbols({ name: 'Mystery' } as never), ['C']);
});

test('describes pips in words', () => {
  assert.equal(describeManaSymbols(['U']), 'blue');
  assert.equal(describeManaSymbols(['C', 'C']), 'two colourless');
  assert.equal(describeManaSymbols(['G', 'U']), 'green or blue');
  assert.equal(describeManaSymbols([ANY_MANA]), 'any colour');
});

console.log(`mana-sources: ${passed} tests passed`);
