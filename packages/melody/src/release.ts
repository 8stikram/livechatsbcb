// What a release does the week it comes out (docs/melody-tycoon/04-sortie-charts-economie.md).
import { genreAffinity } from './artists.ts';
import { CFG } from './config.ts';
import { beatById, coherence } from './data/content.ts';
import { clamp, type Rng } from './rng.ts';
import type { Artist, Trends } from './types.ts';

const R = CFG.release;

export interface MarketingOption {
  id: string;
  name: string;
  cost: number;
  reach: number;
}

/** Marketing options kept for the first playable version. */
export const MARKETING: MarketingOption[] = [
  { id: 'posts', name: 'Réseaux sociaux — posts simples', cost: 0, reach: 5_000 },
  { id: 'social_1', name: 'Réseaux sociaux — petite campagne', cost: 500, reach: 20_000 },
  { id: 'social_2', name: 'Réseaux sociaux — campagne', cost: 3_000, reach: 150_000 },
  { id: 'social_3', name: 'Réseaux sociaux — grosse campagne', cost: 15_000, reach: 900_000 },
  { id: 'posters_1', name: 'Affiches', cost: 1_500, reach: 40_000 },
  { id: 'posters_2', name: 'Affiches — campagne nationale', cost: 10_000, reach: 300_000 },
  { id: 'clip_1', name: 'Clip vidéo simple', cost: 5_000, reach: 150_000 },
  { id: 'clip_2', name: 'Clip vidéo soigné', cost: 25_000, reach: 1_000_000 },
  { id: 'clip_3', name: 'Clip vidéo événement', cost: 120_000, reach: 6_000_000 },
];

export const marketingById = (id: string): MarketingOption => {
  const option = MARKETING.find((m) => m.id === id);
  if (!option) throw new Error(`unknown marketing option ${id}`);
  return option;
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

export const firstWeek = (input: FirstWeekInput, rng: Rng): FirstWeek => {
  const q = input.quality / 70;
  const effectiveFans = input.fans + 0.5 * input.featFans;
  // Past a few times the fanbase, extra marketing reach counts much less.
  const soft = Math.max(R.softReachFloor, effectiveFans * R.softReachFans);
  const paidReach = input.marketingReach <= soft ? input.marketingReach : soft + (input.marketingReach - soft) * R.softReachRate;
  const competition = 1 - 0.1 * Math.min(3, input.rivals);
  const reach = (paidReach + R.organicReach * effectiveFans) * (1 + input.hype / R.hypeReach) * competition;

  const luck = clamp(Math.exp(rng.normal() * 0.2), 0.6, 1.8);
  const viral = rng.chance(R.viralChance);
  const fanStreams = effectiveFans * R.fanStreams * q * q * luck;
  const discovery = reach * R.discoveryRate * input.fit * q * luck * (viral ? rng.range(3, 6) : 1);
  const streams = Math.round(fanStreams + discovery);

  const baseline = Math.max(1, R.fanStreams * effectiveFans);
  const spread = 1 + 0.15 * Math.log10(Math.max(1, streams) / baseline);
  const hitScore = Math.round(clamp(50 * q * input.fit * luck * spread, 0, 100));
  return {
    streams,
    fanStreams: Math.round(fanStreams),
    discovery: Math.round(discovery),
    hitScore,
    decay: R.decayBase + (R.decayHit * hitScore) / 100,
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
