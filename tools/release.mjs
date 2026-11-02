// Publishes a new version of the app. Usage: npm run release -- 1.2.3
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE_URL = 'https://livechatsbcb-party.livechatsbcb-party.workers.dev';
const BUCKET = 'livechatsbcb-updates';
const MAX_INSTALLER_BYTES = 300 * 1024 * 1024;
const REPOSITORY = '8stikram/livechatsbcb';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'apps', 'desktop');
const manifestPath = join(desktop, 'package.json');
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

const toParts = (version) => version.split('.').map(Number);
const isNewer = (candidate, current) => {
  const [a, b] = [toParts(candidate), toParts(current)];
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return false;
};
const field = (yaml, name) => yaml.match(new RegExp(`^${name}:\\s*(\\S+)\\s*$`, 'm'))?.[1];

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error('Usage: npm run release -- 1.2.3');

const notes = readFileSync(join(desktop, 'src', 'shared', 'patch-notes.ts'), 'utf8');
if (!notes.includes(`version: '${version}'`)) throw new Error(`Write the patch notes of ${version} first`);

const published = await fetch(`${SERVICE_URL}/updates/latest.yml`);
const previous = published.ok ? await published.text() : '';
const previousVersion = field(previous, 'version');
if (previousVersion && !isNewer(version, previousVersion)) {
  throw new Error(`${version} is not newer than the published ${previousVersion}`);
}

const run = (command, ...args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
const capture = (command, ...args) => execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
// The Mac version is built from what is on GitHub: anything not committed would be missing from it.
if (capture('git', 'status', '--porcelain', '--', ':!apps/desktop/package.json', ':!package-lock.json')) throw new Error('Commit everything first');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const npm = (...args) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: 'inherit' });
npm('install', '--package-lock-only', '--no-audit', '--no-fund');

// The Mac version can only be built on a Mac, from what is on GitHub. If it fails, nothing has been published.
// After a failed Mac build, the same version can simply be released again.
if (capture('git', 'status', '--porcelain')) {
  run('git', 'add', 'apps/desktop/package.json', 'package-lock.json');
  run('git', 'commit', '-m', `Release ${version}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`);
}
run('git', 'push', 'origin', 'main');
const commit = capture('git', 'rev-parse', 'HEAD');
const latestMacRun = () =>
  capture('gh', 'run', 'list', '--repo', REPOSITORY, '--workflow', 'mac-build.yml', '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId // ""');
const runBefore = latestMacRun();
run('gh', 'workflow', 'run', 'mac-build.yml', '--repo', REPOSITORY, '--ref', 'main');
let macRun = runBefore;
for (let tries = 0; tries < 60 && macRun === runBefore; tries++) {
  await new Promise((done) => setTimeout(done, 5_000));
  macRun = latestMacRun();
}
if (macRun === runBefore) throw new Error('The Mac build did not start');
run('gh', 'run', 'watch', macRun, '--repo', REPOSITORY, '--exit-status', '--interval', '30');
const macFolder = join(desktop, 'release', 'mac');
rmSync(macFolder, { recursive: true, force: true });
run('gh', 'run', 'download', macRun, '--repo', REPOSITORY, '--name', 'mac-release', '--dir', macFolder);

npm('run', 'build:exe');

const built = readFileSync(join(desktop, 'release', 'latest.yml'), 'utf8');
const installer = field(built, 'path');
if (field(built, 'version') !== version || !installer) throw new Error('The build did not produce this version');

const macManifest = readFileSync(join(macFolder, 'latest-mac.yml'), 'utf8');
if (field(macManifest, 'version') !== version) throw new Error('The Mac build did not produce this version');
const macFiles = [`LiveChatSBCB-Mac-${version}.dmg`, `LiveChatSBCB-Mac-${version}.zip`];

// The project must stay inside the 10 GB free tier: updates may use 2 x 3 x 300 MB, briefly, and media the rest up to 8 GB.
for (const file of [join(desktop, 'release', installer), ...macFiles.map((name) => join(macFolder, name))]) {
  const { size } = statSync(file);
  if (size > MAX_INSTALLER_BYTES) throw new Error(`${file} is too large: ${size} bytes`);
}

const put = (key, file) =>
  execFileSync(process.execPath, [wrangler, 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--remote'], {
    cwd: join(root, 'services', 'party'),
    stdio: 'inherit',
  });

// Installer first: clients only learn about a version once its file is there.
put(installer, join(desktop, 'release', installer));
for (const file of macFiles) put(file, join(macFolder, file));
put('latest.yml', join(desktop, 'release', 'latest.yml'));
put('latest-mac.yml', join(macFolder, 'latest-mac.yml'));

const online = await (await fetch(`${SERVICE_URL}/updates/latest.yml`)).text();
if (field(online, 'version') !== version) throw new Error('The online manifest does not show this version');

const previousFiles = [field(previous, 'path'), ...(previousVersion ? [`LiveChatSBCB-Mac-${previousVersion}.dmg`, `LiveChatSBCB-Mac-${previousVersion}.zip`] : [])];
for (const file of previousFiles) {
  if (!file || file === installer || macFiles.includes(file)) continue;
  // The first version with a Mac build has no older Mac files: wrangler says so and nothing is lost.
  try {
    execFileSync(process.execPath, [wrangler, 'r2', 'object', 'delete', `${BUCKET}/${file}`, '--remote'], {
      cwd: join(root, 'services', 'party'),
      stdio: 'inherit',
    });
  } catch {
    console.warn(`Could not delete ${file}`);
  }
}

// The same files on the GitHub page, for whoever comes from there.
const releaseNotes = `## Windows\n\n**[Télécharger pour Windows](${SERVICE_URL}/download/windows)**\n\n## Mac (puce Apple)\n\n**[Télécharger pour Mac](${SERVICE_URL}/mac)**, avec les étapes pour l'ouvrir la première fois.`;
run('gh', 'release', 'create', `v${version}`, '--repo', REPOSITORY, '--target', commit, '--title', `LiveChatSBCB ${version}`, '--notes', releaseNotes,
  join(desktop, 'release', installer), ...macFiles.map((name) => join(macFolder, name)));

console.log(`\nVersion ${version} published. Windows: ${SERVICE_URL}/download/windows Mac: ${SERVICE_URL}/mac`);
