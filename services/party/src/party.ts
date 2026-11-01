import { DurableObject } from 'cloudflare:workers';
import {
  CloseCode,
  MAX_ONLINE_MEMBERS,
  MAX_REGISTERED_MEMBERS,
  WS_PING,
  WS_PONG,
  WS_SUBPROTOCOL,
  WS_SUBPROTOCOL_PREFIX,
  WS_TOKEN_PREFIX,
  type Member,
  type ServerMessage,
} from '@livechatsbcb/protocol';

type MemberRow = { id: string; name: string };
type Credentials = { memberId: string; token: string };

const toHex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const sha256 = async (value: string): Promise<string> =>
  toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));

export class Party extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        joined_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
    `);
    // Answered by the runtime, so keep-alive pings don't wake a hibernating party.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING, WS_PONG));
  }

  init(partyId: string, code: string): void {
    this.setMeta('partyId', partyId);
    this.setMeta('code', code);
  }

  async addMember(name: string): Promise<{ ok: true; member: Credentials } | { ok: false; error: 'party_full' }> {
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256(token);

    // No await from here on: the capacity check and the insert must not interleave with another join.
    if (this.onlineIds().size >= MAX_ONLINE_MEMBERS) return { ok: false, error: 'party_full' };

    this.evictIfRegistryFull();

    const id = crypto.randomUUID();
    const now = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO members (id, name, token_hash, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)',
      id,
      name,
      tokenHash,
      now,
      now,
    );
    this.broadcast({ t: 'members', members: this.members() });
    return { ok: true, member: { memberId: id, token } };
  }

  async codeForToken(token: string): Promise<string | null> {
    return (await this.memberForToken(token)) ? this.getMeta('code') : null;
  }

  setCode(code: string): void {
    this.setMeta('code', code);
    this.broadcast({ t: 'code', code });
  }

  async removeMemberByToken(token: string): Promise<{ ok: false } | { ok: true; releasedCode: string | null }> {
    const member = await this.memberForToken(token);
    if (!member) return { ok: false };

    this.ctx.storage.sql.exec('DELETE FROM members WHERE id = ?', member.id);
    for (const socket of this.ctx.getWebSockets(member.id)) this.dismiss(socket, CloseCode.Removed);

    if (this.members().length > 0) {
      this.broadcast({ t: 'members', members: this.members() });
      return { ok: true, releasedCode: null };
    }

    const releasedCode = this.getMeta('code');
    await this.ctx.storage.deleteAll();
    return { ok: true, releasedCode };
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }

    const offered = (request.headers.get('sec-websocket-protocol') ?? '').split(',').map((part) => part.trim());
    const version = offered.find((part) => part.startsWith(WS_SUBPROTOCOL_PREFIX)) ?? WS_SUBPROTOCOL;
    const token = offered.find((part) => part.startsWith(WS_TOKEN_PREFIX))?.slice(WS_TOKEN_PREFIX.length) ?? '';

    const { 0: client, 1: server } = new WebSocketPair();
    const response = new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'sec-websocket-protocol': version },
    });

    // Refusals are close codes rather than HTTP errors, because a WebSocket client can't read an HTTP status.
    const refuse = (code: number, reason: string) => {
      server.accept();
      server.close(code, reason);
      return response;
    };

    if (version !== WS_SUBPROTOCOL) return refuse(CloseCode.UpdateRequired, 'update required');

    const member = await this.memberForToken(token);
    if (!member) return refuse(CloseCode.Unauthorized, 'unauthorized');

    const othersOnline = [...this.onlineIds()].filter((id) => id !== member.id).length;
    if (othersOnline >= MAX_ONLINE_MEMBERS) return refuse(CloseCode.PartyFull, 'party full');

    for (const socket of this.ctx.getWebSockets(member.id)) this.dismiss(socket, CloseCode.Replaced);

    this.ctx.acceptWebSocket(server, [member.id]);
    this.touch(member.id);

    const members = this.members();
    server.send(
      JSON.stringify({
        t: 'welcome',
        partyId: this.getMeta('partyId'),
        code: this.getMeta('code'),
        memberId: member.id,
        members,
      } satisfies ServerMessage),
    );
    this.broadcast({ t: 'members', members }, server);
    return response;
  }

  override webSocketMessage(): void {
    // Keep-alive is handled by the auto-response; clients have nothing else to send yet.
  }

  override webSocketClose(socket: WebSocket): void {
    this.onSocketGone(socket);
  }

  override webSocketError(socket: WebSocket): void {
    this.onSocketGone(socket);
  }

  // The reason travels as a message too: in local tests the client never saw the close frame of a hibernating socket.
  private dismiss(socket: WebSocket, code: number): void {
    socket.send(JSON.stringify({ t: 'closing', code } satisfies ServerMessage));
    socket.close(code, 'closing');
  }

  private onSocketGone(socket: WebSocket): void {
    const [memberId] = this.ctx.getTags(socket);
    if (memberId) this.touch(memberId);
    this.broadcast({ t: 'members', members: this.members(socket) }, socket);
  }

  private openSockets(excluding?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => socket !== excluding && socket.readyState === WebSocket.OPEN);
  }

  private onlineIds(excluding?: WebSocket): Set<string> {
    return new Set(this.openSockets(excluding).flatMap((socket) => this.ctx.getTags(socket)));
  }

  private members(excluding?: WebSocket): Member[] {
    const online = this.onlineIds(excluding);
    return this.ctx.storage.sql
      .exec<MemberRow>('SELECT id, name FROM members ORDER BY joined_at')
      .toArray()
      .map(({ id, name }) => ({ id, name, online: online.has(id) }));
  }

  private broadcast(message: ServerMessage, excluding?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const socket of this.openSockets(excluding)) socket.send(payload);
  }

  // Offline members stay registered so they can come back, but a lost install must not hold a seat forever.
  private evictIfRegistryFull(): void {
    const [row] = this.ctx.storage.sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM members').toArray();
    if ((row?.total ?? 0) < MAX_REGISTERED_MEMBERS) return;

    const online = this.onlineIds();
    const oldest = this.ctx.storage.sql
      .exec<MemberRow>('SELECT id, name FROM members ORDER BY last_seen')
      .toArray()
      .find(({ id }) => !online.has(id));
    if (oldest) this.ctx.storage.sql.exec('DELETE FROM members WHERE id = ?', oldest.id);
  }

  private async memberForToken(token: string): Promise<MemberRow | undefined> {
    if (!token) return undefined;
    const tokenHash = await sha256(token);
    const [row] = this.ctx.storage.sql
      .exec<MemberRow>('SELECT id, name FROM members WHERE token_hash = ?', tokenHash)
      .toArray();
    return row;
  }

  private touch(memberId: string): void {
    this.ctx.storage.sql.exec('UPDATE members SET last_seen = ? WHERE id = ?', Date.now(), memberId);
  }

  private getMeta(key: string): string {
    const [row] = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray();
    return row?.value ?? '';
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }
}
