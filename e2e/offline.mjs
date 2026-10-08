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

  // --- Fitbit (Google Health) connect + sync, with Google faked at the network layer
  await page.goto(URL_ + '#/settings');
  await page.getByRole('button', { name: 'Fitbit' }).click();
  await page.locator('label:has-text("Google OAuth client ID") input').fill('test-client.apps.googleusercontent.com');
  await page.locator('label:has-text("Google OAuth client ID") input').blur();
  let authUrl;
  await page.route('https://accounts.google.com/**', async (route) => {
    authUrl = new URL(route.request().url());
    // Behave like Google: bounce straight back with a token in the fragment.
    const back = `${authUrl.searchParams.get('redirect_uri')}#access_token=fake-token&token_type=Bearer&expires_in=3599&state=${authUrl.searchParams.get('state')}`;
    await route.fulfill({ status: 302, headers: { location: back } });
  });
  const yd = new Date(Date.now() - 86400000);
  const civ = { date: { year: yd.getFullYear(), month: yd.getMonth() + 1, day: yd.getDate() }, time: { hours: 7, minutes: 5 } };
  const healthHits = [];
  await page.route('https://health.googleapis.com/**', async (route) => {
    const url = route.request().url();
    healthHits.push(url);
    const type = url.split('/dataTypes/')[1].split('/')[0];
    const body = {
      sleep: { dataPoints: [{ sleep: { interval: { startTime: yd.toISOString(), endTime: yd.toISOString(), civilStartTime: { ...civ, time: { hours: 23, minutes: 20 } }, civilEndTime: civ }, summary: { minutesAsleep: '450' }, metadata: { mainSleep: true } } }] },
      weight: { dataPoints: [{ weight: { sampleTime: { physicalTime: yd.toISOString(), civilTime: civ }, weightGrams: 77600 } }] },
      'body-fat': {},
      exercise: { dataPoints: [{ name: 'run-e2e', exercise: { exerciseType: 'RUNNING', activeDuration: '2280s', interval: { startTime: yd.toISOString(), endTime: yd.toISOString(), civilStartTime: civ }, metricsSummary: { distanceMillimeters: 5600000, averageHeartRateBeatsPerMinute: '138' } } }] },
    }[type];
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body ?? {}) });
  });
  await page.getByRole('button', { name: 'Connect Google & sync' }).click();
  await page.getByText(/Updated 1 night of sleep, 1 weigh-in, 1 run/).waitFor({ timeout: 10000 });
  check(authUrl?.searchParams.get('response_type') === 'token' && authUrl.searchParams.get('scope').includes('googlehealth.sleep.readonly'), 'Connect sends the right OAuth request');
  check(page.url().endsWith('#/settings?tab=fitbit'), `returns to the Fitbit tab with token stripped from the URL (${page.url().split('/').pop()})`);
  check(healthHits.length === 4, 'queried sleep, weight, body fat and exercise');
  await snap('10-fitbit');
  await page.getByRole('link', { name: 'Check-in' }).click();
  await page.getByRole('button', { name: 'previous day' }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('label')].some((l) => l.textContent.includes('Bodyweight') && l.querySelector('input')?.value));
  const sleepVal = await page.locator('label:has-text("Sleep") input').first().inputValue();
  const bwVal = await page.locator('label:has-text("Bodyweight") input').first().inputValue();
  check(sleepVal === '7.5' && bwVal === '77.6', `Fitbit sleep & weight landed in yesterday's check-in (sleep=${sleepVal}, bw=${bwVal})`);
  await page.getByRole('link', { name: 'Cardio/MA' }).click();
  check(await page.getByText(/Zone 2 · 38 min · 5.6 km · 138 bpm/).waitFor({ timeout: 5000 }).then(() => true, () => false), 'Fitbit run imported as Zone 2');
  await page.unroute('https://accounts.google.com/**');
  await page.unroute('https://health.googleapis.com/**');

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
