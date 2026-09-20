'use client';

import { useEntitlements } from '@/hooks/useEntitlements';
import type { Feature } from '@/lib/entitlements';
import type { ArchivistError } from '@/lib/archivist/client';

export type AccessState = 'ok' | 'resting' | 'patron' | 'quota';

export interface ArchivistAccess {
  state: AccessState;
  /** What to show instead of the controls when the state is not ok. */
  message: string;
  used: number;
  allowed: number;
  remaining: number;
}

/**
 * Whether an entry point should offer to ask, and what to say if not. The server decides
 * for real; this only saves a round trip and gives the same words before and after one.
 * The Archivist's plan gate ignores the launch switch, as the server's does.
 */
export function useArchivistAccess(feature: Feature): ArchivistAccess {
  const { archivist, canStrict: can, notice } = useEntitlements();
  const base = { used: archivist.used, allowed: archivist.allowed, remaining: archivist.remaining };
  if (!archivist.enabled) return { state: 'resting', message: notice || RESTING, ...base };
  if (!can(feature)) return { state: 'patron', message: 'That is a Patron feature.', ...base };
  if (archivist.remaining <= 0) return { state: 'quota', message: quotaMessage(archivist.allowed), ...base };
  return { state: 'ok', message: '', ...base };
}

export const RESTING = 'The Archivist is resting. Try again later.';

export function quotaMessage(allowed: number): string {
  return `You have used all ${allowed} of this month's requests. The allowance resets on the 1st.`;
}

/** The state an error from the server maps to, so the notice reads the same either way. */
export function stateFromError(err: ArchivistError): AccessState | 'error' {
  switch (err.code) {
    case 'disabled': return 'resting';
    case 'patron': return 'patron';
    case 'quota': return 'quota';
    default: return 'error';
  }
}
