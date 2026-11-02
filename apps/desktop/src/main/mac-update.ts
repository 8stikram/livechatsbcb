import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createWriteStream } from 'node:fs';
import { access, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { app } from 'electron';
import type { UpdateStatus } from '../shared/ipc';

const FEED = 'https://livechatsbcb-party.livechatsbcb-party.workers.dev/updates';
const APP_NAME = 'LiveChatSBCB.app';

const toParts = (version: string) => version.split('.').map(Number);
const isNewer = (candidate: string, current: string): boolean => {
  const [a, b] = [toParts(candidate), toParts(current)];
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index]! > b[index]!;
  }
  return false;
};

type Release = { version: string; zip: string; sha512: string };

export const readMacManifest = (yaml: string): Release | null => {
  const version = yaml.match(/^version:\s*(\S+)\s*$/m)?.[1];
  const file = yaml.match(/^\s*-\s*url:\s*(\S+\.zip)\s*\n\s*sha512:\s*(\S+)\s*$/m);
  return version && file ? { version, zip: file[1]!, sha512: file[2]! } : null;
};

// Replaces the app once it has quit, then starts it again. Whatever goes wrong, the old one comes back.
const SWAP_SCRIPT = `
while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
if mv "$2" "$2.old"; then
  if mv "$3" "$2"; then
    rm -rf "$2.old"
    xattr -dr com.apple.quarantine "$2"
  else
    mv "$2.old" "$2"
  fi
fi
open "$2"
rm -rf "$4"
`;

// Apple's own updater only accepts apps paid to be signed, so the Mac version replaces itself.
export class MacUpdate {
  private readonly folder = join(app.getPath('userData'), 'update');
  private readonly feed = (process.env['LIVECHATSBCB_PROFILE'] && process.env['LIVECHATSBCB_UPDATE_FEED']) || FEED;
  // Contents/MacOS/LiveChatSBCB, inside the app.
  private readonly bundle = resolve(app.getPath('exe'), '..', '..', '..');

  constructor(private readonly publish: (status: UpdateStatus) => void) {}

  async check(): Promise<void> {
    const answer = await fetch(`${this.feed}/latest-mac.yml`, { cache: 'no-store' });
    if (!answer.ok) throw new Error(`The manifest answered ${answer.status}`);
    const release = readMacManifest(await answer.text());
    if (!release) throw new Error('The manifest cannot be read');
    if (!isNewer(release.version, app.getVersion())) return;

    // Started from the disk image or from Downloads under Apple's protection: this copy cannot be replaced.
    if (!(await this.canReplaceItself())) {
      this.publish({ state: 'manual', version: release.version });
      return;
    }

    this.publish({ state: 'downloading', version: release.version, percent: 0 });
    await rm(this.folder, { recursive: true, force: true });
    await mkdir(this.folder, { recursive: true });
    const zip = join(this.folder, 'next.zip');
    await this.download(release, zip);
    await new Promise<void>((done, fail) =>
      execFile('/usr/bin/ditto', ['-x', '-k', zip, join(this.folder, 'next')], (error) => (error ? fail(error) : done())),
    );
    await access(join(this.folder, 'next', APP_NAME));
    await rm(zip, { force: true });
    this.publish({ state: 'ready', version: release.version });
  }

  install(): void {
    spawn('/bin/sh', ['-c', SWAP_SCRIPT, 'swap', String(process.pid), this.bundle, join(this.folder, 'next', APP_NAME), this.folder], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    app.quit();
  }

  private async canReplaceItself(): Promise<boolean> {
    if (this.bundle.includes('/AppTranslocation/') || this.bundle.startsWith('/Volumes/')) return false;
    try {
      await access(dirname(this.bundle), constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async download(release: Release, path: string): Promise<void> {
    const answer = await fetch(`${this.feed}/${release.zip}`);
    if (!answer.ok || !answer.body) throw new Error(`The download answered ${answer.status}`);

    const total = Number(answer.headers.get('content-length')) || 0;
    const hash = createHash('sha512');
    const out = createWriteStream(path);
    let received = 0;
    let shown = 0;
    try {
      for await (const chunk of answer.body as unknown as AsyncIterable<Uint8Array>) {
        hash.update(chunk);
        if (!out.write(chunk)) await new Promise<void>((done) => out.once('drain', () => done()));
        received += chunk.length;
        const percent = total ? Math.floor((received / total) * 100) : 0;
        if (percent !== shown) {
          shown = percent;
          this.publish({ state: 'downloading', version: release.version, percent });
        }
      }
    } finally {
      await new Promise<void>((done) => out.end(() => done()));
    }
    if (hash.digest('base64') !== release.sha512) throw new Error('The download does not match the manifest');
  }
}
