import { createWriteStream, rmSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { MediaContentType, QueueItem, SessionResponse } from '@livechatsbcb/protocol';
import { forgetMediaFile, registerMediaFile } from './media-files';
import { fetchMedia } from './party-api';

const RETRY_DELAYS_MS = [0, 1_000, 3_000, 8_000];

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

type Entry = {
  controller: AbortController;
  // Set once the file is complete on this PC.
  file: { id: string; url: string } | null;
  // Only downloaded copies get deleted: a file the member sent stays where they keep it.
  downloadedTo: string | null;
  // An upload is registered before the service announces it, so it mustn't be dropped for not being in the queue yet.
  seenInQueue: boolean;
  reported: boolean;
};

type RemoteFile = Pick<QueueItem, 'fileId' | 'size' | 'contentType'>;

// Files are fetched ahead of playback, so everyone can start on time and the service only serves each one once per PC.
export class MediaCache {
  private readonly entries = new Map<string, Entry>();
  private session: SessionResponse | null = null;
  private queue: QueueItem[] = [];
  private pumping = false;

  constructor(
    private readonly root: string,
    private readonly onReady: (mediaId: string) => void,
  ) {
    rmSync(root, { recursive: true, force: true });
  }

  urlOf(mediaId: string): string | null {
    return this.entries.get(mediaId)?.file?.url ?? null;
  }

  adopt(mediaId: string, path: string, contentType: MediaContentType): void {
    this.entries.set(mediaId, {
      controller: new AbortController(),
      file: registerMediaFile(path, contentType),
      downloadedTo: null,
      seenInQueue: false,
      reported: false,
    });
  }

  forget(mediaId: string): void {
    const entry = this.entries.get(mediaId);
    if (!entry) return;

    this.entries.delete(mediaId);
    entry.controller.abort();
    if (entry.file) forgetMediaFile(entry.file.id);
    // Windows can still hold the file for a moment after playback stops. Whatever remains goes at the next launch.
    if (entry.downloadedTo) void rm(entry.downloadedTo, { force: true, maxRetries: 3, retryDelay: 500 }).catch(() => {});
  }

  clear(): void {
    this.session = null;
    this.queue = [];
    for (const mediaId of [...this.entries.keys()]) this.forget(mediaId);
  }

  sync(session: SessionResponse, queue: QueueItem[]): void {
    this.session = session;
    this.queue = queue;

    const queued = new Set(queue.map((item) => item.id));
    for (const [mediaId, entry] of this.entries) {
      if (queued.has(mediaId)) entry.seenInQueue = true;
      else if (entry.seenInQueue) this.forget(mediaId);
    }

    for (const item of queue) this.reportIfReady(item.id);
    void this.pump();
  }

  // For this PC alone: nobody is waiting for it, and it stays until forgotten.
  fetchForMe(key: string, session: SessionResponse, file: RemoteFile): Promise<boolean> {
    return this.download(session, key, file, { reported: true, seenInQueue: false });
  }

  private reportIfReady(mediaId: string): void {
    const entry = this.entries.get(mediaId);
    if (!entry?.file || entry.reported) return;
    entry.reported = true;
    this.onReady(mediaId);
  }

  // One at a time, in queue order, so the media about to play is never held up by a later one.
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const next = this.queue.find((item) => item.contentType && !this.entries.has(item.id));
        if (!next || !this.session) return;
        await this.download(this.session, next.id, next, { reported: false, seenInQueue: true });
      }
    } finally {
      this.pumping = false;
    }
  }

  private async download(
    session: SessionResponse,
    key: string,
    file: RemoteFile,
    tracking: Pick<Entry, 'reported' | 'seenInQueue'>,
  ): Promise<boolean> {
    const entry: Entry = { controller: new AbortController(), file: null, downloadedTo: null, ...tracking };
    this.entries.set(key, entry);

    const { signal } = entry.controller;
    const target = join(this.root, key);
    const partial = `${target}.part`;
    await mkdir(this.root, { recursive: true });

    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await sleep(delay);
      if (signal.aborted) break;

      try {
        const response = await fetchMedia(session, file.fileId!, signal);
        if (response.status === 401 || response.status === 404) break;
        if (!response.ok || !response.body) continue;

        await pipeline(Readable.fromWeb(response.body as NodeReadableStream), createWriteStream(partial), { signal });
        if ((await stat(partial)).size !== file.size) continue;

        await rename(partial, target);
        entry.downloadedTo = target;
        entry.file = registerMediaFile(target, file.contentType!);
        // Left the queue while finishing: nobody is going to ask for it.
        if (signal.aborted) break;
        this.reportIfReady(key);
        return true;
      } catch {
        // Lost connection or a full disk: retried below, and in the end this PC just shows the rest without the file.
      }
    }

    if (entry.file) forgetMediaFile(entry.file.id);
    await rm(partial, { force: true }).catch(() => {});
    await rm(target, { force: true }).catch(() => {});
    return false;
  }
}
