import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAKE_DISCORD, FakeDiscord, hiddenFromEveryone } from '../../../services/party/test/fake-discord';

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

// Added out of order, since the order on screen has to come from Discord's own positions.
const serverId = discord.addGuild('Les potes', nono);
const liveChatRole = discord.addRole(serverId, 'LiveChat');
discord.addMember(serverId, pote, { roles: [liveChatRole] });
const gamesCategory = discord.addChannel(serverId, { name: 'Jeux', type: 4, position: 1 });
discord.addChannel(serverId, { name: 'vocal', type: 2, position: 0, parent_id: gamesCategory });
discord.addChannel(serverId, {
  name: 'staff',
  position: 2,
  parent_id: gamesCategory,
  permission_overwrites: [hiddenFromEveryone(serverId)],
});
const generalChannel = discord.addChannel(serverId, { name: 'general', position: 1, parent_id: gamesCategory });
discord.addChannel(serverId, { name: 'annonces', position: 0 });

// A server where Pote is a member, but lacks the role.
discord.addGuild('Autre serveur', discord.addUser('Patron'), '100000000000000555');
discord.addMember('100000000000000555', pote);

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
      '--var',
      `DISCORD_BOT_TOKEN:${FAKE_DISCORD.botToken}`,
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

const launch = async (profile: string): Promise<Member> => {
  const app = await electron.launch({
    ...(packagedExecutable
      ? { executablePath: packagedExecutable, args: [KEEP_DRAWING] }
      : { args: [KEEP_DRAWING, join(__dirname, '..')] }),
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
  await member.control.getByTestId('account-name').waitFor();
};

const channelButton = (member: Member, name: string) => member.control.getByRole('button', { name, exact: false });

const channelNames = (member: Member) =>
  member.control.getByTestId('channel').locator('.channel-name').allTextContents();

const partyMember = (member: Member, name: string) =>
  member.control.getByRole('region', { name: 'Membres' }).getByText(name);

const inChannel = (member: Member, name: string) =>
  member.control.getByTestId('party-channel').filter({ hasText: `#${name}` }).waitFor({ state: 'attached' });

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

const openTab = (member: Member, name: string) => member.control.getByRole('tab', { name }).click();

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
const pickFile = async (member: Member, path: string): Promise<void> => {
  await member.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog;
  }, path);
  await member.control.getByRole('button', { name: 'Choisir un fichier' }).click();
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
  it('sends people to Discord asking for nothing more than who they are', async () => {
    const member = await launch('online');
    await loginButton(member).click();

    const authorize = await nextOpenedUrl(member);
    expect(authorize.origin + authorize.pathname).toBe('https://discord.com/oauth2/authorize');
    expect(authorize.searchParams.get('scope')).toBe('identify');
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
    await host.control.screenshot({ path: join(artifacts, '1-login.png') });
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

    await host.control.getByTestId('account-name').filter({ hasText: 'Nono' }).waitFor();
    // The real picture, from the real address, allowed through by the app's own rules.
    await pictureLoaded(host.control, 'account-avatar');

    const state = await host.control.evaluate(() => window.liveChat.getState());
    expect(JSON.stringify(state)).not.toContain('token');
    expect(state.party).toBeNull();
  });

  it('shows the channels in the order of Discord, with only what each person can see', async () => {
    guest = await launch('guest');
    await logIn(guest, pote);

    await expect.poll(() => channelNames(host)).toEqual(['annonces', 'general', 'staff', 'vocal']);
    await expect.poll(() => channelNames(guest)).toEqual(['annonces', 'general', 'vocal']);
    await host.control.getByRole('heading', { name: 'Jeux' }).waitFor();
    await host.control.screenshot({ path: join(artifacts, '2-home.png') });
  });

  it('says what is missing on a server that asks for the role', async () => {
    await guest.control.getByRole('button', { name: 'Autre serveur' }).click();
    await guest.control.getByTestId('guild-locked').filter({ hasText: 'rôle LiveChat' }).waitFor();
    await expect.poll(() => channelNames(guest)).toEqual([]);

    await guest.control.getByRole('button', { name: 'Les potes' }).click();
    await expect.poll(() => channelNames(guest)).toEqual(['annonces', 'general', 'vocal']);
  });

  it('shows who is connected on the server', async () => {
    for (const member of [host, guest]) {
      await member.control.getByTestId('guild-online-count').filter({ hasText: '2' }).waitFor({ timeout: 15_000 });
    }
    await host.control.getByTestId('guild-online-member').filter({ hasText: 'Pote' }).waitFor();
    await guest.control.getByTestId('guild-online-member').filter({ hasText: 'Nono' }).waitFor();
  });

  it('enters the party of a channel with one click, and both see each other', async () => {
    await channelButton(host, 'general').click();
    await connected(host);
    await onlineCount(host, 1);
    await inChannel(host, 'general');
    // Nothing to show yet, so the overlay stays out of the way.
    expect(await stageVisible(host)).toBe(false);
    await overlayState(host, 'idle');

    // Seen from outside the channel.
    const occupants = channelButton(guest, 'general').getByTestId('channel-occupants').locator('.avatar');
    await expect.poll(() => occupants.count(), { timeout: 15_000 }).toBe(1);

    await channelButton(guest, 'general').click();
    await connected(guest);
    await onlineCount(guest, 2);
    await onlineCount(host, 2);

    await partyMember(host, 'Pote').waitFor();
    await partyMember(guest, 'Nono').waitFor();
    await pictureLoaded(guest.control, 'member-avatar');
    await host.control.screenshot({ path: join(artifacts, '3-party-host.png') });
  });

  it('moves to another channel in one click, leaving the previous one', async () => {
    await openTab(guest, 'Accueil');
    await channelButton(guest, 'vocal').click();
    await inChannel(guest, 'vocal');
    await onlineCount(host, 1);

    await openTab(guest, 'Accueil');
    await channelButton(guest, 'general').click();
    await inChannel(guest, 'general');
    await onlineCount(host, 2);
  });

  it('goes to the party when clicking the channel already joined', async () => {
    await openTab(guest, 'Accueil');
    await channelButton(guest, 'general').click();
    await guest.control.getByTestId('party-channel').waitFor();
    await connected(guest);
  });

  it('removes someone from a channel they can no longer see', async () => {
    discord.setOverwrites(serverId, generalChannel, [hiddenFromEveryone(serverId)]);
    await guest.control.getByTestId('channel-lost').waitFor({ timeout: 20_000 });
    await onlineCount(host, 1);
    await expect.poll(() => channelNames(guest), { timeout: 15_000 }).toEqual(['annonces', 'vocal']);

    discord.setOverwrites(serverId, generalChannel, []);
    await expect.poll(() => channelNames(guest), { timeout: 15_000 }).toEqual(['annonces', 'general', 'vocal']);
    await channelButton(guest, 'general').click();
    await connected(guest);
    await onlineCount(host, 2);
    await expect(guest.control.getByTestId('channel-lost').count()).resolves.toBe(0);
  });

  it('comes back alone after the app restarts, still logged in', async () => {
    await guest.app.close();
    await onlineCount(host, 1);

    guest = await launch('guest');
    await connected(guest);
    await onlineCount(host, 2);
    await inChannel(guest, 'general');
    await guest.control.getByTestId('account-name').filter({ hasText: 'Pote' }).waitFor({ state: 'attached' });
  });

  it('hands over to a second PC, and lets the first take it back', async () => {
    const secondPc = await launch('second-pc');
    await logIn(secondPc, pote);
    await guest.control.getByTestId('lobby-status').filter({ hasText: 'autre PC' }).waitFor({ state: 'attached', timeout: 15_000 });

    await channelButton(secondPc, 'general').click();
    await connected(secondPc);
    await guest.control.getByTestId('connection').filter({ hasText: 'autre PC' }).waitFor({ state: 'attached', timeout: 15_000 });
    await onlineCount(host, 2);

    await guest.control.getByRole('button', { name: 'Reprendre ici' }).click();
    await connected(guest);
    await secondPc.control.getByTestId('connection').filter({ hasText: 'autre PC' }).waitFor({ state: 'attached', timeout: 15_000 });
    await secondPc.app.close();

    await openTab(guest, 'Accueil');
    await guest.control.getByRole('button', { name: 'Reprendre ici' }).click();
    await guest.control.getByTestId('guild-online-count').filter({ hasText: '2' }).waitFor({ timeout: 15_000 });
    await openTab(guest, 'Party');
    await onlineCount(host, 2);
  });

  it('reconnects within 10 s of the service coming back', async () => {
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

    // The list of channels has less of a hurry.
    await host.control
      .getByTestId('guild-online-count')
      .filter({ hasText: '2' })
      .waitFor({ state: 'attached', timeout: 45_000 });
  });

  it('opens the media tabs', async () => {
    await openTab(host, 'Médias');
    await openTab(guest, 'Médias');
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
    await openTab(host, 'Médias');
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
    await host.stage.screenshot({ path: join(artifacts, '5-overlay-test.png') });

    expect(await stageVisible(guest)).toBe(false);
    await overlayState(guest, 'idle');

    await overlayState(host, 'idle', 10_000);
    await expect.poll(() => stageVisible(host), { timeout: 5_000 }).toBe(false);
    await openTab(host, 'Médias');
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
    await host.control.screenshot({ path: join(artifacts, '7-media-tab.png') });
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
    await guest.stage.screenshot({ path: join(artifacts, '6-overlay-image.png') });
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

  it('moves a zone of the overlay, and shows the result on the real screen', async () => {
    await openTab(guest, 'Réglages');
    await guest.control.getByTestId('layout-box').scrollIntoViewIfNeeded();
    await guest.control.screenshot({ path: join(artifacts, '8-settings-tab.png') });
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

  it('lets someone leave a channel, and go back to the list', async () => {
    await openTab(guest, 'Party');
    await guest.control.getByRole('button', { name: 'Quitter le salon' }).click();
    await guest.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await guest.control.getByRole('button', { name: 'Rejoindre' }).waitFor();
    await onlineCount(host, 1);
    await partyMember(host, 'Pote').waitFor({ state: 'detached', timeout: 10_000 });
  });

  it('creates a private party and shows its code, with no channel in sight', async () => {
    await openTab(host, 'Accueil');
    await host.control.getByRole('button', { name: 'Créer une party privée' }).click();
    await host.control.getByTestId('party-code').waitFor();
    await connected(host);
    await onlineCount(host, 1);

    code = await partyCode(host);
    expect(code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('refuses a wrong code with a clear message', async () => {
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

  it('comes back to a private party after a restart, even with a changed code', async () => {
    await guest.app.close();
    await onlineCount(host, 1);
    guest = await launch('guest');
    await connected(guest);
    await onlineCount(host, 2);
    expect(await partyCode(guest)).toBe(await partyCode(host));
  });

  it('lets a member leave, and return to the home screen', async () => {
    await guest.control.getByRole('button', { name: 'Quitter la party' }).click();
    await guest.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await guest.control.getByRole('button', { name: 'Rejoindre' }).waitFor();

    await partyMember(host, 'Pote').waitFor({ state: 'detached', timeout: 10_000 });
    await onlineCount(host, 1);
  });

  it('removes the party when its last member leaves', async () => {
    await host.control.getByRole('button', { name: 'Quitter la party' }).click();
    await host.control.getByRole('button', { name: 'Confirmer le départ ?' }).click();
    await host.control.getByRole('button', { name: 'Rejoindre' }).waitFor();
  });

  it('logs out, and stays logged out after a restart', async () => {
    await guest.control.getByRole('button', { name: 'Se déconnecter' }).click();
    await guest.control.getByRole('button', { name: 'Confirmer ?' }).click();
    await loginButton(guest).waitFor();
    await host.control
      .getByTestId('guild-online-count')
      .filter({ hasText: '1' })
      .waitFor({ state: 'attached', timeout: 15_000 });

    await guest.app.close();
    guest = await launch('guest');
    await loginButton(guest).waitFor();
    expect((await guest.control.evaluate(() => window.liveChat.getState())).account).toBeNull();
  });
});
