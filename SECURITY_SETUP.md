# Security setup

Everything in this file is a one-time action you take in the Firebase Console or in your
Vercel project settings. The code changes that go with it are already in the repo.

## 1. Deploy the Firestore rules — do this first

Until now `firestore.rules` has only ever existed as a file in this repository. There was no
`firebase.json`, so nothing ever deployed it. **Whatever rules are live in your project today
are whatever you last clicked into the Firebase Console**, which may not match this file.

Check the live rules at
`Firebase Console → Firestore Database → Rules` and compare them with `firestore.rules`.

Then deploy from the repo so the two can never drift again:

```bash
npx firebase-tools login
npx firebase-tools use --add          # pick your project, name the alias "default"
npx firebase-tools deploy --only firestore:rules
```

`firebase.json` deliberately declares **only** `firestore.rules`. It does not declare an
indexes file, because deploying an empty index list would delete any composite indexes you
created in the console.

### What the rules now say

| Path | Read | Write |
|---|---|---|
| `/cards/{cardId}` | any signed-in user | admins only (`isAdmin()` — add your UID) |
| `/users/{userId}` | that user only | that user only, except the `plan` field (billing webhook only) |
| `/users/{userId}/decks/{deckId}` | that user only | that user only |
| `/users/{userId}/matches/{matchId}` | that user only | that user only |
| anything else | denied | denied |

Two changes from the previous version:

- `/cards` write was `allow write: if true` — **anyone on the internet could rewrite or
  delete all ~90k card documents**, and could run up your Firestore bill doing it. It is now
  gated behind an explicit UID allowlist. Add your own UID to it (see section 2) so you keep
  access to the admin pages.
- `/cards` read was `if true`. Reads are billed per document, so a world-readable 90k-document
  collection is a standing bill-drain vector. It now requires sign-in. Nothing in the app
  reads cards before sign-in, so this costs no functionality.

Per-user isolation (`/users/**`) was already correct. One addition since: the profile
document now also holds the vault's shelves, and is where a subscription `plan` will live.
The rule refuses any client write that creates or changes `plan`, so when paid tiers go live
nobody can promote themselves from the browser console. Nothing enforces plans yet
(`ENFORCE_ENTITLEMENTS` in `src/lib/entitlements.ts` is `false`), so pasting this rule update
is not urgent — but it must be in place before that switch is flipped.

## 2. Updating the card database for a new set

The admin **pages** are untouched and still work:

| Page | What it does |
|---|---|
| `/admin/populate-cards` | Full rebuild from Scryfall's bulk export (~90k cards, 20-30 min) |
| `/admin/import-missing-cards` | Paste a list of card names, pull just those |
| `/admin/card-stats` | Count the collection, spot-check a card |

They write to Firestore from your signed-in browser session, which is the path the security
rules can actually police. What was deleted is the separate `GET /api/admin/populate-cards`
**API route** — a duplicate implementation that nothing linked to, that did the same ~90k
writes with no sign-in at all, and that any page on the internet could trigger with an
`<img src="https://yoursite/api/admin/populate-cards">`. Deleting it does not change what the
admin pages do.

The scheduled sync below now does the routine refresh, so these pages are the manual
fallback — for pulling one missing card, checking a count, or forcing a rebuild. To use them,
add yourself as an admin **once, permanently**:

1. Get your Firebase UID: `Firebase Console → Authentication → Users`.
2. Put it in `isAdmin()` in `firestore.rules` and deploy the rules.
3. Set `NEXT_PUBLIC_ADMIN_UIDS` to the same UID in the Vercel project settings, and redeploy.

Leave both in place. The point of the allowlist is that *only you* can write to `/cards`, not
that nobody can.

### Scryfall's bulk listing changed in September 2026

The listing now offers `jsonl_download_uri` (gzip-compressed JSON Lines) instead of
`download_uri`. Both the scheduled sync and the admin page's stream accept either link and
inflate the file when it is gzip. A run that reports "No download_uri or jsonl_download_uri"
means Scryfall changed the shape again; the message lists the keys it sent.

### Which printing the app shows

The sync keeps paper printings only and marks, per card, the oldest ordinary one as
`preferred`; the app shows that art everywhere. After deploying a sync change, run the
**Sync cards** workflow once by hand (Actions → Sync cards → Run workflow) rather than waiting
for Tuesday, so the flags land. Digital-only printings already stored are left in place
(the sync never deletes) but are never chosen once a preferred printing exists.

### A Firestore update alone does not make a new set playable

Two separate card databases back this app, and a new set needs both:

- **Firestore `/cards`** — Scryfall data. Drives deck import, name resolution and card images.
  This is what the admin pages update.
- **`forge-res/cardsfolder/` and `forge-res/editions/` in the server repo** — Forge's own card
  scripts. This is what makes a card actually *do* anything during a game.

Import a brand-new set's card into a deck with only Firestore updated and it resolves, shows
art, and then fails to be playable, because the Forge engine has no script for it. Both are
now on schedules of their own — see below.

### Both halves are automated now

Two scheduled GitHub Actions, and neither one needs you to remember anything.

**Scryfall -> Firestore** (`.github/workflows/sync-cards.yml`, Tuesdays). Runs
`scripts/sync-cards.mjs` as a Firebase service account. It fingerprints each card and writes
only what changed, so a run after a set release costs a few thousand writes rather than
ninety thousand. It is a scheduled job rather than a web endpoint on purpose — that is the
whole difference from the `/api/admin/populate-cards` route that was deleted. There is no
public surface to trigger.

One-time setup:

1. `Firebase Console -> Project settings -> Service accounts -> Generate new private key`.
2. Paste the entire JSON file into a GitHub repository secret named
   `FIREBASE_SERVICE_ACCOUNT`.

A service account bypasses security rules, so this keeps working with `/cards` write locked
to the admin allowlist. Run it by hand any time from the Actions tab; tick "dry run" to see
what would change without writing.

**Forge engine + card scripts** (`upgrade-forge.yml` in the server repo, Mondays). Covered
below, because it is not the job it looks like.

### Why the Forge job upgrades the engine, not just the scripts

Card scripts are plain text files, so refreshing only `forge-res` looks like the cheap
option. It does not work. Measured on 2026-09-16: upstream's current card scripts against
the pinned 2.0.12 engine fail with

    IllegalArgumentException: No enum constant forge.card.CardSplitType.Prepare

and load **0 of 94,606 cards**. Forge aborts the entire card database rather than skipping a
script that names a mechanic the engine build has no enum for — and the server still starts
and reports itself ready. A card-data-only cron would have taken the game server down
silently.

So the job moves the engine and the card data together, and it never pushes to `main`. It
opens a pull request, and the PR only exists if three gates passed: the upstream engine
built, the bridge still compiled against Forge's API, and the card database loaded with at
least 30,000 cards. Railway deploys when you merge, so a bad upstream release is a PR that
never appears, not an outage.

Your pinned version is in `FORGE_VERSION` (currently `forge-2.0.12`; upstream is at
`forge-2.0.14`), so the first run will propose an upgrade.

## 3. The server side: FIREBASE_SERVICE_ACCOUNT on Vercel

Route handlers (`/api/me`, `/api/archivist`, `/api/billing/*`) run on Vercel with the
Firebase Admin SDK. They need the same service-account JSON the card-sync Action uses:

1. Vercel → Project → Settings → Environment Variables.
2. Add `FIREBASE_SERVICE_ACCOUNT` with the whole JSON file as the value (Production and
   Preview). Redeploy.
3. Open `https://<your domain>/api/health` in a browser. It says whether the Admin SDK
   started, which project the service account is for, and whether the Archivist and Stripe
   variables are set — booleans and ids only, never a secret. Every `problems` entry names
   the fix. Two things it catches that otherwise look like a player's sign-in failing
   (a 401 from every API call):
   - the JSON did not survive the paste (the private key's `\n` newlines doubled up, or a
     line was lost): the value is read tolerantly, and base64 of the file works too;
   - the service account belongs to a different Firebase project than the app signs users
     into: the two project ids on the page must match.
   A real sign-in problem is reported as a 401 with a reason in the Vercel function logs
   (`[auth] verifyIdToken failed (auth/...)`); a setup problem is a 500 with `server-config`.

Admin writes (plan grants, usage counters, monthly stats) go through this SDK and bypass
the security rules; that is why the client never has to be allowed to write them.

## 4. The rules, again: config, stats, admin grants

`firestore.rules` gained four things. Paste the file again (section 1) — with your UID in
the allowlist — before using the Administration section of Settings:

| Path | Read | Write |
|---|---|---|
| `/config/{id}` | any signed-in user | admins only |
| `/stats/{id}`, `/archivistLog/{id}` | admins only | nobody from a browser (server only) |
| `/users/{uid}` | owner, or any admin | owner, except the protected fields; admin may change exactly `plan, planSource, patronUntil, planNote` |
| `/users` (listing) | admins only (email lookup) | — |

Protected profile fields a player can never write: `plan, planSource, patronUntil,
planNote, usage, stripeCustomerId, stripeSubscriptionId, subscriptionStatus`.

`npm run test:rules` exercises all of this against the Firestore emulator; CI runs it on
every pull request.

## 5. Administration (Settings → Administration)

Visible only to UIDs in `NEXT_PUBLIC_ADMIN_UIDS`, and only effective for UIDs in the rules
allowlist. From there you can switch the Archivist off app-wide, change its model id and the
monthly allowances, post a notice banner, grant or revoke Patron by email (with an optional
expiry — a grant made here is never undone by billing), and see this month's usage with an
estimated cost once you enter the model's per-token rates.

## 6. The Archivist: OPENROUTER_API_KEY on Vercel

The Archivist calls OpenRouter from `/api/archivist`, never from the browser.

1. Create a key at openrouter.ai → Keys. Set a monthly credit limit on it there; the app's
   own allowances (Settings → Administration) cap requests per player, the key's limit caps
   the bill.
2. Vercel → Environment Variables → `OPENROUTER_API_KEY` (Production and Preview). Redeploy.
3. Optional: `NEXT_PUBLIC_SITE_URL` (sent as the referer OpenRouter shows in its dashboard).
4. Confirm the model id. The default, `deepseek/deepseek-v4-flash-0731`, is what the
   Administration section shows in **Model**; check it against openrouter.ai/models and
   change it there if the slug differs — no deploy needed.
5. First real call: open a deck, **Ask the Archivist → Improve this deck**. Then in
   Firestore look at `archivistLog` (one row per call: uid, task, model, tokens, ms) and
   `stats/{YYYY-MM}`. Settings → Administration → Usage shows the same numbers with a cost
   estimate once the per-token rates are entered.

Without the key the route answers 503 "not configured" and every entry point shows the
resting notice. `ARCHIVIST_STUB=1` (a Preview deployment, or `next dev`) answers from a
canned script with auth and metering still applied, for testing the path without spending.

The plan gate is enforced on the server whether or not `NEXT_PUBLIC_ENFORCE_ENTITLEMENTS`
is set: in-match advice, the post-game recap and commander ideas are Patron features; deck
advice and rules questions are on every plan within the allowance.

## 7. Billing: Stripe on Vercel

The Patron tier is a Stripe subscription. Nothing about cards touches Undercroft; the app
only learns "this uid is a Patron" from Stripe's webhook.

1. **Product and price.** Stripe Dashboard → Products → add "Undercroft Patron", recurring,
   $4.99 / month. Copy the price id (`price_...`).
2. **Webhook endpoint.** Developers → Webhooks → add `https://<your domain>/api/billing/webhook`
   with the events `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
   Copy the signing secret (`whsec_...`).
3. **Customer Portal.** Settings → Billing → Customer portal: enable cancellation and
   payment-method updates (that is all the app links to).
4. **Vercel environment variables** (Production; use test-mode keys on Preview):
   `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, and
   `NEXT_PUBLIC_SITE_URL` (where Stripe sends players back, e.g. `https://undercroft.app`).
   Redeploy.
5. **Rules.** Paste `firestore.rules` again (section 1): it adds `stripeEvents/{id}`, the
   webhook's idempotency ledger, and `npm run test:rules` covers it.
6. **Try it in test mode** with card `4242 4242 4242 4242`: Settings → the plan row →
   Become a Patron. After Checkout the player lands on `/?patron=welcome`, the webhook sets
   `plan: 'patron', planSource: 'stripe'` on their profile, and the Patron plaque appears on
   the dashboard. Cancel from the portal: the profile shows `subscriptionStatus: 'canceling'`
   and `patronUntil` until the period ends, then the deletion event makes it free.
7. **Switch the paywall on** when you are ready to advertise: `NEXT_PUBLIC_ENFORCE_ENTITLEMENTS=1`
   on Vercel and redeploy. Until then the vault gate answers yes for everyone; the
   Archivist's plan gate and allowance are enforced regardless. Play (every pod size,
   choosing opponents, shelves) is free on both plans by design.

What the webhook will never do: revoke or overwrite a plan whose `planSource` is `admin`.
Grants from the Administration section stay until you revoke them there.

## 8. Sign-in and account separation

Sign-in is Google OAuth via Firebase Auth. If sign-in already works on your deployed site,
your production domain is already authorized and there is nothing to do here — none of these
changes affect it. The one case worth knowing about: Vercel preview deployments get a fresh
URL per push, and those hostnames are not authorized, so sign-in fails on a preview link while
working on production. Add them under
`Firebase Console → Authentication → Settings → Authorized domains` only if you want your play
group testing against preview URLs.

Client-side account separation was hardened alongside this:

- Deck state is cleared on sign-out *and* on a direct account switch. `signInWithPopup` on an
  already-signed-in session goes from user A to user B with no `null` in between, so clearing
  only on sign-out left A's decks in memory under B's session — and any edit would have
  written them into B's Firestore path.
- A slow load for user A can no longer land after user B has signed in; the resolution is
  discarded if the current UID has moved on.
- A failed load clears the deck list instead of leaving the previous account's decks on
  screen, and the decks page now says the load failed rather than showing "Synced to cloud".
- Per-person preferences are reset on sign-out and on an account switch. (This originally
  existed to clear a stored LLM API key; that setting is gone with the engine it configured,
  but resetting on a shared browser is still the right behaviour.)

## 9. Launch checklist

Everything the app needs before it is advertised, in order. Each item names where it is
explained above.

0. **`/api/health` reads ok** on the deployed site (§3). Do this first after every change to
   the environment variables; it names anything missing.
1. **Firestore rules** pasted with your UID in the allowlist (§1, §4). `npm run test:rules`
   is green in CI; the deployed copy must match the file in this repo.
2. **Vercel environment variables**, Production and Preview:
   - `FIREBASE_SERVICE_ACCOUNT` (§3)
   - `OPENROUTER_API_KEY`, optionally `NEXT_PUBLIC_SITE_URL` (§6)
   - `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (§7)
   - `NEXT_PUBLIC_ADMIN_UIDS` with your UID (§5)
   - `NEXT_PUBLIC_ENFORCE_ENTITLEMENTS=1` — the paywall switch, last (§7 step 7)
3. **Stripe**: the product and price, the webhook endpoint with its five events, the
   Customer Portal enabled; one test-mode subscription and cancellation walked through (§7).
4. **The Archivist**: Settings → Administration → Model shows the OpenRouter slug you have
   confirmed on openrouter.ai/models; allowances set; one real call made and its row seen in
   `archivistLog` (§6). Set a credit limit on the key.
5. **Your own account**: grant yourself Patron from the Administration section so the switch
   never locks the keeper out (§5).
6. **A fresh account**: sign in with a second Google account and walk the free tier: two
   decks, the third refused with the Patron sheet, a full four-player pod with chosen
   opponents (free), ten Archivist requests, the tours and the Apprentice. Then Become a
   Patron in test mode and see the vault lock open.
7. **The game server** (still open, below): before a public URL, put the Forge server behind
   authentication or an origin check and cap concurrent games.

## Still open

`POST /api/ai` — the unauthenticated open proxy — has been deleted, along with the orphaned
engine behind it (`src/ai/*`, the write-only Dexie card cache, `gameStore.initGame` and
`processAITurn`).

The Forge game server has no authentication, no origin check and no rate limiting, and each
`start_game` spawns an OS thread on a 512 MB heap. Fine for a private play group, not fine
for a public URL.
