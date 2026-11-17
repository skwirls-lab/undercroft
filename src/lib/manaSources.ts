/**
 * What a mana source makes, as symbols to draw on the payment prompt.
 *
 * The prompt used to list sources by name ("Island", "Sol Ring", "Command Tower") and the cost
 * as "{2}{U}{U}". A new player does not know that U is blue or that a bracketed number is
 * generic, and nothing said what each source would tap for. The server now sends `produces`
 * ("W", "U", "Any", ...) and `amount` per source; for an older server the rules text says
 * the same thing in words, and this reads it.
 */

export interface ManaSourceLike {
  /** From the server: symbols one tap can make. "Any" means any colour. */
  produces?: string[];
  /** From the server: the most mana one ability makes (Sol Ring: 2). */
  amount?: number;
  oracleText?: string;
}

export const ANY_MANA = 'ANY';

const WORD_COUNT: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Symbols from rules text: "{T}: Add {C}{C}." → C C; "Add one mana of any color" → ANY. */
export function manaSymbolsFromOracle(oracleText: string | undefined | null): string[] {
  if (!oracleText) return [];
  const out: string[] = [];
  const text = oracleText.replace(/\n/g, ' ');
  // Each "Add …" clause up to the end of its sentence.
  const clause = /\badd\b([^.]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = clause.exec(text)) !== null) {
    const body = m[1];
    const symbols = [...body.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1]);
    if (symbols.length > 0) {
      for (const s of symbols) out.push(s);
      continue;
    }
    const any = /\b(one|two|three|four|five|an amount of|x) mana of any (?:one )?(?:colou?r|type)/i.exec(body)
      ?? /\b(one|two|three|four|five|x) mana in any combination of colou?rs/i.exec(body)
      ?? /\bmana of any (?:one )?(?:colou?r|type)/i.exec(body);
    if (any) {
      const n = WORD_COUNT[(any[1] ?? 'one').toLowerCase()] ?? 1;
      for (let i = 0; i < n; i++) out.push(ANY_MANA);
    }
  }
  return out.slice(0, 6);
}

/**
 * The pips for one source. The server's `produces` wins; a single symbol with amount > 1 is
 * repeated (Sol Ring shows two colourless pips). Falls back to the rules text.
 */
export function manaSourceSymbols(source: ManaSourceLike, fallbackOracle?: string | null): string[] {
  const produces = (source.produces ?? []).map((p) => (p.toLowerCase() === 'any' ? ANY_MANA : p.toUpperCase())).filter((p) => p === ANY_MANA || 'WUBRGC'.includes(p));
  if (produces.length > 0) {
    const amount = source.amount ?? 1;
    if (produces.length === 1 && amount > 1) return Array.from({ length: Math.min(amount, 6) }, () => produces[0]);
    return produces;
  }
  const parsed = manaSymbolsFromOracle(source.oracleText ?? fallbackOracle);
  return parsed.length > 0 ? parsed : ['C'];
}

/** "blue", "any colour", "two colourless", for a tooltip or screen reader. */
export function describeManaSymbols(symbols: string[]): string {
  const names: Record<string, string> = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colourless', [ANY_MANA]: 'any colour' };
  const counts = new Map<string, number>();
  for (const s of symbols) counts.set(s, (counts.get(s) ?? 0) + 1);
  const words = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
  return [...counts.entries()].map(([s, n]) => `${n > 1 ? `${words[n] ?? n} ` : ''}${names[s] ?? s}`).join(' or ');
}
