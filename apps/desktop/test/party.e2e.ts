import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SERVER_PORT = 8787;
const repoRoot = resolve(__dirname, '..', '..', '..');
const artifacts = resolve(__dirname, '.artifacts');
const sandbox = mkdtempSync(join(tmpdir(), 'livechatsbcb-e2e-'));
const serverState = join(sandbox, 'server-state');

// Set E2E_EXECUTABLE to the installed .exe to run these same checks against a packaged build.
const packagedExecutable = process.env['E2E_EXECUTABLE'];
// Set E2E_ONLINE=1 when that build talks to the online service: nothing local is started or stopped.
const online = process.env['E2E_ONLINE'] === '1';

let server: ChildProcess | null = null;

const startServer = async (): Promise<void> => {
  const wrangler = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  server = spawn(
    process.execPath,
    [wrangler, 'dev', '--port', String(SERVER_PORT), '--ip', '127.0.0.1', '--persist-to', serverState],
    {
      cwd: join(repoRoot, 'services', 'party'),
      stdio: 'ignore',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: '1' },
    },
  );

  const deadline = Date.now() + 90_000;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${SERVER_PORT}/v1/health`)).ok) return;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error('The local party service did not start');
    await new Promise((done) => setTimeout(done, 200));
  }
};

const stopServer = (): void => {
  if (server?.pid) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']);
  server = null;
};

type Member = { app: ElectronApplication; control: Page; stage: Page };

const launch = async (profile: string): Promise<Member> => {
  const app = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : { args: [join(__dirname, '..')] }),
    env: { ...process.env, LIVECHATSBCB_PROFILE: join(sandbox, profile) } as Record<string, string>,
  });

  const findPage = async (page: string): Promise<Page> => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const found = app.windows().find((window) => window.url().includes(`${page}.html`));
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`Window ${page} did not open`);
      await new Promise((done) => setTimeout(done, 100));
    }
  };

  const control = await findPage('control');
  const stage = await findPage('stage');
  await control.waitForLoadState('domcontentloaded');
  await stage.waitForLoadState('domcontentloaded');
  return { app, control, stage };
};

const onlineCount = (member: Member, count: number) =>
  member.control.getByTestId('online-count').filter({ hasText: `${count} / 10 en ligne` }).waitFor({ timeout: 15_000 });

const connected = (member: Member, timeout = 15_000) =>
  member.control.getByTestId('connection').filter({ hasText: 'Connecté' }).waitFor({ timeout });

const partyCode = async (member: Member): Promise<string> =>
  (await member.control.getByTestId('party-code').textContent())!.trim();

const stageVisible = (member: Member) =>
  member.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) => window.getTitle().includes('Scène') && window.isVisible()),
  );

describe('party flow in the real app', () => {
  let host: Member;
  let guest: Member;
  let code: string;

  beforeAll(async () => {
    mkdirSync(artifacts, { recursive: true });
    if (!online) await startServer();
  });

  afterAll(async () => {
    await host?.app.close().catch(() => {});
    await guest?.app.close().catch(() => {});
    stopServer();
    rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  });

  it('opens on the home screen with no party and a hidden stage', async () => {
    host = await launch('host');
    await host.control.getByRole('button', { name: 'Créer une nouvelle party' }).waitFor();
    expect(await stageVisible(host)).toBe(false);
    await host.control.screenshot({ path: join(artifacts, '1-home.png') });
  });

  it('keeps pages away from Node and applies the content security policy', async () => {
    const exposure = await host.control.evaluate(() => ({
      require: typeof (window as unknown as { require?: unknown }).require,
      process: typeof (window as unknown as { process?: unknown }).process,
      apiKeys: Object.keys(window.liveChat).sort(),
    }));
    expect(exposure.require).toBe('undefined');
    expect(exposure.process).toBe('undefined');
    expect(exposure.apiKeys).not.toContain('token');

    const state = await host.control.evaluate(() => window.liveChat.getState());
    expect(JSON.stringify(state)).not.toContain('token');

    if (packagedExecutable) {
      const inlineScriptRan = await host.control.evaluate(() => {
        const script = document.createElement('script');
        script.textContent = 'window.__inline = true';
        document.head.append(script);
        return (window as unknown as { __inline?: boolean }).__inline === true;
      });
      expect(inlineScriptRan).toBe(false);
    }
  });

  it('creates a party, shows its code and opens the stage', async () => {
    await host.control.getByLabel('Ton pseudo').fill('Nono');
    await host.control.getByRole('button', { name: 'Créer une nouvelle party' }).click();
    await connected(host);
    await onlineCount(host, 1);

    code = await partyCode(host);
    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
    expect(await stageVisible(host)).toBe(true);
    await host.stage.getByTestId('stage-status').filter({ hasText: 'En attente' }).waitFor();
  });

  it('refuses a wrong code with a clear message', async () => {
    guest = await launch('guest');
    await guest.control.getByLabel('Ton pseudo').fill('Pote');
    await guest.control.getByLabel('Code de la party').fill('ZZZZZZ');
    await guest.control.getByRole('button', { name: 'Rejoindre' }).click();
    await guest.control.getByRole('alert').filter({ hasText: 'aucune party' }).waitFor();
  });

  it('lets a second person join, and both see each other', async () => {
    await guest.control.getByLabel('Code de la party').fill(code.toLowerCase());
    await guest.control.getByRole('button', { name: 'Rejoindre' }).click();
    await connected(guest);
    await onlineCount(guest, 2);
    await onlineCount(host, 2);

    await host.control.getByText('Pote').waitFor();
    await guest.control.getByText('Nono').waitFor();
    await host.control.screenshot({ path: join(artifacts, '2-party-host.png') });
    await guest.stage.screenshot({ path: join(artifacts, '3-stage.png') });
  });

  it('rejoins alone after the app restarts', async () => {
    await guest.app.close();
    await onlineCount(host, 1);

    guest = await launch('guest');
    await connected(guest);
    await onlineCount(host, 2);
    expect(await partyCode(guest)).toBe(code);
  });

  it.skipIf(online)('reconnects within 10 s of the service coming back', async () => {
    stopServer();
    await host.control
      .getByTestId('connection')
      .filter({ hasText: 'nouvelle tentative' })
      .waitFor({ timeout: 15_000 });
    await host.control.screenshot({ path: join(artifacts, '4-reconnecting.png') });

    await startServer();
    const backAt = Date.now();
    await Promise.all([connected(host, 10_000), connected(guest, 10_000)]);
    console.log(`Both members back online ${Date.now() - backAt} ms after the service returned`);
    await onlineCount(host, 2);
  });

  it('changes the code for everyone', async () => {
    await host.control.getByRole('button', { name: 'Changer le code' }).click();
    await host.control.getByRole('button', { name: 'Confirmer le changement ?' }).click();

    await guest.control
      .getByTestId('party-code')
      .filter({ hasNotText: code })
      .waitFor({ timeout: 10_000 });
    const newCode = await partyCode(guest);
    expect(newCode).not.toBe(code);
    expect(await partyCode(host)).toBe(newCode);
  });

  it('lets a member leave and return to the home screen', async () => {
    await guest.control.getByRole('button', { name: 'Quitter la party' }).click();
    await guest.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await guest.control.getByRole('button', { name: 'Rejoindre' }).waitFor();

    await host.control.getByText('Pote').waitFor({ state: 'detached', timeout: 10_000 });
    await onlineCount(host, 1);
  });

  it('hides and pins the stage on request', async () => {
    await host.control.getByLabel('Afficher la scène').uncheck();
    expect(await stageVisible(host)).toBe(false);
    await host.control.getByLabel('Afficher la scène').check();
    expect(await stageVisible(host)).toBe(true);

    await host.control.getByLabel('Garder la scène au premier plan').check();
    const pinned = await host.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((window) => window.getTitle().includes('Scène'))?.isAlwaysOnTop(),
    );
    expect(pinned).toBe(true);
  });

  it('removes the party when its last member leaves', async () => {
    await host.control.getByRole('button', { name: 'Quitter la party' }).click();
    await host.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await host.control.getByRole('button', { name: 'Rejoindre' }).waitFor();
  });
});
