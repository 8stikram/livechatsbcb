import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { z } from 'zod';
import {
  AuthRedeemResponseSchema,
  GuildSummarySchema,
  SessionResponseSchema,
  type AuthRedeemResponse,
  type GuildSummary,
  type SessionResponse,
} from '@livechatsbcb/protocol';

const StoredDataSchema = z.object({
  login: AuthRedeemResponseSchema.nullable().default(null),
  addedGuilds: z.array(GuildSummarySchema).default([]),
  lastGuildId: z.string().nullable().default(null),
  session: SessionResponseSchema.nullable().default(null),
  privateSession: SessionResponseSchema.nullable().default(null),
});
type StoredData = z.infer<typeof StoredDataSchema>;

const dataPath = () => join(app.getPath('userData'), 'party.dat');

// The Mac ties this encryption to Apple's paid signature: without it, every update would ask for the Mac's password.
const canEncrypt = (): boolean => process.platform !== 'darwin' && safeStorage.isEncryptionAvailable();

const decode = (raw: Buffer): unknown => {
  const text = canEncrypt() ? safeStorage.decryptString(raw) : raw.toString('utf8');
  return JSON.parse(text);
};

const encode = (data: StoredData): Buffer => {
  const text = JSON.stringify(data);
  return canEncrypt() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
};

export class SessionStore {
  private data: StoredData;

  constructor() {
    this.data = this.load();
  }

  get login(): AuthRedeemResponse | null {
    return this.data.login;
  }

  get addedGuilds(): GuildSummary[] {
    return this.data.addedGuilds;
  }

  get lastGuildId(): string | null {
    return this.data.lastGuildId;
  }

  get privateSession(): SessionResponse | null {
    return this.data.privateSession;
  }

  get session(): SessionResponse | null {
    return this.data.session;
  }

  update(change: Partial<StoredData>): void {
    this.data = { ...this.data, ...change };
    this.save();
  }

  private load(): StoredData {
    const nothing = { login: null, addedGuilds: [], lastGuildId: null, session: null, privateSession: null };
    try {
      const stored = StoredDataSchema.parse(decode(readFileSync(dataPath())));
      // A party needs an account, so what an older version saved doesn't count.
      return stored.login ? stored : nothing;
    } catch {
      // No file yet, or one written by another Windows account: start again rather than refuse to open.
      return nothing;
    }
  }

  private save(): void {
    const target = dataPath();
    const temporary = `${target}.tmp`;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temporary, encode(this.data), { mode: 0o600 });
    try {
      renameSync(temporary, target);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }
}
