import type { ScryfallCardRecord } from '@/lib/cardTypes';

/**
 * A pocket card database for development mock mode, where there is no Firestore to ask.
 * Enough real cards to fill the mock decks' sections; images are inline SVG "art" so the
 * deck pages render as they would with real scans, without a network.
 */

function art(hue: number, hue2: number, seed: number): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 488 680'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='oklch(0.42 0.12 ${hue})'/>
      <stop offset='1' stop-color='oklch(0.18 0.06 ${hue2})'/>
    </linearGradient>
    <radialGradient id='r' cx='${30 + (seed % 5) * 10}%' cy='${25 + (seed % 3) * 15}%' r='60%'>
      <stop offset='0' stop-color='oklch(0.80 0.10 ${hue2} / 0.55)'/>
      <stop offset='1' stop-color='transparent'/>
    </radialGradient>
  </defs>
  <rect width='488' height='680' rx='24' fill='oklch(0.12 0.01 55)'/>
  <rect x='22' y='22' width='444' height='636' rx='16' fill='url(#g)'/>
  <rect x='22' y='22' width='444' height='636' rx='16' fill='url(#r)'/>
  <rect x='40' y='60' width='408' height='300' rx='8' fill='oklch(0.30 0.05 ${hue} / 0.6)'/>
  <rect x='40' y='380' width='408' height='240' rx='8' fill='oklch(0.95 0.02 80 / 0.85)'/>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let seed = 0;
function rec(
  name: string,
  mana_cost: string,
  type_line: string,
  oracle_text: string,
  colors: string[],
  extra: Partial<ScryfallCardRecord> = {}
): ScryfallCardRecord {
  seed++;
  const cmc = (mana_cost.match(/\{([^}]+)\}/g) ?? []).reduce((s, sym) => {
    const n = parseInt(sym.replace(/[{}]/g, ''), 10);
    return s + (Number.isNaN(n) ? 1 : n);
  }, 0);
  const hues: Record<string, number> = { W: 85, U: 250, B: 300, R: 30, G: 145 };
  const hue = colors.length ? hues[colors[0]] : 60;
  const hue2 = colors.length > 1 ? hues[colors[1]] : hue + 40;
  const img = art(hue, hue2, seed);
  return {
    id: `mock-${seed}`,
    oracle_id: `mock-oracle-${seed}`,
    name,
    mana_cost,
    cmc,
    type_line,
    oracle_text,
    colors,
    color_identity: extra.color_identity ?? colors,
    keywords: [],
    layout: 'normal',
    image_uris: { small: img, normal: img, large: img, art_crop: img, border_crop: img, png: img },
    legalities: { commander: 'legal' },
    set: 'mck',
    set_name: 'Mock',
    rarity: 'rare',
    ...extra,
  };
}

export const MOCK_CARDS: ScryfallCardRecord[] = [
  rec("Atraxa, Praetors' Voice", '{G}{W}{U}{B}', 'Legendary Creature — Phyrexian Angel Horror', 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.', ['W', 'U', 'B', 'G'], { power: '4', toughness: '4' }),
  rec('Krenko, Mob Boss', '{2}{R}{R}', 'Legendary Creature — Goblin Warrior', '{T}: Create X 1/1 red Goblin creature tokens, where X is the number of Goblins you control.', ['R'], { power: '3', toughness: '3' }),
  rec('The Ur-Dragon', '{4}{W}{U}{B}{R}{G}', 'Legendary Creature — Dragon Avatar', 'Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.', ['W', 'U', 'B', 'R', 'G'], { power: '10', toughness: '10' }),
  rec('Sol Ring', '{1}', 'Artifact', '{T}: Add {C}{C}.', []),
  rec('Arcane Signet', '{2}', 'Artifact', "{T}: Add one mana of any color in your commander's color identity.", []),
  rec('Command Tower', '', 'Land', "{T}: Add one mana of any color in your commander's color identity.", []),
  rec('Doubling Season', '{4}{G}', 'Enchantment', 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.', ['G']),
  rec('Counterspell', '{U}{U}', 'Instant', 'Counter target spell.', ['U']),
  rec('Swords to Plowshares', '{W}', 'Instant', 'Exile target creature. Its controller gains life equal to its power.', ['W']),
  rec('Cultivate', '{2}{G}', 'Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', ['G']),
  rec('Toxic Deluge', '{2}{B}', 'Sorcery', 'As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.', ['B']),
  rec('Rhystic Study', '{2}{U}', 'Enchantment', "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.", ['U']),
  rec('Smothering Tithe', '{3}{W}', 'Enchantment', "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token.", ['W']),
  rec("Elspeth, Sun's Champion", '{4}{W}{W}', 'Legendary Planeswalker — Elspeth', '+1: Create three 1/1 white Soldier creature tokens.\n−3: Destroy all creatures with power 4 or greater.\n−7: You get an emblem.', ['W'], { loyalty: '4' }),
  rec('Jace, the Mind Sculptor', '{2}{U}{U}', 'Legendary Planeswalker — Jace', '+2: Look at the top card of target player\'s library. You may put that card on the bottom.\n0: Draw three cards, then put two cards from your hand on top of your library in any order.', ['U'], { loyalty: '3' }),
  rec('Deepglow Skate', '{4}{U}', 'Creature — Fish', 'When Deepglow Skate enters, double the number of each kind of counter on any number of target permanents.', ['U'], { power: '3', toughness: '3' }),
  rec('Thraben Inspector', '{W}', 'Creature — Human Soldier', 'When Thraben Inspector enters, investigate.', ['W'], { power: '1', toughness: '2' }),
  rec('Llanowar Elves', '{G}', 'Creature — Elf Druid', '{T}: Add {G}.', ['G'], { power: '1', toughness: '1' }),
  rec('Serra Angel', '{3}{W}{W}', 'Creature — Angel', 'Flying, vigilance', ['W'], { power: '4', toughness: '4' }),
  rec('Walking Ballista', '{X}{X}', 'Artifact Creature — Construct', 'Walking Ballista enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on Walking Ballista.\nRemove a +1/+1 counter: It deals 1 damage to any target.', [], { power: '0', toughness: '0' }),
  rec('Mulldrifter', '{4}{U}', 'Creature — Elemental', 'Flying\nWhen Mulldrifter enters, draw two cards.\nEvoke {2}{U}', ['U'], { power: '2', toughness: '2' }),
  rec('Anguished Unmaking', '{1}{W}{B}', 'Instant', 'Exile target nonland permanent. You lose 3 life.', ['W', 'B']),
  rec('Cyclonic Rift', '{1}{U}', 'Instant', "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}", ['U']),
  rec('Craterhoof Behemoth', '{5}{G}{G}{G}', 'Creature — Beast', 'Haste\nWhen Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.', ['G'], { power: '5', toughness: '5' }),
  rec('Vampiric Tutor', '{B}', 'Instant', 'Search your library for a card, then shuffle and put that card on top. You lose 2 life.', ['B']),
  rec('Goblin Chieftain', '{1}{R}{R}', 'Creature — Goblin', 'Haste\nOther Goblin creatures you control get +1/+1 and have haste.', ['R'], { power: '2', toughness: '2' }),
  rec('Skirk Prospector', '{R}', 'Creature — Goblin', 'Sacrifice a Goblin: Add {R}.', ['R'], { power: '1', toughness: '1' }),
  rec('Lightning Bolt', '{R}', 'Instant', 'Lightning Bolt deals 3 damage to any target.', ['R']),
  rec('Skullclamp', '{1}', 'Artifact — Equipment', 'Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}', []),
  rec('Dragonlord Dromoka', '{4}{G}{W}', 'Legendary Creature — Elder Dragon', "Dragonlord Dromoka can't be countered.\nFlying, lifelink\nYour opponents can't cast spells during your turn.", ['W', 'G'], { power: '5', toughness: '7' }),
  rec('Breeding Pool', '', 'Land — Forest Island', '({T}: Add {G} or {U}.)\nAs Breeding Pool enters, you may pay 2 life. If you don\'t, it enters tapped.', [], { color_identity: ['G', 'U'] }),
  rec('Forest', '', 'Basic Land — Forest', '({T}: Add {G}.)', [], { color_identity: ['G'] }),
  rec('Plains', '', 'Basic Land — Plains', '({T}: Add {W}.)', [], { color_identity: ['W'] }),
  rec('Island', '', 'Basic Land — Island', '({T}: Add {U}.)', [], { color_identity: ['U'] }),
  rec('Swamp', '', 'Basic Land — Swamp', '({T}: Add {B}.)', [], { color_identity: ['B'] }),
  rec('Mountain', '', 'Basic Land — Mountain', '({T}: Add {R}.)', [], { color_identity: ['R'] }),
];

const byName = new Map(MOCK_CARDS.map((c) => [c.name, c]));

export function lookupMockCards(names: string[]): Map<string, ScryfallCardRecord | null> {
  return new Map(names.map((n) => [n, byName.get(n) ?? null]));
}

export function searchMockCards(prefix: string, limit: number): ScryfallCardRecord[] {
  const q = prefix.toLowerCase();
  return MOCK_CARDS.filter((c) => c.name.toLowerCase().includes(q)).slice(0, limit);
}
