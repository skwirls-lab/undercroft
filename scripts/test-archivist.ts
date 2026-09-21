/**
 * The Archivist's pure parts: how a deck and a match are serialised, what is left out, how
 * the prompt trims under budget, and how the JSON tasks are parsed and filtered.
 *
 * Run: npm run test:archivist
 */
import { buildMessages, describeDeck, describeMatch, parseSwaps, parseIdeas, fitBudget, isJsonTask, taskFeature, PROMPT_BUDGET_CHARS, SYSTEM_PROMPT } from '../src/lib/archivist/prompts';
import { deckContext, matchContext, recapContext, shortType, describeForgeEvent, RECAP_MAX_EVENTS } from '../src/lib/archivist/context';
import { toBlocks } from '../src/components/archivist/Answer';
import { checkDeck } from '../src/lib/deckRules';
import { adaptForgeState } from '../src/lib/forgeStateAdapter';
import { buildMockGame } from '../src/dev/mockGame';
import { DEV_MOCK_DECKS } from '../src/dev/mockDecks';
import { lookupMockCards } from '../src/dev/mockCards';
import type { GameAction } from '../src/lib/gameTypes';
import type { DeckContext, MatchContext } from '../src/lib/archivist/types';

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

// ─── Deck context ────────────────────────────────────────────────────────────
console.log('deck context');
const atraxa = DEV_MOCK_DECKS.find((d) => d.id === 'mock-atraxa')!;
const records = lookupMockCards(atraxa.cards.map((c) => c.cardName));
const dc: DeckContext = deckContext(atraxa, records, checkDeck(atraxa, records));
check('commander is set with its identity', dc.commander?.name === atraxa.commanderName && dc.commander.identity.join('') === 'WUBG');
check('commander is not in the card list', !dc.cards.some((c) => c.name === atraxa.commanderName));
check('total counts every copy', dc.total === atraxa.cards.reduce((s, c) => s + c.quantity, 0));
check('lands are counted from the type line', dc.lands === 17, `got ${dc.lands}`);
check('curve has 8 buckets', dc.curve.length === 8);
check('deck-check issues are carried', dc.issues.length >= 1 && dc.issues.some((i) => /100/.test(i)));
check('shortType strips supertypes', shortType('Legendary Creature — Phyrexian Angel Horror') === 'Creature' && shortType('Basic Land — Forest') === 'Land' && shortType('Artifact Creature — Golem') === 'Artifact Creature');
const deckText = describeDeck(dc);
check('description names the commander text and the list', deckText.includes('proliferate') && deckText.includes('1 Sol Ring'));
check('every card carries its printed text', dc.cards.filter((c) => c.text).length >= dc.cards.length - 1 && deckText.includes('Add {C}{C}'));

// ─── Match context ───────────────────────────────────────────────────────────
console.log('match context');
const forge = buildMockGame();
const state = adaptForgeState(forge);
const handIds = state.zones.get('player-human:hand')?.cards ?? [];
const legal: GameAction[] = [
  { type: 'CAST_SPELL', playerId: 'player-human', payload: { cardInstanceId: handIds[0] }, timestamp: 0 },
  { type: 'CAST_SPELL', playerId: 'player-human', payload: { cardInstanceId: handIds[1] }, timestamp: 0 },
  { type: 'PASS_PRIORITY', playerId: 'player-human', payload: {}, timestamp: 0 },
  { type: 'CAST_SPELL', playerId: 'ai-2', payload: { cardInstanceId: 'x' }, timestamp: 0 },
];
const mc: MatchContext = matchContext(state, legal, 'player-human');
check('you are the human seat', mc.you.name === state.players.find((p) => p.id === 'player-human')!.name);
check('your hand carries oracle text', mc.you.hand.length === handIds.length && mc.you.hand.every((c) => typeof c.oracle === 'string'));
check('opponents have no hand, only a size', mc.opponents.every((o) => !('hand' in o) && typeof o.handSize === 'number'));
check('legal action types are deduplicated and yours only', mc.legalActions.join(',') === 'CAST_SPELL,PASS_PRIORITY');
check('playable names come from the legal actions', mc.playable.length === 2);
check('stack is top first', mc.stack.length === state.stack.length);
const matchText = describeMatch(mc);
const oppHand = forge.players.find((p) => p.isAI)!.hand[0]?.name;
check('opponent hand card names never appear', !oppHand || !matchText.includes(oppHand), oppHand);
check('your hand card names do appear', mc.you.hand.every((c) => matchText.includes(c.name)));
check('legal actions are in the prompt', matchText.includes('Legal actions right now: CAST_SPELL, PASS_PRIORITY'));

// ─── Recap ───────────────────────────────────────────────────────────────────
console.log('recap');
const events = Array.from({ length: 400 }, (_, i) => ({ eventType: 'SPELL_CAST', cardName: `Card ${i}`, playerName: 'You' }));
const rc = recapContext([{ eventType: 'GAME_STARTED' }, ...events, { eventType: 'GAME_OVER' }], state, 'player-human', 'Krenko AI', { name: 'Atraxa Superfriends', commanderName: "Atraxa, Praetors' Voice" });
check(`recap keeps at most ${RECAP_MAX_EVENTS} lines`, rc.events.length === RECAP_MAX_EVENTS);
check('recap keeps the newest events', rc.events[rc.events.length - 1] === 'Game over');
check('recap knows who won', !rc.youWon && rc.winner === 'Krenko AI');
check('unknown event types are dropped', describeForgeEvent({ eventType: 'CARD_TAPPED' }) === null);
check('life changes read as a sentence', describeForgeEvent({ eventType: 'LIFE_CHANGED', playerName: 'Krenko AI', delta: -4, newLife: 18 }) === 'Krenko AI −4 life → 18');
check('a described life change names its cause', describeForgeEvent({ eventType: 'LIFE_CHANGED', playerName: 'Player', delta: -3, newLife: 28, cause: 'Lightning Bolt', causeController: 'Control AI', causeKind: 'damage' }, 'Player') === 'You −3 life → 28 (Lightning Bolt, Control AI)');

// ─── Prompt assembly ─────────────────────────────────────────────────────────
console.log('prompts');
const msgs = buildMessages({ task: 'deck.improve', deck: dc, goal: 'more-ramp' });
check('system prompt first, ask last', msgs[0].role === 'system' && msgs[0].content === SYSTEM_PROMPT && msgs[msgs.length - 1].role === 'user');
check('goal text is included', msgs[1].content.includes('mana acceleration'));
check('card text is declared data, not instructions', SYSTEM_PROMPT.includes('not instructions'));
check('the Archivist is told to admit an unknown card rather than guess', /do not know it for certain, say so/.test(SYSTEM_PROMPT) && /deck's name is a name, not a card/.test(SYSTEM_PROMPT));
const question = buildMessages({ task: 'rules.question', question: 'hi', deck: dc });
check('a deck question carries the whole deck with card text', question.length === 3 && question[1].content.includes('printed text') && question[1].content.includes('1 Sol Ring') && question[2].content === 'The player asks: hi');
check('a deck question without a deck carries only the ask', buildMessages({ task: 'rules.question', question: 'What is the stack?' }).length === 2);
const advice = buildMessages({ task: 'match.advice', match: mc, question: '' }, [{ role: 'user', content: 'earlier q' }, { role: 'assistant', content: 'earlier a' }]);
check('history sits between context and the ask', advice.length === 5 && advice[2].content === 'earlier q' && advice[3].role === 'assistant');
check('an empty question becomes the default ask', advice[4].content.startsWith('What should I do this turn?'));
check('swaps and ideas are the JSON tasks', isJsonTask('deck.swaps') && isJsonTask('commander.ideas') && !isJsonTask('deck.improve'));
check('features map to the price list', taskFeature('match.advice') === 'archivist.match' && taskFeature('game.recap') === 'archivist.recap' && taskFeature('commander.ideas') === 'archivist.ideas' && taskFeature('rules.question') === 'archivist.deck');

const huge: DeckContext = { ...dc, cards: Array.from({ length: 3000 }, (_, i) => ({ name: `Filler Card Number ${i}`, qty: 1, type: 'Creature', mv: 3, cost: '{2}{G}', text: 'Flying' })) };
const trimmed = buildMessages({ task: 'deck.strategy', deck: huge });
const total = trimmed.reduce((s, m) => s + m.content.length, 0);
check('an oversized prompt is cut to budget', total <= PROMPT_BUDGET_CHARS + 50, `total ${total}`);
check('the system prompt survives trimming', trimmed[0].content === SYSTEM_PROMPT);
check('trimming marks itself', trimmed.some((m) => m.content.endsWith('…(trimmed)')));
check('fitBudget leaves small prompts alone', fitBudget([{ role: 'system', content: 'a' }, { role: 'user', content: 'b' }]).length === 2);

// ─── JSON parsing ────────────────────────────────────────────────────────────
console.log('json tasks');
const names = new Set(atraxa.cards.map((c) => c.cardName));
const swapsRaw = '```json\n' + JSON.stringify({ swaps: [
  { remove: 'Mulldrifter', add: 'Dragonlord Dromoka', reason: 'ok' },
  { remove: "Atraxa, Praetors' Voice", add: 'Sol Ring', reason: 'never the commander' },
  { remove: 'Cultivate', add: 'Rhystic Study', reason: 'already in the deck' },
  { remove: 'Not In Deck', add: 'Three Visits', reason: 'remove must be in the list' },
  { remove: 'Mulldrifter', add: 'Esper Sentinel', reason: 'duplicate remove' },
  { remove: 'Serra Angel', add: 'Serra Angel', reason: 'same card' },
  { remove: 'Toxic Deluge' },
  'garbage',
] }) + '\n```';
const swaps = parseSwaps(swapsRaw, names, atraxa.commanderName);
check('swaps: fenced JSON is accepted', swaps.length === 1, `got ${swaps.length}`);
check('swaps: only the valid one survives', swaps[0]?.remove === 'Mulldrifter' && swaps[0]?.add === 'Dragonlord Dromoka');
check('swaps: a bare array is accepted', parseSwaps('[{"remove":"Cultivate","add":"Three Visits","reason":"r"}]', names, atraxa.commanderName).length === 1);
check('swaps: prose around the JSON is tolerated', parseSwaps('Here you go: {"swaps":[{"remove":"Cultivate","add":"Three Visits","reason":"r"}]} Enjoy.', names, atraxa.commanderName).length === 1);
check('swaps: nonsense yields nothing', parseSwaps('no json here', names, atraxa.commanderName).length === 0);
check('swaps: capped at 10', parseSwaps(JSON.stringify({ swaps: [...names].filter((n) => n !== atraxa.commanderName).map((n, i) => ({ remove: n, add: `New ${i}`, reason: '' })) }), names, atraxa.commanderName).length === 10);
const ideas = parseIdeas('{"ideas":[{"name":"Krenko, Mob Boss","why":"goblins"},{"name":"Krenko, Mob Boss","why":"dup"},{"why":"no name"},{"name":"The Ur-Dragon","why":"dragons"}]}');
check('ideas: deduplicated and named', ideas.length === 2 && ideas[1].name === 'The Ur-Dragon');

// ─── Answer rendering ────────────────────────────────────────────────────────
console.log('answer blocks');
const blocks = toBlocks('## What works\n\nAtraxa does the work.\nSecond line.\n\n- one\n- two\n\n1. first\n2. second\n');
check('headings, paragraphs, lists', blocks.length === 4 && blocks[0].kind === 'heading' && blocks[1].kind === 'p' && blocks[2].kind === 'ul' && blocks[3].kind === 'ol');
check('adjacent lines join one paragraph', blocks[1].kind === 'p' && blocks[1].text === 'Atraxa does the work. Second line.');
check('list items are grouped', blocks[2].kind === 'ul' && blocks[2].items.length === 2);

console.log(failures === 0 ? '\nAll Archivist tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
