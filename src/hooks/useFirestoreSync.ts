'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/firebase/auth';
import { useDeckStore } from '@/store/deckStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAppConfigStore } from '@/store/appConfigStore';
import { upsertUserProfile } from '@/lib/firebase/firestore';
import { isDevMock } from '@/lib/devMock';
import { DEV_MOCK_DECKS, DEV_MOCK_SHELVES } from '@/dev/mockDecks';
import { useMatchHistoryStore } from '@/store/matchHistoryStore';

/**
 * Wires Firebase Auth state to deck store Firestore sync.
 * - On sign-in: upserts user profile, loads decks from Firestore
 * - On sign-out OR account switch: clears the previous account's synced state
 *
 * The account-switch case matters on a shared device: `signInWithPopup` while a session is
 * already live moves straight from user A to user B with no `null` in between, so clearing
 * only on sign-out leaves A's decks in memory while B is signed in — and any edit would then
 * write them into B's Firestore path.
 *
 * Mount once in Providers or layout.
 */
export function useFirestoreSync() {
  const { user, loading } = useAuth();
  const loadFromFirestore = useDeckStore((s) => s.loadFromFirestore);
  const clearSync = useDeckStore((s) => s.clearSync);
  const clearUserSettings = useSettingsStore((s) => s.clearUserSettings);
  const prevUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    const uid = user?.uid ?? null;

    // No change
    if (uid === prevUidRef.current) return;

    const previousUid = prevUidRef.current;
    prevUidRef.current = uid;

    // Any departure from a signed-in account — sign-out or a switch to a different user —
    // must drop that account's data before anything belonging to the next one is loaded.
    if (previousUid !== null && previousUid !== uid) {
      clearSync();
      clearUserSettings();
      useMatchHistoryStore.getState().clear();
    }
    if (uid) void useMatchHistoryStore.getState().load(uid);

    // App-wide config (allowances, notice, whether the Archivist is resting) follows sign-in.
    if (uid) void useAppConfigStore.getState().refresh();

    if (uid && user && isDevMock()) {
      // Development-only: no Firestore to talk to, so seed a few decks instead.
      // The mock tester is a Patron by admin grant, so every Archivist entry point renders;
      // `?plan=free` on any URL previews the free-tier state instead.
      const free = new URLSearchParams(window.location.search).get('plan') === 'free';
      const profile = free
        ? { plan: 'free' as const, planSource: null, patronUntil: null, planNote: null, usage: {}, subscriptionStatus: null }
        : { plan: 'patron' as const, planSource: 'admin' as const, patronUntil: null, planNote: 'Dev mock', usage: {}, subscriptionStatus: null };
      useDeckStore.setState({ decks: DEV_MOCK_DECKS, shelves: DEV_MOCK_SHELVES, plan: profile.plan, profile, syncedUserId: uid, isSyncing: false, syncFailed: false });
      return;
    }

    if (uid && user) {
      // User signed in — upsert profile first, then load decks
      const syncUser = async () => {
        try {
          await upsertUserProfile({
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoURL: user.photoURL,
          });
          console.log('[Sync] User profile upserted for', user.email);
        } catch (err) {
          console.error('[Sync] Failed to upsert user profile:', err);
        }

        // The account may have changed again while the profile write was in flight.
        if (prevUidRef.current !== uid) return;

        try {
          await loadFromFirestore(uid);
          console.log('[Sync] Decks loaded from Firestore');
        } catch (err) {
          console.error('[Sync] Failed to load decks:', err);
        }
      };

      syncUser();
    }
  }, [user, loading, loadFromFirestore, clearSync, clearUserSettings]);
}
