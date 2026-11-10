import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RestartCountdown } from '../src/main/update-restart';
import { PATCH_NOTES } from '../src/shared/patch-notes';
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
      // Games twice as fast.
      '--var',
      'GAME_SCALE:0.5',
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
    // Nothing is heard while the tests play, as someone may be using this PC.
    env: { ...process.env, LIVECHATSBCB_PROFILE: join(sandbox, profile), LIVECHATSBCB_SILENT: '1' } as Record<string, string>,
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
    .filter({ hasText: `${count} / 15 en ligne` })
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

// The control window at another width, to see that a screen holds from narrow to wide.
const sizeControl = (member: Member, size: [number, number] | null) =>
  member.app.evaluate(({ BrowserWindow }, wanted) => {
    const window = BrowserWindow.getAllWindows().find((each) => each.webContents.getURL().includes('control.html'))!;
    const previous = (globalThis as { e2eControlSize?: number[] }).e2eControlSize ?? window.getSize();
    (globalThis as { e2eControlSize?: number[] }).e2eControlSize = previous;
    const [width, height] = wanted ?? previous;
    window.setSize(width ?? 1120, height ?? 720);
  }, size);

// The same picture narrow (940, the smallest the window goes) and wide and tall (1400 × 980), then back.
const widePictures = async (member: Member, name: string): Promise<void> => {
  for (const size of [[940, 720], [1400, 980]] as Array<[number, number]>) {
    await sizeControl(member, size);
    await picture(member.control, `${name}-${size[0]}.png`);
  }
  // And the bottom of the game, where the answers often are.
  await member.control.locator('.game-body').evaluate((body) => body.scrollTo(0, body.scrollHeight)).catch(() => {});
  await picture(member.control, `${name}-1400-end.png`);
  await sizeControl(member, null);
};

const openTab = (member: Member, name: string) =>
  name === 'Réglages'
    ? member.control.getByRole('button', { name, exact: true }).click()
    : member.control.getByRole('tab', { name }).click();

const openSettings = async (member: Member, section: string): Promise<void> => {
  await openTab(member, 'Réglages');
  await member.control.getByRole('navigation', { name: 'Sections des réglages' }).getByRole('button', { name: section }).click();
};

const pasteIn = async (member: Member): Promise<void> => {
  await member.control.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await member.app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) if (!window.getTitle().includes('Scène')) window.webContents.paste();
  });
};

const emptyDraft = async (member: Member): Promise<void> => {
  const remove = member.control.locator('.draft-head').getByRole('button', { name: 'Retirer' });
  while ((await remove.count()) > 0) await remove.first().click();
  await member.control.getByLabel(/Texte à afficher/).fill('');
};

const pressKeys = (keys: string): void => {
  spawnSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')`]);
};

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
    const details = { connection: seen.party?.connection, queue: seen.queue, upload: seen.upload, mounted, shown, text: await member.control.evaluate(() => document.body.innerText.slice(0, 900)) };
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
  await member.control.getByRole('button', { name: 'Depuis mon PC' }).first().click();
};

const sendButton = (member: Member) => member.control.getByRole('button', { name: 'Envoyer à tout le monde' });

const sendText = async (member: Member, text: string) => {
  await openTab(member, 'LiveChat');
  await member.control.getByLabel('Texte à afficher').fill(text);
  await sendButton(member).click();
};

const setRange = async (member: Member, label: RegExp, value: number) => {
  // The length of a picture stays folded under the summary.
  if (label.source.includes('Durée') && (await member.control.getByLabel(label).count()) === 0) {
    await member.control.getByTestId('send-summary').click();
  }
  await member.control.getByLabel(label).evaluate((input, next) => {
    // React only sees a change made through the native setter.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
};

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

    await openTab(host, 'Party');
    await openTab(guest, 'Party');
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

  it('sends without a connection, and resumes a send when the connection comes back', async () => {
    await openTab(host, 'LiveChat');
    const big = join(sandbox, 'gros.wav');
    writeFileSync(big, silentWav(12_000));

    stopServer();
    await host.control.getByTestId('connection').filter({ hasText: 'nouvelle tentative' }).waitFor({ timeout: 15_000 });
    await host.control.getByLabel('Texte à afficher').fill('Parti hors ligne');
    await sendButton(host).click();
    await host.control.getByTestId('upload-paused').waitFor();
    await picture(host.control, 'send-offline.png');

    await startServer();
    await connected(host, 30_000);
    await overlayState(guest, 'playing', 60_000);
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Parti hors ligne' }).waitFor();
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click({ force: true }).catch(() => {});
    await overlayState(guest, 'idle', 30_000);

    await pickFile(host, big);
    await host.control.getByTestId('draft-name').filter({ hasText: 'gros.wav' }).waitFor();
    await sendButton(host).click();
    await host.control.locator('.upload progress').waitFor();
    stopServer();
    await host.control.getByTestId('upload-paused').waitFor({ timeout: 60_000 });

    await startServer();
    await overlayState(guest, 'playing', 120_000);
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click({ force: true }).catch(() => {});
    await overlayState(guest, 'idle', 30_000);
    await overlayState(host, 'idle', 30_000);
    await connected(host, 30_000);
    await connected(guest, 30_000);
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
    // Room for the window buttons of a Mac, top left.
    await host.control.evaluate(() => document.documentElement.classList.add('mac'));
    await picture(host.control, 'mac-layout.png');
    await host.control.evaluate(() => document.documentElement.classList.remove('mac'));
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

    await openSettings(host, 'Affichage en jeu');
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

    await openSettings(host, 'Affichage en jeu');
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
    await picture(host.control, 'send-summary-open.png');
    await sendText(host, 'Premier message');
    await sendText(guest, 'Deuxième message');
    await sendText(guest, 'Troisième message');

    await host.control.getByTestId('queue-waiting').filter({ hasText: '2 en attente' }).waitFor();
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Premier message' }).waitFor();

    await guest.control.getByRole('button', { name: 'Passer pour tous' }).click();
    await host.stage.getByTestId('overlay-text').filter({ hasText: 'Deuxième message' }).waitFor();
    await host.stage.getByTestId('overlay-profile').filter({ hasText: 'Pote' }).waitFor();

    await host.control.getByRole('button', { name: 'Passer pour tous' }).click();
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Troisième message' }).waitFor();
    await host.control.getByRole('button', { name: 'Passer pour tous' }).click();
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
    await host.control.getByRole('button', { name: 'Passer pour tous' }).click();
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

  it('shows the update coming down as a bar', async () => {
    const state = await host.control.evaluate(() => window.liveChat.getState());
    await host.app.evaluate(({ BrowserWindow }, shown) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('state:changed', shown);
    }, { ...state, update: { state: 'downloading', version: '9.9.9', percent: 42 } });

    const banner = host.control.getByTestId('update-progress');
    await banner.filter({ hasText: '42 %' }).waitFor();
    expect(await banner.locator('progress').evaluate((bar: HTMLProgressElement) => bar.value)).toBe(42);
    await picture(host.control, 'update-bar.png');

    await host.app.evaluate(({ BrowserWindow }, shown) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('state:changed', shown);
    }, state);
    await banner.waitFor({ state: 'detached' });
  });

  it('keeps a favourite on this PC, and it comes back for me or for everyone', async () => {
    const keptFiles = () =>
      guest.app.evaluate(({ app }) => {
        const { existsSync, readdirSync } = process.getBuiltinModule('node:fs');
        const { join } = process.getBuiltinModule('node:path');
        const root = join(app.getPath('userData'), 'kept-media');
        return existsSync(root) ? readdirSync(root).flatMap((folder) => readdirSync(join(root, folder))) : [];
      });

    await pickFile(host, join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'));
    await sendText(host, 'Le marrant\nDeuxième ligne');
    await overlayState(guest, 'playing');
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    await openTab(guest, 'Historique');
    const row = guest.control.getByTestId('history-item').filter({ hasText: 'logo.png' }).first();
    await row.getByRole('button', { name: 'Épingler en favori' }).click();
    await row.getByRole('button', { name: 'Retirer des favoris' }).waitFor();
    expect(await keptFiles()).toEqual(['0.png']);

    await guest.control.getByRole('group', { name: 'Ce qui est affiché' }).getByRole('button', { name: 'Favoris' }).click();
    const favorite = guest.control.getByTestId('favorite-item').filter({ hasText: 'Le marrant' });
    await favorite.waitFor();
    expect(await favorite.locator('.row-title').textContent()).toBe('Le marrant');
    await picture(guest.control, 'favorites.png');

    await favorite.getByRole('button', { name: 'Revoir pour moi' }).click();
    await overlayState(guest, 'replay');
    await guest.stage.getByTestId('overlay-image').waitFor();
    await overlayState(host, 'idle');
    await favorite.getByRole('button', { name: 'Arrêter' }).click();
    await overlayState(guest, 'idle');

    await favorite.getByRole('button', { name: 'Envoyer à tous' }).click();
    await overlayState(host, 'playing');
    await host.stage.getByTestId('overlay-text').filter({ hasText: 'Le marrant' }).waitFor();
    await openTab(host, 'Party');
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(host, 'idle');
    await overlayState(guest, 'idle');

    await favorite.getByRole('button', { name: 'Retirer' }).click();
    await favorite.getByRole('button', { name: 'Effacer pour de bon ?' }).click();
    await favorite.waitFor({ state: 'detached' });
    await expect.poll(keptFiles).toEqual([]);
    await guest.control.getByRole('group', { name: 'Ce qui est affiché' }).getByRole('button', { name: 'Récents' }).click();
  });

  it('counts down 3 seconds before restarting, and anything starting calls it off', () => {
    vi.useFakeTimers();
    try {
      const finished = vi.fn();
      const cancelled = vi.fn();
      const countdown = new RestartCountdown(() => {}, finished, cancelled);

      countdown.sync(true);
      expect(countdown.seconds).toBe(3);
      vi.advanceTimersByTime(1_000);
      expect(countdown.seconds).toBe(2);
      countdown.sync(false);
      expect(countdown.seconds).toBeNull();
      expect(cancelled).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(5_000);
      expect(finished).not.toHaveBeenCalled();

      countdown.sync(true);
      vi.advanceTimersByTime(3_000);
      expect(finished).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers what is new after an update, newest first, and checks for updates on demand', async () => {
    // A real change would replace this made-up state.
    await host.control.getByTestId('skipped-by').waitFor({ state: 'detached' });
    const state = await host.control.evaluate(() => window.liveChat.getState());
    await host.app.evaluate(({ BrowserWindow }, shown) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('state:changed', shown);
    }, { ...state, whatsNew: true, update: { state: 'ready', version: '9.9.9' }, restartIn: 3 });
    await host.control.getByTestId('update-ready').filter({ hasText: 'redémarre dans 3 s' }).waitFor();
    await picture(host.control, 'restart-countdown.png');

    await host.control.getByTestId('whats-new').getByRole('button', { name: 'Voir les nouveautés' }).click();
    const notes = host.control.getByTestId('patch-note');
    await notes.first().waitFor();
    expect(await notes.first().locator('h3 .mono').textContent()).toBe(PATCH_NOTES[0]!.version);
    expect(await notes.last().locator('h3 .mono').textContent()).toBe('0.1.0');
    await picture(host.control, 'patch-notes.png');
    await host.control.getByTestId('whats-new').waitFor({ state: 'detached' });

    await openSettings(host, 'Mises à jour');
    await host.control.getByRole('button', { name: 'Vérifier les mises à jour' }).click();
    await host.control.getByTestId('update-check').filter({ hasText: 'app installée' }).waitFor();
    await openTab(host, 'LiveChat');
  });

  it('finds the LiveChat being prepared, the tab and the party again after restarting', async () => {
    const stashExists = () =>
      guest.app.evaluate(({ app }) => process.getBuiltinModule('node:fs').existsSync(process.getBuiltinModule('node:path').join(app.getPath('userData'), 'restart-stash.json')));

    await pickFile(guest, join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'));
    await guest.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
    await guest.control.getByLabel('Texte à afficher').fill('Pas perdu');
    await openTab(guest, 'Bibliothèque');

    const state = await guest.control.evaluate(() => window.liveChat.getState());
    await guest.app.evaluate(({ BrowserWindow }, shown) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('state:changed', shown);
    }, { ...state, update: { state: 'ready', version: '9.9.9' }, restartIn: 3 });
    await expect.poll(stashExists).toBe(true);
    await new Promise((done) => setTimeout(done, 300));

    await guest.app.close();
    guest = await launch('guest');
    await connected(guest, 30_000);
    await guest.control.getByRole('tab', { name: 'Bibliothèque', selected: true }).waitFor();
    expect(await stashExists()).toBe(false);

    await openTab(guest, 'LiveChat');
    await guest.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
    expect(await guest.control.getByLabel('Texte à afficher').inputValue()).toBe('Pas perdu');

    await sendButton(guest).click();
    await overlayState(guest, 'playing');
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
  });

  it('cuts a long LiveChat on this PC, and moves on once nobody is watching', async () => {
    await host.control.evaluate(() => window.liveChat.setSettings({ maxDurationSec: 2 }));
    await guest.control.evaluate(() => window.liveChat.setSettings({ maxDurationSec: 2 }));
    await openTab(host, 'LiveChat');
    await setRange(host, /Durée d’affichage/, 30_000);
    await host.control.getByTestId('too-long').waitFor();
    await sendText(host, 'Trop long');
    await overlayState(guest, 'playing');
    const started = Date.now();
    await overlayState(guest, 'idle', 8_000);
    await expect.poll(async () => (await guest.control.evaluate(() => window.liveChat.getState())).queue.current).toBeNull();
    expect(Date.now() - started).toBeLessThan(15_000);

    await setRange(host, /Durée d’affichage/, 5_000);
    await host.control.evaluate(() => window.liveChat.setSettings({ maxDurationSec: 20 }));
    await guest.control.evaluate(() => window.liveChat.setSettings({ maxDurationSec: 20 }));
  });

  it('shows nothing from someone ignored, without them knowing', async () => {
    const hostId = (await host.control.evaluate(() => window.liveChat.getState())).party!.memberId;
    await guest.control.evaluate((id) => window.liveChat.ignoreMember(id, '10min'), hostId);
    await openTab(guest, 'Party');
    await guest.control.getByTestId('member-ignored').filter({ hasText: 'encore' }).waitFor();
    await picture(guest.control, 'member-ignored.png');

    await sendText(host, 'Tu ne me vois pas');
    await overlayState(host, 'playing');
    await guest.control.getByTestId('now-hidden').waitFor();
    expect(await guest.stage.locator('[data-testid="stage"]').getAttribute('data-state')).toBe('idle');
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(host, 'idle');

    await guest.control.evaluate((id) => window.liveChat.ignoreMember(id, 'stop'), hostId);
    await guest.control.getByTestId('member-ignored').waitFor({ state: 'detached' });
  });

  it('cuts everything with the clean key, and sends with a shortcut key from anywhere', async () => {
    // Both test apps run on one PC, and a key can only belong to one of them.
    await guest.app.evaluate(({ globalShortcut }) => globalShortcut.unregisterAll());
    // Not the default key: another app can hold it on the PC running this.
    expect(await host.control.evaluate(() => window.liveChat.setActionKey('cleanKey', 'Ctrl+Shift+F12'))).toEqual({ ok: true, took: null });
    await expect.poll(() => host.app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Ctrl+Shift+F12'))).toBe(true);
    await host.control.getByTestId('clean-key-taken').waitFor({ state: 'detached' });

    pressKeys('^+{F12}');
    await host.control.getByTestId('clean-banner').waitFor({ timeout: 10_000 });
    await picture(host.control, 'clean-mode.png');
    await sendText(guest, 'Pendant le clean');
    await overlayState(guest, 'playing');
    await new Promise((done) => setTimeout(done, 500));
    expect(await host.stage.locator('[data-testid="stage"]').getAttribute('data-state')).toBe('idle');
    expect(await stageVisible(host)).toBe(false);
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    await host.control.getByTestId('clean-banner').getByRole('button', { name: 'Désactiver' }).click();
    await host.control.getByTestId('clean-banner').waitFor({ state: 'detached' });

    await openTab(host, 'LiveChat');
    await host.control.getByLabel('Texte à afficher').fill('Par la touche');
    await host.control.getByRole('button', { name: 'Sauvegarder dans la bibliothèque' }).click();
    await host.control.getByLabel('Nom de ce LiveChat').fill('Mon raccourci');
    await host.control.getByLabel('Nom de ce LiveChat').press('Enter');
    await expect.poll(async () => (await host.control.evaluate(() => window.liveChat.scanLibrary())).saved.some(({ name }) => name === 'Mon raccourci')).toBe(true);
    await host.control.getByLabel('Texte à afficher').fill('');

    // Given right here: pick it, then press the key.
    await openSettings(host, 'Raccourcis');
    await host.control.getByRole('button', { name: '+ Ajouter un LiveChat' }).click();
    await host.control.getByLabel('Chercher un LiveChat').fill('Mon raccourci');
    await host.control.getByTestId('key-choice').filter({ hasText: 'Mon raccourci' }).click();
    await host.control.getByTestId('give-key').waitFor();
    await host.control.keyboard.press('Shift+F3');
    await expect.poll(() => host.app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Shift+F3'))).toBe(true);
    await host.control.getByTestId('shortcut-list').filter({ hasText: 'Mon raccourci' }).waitFor();
    await picture(host.control, 'settings-shortcuts.png');

    pressKeys('+{F3}');
    await overlayState(guest, 'playing', 15_000);
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Par la touche' }).waitFor();

    pressKeys('+{F11}');
    await overlayState(guest, 'idle', 10_000);

    await host.control.evaluate(() => window.liveChat.clearShortcut('Shift+F3'));
    await expect.poll(() => host.app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Shift+F3'))).toBe(false);
  });

  it('opens a wheel with one key, aims with the mouse, and keeps keys tidy', async () => {
    const { control, stage } = host;
    await openSettings(host, 'Raccourcis');

    // A key has one use: the other action gives it up, and you are told.
    expect(await control.evaluate(() => window.liveChat.setActionKey('wheelKey', 'Ctrl+Shift+F9'))).toEqual({ ok: true, took: null });
    expect(await control.evaluate(() => window.liveChat.setActionKey('skipMineKey', 'Ctrl+Shift+F9'))).toEqual({ ok: true, took: 'Ouvrir la roue' });
    await control.getByTestId('wheel-key').filter({ hasText: 'Aucune' }).waitFor();
    await control.evaluate(() => window.liveChat.setActionKey('wheelKey', 'Ctrl+Shift+F8'));
    await control.evaluate(() => window.liveChat.setActionKey('skipMineKey', 'Ctrl+Shift+F11'));

    await control.getByRole('button', { name: 'Remplir la roue ›' }).click();
    await control.getByTestId('wheel-place-0').click();
    await control.getByLabel('Chercher pour cette place').fill('Mon raccourci');
    await control.getByTestId('wheel-choice').filter({ hasText: 'Mon raccourci' }).click();
    await control.getByTestId('wheel-place-0').filter({ hasText: 'Mon raccourci' }).waitFor();
    await picture(control, 'settings-shortcuts.png');

    // The preview shows it, and nothing leaves.
    await control.getByRole('button', { name: 'Aperçu', exact: true }).click();
    await stage.getByTestId('wheel').waitFor();
    await picture(stage, 'wheel.png');
    await stage.getByTestId('wheel-slot-0').click();
    await stage.getByTestId('wheel').waitFor({ state: 'detached' });
    expect(await guest.stage.getByTestId('stage').getAttribute('data-state')).toBe('idle');

    // The real one sends what is aimed at, and clicks stop being caught afterwards.
    pressKeys('^+{F8}');
    await stage.getByTestId('wheel').waitFor();
    await stage.getByTestId('wheel-slot-0').click();
    await overlayState(guest, 'playing', 15_000);
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Par la touche' }).waitFor();
    await host.control.evaluate(() => window.liveChat.getState().then(({ queue }) => queue.current && window.liveChat.skipMedia(queue.current.id)));
    await overlayState(guest, 'idle', 10_000);

    // Left alone it goes away, and remembers the last one.
    pressKeys('^+{F8}');
    await stage.getByTestId('wheel-center').filter({ hasText: 'Mon raccourci' }).waitFor();
    await stage.getByTestId('wheel').waitFor({ state: 'detached', timeout: 8_000 });

    // Trying a key says what it does, and sends nothing.
    await control.getByRole('button', { name: 'Tester une touche' }).click();
    await control.evaluate(() => window.liveChat.setActionKey('skipKey', 'Ctrl+Shift+F7'));
    pressKeys('^+{F8}');
    await control.getByTestId('key-test').filter({ hasText: 'Ouvrir la roue' }).waitFor();
    expect(await stage.getByTestId('wheel').count()).toBe(0);
    await control.getByRole('button', { name: 'Arrêter le test' }).click();

    await control.getByRole('button', { name: 'Tout remettre par défaut' }).click();
    await control.getByRole('button', { name: 'Vraiment ?' }).click();
    await expect.poll(() => control.getByTestId('wheel-key').textContent()).toBe('Ctrl+Shift+Espace');
    await control.getByTestId('wheel-place-0').filter({ hasText: 'Mon raccourci' }).waitFor();
  });

  it('shows who is banned for spamming, to everyone', async () => {
    const state = await host.control.evaluate(() => window.liveChat.getState());
    const until = Date.now() + 12 * 60_000;
    const banned = {
      ...state,
      party: { ...state.party!, members: state.party!.members.map((member) => ({ ...member, bannedUntil: until })) },
    };
    await host.app.evaluate(({ BrowserWindow }, shown) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('state:changed', shown);
    }, banned);
    await host.control.getByTestId('own-ban').filter({ hasText: '12 min' }).waitFor();
    await openTab(host, 'Party');
    await host.control.getByTestId('member-banned').first().waitFor();
    await picture(host.control, 'member-banned.png');
    await openTab(host, 'LiveChat');
    await host.control.getByLabel('Texte à afficher').fill('Non');
    expect(await sendButton(host).isDisabled()).toBe(true);
    await host.control.getByLabel('Texte à afficher').fill('');

    await host.app.evaluate(({ BrowserWindow }, shown) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('state:changed', shown);
    }, state);
    await host.control.getByTestId('own-ban').waitFor({ state: 'detached' });
  });

  it('prepares a LiveChat from what is pasted, from any tab', async () => {
    const logo = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png');
    const copyFiles = (...paths: string[]) => {
      spawnSync('powershell', ['-NoProfile', '-Command', `Set-Clipboard -Path ${paths.map((path) => `'${path}'`).join(',')}`]);
    };
    const sound = join(sandbox, 'colle.wav');
    writeFileSync(sound, silentWav(2_000));
    const other = join(sandbox, 'autre.png');
    copyFileSync(logo, other);

    const server = createServer((request, response) => {
      if (request.url === '/image.png') {
        response.writeHead(200, { 'content-type': 'image/png' });
        response.end(readFileSync(logo));
      } else {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<p>Pas un média</p>');
      }
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const { port } = server.address() as AddressInfo;

    try {
      // A picture, from another tab.
      await openTab(host, 'Party');
      spawnSync('powershell', ['-NoProfile', '-STA', '-Command', `Add-Type -AssemblyName System.Windows.Forms, System.Drawing; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile('${logo}'))`]);
      await pasteIn(host);
      await host.control.getByRole('tab', { name: 'LiveChat', selected: true }).waitFor();
      await host.control.getByTestId('draft-name').first().waitFor();
      await emptyDraft(host);

      // Files copied in the Explorer: a picture and a sound make one LiveChat.
      copyFiles(logo, sound);
      await pasteIn(host);
      await host.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
      await host.control.getByTestId('draft-name').filter({ hasText: 'colle.wav' }).waitFor();
      await picture(host.control, 'paste-files.png');
      await emptyDraft(host);

      // Two pictures don't fit, and it says so.
      copyFiles(logo, other);
      await pasteIn(host);
      await host.control.getByTestId('incoming-note').filter({ hasText: 'mode Avancé' }).waitFor();
      expect(await host.control.getByTestId('draft-name').count()).toBe(0);

      // A link to a picture, then a link to something else.
      await host.app.evaluate(({ clipboard }, url) => clipboard.writeText(url), `http://127.0.0.1:${port}/image.png`);
      await pasteIn(host);
      await host.control.getByTestId('draft-name').filter({ hasText: 'image.png' }).waitFor();
      await emptyDraft(host);

      await host.app.evaluate(({ clipboard }, url) => clipboard.writeText(url), `http://127.0.0.1:${port}/page`);
      await pasteIn(host);
      await host.control.getByTestId('incoming-note').filter({ hasText: 'pas une image' }).waitFor();
      expect(await host.control.getByTestId('draft-name').count()).toBe(0);

      // Instagram and X start nothing without a click, and it says so.
      await host.app.evaluate(({ clipboard }) => clipboard.writeText('https://www.instagram.com/reel/C2oGqkXNmLf/'));
      await pasteIn(host);
      await host.control.getByTestId('incoming-note').filter({ hasText: 'Instagram' }).waitFor();

      // Words simply become the text.
      await host.app.evaluate(({ clipboard }) => clipboard.writeText('Collé ici'));
      await pasteIn(host);
      await expect.poll(() => host.control.getByLabel(/Texte à afficher/).inputValue()).toBe('Collé ici');
      await emptyDraft(host);
    } finally {
      server.close();
    }
  });

  // The real YouTube: what matters is that its own player agrees to play here.
  it('plays a YouTube link on both PCs from its own player, only the chosen passage', async () => {
    await host.app.evaluate(({ clipboard }) => clipboard.writeText('https://youtu.be/jNQXAC9IVRw?t=2'));
    await pasteIn(host);
    await host.control.getByTestId('draft-name').filter({ hasText: 'zoo' }).waitFor({ timeout: 20_000 });
    await host.control.getByTestId('link-frame').waitFor();
    await host.control.getByTestId('clip-start').filter({ hasText: '0:02,0' }).waitFor({ timeout: 30_000 });
    await setRange(host, /^Fin$/, 9_000);
    await host.control.getByTestId('clip-end').filter({ hasText: '0:09,0' }).waitFor();
    await setRange(host, /^Volume$/, 50);
    expect(await host.control.getByRole('button', { name: 'Sauvegarder dans la bibliothèque' }).count()).toBe(0);
    await picture(host.control, 'link-youtube.png');
    await sendButton(host).click();

    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('link-frame').waitFor({ state: 'attached' });
    await guest.stage.locator('[data-on-screen="true"]').waitFor({ state: 'attached' });
    const position = async (member: Member) =>
      member.app.evaluate(async ({ BrowserWindow }) => {
        const stage = BrowserWindow.getAllWindows().find((window) => window.getTitle().includes('Scène'))!;
        for (const frame of stage.webContents.mainFrame.framesInSubtree) {
          if (!frame.url.startsWith('https://www.youtube.com/')) continue;
          return frame.executeJavaScript('(() => { const v = document.querySelector("video"); return v ? { paused: v.paused, time: v.currentTime } : null; })()') as Promise<{ paused: boolean; time: number } | null>;
        }
        return null;
      });
    await expect.poll(() => position(guest).then((seen) => seen?.paused === false && seen.time > 2.3), { timeout: 15_000 }).toBe(true);
    const seen = (await position(guest))!;
    expect(seen.time).toBeGreaterThan(2);
    expect(seen.time).toBeLessThan(9.5);
    await picture(guest.stage, 'link-youtube-overlay.png');
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
  });

  it('places a YouTube link like a picture in the advanced mode, with a text around it', async () => {
    await host.app.evaluate(({ clipboard }) => clipboard.writeText('https://youtu.be/jNQXAC9IVRw'));
    await pasteIn(host);
    await host.control.getByTestId('draft-name').filter({ hasText: 'zoo' }).waitFor({ timeout: 20_000 });
    await host.control.getByRole('button', { name: 'Avancé', exact: true }).click();
    await host.control.getByTestId('scene-link').filter({ hasText: 'YouTube' }).waitFor();
    await host.control.getByTestId('link-compact').waitFor();
    await host.control.getByTestId('clip-start').waitFor({ timeout: 30_000 });
    await setRange(host, /^Fin$/, 4_000);
    await host.control.getByTestId('clip-end').filter({ hasText: '0:04,0' }).waitFor();
    await host.control.getByTestId('scene-layer').first().click();
    await host.control.getByTestId('layer-panel').filter({ hasText: 'zoo' }).waitFor();
    await host.control.getByRole('button', { name: 'Terminé' }).click();
    await host.control.getByLabel('Texte à afficher (facultatif)').fill('Regarde ça');
    await picture(host.control, 'link-advanced.png');
    await sendButton(host).click();

    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-link-layer').getByTestId('link-frame').waitFor({ state: 'attached' });
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Regarde ça' }).waitFor();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
    await host.control.getByRole('button', { name: 'Simple', exact: true }).click();
  });

  it('prepares TikTok and SoundCloud links, and takes a sound picked in the SoundCloud search', async () => {
    await host.app.evaluate(({ clipboard }) => clipboard.writeText('https://www.tiktok.com/@scout2015/video/6718335390845095173'));
    await pasteIn(host);
    await host.control.getByText('TikTok', { exact: true }).waitFor({ timeout: 20_000 });
    await host.control.getByTestId('clip-end').waitFor({ timeout: 30_000 });
    await host.control.getByRole('switch', { name: 'Son de la vidéo' }).or(host.control.getByLabel('Son de la vidéo')).first().waitFor();
    await picture(host.control, 'link-tiktok.png');

    await host.app.evaluate(({ clipboard }) => clipboard.writeText('https://soundcloud.com/forss/flickermood'));
    await pasteIn(host);
    await host.control.getByTestId('draft-name').filter({ hasText: 'Flickermood' }).waitFor({ timeout: 20_000 });
    await host.control.getByTestId('clip-end').waitFor({ timeout: 30_000 });
    await host.control.locator('.draft-head').getByRole('button', { name: 'Retirer' }).click();

    // The search opens the site itself; choosing a sound there brings it back here.
    await host.control.getByLabel('Chercher sur SoundCloud').fill('flickermood');
    await host.control.getByRole('button', { name: 'Chercher', exact: true }).click();
    await expect
      .poll(() => host.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.getTitle().startsWith('SoundCloud'))))
      .toBe(true);
    await host.app.evaluate(({ BrowserWindow }) => {
      const search = BrowserWindow.getAllWindows().find((window) => window.getTitle().startsWith('SoundCloud'))!;
      void search.webContents.loadURL('https://soundcloud.com/forss/flickermood');
    });
    await host.control.getByTestId('draft-name').filter({ hasText: 'Flickermood' }).waitFor({ timeout: 30_000 });
    await expect
      .poll(() => host.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.getTitle().startsWith('SoundCloud'))))
      .toBe(false);
    await host.control.locator('.draft-head').getByRole('button', { name: 'Retirer' }).click();
  });

  it('takes files from the Windows right click, ready or sent straight away', async () => {
    const logo = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png');
    const sound = join(sandbox, 'clic.wav');
    writeFileSync(sound, silentWav(2_000));

    // Windows starts the app once per file.
    await openTab(host, 'Party');
    await host.app.evaluate(({ app }, files) => {
      for (const file of files) app.emit('second-instance', {}, ['LiveChatSBCB.exe', '--livechat-prepare', file], '');
    }, [logo, sound]);
    await host.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
    await host.control.getByTestId('draft-name').filter({ hasText: 'clic.wav' }).waitFor();
    await emptyDraft(host);

    await host.app.evaluate(({ app }, file) => {
      app.emit('second-instance', {}, ['LiveChatSBCB.exe', '--livechat-send', file], '');
    }, logo);
    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-image').waitFor();
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
  });

  it('puts emojis in the text, drawn the same on the overlay', async () => {
    await openTab(host, 'LiveChat');
    await host.control.getByRole('button', { name: 'Emoji', exact: false }).click();
    await host.control.getByLabel('Chercher un emoji').waitFor();
    await picture(host.control, 'emoji-picker.png');
    await host.control.getByLabel('Chercher un emoji').fill('chat qui');
    await host.control.getByRole('button', { name: 'chat qui sourit', exact: true }).click();
    await host.control.keyboard.press('Escape');
    expect(await host.control.getByLabel(/Texte à afficher/).inputValue()).toBe('😺');

    await host.control.getByLabel(/Texte à afficher/).fill('Quel beau chat 😺');
    await sendButton(host).click();
    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-text').filter({ hasText: '😺' }).waitFor();
    await picture(guest.stage, 'overlay-emoji.png');
    await expect.poll(() => guest.stage.evaluate(async () => (await document.fonts.load('40px Twemoji', '😺')).length)).toBeGreaterThan(0);
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
  });

  it('reads a text aloud only once it was confirmed, and not for whoever turned it off', async () => {
    const speaking = (member: Member) => member.stage.evaluate(() => speechSynthesis.speaking);
    // The voice of Windows only speaks out loud: for this one test, quietly.
    const hearStage = (member: Member, heard: boolean) =>
      member.app.evaluate(({ BrowserWindow }, on) => {
        for (const window of BrowserWindow.getAllWindows()) if (window.getTitle().includes('Scène')) window.webContents.setAudioMuted(!on);
      }, heard);
    await hearStage(guest, true);
    await hearStage(host, true);
    const voiceBox = host.control.locator('label.switch', { hasText: 'Lire à voix haute' });
    const voiceOn = () => voiceBox.locator('input').isChecked();

    await openTab(host, 'LiveChat');
    const caption = host.control.getByLabel(/Texte à afficher/);
    await caption.fill('Ceci est un texte assez long pour que la lecture dure plus longtemps que le temps normal.');
    expect(await voiceOn()).toBe(false);

    await voiceBox.click();
    const confirm = host.control.getByRole('alertdialog', { name: 'Confirmer la voix robot' });
    await confirm.waitFor();
    await picture(host.control, 'speech-confirm.png');
    await confirm.getByRole('button', { name: 'Annuler' }).click();
    expect(await voiceOn()).toBe(false);

    await voiceBox.click();
    await confirm.getByRole('button', { name: 'Oui, lire' }).click();
    expect(await voiceOn()).toBe(true);
    await host.control.getByTestId('speech-duration').waitFor();

    await sendButton(host).click();
    await overlayState(guest, 'playing');
    await expect.poll(() => speaking(guest), { timeout: 5_000 }).toBe(true);
    await expect.poll(() => speaking(host), { timeout: 5_000 }).toBe(true);
    expect(await voiceBox.count()).toBe(0);
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');
    await expect.poll(() => speaking(guest)).toBe(false);
    await overlayState(host, 'idle');

    await guest.control.evaluate(() => window.liveChat.setSettings({ speechEnabled: false }));
    await caption.fill('Toi tu ne m’entends plus.');
    await voiceBox.click();
    await confirm.getByRole('button', { name: 'Oui, lire' }).click();
    await sendButton(host).click();
    await overlayState(guest, 'playing');
    await expect.poll(() => speaking(host), { timeout: 5_000 }).toBe(true);
    expect(await speaking(guest)).toBe(false);
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
    await guest.control.evaluate(() => window.liveChat.setSettings({ speechEnabled: true }));

    await openSettings(host, 'Son');
    await host.control.getByRole('heading', { name: 'Voix robot' }).waitFor();
    await picture(host.control, 'settings-speech.png');
    await openTab(host, 'LiveChat');
    await hearStage(guest, false);
    await hearStage(host, false);
  });

  it('moves the window around, and calms down for whoever asks', async () => {
    // Stops everything where it would be at that moment, to see it.
    const frame = async (member: Member, atMs: number, name: string) => {
      await member.control.evaluate((at) => {
        for (const animation of document.getAnimations()) {
          animation.pause();
          animation.currentTime = at;
        }
      }, atMs);
      await picture(member.control, name);
      await member.control.evaluate(() => {
        for (const animation of document.getAnimations()) animation.play();
      });
    };
    const markerSitsOn = (member: Member, name: string) =>
      member.control.evaluate((tabName) => {
        const marker = document.querySelector<HTMLElement>('.tabs > .tab-marker')!;
        const tab = [...document.querySelectorAll<HTMLElement>('.tabs > .tab')].find((one) => one.textContent === tabName)!;
        const box = marker.getBoundingClientRect();
        const target = tab.getBoundingClientRect();
        return Math.abs(box.left - target.left) < 1 && Math.abs(box.width - target.width) < 1 && marker.style.opacity === '1';
      }, name);

    // The logo has been and gone, and the marker follows the tabs.
    expect(await host.control.locator('.launch').count()).toBe(0);
    await openTab(host, 'LiveChat');
    await expect.poll(() => markerSitsOn(host, 'LiveChat')).toBe(true);
    await openTab(host, 'Historique');
    await frame(host, 120, 'motion-tab.png');
    await expect.poll(() => markerSitsOn(host, 'Historique')).toBe(true);
    await openTab(host, 'LiveChat');

    // Sending says it worked, and the button stays the same button for whoever uses it next.
    await host.control.getByLabel(/Texte à afficher/).fill('Ça part');
    await sendButton(host).click();
    await host.control.getByTestId('sent-check').waitFor();
    await frame(host, 90, 'motion-sent.png');
    await expect(sendButton(host).count()).resolves.toBe(1);
    await host.control.getByTestId('sent-check').waitFor({ state: 'detached' });

    // A row that leaves the queue is drawn a moment longer, and then nothing is left of it.
    await overlayState(guest, 'playing');
    await host.control.getByLabel(/Texte à afficher/).fill('En attente');
    await sendButton(host).click();
    await host.control.getByLabel(/Texte à afficher/).fill('Encore en attente');
    await sendButton(host).click();
    await openTab(host, 'Party');
    await expect.poll(() => host.control.locator('.party-side .rows').first().locator('li').count()).toBe(2);
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await expect.poll(() => host.control.locator('li:not(.is-leaving)', { hasText: 'Encore en attente' }).count(), { timeout: 15_000 }).toBeLessThanOrEqual(1);
    await expect.poll(() => host.control.locator('.is-leaving').count(), { timeout: 15_000 }).toBe(0);
    await overlayState(guest, 'playing');
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'playing');
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');
    await expect.poll(() => host.control.locator('.is-leaving').count()).toBe(0);

    // The bars: a sheen while it goes, none while it waits.
    const barMoves = async (paused: boolean) => {
      await host.control.evaluate((isPaused) => {
        const box = document.createElement('div');
        box.id = 'bar-check';
        box.className = 'upload';
        box.style.cssText = 'position:fixed;left:20px;right:20px;top:20px;z-index:99;background:#000';
        box.innerHTML = `<progress max="100" value="60" class="${isPaused ? 'is-paused' : ''}"></progress>`;
        document.body.append(box);
      }, paused);
      const bar = host.control.locator('#bar-check');
      await host.control.waitForTimeout(500);
      const first = await bar.screenshot();
      await host.control.waitForTimeout(300);
      const second = await bar.screenshot();
      await picture(host.control, paused ? 'motion-bar-paused.png' : 'motion-bar.png');
      await bar.evaluate((box) => box.remove());
      return !first.equals(second);
    };
    expect(await barMoves(false)).toBe(true);
    expect(await barMoves(true)).toBe(false);

    // The setting reaches this window, not the overlay.
    await openSettings(host, 'Général');
    await host.control.locator('label.switch', { hasText: 'Réduire les animations' }).click();
    await expect.poll(() => host.control.evaluate(() => document.documentElement.classList.contains('calm'))).toBe(true);
    await picture(host.control, 'settings-motion.png');
    expect(await host.stage.evaluate(() => document.documentElement.classList.contains('calm'))).toBe(false);
    await openTab(host, 'Historique');
    expect(await host.control.evaluate(() => getComputedStyle(document.querySelector('.view:not([hidden])')!).animationDuration)).toBe('0.001s');
    await host.control.evaluate(() => window.liveChat.setSettings({ reduceMotion: false }));
    await expect.poll(() => host.control.evaluate(() => document.documentElement.classList.contains('calm'))).toBe(false);
    await openTab(host, 'LiveChat');
  });

  it('sends from LiveChat and shows it in the party, which only says who is there', async () => {
    await openTab(guest, 'Party');
    await sendText(host, 'Vite fait');
    await openTab(host, 'Party');
    expect(await host.control.getByLabel('Un texte').count()).toBe(0);

    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Vite fait' }).waitFor();
    await host.control.getByTestId('now-playing').filter({ hasText: 'Vite fait' }).waitFor();
    await picture(host.control, '3-party-playing.png');
    await guest.control.getByRole('button', { name: 'Passer pour tous' }).click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'idle');

    await pickFile(host, join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'));
    await host.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).click();
    await host.control.getByTestId('draft-name').waitFor({ state: 'detached' });
    await openTab(guest, 'LiveChat');
  });

  it('applies the local volume, plays sounds, and keeps settings after a restart', async () => {
    await openSettings(guest, 'Son');
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

    await host.control.getByRole('button', { name: 'Passer pour tous' }).click();
    await overlayState(guest, 'idle');

    await guest.app.close();
    await onlineCount(host, 1);
    guest = await launch('guest');
    await connected(guest);
    await openSettings(guest, 'Son');
    await guest.control.getByTestId('volume-value').filter({ hasText: '30 %' }).waitFor();
  });

  it('sends a picture and a sound together, with a text on several lines', async () => {
    await openTab(host, 'LiveChat');
    await pickFile(host, join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'));
    const sound = join(sandbox, 'son-meme.wav');
    writeFileSync(sound, silentWav(3));
    await answerDialogWith(host, sound);
    await host.control.getByRole('group', { name: 'Ajouter une musique' }).getByRole('button', { name: 'Depuis mon PC' }).click();
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

    await host.control.getByRole('button', { name: 'Passer pour tous' }).click();
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
    await host.control.getByRole('group', { name: 'Ajouter une musique' }).getByRole('button', { name: 'Depuis mon PC' }).click();
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

    await host.control.getByRole('button', { name: 'Passer pour tous' }).click();
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

    // Tags: typed under the media, found by the search, and a click shows only those that have it.
    const cowboy = cards.filter({ hasText: 'cowboy.png' });
    await cowboy.getByRole('button', { name: '+ tag' }).click();
    await cowboy.getByLabel('Nouveau tag').fill('Western');
    await cowboy.getByLabel('Nouveau tag').press('Enter');
    await cowboy.getByRole('button', { name: '#western' }).waitFor();
    await host.control.getByLabel('Rechercher par nom').fill('#west');
    await cowboy.waitFor();
    await host.control.getByLabel('Rechercher par nom').fill('');
    await cowboy.getByRole('button', { name: '#western' }).click();
    await host.control.locator('.tag-filter').filter({ hasText: 'Seulement' }).waitFor();
    await picture(host.control, 'library-tags.png');
    await host.control.getByRole('button', { name: 'Tout voir' }).click();
    await host.control.getByLabel('Trier').selectOption('sent');
    await host.control.getByLabel('Rechercher par nom').fill('COWBOY');


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
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    // Counted for the « Plus envoyés » order: the saved LiveChat, and its file.
    const counted = await host.control.evaluate(() => window.liveChat.scanLibrary());
    expect(counted.saved.find(({ name }) => name === 'Mon cowboy')!.sentCount).toBe(1);
    expect(counted.files.find(({ name }) => name === 'cowboy.png')!.sentCount).toBe(1);
    expect(counted.files.find(({ name }) => name === 'cowboy.png')!.tags).toEqual(['western']);

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
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');
    await host.control.getByRole('button', { name: /^Images/ }).click();
    await openMenu(card('menu-image.png'));
    await press('Envoyer tout de suite');
    await overlayState(guest, 'playing');
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    // The LiveChat tab opens a small window on the right shelf, and stays where it is.
    await openTab(host, 'LiveChat');
    await picture(host.control, '17-livechat-choice.png');
    await host.control.getByRole('button', { name: 'Depuis ma bibliothèque' }).first().click();
    await host.control.getByRole('group', { name: 'Quoi de ta bibliothèque' }).getByRole('button', { name: 'Image' }).click();
    const picker = host.control.getByTestId('library-picker');
    await picker.getByLabel('Chercher dans ma bibliothèque').fill('menu-image');
    await picture(host.control, 'library-picker.png');
    await picker.getByTestId('picker-file').filter({ hasText: 'menu-image.png' }).click();
    await picker.waitFor({ state: 'detached' });
    await host.control.getByTestId('draft-name').filter({ hasText: 'menu-image.png' }).waitFor();
    await picture(host.control, '16-livechat-add-sound.png');
    await host.control.getByRole('group', { name: 'Ajouter une musique' }).getByRole('button', { name: 'Depuis ma bibliothèque' }).click();
    await expect(picker.getByRole('button', { name: 'Sons' }).getAttribute('aria-pressed')).resolves.toBe('true');
    await picker.getByTestId('picker-file').filter({ hasText: 'menu-son.wav' }).click();
    await expect.poll(() => host.control.getByTestId('draft-name').count()).toBe(2);
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).first().click();
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).first().click();
    await host.control.getByRole('button', { name: 'Depuis mon PC' }).first().waitFor();
  });

  it('takes a music the same way as a picture, even with nothing else chosen', async () => {
    const music = join(sandbox, 'ma-musique.wav');
    writeFileSync(music, silentWav(3));

    await openTab(host, 'LiveChat');
    await picture(host.control, 'music-choice.png');
    await host.control.getByRole('button', { name: 'Depuis ma bibliothèque' }).first().click();
    await picture(host.control, 'shelf-choice.png');
    await host.control.getByRole('group', { name: 'Quoi de ta bibliothèque' }).getByRole('button', { name: 'Son' }).click();
    await expect(host.control.getByTestId('library-picker').getByRole('button', { name: 'Sons' }).getAttribute('aria-pressed')).resolves.toBe('true');
    await host.control.keyboard.press('Escape');
    await host.control.getByTestId('library-picker').waitFor({ state: 'detached' });

    await answerDialogWith(host, music);
    await host.control.getByTestId('draft-drop').getByRole('button', { name: 'Depuis mon PC' }).click();
    await host.control.getByTestId('draft-name').filter({ hasText: 'ma-musique.wav' }).waitFor();
    await host.control.getByRole('group', { name: 'Ajouter une image ou une vidéo' }).waitFor();
    await picture(host.control, 'music-only.png');
    await host.control.getByRole('button', { name: 'Retirer', exact: true }).first().click();
    await host.control.getByTestId('draft-drop').waitFor();
  });

  it('skips for me or for everybody, and says who did', async () => {
    await openTab(host, 'LiveChat');
    await host.control.getByLabel('Texte à afficher').fill('Passe-moi');
    await setRange(host, /Durée d’affichage/, 20_000);
    await expect(host.control.getByTestId('send-summary').textContent()).resolves.toBe('20 s, sans son');
    await host.control.getByRole('button', { name: 'Envoyer à tout le monde' }).click();
    await overlayState(host, 'playing');
    await overlayState(guest, 'playing');

    await openTab(guest, 'LiveChat');
    await guest.control.getByRole('button', { name: 'Passer pour moi' }).first().click();
    await overlayState(guest, 'idle');
    await overlayState(host, 'playing');

    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(host, 'idle');
    await guest.control.getByTestId('skipped-by').filter({ hasText: 'Passé par Nono' }).waitFor();
    await expect(host.control.getByTestId('skipped-by').count()).resolves.toBe(0);
    await setRange(host, /Durée d’affichage/, 5_000);
  });

  it('whispers to one friend, rings around the sender, and shows what each one is up to', async () => {
    await openTab(guest, 'Party');
    await guest.control.getByTestId('note-field').fill('en ranked');
    await guest.control.getByTestId('note-field').press('Enter');
    await openTab(host, 'Party');
    await host.control.getByTestId('member-status').filter({ hasText: 'en ranked' }).waitFor();

    await openTab(host, 'LiveChat');
    await host.control.getByLabel('Texte à afficher').fill('Rien que pour toi');
    await host.control.getByTestId('whisper-open').click();
    await host.control.getByTestId('whisper-member').filter({ hasText: 'Pote' }).click();
    await host.control.getByRole('button', { name: 'Chuchoter à Pote' }).click();
    await overlayState(guest, 'playing');
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Rien que pour toi' }).waitFor();
    // A text has no sound: the ring is there, and doesn't move.
    await guest.stage.locator('.profile-avatar.has-ring.is-still').waitFor();
    await overlayState(host, 'playing');
    await overlayState(guest, 'idle');

    await openTab(guest, 'Historique');
    await guest.control.getByTestId('history-item').filter({ hasText: 'chuchoté' }).first().waitFor();
    await expect(guest.control.getByTestId('history-item').filter({ hasText: 'Rien que pour toi' }).getByRole('button', { name: 'Rejouer en chuchotant' }).count()).resolves.toBe(1);

    await openTab(host, 'Party');
    await host.control.getByTestId('member').filter({ hasText: 'Nono' }).getByTestId('member-today').waitFor();
    await host.control.getByTestId('member').filter({ hasText: 'Pote' }).getByTestId('member-history').click();
    await host.control.getByTestId('history-from').waitFor();
    await expect(host.control.getByTestId('history-from').locator('option:checked').textContent()).resolves.toBe('Pote');
    await expect(host.control.getByTestId('history-item').filter({ hasText: 'Rien que pour toi' }).count()).resolves.toBe(0);
    await host.control.getByTestId('history-from').selectOption({ label: 'Tout le monde' });
    await host.control.getByTestId('history-item').filter({ hasText: 'Rien que pour toi' }).first().waitFor();
  });

  it('whispers from the party in one click, and stops everything from its big button', async () => {
    await openTab(host, 'Party');
    await host.control.getByTestId('member').filter({ hasText: 'Pote' }).getByTestId('member-whisper').click();
    await host.control.getByRole('button', { name: 'Chuchoter à Pote' }).waitFor();
    await host.control.getByLabel('Texte à afficher').fill('Juste toi');
    await host.control.getByRole('button', { name: 'Chuchoter à Pote' }).click();
    await overlayState(guest, 'playing');
    await overlayState(guest, 'idle');

    await openTab(host, 'Party');
    await host.control.getByTestId('stop-button').filter({ hasText: 'Arrêter' }).click();
    await host.control.getByTestId('stop-button').filter({ hasText: 'Reprendre' }).waitFor();
    await host.control.getByTestId('stop-button').click();
    await host.control.getByTestId('stop-button').filter({ hasText: 'Arrêter' }).waitFor();
  });

  it('shows the bubbles of the first launch again from the settings, one after the other', async () => {
    await host.control.getByRole('button', { name: 'Réglages', exact: true }).click();
    await host.control.getByRole('button', { name: 'Revoir la découverte' }).click();
    const tour = host.control.getByTestId('tour');
    await tour.filter({ hasText: 'Prépare un LiveChat' }).waitFor();
    await picture(host.control, 'tour.png');
    for (const title of ['Envoie', 'Ta party', 'Panique', 'Raccourcis']) {
      await tour.getByRole('button', { name: 'Suivant' }).click();
      await tour.filter({ hasText: title }).waitFor();
    }
    await picture(host.control, 'tour-last.png');
    await tour.getByRole('button', { name: 'C’est parti' }).click();
    await tour.waitFor({ state: 'detached' });
    expect((await host.control.evaluate(() => window.liveChat.getState())).settings.tutorialDone).toBe(true);
    await openTab(host, 'LiveChat');
  });

  it('changes tab in one movement: the big frame changes shape, the side ones go by their side', async () => {
    await openTab(host, 'LiveChat');
    await host.control.waitForTimeout(600);
    await host.control.getByRole('tab', { name: 'Bibliothèque' }).click();
    await host.control.waitForTimeout(140);
    await picture(host.control, 'tab-move.png');
    await host.control.waitForTimeout(600);
    await expect.poll(() => host.control.evaluate(() => document.getAnimations().filter((animation) => String((animation.effect as KeyframeEffect | null)?.pseudoElement ?? '').startsWith('::view-transition')).length)).toBe(0);
    await openTab(host, 'LiveChat');
  });

  it('runs a quick poll in the app, with anonymous votes', async () => {
    await openTab(host, 'Party');
    await host.control.getByTestId('poll-new').click();
    await host.control.getByTestId('poll-question').fill('On lance quoi ?');
    await host.control.getByTestId('poll-option').nth(0).fill('Valo');
    await host.control.getByTestId('poll-option').nth(1).fill('Rocket');
    await host.control.getByTestId('poll-start').click();

    await openTab(guest, 'Party');
    await guest.control.getByTestId('poll').filter({ hasText: 'On lance quoi ?' }).waitFor();
    await guest.control.getByTestId('poll-choice').filter({ hasText: 'Rocket' }).click();
    await host.control.getByTestId('poll-choice').filter({ hasText: 'Rocket' }).getByTestId('poll-count').filter({ hasText: '1' }).waitFor();
    await expect(host.control.getByTestId('poll').textContent()).resolves.not.toContain('Pote');
    await picture(host.control, '7-poll.png');

    // Everyone sees it at the top of the screen, then the winner, with a party.
    await guest.stage.getByTestId('poll-banner').filter({ hasText: 'On lance quoi ?' }).waitFor();
    await picture(guest.stage, 'poll-banner.png');
    await guest.stage.getByTestId('poll-result').filter({ hasText: 'Rocket' }).waitFor({ timeout: 45_000 });
    await picture(guest.stage, 'poll-result.png');
    await guest.stage.getByTestId('poll-result').waitFor({ state: 'detached', timeout: 15_000 });
  }, 120_000);

  it('plays the best joke with a bot: pictures from the PC, two jokes per picture, a duel, then the ranking', async () => {
    const logo = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png');
    const pictures = [1, 2].map((index) => {
      const path = join(sandbox, `blague-${index}.png`);
      copyFileSync(logo, path);
      return path;
    });
    for (const member of [host, guest]) await openTab(member, 'Jeux');
    await picture(host.control, 'games.png');
    await host.control.getByTestId('game-card-joke').getByRole('button', { name: 'Ouvrir' }).click();
    // A lobby: the others see it on screen and click to join, the opener launches.
    await guest.stage.getByTestId('game-invite').filter({ hasText: 'Meilleure blague' }).waitFor();
    await picture(guest.stage, 'game-invite.png');
    await guest.control.getByTestId('game-lobby').getByRole('button', { name: 'Rejoindre' }).click();
    await host.control.getByTestId('game-lobby').getByText('Toi').waitFor();
    await host.control.locator('.lobby-faces .toy-face:not(.is-empty)').nth(1).waitFor();
    // Mascot of the lobby: drawn, and it reacts when the guest joined.
    const lobbyMascot = host.control.locator('[data-testid="game-lobby"] [data-testid="mascot"][data-persona="micro"]');
    await lobbyMascot.waitFor();
    expect(await lobbyMascot.locator('svg').evaluate((svg) => svg.querySelectorAll('path, circle, rect, ellipse, polygon').length)).toBeGreaterThan(5);
    expect(await lobbyMascot.locator('svg').evaluate((svg) => { const b = (svg as SVGSVGElement).getBBox(); return b.width * b.height; })).toBeGreaterThan(0);
    await expect.poll(() => lobbyMascot.getAttribute('data-mood'), { timeout: 2_000 }).not.toBe('repos');
    // "Effets dans les jeux": on, the mascot has its effects canvas; off, none; back on, it returns.
    // (The e2e app is not in reduced motion, so the canvas does show when on.)
    await expect.poll(() => lobbyMascot.locator('canvas').count()).toBe(1);
    await openSettings(host, 'Général');
    const effectsSwitch = host.control.getByRole('switch', { name: 'Effets dans les jeux' });
    // The switch follows the saved setting a moment later: click, then wait for it to turn.
    if ((await effectsSwitch.isChecked()) !== false) await effectsSwitch.click({ force: true });
    await expect.poll(() => effectsSwitch.isChecked()).toBe(false);
    await openTab(host, 'Jeux');
    await expect.poll(() => lobbyMascot.locator('canvas').count()).toBe(0);
    await openSettings(host, 'Général');
    // The switch follows the saved setting a moment later: click, then wait for it to turn.
    if ((await effectsSwitch.isChecked()) !== true) await effectsSwitch.click({ force: true });
    await expect.poll(() => effectsSwitch.isChecked()).toBe(true);
    await openTab(host, 'Jeux');
    await expect.poll(() => lobbyMascot.locator('canvas').count()).toBe(1);
    // Two people and a bot make three.
    await host.control.getByTestId('game-add-bot').click();
    await guest.control.getByTestId('game-lobby').getByText('Bot Gaston').waitFor();
    await picture(host.control, 'game-lobby.png');
    await host.control.getByTestId('game-lobby').getByRole('button', { name: 'Lancer' }).click();

    for (const member of [host, guest]) {
      await member.control.getByTestId('game').filter({ hasText: 'Envoie de 2 à 5 images' }).waitFor();
      await member.app.evaluate(({ dialog }, files) => {
        dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files })) as typeof dialog.showOpenDialog;
      }, pictures);
      await member.control.getByRole('button', { name: 'Choisir des images' }).click();
      await member.control.getByTestId('game-sent').filter({ hasText: '2 / 5' }).waitFor();
      await member.control.getByTestId('game-done').click();
    }

    // Each writes on two pictures someone else sent.
    for (const [index, member] of [host, guest].entries()) {
      await member.control.locator('[data-testid="game"][data-phase="write"]').waitFor();
      await expect.poll(() => member.control.getByTestId('game-task').count()).toBe(2);
      await member.control.locator('[data-testid="game"] .game-banner [data-testid="mascot"][data-persona="micro"]').waitFor();
      if (index === 0) await picture(member.control, 'game-write.png');
      for (const joke of [1, 2]) {
        const field = member.control.getByLabel('Ta blague').first();
        await field.fill(`Blague ${index}-${joke}`);
        await field.press('Enter');
        // The last joke written moves the game on at once.
        await member.control
          .getByText(`« Blague ${index}-${joke} » ✓`)
          .or(member.control.locator('[data-testid="game"][data-phase="vote"]'))
          .waitFor();
      }
    }

    // A duel: two jokes on the same picture. Its authors don't vote.
    await host.control.locator('[data-testid="game"][data-phase="vote"]').waitFor();
    for (const member of [host, guest]) {
      if (await member.control.getByText('Tu ne votes pas sur ton duel.').isVisible()) continue;
      await member.control.getByTestId('game-entry').first().click();
    }
    await host.control.locator('[data-testid="game"][data-phase="reveal"]').waitFor({ timeout: 40_000 });
    // Reactions float on everyone's game.
    await guest.control.getByRole('button', { name: '😂' }).click();
    await host.control.locator('.reaction-float').filter({ hasText: '😂' }).first().waitFor();
    await picture(host.control, 'game-reveal.png');
    await widePictures(host, 'game-reveal');
    // One by one, who wrote each joke.
    await expect.poll(() => host.control.locator('.game-entry-foot').count()).toBe(2);

    await host.control.getByRole('button', { name: 'Arrêter la partie' }).click();
    await host.control.getByRole('button', { name: 'Arrêter pour tous ?' }).click();
    await guest.control.getByTestId('game-ranking').waitFor();
    await expect.poll(() => guest.control.locator('[data-testid="mascot"][data-persona="micro"]').getAttribute('data-mood')).toMatch(/^(victoire|decu)$/);
    await picture(guest.control, 'game-ranking.png');
    // Revanche: the same lobby again.
    await guest.control.getByRole('button', { name: 'Revanche' }).click();
    await host.control.getByTestId('game-lobby').waitFor();
    await host.control.getByTestId('game-lobby').getByRole('button', { name: 'Quitter' }).click();
    await guest.control.getByTestId('game-lobby').getByRole('button', { name: 'Quitter' }).click();
    await guest.control.getByTestId('game-card-joke').waitFor();
    for (const member of [host, guest]) await openTab(member, 'LiveChat');
  });

  it('plays Devine Vite with a bot: three words each, whoever speaks sees the word and says who found it', async () => {
    for (const member of [host, guest]) await openTab(member, 'Jeux');
    await host.control.getByTestId('game-card-guess').getByRole('button', { name: 'Ouvrir' }).click();
    await guest.control.getByTestId('game-lobby').getByRole('button', { name: 'Rejoindre' }).click();
    await host.control.locator('.lobby-faces .toy-face:not(.is-empty)').nth(1).waitFor();
    // Mascot of the lobby: drawn, and it reacts when the guest joined.
    const lobbyMascot = host.control.locator('[data-testid="game-lobby"] [data-testid="mascot"][data-persona="chrono"]');
    await lobbyMascot.waitFor();
    expect(await lobbyMascot.locator('svg').evaluate((svg) => svg.querySelectorAll('path, circle, rect, ellipse, polygon').length)).toBeGreaterThan(5);
    expect(await lobbyMascot.locator('svg').evaluate((svg) => { const b = (svg as SVGSVGElement).getBBox(); return b.width * b.height; })).toBeGreaterThan(0);
    await expect.poll(() => lobbyMascot.getAttribute('data-mood'), { timeout: 2_000 }).not.toBe('repos');
    await host.control.getByTestId('game-add-bot').click();
    await guest.control.getByTestId('game-lobby').getByText('Bot Gaston').waitFor();
    await host.control.locator('[data-testid="game-lobby"].world-chrono').waitFor();
    await picture(host.control, 'world-chrono-lobby.png');
    await host.control.getByTestId('game-lobby').getByRole('button', { name: 'Lancer' }).click();

    for (const [index, member] of [host, guest].entries()) {
      const field = member.control.getByLabel('Un mot à faire deviner');
      for (const word of ['Raclette', 'Tour Eiffel', 'Mamie']) {
        await field.fill(`${word} ${index}`);
        await field.press('Enter');
        await member.control.locator('.game-words').getByText(`${word} ${index}`).or(member.control.locator('[data-testid="game"][data-phase="write"]')).waitFor();
      }
    }

    // Whoever speaks sees the word; the others only know who speaks.
    await host.control.locator('[data-testid="game"][data-phase="write"]').waitFor();
    await host.control.locator('[data-testid="game"] .game-banner [data-testid="mascot"][data-persona="chrono"]').waitFor();
    await expect.poll(async () => (await host.control.getByTestId('guess-secret').count()) + (await guest.control.getByTestId('guess-secret').count()), { timeout: 20_000 }).toBe(1);
    const talker = (await host.control.getByTestId('guess-secret').count()) === 1 ? host : guest;
    const listener = talker === host ? guest : host;
    await listener.control.getByTestId('game-turn').waitFor();
    await picture(talker.control, 'guess-turn.png');
    await widePictures(talker, 'guess-turn');
    const word = await talker.control.getByTestId('guess-secret').textContent();
    await talker.control.getByTestId('guess-found').click();
    await talker.control.getByTestId('guess-finder').first().click();
    await expect.poll(() => talker.control.getByTestId('guess-secret').textContent().catch(() => word)).not.toBe(word);
    await talker.control.locator('.game-faces .toy-face.is-me .toy-face-points').filter({ hasText: '1' }).waitFor();

    await host.control.getByRole('button', { name: 'Arrêter la partie' }).click();
    await host.control.getByRole('button', { name: 'Arrêter pour tous ?' }).click();
    await guest.control.getByTestId('game-ranking').waitFor();
    await expect.poll(() => guest.control.locator('[data-testid="mascot"][data-persona="chrono"]').getAttribute('data-mood')).toMatch(/^(victoire|decu)$/);
    for (const member of [host, guest]) {
      await member.control.getByRole('button', { name: 'Autre jeu' }).click();
      await openTab(member, 'LiveChat');
    }
  });

  // Each game in the world of its mascot: opened with two bots, its lobby and its game pictured.
  const openWorld = async (kind: string, persona: string, withGuest = false) => {
    await openTab(host, 'Jeux');
    await host.control.getByTestId(`game-card-${kind}`).getByRole('button', { name: 'Ouvrir' }).click();
    const lobby = host.control.locator(`[data-testid="game-lobby"].world-${persona}`);
    await lobby.waitFor();
    if (withGuest) {
      await openTab(guest, 'Jeux');
      await guest.control.getByTestId('game-lobby').getByRole('button', { name: 'Rejoindre' }).click();
      await host.control.locator('.lobby-faces .toy-face:not(.is-empty)').nth(1).waitFor();
    }
    for (const count of withGuest ? [2] : [1, 2]) {
      await host.control.getByTestId('game-add-bot').click();
      await host.control.locator('.lobby-faces .toy-face:not(.is-empty)').nth(count).waitFor();
    }
    await picture(host.control, `world-${persona}-lobby.png`);
    await lobby.getByRole('button', { name: 'Lancer' }).click();
    await host.control.locator(`[data-testid="game"].world-${persona}`).waitFor();
    await host.control.getByTestId('round-banner').waitFor({ state: 'detached' });
  };
  const phase = (name: string) => host.control.locator(`[data-testid="game"][data-phase="${name}"]`);
  const stopWorld = async (persona: string) => {
    await host.control.getByRole('button', { name: 'Arrêter la partie' }).click();
    await host.control.getByRole('button', { name: 'Arrêter pour tous ?' }).click();
    await host.control.getByTestId('game-ranking').waitFor();
    await picture(host.control, `world-${persona}-podium.png`);
    await host.control.getByRole('button', { name: 'Autre jeu' }).click();
    await openTab(host, 'LiveChat');
  };

  it('dresses Undercover as a police folder: a picture each, words in turn, then the line-up', async () => {
    const photo = join(sandbox, 'indice.png');
    copyFileSync(join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png'), photo);
    await openWorld('undercover', 'insp');
    await host.app.evaluate(({ dialog }, files) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: files })) as typeof dialog.showOpenDialog;
    }, [photo]);
    await host.control.getByRole('button', { name: 'Choisir une image' }).click();
    await phase('write').waitFor({ timeout: 30_000 });
    await host.control.getByTestId('round-banner').waitFor({ state: 'detached' });
    await picture(host.control, 'world-insp-game.png');
    // Words come in turn; mine when asked.
    const deadline = Date.now() + 60_000;
    while (!(await host.control.locator('[data-testid="game"] .game-choices').isVisible())) {
      const field = host.control.getByLabel('Ton mot');
      if (await field.isVisible()) {
        await field.fill('Lumière');
        await field.press('Enter');
      }
      if (Date.now() > deadline) throw new Error('No vote in Undercover');
      await new Promise((done) => setTimeout(done, 300));
    }
    // The vote goes by fast with bots: pictured at once.
    await host.control.screenshot({ path: join(artifacts, 'world-insp-vote.png') });
    await widePictures(host, 'world-insp-vote');
    await stopWorld('insp');
  });

  it('dresses Question débile as a lab: the question on a chalkboard, answers in jars', async () => {
    await openWorld('question', 'boum');
    await host.control.getByTestId('game-prompt').waitFor();
    await picture(host.control, 'world-boum-game.png');
    const field = host.control.getByLabel('Réponse en texte');
    await field.fill('Parce que les pigeons ont voté');
    await field.press('Enter');
    // The bots vote fast: the duel may already be at its reveal.
    await host.control.locator('[data-testid="game"] .game-duel [data-testid="game-entry"]').first().waitFor({ timeout: 30_000 });
    await picture(host.control, 'world-boum-vote.png');
    await widePictures(host, 'world-boum-vote');
    await stopWorld('boum');
  });

  it('dresses Qui l’a envoyé ? as a fortune teller: the meme in gold, the players as tarot cards', async () => {
    // The bots send nothing here: the guest plays too, so that one meme isn't mine.
    await openWorld('who', 'boule', true);
    await picture(host.control, 'world-boule-game.png');
    for (const [member, text] of [[host, 'Mon chat dans un carton'], [guest, 'Un pigeon en cravate']] as const) {
      const field = member.control.getByLabel('Réponse en texte');
      await field.fill(text);
      await field.press('Enter');
    }
    // A round on a meme that isn't mine shows the cards.
    await host.control.locator('[data-testid="game"] .game-choice').first().waitFor({ timeout: 90_000 });
    await host.control.getByTestId('round-banner').waitFor({ state: 'detached' });
    await picture(host.control, 'world-boule-vote.png');
    await widePictures(host, 'world-boule-vote');
    await stopWorld('boule');
    await guest.control.getByRole('button', { name: 'Autre jeu' }).click();
    await openTab(guest, 'LiveChat');
  });

  it('keeps copied pictures in the library, and puts one in the LiveChat on a click', async () => {
    const logo = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png');
    const control = host.control;
    // Pictures nobody copied before, whatever earlier steps put on the clipboard.
    const mark = Date.now() % 250;
    const copyPicture = (flip: boolean) =>
      spawnSync('powershell', [
        '-NoProfile',
        '-STA',
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms, System.Drawing; $i = New-Object System.Drawing.Bitmap([System.Drawing.Image]::FromFile('${logo}')); $i.SetPixel(0, 0, [System.Drawing.Color]::FromArgb(255, ${mark}, 7, 9)); ${flip ? '$i.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX); ' : ''}[System.Windows.Forms.Clipboard]::SetImage($i)`,
      ]);
    const copyText = () => spawnSync('powershell', ['-NoProfile', '-Command', "Set-Clipboard -Value 'juste du texte'"]);

    await openTab(host, 'Bibliothèque');
    await control.getByRole('button', { name: /^Presse-papier/ }).click();
    const items = control.getByTestId('clipboard-item');
    const before = await items.count();

    // The same picture twice is one, another one is one more, a text is none.
    copyPicture(false);
    await expect.poll(() => items.count(), { timeout: 10_000 }).toBe(before + 1);
    copyText();
    copyPicture(false);
    copyPicture(true);
    await expect.poll(() => items.count(), { timeout: 10_000 }).toBe(before + 2);
    copyText();
    await new Promise((done) => setTimeout(done, 1_500));
    expect(await items.count()).toBe(before + 2);

    // A star keeps it through « Vider ».
    await items.first().getByTestId('clipboard-star').getByRole('button').click();
    await control.getByTestId('clipboard-clear').click();
    await expect.poll(() => items.count()).toBe(1);

    // In pause, nothing new comes in.
    await control.getByTestId('clipboard-pause').click();
    await control.getByTestId('clipboard-pause').filter({ hasText: 'Reprendre' }).waitFor();
    copyPicture(false);
    await new Promise((done) => setTimeout(done, 1_500));
    expect(await items.count()).toBe(1);
    await control.getByTestId('clipboard-pause').click();
    await control.getByTestId('clipboard-pause').filter({ hasText: 'Pause' }).waitFor();

    // A click puts it in the LiveChat, ready to send.
    await items.first().locator('.library-picture').click();
    await control.getByTestId('live-preview').locator('img.overlay-media').waitFor();
    await picture(control, '22-clipboard.png');
  });

  it('reopens what played as a copy in the advanced mode', async () => {
    await openTab(host, 'Historique');
    await host.control.getByTestId('history-item').filter({ hasText: '.png' }).first().getByRole('button', { name: 'Modifier' }).click();
    await host.control.getByRole('tab', { name: 'LiveChat', selected: true }).waitFor();
    const layer = host.control.getByTestId('scene-layer').first();
    await layer.waitFor();
    await host.control.getByTestId('scene-strip').waitFor();
    await picture(host.control, 'edit-from-history.png');
    await layer.click();
    await host.control.getByTestId('layer-panel').getByRole('button', { name: /Retirer/ }).first().click();
    await layer.waitFor({ state: 'detached' });
    await host.control.getByRole('button', { name: 'Simple', exact: true }).click();
    await emptyDraft(host);
  });

  it('takes files dropped anywhere in the window, from any tab', async () => {
    const logo = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png');
    const sound = join(sandbox, 'glisse.wav');
    writeFileSync(sound, silentWav(2_000));

    await host.control.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.id = 'to-drop';
      input.hidden = true;
      document.body.append(input);
    });
    await host.control.locator('#to-drop').setInputFiles([logo, sound]);
    const drag = (type: string) =>
      host.control.evaluate((name) => {
        const held = new DataTransfer();
        for (const file of (document.getElementById('to-drop') as HTMLInputElement).files!) held.items.add(file);
        document.body.dispatchEvent(new DragEvent(name, { bubbles: true, cancelable: true, dataTransfer: held }));
      }, type);

    await openTab(host, 'Party');
    await expect(host.control.getByTestId('member-version').count()).resolves.toBe(0);

    // Changing your mind leaves everything as it was.
    await drag('dragenter');
    await host.control.getByTestId('drop-veil').waitFor();
    await picture(host.control, 'drop-veil.png');
    await drag('dragleave');
    await host.control.getByTestId('drop-veil').waitFor({ state: 'detached' });

    // A picture and a sound make one LiveChat.
    await drag('dragenter');
    await drag('drop');
    await host.control.getByTestId('drop-veil').waitFor({ state: 'detached' });
    await host.control.getByRole('tab', { name: 'LiveChat', selected: true }).waitFor();
    await host.control.getByTestId('draft-name').filter({ hasText: 'logo.png' }).waitFor();
    await host.control.getByTestId('draft-name').filter({ hasText: 'glisse.wav' }).waitFor();
    await emptyDraft(host);
    await host.control.locator('#to-drop').evaluate((input) => input.remove());
  });

  it('makes a long name smaller until it fits', async () => {
    await openTab(host, 'Party');
    const name = host.control.getByRole('region', { name: 'Membres' }).locator('.row-title').first();
    const fitted = await name.evaluate(async (element) => {
      const before = parseFloat(getComputedStyle(element).fontSize);
      const content = [...element.childNodes];
      const box = element as HTMLElement;
      box.textContent = 'Un pseudo Discord de 32 signes !!';
      box.style.width = '170px';
      await new Promise((done) => setTimeout(done, 200));
      const result = {
        before,
        after: parseFloat(getComputedStyle(element).fontSize),
        fits: element.scrollWidth <= element.clientWidth,
      };
      box.replaceChildren(...content);
      box.style.width = '';
      return result;
    });
    expect(fitted.after).toBeLessThan(fitted.before);
    expect(fitted.fits).toBe(true);
  });

  it('shows in small what the others will see, and places things freely in the advanced mode', async () => {
    const logo = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'logo.png');
    const control = host.control;

    // The simple mode: the text is on the small screen as it is typed.
    await openTab(host, 'LiveChat');
    await control.getByLabel('Texte à afficher').fill('Un texte');
    await control.getByTestId('live-preview').getByTestId('overlay-text').filter({ hasText: 'Un texte' }).waitFor();
    await pickFile(host, logo);
    await control.getByTestId('live-preview').locator('img.overlay-media').waitFor();
    await picture(control, '18-simple-preview.png');

    // What was there comes along in the advanced mode.
    await control.getByRole('button', { name: 'Avancé' }).click();
    const layers = control.getByTestId('scene-layer');
    await layers.first().waitFor();
    expect(await layers.count()).toBe(1);
    await control.getByTestId('layer-panel').waitFor();

    // A click next to it lets go of it wherever it lands, Escape too, and controls keep it.
    const panel = control.getByTestId('layer-panel');
    await panel.getByRole('button').first().hover();
    await control.locator('.head').click({ position: { x: 300, y: 10 } });
    await panel.waitFor({ state: 'detached' });
    await layers.first().click();
    await panel.waitFor();
    await control.keyboard.press('Escape');
    await panel.waitFor({ state: 'detached' });
    await layers.first().click();
    await panel.waitFor();
    await control.getByRole('button', { name: 'Annuler' }).hover();
    await control.getByTestId('scene-stage').waitFor();

    const placed = () => layers.first().evaluate((element) => (element as HTMLElement).style.left);
    const before = await placed();
    const box = (await layers.first().boundingBox())!;
    await control.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await control.mouse.down();
    await control.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 + 10, { steps: 5 });
    await control.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2 + 20, { steps: 5 });
    await control.mouse.up();
    const moved = await placed();
    expect(moved).not.toBe(before);

    // A whole move is one step back, by button or by keyboard.
    await control.getByRole('button', { name: 'Annuler' }).click();
    await expect.poll(placed).toBe(before);
    await control.getByRole('button', { name: 'Rétablir' }).click();
    await expect.poll(placed).toBe(moved);
    await control.getByTestId('scene-stage').click({ position: { x: 3, y: 3 } });
    await control.keyboard.press('Control+z');
    await expect.poll(placed).toBe(before);
    await control.keyboard.press('Control+y');
    await expect.poll(placed).toBe(moved);

    await layers.first().click();
    const widthOf = () => layers.first().evaluate((element) => parseFloat((element as HTMLElement).style.width));
    const startWidth = await widthOf();
    const corner = (await control.getByTestId('scene-resize-se').boundingBox())!;
    await control.mouse.move(corner.x + 6, corner.y + 6);
    await control.mouse.down();
    await control.mouse.move(corner.x + 18, corner.y + 18, { steps: 5 });
    await control.mouse.up();
    expect(await widthOf()).toBeGreaterThan(startWidth);

    // Pulling a side stretches it: wider, and no taller.
    const shapeOf = () => layers.first().evaluate((element) => parseFloat((element as HTMLElement).style.aspectRatio));
    const startShape = await shapeOf();
    const side = (await control.getByTestId('scene-stretch-e').boundingBox())!;
    await control.mouse.move(side.x + 5, side.y + 5);
    await control.mouse.down();
    await control.mouse.move(side.x + 45, side.y + 5, { steps: 5 });
    await control.mouse.up();
    expect(await shapeOf()).toBeGreaterThan(startShape * 1.1);
    expect(await layers.first().locator('.overlay-media').evaluate((element) => getComputedStyle(element).objectFit)).toBe('fill');

    const grip = (await control.getByTestId('scene-rotate').boundingBox())!;
    await control.mouse.move(grip.x + 6, grip.y + 6);
    await control.mouse.down();
    await control.mouse.move(grip.x + 60, grip.y + 40, { steps: 5 });
    await control.mouse.up();
    expect(await layers.first().evaluate((element) => (element as HTMLElement).style.transform)).not.toContain('rotate(0deg)');

    await control.locator('summary', { hasText: 'Effets' }).click();
    await control.getByText('Noir et blanc').click();
    await control.getByLabel('Apparition').selectOption('3d:door');
    await control.getByLabel('Sortie').selectOption('fade');
    await control.getByTestId('layer-animation').selectOption('3d:cube');
    await control.getByTestId('layer-speed').selectOption('fast');
    await control.getByRole('button', { name: 'Dupliquer en miroir' }).click();
    await expect.poll(() => layers.count()).toBe(2);
    await picture(control, '19-advanced-selected.png');
    await control.getByRole('button', { name: 'Terminé' }).click();

    const sound = join(sandbox, 'son-avance.wav');
    writeFileSync(sound, silentWav(3));
    await answerDialogWith(host, sound);
    await control.getByRole('button', { name: 'Depuis mon PC' }).first().click();
    await control.getByTestId('clip-start').waitFor({ timeout: 15_000 });
    await control.locator('[data-testid="clip-wave"][data-ready="true"]').waitFor();
    await picture(control, '20-advanced.png');

    // A window of this PC behind the board, only here.
    await control.getByRole('button', { name: 'Fond', exact: true }).click();
    const picker = control.getByTestId('backdrop-picker');
    await picker.waitFor();
    const windows = picker.locator('.backdrop-window');
    await expect.poll(async () => (await windows.count()) > 0 || (await picker.getByText('Aucune fenêtre').count()) > 0, { timeout: 15_000 }).toBe(true);
    if ((await windows.count()) > 0) {
      control.on('console', (message) => {
        if (message.text().includes('backdrop')) console.log(`backdrop: ${message.text()}`);
      });
      await windows.first().click();
      await control.getByTestId('scene-backdrop').waitFor({ timeout: 10_000 });
      await picture(control, '20-advanced-backdrop.png');
      await control.getByRole('button', { name: 'Sans fond' }).click();
      await control.getByTestId('scene-backdrop').waitFor({ state: 'detached' });
    } else {
      await picker.getByRole('button', { name: 'Fermer' }).click();
    }

    // The preview plays it here alone.
    await control.getByRole('button', { name: 'Aperçu', exact: true }).click();
    await control.getByTestId('scene-preview').getByTestId('overlay-layer').first().waitFor();
    await expect.poll(() => control.getByTestId('scene-preview').getByTestId('overlay-layer').count()).toBe(2);
    expect(await guest.stage.getByTestId('overlay-layer').count()).toBe(0);
    await control.getByRole('button', { name: 'Arrêter l’aperçu' }).first().click();
    await layers.first().waitFor();

    // The text moves like a picture, and comes back to its place on demand.
    const text = control.getByTestId('scene-text');
    expect(await control.getByTestId('text-reset').count()).toBe(0);
    // Grabbed where no picture covers it: the pictures stay on top of it.
    const spot = await text.evaluate((element) => {
      const box = element.getBoundingClientRect();
      for (let y = box.top + 2; y < box.bottom; y += 4) {
        for (let x = box.left + 2; x < box.right; x += 4) if (document.elementFromPoint(x, y) === element) return { x, y };
      }
      return null;
    });
    expect(spot).not.toBeNull();
    await control.mouse.move(spot!.x, spot!.y);
    await control.mouse.down();
    await control.mouse.move(spot!.x - 20, spot!.y - 15, { steps: 5 });
    await control.mouse.move(spot!.x - 40, spot!.y - 30, { steps: 5 });
    await control.mouse.up();
    await control.getByTestId('text-reset').waitFor();
    const textLeft = await text.evaluate((element) => (element as HTMLElement).style.left);

    await control.getByRole('button', { name: 'Sauvegarder dans la bibliothèque' }).click();
    await control.getByLabel('Nom de ce LiveChat').fill('Face à face');
    await control.getByRole('button', { name: 'Sauvegarder', exact: true }).click();
    await control.getByText('Sauvegardé sur ce PC.').waitFor();

    // The others get the same thing, drawn by their own app from the recipe.
    await sendButton(host).click();
    await overlayState(guest, 'playing');
    const shown = guest.stage.getByTestId('overlay-layer');
    await expect.poll(() => shown.count()).toBe(2);
    await guest.stage.getByTestId('overlay-text').filter({ hasText: 'Un texte' }).waitFor();
    // Where it was moved to, on the other PC too.
    expect(await guest.stage.getByTestId('overlay-text').evaluate((element) => (element as HTMLElement).style.left)).toBe(textLeft);
    await guest.stage.getByTestId('overlay-audio').waitFor({ state: 'attached' });
    const looks = await shown.evaluateAll((elements) =>
      elements.map((element) => {
        const media = element.querySelector('img[data-testid="overlay-image"]') as HTMLImageElement;
        const turning = element.querySelector('.scene-motion.is-3d') as HTMLElement | null;
        return {
          place: (element as HTMLElement).style.left,
          flip: media.style.transform,
          filter: media.style.filter,
          ready: media.complete && media.naturalWidth > 0,
          effect: turning?.style.animationName ?? '',
          faces: element.querySelectorAll('.scene-copy').length,
        };
      }),
    );
    expect(looks.every(({ filter, ready }) => filter.includes('grayscale') && ready)).toBe(true);
    expect(looks.filter(({ flip }) => flip.includes('scaleX')).length).toBe(1);
    expect(looks.every(({ effect, faces }) => effect === 'scene-3d-cube' && faces === 3)).toBe(true);
    expect(looks[0]!.place).not.toBe(looks[1]!.place);
    await picture(guest.stage, '21-overlay-advanced.png');
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    // After sending, the stage is free again. A saved one comes back whole, and leaves in one click.
    await control.getByTestId('scene-stage').waitFor();
    await expect.poll(() => layers.count()).toBe(0);
    await openTab(host, 'Bibliothèque');
    await control.getByRole('button', { name: /^Sauvegardés/ }).click();
    const saved = control.getByTestId('saved-livechat').filter({ hasText: 'Face à face' });
    await saved.getByRole('button', { name: 'Envoyer' }).click();
    await overlayState(guest, 'playing');
    await expect.poll(() => shown.count()).toBe(2);
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    await saved.getByRole('button', { name: 'Modifier' }).click();
    await expect.poll(() => layers.count()).toBe(2);
    await expect(control.getByLabel('Texte à afficher').inputValue()).resolves.toBe('Un texte');
    // Saved moved, it comes back moved, and goes back to its place in one click.
    expect(await text.evaluate((element) => (element as HTMLElement).style.left)).toBe(textLeft);
    await control.getByTestId('text-reset').click();
    await control.getByTestId('text-reset').waitFor({ state: 'detached' });
    expect(await text.evaluate((element) => (element as HTMLElement).style.left)).not.toBe(textLeft);

    // A video among the pictures, heard or not as chosen, and on time like any other.
    await answerDialogWith(host, join(sandbox, 'clip.webm'));
    await control.getByRole('button', { name: 'Depuis mon PC' }).first().click();
    await expect.poll(() => layers.count()).toBe(3);
    await control.getByRole('button', { name: 'Terminé' }).click();
    await control.getByTestId('video-sound').click();
    await sendButton(host).click();
    await overlayState(guest, 'playing');
    const video = guest.stage.getByTestId('overlay-layer').getByTestId('overlay-video');
    await video.waitFor();
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).volume)).toBe(0);
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    // The simple mode kept its own file, and is what the next tests expect.
    await control.getByRole('button', { name: 'Simple' }).click();
    await control.getByRole('button', { name: 'Retirer', exact: true }).click();
    await control.getByLabel('Texte à afficher').fill('');
    await openTab(host, 'Bibliothèque');
    await saved.getByRole('button', { name: 'Supprimer' }).click();
    await saved.getByRole('button', { name: 'Vraiment ?' }).click();
    await expect.poll(() => saved.count()).toBe(0);
  });

  it('plays several videos at once, each with its own passage and sound', async () => {
    const control = host.control;
    const clip = join(sandbox, 'clip.webm');
    await openTab(host, 'LiveChat');
    await control.getByRole('button', { name: 'Avancé' }).click();
    const videos = control.getByTestId('clip-video');
    for (const count of [1, 2, 3]) {
      await answerDialogWith(host, clip);
      await control.getByRole('button', { name: 'Depuis mon PC' }).first().click();
      await expect.poll(() => videos.count()).toBe(count);
    }
    await answerDialogWith(host, clip);
    await control.getByRole('button', { name: 'Depuis mon PC' }).first().click();
    await control.getByText('3 vidéos maximum.').waitFor();
    await control.keyboard.press('Escape');
    await videos.nth(0).getByRole('button').first().click();

    // The bar shows the video, and the chosen part moves whole.
    await expect.poll(() => control.getByTestId('clip-frames').getAttribute('data-filled').then(Number), { timeout: 15_000 }).toBeGreaterThan(0);
    await setRange(host, /Début du passage/, 1_000);
    await setRange(host, /Fin du passage/, 3_000);
    await control.getByTestId('clip-length').filter({ hasText: '0:02,0' }).waitFor();
    await picture(control, 'clip-bar.png');
    const chosen = (await control.getByTestId('clip-chosen').boundingBox())!;
    await control.mouse.move(chosen.x + chosen.width / 2, chosen.y + chosen.height / 2);
    await control.mouse.down();
    await control.mouse.move(chosen.x + chosen.width / 2 + 60, chosen.y + chosen.height / 2, { steps: 4 });
    await control.mouse.up();
    await expect.poll(() => control.getByTestId('clip-start').textContent()).not.toBe('0:01,0');
    await control.getByTestId('clip-length').filter({ hasText: '0:02,0' }).waitFor();
    await setRange(host, /Début du passage/, 1_000);
    await setRange(host, /Fin du passage/, 3_000);

    await control.getByRole('button', { name: 'Zoomer', exact: true }).click();
    await control.getByLabel('Déplacer la vue').waitFor();
    await control.getByRole('button', { name: 'Dézoomer' }).click();
    await control.getByLabel('Déplacer la vue').waitFor({ state: 'detached' });

    // The second one has its own passage, and stays silent.
    await videos.nth(1).getByRole('button').first().click();
    await setRange(host, /Début du passage/, 2_000);
    await setRange(host, /Fin du passage/, 4_000);
    await videos.nth(1).getByTestId('video-sound').click();
    await videos.nth(0).getByRole('button').first().click();
    await control.getByTestId('clip-start').filter({ hasText: '0:01,0' }).waitFor();

    await sendButton(host).click();
    await overlayState(guest, 'playing');
    const shown = guest.stage.getByTestId('overlay-video');
    await expect.poll(() => shown.count()).toBe(3);
    const readings = () => shown.evaluateAll((elements) => elements.map((element) => {
      const video = element as HTMLVideoElement;
      return { volume: video.volume, at: video.currentTime };
    }));
    await guest.stage.locator('[data-on-screen="true"]').waitFor({ state: 'attached' });
    await expect.poll(async () => (await readings())[1]!.volume).toBe(0);
    const [first, second] = await readings();
    expect(first!.volume).toBeGreaterThan(0);
    expect(first!.at).toBeGreaterThanOrEqual(1);
    expect(second!.at).toBeGreaterThanOrEqual(2);
    await picture(guest.stage, 'overlay-videos.png');
    // The shorter ones leave when they are over, and the longest one is what lasts.
    await expect.poll(() => guest.stage.getByTestId('overlay-layer').first().evaluate((element) => (element as HTMLElement).style.visibility), { timeout: 8_000 }).toBe('hidden');
    expect(await guest.stage.getByTestId('overlay-layer').last().evaluate((element) => (element as HTMLElement).style.visibility)).toBe('');
    await host.control.getByRole('button', { name: 'Passer pour tous' }).first().click();
    await overlayState(guest, 'idle');

    await expect.poll(() => control.getByTestId('scene-layer').count()).toBe(0);
    await control.getByRole('button', { name: 'Simple', exact: true }).click();
  });

  it('moves a zone of the overlay, and shows the result on the real screen', async () => {
    await openSettings(guest, 'Affichage en jeu');
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
    await openTab(host, 'Party');
    await openTab(guest, 'Party');
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
    await openTab(guest, 'Party');
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
    await openTab(host, 'Party');
    await host.control.getByRole('button', { name: 'Quitter la party', exact: true }).click();
    await host.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await inServer(host, 'Les potes');
    await onlineCount(host, 2);
  });

  it('logs out, and stays logged out after a restart', async () => {
    await openSettings(guest, 'Général');
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

    await openSettings(host, 'Général');
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

    await sendText(host, 'Toujours là ?');
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
