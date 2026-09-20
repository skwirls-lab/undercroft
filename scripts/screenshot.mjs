/**
 * Screenshot sweep of every screen at phone and desktop size.
 *
 *   NEXT_PUBLIC_DEV_MOCK_AUTH=1 npx next dev -p 3100   (in another terminal)
 *   node scripts/screenshot.mjs [outDir] [--only=board]
 *
 * Needs the dev server running in mock-auth mode so signed-in screens render.
 * Reports any page whose document scrolls vertically at either size, because the game
 * screen is supposed to fit the viewport exactly.
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3100';
const outDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'screenshots';
const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');

const SCREENS = [
  { name: 'landing', path: '/', signedOut: true },
  { name: 'dashboard', path: '/' },
  { name: 'decks', path: '/decks' },
  { name: 'decks-shelf', path: '/decks', click: '[role="tab"]:has-text("Tournament")' },
  { name: 'deck-detail', path: '/decks/mock-atraxa' },
  { name: 'deck-detail-edit', path: '/decks/mock-atraxa', click: 'button:has-text("Edit")' },
  { name: 'deck-detail-read', path: '/decks/mock-atraxa', click: '[data-card-tile]:nth-of-type(1)' },
  { name: 'deck-detail-search', path: '/decks/mock-atraxa?edit=1', type: ['[data-dev-search]', 'so'] },
  { name: 'deck-detail-check', path: '/decks/mock-atraxa', click: '[data-dev-check]' },
  { name: 'deck-detail-menu', path: '/decks/mock-atraxa', click: 'button[aria-label="More actions"]' },
  { name: 'new-deck', path: '/decks', click: '[data-dev-new-deck]', type: ['[data-dev-cmdr-search]', 'kre'] },
  { name: 'setup', path: '/game?deck=mock-atraxa' },
  { name: 'setup-opponent', path: '/game?deck=mock-atraxa', click: '[data-dev-seat="0"]' },
  { name: 'settings', path: '/', click: 'button[aria-label="Settings"]:visible' },
  { name: 'board', path: '/dev/board' },
  { name: 'board-me', path: '/dev/board?open=me' },
  { name: 'board-opp', path: '/dev/board?open=ai-2' },
  { name: 'inspect-me', path: '/dev/board?inspect=me' },
  { name: 'inspect-me-read', path: '/dev/board?inspect=me', click: '[data-dev-inspector] [data-card-preview-safe]:nth-of-type(1)' },
  { name: 'inspect-opp', path: '/dev/board?inspect=ai-2' },
  { name: 'prompt-tutor', path: '/dev/board?choice=tutor' },
  { name: 'prompt-tutor-read', path: '/dev/board?choice=tutor', click: '.prompt-panel [data-card-preview-safe]:nth-of-type(1)' },
  { name: 'prompt-discard', path: '/dev/board?choice=discard' },
  { name: 'prompt-confirm', path: '/dev/board?choice=confirm' },
  { name: 'prompt-modes', path: '/dev/board?choice=modes' },
  { name: 'prompt-targets', path: '/dev/board?choice=targets' },
];

const VIEWPORTS = [
  { tag: 'phone', width: 390, height: 844, mobile: true },
  { tag: 'desktop', width: 1440, height: 900, mobile: false },
];

const executablePath = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath });
const problems = [];

for (const vp of VIEWPORTS) {
  for (const screen of SCREENS) {
    if (only && !screen.name.startsWith(only)) continue;
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const url = BASE + screen.path + (screen.signedOut ? (screen.path.includes('?') ? '&' : '?') + 'signedOut=1' : '');
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(900);
      if (screen.click) {
        await page.locator(screen.click).first().click();
        await page.waitForTimeout(600);
      }
      if (screen.type) {
        await page.locator(screen.type[0]).first().fill(screen.type[1]);
        await page.waitForTimeout(900);
      }
      const file = join(outDir, `${screen.name}-${vp.tag}.png`);
      await page.screenshot({ path: file });

      // Vertical scroll audit — the game board must never scroll.
      const scroll = await page.evaluate(() => {
        const docScroll = document.documentElement.scrollHeight - window.innerHeight;
        const scrollers = [...document.querySelectorAll('*')]
          .filter((el) => {
            const cs = getComputedStyle(el);
            return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ').slice(0, 2).join('.') : ''} (+${el.scrollHeight - el.clientHeight}px)`);
        return { docScroll, scrollers };
      });
      const tag = `${screen.name}@${vp.tag}`;
      if (screen.name.startsWith('board') && (scroll.docScroll > 2 || scroll.scrollers.length)) {
        problems.push(`${tag}: document +${scroll.docScroll}px; inner scrollers: ${scroll.scrollers.join(', ') || 'none'}`);
      }
      console.log(`ok   ${tag}${scroll.scrollers.length ? '  [scrollers: ' + scroll.scrollers.length + ']' : ''}`);
    } catch (err) {
      console.log(`FAIL ${screen.name}@${vp.tag}: ${err.message.split('\n')[0]}`);
      problems.push(`${screen.name}@${vp.tag}: ${err.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
}

await browser.close();

if (problems.length) {
  console.log('\nProblems:');
  for (const p of problems) console.log('  - ' + p);
  process.exitCode = 1;
} else {
  console.log('\nNo scroll problems on the board.');
}
