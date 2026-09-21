/**
 * Regression tests for the decklist parser.
 *
 * Run: npm run test:parser
 *
 * These cover the real export formats players paste in. The parser previously stripped every
 * `//` line as a comment, so a stock Moxfield export — which marks the commander with a
 * `// Commander` header — imported with no commander at all, and set codes / collector numbers
 * stayed glued to the card name so nothing resolved.
 */
import { parseDecklist } from '../src/store/deckStore';

interface Case {
  name: string;
  input: string;
  commander: string;
  entries: number;
}

const cases: Case[] = [
  {
    name: 'Arena export — foil marker after the printing, a name ending in a year, a sideboard',
    input: `// COMMANDER
1 Cosmic Spider-Man (SPM) 127

1 Gwenom, Remorseless (SPM) 286 *F*
1 Spider-Man 2099 (SPM) 150
1 SP//dr, Piloted by Peni (SPM) 147
2 Forest (SOS) 280

// SIDEBOARD
1 Web-Warriors (SPM) 159`,
    commander: 'Cosmic Spider-Man',
    entries: 5,
  },
  {
    name: 'Moxfield — commander alone in the first block',
    input: `1 Atraxa, Praetors' Voice (CMR) 1

1 Sol Ring (LTR) 305
1 Arcane Signet (ELD) 331
3 Forest (UNF) 235`,
    commander: "Atraxa, Praetors' Voice",
    entries: 4,
  },
  {
    name: 'Moxfield — // Commander section header',
    input: `// Commander
1 Kenrith, the Returned King

// Creatures (2)
1 Birds of Paradise
1 Llanowar Elves

// Lands (1)
1 Command Tower`,
    commander: 'Kenrith, the Returned King',
    entries: 4,
  },
  {
    name: 'Archidekt — [Commander{top}] category brackets',
    input: `1x Atraxa, Praetors' Voice (cmr) 1 [Commander{top}]
1x Sol Ring (c21) 263 [Ramp]
1x Cultivate (m21) 177 [Ramp]`,
    commander: "Atraxa, Praetors' Voice",
    entries: 3,
  },
  {
    name: 'Explicit "Commander:" prefix still works',
    input: `Commander: Krenko, Mob Boss
1 Sol Ring
2 Mountain`,
    commander: 'Krenko, Mob Boss',
    entries: 3,
  },
  {
    name: '*CMDR* inline marker',
    input: `1 Muldrotha, the Gravetide *CMDR*
1 Sol Ring`,
    commander: 'Muldrotha, the Gravetide',
    entries: 2,
  },
  {
    name: 'Category headers and sideboard are skipped',
    input: `Creatures (2)
1 Birds of Paradise
1 Llanowar Elves

SIDEBOARD:
1 Naturalize`,
    commander: '',
    entries: 2,
  },
  {
    name: 'Plain list with no commander marker',
    input: `1 Sol Ring
1 Cultivate
1 Forest`,
    commander: '',
    entries: 3,
  },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const { cards, commanderName } = parseDecklist(c.input);
  const problems: string[] = [];

  if (commanderName !== c.commander) {
    problems.push(`commander: got ${JSON.stringify(commanderName)}, want ${JSON.stringify(c.commander)}`);
  }
  if (cards.length !== c.entries) {
    problems.push(`entries: got ${cards.length}, want ${c.entries}`);
  }
  // No card name should retain set codes, collector numbers, brackets or markers. A name may
  // end in a four-digit year ("Spider-Man 2099"), never in a one-to-three-digit number.
  const unclean = cards.filter((x) => /[()[\]*]|(?<!\d)\d{1,3}$|\bCMDR\b/i.test(x.cardName));
  if (c.name.startsWith('Arena export')) {
    const names = cards.map((x) => x.cardName);
    if (!names.includes('Gwenom, Remorseless')) problems.push('foil marker not stripped: ' + JSON.stringify(names));
    if (!names.includes('Spider-Man 2099')) problems.push('the year was stripped from Spider-Man 2099: ' + JSON.stringify(names));
    if (!names.includes('SP//dr, Piloted by Peni')) problems.push('a // in a single-faced name was mangled');
    if (names.includes('Web-Warriors')) problems.push('the sideboard was imported');
  }
  if (unclean.length > 0) {
    problems.push(`unclean names: ${JSON.stringify(unclean.map((x) => x.cardName))}`);
  }

  if (problems.length === 0) {
    pass++;
    console.log(`PASS  ${c.name}`);
  } else {
    fail++;
    console.log(`FAIL  ${c.name}`);
    for (const p of problems) console.log(`        ${p}`);
    console.log(`        parsed: ${JSON.stringify(cards.map((x) => `${x.quantity} ${x.cardName}`))}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
