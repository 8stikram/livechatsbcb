import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, safeStorage } from 'electron';
import { z } from 'zod';
import { SessionResponseSchema, type SessionResponse } from '@livechatsbcb/protocol';

const StoredDataSchema = z.object({
  lastName: z.string().default(''),
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

  get lastName(): string {
    return this.data.lastName;
  }

  get session(): SessionResponse | null {
    return this.data.session;
  }

  update(change: Partial<StoredData>): void {
    this.data = { ...this.data, ...change };
    this.save();
  }

  private load(): StoredData {
    try {
      return StoredDataSchema.parse(decode(readFileSync(dataPath())));
    } catch {
      // No file yet, or one written by another Windows account: start again rather than refuse to open.
      return { lastName: '', session: null };
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
