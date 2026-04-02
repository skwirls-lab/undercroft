# Undercroft

Play Magic: The Gathering Commander against AI opponents in your browser.

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and fill in Firebase config
cp env.template .env.local

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router), TypeScript |
| UI | TailwindCSS, shadcn/ui, Framer Motion, Lucide icons |
| Auth | Firebase Authentication (Google OAuth) |
| Database | Cloud Firestore (decks, settings), IndexedDB/Dexie (card cache) |
| Game Engine | Pure TypeScript, client-side, deterministic |
| AI Opponents | LLM-powered (Groq/OpenAI/Anthropic) via API routes, with heuristic fallback |
| Card Data | Scryfall Oracle dataset (local JSON → IndexedDB) |
| Hosting | Vercel (Git-push deploys) |

## Project Structure

```
src/
├── app/           # Next.js pages and API routes
├── engine/        # Game engine (pure TS, no DOM)
│   ├── types.ts         # Core type definitions
│   ├── GameEngine.ts    # Top-level orchestrator
│   ├── GameState.ts     # State model and helpers
│   ├── TurnManager.ts   # Phase/step/priority
│   ├── ZoneManager.ts   # Card zone management
│   ├── ManaSystem.ts    # Mana parsing and payment
│   └── ActionValidator.ts # Legal action enumeration
├── ai/            # AI player system
│   ├── AIPlayerController.ts
│   ├── PromptBuilder.ts
│   └── FallbackAI.ts
├── cards/         # Card data layer (Scryfall → IndexedDB)
├── store/         # Zustand state stores
├── components/    # React components (ui/ + game/)
└── lib/           # Firebase config, DB, utils
```

## Key Concepts

- **Engine is authoritative**: The game engine enforces all rules. AI only chooses from legal actions.
- **Client-side for MVP**: Game runs in the browser. No game server needed for single-player vs AI.
- **Tiered card rendering**: Pip view (tiny) → art crop (medium) → full card (hover/click) to handle crowded boards.
- **LLM is optional**: Heuristic fallback AI works without any API key configured.

## Environment Variables

See `env.template` for required Firebase configuration.

AI API keys are configured per-user in the Settings page and stored locally in the browser.
