'use client';

import { useMemo, useState } from 'react';
import { useDeckStore } from '@/store/deckStore';
import { useAppConfigStore } from '@/store/appConfigStore';
import { can, limit, ENFORCE_ENTITLEMENTS, type Feature, type Limit, type Plan } from '@/lib/entitlements';
import { usageThisMonth } from '@/lib/plan';
import { isDevMock } from '@/lib/devMock';

/** The launch switch, plus `?enforce=1` in the dev harness so the locked states can be seen. */
function enforcementOn(): boolean {
  if (ENFORCE_ENTITLEMENTS) return true;
  if (isDevMock() && typeof window !== 'undefined') return new URLSearchParams(window.location.search).get('enforce') === '1';
  return false;
}

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
  const decks = useDeckStore((s) => s.decks);
  const config = useAppConfigStore((s) => s.config);
  const [enforce] = useState(enforcementOn);
  return useMemo(() => {
    const used = usageThisMonth(profile).archivist;
    const allowed = plan === 'patron' ? config.allowance.patron : config.allowance.free;
    // Beyond the vault cap, the most recently touched decks stay live; the rest are read-only,
    // never deleted. Only meaningful while the switch is on.
    const maxDecks = limit(plan, 'vault.maxDecks', enforce);
    const readOnlyDeckIds = new Set<string>();
    if (Number.isFinite(maxDecks) && decks.length > maxDecks) {
      [...decks].sort((a, b) => b.updatedAt - a.updatedAt).slice(maxDecks).forEach((d) => readOnlyDeckIds.add(d.id));
    }
    return {
      plan,
      profile,
      enforce,
      can: (feature: Feature) => can(plan, feature, enforce),
      /** The same question with the launch switch ignored: what the server will enforce today. */
      canStrict: (feature: Feature) => can(plan, feature, true),
      limit: (key: Limit) => limit(plan, key, enforce),
      /** Decks a free player can read but not edit or play, once the vault is over its cap. */
      readOnlyDeckIds,
      isReadOnly: (deckId: string) => readOnlyDeckIds.has(deckId),
      archivist: {
        enabled: config.archivistEnabled,
        used,
        allowed,
        remaining: Math.max(0, allowed - used),
      },
      notice: config.notice,
    };
  }, [plan, profile, config, decks, enforce]);
}
