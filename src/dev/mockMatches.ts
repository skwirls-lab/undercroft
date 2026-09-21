import type { MatchRecord, MatchSeat } from '@/lib/matchHistory';

const seat = (over: Partial<MatchSeat> & { name: string }): MatchSeat => ({
  isYou: false, isAI: true, deckName: null, commander: null, finalLife: 0, poison: 0, won: false, eliminated: true,
  lossReason: null, lossSpell: null, eliminatedTurn: null, place: null, spellsCast: 0, damageDealt: 0, lifeLost: 0,
  ...over,
});

const DAY = 86_400_000;
const now = Date.now();

/** Three matches for the harness: a win, a loss, and one left early. */
export const DEV_MOCK_MATCHES: MatchRecord[] = [
  {
    id: 'mock-m3', startedAt: now - 2 * 3600_000, endedAt: now - 3600_000, result: 'won', winner: 'Player',
    winCondition: '21 commander damage', turns: 14, seatCount: 4,
    you: { deckId: 'mock-atraxa', deckName: 'Atraxa Superfriends', commander: "Atraxa, Praetors' Voice" },
    seats: [
      seat({ name: 'Player', isYou: true, isAI: false, deckName: 'Atraxa Superfriends', commander: "Atraxa, Praetors' Voice", finalLife: 23, won: true, eliminated: false, place: 1, spellsCast: 19, damageDealt: 61, lifeLost: 17 }),
      seat({ name: 'Ur-Dragon AI', deckName: 'Dragon Horde', commander: 'The Ur-Dragon', finalLife: 0, lossReason: 'CommanderDamage', eliminatedTurn: 14, place: 2, spellsCast: 12, damageDealt: 28, lifeLost: 40 }),
      seat({ name: 'Krenko AI', deckName: 'Goblin Swarm', commander: 'Krenko, Mob Boss', finalLife: 0, lossReason: 'LifeReachedZero', eliminatedTurn: 11, place: 3, spellsCast: 15, damageDealt: 33, lifeLost: 40 }),
      seat({ name: 'Control AI', deckName: 'Azorius Control', commander: 'Grand Arbiter Augustin IV', finalLife: 0, lossReason: 'Poisoned', poison: 10, eliminatedTurn: 9, place: 4, spellsCast: 9, damageDealt: 6, lifeLost: 31 }),
    ],
    recap: { at: now - 3500_000, text: 'The game turned on turn 9, when Atraxa\'s proliferate pushed Control AI to ten poison while its counterspells were tapped out. From there the table was two against one, and Krenko\'s goblins never found a second Chieftain.\n\nTwo things to do differently: hold Swords to Plowshares for the Ur-Dragon rather than a 2/2, and play the fourth land before casting Cultivate so the Doubling Season comes down a turn earlier.' },
  },
  {
    id: 'mock-m2', startedAt: now - DAY - 4000_000, endedAt: now - DAY - 2200_000, result: 'lost', winner: 'Krenko AI',
    winCondition: 'life reached 0', turns: 9, seatCount: 3,
    you: { deckId: 'mock-ur-dragon', deckName: 'Dragon Horde', commander: 'The Ur-Dragon' },
    seats: [
      seat({ name: 'Krenko AI', deckName: 'Goblin Swarm', commander: 'Krenko, Mob Boss', finalLife: 26, won: true, eliminated: false, place: 1, spellsCast: 11, damageDealt: 57, lifeLost: 14 }),
      seat({ name: 'Player', isYou: true, isAI: false, deckName: 'Dragon Horde', commander: 'The Ur-Dragon', finalLife: 0, lossReason: 'LifeReachedZero', eliminatedTurn: 9, place: 2, spellsCast: 7, damageDealt: 12, lifeLost: 40 }),
      seat({ name: 'Control AI', deckName: 'Azorius Control', commander: 'Grand Arbiter Augustin IV', finalLife: 0, lossReason: 'LifeReachedZero', eliminatedTurn: 8, place: 3, spellsCast: 8, damageDealt: 2, lifeLost: 40 }),
    ],
    recap: null,
  },
  {
    id: 'mock-m1', startedAt: now - 3 * DAY, endedAt: now - 3 * DAY + 900_000, result: 'abandoned', winner: null,
    winCondition: null, turns: 4, seatCount: 2,
    you: { deckId: 'mock-atraxa', deckName: 'Atraxa Superfriends', commander: "Atraxa, Praetors' Voice" },
    seats: [
      seat({ name: 'Player', isYou: true, isAI: false, deckName: 'Atraxa Superfriends', commander: "Atraxa, Praetors' Voice", finalLife: 40, eliminated: false, place: null, spellsCast: 3 }),
      seat({ name: 'Control AI', deckName: 'Azorius Control', commander: 'Grand Arbiter Augustin IV', finalLife: 38, eliminated: false, place: null, spellsCast: 2, damageDealt: 2 }),
    ],
    recap: null,
  },
];
