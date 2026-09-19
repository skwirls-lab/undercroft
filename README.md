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
| Data | Cloud Firestore — `users/{uid}/decks` per player, a shared `cards` collection of Scryfall data |
| Rules engine | Forge, headless, on a Java WebSocket bridge (separate repo) |
| AI opponents | Forge's own AI |
| Hosting | Vercel (frontend), Railway (game server) |

The client keeps no rules logic. It renders state snapshots the server pushes and sends back
decisions the server asks for (`src/lib/forgeClient.ts` → `src/store/forgeGameStore.ts` →
`src/lib/forgeStateAdapter.ts` → the game components).

## Project Structure

```
src/
├── app/               # Routes: landing/dashboard, decks, game setup, game board, admin, dev
├── components/
│   ├── brand/         # Keystone, Arch, Alcove — the Undercroft visual identity
│   ├── game/          # Board, seats, cards, hand, prompts
│   └── ui/            # shadcn primitives
├── hooks/             # useFitToRow (size cards to their row), useMediaQuery, Firestore sync
├── lib/               # Forge client + adapter, game-log synthesiser, motion presets, Firebase
├── store/             # Zustand: decks, settings, game state
└── dev/               # Mock game and mock decks for the development harness
scripts/               # Tests, protocol check, card sync, screenshot sweep
```

## Checks

```bash
npx tsc --noEmit          # types
npx eslint src            # lint
npm run check:protocol    # every server prompt has a renderer and matching response key
npm run test:parser       # decklist parser
npm run test:events       # game-log synthesiser
npm run test:sync         # Scryfall → Firestore sync helpers
npx next build
```

All of these run in CI on every push and pull request.

## Operations

`SECURITY_SETUP.md` covers Firestore rules, the admin allowlist, and the two scheduled
jobs that keep card data current: Scryfall → Firestore here, and the Forge engine + card
scripts in the server repo.
