import { DurableObject } from 'cloudflare:workers';
import {
  ClientMessageSchema,
  CloseCode,
  MAX_HISTORY_LENGTH,
  MAX_ONLINE_MEMBERS,
  MAX_QUEUE_LENGTH,
  MAX_REGISTERED_MEMBERS,
  SPAM_BAN_MS,
  SPAM_SENDS,
  SPAM_WINDOW_MS,
  WS_PING,
  WS_PONG,
  WS_APP_PREFIX,
  WS_LOBBY,
  WS_SUBPROTOCOL,
  WS_SUBPROTOCOL_PREFIX,
  WS_TOKEN_PREFIX,
  mediaKindOf,
  mediaPartBytes,
  mediaPartCount,
  GAME_MIN_PLAYERS,
  type Account,
  type Activity,
  type Game,
  type GameKind,
  type GameReaction,
  type Poll,
  type PollRequest,
  type HistoryItem,
  linkKindOf,
  type MediaDraft,
  type Member,
  type QueueItem,
  type ServerMessage,
} from '@livechatsbcb/protocol';
import { randomToken, sha256 } from './tokens';
import * as games from './games';

const REACTION_GAP_MS = 500;

// The lobby came with 0.22.0, which says so. Clients without an app version are tests.
const knowsLobby = (tags: string[]): boolean => tags.length < 2 || tags.includes(WS_LOBBY);

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
  cut: string;
};
type StoredItem = Omit<QueueItem, 'startAt'>;
type HistoryRow = { item: string; played_at: number };
type Refusal<Error extends string> = { ok: false; error: Error };
type Admission = { ok: true; member: Credentials } | Refusal<'party_full'>;

// Long enough for every PC to load a file it already has and be ready at the same moment.
const START_LEAD_MS = 1_500;
// A site's player has to load on every PC, so that it can start with the others.
const LINK_START_LEAD_MS = 4_000;
// How long a slow connection can hold up the others. Whoever isn't ready by then joins in progress.
const MIN_PREPARE_MS = 15_000;
const MAX_PREPARE_MS = 120_000;
const PREPARE_BYTES_PER_MS = 2_000;
// Changes when what is stored in the queue and the history stops being readable by the current apps.
const ITEM_FORMAT = '7';
// A finished poll still shows its result for a while to whoever comes in.
const POLL_KEPT_MS = 60_000;
// The day of the counter is the one of the friends who use the app.
const DAY_OF = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });

type StoredPoll = { id: string; question: string; options: string[]; starterName: string; endsAt: number; done: boolean; votes: Record<string, number> };
type Audience = Pick<StoredItem, 'senderId' | 'to'>;

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
      CREATE TABLE IF NOT EXISTS send_log (member_id TEXT NOT NULL, fingerprint TEXT NOT NULL, sent_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bans (member_id TEXT PRIMARY KEY, until INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS member_status (member_id TEXT PRIMARY KEY, activity TEXT NOT NULL, note TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS member_game (member_id TEXT PRIMARY KEY, game TEXT NOT NULL, since INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS sent_count (member_id TEXT PRIMARY KEY, day TEXT NOT NULL, total INTEGER NOT NULL);
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
    // Parties created before a queue item could be cut short.
    const queueColumns = this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(queue)').toArray();
    if (!queueColumns.some(({ name }) => name === 'cut')) {
      this.ctx.storage.sql.exec("ALTER TABLE queue ADD COLUMN cut TEXT NOT NULL DEFAULT '[]'");
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
  ): Promise<{ ok: true } | Refusal<'unauthorized' | 'queue_full' | 'banned'>> {
    const member = await this.memberForToken(token);
    if (!member || !(await this.mayStay(member))) return { ok: false, error: 'unauthorized' };
    if (draft.game !== null) {
      const game = this.storedGame();
      if (game?.id !== draft.game || !games.acceptsEntry(game, member.id, [], draft.caption)) return { ok: false, error: 'queue_full' };
      this.addGameEntry(member.id, mediaId, draft, []);
      return { ok: true };
    }
    if (!this.mayNotSpam(member.id, draft)) return { ok: false, error: 'banned' };
    if (this.queueIsFull()) return { ok: false, error: 'queue_full' };
    this.enqueue(mediaId, member, draft, []);
    return { ok: true };
  }

  // The file is already there, so this costs no upload: only a new place in the queue, under the name of whoever asked.
  async replay(token: string, historyId: string): Promise<{ ok: true } | Refusal<'unauthorized' | 'not_found' | 'queue_full' | 'banned'>> {
    const member = await this.memberForToken(token);
    if (!member || !(await this.mayStay(member))) return { ok: false, error: 'unauthorized' };

    const [row] = this.ctx.storage.sql
      .exec<HistoryRow>('SELECT item, played_at FROM history WHERE id = ? AND expires_at > ?', historyId, Date.now())
      .toArray();
    if (!row) return { ok: false, error: 'not_found' };

    const { playedAt: _, ...original } = this.toHistoryItem(row);
    if (!this.mayNotSpam(member.id, original)) return { ok: false, error: 'banned' };
    if (this.queueIsFull()) return { ok: false, error: 'queue_full' };

    // A whisper played again stays between the same people, with whoever sent it first among them.
    const to = original.to.length > 0 ? [...new Set([...original.to, original.senderId])].filter((id) => id !== member.id) : [];
    if (to.length === 0 && original.to.length === 0) this.countSent(member.id);
    this.enqueueItem({
      ...original,
      to: original.to.length > 0 && to.length === 0 ? [member.id] : to,
      id: crypto.randomUUID(),
      replay: true,
      senderId: member.id,
      senderName: member.name,
      senderAvatarUrl: member.avatar_url,
    });
    return { ok: true };
  }

  async canUpload(
    token: string,
    draft: MediaDraft,
  ): Promise<{ ok: true; memberId: string } | Refusal<'unauthorized' | 'queue_full' | 'banned'>> {
    const member = await this.memberForToken(token);
    if (!member || !(await this.mayStay(member))) return { ok: false, error: 'unauthorized' };
    // What a game no longer waits for isn't worth storing.
    if (draft.game !== null) {
      const game = this.storedGame();
      return game?.id === draft.game && games.acceptsEntry(game, member.id, draft.files, draft.caption)
        ? { ok: true, memberId: member.id }
        : { ok: false, error: 'queue_full' };
    }
    if (!this.mayNotSpam(member.id, draft)) return { ok: false, error: 'banned' };
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
    if (pending && member && (JSON.parse(pending.draft) as MediaDraft).game) {
      this.addGameEntry(member.id, mediaId, JSON.parse(pending.draft) as MediaDraft, JSON.parse(pending.file_ids) as string[]);
    } else if (pending && member) {
      this.enqueue(mediaId, member, JSON.parse(pending.draft) as MediaDraft, JSON.parse(pending.file_ids) as string[]);
    }
  }

  override async alarm(): Promise<void> {
    await this.checkGuildMembers();
    this.closePollIfDue();
    this.stepGame();
    if (this.advanceQueue()) this.broadcastQueue();
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426 });
    }

    const offered = (request.headers.get('sec-websocket-protocol') ?? '').split(',').map((part) => part.trim());
    const version = offered.find((part) => part.startsWith(WS_SUBPROTOCOL_PREFIX)) ?? WS_SUBPROTOCOL;
    const app = offered.find((part) => part.startsWith(WS_APP_PREFIX))?.slice(WS_APP_PREFIX.length) ?? '';
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

    const tags = /^\d+\.\d+\.\d+$/.test(app) ? [member.id, app] : [member.id];
    if (offered.includes(WS_LOBBY)) tags.push(WS_LOBBY);
    this.ctx.acceptWebSocket(server, tags);
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
        queue: this.queue(member.id),
        history: this.history(member.id),
        poll: this.pollFor(member.id),
        game: this.gameFor(member.id, knowsLobby(tags)),
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
        this.skip(memberId, message.data.mediaId);
        break;
      case 'cut':
        this.markCut(memberId, message.data.mediaId);
        break;
      case 'status':
        this.setStatus(memberId, message.data.activity, message.data.note, message.data.game);
        break;
      case 'poll':
        this.startPoll(memberId, message.data);
        break;
      case 'vote':
        this.vote(memberId, message.data.pollId, message.data.choice);
        break;
      case 'game-start':
        this.startGame(memberId, message.data.kind);
        break;
      case 'game-say': {
        const { gameId, text } = message.data;
        this.playGame(gameId, (game) => games.say(game, memberId, text));
        break;
      }
      case 'game-vote': {
        const { gameId, choice } = message.data;
        this.playGame(gameId, (game) => games.vote(game, memberId, choice));
        break;
      }
      case 'game-stop': {
        const game = this.storedGame();
        if (game?.phase === 'lobby') {
          if (game.id === message.data.gameId && game.chefId === memberId) this.closeGame();
          break;
        }
        this.playGame(message.data.gameId, (game) => {
          if (game.phase === 'done' || !game.players.includes(memberId)) return false;
          games.stop(game, Date.now());
          return true;
        });
        break;
      }
      case 'game-join':
        this.playGame(message.data.gameId, (game) => games.join(game, memberId, Date.now(), this.gameScale()));
        break;
      case 'game-ready': {
        const { gameId, ready } = message.data;
        this.playGame(gameId, (game) => games.setReady(game, memberId, ready, Date.now(), this.gameScale()));
        break;
      }
      case 'game-launch':
        this.launchGame(message.data.gameId, memberId);
        break;
      case 'game-leave':
        this.leaveGame(message.data.gameId, memberId);
        break;
      case 'game-rematch':
        this.rematchGame(message.data.gameId, memberId);
        break;
      case 'game-react':
        this.react(message.data.gameId, memberId, message.data.emoji);
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
    const poll = this.storedPoll();
    const pollEnd = poll && !poll.done ? poll.endsAt : null;
    const game = this.storedGame();
    const gameStep = game && game.phase !== 'done' ? game.endsAt : null;
    const steps = [queueStep, checking ? Number(this.getMeta('nextMemberCheck')) : null, pollEnd, gameStep].filter((step) => step !== null);
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

  // Counts every try, sent or not. What makes it "the same" is what the others would see: its text and its files.
  private mayNotSpam(memberId: string, { caption, files, link }: Pick<MediaDraft, 'caption' | 'files' | 'link'>): boolean {
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM bans WHERE until <= ?', now);
    const [banned] = this.ctx.storage.sql.exec('SELECT 1 FROM bans WHERE member_id = ?', memberId).toArray();
    if (banned) return false;

    const fingerprint = JSON.stringify([caption, files.map(({ name, size }) => [name, size]), link?.id ?? null]);
    this.ctx.storage.sql.exec('DELETE FROM send_log WHERE sent_at <= ?', now - SPAM_WINDOW_MS);
    const [row] = this.ctx.storage.sql
      .exec<{ total: number }>('SELECT COUNT(*) AS total FROM send_log WHERE member_id = ? AND fingerprint = ?', memberId, fingerprint)
      .toArray();
    if ((row?.total ?? 0) + 1 >= SPAM_SENDS) {
      this.ctx.storage.sql.exec('INSERT INTO bans (member_id, until) VALUES (?, ?)', memberId, now + SPAM_BAN_MS);
      this.ctx.storage.sql.exec('DELETE FROM send_log WHERE member_id = ?', memberId);
      this.broadcast({ t: 'members', members: this.members() });
      return false;
    }
    this.ctx.storage.sql.exec('INSERT INTO send_log (member_id, fingerprint, sent_at) VALUES (?, ?, ?)', memberId, fingerprint, now);
    return true;
  }

  private queueIsFull(): boolean {
    const [row] = this.ctx.storage.sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM queue').toArray();
    return (row?.total ?? 0) >= MAX_QUEUE_LENGTH;
  }

  private queueRows(): QueueRow[] {
    return this.ctx.storage.sql.exec<QueueRow>('SELECT * FROM queue ORDER BY seq').toArray();
  }

  private queue(memberId: string): QueueItem[] {
    return this.queueRows()
      .map((row) => ({ ...(JSON.parse(row.item) as Omit<QueueItem, 'startAt'>), startAt: row.start_at }))
      .filter((item) => this.sees(item, memberId));
  }

  // A whisper is for whoever sent it and whoever it was sent to. The others never hear of it.
  private sees({ senderId, to }: Audience, memberId: string): boolean {
    return to.length === 0 || senderId === memberId || to.includes(memberId);
  }

  private audienceOnline(item: Audience, leaving?: WebSocket): string[] {
    return [...this.onlineIds(leaving)].filter((id) => this.sees(item, id));
  }

  private broadcastQueue(): void {
    this.broadcastEach((memberId) => ({ t: 'queue', queue: this.queue(memberId) }));
  }

  private enqueue(mediaId: string, sender: MemberRow, draft: MediaDraft, fileIds: string[]): void {
    const to = [...new Set(draft.to)].filter((id) => id !== sender.id);
    // Whispered to nobody else is still a whisper: only the sender sees it.
    const whisper = draft.to.length > 0;
    if (!whisper) this.countSent(sender.id);
    this.enqueueItem({
      to: whisper && to.length === 0 ? [sender.id] : to,
      id: mediaId,
      files: draft.files.map((file, index) => ({ ...file, id: fileIds[index]! })),
      replay: false,
      senderId: sender.id,
      senderName: sender.name,
      senderAvatarUrl: sender.avatar_url,
      kind: draft.link ? linkKindOf(draft.link) : mediaKindOf(draft.files),
      caption: draft.caption,
      clipStartMs: draft.clipStartMs,
      durationMs: draft.durationMs,
      videoMuted: draft.videoMuted,
      soundMuted: draft.soundMuted,
      speak: draft.speak,
      scene: draft.scene,
      textPlace: draft.textPlace,
      link: draft.link,
      expiresAt: Date.now() + Number(this.env.MEDIA_RETENTION_MS),
    }, draft.jump);
  }

  private enqueueItem(item: StoredItem, jump = false): void {
    const size = item.files.reduce((total, file) => total + file.size, 0);
    const prepareMs = size > 0 ? Math.min(MAX_PREPARE_MS, Math.max(MIN_PREPARE_MS, size / PREPARE_BYTES_PER_MS)) : 0;
    let seq: number | null = null;
    if (jump) {
      // What plays stops, as when someone skips it, and this one takes the first place.
      const head = this.queueRows()[0];
      if (head?.start_at != null) {
        const playing = JSON.parse(head.item) as StoredItem;
        this.ctx.storage.sql.exec('DELETE FROM queue WHERE id = ?', head.id);
        this.broadcastEach((id) => (this.sees(playing, id) ? { t: 'skipped', memberId: item.senderId, name: item.senderName } : null));
      }
      const [low] = this.ctx.storage.sql.exec<{ low: number | null }>('SELECT MIN(seq) AS low FROM queue').toArray();
      if (low?.low != null) seq = low.low - 1;
    }
    this.ctx.storage.sql.exec(
      'INSERT INTO queue (seq, id, item, prepare_ms, ready) VALUES (?, ?, ?, ?, ?)',
      seq,
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

  private history(memberId: string): HistoryItem[] {
    return this.ctx.storage.sql
      .exec<HistoryRow>('SELECT item, played_at FROM history WHERE expires_at > ? ORDER BY played_at DESC', Date.now())
      .toArray()
      .map((row) => this.toHistoryItem(row))
      .filter((item) => this.sees(item, memberId));
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
    this.broadcastEach((memberId) => ({ t: 'history', history: this.history(memberId) }));
  }

  private markReady(memberId: string, mediaId: string): void {
    const [row] = this.ctx.storage.sql.exec<QueueRow>('SELECT * FROM queue WHERE id = ?', mediaId).toArray();
    if (!row) return;
    const ready = new Set(JSON.parse(row.ready) as string[]).add(memberId);
    this.ctx.storage.sql.exec('UPDATE queue SET ready = ? WHERE id = ?', JSON.stringify([...ready]), mediaId);
    if (this.advanceQueue()) this.broadcastQueue();
  }

  private markCut(memberId: string, mediaId: string): void {
    const [row] = this.ctx.storage.sql.exec<QueueRow>('SELECT * FROM queue WHERE id = ?', mediaId).toArray();
    if (!row) return;
    const cut = new Set(JSON.parse(row.cut) as string[]).add(memberId);
    this.ctx.storage.sql.exec('UPDATE queue SET cut = ? WHERE id = ?', JSON.stringify([...cut]), mediaId);
    if (this.advanceQueue()) this.broadcastQueue();
  }

  // Names the media so that two people pressing at once can't skip the one after it too.
  private skip(memberId: string, mediaId: string): void {
    if (this.queueRows()[0]?.id !== mediaId) return;
    const item = JSON.parse(this.queueRows()[0]!.item) as StoredItem;
    this.ctx.storage.sql.exec('DELETE FROM queue WHERE id = ?', mediaId);
    const [member] = this.ctx.storage.sql.exec<MemberRow>('SELECT id, name, avatar_url FROM members WHERE id = ?', memberId).toArray();
    if (member) this.broadcastEach((id) => (this.sees(item, id) ? { t: 'skipped', memberId, name: member.name } : null));
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

      const headItem = JSON.parse(head.item) as StoredItem;
      const { durationMs } = headItem;
      const audience = this.audienceOnline(headItem, leaving);
      if (head.start_at !== null) {
        // Nobody is watching any more: there is no point keeping the next one waiting.
        const cut = new Set(JSON.parse(head.cut) as string[]);
        const online = audience;
        const nobodyWatching = online.length > 0 && online.every((id) => cut.has(id));
        if (now < head.start_at + durationMs && !nobodyWatching) {
          this.wakeAt(head.start_at + durationMs, leaving);
          return changed;
        }
        this.ctx.storage.sql.exec('DELETE FROM queue WHERE id = ?', head.id);
        changed = true;
        continue;
      }

      const deadline = head.prepare_deadline ?? now + head.prepare_ms;
      const ready = new Set(JSON.parse(head.ready) as string[]);
      const everyoneReady = audience.every((id) => ready.has(id));

      if (now >= deadline || everyoneReady) {
        const startAt = now + (headItem.link ? LINK_START_LEAD_MS : START_LEAD_MS);
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
    return new Set(this.openSockets(excluding).map((socket) => this.ctx.getTags(socket)[0]!));
  }

  private members(excluding?: WebSocket): Member[] {
    const online = this.onlineIds(excluding);
    const versions = new Map(
      this.openSockets(excluding).map((socket) => {
        const [id, version] = this.ctx.getTags(socket);
        return [id!, version ?? null];
      }),
    );
    const bans = new Map(
      this.ctx.storage.sql
        .exec<{ member_id: string; until: number }>('SELECT member_id, until FROM bans WHERE until > ?', Date.now())
        .toArray()
        .map(({ member_id: id, until }) => [id, until]),
    );
    const statuses = new Map(
      this.ctx.storage.sql
        .exec<{ member_id: string; activity: Activity; note: string }>('SELECT * FROM member_status')
        .toArray()
        .map((row) => [row.member_id, row]),
    );
    const games = new Map(
      this.ctx.storage.sql
        .exec<{ member_id: string; game: string; since: number }>('SELECT * FROM member_game')
        .toArray()
        .map((row) => [row.member_id, row]),
    );
    const today = DAY_OF.format(Date.now());
    const counts = new Map(
      this.ctx.storage.sql
        .exec<{ member_id: string; total: number }>('SELECT member_id, total FROM sent_count WHERE day = ?', today)
        .toArray()
        .map(({ member_id: id, total }) => [id, total]),
    );
    const members = this.ctx.storage.sql
      .exec<MemberRow>('SELECT id, name, avatar_url FROM members ORDER BY joined_at')
      .toArray()
      .map(({ id, name, avatar_url: avatarUrl }) => ({
        id,
        name,
        avatarUrl,
        online: online.has(id),
        bannedUntil: bans.get(id) ?? null,
        version: versions.get(id) ?? null,
        activity: online.has(id) ? (statuses.get(id)?.activity ?? 'here') : ('here' as const),
        note: statuses.get(id)?.note ?? '',
        sentToday: counts.get(id) ?? 0,
        game: online.has(id) && statuses.get(id)?.activity === 'playing' ? (games.get(id)?.game ?? null) : null,
        playingSince: online.has(id) && statuses.get(id)?.activity === 'playing' ? (games.get(id)?.since ?? null) : null,
      }));
    // Past visitors of a Discord server's party are nobody's business: a private party is the one with a fixed list.
    return this.getMeta('guildId') ? members.filter((member) => member.online) : members;
  }

  private broadcast(message: ServerMessage, excluding?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const socket of this.openSockets(excluding)) socket.send(payload);
  }

  // What each member is told depends on who they are. Null tells them nothing.
  private broadcastEach(messageFor: (memberId: string, lobby: boolean) => ServerMessage | null): void {
    for (const socket of this.openSockets()) {
      const tags = this.ctx.getTags(socket);
      const message = messageFor(tags[0]!, knowsLobby(tags));
      if (message) socket.send(JSON.stringify(message));
    }
  }

  private setStatus(memberId: string, activity: Activity, note: string, game: string | null): void {
    const cleaned = note.replace(/\s+/g, ' ').trim();
    // A game only counts while playing. The clock starts again with another game, not with every status.
    const playing = activity === 'playing' ? game?.replace(/\s+/g, ' ').trim() || null : null;
    const [known] = this.ctx.storage.sql
      .exec<{ activity: string; note: string }>('SELECT activity, note FROM member_status WHERE member_id = ?', memberId)
      .toArray();
    const [knownGame] = this.ctx.storage.sql
      .exec<{ game: string }>('SELECT game FROM member_game WHERE member_id = ?', memberId)
      .toArray();
    if (known?.activity === activity && known.note === cleaned && (knownGame?.game ?? null) === playing) return;
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO member_status (member_id, activity, note) VALUES (?, ?, ?)', memberId, activity, cleaned);
    if (playing === null) this.ctx.storage.sql.exec('DELETE FROM member_game WHERE member_id = ?', memberId);
    else if (knownGame?.game !== playing)
      this.ctx.storage.sql.exec('INSERT OR REPLACE INTO member_game (member_id, game, since) VALUES (?, ?, ?)', memberId, playing, Date.now());
    this.broadcast({ t: 'members', members: this.members() });
  }

  private countSent(memberId: string): void {
    const today = DAY_OF.format(Date.now());
    this.ctx.storage.sql.exec(
      `INSERT INTO sent_count (member_id, day, total) VALUES (?1, ?2, 1)
       ON CONFLICT (member_id) DO UPDATE SET total = CASE WHEN day = ?2 THEN total + 1 ELSE 1 END, day = ?2`,
      memberId,
      today,
    );
    this.broadcast({ t: 'members', members: this.members() });
  }

  private storedPoll(): StoredPoll | null {
    const raw = this.getMeta('poll');
    return raw ? (JSON.parse(raw) as StoredPoll) : null;
  }

  private pollFor(memberId: string): Poll | null {
    const poll = this.storedPoll();
    if (!poll || (poll.done && Date.now() > poll.endsAt + POLL_KEPT_MS)) return null;
    const counts = poll.options.map(() => 0);
    for (const choice of Object.values(poll.votes)) counts[choice] = (counts[choice] ?? 0) + 1;
    const { votes, ...shown } = poll;
    return { ...shown, counts, myVote: votes[memberId] ?? null };
  }

  private broadcastPoll(): void {
    this.broadcastEach((memberId) => ({ t: 'poll', poll: this.pollFor(memberId) }));
  }

  // One at a time: a new one waits for the last to end.
  private startPoll(memberId: string, { question, options }: PollRequest): void {
    const current = this.storedPoll();
    if (current && !current.done) return;
    const [member] = this.ctx.storage.sql.exec<MemberRow>('SELECT id, name, avatar_url FROM members WHERE id = ?', memberId).toArray();
    if (!member) return;
    const poll: StoredPoll = {
      id: crypto.randomUUID(),
      question,
      options,
      starterName: member.name,
      endsAt: Date.now() + Number(this.env.POLL_MS),
      done: false,
      votes: {},
    };
    this.setMeta('poll', JSON.stringify(poll));
    this.broadcastPoll();
    // Arms the alarm for its end.
    if (this.advanceQueue()) this.broadcastQueue();
  }

  private vote(memberId: string, pollId: string, choice: number): void {
    const poll = this.storedPoll();
    if (!poll || poll.done || poll.id !== pollId || choice >= poll.options.length || Date.now() >= poll.endsAt) return;
    poll.votes[memberId] = choice;
    this.setMeta('poll', JSON.stringify(poll));
    this.broadcastPoll();
  }

  private closePollIfDue(): void {
    const poll = this.storedPoll();
    if (!poll || poll.done || Date.now() < poll.endsAt) return;
    poll.done = true;
    this.setMeta('poll', JSON.stringify(poll));
    this.broadcastPoll();
  }

  private storedGame(): games.StoredGame | null {
    const raw = this.getMeta('game');
    if (!raw) return null;
    // A game saved before the lobby existed lacks its fields.
    return { chefId: '', ready: [], waiting: [], enoughSince: null, readySince: null, ...(JSON.parse(raw) as object) } as unknown as games.StoredGame;
  }

  // Apps older than the lobby can't read it: they just don't see it.
  private gameFor(memberId: string, lobby: boolean): Game | null {
    const game = this.storedGame();
    if (!game || (game.phase === 'done' && Date.now() > game.endsAt)) return null;
    if (game.phase === 'lobby' && !lobby) return null;
    return games.gameView(game, memberId);
  }

  private gameScale(): number {
    return Number(this.env.GAME_SCALE) || 1;
  }

  // Moves on as far as it can, tells everyone, and arms the alarm for the next step.
  private saveGame(game: games.StoredGame): void {
    const now = Date.now();
    if (game.phase === 'lobby' && now >= game.endsAt) {
      // Whoever went away is out; with too few, the lobby waits again, and empty or idle, it closes.
      const online = this.onlineIds();
      game.players = game.players.filter((id) => online.has(id));
      game.ready = game.ready.filter((id) => online.has(id));
      if (!game.players.includes(game.chefId)) game.chefId = game.players[0] ?? '';
      const enough = game.players.length >= GAME_MIN_PLAYERS[game.kind];
      if (enough && game.enoughSince !== null) games.launch(game, now, this.gameScale());
      else if (game.players.length === 0 || game.enoughSince === null) return this.closeGame();
      else games.armLobby(game, now, this.gameScale());
    }
    for (let steps = 0; steps < 20 && game.phase !== 'done'; steps += 1) {
      const online = [...this.onlineIds()].filter((id) => game.players.includes(id));
      const done = games.acted(game);
      const everyone = game.phase !== 'reveal' && online.length > 0 && online.every((id) => done.includes(id));
      if (now < game.endsAt && !everyone) break;
      games.advance(game, now, this.gameScale());
    }
    this.setMeta('game', JSON.stringify(game));
    this.broadcastEach((memberId, lobby) => ({ t: 'game', game: this.gameFor(memberId, lobby) }));
    if (this.advanceQueue()) this.broadcastQueue();
  }

  private closeGame(): void {
    this.setMeta('game', '');
    this.broadcastEach(() => ({ t: 'game', game: null }));
  }

  private stepGame(): void {
    const game = this.storedGame();
    if (!game || game.phase === 'done') return;
    if (game.phase === 'lobby' && game.enoughSince === null && Date.now() >= game.endsAt) return this.closeGame();
    if (Date.now() >= game.endsAt) this.saveGame(game);
  }

  private playGame(gameId: string, act: (game: games.StoredGame) => boolean): void {
    const game = this.storedGame();
    if (game?.id !== gameId || !act(game)) return;
    this.saveGame(game);
  }

  // One at a time. It opens a lobby: the others click to join.
  private startGame(memberId: string, kind: GameKind): void {
    const current = this.storedGame();
    if (current && current.phase !== 'done') return;
    const [member] = this.ctx.storage.sql.exec<MemberRow>('SELECT id, name, avatar_url FROM members WHERE id = ?', memberId).toArray();
    if (!member) return;
    this.saveGame(games.openLobby(kind, memberId, member.name, Date.now(), this.gameScale()));
  }

  // Whoever runs the lobby can start it as soon as there are enough players.
  private launchGame(gameId: string, memberId: string): void {
    this.playGame(gameId, (game) => {
      if (game.phase !== 'lobby' || game.chefId !== memberId) return false;
      const online = this.onlineIds();
      game.players = game.players.filter((id) => online.has(id));
      game.ready = game.ready.filter((id) => online.has(id));
      if (game.players.length < GAME_MIN_PLAYERS[game.kind]) {
        games.armLobby(game, Date.now(), this.gameScale());
        return true;
      }
      games.launch(game, Date.now(), this.gameScale());
      return true;
    });
  }

  private leaveGame(gameId: string, memberId: string): void {
    const game = this.storedGame();
    if (game?.id !== gameId) return;
    if (!games.leave(game, memberId, Date.now(), this.gameScale())) return this.closeGame();
    this.saveGame(game);
  }

  private rematchGame(gameId: string, memberId: string): void {
    const game = this.storedGame();
    if (game?.id !== gameId || game.phase !== 'done') return;
    if (!game.players.includes(memberId) && !game.waiting.includes(memberId)) return;
    this.saveGame(games.rematch(game, memberId, this.onlineIds(), Date.now(), this.gameScale()));
  }

  // Reactions are not kept: they float by and are gone. One every half second at most.
  private lastReaction = new Map<string, number>();
  private react(gameId: string, memberId: string, emoji: GameReaction): void {
    const game = this.storedGame();
    if (game?.id !== gameId || game.phase === 'lobby') return;
    if (!game.players.includes(memberId) && !game.waiting.includes(memberId)) return;
    const now = Date.now();
    if (now - (this.lastReaction.get(memberId) ?? 0) < REACTION_GAP_MS) return;
    this.lastReaction.set(memberId, now);
    this.broadcastEach((_id, lobby) => (lobby ? { t: 'game-react', memberId, emoji } : null));
  }

  private addGameEntry(memberId: string, mediaId: string, draft: MediaDraft, fileIds: string[]): void {
    this.playGame(draft.game ?? '', (game) =>
      games.addEntry(game, {
        id: mediaId,
        ownerId: memberId,
        files: draft.files.map((file, index) => ({ ...file, id: fileIds[index]! })),
        caption: draft.caption,
      }),
    );
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
