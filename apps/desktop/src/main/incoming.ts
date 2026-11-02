import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import { MAX_MEDIA_BYTES, type MediaContentType } from '@livechatsbcb/protocol';
import { app } from 'electron';
import type { IncomingError } from '../shared/ipc';
import { CONTENT_TYPE_BY_EXTENSION, contentTypeOf, extensionOf } from './media-files';

// Pasted pictures and files from links have no place on the PC until they are given one.
const KEEP_MS = 24 * 60 * 60 * 1000;
const LINK_TIMEOUT_MS = 2 * 60 * 1000;

const OTHER_NAMES: Record<string, MediaContentType> = {
  'image/jpg': 'image/jpeg',
  'video/quicktime': 'video/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
};

const known = (contentType: string): MediaContentType | null => {
  if (Object.values(CONTENT_TYPE_BY_EXTENSION).includes(contentType as MediaContentType)) return contentType as MediaContentType;
  return OTHER_NAMES[contentType] ?? null;
};

const folder = () => join(app.getPath('userData'), 'pasted');

const newPath = async (contentType: MediaContentType): Promise<string> => {
  await mkdir(folder(), { recursive: true });
  return join(folder(), `${randomUUID()}.${extensionOf(contentType)}`);
};

const cleanName = (name: string, contentType: MediaContentType): string => {
  const clean = name.replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100) || 'Collé';
  return contentTypeOf(clean) ? clean : `${clean}.${extensionOf(contentType)}`;
};

export type Incoming = { path: string; name: string; size: number; contentType: MediaContentType };
type Outcome = { ok: true; file: Incoming } | { ok: false; error: IncomingError };

export const savePastedImage = async (bytes: Uint8Array, type: string, name: string): Promise<Outcome> => {
  const contentType = known(type);
  if (!contentType) return { ok: false, error: 'unsupported' };
  if (bytes.length === 0) return { ok: false, error: 'empty' };
  if (bytes.length > MAX_MEDIA_BYTES) return { ok: false, error: 'too_large' };
  const path = await newPath(contentType);
  await writeFile(path, bytes);
  return { ok: true, file: { path, name: cleanName(name, contentType), size: bytes.length, contentType } };
};

export const downloadLink = async (link: string): Promise<Outcome> => {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { ok: false, error: 'bad_link' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: 'bad_link' };

  let path: string | null = null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(LINK_TIMEOUT_MS) });
    if (!response.ok || !response.body) return { ok: false, error: 'bad_link' };

    const stated = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const contentType = known(stated) ?? (stated === 'application/octet-stream' || !stated ? contentTypeOf(url.pathname) : null);
    if (!contentType) return { ok: false, error: 'unsupported' };
    if (Number(response.headers.get('content-length') ?? 0) > MAX_MEDIA_BYTES) return { ok: false, error: 'too_large' };

    path = await newPath(contentType);
    let size = 0;
    const counted = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        done(size > MAX_MEDIA_BYTES ? new Error('too_large') : null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body as never), counted, createWriteStream(path));
    if (size === 0) {
      await rm(path, { force: true });
      return { ok: false, error: 'empty' };
    }

    const last = decodeURIComponent(url.pathname.split('/').pop() ?? '') || `Lien${extname(path)}`;
    return { ok: true, file: { path, name: cleanName(last, contentType), size, contentType } };
  } catch (error) {
    if (path) await rm(path, { force: true }).catch(() => {});
    return { ok: false, error: error instanceof Error && error.message === 'too_large' ? 'too_large' : 'bad_link' };
  }
};

export const cleanPasted = async (stillUsed: (path: string) => boolean): Promise<void> => {
  const names = await readdir(folder()).catch(() => []);
  for (const name of names) {
    const path = join(folder(), name);
    const info = await stat(path).catch(() => null);
    if (info && Date.now() - info.mtimeMs > KEEP_MS && !stillUsed(path)) await rm(path, { force: true }).catch(() => {});
  }
};
