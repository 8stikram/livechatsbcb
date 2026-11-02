// Run on the Mac build machine: starts the built app, then has it update itself to a newer copy served from here.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, createReadStream, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const desktop = join(import.meta.dirname, '..');
const artifacts = join(desktop, 'test', '.artifacts');
mkdirSync(artifacts, { recursive: true });
const version = JSON.parse(readFileSync(join(desktop, 'package.json'), 'utf8')).version;
const newer = version.replace(/\d+$/, (last) => String(Number(last) + 1));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const check = (name, passed) => {
  console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}`);
  if (!passed) globalThis.process.exitCode = 1;
};

// The newer copy: same code, a higher number.
const feedFolder = mkdtempSync(join(tmpdir(), 'lc-feed-'));
execFileSync(
  'npx',
  ['electron-builder', '--mac', 'zip', '--universal', '--publish', 'never', `-c.extraMetadata.version=${newer}`, `-c.directories.output=${feedFolder}`],
  { cwd: desktop, stdio: 'inherit' },
);
const server = createServer((request, response) => {
  const file = join(feedFolder, basename(request.url));
  try {
    response.writeHead(200, { 'content-length': statSync(file).size });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const feed = `http://127.0.0.1:${server.address().port}`;

// Somewhere it may replace itself, as in Applications.
const place = mkdtempSync(join(tmpdir(), 'lc-app-'));
const bundle = join(place, 'LiveChatSBCB.app');
cpSync(join(desktop, 'release', 'mac-universal', 'LiveChatSBCB.app'), bundle, { recursive: true, verbatimSymlinks: true });
const shownVersion = () =>
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', join(bundle, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
check(`the copy starts at ${version}`, shownVersion() === version);
const chips = execFileSync('/usr/bin/lipo', ['-archs', join(bundle, 'Contents', 'MacOS', 'LiveChatSBCB')], { encoding: 'utf8' });
check('it runs on Apple chips and on Intel', chips.includes('arm64') && chips.includes('x86_64'));
console.log(`running on ${globalThis.process.arch}`);

const app = await electron.launch({
  executablePath: join(bundle, 'Contents', 'MacOS', 'LiveChatSBCB'),
  env: { ...globalThis.process.env, LIVECHATSBCB_PROFILE: mkdtempSync(join(tmpdir(), 'lc-profile-')), LIVECHATSBCB_UPDATE_FEED: feed },
});
app.on('close', () => console.log('the app closed'));

const pageNamed = async (name) => {
  for (let tries = 0; tries < 300; tries++) {
    const found = app.windows().find((window) => window.url().includes(`${name}.html`));
    if (found) return found;
    await sleep(100);
  }
  throw new Error(`No ${name} window`);
};
const control = await pageNamed('control');
const stage = await pageNamed('stage');
await control.waitForLoadState('domcontentloaded');
await stage.waitForLoadState('domcontentloaded');
await control.locator('.app').waitFor({ timeout: 30_000 });
await sleep(1_500);
await control.screenshot({ path: join(artifacts, 'mac-window.png') });

check('the page knows it runs on a Mac', await control.evaluate(() => document.documentElement.classList.contains('mac')));
const overlay = await app.evaluate(({ BrowserWindow }) => {
  const window = BrowserWindow.getAllWindows().find((one) => one.webContents.getURL().includes('stage.html'));
  return { top: window.isAlwaysOnTop(), everywhere: window.isVisibleOnAllWorkspaces() };
});
check('the overlay stays on top', overlay.top);
check('the overlay follows every space, full screen included', overlay.everywhere);
check(
  'the Mac keys can be taken',
  await app.evaluate(({ globalShortcut }) => {
    const taken = globalShortcut.register('Ctrl+Alt+1', () => {});
    globalShortcut.unregister('Ctrl+Alt+1');
    return taken;
  }),
);

// It finds the newer copy by itself, counts down, and comes back as the newer version.
let version2 = version;
for (let tries = 0; tries < 240 && version2 === version; tries++) {
  await sleep(1_000);
  version2 = shownVersion();
}
check(`it replaced itself with ${newer}`, version2 === newer);

// Its own program, and not the script that replaced it, which names the app too.
const process = join(bundle, 'Contents', 'MacOS', 'LiveChatSBCB');
let backOn = false;
for (let tries = 0; tries < 30 && !backOn; tries++) {
  await sleep(1_000);
  backOn = spawnSync('pgrep', ['-f', process]).status === 0;
}
check('it started again by itself', backOn);
spawnSync('pkill', ['-f', process]);
server.close();
globalThis.process.exit(globalThis.process.exitCode ?? 0);
