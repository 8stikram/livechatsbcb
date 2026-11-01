import { createServer, type Server } from 'node:http';

// Stands in for Discord in the tests: the same answers on the same routes, with nothing real behind them.
export const FAKE_DISCORD = {
  port: 8797,
  url: 'http://127.0.0.1:8797/api',
  clientId: '100000000000000001',
  clientSecret: 'test-secret',
} as const;

type FakeUser = { id: string; username: string; global_name: string | null; avatar: string | null };
type FakeGuild = { id: string; name: string; icon: string | null; members: Set<string> };
type FakeGrant = { userId: string; access: string; refresh: string };

export class FakeDiscord {
  // When true, Discord answers nothing but errors, as during an outage.
  down = false;
  // In seconds, as Discord says it.
  tokenLifetime = 604_800;
  readonly calls: string[] = [];
  private readonly users = new Map<string, FakeUser>();
  private readonly guilds = new Map<string, FakeGuild>();
  private grants: FakeGrant[] = [];
  private nextId = 200000000000000000n;
  private nextToken = 0;
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

  addGuild(name: string, id = this.newId()): string {
    this.guilds.set(id, { id, name, icon: `icon${id}`, members: new Set() });
    return id;
  }

  renameGuild(guildId: string, name: string): void {
    this.guilds.get(guildId)!.name = name;
  }

  addMember(guildId: string, userId: string): void {
    this.guilds.get(guildId)!.members.add(userId);
  }

  removeMember(guildId: string, userId: string): void {
    this.guilds.get(guildId)!.members.delete(userId);
  }

  // Discord stops accepting the current access tokens, but they can still be renewed.
  expireAccessTokens(userId: string): void {
    for (const grant of this.grants) if (grant.userId === userId) grant.access = '';
  }

  // The person removes the app from their authorized apps, in Discord's settings.
  removeAuthorization(userId: string): void {
    this.grants = this.grants.filter((grant) => grant.userId !== userId);
  }

  private grantFor(userId: string): { status: number; json: unknown } {
    this.nextToken += 1;
    const grant = { userId, access: `access-${this.nextToken}`, refresh: `refresh-${this.nextToken}` };
    this.grants.push(grant);
    return {
      status: 200,
      json: {
        access_token: grant.access,
        refresh_token: grant.refresh,
        token_type: 'Bearer',
        expires_in: this.tokenLifetime,
        scope: 'identify guilds',
      },
    };
  }

  private route(method: string, path: string, authorization: string, body: string): { status: number; json?: unknown } {
    if (method === 'POST' && path.startsWith('/api/oauth2/token')) {
      const expected = `Basic ${Buffer.from(`${FAKE_DISCORD.clientId}:${FAKE_DISCORD.clientSecret}`).toString('base64')}`;
      if (authorization !== expected) return { status: 401 };
      const form = new URLSearchParams(body);

      if (path === '/api/oauth2/token/revoke') {
        this.grants = this.grants.filter((grant) => grant.refresh !== form.get('token'));
        return { status: 200 };
      }

      if (form.get('grant_type') === 'authorization_code') {
        const userId = form.get('code')?.replace(/^code-/, '') ?? '';
        if (!this.users.has(userId) || !form.get('redirect_uri')) return { status: 400, json: { error: 'invalid_grant' } };
        return this.grantFor(userId);
      }

      if (form.get('grant_type') === 'refresh_token') {
        // Works once: the new one replaces it.
        const grant = this.grants.find(({ refresh }) => refresh === form.get('refresh_token'));
        if (!grant) return { status: 400, json: { error: 'invalid_grant' } };
        this.grants = this.grants.filter((other) => other !== grant);
        return this.grantFor(grant.userId);
      }
      return { status: 400 };
    }

    if (method !== 'GET') return { status: 405 };

    const token = authorization.replace(/^Bearer /, '');
    const grant = token ? this.grants.find(({ access }) => access === token) : undefined;
    if (!grant) return { status: 401 };

    if (path === '/api/users/@me') return { status: 200, json: this.users.get(grant.userId) };
    if (path === '/api/users/@me/guilds') {
      return {
        status: 200,
        json: [...this.guilds.values()]
          .filter(({ members }) => members.has(grant.userId))
          .map(({ id, name, icon }) => ({ id, name, icon, owner: false, permissions: '0' })),
      };
    }
    return { status: 404 };
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
