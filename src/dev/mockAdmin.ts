import type { AdminUserRow, MonthStats } from '@/lib/firebase/adminOps';
import { monthKey } from '@/lib/plan';

/** Stand-ins for the admin panel in development mock mode, where there is no Firestore. */

const month = monthKey();

export const mockAdminUsers: AdminUserRow[] = [
  {
    uid: 'dev-mock-user',
    email: 'dev@example.com',
    displayName: 'Dev Tester',
    profile: { plan: 'patron', planSource: 'admin', patronUntil: null, planNote: 'Owner', usage: { [month]: { archivist: 12, tokensIn: 41000, tokensOut: 9800 } }, subscriptionStatus: null },
  },
  {
    uid: 'mock-friend',
    email: 'friend@example.com',
    displayName: 'Playgroup Friend',
    profile: { plan: 'free', planSource: null, patronUntil: null, planNote: null, usage: { [month]: { archivist: 4, tokensIn: 9000, tokensOut: 2100 } }, subscriptionStatus: null },
  },
];

export const mockMonthStats: MonthStats = {
  calls: 57,
  failed: 2,
  tokensIn: 210_000,
  tokensOut: 48_000,
  byTask: { 'deck.improve': 20, 'deck.swaps': 11, 'match.advice': 18, 'rules.question': 6, 'game.recap': 2 },
  updatedAt: Date.now() - 600_000,
};
