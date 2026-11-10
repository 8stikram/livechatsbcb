import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { nativeImage } from 'electron';
import { z } from 'zod';
import {
  MAX_MEDIA_BYTES,
  MediaContentTypeSchema,
  SceneLayerSchema, TextPlaceSchema,
  fileKindOf,
  mediaKindOf,
  type FileKind,
  type MediaContentType,
} from '@livechatsbcb/protocol';
import { WHEEL_SIZE, type FavoriteView, type LibraryFileView, type LibraryView, type RenameOutcome, type SavedView } from '../shared/ipc';
import { contentTypeOf, forgetMediaFile, registerMediaFile } from './media-files';

// Enough for a big meme folder, and a folder someone picks by mistake (a whole disk) still answers quickly.
const MAX_FILES = 5_000;
const MAX_DEPTH = 8;
const THUMBNAIL_SIZE = { width: 320, height: 180 };
// What Windows refuses in a file name.
const FORBIDDEN_NAME = /[<>:"/\\|?*\x00-\x1f]|[. ]$|^(con|prn|aux|nul|com\d|lpt\d)$/i;
const MAX_NAME_LENGTH = 200;
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

// Small and alike, so that the same tag typed twice is one.
export const cleanTags = (tags: unknown): string[] => {
  if (!Array.isArray(tags)) return [];
  const clean = tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.replace(/^#+/, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr').slice(0, MAX_TAG_LENGTH))
    .filter(Boolean);
  return [...new Set(clean)].slice(0, MAX_TAGS);
};

export const SavedFileSchema = z.object({ path: z.string(), name: z.string(), size: z.number(), contentType: MediaContentTypeSchema });
export type SavedFile = z.infer<typeof SavedFileSchema>;

const SavedSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  caption: z.string(),
  clipStartMs: z.number(),
  durationMs: z.number(),
  videoMuted: z.boolean(),
  soundMuted: z.boolean(),
  speak: z.boolean().default(false),
  favorite: z.boolean(),
  savedAt: z.number(),
  tags: z.array(z.string()).default([]),
  sentCount: z.number().default(0),
  files: z.array(SavedFileSchema),
  // Saved before the advanced mode existed: no scene.
  scene: z.array(SceneLayerSchema).nullable().default(null),
  // Where the text was moved to in the advanced mode. Null where it usually is.
  textPlace: TextPlaceSchema.nullable().default(null),
  // Starred in the history: its files are copies that belong to it, in a folder of its own.
  kept: z.object({ historyId: z.string(), senderName: z.string(), senderAvatarUrl: z.string().nullable() }).nullable().default(null),
});
export type SavedLiveChat = z.infer<typeof SavedSchema>;
type NewSaved = Omit<SavedLiveChat, 'id' | 'favorite' | 'savedAt' | 'kept' | 'tags' | 'sentCount'>;

const ShortcutTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('saved'), id: z.string() }),
  // A file sent alone needs its length, which only a page can measure, so it is kept from when the key was chosen.
  z.object({ kind: z.literal('file'), path: z.string(), durationMs: z.number() }),
]);
type ShortcutTarget = z.infer<typeof ShortcutTargetSchema>;

const StoredSchema = z.object({
  folders: z.array(z.string()),
  favorites: z.array(z.string()),
  saved: z.array(SavedSchema),
  shortcuts: z.record(z.string(), ShortcutTargetSchema).default({}),
  wheel: z.array(ShortcutTargetSchema.nullable()).default([]),
  // By path, like the favourites.
  tags: z.record(z.string(), z.array(z.string())).default({}),
  sent: z.record(z.string(), z.number()).default({}),
});
type Stored = z.infer<typeof StoredSchema>;

type Found = { id: string; url: string; path: string; name: string; size: number; contentType: MediaContentType; modifiedAt: number };

// Lives on this PC only: the service never hears about folders, favourites or what was saved.
export class Library {
  private readonly storePath: string;
  private readonly thumbnails: string;
  private readonly keptFiles: string;
  private data: Stored;
  private found = new Map<string, Found>();
  private truncated = false;
  private readonly thumbnailUrls = new Map<string, string>();

  constructor(root: string) {
    this.storePath = join(root, 'library.json');
    this.thumbnails = join(root, 'library-thumbnails');
    this.keptFiles = join(root, 'kept-media');
    this.data = this.load();
    void this.sweepKeptFiles();
  }

  // What Windows was still holding when a favourite was removed, or a star the app was closed in the middle of.
  private async sweepKeptFiles(): Promise<void> {
    const folders = await readdir(this.keptFiles).catch(() => []);
    for (const folder of folders) {
      if (!this.savedById(folder)?.kept) await rm(join(this.keptFiles, folder), { recursive: true, force: true }).catch(() => {});
    }
  }

  private load(): Stored {
    try {
      return StoredSchema.parse(JSON.parse(readFileSync(this.storePath, 'utf8')));
    } catch {
      return { folders: [], favorites: [], saved: [], shortcuts: {}, wheel: [], tags: {}, sent: {} };
    }
  }

  private save(): void {
    mkdirSync(dirname(this.storePath), { recursive: true });
    const partial = `${this.storePath}.tmp`;
    writeFileSync(partial, JSON.stringify(this.data));
    renameSync(partial, this.storePath);
  }

  // A file seen again keeps its address, so that its picture isn't loaded a second time.
  async scan(): Promise<void> {
    const before = new Map([...this.found.values()].map((file) => [file.path, file]));
    const found = new Map<string, Found>();
    let truncated = false;

    const walk = async (folder: string, depth: number): Promise<void> => {
      const entries = await readdir(folder, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (found.size >= MAX_FILES) {
          truncated = true;
          return;
        }
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          if (depth < MAX_DEPTH) await walk(path, depth + 1);
          continue;
        }
        const contentType = entry.isFile() ? contentTypeOf(path) : null;
        if (!contentType) continue;

        const info = await stat(path).catch(() => null);
        if (!info || info.size === 0 || info.size > MAX_MEDIA_BYTES) continue;

        const known = before.get(path);
        const registered = known ?? registerMediaFile(path, contentType);
        found.set(registered.id, {
          id: registered.id,
          url: registered.url,
          path,
          name: entry.name,
          size: info.size,
          contentType,
          modifiedAt: info.mtimeMs,
        });
      }
    };

    for (const folder of this.data.folders) await walk(folder, 0);

    for (const { id } of this.found.values()) {
      if (!found.has(id)) forgetMediaFile(id);
    }
    this.found = found;
    this.truncated = truncated;
  }

  async view(): Promise<LibraryView> {
    const folders = await Promise.all(
      this.data.folders.map(async (path) => ({ path, missing: !(await stat(path).catch(() => null))?.isDirectory() })),
    );
    const favorites = new Set(this.data.favorites);
    const files: LibraryFileView[] = [...this.found.values()].map(({ id, url, path, name, size, contentType, modifiedAt }) => ({
      shortcut: this.shortcutWhere((target) => target.kind === 'file' && target.path === path),
      id,
      url,
      name,
      size,
      modifiedAt,
      kind: fileKindOf(contentType),
      favorite: favorites.has(path),
      tags: this.data.tags[path] ?? [],
      sentCount: this.data.sent[path] ?? 0,
    }));
    return {
      folders,
      files,
      truncated: this.truncated,
      saved: await Promise.all(this.data.saved.map((saved) => this.savedView(saved))),
    };
  }

  private async isThere({ path, size }: SavedFile): Promise<boolean> {
    return (await stat(path).catch(() => null))?.size === size;
  }

  private async savedView(saved: SavedLiveChat): Promise<SavedView> {
    const files = await Promise.all(
      saved.files.map(async (file) => ({
        name: file.name,
        kind: fileKindOf(file.contentType),
        missing: !(await this.isThere(file)),
      })),
    );
    return {
      shortcut: this.shortcutWhere((target) => target.kind === 'saved' && target.id === saved.id),
      id: saved.id,
      name: saved.name,
      caption: saved.caption,
      favorite: saved.favorite,
      savedAt: saved.savedAt,
      kind: mediaKindOf(saved.files),
      tags: saved.tags,
      sentCount: saved.sentCount,
      files,
      thumbnailUrl: this.thumbnailUrl(saved.id),
    };
  }

  private shortcutWhere(matches: (target: ShortcutTarget) => boolean): string | null {
    return Object.entries(this.data.shortcuts).find(([, target]) => matches(target))?.[0] ?? null;
  }

  usesPath(path: string): boolean {
    return this.data.saved.some(({ files }) => files.some((file) => file.path === path));
  }

  shortcutTarget(key: string): ShortcutTarget | null {
    return this.data.shortcuts[key] ?? null;
  }

  shortcutKeys(): string[] {
    return Object.keys(this.data.shortcuts);
  }

  shortcutOfSaved(id: string): string | null {
    return this.shortcutWhere((target) => target.kind === 'saved' && target.id === id);
  }

  shortcutOfFile(path: string): string | null {
    return this.shortcutWhere((target) => target.kind === 'file' && target.path === path);
  }

  private targetName(target: ShortcutTarget): string {
    return target.kind === 'saved' ? (this.savedById(target.id)?.name ?? '') : basename(target.path);
  }

  shortcutName(key: string): string {
    const target = this.data.shortcuts[key];
    return target ? this.targetName(target) : '';
  }

  wheelTarget(index: number): ShortcutTarget | null {
    return this.data.wheel[index] ?? null;
  }

  wheelName(index: number): string {
    const target = this.data.wheel[index];
    return target ? this.targetName(target) : '';
  }

  wheelSlots(): Array<{ name: string } | null> {
    return Array.from({ length: WHEEL_SIZE }, (_, index) => {
      const target = this.data.wheel[index];
      return target ? { name: this.targetName(target) } : null;
    });
  }

  setWheel(index: number, target: ShortcutTarget | null): void {
    this.data.wheel = Array.from({ length: WHEEL_SIZE }, (_, place) => (place === index ? target : (this.data.wheel[place] ?? null)));
    this.save();
  }

  private emptyWheelWhere(matches: (target: ShortcutTarget) => boolean): void {
    this.data.wheel = this.data.wheel.map((target) => (target && matches(target) ? null : target));
  }

  clearShortcuts(): void {
    this.data.shortcuts = {};
    this.save();
  }

  // One key for one thing, and one thing for one key.
  setShortcut(key: string, target: ShortcutTarget): void {
    const same = target.kind === 'saved' ? this.shortcutOfSaved(target.id) : this.shortcutOfFile(target.path);
    if (same) delete this.data.shortcuts[same];
    this.data.shortcuts[key] = target;
    this.save();
  }

  clearShortcut(key: string): void {
    delete this.data.shortcuts[key];
    this.save();
  }

  private thumbnailPath(id: string): string {
    return join(this.thumbnails, `${id}.png`);
  }

  private thumbnailUrl(id: string): string | null {
    const known = this.thumbnailUrls.get(id);
    if (known) return known;
    if (!existsSync(this.thumbnailPath(id))) return null;
    const { url } = registerMediaFile(this.thumbnailPath(id), 'image/png');
    this.thumbnailUrls.set(id, url);
    return url;
  }

  // Kept apart from the files, so that a saved LiveChat stays recognisable once a file has gone missing.
  private async writeThumbnail(id: string, file: SavedFile): Promise<void> {
    try {
      const image = await nativeImage.createThumbnailFromPath(file.path, THUMBNAIL_SIZE);
      mkdirSync(this.thumbnails, { recursive: true });
      writeFileSync(this.thumbnailPath(id), image.toPNG());
    } catch {
      // Windows has no picture for this file: the line shows the icon of its kind instead.
    }
  }

  addFolder(path: string): void {
    if (!this.data.folders.includes(path)) this.data.folders.push(path);
    this.save();
  }

  removeFolder(path: string): void {
    this.data.folders = this.data.folders.filter((folder) => folder !== path);
    this.save();
  }

  fileById(id: string): SavedFile | null {
    const file = this.found.get(id);
    return file ? { path: file.path, name: file.name, size: file.size, contentType: file.contentType } : null;
  }

  isFileFavorite(id: string): boolean {
    const file = this.found.get(id);
    return file !== undefined && this.data.favorites.includes(file.path);
  }

  savedUsing(path: string): SavedLiveChat[] {
    return this.data.saved.filter((saved) => saved.files.some((file) => file.path === path));
  }

  // The extension stays, and what pointed at the file follows it.
  async renameFile(id: string, wanted: string): Promise<RenameOutcome> {
    const file = this.found.get(id);
    if (!file) return 'not_found';

    const name = wanted.trim();
    if (!name || name.length > MAX_NAME_LENGTH || FORBIDDEN_NAME.test(name)) return 'invalid';
    const fullName = `${name}${extname(file.name)}`;
    if (fullName === file.name) return 'renamed';

    const path = join(dirname(file.path), fullName);
    // Windows sees the same file when only capitals change.
    const taken = fullName.toLowerCase() !== file.name.toLowerCase() && (await stat(path).catch(() => null)) !== null;
    if (taken) return 'exists';

    try {
      await rename(file.path, path);
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'not_found' : 'busy';
    }
    this.data.favorites = this.data.favorites.map((favorite) => (favorite === file.path ? path : favorite));
    for (const record of [this.data.tags, this.data.sent] as Array<Record<string, unknown>>) {
      if (!(file.path in record)) continue;
      record[path] = record[file.path];
      delete record[file.path];
    }
    for (const target of Object.values(this.data.shortcuts)) {
      if (target.kind === 'file' && target.path === file.path) target.path = path;
    }
    for (const target of this.data.wheel) {
      if (target?.kind === 'file' && target.path === file.path) target.path = path;
    }
    for (const saved of this.data.saved) {
      for (const used of saved.files) {
        if (used.path !== file.path) continue;
        used.path = path;
        used.name = fullName;
      }
    }
    this.save();
    return 'renamed';
  }

  forgetFavorite(path: string): void {
    this.data.favorites = this.data.favorites.filter((favorite) => favorite !== path);
    const key = this.shortcutOfFile(path);
    if (key) delete this.data.shortcuts[key];
    this.emptyWheelWhere((target) => target.kind === 'file' && target.path === path);
    this.save();
  }

  setFileFavorite(id: string, favorite: boolean): void {
    const file = this.found.get(id);
    if (!file) return;
    this.data.favorites = this.data.favorites.filter((path) => path !== file.path);
    if (favorite) this.data.favorites.push(file.path);
    this.save();
  }

  setFileTags(id: string, tags: unknown): void {
    const file = this.found.get(id);
    if (!file) return;
    const clean = cleanTags(tags);
    if (clean.length > 0) this.data.tags[file.path] = clean;
    else delete this.data.tags[file.path];
    this.save();
  }

  setSavedTags(id: string, tags: unknown): void {
    const saved = this.savedById(id);
    if (!saved) return;
    saved.tags = cleanTags(tags);
    this.save();
  }

  // For the « Plus envoyés » order: files by their place, and a saved LiveChat as a whole.
  countSent(paths: string[], savedId?: string): void {
    for (const path of new Set(paths)) this.data.sent[path] = (this.data.sent[path] ?? 0) + 1;
    const saved = savedId ? this.savedById(savedId) : null;
    if (saved) saved.sentCount += 1;
    this.save();
  }

  async saveLiveChat(saved: NewSaved): Promise<void> {
    await this.add({ ...saved, id: randomUUID(), favorite: false, savedAt: Date.now(), kept: null, tags: [], sentCount: 0 });
  }

  private async add(saved: SavedLiveChat): Promise<void> {
    this.data.saved.push(saved);
    this.save();

    const picture = saved.files.find(({ contentType }) => fileKindOf(contentType) !== 'audio');
    if (picture) await this.writeThumbnail(saved.id, picture);
  }

  keptFolder(id: string): string {
    return join(this.keptFiles, id);
  }

  async keepFromHistory(id: string, saved: NewSaved, kept: NonNullable<SavedLiveChat['kept']>): Promise<void> {
    await this.add({ ...saved, id, favorite: true, savedAt: Date.now(), kept, tags: [], sentCount: 0 });
  }

  keptFrom(historyId: string): SavedLiveChat | null {
    return this.data.saved.find((saved) => saved.kept?.historyId === historyId) ?? null;
  }

  favorites(): FavoriteView[] {
    return this.data.saved
      .flatMap((saved) =>
        saved.kept
          ? [
              {
                id: saved.id,
                name: saved.name,
                kind: mediaKindOf(saved.files),
                senderName: saved.kept.senderName,
                senderAvatarUrl: saved.kept.senderAvatarUrl,
                savedAt: saved.savedAt,
                thumbnailUrl: this.thumbnailUrl(saved.id),
              },
            ]
          : [],
      )
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  savedById(id: string): SavedLiveChat | null {
    return this.data.saved.find((saved) => saved.id === id) ?? null;
  }

  async allThere(saved: Pick<SavedLiveChat, 'files'>): Promise<boolean> {
    return (await Promise.all(saved.files.map((file) => this.isThere(file)))).every(Boolean);
  }

  setSavedFavorite(id: string, favorite: boolean): void {
    const saved = this.savedById(id);
    if (!saved) return;
    saved.favorite = favorite;
    this.save();
  }

  deleteSaved(id: string): void {
    const kept = this.savedById(id)?.kept;
    this.data.saved = this.data.saved.filter((saved) => saved.id !== id);
    const key = this.shortcutOfSaved(id);
    if (key) delete this.data.shortcuts[key];
    this.emptyWheelWhere((target) => target.kind === 'saved' && target.id === id);
    this.save();
    this.thumbnailUrls.delete(id);
    rmSync(this.thumbnailPath(id), { force: true });
    // Windows can still hold a file that was just playing. Whatever remains goes at the next launch.
    if (kept) void rm(this.keptFolder(id), { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }).catch(() => {});
  }

  // The file shown must be one of those missing, going by its kind and its exact size, as it may have been renamed.
  // The others are then looked for beside it, under their own name.
  async relocate(id: string, shownPath: string): Promise<boolean> {
    const saved = this.savedById(id);
    if (!saved) return false;

    const shown = await stat(shownPath).catch(() => null);
    const shownType = contentTypeOf(shownPath);
    if (!shown || !shownType) return false;

    const kindOf = (contentType: MediaContentType): FileKind => fileKindOf(contentType);
    const missing: SavedFile[] = [];
    for (const file of saved.files) {
      if (!(await this.isThere(file))) missing.push(file);
    }
    const match = missing.find((file) => file.size === shown.size && kindOf(file.contentType) === kindOf(shownType));
    if (!match) return false;

    match.path = shownPath;
    match.name = basename(shownPath);
    for (const file of missing) {
      if (file === match) continue;
      const beside = join(dirname(shownPath), file.name);
      if ((await stat(beside).catch(() => null))?.size === file.size) file.path = beside;
    }
    this.save();
    return true;
  }
}
