import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nativeImage, type Clipboard } from 'electron';
import { z } from 'zod';
import type { ClipView } from '../shared/ipc';
import { forgetMediaFile, registerMediaFile } from './media-files';

// The pictures copied while the app runs, so they can be sent later. They never leave this PC.

const KEPT = 50;
const POLL_MS = 1_000;

// A password manager marks what it copies so that no history keeps it.
const PRIVATE_FORMATS = ['ExcludeClipboardContentFromMonitorProcessing', 'CanIncludeInClipboardHistory'];
const rawFormat = (name: string) => `electron application/osclipboard;format="${name}"`;

const EntrySchema = z.object({
  id: z.uuid(),
  hash: z.string(),
  starred: z.boolean(),
  copiedAt: z.number(),
  width: z.number(),
  height: z.number(),
});
type Entry = z.infer<typeof EntrySchema>;
const IndexSchema = z.object({ paused: z.boolean().default(false), entries: z.array(EntrySchema).default([]) });

// The picture on the clipboard as a PNG, or null when there is none or it is marked private.
const readPicture = async (clipboard: Clipboard): Promise<Buffer | null> => {
  if (!(await clipboard.has('image/png'))) return null;
  for (const format of PRIVATE_FORMATS) if (await clipboard.has(rawFormat(format)).catch(() => false)) return null;
  const items = await clipboard.read();
  const item = items.find(({ types }) => types.includes('image/png'));
  if (!item) return null;
  return Buffer.from(await (await item.getType('image/png')).arrayBuffer());
};

export const createClipboardHistory = (dir: string, clipboard: Clipboard, onChange: () => void) => {
  mkdirSync(dir, { recursive: true });
  const indexPath = join(dir, 'index.json');
  const pathOf = (id: string) => join(dir, `${id}.png`);
  const urls = new Map<string, { id: string; url: string }>();

  let stored: z.infer<typeof IndexSchema> = { paused: false, entries: [] };
  try {
    stored = IndexSchema.parse(JSON.parse(readFileSync(indexPath, 'utf8')));
  } catch {
    // First time, or a damaged file: start empty.
  }
  stored.entries = stored.entries.filter((entry) => existsSync(pathOf(entry.id)));

  const save = () => writeFileSync(indexPath, JSON.stringify(stored));

  const drop = (entry: Entry) => {
    const known = urls.get(entry.id);
    if (known) forgetMediaFile(known.id);
    urls.delete(entry.id);
    rmSync(pathOf(entry.id), { force: true });
  };

  const trim = () => {
    let unstarred = 0;
    stored.entries = stored.entries.filter((entry) => {
      if (entry.starred) return true;
      unstarred += 1;
      if (unstarred <= KEPT) return true;
      drop(entry);
      return false;
    });
  };

  // What is on the clipboard when the app starts was not copied while it ran: it is only noted.
  let lastSeen: string | null | undefined;
  let busy = false;

  const poll = async () => {
    if (busy || stored.paused) return;
    busy = true;
    try {
      const png = await readPicture(clipboard).catch(() => null);
      const hash = png ? createHash('sha1').update(png).digest('hex') : null;
      const first = lastSeen === undefined;
      if (hash === lastSeen) return;
      lastSeen = hash;
      if (!png || !hash || first) return;

      const already = stored.entries.find((entry) => entry.hash === hash);
      if (already) {
        // Copied again: back to the top.
        if (stored.entries[0] === already) return;
        stored.entries = [{ ...already, copiedAt: Date.now() }, ...stored.entries.filter((entry) => entry !== already)];
      } else {
        const { width, height } = nativeImage.createFromBuffer(png).getSize();
        const entry: Entry = { id: randomUUID(), hash, starred: false, copiedAt: Date.now(), width, height };
        writeFileSync(pathOf(entry.id), png);
        stored.entries = [entry, ...stored.entries];
        trim();
      }
      save();
      onChange();
    } finally {
      busy = false;
    }
  };

  let timer: NodeJS.Timeout | null = null;

  const change = (next: () => void) => {
    next();
    save();
    onChange();
  };

  return {
    start: () => {
      void poll();
      timer ??= setInterval(() => void poll(), POLL_MS);
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    },
    paused: () => stored.paused,
    list: (): ClipView[] =>
      stored.entries.map(({ id, starred, copiedAt, width, height }) => {
        let known = urls.get(id);
        if (!known) {
          known = registerMediaFile(pathOf(id), 'image/png');
          urls.set(id, known);
        }
        return { id, url: known.url, path: pathOf(id), starred, copiedAt, width, height };
      }),
    pathOf: (id: string): string | null => (stored.entries.some((entry) => entry.id === id) ? pathOf(id) : null),
    star: (id: string, on: boolean) =>
      change(() => {
        stored.entries = stored.entries.map((entry) => (entry.id === id ? { ...entry, starred: on } : entry));
        trim();
      }),
    remove: (id: string) =>
      change(() => {
        for (const entry of stored.entries) if (entry.id === id) drop(entry);
        stored.entries = stored.entries.filter((entry) => entry.id !== id);
      }),
    // Starred ones are kept forever, « Vider » included.
    clear: () =>
      change(() => {
        for (const entry of stored.entries) if (!entry.starred) drop(entry);
        stored.entries = stored.entries.filter((entry) => entry.starred);
      }),
    setPaused: (on: boolean) =>
      change(() => {
        stored.paused = on;
        // Copied during the pause: not taken on the way back.
        lastSeen = undefined;
      }),
  };
};

export type ClipboardHistory = ReturnType<typeof createClipboardHistory>;
