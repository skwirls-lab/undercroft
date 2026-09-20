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

**Ready means legal.** The badge on a deck in the vault and on the setup screen is the stored
verdict of the deck check, refreshed whenever the deck page recomputes it, so "Ready" means
every name resolved *and* the deck passes the Commander rules. A deck that predates the check
reads "Unchecked" until it is opened. Pressing Start re-judges your deck and any vault deck
handed to an AI, live; a failing deck gets a warning naming its issues with a link to fix it,
and a "Play anyway" — it is a simulator, so the game is never refused.

**Shelves** are the vault's folders: one level, a name and an accent colour, filed on the
player's profile document. A deck sits on at most one shelf.

**Opponent decks.** On the game setup screen each AI seat can play a random house deck (the
default), a specific house deck, or any vault deck with a commander — including the one you
are about to play, if a mirror match is the test. `src/lib/opponentDecks.ts` resolves the
choices into `start_game` payloads; the server names each AI seat after its deck.

## In a game

Every seat plaque and the board header carry an (i). It opens the **seat inspector**: life,
poison against 10, library and hand counts, the mana pool, commander damage taken from every
opposing commander against the 21 that ends a game, and the graveyard, exile and command zone
laid out as cards with a reader. Tabs across the top switch seats without closing.

## The Apprentice (learning, free)

Apprentice mode is the rulebook read at the right moment, with no model involved. It is on
for new players and lives in two places:

- **/learn** — eleven short lessons (what Commander is, building a deck, card types, mana,
  the turn, priority and the stack, combat, life/poison/commander damage, the command zone,
  mulligans) and a keyword glossary. Each lesson has small diagrams and a quiz with instant
  feedback. Free and readable without an account.
- **In a game** — a line under the header says which step it is, what is happening and what
  you can do; when the engine asks something, what it is asking and how to answer with
  these controls (`PROMPT_GUIDE`, one entry per server prompt). Notes fire once per game the
  first time something matters: the stack, the commander leaving its zone, life at 10 or
  less, seven poison, fifteen commander damage. Every prompt panel carries the same guide
  at its foot. "Learn more" opens the lesson in a new tab. The deck check's issues each get a
  "Why?" link to the rule they break.

Content is typed data in `src/content/lessons/`. `npm run test:lessons` checks that every
phase, step and server prompt the overlay renders has a guide, every quiz answer is in
range, and every link lands on a lesson and section that exist — so a new prompt cannot
ship without an explanation. Toggle: Settings → Learning, the cap in the game header, or the
switch on /learn. Harness: `/dev/board?apprentice=0`, `?choice=attackers`.

## Tutorials (tours)

Four guided tours of Undercroft's own controls, one per screen: the vault, a deck, setting
up a game, and the table (plaques, the (i), the phase tracker, Pass and auto-pass, the hand
strip and how paying works, the stack, the log, the Archivist). A spotlight cuts a hole in a
dark mask over one control at a time with a card beside it; arrows move, Escape leaves. On a
phone the card docks to whichever half the control is not in. A step whose control is not on
the page (a Patron feature, an empty stack) is skipped.

Each tour runs once, the first time its screen opens, while Settings → Learning → "Show
tutorials" is on; completion is remembered on the device and mirrored to the profile
(`users/{uid}.toursDone`) so another device does not replay it. Settings lists the tours to
replay; the table tour replays with the next game. Content is `src/content/tours.ts`; anchors
are `data-tour` attributes on the existing components. `npm run test:tours` (Playwright,
against the mock dev server) walks every tour at phone and desktop and checks that each
step's target is on the page, in the viewport and not covered by the card.

## The Archivist

The Archivist is the resident helper: a keeper of records who has read every card. It is
asked, never volunteers, and every request counts against a monthly allowance shown in
Settings.

- **Deck page → Ask the Archivist.** Improve the deck (pick a goal: curve, ramp, draw,
  removal, synergy, budget), suggest swaps, explain how to pilot it, or ask a free question.
  Swaps come back as tiles with **Apply**; every suggested card is looked up and checked
  against the commander's colours first, so a name the model invented never reaches a deck.
- **New deck → "Not sure? Ask the Archivist for commander ideas."** Five commanders for a
  wish like "tokens and green", each resolved through the commander search before it is shown.
- **In a game → the book in the header.** Docked beside the board on a desktop, a bottom
  sheet on a phone. "What should I do this turn?" or a free question; the conversation lasts
  one turn. The Archivist sees your hand, every battlefield, the stack and the legal actions,
  never an opponent's hand. After the game: "Ask the Archivist what happened."
- **Settings → The Archivist.** The in-match switch and this month's meter.

One route, `POST /api/archivist` (`src/app/api/archivist/route.ts`): verify the player,
check the app switch and the plan, reserve one request, build the prompt
(`src/lib/archivist/prompts.ts`), call OpenRouter, stream the answer back, record the tokens.
The client (`src/lib/archivist/client.ts`, `useArchivist()`) streams into the panels and maps
the server's codes to one typed error. When the admin switch is off every entry point says
"The Archivist is resting" and nothing is sent. `ARCHIVIST_STUB=1` answers from a canned
script so the whole path can be exercised without a key; the dev harness does the same in
mock mode (`/decks/mock-atraxa?archivist=improve|swaps|strategy`,
`/dev/board?archivist=advice|recap`).

## Administration

Settings has an Administration section for the admin allowlist: the Archivist's master
switch, model and allowances (`config/app`), a notice banner, Patron grants by email, and
this month's usage. Server-side code lives in `src/lib/server/` (Admin SDK, bearer-token
auth, config cache, usage metering) and is reached through route handlers under
`src/app/api/`. `SECURITY_SETUP.md` has the environment variables and the rules.

## Plans and paywalls

Nothing is paid yet, but the seam is in: `src/lib/entitlements.ts` is the single price list
(`FEATURES`, `LIMITS`) and `useEntitlements()` is what a screen asks before showing a gated
control. Deck editing, shelves, custom opponent decks, the deck cap and the four-player pod all
go through it. The launch switch is the `NEXT_PUBLIC_ENFORCE_ENTITLEMENTS=1` environment variable: while it
is unset every gate answers yes. A player's plan is read from `users/{uid}.plan`, which the Firestore rules forbid
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
npm run test:deck         # deck grouping/stats, opponent seat resolution
npm run test:entitlements # the price list under both launch-switch positions, plan resolution
npm run test:metering     # Archivist allowance arithmetic
npm run test:archivist    # prompt builders, context serialisation, swap/idea parsing
npm run test:lessons      # Apprentice content: every phase, step and prompt explained; quiz and link integrity
npm run test:tours        # every tour step resolves and is visible at phone and desktop (needs the mock dev server)
npm run test:rules        # firestore.rules against the emulator (needs Java)
npx next build
```

All of these run in CI on every push and pull request.

## Operations

`SECURITY_SETUP.md` covers Firestore rules, the admin allowlist, and the two scheduled
jobs that keep card data current: Scryfall → Firestore here, and the Forge engine + card
scripts in the server repo.
