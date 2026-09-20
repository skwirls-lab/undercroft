# Undercroft

Play Magic: The Gathering Commander against AI opponents in your browser.

The rules engine is [Forge](https://github.com/Card-Forge/forge), running headless on a
small Java server (`undercroft-forge-server`). This repository is the web client: sign in,
import a decklist, pick opponents, play.

## Quick Start

```bash
npm install
cp env.template .env.local    # fill in the Firebase web-app config
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The game server URL defaults to the
Railway deployment; override it with `NEXT_PUBLIC_FORGE_SERVER_URL` to point at a local
`undercroft-forge-server` (`ws://localhost:7000/game`).

## Working on the UI without credentials

Every signed-in screen, and the game board itself, can be rendered with no Firebase project
and no game server:

```bash
NEXT_PUBLIC_DEV_MOCK_AUTH=1 npx next dev -p 3100
```

- A fake user is signed in; three sample decks are seeded.
- `/dev/board` renders the real game screen against a seeded mid-game 4-player state.
  `?open=me` or `?open=ai-2` opens a player's board on load.
- `/?signedOut=1` shows the landing page.

This is a development-only mode: it is gated on `NODE_ENV`, which is inlined at build time,
so a production bundle cannot enable it and `/dev/board` is a 404 there.

Screenshot every screen at phone and desktop size, with an audit that fails if the game board
scrolls vertically (it is designed to fit the viewport exactly):

```bash
npm run screenshot            # writes to ./screenshots
```

## Architecture

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind v4, shadcn/ui, Framer Motion, Lucide icons |
| Auth | Firebase Authentication (Google OAuth) |
| Data | Cloud Firestore — `users/{uid}/decks` per player (shelves and plan on `users/{uid}`), a shared `cards` collection of Scryfall data |
| Rules engine | Forge, headless, on a Java WebSocket bridge (separate repo) |
| AI opponents | Forge's own AI |
| Hosting | Vercel (frontend), Railway (game server) |

The client keeps no rules logic. It renders state snapshots the server pushes and sends back
decisions the server asks for (`src/lib/forgeClient.ts` → `src/store/forgeGameStore.ts` →
`src/lib/forgeStateAdapter.ts` → the game components).

## The vault

Decks live in **the vault** (`/decks`). Each deck has its own page (`/decks/{id}`) that shows
every card as itself — scans from the shared card collection, grouped by type, with a reader
for rules text — plus colour identity, a mana curve and the deck's verification status.
Editing is a mode on that page: quantities, removals, an add-card search, renaming, choosing
the commander, or replacing the whole list as text. Every edit saves as it happens and
re-verifies the changed cards against the card database and the Forge engine, the same
pipeline import uses (`src/lib/deckCards.ts`).

**Building from nothing.** "New Deck" in the vault asks for a commander (a search limited to
cards that can lead a deck), suggests a name, and opens the deck page in edit mode. The
**Add cards** search asks Scryfall first — word matching anywhere in a name, ranked by how
often EDHREC sees the card, filtered to the commander's colour identity on the server side —
and falls back to the shared card collection when Scryfall is unreachable
(`src/lib/cardSearch.ts`). A card outside the commander's colours is shown, marked, and cannot
be added. The **deck check** (`src/lib/deckRules.ts`) reports 100 cards, one commander, the
singleton rule with its exceptions (basics, "any number", "up to seven"), colour identity,
unknown names and cards the engine lacks; it is one badge in the header and a dialog on tap.

**Shelves** are the vault's folders: one level, a name and an accent colour, filed on the
player's profile document. A deck sits on at most one shelf.

**Opponent decks.** On the game setup screen each AI seat can play a random house deck (the
default), a specific house deck, or any vault deck with a commander — including the one you
are about to play, if a mirror match is the test. `src/lib/opponentDecks.ts` resolves the
choices into `start_game` payloads; the server names each AI seat after its deck.

## Plans and paywalls

Nothing is paid yet, but the seam is in: `src/lib/entitlements.ts` is the single price list
(`FEATURES`, `LIMITS`) and `useEntitlements()` is what a screen asks before showing a gated
control. Deck editing, shelves, custom opponent decks, the deck cap and the four-player pod all
go through it. `ENFORCE_ENTITLEMENTS` is the launch switch: while it is `false` every gate
answers yes. A player's plan is read from `users/{uid}.plan`, which the Firestore rules forbid
the client from writing — only a billing webhook with admin credentials may set it.

## Project Structure

```
src/
├── app/               # Routes: landing/dashboard, decks, game setup, game board, admin, dev
├── components/
│   ├── brand/         # Keystone, Arch, Alcove — the Undercroft visual identity
│   ├── decks/         # Deck page, builder search, deck check, card tiles, reader, shelves
│   ├── game/          # Board, seats, cards, hand, prompts
│   └── ui/            # shadcn primitives
├── hooks/             # useFitToRow, useCardRecords, useEntitlements, useMediaQuery, Firestore sync
├── lib/               # Forge client + adapter, deck cards + verification, opponent decks, entitlements
├── store/             # Zustand: decks, settings, game state
└── dev/               # Mock game and mock decks for the development harness
scripts/               # Tests, protocol check, card sync, screenshot sweep
```

## Icons

`src/app/icon.svg` is the favicon: the Keystone, WUBRG left to right. `node
scripts/render-icons.mjs` renders it to the PNGs the home-screen icon and the web app
manifest (`src/app/manifest.ts`) need. Re-run it after editing the SVG.

## Checks

```bash
npx tsc --noEmit          # types
npx eslint src            # lint
npm run check:protocol    # every server prompt has a renderer and matching response key
npm run test:parser       # decklist parser
npm run test:events       # game-log synthesiser
npm run test:sync         # Scryfall → Firestore sync helpers
npm run test:deck         # deck grouping/stats, opponent seat resolution, entitlement gates
npx next build
```

All of these run in CI on every push and pull request.

## Operations

`SECURITY_SETUP.md` covers Firestore rules, the admin allowlist, and the two scheduled
jobs that keep card data current: Scryfall → Firestore here, and the Forge engine + card
scripts in the server repo.
