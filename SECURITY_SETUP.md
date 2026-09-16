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
| `/cards/{cardId}` | any signed-in user | admins only (`isAdmin()`, empty by default) |
| `/users/{userId}` | that user only | that user only |
| `/users/{userId}/decks/{deckId}` | that user only | that user only |
| anything else | denied | denied |

Two changes from the previous version:

- `/cards` write was `allow write: if true` — **anyone on the internet could rewrite or
  delete all ~90k card documents**, and could run up your Firestore bill doing it. It is now
  gated behind an explicit UID allowlist that starts out empty.
- `/cards` read was `if true`. Reads are billed per document, so a world-readable 90k-document
  collection is a standing bill-drain vector. It now requires sign-in. Nothing in the app
  reads cards before sign-in, so this costs no functionality.

Per-user isolation (`/users/**`) was already correct and is unchanged.

## 2. Repopulating the card database

The card collection is already populated, so the normal state is "no admins configured" and
`/admin/*` refuses everyone. When you genuinely need to repopulate:

1. Find your Firebase UID: `Firebase Console → Authentication → Users`.
2. Add it to `isAdmin()` in `firestore.rules` and run `firebase-tools deploy --only
   firestore:rules`.
3. Set `NEXT_PUBLIC_ADMIN_UIDS` to the same UID in the Vercel project settings and redeploy.
4. Run the populate page.
5. **Remove the UID from both places and redeploy.**

The old `GET /api/admin/populate-cards` route has been deleted. It was an unauthenticated
endpoint that streamed ~90k Firestore writes to anyone who loaded the URL — including via an
`<img>` tag on an unrelated page. Nothing referenced it; the admin page uses
`/api/admin/stream-scryfall` (read-only, now same-origin) plus the signed-in browser session
for the writes, which is the path that the rules can actually police.

## 3. Sign-in and account separation

Sign-in is Google OAuth via Firebase Auth. To let your play group in, add your production
domain under `Firebase Console → Authentication → Settings → Authorized domains`. Without it
the popup fails with `auth/unauthorized-domain` on the deployed site while working fine on
localhost.

Client-side account separation was hardened alongside this:

- Deck state is cleared on sign-out *and* on a direct account switch. `signInWithPopup` on an
  already-signed-in session goes from user A to user B with no `null` in between, so clearing
  only on sign-out left A's decks in memory under B's session — and any edit would have
  written them into B's Firestore path.
- A slow load for user A can no longer land after user B has signed in; the resolution is
  discarded if the current UID has moved on.
- A failed load clears the deck list instead of leaving the previous account's decks on
  screen, and the decks page now says the load failed rather than showing "Synced to cloud".
- The AI provider config (which holds an LLM API key) is cleared from persisted settings on
  sign-out, so it is not handed to the next person to use the browser.

## Still open

`POST /api/ai` takes an arbitrary `baseUrl` and fetches it server-side with no auth and no
rate limit — a server-side request forgery vector and an open proxy. It is unrelated to
account separation, so it was left for a separate change.

The Forge game server has no authentication, no origin check and no rate limiting, and each
`start_game` spawns an OS thread on a 512 MB heap. Fine for a private play group, not fine
for a public URL.
