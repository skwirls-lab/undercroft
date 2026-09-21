/**
 * The game log's one voice: every described event reads as a sentence, hidden information
 * stays hidden, and the "since my last turn" cut lands on the right line.
 *
 *   npm run test:game-log
 */
import { describeEvent, describeLossReason, indexOfYourLastTurn } from '../src/lib/gameLog';

let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failed++; console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : ''); }
}
const text = (e: Record<string, unknown>, you = 'Player') => describeEvent(e, you)?.text ?? null;

console.log('who did what');
check('a cast names caster and targets', text({ eventType: 'SPELL_CAST', playerName: 'Control AI', cardName: 'Lightning Bolt', targets: ['Player'] }) === 'Control AI cast Lightning Bolt → You');
check('an activated ability shows its text', text({ eventType: 'SPELL_CAST', isAbility: true, playerName: 'Krenko AI', cardName: 'Krenko, Mob Boss', description: 'Krenko, Mob Boss - {T}: Create X 1/1 red Goblin creature tokens.' })?.startsWith('Krenko AI activated Krenko, Mob Boss: {T}: Create X') === true);
check('your own actions read as You', text({ eventType: 'CARD_PLAYED', playerName: 'Player', cardName: 'Forest' }) === 'You played Forest');
check('a fizzle says why', text({ eventType: 'SPELL_RESOLVED', cardName: 'Swords to Plowshares', fizzled: true }) === 'Swords to Plowshares fizzled — its targets were gone');

console.log('damage and life');
check('combat damage names the source and its controller', text({ eventType: 'DAMAGE_DEALT', targetName: 'Player', sourceName: 'Craterhoof Behemoth', sourceController: 'Ur-Dragon AI', amount: 11, combat: true }) === 'Craterhoof Behemoth (Ur-Dragon AI) dealt 11 combat damage to you');
check('a life change carries its cause', text({ eventType: 'LIFE_CHANGED', playerName: 'Krenko AI', delta: -11, newLife: 7, cause: 'Craterhoof Behemoth', causeController: 'Player', causeKind: 'combat' }) === 'Krenko AI −11 life → 7 (combat: Craterhoof Behemoth)');
check('a payment is marked as such', text({ eventType: 'LIFE_CHANGED', playerName: 'Player', delta: -2, newLife: 29, causeKind: 'payment' }) === 'You −2 life → 29 (paid)');
check('life gain is positive', text({ eventType: 'LIFE_CHANGED', playerName: 'Player', delta: 4, newLife: 35, cause: 'Swords to Plowshares', causeController: 'Control AI', causeKind: 'effect' }) === 'You +4 life → 35 (Swords to Plowshares, Control AI)');
check('poison names its source', text({ eventType: 'POISON_CHANGED', playerName: 'Player', amount: 2, newPoison: 4, cause: 'Blightsteel Colossus', causeController: 'Krenko AI' }) === 'You +2 poison → 4 (Blightsteel Colossus, Krenko AI)');
check('a loss says how', text({ eventType: 'PLAYER_LOST', playerName: 'Krenko AI', reason: 'CommanderDamage' }) === 'Krenko AI is out — 21 commander damage');
check('a loss to a spell names it', describeLossReason('SpellEffect', 'Door to Nothingness') === 'Door to Nothingness');
check('your own loss reads as you', text({ eventType: 'PLAYER_LOST', playerName: 'Player', reason: 'Poisoned' }) === 'You are out — ten poison counters');

console.log('hidden information');
check("an opponent's draw has no card name", text({ eventType: 'CARD_DRAWN', playerName: 'Krenko AI', cardName: '', hidden: true }) === 'Krenko AI drew a card');
check('your draw names the card', text({ eventType: 'CARD_DRAWN', playerName: 'Player', cardName: 'Counterspell', isOwn: true }) === 'You drew Counterspell');
check('a hidden tuck stays hidden', text({ eventType: 'CARD_RETURNED_TO_LIBRARY', playerName: 'Krenko AI', cardName: '', hidden: true }) === 'Krenko AI put a card into their library');
check('an exile from a hidden zone says only where from', text({ eventType: 'CARD_EXILED', playerName: 'Krenko AI', cardName: '', hidden: true, from: 'Library' }) === "A card from Krenko AI's library was exiled");
check('a public exile names the card and cause', text({ eventType: 'CARD_EXILED', playerName: 'Krenko AI', cardName: 'Krenko, Mob Boss', from: 'Battlefield', cause: 'Swords to Plowshares' }) === 'Krenko, Mob Boss was exiled (Swords to Plowshares)');

console.log('board changes');
check('a token is a creation', text({ eventType: 'TOKEN_CREATED', playerName: 'Krenko AI', cardName: 'Goblin' }) === 'Krenko AI created a Goblin');
check('a sacrifice names its cause', text({ eventType: 'CARD_SACRIFICED', playerName: 'Player', cardName: 'Sakura-Tribe Elder' }) === 'You sacrificed Sakura-Tribe Elder');
check('an attachment says where it went', text({ eventType: 'CARD_ATTACHED', cardName: 'Swiftfoot Boots', targetName: 'Vivi Ornitier', playerName: 'Player' }) === 'Swiftfoot Boots attached to Vivi Ornitier (You)');
check('a return to hand says whose', text({ eventType: 'CARD_RETURNED_TO_HAND', cardName: 'Serra Angel', playerName: 'Player', from: 'Battlefield', cause: 'Cyclonic Rift' }) === 'Serra Angel returned to your hand (Cyclonic Rift)');
check('mana taps are detail lines', describeEvent({ eventType: 'MANA_TAPPED', playerName: 'Player', cardName: 'Forest', ability: '{T}: Add {G}.' }, 'Player')?.detail === true);
check('phases are detail lines', describeEvent({ eventType: 'PHASE_CHANGED', phase: 'MAIN1' }, 'Player')?.detail === true);
check('an unknown type is still visible', text({ eventType: 'SOMETHING_NEW' }) === 'something new');

console.log('turn cut');
const evs = [
  { eventType: 'TURN_STARTED', turnNumber: 5, activePlayer: 'Player' },
  { eventType: 'CARD_PLAYED', playerName: 'Player', cardName: 'Forest' },
  { eventType: 'TURN_STARTED', turnNumber: 6, activePlayer: 'Krenko AI' },
  { eventType: 'TURN_STARTED', turnNumber: 7, activePlayer: 'Player' },
  { eventType: 'TURN_STARTED', turnNumber: 8, activePlayer: 'Control AI' },
  { eventType: 'DAMAGE_DEALT', targetName: 'Player', amount: 3 },
];
check('the cut is your most recent turn start', indexOfYourLastTurn(evs, 'Player') === 3);
check('no turn of yours means the whole log', indexOfYourLastTurn(evs.slice(4), 'Player') === 0);

if (failed > 0) { console.log(`\n${failed} game-log test(s) failed.`); process.exit(1); }
console.log('\nAll game-log tests passed.');
