/**
 * Apprentice mode is data, so the checks are about completeness: every phase and step has a
 * guide, every server prompt the overlay renders has a PROMPT_GUIDE entry, every quiz answer
 * is in range, every lesson link lands on a lesson and a section that exist.
 *
 * Run: npm run test:lessons
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LESSONS, LESSON_BY_ID, PHASE_GUIDE, STEP_GUIDE, PROMPT_GUIDE, ISSUE_GUIDE, NOTES, KEYWORDS, lessonHref } from '../src/content/lessons';
import type { LessonRef } from '../src/content/lessons';
import { toBlocks } from '../src/components/Prose';

let failures = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) console.log(`  ✓ ${name}`);
  else { failures++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}
function refOk(ref: LessonRef): string | null {
  const lesson = LESSON_BY_ID.get(ref.lesson);
  if (!lesson) return `no lesson "${ref.lesson}"`;
  if (ref.section && !lesson.sections.some((s) => s.id === ref.section)) return `no section "${ref.section}" in ${ref.lesson}`;
  return null;
}

console.log('lessons');
check('at least ten lessons', LESSONS.length >= 10, String(LESSONS.length));
check('ids are unique', new Set(LESSONS.map((l) => l.id)).size === LESSONS.length);
for (const l of LESSONS) {
  check(`${l.id}: has sections with unique ids`, l.sections.length > 0 && new Set(l.sections.map((s) => s.id)).size === l.sections.length);
  check(`${l.id}: every section body renders to blocks (glossary is generated)`, l.sections.every((s) => l.id === 'keywords' || toBlocks(s.body).length > 0));
  for (const q of l.quiz ?? []) {
    check(`${l.id}: quiz answer in range — "${q.q.slice(0, 40)}…"`, q.answer >= 0 && q.answer < q.choices.length && q.choices.length >= 2 && !!q.why);
  }
}
check('the glossary has entries, sorted by name at render', KEYWORDS.length >= 20 && new Set(KEYWORDS.map((k) => k.name)).size === KEYWORDS.length);

console.log('phase and step guides');
const PHASES = ['beginning', 'precombat_main', 'combat', 'postcombat_main', 'ending'] as const;
const STEPS = ['untap', 'upkeep', 'draw', 'main', 'beginning_of_combat', 'declare_attackers', 'declare_blockers', 'first_strike_damage', 'combat_damage', 'end_of_combat', 'end_step', 'cleanup'] as const;
for (const p of PHASES) check(`phase ${p} has a guide with a valid link`, !!PHASE_GUIDE[p]?.line && refOk(PHASE_GUIDE[p].ref) === null, refOk(PHASE_GUIDE[p].ref) ?? '');
for (const s of STEPS) check(`step ${s} has a guide with a valid link`, !!STEP_GUIDE[s]?.line && !!STEP_GUIDE[s].canDo && refOk(STEP_GUIDE[s].ref) === null, refOk(STEP_GUIDE[s].ref) ?? '');

// The adapter's STEP_MAP is the ground truth for which steps a Forge game can reach.
const adapter = readFileSync(resolve(process.cwd(), 'src/lib/forgeStateAdapter.ts'), 'utf8');
const mappedSteps = [...adapter.matchAll(/'[A-Z_0-9]+':\s*'([a-z_]+)'/g)].map((m) => m[1]).filter((s) => (STEPS as readonly string[]).includes(s));
check('every step the adapter can produce is in STEP_GUIDE', mappedSteps.every((s) => s in STEP_GUIDE), mappedSteps.filter((s) => !(s in STEP_GUIDE)).join(','));

console.log('prompt guides');
// Discovered the way check-protocol.mjs does: every choiceType the overlay renders.
const overlay = readFileSync(resolve(process.cwd(), 'src/components/game/ForgeChoiceOverlay.tsx'), 'utf8');
const rendered = new Set<string>();
for (const m of overlay.matchAll(/choiceType === '([a-z_]+)'/g)) rendered.add(m[1]);
for (const block of overlay.matchAll(/\[([^\]]*?)\]\.includes\(choiceType\)/g)) {
  for (const m of block[1].matchAll(/'([a-z_]+)'/g)) rendered.add(m[1]);
}
check('the overlay renders a known set of prompts', rendered.size >= 25, String(rendered.size));
const missing = [...rendered].filter((t) => !PROMPT_GUIDE[t]);
check('every rendered prompt has a PROMPT_GUIDE entry', missing.length === 0, `missing: ${missing.join(', ')}`);
const stale = Object.keys(PROMPT_GUIDE).filter((t) => !rendered.has(t));
check('no PROMPT_GUIDE entry for a prompt the overlay does not render', stale.length === 0, `stale: ${stale.join(', ')}`);
for (const [t, g] of Object.entries(PROMPT_GUIDE)) {
  const bad = g.ref ? refOk(g.ref) : null;
  check(`${t}: what + how, link valid`, !!g.what && !!g.how && bad === null, bad ?? '');
}

console.log('issue guides and notes');
const KINDS = ['no-commander', 'bad-commander', 'size', 'duplicate', 'off-identity', 'unknown', 'not-legal', 'not-in-forge'] as const;
for (const k of KINDS) check(`issue ${k} links to a lesson section`, refOk(ISSUE_GUIDE[k]) === null, refOk(ISSUE_GUIDE[k]) ?? '');
for (const n of Object.values(NOTES)) check(`note ${n.id} links to a lesson section`, !!n.text && refOk(n.ref) === null, refOk(n.ref) ?? '');
check('lessonHref builds a deep link', lessonHref({ lesson: 'the-turn', section: 'combat' }) === '/learn/the-turn#combat' && lessonHref({ lesson: 'keywords' }) === '/learn/keywords');

console.log(failures === 0 ? '\nAll lesson tests passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
