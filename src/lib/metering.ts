/**
 * The arithmetic of the Archivist's monthly allowance, kept free of server imports so both
 * the route handlers and the tests can use it. The Firestore transactions that apply it live
 * in lib/server/metering.ts.
 */
import type { Plan } from '@/lib/plan';
import type { AppConfig } from '@/lib/appConfig';

export type ArchivistTask =
  | 'deck.improve' | 'deck.swaps' | 'deck.strategy' | 'commander.ideas'
  | 'match.advice' | 'rules.question' | 'game.recap';

export interface Allowance {
  plan: Plan;
  used: number;
  allowed: number;
}

export class QuotaError extends Error {
  status = 429;
  constructor(public allowance: Allowance) {
    super(`The Archivist has answered ${allowance.used} of ${allowance.allowed} questions this month.`);
  }
}

/** Does one more call fit? */
export function fits(used: number, allowed: number): boolean {
  return used < allowed;
}

/** The allowance a plan gets from the config. */
export function allowanceFor(plan: Plan, config: AppConfig): number {
  return plan === 'patron' ? config.allowance.patron : config.allowance.free;
}
