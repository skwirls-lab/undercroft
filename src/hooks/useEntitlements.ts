'use client';

import { useMemo } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useAppConfigStore } from '@/store/appConfigStore';
import { can, limit, type Feature, type Limit, type Plan } from '@/lib/entitlements';
import { usageThisMonth } from '@/lib/plan';

/**
 * The signed-in player's plan, read from the profile the deck store loaded, plus the
 * questions a screen asks of it. Components call this rather than importing the price list
 * so the plan source can change in one place.
 *
 * `archivist` is this month's use against the allowance the app config sets for the plan.
 * The server is the one that refuses; this is for the meter in Settings and for greying an
 * entry point before a wasted round trip.
 */
export function useEntitlements() {
  const plan: Plan = useDeckStore((s) => s.plan);
  const profile = useDeckStore((s) => s.profile);
  const config = useAppConfigStore((s) => s.config);
  return useMemo(() => {
    const used = usageThisMonth(profile).archivist;
    const allowed = plan === 'patron' ? config.allowance.patron : config.allowance.free;
    return {
      plan,
      profile,
      can: (feature: Feature) => can(plan, feature),
      /** The same question with the launch switch ignored: what the server will enforce today. */
      canStrict: (feature: Feature) => can(plan, feature, true),
      limit: (key: Limit) => limit(plan, key),
      archivist: {
        enabled: config.archivistEnabled,
        used,
        allowed,
        remaining: Math.max(0, allowed - used),
      },
      notice: config.notice,
    };
  }, [plan, profile, config]);
}
