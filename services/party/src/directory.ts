import { DurableObject } from 'cloudflare:workers';
import { CODE_ALPHABET, CODE_LENGTH } from '@livechatsbcb/protocol';

const MINUTE = 60_000;
const FAILED_JOIN_LIMIT = { max: 10, windowMs: 10 * MINUTE };
const CREATE_LIMIT = { max: 10, windowMs: 60 * MINUTE };

// The project must stay free. R2 has no spending limit of its own, so these are what keeps it inside its free tier:
// 10 GB stored, of which updates may use 600 MB, and 1 million paid-class operations a month.
const MEDIA_STORAGE_CAP_BYTES = 8 * 1024 * 1024 * 1024;
const MONTHLY_CLASS_A_CAP = 900_000;
const UPLOAD_WINDOW_MS = 120 * MINUTE;

type Limit = { max: number; windowMs: number };
type RateLimited = { ok: false; error: 'rate_limited' };
type StoredMedia = { key: string; upload_id: string; size: number; expires_at: number };

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
      CREATE TABLE IF NOT EXISTS media_storage (
        key TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL,
        size INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS r2_usage (month TEXT PRIMARY KEY, class_a INTEGER NOT NULL);
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
