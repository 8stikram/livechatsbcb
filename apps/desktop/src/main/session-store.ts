import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { z } from 'zod';
import { AuthRedeemResponseSchema, SessionResponseSchema, type AuthRedeemResponse, type SessionResponse } from '@livechatsbcb/protocol';

const StoredDataSchema = z.object({
  login: AuthRedeemResponseSchema.nullable().default(null),
  guildId: z.string().nullable().default(null),
  session: SessionResponseSchema.nullable().default(null),
});
type StoredData = z.infer<typeof StoredDataSchema>;

const dataPath = () => join(app.getPath('userData'), 'party.dat');

const decode = (raw: Buffer): unknown => {
  const text = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8');
  return JSON.parse(text);
};

const encode = (data: StoredData): Buffer => {
  const text = JSON.stringify(data);
  return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
};

export class SessionStore {
  private data: StoredData;

  constructor() {
    this.data = this.load();
  }

  get login(): AuthRedeemResponse | null {
    return this.data.login;
  }

  get guildId(): string | null {
    return this.data.guildId;
  }

  get session(): SessionResponse | null {
    return this.data.session;
  }

  update(change: Partial<StoredData>): void {
    this.data = { ...this.data, ...change };
    this.save();
  }

  private load(): StoredData {
    const nothing = { login: null, guildId: null, session: null };
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
    writeFileSync(temporary, encode(this.data));
    try {
      renameSync(temporary, target);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }
}
