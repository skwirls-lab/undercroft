'use client';

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Crown, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Keystone } from '@/components/brand/Keystone';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useDeckStore } from '@/store/deckStore';
import { useAuth } from '@/lib/firebase/auth';
import { startCheckout, openPortal, BillingError } from '@/lib/billing/client';
import { FEATURES, LIMITS, PATRON_PRICE_LABEL, patronOnlyFeatures, type Feature } from '@/lib/entitlements';
import { isDevMock } from '@/lib/devMock';

/**
 * The Patron sheet: what the tier unlocks, the price, and the one button. For a Patron it is
 * the subscription's state and the way to manage it. Any locked control opens it with a
 * reason, so a tap on a lock is never a dead end.
 */

interface PatronContextValue {
  openPatron: (reason?: Feature | string | null) => void;
  closePatron: () => void;
}

const PatronContext = createContext<PatronContextValue>({ openPatron: () => {}, closePatron: () => {} });
export const usePatron = () => useContext(PatronContext);

export function PatronProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const value = useMemo<PatronContextValue>(() => ({
    openPatron: (r) => { setReason(r ?? null); setOpen(true); },
    closePatron: () => setOpen(false),
  }), []);
  return (
    <PatronContext.Provider value={value}>
      {children}
      <PatronSheet open={open} onOpenChange={setOpen} reason={reason} />
      {/* useSearchParams needs its own boundary so static pages keep their HTML. */}
      <Suspense fallback={null}><PatronReturn onOpen={() => value.openPatron(null)} /></Suspense>
    </PatronContext.Provider>
  );
}

/** Handles `?patron=welcome|cancel` after Stripe sends the player back; `?patron=open` in the harness. */
function PatronReturn({ onOpen }: { onOpen: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const v = params.get('patron');
  useEffect(() => {
    if (!v) return;
    if (v === 'welcome') {
      toast.success('Welcome, Patron. The vault is yours.');
      if (user?.uid) void useDeckStore.getState().loadFromFirestore(user.uid);
    } else if (v === 'cancel') {
      toast('No charge was made.');
    } else if (v === 'open' && isDevMock()) {
      onOpen();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('patron');
    router.replace(url.pathname + (url.search || ''));
  }, [v, user?.uid, router, onOpen]);
  return null;
}

const REASON_TEXT: Record<string, string> = {
  'vault.maxDecks': 'The free vault holds two decks. Patrons keep as many as they like.',
  'vault.shelves': 'Shelves are a Patron feature.',
  'opponents.choose': 'Choosing what each opponent plays is a Patron feature.',
  'game.fourPlayer': 'Four-player pods are a Patron feature.',
  'archivist.match': 'The Archivist at the table is a Patron feature.',
  'archivist.recap': 'The post-game recap is a Patron feature.',
  'archivist.ideas': 'Commander ideas are a Patron feature.',
  'archivist.quota': 'Patrons get a far larger monthly allowance for the Archivist.',
  'deck.readOnly': 'This deck is beyond the free vault’s two. It stays safe and readable; editing and playing it are for Patrons.',
};

function PatronSheet({ open, onOpenChange, reason }: { open: boolean; onOpenChange: (v: boolean) => void; reason: string | null }) {
  const { plan, profile } = useEntitlements();
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);

  const go = useCallback(async (which: 'checkout' | 'portal') => {
    setBusy(which);
    try {
      const url = which === 'checkout' ? await startCheckout() : await openPortal();
      window.location.assign(url);
    } catch (err) {
      const e = err instanceof BillingError ? err : new BillingError('server', 'Billing is unavailable right now.');
      toast.error(e.message);
      setBusy(null);
    }
  }, []);

  const perks = patronOnlyFeatures().map((f) => FEATURES[f].label);
  const isPatron = plan === 'patron';
  const until = profile.patronUntil ? new Date(profile.patronUntil) : null;
  const status = profile.subscriptionStatus;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md" data-dev-patron-sheet>
        <SheetHeader className="border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <Keystone size={40} />
            <div>
              <SheetTitle className="font-display text-xl">{isPatron ? 'You are a Patron' : 'Become a Patron'}</SheetTitle>
              <SheetDescription>{isPatron ? 'Thank you for keeping the lights on down here.' : `${PATRON_PRICE_LABEL}. Cancel any time.`}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 py-5">
          {reason && !isPatron && (
            <p className="rounded-lg border border-gold/30 bg-gold/[0.06] px-4 py-3 text-sm">{REASON_TEXT[reason] ?? reason}</p>
          )}

          <ul className="flex flex-col gap-2">
            {[`Unlimited decks in the vault (free: ${LIMITS['vault.maxDecks'].free})`, ...perks, 'A larger monthly allowance for the Archivist'].map((p) => (
              <li key={p} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-gold" /> {p}
              </li>
            ))}
            <li className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold/60" /> Playing stays free for everyone: every pod size, choosing opponents, shelves, the deck builder, the Apprentice, the tutorials and your match history.
            </li>
          </ul>

          {isPatron ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-border/40 px-4 py-3 text-sm">
                {profile.planSource === 'admin' ? (
                  <p>Granted by the keeper{profile.planNote ? ` — ${profile.planNote}` : ''}{until ? `, until ${until.toLocaleDateString()}` : ''}.</p>
                ) : status === 'canceling' && until ? (
                  <p>Your subscription ends on <strong>{until.toLocaleDateString()}</strong>. You keep everything until then.</p>
                ) : status === 'past_due' ? (
                  <p className="text-amber-300">The last payment failed. Update your card to keep Patron.</p>
                ) : (
                  <p>Subscription active. Renews monthly through Stripe.</p>
                )}
              </div>
              {profile.planSource !== 'admin' && (
                <Button variant="outline" onClick={() => void go('portal')} disabled={busy !== null} className="gap-2 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold">
                  {busy === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />} Manage subscription
                </Button>
              )}
            </div>
          ) : (
            <Button onClick={() => void go('checkout')} disabled={busy !== null} className="h-11 gap-2 bg-gold text-base font-bold text-gold-foreground shadow-[0_0_24px_var(--gold-glow)] hover:bg-gold/90" data-dev-patron-checkout>
              {busy === 'checkout' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />} Become a Patron — {PATRON_PRICE_LABEL}
            </Button>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">Payments are handled by Stripe; Undercroft never sees your card. Undercroft is not affiliated with Wizards of the Coast.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
