/**
 * The match record: result, places, what each seat did, how each fell, and the win
 * condition, built from the final state, the described log and the server's outcome.
 *
 *   npm run test:match-history
 */
import { buildMatchRecord, historyTotals, summarizeResult, type MatchMeta } from '../src/lib/matchHistory';
import type { ForgeGameState, GameOverPayload } from '../src/lib/forgeClient';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}

const meta: MatchMeta = {
  deckId: 'd1', deckName: 'Atraxa Superfriends', commander: "Atraxa, Praetors' Voice",
  opponents: [
    { name: 'Krenko AI', deckName: 'Goblin Swarm', commander: 'Krenko, Mob Boss', source: 'house' },
    { name: 'Control AI', deckName: 'Azorius Control', commander: 'Grand Arbiter Augustin IV', source: 'house' },
  ],
};
const player = (name: string, isAI: boolean, life: number, extra: Partial<ForgeGameState['players'][number]> = {}) => ({
  id: 0, name, life, poison: 0, isAI, isActivePlayer: false, hasPriority: false,
  manaPool: { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 }, commanderDamage: {},
  hand: [], battlefield: [], graveyard: [], exile: [], command: [], librarySize: 60, ...extra,
});
const state = {
  gameId: 1, isGameOver: true,
  turn: { phase: 'MAIN1', activePlayer: 'Player', activePlayerId: 0, turnNumber: 12, priorityPlayer: 'Player' },
  players: [player('Player', false, 23), player('Krenko AI', true, 0, { eliminated: true, lossReason: 'CommanderDamage' }), player('Control AI', true, 0, { eliminated: true, lossReason: 'LifeReachedZero' })],
  stack: [],
} as unknown as ForgeGameState;
const outcome: GameOverPayload = {
  winner: 'Player', winnerIsHuman: true, turns: 12,
  seats: [
    { name: 'Player', isAI: false, life: 23, poison: 0, won: true, eliminated: false },
    { name: 'Krenko AI', isAI: true, life: 0, poison: 0, won: false, eliminated: true, lossReason: 'CommanderDamage' },
    { name: 'Control AI', isAI: true, life: 0, poison: 0, won: false, eliminated: true, lossReason: 'LifeReachedZero' },
  ],
};
const events = [
  { eventType: 'TURN_STARTED', turnNumber: 1, activePlayer: 'Player', turn: 1 },
  { eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Sol Ring', turn: 1 },
  { eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Cultivate', turn: 3 },
  { eventType: 'SPELL_CAST', playerName: 'Player', cardName: 'Atraxa', isAbility: true, turn: 5 },
  { eventType: 'SPELL_CAST', playerName: 'Krenko AI', cardName: 'Krenko, Mob Boss', turn: 4 },
  { eventType: 'DAMAGE_DEALT', targetName: 'Control AI', sourceName: 'Goblin', sourceController: 'Krenko AI', amount: 6, combat: true, turn: 8 },
  { eventType: 'LIFE_CHANGED', playerName: 'Control AI', delta: -6, newLife: 0, turn: 8 },
  { eventType: 'PLAYER_LOST', playerName: 'Control AI', reason: 'LifeReachedZero', turn: 8 },
  { eventType: 'DAMAGE_DEALT', targetName: 'Krenko AI', sourceName: "Atraxa, Praetors' Voice", sourceController: 'Player', amount: 21, combat: true, turn: 12 },
  { eventType: 'LIFE_CHANGED', playerName: 'Krenko AI', delta: -21, newLife: 0, turn: 12 },
  { eventType: 'LIFE_CHANGED', playerName: 'Player', delta: -4, newLife: 23, turn: 6 },
  { eventType: 'PLAYER_LOST', playerName: 'Krenko AI', reason: 'CommanderDamage', turn: 12 },
  { eventType: 'GAME_OVER', winner: 'Player', turn: 12 },
];

console.log('a won game');
const won = buildMatchRecord({ id: 'm1', startedAt: 1000, endedAt: 9000, meta, youName: 'Player', state, events, outcome, abandoned: false });
check('result is a win', won.result === 'won' && won.winner === 'Player');
check('turns from the outcome', won.turns === 12);
check('the win condition is how the last seat fell', won.winCondition === '21 commander damage', won.winCondition);
check('your deck and commander are recorded', won.you.deckName === 'Atraxa Superfriends' && won.you.commander === "Atraxa, Praetors' Voice" && won.you.deckId === 'd1');
const you = won.seats.find((s) => s.isYou)!;
check('spells cast counts spells, not abilities', you.spellsCast === 2, you.spellsCast);
check('damage dealt is tallied by controller', you.damageDealt === 21 && won.seats.find((s) => s.name === 'Krenko AI')!.damageDealt === 6);
check('life lost is tallied', you.lifeLost === 4);
check('elimination turns come from the log', won.seats.find((s) => s.name === 'Control AI')!.eliminatedTurn === 8);
check('places: winner first, then the last to fall', won.seats.map((s) => `${s.name}:${s.place}`).join(',') === 'Player:1,Krenko AI:2,Control AI:3', won.seats.map((s) => [s.name, s.place]));
check("opponents' decks come from the setup", won.seats.find((s) => s.name === 'Control AI')!.commander === 'Grand Arbiter Augustin IV');
check('every optional field is null, never undefined', JSON.stringify(won).indexOf('undefined') === -1 && won.seats.every((s) => Object.values(s).every((v) => v !== undefined)));
check('the summary reads', summarizeResult(won) === 'Won on turn 12 — 21 commander damage', summarizeResult(won));

console.log('a lost game');
const lostOutcome: GameOverPayload = { winner: 'Krenko AI', winnerIsHuman: false, turns: 9, seats: [
  { name: 'Player', isAI: false, life: 0, poison: 0, won: false, eliminated: true, lossReason: 'Poisoned' },
  { name: 'Krenko AI', isAI: true, life: 30, poison: 0, won: true, eliminated: false },
] };
const lost = buildMatchRecord({ id: 'm2', startedAt: 0, endedAt: 1, meta, youName: 'Player', state: null, events: [{ eventType: 'PLAYER_LOST', playerName: 'Player', reason: 'Poisoned', turn: 9 }], outcome: lostOutcome, abandoned: false });
check('result is a loss with the winner named', lost.result === 'lost' && lost.winner === 'Krenko AI');
check('the summary says how you fell', summarizeResult(lost) === 'Lost on turn 9 — ten poison counters', summarizeResult(lost));
check('seats come from the outcome when there is no state', lost.seats.length === 2);

console.log('leaving early');
const left = buildMatchRecord({ id: 'm3', startedAt: 0, endedAt: 1, meta, youName: 'Player', state: { ...state, isGameOver: false, turn: { ...state.turn, turnNumber: 4 } } as ForgeGameState, events: [], outcome: null, abandoned: true });
check('an abandoned game has no winner or win condition', left.result === 'abandoned' && left.winner === null && left.winCondition === null);
check('turns come from the state', left.turns === 4);

console.log('an older server');
const bare = buildMatchRecord({ id: 'm4', startedAt: 0, endedAt: 1, meta: null, youName: 'Player', state, events: [], outcome: { winner: 'Player', winnerIsHuman: true }, abandoned: false });
check('a winner-only payload still records a win', bare.result === 'won' && bare.turns === 12);
check('a missing setup leaves the deck unnamed, not broken', bare.you.deckName === 'your deck' && bare.you.commander === null);

console.log('totals');
const t = historyTotals([won, lost, left]);
check('totals ignore abandoned games for the record', t.games === 3 && t.wins === 1 && t.losses === 1 && t.winRate === 0.5);

if (failed > 0) { console.log(`\n${failed} match-history test(s) failed.`); process.exit(1); }
console.log('\nAll match-history tests passed.');
