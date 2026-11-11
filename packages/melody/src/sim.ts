// Balance simulator: automatic labels play whole seasons in a few milliseconds.
// It only uses the public actions, so it also proves a season can be played end to end.
import { generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { BEATS } from './data/content.ts';
import { artistValue, catalogueValue, debtOf, fameTier, fansOf, ranking, rosterOf } from './economy.ts';
import { producerOfLevel, songCost, songEnergy } from './quality.ts';
import { MARKETING } from './release.ts';
import { rngFor, type Rng } from './rng.ts';
import { runTick } from './tick.ts';
import type { Artist, SongLevels, World } from './types.ts';
import { GameError, addPlayerLabel, bookGig, createSong, createWorld, expectedOffer, freeAgents, scheduleRelease, signArtist } from './world.ts';

/** How a bot spends: share of its cash it accepts to put in one song and in its marketing. */
export interface Strategy {
  name: string;
  songShare: number;
  marketingShare: number;
  gigs: number;
  signs: boolean;
  /** Plays one tick out of N (1 = every day). */
  every: number;
}

export const STRATEGIES: Strategy[] = [
  { name: 'Débrouille', songShare: 0, marketingShare: 0, gigs: 2, signs: true, every: 1 },
  { name: 'Équilibré', songShare: 0.08, marketingShare: 0.05, gigs: 1, signs: true, every: 1 },
  { name: 'Flambeur', songShare: 0.3, marketingShare: 0.25, gigs: 0, signs: true, every: 1 },
  { name: 'Occasionnel', songShare: 0.08, marketingShare: 0.05, gigs: 1, signs: false, every: 3 },
];

const LEVELS: (1 | 2 | 3 | 4)[] = [4, 3, 2, 1];

/** The best levels the bot can afford with a given budget, spending evenly on the four choices. */
const pickLevels = (budget: number): SongLevels => {
  const levels: SongLevels = { theme: 1, beat: 1, producer: 1, studio: 1 };
  const keys: (keyof SongLevels)[] = ['producer', 'studio', 'theme', 'beat'];
  for (let round = 0; round < 3; round += 1) {
    for (const key of keys) {
      const next = Math.min(3, levels[key] + 1) as 1 | 2 | 3 | 4;
      const trial = { ...levels, [key]: next };
      if (songCost(trial, producerOfLevel(trial.producer)) <= budget) levels[key] = next;
    }
  }
  if (!LEVELS.includes(levels.theme)) throw new Error('unreachable');
  return levels;
};

const pickBeat = (artist: Artist, world: World, rng: Rng): { beatId: string; themeId: string } => {
  const own = BEATS.filter((b) => b.genres.includes(artist.genre));
  const pool = own.length > 0 ? own : BEATS;
  const best = [...pool].sort((a, b) => (world.trends.beats[b.id] ?? 50) - (world.trends.beats[a.id] ?? 50))[0] ?? rng.pick(pool);
  const theme = [...best.themes].sort((a, b) => (world.trends.themes[b] ?? 50) - (world.trends.themes[a] ?? 50))[0] ?? 'ego';
  return { beatId: best.id, themeId: theme };
};

const attempt = (action: () => void): boolean => {
  try {
    action();
    return true;
  } catch (error) {
    if (error instanceof GameError) return false;
    throw error;
  }
};

const playTurn = (world: World, labelId: string, strategy: Strategy, rng: Rng): void => {
  const label = world.labels[labelId];
  if (!label || label.bankrupt) return;

  // Sign a new artist when there is room and money.
  const roster = rosterOf(world, labelId);
  const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
  if (roster.length === 0 || (strategy.signs && roster.length < max && world.tick % 4 === 0)) {
    const budget = roster.length === 0 ? label.cash * 0.5 : label.cash * 0.25;
    const target = freeAgents(world)
      .filter((a) => expectedOffer(a).advance <= budget && fameTier(a) <= label.tier && (generalRating(a) < 80 || label.tier >= 3))
      .sort((a, b) => artistValue(b) + b.potential * 200 - (artistValue(a) + a.potential * 200))[0];
    if (target) attempt(() => signArtist(world, labelId, target.id, { ...expectedOffer(target), months: 36 }));
  }

  // The shares are for the whole week: split them between the artists.
  const team = rosterOf(world, labelId);
  const split = Math.max(1, team.length);
  for (const artist of team) {
    // Release what is ready.
    const ready = world.songs.find((s) => s.artistId === artist.id && s.labelId === labelId && s.state === 'vault' && s.availableTick <= world.tick + 1);
    if (ready) {
      const budget = (label.cash * strategy.marketingShare) / split;
      const options = ['posts'];
      let spent = 0;
      for (const option of [...MARKETING].sort((a, b) => b.cost - a.cost)) {
        if (option.cost > 0 && spent + option.cost <= budget && !options.some((o) => o.slice(0, 4) === option.id.slice(0, 4))) {
          options.push(option.id);
          spent += option.cost;
        }
      }
      attempt(() => scheduleRelease(world, labelId, ready.id, Math.max(world.tick + 1, ready.availableTick), options));
    }
    // Record a new song if nothing waits in the vault.
    const waiting = world.songs.some((s) => s.artistId === artist.id && s.labelId === labelId && s.state !== 'released');
    if (!waiting) {
      const levels = pickLevels(Math.min((label.cash * strategy.songShare) / split, CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000));
      if (artist.energy >= songEnergy(levels, false, artist)) {
        const { beatId, themeId } = pickBeat(artist, world, rng);
        attempt(() =>
          createSong(world, labelId, {
            artistId: artist.id,
            title: `Titre ${world.nextId}`,
            themeId,
            beatId,
            levels,
            producer: producerOfLevel(levels.producer, rng.pick([1, 0.85, 0.85, 0.7])),
          }),
        );
      }
    }
    for (let i = 0; i < strategy.gigs; i += 1) attempt(() => bookGig(world, labelId, artist.id));
  }
};

export interface Snapshot {
  tick: number;
  name: string;
  tier: number;
  cash: number;
  debt: number;
  fans: number;
  catalogue: number;
  reputation: number;
  artists: number;
  songs: number;
  bestQuality: number;
  bestPeak: number | null;
  bankrupt: boolean;
  score: number;
}

export interface SimResult {
  world: World;
  snapshots: Snapshot[];
}

/** Plays `ticks` game weeks with one bot per strategy and records where each label stands. */
export const simulate = (seed: number, ticks: number, strategies: Strategy[] = STRATEGIES, every = 7): SimResult => {
  const world = createWorld(seed);
  const bots = strategies.map((strategy, index) => ({ strategy, label: addPlayerLabel(world, `bot${index}`, strategy.name) }));
  const snapshots: Snapshot[] = [];
  for (let t = 0; t < ticks; t += 1) {
    for (const bot of bots) {
      if (world.tick % bot.strategy.every === 0) playTurn(world, bot.label.id, bot.strategy, rngFor(seed, world.tick, bot.label.id));
    }
    runTick(world);
    if (world.tick % every === 0 || world.tick === ticks) {
      const scores = ranking(world);
      for (const bot of bots) {
        const songs = world.songs.filter((s) => s.labelId === bot.label.id && s.state === 'released');
        const peaks = songs.map((s) => s.peakGlobal).filter((p): p is number => p !== null);
        snapshots.push({
          tick: world.tick,
          name: bot.strategy.name,
          tier: bot.label.tier,
          cash: Math.round(bot.label.cash),
          debt: Math.round(debtOf(world, bot.label.id)),
          fans: fansOf(world, bot.label.id),
          catalogue: catalogueValue(world, bot.label.id),
          reputation: Math.round(bot.label.reputation * 10) / 10,
          artists: rosterOf(world, bot.label.id).length,
          songs: songs.length,
          bestQuality: Math.max(0, ...songs.map((s) => s.quality)),
          bestPeak: peaks.length > 0 ? Math.min(...peaks) : null,
          bankrupt: bot.label.bankrupt,
          score: scores.find((s) => s.labelId === bot.label.id)?.score ?? 0,
        });
      }
    }
  }
  return { world, snapshots };
};
