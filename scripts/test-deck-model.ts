/**
 * Tests for the deck-screen model: grouping, stats, verification patching, opponent seat
 * resolution and the entitlement gates.
 *
 * Run: npm run test:deck
 */
import { groupDeck, groupFor, manaCurve, deckColorIdentity, frontFace } from '../src/lib/deckCards';
import { resolveOpponents, describeChoice, vaultDeckPlayableByAI, vaultDeckToForge, SURPRISE } from '../src/lib/opponentDecks';
import { AI_DECKS } from '../src/lib/aiDecks';
import { can, limit, parsePlan, ENFORCE_ENTITLEMENTS } from '../src/lib/entitlements';
import { deckTotals, mergeEntries, type Deck, type DeckEntry } from '../src/store/deckStore';
import type { ScryfallCardRecord } from '../src/lib/cardTypes';
import { checkDeck, canBeCommander, maxCopies, fitsIdentity, identityOf, summarizeCheck, sameLegality } from '../src/lib/deckRules';
import { buildScryfallQuery } from '../src/lib/cardSearch';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const rec = (name: string, type_line: string, cmc: number, color_identity: string[] = [], extra: Partial<ScryfallCardRecord> = {}): ScryfallCardRecord => ({
  id: name, oracle_id: `o-${name}`, name, mana_cost: '', cmc, type_line, oracle_text: '', colors: color_identity, color_identity,
  keywords: [], layout: 'normal', legalities: {}, set: 't', set_name: 't', rarity: 'c', ...extra,
});

const records = new Map<string, ScryfallCardRecord | null>([
  ['Atraxa', rec('Atraxa', 'Legendary Creature — Angel', 4, ['W', 'U', 'B', 'G'])],
  ['Dryad Arbor', rec('Dryad Arbor', 'Land Creature — Forest Dryad', 0, ['G'])],
  ['Sol Ring', rec('Sol Ring', 'Artifact', 1)],
  ['Counterspell', rec('Counterspell', 'Instant', 2, ['U'])],
  ['Forest', rec('Forest', 'Basic Land — Forest', 0, ['G'])],
  ['Craterhoof', rec('Craterhoof', 'Creature — Beast', 8, ['G'])],
  ['Typo', null],
]);

const entries: DeckEntry[] = [
  { cardName: 'Atraxa', quantity: 1, resolved: true },
  { cardName: 'Dryad Arbor', quantity: 1, resolved: true },
  { cardName: 'Sol Ring', quantity: 1, resolved: true },
  { cardName: 'Counterspell', quantity: 1, resolved: true },
  { cardName: 'Forest', quantity: 10, resolved: true },
  { cardName: 'Craterhoof', quantity: 1, resolved: true },
  { cardName: 'Typo', quantity: 1, resolved: false },
];

console.log('groupFor');
check('land creature is a land', groupFor('Land Creature — Forest Dryad') === 'Lands');
check('artifact creature is a creature', groupFor('Artifact Creature — Construct') === 'Creatures');
check('DFC uses the front face', groupFor('Sorcery // Land') === 'Sorceries');
check('unknown type is Other', groupFor(undefined) === 'Other');

console.log('groupDeck');
const sections = groupDeck(entries, records, 'Atraxa');
const names = sections.map((s) => s.group);
check('commander section first', names[0] === 'Commander');
check('sections in canonical order', JSON.stringify(names) === JSON.stringify(['Commander', 'Creatures', 'Instants', 'Artifacts', 'Lands', 'Other']), names.join(','));
check('lands count sums quantities', sections.find((s) => s.group === 'Lands')?.count === 11);
check('unresolved card lands in Other', sections.find((s) => s.group === 'Other')?.entries[0].entry.cardName === 'Typo');

console.log('stats');
const curve = manaCurve(entries, records);
check('curve skips lands', curve[0] === 0);
check('curve caps at 7+', curve[7] === 1);
check('curve counts by mana value', curve[1] === 1 && curve[2] === 1 && curve[4] === 1);
check('identity from commander', deckColorIdentity(entries, records, 'Atraxa').join('') === 'WUBG');
check('identity from cards when no commander', deckColorIdentity(entries.filter((e) => e.cardName !== 'Atraxa'), records, '').join('') === 'UG');
check('deckTotals counts unresolved names once', deckTotals([...entries, { cardName: 'Typo', quantity: 2, resolved: false }]).unresolvedCount === 1);
check('deckTotals sums quantities', deckTotals(entries).totalCards === 16);
const merged = mergeEntries([{ cardName: 'Forest', quantity: 3 }, { cardName: 'Sol Ring', quantity: 1 }, { cardName: 'Forest', quantity: 2 }]);
check('mergeEntries folds repeated names and keeps order', merged.length === 2 && merged[0].cardName === 'Forest' && merged[0].quantity === 5);

console.log('frontFace');
const dfc = rec('Front // Back', 'Sorcery // Land', 3, [], {
  card_faces: [
    { name: 'Front', mana_cost: '{2}{U}', type_line: 'Sorcery', oracle_text: 'Draw.', image_uris: { small: 's', normal: 'n', large: 'l', art_crop: 'a', border_crop: 'b', png: 'p' } },
    { name: 'Back', mana_cost: '', type_line: 'Land', oracle_text: '' },
  ],
});
const face = frontFace(dfc);
check('DFC takes front face text and image', face.typeLine === 'Sorcery' && face.image === 'n' && face.manaCost === '{2}{U}');

console.log('opponents');
const vault: Deck[] = [
  { id: 'v1', name: 'My Brew', commanderName: 'Atraxa', cards: [{ cardName: 'Atraxa', quantity: 1 }, { cardName: 'Sol Ring', quantity: 1, forgeName: 'Sol Ring' }, { cardName: 'Vivi', quantity: 1, forgeName: 'Lightning Bolt' }], format: 'commander', resolvedCount: 3, unresolvedCount: 0, totalCards: 3, createdAt: 0, updatedAt: 0 },
  { id: 'v2', name: 'Headless', commanderName: '', cards: [{ cardName: 'Sol Ring', quantity: 1 }], format: 'commander', resolvedCount: 1, unresolvedCount: 0, totalCards: 1, createdAt: 0, updatedAt: 0 },
];
check('deck without commander is not AI-playable', !vaultDeckPlayableByAI(vault[1]) && vaultDeckPlayableByAI(vault[0]));
const forge = vaultDeckToForge(vault[0]);
check('commander is not repeated in the main list', !forge.deckList.some((l) => l.includes('Atraxa')) && forge.commander === 'Atraxa');
check('forgeName substitution is honoured', forge.deckList.includes('1 Lightning Bolt'));
check('seat is named after the deck', forge.name === 'My Brew');

const three = resolveOpponents([SURPRISE, SURPRISE, SURPRISE], vault);
check('three surprise seats get three different house decks', new Set(three.map((d) => d.name)).size === 3);
check('every surprise seat is a house deck', three.every((d) => AI_DECKS.some((h) => h.name === d.name)));

const mixed = resolveOpponents([{ kind: 'vault', deckId: 'v1' }, { kind: 'house', name: AI_DECKS[0].name }, SURPRISE], vault);
check('vault seat plays the vault deck', mixed[0].commander === 'Atraxa' && mixed[0].name === 'My Brew');
check('house seat plays the chosen house deck', mixed[1].name === AI_DECKS[0].name);
check('surprise seat avoids the chosen house deck', mixed[2].name !== AI_DECKS[0].name);

const dup = resolveOpponents([{ kind: 'vault', deckId: 'v1' }, { kind: 'vault', deckId: 'v1' }], vault);
check('same deck twice gets distinct seat names', dup[0].name === 'My Brew' && dup[1].name === 'My Brew 2');

const gone = resolveOpponents([{ kind: 'vault', deckId: 'deleted' }], vault);
check('deleted vault deck falls back to a house deck', AI_DECKS.some((h) => h.name === gone[0].name));
const headless = resolveOpponents([{ kind: 'vault', deckId: 'v2' }], vault)[0];
check('headless vault deck falls back to a house deck', AI_DECKS.some((h) => h.name === headless.name), headless.name);
check('describeChoice names a missing deck honestly', describeChoice({ kind: 'vault', deckId: 'nope' }, vault).title === 'Missing deck');

console.log('deck rules');
const seven = rec('Seven Dwarves', 'Creature — Dwarf', 2, ['R'], { oracle_text: 'A deck can have up to seven cards named Seven Dwarves.' });
const rat = rec('Relentless Rats', 'Creature — Rat', 3, ['B'], { oracle_text: 'A deck can have any number of cards named Relentless Rats.' });
const walker = rec('Commodore Guff', 'Legendary Planeswalker — Guff', 5, ['U', 'R', 'W'], { oracle_text: 'Commodore Guff can be your commander.' });
check('legendary creature can command', canBeCommander(records.get('Atraxa')!));
check('planeswalker with the clause can command', canBeCommander(walker));
check('plain creature cannot command', !canBeCommander(records.get('Craterhoof')!));
check('basic land has no copy limit', maxCopies(records.get('Forest')!) === Infinity);
check('"any number" has no copy limit', maxCopies(rat) === Infinity);
check('"up to seven" caps at seven', maxCopies(seven) === 7);
check('ordinary card caps at one', maxCopies(records.get('Sol Ring')!) === 1);
check('colourless fits any identity', fitsIdentity(records.get('Sol Ring')!, []));
check('off-colour card does not fit', !fitsIdentity(records.get('Counterspell')!, ['G']));
check('identityOf is WUBRG ordered', identityOf(walker).join('') === 'WUR');

const rulesRecords = new Map(records);
rulesRecords.set('Seven Dwarves', seven);
rulesRecords.set('Lightning Bolt', rec('Lightning Bolt', 'Instant', 1, ['R']));
const legalDeck = { commanderName: 'Atraxa', cards: [{ cardName: 'Atraxa', quantity: 1, resolved: true, forgeResolved: true }, { cardName: 'Sol Ring', quantity: 1, resolved: true, forgeResolved: true }, { cardName: 'Forest', quantity: 98, resolved: true, forgeResolved: true }] };
const legal = checkDeck(legalDeck, rulesRecords);
check('a 100-card singleton deck in identity is legal', legal.legal && legal.total === 100, legal.issues.map((i) => i.kind).join(','));

const messy = checkDeck({ commanderName: 'Atraxa', cards: [
  { cardName: 'Atraxa', quantity: 1, resolved: true, forgeResolved: true },
  { cardName: 'Sol Ring', quantity: 2, resolved: true, forgeResolved: true },
  { cardName: 'Lightning Bolt', quantity: 1, resolved: true, forgeResolved: true },
  { cardName: 'Seven Dwarves', quantity: 8, resolved: true, forgeResolved: true },
  { cardName: 'Typo', quantity: 1, resolved: false },
  { cardName: 'Craterhoof', quantity: 1, resolved: true, forgeResolved: false },
] }, rulesRecords);
const kinds = new Set(messy.issues.map((i) => i.kind));
check('reports size', kinds.has('size'));
check('reports duplicates incl. over-cap "up to" cards', kinds.has('duplicate') && messy.issues.find((i) => i.kind === 'duplicate')!.cards!.length === 2);
check('reports off-identity (Bolt in Atraxa)', kinds.has('off-identity') && messy.issues.find((i) => i.kind === 'off-identity')!.cards![0] === 'Lightning Bolt');
check('reports unknown and not-in-forge', kinds.has('unknown') && kinds.has('not-in-forge'));
check('reports missing commander', checkDeck({ commanderName: '', cards: [] }, rulesRecords).issues.some((i) => i.kind === 'no-commander'));
check('reports a commander that cannot command', checkDeck({ commanderName: 'Craterhoof', cards: [{ cardName: 'Craterhoof', quantity: 1, resolved: true }] }, rulesRecords).issues.some((i) => i.kind === 'bad-commander'));

const verdict = summarizeCheck(messy);
check('summarizeCheck keeps the count and one line per issue', verdict.legal === false && verdict.issues === messy.issues.length && verdict.summary.length === messy.issues.length);
check('sameLegality ignores the timestamp', sameLegality({ ...verdict, checkedAt: 1 }, verdict) && !sameLegality(null, verdict) && !sameLegality(summarizeCheck(legal), verdict));

console.log('scryfall query');
check('single word is a bare name match', buildScryfallQuery('rift') === 'rift legal:commander');
check('multi-word input is quoted', buildScryfallQuery('sol ring') === 'name:"sol ring" legal:commander');
check('identity filter uses id<=', buildScryfallQuery('x', { identity: ['W', 'U', 'B', 'G'] }) === 'x legal:commander id<=wubg');
check('colourless identity is id<=c', buildScryfallQuery('x', { identity: [] }).endsWith('id<=c'));
check('commander-only adds is:commander', buildScryfallQuery('atraxa', { commanderOnly: true }) === 'atraxa legal:commander is:commander');
check('empty text still yields a valid query', buildScryfallQuery('', { commanderOnly: true }) === 'legal:commander is:commander');

console.log('entitlements');
check('enforcement is off before launch', ENFORCE_ENTITLEMENTS === false);
check('everything is allowed while enforcement is off', can('free', 'deck.edit') && can('free', 'ai.customDecks') && can('free', 'vault.shelves'));
check('limits are unbounded while enforcement is off', limit('free', 'vault.maxDecks') === Infinity);
check('unknown plan values read as free', parsePlan('gold') === 'free' && parsePlan(undefined) === 'free' && parsePlan('patron') === 'patron');

console.log(failures === 0 ? '\nAll deck model tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
