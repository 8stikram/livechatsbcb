import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AuthRedeemResponseSchema,
  AuthStartResponseSchema,
  CloseCode,
  LobbyMessageSchema,
  MeResponseSchema,
  MAX_MEDIA_BYTES,
  MAX_ONLINE_MEMBERS,
  MEDIA_PART_BYTES,
  ServerMessageSchema,
  SessionResponseSchema,
  WS_SUBPROTOCOL,
  WS_TOKEN_PREFIX,
  type Account,
  type LobbyMessage,
  type QueueItem,
  type ServerMessage,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { FAKE_DISCORD, FakeDiscord, hiddenFromEveryone, openedToRole } from './fake-discord';

const BASE = 'http://127.0.0.1:8799';
const QUICK_BASE = 'http://127.0.0.1:8798';

const discord = new FakeDiscord();
beforeAll(() => discord.start());
afterAll(() => discord.stop());

let ipCounter = 0;
const uniqueIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

const post = (path: string, body: unknown, headers: Record<string, string> = {}, base = BASE) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': uniqueIp(), ...headers },
    body: JSON.stringify(body),
  });

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

const newVerifier = () => randomBytes(32).toString('base64url');
const challengeOf = (verifier: string) => createHash('sha256').update(verifier).digest('base64url');

// Everything the browser does between the app and Discord, up to the address it ends on.
const authorizeInBrowser = async (userId: string, verifier: string, base = BASE, ip = uniqueIp()): Promise<URL> => {
  const started = await post('/v1/auth/start', { challenge: challengeOf(verifier), port: 45_678 }, { 'cf-connecting-ip': ip }, base);
  expect(started.status).toBe(200);
  const authorize = new URL(AuthStartResponseSchema.parse(await started.json()).url);
  expect(authorize.origin + authorize.pathname).toBe('https://discord.com/oauth2/authorize');
  expect(authorize.searchParams.get('scope')).toBe('identify');

  const callback = new URL(authorize.searchParams.get('redirect_uri')!);
  callback.search = new URLSearchParams({ code: discord.codeFor(userId), state: authorize.searchParams.get('state')! }).toString();
  const response = await fetch(callback, { redirect: 'manual' });
  expect(response.status).toBe(302);
  return new URL(response.headers.get('location')!);
};

type LoggedIn = { token: string; account: Account; userId: string };

const loginAs = async (userId: string, base = BASE): Promise<LoggedIn> => {
  const verifier = newVerifier();
  const back = await authorizeInBrowser(userId, verifier, base);
  const redeemed = await post('/v1/auth/redeem', { ticket: back.searchParams.get('ticket'), verifier }, {}, base);
  expect(redeemed.status).toBe(200);
  return { ...AuthRedeemResponseSchema.parse(await redeemed.json()), userId };
};

const loginNew = (name: string, base = BASE) => loginAs(discord.addUser(name), base);

// A private party's session always has its code.
type CodeSession = SessionResponse & { code: string };

const createParty = async (name = 'Nono', base = BASE): Promise<CodeSession> => {
  const { token } = await loginNew(name, base);
  const response = await post('/v1/parties', {}, bearer(token), base);
  expect(response.status).toBe(201);
  return SessionResponseSchema.parse(await response.json()) as CodeSession;
};

const joinParty = async (code: string, name: string): Promise<CodeSession> => {
  const { token } = await loginNew(name);
  const response = await post('/v1/join', { code }, bearer(token));
  expect(response.status).toBe(200);
  return SessionResponseSchema.parse(await response.json()) as CodeSession;
};

class TestSocket {
  readonly messages: ServerMessage[] = [];
  closeCode: number | undefined;
  private readonly socket: WebSocket;
  private waiters: Array<() => void> = [];

  constructor(session: Pick<SessionResponse, 'partyId' | 'token'>, version = WS_SUBPROTOCOL, base = BASE) {
    this.socket = new WebSocket(`${base.replace('http', 'ws')}/v1/parties/${session.partyId}/ws`, [
      version,
      `${WS_TOKEN_PREFIX}${session.token}`,
    ]);
    this.socket.addEventListener('message', (event) => {
      const message = ServerMessageSchema.parse(JSON.parse(String(event.data)));
      this.messages.push(message);
      if (message.t === 'closing') this.closeCode = message.code;
      this.wake();
    });
    this.socket.addEventListener('close', (event) => {
      this.closeCode = event.code;
      this.wake();
    });
  }

  private wake() {
    for (const waiter of this.waiters.splice(0)) waiter();
  }

  async until<T>(check: () => T | undefined, label: string): Promise<T> {
    const deadline = Date.now() + 8_000;
    for (;;) {
      const value = check();
      if (value !== undefined) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(this.messages)}`);
      await Promise.race([
        new Promise<void>((done) => this.waiters.push(done)),
        new Promise((done) => setTimeout(done, 100)),
      ]);
    }
  }

  welcome() {
    return this.until(() => this.messages.find((message) => message.t === 'welcome'), 'welcome');
  }

  closed() {
    return this.until(() => this.closeCode, 'close');
  }

  latestQueue(): QueueItem[] {
    const latest = this.messages.findLast((message) => message.t === 'queue' || message.t === 'welcome');
    return latest && 'queue' in latest ? latest.queue : [];
  }

  queueWhere(check: (queue: QueueItem[]) => boolean, label: string) {
    return this.until(() => (check(this.latestQueue()) ? this.latestQueue() : undefined), label);
  }

  latestMembers() {
    const latest = this.messages.findLast((message) => message.t === 'members' || message.t === 'welcome');
    return latest && 'members' in latest ? latest.members : [];
  }

  sawOnline(count: number) {
    return this.until(
      () => (this.latestMembers().filter((member) => member.online).length === count ? true : undefined),
      `${count} online`,
    );
  }

  send(text: string) {
    this.socket.send(text);
  }

  close() {
    this.socket.close();
  }
}

const authorized = (session: SessionResponse) => ({ authorization: `Bearer ${session.token}` });

const sendText = async (session: SessionResponse, caption: string, durationMs = 1_000) => {
  const response = await post(
    `/v1/parties/${session.partyId}/media`,
    { caption, clipStartMs: 0, durationMs, file: null },
    authorized(session),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { mediaId: string }).mediaId;
};

const openUpload = (session: SessionResponse, size: number, contentType = 'video/mp4', base = BASE) =>
  fetch(`${base}/v1/parties/${session.partyId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorized(session) },
    body: JSON.stringify({ caption: '', clipStartMs: 0, durationMs: 2_000, file: { contentType, size } }),
  });

const uploadFile = async (session: SessionResponse, bytes: Uint8Array, base = BASE): Promise<string> => {
  const opened = await openUpload(session, bytes.length, 'video/mp4', base);
  expect(opened.status).toBe(201);
  const { mediaId } = (await opened.json()) as { mediaId: string };

  const parts = [];
  for (let part = 1; (part - 1) * MEDIA_PART_BYTES < bytes.length; part++) {
    const response = await fetch(`${base}/v1/parties/${session.partyId}/media/${mediaId}/parts/${part}`, {
      method: 'PUT',
      headers: authorized(session),
      body: bytes.slice((part - 1) * MEDIA_PART_BYTES, part * MEDIA_PART_BYTES),
    });
    expect(response.status).toBe(200);
    parts.push(await response.json());
  }

  const completed = await fetch(`${base}/v1/parties/${session.partyId}/media/${mediaId}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorized(session) },
    body: JSON.stringify({ parts }),
  });
  expect(completed.status).toBe(204);
  return mediaId;
};

const testBytes = (size: number) => {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < size; index += 4096) bytes[index] = index % 251;
  return bytes;
};

describe('party service', () => {
  it('tells the time, for clock correction', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();

    const before = Date.now();
    socket.send(JSON.stringify({ t: 'time', c: before }));
    const reply = await socket.until(() => socket.messages.find((message) => message.t === 'time'), 'time');
    expect(reply.c).toBe(before);
    expect(Math.abs(reply.s - before)).toBeLessThan(5_000);
    socket.close();
  });

  it('plays a text for everyone at the same moment, then empties the queue', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();

    await sendText(host, 'Salut tout le monde');
    const [forHost] = await hostSocket.queueWhere((queue) => queue[0]?.startAt != null, 'host start');
    const [forGuest] = await guestSocket.queueWhere((queue) => queue[0]?.startAt != null, 'guest start');
    expect(forGuest!.startAt).toBe(forHost!.startAt);
    expect(forHost).toMatchObject({ kind: 'text', caption: 'Salut tout le monde', senderName: 'Nono' });
    expect(forHost!.startAt!).toBeGreaterThan(Date.now() - 1_000);

    await guestSocket.queueWhere((queue) => queue.length === 0, 'empty queue');
    hostSocket.close();
    guestSocket.close();
  });

  it('never interrupts: the second item waits, and skipping moves on', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();

    const first = await sendText(host, 'premier', 60_000);
    const second = await sendText(host, 'second', 60_000);
    const queue = await socket.queueWhere((items) => items.length === 2, 'two items');
    expect(queue[0]).toMatchObject({ id: first });
    expect(queue[0]!.startAt).not.toBeNull();
    expect(queue[1]).toMatchObject({ id: second, startAt: null });

    // A stale skip must not take out the item after the one it meant.
    socket.send(JSON.stringify({ t: 'skip', mediaId: second }));
    socket.send(JSON.stringify({ t: 'skip', mediaId: first }));
    const after = await socket.queueWhere((items) => items.length === 1, 'one left');
    expect(after[0]).toMatchObject({ id: second });
    expect(after[0]!.startAt).not.toBeNull();

    socket.send(JSON.stringify({ t: 'skip', mediaId: second }));
    await socket.queueWhere((items) => items.length === 0, 'empty');
    socket.close();
  });

  it('gives the queue to someone arriving late', async () => {
    const host = await createParty();
    await sendText(host, 'déjà en cours', 60_000);
    const socket = new TestSocket(host);
    const welcome = await socket.welcome();
    expect(welcome.queue[0]).toMatchObject({ caption: 'déjà en cours' });
    expect(welcome.queue[0]!.startAt).not.toBeNull();
    socket.close();
  });

  it('uploads a file in parts, waits for everyone, and serves it to members only', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const stranger = await createParty('Inconnu');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();

    const bytes = testBytes(MEDIA_PART_BYTES + 1_234);
    const mediaId = await uploadFile(host, bytes);

    const waiting = await guestSocket.queueWhere((queue) => queue.length === 1, 'announcement');
    expect(waiting[0]).toMatchObject({ id: mediaId, kind: 'video', contentType: 'video/mp4', size: bytes.length, startAt: null });

    const url = `${BASE}/v1/parties/${host.partyId}/media/${mediaId}`;
    const download = await fetch(url, { headers: authorized(guest) });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('video/mp4');
    // Compared directly: the test library takes 15 s to compare 8 MB byte by byte.
    expect(Buffer.from(await download.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);

    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: authorized(stranger) })).status).toBe(401);

    // Still waiting: one ready is not everyone.
    hostSocket.send(JSON.stringify({ t: 'ready', mediaId }));
    await new Promise((done) => setTimeout(done, 300));
    expect(guestSocket.latestQueue()[0]!.startAt).toBeNull();

    guestSocket.send(JSON.stringify({ t: 'ready', mediaId }));
    await guestSocket.queueWhere((queue) => queue[0]?.startAt != null, 'start');
    hostSocket.close();
    guestSocket.close();
  });

  it('stops waiting for a member who leaves', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();

    const mediaId = await uploadFile(host, testBytes(1_000));
    hostSocket.send(JSON.stringify({ t: 'ready', mediaId }));
    await hostSocket.queueWhere((queue) => queue.length === 1, 'announcement');

    guestSocket.close();
    await hostSocket.queueWhere((queue) => queue[0]?.startAt != null, 'start');
    hostSocket.close();
  });

  it('refuses bad uploads', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const stranger = await createParty('Inconnu');
    expect((await openUpload(host, MAX_MEDIA_BYTES + 1)).status).toBe(400);
    expect((await openUpload(host, 1_000, 'text/html')).status).toBe(400);

    // The token of another party opens nothing here.
    const foreign = await fetch(`${BASE}/v1/parties/${host.partyId}/media`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authorized(stranger) },
      body: JSON.stringify({ caption: 'intrus', clipStartMs: 0, durationMs: 2_000, file: null }),
    });
    expect(foreign.status).toBe(401);

    const noAuth = await fetch(`${BASE}/v1/parties/${host.partyId}/media`, {
      method: 'POST',
      body: JSON.stringify({ caption: '', clipStartMs: 0, durationMs: 2_000, file: { contentType: 'video/mp4', size: 10 } }),
    });
    expect(noAuth.status).toBe(401);

    const opened = await openUpload(host, MEDIA_PART_BYTES + 10);
    const { mediaId } = (await opened.json()) as { mediaId: string };
    const part = (number: number, body: Uint8Array, session = host) =>
      fetch(`${BASE}/v1/parties/${host.partyId}/media/${mediaId}/parts/${number}`, {
        method: 'PUT',
        headers: authorized(session),
        body,
      });

    expect((await part(1, testBytes(100))).status).toBe(400);
    expect((await part(3, testBytes(10))).status).toBe(400);
    // Only the member who started an upload may add to it.
    expect((await part(2, testBytes(10), guest)).status).toBe(404);

    const cancel = (session: SessionResponse) =>
      fetch(`${BASE}/v1/parties/${host.partyId}/media/${mediaId}`, { method: 'DELETE', headers: authorized(session) });
    expect((await cancel(guest)).status).toBe(404);
    expect((await cancel(host)).status).toBe(204);
    expect((await part(2, testBytes(10))).status).toBe(404);

    expect((await post(`/v1/parties/${host.partyId}/media`, { caption: '  ', clipStartMs: 0, durationMs: 2_000, file: null }, authorized(host))).status).toBe(400);
    expect((await post(`/v1/parties/${host.partyId}/media`, { caption: 'trop long', clipStartMs: 0, durationMs: 61_000, file: null }, authorized(host))).status).toBe(400);
  });

  it('refuses uploads past the storage cap, and frees the space when one is cancelled', async () => {
    const host = await createParty();
    const opened: string[] = [];
    let refused: Response | null = null;

    for (let attempt = 0; attempt < 20 && !refused; attempt++) {
      const response = await openUpload(host, MAX_MEDIA_BYTES);
      if (response.status === 201) opened.push(((await response.json()) as { mediaId: string }).mediaId);
      else refused = response;
    }

    // 8 GiB of 500 MiB files, minus what earlier tests left: never more than 16.
    expect(opened.length).toBeGreaterThanOrEqual(15);
    expect(opened.length).toBeLessThanOrEqual(16);
    expect(refused?.status).toBe(507);
    expect(await refused?.json()).toEqual({ error: 'storage_full' });

    // Text doesn't use storage, so it still works.
    await sendText(host, 'toujours possible');

    for (const mediaId of opened) {
      const response = await fetch(`${BASE}/v1/parties/${host.partyId}/media/${mediaId}`, {
        method: 'DELETE',
        headers: authorized(host),
      });
      expect(response.status).toBe(204);
    }
    expect((await openUpload(host, 1_000)).status).toBe(201);
  });

  it('deletes a file once its retention is over', async () => {
    const base = QUICK_BASE;
    const host = await createParty('Nono', base);

    const mediaId = await uploadFile(host, testBytes(1_000), base);
    const url = `${base}/v1/parties/${host.partyId}/media/${mediaId}`;
    expect((await fetch(url, { headers: authorized(host) })).status).toBe(200);

    const deadline = Date.now() + 15_000;
    let status = 200;
    while (status === 200 && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 300));
      status = (await fetch(url, { headers: authorized(host) })).status;
    }
    expect(status).toBe(404);
  });

  it('creates a party with a well-formed code', async () => {
    const session = await createParty();
    expect(session.code).toMatch(/^[2-9A-HJKMNP-TV-Z]{6}$/);
  });

  it('shows both members online and tracks a departure', async () => {
    const host = await createParty('Hote');
    const guest = await joinParty(host.code, 'Invite');

    const hostSocket = new TestSocket(host);
    await hostSocket.welcome();
    const guestSocket = new TestSocket(guest);
    const welcome = await guestSocket.welcome();

    expect(welcome.memberId).toBe(guest.memberId);
    expect(welcome.code).toBe(host.code);
    await hostSocket.sawOnline(2);
    expect(hostSocket.latestMembers().map((member) => member.name)).toEqual(['Hote', 'Invite']);

    guestSocket.close();
    await hostSocket.sawOnline(1);
    expect(hostSocket.latestMembers().map((member) => member.name)).toEqual(['Hote', 'Invite']);
    hostSocket.close();
  });

  it('accepts a code typed in lowercase with a separator', async () => {
    const host = await createParty();
    const lowered = `${host.code.slice(0, 3)}-${host.code.slice(3)}`.toLowerCase();
    const guest = await joinParty(lowered, 'Invite');
    expect(guest.partyId).toBe(host.partyId);
  });

  it('rejects unknown codes, malformed codes and anyone not logged in', async () => {
    const { token } = await loginNew('Invite');
    expect((await post('/v1/join', { code: 'ZZZZZZ' }, bearer(token))).status).toBe(404);
    expect((await post('/v1/join', { code: 'O0I1LU' }, bearer(token))).status).toBe(400);

    const host = await createParty();
    const notLoggedIn = await post('/v1/join', { code: host.code });
    expect(notLoggedIn.status).toBe(401);
    expect(await notLoggedIn.json()).toEqual({ error: 'signed_out' });
    expect((await post('/v1/join', { code: host.code }, bearer('wrong'))).status).toBe(401);
    expect((await post('/v1/parties', {})).status).toBe(401);
  });

  it('limits repeated wrong codes from one address', async () => {
    const ip = uniqueIp();
    const { token } = await loginNew('Pirate');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await post('/v1/join', { code: 'ZZZZZZ' }, { 'cf-connecting-ip': ip, ...bearer(token) });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10).every((status) => status === 404)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it('refuses a bad token and an outdated client', async () => {
    const host = await createParty();
    const intruder = new TestSocket({ partyId: host.partyId, token: 'wrong' });
    expect(await intruder.closed()).toBe(CloseCode.Unauthorized);

    const outdated = new TestSocket(host, 'livechatsbcb.v0');
    expect(await outdated.closed()).toBe(CloseCode.UpdateRequired);
  });

  it('replaces an older connection of the same member', async () => {
    const host = await createParty();
    const first = new TestSocket(host);
    await first.welcome();
    const second = new TestSocket(host);
    await second.welcome();
    expect(await first.closed()).toBe(CloseCode.Replaced);
    await second.sawOnline(1);
    second.close();
  });

  it('refuses the eleventh online member, and an offline member can return once there is room', async () => {
    const host = await createParty();
    const sessions = [host];
    for (let index = 1; index < MAX_ONLINE_MEMBERS + 1; index++) {
      sessions.push(await joinParty(host.code, `Membre${index}`));
    }
    const eleventh = sessions.pop()!;

    const sockets = sessions.map((session) => new TestSocket(session));
    await Promise.all(sockets.map((socket) => socket.welcome()));
    await sockets[0]!.sawOnline(MAX_ONLINE_MEMBERS);

    const refused = new TestSocket(eleventh);
    expect(await refused.closed()).toBe(CloseCode.PartyFull);
    expect((await post('/v1/join', { code: host.code }, bearer((await loginNew('Douzieme')).token))).status).toBe(409);

    sockets[1]!.close();
    await sockets[0]!.sawOnline(MAX_ONLINE_MEMBERS - 1);
    const admitted = new TestSocket(eleventh);
    await admitted.welcome();

    admitted.close();
    for (const socket of sockets) socket.close();
  });

  it('rotates the code: the old one stops working and members are told', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();

    const response = await post(`/v1/parties/${host.partyId}/rotate-code`, {}, { authorization: `Bearer ${host.token}` });
    expect(response.status).toBe(200);
    const { code } = (await response.json()) as { code: string };
    expect(code).not.toBe(host.code);

    await socket.until(() => socket.messages.find((message) => message.t === 'code' && message.code === code), 'new code');
    expect((await post('/v1/join', { code: host.code }, bearer((await loginNew('Invite')).token))).status).toBe(404);
    expect((await joinParty(code, 'Invite')).partyId).toBe(host.partyId);
    socket.close();
  });

  it('refuses a code rotation without a valid token', async () => {
    const host = await createParty();
    const response = await post(`/v1/parties/${host.partyId}/rotate-code`, {}, { authorization: 'Bearer wrong' });
    expect(response.status).toBe(401);
  });

  it('removes a member who leaves and frees the code with the last one', async () => {
    const host = await createParty('Hote');
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    await hostSocket.welcome();
    const guestSocket = new TestSocket(guest);
    await guestSocket.welcome();

    const leave = (session: SessionResponse) =>
      post(`/v1/parties/${session.partyId}/leave`, {}, { authorization: `Bearer ${session.token}` });

    expect((await leave(guest)).status).toBe(204);
    expect(await guestSocket.closed()).toBe(CloseCode.Removed);
    await hostSocket.until(() => (hostSocket.latestMembers().length === 1 ? true : undefined), 'member removed');

    expect((await leave(host)).status).toBe(204);
    expect((await post('/v1/join', { code: host.code }, bearer((await loginNew('Invite')).token))).status).toBe(404);
  });

  it('serves the update manifest and the installer', async () => {
    const manifest = await fetch(`${BASE}/updates/latest.yml`);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get('cache-control')).toBe('no-store');
    expect(await manifest.text()).toContain('version: 9.9.9');

    const installer = await fetch(`${BASE}/updates/LiveChatSBCB-Setup-9.9.9.exe`);
    expect(installer.status).toBe(200);
    expect(await installer.text()).toBe('fake installer');
  });

  it('serves nothing else from the update storage', async () => {
    expect((await fetch(`${BASE}/updates/private.txt`)).status).toBe(404);
    expect((await fetch(`${BASE}/updates/`)).status).toBe(404);
    expect((await fetch(`${BASE}/updates/LiveChatSBCB-Setup-1.0.0.exe`)).status).toBe(404);
    expect((await fetch(`${BASE}/updates/..%2Fprivate.txt`)).status).toBe(404);
  });

  it('redirects the download link to the latest installer', async () => {
    const response = await fetch(`${BASE}/download`, { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(`${BASE}/updates/LiveChatSBCB-Setup-9.9.9.exe`);
  });

  it('answers keep-alive pings', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();
    socket.send('{"t":"ping"}');
    await socket.until(() => socket.messages.find((message) => message.t === 'pong'), 'pong');
    socket.close();
  });
});

class LobbySocket {
  readonly messages: LobbyMessage[] = [];
  closeCode: number | undefined;
  private readonly socket: WebSocket;

  constructor(guildId: string, token: string, base = QUICK_BASE, version = WS_SUBPROTOCOL) {
    this.socket = new WebSocket(`${base.replace('http', 'ws')}/v1/guilds/${guildId}/ws`, [
      version,
      `${WS_TOKEN_PREFIX}${token}`,
    ]);
    this.socket.addEventListener('message', (event) => {
      const message = LobbyMessageSchema.parse(JSON.parse(String(event.data)));
      this.messages.push(message);
      if (message.t === 'closing') this.closeCode = message.code;
    });
    this.socket.addEventListener('close', (event) => {
      this.closeCode ??= event.code;
    });
  }

  latest() {
    const latest = this.messages.findLast((message) => message.t === 'lobby');
    return latest?.t === 'lobby' ? latest : undefined;
  }

  channels() {
    return this.latest()?.categories.flatMap((category) => category.channels) ?? [];
  }

  async until<T>(check: () => T | undefined | false, label: string): Promise<T> {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const value = check();
      if (value) return value;
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(this.messages.at(-1))}`);
      await new Promise((done) => setTimeout(done, 50));
    }
  }

  closed() {
    return this.until(() => this.closeCode, 'close');
  }

  close() {
    this.socket.close();
  }
}

describe('logging in with Discord', () => {
  it('gives the app its own session, with the name and picture from Discord', async () => {
    const userId = discord.addUser('Nono');
    const { token, account } = await loginAs(userId);
    expect(account).toMatchObject({ id: userId, name: 'Nono' });
    expect(account.avatarUrl).toBe(`https://cdn.discordapp.com/avatars/${userId}/hash${userId}.png?size=128`);

    const me = await fetch(`${BASE}/v1/me`, { headers: bearer(token) });
    expect(me.status).toBe(200);
    expect(MeResponseSchema.parse(await me.json()).account.id).toBe(userId);
  });

  it('only lets a ticket be used once, and only by the app that started the login', async () => {
    const userId = discord.addUser('Nono');
    const verifier = newVerifier();
    const ticket = (await authorizeInBrowser(userId, verifier)).searchParams.get('ticket');
    expect((await post('/v1/auth/redeem', { ticket, verifier: newVerifier() })).status).toBe(401);
    // That wrong attempt burned it, even for the right app.
    expect((await post('/v1/auth/redeem', { ticket, verifier })).status).toBe(401);

    const other = newVerifier();
    const second = (await authorizeInBrowser(userId, other)).searchParams.get('ticket');
    expect((await post('/v1/auth/redeem', { ticket: second, verifier: other })).status).toBe(200);
    expect((await post('/v1/auth/redeem', { ticket: second, verifier: other })).status).toBe(401);
  });

  it('only goes back to this PC, on the port the app asked for', async () => {
    const back = await authorizeInBrowser(discord.addUser('Nono'), newVerifier());
    expect(back.origin).toBe('http://127.0.0.1:45678');
    expect(back.pathname).toBe('/auth');

    const challenge = challengeOf(newVerifier());
    expect((await post('/v1/auth/start', { challenge, port: 80 })).status).toBe(400);
    expect((await post('/v1/auth/start', { challenge, port: 'evil.example' })).status).toBe(400);
  });

  it('accepts what Discord sends back only once, and tells the app when someone declines', async () => {
    const started = await post('/v1/auth/start', { challenge: challengeOf(newVerifier()), port: 45_678 });
    const authorize = new URL(AuthStartResponseSchema.parse(await started.json()).url);
    const callback = (query: Record<string, string>) => {
      const url = new URL(authorize.searchParams.get('redirect_uri')!);
      url.search = new URLSearchParams(query).toString();
      return fetch(url, { redirect: 'manual' });
    };
    const state = authorize.searchParams.get('state')!;

    const declined = await callback({ error: 'access_denied', state });
    expect(new URL(declined.headers.get('location')!).searchParams.get('error')).toBe('denied');

    expect((await callback({ code: 'code-x', state })).status).toBe(400);
    expect((await callback({ code: 'code-x', state: 'made-up' })).status).toBe(400);
  });

  it('says so when Discord refuses the code', async () => {
    const started = await post('/v1/auth/start', { challenge: challengeOf(newVerifier()), port: 45_678 });
    const authorize = new URL(AuthStartResponseSchema.parse(await started.json()).url);
    const url = new URL(authorize.searchParams.get('redirect_uri')!);
    url.search = new URLSearchParams({ code: 'not-a-real-code', state: authorize.searchParams.get('state')! }).toString();
    const response = await fetch(url, { redirect: 'manual' });
    expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe('discord');
  });

  it('limits login attempts from one address', async () => {
    const ip = uniqueIp();
    const challenge = challengeOf(newVerifier());
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 31; attempt++) {
      statuses.push((await post('/v1/auth/start', { challenge, port: 45_678 }, { 'cf-connecting-ip': ip })).status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 200)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it('ends the session on logout', async () => {
    const { token } = await loginNew('Nono');
    expect((await post('/v1/auth/logout', {}, bearer(token))).status).toBe(204);
    expect((await fetch(`${BASE}/v1/me`, { headers: bearer(token) })).status).toBe(401);
  });

  it('refuses a made-up token', async () => {
    const response = await fetch(`${BASE}/v1/me`, { headers: bearer('made-up') });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'signed_out' });
  });

  it('serves the privacy page', async () => {
    const response = await fetch(`${BASE}/privacy`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
  });
});

describe('Discord servers and channels', () => {
  // Rebuilt for every test: a server, its owner, and a member holding the role that opens the app.
  let ownerId: string;
  let guildId: string;
  let roleId: string;
  let generalId: string;
  let friendId: string;

  const me = async (token: string) => {
    const response = await fetch(`${QUICK_BASE}/v1/me`, { headers: bearer(token) });
    expect(response.status).toBe(200);
    return MeResponseSchema.parse(await response.json());
  };

  const joinChannel = (token: string, channelId: string, guild = guildId) =>
    post(`/v1/guilds/${guild}/channels/${channelId}/join`, {}, bearer(token), QUICK_BASE);

  const enter = async (token: string, channelId: string): Promise<SessionResponse> => {
    const response = await joinChannel(token, channelId);
    expect(response.status).toBe(200);
    return SessionResponseSchema.parse(await response.json());
  };

  const partySocket = (session: SessionResponse) => new TestSocket(session, WS_SUBPROTOCOL, QUICK_BASE);

  beforeEach(() => {
    discord.down = false;
    ownerId = discord.addUser('Chef');
    guildId = discord.addGuild('Notre serveur', ownerId);
    roleId = discord.addRole(guildId, 'LiveChat');
    generalId = discord.addChannel(guildId, { name: 'general' });
    friendId = discord.addUser('Pote');
    discord.addMember(guildId, friendId, { roles: [roleId] });
  });

  it('lists a server only for its members, and says when the role is missing', async () => {
    const stranger = await loginNew('Inconnu', QUICK_BASE);
    await new Promise((done) => setTimeout(done, 1_100));
    expect((await me(stranger.token)).guilds.find(({ id }) => id === guildId)).toBeUndefined();

    const friend = await loginAs(friendId, QUICK_BASE);
    expect((await me(friend.token)).guilds.find(({ id }) => id === guildId)).toMatchObject({
      name: 'Notre serveur',
      locked: false,
      iconUrl: `https://cdn.discordapp.com/icons/${guildId}/icon${guildId}.png?size=64`,
    });

    const withoutRole = discord.addUser('SansRole');
    discord.addMember(guildId, withoutRole);
    const locked = await loginAs(withoutRole, QUICK_BASE);
    expect((await me(locked.token)).guilds.find(({ id }) => id === guildId)?.locked).toBe(true);

    const owner = await loginAs(ownerId, QUICK_BASE);
    expect((await me(owner.token)).guilds.find(({ id }) => id === guildId)?.locked).toBe(false);
  });

  it('needs no role on a server declared open', async () => {
    const openGuild = discord.addGuild('Ouvert', ownerId, FAKE_DISCORD.openGuildId);
    const channel = discord.addChannel(openGuild, { name: 'general' });
    const memberId = discord.addUser('Membre');
    discord.addMember(openGuild, memberId);
    await new Promise((done) => setTimeout(done, 1_100));

    const { token } = await loginAs(memberId, QUICK_BASE);
    expect((await me(token)).guilds.find(({ id }) => id === openGuild)?.locked).toBe(false);
    expect((await joinChannel(token, channel, openGuild)).status).toBe(200);
    discord.removeGuild(openGuild);
  });

  it('opens the party of a channel, under the name and picture of the server', async () => {
    discord.addMember(guildId, friendId, { roles: [roleId], nick: 'Le Pote', avatar: 'surnom' });
    const friend = await loginAs(friendId, QUICK_BASE);
    const session = await enter(friend.token, generalId);
    expect(session).toMatchObject({
      partyId: `c-${generalId}`,
      code: null,
      memberId: friendId,
      channel: { guildId, guildName: 'Notre serveur', channelId: generalId, channelName: 'general' },
    });

    const socket = partySocket(session);
    const welcome = await socket.welcome();
    expect(welcome.code).toBeNull();
    expect(welcome.members).toEqual([
      {
        id: friendId,
        name: 'Le Pote',
        online: true,
        avatarUrl: `https://cdn.discordapp.com/guilds/${guildId}/users/${friendId}/avatars/surnom.png?size=128`,
      },
    ]);
    socket.close();
  });

  it('puts two members of a channel in the same party, and media reaches them both', async () => {
    const owner = await loginAs(ownerId, QUICK_BASE);
    const friend = await loginAs(friendId, QUICK_BASE);
    const [forOwner, forFriend] = [await enter(owner.token, generalId), await enter(friend.token, generalId)];
    expect(forFriend.partyId).toBe(forOwner.partyId);

    const ownerSocket = partySocket(forOwner);
    const friendSocket = partySocket(forFriend);
    await ownerSocket.welcome();
    await friendSocket.welcome();
    await ownerSocket.sawOnline(2);

    const sent = await post(
      `/v1/parties/${forOwner.partyId}/media`,
      { caption: 'Salut', clipStartMs: 0, durationMs: 1_000, file: null },
      authorized(forOwner),
      QUICK_BASE,
    );
    expect(sent.status).toBe(201);
    const [playing] = await friendSocket.queueWhere((queue) => queue[0]?.startAt != null, 'start');
    expect(playing).toMatchObject({
      caption: 'Salut',
      senderName: 'Chef',
      senderAvatarUrl: `https://cdn.discordapp.com/avatars/${ownerId}/hash${ownerId}.png?size=128`,
    });
    ownerSocket.close();
    friendSocket.close();
  });

  it('shows only who is connected in a channel, not who came before', async () => {
    const owner = await loginAs(ownerId, QUICK_BASE);
    const friend = await loginAs(friendId, QUICK_BASE);
    const ownerSocket = partySocket(await enter(owner.token, generalId));
    const friendSocket = partySocket(await enter(friend.token, generalId));
    await ownerSocket.welcome();
    await friendSocket.welcome();
    await ownerSocket.sawOnline(2);

    friendSocket.close();
    await ownerSocket.until(() => (ownerSocket.latestMembers().length === 1 ? true : undefined), 'departure');
    expect(ownerSocket.latestMembers().map(({ id }) => id)).toEqual([ownerId]);
    ownerSocket.close();
  });

  it('opens again after everyone has left', async () => {
    const owner = await loginAs(ownerId, QUICK_BASE);
    const first = await enter(owner.token, generalId);
    const leaving = partySocket(first);
    await leaving.welcome();
    expect((await post(`/v1/parties/${first.partyId}/leave`, {}, authorized(first), QUICK_BASE)).status).toBe(204);
    expect(await leaving.closed()).toBe(CloseCode.Removed);

    const again = partySocket(await enter(owner.token, generalId));
    const welcome = await again.welcome();
    expect(welcome.members.map(({ id }) => id)).toEqual([ownerId]);
    again.close();
  });

  it('has no code to change in a channel', async () => {
    const owner = await loginAs(ownerId, QUICK_BASE);
    const session = await enter(owner.token, generalId);
    const response = await post(`/v1/parties/${session.partyId}/rotate-code`, {}, authorized(session), QUICK_BASE);
    expect(response.status).toBe(401);
  });

  it('refuses a channel to anyone without access', async () => {
    const hidden = discord.addChannel(guildId, { name: 'secret', permission_overwrites: [hiddenFromEveryone(guildId)] });
    const voiceOnly = discord.addChannel(guildId, { name: 'staff', permission_overwrites: [hiddenFromEveryone(guildId)] });
    const withoutRole = discord.addUser('SansRole');
    discord.addMember(guildId, withoutRole);
    const stranger = await loginNew('Inconnu', QUICK_BASE);
    const friend = await loginAs(friendId, QUICK_BASE);
    const locked = await loginAs(withoutRole, QUICK_BASE);

    expect((await joinChannel(stranger.token, generalId)).status).toBe(403);
    expect((await joinChannel(locked.token, generalId)).status).toBe(403);
    expect((await joinChannel(friend.token, hidden)).status).toBe(403);
    expect((await joinChannel(friend.token, voiceOnly)).status).toBe(403);
    // A channel that doesn't exist looks exactly like a hidden one.
    expect((await joinChannel(friend.token, discord.newId())).status).toBe(403);
    expect((await joinChannel('wrong', generalId)).status).toBe(401);

    // A channel of this server can't be reached through another server.
    const other = discord.addGuild('Autre', friendId);
    expect((await joinChannel(friend.token, generalId, other)).status).toBe(403);
    discord.removeGuild(other);

    const owner = await loginAs(ownerId, QUICK_BASE);
    expect((await joinChannel(owner.token, hidden)).status).toBe(200);
  });

  it('shows channels in order, and who is where to those allowed to know', async () => {
    const privateRole = discord.addRole(guildId, 'Secret');
    const category = discord.addChannel(guildId, { name: 'Jeux', type: 4, position: 1 });
    const voice = discord.addChannel(guildId, { name: 'vocal', type: 2, position: 0, parent_id: category });
    const text = discord.addChannel(guildId, { name: 'clips', position: 5, parent_id: category });
    const secret = discord.addChannel(guildId, {
      name: 'secret',
      parent_id: category,
      permission_overwrites: [hiddenFromEveryone(guildId), openedToRole(privateRole)],
    });
    const insiderId = discord.addUser('Initie');
    discord.addMember(guildId, insiderId, { roles: [roleId, privateRole] });

    const [friend, insider] = [await loginAs(friendId, QUICK_BASE), await loginAs(insiderId, QUICK_BASE)];
    const forFriend = new LobbySocket(guildId, friend.token);
    const forInsider = new LobbySocket(guildId, insider.token);
    await forInsider.until(() => forInsider.latest()?.online.length === 2, 'both on the server');
    await forFriend.until(() => forFriend.latest()?.online.length === 2, 'both on the server');

    expect(forFriend.latest()!.guild.name).toBe('Notre serveur');
    expect(forFriend.latest()!.categories.map(({ name, channels }) => [name, channels.map((channel) => channel.name)])).toEqual([
      ['', ['general']],
      ['Jeux', ['clips', 'vocal']],
    ]);
    expect(forInsider.channels().map(({ name }) => name)).toEqual(['general', 'secret', 'clips', 'vocal']);
    expect(forFriend.latest()!.online.map(({ id }) => id).sort()).toEqual([friendId, insiderId].sort());
    expect(forFriend.channels().find(({ id }) => id === voice)?.kind).toBe('voice');
    expect(forFriend.channels().find(({ id }) => id === text)?.kind).toBe('text');

    const inSecret = partySocket(await enter(insider.token, secret));
    await inSecret.welcome();
    const inGeneral = partySocket(await enter(friend.token, generalId));
    await inGeneral.welcome();

    await forInsider.until(
      () => forInsider.channels().find(({ id }) => id === secret)?.occupants[0]?.id === insiderId,
      'occupant of the secret channel',
    );
    await forInsider.until(
      () => forInsider.channels().find(({ id }) => id === generalId)?.occupants[0]?.id === friendId,
      'occupant of the general channel',
    );
    // The heart of it: someone outside a private channel must not learn who is inside.
    await forFriend.until(
      () => forFriend.channels().find(({ id }) => id === generalId)?.occupants[0]?.id === friendId,
      'occupant seen by the friend',
    );
    const seenByFriend = JSON.stringify(forFriend.messages.filter((message) => message.t === 'lobby'));
    expect(seenByFriend).not.toContain(secret);
    expect(seenByFriend).not.toContain('"secret"');

    inGeneral.close();
    await forInsider.until(
      () => forInsider.channels().find(({ id }) => id === generalId)?.occupants.length === 0,
      'departure seen',
    );
    inSecret.close();
    forFriend.close();
    await forInsider.until(() => forInsider.latest()?.online.length === 1, 'friend gone from the server');
    forInsider.close();
  });

  it('refuses the lobby to those without access, and to a client out of date', async () => {
    const withoutRole = discord.addUser('SansRole');
    discord.addMember(guildId, withoutRole);
    const locked = await loginAs(withoutRole, QUICK_BASE);
    const stranger = await loginNew('Inconnu', QUICK_BASE);
    const friend = await loginAs(friendId, QUICK_BASE);

    const sockets = [
      new LobbySocket(guildId, locked.token),
      new LobbySocket(guildId, stranger.token),
      new LobbySocket(guildId, 'wrong'),
      new LobbySocket(guildId, friend.token, QUICK_BASE, 'livechatsbcb.v0'),
    ];
    expect(await sockets[0]!.closed()).toBe(CloseCode.Removed);
    expect(await sockets[1]!.closed()).toBe(CloseCode.Removed);
    expect(await sockets[2]!.closed()).toBe(CloseCode.SignedOut);
    expect(await sockets[3]!.closed()).toBe(CloseCode.UpdateRequired);
  });

  it('notices a kick: out of the lobby and out of the party', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const lobby = new LobbySocket(guildId, friend.token);
    await lobby.until(() => lobby.latest(), 'lobby');
    const party = partySocket(await enter(friend.token, generalId));
    await party.welcome();

    discord.removeMember(guildId, friendId);

    expect(await lobby.closed()).toBe(CloseCode.Removed);
    expect(await party.closed()).toBe(CloseCode.Removed);
    expect((await joinChannel(friend.token, generalId)).status).toBe(403);
  });

  it('notices a lost role', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const party = partySocket(await enter(friend.token, generalId));
    await party.welcome();
    const lobby = new LobbySocket(guildId, friend.token);
    await lobby.until(() => lobby.latest(), 'lobby');

    discord.setRoles(guildId, friendId, []);

    expect(await party.closed()).toBe(CloseCode.Removed);
    expect(await lobby.closed()).toBe(CloseCode.Removed);
  });

  it('takes someone out of a channel closed to them, without closing the server to them', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const party = partySocket(await enter(friend.token, generalId));
    await party.welcome();
    const lobby = new LobbySocket(guildId, friend.token);
    await lobby.until(() => lobby.channels().length === 1, 'the channel');

    discord.setOverwrites(guildId, generalId, [hiddenFromEveryone(guildId)]);

    expect(await party.closed()).toBe(CloseCode.Removed);
    await lobby.until(() => lobby.channels().length === 0, 'the channel gone from the list');
    expect(lobby.closeCode).toBeUndefined();
    lobby.close();
  });

  it('shows a renamed channel without anyone asking', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const lobby = new LobbySocket(guildId, friend.token);
    await lobby.until(() => lobby.channels()[0]?.name === 'general', 'the channel');

    discord.renameChannel(guildId, generalId, 'renomme');

    await lobby.until(() => lobby.channels()[0]?.name === 'renomme', 'the new name');
    lobby.close();
  });

  it('refuses someone who lost access while away, when they come back', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const session = await enter(friend.token, generalId);

    discord.removeMember(guildId, friendId);
    await new Promise((done) => setTimeout(done, 1_100));

    const sent = await post(
      `/v1/parties/${session.partyId}/media`,
      { caption: 'Toujours la', clipStartMs: 0, durationMs: 1_000, file: null },
      authorized(session),
      QUICK_BASE,
    );
    expect(sent.status).toBe(401);
    const back = partySocket(session);
    expect(await back.closed()).toBe(CloseCode.Unauthorized);
  });

  it('keeps everyone in when Discord goes down, and only those it knows may enter', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const lobby = new LobbySocket(guildId, friend.token);
    await lobby.until(() => lobby.latest(), 'lobby');
    const party = partySocket(await enter(friend.token, generalId));
    await party.welcome();

    const newcomerId = discord.addUser('Nouveau');
    discord.addMember(guildId, newcomerId, { roles: [roleId] });
    const newcomer = await loginAs(newcomerId, QUICK_BASE);

    discord.down = true;
    await new Promise((done) => setTimeout(done, 2_500));
    expect(lobby.closeCode).toBeUndefined();
    expect(party.closeCode).toBeUndefined();

    // Known to the service: still allowed.
    expect((await joinChannel(friend.token, generalId)).status).toBe(200);
    const answered = await fetch(`${QUICK_BASE}/v1/me`, { headers: bearer(friend.token) });
    expect(answered.status).toBe(200);

    // Never seen on this server: nothing can be said about them yet.
    const refused = await joinChannel(newcomer.token, generalId);
    expect(refused.status).toBe(503);
    expect(await refused.json()).toEqual({ error: 'discord_unavailable' });

    discord.down = false;
    expect((await joinChannel(newcomer.token, generalId)).status).toBe(200);
    lobby.close();
  });

  it('sees a server go when the bot is removed from it', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const lobby = new LobbySocket(guildId, friend.token);
    await lobby.until(() => lobby.latest(), 'lobby');

    discord.removeGuild(guildId);

    expect(await lobby.closed()).toBe(CloseCode.Removed);
    await new Promise((done) => setTimeout(done, 1_100));
    expect((await me(friend.token)).guilds.find(({ id }) => id === guildId)).toBeUndefined();
  });

  it('says who is on a second PC: same account, same member, and the old connection steps aside', async () => {
    const [first, second] = [await loginAs(friendId, QUICK_BASE), await loginAs(friendId, QUICK_BASE)];
    const firstSocket = partySocket(await enter(first.token, generalId));
    await firstSocket.welcome();
    const secondSocket = partySocket(await enter(second.token, generalId));
    await secondSocket.welcome();

    expect(await firstSocket.closed()).toBe(CloseCode.Replaced);
    await secondSocket.sawOnline(1);
    expect(secondSocket.latestMembers().map(({ id }) => id)).toEqual([friendId]);
    secondSocket.close();
  });

  it('does not ask Discord again and again for the same thing', async () => {
    const friend = await loginAs(friendId);
    await post(`/v1/guilds/${guildId}/channels/${generalId}/join`, {}, bearer(friend.token));
    const before = discord.calls.length;
    for (let attempt = 0; attempt < 5; attempt++) {
      await post(`/v1/guilds/${guildId}/channels/${generalId}/join`, {}, bearer(friend.token));
    }
    expect(discord.calls.length).toBe(before);
  });
});
