/**
 * Planeswalker helpers: reading loyalty abilities off oracle text, matching them to the
 * server's legal plays, and explaining the ones that cannot be used.
 *
 *   npm run test:loyalty
 */

import assert from 'node:assert/strict';
import {
  parseLoyaltyAbilities, currentLoyalty, splitLoyaltyDescription, matchLoyaltyAction,
  loyaltyUnavailableReason, activatedLoyaltyThisTurn, cardActionLabel, isPlaneswalker,
} from '../src/lib/loyalty';
import type { CardInstance, GameAction } from '../src/lib/gameTypes';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; } catch (err) { console.error(`✗ ${name}`); throw err; }
}

const JACE_ORACLE =
  "[+2]: Look at the top card of target player's library. You may put that card on the bottom of that player's library.\n" +
  '[0]: Draw three cards, then put two cards from your hand on top of your library in any order.\n' +
  "[-1]: Return target creature to its owner's hand.\n" +
  '[-12]: Exile all cards from target player\'s library, then that player shuffles their hand into their library.';

function pw(loyaltyCounters: number | undefined, printed = '3'): CardInstance {
  return {
    instanceId: 'forge-14',
    cardData: {
      scryfallId: '', oracleId: '', name: 'Jace, the Mind Sculptor', manaCost: '{2}{U}{U}', cmc: 4,
      typeLine: 'Legendary Planeswalker — Jace', oracleText: JACE_ORACLE, colors: ['U'], colorIdentity: ['U'],
      keywords: [], loyalty: printed, layout: 'normal', legalities: {},
    },
    ownerId: 'player-human', controllerId: 'player-human', zone: 'battlefield', tapped: false, flipped: false, faceDown: false,
    counters: loyaltyCounters == null ? {} : { loyalty: loyaltyCounters },
    attachments: [], attachmentNames: [], damage: 0, summoningSick: false, abilities: [],
  };
}

function action(description: string, index: number): GameAction {
  return { type: 'ACTIVATE_ABILITY', playerId: 'player-human', payload: { cardInstanceId: 'forge-14', forgeAbilityIndex: index, forgeDescription: description, ability: 'forge_activated' }, timestamp: 0 };
}

// What the server actually sent for Jace with 3 loyalty on the probe run (−12 withheld).
const SERVER_PLAYS = [
  action("+2: Look at the top card of target player's library. You may put that card on the bottom of that player's library.", 1),
  action('0: Draw three cards, then put two cards from your hand on top of your library in any order. ', 2),
  action("-1: Return target creature to its owner's hand.", 3),
];

test('parses bracketed oracle lines with signs, zero and the ultimate', () => {
  const abilities = parseLoyaltyAbilities(JACE_ORACLE);
  assert.equal(abilities.length, 4);
  assert.deepEqual(abilities.map((a) => a.cost), [2, 0, -1, -12]);
  assert.deepEqual(abilities.map((a) => a.label), ['+2', '0', '−1', '−12']);
  assert.ok(abilities[2].text.startsWith('Return target creature'));
});

test('also reads unbracketed and unicode-minus forms, and X costs', () => {
  const abilities = parseLoyaltyAbilities('+1: Draw a card.\n−3: Destroy target creature.\n−X: Deal X damage to any target.\nFlying');
  assert.deepEqual(abilities.map((a) => a.label), ['+1', '−3', '−X']);
  assert.equal(abilities[2].cost, null);
});

test('ignores text that is not a loyalty ability', () => {
  assert.deepEqual(parseLoyaltyAbilities('Flying\nWhenever you cast a spell, draw a card.\n{T}: Add {G}.'), []);
  assert.deepEqual(parseLoyaltyAbilities(undefined), []);
});

test('current loyalty prefers counters over the printed value', () => {
  assert.equal(currentLoyalty(pw(5)), 5);
  assert.equal(currentLoyalty(pw(undefined)), 3);
  assert.equal(currentLoyalty(pw(undefined, '')), null);
});

test('splits a server description into cost and text', () => {
  assert.deepEqual(splitLoyaltyDescription("-1: Return target creature to its owner's hand."), { label: '−1', cost: -1, text: "Return target creature to its owner's hand." });
  assert.equal(splitLoyaltyDescription('Jace, the Mind Sculptor'), null);
  assert.equal(splitLoyaltyDescription('Equip {2}'), null);
});

test('matches each oracle ability to its legal play and leaves the ultimate unmatched', () => {
  const abilities = parseLoyaltyAbilities(JACE_ORACLE);
  assert.equal(matchLoyaltyAction(abilities[0], SERVER_PLAYS)?.payload.forgeAbilityIndex, 1);
  assert.equal(matchLoyaltyAction(abilities[1], SERVER_PLAYS)?.payload.forgeAbilityIndex, 2);
  assert.equal(matchLoyaltyAction(abilities[2], SERVER_PLAYS)?.payload.forgeAbilityIndex, 3);
  assert.equal(matchLoyaltyAction(abilities[3], SERVER_PLAYS), undefined);
});

test('explains an unavailable ability in order of likeliest cause', () => {
  const abilities = parseLoyaltyAbilities(JACE_ORACLE);
  const ultimate = abilities[3];
  const ok = { hasPriority: true, isMyTurn: true, isMainPhase: true, stackEmpty: true, activatedThisTurn: false };
  assert.equal(loyaltyUnavailableReason(ultimate, pw(3), ok), 'Needs 12 loyalty (has 3)');
  assert.equal(loyaltyUnavailableReason(abilities[0], pw(3), { ...ok, activatedThisTurn: true }), 'Already used a loyalty ability this turn');
  assert.equal(loyaltyUnavailableReason(abilities[0], pw(3), { ...ok, isMyTurn: false }), 'Only on your turn');
  assert.equal(loyaltyUnavailableReason(abilities[0], pw(3), { ...ok, isMainPhase: false }), 'Only in a main phase');
  assert.equal(loyaltyUnavailableReason(abilities[0], pw(3), { ...ok, stackEmpty: false }), 'Wait for the stack to empty');
  assert.equal(loyaltyUnavailableReason(abilities[2], pw(3), ok), 'Nothing it can target right now');
});

test('finds this turn\'s activation in the described log and stops at the previous turn', () => {
  const events = [
    { eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Jace, the Mind Sculptor', description: "Jace, the Mind Sculptor - +2: Look at the top card of target player's library.", isAbility: true, turn: 8 },
    { eventType: 'TURN_STARTED', turn: 9 },
    { eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Counterspell', turn: 9 },
  ];
  assert.equal(activatedLoyaltyThisTurn(events, 'Jace, the Mind Sculptor', 9), false);
  assert.equal(activatedLoyaltyThisTurn(events, 'Jace, the Mind Sculptor', 8), true);
  // An activated non-loyalty ability (Gideon's "0" is loyalty; an equip is not) does not count.
  const equip = [{ eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Jace, the Mind Sculptor', description: 'Equip {2}', isAbility: true, turn: 9 }];
  assert.equal(activatedLoyaltyThisTurn(equip, 'Jace, the Mind Sculptor', 9), false);
  // Another player's planeswalker of the same name is not yours.
  const theirs = [{ eventType: 'SPELL_CAST', playerName: 'Krenko AI', cardName: 'Jace, the Mind Sculptor', description: '+2: Look', isAbility: true, turn: 9 }];
  assert.equal(activatedLoyaltyThisTurn(theirs, 'Jace, the Mind Sculptor', 9, 'Player'), false);
});

test('labels the card action button', () => {
  const card = pw(3);
  assert.ok(isPlaneswalker(card));
  assert.equal(cardActionLabel(card, SERVER_PLAYS), 'Loyalty');
  const sword = { cardData: { ...card.cardData, typeLine: 'Artifact — Equipment' } };
  assert.equal(cardActionLabel(sword, [action('Equip {2}', 0)]), 'Activate');
  assert.equal(cardActionLabel(sword, [{ ...action('Equip', 0), payload: { ability: 'equip' } }]), 'Equip');
  assert.equal(cardActionLabel(sword, [action('a', 0), action('b', 1)]), '2 abilities');
  assert.equal(cardActionLabel(sword, [{ type: 'CAST_SPELL', playerId: 'player-human', payload: { fromZone: 'command' }, timestamp: 0 }]), 'Cast');
  assert.equal(cardActionLabel(sword, []), '');
});

console.log(`loyalty: ${passed} tests passed`);
