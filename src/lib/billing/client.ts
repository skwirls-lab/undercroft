'use client';

import { getFirebaseAuth } from '@/lib/firebase/config';
import { isDevMock } from '@/lib/devMock';

/** Talking to /api/billing from the browser: a redirect URL, or a typed reason it failed. */
export class BillingError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

async function post(path: string): Promise<string> {
  if (isDevMock()) throw new BillingError('disabled', 'Stripe is not connected in the dev harness.');
  const token = await getFirebaseAuth()?.currentUser?.getIdToken();
  if (!token) throw new BillingError('unauthenticated', 'Sign in first.');
  let res: Response;
  try {
    res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new BillingError('network', 'Could not reach the billing service.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new BillingError(data?.error?.code ?? 'server', data?.error?.message ?? 'Billing is unavailable right now.');
  if (typeof data?.url !== 'string') throw new BillingError('server', 'No link came back.');
  return data.url;
}

/** Start a Patron subscription: resolves to the Checkout URL to navigate to. */
export function startCheckout(): Promise<string> { return post('/api/billing/checkout'); }

/** Manage or cancel: resolves to the Customer Portal URL. */
export function openPortal(): Promise<string> { return post('/api/billing/portal'); }
