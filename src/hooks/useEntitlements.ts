'use client';

import { useMemo } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { can, limit, type Feature, type Limit, type Plan } from '@/lib/entitlements';

/**
 * The signed-in player's plan, read from the profile the deck store loaded, and the two
 * questions a screen asks of it. Components call this rather than importing the price list
 * so the plan source can change (Firestore today, a session claim later) in one place.
 */
export function useEntitlements() {
  const plan: Plan = useDeckStore((s) => s.plan);
  return useMemo(
    () => ({
      plan,
      can: (feature: Feature) => can(plan, feature),
      limit: (key: Limit) => limit(plan, key),
    }),
    [plan]
  );
}
