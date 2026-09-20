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

## 3. Sign-in and account separation

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

## Still open

`POST /api/ai` — the unauthenticated open proxy — has been deleted, along with the orphaned
engine behind it (`src/ai/*`, the write-only Dexie card cache, `gameStore.initGame` and
`processAITurn`).

The Forge game server has no authentication, no origin check and no rate limiting, and each
`start_game` spawns an OS thread on a 512 MB heap. Fine for a private play group, not fine
for a public URL.
