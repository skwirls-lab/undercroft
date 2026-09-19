import type { Deck } from '@/store/deckStore';

/** Sample decks for development mock mode. Names are real cards; lists are abbreviated. */
export const DEV_MOCK_DECKS: Deck[] = [
  {
    id: 'mock-atraxa',
    name: 'Atraxa Superfriends',
    commanderName: "Atraxa, Praetors' Voice",
    format: 'commander',
    cards: [
      { cardName: "Atraxa, Praetors' Voice", quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Sol Ring', quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Arcane Signet', quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Command Tower', quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Doubling Season', quantity: 1, resolved: true, forgeResolved: true },
    ],
    resolvedCount: 99,
    unresolvedCount: 0,
    totalCards: 100,
    createdAt: Date.now() - 86400000 * 12,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'mock-krenko',
    name: 'Krenko Goblins',
    commanderName: 'Krenko, Mob Boss',
    format: 'commander',
    cards: [
      { cardName: 'Krenko, Mob Boss', quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Goblin Chieftain', quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Skirk Prospector', quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Mountain', quantity: 36, resolved: true, forgeResolved: true },
    ],
    resolvedCount: 97,
    unresolvedCount: 2,
    totalCards: 100,
    createdAt: Date.now() - 86400000 * 40,
    updatedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'mock-ur-dragon',
    name: 'Ur-Dragon Tribal',
    commanderName: 'The Ur-Dragon',
    format: 'commander',
    cards: [
      { cardName: 'The Ur-Dragon', quantity: 1, resolved: true, forgeResolved: true },
      { cardName: 'Dragonlord Dromoka', quantity: 1, resolved: true, forgeResolved: true },
    ],
    resolvedCount: 0,
    unresolvedCount: 0,
    totalCards: 100,
    createdAt: Date.now() - 86400000 * 90,
    updatedAt: Date.now() - 86400000 * 90,
  },
];
