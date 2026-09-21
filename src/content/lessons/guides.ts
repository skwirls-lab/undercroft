import type { PhaseGuideMap, StepGuideMap, PromptGuide, IssueGuideMap, LessonRef } from './types';

/** One line per phase for the strip's left edge. */
export const PHASE_GUIDE: PhaseGuideMap = {
  beginning: { title: 'Beginning', line: 'Untap, upkeep, draw. Instants only.', ref: { lesson: 'the-turn', section: 'beginning' } },
  precombat_main: { title: 'Main 1', line: 'Lands, creatures, sorceries: anything, while the stack is empty.', ref: { lesson: 'the-turn', section: 'main' } },
  combat: { title: 'Combat', line: 'Attackers, then blockers, then damage all at once.', ref: { lesson: 'the-turn', section: 'combat' } },
  postcombat_main: { title: 'Main 2', line: 'A second main phase: cast what you held back during combat.', ref: { lesson: 'the-turn', section: 'main' } },
  ending: { title: 'End', line: 'End-step triggers, then cleanup: discard to seven, damage heals.', ref: { lesson: 'the-turn', section: 'end' } },
};

/** What is happening in each step and what the active player can do. */
export const STEP_GUIDE: StepGuideMap = {
  untap: { line: 'Everything the active player controls untaps.', canDo: 'Nothing yet; no one gets priority in the untap step.', ref: { lesson: 'the-turn', section: 'beginning' } },
  upkeep: { line: '"At the beginning of your upkeep" triggers happen now.', canDo: 'Instants and abilities. No lands, no sorceries.', ref: { lesson: 'the-turn', section: 'beginning' } },
  draw: { line: 'The active player draws a card.', canDo: 'Instants and abilities, after the draw.', ref: { lesson: 'the-turn', section: 'beginning' } },
  main: { line: 'The main phase: the stack is empty, so anything goes.', canDo: 'Play a land, cast creatures, sorceries, artifacts, enchantments, planeswalkers; cast the commander.', ref: { lesson: 'the-turn', section: 'main' } },
  beginning_of_combat: { line: 'Combat is starting but attackers are not chosen yet.', canDo: 'A last window for instants before attackers are declared.', ref: { lesson: 'combat', section: 'attacking' } },
  declare_attackers: { line: 'The active player chooses attackers and whom each one attacks.', canDo: 'Attackers are locked in once declared; then instants.', ref: { lesson: 'combat', section: 'attacking' } },
  declare_blockers: { line: 'Defending players assign blockers.', canDo: 'Blockers do not tap; summoning-sick creatures can block. Then instants.', ref: { lesson: 'combat', section: 'blocking' } },
  first_strike_damage: { line: 'Creatures with first strike or double strike deal damage first.', canDo: 'Instants, after the first-strike damage is dealt.', ref: { lesson: 'combat', section: 'damage' } },
  combat_damage: { line: 'All remaining combat damage is dealt at the same time.', canDo: 'Instants, after damage is dealt.', ref: { lesson: 'combat', section: 'damage' } },
  end_of_combat: { line: '"Until end of combat" effects wear off.', canDo: 'Instants and abilities.', ref: { lesson: 'the-turn', section: 'combat' } },
  end_step: { line: '"At the beginning of your end step" triggers happen.', canDo: 'The last chance for instants this turn.', ref: { lesson: 'the-turn', section: 'end' } },
  cleanup: { line: 'Discard down to seven; damage heals; "until end of turn" ends.', canDo: 'Normally nothing; the turn passes.', ref: { lesson: 'the-turn', section: 'end' } },
};

/**
 * Every prompt the Forge bridge can send, explained. scripts/test-lessons.ts discovers the
 * set the overlay renders and fails if any is missing here, so a new prompt cannot ship
 * without a line for the Apprentice.
 */
export const PROMPT_GUIDE: Record<string, PromptGuide> = {
  choose_action: { what: 'You have priority: the engine is asking what you want to do.', how: 'Tap a card in your hand or on the board to play it, or press Pass to let the game move on.', ref: { lesson: 'the-stack', section: 'priority' } },
  mulligan: { what: 'Your opening hand. Keep it or shuffle for a new one.', how: 'Keep, or Mulligan to draw seven again. After the first free one, each mulligan costs a card.', ref: { lesson: 'mulligans', section: 'the-rule' } },
  mulligan_tuck: { what: 'After a mulligan you put one card per mulligan on the bottom of your library.', how: 'Pick the cards you can spare most, then confirm.', ref: { lesson: 'mulligans', section: 'the-rule' } },
  confirm_action: { what: 'A yes-or-no question about an optional effect.', how: 'Read the card text in the prompt, then confirm or decline.', ref: { lesson: 'the-stack', section: 'triggers' } },
  confirm_replacement: { what: 'A replacement effect applies; the engine asks whether to use it (for example, sending your commander back to the command zone).', how: 'Yes uses the replacement, No lets the original event happen.', ref: { lesson: 'command-zone', section: 'returning' } },
  play_trigger: { what: 'A "may" triggered ability is asking whether it should happen.', how: 'Yes puts the ability on the stack; No skips it this time.', ref: { lesson: 'the-stack', section: 'triggers' } },
  put_on_top: { what: 'A card can go to the top or the bottom of a library.', how: 'Top if you want to draw it soon, bottom to bury it.', ref: { lesson: 'keywords' } },
  choose_cards: { what: 'Pick cards from a list, within the minimum and maximum shown.', how: 'Tap cards to select them, then confirm.', ref: { lesson: 'card-types', section: 'spells' } },
  choose_entities: { what: 'Pick one or more objects or players.', how: 'Tap to select, then confirm.' },
  choose_permanents_sacrifice: { what: 'You must sacrifice permanents: they go to your graveyard and cannot be saved.', how: 'Choose what you can most afford to lose, then confirm.', ref: { lesson: 'card-types', section: 'permanents' } },
  choose_permanents_destroy: { what: 'Choose permanents to be destroyed.', how: 'Tap to select the required number, then confirm.', ref: { lesson: 'card-types', section: 'permanents' } },
  choose_discard: { what: 'Discard from your hand: the cards go to your graveyard.', how: 'Tap the cards you will miss least, then confirm. Lands you cannot use and expensive spells are usual picks.', ref: { lesson: 'the-turn', section: 'end' } },
  choose_cards_zone: { what: 'Pick cards from a zone such as your library or graveyard.', how: 'Tap to select, then confirm. A tutor lets you fetch exactly what the situation needs.', ref: { lesson: 'card-types', section: 'permanents' } },
  choose_single_card_zone: { what: 'Pick exactly one card from a zone.', how: 'Tap the card, then confirm.' },
  choose_single_entity: { what: 'Pick exactly one object or player.', how: 'Tap it, then confirm.' },
  choose_targets: { what: 'A spell or ability needs targets. Only legal targets are offered.', how: 'Tap the highlighted cards or seats until the required number is chosen, then confirm.', ref: { lesson: 'the-stack', section: 'stack' } },
  declare_attackers: { what: 'Choose which creatures attack, and whom each one attacks.', how: 'Tap a creature, then the opponent or planeswalker it attacks. Attackers tap unless they have vigilance. Confirm with no attackers to skip combat.', ref: { lesson: 'combat', section: 'attacking' } },
  declare_blockers: { what: 'Creatures are attacking you. Assign blockers.', how: 'Tap a blocker, then the attacker it blocks. Several blockers may block one attacker. Confirm with none to take the damage.', ref: { lesson: 'combat', section: 'blocking' } },
  assign_combat_damage: { what: 'An attacker is blocked by several creatures; divide its damage.', how: 'Assign at least lethal damage to each blocker in order before moving to the next; trample lets the rest hit the player.', ref: { lesson: 'combat', section: 'damage' } },
  scry: { what: 'Look at the top cards of your library.', how: 'Send cards you do not want to the bottom; the rest go back on top in the order you choose.', ref: { lesson: 'keywords' } },
  choose_type: { what: 'Name a card type, creature type or colour for an effect.', how: 'Pick the one that matters most on this board.' },
  choose_modes: { what: 'A modal spell: choose which of its effects happen.', how: 'Pick the number of modes the card allows, then confirm.', ref: { lesson: 'card-types', section: 'spells' } },
  choose_ability: { what: 'The card has several abilities that could apply; choose one.', how: 'Pick the ability to activate.' },
  choose_single_spell: { what: 'Choose one spell from several the effect could cast.', how: 'Tap the spell you want.' },
  choose_spell_abilities: { what: 'A card can be cast or activated in more than one way (kicker, adventure, flashback).', how: 'Pick the mode; the cost shown is what you will pay.', ref: { lesson: 'mana', section: 'paying' } },
  choose_order: { what: 'Several things happen at once; you choose their order.', how: 'Drag or tap into order. The first in the list resolves first.', ref: { lesson: 'the-stack', section: 'triggers' } },
  announce_number: { what: 'The spell needs a number, usually X.', how: 'Choose a value you can pay for; the mana is asked for next.', ref: { lesson: 'mana', section: 'paying' } },
  choose_binary: { what: 'A two-way choice named by the card.', how: 'Pick either option.' },
  choose_color: { what: 'Name a colour.', how: 'Pick the colour that fits the effect and the board.' },
  mana_payment: { what: 'Pay for what you chose. The engine lists what can produce mana.', how: 'Tap lands and rocks one at a time until the cost is met. A Phyrexian symbol such as {U/P} can be paid with two life instead. Cancel to back out and keep the mana unspent.', ref: { lesson: 'mana', section: 'paying' } },
  choose_mana_combo: { what: 'A source makes several mana at once in any mix of its colours, like Vivi Ornitier or a "any combination of" ability.', how: 'Split the amount across the colours with the steppers to match what you are about to pay, then confirm.', ref: { lesson: 'mana', section: 'paying' } },
};

/** "Why?" beside each deck-check issue. */
export const ISSUE_GUIDE: IssueGuideMap = {
  'no-commander': { lesson: 'deck-building', section: 'commander-choice' },
  'bad-commander': { lesson: 'deck-building', section: 'commander-choice' },
  size: { lesson: 'deck-building', section: 'size' },
  duplicate: { lesson: 'deck-building', section: 'singleton' },
  'off-identity': { lesson: 'deck-building', section: 'colour-identity' },
  unknown: { lesson: 'deck-building', section: 'playable' },
  'not-legal': { lesson: 'deck-building', section: 'playable' },
  'not-in-forge': { lesson: 'deck-building', section: 'playable' },
};

/** Notes that fire once per game when something happens for the first time. */
export interface ApprenticeNote {
  id: string;
  text: string;
  ref: LessonRef;
}

export const NOTES: Record<'stack' | 'commander-cast' | 'low-life' | 'poison' | 'commander-damage', ApprenticeNote> = {
  stack: { id: 'stack', text: 'Something is on the stack. It has not happened yet: anyone can respond before it resolves, and the last thing added resolves first.', ref: { lesson: 'the-stack', section: 'stack' } },
  'commander-cast': { id: 'commander-cast', text: 'Your commander has left the command zone. If it would die or be exiled you can send it back, and casting it again costs {2} more each time.', ref: { lesson: 'command-zone', section: 'returning' } },
  'low-life': { id: 'low-life', text: 'You are at 10 life or less. Every unblocked attacker counts now; keep blockers back and hold removal for the biggest threat.', ref: { lesson: 'life', section: 'life-total' } },
  poison: { id: 'poison', text: 'Seven or more poison counters. Ten loses the game whatever your life total, and proliferate adds more.', ref: { lesson: 'life', section: 'poison' } },
  'commander-damage': { id: 'commander-damage', text: 'One commander has dealt you 15 or more combat damage. At 21 from that commander you lose, regardless of life.', ref: { lesson: 'life', section: 'commander-damage' } },
};

export function lessonHref(ref: LessonRef): string {
  return `/learn/${ref.lesson}${ref.section ? `#${ref.section}` : ''}`;
}
