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
  mediaId: string;
  controller: AbortController;
  // Set once the file is complete on this PC.
  file: { id: string; url: string } | null;
  // Only downloaded copies get deleted: a file the member sent stays where they keep it.
  downloadedTo: string | null;
};

type RemoteFile = QueueItem['files'][number];

// Files are fetched ahead of playback, so everyone can start on time and the service only serves each one once per PC.
// A media's files are told apart by their place in it, as the same stored file can be played twice in a row.
export class MediaCache {
  private readonly entries = new Map<string, Entry>();
  // An upload is registered before the service announces it, so it mustn't be dropped for not being in the queue yet.
  private readonly seenInQueue = new Set<string>();
  private readonly reported = new Set<string>();
  private session: SessionResponse | null = null;
  private queue: QueueItem[] = [];
  private pumping = false;

  constructor(
    private readonly root: string,
    private readonly onReady: (mediaId: string) => void,
  ) {
    rmSync(root, { recursive: true, force: true });
  }

  private keyOf(mediaId: string, fileId: string): string {
    return `${mediaId}.${fileId}`;
  }

  urlOf(mediaId: string, fileId: string): string | null {
    return this.entries.get(this.keyOf(mediaId, fileId))?.file?.url ?? null;
  }

  adopt(mediaId: string, fileId: string, path: string, contentType: MediaContentType): void {
    this.entries.set(this.keyOf(mediaId, fileId), {
      mediaId,
      controller: new AbortController(),
      file: registerMediaFile(path, contentType),
      downloadedTo: null,
    });
  }

  forget(mediaId: string): void {
    this.seenInQueue.delete(mediaId);
    this.reported.delete(mediaId);
    for (const [key, entry] of this.entries) {
      if (entry.mediaId !== mediaId) continue;

      this.entries.delete(key);
      entry.controller.abort();
      if (entry.file) forgetMediaFile(entry.file.id);
      // Windows can still hold the file for a moment after playback stops. Whatever remains goes at the next launch.
      if (entry.downloadedTo) void rm(entry.downloadedTo, { force: true, maxRetries: 3, retryDelay: 500 }).catch(() => {});
    }
  }

  clear(): void {
    this.session = null;
    this.queue = [];
    for (const { mediaId } of [...this.entries.values()]) this.forget(mediaId);
  }

  sync(session: SessionResponse, queue: QueueItem[]): void {
    this.session = session;
    this.queue = queue;

    const queued = new Set(queue.map((item) => item.id));
    for (const id of queued) this.seenInQueue.add(id);
    for (const { mediaId } of [...this.entries.values()]) {
      if (!queued.has(mediaId) && this.seenInQueue.has(mediaId)) this.forget(mediaId);
    }
    for (const mediaId of this.seenInQueue) {
      if (!queued.has(mediaId)) this.seenInQueue.delete(mediaId);
    }

    for (const item of queue) this.reportIfReady(item);
    void this.pump();
  }

  // For this PC alone: nobody is waiting for it, and it stays until forgotten.
  async fetchForMe(key: string, session: SessionResponse, files: RemoteFile[]): Promise<boolean> {
    for (const file of files) {
      if (!(await this.download(session, key, file))) return false;
    }
    return true;
  }

  private reportIfReady(item: QueueItem): void {
    if (item.files.length === 0 || this.reported.has(item.id)) return;
    if (!item.files.every((file) => this.urlOf(item.id, file.id))) return;
    this.reported.add(item.id);
    this.onReady(item.id);
  }

  // One at a time, in queue order, so the media about to play is never held up by a later one.
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const item = this.queue.find(({ id, files }) => files.some((file) => !this.entries.has(this.keyOf(id, file.id))));
        if (!item || !this.session) return;
        const file = item.files.find(({ id }) => !this.entries.has(this.keyOf(item.id, id)))!;
        if (await this.download(this.session, item.id, file)) this.reportIfReady(item);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async download(session: SessionResponse, mediaId: string, file: RemoteFile): Promise<boolean> {
    const key = this.keyOf(mediaId, file.id);
    const entry: Entry = { mediaId, controller: new AbortController(), file: null, downloadedTo: null };
    this.entries.set(key, entry);

    const { signal } = entry.controller;
    const target = join(this.root, key);
    const partial = `${target}.part`;
    await mkdir(this.root, { recursive: true });

    for (const delay of RETRY_DELAYS_MS) {
      if (delay) await sleep(delay);
      if (signal.aborted) break;

      try {
        const response = await fetchMedia(session, file.id, signal);
        if (response.status === 401 || response.status === 404) break;
        if (!response.ok || !response.body) continue;

        await pipeline(Readable.fromWeb(response.body as NodeReadableStream), createWriteStream(partial), { signal });
        if ((await stat(partial)).size !== file.size) continue;

        await rename(partial, target);
        entry.downloadedTo = target;
        entry.file = registerMediaFile(target, file.contentType);
        // Left the queue while finishing: nobody is going to ask for it.
        if (signal.aborted) break;
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
