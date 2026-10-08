// Renders public/icon.svg to the PNG sizes the manifest and iOS need.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:#0a0a0a}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `).replace('rx="96"', name.startsWith('apple') ? 'rx="0"' : 'rx="96"')}`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
