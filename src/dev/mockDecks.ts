import type { Deck, Shelf } from '@/store/deckStore';

/**
 * Sample decks for development mock mode. Names are real cards and every one the Atraxa list
 * uses has a record in `mockCards.ts`, so the deck page renders with art. Lists are
 * abbreviated — this is for looking at screens, not for playing.
 */

const ok = (cardName: string, quantity = 1) => ({ cardName, quantity, resolved: true, forgeResolved: true });

export const DEV_MOCK_SHELVES: Shelf[] = [
  { id: 'shelf-tourney', name: 'Tournament', accent: 'gold', createdAt: Date.now() - 86400000 * 30 },
  { id: 'shelf-testing', name: 'Testing', accent: 'U', createdAt: Date.now() - 86400000 * 10 },
];

export const DEV_MOCK_DECKS: Deck[] = [
  {
    id: 'mock-atraxa',
    name: 'Atraxa Superfriends',
    commanderName: "Atraxa, Praetors' Voice",
    format: 'commander',
    shelfId: 'shelf-tourney',
    cards: [
      ok("Atraxa, Praetors' Voice"),
      ok('Llanowar Elves'), ok('Thraben Inspector'), ok('Deepglow Skate'), ok('Mulldrifter'), ok('Serra Angel'), ok('Walking Ballista'), ok('Craterhoof Behemoth'),
      ok("Elspeth, Sun's Champion"), ok('Jace, the Mind Sculptor'),
      ok('Counterspell'), ok('Swords to Plowshares'), ok('Anguished Unmaking'), ok('Cyclonic Rift'), ok('Vampiric Tutor'),
      ok('Cultivate'), ok('Toxic Deluge'),
      ok('Sol Ring'), ok('Arcane Signet'), ok('Skullclamp'),
      ok('Doubling Season'), ok('Rhystic Study'), ok('Smothering Tithe'),
      ok('Command Tower'), ok('Breeding Pool'), ok('Forest', 4), ok('Plains', 4), ok('Island', 4), ok('Swamp', 3),
      // One that is not in the mock card database, to show the unknown state
      { cardName: 'Vivi Ornitier', quantity: 1, resolved: false },
    ],
    resolvedCount: 30,
    unresolvedCount: 1,
    totalCards: 43,
    createdAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'mock-krenko',
    name: 'Krenko Goblins',
    commanderName: 'Krenko, Mob Boss',
    format: 'commander',
    shelfId: 'shelf-testing',
    cards: [
      ok('Krenko, Mob Boss'), ok('Goblin Chieftain'), ok('Skirk Prospector'), ok('Lightning Bolt'), ok('Skullclamp'), ok('Sol Ring'), ok('Mountain', 36),
    ],
    resolvedCount: 7,
    unresolvedCount: 0,
    totalCards: 42,
    createdAt: Date.now() - 86400000 * 40,
    updatedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'mock-ur-dragon',
    name: 'Ur-Dragon Tribal',
    commanderName: 'The Ur-Dragon',
    format: 'commander',
    shelfId: null,
    cards: [ok('The Ur-Dragon'), ok('Dragonlord Dromoka'), ok('Command Tower')],
    resolvedCount: 0,
    unresolvedCount: 0,
    totalCards: 100,
    createdAt: Date.now() - 86400000 * 90,
    updatedAt: Date.now() - 86400000 * 90,
  },
  {
    id: 'mock-headless',
    name: 'Untested Pile',
    commanderName: '',
    format: 'commander',
    shelfId: null,
    cards: [ok('Sol Ring'), ok('Counterspell')],
    resolvedCount: 2,
    unresolvedCount: 0,
    totalCards: 2,
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 1,
  },
];
