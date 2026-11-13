// Money: artist value, catalogue value, concerts, label tiers and the season ranking.
import { generalRating } from './artists.ts';
import { CFG } from './config.ts';
import type { Artist, Contract, Label, Song, World } from './types.ts';

export const contractOf = (world: World, artistId: string): Contract | undefined =>
  world.contracts.find((c) => c.artistId === artistId && c.endTick > world.tick);

export const rosterOf = (world: World, labelId: string): Artist[] =>
  world.contracts
    .filter((c) => c.labelId === labelId && c.endTick > world.tick)
    .map((c) => world.artists[c.artistId])
    .filter((a): a is Artist => a !== undefined);

/** Market value of an artist: twenty weeks of expected revenue plus a talent premium. */
export const artistValue = (artist: Artist, weeklyRevenue?: number): number => {
  const gen = generalRating(artist);
  const revenue = weeklyRevenue ?? artist.fans * 0.012 + Math.max(0, playGig(artist).profit) * CFG.live.labelShare * 2;
  const potentialFactor = 1 + Math.max(0, artist.potential - gen) / 100;
  return Math.round(20 * revenue + 5_000 * 1.08 ** (gen - 50) * potentialFactor);
};

/** Lowest label tier an artist of this fame accepts to sign with. */
export const fameTier = (artist: Artist): number => {
  const index = CFG.fameFans.findIndex((limit) => artist.fans <= limit);
  return index < 0 ? CFG.fameFans.length : index + 1;
};

/** What a label keeps from a song's streams once the artist is paid. */
export const labelShare = (contract: Contract | undefined): number => 1 - (contract?.royaltyRate ?? 0);

export const songValue = (song: Song, contract: Contract | undefined): number => {
  if (song.state !== 'released' || song.seized) return 0;
  const weekly = song.streamsLast * CFG.release.payPerStream * labelShare(contract);
  return weekly * Math.min(20, 1 / (1 - song.decay));
};

export const catalogueValue = (world: World, labelId: string): number =>
  Math.round(
    world.songs
      .filter((s) => s.labelId === labelId)
      .reduce((sum, song) => sum + songValue(song, contractOf(world, song.artistId)), 0),
  );

export const debtOf = (world: World, labelId: string): number =>
  world.loans.filter((l) => l.labelId === labelId).reduce((sum, l) => sum + l.remaining, 0);

export const fansOf = (world: World, labelId: string): number =>
  rosterOf(world, labelId).reduce((sum, a) => sum + a.fans, 0);

/** Cash + catalogue + half the value of the artists under contract. */
export const netWorth = (world: World, label: Label): number =>
  label.cash +
  catalogueValue(world, label.id) +
  0.5 * rosterOf(world, label.id).reduce((sum, a) => sum + artistValue(a), 0);

export interface GigResult {
  venue: string;
  audience: number;
  fill: number;
  profit: number;
}

/** One concert at home: the game picks the venue that earns the most. */
export const playGig = (artist: Artist, alreadyThisWeek = 0, crowd = 1, tier = 6): GigResult => {
  const demand =
    crowd *
    CFG.live.demandFactor * Math.sqrt(artist.fans) * (0.5 + artist.hype / 50) * Math.max(0.25, 1 - CFG.live.repeatPenalty * alreadyThisWeek);
  let best: GigResult | null = null;
  for (const venue of CFG.live.venues.filter((v) => v.minTier <= tier)) {
    const audience = Math.min(demand, venue.seats);
    const profit = audience * venue.price * CFG.live.margin - venue.fixed;
    if (!best || profit > best.profit) best = { venue: venue.name, audience: Math.round(audience), fill: audience / venue.seats, profit: Math.round(profit) };
  }
  if (!best) throw new Error('no venue configured');
  return best;
};

type HitKey = 'top50Genre' | 'top100Global' | 'top10Global' | 'numberOnes';

/** What each tier up needs (index: current tier - 1). */
export const TIER_RULES: Array<{ reputation: number; fans: number; revenue: number; hit: { key: HitKey; need: number; text: string } }> = [
  { reputation: 20, fans: 25_000, revenue: 0, hit: { key: 'top50Genre', need: 1, text: 'son dans un top 50 de genre' } },
  { reputation: 40, fans: 500_000, revenue: 250_000, hit: { key: 'top100Global', need: 1, text: 'son dans le top 100 global' } },
  { reputation: 60, fans: 5_000_000, revenue: 5_000_000, hit: { key: 'top10Global', need: 3, text: 'sons dans le top 10 global' } },
  { reputation: 80, fans: 50_000_000, revenue: 100_000_000, hit: { key: 'numberOnes', need: 1, text: 'n°1 du top global' } },
  { reputation: 95, fans: 500_000_000, revenue: 2_000_000_000, hit: { key: 'numberOnes', need: 10, text: 'n°1 du top global' } },
];

/** True when the label meets every condition of the next tier. */
export const canTierUp = (world: World, label: Label): boolean => {
  const rule = TIER_RULES[label.tier - 1];
  if (!rule) return false;
  return (
    label.reputation >= rule.reputation &&
    fansOf(world, label.id) >= rule.fans &&
    label.stats.revenueTotal >= rule.revenue &&
    label.stats[rule.hit.key] >= rule.hit.need
  );
};

export interface RankingLine {
  labelId: string;
  name: string;
  score: number;
  cash: number;
  fans: number;
  catalogue: number;
  reputation: number;
}

/** Season ranking of the player labels: log scale against the best of the world on each criterion. */
export const ranking = (world: World): RankingLine[] => {
  const lines = Object.values(world.labels)
    .filter((l) => l.kind === 'player' && !l.bankrupt)
    .map((l) => ({
      labelId: l.id,
      name: l.name,
      score: 0,
      cash: Math.max(0, l.cash - debtOf(world, l.id)),
      fans: fansOf(world, l.id),
      catalogue: catalogueValue(world, l.id),
      reputation: l.reputation,
    }));
  const points = (value: number, best: number): number => (best <= 0 ? 0 : (100 * Math.log10(1 + value)) / Math.log10(1 + best));
  const best = (key: 'cash' | 'fans' | 'catalogue' | 'reputation'): number => Math.max(0, ...lines.map((l) => l[key]));
  const top = { cash: best('cash'), fans: best('fans'), catalogue: best('catalogue'), reputation: best('reputation') };
  for (const line of lines) {
    line.score =
      Math.round(
        (CFG.ranking.cash * points(line.cash, top.cash) +
          CFG.ranking.fans * points(line.fans, top.fans) +
          CFG.ranking.catalogue * points(line.catalogue, top.catalogue) +
          CFG.ranking.reputation * (top.reputation <= 0 ? 0 : (100 * line.reputation) / top.reputation)) * 10,
      ) / 10;
  }
  return lines.sort((a, b) => b.score - a.score);
};
