import type { Lesson } from './types';

/**
 * The Apprentice's lessons, in the order a new player should read them. Written for someone
 * who has never held a Magic card; a player who has can skip straight to the quiz.
 */
export const LESSONS: Lesson[] = [
  {
    id: 'commander',
    title: 'What Commander is',
    eyebrow: 'Lesson 1',
    summary: 'The format in one page: four players, one legendary creature to lead you, forty life, and a deck of one hundred different cards.',
    sections: [
      {
        id: 'the-shape',
        heading: 'The shape of a game',
        body: `Commander is Magic: The Gathering played with a **deck of 100 cards**, led by a **legendary creature** called your commander. It usually seats **four players**, everyone against everyone, and the last one standing wins.

You start at **40 life** instead of the usual 20, so games run longer and swing harder. There is more room for big spells, alliances of convenience, and comebacks.

Undercroft seats you against one to three AI opponents. The rules are the same; the engine (Forge) plays every card exactly as printed.`,
      },
      {
        id: 'the-commander',
        heading: 'Your commander',
        body: `Your commander starts the game in the **command zone**, a space beside the battlefield. It can be cast from there as if it were in your hand. If it would die or be exiled, you may put it back in the command zone instead, and cast it again.

Each time you cast it from the command zone after the first, it costs **{2} more** than the last time. That is the **commander tax**, and it is why a commander that keeps dying gets expensive.

Your commander also decides your **colour identity**: every card in your deck must use only the colours that appear on your commander. A green-white commander means no red, blue or black cards anywhere in the deck.`,
      },
      {
        id: 'winning-and-losing',
        heading: 'How you lose',
        body: `- Your **life** reaches 0.
- You have **10 poison counters**.
- You have taken **21 combat damage from one commander** over the course of the game (tracked per commander, so two commanders at 15 each does not do it).
- You must draw a card and your **library is empty**.

Everyone else loses first, you win. In Undercroft the seat inspector (the small (i) on every plaque) shows all four numbers for every seat.`,
      },
    ],
    quiz: [
      { q: 'How many cards are in a Commander deck?', choices: ['60', '99', '100 including the commander', 'As many as you like'], answer: 2, why: 'A Commander deck is exactly 100 cards, and the commander is one of them.' },
      { q: 'What happens to the cost of your commander the second time you cast it from the command zone?', choices: ['Nothing', 'It costs {2} more', 'It costs half', 'You cannot cast it again'], answer: 1, why: 'Commander tax: {2} more for each time it has been cast from the command zone before.' },
      { q: 'You have taken 21 combat damage from The Ur-Dragon, an opposing commander. What happens?', choices: ['Nothing until your life is 0', 'You lose the game', 'You lose 21 life extra', 'The Ur-Dragon is exiled'], answer: 1, why: '21 combat damage from a single commander is a loss on its own, whatever your life total.' },
    ],
  },
  {
    id: 'deck-building',
    title: 'Building a deck',
    eyebrow: 'Lesson 2',
    summary: 'The four rules the deck check enforces: one hundred cards, a legal commander, one copy of each card, everything inside the commander\'s colours.',
    sections: [
      {
        id: 'size',
        heading: 'Exactly one hundred',
        body: `A Commander deck is **100 cards including the commander**. Not 99 plus a commander, not "about a hundred". The deck page counts every copy in the header; the deck check reports how many you are short or over.

A working rule of thumb: **36 to 38 lands**, 8 to 10 ways to make extra mana, 8 to 10 ways to draw cards, 8 to 10 ways to remove a threat, and the rest is your plan.`,
      },
      {
        id: 'commander-choice',
        heading: 'A legal commander',
        body: `Your commander must be a **legendary creature**, or a card that says "can be your commander". Undercroft's commander search only offers cards that qualify. Making a non-legendary creature your commander is refused at the door.

Choose the commander first. Its colours decide what the rest of the deck may contain, and its ability usually decides what the deck is trying to do.`,
      },
      {
        id: 'singleton',
        heading: 'One of each',
        body: `Commander is a **singleton** format: at most **one copy** of any card, by name. The exception is **basic lands** (Plains, Island, Swamp, Mountain, Forest, and their snow and Wastes cousins) and the few cards whose text says "a deck can have any number".

The deck check lists any name that appears twice.`,
      },
      {
        id: 'colour-identity',
        heading: 'Colour identity',
        body: `A card's **colour identity** is every colour symbol anywhere on it: in the mana cost and in the rules text. A card is only allowed if all of those colours also appear in your commander's identity.

- **Atraxa, Praetors' Voice** is white, blue, black and green. Any card without red fits.
- **Krenko, Mob Boss** is red. Only red and colourless cards fit.
- A colourless artifact fits any deck.
- Lands count too: a dual land that makes red and green mana is red-green.

Undercroft refuses an off-colour card when you try to add it, and the check flags any that arrived by import.`,
      },
      {
        id: 'playable',
        heading: 'Cards the engine knows',
        body: `Two more checks are Undercroft's own. A name the card database does not recognise is marked **unknown**; check the spelling against the reader. A card the Forge engine has not implemented yet is marked **not in Forge**: it stays in your list but is skipped in games, so the check counts it as a problem until it is replaced.

**Ready** on a deck means all of this passed and every card has been verified.`,
      },
    ],
    quiz: [
      { q: 'Which of these may appear more than once in a Commander deck?', choices: ['Sol Ring', 'Forest', 'Counterspell', 'Your commander'], answer: 1, why: 'Basic lands are the one broad exception to the one-copy rule.' },
      { q: 'Your commander is Krenko, Mob Boss (red). Which card can go in the deck?', choices: ['Lightning Bolt', 'Counterspell', 'Swords to Plowshares', 'Cultivate'], answer: 0, why: 'Only red and colourless cards fit a mono-red identity. The others are blue, white and green.' },
      { q: 'What decides a card\'s colour identity?', choices: ['Only its mana cost', 'The colour of its border', 'Every mana symbol on the card, cost and text', 'The set it was printed in'], answer: 2, why: 'Colour identity includes symbols in the rules text, which is why a colourless artifact with {G} in its text is green for this purpose.' },
    ],
  },
  {
    id: 'card-types',
    title: 'Card types and permanents',
    eyebrow: 'Lesson 3',
    summary: 'What each kind of card does, which ones stay on the battlefield, and what "tapped" means.',
    sections: [
      {
        id: 'permanents',
        heading: 'Cards that stay',
        body: `A **permanent** is a card that stays on the battlefield after it resolves.

- **Lands** make mana. You may play one per turn, and they are not cast, so they cannot be countered.
- **Creatures** attack and block. Most have power and toughness written as **3/3**: 3 damage dealt, 3 damage to destroy.
- **Artifacts** are objects: mana rocks, equipment, machines.
- **Enchantments** are ongoing effects. An **Aura** attaches to something.
- **Planeswalkers** are allies with loyalty counters; each turn you use one of their abilities.
- **Battles** are attacked to be defeated.`,
        diagram: 'zones',
      },
      {
        id: 'spells',
        heading: 'Cards that happen once',
        body: `- **Instants** can be cast any time you have priority, even on someone else's turn or in response to another spell.
- **Sorceries** can only be cast in one of your **main phases**, when the **stack is empty**.

Both go to the graveyard after they resolve. A creature spell is also a spell while it is on the stack, which is why it can be countered.`,
      },
      {
        id: 'tapped',
        heading: 'Tapped and untapped',
        body: `Turning a card sideways is **tapping** it. A tapped land has been used for mana this turn; a tapped creature has attacked or used an ability and cannot block. Everything you control **untaps** at the start of your turn.

A creature that arrived this turn is **summoning sick**: it cannot attack or use abilities with the tap symbol until you have started a turn with it. Undercroft dims it. Blocking is always allowed.`,
      },
    ],
    quiz: [
      { q: 'When can you cast a sorcery?', choices: ['Any time you have priority', 'Only in your main phase with an empty stack', 'Only during combat', 'Only on an opponent\'s turn'], answer: 1, why: 'Sorcery timing: your main phase, empty stack. Instants are the ones with freedom.' },
      { q: 'A creature entered the battlefield this turn. Can it block?', choices: ['No, it is summoning sick', 'Yes', 'Only if it has haste', 'Only if untapped and it was cast, not put in'], answer: 1, why: 'Summoning sickness stops attacking and tap abilities, never blocking.' },
    ],
  },
  {
    id: 'mana',
    title: 'Mana, costs and the pool',
    eyebrow: 'Lesson 4',
    summary: 'Where mana comes from, why it vanishes at the end of each step, how X costs work, and how Undercroft asks you to pay.',
    sections: [
      {
        id: 'producing',
        heading: 'Making mana',
        body: `Tap a land and it adds mana to your **mana pool**. A Forest adds **{G}**; a Command Tower adds any colour in your commander's identity. Artifacts like **Sol Ring** and creatures like **Llanowar Elves** add mana too.

The pool **empties at the end of every step and phase**. Mana does not carry over from your first main phase to combat, or from this turn to next. Make it when you need it.`,
      },
      {
        id: 'paying',
        heading: 'Paying a cost',
        body: `A cost like **{2}{R}{R}** means two mana of any type and two red. Generic mana ({2}) accepts any colour. Coloured symbols do not.

**X** in a cost is a number you choose when you cast the spell. **{X}{X}** on Walking Ballista means you pay twice the X you pick.

In Undercroft you choose the spell or ability first, and **then** the engine asks you to pay: the lands and rocks that can help light up, and you tap them one at a time until the cost is met. You can cancel while paying. There is no need to tap lands in advance.`,
      },
      {
        id: 'tax',
        heading: 'Commander tax',
        body: `Casting your commander from the command zone costs **{2} more for each previous time** you cast it from there. Atraxa at four mana becomes six the second time and eight the third. The Apprentice strip shows the current tax whenever your commander is in the command zone.

Returning a dying commander to the command zone is optional; letting it go to the graveyard instead avoids the tax if you have a way to bring it back.`,
      },
    ],
    quiz: [
      { q: 'You tap three lands in your first main phase and cast nothing. What happens to that mana in combat?', choices: ['It stays until you use it', 'It is gone: the pool empties between phases', 'It halves', 'It becomes colourless'], answer: 1, why: 'The mana pool empties at the end of each step and phase.' },
      { q: 'In Undercroft, how do you pay for a spell?', choices: ['Tap lands first, then pick the spell', 'Pick the spell, then tap the lands the engine offers', 'Drag lands onto the spell', 'It is paid automatically'], answer: 1, why: 'Choose the play first; the engine then asks for mana and highlights what can pay.' },
    ],
  },
  {
    id: 'the-turn',
    title: 'The turn',
    eyebrow: 'Lesson 5',
    summary: 'Five phases, twelve steps, and what you can do in each. The phase tracker in the game header follows this exactly.',
    sections: [
      {
        id: 'overview',
        heading: 'The five phases',
        body: `Every turn runs through the same phases: **Beginning, Main 1, Combat, Main 2, End**. The gems in the game header light up as the active player moves through them.

Only the active player takes actions like playing a land or casting sorceries, but **everyone gets priority in every step**, so an instant can be cast at almost any point in anyone's turn.`,
        diagram: 'turn',
      },
      {
        id: 'beginning',
        heading: 'Beginning phase',
        body: `- **Untap**: everything you control untaps. No one gets priority; nothing can be cast.
- **Upkeep**: "at the beginning of your upkeep" triggers happen. You can cast instants.
- **Draw**: you draw a card. The player going first skips the draw on turn one.`,
      },
      {
        id: 'main',
        heading: 'Main phases',
        body: `**Main 1** comes before combat, **Main 2** after. In either, with an empty stack, you may play your one land for the turn, cast creatures, sorceries, artifacts, enchantments and planeswalkers, and activate abilities.

A common line: cast creatures in Main 1 only if they matter before combat (haste, an anthem). Otherwise attack first and cast in Main 2, so opponents block with less information.`,
      },
      {
        id: 'combat',
        heading: 'Combat',
        body: `- **Beginning of combat**: a last window for instants before attackers are chosen.
- **Declare attackers**: the active player picks creatures and, for each, which opponent or planeswalker it attacks. They tap (unless they have vigilance).
- **Declare blockers**: each defending player assigns untapped creatures to block.
- **First-strike damage**: only if something has first strike or double strike.
- **Combat damage**: attackers and blockers deal damage at the same time. Unblocked attackers hit the player.
- **End of combat**: "until end of combat" effects wear off.`,
        diagram: 'combat',
      },
      {
        id: 'end',
        heading: 'End phase',
        body: `- **End step**: "at the beginning of your end step" triggers. The last chance for instants this turn.
- **Cleanup**: discard down to seven cards in hand, damage on creatures heals, "until end of turn" effects end. Normally no one gets priority here.`,
      },
    ],
    quiz: [
      { q: 'In which step do you draw your card for the turn?', choices: ['Untap', 'Upkeep', 'Draw', 'Main 1'], answer: 2, why: 'Untap, upkeep, then draw: the third step of the beginning phase.' },
      { q: 'You want to cast a creature so it can attack this turn. It has no haste. When should you cast it?', choices: ['Main 1', 'Declare attackers', 'Main 2', 'It cannot attack this turn either way'], answer: 3, why: 'Without haste a creature cannot attack the turn it arrives, whichever main phase you cast it in.' },
      { q: 'When does damage on a creature heal?', choices: ['At the end of combat', 'In the cleanup step', 'When it untaps', 'Never; it stays'], answer: 1, why: 'Damage wears off in the cleanup step at the end of each turn.' },
    ],
  },
  {
    id: 'the-stack',
    title: 'Priority and the stack',
    eyebrow: 'Lesson 6',
    summary: 'Why the game keeps asking you to pass, what "in response" means, and why the last spell cast is the first to resolve.',
    sections: [
      {
        id: 'priority',
        heading: 'Priority',
        body: `**Priority** is the right to act. The active player gets it first in each step; when they cast a spell or pass, it goes around the table. A step ends only when **every player passes in a row** with nothing waiting to resolve.

This is why Undercroft asks you to **Pass** so often: each ask is a moment where you could respond. **Auto-pass** (the fast-forward button) passes for you until your next turn, or until something is put on the stack that you might want to answer.`,
      },
      {
        id: 'stack',
        heading: 'The stack',
        body: `Spells and abilities do not happen the moment they are cast. They go onto the **stack** and wait. While something is on the stack, every player gets a chance to add more on top of it.

The stack resolves **last in, first out**. The most recent thing resolves first, then the next, and so on, with priority passing around between each one.

- You cast **Ancestral Recall**. It is on the stack.
- An opponent casts **Counterspell** targeting it. Counterspell is on top.
- Everyone passes. Counterspell resolves first: Ancestral Recall is countered and never resolves.

To save Ancestral Recall you would have to respond to Counterspell with something of your own while it is still on the stack.`,
        diagram: 'stack',
      },
      {
        id: 'triggers',
        heading: 'Triggered abilities',
        body: `Text like "**Whenever** a creature enters" or "**At the beginning** of your upkeep" is a **triggered ability**. When its condition happens the ability goes on the stack like a spell, and can be responded to. If several trigger at once, their controller chooses the order; the engine will ask.

"**When** this enters the battlefield" abilities trigger after the creature is already on the battlefield: killing the creature in response does not stop the ability.`,
      },
    ],
    quiz: [
      { q: 'Two spells are on the stack. Which resolves first?', choices: ['The one cast first', 'The one cast last', 'The active player\'s', 'The cheaper one'], answer: 1, why: 'Last in, first out. The top of the stack resolves first.' },
      { q: 'When does a step of the turn end?', choices: ['When the active player passes', 'When all players pass in a row with an empty stack', 'After 30 seconds', 'When a spell resolves'], answer: 1, why: 'Every player passing in succession with nothing left to resolve is what moves the game on.' },
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    eyebrow: 'Lesson 7',
    summary: 'Attacking, blocking, how damage is dealt, and the keywords that change the arithmetic.',
    sections: [
      {
        id: 'attacking',
        heading: 'Attacking',
        body: `In the declare attackers step the active player chooses which untapped, non-summoning-sick creatures attack, and **whom each one attacks**: an opponent or a planeswalker they control. In Commander you may split attackers between different opponents. Attacking creatures tap unless they have **vigilance**.

Once declared, attackers cannot be taken back. The Apprentice strip reminds you when the choice is being made.`,
      },
      {
        id: 'blocking',
        heading: 'Blocking',
        body: `Each defending player may assign untapped creatures to block attackers coming at them. Several blockers can gang up on one attacker; one blocker blocks one attacker unless it says otherwise. Blocking does not tap the blocker, and summoning-sick creatures can block.

A creature with **flying** can only be blocked by creatures with flying or **reach**. **Menace** needs two blockers.`,
      },
      {
        id: 'damage',
        heading: 'Damage',
        body: `All combat damage is dealt **at the same time**. Each attacker deals its power to what it is blocked by, or to the player if unblocked. Each blocker deals its power to the attacker it blocks. A creature with damage equal to its toughness is destroyed.

If one attacker is blocked by several creatures, its controller orders them and assigns damage down the line, at least lethal to each before moving on (the engine asks).

- **First strike**: deals its damage in a separate, earlier step. A 2/2 first striker kills a 2/2 without being hit back.
- **Double strike**: deals damage in both steps.
- **Trample**: excess damage beyond a blocker's toughness goes to the player.
- **Deathtouch**: any amount of its damage is enough to destroy a creature.
- **Lifelink**: its controller gains life equal to the damage it deals.
- **Indestructible**: damage cannot destroy it (though it still takes the damage).`,
      },
    ],
    quiz: [
      { q: 'A 5/5 with trample is blocked by a 2/2. How much damage reaches the player?', choices: ['0', '2', '3', '5'], answer: 2, why: 'Two is assigned to the blocker (lethal), the remaining three trample over.' },
      { q: 'Which creature can block a 3/3 with flying?', choices: ['Any untapped creature', 'Only a creature with flying or reach', 'Only a creature with power 3 or more', 'None; flyers cannot be blocked'], answer: 1, why: 'Flying is blocked only by flying or reach.' },
      { q: 'Does blocking tap the blocking creature?', choices: ['Yes', 'No', 'Only if it has vigilance', 'Only in Commander'], answer: 1, why: 'Blocking never taps. Attacking does, unless the creature has vigilance.' },
    ],
  },
  {
    id: 'life',
    title: 'Life, poison and commander damage',
    eyebrow: 'Lesson 8',
    summary: 'The three counters that end a game, and where Undercroft shows each of them.',
    sections: [
      {
        id: 'life-total',
        heading: 'Life',
        body: `You begin at **40**. Damage to you lowers it; **lifelink** and life-gain spells raise it. At **0 or less** you lose. Life above 40 is fine; there is no cap.

Paying life is a cost some cards ask (Toxic Deluge, fetch lands). You can pay life you have, never more.`,
      },
      {
        id: 'poison',
        heading: 'Poison',
        body: `Creatures with **infect** or **toxic** give **poison counters** instead of, or as well as, damage. **Ten poison** loses the game, whatever your life total. Poison never goes away, and **proliferate** adds one more to every player who already has some.

The seat inspector shows poison against 10 for every seat.`,
      },
      {
        id: 'commander-damage',
        heading: 'Commander damage',
        body: `**Combat damage** dealt to you by a single commander is tracked for the whole game. At **21** from the same commander, you lose. Two different commanders do not add together, and non-combat damage from a commander does not count.

Your plaque shows the total taken from each opposing commander as **9/21 Krenko**. Watch a commander with double strike or a big power boost: 21 arrives faster than it looks.`,
      },
    ],
    quiz: [
      { q: 'How many poison counters lose the game?', choices: ['7', '10', '15', '21'], answer: 1, why: 'Ten poison counters, regardless of life.' },
      { q: 'You have taken 12 commander damage from Krenko and 12 from The Ur-Dragon. Have you lost?', choices: ['Yes, 24 is over 21', 'No, it is tracked per commander', 'Only if it was on the same turn', 'Only if your life is under 21'], answer: 1, why: 'Commander damage is per commander. Neither has reached 21.' },
    ],
  },
  {
    id: 'command-zone',
    title: 'The command zone',
    eyebrow: 'Lesson 9',
    summary: 'Casting your commander, sending it home, and the choice you get when it would leave the battlefield.',
    sections: [
      {
        id: 'casting',
        heading: 'Casting from the zone',
        body: `Your commander sits in the **command zone** at the start. In Undercroft it appears beside your creatures with a crown; tap it while you have priority in a main phase and choose **Cast** to bring it out. It costs its printed cost plus the tax.`,
      },
      {
        id: 'returning',
        heading: 'Sending it back',
        body: `Whenever your commander would go to the graveyard, exile, your hand or your library, you may **return it to the command zone** instead. The engine asks each time. Saying yes keeps it castable, at the higher tax; saying no lets it go where it was headed, which can be right if you have a way to bring it back cheaply or it has already done its job.

A commander in the command zone is safe from almost everything. That is the trade: safety for tax.`,
      },
    ],
    quiz: [
      { q: 'Your commander would be exiled. What may you do?', choices: ['Nothing; it is exiled', 'Return it to the command zone instead', 'Put it in your hand', 'Cast it again for free'], answer: 1, why: 'The replacement is optional and applies to graveyard, exile, hand and library.' },
    ],
  },
  {
    id: 'mulligans',
    title: 'Mulligans and opening hands',
    eyebrow: 'Lesson 10',
    summary: 'What to keep, what to send back, and how the free mulligan works.',
    sections: [
      {
        id: 'the-rule',
        heading: 'The rule',
        body: `You draw **seven**. If you do not like them, you may shuffle and draw seven again. Each mulligan after the **first free one** costs a card: you draw seven and then **put one on the bottom** of your library per mulligan taken. Undercroft shows the hand full-screen and asks Keep or Mulligan; after a mulligan it asks which card to tuck.`,
      },
      {
        id: 'what-to-keep',
        heading: 'What to keep',
        body: `A keepable seven usually has **three or four lands** (or two lands and a mana rock), something to do by turn three, and a way to keep drawing. Seven lands or one land is a mulligan. A hand of expensive spells with no way to reach them is a mulligan, however pretty.

Commander games are long. A slightly slow hand that can cast the commander on time is better than a fast hand that runs out of cards.`,
      },
    ],
    quiz: [
      { q: 'You take two mulligans. How many cards do you end up with?', choices: ['7', '6', '5', '4'], answer: 1, why: 'The first mulligan is free; the second costs one card: seven drawn, one put on the bottom, six in hand.' },
    ],
  },
  {
    id: 'keywords',
    title: 'Keywords glossary',
    eyebrow: 'Reference',
    summary: 'The short words on cards that stand in for a paragraph of rules, in one place.',
    sections: [
      {
        id: 'glossary',
        heading: 'A to Z',
        body: '',
      },
    ],
  },
];

export const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
