import { describe, expect, it } from 'vitest';
import {
  CloseCode,
  MAX_MEDIA_BYTES,
  MAX_ONLINE_MEMBERS,
  MEDIA_PART_BYTES,
  ServerMessageSchema,
  SessionResponseSchema,
  WS_SUBPROTOCOL,
  WS_TOKEN_PREFIX,
  type QueueItem,
  type ServerMessage,
  type SessionResponse,
} from '@livechatsbcb/protocol';

const BASE = 'http://127.0.0.1:8799';
const WS_BASE = BASE.replace('http', 'ws');

let ipCounter = 0;
const uniqueIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': uniqueIp(), ...headers },
    body: JSON.stringify(body),
  });

const createParty = async (name = 'Nono'): Promise<SessionResponse> => {
  const response = await post('/v1/parties', { name });
  expect(response.status).toBe(201);
  return SessionResponseSchema.parse(await response.json());
};

const joinParty = async (code: string, name: string): Promise<SessionResponse> => {
  const response = await post('/v1/join', { code, name });
  expect(response.status).toBe(200);
  return SessionResponseSchema.parse(await response.json());
};

class TestSocket {
  readonly messages: ServerMessage[] = [];
  closeCode: number | undefined;
  private readonly socket: WebSocket;
  private waiters: Array<() => void> = [];

  constructor(session: Pick<SessionResponse, 'partyId' | 'token'>, version = WS_SUBPROTOCOL) {
    this.socket = new WebSocket(`${WS_BASE}/v1/parties/${session.partyId}/ws`, [
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
    const base = 'http://127.0.0.1:8798';
    const created = await fetch(`${base}/v1/parties`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nono' }),
    });
    const host = SessionResponseSchema.parse(await created.json());

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

  it('rejects unknown codes and invalid names', async () => {
    expect((await post('/v1/join', { code: 'ZZZZZZ', name: 'Invite' })).status).toBe(404);
    const host = await createParty();
    expect((await post('/v1/join', { code: host.code, name: '   ' })).status).toBe(400);
    expect((await post('/v1/join', { code: host.code, name: 'x'.repeat(25) })).status).toBe(400);
    expect((await post('/v1/join', { code: 'O0I1LU', name: 'Invite' })).status).toBe(400);
  });

  it('limits repeated wrong codes from one address', async () => {
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 11; attempt++) {
      const response = await post('/v1/join', { code: 'ZZZZZZ', name: 'Pirate' }, { 'cf-connecting-ip': ip });
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
    expect((await post('/v1/join', { code: host.code, name: 'Douzieme' })).status).toBe(409);

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
    expect((await post('/v1/join', { code: host.code, name: 'Invite' })).status).toBe(404);
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
    expect((await post('/v1/join', { code: host.code, name: 'Invite' })).status).toBe(404);
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
