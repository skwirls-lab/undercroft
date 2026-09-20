/**
 * Every tour, every step, at phone and desktop: the step's target is on the page and inside
 * the viewport while its card is showing, and Next reaches the end. Screenshots a few steps.
 *
 *   NEXT_PUBLIC_DEV_MOCK_AUTH=1 npx next dev -p 3100   (in another terminal)
 *   node scripts/test-tours.mjs [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const outDir = process.argv[2] ?? 'screenshots';
const executablePath = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const TOURS = [
  { name: 'vault', path: '/decks?tour=vault', shots: [0, 3] },
  { name: 'deck', path: '/decks/mock-atraxa?tour=deck', shots: [1, 3] },
  { name: 'setup', path: '/game?deck=mock-atraxa&tour=setup', shots: [2] },
  { name: 'board', path: '/dev/board?tour=board', shots: [2, 4, 7] },
];
const VIEWPORTS = [
  { tag: 'phone', width: 390, height: 844, mobile: true },
  { tag: 'desktop', width: 1440, height: 900, mobile: false },
];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath });
let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => { failures++; console.log(`  ✗ ${msg}`); };

for (const vp of VIEWPORTS) {
  for (const tour of TOURS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    console.log(`${tour.name}@${vp.tag}`);
    try {
      await page.goto(BASE + tour.path, { waitUntil: 'networkidle', timeout: 30000 });
      await page.locator('[data-tour-overlay]').waitFor({ timeout: 8000 });
      let steps = 0;
      for (let guard = 0; guard < 20; guard++) {
        const overlay = page.locator('[data-tour-overlay]');
        if (!(await overlay.count())) break;
        const target = await overlay.getAttribute('data-tour-target');
        const stepIdx = Number(await overlay.getAttribute('data-tour-step'));
        await page.waitForTimeout(350);
        const info = await page.evaluate(({ target }) => {
          const els = [...document.querySelectorAll(`[data-tour="${target}"]`)];
          const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          if (!el) return { found: false };
          const r = el.getBoundingClientRect();
          const inView = r.top >= -2 && r.left >= -2 && r.bottom <= window.innerHeight + 2 && r.right <= window.innerWidth + 2;
          const card = document.querySelector('[data-tour-card]')?.getBoundingClientRect();
          const cardIn = !!card && card.top >= 0 && card.bottom <= window.innerHeight + 1 && card.left >= 0 && card.right <= window.innerWidth + 1;
          // The card must not cover the target.
          const overlap = !!card && !(card.right < r.left || card.left > r.right || card.bottom < r.top || card.top > r.bottom);
          return { found: true, inView, cardIn, overlap };
        }, { target });
        if (!info.found) bad(`step ${stepIdx} (${target}): target not found`);
        else if (!info.inView) bad(`step ${stepIdx} (${target}): target outside the viewport`);
        else if (!info.cardIn) bad(`step ${stepIdx} (${target}): card outside the viewport`);
        else if (info.overlap) bad(`step ${stepIdx} (${target}): card covers the target`);
        else ok(`step ${stepIdx} (${target})`);
        if (tour.shots.includes(stepIdx)) await page.screenshot({ path: join(outDir, `tour-${tour.name}-${stepIdx}-${vp.tag}.png`) });
        steps++;
        await page.locator('[data-tour-next]').click();
        await page.waitForTimeout(250);
      }
      if (await page.locator('[data-tour-overlay]').count()) bad('tour did not finish after Next on every step');
      else ok(`finished after ${steps} steps`);
    } catch (err) {
      bad(`${tour.name}@${vp.tag}: ${String(err.message).split('\n')[0]}`);
    }
    await ctx.close();
  }
}
await browser.close();
console.log(failures === 0 ? '\nAll tour checks passed.' : `\n${failures} failure(s).`);
process.exit(failures === 0 ? 0 : 1);
