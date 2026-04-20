# Undercroft — Full MVP Evaluation & Gap Analysis

*Generated: April 18, 2026*

---

## Part 1: Game Engine Evaluation (vs Forge Reference)

### What Forge Has (forge-game/)

Forge is a mature, 15+ year Java project with **complete MTG rules coverage**:

| Forge Subsystem | Files/Classes | Purpose |
|---|---|---|
| `ability/effects/` | **200+ effect classes** | Every card effect type (Destroy, Exile, Draw, Bounce, Animate, CounterSpell, CreateToken, DealDamage, DiscardCard, GainControl, GainLife, PumpCreature, Regenerate, Sacrifice, Search, Tap/Untap, Transform, Tutor, etc.) |
| `trigger/` | **140+ trigger classes** | Every trigger condition (Attacks, Blocks, Enters/Leaves Battlefield, Dies, Becomes Target, SpellCast, Damage Dealt, LifeGained, etc.) |
| `replacement/` | Replacement effects | "Instead" effects, damage prevention, redirection |
| `staticability/` | Static abilities | Continuous effects, anthem effects, cost modification |
| `keyword/` | **28+ keyword files** | Complex keywords (Affinity, Kicker, Equip, Emerge, Hexproof variants, etc.) |
| `combat/` | Full combat system | Attack restrictions, blocking requirements, damage ordering, banding |
| `cost/` | Cost system | Alternative costs, additional costs, cost reduction, Convoke, Delve |
| `mana/` | Mana system | Mana abilities, mana restrictions, color-locking |
| `spellability/` | Spell abilities | Targeting, modes, X costs, spell copies |
| `zone/` | Zone management | Zone change triggers, graveyard order, library manipulation |
| `phase/` | Phase system | Extra turns, extra phases, phase skipping |
| `player/` | Player system | Choices, reveals, voting, Monarch, initiative |
| `event/` | Event system | Game event bus for triggers and replacement effects |
| `card/token/` | Token system | Token creation, copying, characteristics |
| `mulligan/` | Mulligan variants | London, Paris, Vancouver mulligans |

### What Undercroft Has Today

| Undercroft Module | Status | Coverage |
|---|---|---|
| **Turn structure** | ✅ Working | Phases, steps, turn order, priority passing |
| **Zones** | ✅ Working | Library, hand, battlefield, graveyard, exile, command, stack (type only) |
| **Mana system** | ✅ Working | Pool tracking, cost parsing, payment (WUBRGC + generic), multi-color lands |
| **Land play** | ✅ Working | One per turn, ETB tapped detection, multi-color mana production |
| **Spell casting** | ⚠️ Partial | Mana payment works, but **spells resolve immediately — no stack** |
| **Combat** | ⚠️ Partial | Attackers, blockers, damage — but no damage assignment ordering for multiple blockers |
| **Combat keywords** | ✅ Working | Flying, Reach, Defender, Deathtouch, Lifelink, Trample, First/Double Strike, Vigilance |
| **Non-combat keywords** | ❌ Missing | Flash/Haste recognized but **Hexproof, Indestructible, Menace, Protection, Ward** not enforced |
| **State-based actions** | ⚠️ Partial | Lethal damage → graveyard, 0 life = lose. Missing: legend rule, +1/+1 and -1/-1 cancellation, 0 toughness, poison (10), commander damage (21) |
| **Commander rules** | ⚠️ Partial | Commander tax works, command zone exists. Missing: commander damage tracking as win-con, commander zone-change replacement |
| **Stack/Priority** | ❌ Stub only | Stack type exists but spells bypass it entirely. No responses, no counterspells, no interaction |
| **Triggered abilities** | ❌ Missing | No trigger system whatsoever |
| **Activated abilities** | ❌ Missing | Only land mana abilities. No creature/artifact/enchantment activated abilities |
| **Static abilities** | ❌ Missing | No continuous effects, no anthems, no cost modification |
| **Replacement effects** | ❌ Missing | No prevention, no "instead" effects |
| **Targeting** | ❌ Missing | Spells don't target anything — they just resolve as permanents or go to graveyard |
| **Card effects** | ❌ Missing | No card effects resolve — creatures are just bodies, spells are just bodies |
| **Tokens** | ❌ Missing | No token creation |
| **Counters** | ❌ Missing | +1/+1 counters exist in type but are never placed |
| **Enchantments/Equipment** | ❌ Missing | Attach/equip not implemented |
| **Planeswalkers** | ❌ Missing | No loyalty, no activation |
| **Mulligan** | ❌ Skipped | Game draws 7, no mulligan option |

### Engine Gap Summary

**Undercroft's engine covers ~15% of what Forge implements.** However, this is the right approach for an MVP — Forge took 15 years to get where it is. The question is: what's the **minimum viable subset** that makes games feel real?

---

## Part 2: Critical Engine Gaps for MVP

These are **must-have** features for alpha testing. Without these, games feel broken:

### Tier 1 — Games Are Broken Without These

1. **The Stack** — Spells currently resolve instantly. This means:
   - No instant-speed interaction (the core of MTG)
   - No counterspells
   - No combat tricks
   - No "in response to..."
   
   *Fix: Spells go on stack → priority round → resolve top item*

2. **Targeting** — Spells currently have no targets. Removal spells, pump spells, and most instants/sorceries do nothing.
   
   *Fix: Oracle text parser for common patterns: "Destroy target creature", "Deal N damage to any target", "Target creature gets +X/+Y", "Return target... to hand"*

3. **Basic Spell Effects** — Even with targeting, the engine needs to execute effects:
   - **Destroy** (move to graveyard)
   - **Exile** (move to exile)
   - **Bounce** (return to hand)
   - **Deal damage** (non-combat)
   - **Draw cards**
   - **Pump** (+X/+Y until end of turn)
   - **Gain life**
   
   *This covers ~60-70% of Commander-legal instants/sorceries by volume*

4. **Commander Damage Win Condition** — 21 damage from a single commander = lose. Already tracked in `commanderDamageReceived` but never checked.

5. **Poison Counter Win Condition** — 10 poison = lose. Already tracked but never checked.

6. **Legend Rule** — Two legends with the same name → owner chooses one, other goes to graveyard.

### Tier 2 — Playable But Limited Without These

7. **ETB Triggered Abilities** — "When X enters the battlefield..." is the most common trigger in Commander. Without it, ~40% of creatures are just vanilla bodies.

8. **Death Triggers** — "When X dies..." is the second most common trigger.

9. **Enchantment/Equipment Attach** — Auras and equipment are a huge part of Commander.

10. **Token Creation** — Many cards create tokens. Without this, a large portion of card effects are non-functional.

11. **+1/+1 Counters** — Very common in Commander. The `counters` field exists but nothing places them.

12. **Hexproof/Shroud/Ward/Indestructible Enforcement** — These keywords are displayed but have no mechanical effect.

13. **Mulligan System** — Players need to be able to mulligan bad hands.

### Tier 3 — Nice to Have for Alpha

14. **Planeswalker Support** — Loyalty abilities, can-be-attacked rules
15. **Activated Abilities** — Non-mana activated abilities
16. **Continuous Effects Layer System** — Proper anthem/buff stacking
17. **Damage Prevention / Replacement Effects**
18. **Flashback / Alternative Casting Costs**

---

## Part 3: UI/UX Aesthetic Evaluation

### Comparison Targets

| App | Strengths | Undercroft Comparison |
|---|---|---|
| **MTG Arena** | Premium card art rendering, fluid animations, dramatic VFX (particle explosions on damage, glow on cast), thick borders/bezels with metallic textures, battlefield has depth/perspective, soundtrack + SFX | Undercroft is extremely flat and utilitarian by comparison |
| **SpellTable** | Webcam-based, social-first, clean minimal UI, dark theme, card recognition | Different niche — Undercroft isn't trying to be SpellTable |
| **Cockatrice/Forge** | Functional but ugly — tables of text, Java Swing UI | Undercroft is already prettier than Forge's desktop client |
| **Archidekt** | Clean deck builder with Scryfall art, mana curve graphs, card hover previews | Undercroft's deck builder is text-import only — far behind |
| **Moxfield** | Premium deck builder with drag-drop, categories, playtest mode, beautiful card grids | Gold standard for deck building UX |

### Current Aesthetic Issues

#### 🔴 Critical Polish Gaps

1. **No Branding / Visual Identity**
   - Home page is a generic Swords icon in a square with "Undercroft" text
   - No logo, no splash art, no atmospheric imagery
   - Feature cards are plain text boxes with no visual flair
   - Compare to Arena's dramatic key art, particle effects, and metallic frame design
   
2. **Battlefield Feels Like a Spreadsheet**
   - Cards are tiny pip strips (6px tall for opponents) or 72×100px art thumbnails
   - No visual hierarchy — lands, creatures, and enchantments all look the same weight
   - No spatial depth — everything is flat flex-wrap rows
   - Arena uses a 3D-perspective battlefield with card stacking, zone separation via visual depth, and dramatic lighting
   
3. **No Card Art Integration On Battlefield**
   - Opponent fields show colored text strips (pip mode) — no art at all
   - Your own creatures show tiny 72×100px art crops that are hard to identify
   - There's no at-a-glance way to assess board state
   - Arena renders cards at ~3-4x this size with clear art, name, and P/T

4. **Hand Display Has No Polish**
   - Fan layout works but cards are raw Scryfall images with no custom frame
   - No glow/highlight effect for playable cards (just a faint green ring)
   - No drag-to-play interaction
   - Arena has glowing card edges, lift-on-hover with 3D tilt, and drag-to-cast with targeting arrows

5. **Action Bar Is Generic**
   - A rounded pill with "Pass" / "Auto" / "Concede" in tiny 7px buttons
   - No visual weight or drama to the primary action
   - Arena has a prominent glowing button that pulses when it's your turn, with contextual labels

6. **Phase Tracker Is Minimal**
   - Tiny 10px text tabs. Functional but invisible at a glance
   - Arena shows a dramatic phase crystal with animation between phases

7. **Combat UI Is Functional But Flat**
   - Red/blue rings for attacking/blocking are correct but lack impact
   - No attack animation, no damage splash, no creature sliding forward
   - Arena creatures physically slide into a combat zone with damage numbers flying

8. **No Sound/Audio**
   - Complete silence. Even simple SFX (card play, damage, turn start) would dramatically improve feel

9. **Game Log Is Hidden by Default**
   - Collapsed to a 10px-tall bar — most players won't even know it exists
   - Uses emoji icons which feel casual/unprofessional for an alpha release

10. **No Loading/Transition Animations**
    - Page navigations are instant hard cuts
    - No skeleton loaders, no fade-ins
    - Game start has no dramatic reveal

#### 🟡 Secondary Polish Issues

11. **Color Theme Is Muted**
    - oklch midnight-blue + violet primary is clean but lacks the warmth and richness of MTG's visual language
    - Gold accent (`oklch(0.78 0.14 75)`) is good but underutilized
    - Consider richer dark tones: deep leather browns, aged parchment yellows, metallic golds — the "ancient library" motif

12. **Typography Has No Character**
    - Default system font throughout
    - MTG apps typically use display fonts for headers (Beleren, Planeswalker fonts)
    - Consider a serif or display font for game titles/headers, monospace for mana costs

13. **No Empty State Art**
    - Blank battlefield says "No permanents" in faint text
    - No deck selected shows an Upload icon
    - These should have atmospheric illustrations or MTG-themed placeholder art

14. **Deck Builder Is Text-Only Import**
    - No visual card search
    - No drag-drop deck building
    - No mana curve visualization
    - No card art previews in deck list
    - This is the #1 engagement feature for MTG apps — people spend more time building decks than playing

15. **No Responsive Mobile Layout**
    - Game board doesn't adapt for mobile screens
    - Hand cards would overflow on phone screens
    - Arena and SpellTable are both mobile-optimized

16. **Settings Page Is Bare**
    - Two cards (AI Provider, Card Database) with minimal styling
    - No sections for game preferences, display settings, audio settings

---

## Part 4: Prioritized MVP Roadmap

### Phase 1 — Engine Fundamentals (Makes Games Work) ⚡
*Estimated: 3-4 sessions*

1. **Implement the Stack** — Spells and abilities go on stack, priority passes, top resolves
2. **Implement Targeting** — Oracle text parser for "target creature/player/permanent"
3. **Implement Core Spell Effects** — Destroy, Exile, Bounce, Deal Damage, Draw, Pump, Gain Life
4. **Commander Damage & Poison Win Conditions** — Check 21 damage and 10 poison in SBA
5. **Legend Rule** — SBA check for duplicate legends
6. **Mulligan System** — London mulligan (draw 7, put N back on bottom)

### Phase 2 — Engine Depth (Makes Games Fun) 🎮
*Estimated: 3-4 sessions*

7. **ETB Triggers** — "When ~ enters the battlefield" effects
8. **Death Triggers** — "When ~ dies" effects
9. **Token Creation** — Create creature tokens
10. **+1/+1 Counters** — Place and track counters, apply to P/T
11. **Enchantment/Equipment Attach** — Aura/Equipment mechanics
12. **Hexproof/Indestructible/Ward Enforcement** — Targeting restrictions
13. **AI Improvements** — Better mana sequencing, evaluate threats before attacking

### Phase 3 — Visual Polish (Makes It Look Professional) 🎨
*Estimated: 4-5 sessions*

14. **Branding & Identity** — Logo design, splash art, consistent visual theme
15. **Battlefield Redesign** — Larger cards, spatial zones, visual depth
16. **Card Rendering Upgrade** — Larger art crops, custom frame overlays, P/T badges
17. **Hand Polish** — Glow effects, drag-to-play, 3D hover tilt
18. **Animations** — Cast animation, attack/block movement, damage splashes, phase transitions
19. **Audio System** — Ambient soundtrack + SFX (card play, damage, turn chime)
20. **Action Bar Redesign** — Prominent contextual button, turn indicator
21. **Phase Tracker Redesign** — Visual phase crystals or pips with animation

### Phase 4 — Deck Builder (Key Engagement Feature) 📚
*Estimated: 3-4 sessions*

22. **Visual Card Search** — Search Scryfall data with filters (type, color, CMC, keywords)
23. **Drag-Drop Deck Building** — Add cards to deck with visual feedback
24. **Deck Visualization** — Mana curve, color distribution, card type breakdown
25. **Commander Selection** — Browse and select commander with color identity display
26. **Format Validation** — Enforce singleton, color identity, deck size rules

### Phase 5 — Alpha Readiness 🚀
*Estimated: 2-3 sessions*

27. **Mobile Responsive Layout** — Adaptive game board for phone/tablet
28. **Tutorial / Onboarding** — Guided first game experience
29. **Game End Screen** — Victory/defeat screen with stats
30. **Error Recovery** — Handle engine errors gracefully, prevent soft-locks
31. **Performance Optimization** — Lazy loading, efficient re-renders, card image caching

---

## Summary

**Engine completeness: ~15% of Forge, ~30% of minimum viable Commander**
The engine handles the "skeleton" of a game (turns, mana, creatures, combat) but cards have no effects. Without the stack and spell resolution, it's essentially a game of "play vanilla creatures and swing."

**UI/UX polish: Functional prototype, not alpha-ready**
The architecture is solid (Next.js + Zustand + Tailwind is a good stack), the component structure is clean, and the dark theme base is appropriate. But it needs 3-4 sessions of dedicated visual work to reach the fidelity of a credible alpha. The biggest gaps are: card rendering size, battlefield spatial design, animations, and branding.

**Recommended priority for next session: Phase 1 (Stack + Targeting + Spell Effects)**
This is the single biggest bang-for-buck improvement. Once spells actually do things, the game transforms from "swing with bodies" to "play Magic."
