// Song creation: prices, energy and the quality range (docs/melody-tycoon/03-creation-de-son.md).
import { artisticSkill, genreAffinity } from './artists.ts';
import { CFG } from './config.ts';
import { choiceScore } from './craft.ts';
import { GENRES, beatById } from './data/content.ts';
import { clamp, type Rng } from './rng.ts';
import type { Artist, Producer, SongLevels } from './types.ts';

const Q = CFG.quality;
type Level = 1 | 2 | 3 | 4;
const at = (table: readonly number[], level: Level): number => table[level - 1] ?? 0;

/** A producer of a given level tier. The affinity says how well he knows the chosen beat. */
export const producerOfLevel = (level: Level, affinity = 0.85): Producer => ({
  level: at(Q.producerLevel, level),
  affinity,
  price: at(Q.producerPrice, level),
});

export interface SongPlan {
  artist: Artist;
  themeId: string;
  beatId: string;
  levels: SongLevels;
  producer: Producer;
  feat?: { gen: number } | null;
  /** Sum of the quality changes from studio events (fluid bonuses, bad reactions). */
  eventBonus?: number;
  /** Number of choices drawn at random (débrouille). */
  randomChoices?: number;
  /** Level of the label's artistic director, 0 if none. */
  directorLevel?: number;
  /** Fame and songs already made (see craft.ts experienceBonus). */
  experience?: number;
}

/** How much of the full studio prices a label of this tier pays. */
export const priceScale = (tier = 3): number => Q.tierPrice[tier - 1] ?? 1;

/** Price of the four paid choices. A custom beat (level 4) costs half the producer's price. Small labels pay less. */
export const songCost = (levels: SongLevels, producer: Producer, tier = 3): number =>
  Math.round(
    (at(Q.themePrice, levels.theme) + (levels.beat === 4 ? producer.price * 0.5 : at(Q.beatPrice, levels.beat)) + producer.price + at(Q.studioPrice, levels.studio)) *
      priceScale(tier),
  );

export const songDelay = (levels: SongLevels): number => at(Q.studioDelay, levels.studio);

export const songEnergy = (levels: SongLevels, hasFeat: boolean, artist?: Artist): number => {
  const costly = [levels.theme, levels.beat, levels.producer, levels.studio].filter((l) => l >= 3).length;
  let cost = CFG.energy.songBase + costly * CFG.energy.perCostlyChoice + (hasFeat ? CFG.energy.feat : 0);
  if (artist?.energyProfile === 'lazy') cost += 5;
  if (artist?.energyProfile === 'oiseau_de_nuit') cost += levels.studio === 1 ? -5 : levels.studio >= 3 ? 5 : 0;
  return cost;
};

export interface QualityEstimate {
  center: number;
  width: number;
  cap: number;
  min: number;
  max: number;
}

export const estimateQuality = (plan: SongPlan): QualityEstimate => {
  const { artist, levels, producer } = plan;
  const beat = beatById(plan.beatId);
  const family = GENRES[beat.genres[0] ?? artist.genre].family;
  // Off his genre the artist loses a little; the bigger cost is in the choices score (and the risk).
  const skill = artisticSkill(artist.attrs, family) * (0.8 + 0.2 * genreAffinity(artist, beat.genres));
  // The note turns around what the artist is worth. Good choices move it a little, never far above him.
  let center = skill + clamp((choiceScore(artist, plan.themeId, plan.beatId) - Q.choiceEven) * Q.choiceWeight, -Q.choiceDown, Q.choiceUp);
  center += plan.experience ?? 0;

  center += clamp((artist.morale - 50) / 10, -5, 5);
  if (artist.energy < CFG.energy.lowEnergyThreshold) center -= CFG.energy.lowEnergyPenalty;
  if (artist.creativeFatigue > CFG.fatigue.threshold) center -= CFG.fatigue.penalty;
  if (plan.feat) center += clamp((plan.feat.gen - skill) / 10, -2, 6);
  const randomChoices = plan.randomChoices ?? 0;
  center += (plan.eventBonus ?? 0) - 3 * randomChoices;

  // What the label pays for (text, beat, producer, studio) does not lift the note: it takes away the risk of a miss.
  const gear = levels.theme + levels.beat + levels.producer + levels.studio - 4 + (producer.affinity >= 0.95 ? 1 : 0);
  const down = Math.max(Q.riskMin, Q.riskFree - Q.riskPerGear * gear + 3 * randomChoices - (plan.directorLevel ?? 0));
  const up = Q.upside;
  const cap = 99;
  return {
    center,
    width: (down + up) / 2,
    cap,
    min: Math.round(clamp(center - down, 1, cap)),
    max: Math.round(clamp(center + up, 1, cap)),
  };
};

/** The final, frozen note: a draw inside the range. */
export const rollQuality = (estimate: QualityEstimate, rng: Rng): number => Math.round(clamp(rng.range(estimate.min, estimate.max), 1, estimate.cap));

export const qualityWord = (quality: number): string => {
  if (quality < 40) return 'Raté';
  if (quality < 55) return 'Passable';
  if (quality < 65) return 'Correct';
  if (quality < 75) return 'Bon';
  if (quality < 85) return 'Très bon';
  if (quality < 93) return 'Tube en puissance';
  return 'Classique';
};

/** What a guest asks for a featuring. */
export const featDemand = (guest: Pick<Artist, 'fans' | 'hype'>, relation = 0, host?: Pick<Artist, 'fans'>): number =>
  Math.round(4_000 * (guest.fans / 100_000) ** 0.7 * (1 + guest.hype / 100) * (1 - 0.1 * relation) * buzzGap(guest, host));

/** A guest far bigger than the host asks much more: 1 between equals, up to 20 for a star with an unknown. */
export const buzzGap = (guest: Pick<Artist, 'fans'>, host?: Pick<Artist, 'fans'>): number =>
  host ? Math.min(20, Math.max(1, (guest.fans + 100) / (host.fans + 100)) ** 0.6) : 1;

/** Chance (0-1) that the guest accepts an offer; null when the offer is so low that he takes offence. */
export const featChance = (offer: number, demand: number, relation: number, labelReputation: number, bonus = 0): number | null => {
  const ratio = offer / demand;
  if (ratio < 0.4) return null;
  return clamp(0.5 + 1.2 * (ratio - 1) + 0.05 * relation + (labelReputation - 50) * 0.003 + bonus, 0.05, 0.95);
};
