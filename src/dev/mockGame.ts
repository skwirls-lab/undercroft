import type { ForgeGameState, ForgePlayer, ForgeCard } from '@/lib/forgeClient';

/**
 * A mid-game Commander board for development previews.
 *
 * Built to stress the layout rather than to be a plausible game: the human has a commander
 * in the zone AND a full board AND a nine-card hand, because that is the state in which the
 * battlefield used to need scrolling. Three opponents with different board shapes exercise
 * the stat boxes. IDs are stable so the same card keeps the same identity across re-renders.
 */

let nextId = 1000;
const id = () => nextId++;

const land = (name: string, type: string, tapped = false): ForgeCard => ({
  id: id(),
  name,
  typeLine: `Basic Land — ${type}`,
  manaCost: '',
  oracleText: `({T}: Add {${type[0]}}.)`,
  tapped,
});

const creature = (
  name: string,
  cost: string,
  p: number,
  t: number,
  opts: Partial<ForgeCard> & { types?: string } = {}
): ForgeCard => ({
  id: id(),
  name,
  typeLine: `Creature — ${opts.types ?? 'Human Warrior'}`,
  manaCost: cost,
  oracleText: opts.oracleText ?? '',
  power: (opts.power as number | undefined) ?? p,
  toughness: (opts.toughness as number | undefined) ?? t,
  basePower: p,
  baseToughness: t,
  tapped: opts.tapped ?? false,
  sick: opts.sick ?? false,
  counters: opts.counters,
  equippedBy: opts.equippedBy,
  keywords: opts.keywords,
  damage: opts.damage,
  isToken: opts.isToken,
});

const other = (name: string, cost: string, typeLine: string, extra: Partial<ForgeCard> = {}): ForgeCard => ({
  id: id(),
  name,
  typeLine,
  manaCost: cost,
  oracleText: extra.oracleText ?? '',
  tapped: extra.tapped ?? false,
  loyalty: extra.loyalty,
  attachedTo: extra.attachedTo,
});

const handCard = (name: string, cost: string, typeLine: string, oracle = ''): ForgeCard => ({
  id: id(),
  name,
  typeLine,
  manaCost: cost,
  oracleText: oracle,
});

const manaPool = { white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 };

export function buildMockGame(): ForgeGameState {
  nextId = 1000;

  // ── Human ──────────────────────────────────────────────────────────────────
  const swordOfFire = other('Sword of Fire and Ice', '{3}', 'Artifact — Equipment', {
    oracleText: 'Equipped creature gets +2/+2 and has protection from red and from blue.\nEquip {2}',
  });
  const angel = creature('Serra Angel', '{3}{W}{W}', 4, 4, {
    types: 'Angel',
    keywords: ['Flying', 'Vigilance'],
    power: 6,
    toughness: 6,
    equippedBy: [{ id: swordOfFire.id, name: swordOfFire.name }],
  });
  swordOfFire.attachedTo = { id: angel.id, name: angel.name, controllerId: 1 };

  const human: ForgePlayer = {
    id: 1,
    name: 'Player',
    life: 31,
    poison: 0,
    isAI: false,
    isActivePlayer: true,
    hasPriority: true,
    manaPool: { ...manaPool, white: 1, green: 1 },
    commanderDamage: { 'Krenko, Mob Boss': 9, 'The Ur-Dragon': 15 },
    command: [
      {
        id: id(),
        name: "Atraxa, Praetors' Voice",
        typeLine: 'Legendary Creature — Phyrexian Angel Horror',
        manaCost: '{G}{W}{U}{B}',
        oracleText: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.',
        power: 4,
        toughness: 4,
        basePower: 4,
        baseToughness: 4,
        keywords: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink'],
      },
    ],
    battlefield: [
      angel,
      creature('Llanowar Elves', '{G}', 1, 1, { types: 'Elf Druid', tapped: true }),
      creature('Thraben Inspector', '{W}', 1, 2, { types: 'Human Soldier' }),
      creature('Walking Ballista', '{X}{X}', 0, 0, {
        types: 'Phyrexian Construct',
        counters: { P1P1: 3 },
        power: 3,
        toughness: 3,
      }),
      creature('Bird', '', 1, 1, { types: 'Bird', keywords: ['Flying'], isToken: true, sick: true }),
      creature('Mulldrifter', '{4}{U}', 2, 2, { types: 'Elemental', keywords: ['Flying'], damage: 1 }),
      swordOfFire,
      other('Sol Ring', '{1}', 'Artifact', { tapped: true, oracleText: '{T}: Add {C}{C}.' }),
      other('Doubling Season', '{4}{G}', 'Enchantment', {
        oracleText: 'If an effect would create one or more tokens under your control, it creates twice that many instead.',
      }),
      other('Jace, the Mind Sculptor', '{2}{U}{U}', 'Legendary Planeswalker — Jace', { loyalty: 5 }),
      land('Forest', 'Forest'),
      land('Forest', 'Forest', true),
      land('Plains', 'Plains'),
      land('Plains', 'Plains', true),
      land('Island', 'Island'),
      land('Swamp', 'Swamp', true),
      { id: id(), name: 'Command Tower', typeLine: 'Land', manaCost: '', oracleText: '{T}: Add one mana of any color in your commander\'s color identity.' },
      { id: id(), name: 'Breeding Pool', typeLine: 'Land — Forest Island', manaCost: '', oracleText: '({T}: Add {G} or {U}.)', tapped: true },
    ],
    hand: [
      handCard('Counterspell', '{U}{U}', 'Instant', 'Counter target spell.'),
      handCard('Swords to Plowshares', '{W}', 'Instant', 'Exile target creature. Its controller gains life equal to its power.'),
      handCard('Cultivate', '{2}{G}', 'Sorcery'),
      handCard('Forest', '', 'Basic Land — Forest'),
      handCard('Elspeth, Sun\'s Champion', '{4}{W}{W}', 'Legendary Planeswalker — Elspeth'),
      handCard('Deepglow Skate', '{4}{U}', 'Creature — Fish'),
      handCard('Anguished Unmaking', '{1}{W}{B}', 'Instant'),
      handCard('Rhystic Study', '{2}{U}', 'Enchantment'),
      handCard('Island', '', 'Basic Land — Island'),
    ],
    graveyard: [
      handCard('Path to Exile', '{W}', 'Instant', 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.'),
      handCard('Sakura-Tribe Elder', '{1}{G}', 'Creature — Snake Shaman', 'Sacrifice Sakura-Tribe Elder: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.'),
      handCard('Toxic Deluge', '{2}{B}', 'Sorcery', 'As an additional cost to cast this spell, pay X life.\nAll creatures get -X/-X until end of turn.'),
      handCard('Eternal Witness', '{1}{G}{G}', 'Creature — Human Shaman', 'When Eternal Witness enters, you may return target card from your graveyard to your hand.'),
      handCard('Plains', '', 'Basic Land — Plains'),
    ],
    exile: [
      handCard('Swords to Plowshares', '{W}', 'Instant', 'Exile target creature. Its controller gains life equal to its power.'),
      handCard('Mystic Remora', '{U}', 'Enchantment', 'Cumulative upkeep {4}\nWhenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.'),
    ],
    librarySize: 61,
  };

  // ── Opponents ──────────────────────────────────────────────────────────────
  const krenko: ForgePlayer = {
    id: 2,
    name: 'Krenko AI',
    life: 18,
    poison: 0,
    isAI: true,
    isActivePlayer: false,
    hasPriority: false,
    manaPool,
    commanderDamage: { "Atraxa, Praetors' Voice": 12, 'The Ur-Dragon': 5 },
    command: [],
    battlefield: [
      { ...creature('Krenko, Mob Boss', '{2}{R}{R}', 3, 3, { types: 'Goblin Warrior' }), typeLine: 'Legendary Creature — Goblin Warrior' },
      ...Array.from({ length: 7 }, () => creature('Goblin', '', 1, 1, { types: 'Goblin', isToken: true })),
      creature('Goblin Chieftain', '{1}{R}{R}', 2, 2, { types: 'Goblin', keywords: ['Haste'] }),
      other('Skullclamp', '{1}', 'Artifact — Equipment'),
      ...Array.from({ length: 6 }, (_, i) => land('Mountain', 'Mountain', i < 3)),
    ],
    hand: Array.from({ length: 3 }, () => handCard('?', '', '')),
    graveyard: [],
    exile: [],
    librarySize: 70,
  };

  const dragon: ForgePlayer = {
    id: 3,
    name: 'Ur-Dragon AI',
    life: 40,
    poison: 0,
    isAI: true,
    isActivePlayer: false,
    hasPriority: false,
    manaPool,
    commanderDamage: {},
    command: [
      {
        id: id(),
        name: 'The Ur-Dragon',
        typeLine: 'Legendary Creature — Dragon Avatar',
        manaCost: '{4}{W}{U}{B}{R}{G}',
        power: 10,
        toughness: 10,
        basePower: 10,
        baseToughness: 10,
        keywords: ['Flying'],
      },
    ],
    battlefield: [
      creature('Dragonlord Dromoka', '{4}{G}{W}', 5, 7, { types: 'Elder Dragon', keywords: ['Flying', 'Lifelink'] }),
      ...Array.from({ length: 9 }, (_, i) => land(['Forest', 'Plains', 'Mountain'][i % 3], ['Forest', 'Plains', 'Mountain'][i % 3], i % 4 === 0)),
    ],
    hand: Array.from({ length: 6 }, () => handCard('?', '', '')),
    graveyard: [],
    exile: [],
    librarySize: 74,
  };

  const control: ForgePlayer = {
    id: 4,
    name: 'Control AI',
    life: 7,
    poison: 4,
    isAI: true,
    isActivePlayer: false,
    hasPriority: false,
    manaPool,
    commanderDamage: { 'Krenko, Mob Boss': 20 },
    command: [],
    battlefield: [
      other('Rhystic Study', '{2}{U}', 'Enchantment'),
      other('Propaganda', '{2}{U}', 'Enchantment'),
      ...Array.from({ length: 5 }, (_, i) => land('Island', 'Island', i === 0)),
    ],
    hand: Array.from({ length: 8 }, () => handCard('?', '', '')),
    graveyard: [],
    exile: [],
    librarySize: 66,
  };

  return {
    gameId: 1,
    isGameOver: false,
    turn: {
      phase: 'MAIN1',
      activePlayer: 'Player',
      activePlayerId: 1,
      turnNumber: 9,
      priorityPlayer: 'Player',
    },
    players: [human, krenko, dragon, control],
    stack: [
      { description: 'Counter target spell.', cardName: 'Counterspell', cardId: 5001, controller: 'Control AI' },
      { description: 'Draw three cards.', cardName: "Ancestral Recall", cardId: 5000, controller: 'Player' },
    ],
  };
}
