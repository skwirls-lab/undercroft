/**
 * Plans and feature gates — the price list.
 *
 * Every feature that sits (or will sit) behind the Patron tier asks `can()` or `limit()`
 * here instead of assuming it is allowed, so the whole paywall is one table and one switch.
 *
 *   - A player's plan comes from their profile document (`users/{uid}.plan`, resolved by
 *     lib/plan.ts so an expired admin grant reads as free). The client never writes it: the
 *     billing webhook and the admin panel do, and firestore.rules enforces that.
 *   - `ENFORCE_ENTITLEMENTS` is the launch switch, read from the environment so flipping it is
 *     a Vercel setting plus a redeploy, not a code change. While it is off every gate answers
 *     yes and every limit is unbounded, whatever the plan says.
 *   - The Archivist's monthly allowance is the one limit that is NOT unbounded when the switch
 *     is off: the server meters it regardless, because it costs real money. Its numbers live
 *     in the app config (admin-editable), not here.
 *
 * Keep gating decisions out of the game itself: the Forge session does not know or care what
 * plan a player is on, and a free player's game never behaves differently mid-match.
 */

import type { Plan } from '@/lib/plan';
export { parsePlan, type Plan } from '@/lib/plan';

/** Launch switch. Off means everything is unlocked for everyone. */
export const ENFORCE_ENTITLEMENTS: boolean = process.env.NEXT_PUBLIC_ENFORCE_ENTITLEMENTS === '1';

export type Feature =
  | 'vault.shelves'      // organise decks into shelves
  | 'opponents.choose'   // pick what each AI seat plays (house deck or vault deck)
  | 'game.fourPlayer'    // three AI opponents (a full pod)
  | 'archivist.deck'     // deck advice, swaps, strategy, rules questions
  | 'archivist.match'    // the in-match assistant
  | 'archivist.recap'    // post-game recap
  | 'archivist.ideas';   // commander ideas in New Deck

export type Limit =
  | 'vault.maxDecks'     // how many decks the vault holds (playable + editable)
  | 'game.maxAI';        // AI opponents per game

interface FeatureRule {
  /** Plans that include the feature. */
  plans: readonly Plan[];
  /** Short label for the upsell UI. */
  label: string;
}

/** The price list. One row per feature; the launch switch decides whether it applies. */
export const FEATURES: Record<Feature, FeatureRule> = {
  'vault.shelves':    { plans: ['patron'],         label: 'Shelves' },
  'opponents.choose': { plans: ['patron'],         label: 'Choose opponent decks' },
  'game.fourPlayer':  { plans: ['patron'],         label: 'Four-player pods' },
  'archivist.deck':   { plans: ['free', 'patron'], label: 'Deck advice from the Archivist' },
  'archivist.match':  { plans: ['patron'],         label: 'The Archivist at the table' },
  'archivist.recap':  { plans: ['patron'],         label: 'Post-game recap' },
  'archivist.ideas':  { plans: ['patron'],         label: 'Commander ideas' },
};

export const LIMITS: Record<Limit, Record<Plan, number>> = {
  'vault.maxDecks': { free: 2, patron: Infinity },
  'game.maxAI':     { free: 2, patron: 3 },
};

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  patron: 'Patron',
};

export const PATRON_PRICE_LABEL = '$4.99 / month';

/** Is `feature` available on `plan`? Always yes until enforcement is switched on. */
export function can(plan: Plan, feature: Feature, enforce: boolean = ENFORCE_ENTITLEMENTS): boolean {
  if (!enforce) return true;
  return FEATURES[feature].plans.includes(plan);
}

/** Numeric ceiling for `limit` on `plan`. Unbounded until enforcement is switched on. */
export function limit(plan: Plan, key: Limit, enforce: boolean = ENFORCE_ENTITLEMENTS): number {
  if (!enforce) return key === 'game.maxAI' ? 3 : Infinity;
  return LIMITS[key][plan];
}

/** Features that are Patron-only, for the upsell sheet. */
export function patronOnlyFeatures(): Feature[] {
  return (Object.keys(FEATURES) as Feature[]).filter((f) => !FEATURES[f].plans.includes('free'));
}
