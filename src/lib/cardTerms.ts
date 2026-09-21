/**
 * Short explanations for the tags on a card: its keywords and its counters.
 *
 * Keywords come from the Apprentice's glossary (one source, so the reader and the lesson
 * agree). A keyword the engine reports with a value — "Ward:2", "Equip:{3}", "Scry 2" — is
 * matched to its glossary entry by its first word, and the value is kept in the label.
 */

import { KEYWORDS } from '@/content/lessons/keywords';

const KEYWORD_INDEX = new Map<string, string>(
  KEYWORDS.map((k) => [k.name.split(/[\s{:]/)[0].toLowerCase(), k.text]),
);

/** "Ward:2" → "Ward 2"; "Equip:{3}" → "Equip {3}"; "Flying" → "Flying". */
export function keywordLabel(raw: string): string {
  return raw.replace(/:/g, ' ').replace(/\s+/g, ' ').trim();
}

/** What a keyword does, or null when the glossary has nothing for it. */
export function keywordBlurb(raw: string): string | null {
  const first = keywordLabel(raw).split(' ')[0].toLowerCase();
  return KEYWORD_INDEX.get(first) ?? null;
}

const COUNTER_BLURBS: Array<[RegExp, string]> = [
  [/^\+1\/\+1$/, 'Each one makes this creature +1 power and +1 toughness for as long as it stays on the battlefield.'],
  [/^-1\/-1$/, 'Each one makes this creature −1 power and −1 toughness. A creature with toughness 0 or less dies.'],
  [/^loyalty$/i, 'A planeswalker\'s life. Its abilities add or spend loyalty; at zero it goes to the graveyard.'],
  [/^charge$/i, 'Charge counters are fuel for the card\'s own text: it will say what they do.'],
  [/^shield$/i, 'The next time this would be dealt damage or destroyed, remove a shield counter instead.'],
  [/^stun$/i, 'While it has a stun counter, it does not untap; one counter is removed each time it would untap.'],
  [/^poison$/i, 'Ten poison counters and the player loses the game.'],
  [/^lore$/i, 'A Saga\'s chapter marker: it gains one each turn and triggers the matching chapter.'],
  [/^oil$/i, 'Oil counters are fuel for the card\'s own text: it will say what they do.'],
  [/^experience$/i, 'Experience counters stay with the player and power certain commanders.'],
  [/^flying|first strike|deathtouch|hexproof|lifelink|trample|vigilance|menace|reach|indestructible|double strike|haste$/i, 'A keyword counter: the creature has that ability for as long as it keeps the counter.'],
  [/^time$/i, 'Time counters count down a suspended or vanishing card; the last one leaving triggers it.'],
  [/^level$/i, 'Level counters raise a leveler creature to its next tier.'],
  [/^age$/i, 'Age counters make a cumulative-upkeep cost bigger each turn.'],
];

/** What a counter type means. Falls back to a line that still says something true. */
export function counterBlurb(type: string): string {
  for (const [re, text] of COUNTER_BLURBS) if (re.test(type.trim())) return text;
  return `${type} counters are fuel for the card's own text: it will say what they do.`;
}
