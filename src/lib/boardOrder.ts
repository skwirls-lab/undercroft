/**
 * The order of the "Other" row on a board: every non-creature, non-land, non-planeswalker
 * permanent. Left to the engine's order it was the order things were played, so a Sol Ring,
 * a Rhystic Study, an unattached Sword and a Doubling Season interleaved at random. One row
 * per type would cost the board a row of height each; sorting the one row by type costs
 * nothing and groups what belongs together.
 *
 * Groups, left to right: equipment, mana rocks, other artifacts, enchantments, battles, the
 * rest. Alphabetical within a group, so copies sit side by side. Pure, so it can be tested.
 */

/** The little a card needs to be filed: its name, type line and rules text. */
export interface Filable { cardData: { name: string; typeLine: string; oracleText?: string } }

export type OtherGroup = 'equipment' | 'mana' | 'artifact' | 'enchantment' | 'battle' | 'other';

const ORDER: OtherGroup[] = ['equipment', 'mana', 'artifact', 'enchantment', 'battle', 'other'];

export function otherGroup(card: Filable): OtherGroup {
  const t = card.cardData.typeLine.toLowerCase();
  const oracle = (card.cardData.oracleText ?? '').toLowerCase();
  if (t.includes('equipment') || t.includes('fortification')) return 'equipment';
  if (t.includes('artifact')) {
    // A mana rock: its own text adds mana ("{T}: Add {C}{C}.", "Add one mana of any color").
    if (/\badd (\{|one mana|two mana|three mana|x mana|an amount of mana)/.test(oracle)) return 'mana';
    return 'artifact';
  }
  if (t.includes('enchantment')) return 'enchantment';
  if (t.includes('battle')) return 'battle';
  return 'other';
}

/** A stable sort: group order first, then name. Cards the caller passes in stay the same objects. */
export function sortOtherPermanents<T extends Filable>(cards: readonly T[]): T[] {
  return cards
    .map((card, i) => ({ card, i, rank: ORDER.indexOf(otherGroup(card)) }))
    .sort((a, b) => a.rank - b.rank || a.card.cardData.name.localeCompare(b.card.cardData.name) || a.i - b.i)
    .map((x) => x.card);
}
