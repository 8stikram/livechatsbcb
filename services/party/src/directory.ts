import { DurableObject } from 'cloudflare:workers';
import { CODE_ALPHABET, CODE_LENGTH } from '@livechatsbcb/protocol';

const MINUTE = 60_000;
const FAILED_JOIN_LIMIT = { max: 10, windowMs: 10 * MINUTE };
const CREATE_LIMIT = { max: 10, windowMs: 60 * MINUTE };

type Limit = { max: number; windowMs: number };
type RateLimited = { ok: false; error: 'rate_limited' };

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
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, party_id TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
    `);
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
