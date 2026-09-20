import 'server-only';
import Stripe from 'stripe';

/** One Stripe client per lambda instance, built from STRIPE_SECRET_KEY on first use. */
let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key, { typescript: true });
  return client;
}

export function stripePriceId(): string | null {
  return process.env.STRIPE_PRICE_ID || null;
}

export function siteUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (origin) { try { return new URL(origin).origin; } catch { /* fall through */ } }
  return 'https://undercroft.app';
}
