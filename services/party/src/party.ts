import { DurableObject } from 'cloudflare:workers';
import {
  ClientMessageSchema,
  CloseCode,
  MAX_HISTORY_LENGTH,
  MAX_ONLINE_MEMBERS,
  MAX_QUEUE_LENGTH,
  MAX_REGISTERED_MEMBERS,
  WS_PING,
  WS_PONG,
  WS_SUBPROTOCOL,
  WS_SUBPROTOCOL_PREFIX,
  WS_TOKEN_PREFIX,
  mediaKindOf,
  mediaPartBytes,
  mediaPartCount,
  type Account,
  type HistoryItem,
  type MediaDraft,
  type Member,
  type QueueItem,
  type ServerMessage,
} from '@livechatsbcb/protocol';
import { randomToken, sha256 } from './tokens';

type MemberRow = { id: string; name: string; avatar_url: string | null };
type Credentials = { memberId: string; token: string };
type UploadRow = { file_id: string; media_id: string; member_id: string; upload_id: string; size: number; attempts_left: number };
type PendingRow = { media_id: string; member_id: string; draft: string; file_ids: string };
export type PendingUpload = { fileId: string; uploadId: string; size: number; attempts: number };
type QueueRow = {
  id: string;
  item: string;
  start_at: number | null;
  prepare_ms: number;
  prepare_deadline: number | null;
  ready: string;
};
type StoredItem = Omit<QueueItem, 'startAt'>;
type HistoryRow = { item: string; played_at: number };
type Refusal<Error extends string> = { ok: false; error: Error };
type Admission = { ok: true; member: Credentials } | Refusal<'party_full'>;

// Long enough for every PC to load a file it already has and be ready at the same moment.
const START_LEAD_MS = 1_500;
// How long a slow connection can hold up the others. Whoever isn't ready by then joins in progress.
const MIN_PREPARE_MS = 15_000;
const MAX_PREPARE_MS = 120_000;
const PREPARE_BYTES_PER_MS = 2_000;
// Changes when what is stored in the queue and the history stops being readable by the current apps.
const ITEM_FORMAT = '5';

export const guildPartyId = (guildId: string): string => `g-${guildId}`;

export class Party extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.createTables();
    // Answered by the runtime, so keep-alive pings don't wake a hibernating party.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING, WS_PONG));
  }

  private createTables(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        joined_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS file_uploads (
        file_id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL,
        member_id TEXT NOT NULL,
        upload_id TEXT NOT NULL,
        size INTEGER NOT NULL,
        attempts_left INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pending_media (
        media_id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        draft TEXT NOT NULL,
        file_ids TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS queue (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        item TEXT NOT NULL,
        start_at INTEGER,
        prepare_ms INTEGER NOT NULL,
        prepare_deadline INTEGER,
        ready TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        item TEXT NOT NULL,
        played_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
    `);
    // Parties created before members had a picture.
    const columns = this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(members)').toArray();
    if (!columns.some(({ name }) => name === 'avatar_url')) {
      this.ctx.storage.sql.exec('ALTER TABLE members ADD COLUMN avatar_url TEXT');
    }
    // What played before this format is at most a day old: it isn't worth converting.
    if (this.getMeta('itemFormat') !== ITEM_FORMAT) {
      this.ctx.storage.sql.exec('DELETE FROM queue; DELETE FROM history; DROP TABLE IF EXISTS uploads;');
      this.setMeta('itemFormat', ITEM_FORMAT);
    }
  }

  init(partyId: string, code: string): void {
    this.setMeta('partyId', partyId);
    this.setMeta('code', code);
  }

  // The party of a Discord server has no code, and is opened by whoever enters it first.
  async enterGuild(partyId: string, guildId: string, account: Account): Promise<Admission> {
    const token = randomToken();
    const tokenHash = await sha256(token);

    // No await from here on: someone leaving at this moment could otherwise wipe this between the two steps.
    this.setMeta('partyId', partyId);
    this.setMeta('guildId', guildId);
    return this.admit(account, token, tokenHash);
  }

  async addMember(account: Account): Promise<Admission> {
    const token = randomToken();
    return this.admit(account, token, await sha256(token));
  }

  // Someone coming back, or on a second PC, gets a new token: there is one member per Discord account.
  // Stays free of await: the capacity check and the insert must not interleave with another join.
  private admit(account: Account, token: string, tokenHash: string): Admission {
    const online = this.onlineIds();
    if (online.size >= MAX_ONLINE_MEMBERS && !online.has(account.id)) return { ok: false, error: 'party_full' };

    const [known] = this.ctx.storage.sql.exec('SELECT 1 FROM members WHERE id = ?', account.id).toArray();
    if (!known) this.evictIfRegistryFull();

    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO members (id, name, avatar_url, token_hash, joined_at, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT (id) DO UPDATE SET
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         token_hash = excluded.token_hash,
         last_seen = excluded.last_seen`,
      account.id,
      account.name,
      account.avatarUrl,
      tokenHash,
      now,
    );
    this.broadcast({ t: 'members', members: this.members() });
    return { ok: true, member: { memberId: account.id, token } };
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

    return { ok: true, releasedCode: await this.removeMember(member.id) };
  }

  async isMember(token: string): Promise<boolean> {
    return (await this.memberForToken(token)) !== undefined;
  }

  // Text never touches storage, so it goes straight in the queue.
  async sendText(
    token: string,
    mediaId: string,
    draft: MediaDraft,
  ): Promise<{ ok: true } | Refusal<'unauthorized' | 'queue_full'>> {
    const member = await this.memberForToken(token);
    if (!member || !(await this.mayStay(member))) return { ok: false, error: 'unauthorized' };
    if (this.queueIsFull()) return { ok: false, error: 'queue_full' };
    this.enqueue(mediaId, member, draft, []);
    return { ok: true };
  }

  // The file is already there, so this costs no upload: only a new place in the queue, under the name of whoever asked.
  async replay(token: string, historyId: string): Promise<{ ok: true } | Refusal<'unauthorized' | 'not_found' | 'queue_full'>> {
    const member = await this.memberForToken(token);
    if (!member || !(await this.mayStay(member))) return { ok: false, error: 'unauthorized' };

    const [row] = this.ctx.storage.sql
      .exec<HistoryRow>('SELECT item, played_at FROM history WHERE id = ? AND expires_at > ?', historyId, Date.now())
      .toArray();
    if (!row) return { ok: false, error: 'not_found' };
    if (this.queueIsFull()) return { ok: false, error: 'queue_full' };

    const { playedAt: _, ...original } = this.toHistoryItem(row);
    this.enqueueItem({
      ...original,
      id: crypto.randomUUID(),
      replay: true,
      senderId: member.id,
      senderName: member.name,
      senderAvatarUrl: member.avatar_url,
    });
    return { ok: true };
  }

  async canUpload(token: string): Promise<{ ok: true; memberId: string } | Refusal<'unauthorized' | 'queue_full'>> {
    const member = await this.memberForToken(token);
    if (!member || !(await this.mayStay(member))) return { ok: false, error: 'unauthorized' };
    if (this.queueIsFull()) return { ok: false, error: 'queue_full' };
    return { ok: true, memberId: member.id };
  }

  registerUpload(mediaId: string, memberId: string, draft: MediaDraft, uploads: PendingUpload[]): void {
    this.ctx.storage.sql.exec(
      'INSERT INTO pending_media (media_id, member_id, draft, file_ids) VALUES (?, ?, ?, ?)',
      mediaId,
      memberId,
      JSON.stringify(draft),
      JSON.stringify(uploads.map(({ fileId }) => fileId)),
    );
    for (const { fileId, uploadId, size, attempts } of uploads) {
      this.ctx.storage.sql.exec(
        'INSERT INTO file_uploads (file_id, media_id, member_id, upload_id, size, attempts_left) VALUES (?, ?, ?, ?, ?, ?)',
        fileId,
        mediaId,
        memberId,
        uploadId,
        size,
        attempts,
      );
    }
  }

  async claimPart(
    token: string,
    fileId: string,
    part: number,
    bytes: number,
  ): Promise<{ ok: true; uploadId: string } | Refusal<'unauthorized' | 'not_found' | 'invalid_request' | 'rate_limited'>> {
    const upload = await this.uploadOf(token, fileId);
    if (!upload.ok) return upload;

    const { size } = upload.row;
    if (part > mediaPartCount(size) || bytes !== mediaPartBytes(size, part)) {
      return { ok: false, error: 'invalid_request' };
    }
    // Each attempt is a paid-class R2 operation, and the monthly budget only counted so many.
    if (upload.row.attempts_left <= 0) return { ok: false, error: 'rate_limited' };

    this.ctx.storage.sql.exec('UPDATE file_uploads SET attempts_left = attempts_left - 1 WHERE file_id = ?', fileId);
    return { ok: true, uploadId: upload.row.upload_id };
  }

  async uploadFor(
    token: string,
    fileId: string,
  ): Promise<{ ok: true; uploadId: string; size: number } | Refusal<'unauthorized' | 'not_found'>> {
    const upload = await this.uploadOf(token, fileId);
    if (!upload.ok) return upload;
    return { ok: true, uploadId: upload.row.upload_id, size: upload.row.size };
  }

  // Given any file of a media, gives up on the whole media and says which files were still on their way.
  async cancelUpload(token: string, fileId: string): Promise<string[]> {
    const upload = await this.uploadOf(token, fileId);
    const mediaId = upload.ok ? upload.row.media_id : fileId;
    const member = await this.memberForToken(token);
    if (!member) return [];

    const [pending] = this.ctx.storage.sql
      .exec<PendingRow>('SELECT * FROM pending_media WHERE media_id = ? AND member_id = ?', mediaId, member.id)
      .toArray();
    if (!pending) return [];

    const open = this.ctx.storage.sql
      .exec<UploadRow>('SELECT * FROM file_uploads WHERE media_id = ?', mediaId)
      .toArray()
      .map(({ file_id: id }) => id);
    this.ctx.storage.sql.exec('DELETE FROM file_uploads WHERE media_id = ?', mediaId);
    this.ctx.storage.sql.exec('DELETE FROM pending_media WHERE media_id = ?', mediaId);
    return open;
  }

  // The media goes in the queue with its last file, and not before.
  finishUpload(fileId: string): void {
    const [row] = this.ctx.storage.sql.exec<UploadRow>('SELECT * FROM file_uploads WHERE file_id = ?', fileId).toArray();
    if (!row) return;
    this.ctx.storage.sql.exec('DELETE FROM file_uploads WHERE file_id = ?', fileId);

    const mediaId = row.media_id;
    const [left] = this.ctx.storage.sql.exec('SELECT 1 FROM file_uploads WHERE media_id = ? LIMIT 1', mediaId).toArray();
    if (left) return;

    const [pending] = this.ctx.storage.sql.exec<PendingRow>('SELECT * FROM pending_media WHERE media_id = ?', mediaId).toArray();
    this.ctx.storage.sql.exec('DELETE FROM pending_media WHERE media_id = ?', mediaId);
    const [member] = this.ctx.storage.sql
      .exec<MemberRow>('SELECT id, name, avatar_url FROM members WHERE id = ?', row.member_id)
      .toArray();
    if (pending && member) {
      this.enqueue(mediaId, member, JSON.parse(pending.draft) as MediaDraft, JSON.parse(pending.file_ids) as string[]);
    }
  }

  override async alarm(): Promise<void> {
    await this.checkGuildMembers();
    if (this.advanceQueue()) this.broadcastQueue();
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
    if (!(await this.mayStay(member))) return refuse(CloseCode.Removed, 'removed');

    const othersOnline = [...this.onlineIds()].filter((id) => id !== member.id).length;
    if (othersOnline >= MAX_ONLINE_MEMBERS) return refuse(CloseCode.PartyFull, 'party full');

    for (const socket of this.ctx.getWebSockets(member.id)) this.dismiss(socket, CloseCode.Replaced);

    this.ctx.acceptWebSocket(server, [member.id]);
    this.touch(member.id);
    if (this.getMeta('guildId') && Number(this.getMeta('nextMemberCheck')) <= Date.now()) this.planMemberCheck();

    const members = this.members();
    server.send(
      JSON.stringify({
        t: 'welcome',
        partyId: this.getMeta('partyId'),
        code: this.getMeta('code') || null,
        memberId: member.id,
        members,
        queue: this.queue(),
        history: this.history(),
      } satisfies ServerMessage),
    );
    this.broadcast({ t: 'members', members }, server);
    if (this.advanceQueue()) this.broadcastQueue();
    return response;
  }

  // Keep-alive never gets here: it is handled by the auto-response.
  override webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    const [memberId] = this.ctx.getTags(socket);
    if (!memberId || typeof raw !== 'string') return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const message = ClientMessageSchema.safeParse(parsed);
    if (!message.success) return;

    switch (message.data.t) {
      case 'time':
        socket.send(JSON.stringify({ t: 'time', c: message.data.c, s: Date.now() } satisfies ServerMessage));
        break;
      case 'ready':
        this.markReady(memberId, message.data.mediaId);
        break;
      case 'skip':
        this.skip(message.data.mediaId);
        break;
    }
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
    // The queue may have been waiting for this member only.
    if (this.advanceQueue(socket)) this.broadcastQueue();
  }

  private async removeMember(memberId: string): Promise<string | null> {
    this.ctx.storage.sql.exec('DELETE FROM members WHERE id = ?', memberId);
    for (const socket of this.ctx.getWebSockets(memberId)) this.dismiss(socket, CloseCode.Removed);

    const [left] = this.ctx.storage.sql.exec('SELECT 1 FROM members LIMIT 1').toArray();
    if (left) {
      this.broadcast({ t: 'members', members: this.members() });
      if (this.advanceQueue()) this.broadcastQueue();
      return null;
    }

    const releasedCode = this.getMeta('code');
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    // This takes the tables too, and the next person to enter a Discord server's party will land on this same object.
    this.createTables();
    return releasedCode;
  }

  // Someone connected is checked regularly from the other side. Someone who isn't could have lost access since their
  // last visit. If Discord doesn't answer, their token still stands: it proves they had access not long ago.
  private async mayStay(member: MemberRow): Promise<boolean> {
    const guildId = this.getMeta('guildId');
    if (!guildId || this.onlineIds().has(member.id)) return true;

    if ((await this.directory().isGuildMember(member.id, guildId)) !== 'no') return true;

    await this.removeMember(member.id);
    return false;
  }

  // Someone who left the Discord server should stop seeing what is sent there, without having to reconnect first.
  private async checkGuildMembers(): Promise<void> {
    const guildId = this.getMeta('guildId');
    if (!guildId || Date.now() < Number(this.getMeta('nextMemberCheck'))) return;

    const directory = this.directory();
    const online = [...this.onlineIds()];
    const answers = await Promise.all(online.map((id) => directory.isGuildMember(id, guildId).catch(() => 'unknown')));
    for (const [index, answer] of answers.entries()) {
      if (answer === 'no') await this.removeMember(online[index]!);
    }
    // The last of them leaving wipes everything, and this party is then back to having nothing to check.
    if (this.getMeta('guildId')) this.planMemberCheck();
  }

  private planMemberCheck(): void {
    this.setMeta('nextMemberCheck', String(Date.now() + Number(this.env.DISCORD_REFRESH_MS)));
  }

  private directory() {
    return this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName('global'));
  }

  // One alarm does both jobs: moving the queue on, and checking people are still on the server while anyone is here.
  private wakeAt(queueStep: number | null, leaving?: WebSocket): void {
    const checking = this.getMeta('guildId') && this.openSockets(leaving).length > 0;
    const steps = [queueStep, checking ? Number(this.getMeta('nextMemberCheck')) : null].filter((step) => step !== null);
    if (steps.length > 0) void this.ctx.storage.setAlarm(Math.min(...steps));
    else void this.ctx.storage.deleteAlarm();
  }

  private async uploadOf(
    token: string,
    fileId: string,
  ): Promise<{ ok: true; row: UploadRow } | Refusal<'unauthorized' | 'not_found'>> {
    const member = await this.memberForToken(token);
    if (!member) return { ok: false, error: 'unauthorized' };
    const [row] = this.ctx.storage.sql
      .exec<UploadRow>('SELECT * FROM file_uploads WHERE file_id = ? AND member_id = ?', fileId, member.id)
      .toArray();
    return row ? { ok: true, row } : { ok: false, error: 'not_found' };
  }

  private queueIsFull(): boolean {
    const [row] = this.ctx.storage.sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM queue').toArray();
    return (row?.total ?? 0) >= MAX_QUEUE_LENGTH;
  }

  private queueRows(): QueueRow[] {
    return this.ctx.storage.sql.exec<QueueRow>('SELECT * FROM queue ORDER BY seq').toArray();
  }

  private queue(): QueueItem[] {
    return this.queueRows().map((row) => ({
      ...(JSON.parse(row.item) as Omit<QueueItem, 'startAt'>),
      startAt: row.start_at,
    }));
  }

  private broadcastQueue(): void {
    this.broadcast({ t: 'queue', queue: this.queue() });
  }

  private enqueue(mediaId: string, sender: MemberRow, draft: MediaDraft, fileIds: string[]): void {
    this.enqueueItem({
      id: mediaId,
      files: draft.files.map((file, index) => ({ ...file, id: fileIds[index]! })),
      replay: false,
      senderId: sender.id,
      senderName: sender.name,
      senderAvatarUrl: sender.avatar_url,
      kind: mediaKindOf(draft.files),
      caption: draft.caption,
      clipStartMs: draft.clipStartMs,
      durationMs: draft.durationMs,
      expiresAt: Date.now() + Number(this.env.MEDIA_RETENTION_MS),
    });
  }

  private enqueueItem(item: StoredItem): void {
    const size = item.files.reduce((total, file) => total + file.size, 0);
    const prepareMs = size > 0 ? Math.min(MAX_PREPARE_MS, Math.max(MIN_PREPARE_MS, size / PREPARE_BYTES_PER_MS)) : 0;
    this.ctx.storage.sql.exec(
      'INSERT INTO queue (id, item, prepare_ms, ready) VALUES (?, ?, ?, ?)',
      item.id,
      JSON.stringify(item),
      Math.round(prepareMs),
      '[]',
    );
    this.advanceQueue();
    this.broadcastQueue();
  }

  private toHistoryItem({ item, played_at: playedAt }: HistoryRow): HistoryItem {
    const { replay: _, ...stored } = JSON.parse(item) as StoredItem;
    return { ...stored, playedAt };
  }

  private history(): HistoryItem[] {
    return this.ctx.storage.sql
      .exec<HistoryRow>('SELECT item, played_at FROM history WHERE expires_at > ? ORDER BY played_at DESC', Date.now())
      .toArray()
      .map((row) => this.toHistoryItem(row));
  }

  // Only what is really shown counts, and only once: playing something again doesn't add a line.
  private remember(row: QueueRow, playedAt: number): void {
    const item = JSON.parse(row.item) as StoredItem;
    if (item.replay) return;

    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO history (id, item, played_at, expires_at) VALUES (?, ?, ?, ?)',
      item.id,
      row.item,
      playedAt,
      item.expiresAt,
    );
    this.ctx.storage.sql.exec(
      'DELETE FROM history WHERE expires_at <= ?1 OR id NOT IN (SELECT id FROM history ORDER BY played_at DESC LIMIT ?2)',
      playedAt,
      MAX_HISTORY_LENGTH,
    );
    this.broadcast({ t: 'history', history: this.history() });
  }

  private markReady(memberId: string, mediaId: string): void {
    const [row] = this.ctx.storage.sql.exec<QueueRow>('SELECT * FROM queue WHERE id = ?', mediaId).toArray();
    if (!row) return;
    const ready = new Set(JSON.parse(row.ready) as string[]).add(memberId);
    this.ctx.storage.sql.exec('UPDATE queue SET ready = ? WHERE id = ?', JSON.stringify([...ready]), mediaId);
    if (this.advanceQueue()) this.broadcastQueue();
  }

  // Names the media so that two people pressing at once can't skip the one after it too.
  private skip(mediaId: string): void {
    if (this.queueRows()[0]?.id !== mediaId) return;
    this.ctx.storage.sql.exec('DELETE FROM queue WHERE id = ?', mediaId);
    this.advanceQueue();
    this.broadcastQueue();
  }

  // Runs the queue forward and arms the alarm for its next step. Returns whether anyone needs telling.
  private advanceQueue(leaving?: WebSocket): boolean {
    const now = Date.now();
    let changed = false;

    for (;;) {
      const head = this.queueRows()[0];
      if (!head) {
        this.wakeAt(null, leaving);
        return changed;
      }

      const { durationMs } = JSON.parse(head.item) as QueueItem;
      if (head.start_at !== null) {
        if (now < head.start_at + durationMs) {
          this.wakeAt(head.start_at + durationMs, leaving);
          return changed;
        }
        this.ctx.storage.sql.exec('DELETE FROM queue WHERE id = ?', head.id);
        changed = true;
        continue;
      }

      const deadline = head.prepare_deadline ?? now + head.prepare_ms;
      const ready = new Set(JSON.parse(head.ready) as string[]);
      const everyoneReady = [...this.onlineIds(leaving)].every((id) => ready.has(id));

      if (now >= deadline || everyoneReady) {
        const startAt = now + START_LEAD_MS;
        this.ctx.storage.sql.exec('UPDATE queue SET start_at = ? WHERE id = ?', startAt, head.id);
        this.remember(head, startAt);
        this.wakeAt(startAt + durationMs, leaving);
        return true;
      }

      this.ctx.storage.sql.exec('UPDATE queue SET prepare_deadline = ? WHERE id = ?', deadline, head.id);
      this.wakeAt(deadline, leaving);
      return changed;
    }
  }

  private openSockets(excluding?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((socket) => socket !== excluding && socket.readyState === WebSocket.OPEN);
  }

  private onlineIds(excluding?: WebSocket): Set<string> {
    return new Set(this.openSockets(excluding).flatMap((socket) => this.ctx.getTags(socket)));
  }

  private members(excluding?: WebSocket): Member[] {
    const online = this.onlineIds(excluding);
    const members = this.ctx.storage.sql
      .exec<MemberRow>('SELECT id, name, avatar_url FROM members ORDER BY joined_at')
      .toArray()
      .map(({ id, name, avatar_url: avatarUrl }) => ({ id, name, avatarUrl, online: online.has(id) }));
    // Past visitors of a Discord server's party are nobody's business: a private party is the one with a fixed list.
    return this.getMeta('guildId') ? members.filter((member) => member.online) : members;
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
      .exec<MemberRow>('SELECT id, name, avatar_url FROM members ORDER BY last_seen')
      .toArray()
      .find(({ id }) => !online.has(id));
    if (oldest) this.ctx.storage.sql.exec('DELETE FROM members WHERE id = ?', oldest.id);
  }

  private async memberForToken(token: string): Promise<MemberRow | undefined> {
    if (!token) return undefined;
    const tokenHash = await sha256(token);
    const [row] = this.ctx.storage.sql
      .exec<MemberRow>('SELECT id, name, avatar_url FROM members WHERE token_hash = ?', tokenHash)
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
