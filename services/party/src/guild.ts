import { DurableObject } from 'cloudflare:workers';
import {
  AccountSchema,
  CloseCode,
  WS_PING,
  WS_PONG,
  WS_SUBPROTOCOL,
  WS_SUBPROTOCOL_PREFIX,
  type Account,
  type LobbyMember,
  type LobbyMessage,
} from '@livechatsbcb/protocol';
import {
  accountOnServer,
  fetchGuildStructure,
  fetchMember,
  guildIconUrl,
  type DiscordMember,
  type DiscordResult,
} from './discord';
import {
  canViewChannel,
  channelKind,
  hasAppAccess,
  isPartyChannel,
  sectionsInDisplayOrder,
  type GuildStructure,
} from './permissions';

const STALE_ANSWER_LIMIT_MS = 24 * 60 * 60_000;
// So that someone who just joined the server doesn't have to wait for the next check.
const ABSENT_MEMBER_REFRESH_MS = 30_000;
const MAX_LOBBY_SOCKETS = 200;
// Each check is a call to Discord, and a free Worker may make 50 of them per run.
const MAX_MEMBER_CHECKS_PER_RUN = 40;
const FORGET_MEMBER_AFTER_MS = 7 * 24 * 60 * 60_000;

export const ACCOUNT_HEADER = 'x-livechatsbcb-account';

export const channelPartyId = (channelId: string): string => `c-${channelId}`;

type Stored<T> = { data: T | null; fetchedAt: number };
type StoredRow = { data: string | null; fetched_at: number };
type OccupantsRow = { channel_id: string; members: string; updated_at: number };

export type ChannelAccess =
  | { ok: true; account: Account; guildName: string; channelName: string }
  | { ok: false; error: 'forbidden' | 'discord_unavailable' };

export type GuildAnswer =
  | { status: 'ok'; id: string; name: string; iconUrl: string | null; locked: boolean }
  | { status: 'none' | 'unavailable' };

const fromRow = <T>(row: StoredRow | undefined): Stored<T> | null =>
  row ? { data: row.data === null ? null : (JSON.parse(row.data) as T), fetchedAt: row.fetched_at } : null;

// One per Discord server. Knows what Discord says about the server, decides who may see what, and tells the people
// looking at the server who is around.
export class Guild extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS structure (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS members (user_id TEXT PRIMARY KEY, data TEXT, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS occupants (channel_id TEXT PRIMARY KEY, members TEXT NOT NULL, updated_at INTEGER NOT NULL);
    `);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(WS_PING, WS_PONG));
  }

  // What a member sees of this server in their list.
  async summary(guildId: string, userId: string): Promise<GuildAnswer> {
    const [structure, member] = await Promise.all([this.loadStructure(guildId), this.loadMember(guildId, userId)]);
    if (structure.status === 'unavailable' || member.status === 'unavailable') return { status: 'unavailable' };
    if (structure.status === 'missing' || member.status === 'missing') return { status: 'none' };

    return {
      status: 'ok',
      id: guildId,
      name: structure.value.name,
      iconUrl: guildIconUrl(guildId, structure.value.icon),
      locked: !this.hasAccess(structure.value, userId, member.value),
    };
  }

  async access(guildId: string, userId: string, channelId: string): Promise<ChannelAccess> {
    const [structure, member] = await Promise.all([this.loadStructure(guildId), this.loadMember(guildId, userId)]);
    if (structure.status === 'unavailable' || member.status === 'unavailable') {
      return { ok: false, error: 'discord_unavailable' };
    }
    if (structure.status === 'missing' || member.status === 'missing') return { ok: false, error: 'forbidden' };

    // The same answer whether the channel is hidden or doesn't exist, so that none can be found by trying.
    const channel = structure.value.channels.find(({ id }) => id === channelId);
    if (
      !channel ||
      !isPartyChannel(channel) ||
      !this.hasAccess(structure.value, userId, member.value) ||
      !canViewChannel(structure.value, userId, member.value, channel)
    ) {
      return { ok: false, error: 'forbidden' };
    }

    return {
      ok: true,
      account: accountOnServer(guildId, member.value),
      guildName: structure.value.name,
      channelName: channel.name,
    };
  }

  // Told by a party each time someone comes or goes. Two reports can overtake each other on the way here.
  async setOccupants(guildId: string, channelId: string, members: LobbyMember[], at: number): Promise<void> {
    this.setMeta('guildId', guildId);
    this.storeOccupants(channelId, members, at);
    this.broadcastLobby();
    await this.keepWatching();
  }

  override async fetch(request: Request): Promise<Response> {
    const offered = (request.headers.get('sec-websocket-protocol') ?? '').split(',').map((part) => part.trim());
    const version = offered.find((part) => part.startsWith(WS_SUBPROTOCOL_PREFIX)) ?? WS_SUBPROTOCOL;

    const { 0: client, 1: server } = new WebSocketPair();
    const response = new Response(null, {
      status: 101,
      webSocket: client,
      headers: { 'sec-websocket-protocol': version },
    });
    const refuse = (code: number, reason: string) => {
      server.accept();
      server.close(code, reason);
      return response;
    };

    if (version !== WS_SUBPROTOCOL) return refuse(CloseCode.UpdateRequired, 'update required');

    const account = AccountSchema.safeParse(JSON.parse(request.headers.get(ACCOUNT_HEADER) ?? 'null'));
    if (!account.success) return refuse(CloseCode.SignedOut, 'signed out');
    if (this.ctx.getWebSockets().length >= MAX_LOBBY_SOCKETS) return refuse(CloseCode.PartyFull, 'full');

    const guildId = new URL(request.url).pathname.split('/')[3]!;
    const userId = account.data.id;
    const [structure, member] = await Promise.all([this.loadStructure(guildId), this.loadMember(guildId, userId)]);
    // Not a refusal: the app tries again until Discord answers.
    if (structure.status === 'unavailable' || member.status === 'unavailable') return refuse(1013, 'try again later');
    if (
      structure.status === 'missing' ||
      member.status === 'missing' ||
      !this.hasAccess(structure.value, userId, member.value)
    ) {
      return refuse(CloseCode.Removed, 'no access');
    }

    for (const socket of this.ctx.getWebSockets(userId)) this.dismiss(socket, CloseCode.Replaced);

    this.setMeta('guildId', guildId);
    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment(accountOnServer(guildId, member.value));

    this.broadcastLobby();
    await this.keepWatching();
    return response;
  }

  override webSocketClose(socket: WebSocket): void {
    this.broadcastLobby(socket);
  }

  override webSocketError(socket: WebSocket): void {
    this.broadcastLobby(socket);
  }

  // Runs only while someone is around. Without a permanent connection to Discord, this is how a kick, a lost role or
  // a renamed channel gets noticed.
  override async alarm(): Promise<void> {
    const guildId = this.getMeta('guildId');
    if (!guildId) return;

    try {
      await this.refreshOccupants();
      await this.refreshFromDiscord(guildId);
      this.ctx.storage.sql.exec('DELETE FROM members WHERE fetched_at < ?', Date.now() - FORGET_MEMBER_AFTER_MS);
      this.broadcastLobby();
    } finally {
      await this.keepWatching();
    }
  }

  private refreshMs(): number {
    return Number(this.env.DISCORD_REFRESH_MS);
  }

  private async keepWatching(): Promise<void> {
    const someoneAround = this.ctx.getWebSockets().length > 0 || this.occupantRows().length > 0;
    if (!someoneAround) {
      await this.ctx.storage.deleteAlarm();
    } else if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + this.refreshMs());
    }
  }

  private hasAccess(structure: GuildStructure, userId: string, member: DiscordMember): boolean {
    const open = this.env.DISCORD_OPEN_GUILDS.split(',').includes(structure.id);
    return hasAppAccess(structure, userId, member, open);
  }

  private storedStructure(): Stored<GuildStructure> | null {
    return fromRow(this.ctx.storage.sql.exec<StoredRow>('SELECT data, fetched_at FROM structure').toArray()[0]);
  }

  private storedMember(userId: string): Stored<DiscordMember> | null {
    return fromRow(
      this.ctx.storage.sql.exec<StoredRow>('SELECT data, fetched_at FROM members WHERE user_id = ?', userId).toArray()[0],
    );
  }

  private loadStructure(guildId: string, refreshMs = this.refreshMs()): Promise<DiscordResult<GuildStructure>> {
    return this.freshOr(
      this.storedStructure(),
      refreshMs,
      () => fetchGuildStructure(this.env, guildId),
      (data, fetchedAt) => {
        this.ctx.storage.sql.exec(
          'INSERT OR REPLACE INTO structure (id, data, fetched_at) VALUES (1, ?, ?)',
          data && JSON.stringify(data),
          fetchedAt,
        );
      },
    );
  }

  private loadMember(guildId: string, userId: string, refreshMs = this.refreshMs()): Promise<DiscordResult<DiscordMember>> {
    const known = this.storedMember(userId);
    return this.freshOr(
      known,
      known?.data === null ? Math.min(ABSENT_MEMBER_REFRESH_MS, refreshMs) : refreshMs,
      () => fetchMember(this.env, guildId, userId),
      (data, fetchedAt) => {
        this.ctx.storage.sql.exec(
          'INSERT OR REPLACE INTO members (user_id, data, fetched_at) VALUES (?, ?, ?)',
          userId,
          data && JSON.stringify(data),
          fetchedAt,
        );
      },
    );
  }

  // If Discord goes down, whoever it already told us about stays known for a day: only the others have to wait.
  private async freshOr<T>(
    known: Stored<T> | null,
    refreshMs: number,
    fetchFromDiscord: () => Promise<DiscordResult<T>>,
    remember: (data: T | null, fetchedAt: number) => void,
  ): Promise<DiscordResult<T>> {
    const asAnswer = ({ data }: Stored<T>): DiscordResult<T> =>
      data === null ? { status: 'missing' } : { status: 'ok', value: data };

    const now = Date.now();
    if (known && now - known.fetchedAt < refreshMs) return asAnswer(known);

    const answer = await fetchFromDiscord();
    if (answer.status === 'unavailable') {
      return known && now - known.fetchedAt < STALE_ANSWER_LIMIT_MS ? asAnswer(known) : answer;
    }
    remember(answer.status === 'ok' ? answer.value : null, now);
    return answer;
  }

  private partyOf(channelId: string) {
    return this.env.PARTY.get(this.env.PARTY.idFromName(channelPartyId(channelId)));
  }

  private occupantRows(): OccupantsRow[] {
    return this.ctx.storage.sql.exec<OccupantsRow>('SELECT * FROM occupants').toArray();
  }

  private storeOccupants(channelId: string, members: LobbyMember[], at: number): void {
    const [row] = this.ctx.storage.sql
      .exec<OccupantsRow>('SELECT * FROM occupants WHERE channel_id = ?', channelId)
      .toArray();
    if (row && row.updated_at > at) return;

    if (members.length === 0) {
      this.ctx.storage.sql.exec('DELETE FROM occupants WHERE channel_id = ?', channelId);
    } else {
      this.ctx.storage.sql.exec(
        'INSERT OR REPLACE INTO occupants (channel_id, members, updated_at) VALUES (?, ?, ?)',
        channelId,
        JSON.stringify(members),
        at,
      );
    }
  }

  // A report from a party can get lost, and nothing else would ever clear a name left behind by it.
  private async refreshOccupants(): Promise<void> {
    const at = Date.now();
    await Promise.all(
      this.occupantRows().map(async ({ channel_id: channelId }) => {
        this.storeOccupants(channelId, await this.partyOf(channelId).occupants(), at);
      }),
    );
  }

  private async refreshFromDiscord(guildId: string): Promise<void> {
    const structure = await this.loadStructure(guildId, 0);
    if (structure.status === 'unavailable') return;

    const occupied = this.occupantRows().map((row) => ({
      channelId: row.channel_id,
      userIds: (JSON.parse(row.members) as LobbyMember[]).map(({ id }) => id),
    }));
    const inLobby = this.ctx.getWebSockets().flatMap((socket) => this.ctx.getTags(socket));
    const around = [...new Set([...inLobby, ...occupied.flatMap(({ userIds }) => userIds)])]
      .map((userId) => ({ userId, fetchedAt: this.storedMember(userId)?.fetchedAt ?? 0 }))
      .sort((a, b) => a.fetchedAt - b.fetchedAt)
      .slice(0, MAX_MEMBER_CHECKS_PER_RUN);

    const members = new Map(
      await Promise.all(
        around.map(async ({ userId }) => [userId, await this.loadMember(guildId, userId, 0)] as const),
      ),
    );

    // Only a clear answer takes access away. Whoever wasn't checked this time, or got no answer, keeps it for now.
    const keeps = (userId: string, channelId?: string): boolean => {
      if (structure.status === 'missing') return false;
      const member = members.get(userId);
      if (!member || member.status === 'unavailable') return true;
      if (member.status === 'missing' || !this.hasAccess(structure.value, userId, member.value)) return false;
      if (channelId === undefined) return true;

      const channel = structure.value.channels.find(({ id }) => id === channelId);
      return channel !== undefined && canViewChannel(structure.value, userId, member.value, channel);
    };

    for (const socket of this.ctx.getWebSockets()) {
      const [userId] = this.ctx.getTags(socket);
      if (userId && !keeps(userId)) this.dismiss(socket, CloseCode.Removed);
    }
    for (const { channelId, userIds } of occupied) {
      for (const userId of userIds) {
        if (!keeps(userId, channelId)) await this.partyOf(channelId).revoke(userId);
      }
    }
  }

  private broadcastLobby(excluding?: WebSocket): void {
    const sockets = this.ctx
      .getWebSockets()
      .filter((socket) => socket !== excluding && socket.readyState === WebSocket.OPEN);
    const structure = this.storedStructure()?.data;
    if (sockets.length === 0 || !structure) return;

    const online = sockets.map((socket) => socket.deserializeAttachment() as LobbyMember);
    const occupants = new Map(
      this.occupantRows().map((row) => [row.channel_id, JSON.parse(row.members) as LobbyMember[]]),
    );

    for (const socket of sockets) {
      const [userId] = this.ctx.getTags(socket);
      const member = userId ? this.storedMember(userId)?.data : null;
      if (!userId || !member) continue;

      const message: LobbyMessage = {
        t: 'lobby',
        guild: { id: structure.id, name: structure.name, iconUrl: guildIconUrl(structure.id, structure.icon) },
        // Worked out for each member: names in a channel must not reach someone who can't see that channel.
        categories: sectionsInDisplayOrder(structure, (channel) =>
          canViewChannel(structure, userId, member, channel),
        ).map(({ id, name, channels }) => ({
          id,
          name,
          channels: channels.map((channel) => ({
            id: channel.id,
            name: channel.name,
            kind: channelKind(channel),
            occupants: occupants.get(channel.id) ?? [],
          })),
        })),
        online,
      };
      socket.send(JSON.stringify(message));
    }
  }

  private dismiss(socket: WebSocket, code: number): void {
    socket.send(JSON.stringify({ t: 'closing', code } satisfies LobbyMessage));
    socket.close(code, 'closing');
  }

  private getMeta(key: string): string {
    const [row] = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray();
    return row?.value ?? '';
  }

  private setMeta(key: string, value: string): void {
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', key, value);
  }
}
