/**
 * What a player's plan is, given what their profile document says. Shared by the client
 * (useEntitlements) and the server (route handlers), so both always agree.
 *
 * A profile carries:
 *   plan          'free' | 'patron'
 *   planSource    'stripe' | 'admin'   who set it; the billing webhook never touches an admin grant
 *   patronUntil   optional ms timestamp; an admin grant can expire, a Stripe one is managed by Stripe
 *   usage         { [YYYY-MM]: { archivist: n, tokensIn: n, tokensOut: n } }  written by the server
 */

export type Plan = 'free' | 'patron';
export type PlanSource = 'stripe' | 'admin';

export interface MonthUsage {
  archivist: number;
  tokensIn: number;
  tokensOut: number;
}

export interface PlanProfile {
  plan: Plan;
  planSource: PlanSource | null;
  /** ms since epoch, or null for "until cancelled". */
  patronUntil: number | null;
  planNote: string | null;
  usage: Record<string, MonthUsage>;
  subscriptionStatus: string | null;
}

export const EMPTY_PLAN_PROFILE: PlanProfile = {
  plan: 'free',
  planSource: null,
  patronUntil: null,
  planNote: null,
  usage: {},
  subscriptionStatus: null,
};

/** Coerce whatever the profile document holds into a plan, defaulting to free. */
export function parsePlan(value: unknown): Plan {
  return value === 'patron' ? 'patron' : 'free';
}

/** Read the plan fields out of a raw profile document, tolerating anything missing. */
export function parsePlanProfile(data: Record<string, unknown> | null | undefined): PlanProfile {
  if (!data) return EMPTY_PLAN_PROFILE;
  const usage: Record<string, MonthUsage> = {};
  const rawUsage = data.usage;
  if (rawUsage && typeof rawUsage === 'object') {
    for (const [month, v] of Object.entries(rawUsage as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const u = v as Record<string, unknown>;
      usage[month] = {
        archivist: num(u.archivist),
        tokensIn: num(u.tokensIn),
        tokensOut: num(u.tokensOut),
      };
    }
  }
  return {
    plan: parsePlan(data.plan),
    planSource: data.planSource === 'stripe' || data.planSource === 'admin' ? data.planSource : null,
    patronUntil: typeof data.patronUntil === 'number' ? data.patronUntil : null,
    planNote: typeof data.planNote === 'string' ? data.planNote : null,
    usage,
    subscriptionStatus: typeof data.subscriptionStatus === 'string' ? data.subscriptionStatus : null,
  };
}

/**
 * The plan that applies right now. Patron only while the document says so and any expiry
 * is still in the future; everything else is free.
 */
export function resolvePlan(profile: Pick<PlanProfile, 'plan' | 'patronUntil'>, now = Date.now()): Plan {
  if (profile.plan !== 'patron') return 'free';
  if (profile.patronUntil != null && profile.patronUntil <= now) return 'free';
  return 'patron';
}

/** "2026-09" — the key usage is counted under. UTC, so the reset is the same for everyone. */
export function monthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function usageThisMonth(profile: PlanProfile, now = new Date()): MonthUsage {
  return profile.usage[monthKey(now)] ?? { archivist: 0, tokensIn: 0, tokensOut: 0 };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
