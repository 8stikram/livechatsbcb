import { describe, expect, it } from 'vitest';
import {
  CloseCode,
  MAX_ONLINE_MEMBERS,
  ServerMessageSchema,
  SessionResponseSchema,
  WS_SUBPROTOCOL,
  WS_TOKEN_PREFIX,
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

describe('party service', () => {
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

  it('answers keep-alive pings', async () => {
    const host = await createParty();
    const socket = new TestSocket(host);
    await socket.welcome();
    socket.send('{"t":"ping"}');
    await socket.until(() => socket.messages.find((message) => message.t === 'pong'), 'pong');
    socket.close();
  });
});
