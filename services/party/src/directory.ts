import { DurableObject } from 'cloudflare:workers';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  type Account,
  type AuthRedeemResponse,
  type GuildSummary,
  type MeResponse,
} from '@livechatsbcb/protocol';
import { fetchGuilds, fetchUser, renewTokens, revokeTokens, type DiscordTokens } from './discord';
import { randomToken, seal, sealingKey, sha256, unseal } from './tokens';

const MINUTE = 60_000;
const FAILED_JOIN_LIMIT = { max: 10, windowMs: 10 * MINUTE };
const CREATE_LIMIT = { max: 10, windowMs: 60 * MINUTE };
const LOGIN_LIMIT = { max: 30, windowMs: 60 * MINUTE };

const DAY = 24 * 60 * MINUTE;
// Time to read Discord's page and click, then for the app to collect the result.
const LOGIN_WINDOW_MS = 10 * MINUTE;
const TICKET_WINDOW_MS = MINUTE;
const SESSION_MS = 90 * DAY;
const ACCOUNT_REFRESH_MS = DAY;
// If Discord goes quiet, the servers it last confirmed stay accessible for this long.
const STALE_GUILDS_LIMIT_MS = DAY;
// Someone asking for the latest list right after joining a server, but not for a call to Discord on every click.
const FRESH_GUILDS_MIN_AGE_MS = 30_000;
// Renewed this long before it runs out, rather than finding out from a refusal.
const RENEW_TOKENS_MARGIN_MS = 60 * MINUTE;

// The project must stay free. R2 has no spending limit of its own, so these are what keeps it inside its free tier:
// 10 GB stored, of which updates may use 600 MB, and 1 million paid-class operations a month.
const MEDIA_STORAGE_CAP_BYTES = 8 * 1024 * 1024 * 1024;
const MONTHLY_CLASS_A_CAP = 900_000;
const UPLOAD_WINDOW_MS = 120 * MINUTE;

type Limit = { max: number; windowMs: number };
type RateLimited = { ok: false; error: 'rate_limited' };
type StoredMedia = { key: string; upload_id: string; size: number; expires_at: number };
type SessionRow = { user_id: string; expires_at: number; last_used: number };
type AccountRow = {
  user_id: string;
  data: string;
  refreshed_at: number;
  discord_tokens: string;
  guilds: string | null;
  guilds_at: number;
};
type GuildList = { guilds: GuildSummary[]; complete: boolean };

export type GuildAccess = { ok: true; guild: GuildSummary } | { ok: false; error: 'signed_out' | 'forbidden' | 'discord_unavailable' };

const randomCode = (): string => {
  // Bytes at or above this multiple of the alphabet size are redrawn, so every character is equally likely.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = '';
  while (code.length < CODE_LENGTH) {
    const byte = crypto.getRandomValues(new Uint8Array(1))[0]!;
    if (byte < limit) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
};

// Single global object: owns the code-to-party table, so codes are unique and can change without moving a party.
export class Directory extends DurableObject<Env> {
  private sealing: Promise<CryptoKey> | null = null;
  private readonly fetchingGuilds = new Map<string, Promise<GuildList | null>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, party_id TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS media_storage (
        key TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        size INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS r2_usage (month TEXT PRIMARY KEY, class_a INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS logins (
        state TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        port INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_hash TEXT PRIMARY KEY,
        challenge TEXT NOT NULL,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS accounts (
        user_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        refreshed_at INTEGER NOT NULL,
        discord_tokens TEXT NOT NULL,
        guilds TEXT,
        guilds_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        last_used INTEGER NOT NULL
      );
    `);
  }

  openLogin(ip: string, challenge: string, port: number): { ok: true; state: string } | RateLimited {
    const key = `login:${ip}`;
    if (this.isLimited(key, LOGIN_LIMIT)) return { ok: false, error: 'rate_limited' };
    this.recordAttempt(key, LOGIN_LIMIT);

    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM logins WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec('DELETE FROM tickets WHERE expires_at < ?', now);
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE expires_at < ?', now);
    // Nobody logged in any more: what Discord gave for them has no reason to stay. The delay leaves time to finish a login.
    this.ctx.storage.sql.exec(
      'DELETE FROM accounts WHERE refreshed_at < ? AND user_id NOT IN (SELECT user_id FROM sessions)',
      now - LOGIN_WINDOW_MS,
    );

    const state = randomToken();
    this.ctx.storage.sql.exec(
      'INSERT INTO logins (state, challenge, port, expires_at) VALUES (?, ?, ?, ?)',
      state,
      challenge,
      port,
      now + LOGIN_WINDOW_MS,
    );
    return { ok: true, state };
  }

  // Only once: the address Discord sends the browser back to can end up in its history.
  takeLogin(state: string): { challenge: string; port: number } | null {
    const [row] = this.ctx.storage.sql
      .exec<{ challenge: string; port: number; expires_at: number }>('SELECT * FROM logins WHERE state = ?', state)
      .toArray();
    this.ctx.storage.sql.exec('DELETE FROM logins WHERE state = ?', state);
    return row && row.expires_at > Date.now() ? { challenge: row.challenge, port: row.port } : null;
  }

  async issueTicket(challenge: string, account: Account, tokens: DiscordTokens): Promise<string> {
    const ticket = randomToken();
    const ticketHash = await sha256(ticket);
    const sealedTokens = await seal(await this.sealingKey(), JSON.stringify(tokens));
    const now = Date.now();
    // The list starts empty, so that a new login always shows the servers of right now.
    this.ctx.storage.sql.exec(
      'INSERT OR REPLACE INTO accounts (user_id, data, refreshed_at, discord_tokens, guilds, guilds_at) VALUES (?, ?, ?, ?, NULL, 0)',
      account.id,
      JSON.stringify(account),
      now,
      sealedTokens,
    );
    this.ctx.storage.sql.exec(
      'INSERT INTO tickets (ticket_hash, challenge, user_id, expires_at) VALUES (?, ?, ?, ?)',
      ticketHash,
      challenge,
      account.id,
      now + TICKET_WINDOW_MS,
    );
    return ticket;
  }

  // Worthless without the secret behind the challenge, which only the app that started this login has.
  async redeemTicket(ticket: string, challenge: string): Promise<AuthRedeemResponse | null> {
    const ticketHash = await sha256(ticket);
    const token = randomToken();
    const tokenHash = await sha256(token);

    // No await from here on: a ticket must not be redeemed twice.
    const [row] = this.ctx.storage.sql
      .exec<{ challenge: string; user_id: string; expires_at: number }>('SELECT * FROM tickets WHERE ticket_hash = ?', ticketHash)
      .toArray();
    this.ctx.storage.sql.exec('DELETE FROM tickets WHERE ticket_hash = ?', ticketHash);
    if (!row || row.expires_at <= Date.now() || row.challenge !== challenge) return null;

    const account = this.storedAccount(row.user_id);
    if (!account) return null;

    const now = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO sessions (token_hash, user_id, expires_at, last_used) VALUES (?, ?, ?, ?)',
      tokenHash,
      row.user_id,
      now + SESSION_MS,
      now,
    );
    return { token, account };
  }

  async accountForToken(token: string): Promise<Account | null> {
    if (!token) return null;
    const tokenHash = await sha256(token);
    const [row] = this.ctx.storage.sql
      .exec<SessionRow>('SELECT user_id, expires_at, last_used FROM sessions WHERE token_hash = ?', tokenHash)
      .toArray();
    const now = Date.now();
    if (!row || row.expires_at <= now) return null;

    // Someone who keeps using the app stays logged in. Once a day is enough, as each of these is a write.
    if (now - row.last_used > DAY) {
      this.ctx.storage.sql.exec(
        'UPDATE sessions SET expires_at = ?, last_used = ? WHERE token_hash = ?',
        now + SESSION_MS,
        now,
        tokenHash,
      );
    }
    return this.storedAccount(row.user_id);
  }

  // Logged out everywhere means the Discord token has no more use, here or at Discord.
  async endSession(token: string): Promise<void> {
    const tokenHash = await sha256(token);
    const [session] = this.ctx.storage.sql
      .exec<{ user_id: string }>('SELECT user_id FROM sessions WHERE token_hash = ?', tokenHash)
      .toArray();
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
    if (!session) return;

    const [other] = this.ctx.storage.sql.exec('SELECT 1 FROM sessions WHERE user_id = ? LIMIT 1', session.user_id).toArray();
    if (other) return;

    const row = this.accountRow(session.user_id);
    this.ctx.storage.sql.exec('DELETE FROM accounts WHERE user_id = ?', session.user_id);
    const tokens = row && (await this.tokensOf(row));
    if (tokens) await revokeTokens(this.env, tokens);
  }

  // Null when the person is no longer logged in, which also covers having removed the app in Discord's settings.
  async overview(userId: string, fresh: boolean): Promise<MeResponse | null> {
    const usualAgeMs = Number(this.env.DISCORD_REFRESH_MS);
    const list = await this.guildList(userId, fresh ? Math.min(FRESH_GUILDS_MIN_AGE_MS, usualAgeMs) : usualAgeMs);
    const account = this.storedAccount(userId);
    return list && account ? { account, guilds: list.guilds, partial: !list.complete } : null;
  }

  async guildAccess(userId: string, guildId: string): Promise<GuildAccess> {
    const list = await this.guildList(userId, Number(this.env.DISCORD_REFRESH_MS));
    if (!list) return { ok: false, error: 'signed_out' };

    const guild = list.guilds.find(({ id }) => id === guildId);
    if (guild) return { ok: true, guild };
    return { ok: false, error: list.complete ? 'forbidden' : 'discord_unavailable' };
  }

  // "unknown" is for when Discord isn't answering, and never costs anyone their place.
  async isGuildMember(userId: string, guildId: string): Promise<'yes' | 'no' | 'unknown'> {
    const list = await this.guildList(userId, Number(this.env.DISCORD_REFRESH_MS));
    if (!list) return 'no';
    if (list.guilds.some(({ id }) => id === guildId)) return 'yes';
    return list.complete ? 'no' : 'unknown';
  }

  private async guildList(userId: string, maxAgeMs: number): Promise<GuildList | null> {
    const row = this.accountRow(userId);
    if (!row) return null;
    if (row.guilds && Date.now() - row.guilds_at < maxAgeMs) {
      return { guilds: JSON.parse(row.guilds) as GuildSummary[], complete: true };
    }

    // Several checks can arrive together, and a refresh token only works once: they all wait for the same answer.
    const running = this.fetchingGuilds.get(userId);
    if (running) return running;
    const fetching = this.fetchGuildList(row).finally(() => this.fetchingGuilds.delete(userId));
    this.fetchingGuilds.set(userId, fetching);
    return fetching;
  }

  private async fetchGuildList(row: AccountRow): Promise<GuildList | null> {
    const earlier = (): GuildList => ({
      guilds: row.guilds && Date.now() - row.guilds_at < STALE_GUILDS_LIMIT_MS ? (JSON.parse(row.guilds) as GuildSummary[]) : [],
      complete: false,
    });

    let tokens = await this.tokensOf(row);
    if (!tokens) return this.forgetAccount(row.user_id);

    if (tokens.expiresAt - Date.now() < RENEW_TOKENS_MARGIN_MS) {
      const renewed = await this.renew(row.user_id, tokens);
      if (renewed === 'revoked') return null;
      if (renewed === 'unavailable') return earlier();
      tokens = renewed;
    }

    let guilds = await fetchGuilds(this.env, tokens.access);
    if (guilds.status === 'refused') {
      const renewed = await this.renew(row.user_id, tokens);
      if (renewed === 'revoked') return null;
      if (renewed === 'unavailable') return earlier();
      tokens = renewed;
      guilds = await fetchGuilds(this.env, tokens.access);
    }
    if (guilds.status === 'refused') return this.forgetAccount(row.user_id);
    if (guilds.status !== 'ok') return earlier();

    // A new pseudo or picture on Discord shows up here without having to log in again.
    const now = Date.now();
    const user = now - row.refreshed_at > ACCOUNT_REFRESH_MS ? await fetchUser(this.env, tokens.access) : null;
    this.ctx.storage.sql.exec(
      'UPDATE accounts SET guilds = ?, guilds_at = ?, data = ?, refreshed_at = ? WHERE user_id = ?',
      JSON.stringify(guilds.value),
      now,
      user?.status === 'ok' ? JSON.stringify(user.value) : row.data,
      user?.status === 'ok' ? now : row.refreshed_at,
      row.user_id,
    );
    return { guilds: guilds.value, complete: true };
  }

  private async renew(userId: string, tokens: DiscordTokens): Promise<DiscordTokens | 'revoked' | 'unavailable'> {
    const renewed = await renewTokens(this.env, tokens.refresh);
    if (renewed.status === 'unavailable') return 'unavailable';
    if (renewed.status === 'refused') {
      this.forgetAccount(userId);
      return 'revoked';
    }
    this.ctx.storage.sql.exec(
      'UPDATE accounts SET discord_tokens = ? WHERE user_id = ?',
      await seal(await this.sealingKey(), JSON.stringify(renewed.value)),
      userId,
    );
    return renewed.value;
  }

  private forgetAccount(userId: string): null {
    this.ctx.storage.sql.exec('DELETE FROM sessions WHERE user_id = ?', userId);
    this.ctx.storage.sql.exec('DELETE FROM accounts WHERE user_id = ?', userId);
    return null;
  }

  private async tokensOf(row: AccountRow): Promise<DiscordTokens | null> {
    const text = await unseal(await this.sealingKey(), row.discord_tokens);
    return text ? (JSON.parse(text) as DiscordTokens) : null;
  }

  private sealingKey(): Promise<CryptoKey> {
    this.sealing ??= sealingKey(this.env.DISCORD_CLIENT_SECRET);
    return this.sealing;
  }

    allocate(ip: string): { ok: true; partyId: string; code: string } | RateLimited {
    const key = `create:${ip}`;
    if (this.isLimited(key, CREATE_LIMIT)) return { ok: false, error: 'rate_limited' };
    this.recordAttempt(key, CREATE_LIMIT);

    const partyId = crypto.randomUUID();
    const code = this.unusedCode();
    this.ctx.storage.sql.exec('INSERT INTO codes (code, party_id) VALUES (?, ?)', code, partyId);
    return { ok: true, partyId, code };
  }

  resolve(code: string, ip: string): { ok: true; partyId: string } | RateLimited | { ok: false; error: 'code_not_found' } {
    const key = `join:${ip}`;
    if (this.isLimited(key, FAILED_JOIN_LIMIT)) return { ok: false, error: 'rate_limited' };

    const [row] = this.ctx.storage.sql
      .exec<{ party_id: string }>('SELECT party_id FROM codes WHERE code = ?', code)
      .toArray();
    if (row) return { ok: true, partyId: row.party_id };

    this.recordAttempt(key, FAILED_JOIN_LIMIT);
    return { ok: false, error: 'code_not_found' };
  }

  rotate(partyId: string, currentCode: string): string {
    const code = this.unusedCode();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM codes WHERE code = ? AND party_id = ?', currentCode, partyId);
      this.ctx.storage.sql.exec('INSERT INTO codes (code, party_id) VALUES (?, ?)', code, partyId);
    });
    return code;
  }

  release(code: string): void {
    this.ctx.storage.sql.exec('DELETE FROM codes WHERE code = ?', code);
  }

  async openUpload(
    key: string,
    size: number,
    contentType: string,
    classAOperations: number,
  ): Promise<{ ok: true; uploadId: string } | { ok: false; error: 'storage_full' }> {
    const month = new Date().toISOString().slice(0, 7);
    const [stored] = this.ctx.storage.sql
      .exec<{ total: number }>('SELECT COALESCE(SUM(size), 0) AS total FROM media_storage')
      .toArray();
    const [usage] = this.ctx.storage.sql
      .exec<{ class_a: number }>('SELECT class_a FROM r2_usage WHERE month = ?', month)
      .toArray();
    const operations = (usage?.class_a ?? 0) + classAOperations;
    if ((stored?.total ?? 0) + size > MEDIA_STORAGE_CAP_BYTES || operations > MONTHLY_CLASS_A_CAP) {
      return { ok: false, error: 'storage_full' };
    }

    // Reserved before the first await, so two uploads can't both take the last of the space.
    this.ctx.storage.sql.exec(
      'INSERT INTO media_storage (key, upload_id, size, expires_at) VALUES (?, ?, ?, ?)',
      key,
      '',
      size,
      Date.now() + UPLOAD_WINDOW_MS,
    );
    this.ctx.storage.sql.exec('INSERT OR REPLACE INTO r2_usage (month, class_a) VALUES (?, ?)', month, operations);
    this.scheduleCleanup();

    const upload = await this.env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType } });
    this.ctx.storage.sql.exec('UPDATE media_storage SET upload_id = ? WHERE key = ?', upload.uploadId, key);
    return { ok: true, uploadId: upload.uploadId };
  }

  confirmUpload(key: string): void {
    const expiresAt = Date.now() + Number(this.env.MEDIA_RETENTION_MS);
    this.ctx.storage.sql.exec('UPDATE media_storage SET expires_at = ? WHERE key = ?', expiresAt, key);
    this.scheduleCleanup();
  }

  async closeUpload(key: string): Promise<void> {
    const [row] = this.ctx.storage.sql.exec<StoredMedia>('SELECT * FROM media_storage WHERE key = ?', key).toArray();
    if (row) await this.discard(row);
    this.scheduleCleanup();
  }

  override async alarm(): Promise<void> {
    const expired = this.ctx.storage.sql
      .exec<StoredMedia>('SELECT * FROM media_storage WHERE expires_at <= ?', Date.now())
      .toArray();
    for (const row of expired) await this.discard(row);
    this.scheduleCleanup();
  }

  // The space only counts as free once the file is really gone.
  private async discard({ key, upload_id: uploadId }: StoredMedia): Promise<void> {
    // Aborting fails on a finished upload and deleting does nothing on an unfinished one, so do both.
    await this.env.MEDIA.resumeMultipartUpload(key, uploadId)
      .abort()
      .catch(() => {});
    await this.env.MEDIA.delete(key);
    this.ctx.storage.sql.exec('DELETE FROM media_storage WHERE key = ?', key);
  }

  private scheduleCleanup(): void {
    const [row] = this.ctx.storage.sql
      .exec<{ next: number | null }>('SELECT MIN(expires_at) AS next FROM media_storage')
      .toArray();
    if (row?.next != null) void this.ctx.storage.setAlarm(row.next);
    else void this.ctx.storage.deleteAlarm();
  }

  private accountRow(userId: string): AccountRow | undefined {
    const [row] = this.ctx.storage.sql.exec<AccountRow>('SELECT * FROM accounts WHERE user_id = ?', userId).toArray();
    return row;
  }

  private storedAccount(userId: string): Account | null {
    const row = this.accountRow(userId);
    return row ? (JSON.parse(row.data) as Account) : null;
  }

  private unusedCode(): string {
    for (;;) {
      const code = randomCode();
      const [taken] = this.ctx.storage.sql.exec('SELECT 1 FROM codes WHERE code = ?', code).toArray();
      if (!taken) return code;
    }
  }

  private isLimited(key: string, limit: Limit): boolean {
    const [row] = this.ctx.storage.sql
      .exec<{ window_start: number; count: number }>('SELECT window_start, count FROM attempts WHERE key = ?', key)
      .toArray();
    return row !== undefined && Date.now() - row.window_start < limit.windowMs && row.count >= limit.max;
  }

  private recordAttempt(key: string, limit: Limit): void {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      `INSERT INTO attempts (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN ?2 - window_start < ?3 THEN count + 1 ELSE 1 END,
         window_start = CASE WHEN ?2 - window_start < ?3 THEN window_start ELSE ?2 END`,
      key,
      now,
      limit.windowMs,
    );
    this.ctx.storage.sql.exec('DELETE FROM attempts WHERE window_start < ?', now - 2 * CREATE_LIMIT.windowMs);
  }
}
