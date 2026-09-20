/**
 * Guided tours of Undercroft's own controls: not the rules of Commander (the Apprentice
 * covers those) but where things are and what a tap does. Each step points at a
 * `data-tour` anchor; a step whose anchor is not on the page is skipped, so a tour never
 * strands a player on a control their plan or the board's state does not show.
 */

export type TourName = 'vault' | 'deck' | 'setup' | 'board';

export interface TourStep {
  /** The `data-tour` value of the element to spotlight. */
  target: string;
  title: string;
  body: string;
  /** Where the card sits relative to the target; the overlay flips it if there is no room. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export interface Tour {
  name: TourName;
  title: string;
  /** The route the tour lives on, for the replay list in Settings. */
  path: string;
  steps: TourStep[];
}

export const TOURS: Record<TourName, Tour> = {
  vault: {
    name: 'vault',
    title: 'The vault',
    path: '/decks',
    steps: [
      { target: 'vault-new', title: 'Start a deck', body: 'New Deck asks for a commander first, then opens the deck with the card search ready. Its colours decide what the deck may hold.', placement: 'bottom' },
      { target: 'vault-import', title: 'Or paste a list', body: 'Import takes a decklist from anywhere: one card per line, "1 Sol Ring" or just "Sol Ring". Every name is checked against the card database and the engine.', placement: 'bottom' },
      { target: 'vault-shelves', title: 'Shelves', body: 'File decks on shelves to keep the vault tidy. A deck sits on one shelf or in the open; the chips here filter the view.', placement: 'bottom' },
      { target: 'vault-badge', title: 'Ready or not', body: 'Every deck carries its verdict: Ready means 100 cards, a legal commander, one of each, all in colour, all playable. Open the deck to see what an issue is.', placement: 'top' },
    ],
  },
  deck: {
    name: 'deck',
    title: 'A deck',
    path: '/decks/:id',
    steps: [
      { target: 'deck-edit', title: 'Edit', body: 'Edit turns on a search box for adding cards, a stepper on every tile, and the name becomes a field. Changes save as you make them.', placement: 'bottom' },
      { target: 'deck-check', title: 'The deck check', body: 'The badge is the Commander rules check. Tap it for the list of issues and the cards each one concerns; each issue has a "Why?" link to the rule.', placement: 'bottom' },
      { target: 'deck-tile', title: 'Read a card', body: 'Tap any tile to read the card at full size, with its rules text. From the reader you can change the count, remove it, or make it the commander.', placement: 'right' },
      { target: 'deck-archivist', title: 'Ask the Archivist', body: 'The Archivist reads the whole list and suggests cuts, adds and a game plan. Swaps come back as tiles with Apply, checked against the commander’s colours first.', placement: 'bottom' },
      { target: 'deck-play', title: 'Play', body: 'Play takes this deck straight to the table. If the check found problems you will be warned first; you can still play.', placement: 'bottom' },
    ],
  },
  setup: {
    name: 'setup',
    title: 'Setting up a game',
    path: '/game',
    steps: [
      { target: 'setup-deck', title: 'Your deck', body: 'Pick the deck you will pilot. The badge beside each name is its check; a deck with issues can still be played, with a warning.', placement: 'bottom' },
      { target: 'setup-pod', title: 'How many opponents', body: 'One AI is a duel; two or three make a pod. More seats means longer games and more politics.', placement: 'bottom' },
      { target: 'setup-seat', title: 'What each seat plays', body: 'Every opponent plays a house deck at random by default. Tap a seat to give it a specific house deck, or one of your own vault decks.', placement: 'top' },
      { target: 'setup-start', title: 'Start', body: 'Start connects to the engine, checks every deck, and deals the opening hands. The first thing you will see is your hand and a Keep or Mulligan choice.', placement: 'top' },
    ],
  },
  board: {
    name: 'board',
    title: 'The table',
    path: '/dev/board',
    steps: [
      { target: 'board-phase', title: 'Where the turn is', body: 'The tracker shows whose turn it is and which phase and step the game is in. The gold gem is now; the text on the right is the step.', placement: 'bottom' },
      { target: 'board-apprentice', title: 'The Apprentice', body: 'While Apprentice mode is on, this line says what is happening and what you can do. Learn more opens the lesson. The cap in the header switches it off.', placement: 'bottom' },
      { target: 'board-plaque', title: 'A seat', body: 'Each plaque is a seat: life, library, hand size, poison and commander damage at a glance. Tap the plaque to open that player’s full board.', placement: 'bottom' },
      { target: 'board-inspect', title: 'The inspector', body: 'The (i) opens the seat inspector: every number, plus the graveyard, exile and command zone laid out as cards you can read.', placement: 'left' },
      { target: 'board-stack', title: 'The stack', body: 'When something is waiting to resolve it shows here, newest first. While it is showing you can still respond; nothing on it has happened yet.', placement: 'top' },
      { target: 'board-pass', title: 'Pass', body: 'The engine asks you at every point where you could act. Pass when you have nothing to do. It glows gold when it is your priority.', placement: 'top' },
      { target: 'board-autopass', title: 'Auto-pass', body: 'Auto-pass keeps passing for you until your next turn, or until something goes on the stack that you might want to answer.', placement: 'top' },
      { target: 'board-hand', title: 'Your hand', body: 'Tap a card in the strip to play it: a land goes straight down, a spell goes to the stack. Then the engine asks you to pay: tap the lands it lights up, one at a time.', placement: 'top' },
      { target: 'board-ticker', title: 'The log', body: 'The ticker shows the last few things that happened. Tap it for the full log of the game.', placement: 'bottom' },
      { target: 'board-archivist', title: 'The Archivist', body: 'The book opens the Archivist beside the board. Ask what to do this turn, or anything about the board or the rules. Nothing is sent until you ask.', placement: 'bottom' },
    ],
  },
};

export const TOUR_NAMES = Object.keys(TOURS) as TourName[];
