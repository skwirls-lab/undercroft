/**
 * The player's match history: loaded once per sign-in, appended at the end of every game.
 *
 * Persistence goes through users/{uid}/matches. In the dev mock there is no Firestore, so
 * the store is seeded with sample matches and every write stays in memory.
 */

import { create } from 'zustand';
import { getFirebaseAuth } from '@/lib/firebase/config';
import { deleteMatch, loadMatches, saveMatch, saveMatchRecap } from '@/lib/firebase/matches';
import { isDevMock } from '@/lib/devMock';
import type { MatchRecord } from '@/lib/matchHistory';

interface MatchHistoryStore {
  matches: MatchRecord[];
  loadedFor: string | null;
  loading: boolean;
  failed: boolean;
  load: (uid: string) => Promise<void>;
  clear: () => void;
  /** Append a finished match and persist it. Safe without a signed-in user (kept in memory). */
  record: (record: MatchRecord) => Promise<void>;
  setRecap: (matchId: string, text: string) => Promise<void>;
  remove: (matchId: string) => Promise<void>;
}

function currentUid(): string | null {
  if (isDevMock()) return 'dev-mock-user';
  try { return getFirebaseAuth()?.currentUser?.uid ?? null; } catch { return null; }
}

export const useMatchHistoryStore = create<MatchHistoryStore>((set, get) => ({
  matches: [],
  loadedFor: null,
  loading: false,
  failed: false,

  load: async (uid) => {
    if (get().loadedFor === uid && !get().failed) return;
    set({ loading: true, failed: false });
    try {
      if (isDevMock()) {
        const { DEV_MOCK_MATCHES } = await import('@/dev/mockMatches');
        // Keep anything recorded this session on top of the samples.
        const recorded = get().matches.filter((m) => !m.id.startsWith('mock-'));
        set({ matches: [...recorded, ...DEV_MOCK_MATCHES], loadedFor: uid, loading: false });
        return;
      }
      const matches = await loadMatches(uid);
      set({ matches, loadedFor: uid, loading: false });
    } catch (err) {
      console.error('[matchHistory] load failed:', err);
      set({ loading: false, failed: true });
    }
  },

  clear: () => set({ matches: [], loadedFor: null, loading: false, failed: false }),

  record: async (record) => {
    set((s) => ({ matches: [record, ...s.matches.filter((m) => m.id !== record.id)] }));
    const uid = currentUid();
    if (!uid || isDevMock()) return;
    try { await saveMatch(uid, record); } catch (err) { console.error('[matchHistory] save failed:', err); }
  },

  setRecap: async (matchId, text) => {
    const at = Date.now();
    set((s) => ({ matches: s.matches.map((m) => (m.id === matchId ? { ...m, recap: { text, at } } : m)) }));
    const uid = currentUid();
    if (!uid || isDevMock()) return;
    try { await saveMatchRecap(uid, matchId, text); } catch (err) { console.error('[matchHistory] recap save failed:', err); }
  },

  remove: async (matchId) => {
    set((s) => ({ matches: s.matches.filter((m) => m.id !== matchId) }));
    const uid = currentUid();
    if (!uid || isDevMock()) return;
    try { await deleteMatch(uid, matchId); } catch (err) { console.error('[matchHistory] delete failed:', err); }
  },
}));
