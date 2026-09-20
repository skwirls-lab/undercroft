/**
 * Plans and feature gates.
 *
 * Nothing is paywalled yet, and no payment provider is wired up. What exists is the seam:
 * every feature that might one day sit behind a subscription asks `can()` or `limit()`
 * here instead of assuming it is allowed, so turning enforcement on later is a change to
 * this file and a Stripe webhook, not a hunt through every screen.
 *
 * How it is meant to grow:
 *   - A user's plan lives on their Firestore profile (`users/{uid}.plan`). Today nothing
 *     writes it, so everyone reads as `free`. When billing exists, a server-side webhook
 *     (never the client — Firestore rules must forbid the client writing `plan`) sets it to
 *     `patron` on payment and back to `free` on cancellation.
 *   - `ENFORCE_ENTITLEMENTS` is the launch switch. While it is false every gate answers yes
 *     and every limit is unbounded, whatever the plan says. Flip it when there is something
 *     to buy.
 *   - `FEATURES` is the single price list. To move a feature between tiers, edit one row.
 *
 * Keep gating decisions out of the game itself: the Forge session does not know or care what
 * plan a player is on, and a free player's game should never behave differently mid-match.
 */

export type Plan = 'free' | 'patron';

/** Launch switch. False means everything is unlocked for everyone. */
export const ENFORCE_ENTITLEMENTS = false;

export type Feature =
  | 'deck.edit'          // change cards, commander and name after import
  | 'vault.shelves'      // organise decks into shelves
  | 'ai.customDecks'     // hand a vault deck to an AI seat
  | 'game.fourPlayer';   // three AI opponents (a full pod)

export type Limit =
  | 'vault.maxDecks'     // how many decks the vault holds
  | 'vault.maxShelves';

interface FeatureRule {
  /** Plans that include the feature. */
  plans: readonly Plan[];
  /** Short label for the upsell UI. */
  label: string;
}

/** The price list. One row per feature; the launch switch decides whether it applies. */
export const FEATURES: Record<Feature, FeatureRule> = {
  'deck.edit':       { plans: ['patron'],         label: 'Deck editing' },
  'vault.shelves':   { plans: ['patron'],         label: 'Shelves' },
  'ai.customDecks':  { plans: ['patron'],         label: 'Custom opponent decks' },
  'game.fourPlayer': { plans: ['free', 'patron'], label: 'Four-player pods' },
};

export const LIMITS: Record<Limit, Record<Plan, number>> = {
  'vault.maxDecks':   { free: 3, patron: Infinity },
  'vault.maxShelves': { free: 0, patron: Infinity },
};

export const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  patron: 'Patron',
};

/** Is `feature` available on `plan`? Always yes until enforcement is switched on. */
export function can(plan: Plan, feature: Feature): boolean {
  if (!ENFORCE_ENTITLEMENTS) return true;
  return FEATURES[feature].plans.includes(plan);
}

/** Numeric ceiling for `limit` on `plan`. Unbounded until enforcement is switched on. */
export function limit(plan: Plan, key: Limit): number {
  if (!ENFORCE_ENTITLEMENTS) return Infinity;
  return LIMITS[key][plan];
}

/** Coerce whatever the profile document holds into a plan, defaulting to free. */
export function parsePlan(value: unknown): Plan {
  return value === 'patron' ? 'patron' : 'free';
}
