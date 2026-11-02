import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAKE_DISCORD, FakeDiscord } from '../../../services/party/test/fake-discord';

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

const discord = new FakeDiscord();
const nono = discord.addUser('Nono');
const pote = discord.addUser('Pote');
// This one has Discord's default picture, which is really there to load, unlike the made-up pictures of the others.
discord.removeAvatar(nono);

const serverId = discord.addGuild('Les potes');
discord.addMember(serverId, nono);
discord.addMember(serverId, pote);
// Pote is on this one, Nono isn't.
const otherServer = discord.addGuild('Autre serveur');
discord.addMember(otherServer, pote);

const startServer = async (): Promise<void> => {
  const wrangler = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  server = spawn(
    process.execPath,
    [
      wrangler,
      'dev',
      '--port',
      String(SERVER_PORT),
      '--ip',
      '127.0.0.1',
      '--persist-to',
      serverState,
      '--var',
      `DISCORD_API_URL:${FAKE_DISCORD.url}`,
      '--var',
      `DISCORD_CLIENT_ID:${FAKE_DISCORD.clientId}`,
      '--var',
      `DISCORD_CLIENT_SECRET:${FAKE_DISCORD.clientSecret}`,
      // Notices what Discord says within a second, instead of within 5 minutes.
      '--var',
      'DISCORD_REFRESH_MS:1000',
    ],
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

// Without this, a test window covered by something else on this PC stops drawing, and clicks in it never finish.
const KEEP_DRAWING = '--disable-features=CalculateNativeWinOcclusion';

const OVERLAY_BOX = { width: 480, height: 270 };

// Whoever is using this PC during the tests keeps their screen: the test windows sit almost entirely off it, and what
// the overlay shows stays in a small box at the top, which clicks go through like the real one.
const keepOutOfTheWay = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow, screen }, box) => {
    const { workArea } = screen.getPrimaryDisplay();
    const isOverlay = (window: Electron.BrowserWindow) => window.getTitle().includes('Scène');
    const overlay = BrowserWindow.getAllWindows().find(isOverlay)!;
    const boxBounds = { x: workArea.x + workArea.width - box.width, y: workArea.y, ...box };

    (globalThis as unknown as { realOverlayBounds: Electron.Rectangle }).realOverlayBounds = overlay.getBounds();

    // Coming back from Discord brings the app forward, which would take the keyboard away from whoever is typing.
    BrowserWindow.prototype.focus = () => {};

    const setBounds = BrowserWindow.prototype.setBounds;
    BrowserWindow.prototype.setBounds = function (bounds, animate) {
      setBounds.call(this, isOverlay(this) ? boxBounds : bounds, animate);
    };
    overlay.setBounds(boxBounds);

    for (const window of BrowserWindow.getAllWindows()) {
      if (!isOverlay(window)) window.setPosition(workArea.x + workArea.width - 12, workArea.y + workArea.height - 12);
    }
  }, OVERLAY_BOX);

const powershell = (script: string): string =>
  spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' }).stdout.trim();

// What Windows really displays at this point of the screen, whatever the app thinks it is showing.
const screenPixel = (x: number, y: number): number[] =>
  powershell(
    `Add-Type -AssemblyName System.Drawing; $b = New-Object Drawing.Bitmap 1,1; $g = [Drawing.Graphics]::FromImage($b); $g.CopyFromScreen(${x}, ${y}, 0, 0, (New-Object Drawing.Size 1,1)); $c = $b.GetPixel(0,0); "$($c.R),$($c.G),$($c.B)"`,
  )
    .split(',')
    .map(Number);

const windowExStyle = (handle: string): number =>
  Number(
    powershell(
      `Add-Type -Namespace W -Name U -MemberDefinition '[DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);'; [W.U]::GetWindowLong([IntPtr]${handle}, -20)`,
    ),
  );

const launchArgs = (extra: string[]): string[] =>
  packagedExecutable ? [KEEP_DRAWING, ...extra] : [KEEP_DRAWING, join(__dirname, '..'), ...extra];

const launch = async (profile: string, extraArgs: string[] = []): Promise<Member> => {
  const app = await electron.launch({
    ...(packagedExecutable ? { executablePath: packagedExecutable } : {}),
    args: launchArgs(extraArgs),
    env: { ...process.env, LIVECHATSBCB_PROFILE: join(sandbox, profile) } as Record<string, string>,
  });

  // An app that dies during a test should say why.
  app.process().stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString();
    if (/error|exception|fatal/i.test(text)) console.error(`[${profile}] ${text.trim()}`);
  });
  app.on('close', () => console.log(`[${profile}] app closed`));

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
  for (const page of [control, stage]) {
    page.on('pageerror', (error) => console.error(`[${profile}] ${page.url()}: ${error.message}`));
  }
  await keepOutOfTheWay(app);

  // Nothing opens in the real browser: the tests read the address and play the browser's part themselves.
  await app.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as unknown as { openedInBrowser: string[] }).openedInBrowser = opened;
    shell.openExternal = async (url) => {
      opened.push(url);
    };
  });
  return { app, control, stage };
};

const nextOpenedUrl = async (member: Member): Promise<URL> => {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const url = await member.app.evaluate(
      () => (globalThis as unknown as { openedInBrowser: string[] }).openedInBrowser.shift() ?? null,
    );
    if (url) return new URL(url);
    if (Date.now() > deadline) throw new Error('Nothing was opened in the browser');
    await new Promise((done) => setTimeout(done, 100));
  }
};

const loginButton = (member: Member) => member.control.getByRole('button', { name: 'Se connecter avec Discord' });

// What the browser does at the end: Discord sends it to the service, which sends it to the app on this same PC.
const backFromDiscord = async (member: Member, answer: Record<string, string>): Promise<string> => {
  const authorize = await nextOpenedUrl(member);
  const callback = new URL(authorize.searchParams.get('redirect_uri')!);
  callback.searchParams.set('state', authorize.searchParams.get('state')!);
  for (const [key, value] of Object.entries(answer)) callback.searchParams.set(key, value);
  return (await fetch(callback)).text();
};

const logIn = async (member: Member, userId: string): Promise<void> => {
  await loginButton(member).click();
  await backFromDiscord(member, { code: discord.codeFor(userId) });
  await member.control.getByTestId('account-name').waitFor({ state: 'attached' });
};

// What the service got from Discord is kept for a second in these tests, and may be from just before the change.
const discordListOutdated = () => new Promise((done) => setTimeout(done, 1_100));

const guildCards = (member: Member) =>
  member.control.getByTestId('guild-card').locator('.guild-card-name').allTextContents();

const pickServers = async (member: Member, names: string[]): Promise<void> => {
  for (const name of names) await member.control.getByTestId('guild-card').filter({ hasText: name }).click();
  await member.control.getByRole('button', { name: 'Valider' }).click();
};

const serverPicture = (member: Member, name: string) =>
  member.control.getByRole('navigation', { name: 'Tes serveurs' }).getByRole('button', { name, exact: true });

// The cross only shows on the picture under the mouse.
const crossOn = async (member: Member, picture: string, cross: string) => {
  await serverPicture(member, picture).hover();
  return member.control.getByRole('navigation', { name: 'Tes serveurs' }).getByRole('button', { name: cross, exact: true });
};

const partyMember = (member: Member, name: string) =>
  member.control.getByRole('region', { name: 'Membres' }).getByText(name);

const inServer = (member: Member, name: string) =>
  member.control.getByTestId('party-guild').filter({ hasText: name }).waitFor({ state: 'attached', timeout: 15_000 });

const pictureLoaded = (page: Page, testId: string) =>
  expect
    .poll(() => page.getByTestId(testId).first().evaluate((image: HTMLImageElement) => image.naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

const onlineCount = (member: Member, count: number) =>
  member.control
    .getByTestId('online-count')
    .filter({ hasText: `${count} / 10 en ligne` })
    .waitFor({ state: 'attached', timeout: 15_000 });

const connected = async (member: Member, timeout = 15_000): Promise<void> => {
  try {
    await member.control
      .getByTestId('connection')
      .filter({ hasText: 'Connecté' })
      .waitFor({ state: 'attached', timeout });
  } catch (error) {
    const shown = await member.control.getByRole('alert').allTextContents();
    throw new Error(`Not connected. Message on screen: ${shown.join(' | ') || 'none'}`, { cause: error });
  }
};

const partyCode = async (member: Member): Promise<string> =>
  (await member.control.getByTestId('party-code').textContent())!.trim();

const stageVisible = (member: Member) =>
  member.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) => window.getTitle().includes('Scène') && window.isVisible()),
  );

// Réglages isn't one of the tabs of a party: it stays reachable from the rail, with or without a party.
// Once what just appeared has finished arriving, so that the picture shows what people really look at.
const picture = async (page: Page, name: string): Promise<void> => {
  await new Promise((done) => setTimeout(done, 500));
  await page.screenshot({ path: join(artifacts, name) });
};

const openTab = (member: Member, name: string) =>
  name === 'Réglages'
    ? member.control.getByRole('button', { name, exact: true }).click()
    : member.control.getByRole('tab', { name }).click();

const mainWindowVisible = (member: Member) =>
  member.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((window) => !window.getTitle().includes('Scène') && window.isVisible()),
  );

const overlayState = async (member: Member, state: string, timeout = 30_000): Promise<void> => {
  try {
    await member.stage.locator(`[data-testid="stage"][data-state="${state}"]`).waitFor({ state: 'attached', timeout });
  } catch (error) {
    const seen = await member.control.evaluate(() => window.liveChat.getState());
    const mounted = await member.stage.getByTestId('stage').count();
    const shown = await member.control.getByRole('alert').allTextContents();
    const details = { connection: seen.party?.connection, queue: seen.queue, mounted, shown };
    throw new Error(`The overlay never reached "${state}": ${JSON.stringify(details)}`, { cause: error });
  }
};

// The real file picker can't be driven from a test, so it answers with this file.
const answerDialogWith = (member: Member, path: string) =>
  member.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, path);

const pickFile = async (member: Member, path: string): Promise<void> => {
  await openTab(member, 'LiveChat');
  await answerDialogWith(member, path);
  await member.control.getByRole('button', { name: 'Depuis mon PC' }).click();
};

const sendButton = (member: Member) => member.control.getByRole('button', { name: 'Envoyer à tout le monde' });

const sendText = async (member: Member, text: string) => {
  await member.control.getByLabel('Texte à afficher').fill(text);
  await sendButton(member).click();
};

const setRange = (member: Member, label: RegExp, value: number) =>
  member.control.getByLabel(label).evaluate((input, next) => {
    // React only sees a change made through the native setter.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);

const silentWav = (seconds: number): Buffer => {
  const rate = 8_000;
  const samples = rate * seconds;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples, 40);
  return wav;
};

// Records a real video in the page, since no video encoder is available to the tests themselves.
const recordVideo = async (member: Member, path: string, milliseconds: number): Promise<void> => {
  const base64 = await member.control.evaluate(async (duration) => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d')!;
    const paint = setInterval(() => {
      context.fillStyle = `hsl(${Date.now() % 360} 80% 50%)`;
      context.fillRect(0, 0, 160, 90);
    }, 30);
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/webm' });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const finished = new Promise((done) => (recorder.onstop = done));
    recorder.start();
    await new Promise((done) => setTimeout(done, duration));
    recorder.stop();
    await finished;
    clearInterval(paint);

    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, milliseconds);
  writeFileSync(path, Buffer.from(base64, 'base64'));
};

// How far a member's video is from where the shared timeline says it should be, in seconds.
const videoDrift = (member: Member) =>
  member.stage.evaluate(async () => {
    const state = await window.liveChat.getState();
    const current = state.queue.current!;
    const video = document.querySelector<HTMLVideoElement>('[data-testid="overlay-video"]')!;
    return {
      paused: video.paused,
      position: video.currentTime,
      drift: video.currentTime - (current.clipStartMs + Date.now() - current.startAt!) / 1000,
    };
  });

beforeAll(async () => {
  mkdirSync(artifacts, { recursive: true });
  if (online) return;
  await discord.start();
  await startServer();
});

afterAll(async () => {
  stopServer();
  await discord.stop();
  rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

// Logging in for real takes a person and a real Discord account, so online this stops at the door.
describe.runIf(online)('the published app and the online service', () => {
  it('sends people to Discord asking for nothing more than who they are and their servers', async () => {
    const member = await launch('online');
    await loginButton(member).click();

    const authorize = await nextOpenedUrl(member);
    expect(authorize.origin + authorize.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(authorize.searchParams.get('scope')).toBe('identify guilds');
    expect(authorize.searchParams.get('client_id')).toMatch(/^\d{17,20}$/);
    expect(authorize.searchParams.get('redirect_uri')).toMatch(/^https:\/\/.+\/v1\/auth\/callback$/);

    await member.control.getByRole('button', { name: 'Annuler' }).click();
    await loginButton(member).waitFor();
    await member.app.close();
  });
});

describe.skipIf(online)('party flow in the real app', () => {
  let host: Member;
  let guest: Member;
  let code: string;

  afterAll(async () => {
    await host?.app.close().catch(() => {});
    await guest?.app.close().catch(() => {});
  });

  it('opens on the login screen with no party and a hidden stage', async () => {
    host = await launch('host');
    await loginButton(host).waitFor();
    expect(await stageVisible(host)).toBe(false);
    await picture(host.control, '1-login.png');
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

  it('lets someone give up on logging in', async () => {
    await loginButton(host).click();
    await host.control.getByTestId('login-waiting').waitFor();
    await nextOpenedUrl(host);
    await host.control.getByRole('button', { name: 'Annuler' }).click();
    await loginButton(host).waitFor();
    await expect(host.control.getByRole('alert').count()).resolves.toBe(0);
  });

  it('says so when the login is refused on Discord', async () => {
    await loginButton(host).click();
    await backFromDiscord(host, { error: 'access_denied' });
    await host.control.getByRole('alert').filter({ hasText: 'annulée' }).waitFor();
    await loginButton(host).waitFor();
  });

  it('logs in through the browser, and gets the name and picture from Discord', async () => {
    await loginButton(host).click();
    const page = await backFromDiscord(host, { code: discord.codeFor(nono) });
    expect(page).toContain('C’est bon');

    await host.control.getByTestId('account-name').filter({ hasText: 'Nono' }).waitFor({ state: 'attached' });
    // The real picture, from the real address, allowed through by the app's own rules.
    await pictureLoaded(host.control, 'account-avatar');

    const state = await host.control.evaluate(() => window.liveChat.getState());
    expect(JSON.stringify(state)).not.toContain('token');
    expect(state.party).toBeNull();
  });

  it('asks which servers to use, among the real ones of each person, with a search bar', async () => {
    await host.control.getByRole('heading', { name: 'Avec quel serveur' }).waitFor();
    await expect.poll(() => guildCards(host)).toEqual(['Les potes']);
    await picture(host.control, '2-picker.png');

    guest = await launch('guest');
    await logIn(guest, pote);
    await expect.poll(() => guildCards(guest)).toEqual(['Les potes', 'Autre serveur']);

    await guest.control.getByLabel('Rechercher un serveur').fill('autre');
    await expect.poll(() => guildCards(guest)).toEqual(['Autre serveur']);
    await guest.control.getByLabel('Rechercher un serveur').fill('');
    expect(await guest.control.getByRole('button', { name: 'Valider' }).isDisabled()).toBe(true);
  });

  it('keeps the button to validate in reach with a lot of servers', async () => {
    const collector = discord.addUser('Collectionneur');
    for (let number = 1; number <= 60; number += 1) {
      discord.addMember(discord.addGuild(`Serveur numéro ${number}`), collector);
    }

    const crowded = await launch('crowded');
    await logIn(crowded, collector);
    await crowded.control.getByTestId('guild-card').first().waitFor();
    await crowded.control.getByTestId('guild-card').nth(2).click();

    const validate = crowded.control.getByRole('button', { name: 'Valider' });
    const box = await validate.boundingBox();
    const windowHeight = await crowded.control.evaluate(() => window.innerHeight);
    expect(box!.y + box!.height).toBeLessThanOrEqual(windowHeight);
    await picture(crowded.control, '2-picker-crowded.png');
    await crowded.app.close();
  });

  it('enters the party of the server once validated, and both see each other', async () => {
    await pickServers(host, ['Les potes']);
    await connected(host);
    await onlineCount(host, 1);
    await inServer(host, 'Les potes');
    // Nothing to show yet, so the overlay stays out of the way.
    expect(await stageVisible(host)).toBe(false);
    await overlayState(host, 'idle');

    await pickServers(guest, ['Les potes', 'Autre serveur']);
    await connected(guest);
    await inServer(guest, 'Les potes');
    await onlineCount(guest, 2);
    await onlineCount(host, 2);

    await partyMember(host, 'Pote').waitFor();
    await partyMember(guest, 'Nono').waitFor();
    await pictureLoaded(guest.control, 'member-avatar');
    await picture(guest.control, '3-party-guest.png');
  });

  it('switches party with one click on the picture of a server', async () => {
    await serverPicture(guest, 'Autre serveur').click();
    await inServer(guest, 'Autre serveur');
    await connected(guest);
    await onlineCount(guest, 1);
    await onlineCount(host, 1);

    await serverPicture(guest, 'Les potes').click();
    await inServer(guest, 'Les potes');
    await onlineCount(host, 2);
  });

  it('goes to the party when clicking the server already joined', async () => {
    await openTab(guest, 'Réglages');
    await serverPicture(guest, 'Les potes').click();
    await guest.control.getByTestId('party-guild').waitFor();
    await connected(guest);
  });

  it('adds and removes servers with the round plus', async () => {
    const newServer = discord.addGuild('Tout neuf');
    discord.addMember(newServer, pote);
    await discordListOutdated();

    await serverPicture(guest, 'Ajouter un serveur').click();
    await guest.control.getByTestId('guild-card').filter({ hasText: 'Tout neuf' }).waitFor({ timeout: 15_000 });
    await pickServers(guest, ['Tout neuf']);
    await inServer(guest, 'Tout neuf');
    await onlineCount(host, 1);

    await serverPicture(guest, 'Ajouter un serveur').click();
    await pickServers(guest, ['Tout neuf']);
    await serverPicture(guest, 'Tout neuf').waitFor({ state: 'detached' });
    await serverPicture(guest, 'Les potes').click();
    await inServer(guest, 'Les potes');
    await onlineCount(host, 2);
  });

  it('removes a server with the cross on its picture, and moves on to another', async () => {
    await serverPicture(guest, 'Ajouter un serveur').click();
    await pickServers(guest, ['Tout neuf']);
    await inServer(guest, 'Tout neuf');
    await onlineCount(host, 1);

    await (await crossOn(guest, 'Tout neuf', 'Retirer Tout neuf')).click();
    await serverPicture(guest, 'Tout neuf').waitFor({ state: 'detached' });
    await inServer(guest, 'Les potes');
    await onlineCount(host, 2);

    // Not the one someone is in: nothing else moves.
    await serverPicture(guest, 'Ajouter un serveur').click();
    await pickServers(guest, ['Tout neuf']);
    await inServer(guest, 'Tout neuf');
    await serverPicture(guest, 'Les potes').click();
    await inServer(guest, 'Les potes');
    await (await crossOn(guest, 'Tout neuf', 'Retirer Tout neuf')).click();
    await serverPicture(guest, 'Tout neuf').waitFor({ state: 'detached' });
    await inServer(guest, 'Les potes');
    await connected(guest);
  });

  it('takes someone out of the party when they leave the Discord server, and moves them along', async () => {
    discord.removeMember(serverId, pote);
    await guest.control.getByTestId('notice').filter({ hasText: 'plus sur ce serveur' }).waitFor({ timeout: 20_000 });
    await onlineCount(host, 1);
    await serverPicture(guest, 'Les potes').waitFor({ state: 'detached', timeout: 15_000 });
    await inServer(guest, 'Autre serveur');
    await connected(guest);

    discord.addMember(serverId, pote);
    await discordListOutdated();
    await serverPicture(guest, 'Ajouter un serveur').click();
    await guest.control.getByTestId('guild-card').filter({ hasText: 'Les potes' }).waitFor({ timeout: 15_000 });
    await pickServers(guest, ['Les potes']);
    await inServer(guest, 'Les potes');
    await onlineCount(host, 2);
    await expect(guest.control.getByTestId('notice').count()).resolves.toBe(0);
  });

  it('comes back alone after the app restarts, still logged in', async () => {
    await guest.app.close();
    await onlineCount(host, 1);

    guest = await launch('guest');
    await connected(guest);
    await onlineCount(host, 2);
    await inServer(guest, 'Les potes');
    await guest.control.getByTestId('account-name').filter({ hasText: 'Pote' }).waitFor({ state: 'attached' });
  });

  it('hands over to a second PC, and lets the first take it back', async () => {
    const secondPc = await launch('second-pc');
    await logIn(secondPc, pote);
    await secondPc.control.getByTestId('guild-card').filter({ hasText: 'Les potes' }).waitFor();
    await pickServers(secondPc, ['Les potes']);
    await connected(secondPc);
    await guest.control.getByTestId('connection').filter({ hasText: 'autre PC' }).waitFor({ state: 'attached', timeout: 15_000 });
    await onlineCount(host, 2);

    await guest.control.getByRole('button', { name: 'Reprendre ici' }).click();
    await connected(guest);
    await secondPc.control.getByTestId('connection').filter({ hasText: 'autre PC' }).waitFor({ state: 'attached', timeout: 15_000 });
    await secondPc.app.close();
    await onlineCount(host, 2);
  });

  it('reconnects within 10 s of the service coming back', async () => {
    stopServer();
    await host.control
      .getByTestId('connection')
      .filter({ hasText: 'nouvelle tentative' })
      .waitFor({ timeout: 15_000 });
    await picture(host.control, '4-reconnecting.png');

    await startServer();
    const backAt = Date.now();
    await Promise.all([connected(host, 10_000), connected(guest, 10_000)]);
    console.log(`Both members back online ${Date.now() - backAt} ms after the service returned`);
    await onlineCount(host, 2);
  });

  it('opens the media tabs', async () => {
    await openTab(host, 'LiveChat');
    await openTab(guest, 'LiveChat');
    await picture(host.control, '7-media-empty.png');
  });

  it('makes the stage a transparent, click-through overlay that never takes focus', async () => {
    const details = await host.app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows().find((candidate) => candidate.getTitle().includes('Scène'))!;
      const display = screen.getPrimaryDisplay().bounds;
      // Where the app itself put it, before the tests moved it out of the way.
      const bounds = (globalThis as unknown as { realOverlayBounds: Electron.Rectangle }).realOverlayBounds;
      return {
        handle: window.getNativeWindowHandle().readBigUInt64LE().toString(),
        onTop: window.isAlwaysOnTop(),
        focusable: window.isFocusable(),
        coversScreen:
          bounds.x === display.x &&
          bounds.y === display.y &&
          bounds.width === display.width &&
          bounds.height === display.height - 1,
      };
    });
    expect(details.onTop).toBe(true);
    expect(details.focusable).toBe(false);
    expect(details.coversScreen).toBe(true);

    const WS_EX_TRANSPARENT = 0x20;
    const WS_EX_NOACTIVATE = 0x08000000;
    const style = windowExStyle(details.handle);
    expect(style & WS_EX_TRANSPARENT, 'clicks go through').toBeTruthy();
    expect(style & WS_EX_NOACTIVATE, 'never takes focus').toBeTruthy();
  });

  it('really lets the screen show through around what it displays', async () => {
    const box = await host.app.evaluate(({ BrowserWindow }) => {
      const overlay = BrowserWindow.getAllWindows().find((window) => window.getTitle().includes('Scène'))!;
      const bounds = overlay.getBounds();
      // A plain green window under the overlay, so that nothing else on this PC is ever looked at.
      const backdrop = new BrowserWindow({
        ...bounds,
        frame: false,
        focusable: false,
        skipTaskbar: true,
        show: false,
        backgroundColor: '#00ff00',
      });
      (globalThis as unknown as { backdrop: Electron.BrowserWindow }).backdrop = backdrop;
      backdrop.showInactive();
      backdrop.setAlwaysOnTop(true, 'floating');
      return bounds;
    });

    await openTab(host, 'Réglages');
    await host.control.getByRole('button', { name: 'Test d’affichage' }).click();
    await overlayState(host, 'test');
    await new Promise((done) => setTimeout(done, 700));

    const beside = screenPixel(box.x + Math.round(box.width * 0.9), box.y + Math.round(box.height * 0.45));
    const onImage = screenPixel(box.x + Math.round(box.width * 0.5), box.y + Math.round(box.height * 0.45));
    console.log(`Screen beside the image: ${beside}, on the image: ${onImage}`);

    await host.app.evaluate(() => (globalThis as unknown as { backdrop: Electron.BrowserWindow }).backdrop.destroy());
    await openTab(host, 'LiveChat');
    await overlayState(host, 'idle', 10_000);

    expect(beside).toEqual([0, 255, 0]);
    expect(onImage).not.toEqual([0, 255, 0]);
  });

  it('runs the display test on this PC only, without taking focus', async () => {
    const focused = () =>
      host.app.evaluate(({ BrowserWindow }) => BrowserWindow.getFocusedWindow()?.getTitle() ?? null);
    const before = await focused();

    await openTab(host, 'Réglages');
    await host.control.getByRole('button', { name: 'Test d’affichage' }).click();
    await overlayState(host, 'test');
    expect(await stageVisible(host)).toBe(true);
    expect(await focused()).toBe(before);
    await host.stage.getByTestId('overlay-text').filter({ hasText: 'texte de test' }).waitFor();
    await host.stage.getByTestId('overlay-profile').filter({ hasText: 'Nono' }).waitFor();
    await picture(host.stage, '5-overlay-test.png');

    expect(await stageVisible(guest)).toBe(false);
    await overlayState(guest, 'idle');

    await overlayState(host, 'idle', 10_000);
    await expect.poll(() => stageVisible(host), { timeout: 5_000 }).toBe(false);
    await openTab(host, 'LiveChat');
  });

  it('shows a text on both screens at the same moment, with who sent it', async () => {
    await host.control.getByLabel('Texte à afficher').fill('Bonjour la party');
    await setRange(host, /Durée d’affichage/, 2_000);
    await sendButton(host).click();

    for (const member of [host, guest]) {
      await overlayState(member, 'playing');
      await member.stage.getByTestId('overlay-text').filter({ hasText: 'Bonjour la party' }).waitFor();
      await member.stage.getByTestId('overlay-profile').filter({ hasText: 'Nono' }).waitFor();
      expect(await stageVisible(member)).toBe(true);
    }

    const [hostStart, guestStart] = await Promise.all(
      [host, guest].map((member) =>
        member.control.evaluate(async () => (await window.liveChat.getState()).queue.current?.startAt ?? null),
      ),
    );
    expect(Math.abs(hostStart! - guestStart!)).toBeLessThan(150);

    await overlayState(host, 'idle');
    await overlayState(guest, 'idle');
    await expect.poll(() => stageVisible(guest), { timeout: 5_000 }).toBe(false);
  });

  it('sends an image from one PC to the other, with its text', async () => {
    await pickFile(host, join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'));
    await host.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
    await picture(host.control, '7-media-tab.png');
    // Long enough to be caught on screen by the checks below, which only look every second or so.
    await setRange(host, /Durée d’affichage/, 5_000);
    await host.control.getByLabel('Texte à afficher').fill('Regarde cette image');
    await sendButton(host).click();

    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-image').waitFor();
    await expect
      .poll(() => guest.stage.getByTestId('overlay-image').evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Regarde cette image' }).waitFor();
    // The picture of whoever sent it, and not just their initial.
    await pictureLoaded(guest.stage, 'overlay-avatar');
    await picture(guest.stage, '6-overlay-image.png');
    await overlayState(guest, 'idle');
  });

  it('plays only the chosen passage of a video, in sync on both PCs', async () => {
    const video = join(sandbox, 'clip.webm');
    await recordVideo(host, video, 6_000);

    await pickFile(host, video);
    await host.control.getByTestId('clip-start').waitFor({ timeout: 15_000 });
    await setRange(host, /Début du passage/, 1_000);
    await setRange(host, /Fin du passage/, 5_000);
    await host.control.getByTestId('clip-start').filter({ hasText: '0:01,0' }).waitFor();
    await host.control.getByTestId('clip-end').filter({ hasText: '0:05,0' }).waitFor();
    await picture(host.control, '7-media-clip.png');
    await sendButton(host).click();

    await overlayState(host, 'playing');
    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-video').waitFor({ state: 'attached' });
    await guest.stage.locator('[data-on-screen="true"]').waitFor({ state: 'attached' });

    // Let it settle, as the first instants are the only ones allowed to be rough.
    await new Promise((done) => setTimeout(done, 1_500));
    const [forHost, forGuest] = await Promise.all([videoDrift(host), videoDrift(guest)]);
    console.log(`Video drift from the shared timeline: ${forHost.drift.toFixed(3)} s and ${forGuest.drift.toFixed(3)} s`);
    for (const reading of [forHost, forGuest]) {
      expect(reading.paused).toBe(false);
      expect(Math.abs(reading.drift)).toBeLessThan(0.25);
      // 1.5 s into a passage that starts at 1 s.
      expect(reading.position).toBeGreaterThan(1.5);
      expect(reading.position).toBeLessThan(5);
    }

    await overlayState(host, 'idle');
    await overlayState(guest, 'idle');
  });

  it('keeps the order of the queue, and lets anyone skip', async () => {
    // Long enough that the first one can't finish before the others have even been sent.
    await setRange(host, /Durée d’affichage/, 30_000);
    await setRange(guest, /Durée d’affichage/, 30_000);
    await sendText(host, 'Premier message');
    await sendText(guest, 'Deuxième message');
    await sendText(guest, 'Troisième message');

    await host.control.getByTestId('queue-waiting').filter({ hasText: '2 en attente' }).waitFor();
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Premier message' }).waitFor();

    await guest.control.getByRole('button', { name: 'Passer' }).click();
    await host.stage.getByTestId('overlay-text').filter({ hasText: 'Deuxième message' }).waitFor();
    await host.stage.getByTestId('overlay-profile').filter({ hasText: 'Pote' }).waitFor();

    await host.control.getByRole('button', { name: 'Passer' }).click();
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Troisième message' }).waitFor();
    await host.control.getByRole('button', { name: 'Passer' }).click();
    await overlayState(host, 'idle');
    await overlayState(guest, 'idle');
  });

  const historyRow = (member: Member, title: string) =>
    member.control.getByTestId('history-item').filter({ hasText: title }).first();

  it('keeps what played in the history, and replays it for the whole party', async () => {
    await openTab(host, 'Historique');
    await openTab(guest, 'Historique');
    await historyRow(guest, 'logo.png').waitFor({ timeout: 10_000 });
    await picture(guest.control, '10-history-tab.png');
    const rows = await guest.control.getByTestId('history-item').count();

    await historyRow(guest, 'logo.png').getByRole('button', { name: 'Rejouer pour tous' }).click();
    for (const member of [host, guest]) {
      await overlayState(member, 'playing');
      await member.stage.getByTestId('overlay-image').waitFor();
      // Whoever brought it back is who the others see.
      await member.stage.getByTestId('overlay-profile').filter({ hasText: 'Pote' }).waitFor();
    }
    await picture(host.control, '10-history-playing.png');
    await host.control.getByRole('button', { name: 'Passer' }).click();
    await overlayState(host, 'idle');
    await overlayState(guest, 'idle');

    // A replay is already in there: playing it again doesn't add a line.
    expect(await guest.control.getByTestId('history-item').count()).toBe(rows);
  });

  it('replays for one person only, without anyone else noticing', async () => {
    await historyRow(guest, 'logo.png').getByRole('button', { name: 'Revoir pour moi' }).click();
    await overlayState(guest, 'replay');
    await guest.stage.getByTestId('overlay-image').waitFor();
    await guest.stage.getByTestId('overlay-profile').filter({ hasText: 'Nono' }).waitFor();
    await picture(guest.stage, '6-overlay-replay.png');
    expect(await stageVisible(guest)).toBe(true);

    await overlayState(host, 'idle');
    expect(await stageVisible(host)).toBe(false);

    await guest.control.getByRole('button', { name: 'Arrêter' }).click();
    await overlayState(guest, 'idle');
  });

  it('sends a text or picks a file straight from the party', async () => {
    await openTab(host, 'Party');
    await openTab(guest, 'Party');
    await host.control.getByLabel('Un texte').fill('Vite fait');
    await host.control.getByRole('button', { name: 'Envoyer le texte' }).click();

    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Vite fait' }).waitFor();
    await host.control.getByTestId('now-playing').filter({ hasText: 'Vite fait' }).waitFor();
    await picture(host.control, '3-party-playing.png');
    await guest.control.getByRole('button', { name: 'Passer' }).click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
    expect(await host.control.getByLabel('Un texte').inputValue()).toBe('');

    await pickFile(host, join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'));
    await host.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).click();
    await host.control.getByTestId('draft-name').waitFor({ state: 'detached' });
    await openTab(guest, 'LiveChat');
  });

  it('applies the local volume, plays sounds, and keeps settings after a restart', async () => {
    await openTab(guest, 'Réglages');
    await setRange(guest, /Volume/, 30);
    await guest.control.getByTestId('volume-value').filter({ hasText: '30 %' }).waitFor();

    const sound = join(sandbox, 'son.wav');
    writeFileSync(sound, silentWav(3));
    await pickFile(host, sound);
    await host.control.getByTestId('clip-start').waitFor({ timeout: 15_000 });
    await sendButton(host).click();

    await overlayState(guest, 'playing');
    const audio = guest.stage.getByTestId('overlay-audio');
    await audio.waitFor({ state: 'attached' });
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused), { timeout: 10_000 }).toBe(false);
    expect(await audio.evaluate((element: HTMLAudioElement) => element.volume)).toBeCloseTo(0.3);
    expect(await host.stage.getByTestId('overlay-audio').evaluate((element: HTMLAudioElement) => element.volume)).toBe(1);

    await host.control.getByRole('button', { name: 'Passer' }).click();
    await overlayState(guest, 'idle');

    await guest.app.close();
    await onlineCount(host, 1);
    guest = await launch('guest');
    await connected(guest);
    await openTab(guest, 'Réglages');
    await guest.control.getByTestId('volume-value').filter({ hasText: '30 %' }).waitFor();
  });

  it('sends a picture and a sound together, with a text on several lines', async () => {
    await openTab(host, 'LiveChat');
    await pickFile(host, join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'));
    const sound = join(sandbox, 'son-meme.wav');
    writeFileSync(sound, silentWav(3));
    await answerDialogWith(host, sound);
    await host.control.getByRole('group', { name: 'Ajouter un son' }).getByRole('button', { name: 'Depuis mon PC' }).click();
    await host.control.getByTestId('clip-start').waitFor({ timeout: 15_000 });
    await expect.poll(() => host.control.getByTestId('draft-name').count()).toBe(2);
    await picture(host.control, '11-meme-base.png');

    await host.control.getByLabel('Texte à afficher').fill('Première ligne\nDeuxième ligne');
    await sendButton(host).click();

    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-image').waitFor();
    const audio = guest.stage.getByTestId('overlay-audio');
    await audio.waitFor({ state: 'attached' });
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.paused), { timeout: 10_000 }).toBe(false);
    const text = guest.stage.getByTestId('overlay-text').locator('p');
    await expect.poll(() => text.evaluate((element) => (element as HTMLElement).innerText)).toContain('\n');
    await picture(guest.stage, '12-overlay-meme.png');

    await host.control.getByRole('button', { name: 'Passer' }).click();
    await overlayState(guest, 'idle');
    await expect.poll(() => host.control.getByTestId('draft-name').count()).toBe(0);
  });

  it('plays a video with a sound for the length of the video, silent as whoever sends chose', async () => {
    await openTab(host, 'LiveChat');
    await pickFile(host, join(sandbox, 'clip.webm'));
    await host.control.getByTestId('clip-start').waitFor({ timeout: 15_000 });
    const sound = join(sandbox, 'son-video.wav');
    writeFileSync(sound, silentWav(2));
    await answerDialogWith(host, sound);
    await host.control.getByRole('group', { name: 'Ajouter un son' }).getByRole('button', { name: 'Depuis mon PC' }).click();
    await expect.poll(() => host.control.getByTestId('draft-name').count()).toBe(2);
    await host.control.getByTestId('clip-end').waitFor({ timeout: 15_000 });

    await host.control.getByText('Son de la vidéo').click();
    await sendButton(host).click();

    await overlayState(guest, 'playing');
    const video = guest.stage.getByTestId('overlay-video');
    await video.waitFor();
    await guest.stage.getByTestId('overlay-audio').waitFor({ state: 'attached' });
    expect(await video.evaluate((element: HTMLVideoElement) => element.volume)).toBe(0);
    expect(await guest.stage.getByTestId('overlay-audio').evaluate((element: HTMLAudioElement) => element.volume)).toBeGreaterThan(0);

    const { queue } = await guest.control.evaluate(() => window.liveChat.getState());
    expect(queue.current!.durationMs).toBeGreaterThan(5_000);

    await host.control.getByRole('button', { name: 'Passer' }).click();
    await overlayState(guest, 'idle');
  });

  it('finds files in a folder, and saves a LiveChat that comes back even after its file moved', async () => {
    const folder = join(sandbox, 'mes-memes');
    mkdirSync(join(folder, 'sous-dossier'), { recursive: true });
    const image = join(folder, 'sous-dossier', 'cowboy.png');
    copyFileSync(join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'), image);
    writeFileSync(join(folder, 'bruit.wav'), silentWav(1));
    writeFileSync(join(folder, 'pas-un-media.txt'), 'rien');

    await openTab(host, 'Bibliothèque');
    await answerDialogWith(host, folder);
    await host.control.getByRole('button', { name: 'Ajouter un dossier' }).click();
    const cards = host.control.getByTestId('library-file');
    await cards.filter({ hasText: 'cowboy.png' }).waitFor();
    expect(await cards.count()).toBe(1);
    await picture(host.control, '13-library.png');

    await host.control.getByRole('button', { name: /^Sons/ }).click();
    await cards.filter({ hasText: 'bruit.wav' }).waitFor();
    await host.control.getByRole('button', { name: /^Images/ }).click();
    await host.control.getByLabel('Rechercher par nom').fill('nope');
    await host.control.getByText('Rien à ce nom').waitFor();
    await host.control.getByLabel('Rechercher par nom').fill('COWBOY');

    await cards.filter({ hasText: 'cowboy.png' }).getByRole('button', { name: 'Épingler en favori' }).click();
    await cards.filter({ hasText: 'cowboy.png' }).getByRole('button', { name: 'Retirer des favoris' }).waitFor();


    await host.control.getByRole('button', { name: 'Utiliser cowboy.png' }).click();
    await host.control.getByTestId('draft-name').filter({ hasText: 'cowboy.png' }).waitFor();
    await host.control.getByLabel('Texte à afficher').fill('Le cowboy');
    await host.control.getByRole('button', { name: 'Sauvegarder dans la bibliothèque' }).click();
    await host.control.getByLabel('Nom de ce LiveChat').fill('Mon cowboy');
    await host.control.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    await host.control.getByText('Sauvegardé sur ce PC.').waitFor();

    await openTab(host, 'Bibliothèque');
    await host.control.getByLabel('Rechercher par nom').fill('');
    await host.control.getByRole('button', { name: /^Sauvegardés/ }).click();
    const saved = host.control.getByTestId('saved-livechat').filter({ hasText: 'Mon cowboy' });
    await saved.waitFor();
    await picture(host.control, '14-library-saved.png');

    await saved.getByRole('button', { name: 'Envoyer' }).click();
    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Le cowboy' }).waitFor();
    await host.control.getByRole('button', { name: 'Passer' }).first().click();
    await overlayState(guest, 'idle');

    // Moved: said so, can't be sent, and showing the file again brings it back.
    const moved = join(sandbox, 'cowboy-range.png');
    renameSync(image, moved);
    await openTab(host, 'Party');
    await openTab(host, 'Bibliothèque');
    await saved.getByTestId('saved-missing').filter({ hasText: '1 fichier introuvable' }).waitFor();
    await expect(saved.getByRole('button', { name: 'Envoyer' }).isDisabled()).resolves.toBe(true);

    writeFileSync(join(sandbox, 'mauvais.png'), 'pas le bon');
    await answerDialogWith(host, join(sandbox, 'mauvais.png'));
    await saved.getByRole('button', { name: 'Retrouver' }).click();
    await host.control.getByRole('alert').filter({ hasText: 'pas un des fichiers' }).waitFor();

    await answerDialogWith(host, moved);
    await saved.getByRole('button', { name: 'Retrouver' }).click();
    await expect.poll(() => saved.getByTestId('saved-missing').count()).toBe(0);
    await expect(saved.getByRole('button', { name: 'Envoyer' }).isDisabled()).resolves.toBe(false);

    await saved.getByRole('button', { name: 'Modifier' }).click();
    await host.control.getByTestId('draft-name').filter({ hasText: 'cowboy-range.png' }).waitFor();
    await expect(host.control.getByLabel('Texte à afficher').inputValue()).resolves.toBe('Le cowboy');
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).click();
    await host.control.getByLabel('Texte à afficher').fill('');

    await openTab(host, 'Bibliothèque');
    await saved.getByRole('button', { name: 'Supprimer' }).click();
    await saved.getByRole('button', { name: 'Vraiment ?' }).click();
    await expect.poll(() => saved.count()).toBe(0);
  });

  it('does everything from a right click, and takes files from the library in the LiveChat tab', async () => {
    const folder = join(sandbox, 'clic-droit');
    mkdirSync(folder);
    const logo = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png');
    for (const name of ['menu-image.png', 'dans-sauvegarde.png', 'a-jeter.png']) copyFileSync(logo, join(folder, name));
    copyFileSync(join(sandbox, 'clip.webm'), join(folder, 'menu-video.webm'));
    writeFileSync(join(folder, 'menu-son.wav'), silentWav(2));
    writeFileSync(join(folder, 'disparu.wav'), silentWav(1));

    // The real menu can't be clicked from here: its lines are pressed for it, and Windows isn't asked to open anything.
    await host.app.evaluate(({ Menu, dialog, shell }) => {
      const seen = globalThis as unknown as { menu?: Electron.Menu; shown: string[]; opened: string[]; answer: number };
      seen.shown = [];
      seen.opened = [];
      seen.answer = 1;
      Menu.prototype.popup = function (this: Electron.Menu) {
        seen.menu = this;
      };
      shell.showItemInFolder = (path) => void seen.shown.push(path);
      shell.openPath = async (path) => {
        seen.opened.push(path);
        return '';
      };
      shell.trashItem = async (path) => process.getBuiltinModule('node:fs').rmSync(path);
      dialog.showMessageBox = (async () => ({ response: seen.answer, checkboxChecked: false })) as typeof dialog.showMessageBox;
    });
    type Line = { label: string; enabled: boolean };
    const openMenu = async (row: ReturnType<typeof host.control.getByTestId>): Promise<Line[]> => {
      await host.app.evaluate(() => void ((globalThis as unknown as { menu?: Electron.Menu }).menu = undefined));
      await row.click({ button: 'right', position: { x: 5, y: 5 } });
      await expect.poll(() => host.app.evaluate(() => Boolean((globalThis as unknown as { menu?: Electron.Menu }).menu))).toBe(true);
      return host.app.evaluate(() =>
        (globalThis as unknown as { menu: Electron.Menu }).menu.items.map(({ label, enabled }) => ({ label, enabled })),
      );
    };
    const press = (label: string) =>
      host.app.evaluate((_, wanted) => {
        const { items } = (globalThis as unknown as { menu: Electron.Menu }).menu;
        (items.find((item) => item.label === wanted) as unknown as { click: () => void }).click();
      }, label);
    const seenBy = (name: 'shown' | 'opened') =>
      host.app.evaluate((_, list) => (globalThis as unknown as Record<string, string[]>)[list]!, name);
    const setAnswer = (answer: number) =>
      host.app.evaluate((_, value) => void ((globalThis as unknown as { answer: number }).answer = value), answer);

    await openTab(host, 'Bibliothèque');
    await host.control.getByRole('button', { name: 'Dossiers' }).click();
    await answerDialogWith(host, folder);
    await host.control.getByRole('button', { name: 'Ajouter un dossier' }).click();
    await host.control.getByRole('button', { name: 'Dossiers' }).click();
    await host.control.getByRole('button', { name: /^Images/ }).click();
    const cards = host.control.getByTestId('library-file');
    const card = (name: string) => cards.filter({ hasText: name });
    await card('menu-image.png').waitFor();

    await openMenu(card('menu-image.png'));
    await press('Afficher dans l’Explorateur');
    await expect(seenBy('shown')).resolves.toEqual([join(folder, 'menu-image.png')]);
    await openMenu(card('menu-image.png'));
    await press('Ouvrir avec l’app par défaut');
    await expect(seenBy('opened')).resolves.toEqual([join(folder, 'menu-image.png')]);
    await openMenu(card('menu-image.png'));
    await press('Copier le chemin');
    await expect(host.app.evaluate(({ clipboard }) => clipboard.readText())).resolves.toBe(join(folder, 'menu-image.png'));
    await openMenu(card('menu-image.png'));
    await press('Épingler en favori');
    await card('menu-image.png').getByRole('button', { name: 'Retirer des favoris' }).waitFor();

    // In the LiveChat tab, it can't be renamed or thrown away. Saved with it, the LiveChat follows it when it is free again.
    await openMenu(card('dans-sauvegarde.png'));
    await press('Utiliser dans un LiveChat');
    await host.control.getByTestId('draft-name').filter({ hasText: 'dans-sauvegarde.png' }).waitFor();
    await host.control.getByLabel('Texte à afficher').fill('Suit son fichier');
    await host.control.getByRole('button', { name: 'Sauvegarder dans la bibliothèque' }).click();
    await host.control.getByLabel('Nom de ce LiveChat').fill('Clic droit');
    await host.control.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    await host.control.getByText('Sauvegardé sur ce PC.').waitFor();
    await openTab(host, 'Bibliothèque');
    const locked = await openMenu(card('dans-sauvegarde.png'));
    expect(locked.find(({ label }) => label === 'Renommer')?.enabled).toBe(false);
    expect(locked.find(({ label }) => label === 'Mettre à la corbeille')?.enabled).toBe(false);
    await openTab(host, 'LiveChat');
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).click();
    await host.control.getByLabel('Texte à afficher').fill('');
    await openTab(host, 'Bibliothèque');

    const rename = async (from: string, to: string) => {
      await openMenu(card(from));
      await press('Renommer');
      await host.control.getByLabel('Nouveau nom').fill(to);
      await host.control.locator('.library-rename').getByRole('button', { name: 'Renommer' }).click();
    };
    await rename('dans-sauvegarde.png', 'mauvais:nom');
    await picture(host.control, '15-library-rename.png');
    await host.control.getByRole('alert').filter({ hasText: 'Windows refuse' }).waitFor();
    await host.control.locator('.library-rename').getByRole('button', { name: 'Annuler' }).click();
    await rename('dans-sauvegarde.png', 'menu-image');
    await host.control.getByRole('alert').filter({ hasText: 'déjà ce nom' }).waitFor();
    await host.control.locator('.library-rename').getByRole('button', { name: 'Annuler' }).click();
    await rename('dans-sauvegarde.png', 'nouveau-nom');
    await card('nouveau-nom.png').waitFor();
    expect(existsSync(join(folder, 'nouveau-nom.png'))).toBe(true);
    expect(existsSync(join(folder, 'dans-sauvegarde.png'))).toBe(false);

    // Its picture is on screen, which must not hold it back.
    await host.control.getByRole('button', { name: /^Vidéos/ }).click();
    await card('menu-video.webm').waitFor();
    await rename('menu-video.webm', 'video-renommee');
    await card('video-renommee.webm').waitFor();
    await host.control.getByRole('button', { name: /^Images/ }).click();

    await setAnswer(1);
    await openMenu(card('a-jeter.png'));
    await press('Mettre à la corbeille');
    await expect.poll(() => existsSync(join(folder, 'a-jeter.png'))).toBe(true);
    await card('a-jeter.png').waitFor();
    await setAnswer(0);
    await openMenu(card('a-jeter.png'));
    await press('Mettre à la corbeille');
    await expect.poll(() => card('a-jeter.png').count()).toBe(0);
    expect(existsSync(join(folder, 'a-jeter.png'))).toBe(false);

    await host.control.getByRole('button', { name: /^Sauvegardés/ }).click();
    const saved = host.control.getByTestId('saved-livechat').filter({ hasText: 'Clic droit' });
    await saved.waitFor();
    expect(await saved.getByTestId('saved-missing').count()).toBe(0);
    const savedLines = await openMenu(saved);
    expect(savedLines.map(({ label }) => label)).toEqual(expect.arrayContaining(['Envoyer', 'Modifier', 'Afficher nouveau-nom.png dans l’Explorateur', 'Supprimer']));
    await press('Supprimer');
    await expect.poll(() => saved.count()).toBe(0);

    await host.control.getByRole('button', { name: /^Sons/ }).click();
    rmSync(join(folder, 'disparu.wav'));
    await card('disparu.wav').click({ button: 'right', position: { x: 300, y: 5 } });
    await host.control.getByRole('alert').filter({ hasText: 'plus là' }).waitFor();

    // Straight to everyone, with no stop in the LiveChat tab.
    await openMenu(card('menu-son.wav'));
    await press('Envoyer tout de suite');
    await overlayState(guest, 'playing');
    await host.control.getByRole('button', { name: 'Passer' }).first().click();
    await overlayState(guest, 'idle');
    await host.control.getByRole('button', { name: /^Images/ }).click();
    await openMenu(card('menu-image.png'));
    await press('Envoyer tout de suite');
    await overlayState(guest, 'playing');
    await host.control.getByRole('button', { name: 'Passer' }).first().click();
    await overlayState(guest, 'idle');

    // The LiveChat tab sends you to the right shelf, and brings you back.
    await openTab(host, 'LiveChat');
    await picture(host.control, '17-livechat-choice.png');
    await host.control.getByRole('button', { name: 'Depuis ma bibliothèque' }).click();
    await expect(host.control.getByRole('button', { name: /^Images/ }).getAttribute('aria-pressed')).resolves.toBe('true');
    await host.control.getByRole('button', { name: 'Utiliser menu-image.png' }).click();
    await host.control.getByTestId('draft-name').filter({ hasText: 'menu-image.png' }).waitFor();
    await picture(host.control, '16-livechat-add-sound.png');
    await host.control.getByRole('group', { name: 'Ajouter un son' }).getByRole('button', { name: 'Depuis ma bibliothèque' }).click();
    await expect(host.control.getByRole('button', { name: /^Sons/ }).getAttribute('aria-pressed')).resolves.toBe('true');
    await card('menu-son.wav').getByRole('button', { name: 'Utiliser' }).click();
    await expect.poll(() => host.control.getByTestId('draft-name').count()).toBe(2);
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).first().click();
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).first().click();
    await host.control.getByRole('button', { name: 'Depuis mon PC' }).waitFor();
  });

  it('moves a zone of the overlay, and shows the result on the real screen', async () => {
    await openTab(guest, 'Réglages');
    await guest.control.getByTestId('layout-box').scrollIntoViewIfNeeded();
    await picture(guest.control, '8-settings-tab.png');
    const zone = await guest.control.getByTestId('layout-text').boundingBox();
    await guest.control.mouse.move(zone!.x + 20, zone!.y + 10);
    await guest.control.mouse.down();
    await guest.control.mouse.move(zone!.x + 20, zone!.y - 40, { steps: 4 });
    await guest.control.mouse.up();

    await overlayState(guest, 'test');
    const moved = await guest.control.evaluate(async () => (await window.liveChat.getState()).settings.layout.text.y);
    expect(moved).toBeLessThan(78);
    const shownAt = await guest.stage
      .getByTestId('overlay-text')
      .evaluate((element: HTMLElement) => Number.parseFloat(element.style.top));
    expect(shownAt).toBeCloseTo(moved, 0);

    await guest.control.getByRole('button', { name: 'Remettre par défaut' }).click();
    await expect
      .poll(() => guest.control.evaluate(async () => (await window.liveChat.getState()).settings.layout.text.y))
      .toBe(78);
  });

  const openPrivateParty = async (member: Member) => {
    await serverPicture(member, 'Ajouter un serveur').click();
    await member.control.getByText('Party privée', { exact: true }).click();
  };

  it('creates a private party from its discreet corner, and shows its code', async () => {
    await openPrivateParty(host);
    await picture(host.control, '9-private-corner.png');
    await host.control.getByRole('button', { name: 'Créer une party privée' }).click();
    await host.control.getByTestId('party-code').waitFor();
    await connected(host);
    await onlineCount(host, 1);

    code = await partyCode(host);
    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('refuses a wrong code with a clear message', async () => {
    await openPrivateParty(guest);
    await guest.control.getByLabel('Code de la party').fill('ZZZZZZ');
    await guest.control.getByRole('button', { name: 'Rejoindre' }).click();
    await guest.control.getByRole('alert').filter({ hasText: 'aucune party' }).waitFor();
  });

  it('lets a second person join with the code', async () => {
    await guest.control.getByLabel('Code de la party').fill(code.toLowerCase());
    await guest.control.getByRole('button', { name: 'Rejoindre' }).click();
    await connected(guest);
    await onlineCount(guest, 2);
    await onlineCount(host, 2);
    await partyMember(host, 'Pote').waitFor();
    expect(await partyCode(guest)).toBe(code);
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
    // The two screens don't refresh at the same instant, but they have to end up on the same code.
    await host.control.getByTestId('party-code').filter({ hasText: newCode }).waitFor({ timeout: 10_000 });
  });

  it('goes back to a private party in one click, without typing the code again', async () => {
    await serverPicture(guest, 'Les potes').click();
    await inServer(guest, 'Les potes');
    await serverPicture(guest, 'Party privée').click();
    await guest.control.getByTestId('party-code').waitFor();
    await connected(guest);
    expect(await partyCode(guest)).toBe(await partyCode(host));
  });

  it('comes back to a private party after a restart, even with a changed code', async () => {
    await guest.app.close();
    await onlineCount(host, 1);
    guest = await launch('guest');
    await connected(guest);
    await onlineCount(host, 2);
    expect(await partyCode(guest)).toBe(await partyCode(host));
  });

  it('goes back to the server after leaving a private party', async () => {
    await guest.control.getByRole('button', { name: 'Quitter la party', exact: true }).click();
    await guest.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await inServer(guest, 'Les potes');
    await serverPicture(guest, 'Party privée').waitFor({ state: 'detached' });

    await partyMember(host, 'Pote').waitFor({ state: 'detached', timeout: 10_000 });
    await onlineCount(host, 1);
  });

  it('leaves a private party from its cross, only after confirming', async () => {
    await openPrivateParty(guest);
    await guest.control.getByLabel('Code de la party').fill(await partyCode(host));
    await guest.control.getByRole('button', { name: 'Rejoindre' }).click();
    await connected(guest);
    await onlineCount(host, 2);
    await serverPicture(guest, 'Les potes').click();
    await inServer(guest, 'Les potes');

    const cross = await crossOn(guest, 'Party privée', 'Quitter la party privée');
    await cross.click();
    await expect(serverPicture(guest, 'Party privée').count()).resolves.toBe(1);
    await cross.click();
    await serverPicture(guest, 'Party privée').waitFor({ state: 'detached' });

    await partyMember(host, 'Pote').waitFor({ state: 'detached', timeout: 10_000 });
    await inServer(guest, 'Les potes');
    await connected(guest);
  });

  it('removes the party when its last member leaves', async () => {
    await host.control.getByRole('button', { name: 'Quitter la party', exact: true }).click();
    await host.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await inServer(host, 'Les potes');
    await onlineCount(host, 2);
  });

  it('logs out, and stays logged out after a restart', async () => {
    await openTab(guest, 'Réglages');
    await guest.control.getByRole('button', { name: 'Se déconnecter' }).click();
    await guest.control.getByRole('button', { name: 'Confirmer ?' }).click();
    await loginButton(guest).waitFor();
    await onlineCount(host, 1);

    await guest.app.close();
    guest = await launch('guest');
    await loginButton(guest).waitFor();
    expect((await guest.control.evaluate(() => window.liveChat.getState())).account).toBeNull();
  });

  it('starts with Windows unless told otherwise, and remembers that', async () => {
    const launchAtStartup = async () =>
      (await host.control.evaluate(() => window.liveChat.getState())).settings.launchAtStartup;

    await openTab(host, 'Réglages');
    expect(await launchAtStartup()).toBe(true);
    const box = host.control.getByRole('checkbox', { name: 'Lancer LiveChatSBCB au démarrage de Windows' });
    expect(await box.isChecked()).toBe(true);

    await host.control.getByText('Lancer LiveChatSBCB au démarrage de Windows').click();
    await expect.poll(launchAtStartup).toBe(false);
    await host.control.getByText('Lancer LiveChatSBCB au démarrage de Windows').click();
    await expect.poll(launchAtStartup).toBe(true);
  });

  it('starts hidden with Windows, already in the party', async () => {
    await host.app.close();
    host = await launch('host', ['--hidden']);
    await connected(host);
    expect(await mainWindowVisible(host)).toBe(false);
  });

  it('stays in the background once closed, still playing what the others send', async () => {
    const other = await launch('other');
    await logIn(other, pote);
    await other.control.getByTestId('guild-card').filter({ hasText: 'Les potes' }).waitFor();
    await pickServers(other, ['Les potes']);
    await connected(other);
    await onlineCount(other, 2);

    await other.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.getTitle().includes('Scène'))!
        .close(),
    );
    await expect.poll(() => mainWindowVisible(other)).toBe(false);
    await onlineCount(host, 2);

    await openTab(host, 'Party');
    await host.control.getByLabel('Un texte').fill('Toujours là ?');
    await host.control.getByRole('button', { name: 'Envoyer le texte' }).click();
    await overlayState(other, 'playing');
    await other.stage.getByTestId('overlay-text').filter({ hasText: 'Toujours là ?' }).waitFor();
    expect(await stageVisible(other)).toBe(true);

    // Opening the app a second time brings back the one already running, instead of starting another.
    const executable = await other.app.evaluate(() => process.execPath);
    const secondLaunch = spawn(executable, launchArgs([]), {
      stdio: 'ignore',
      env: { ...process.env, LIVECHATSBCB_PROFILE: join(sandbox, 'other') },
    });
    await new Promise((done) => secondLaunch.once('exit', done));
    await expect.poll(() => mainWindowVisible(other)).toBe(true);

    await other.app.close();
    await onlineCount(host, 1);
  });
});
