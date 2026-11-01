// Checks a real update on this PC. Install a published version first, then publish a newer one, then run:
// node test/update-check.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const executable = join(process.env.LOCALAPPDATA, 'Programs', 'livechatsbcb', 'LiveChatSBCB.exe');
const profile = mkdtempSync(join(tmpdir(), 'livechatsbcb-update-'));

const powershell = (command) =>
  spawnSync('powershell', ['-NoProfile', '-Command', command], { encoding: 'utf8' }).stdout.trim();
const installedVersion = () => powershell(`(Get-Item '${executable}').VersionInfo.ProductVersion`);
// Counts only processes started after the given time, so the app that is closing doesn't pass for a restart.
const runningSince = (time) =>
  Number(
    powershell(
      `@(Get-Process LiveChatSBCB -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -gt [DateTime]::Parse('${time.toISOString()}') }).Count`,
    ),
  );
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const before = installedVersion();
console.log(`Installed version: ${before}`);

const app = await electron.launch({
  executablePath: executable,
  env: { ...process.env, LIVECHATSBCB_PROFILE: profile },
});

let control;
for (let attempt = 0; attempt < 100 && !control; attempt++) {
  control = app.windows().find((window) => window.url().includes('control.html'));
  if (!control) await sleep(100);
}
if (!control) throw new Error('The control window did not open');

const started = Date.now();
const restart = control.getByRole('button', { name: 'Redémarrer' });
await restart.waitFor({ timeout: 300_000 });
console.log(`Update downloaded in ${Math.round((Date.now() - started) / 1000)} s`);
const clickedAt = new Date();
await restart.click();

// The file disappears for a moment during the update, so an empty version doesn't count as a change.
const deadline = Date.now() + 180_000;
let after = installedVersion();
while (after === before || after === '') {
  if (Date.now() > deadline) throw new Error('The installed version did not change');
  await sleep(1_000);
  after = installedVersion();
}
console.log(`Installed version after update: ${after}`);

let relaunched = false;
for (let attempt = 0; attempt < 60 && !relaunched; attempt++) {
  relaunched = runningSince(clickedAt) > 0;
  if (!relaunched) await sleep(1_000);
}
console.log(`App restarted by itself: ${relaunched}`);

powershell('Stop-Process -Name LiveChatSBCB -Force -ErrorAction SilentlyContinue');
process.exit(after !== before && relaunched ? 0 : 1);
