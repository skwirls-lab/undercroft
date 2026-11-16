/**
 * The "Other" row's order: equipment, mana rocks, other artifacts, enchantments, battles, the
 * rest; alphabetical within a group.
 *
 *   npm run test:board-order
 */

import assert from 'node:assert/strict';
import { otherGroup, sortOtherPermanents } from '../src/lib/boardOrder';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; } catch (err) { console.error(`✗ ${name}`); throw err; }
}

const card = (name: string, typeLine: string, oracleText = '') => ({ cardData: { name, typeLine, oracleText } });

test('classifies each kind of permanent', () => {
  assert.equal(otherGroup(card('Sword of Fire and Ice', 'Artifact — Equipment', 'Equip {2}')), 'equipment');
  assert.equal(otherGroup(card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.')), 'mana');
  assert.equal(otherGroup(card('Arcane Signet', 'Artifact', "{T}: Add one mana of any color in your commander's color identity.")), 'mana');
  assert.equal(otherGroup(card('Treasure', 'Artifact — Treasure', '{T}, Sacrifice this artifact: Add one mana of any color.')), 'mana');
  assert.equal(otherGroup(card('Skullclamp', 'Artifact — Equipment')), 'equipment');
  assert.equal(otherGroup(card('Lightning Greaves', 'Artifact — Equipment', 'Equipped creature has haste and shroud.\nEquip {0}')), 'equipment');
  assert.equal(otherGroup(card('Swiftfoot Boots', 'Artifact — Equipment')), 'equipment');
  assert.equal(otherGroup(card('Sensei\'s Divining Top', 'Artifact', '{1}: Look at the top three cards of your library.')), 'artifact');
  assert.equal(otherGroup(card('Rhystic Study', 'Enchantment', 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.')), 'enchantment');
  assert.equal(otherGroup(card('Invasion of Gobakhan', 'Battle — Siege')), 'battle');
  assert.equal(otherGroup(card('Something Odd', 'Kindred Instant')), 'other');
});

test('an artifact enchantment counts as an artifact, and an artifact that names mana in prose is not a rock', () => {
  assert.equal(otherGroup(card('Blood Moon-ish', 'Artifact Enchantment')), 'artifact');
  assert.equal(otherGroup(card('Mana Vault-ish text', 'Artifact', 'Whenever you add mana, draw a card.')), 'artifact');
});

test('sorts by group then name and keeps the row stable otherwise', () => {
  const row = [
    card('Rhystic Study', 'Enchantment'),
    card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.'),
    card('Sword of Fire and Ice', 'Artifact — Equipment'),
    card('Doubling Season', 'Enchantment'),
    card('Arcane Signet', 'Artifact', '{T}: Add one mana of any color.'),
    card('Crucible of Worlds', 'Artifact'),
    card('Lightning Greaves', 'Artifact — Equipment'),
  ];
  const sorted = sortOtherPermanents(row).map((c) => c.cardData.name);
  assert.deepEqual(sorted, [
    'Lightning Greaves', 'Sword of Fire and Ice',
    'Arcane Signet', 'Sol Ring',
    'Crucible of Worlds',
    'Doubling Season', 'Rhystic Study',
  ]);
  // The input is not mutated and the objects are the same ones.
  assert.equal(row[0].cardData.name, 'Rhystic Study');
  assert.ok(sortOtherPermanents(row).includes(row[1]));
});

test('identical names keep their original order', () => {
  const a = card('Treasure', 'Artifact — Treasure', '{T}, Sacrifice this artifact: Add one mana of any color.');
  const b = card('Treasure', 'Artifact — Treasure', '{T}, Sacrifice this artifact: Add one mana of any color.');
  const out = sortOtherPermanents([b, a]);
  assert.equal(out[0], b);
  assert.equal(out[1], a);
});

console.log(`board-order: ${passed} tests passed`);
