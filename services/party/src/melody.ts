import { DurableObject } from 'cloudflare:workers';
import {
  GameError,
  applyAction,
  buildView,
  createWorld,
  previewSong,
  runTick,
  type MelodyAction,
  type MelodyView,
  type SongPreview,
  type World,
} from '@livechatsbcb/melody';
import { z } from 'zod';
import { nextParisTick } from './melody-time';

export { nextParisTick };

const LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
const LevelsSchema = z.object({ theme: LevelSchema, beat: LevelSchema, producer: LevelSchema, studio: LevelSchema });
const IdSchema = z.string().min(1).max(64);

export const MelodyActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('found'), name: z.string().min(1).max(60), starterId: IdSchema }),
  z.object({ type: z.literal('sign'), artistId: IdSchema, advance: z.number().min(0).max(1e10), royaltyRate: z.number().min(0).max(1) }),
  z.object({ type: z.literal('song'), artistId: IdSchema, title: z.string().min(1).max(80), themeId: IdSchema, beatId: IdSchema, levels: LevelsSchema }),
  z.object({ type: z.literal('release'), songId: IdSchema, inWeeks: z.number().int().min(1).max(8), marketing: z.array(IdSchema).max(12) }),
  z.object({ type: z.literal('gig'), artistId: IdSchema }),
  z.object({ type: z.literal('loan'), amount: z.number().min(1).max(1e9), weeks: z.union([z.literal(8), z.literal(16), z.literal(24)]) }),
]);

export const MelodyPreviewSchema = z.object({ artistId: IdSchema, themeId: IdSchema, beatId: IdSchema, levels: LevelsSchema });

export type MelodyState = { view: MelodyView; nextTickAt: number };
export type MelodyResult = ({ ok: true } & MelodyState) | { ok: false; message: string };

// A world nobody opens for this long stops ticking: it costs nothing while it sleeps.
const SLEEP_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
// After an outage the world replays at most this many missed weeks.
const MAX_CATCH_UP = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
// World kept in four rows, so a change writes a handful of rows whatever the size of the game.
const PARTS = ['core', 'artists', 'songs', 'charts'] as const;
type Part = (typeof PARTS)[number];

const split = (world: World): Record<Part, unknown> => {
  const { artists, songs, charts, npcSongs, ...core } = world;
  return { core, artists, songs, charts: { charts, npcSongs } };
};

// One game per Discord server. It holds the whole world and makes it tick once a day.
export class MelodyWorld extends DurableObject<Env> {
  private world: World | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS parts (name TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    `);
  }

  private meta(key: string): number | null {
    const [row] = this.ctx.storage.sql.exec<{ value: number }>('SELECT value FROM meta WHERE key = ?', key).toArray();
    return row?.value ?? null;
  }

  private setMeta(key: string, value: number): void {
    this.ctx.storage.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
  }

  private load(guildId: string): World {
    if (this.world) return this.world;
    const rows = this.ctx.storage.sql.exec<{ name: string; data: string }>('SELECT name, data FROM parts').toArray();
    if (rows.length === PARTS.length) {
      const part = (name: Part) => JSON.parse(rows.find((r) => r.name === name)?.data ?? 'null');
      const extra = part('charts') as { charts: World['charts']; npcSongs: World['npcSongs'] };
      this.world = { ...(part('core') as Omit<World, 'artists' | 'songs' | 'charts' | 'npcSongs'>), artists: part('artists'), songs: part('songs'), ...extra };
    } else {
      // The server's own number makes each world different, and the same if it ever has to be rebuilt.
      this.world = createWorld(Number(BigInt(guildId) % 4294967291n));
      this.save(PARTS);
    }
    return this.world;
  }

  private save(parts: readonly Part[]): void {
    if (!this.world) return;
    const data = split(this.world);
    for (const name of parts) {
      this.ctx.storage.sql.exec(
        'INSERT INTO parts (name, data) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET data = excluded.data',
        name,
        JSON.stringify(data[name]),
      );
    }
  }

  private tickEveryMs(): number {
    return Number(this.env.MELODY_TICK_MS) || 0;
  }

  private nextAfter(now: number): number {
    const every = this.tickEveryMs();
    return every > 0 ? now + every : nextParisTick(now);
  }

  // Someone is here: note it, and wake the world if it was asleep (it does not replay what it slept through).
  private touch(): number {
    const now = Date.now();
    const seen = this.meta('seen') ?? 0;
    if (now - seen > 60 * 60 * 1000) this.setMeta('seen', now);
    let next = this.meta('next');
    if (next === null || next < now - MAX_CATCH_UP * DAY_MS) {
      next = this.nextAfter(now);
      this.setMeta('next', next);
    }
    void this.ctx.storage.setAlarm(next);
    return next;
  }

  private state(world: World, userId: string, nextTickAt: number): MelodyState {
    return { view: buildView(world, userId), nextTickAt };
  }

  view(guildId: string, userId: string): MelodyState {
    const world = this.load(guildId);
    return this.state(world, userId, this.touch());
  }

  preview(guildId: string, input: z.infer<typeof MelodyPreviewSchema>): { ok: true; preview: SongPreview } | { ok: false; message: string } {
    try {
      return { ok: true, preview: previewSong(this.load(guildId), input.artistId, input.themeId, input.beatId, input.levels) };
    } catch (error) {
      if (error instanceof GameError) return { ok: false, message: error.message };
      throw error;
    }
  }

  act(guildId: string, userId: string, action: MelodyAction): MelodyResult {
    const world = this.load(guildId);
    const nextTickAt = this.touch();
    // The rules change the world in place: work on a copy so a refused action leaves nothing behind.
    const draft = structuredClone(world);
    try {
      applyAction(draft, userId, action);
    } catch (error) {
      if (error instanceof GameError) return { ok: false, message: error.message };
      throw error;
    }
    this.world = draft;
    this.save(action.type === 'song' || action.type === 'release' ? ['core', 'artists', 'songs'] : ['core', 'artists']);
    return { ok: true, ...this.state(draft, userId, nextTickAt) };
  }

  override async alarm(): Promise<void> {
    const rows = this.ctx.storage.sql.exec<{ name: string }>('SELECT name FROM parts LIMIT 1').toArray();
    const due = this.meta('next');
    if (rows.length === 0 || due === null) return;

    const now = Date.now();
    if (now < due) {
      void this.ctx.storage.setAlarm(due);
      return;
    }
    if (now - (this.meta('seen') ?? 0) > SLEEP_AFTER_MS) return;

    // The id only seeds a brand-new world, and this one already exists.
    const world = this.load('0');
    const every = this.tickEveryMs() || DAY_MS;
    const missed = Math.min(MAX_CATCH_UP, 1 + Math.floor((now - due) / every));
    for (let i = 0; i < missed; i += 1) runTick(world);
    this.save(PARTS);

    const next = this.nextAfter(now);
    this.setMeta('next', next);
    void this.ctx.storage.setAlarm(next);
  }
}
