// Auto-update check: an open app picks up a newly deployed build when it returns to the
// foreground, without a manual refresh. Run after `npm run build`; this script rebuilds once.
import { chromium } from 'playwright-core';
import { spawn, execSync } from 'node:child_process';

const PORT = 4180;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => d.toString().includes(String(PORT)) && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview did not start')), 20000);
});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
let ok = false;
try {
  const version = async () => {
    await page.getByRole('button', { name: 'Data' }).click();
    return (await page.getByText(/App version:/).textContent()).trim();
  };
  await page.goto(`http://localhost:${PORT}/#/settings`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const before = await version();
  console.log('running:', before);

  await new Promise((r) => setTimeout(r, 1100)); // build time has 1 s resolution in the label
  execSync('npx vite build', { stdio: 'ignore' }); // "deploy" a new version under the open app
  const reloaded = page.waitForEvent('framenavigated', { timeout: 20000 });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); // app returns to foreground
  await reloaded;
  await page.waitForLoadState();
  await page.goto(`http://localhost:${PORT}/#/settings`);
  const after = await version();
  console.log('after:  ', after);
  ok = after !== before;
} catch (e) {
  console.error(e.message);
} finally {
  await browser.close();
  server.kill();
}
console.log(ok ? '✓ open app updated itself to the new build' : '✗ app did not update');
process.exit(ok ? 0 : 1);
