'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/firebase/auth';
import { useDeckStore } from '@/store/deckStore';
import { upsertUserProfile } from '@/lib/firebase/firestore';

/**
 * Wires Firebase Auth state to deck store Firestore sync.
 * - On sign-in: upserts user profile, loads decks from Firestore
 * - On sign-out: clears synced state
 *
 * Mount once in Providers or layout.
 */
export function useFirestoreSync() {
  const { user, loading } = useAuth();
  const loadFromFirestore = useDeckStore((s) => s.loadFromFirestore);
  const clearSync = useDeckStore((s) => s.clearSync);
  const prevUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;

    const uid = user?.uid ?? null;

    // No change
    if (uid === prevUidRef.current) return;
    prevUidRef.current = uid;

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

        try {
          await loadFromFirestore(uid);
          console.log('[Sync] Decks loaded from Firestore');
        } catch (err) {
          console.error('[Sync] Failed to load decks:', err);
        }
      };

      syncUser();
    } else {
      // User signed out — clear synced data
      clearSync();
    }
  }, [user, loading, loadFromFirestore, clearSync]);
}
