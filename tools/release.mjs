// Publishes a new version of the app. Usage: npm run release -- 1.2.3
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVICE_URL = 'https://livechatsbcb-party.livechatsbcb-party.workers.dev';
const BUCKET = 'livechatsbcb-updates';
const MAX_INSTALLER_BYTES = 300 * 1024 * 1024;

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

const published = await fetch(`${SERVICE_URL}/updates/latest.yml`);
const previous = published.ok ? await published.text() : '';
const previousVersion = field(previous, 'version');
if (previousVersion && !isNewer(version, previousVersion)) {
  throw new Error(`${version} is not newer than the published ${previousVersion}`);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.version = version;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const npm = (...args) => execFileSync(process.execPath, [process.env.npm_execpath, ...args], { cwd: root, stdio: 'inherit' });
npm('install', '--package-lock-only', '--no-audit', '--no-fund');
npm('run', 'build:exe');

const built = readFileSync(join(desktop, 'release', 'latest.yml'), 'utf8');
const installer = field(built, 'path');
if (field(built, 'version') !== version || !installer) throw new Error('The build did not produce this version');

// The project must stay inside the 10 GB free tier: updates may use 2 x 300 MB, briefly, and media the rest up to 8 GB.
const installerSize = statSync(join(desktop, 'release', installer)).size;
if (installerSize > MAX_INSTALLER_BYTES) throw new Error(`The installer is too large: ${installerSize} bytes`);

const put = (key, file) =>
  execFileSync(process.execPath, [wrangler, 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--remote'], {
    cwd: join(root, 'services', 'party'),
    stdio: 'inherit',
  });

// Installer first: clients only learn about a version once its file is there.
put(installer, join(desktop, 'release', installer));
put('latest.yml', join(desktop, 'release', 'latest.yml'));

const online = await (await fetch(`${SERVICE_URL}/updates/latest.yml`)).text();
if (field(online, 'version') !== version) throw new Error('The online manifest does not show this version');

const previousInstaller = field(previous, 'path');
if (previousInstaller && previousInstaller !== installer) {
  execFileSync(process.execPath, [wrangler, 'r2', 'object', 'delete', `${BUCKET}/${previousInstaller}`, '--remote'], {
    cwd: join(root, 'services', 'party'),
    stdio: 'inherit',
  });
}

console.log(`\nVersion ${version} published. Download link: ${SERVICE_URL}/download`);
