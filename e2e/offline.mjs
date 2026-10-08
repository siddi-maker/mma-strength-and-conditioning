// End-to-end smoke test: builds nothing itself — run `npm run build` first.
// Serves dist/ with `vite preview`, then in a phone-sized Chromium:
//   1. logs a set, checks the rest timer, reloads and checks nothing was lost
//   2. finishes the workout and does a check-in
//   3. verifies the manifest is installable and the service worker controls the page
//   4. goes offline, reloads, and checks the app and its data still load
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
const URL_ = `http://localhost:${PORT}/`;
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview did not start')), 20000);
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'DELETE' : undefined));

let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) failed++;
};
const snap = (name) => page.screenshot({ path: `${shots}${name}.png`, fullPage: true });

try {
  await page.goto(URL_);
  await page.getByText('Next workout').waitFor();
  await snap('01-dashboard-empty');
  check(await page.getByText('Upper A').first().isVisible(), 'dashboard suggests Upper A first');

  // --- Workout logger
  await page.getByRole('link', { name: 'Train' }).click();
  await page.getByText('Next up').waitFor();
  await snap('02-start');
  await page.getByRole('button', { name: /Upper A/ }).click();
  await page.getByText('Bench Press').waitFor();
  check(await page.getByText('75 kg × 5').first().isVisible(), 'bench prefilled at 75 kg × 5');
  await page.getByRole('button', { name: 'complete set 1' }).first().click();
  await page.getByText(/Rest ·/).waitFor();
  check(await page.getByText(/Rest · Bench Press set 2/).isVisible(), 'rest timer started after ticking a set');
  await snap('03-logger');

  // tap-to-edit a set
  await page.getByRole('button', { name: '75 kg × 5' }).nth(0).click();
  await page.getByRole('button', { name: 'increase kg' }).click();
  await page.getByRole('button', { name: /77\.5 kg × 5/ }).nth(4).waitFor({ timeout: 3000 }).catch(() => {});
  check(await page.getByRole('button', { name: /77\.5 kg × 5/ }).count() === 5, 'weight change carries to later sets');
  await snap('04-set-editor');

  await page.reload();
  await page.getByText('Bench Press').waitFor();
  check(await page.getByRole('button', { name: 'complete set 1' }).first().evaluate((b) => b.className.includes('bg-emerald-600')), 'ticked set survives reload');
  check(await page.getByText(/Rest ·/).isVisible(), 'rest timer survives reload');

  // complete all bench sets and finish
  for (let i = 2; i <= 5; i++) await page.getByRole('button', { name: `complete set ${i}` }).first().click();
  check(await page.getByText(/Rest · Weighted Pull-Ups/).waitFor({ timeout: 3000 }).then(() => true, () => false), 'timer label points at the next exercise');
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByText('Workout done').waitFor();
  check(await page.getByText(/kg$/).first().isVisible(), 'summary shows volume');
  await snap('05-summary');

  // --- Check-in
  await page.getByRole('link', { name: 'Check-in' }).click();
  await page.getByRole('button', { name: /\+500 ml/ }).click();
  await page.getByRole('button', { name: /\+500 ml/ }).click();
  await page.getByRole('button', { name: /\+40 g/ }).click();
  await page.getByRole('switch', { name: 'Creatine taken' }).click();
  await page.waitForTimeout(200);
  await snap('06-checkin');

  // --- Log a martial arts session
  await page.getByRole('link', { name: 'Cardio/MA' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText(/MMA · 60 min/).waitFor();
  check(true, 'martial arts session saved');
  await snap('07-log');

  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByText('Goals').waitFor();
  check(await page.getByText('Lower A').first().isVisible(), 'rotation now suggests Lower A');
  await snap('08-dashboard');

  await page.getByRole('link', { name: 'Charts' }).click();
  await page.getByText('Top set & estimated 1RM').waitFor();
  await page.waitForTimeout(800);
  await snap('09-charts');

  // --- PWA installability + offline
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
    return href ? (await fetch(href)).json() : null;
  });
  check(!!manifest && manifest.display === 'standalone' && manifest.icons.some((i) => i.sizes === '512x512'), 'manifest is installable (standalone, 512px icon)');

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');

  await context.setOffline(true);
  await page.goto(URL_ + '#/');
  await page.getByText('Next workout').waitFor({ timeout: 10000 });
  check(true, 'app loads offline');
  await page.getByRole('link', { name: 'Check-in' }).click();
  const water = await page.locator('label:has-text("Water") input').first().inputValue();
  check(water === '1', `offline check-in data intact (water=${water})`);
  await page.getByRole('link', { name: 'Charts' }).click();
  await page.getByText('Top set & estimated 1RM').waitFor({ timeout: 10000 });
  check(true, 'lazy-loaded charts work offline');
  await context.setOffline(false);
} catch (e) {
  failed++;
  console.error('✗', e.message);
  await snap('error').catch(() => {});
} finally {
  if (errors.length) {
    failed++;
    console.error('Page errors:', errors);
  }
  await browser.close();
  server.kill();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll e2e checks passed');
process.exit(failed ? 1 : 0);
