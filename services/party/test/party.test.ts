import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AuthRedeemResponseSchema,
  AuthStartResponseSchema,
  CloseCode,
  MeResponseSchema,
  MAX_MEDIA_BYTES,
  MAX_ONLINE_MEMBERS,
  MEDIA_PART_BYTES,
  SPAM_BAN_MS,
  ServerMessageSchema,
  SessionResponseSchema,
  WS_SUBPROTOCOL,
  WS_APP_PREFIX,
  WS_TOKEN_PREFIX,
  type Account,
  type Game,
  type HistoryItem,
  type Member,
  type QueueItem,
  type ServerMessage,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { seal, sealingKey, unseal } from '../src/tokens';
import { FakeDiscord } from './fake-discord';

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
  expect(authorize.searchParams.get('scope')).toBe('identify guilds');

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

  constructor(session: Pick<SessionResponse, 'partyId' | 'token'>, version = WS_SUBPROTOCOL, base = BASE, app: string | null = null) {
    this.socket = new WebSocket(`${base.replace('http', 'ws')}/v1/parties/${session.partyId}/ws`, [
      version,
      ...(app ? [`${WS_APP_PREFIX}${app}`] : []),
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

  membersWhere(check: (members: Member[]) => boolean, label: string) {
    return this.until(() => {
      const latest = this.messages.findLast((message) => message.t === 'members' || message.t === 'welcome');
      const members = latest && 'members' in latest ? latest.members : [];
      return check(members) ? members : undefined;
    }, label);
  }

  latestHistory(): HistoryItem[] {
    const latest = this.messages.findLast((message) => message.t === 'history' || message.t === 'welcome');
    return latest && 'history' in latest ? latest.history : [];
  }

  historyWhere(check: (history: HistoryItem[]) => boolean, label: string) {
    return this.until(() => (check(this.latestHistory()) ? this.latestHistory() : undefined), label);
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

  gameWhere(check: (game: Game) => boolean, label: string) {
    return this.until(() => {
      const latest = this.messages.findLast((message) => message.t === 'game' || message.t === 'welcome');
      const game = latest && 'game' in latest ? latest.game : null;
      return game && check(game) ? game : undefined;
    }, label);
  }

  close() {
    this.socket.close();
  }
}

const authorized = (session: SessionResponse) => ({ authorization: `Bearer ${session.token}` });

const sendText = async (session: SessionResponse, caption: string, durationMs = 1_000) => {
  const response = await post(
    `/v1/parties/${session.partyId}/media`,
    { caption, clipStartMs: 0, durationMs, files: [] },
    authorized(session),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { mediaId: string }).mediaId;
};

const sendQuickText = async (session: SessionResponse) => {
  const response = await fetch(`${QUICK_BASE}/v1/parties/${session.partyId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorized(session) },
    body: JSON.stringify({ caption: 'Vite', clipStartMs: 0, durationMs: 1_000, files: [] }),
  });
  return ((await response.json()) as { mediaId: string }).mediaId;
};

const openUpload = (session: SessionResponse, size: number, contentType = 'video/mp4', base = BASE, name = 'clip.mp4') =>
  fetch(`${base}/v1/parties/${session.partyId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorized(session) },
    body: JSON.stringify({ caption: '', clipStartMs: 0, durationMs: 2_000, files: [{ contentType, size, name }] }),
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

// A whole party on the quick service, where games run twenty times faster.
const quickParty = async (names: string[]) => {
  const host = await createParty(names[0], QUICK_BASE);
  const sessions: SessionResponse[] = [host];
  for (const name of names.slice(1)) {
    const { token } = await loginNew(name, QUICK_BASE);
    const response = await post('/v1/join', { code: host.code }, bearer(token), QUICK_BASE);
    expect(response.status).toBe(200);
    sessions.push(SessionResponseSchema.parse(await response.json()));
  }
  const sockets = sessions.map((session) => new TestSocket(session, WS_SUBPROTOCOL, QUICK_BASE));
  for (const socket of sockets) await socket.welcome();
  await sockets[0]!.sawOnline(names.length);
  return { sessions, sockets };
};

const sendForGame = (session: SessionResponse, gameId: string, caption: string, files: unknown[] = []) =>
  fetch(`${QUICK_BASE}/v1/parties/${session.partyId}/media`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorized(session) },
    body: JSON.stringify({ caption, clipStartMs: 0, durationMs: 2_000, files, game: gameId }),
  });

const uploadForGame = async (session: SessionResponse, gameId: string, bytes: Uint8Array): Promise<string> => {
  const opened = await sendForGame(session, gameId, '', [{ contentType: 'image/png', size: bytes.length, name: 'blague.png' }]);
  expect(opened.status).toBe(201);
  const { mediaId } = (await opened.json()) as { mediaId: string };
  const part = await fetch(`${QUICK_BASE}/v1/parties/${session.partyId}/media/${mediaId}/parts/1`, {
    method: 'PUT',
    headers: authorized(session),
    body: bytes,
  });
  const completed = await fetch(`${QUICK_BASE}/v1/parties/${session.partyId}/media/${mediaId}/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authorized(session) },
    body: JSON.stringify({ parts: [await part.json()] }),
  });
  expect(completed.status).toBe(204);
  return mediaId;
};

// Opens a lobby, everyone joins, and the opener launches it.
const startGame = async (sockets: TestSocket[], kind: string) => {
  const [chef, ...others] = sockets as [TestSocket, ...TestSocket[]];
  chef.send(JSON.stringify({ t: 'game-start', kind }));
  const lobby = await chef.gameWhere((game) => game.phase === 'lobby', 'lobby');
  for (const socket of others) socket.send(JSON.stringify({ t: 'game-join', gameId: lobby.id }));
  await chef.gameWhere((game) => game.players.length === sockets.length, 'joined');
  chef.send(JSON.stringify({ t: 'game-launch', gameId: lobby.id }));
  return lobby;
};

describe('party games', () => {
  it('opens a lobby: players click to join, the opener launches, and only they can', async () => {
    const { sessions, sockets } = await quickParty(['Nono', 'Lulu', 'Momo', 'Zaza']);
    const [a, b, c, d] = sockets as [TestSocket, TestSocket, TestSocket, TestSocket];
    a.send(JSON.stringify({ t: 'game-start', kind: 'who' }));
    const lobby = await b.gameWhere((game) => game.phase === 'lobby', 'lobby');
    expect(lobby).toMatchObject({ kind: 'who', chefId: sessions[0]!.memberId, players: [sessions[0]!.memberId] });

    b.send(JSON.stringify({ t: 'game-join', gameId: lobby.id }));
    c.send(JSON.stringify({ t: 'game-join', gameId: lobby.id }));
    await a.gameWhere((game) => game.players.length === 3, 'three in');
    // Only the opener launches.
    b.send(JSON.stringify({ t: 'game-launch', gameId: lobby.id }));
    b.send(JSON.stringify({ t: 'game-ready', gameId: lobby.id, ready: true }));
    const readyOne = await a.gameWhere((game) => game.ready.length === 1, 'one ready');
    expect(readyOne.phase).toBe('lobby');

    // The opener leaves: the first joiner runs it now.
    a.send(JSON.stringify({ t: 'game-leave', gameId: lobby.id }));
    const handed = await b.gameWhere((game) => game.chefId === sessions[1]!.memberId, 'new chef');
    expect(handed.players).toEqual([sessions[1]!.memberId, sessions[2]!.memberId]);
    a.send(JSON.stringify({ t: 'game-join', gameId: lobby.id }));
    b.send(JSON.stringify({ t: 'game-launch', gameId: lobby.id }));
    const started = await c.gameWhere((game) => game.phase === 'collect', 'start');
    expect(started.id).toBe(lobby.id);
    expect(started.players).toHaveLength(3);

    // Someone late waits for the next round.
    d.send(JSON.stringify({ t: 'game-join', gameId: lobby.id }));
    const late = await a.gameWhere((game) => game.waiting.length === 1, 'waiting');
    expect(late.waiting).toEqual([sessions[3]!.memberId]);
    expect(late.players).not.toContain(sessions[3]!.memberId);

    // Reactions float to everyone, but not too fast.
    c.send(JSON.stringify({ t: 'game-react', gameId: lobby.id, emoji: '😂' }));
    c.send(JSON.stringify({ t: 'game-react', gameId: lobby.id, emoji: '🔥' }));
    await d.until(() => d.messages.find((message) => message.t === 'game-react'), 'reaction');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(d.messages.filter((message) => message.t === 'game-react')).toEqual([
      { t: 'game-react', memberId: sessions[2]!.memberId, emoji: '😂' },
    ]);

    // Revanche: the same lobby again, with whoever waited.
    b.send(JSON.stringify({ t: 'game-stop', gameId: lobby.id }));
    await a.gameWhere((game) => game.phase === 'done', 'done');
    c.send(JSON.stringify({ t: 'game-rematch', gameId: lobby.id }));
    const again = await a.gameWhere((game) => game.phase === 'lobby', 'rematch');
    expect(again.id).not.toBe(lobby.id);
    expect(again.players).toHaveLength(4);
    expect(again.chefId).toBe(sessions[1]!.memberId);
    expect(again.ready).toEqual([sessions[2]!.memberId]);
    for (const socket of sockets) socket.close();
  });

  it('starts by itself once everyone is ready, and closes when everybody leaves', async () => {
    const { sockets } = await quickParty(['Nono', 'Lulu']);
    const [a, b] = sockets as [TestSocket, TestSocket];
    a.send(JSON.stringify({ t: 'game-start', kind: 'joke' }));
    const lobby = await b.gameWhere((game) => game.phase === 'lobby', 'lobby');
    b.send(JSON.stringify({ t: 'game-join', gameId: lobby.id }));
    for (const socket of sockets) socket.send(JSON.stringify({ t: 'game-ready', gameId: lobby.id, ready: true }));
    await a.gameWhere((game) => game.phase === 'collect', 'auto start');

    a.send(JSON.stringify({ t: 'game-stop', gameId: lobby.id }));
    await a.gameWhere((game) => game.phase === 'done', 'done');
    a.send(JSON.stringify({ t: 'game-rematch', gameId: lobby.id }));
    const again = await b.gameWhere((game) => game.phase === 'lobby', 'rematch');
    for (const socket of sockets) socket.send(JSON.stringify({ t: 'game-leave', gameId: again.id }));
    await b.until(() => {
      const latest = b.messages.findLast((message) => message.t === 'game');
      return latest && 'game' in latest && latest.game === null ? true : undefined;
    }, 'closed');
    for (const socket of sockets) socket.close();
  });

  it('guesses who sent each LiveChat: nobody is named before the reveal, and points go both ways', async () => {
    const { sessions, sockets } = await quickParty(['Nono', 'Lulu', 'Momo']);
    const [a, b, c] = sockets as [TestSocket, TestSocket, TestSocket];
    await startGame(sockets, 'who');
    const started = await b.gameWhere((game) => game.phase === 'collect', 'start');
    expect(started).toMatchObject({ kind: 'who', starterName: 'Nono' });
    expect([...started.players].sort()).toEqual(sessions.map(({ memberId }) => memberId).sort());

    // Something sent for a game never reaches the queue.
    for (const [index, session] of sessions.entries()) {
      expect((await sendForGame(session, started.id, `meme ${index}`)).status).toBe(201);
    }
    expect((await sendForGame(sessions[0]!, started.id, 'encore un')).status).toBe(409);
    const voting = await a.gameWhere((game) => game.phase === 'vote', 'vote');
    expect(a.latestQueue()).toEqual([]);
    expect(voting.entries).toHaveLength(1);
    expect(voting.entries[0]!.ownerId).toBeNull();
    const owner = sessions[Number(voting.entries[0]!.caption.slice(-1))]!.memberId;
    const voters = sessions.filter(({ memberId }) => memberId !== owner);
    // One finds it, the other doesn't: one point each, and one for the sender.
    voters.forEach((session, index) => {
      const choice = index === 0 ? owner : sessions.find(({ memberId }) => memberId !== owner && memberId !== session.memberId)!.memberId;
      sockets[sessions.indexOf(session)]!.send(JSON.stringify({ t: 'game-vote', gameId: started.id, choice }));
    });
    const reveal = await c.gameWhere((game) => game.phase === 'reveal', 'reveal');
    expect(reveal.answer).toBe(owner);
    expect(reveal.entries[0]).toMatchObject({ ownerId: owner, votes: 1 });
    expect(reveal.scores[owner]).toBe(1);
    expect(reveal.scores[voters[0]!.memberId]).toBe(1);

    a.send(JSON.stringify({ t: 'game-stop', gameId: started.id }));
    await c.gameWhere((game) => game.phase === 'done' && game.reason === 'stopped', 'stop');
    for (const socket of sockets) socket.close();
  });

  it('gives each player a picture someone else sent, to joke about, then counts the votes', async () => {
    const { sessions, sockets } = await quickParty(['Nono', 'Lulu']);
    const [a, b] = sockets as [TestSocket, TestSocket];
    await startGame(sockets, 'joke');
    const started = await b.gameWhere((game) => game.phase === 'collect', 'start');
    expect(started.kind).toBe('joke');

    // Only pictures.
    expect((await sendForGame(sessions[0]!, started.id, 'du texte')).status).toBe(409);
    const pictures = [await uploadForGame(sessions[0]!, started.id, testBytes(64)), await uploadForGame(sessions[1]!, started.id, testBytes(80))];
    await a.gameWhere((game) => game.mySent === 1, 'sent');

    const writing = await a.gameWhere((game) => game.phase === 'write', 'write');
    expect(writing.myPicture[0]!.id).toBe(pictures[1]);
    for (const [index, socket] of sockets.entries()) {
      socket.send(JSON.stringify({ t: 'game-say', gameId: started.id, text: `blague ${index}` }));
    }
    const voting = await b.gameWhere((game) => game.phase === 'vote', 'vote');
    expect(voting.entries.map(({ ownerId }) => ownerId)).toEqual([null, null]);
    a.send(JSON.stringify({ t: 'game-vote', gameId: started.id, choice: sessions[0]!.memberId }));
    a.send(JSON.stringify({ t: 'game-vote', gameId: started.id, choice: sessions[1]!.memberId }));
    b.send(JSON.stringify({ t: 'game-vote', gameId: started.id, choice: sessions[0]!.memberId }));
    const reveal = await a.gameWhere((game) => game.phase === 'reveal', 'reveal');
    expect(reveal.scores).toEqual({ [sessions[0]!.memberId]: 1, [sessions[1]!.memberId]: 1 });
    const done = await b.gameWhere((game) => game.phase === 'done', 'ranking');
    expect(done.reason).toBeNull();
    for (const socket of sockets) socket.close();
  });

  it('hides an impostor with another picture, and needs three to start', async () => {
    const { sessions, sockets } = await quickParty(['Nono', 'Lulu', 'Momo']);
    const [a] = sockets as [TestSocket];
    await startGame(sockets, 'undercover');
    const started = await a.gameWhere((game) => game.phase === 'collect', 'start');
    const pictures = [];
    for (const [index, session] of sessions.entries()) pictures.push(await uploadForGame(session, started.id, testBytes(50 + index)));
    const views = await Promise.all(sockets.map((socket) => socket.gameWhere((game) => game.phase === 'write', 'write')));
    const seen = views.map(({ myPicture }) => myPicture[0]!.id);
    const odd = seen.find((id) => seen.filter((other) => other === id).length === 1)!;
    const impostor = sessions[seen.indexOf(odd)]!.memberId;
    for (const [index, socket] of sockets.entries()) socket.send(JSON.stringify({ t: 'game-say', gameId: started.id, text: `mot ${index}` }));
    await a.gameWhere((game) => game.phase === 'vote', 'vote');
    for (const [index, socket] of sockets.entries()) {
      const me = sessions[index]!.memberId;
      const choice = me === impostor ? sessions.find(({ memberId }) => memberId !== me)!.memberId : impostor;
      socket.send(JSON.stringify({ t: 'game-vote', gameId: started.id, choice }));
    }
    const reveal = await a.gameWhere((game) => game.phase === 'reveal', 'reveal');
    expect(reveal.answer).toBe(impostor);
    expect(reveal.scores[impostor]).toBe(0);
    expect(Object.values(reveal.scores).reduce((sum, value) => sum + value, 0)).toBe(2);
    a.send(JSON.stringify({ t: 'game-stop', gameId: started.id }));
    for (const socket of sockets) socket.close();
  });
});

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

  it('bans whoever sends the same thing 5 times in a minute, and only them, and only from sending', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const socket = new TestSocket(guest);
    await socket.welcome();

    const text = (session: SessionResponse, caption: string) =>
      post(`/v1/parties/${session.partyId}/media`, { caption, clipStartMs: 0, durationMs: 1_000, files: [] }, authorized(session));

    for (let send = 0; send < 4; send++) expect((await text(host, 'Encore')).status).toBe(201);
    // Something else isn't spam.
    expect((await text(host, 'Autre chose')).status).toBe(201);

    const refused = await text(host, 'Encore');
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ error: 'banned' });

    const members = await socket.membersWhere((list) => list.some(({ bannedUntil }) => bannedUntil !== null), 'the ban');
    const banned = members.find(({ id }) => id === host.memberId)!;
    expect(banned.bannedUntil! - Date.now()).toBeGreaterThan(SPAM_BAN_MS - 60_000);
    expect(banned.bannedUntil! - Date.now()).toBeLessThanOrEqual(SPAM_BAN_MS);
    expect(members.find(({ id }) => id === guest.memberId)!.bannedUntil).toBeNull();

    expect((await text(host, 'Plus rien')).status).toBe(403);
    expect((await openUpload(host, 1_000)).status).toBe(403);
    expect((await text(guest, 'Encore')).status).toBe(201);
    socket.close();
  });

  it('says which text is to be read aloud, and nothing else is', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();

    await sendText(host, 'Sans voix', 60_000);
    const response = await post(`/v1/parties/${host.partyId}/media`, { caption: 'Avec voix', clipStartMs: 0, durationMs: 1_000, speak: true, files: [] }, authorized(host));
    expect(response.status).toBe(201);
    const queue = await socket.queueWhere((items) => items.length === 2, 'both');
    expect(queue.map(({ speak }) => speak)).toEqual([false, true]);
    socket.close();
  });

  it('carries a link to a site with no file, leaves its player time to load, and refuses a made-up one', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();

    const link = { site: 'youtube', id: 'jNQXAC9IVRw', title: 'Me at the zoo', volume: 40 };
    const sent = await post(`/v1/parties/${host.partyId}/media`, { caption: '', clipStartMs: 3_000, durationMs: 5_000, link, files: [] }, authorized(host));
    expect(sent.status).toBe(201);
    const before = Date.now();
    const [item] = await socket.queueWhere((queue) => queue[0]?.startAt != null, 'link start');
    expect(item).toMatchObject({ kind: 'video', link, files: [], clipStartMs: 3_000, durationMs: 5_000 });
    expect(item!.startAt!).toBeGreaterThan(before + 3_000);

    const bad = [
      { site: 'youtube', id: '../../evil', title: 'x' },
      { site: 'tiktok', id: 'abc', title: 'x' },
      { site: 'instagram', id: '123', title: 'x' },
    ];
    for (const made of bad) {
      const refused = await post(`/v1/parties/${host.partyId}/media`, { caption: '', clipStartMs: 0, durationMs: 5_000, link: made, files: [] }, authorized(host));
      expect(refused.status).toBe(400);
    }
    const withFile = await post(
      `/v1/parties/${host.partyId}/media`,
      { caption: '', clipStartMs: 0, durationMs: 5_000, link, files: [{ contentType: 'image/png', size: 10, name: 'a.png' }] },
      authorized(host),
    );
    expect(withFile.status).toBe(400);

    // Placed like a picture in the advanced mode, with pictures around it, and nothing else that plays.
    const place = { x: 50, y: 50, width: 40, aspect: 16 / 9, rotation: 0, flip: false, grayscale: false, blur: 0, spinRpm: 0, enter: 'none', exit: 'none' };
    const image = { contentType: 'image/png', size: 10, name: 'a.png' };
    const video = { contentType: 'video/mp4', size: 30, name: 'clip.mp4' };
    const placed = (files: unknown[], scene: unknown[], withLink = true) =>
      post(`/v1/parties/${host.partyId}/media`, { caption: '', clipStartMs: 0, durationMs: 5_000, link: withLink ? link : null, files, scene }, authorized(host));
    expect((await placed([image], [{ ...place, file: 0 }, { ...place, file: 0, link: true }])).status).toBe(201);
    expect((await placed([], [{ ...place, file: 0, link: true }])).status).toBe(201);
    expect((await placed([image], [{ ...place, file: 0 }])).status).toBe(400);
    expect((await placed([image], [{ ...place, file: 0 }, { ...place, file: 0, link: true }], false)).status).toBe(400);
    expect((await placed([video], [{ ...place, file: 0, clipMs: 1_000 }, { ...place, file: 0, link: true }])).status).toBe(400);
    expect((await placed([], [{ ...place, file: 0, link: true }, { ...place, file: 0, link: true }])).status).toBe(400);
    socket.close();
  });

  it('moves on once everyone online has cut it, and not before', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();

    const first = await sendText(host, 'Trop long', 60_000);
    const second = await sendText(host, 'La suite', 1_000);
    await hostSocket.queueWhere((queue) => queue[0]?.startAt != null && queue.length === 2, 'the first playing');

    hostSocket.send(JSON.stringify({ t: 'cut', mediaId: first }));
    await new Promise((done) => setTimeout(done, 200));
    expect(hostSocket.latestQueue()[0]).toMatchObject({ id: first });

    guestSocket.send(JSON.stringify({ t: 'cut', mediaId: first }));
    const after = await hostSocket.queueWhere((queue) => queue[0]?.id === second, 'the next one');
    expect(after.some(({ id }) => id === first)).toBe(false);
    hostSocket.close();
    guestSocket.close();
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

  it('takes a picture and a sound as one media, announced with its last file', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const guestSocket = new TestSocket(guest);
    await guestSocket.welcome();
    const media = `${BASE}/v1/parties/${host.partyId}/media`;
    const headers = { 'content-type': 'application/json', ...authorized(host) };
    const create = (files: { contentType: string; size: number; name: string }[]) =>
      fetch(media, { method: 'POST', headers, body: JSON.stringify({ caption: 'Ligne 1\nLigne 2', clipStartMs: 500, durationMs: 2_000, files }) });

    const picture = { contentType: 'image/png', size: 10, name: 'image.png' };
    const sound = { contentType: 'audio/mpeg', size: 20, name: 'son.mp3' };
    expect((await create([picture, picture])).status).toBe(400);
    expect((await create([picture, sound, sound])).status).toBe(400);
    expect((await create([{ ...picture, size: MAX_MEDIA_BYTES }, { ...sound, size: 1 }])).status).toBe(400);

    const created = await create([picture, sound]);
    expect(created.status).toBe(201);
    const { mediaId, fileIds } = (await created.json()) as { mediaId: string; fileIds: string[] };
    expect(fileIds).toHaveLength(2);
    expect(fileIds[0]).toBe(mediaId);

    const finish = async (fileId: string, size: number) => {
      const part = await fetch(`${media}/${fileId}/parts/1`, { method: 'PUT', headers: authorized(host), body: testBytes(size) });
      expect(part.status).toBe(200);
      const done = await fetch(`${media}/${fileId}/complete`, { method: 'POST', headers, body: JSON.stringify({ parts: [await part.json()] }) });
      expect(done.status).toBe(204);
    };

    await finish(fileIds[0]!, 10);
    await new Promise((done) => setTimeout(done, 200));
    expect(guestSocket.latestQueue()).toEqual([]);

    await finish(fileIds[1]!, 20);
    const [item] = await guestSocket.queueWhere((queue) => queue.length === 1, 'the whole media');
    expect(item).toMatchObject({
      id: mediaId,
      kind: 'image',
      caption: 'Ligne 1\nLigne 2',
      clipStartMs: 500,
      files: [
        { id: fileIds[0], name: 'image.png', contentType: 'image/png', size: 10 },
        { id: fileIds[1], name: 'son.mp3', contentType: 'audio/mpeg', size: 20 },
      ],
    });
    for (const fileId of fileIds) {
      expect((await fetch(`${media}/${fileId}`, { headers: authorized(guest) })).status).toBe(200);
    }
    guestSocket.close();
  });

  it('carries a scene of the advanced mode, and refuses one that breaks its limits', async () => {
    const host = await createParty();
    const layer = {
      file: 0,
      x: 30,
      y: 40,
      width: 25,
      aspect: 1.5,
      rotation: 15,
      flip: false,
      grayscale: true,
      blur: 0,
      spinRpm: 10,
      enter: 'pop',
      exit: 'fade',
    };
    const image = (name: string) => ({ contentType: 'image/png', size: 10, name });
    const sound = { contentType: 'audio/mpeg', size: 20, name: 'son.mp3' };
    const video = { contentType: 'video/mp4', size: 30, name: 'clip.mp4' };
    const send = (files: unknown[], scene: unknown, textPlace: unknown = undefined) =>
      post(`/v1/parties/${host.partyId}/media`, { caption: '', clipStartMs: 0, durationMs: 2_000, files, scene, textPlace }, authorized(host));

    // Without a scene, it stays one to look at and one to listen to.
    expect((await send([image('a.png'), image('b.png')], null)).status).toBe(400);
    // A layer points at a file that isn't there, at a sound, or a picture is sent for nothing.
    expect((await send([image('a.png')], [{ ...layer, file: 1 }])).status).toBe(400);
    expect((await send([sound], [layer])).status).toBe(400);
    expect((await send([image('a.png'), image('b.png')], [layer])).status).toBe(400);
    // Beyond what was promised to hold up on a PC that is playing.
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((name) => image(`${name}.png`));
    expect((await send(six, six.map((_, file) => ({ ...layer, file })))).status).toBe(400);
    const four = [video, video, video, video];
    expect((await send(four, four.map((_, file) => ({ ...layer, file })))).status).toBe(400);
    const three = [video, video, video];
    expect((await send(three, three.map((_, file) => ({ ...layer, file, clipStartMs: file * 1_000, clipMs: 1_000, muted: file > 0 })))).status).toBe(201);
    expect((await send([image('a.png')], [{ ...layer, blur: 1 }, { ...layer, blur: 1 }])).status).toBe(400);
    expect((await send([image('a.png')], [{ ...layer, width: 1_000 }])).status).toBe(400);

    // The same file twice is one file, and all of it fits.
    const files = [image('a.png'), image('b.png'), image('c.png'), image('d.png'), image('e.png'), video, sound];
    const scene = [
      ...[0, 1, 2, 3, 4, 5].map((file) => ({ ...layer, file })),
    ];
    const accepted = await send(files, scene);
    expect(accepted.status).toBe(201);
    const { fileIds } = (await accepted.json()) as { fileIds: string[] };
    expect(fileIds).toHaveLength(7);

    // The text moved too far, or too small.
    expect((await send([image('a.png')], [layer], { x: 10, y: 70, width: 2 })).status).toBe(400);
    const twice = await send([image('a.png')], [layer, { ...layer, flip: true, x: 70 }], { x: 10, y: 70, width: 50 });
    expect(twice.status).toBe(201);
    const { mediaId } = (await twice.json()) as { mediaId: string };
    const socket = new TestSocket(host);
    await socket.welcome();
    const part = await fetch(`${BASE}/v1/parties/${host.partyId}/media/${mediaId}/parts/1`, {
      method: 'PUT',
      headers: authorized(host),
      body: testBytes(10),
    });
    await fetch(`${BASE}/v1/parties/${host.partyId}/media/${mediaId}/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authorized(host) },
      body: JSON.stringify({ parts: [await part.json()] }),
    });
    const [item] = await socket.queueWhere((queue) => queue.length === 1, 'the scene');
    expect(item!.scene).toEqual([{ ...layer, muted: false }, { ...layer, flip: true, x: 70, muted: false }]);
    // Where the text was moved to comes along.
    expect(item!.textPlace).toEqual({ x: 10, y: 70, width: 50 });
    socket.close();
  });

  it('gives up on the whole media when asked to, whichever files were already sent', async () => {
    const host = await createParty();
    const media = `${BASE}/v1/parties/${host.partyId}/media`;
    const headers = { 'content-type': 'application/json', ...authorized(host) };
    const created = await fetch(media, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        caption: '',
        clipStartMs: 0,
        durationMs: 2_000,
        files: [
          { contentType: 'image/png', size: 10, name: 'image.png' },
          { contentType: 'audio/mpeg', size: 20, name: 'son.mp3' },
        ],
      }),
    });
    const { mediaId, fileIds } = (await created.json()) as { mediaId: string; fileIds: string[] };
    const part = await fetch(`${media}/${mediaId}/parts/1`, { method: 'PUT', headers: authorized(host), body: testBytes(10) });
    await fetch(`${media}/${mediaId}/complete`, { method: 'POST', headers, body: JSON.stringify({ parts: [await part.json()] }) });

    expect((await fetch(`${media}/${mediaId}`, { method: 'DELETE', headers: authorized(host) })).status).toBe(204);
    expect((await fetch(`${media}/${fileIds[1]}/parts/1`, { method: 'PUT', headers: authorized(host), body: testBytes(20) })).status).toBe(404);
    expect((await fetch(`${media}/${mediaId}`, { method: 'DELETE', headers: authorized(host) })).status).toBe(404);
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
    expect(waiting[0]).toMatchObject({ id: mediaId, kind: 'video', files: [{ id: mediaId, contentType: 'video/mp4', size: bytes.length }], startAt: null });

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
      body: JSON.stringify({ caption: 'intrus', clipStartMs: 0, durationMs: 2_000, files: [] }),
    });
    expect(foreign.status).toBe(401);

    const noAuth = await fetch(`${BASE}/v1/parties/${host.partyId}/media`, {
      method: 'POST',
      body: JSON.stringify({ caption: '', clipStartMs: 0, durationMs: 2_000, files: [{ contentType: 'video/mp4', size: 10, name: 'clip.mp4' }] }),
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

    expect((await post(`/v1/parties/${host.partyId}/media`, { caption: '  ', clipStartMs: 0, durationMs: 2_000, files: [] }, authorized(host))).status).toBe(400);
    expect((await post(`/v1/parties/${host.partyId}/media`, { caption: 'trop long', clipStartMs: 0, durationMs: 61_000, files: [] }, authorized(host))).status).toBe(400);
  });

  it('refuses uploads past the storage cap, and frees the space when one is cancelled', async () => {
    const host = await createParty();
    const opened: string[] = [];
    let refused: Response | null = null;

    for (let attempt = 0; attempt < 20 && !refused; attempt++) {
      const response = await openUpload(host, MAX_MEDIA_BYTES, 'video/mp4', BASE, `clip-${attempt}.mp4`);
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

  const replay = (session: SessionResponse, historyId: string, base = BASE) =>
    fetch(`${base}/v1/parties/${session.partyId}/history/${historyId}/replay`, {
      method: 'POST',
      headers: authorized(session),
    });

  it('remembers what really played, newest first, with the name of the file', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();
    expect(socket.latestHistory()).toEqual([]);

    await sendText(host, 'Bonjour');
    const [text] = await socket.historyWhere((history) => history.length === 1, 'the text in the history');
    expect(text).toMatchObject({ kind: 'text', caption: 'Bonjour', files: [], senderName: 'Nono' });

    const mediaId = await uploadFile(host, testBytes(1_000));
    await socket.queueWhere((queue) => queue.some((item) => item.id === mediaId), 'the file in the queue');
    socket.send(JSON.stringify({ t: 'ready', mediaId }));
    const history = await socket.historyWhere((list) => list.length === 2, 'the file in the history');
    expect(history[0]).toMatchObject({ id: mediaId, files: [{ id: mediaId, name: 'clip.mp4' }], kind: 'video' });
    expect(history[1]!.caption).toBe('Bonjour');

    // Someone arriving later finds it too.
    const later = new TestSocket(host);
    await later.welcome();
    expect(later.latestHistory().map((item) => item.id)).toEqual(history.map((item) => item.id));
    socket.close();
    later.close();
  });

  it('forgets what was skipped before it ever started', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();

    const mediaId = await uploadFile(host, testBytes(1_000));
    await socket.queueWhere((queue) => queue[0]?.id === mediaId, 'the file in the queue');
    socket.send(JSON.stringify({ t: 'skip', mediaId }));
    await socket.queueWhere((queue) => queue.length === 0, 'an empty queue');

    await sendText(host, 'Suite');
    const history = await socket.historyWhere((list) => list.length > 0, 'the history');
    expect(history.map((item) => item.caption)).toEqual(['Suite']);
    socket.close();
  });

  it('plays something again for everyone, from the same file, under the name of whoever asked', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const stranger = await createParty('Inconnu');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();

    const bytes = testBytes(2_000);
    const mediaId = await uploadFile(host, bytes);
    await guestSocket.queueWhere((queue) => queue[0]?.id === mediaId, 'the file in the queue');
    for (const socket of [hostSocket, guestSocket]) socket.send(JSON.stringify({ t: 'ready', mediaId }));
    const [original] = await guestSocket.historyWhere((list) => list.length === 1, 'the file in the history');
    await guestSocket.queueWhere((queue) => queue.length === 0, 'the end of the file');

    expect((await replay({ ...stranger, partyId: host.partyId }, original!.id)).status).toBe(401);
    expect((await replay(guest, crypto.randomUUID())).status).toBe(404);

    expect((await replay(guest, original!.id)).status).toBe(204);
    const [again] = await hostSocket.queueWhere((queue) => queue.length === 1, 'the replay in the queue');
    expect(again).toMatchObject({ files: [{ id: mediaId }], replay: true, senderName: 'Invite', expiresAt: original!.expiresAt });
    expect(again!.id).not.toBe(mediaId);

    // It waits for everyone to have the file, like the first time, and the file is the one already there.
    const download = await fetch(`${BASE}/v1/parties/${host.partyId}/media/${again!.files[0]!.id}`, { headers: authorized(guest) });
    expect(Buffer.from(await download.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);
    for (const socket of [hostSocket, guestSocket]) socket.send(JSON.stringify({ t: 'ready', mediaId: again!.id }));
    await guestSocket.queueWhere((queue) => queue[0]?.startAt != null, 'the replay starting');
    await guestSocket.queueWhere((queue) => queue.length === 0, 'the end of the replay');

    // No second line for the same thing.
    expect(guestSocket.latestHistory().map((item) => item.id)).toEqual([mediaId]);
    hostSocket.close();
    guestSocket.close();
  });

  it('forgets the history along with the files, once their retention is over', async () => {
    const host = await createParty('Nono', QUICK_BASE);
    const socket = new TestSocket(host, WS_SUBPROTOCOL, QUICK_BASE);
    await socket.welcome();

    // Remembered only once it starts, which here is just about when it should be gone.
    const id = await sendQuickText(host);
    await socket.queueWhere((queue) => queue[0]?.startAt != null, 'the start');
    await new Promise((done) => setTimeout(done, 1_600));

    const later = new TestSocket(host, WS_SUBPROTOCOL, QUICK_BASE);
    await later.welcome();
    expect(later.latestHistory()).toEqual([]);
    expect((await replay(host, id, QUICK_BASE)).status).toBe(404);
    socket.close();
    later.close();
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

  it('tells which version of the app each member runs, and only what looks like a version', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const third = await joinParty(host.code, 'Vieux');
    const fourth = await joinParty(host.code, 'Malin');
    const hostSocket = new TestSocket(host, WS_SUBPROTOCOL, BASE, '1.2.3');
    await hostSocket.welcome();
    const guestSocket = new TestSocket(guest, WS_SUBPROTOCOL, BASE, '1.2.4');
    await guestSocket.welcome();
    const oldSocket = new TestSocket(third);
    await oldSocket.welcome();
    const oddSocket = new TestSocket(fourth, WS_SUBPROTOCOL, BASE, 'pas-une-version');
    await oddSocket.welcome();

    const members = await hostSocket.membersWhere((list) => list.filter(({ online }) => online).length === 4, 'all four online');
    const versionOf = (memberId: string) => members.find(({ id }) => id === memberId)?.version;
    expect(versionOf(host.memberId)).toBe('1.2.3');
    expect(versionOf(guest.memberId)).toBe('1.2.4');
    expect(versionOf(third.memberId)).toBeNull();
    expect(versionOf(fourth.memberId)).toBeNull();
  });

  it('tells everyone who skipped', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();
    const mediaId = await sendText(host, 'Passe', 20_000);
    await guestSocket.queueWhere((queue) => queue.length === 1, 'announcement');

    guestSocket.send(JSON.stringify({ t: 'skip', mediaId }));
    const told = await hostSocket.until(() => hostSocket.messages.find((message) => message.t === 'skipped'), 'who skipped');
    expect(told).toMatchObject({ memberId: guest.memberId, name: 'Invite' });
  });

  it('whispers to the chosen members only: the others never see it, nor count it', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const third = await joinParty(host.code, 'Troisieme');
    const sockets = [host, guest, third].map((session) => new TestSocket(session));
    await Promise.all(sockets.map((socket) => socket.welcome()));
    const [hostSocket, guestSocket, thirdSocket] = sockets as [TestSocket, TestSocket, TestSocket];

    const response = await post(
      `/v1/parties/${host.partyId}/media`,
      { caption: 'Rien que pour toi', clipStartMs: 0, durationMs: 1_000, files: [], to: [guest.memberId] },
      authorized(host),
    );
    expect(response.status).toBe(201);
    const [whispered] = await guestSocket.queueWhere((queue) => queue[0]?.startAt != null, 'whisper for the guest');
    expect(whispered).toMatchObject({ caption: 'Rien que pour toi', to: [guest.memberId] });
    await hostSocket.queueWhere((queue) => queue.length === 1, 'whisper for the sender');
    await guestSocket.historyWhere((history) => history.length === 1, 'whisper remembered for the guest');

    await sendText(guest, 'Pour tout le monde');
    await thirdSocket.historyWhere((history) => history.length === 1, 'the public one');
    expect(thirdSocket.latestHistory().map(({ caption }) => caption)).toEqual(['Pour tout le monde']);
    expect(thirdSocket.messages.some((message) => message.t === 'queue' && message.queue.some(({ caption }) => caption === 'Rien que pour toi'))).toBe(false);

    const members = await thirdSocket.membersWhere((list) => list.some(({ sentToday }) => sentToday > 0), 'the count');
    expect(members.find(({ id }) => id === guest.memberId)?.sentToday).toBe(1);
    expect(members.find(({ id }) => id === host.memberId)?.sentToday).toBe(0);
    for (const socket of sockets) socket.close();
  });

  it('lets a LiveChat sent with a key take the place of the one playing, ahead of the queue', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();

    await sendText(host, 'Long', 20_000);
    await guestSocket.queueWhere((queue) => queue[0]?.caption === 'Long' && queue[0].startAt != null, 'the long one plays');
    await sendText(host, 'Ensuite', 1_000);
    const response = await post(
      `/v1/parties/${guest.partyId}/media`,
      { caption: 'Par touche', clipStartMs: 0, durationMs: 1_000, files: [], jump: true },
      authorized(guest),
    );
    expect(response.status).toBe(201);

    const queue = await hostSocket.queueWhere((list) => list[0]?.caption === 'Par touche', 'the key one first');
    expect(queue.map(({ caption }) => caption)).toEqual(['Par touche', 'Ensuite']);
    const told = await hostSocket.until(() => hostSocket.messages.find((message) => message.t === 'skipped'), 'who cut it');
    expect(told).toMatchObject({ memberId: guest.memberId, name: 'Invite' });
    hostSocket.close();
    guestSocket.close();
  });

  it('shows what each member is up to, with their own words', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();

    guestSocket.send(JSON.stringify({ t: 'status', activity: 'playing', note: '  en ranked   ' }));
    const members = await hostSocket.membersWhere((list) => list.some(({ activity }) => activity === 'playing'), 'status');
    expect(members.find(({ id }) => id === guest.memberId)).toMatchObject({ activity: 'playing', note: 'en ranked' });

    guestSocket.close();
    const after = await hostSocket.membersWhere((list) => list.some(({ id, online }) => id === guest.memberId && !online), 'gone');
    expect(after.find(({ id }) => id === guest.memberId)).toMatchObject({ activity: 'here', note: 'en ranked' });
    hostSocket.close();
  });

  it('names the game being played and since when, and forgets it once they stop', async () => {
    const host = await createParty();
    const guest = await joinParty(host.code, 'Invite');
    const hostSocket = new TestSocket(host);
    const guestSocket = new TestSocket(guest);
    await hostSocket.welcome();
    await guestSocket.welcome();
    const guestIn = (list: Member[]) => list.find(({ id }) => id === guest.memberId);

    const before = Date.now();
    guestSocket.send(JSON.stringify({ t: 'status', activity: 'playing', note: '', game: '  VALORANT ' }));
    const playing = await hostSocket.membersWhere((list) => guestIn(list)?.game === 'VALORANT', 'game');
    const since = guestIn(playing)!.playingSince!;
    expect(since).toBeGreaterThanOrEqual(before);

    // The same game said again keeps its clock.
    guestSocket.send(JSON.stringify({ t: 'status', activity: 'playing', note: 'ranked', game: 'VALORANT' }));
    const again = await hostSocket.membersWhere((list) => guestIn(list)?.note === 'ranked', 'note');
    expect(guestIn(again)).toMatchObject({ game: 'VALORANT', playingSince: since });

    guestSocket.send(JSON.stringify({ t: 'status', activity: 'here', note: 'ranked', game: 'VALORANT' }));
    const stopped = await hostSocket.membersWhere((list) => guestIn(list)?.activity === 'here', 'stopped');
    expect(guestIn(stopped)).toMatchObject({ game: null, playingSince: null });
    hostSocket.close();
    guestSocket.close();
  });

  it('runs one poll at a time, counts votes without names, and closes it', async () => {
    const host = await createParty('Nono', QUICK_BASE);
    const socket = new TestSocket(host, WS_SUBPROTOCOL, QUICK_BASE);
    await socket.welcome();
    const latestPoll = () => socket.messages.findLast((message) => message.t === 'poll');

    socket.send(JSON.stringify({ t: 'poll', question: 'On mange quoi ?', options: ['Pizza', 'Kebab'] }));
    const started = await socket.until(() => {
      const message = latestPoll();
      return message?.t === 'poll' && message.poll ? message.poll : undefined;
    }, 'poll');
    expect(started).toMatchObject({ question: 'On mange quoi ?', options: ['Pizza', 'Kebab'], counts: [0, 0], done: false, starterName: 'Nono' });

    socket.send(JSON.stringify({ t: 'poll', question: 'Un autre', options: ['A', 'B'] }));
    socket.send(JSON.stringify({ t: 'vote', pollId: started.id, choice: 1 }));
    const voted = await socket.until(() => {
      const message = latestPoll();
      return message?.t === 'poll' && message.poll?.myVote === 1 ? message.poll : undefined;
    }, 'vote');
    expect(voted).toMatchObject({ id: started.id, counts: [0, 1] });

    const done = await socket.until(() => {
      const message = latestPoll();
      return message?.t === 'poll' && message.poll?.done ? message.poll : undefined;
    }, 'end of the poll');
    expect(done).toMatchObject({ id: started.id, question: 'On mange quoi ?', counts: [0, 1] });
    socket.close();
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

  it('refuses one online member too many, and an offline member can return once there is room', async () => {
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

  it('sends someone on a Mac to the explanations, then to the Mac installer', async () => {
    const macBrowser = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15' };
    const link = await fetch(`${BASE}/download`, { redirect: 'manual', headers: macBrowser });
    expect(link.status).toBe(302);
    expect(link.headers.get('location')).toBe(`${BASE}/mac`);

    const page = await fetch(`${BASE}/mac`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Ouvrir quand même');

    const windows = await fetch(`${BASE}/download/windows`, { redirect: 'manual', headers: macBrowser });
    expect(windows.status).toBe(302);
    expect(windows.headers.get('location')).toBe(`${BASE}/updates/LiveChatSBCB-Setup-9.9.9.exe`);

    const installer = await fetch(`${BASE}/download/mac`, { redirect: 'manual' });
    expect(installer.status).toBe(302);
    expect(installer.headers.get('location')).toBe(`${BASE}/updates/LiveChatSBCB-Mac-9.9.9.dmg`);
    expect((await fetch(`${BASE}/updates/latest-mac.yml`)).headers.get('cache-control')).toBe('no-store');
    expect((await fetch(`${BASE}/updates/LiveChatSBCB-Mac-9.9.9.dmg`)).status).toBe(200);
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

describe('sealing what Discord gives', () => {
  it('reads back only with the same secret', async () => {
    const key = await sealingKey('a secret');
    const sealed = await seal(key, 'refresh-token-1');
    expect(sealed).not.toContain('refresh-token-1');
    expect(await seal(key, 'refresh-token-1')).not.toBe(sealed);
    expect(await unseal(key, sealed)).toBe('refresh-token-1');
    expect(await unseal(await sealingKey('another secret'), sealed)).toBeNull();
    expect(await unseal(key, 'not even close')).toBeNull();
  });
});

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

describe('Discord servers', () => {
  // Rebuilt for every test: a server, with one person on it.
  let guildId: string;
  let friendId: string;

  const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

  // What this service remembers from Discord lasts a second here, so this is long enough for it to ask again.
  const listExpiry = () => pause(1_100);

  const me = async (token: string, base = QUICK_BASE) => {
    const response = await fetch(`${base}/v1/me`, { headers: bearer(token) });
    expect(response.status).toBe(200);
    return MeResponseSchema.parse(await response.json());
  };

  const joinGuild = (token: string, guild = guildId) => post(`/v1/guilds/${guild}/join`, {}, bearer(token), QUICK_BASE);

  const enter = async (token: string, guild = guildId): Promise<SessionResponse> => {
    const response = await joinGuild(token, guild);
    expect(response.status).toBe(200);
    return SessionResponseSchema.parse(await response.json());
  };

  const partySocket = (session: SessionResponse) => new TestSocket(session, WS_SUBPROTOCOL, QUICK_BASE);

  const callsTo = (path: string) => discord.calls.filter((call) => call === path).length;

  beforeEach(() => {
    discord.down = false;
    discord.tokenLifetime = 604_800;
    guildId = discord.addGuild('Notre serveur');
    friendId = discord.addUser('Pote');
    discord.addMember(guildId, friendId);
  });

  it('lists all the servers of the person, and nobody else\'s', async () => {
    const other = discord.addGuild('Autre serveur');
    discord.addMember(other, friendId);

    const friend = await loginAs(friendId, QUICK_BASE);
    const { guilds, partial } = await me(friend.token);
    expect(partial).toBe(false);
    expect(guilds.map(({ id }) => id).sort()).toEqual([guildId, other].sort());
    expect(guilds.find(({ id }) => id === guildId)).toEqual({
      id: guildId,
      name: 'Notre serveur',
      iconUrl: `https://cdn.discordapp.com/icons/${guildId}/icon${guildId}.png?size=128`,
    });

    const stranger = await loginNew('Inconnu', QUICK_BASE);
    expect((await me(stranger.token)).guilds).toEqual([]);
  });

  it('never gives the Discord token to the app', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    expect(JSON.stringify(friend)).not.toMatch(/access-|refresh-/);
    expect(JSON.stringify(await me(friend.token))).not.toMatch(/access-|refresh-/);
  });

  it('puts everyone from a server in the same party, and media reaches them all', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const otherId = discord.addUser('Autre');
    discord.addMember(guildId, otherId);
    const other = await loginAs(otherId, QUICK_BASE);

    const first = await enter(friend.token);
    const second = await enter(other.token);
    expect(first.partyId).toBe(`g-${guildId}`);
    expect(second.partyId).toBe(first.partyId);
    expect(first.code).toBeNull();
    expect(first.guild?.name).toBe('Notre serveur');

    const firstSocket = partySocket(first);
    const secondSocket = partySocket(second);
    await firstSocket.welcome();
    await secondSocket.welcome();
    await firstSocket.sawOnline(2);

    const sent = await post(
      `/v1/parties/${first.partyId}/media`,
      { caption: 'Salut', clipStartMs: 0, durationMs: 1_000, files: [] },
      authorized(first),
      QUICK_BASE,
    );
    expect(sent.status).toBe(201);
    await secondSocket.queueWhere(
      (queue) => queue.some(({ caption, senderName }) => caption === 'Salut' && senderName === 'Pote'),
      'the text',
    );

    // The queue keeps moving on the same alarm as the checks on who is still on the server.
    await firstSocket.queueWhere((queue) => queue.length === 0, 'the end of the text');
    expect(firstSocket.closeCode).toBeUndefined();

    firstSocket.close();
    secondSocket.close();
  });

  it('shows only who is connected, not who came before', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const otherId = discord.addUser('Autre');
    discord.addMember(guildId, otherId);
    const other = await loginAs(otherId, QUICK_BASE);

    const firstSocket = partySocket(await enter(friend.token));
    await firstSocket.welcome();
    const secondSocket = partySocket(await enter(other.token));
    await secondSocket.welcome();
    await firstSocket.sawOnline(2);

    secondSocket.close();
    await firstSocket.sawOnline(1);
    expect(firstSocket.latestMembers()?.[0]?.id).toBe(friendId);
    firstSocket.close();
  });

  it('opens again after everyone has left', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const first = await enter(friend.token);
    expect((await post(`/v1/parties/${first.partyId}/leave`, {}, authorized(first), QUICK_BASE)).status).toBe(204);

    const again = await enter(friend.token);
    const socket = partySocket(again);
    expect(await socket.welcome()).toMatchObject({ memberId: friendId });
    socket.close();
  });

  it('has no code to change', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const session = await enter(friend.token);
    expect((await post(`/v1/parties/${session.partyId}/rotate-code`, {}, authorized(session), QUICK_BASE)).status).toBe(401);
  });

  it('refuses a server the person is not on', async () => {
    const stranger = await loginNew('Inconnu', QUICK_BASE);
    const response = await joinGuild(stranger.token);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });

    expect((await post(`/v1/guilds/${guildId}/join`, {}, {}, QUICK_BASE)).status).toBe(401);
  });

  it('notices someone leaving the server, and takes them out of its party', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const stayingId = discord.addUser('Reste');
    discord.addMember(guildId, stayingId);
    const staying = await loginAs(stayingId, QUICK_BASE);

    const leavingSocket = partySocket(await enter(friend.token));
    await leavingSocket.welcome();
    const stayingSocket = partySocket(await enter(staying.token));
    await stayingSocket.welcome();

    discord.removeMember(guildId, friendId);
    expect(await leavingSocket.closed()).toBe(CloseCode.Removed);
    await stayingSocket.sawOnline(1);
    expect(stayingSocket.closeCode).toBeUndefined();
    stayingSocket.close();
  });

  it('refuses someone who left the server while away, when they come back', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const session = await enter(friend.token);
    const socket = partySocket(session);
    await socket.welcome();
    socket.close();

    discord.removeMember(guildId, friendId);
    await listExpiry();

    const back = partySocket(session);
    expect(await back.closed()).toBe(CloseCode.Removed);
  });

  it('sees a new server soon after the person joins it', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    await me(friend.token);

    const newGuild = discord.addGuild('Tout neuf');
    discord.addMember(newGuild, friendId);
    await listExpiry();
    expect((await me(friend.token)).guilds.map(({ id }) => id)).toContain(newGuild);
    await enter(friend.token, newGuild);
  });

  it('keeps people in when Discord goes down, and lets them enter the servers it last confirmed', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const session = await enter(friend.token);
    const socket = partySocket(session);
    await socket.welcome();
    const neverAsked = await loginNew('Nouveau', QUICK_BASE);

    discord.down = true;
    await pause(2_500);
    expect(socket.closeCode).toBeUndefined();

    const during = await me(friend.token);
    expect(during.partial).toBe(true);
    expect(during.guilds.map(({ id }) => id)).toContain(guildId);
    expect((await joinGuild(friend.token)).status).toBe(200);

    // Nobody has ever heard from Discord about this one.
    const unknown = await joinGuild(neverAsked.token);
    expect(unknown.status).toBe(503);
    expect(await unknown.json()).toEqual({ error: 'discord_unavailable' });
    expect(await me(neverAsked.token)).toMatchObject({ guilds: [], partial: true });

    discord.down = false;
    socket.close();
  });

  it('renews a Discord token that runs out, without anyone noticing', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    await me(friend.token);

    const before = callsTo('POST /api/oauth2/token');
    discord.expireAccessTokens(friendId);
    await listExpiry();
    expect((await me(friend.token)).guilds.map(({ id }) => id)).toContain(guildId);
    expect(callsTo('POST /api/oauth2/token')).toBe(before + 1);
  });

  it('renews ahead of time, and only once when many ask together', async () => {
    discord.tokenLifetime = 60;
    const friend = await loginAs(friendId, QUICK_BASE);
    discord.tokenLifetime = 604_800;

    const before = callsTo('POST /api/oauth2/token');
    const answers = await Promise.all(Array.from({ length: 5 }, () => me(friend.token)));
    expect(answers.every(({ guilds }) => guilds.some(({ id }) => id === guildId))).toBe(true);
    expect(callsTo('POST /api/oauth2/token')).toBe(before + 1);
  });

  it('logs the person out when they remove the app in Discord, and takes them out of the party', async () => {
    const friend = await loginAs(friendId, QUICK_BASE);
    const socket = partySocket(await enter(friend.token));
    await socket.welcome();

    discord.removeAuthorization(friendId);
    expect(await socket.closed()).toBe(CloseCode.Removed);

    const response = await fetch(`${QUICK_BASE}/v1/me`, { headers: bearer(friend.token) });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'signed_out' });
  });

  it('gives back the Discord token when the last session ends, and only then', async () => {
    const onePc = await loginAs(friendId, QUICK_BASE);
    const otherPc = await loginAs(friendId, QUICK_BASE);

    const before = callsTo('POST /api/oauth2/token/revoke');
    expect((await post('/v1/auth/logout', {}, bearer(onePc.token), QUICK_BASE)).status).toBe(204);
    expect(callsTo('POST /api/oauth2/token/revoke')).toBe(before);
    expect((await me(otherPc.token)).account.id).toBe(friendId);

    expect((await post('/v1/auth/logout', {}, bearer(otherPc.token), QUICK_BASE)).status).toBe(204);
    expect(callsTo('POST /api/oauth2/token/revoke')).toBe(before + 1);
    expect((await fetch(`${QUICK_BASE}/v1/me`, { headers: bearer(otherPc.token) })).status).toBe(401);
  });

  it('treats a second PC as the same member, and the old connection steps aside', async () => {
    const onePc = await loginAs(friendId, QUICK_BASE);
    const otherPc = await loginAs(friendId, QUICK_BASE);

    const oldSocket = partySocket(await enter(onePc.token));
    await oldSocket.welcome();
    const newSession = await enter(otherPc.token);
    expect(newSession.memberId).toBe(friendId);

    const newSocket = partySocket(newSession);
    await newSocket.welcome();
    expect(await oldSocket.closed()).toBe(CloseCode.Replaced);
    expect(newSocket.latestMembers()).toHaveLength(1);
    newSocket.close();
  });

  it('does not ask Discord again and again for the same thing', async () => {
    const friend = await loginAs(friendId);
    const before = callsTo('GET /api/users/@me/guilds');
    await me(friend.token, BASE);
    await me(friend.token, BASE);
    await post(`/v1/guilds/${guildId}/join`, {}, bearer(friend.token));
    expect(callsTo('GET /api/users/@me/guilds')).toBe(before + 1);

    // Asking for the latest list isn't a way around that either, right after getting it.
    const fresh = await fetch(`${BASE}/v1/me?fresh=1`, { headers: bearer(friend.token) });
    expect(fresh.status).toBe(200);
    expect(callsTo('GET /api/users/@me/guilds')).toBe(before + 1);
  });
});
