// What a release does the week it comes out (docs/melody-tycoon/04-sortie-charts-economie.md).
import { genreAffinity } from './artists.ts';
import { CFG } from './config.ts';
import { trendBoost } from './craft.ts';
import { beatById, coherence } from './data/content.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import { viewsBoost } from './staff.ts';
import { decayBonus, discoveryBoost, hitBonus, NEW_AUDIENCE, viralFactor } from './skills.ts';
import type { Artist, PromoResult, Song, Trends, World } from './types.ts';

const R = CFG.release;

export interface MarketingOption {
  id: string;
  name: string;
  /** What it is, in the words of the networks. */
  note: string;
  cost: number;
  /** Views for each "buzz point" of the artist (see buzzOf). */
  power: number;
}

/** Promo like on the real networks: the views depend on the artist's buzz, not only on the money. */
export const MARKETING: MarketingOption[] = [
  { id: 'posts', name: 'Posts Insta & TikTok', note: 'Ton artiste poste lui-même', cost: 0, power: 1 },
  { id: 'story', name: 'Stories et teasing', note: 'Des extraits avant la sortie', cost: 150, power: 1.5 },
  { id: 'tiktok_ads', name: 'Pub TikTok', note: 'Le son passe dans les « Pour toi »', cost: 600, power: 3 },
  { id: 'influence', name: 'Influenceurs', note: 'Des créateurs dansent dessus', cost: 2_000, power: 6 },
  { id: 'playlist', name: 'Pitch playlists', note: 'Placé dans des playlists', cost: 2_500, power: 6 },
  { id: 'clip', name: 'Clip YouTube', note: 'Tourné avec les potes', cost: 3_500, power: 8 },
  { id: 'clip_pro', name: 'Clip pro', note: 'Vrai réalisateur, vrai décor', cost: 15_000, power: 16 },
  { id: 'affiches', name: 'Affiches en ville', note: 'Dans le métro et les rues', cost: 6_000, power: 7 },
];

/** Same id with the old promos of songs scheduled before this update. */
const OLD: Record<string, string> = { social_1: 'tiktok_ads', social_2: 'influence', social_3: 'influence', posters_1: 'affiches', posters_2: 'affiches', clip_1: 'clip', clip_2: 'clip_pro', clip_3: 'clip_pro' };

export const marketingById = (id: string): MarketingOption => {
  const option = MARKETING.find((m) => m.id === (OLD[id] ?? id));
  if (!option) throw new Error(`unknown marketing option ${id}`);
  return option;
};

/** The artist's buzz: about how many people see a simple post. Fans count most, hype multiplies. */
export const buzzOf = (artist: Pick<Artist, 'fans' | 'hype'>): number => Math.round((300 + artist.fans * 0.04) * (1 + artist.hype / 50));

/** The views each promo makes the week of the release. About one in thirty goes viral. */
export const promoViews = (ids: readonly string[], artist: Pick<Artist, 'fans' | 'hype'>, rng: Rng): Array<{ id: string; views: number; viral: boolean }> => {
  const buzz = buzzOf(artist);
  return [...new Set(ids)].map((id) => {
    const option = marketingById(id);
    const viral = rng.chance(1 / 30);
    const luck = clamp(Math.exp(rng.normal() * 0.35), 0.4, 2.5);
    return { id: option.id, views: Math.round(option.power * buzz * luck * (viral ? rng.range(5, 15) : 1)), viral };
  });
};

/** How well the song fits what the public wants right now, 0.5 to 1.5. */
export const publicFit = (artist: Artist, themeId: string, beatId: string, trends: Trends): number => {
  const beat = beatById(beatId);
  const affinity = clamp(40 + ((genreAffinity(artist, beat.genres) - 0.6) / 0.5) * 60, 40, 100);
  const beatTrend = trends.beats[beatId] ?? 50;
  const themeTrend = trends.themes[themeId] ?? 50;
  return 0.5 + (0.3 * affinity + 0.3 * beatTrend + 0.2 * themeTrend + 0.2 * coherence(themeId, beatId)) / 100;
};

export interface FirstWeekInput {
  quality: number;
  fans: number;
  featFans: number;
  hype: number;
  fit: number;
  marketingReach: number;
  /** Bigger same-genre releases the same week (each one costs 10 % of reach, max 3). */
  rivals: number;
  /** The artist's skills: more discovery, more chance to go viral, a better hit score, a slower fall. */
  discovery?: number;
  viral?: number;
  hitBonus?: number;
  decayBonus?: number;
}

export interface FirstWeek {
  streams: number;
  fanStreams: number;
  discovery: number;
  hitScore: number;
  decay: number;
  newFans: number;
  hypeChange: number;
  viral: boolean;
}

/** Streams per fan the week of a release: about 0.3 for 4 000 fans, 1 for 60 000, 3 for a star. */
export const fanEngagement = (fans: number): number => {
  const level = clamp((Math.log10(Math.max(1, fans)) - R.engageFrom) / R.engageSpan, 0.03, 1);
  return R.fanStreams * level ** R.engageCurve;
};

export const firstWeek = (input: FirstWeekInput, rng: Rng): FirstWeek => {
  // The note helps, but the buzz decides: a great song by an unknown stays small.
  const q = 0.6 + 0.4 * (Math.max(0, input.quality) / 70) ** 1.5;
  const effectiveFans = input.fans + 0.5 * input.featFans;
  // Past a few times the fanbase, extra marketing reach counts much less.
  const soft = Math.max(R.softReachFloor, effectiveFans * R.softReachFans);
  const paidReach = input.marketingReach <= soft ? input.marketingReach : soft + (input.marketingReach - soft) * R.softReachRate;
  const competition = 1 - 0.1 * Math.min(3, input.rivals);
  const reach = (paidReach + R.organicReach * effectiveFans) * (1 + input.hype / R.hypeReach) * competition;

  const luck = clamp(Math.exp(rng.normal() * 0.2), 0.6, 1.8);
  const viral = rng.chance(R.viralChance * (input.viral ?? 1));
  const engagement = fanEngagement(effectiveFans);
  const fanStreams = effectiveFans * engagement * q * luck;
  const discovery = reach * R.discoveryRate * input.fit * q * luck * (input.discovery ?? 1) * (viral ? rng.range(10, 40) : 1);
  const streams = Math.round(fanStreams + discovery);

  const baseline = Math.max(1, engagement * effectiveFans);
  const spread = 1 + 0.15 * Math.log10(Math.max(1, streams) / baseline);
  const hitScore = Math.round(clamp(50 * q * input.fit * luck * spread + (input.hitBonus ?? 0), 0, 100));
  return {
    streams,
    fanStreams: Math.round(fanStreams),
    discovery: Math.round(discovery),
    hitScore,
    decay: R.decayBase + (R.decayHit * hitScore) / 100 + (input.decayBonus ?? 0),
    newFans: Math.round(discovery * R.fanConversion * q * q * input.fit),
    hypeChange: (hitScore - 50) / 4,
    viral,
  };
};

export const hitWord = (hitScore: number): string => {
  if (hitScore < 25) return 'Flop';
  if (hitScore < 50) return 'Discret';
  if (hitScore < 70) return 'Succès';
  if (hitScore < 90) return 'Hit';
  return 'Carton';
};

/** What a release does its first week: shared by the weekly tick and the tutorial's forecast. */
export const releaseWeek = (world: World, song: Song, artist: Artist, tick: number, rivals: number): { week: FirstWeek; promo: PromoResult[] } => {
  const feat = song.featArtistId ? world.artists[song.featArtistId] : undefined;
  const views = viewsBoost(world, song.labelId);
  const promo = song.marketingIds
    ? promoViews(song.marketingIds, artist, rngFor(world.seed, tick, `promo:${song.id}`)).map((p) => ({ ...p, views: Math.round(p.views * views) }))
    : [];
  const reach = song.marketingIds ? promo.reduce((sum, p) => sum + p.views, 0) : song.marketingReach;
  const genres = [artist.genre, ...beatById(song.beatId).genres];
  const fit = clamp(publicFit(artist, song.themeId, song.beatId, world.trends) * trendBoost(world, tick, genres, song.themeId, song.beatId), 0.5, 2.2);
  const week = firstWeek(
    {
      quality: song.quality,
      fans: artist.fans,
      featFans: feat?.fans ?? 0,
      hype: artist.hype,
      fit,
      marketingReach: reach,
      rivals,
      // After a genre change, his songs of the new genre reach more new listeners for a while.
      discovery: discoveryBoost(artist) * (!artist.shift && artist.audienceUntil !== undefined && tick < artist.audienceUntil && genres.slice(1).includes(artist.genre) ? NEW_AUDIENCE : 1),
      viral: viralFactor(artist),
      hitBonus: hitBonus(artist, !song.projectId),
      decayBonus: decayBonus(artist),
    },
    rngFor(world.seed, tick, song.id),
  );
  return { week, promo };
};
