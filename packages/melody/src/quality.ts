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

/** Price of the four paid choices. A custom beat (level 4) costs half the producer's price. */
export const songCost = (levels: SongLevels, producer: Producer): number =>
  at(Q.themePrice, levels.theme) +
  (levels.beat === 4 ? producer.price * 0.5 : at(Q.beatPrice, levels.beat)) +
  producer.price +
  at(Q.studioPrice, levels.studio);

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
  const producerValue = producer.level * producer.affinity;
  const themeValue = Math.max(artist.attrs.ecriture, at(Q.themeValue, levels.theme));
  const beatValue = levels.beat === 4 ? Math.min(72, producerValue + 4) : at(Q.beatValue, levels.beat);

  let center =
    Q.weights.artist * skill +
    Q.weights.producer * producerValue +
    Q.weights.theme * themeValue +
    Q.weights.beat * beatValue +
    Q.weights.studio * at(Q.studioValue, levels.studio) +
    Q.weights.choices * choiceScore(artist, plan.themeId, plan.beatId);
  center += plan.experience ?? 0;

  center += clamp((artist.morale - 50) / 10, -5, 5);
  if (artist.energy < CFG.energy.lowEnergyThreshold) center -= CFG.energy.lowEnergyPenalty;
  if (artist.creativeFatigue > CFG.fatigue.threshold) center -= CFG.fatigue.penalty;
  if (plan.feat) center += clamp((plan.feat.gen - skill) / 10, -2, 6);
  const randomChoices = plan.randomChoices ?? 0;
  center += (plan.eventBonus ?? 0) - 3 * randomChoices;

  const studioBonus = levels.studio === 3 ? 1 : levels.studio === 4 ? 2 : 0;
  const width = Math.max(2, Q.baseWidth + 3 * randomChoices - (plan.directorLevel ?? 0) - studioBonus);
  const freeChoices = [levels.theme, levels.beat, levels.producer, levels.studio].filter((l) => l === 1).length;
  const cap = Q.capByFreeChoices[freeChoices] ?? 99;
  return {
    center,
    width,
    cap,
    min: Math.round(clamp(center - width, 1, cap)),
    max: Math.round(clamp(center + width, 1, cap)),
  };
};

/** The final, frozen note: a draw inside the range, then the débrouille ceiling. */
export const rollQuality = (estimate: QualityEstimate, rng: Rng): number =>
  Math.round(clamp(estimate.center + rng.range(-estimate.width, estimate.width), 1, estimate.cap));

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
export const featDemand = (guest: Pick<Artist, 'fans' | 'hype'>, relation = 0): number =>
  Math.round(2_000 * (guest.fans / 100_000) ** 0.7 * (1 + guest.hype / 100) * (1 - 0.1 * relation));

/** Chance (0-1) that the guest accepts an offer; null when the offer is so low that he takes offence. */
export const featChance = (offer: number, demand: number, relation: number, labelReputation: number, bonus = 0): number | null => {
  const ratio = offer / demand;
  if (ratio < 0.4) return null;
  return clamp(0.5 + 1.2 * (ratio - 1) + 0.05 * relation + (labelReputation - 50) * 0.003 + bonus, 0.05, 0.95);
};
