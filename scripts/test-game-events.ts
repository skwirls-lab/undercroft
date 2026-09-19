/**
 * Tests for the game-log synthesiser (src/lib/gameEventSynth.ts).
 *
 * The bug these guard against: a burst of "drew a card" lines before turn 1, produced by
 * diffing the pre-deal snapshot against the post-deal one.
 */

import assert from 'node:assert/strict';
import { synthesizeGameEvents } from '../src/lib/gameEventSynth';
import type { ForgeGameState, ForgePlayer, ForgeCard } from '../src/lib/forgeClient';

let passed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${(err as Error).message}`);
    process.exitCode = 1;
  }
};

const mana = { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 };
let nextId = 1;
const card = (name: string): ForgeCard => ({ id: nextId++, name, typeLine: 'Instant', manaCost: '{U}' });

function player(id: number, name: string, isAI: boolean, hand: ForgeCard[] = []): ForgePlayer {
  return {
    id, name, isAI, life: 40, poison: 0, isActivePlayer: false, hasPriority: false,
    manaPool: mana, commanderDamage: {}, hand, battlefield: [], graveyard: [], exile: [], command: [],
    librarySize: 99 - hand.length,
  };
}

function state(turnNumber: number, players: ForgePlayer[], phase = 'MAIN1'): ForgeGameState {
  return {
    gameId: 1, isGameOver: false,
    turn: { phase, activePlayer: players[0].name, activePlayerId: players[0].id, turnNumber, priorityPlayer: players[0].name },
    players, stack: [],
  };
}

const sevenCards = () => Array.from({ length: 7 }, (_, i) => card(`Card ${i}`));
const types = (evs: ReturnType<typeof synthesizeGameEvents>) => evs.map((e) => e.eventType);

test('first snapshot produces only GAME_STARTED', () => {
  const s = state(0, [player(1, 'You', false), player(2, 'AI', true)]);
  assert.deepEqual(types(synthesizeGameEvents(null, s)), ['GAME_STARTED']);
});

test('dealing opening hands during setup produces no draw events', () => {
  const before = state(0, [player(1, 'You', false), player(2, 'AI', true), player(3, 'AI 2', true), player(4, 'AI 3', true)]);
  const after = state(0, [
    player(1, 'You', false, sevenCards()),
    player(2, 'AI', true, sevenCards()),
    player(3, 'AI 2', true, sevenCards()),
    player(4, 'AI 3', true, sevenCards()),
  ]);
  const evs = synthesizeGameEvents(before, after);
  assert.equal(evs.filter((e) => e.eventType === 'CARD_DRAWN').length, 0, 'expected zero CARD_DRAWN, the old code produced 28');
});

test('a mulligan (new seven-card hand, still turn 0) produces no draw events', () => {
  const before = state(0, [player(1, 'You', false, sevenCards()), player(2, 'AI', true, sevenCards())]);
  const after = state(0, [player(1, 'You', false, sevenCards()), player(2, 'AI', true, before.players[1].hand)]);
  assert.equal(types(synthesizeGameEvents(before, after)).length, 0);
});

test('crossing into turn 1 emits OPENING_HANDS + TURN_STARTED and nothing per-card', () => {
  const before = state(0, [player(1, 'You', false, sevenCards()), player(2, 'AI', true, sevenCards())]);
  const after = state(1, [player(1, 'You', false, [...before.players[0].hand, card('Drawn')]), player(2, 'AI', true, before.players[1].hand)], 'UPKEEP');
  assert.deepEqual(types(synthesizeGameEvents(before, after)), ['OPENING_HANDS', 'TURN_STARTED']);
});

test('a normal draw on turn 2 is still logged', () => {
  const hand = sevenCards();
  const before = state(1, [player(1, 'You', false, hand), player(2, 'AI', true, sevenCards())], 'END_OF_TURN');
  const after = state(2, [player(1, 'You', false, [...hand, card('Brainstorm')]), player(2, 'AI', true, before.players[1].hand)], 'DRAW');
  const evs = synthesizeGameEvents(before, after);
  assert.deepEqual(types(evs), ['TURN_STARTED', 'CARD_DRAWN']);
  assert.equal(evs[1].cardName, 'Brainstorm');
  assert.equal(evs[1].isOwn, true);
});

test('casting a spell logs SPELL_CAST once it is on the stack', () => {
  const spell = card('Counterspell');
  const hand = [spell, ...sevenCards()];
  const before = state(3, [player(1, 'You', false, hand), player(2, 'AI', true)]);
  const after = state(3, [player(1, 'You', false, hand.slice(1)), player(2, 'AI', true)]);
  after.stack = [{ description: 'Counter target spell.', cardName: spell.name, cardId: spell.id, controller: 'You' }];
  assert.deepEqual(types(synthesizeGameEvents(before, after)), ['SPELL_CAST']);
});

test('life change during setup is still one line, not suppressed', () => {
  const before = state(0, [player(1, 'You', false), player(2, 'AI', true)]);
  const after = state(0, [{ ...player(1, 'You', false), life: 38 }, player(2, 'AI', true)]);
  const evs = synthesizeGameEvents(before, after);
  assert.deepEqual(types(evs), ['LIFE_CHANGED']);
  assert.equal(evs[0].delta, -2);
});

test('opponent draws hide the card name', () => {
  const hand = sevenCards();
  const before = state(2, [player(1, 'You', false), player(2, 'AI', true, hand)]);
  const after = state(2, [player(1, 'You', false), player(2, 'AI', true, [...hand, card('Secret')])]);
  const evs = synthesizeGameEvents(before, after);
  assert.equal(evs[0].eventType, 'CARD_DRAWN');
  assert.equal(evs[0].cardName, null);
  assert.equal(evs[0].isOwn, false);
});

console.log(`\n${passed} passed${process.exitCode ? ', failures above' : ', 0 failed'}`);
