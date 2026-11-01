import { randomUUID } from 'node:crypto';
import { open, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import { protocol } from 'electron';
import type { MediaContentType } from '@livechatsbcb/protocol';

export const MEDIA_SCHEME = 'lcmedia';

export const CONTENT_TYPE_BY_EXTENSION: Record<string, MediaContentType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
};

export const contentTypeOf = (path: string): MediaContentType | null =>
  CONTENT_TYPE_BY_EXTENSION[extname(path).slice(1).toLowerCase()] ?? null;

type MediaFile = { path: string; contentType: MediaContentType };

const READ_CHUNK_BYTES = 256 * 1024;

// Pages only ever get an opaque id, so no URL can name a file that wasn't registered here.
const files = new Map<string, MediaFile>();

export const registerMediaFile = (path: string, contentType: MediaContentType): { id: string; url: string } => {
  const id = randomUUID();
  files.set(id, { path, contentType });
  return { id, url: `${MEDIA_SCHEME}://file/${id}` };
};

export const forgetMediaFile = (id: string): void => {
  files.delete(id);
};

const parseRange = (header: string | null, size: number): { start: number; end: number } | null => {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || (!match[1] && !match[2])) return null;

  // "bytes=-500" means the last 500 bytes.
  if (!match[1]) return { start: Math.max(0, size - Number(match[2])), end: size - 1 };
  return { start: Number(match[1]), end: match[2] ? Math.min(Number(match[2]), size - 1) : size - 1 };
};

// Written by hand because a player drops its request at every seek, and a stream converted from a Node one can then
// throw from nowhere, outside any handler, in the main process.
const readFileRange = (path: string, start: number, end: number): ReadableStream<Uint8Array> => {
  let position = start;
  let file: Awaited<ReturnType<typeof open>> | null = null;

  const close = async () => {
    const opened = file;
    file = null;
    await opened?.close().catch(() => {});
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        file ??= await open(path, 'r');
        const buffer = new Uint8Array(Math.min(READ_CHUNK_BYTES, end - position + 1));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position);
        position += bytesRead;
        if (bytesRead > 0) controller.enqueue(buffer.subarray(0, bytesRead));
        if (bytesRead === 0 || position > end) {
          await close();
          controller.close();
        }
      } catch (error) {
        await close();
        controller.error(error);
      }
    },
    cancel: close,
  });
};

// A video can only be seeked if its source answers range requests.
export const serveMediaFiles = (): void => {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const { host, pathname } = new URL(request.url);
    const file = host === 'file' ? files.get(pathname.slice(1)) : undefined;
    if (!file) return new Response('Not found', { status: 404 });

    const { size } = await stat(file.path).catch(() => ({ size: -1 }));
    if (size < 0) return new Response('Not found', { status: 404 });

    const range = parseRange(request.headers.get('range'), size);
    if (range && (range.start >= size || range.start > range.end)) {
      return new Response('Range not satisfiable', {
        status: 416,
        headers: { 'content-range': `bytes */${size}` },
      });
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;

    return new Response(readFileRange(file.path, start, end), {
      status: range ? 206 : 200,
      headers: {
        'content-type': file.contentType,
        'content-length': String(end - start + 1),
        'accept-ranges': 'bytes',
        'x-content-type-options': 'nosniff',
        ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  });
};
