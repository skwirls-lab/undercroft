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
| `/users/{userId}` | that user only | that user only |
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

Per-user isolation (`/users/**`) was already correct and is unchanged.

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

To keep using those pages, add yourself as an admin **once, permanently**:

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
art, and then fails to be playable, because the Forge engine has no script for it. Updating
Forge's data means pulling newer `forge-res` from upstream Forge and redeploying Railway —
worth doing in the same sitting as a Scryfall refresh.

### On automating it

Worth being straight about the trade: a scheduled refresh needs a Vercel Cron hitting a route
that authenticates as a service account (`firebase-admin` plus a private key in the
environment) — precisely the kind of unattended, credentialed, 90k-write endpoint that the
deleted route was a broken version of. Given that sets release roughly six times a year and
the Forge half has to be done by hand anyway, clicking the page when a set drops is the better
deal. Revisit it if the manual step ever becomes the thing standing between you and playing.

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
- The AI provider config (which holds an LLM API key) is cleared from persisted settings on
  sign-out, so it is not handed to the next person to use the browser.

## Still open

`POST /api/ai` is dead code. It routed an LLM call (Groq/OpenAI/Anthropic/custom) for the old
in-browser JavaScript game engine, so an LLM could pick the AI opponent's plays. That engine
was replaced by Forge, whose AI is Java code running on Railway and involves no LLM at all.
Its only caller is `src/ai/AIPlayerController.ts`, reachable only from `gameStore.initGame` and
`gameStore.processAITurn`, and neither of those is called from anywhere in the app.

It still deploys as a live endpoint, and with a `custom` provider it fetches an arbitrary
`baseUrl` server-side with no auth and no rate limit — a server-side request forgery vector and
an open proxy wearing your deployment's IP. The fix is to delete it along with the rest of the
orphaned engine (`src/ai/*`, the unused half of `gameStore`), not to harden it.

The Forge game server has no authentication, no origin check and no rate limiting, and each
`start_game` spawns an OS thread on a 512 MB heap. Fine for a private play group, not fine
for a public URL.
