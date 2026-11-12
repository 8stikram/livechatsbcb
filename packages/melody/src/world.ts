// Creating a world and the actions a label can take between two ticks.
// Every action checks the rules and throws a GameError with a message the player can read.
import { artistFromCatalog, generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { CATALOG_ARTISTS, CATALOG_LABELS } from './data/catalog.gen.ts';
import { BEATS, THEMES } from './data/content.ts';
import { artistValue, contractOf, debtOf, fameTier, rosterOf } from './economy.ts';
import { estimateQuality, rollQuality, songCost, songDelay, songEnergy, type SongPlan } from './quality.ts';
import { CRAFT, experienceBonus, isPerfect, isSecret, riskOf, rollSurprise } from './craft.ts';
import { marketingById } from './release.ts';
import { clamp, rngFor } from './rng.ts';
import type { Artist, Contract, Label, Producer, Song, SongLevels, Trends, World } from './types.ts';

export class GameError extends Error {}

const fail = (message: string): never => {
  throw new GameError(message);
};

export const neutralTrends = (): Trends => ({
  beats: Object.fromEntries(BEATS.map((b) => [b.id, 50])),
  themes: Object.fromEntries(THEMES.map((t) => [t.id, 50])),
});

const newLabel = (id: string, name: string, kind: Label['kind'], ownerId: string | null): Label => ({
  id,
  name,
  kind,
  ownerId,
  tier: 1,
  cash: CFG.start.cash,
  reputation: CFG.start.reputation,
  distress: 0,
  bankrupt: false,
  stats: { revenueTotal: 0, numberOnes: 0, top10Global: 0, top100Global: 0, top50Genre: 0 },
});

/** A fresh world: every catalogue artist, the labels run by the game and their contracts. */
export const createWorld = (seed: number): World => {
  const world: World = {
    seed,
    tick: 0,
    nextId: 1,
    labels: {},
    artists: {},
    contracts: [],
    songs: [],
    loans: [],
    gigs: [],
    npcSongs: [],
    trends: neutralTrends(),
    charts: { global: [], genres: {} },
  };
  for (const source of CATALOG_LABELS) {
    if (source.id === 'inde') continue;
    const label = newLabel(source.id, source.name, 'npc', null);
    label.tier = Math.max(1, source.tier);
    label.reputation = source.reputation;
    world.labels[label.id] = label;
  }
  for (const source of CATALOG_ARTISTS) {
    const artist = artistFromCatalog(source, seed);
    world.artists[artist.id] = artist;
    if (source.labelId && source.labelId !== 'inde') {
      world.contracts.push({
        artistId: artist.id,
        labelId: source.labelId,
        startTick: 0,
        endTick: 9_999,
        advance: 0,
        unrecouped: 0,
        weeklyAllowance: 0,
        royaltyRate: 0.2,
      });
    }
  }
  return world;
};

export const addPlayerLabel = (world: World, ownerId: string, name: string): Label => {
  const existing = Object.values(world.labels).find((l) => l.ownerId === ownerId && !l.bankrupt);
  if (existing) return fail('Tu as déjà un label dans ce monde.');
  const label = newLabel(`p${world.nextId}`, name, 'player', ownerId);
  world.nextId += 1;
  world.labels[label.id] = label;
  return label;
};

const labelOf = (world: World, labelId: string): Label => world.labels[labelId] ?? fail('Label introuvable.');
const artistOf = (world: World, artistId: string): Artist => world.artists[artistId] ?? fail('Artiste introuvable.');

/** Artists nobody has under contract. */
export const freeAgents = (world: World): Artist[] =>
  Object.values(world.artists).filter((a) => !contractOf(world, a.id));

export interface Offer {
  advance: number;
  royaltyRate: number;
  weeklyAllowance: number;
  months: number;
}

/** What the artist expects. The multi-round negotiation will build on this. */
export const expectedOffer = (artist: Artist): Offer => {
  const value = artistValue(artist);
  return { advance: Math.round(value * CFG.advanceShare), royaltyRate: 0.22, weeklyAllowance: 0, months: 18 };
};

/** Signs a free agent if the offer reaches what he expects. */
export const signArtist = (world: World, labelId: string, artistId: string, offer: Offer): Contract => {
  const label = labelOf(world, labelId);
  const artist = artistOf(world, artistId);
  if (contractOf(world, artistId)) return fail(`${artist.name} est déjà sous contrat.`);
  const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
  if (rosterOf(world, labelId).length >= max) return fail('Ton effectif est complet pour ce palier.');
  if (fameTier(artist) > label.tier || (generalRating(artist) >= 80 && label.tier < 3)) {
    return fail(`${artist.name} ne signe pas dans un label de ce palier.`);
  }
  const expected = expectedOffer(artist);
  const score =
    60 * (expected.advance === 0 ? 1 : Math.min(1.5, offer.advance / expected.advance)) +
    40 * Math.min(1.5, offer.royaltyRate / expected.royaltyRate) +
    (label.reputation - 50) * 0.3;
  if (score < 85) return fail(`${artist.name} refuse : l'offre est trop basse.`);
  if (offer.advance > label.cash) return fail("Pas assez de cash pour payer l'avance.");
  label.cash -= offer.advance;
  const contract: Contract = {
    artistId,
    labelId,
    startTick: world.tick,
    endTick: world.tick + offer.months * CFG.ticksPerMonth,
    advance: offer.advance,
    unrecouped: offer.advance,
    weeklyAllowance: offer.weeklyAllowance,
    royaltyRate: offer.royaltyRate,
  };
  world.contracts.push(contract);
  return contract;
};

export interface SongRequest {
  artistId: string;
  title: string;
  themeId: string;
  beatId: string;
  levels: SongLevels;
  producer: Producer;
  featArtistId?: string | null;
  featFee?: number;
  eventBonus?: number;
  eventCost?: number;
  randomChoices?: number;
  /** Studio events: weeks added before the song is ready, morale and energy changes for the artist. */
  extraDelay?: number;
  moraleDelta?: number;
  energyDelta?: number;
  /** Gambles taken in the studio: a surprise gets more likely. */
  gambles?: number;
  /** No flop possible (the guided first song). */
  safe?: boolean;
}

/** Creates a song: pays, spends energy and freezes the quality. */
export const createSong = (world: World, labelId: string, request: SongRequest): Song => {
  const label = labelOf(world, labelId);
  const artist = artistOf(world, request.artistId);
  if (contractOf(world, artist.id)?.labelId !== labelId) return fail(`${artist.name} n'est pas dans ton label.`);
  const feat = request.featArtistId ? artistOf(world, request.featArtistId) : null;
  const planned = songCost(request.levels, request.producer) + (request.featFee ?? 0);
  // What studio events cost on top may go past the budget of the tier: it is only taken from the cash.
  const cost = planned + (request.eventCost ?? 0);
  const cap = CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000;
  if (planned > cap) return fail('Ce son dépasse le budget autorisé pour ton palier.');
  if (cost > label.cash) return fail('Pas assez de cash pour ce son.');
  const energy = songEnergy(request.levels, feat !== null, artist);
  if (artist.energy < energy) return fail(`${artist.name} n'a pas assez d'énergie.`);

  const plan: SongPlan = {
    artist,
    themeId: request.themeId,
    beatId: request.beatId,
    levels: request.levels,
    producer: request.producer,
    feat: feat ? { gen: generalRating(feat) } : null,
    eventBonus: request.eventBonus ?? 0,
    randomChoices: request.randomChoices ?? 0,
    experience: experienceBonus(world, artist),
  };
  const estimate = estimateQuality(plan);
  const rng = rngFor(world.seed, world.tick, `song${world.nextId}`);
  // What the studio cannot see: a secret combo, a perfect match, and the surprise of the release.
  const secret = isSecret(world, request.themeId, request.beatId);
  const perfect = isPerfect(artist, request.themeId, request.beatId);
  const surprise = rollSurprise(rng, riskOf(artist, request.themeId, request.beatId) + (request.gambles ?? 0), artist);
  if (request.safe && surprise.kind === 'flop') surprise.kind = null;
  const hidden = (secret ? CRAFT.secretBonus : 0) + (perfect ? CRAFT.perfectBonus : 0) + (surprise.kind ? surprise.delta : 0);
  const quality = Math.round(clamp(rollQuality(estimate, rng) + hidden, 1, surprise.kind === 'boom' ? 99 : Math.min(99, estimate.cap + (secret ? CRAFT.secretBonus : 0))));

  label.cash -= cost;
  artist.energy = clamp(artist.energy - energy + (request.energyDelta ?? 0), 0, 100);
  artist.morale = clamp(artist.morale + (request.moraleDelta ?? 0), 0, 100);
  artist.creativeFatigue = Math.min(100, artist.creativeFatigue + CFG.fatigue.perSong);
  artist.lastActiveTick = world.tick;
  const song: Song = {
    id: `s${world.nextId}`,
    labelId,
    artistId: artist.id,
    featArtistId: feat?.id ?? null,
    title: request.title,
    themeId: request.themeId,
    beatId: request.beatId,
    levels: request.levels,
    quality,
    cost,
    state: 'vault',
    createdTick: world.tick,
    availableTick: world.tick + 1 + songDelay(request.levels) + (request.extraDelay ?? 0),
    releaseTick: null,
    marketingReach: 0,
    marketingCost: 0,
    streamsLast: 0,
    streamsTotal: 0,
    decay: 0,
    hitScore: 0,
    peakGlobal: null,
    peakGenre: null,
    weeksOut: 0,
    qualityMin: estimate.min,
    qualityMax: estimate.max,
    surprise: surprise.kind,
    combo: secret ? 'secret' : perfect ? 'perfect' : null,
    cover: false,
    history: [],
  };
  world.nextId += 1;
  world.songs.push(song);
  return song;
};

/** Why a song of this artist cannot come out that week, or null: one per artist, three per label. */
export const releaseBlocked = (world: World, labelId: string, artistId: string, releaseTick: number): string | null => {
  const artist = world.artists[artistId];
  const out = world.songs.filter((s) => (s.state === 'scheduled' || s.state === 'released') && s.releaseTick === releaseTick);
  if (out.some((s) => s.artistId === artistId) || (artist && artist.lastReleaseTick === releaseTick)) {
    return `${artist?.name ?? 'Cet artiste'} sort déjà un son cette semaine-là.`;
  }
  if (out.filter((s) => s.labelId === labelId).length >= CFG.release.perLabelWeek) {
    return `Déjà ${CFG.release.perLabelWeek} sorties cette semaine-là pour ton label.`;
  }
  return null;
};

/** Schedules a single. The marketing is paid now. */
export const scheduleRelease = (world: World, labelId: string, songId: string, releaseTick: number, marketingIds: string[]): Song => {
  const label = labelOf(world, labelId);
  const song = world.songs.find((s) => s.id === songId && s.labelId === labelId) ?? fail('Son introuvable.');
  if (song.state !== 'vault') return fail('Ce son est déjà programmé ou sorti.');
  if (releaseTick < song.availableTick) return fail("Ce son n'est pas encore prêt pour cette semaine.");
  if (releaseTick > world.tick + 8) return fail('Une sortie se programme au plus 8 semaines à l’avance.');
  const artist = artistOf(world, song.artistId);
  const blocked = releaseBlocked(world, labelId, artist.id, releaseTick);
  if (blocked) return fail(blocked);
  const options = [...new Set(marketingIds)].map(marketingById);
  const cost = options.reduce((sum, o) => sum + o.cost, 0);
  if (cost > label.cash) return fail('Pas assez de cash pour ce marketing.');
  label.cash -= cost;
  song.state = 'scheduled';
  song.releaseTick = releaseTick;
  song.marketingCost = cost;
  // The views of the promo depend on the artist's buzz the week of the release.
  song.marketingIds = options.map((o) => o.id);
  song.marketingReach = 0;
  return song;
};

/** Books one concert for the next tick. */
export const bookGig = (world: World, labelId: string, artistId: string): void => {
  const artist = artistOf(world, artistId);
  if (contractOf(world, artistId)?.labelId !== labelId) return fail(`${artist.name} n'est pas dans ton label.`);
  const booked = world.gigs.filter((g) => g.artistId === artistId).length;
  if (artist.energy < CFG.energy.gig * (booked + 1)) return fail(`${artist.name} n'a pas assez d'énergie pour ce concert.`);
  if (booked >= 3) return fail('Trois concerts par semaine au maximum.');
  world.gigs.push({ labelId, artistId, tick: world.tick + 1 });
};

/** Classic bank loan, one at a time. */
export const takeLoan = (world: World, labelId: string, amount: number, ticks: 8 | 16 | 24): void => {
  const label = labelOf(world, labelId);
  if (world.loans.some((l) => l.labelId === labelId && l.kind === 'classic')) return fail('Tu as déjà un prêt classique en cours.');
  const cap = CFG.tiers.loanCap[label.tier - 1] ?? 20_000;
  if (amount <= 0 || amount > cap) return fail(`La banque prête au plus ${cap} € à ton palier.`);
  label.cash += amount;
  world.loans.push({
    labelId,
    kind: 'classic',
    remaining: amount,
    ratePerTick: CFG.bank.classicBaseRate + (50 - label.reputation) * 0.0001,
    ticksLeft: ticks,
  });
};

export { debtOf };
