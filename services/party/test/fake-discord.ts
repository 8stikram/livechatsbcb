import { createServer, type Server } from 'node:http';

// Stands in for Discord in the tests: the same answers on the same routes, with nothing real behind them.
export const FAKE_DISCORD = {
  port: 8797,
  url: 'http://127.0.0.1:8797/api',
  clientId: '100000000000000001',
  clientSecret: 'test-secret',
  botToken: 'test-bot-token',
  // A server whose members need no role, in the service started by the tests.
  openGuildId: '100000000000000999',
} as const;

const PERMISSION = { none: '0', view: '1024', admin: '8' } as const;

export type FakeOverwrite = { id: string; type: 0 | 1; allow: string; deny: string };
export type FakeChannel = {
  id: string;
  type: number;
  name: string;
  position: number;
  parent_id: string | null;
  permission_overwrites: FakeOverwrite[];
};
type FakeUser = { id: string; username: string; global_name: string | null; avatar: string | null };
type FakeMember = { roles: string[]; nick: string | null; avatar: string | null; pending: boolean };
type FakeGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner_id: string;
  roles: Array<{ id: string; name: string; permissions: string }>;
  channels: FakeChannel[];
  members: Map<string, FakeMember>;
};

export const hiddenFromEveryone = (guildId: string): FakeOverwrite => ({
  id: guildId,
  type: 0,
  allow: '0',
  deny: PERMISSION.view,
});

export const openedToRole = (roleId: string): FakeOverwrite => ({ id: roleId, type: 0, allow: PERMISSION.view, deny: '0' });

export class FakeDiscord {
  // When true, Discord answers nothing but errors, as during an outage.
  down = false;
  readonly calls: string[] = [];
  private readonly users = new Map<string, FakeUser>();
  private readonly guilds = new Map<string, FakeGuild>();
  private nextId = 200000000000000000n;
  private server: Server | null = null;

  newId(): string {
    this.nextId += 1n;
    return String(this.nextId);
  }

  addUser(name: string): string {
    const id = this.newId();
    this.users.set(id, { id, username: name.toLowerCase(), global_name: name, avatar: `hash${id}` });
    return id;
  }

  // Discord then falls back on one of its own default pictures.
  removeAvatar(userId: string): void {
    this.users.get(userId)!.avatar = null;
  }

  renameUser(userId: string, name: string): void {
    this.users.get(userId)!.global_name = name;
  }

  // A code Discord would hand to whoever logs in as this user.
  codeFor(userId: string): string {
    return `code-${userId}`;
  }

  addGuild(name: string, ownerId: string, id = this.newId()): string {
    this.guilds.set(id, {
      id,
      name,
      icon: `icon${id}`,
      owner_id: ownerId,
      roles: [{ id, name: '@everyone', permissions: PERMISSION.view }],
      channels: [],
      members: new Map(),
    });
    this.addMember(id, ownerId);
    return id;
  }

  // The bot gets kicked from the server.
  removeGuild(guildId: string): void {
    this.guilds.delete(guildId);
  }

  addRole(guildId: string, name: string, permissions: string = PERMISSION.none): string {
    const id = this.newId();
    this.guilds.get(guildId)!.roles.push({ id, name, permissions });
    return id;
  }

  addAdminRole(guildId: string): string {
    return this.addRole(guildId, 'Admin', PERMISSION.admin);
  }

  addChannel(guildId: string, channel: Partial<FakeChannel> & { name: string }): string {
    const id = channel.id ?? this.newId();
    this.guilds.get(guildId)!.channels.push({
      id,
      type: 0,
      position: 0,
      parent_id: null,
      permission_overwrites: [],
      ...channel,
    });
    return id;
  }

  setOverwrites(guildId: string, channelId: string, overwrites: FakeOverwrite[]): void {
    this.guilds.get(guildId)!.channels.find(({ id }) => id === channelId)!.permission_overwrites = overwrites;
  }

  renameChannel(guildId: string, channelId: string, name: string): void {
    this.guilds.get(guildId)!.channels.find(({ id }) => id === channelId)!.name = name;
  }

  addMember(guildId: string, userId: string, change: Partial<FakeMember> = {}): void {
    this.guilds.get(guildId)!.members.set(userId, { roles: [], nick: null, avatar: null, pending: false, ...change });
  }

  setRoles(guildId: string, userId: string, roles: string[]): void {
    this.guilds.get(guildId)!.members.get(userId)!.roles = roles;
  }

  removeMember(guildId: string, userId: string): void {
    this.guilds.get(guildId)!.members.delete(userId);
  }

  private route(method: string, path: string, authorization: string, body: string): { status: number; json?: unknown } {
    const isBot = authorization === `Bot ${FAKE_DISCORD.botToken}`;

    if (method === 'POST' && path === '/api/oauth2/token') {
      const expected = `Basic ${Buffer.from(`${FAKE_DISCORD.clientId}:${FAKE_DISCORD.clientSecret}`).toString('base64')}`;
      const form = new URLSearchParams(body);
      const userId = form.get('code')?.replace(/^code-/, '') ?? '';
      if (authorization !== expected || form.get('grant_type') !== 'authorization_code' || !form.get('redirect_uri')) {
        return { status: 401 };
      }
      if (!this.users.has(userId)) return { status: 400 };
      return { status: 200, json: { access_token: `user-${userId}`, token_type: 'Bearer', scope: 'identify' } };
    }

    if (method !== 'GET') return { status: 405 };

    if (path === '/api/users/@me') {
      const user = this.users.get(authorization.replace(/^Bearer user-/, ''));
      return user ? { status: 200, json: user } : { status: 401 };
    }

    if (!isBot) return { status: 401 };

    if (path.startsWith('/api/users/@me/guilds')) {
      return {
        status: 200,
        json: [...this.guilds.values()].map(({ id, name, icon }) => ({ id, name, icon })),
      };
    }

    const user = path.match(/^\/api\/users\/(\d+)$/);
    if (user) {
      const found = this.users.get(user[1]!);
      return found ? { status: 200, json: found } : { status: 404 };
    }

    const route = path.match(/^\/api\/guilds\/(\d+)(?:\/(channels|members\/(\d+)))?$/);
    if (!route) return { status: 404 };

    const guild = this.guilds.get(route[1]!);
    // What Discord answers on a server the bot isn't on.
    if (!guild) return { status: 403 };

    if (!route[2]) {
      const { id, name, icon, owner_id: ownerId, roles } = guild;
      return { status: 200, json: { id, name, icon, owner_id: ownerId, roles } };
    }
    if (route[2] === 'channels') return { status: 200, json: guild.channels };

    const member = guild.members.get(route[3]!);
    const memberUser = this.users.get(route[3]!);
    return member && memberUser ? { status: 200, json: { ...member, user: memberUser } } : { status: 404 };
  }

  start(): Promise<void> {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        this.calls.push(`${request.method} ${path}`);

        // Discord refuses clients that don't say who they are.
        const identified = request.headers['user-agent']?.startsWith('DiscordBot');
        const answer =
          this.down || !identified
            ? { status: this.down ? 503 : 403 }
            : this.route(
                request.method ?? '',
                path,
                request.headers.authorization ?? '',
                Buffer.concat(chunks).toString('utf8'),
              );

        response.writeHead(answer.status, { 'content-type': 'application/json' });
        response.end(answer.json === undefined ? '{}' : JSON.stringify(answer.json));
      });
    });
    return new Promise((done) => this.server!.listen(FAKE_DISCORD.port, '127.0.0.1', done));
  }

  stop(): Promise<void> {
    return new Promise((done) => {
      this.server?.closeAllConnections();
      this.server?.close(() => done());
    });
  }
}
