/**
 * Tests for the pure parts of scripts/sync-cards.mjs.
 *
 * The network and Firestore halves cannot be exercised without credentials and an outbound
 * connection to Scryfall, so this covers what can be checked: the filter that decides which
 * cards get stored, the slimming that decides what is stored, and the digest that decides
 * whether a card is rewritten at all. A digest that is not stable would turn every scheduled
 * run into a full ~90k-document rewrite.
 */

import assert from 'node:assert/strict';
import { slimCard, digest, isCommanderPlayable } from './sync-cards.mjs';

let passed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
};

const base = {
  id: 'abc',
  oracle_id: 'o1',
  name: 'Sol Ring',
  lang: 'en',
  layout: 'normal',
  legalities: { commander: 'legal', modern: 'not_legal' },
  cmc: 1,
  type_line: 'Artifact',
};

test('keeps an English commander-legal card', () => {
  assert.equal(isCommanderPlayable(base), true);
});

test('rejects tokens, art series and non-English printings', () => {
  assert.equal(isCommanderPlayable({ ...base, layout: 'token' }), false);
  assert.equal(isCommanderPlayable({ ...base, layout: 'art_series' }), false);
  assert.equal(isCommanderPlayable({ ...base, layout: 'double_faced_token' }), false);
  assert.equal(isCommanderPlayable({ ...base, lang: 'ja' }), false);
});

test('rejects a card not legal in commander', () => {
  assert.equal(isCommanderPlayable({ ...base, legalities: { commander: 'banned' } }), false);
  assert.equal(isCommanderPlayable({ ...base, legalities: {} }), false);
});

test('slims to the stored shape and drops absent optional fields', () => {
  const slim = slimCard(base);
  assert.equal(slim.name, 'Sol Ring');
  assert.equal(slim.mana_cost, '');
  assert.ok(!('power' in slim), 'power should be absent, not undefined');
  assert.ok(!('image_uris' in slim), 'image_uris should be absent when Scryfall omits it');
});

test('carries creature stats and image urls through', () => {
  const slim = slimCard({
    ...base,
    power: '2',
    toughness: '3',
    image_uris: { normal: 'https://example/n.jpg' },
  });
  assert.equal(slim.power, '2');
  assert.equal(slim.toughness, '3');
  assert.equal(slim.image_uris.normal, 'https://example/n.jpg');
  assert.equal(slim.image_uris.art_crop, '', 'missing sizes fill with empty string');
});

test('flattens card faces for double-faced cards', () => {
  const slim = slimCard({
    ...base,
    layout: 'transform',
    card_faces: [
      { name: 'Front', type_line: 'Creature', power: '1', toughness: '1' },
      { name: 'Back', type_line: 'Land' },
    ],
  });
  assert.equal(slim.card_faces.length, 2);
  assert.equal(slim.card_faces[0].power, '1');
  assert.ok(!('power' in slim.card_faces[1]));
});

test('digest is stable across runs — otherwise every sync rewrites every card', () => {
  assert.equal(digest(slimCard(base)), digest(slimCard({ ...base })));
});

test('digest changes when the stored content changes', () => {
  assert.notEqual(digest(slimCard(base)), digest(slimCard({ ...base, oracle_text: 'Add {C}{C}.' })));
});

test('digest ignores fields that are not stored', () => {
  assert.equal(digest(slimCard(base)), digest(slimCard({ ...base, released_at: '2026-01-01' })));
});

console.log(`\n${passed} passed${process.exitCode ? ', failures above' : ', 0 failed'}`);
