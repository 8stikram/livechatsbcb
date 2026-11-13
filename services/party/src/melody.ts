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
// The producer has a 5th level: the legend producer (Mainstream tier and up).
const ProducerLevelSchema = z.union([LevelSchema, z.literal(5)]);
const LevelsSchema = z.object({ theme: LevelSchema, beat: LevelSchema, producer: ProducerLevelSchema, studio: LevelSchema });
const IdSchema = z.string().min(1).max(64);
// A song cover: a small square picture the app has already shrunk (about 10 kB).
const COVER_MAX = 40_000;
const CoverSchema = z.string().max(COVER_MAX).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);

const StaffRoleSchema = z.enum(['coach', 'producer', 'community', 'booker']);
export const MelodyActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('found'), name: z.string().min(1).max(60), starterId: IdSchema.optional() }),
  z.object({ type: z.literal('scout_send'), zone: IdSchema, genre: IdSchema.nullable() }),
  z.object({ type: z.literal('scout_hire'), scoutId: IdSchema }),
  z.object({ type: z.literal('youth_take'), youthId: IdSchema }),
  z.object({ type: z.literal('youth_drop'), youthId: IdSchema }),
  z.object({ type: z.literal('youth_rename'), youthId: IdSchema, name: z.string().min(1).max(40) }),
  z.object({ type: z.literal('youth_promote'), youthId: IdSchema }),
  z.object({ type: z.literal('fav'), artistId: IdSchema }),
  z.object({ type: z.literal('sell'), artistId: IdSchema }),
  z.object({ type: z.literal('talk'), artistId: IdSchema }),
  z.object({
    type: z.literal('offer'),
    artistId: IdSchema,
    offer: z.object({
      advance: z.number().min(0).max(1e10),
      royaltyRate: z.number().min(0).max(1),
      months: z.union([z.literal(6), z.literal(12), z.literal(18), z.literal(24), z.literal(36)]),
      weeklyAllowance: z.number().min(0).max(1e7),
    }),
  }),
  z.object({ type: z.literal('talk_leave'), artistId: IdSchema }),
  z.object({ type: z.literal('tuto'), move: z.enum(['next', 'skip']) }),
  z.object({ type: z.literal('feat_ask'), guestId: IdSchema, fee: z.number().min(1).max(1e9) }),
  z.object({ type: z.literal('feat_answer'), dealId: IdSchema, answer: z.enum(['accept', 'refuse', 'counter']), fee: z.number().min(1).max(1e9).optional() }),
  z.object({ type: z.literal('feat_cancel'), dealId: IdSchema }),
  z.object({ type: z.literal('feat_deal'), dealId: IdSchema }),
  z.object({ type: z.literal('transfer_ask'), artistId: IdSchema, fee: z.number().min(0).max(1e10), swapId: IdSchema.nullable().optional() }),
  z.object({ type: z.literal('transfer_answer'), transferId: IdSchema, answer: z.enum(['accept', 'refuse', 'counter']), fee: z.number().min(0).max(1e10).optional() }),
  z.object({ type: z.literal('transfer_cancel'), transferId: IdSchema }),
  z.object({ type: z.literal('clause'), artistId: IdSchema, amount: z.number().min(1).max(1e9).nullable() }),
  z.object({ type: z.literal('interview'), question: z.number().int().min(0).max(5), tone: z.enum(['humble', 'confident', 'provoc']) }),
  z.object({ type: z.literal('shade'), targetLabelId: IdSchema, line: z.number().int().min(0).max(99) }),
  z.object({ type: z.literal('clash'), targetLabelId: IdSchema, artistId: IdSchema }),
  z.object({ type: z.literal('clash_answer'), clashId: IdSchema, artistId: IdSchema }),
  z.object({ type: z.literal('clash_refuse'), clashId: IdSchema }),
  z.object({ type: z.literal('project'), artistId: IdSchema, kind: z.enum(['ep', 'album']), title: z.string().min(1).max(60), songIds: z.array(IdSchema).min(1).max(16), inWeeks: z.number().int().min(1).max(8), cover: CoverSchema.optional(), signing: z.boolean().optional() }),
  z.object({ type: z.literal('deluxe'), projectId: IdSchema, songIds: z.array(IdSchema).min(1).max(6) }),
  z.object({ type: z.literal('tour'), artistId: IdSchema, dates: z.number().int().min(4).max(20), partnerId: IdSchema.nullable().optional(), openerId: IdSchema.nullable().optional(), merch: z.boolean().optional() }),
  z.object({ type: z.literal('tour_answer'), tourId: IdSchema, accept: z.boolean() }),
  z.object({ type: z.literal('tour_cancel'), tourId: IdSchema }),
  z.object({ type: z.literal('season_goals'), goals: z.array(z.string().min(1).max(20)).min(1).max(3) }),
  z.object({ type: z.literal('season_seen') }),
  z.object({ type: z.literal('staff_hire'), candidateId: IdSchema }),
  z.object({ type: z.literal('staff_fire'), role: StaffRoleSchema }),
  z.object({ type: z.literal('staff_focus'), artistId: IdSchema.nullable() }),
  z.object({ type: z.literal('staff_poach'), labelId: IdSchema, role: StaffRoleSchema, raise: z.number().min(0).max(1) }),
  z.object({ type: z.literal('staff_poach_answer'), offerId: IdSchema, match: z.boolean() }),
  z.object({ type: z.literal('staff_poach_cancel'), offerId: IdSchema }),
  z.object({ type: z.literal('cheer'), kind: z.enum(['bonus', 'trip', 'party']), artistId: IdSchema.nullable() }),
  z.object({ type: z.literal('raise'), artistId: IdSchema }),
  z.object({ type: z.literal('role'), artistId: IdSchema, role: z.enum(['headliner', 'prospect', 'pillar', 'free']) }),
  z.object({ type: z.literal('genre_change'), artistId: IdSchema, genre: z.string().min(1).max(32) }),
  z.object({ type: z.literal('genre_wish_refuse'), artistId: IdSchema }),
  z.object({ type: z.literal('auction_start'), artistId: IdSchema, start: z.number().min(1).max(1e9), weeks: z.number().int().min(1).max(3), reserve: z.number().min(1).max(1e9).nullable() }),
  z.object({ type: z.literal('auction_bid'), auctionId: IdSchema, amount: z.number().min(1).max(1e9) }),
  z.object({ type: z.literal('auction_cancel'), auctionId: IdSchema }),
  z.object({ type: z.literal('lend'), artistId: IdSchema, weeks: z.number().int().min(4).max(14), fee: z.number().min(0).max(1e8) }),
  z.object({ type: z.literal('lend_cancel'), lendingId: IdSchema }),
  z.object({ type: z.literal('borrow'), lendingId: IdSchema }),
  z.object({ type: z.literal('studio'), artistId: IdSchema, themeId: IdSchema, beatId: IdSchema, levels: LevelsSchema }),
  z.object({ type: z.literal('react'), reactionId: IdSchema }),
  z.object({ type: z.literal('feat'), guestId: IdSchema, offer: z.number().min(1).max(1e9) }),
  z.object({ type: z.literal('feat_skip') }),
  z.object({ type: z.literal('studio_cancel') }),
  z.object({ type: z.literal('song'), title: z.string().min(1).max(80), cover: CoverSchema.optional() }),
  z.object({ type: z.literal('release'), songId: IdSchema, inWeeks: z.number().int().min(1).max(8), marketing: z.array(IdSchema).max(12) }),
  z.object({ type: z.literal('gig'), artistId: IdSchema }),
  z.object({ type: z.literal('loan'), amount: z.number().min(1).max(1e9), weeks: z.union([z.literal(8), z.literal(16), z.literal(24)]) }),
  z.object({ type: z.literal('asset_loan'), amount: z.number().int().min(1_000).max(1e10), weeks: z.union([z.literal(13), z.literal(26), z.literal(52)]) }),
  z.object({ type: z.literal('repay'), kind: z.enum(['classic', 'emergency', 'asset']) }),
  z.object({ type: z.literal('buyback'), songId: IdSchema }),
  z.object({ type: z.literal('tier_seen') }),
  z.object({ type: z.literal('card'), cardId: IdSchema, choiceId: z.string().min(1).max(20) }),
  z.object({ type: z.literal('press'), speakerId: IdSchema.nullable(), targetId: IdSchema }),
  z.object({ type: z.literal('press_reply'), confId: IdSchema, speakerId: IdSchema.nullable() }),
  z.object({ type: z.literal('duel'), targetLabelId: IdSchema, artistId: IdSchema, week: z.number().int().min(0).max(100_000) }),
  z.object({ type: z.literal('duel_answer'), duelId: IdSchema, accept: z.boolean(), artistId: IdSchema.nullable() }),
  z.object({ type: z.literal('ally_ask'), targetLabelId: IdSchema }),
  z.object({ type: z.literal('ally_answer'), offerId: IdSchema, accept: z.boolean() }),
  z.object({ type: z.literal('ally_break'), labelId: IdSchema }),
  z.object({ type: z.literal('enemy_add'), labelId: IdSchema }),
  z.object({ type: z.literal('enemy_remove'), labelId: IdSchema }),
  z.object({ type: z.literal('gift'), targetLabelId: IdSchema, amount: z.number().int().min(100).max(1_000_000_000) }),
  z.object({ type: z.literal('friend_loan'), targetLabelId: IdSchema, amount: z.number().int().min(100).max(1_000_000_000), rate: z.union([z.literal(0), z.literal(5), z.literal(10)]), weeks: z.union([z.literal(4), z.literal(8), z.literal(12)]) }),
  z.object({ type: z.literal('friend_loan_answer'), loanId: IdSchema, accept: z.boolean() }),
]);

export const MelodyCoversSchema = z.object({ ids: z.array(IdSchema).max(60) });

export const MelodyPreviewSchema = z.object({ artistId: IdSchema, themeId: IdSchema, beatId: IdSchema, levels: LevelsSchema });

export type MelodyState = { view: MelodyView; nextTickAt: number };
export type MelodyResult = ({ ok: true } & MelodyState) | { ok: false; message: string };

// A world nobody opens for this long stops ticking: it costs nothing while it sleeps.
const SLEEP_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
// Covers kept per world: the oldest go first, so the storage stays small.
const MAX_COVERS = 600;
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
      CREATE TABLE IF NOT EXISTS covers (song_id TEXT PRIMARY KEY, data TEXT NOT NULL, at INTEGER NOT NULL);
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
    // The picture stays out of the world: the rules only learn that there is one.
    const cover = action.type === 'song' || action.type === 'project' ? action.cover : undefined;
    const before = draft.songs.length;
    const projectsBefore = draft.projects?.length ?? 0;
    try {
      applyAction(draft, userId, (action.type === 'song' || action.type === 'project') && cover ? { ...action, cover: 'yes' } : action);
    } catch (error) {
      if (error instanceof GameError) return { ok: false, message: error.message };
      throw error;
    }
    this.world = draft;
    const made = action.type === 'song' && draft.songs.length > before ? draft.songs[draft.songs.length - 1] : undefined;
    if (cover && made?.cover) this.keepCover(made.id, cover);
    // A project cover is kept under the project's id, like a song's.
    const project = action.type === 'project' && (draft.projects?.length ?? 0) > projectsBefore ? draft.projects!.at(-1) : undefined;
    if (cover && project?.cover) this.keepCover(project.id, cover);
    // Disstracks and projects touch the songs too.
    const songsChanged = ['song', 'release', 'tuto', 'project', 'deluxe', 'clash', 'clash_answer'].includes(action.type);
    this.save(songsChanged ? ['core', 'artists', 'songs'] : ['core', 'artists']);
    return { ok: true, ...this.state(draft, userId, nextTickAt) };
  }

  private keepCover(songId: string, data: string): void {
    this.ctx.storage.sql.exec('INSERT INTO covers (song_id, data, at) VALUES (?, ?, ?) ON CONFLICT (song_id) DO UPDATE SET data = excluded.data', songId, data, Date.now());
    this.ctx.storage.sql.exec('DELETE FROM covers WHERE song_id NOT IN (SELECT song_id FROM covers ORDER BY at DESC LIMIT ?)', MAX_COVERS);
  }

  /** The covers of some songs, for the charts and the song pages. */
  covers(ids: string[]): { ok: true; covers: Record<string, string> } {
    const covers: Record<string, string> = {};
    for (const id of new Set(ids)) {
      const [row] = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM covers WHERE song_id = ?', id).toArray();
      if (row) covers[id] = row.data;
    }
    return { ok: true, covers };
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
