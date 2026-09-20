/**
 * Render the favicon SVG to the PNG sizes the web needs.
 *
 *   node scripts/render-icons.mjs
 *
 * Produces src/app/apple-icon.png (180), public/icons/icon-192.png and icon-512.png (PWA
 * manifest), and public/icons/maskable-512.png (the same mark with extra padding so Android
 * can crop it to a circle). Uses the bundled Chromium, so there is nothing to install.
 * Re-run after editing src/app/icon.svg.
 */

import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';

const svg = readFileSync(new URL('../src/app/icon.svg', import.meta.url), 'utf8');
const executablePath = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const targets = [
  { file: 'src/app/apple-icon.png', size: 180, pad: 0 },
  { file: 'public/icons/icon-192.png', size: 192, pad: 0 },
  { file: 'public/icons/icon-512.png', size: 512, pad: 0 },
  // Maskable: the safe zone is the inner 80%, so the mark is inset by 10% each side.
  { file: 'public/icons/maskable-512.png', size: 512, pad: 0.1 },
];

mkdirSync('public/icons', { recursive: true });
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

for (const t of targets) {
  const inner = Math.round(t.size * (1 - 2 * t.pad));
  const html = `<!doctype html><html><body style="margin:0;background:#15110d;width:${t.size}px;height:${t.size}px;display:flex;align-items:center;justify-content:center">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg style="width:${inner}px;height:${inner}px;display:block" `)}</div>
  </body></html>`;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(html);
  await page.screenshot({ path: t.file, clip: { x: 0, y: 0, width: t.size, height: t.size }, omitBackground: false });
  console.log(`wrote ${t.file} (${t.size}px)`);
}

await browser.close();
