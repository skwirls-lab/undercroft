import type { ManaCost, ManaPool, ManaColor } from './types';

const MANA_SYMBOL_REGEX = /\{([WUBRGCX0-9]+)\}/g;

export function parseManaCost(manaCostString: string): ManaCost {
  const cost: ManaCost = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0, X: 0 };

  if (!manaCostString) return cost;

  let match;
  MANA_SYMBOL_REGEX.lastIndex = 0;
  while ((match = MANA_SYMBOL_REGEX.exec(manaCostString)) !== null) {
    const symbol = match[1];
    if (symbol === 'W') cost.W++;
    else if (symbol === 'U') cost.U++;
    else if (symbol === 'B') cost.B++;
    else if (symbol === 'R') cost.R++;
    else if (symbol === 'G') cost.G++;
    else if (symbol === 'C') cost.C++;
    else if (symbol === 'X') cost.X++;
    else {
      const num = parseInt(symbol, 10);
      if (!isNaN(num)) cost.generic += num;
    }
  }

  return cost;
}

export function canPayManaCost(pool: ManaPool, cost: ManaCost): boolean {
  const remaining = { ...pool };

  // Pay colored costs first
  const colors: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];
  for (const color of colors) {
    if (remaining[color] < cost[color]) return false;
    remaining[color] -= cost[color];
  }

  // Pay colorless requirement
  if (remaining.C < cost.C) {
    // Can use any remaining colored mana for colorless
    const totalRemaining =
      remaining.W + remaining.U + remaining.B + remaining.R + remaining.G + remaining.C;
    if (totalRemaining < cost.C) return false;
    // Deduct colorless first
    let needed = cost.C;
    needed -= remaining.C;
    remaining.C = 0;
    // Use colored mana for remaining colorless need
    for (const color of colors) {
      const used = Math.min(remaining[color], needed);
      remaining[color] -= used;
      needed -= used;
      if (needed <= 0) break;
    }
  } else {
    remaining.C -= cost.C;
  }

  // Pay generic costs from any remaining mana
  const totalRemaining =
    remaining.W + remaining.U + remaining.B + remaining.R + remaining.G + remaining.C;
  return totalRemaining >= cost.generic;
}

export function payManaCost(pool: ManaPool, cost: ManaCost): ManaPool | null {
  if (!canPayManaCost(pool, cost)) return null;

  const remaining = { ...pool };
  const colors: ManaColor[] = ['W', 'U', 'B', 'R', 'G'];

  // Pay colored costs
  for (const color of colors) {
    remaining[color] -= cost[color];
  }

  // Pay colorless
  let colorlessNeeded = cost.C;
  const colorlessFromC = Math.min(remaining.C, colorlessNeeded);
  remaining.C -= colorlessFromC;
  colorlessNeeded -= colorlessFromC;
  for (const color of colors) {
    const used = Math.min(remaining[color], colorlessNeeded);
    remaining[color] -= used;
    colorlessNeeded -= used;
    if (colorlessNeeded <= 0) break;
  }

  // Pay generic
  let genericNeeded = cost.generic;
  remaining.C -= Math.min(remaining.C, genericNeeded);
  genericNeeded -= Math.min(pool.C - (pool.C - remaining.C), genericNeeded);
  // Recalc: just use C first then colors
  genericNeeded = cost.generic;
  const gFromC = Math.min(remaining.C, genericNeeded);
  remaining.C -= gFromC;
  genericNeeded -= gFromC;
  for (const color of colors) {
    const used = Math.min(remaining[color], genericNeeded);
    remaining[color] -= used;
    genericNeeded -= used;
    if (genericNeeded <= 0) break;
  }

  return remaining;
}

export function addMana(pool: ManaPool, color: ManaColor | 'C', amount: number = 1): ManaPool {
  return { ...pool, [color]: pool[color] + amount };
}

export function emptyManaPool(): ManaPool {
  return { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
}

export function totalMana(pool: ManaPool): number {
  return pool.W + pool.U + pool.B + pool.R + pool.G + pool.C;
}

export function convertedManaCost(cost: ManaCost): number {
  return cost.W + cost.U + cost.B + cost.R + cost.G + cost.C + cost.generic;
}

export function getManaCostString(cost: ManaCost): string {
  let result = '';
  if (cost.X > 0) result += '{X}'.repeat(cost.X);
  if (cost.generic > 0) result += `{${cost.generic}}`;
  if (cost.W > 0) result += '{W}'.repeat(cost.W);
  if (cost.U > 0) result += '{U}'.repeat(cost.U);
  if (cost.B > 0) result += '{B}'.repeat(cost.B);
  if (cost.R > 0) result += '{R}'.repeat(cost.R);
  if (cost.G > 0) result += '{G}'.repeat(cost.G);
  if (cost.C > 0) result += '{C}'.repeat(cost.C);
  return result || '{0}';
}
