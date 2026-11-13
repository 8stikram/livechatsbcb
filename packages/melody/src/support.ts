// The label's support (owner's idea, 2026-11-13): a budget of 100 % shared between the label's artists with sliders.
// It costs nothing, but what one gets the others lose. Above an equal share an artist gets more promo, more CD and
// vinyl sales, faster progress and a better mood; below it, a little less of each. An artist whose lower-ranked
// labelmate is better supported than him gets jealous.
import { rosterOf } from './economy.ts';
import type { Rank } from './morale.ts';
import { clamp } from './rng.ts';
import type { Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type SupportKind = 'promo' | 'sales' | 'grow';

export const SUPPORT = {
  /** Each slider goes from 0 to this; a new artist starts in the middle. */
  max: 10,
  start: 5,
  /** Effect per level above an equal share (up), and per level under it (down: a little). */
  promo: { up: 0.25, down: 0.15 },
  sales: { up: 0.3, down: 0.2 },
  grow: { up: 0.2, down: 0.15 },
  /** Level: -1 left aside, 0 an equal share, up to this for an artist who gets everything. */
  maxLevel: 1.5,
  /** From this level up he feels backed (+1 morale a week); this far under, a little let down (-1, never under the floor). */
  backedAt: 0.5,
  backed: 1,
  aside: -1,
  asideFloor: 45,
  /** A lower rank with this much more of the support (ratio and gap): jealousy, every week. */
  snubRatio: 1.2,
  snubGap: 0.05,
  snub: -2,
} as const;

const RANK_ORDER: Rank[] = ['star', 'established', 'hope', 'development'];

const playerLabel = (world: World, labelId: string): Label | null => {
  const label = world.labels[labelId];
  return label && label.kind === 'player' ? label : null;
};

/** Slider of each artist of the label (0 to 10). */
export const supportWeights = (world: World, labelId: string): Record<string, number> => {
  const label = world.labels[labelId];
  return Object.fromEntries(rosterOf(world, labelId).map((a) => [a.id, label?.support?.[a.id] ?? SUPPORT.start]));
};

/** Share of the label's support of each artist (they add up to 1). */
export const sharesOf = (weights: Record<string, number>): Record<string, number> => {
  const ids = Object.keys(weights);
  const total = ids.reduce((sum, id) => sum + (weights[id] ?? 0), 0);
  return Object.fromEntries(ids.map((id) => [id, total > 0 ? (weights[id] ?? 0) / total : 1 / ids.length]));
};

export const supportShares = (world: World, labelId: string): Record<string, number> => sharesOf(supportWeights(world, labelId));

/** -1 (nothing) to 1.5 (everything): how far a share is from an equal one. Always 0 alone in the label. */
export const levelFor = (share: number, count: number): number => (count < 2 ? 0 : clamp(share * count - 1, -1, SUPPORT.maxLevel));

export const supportLevel = (world: World, labelId: string, artistId: string): number => {
  if (!playerLabel(world, labelId)) return 0;
  const shares = supportShares(world, labelId);
  return levelFor(shares[artistId] ?? 0, Object.keys(shares).length);
};

/** What a level does: promo views, CD and vinyl sales, or progress, times this. */
export const boostOf = (level: number, kind: SupportKind): number => 1 + level * (level >= 0 ? SUPPORT[kind].up : SUPPORT[kind].down);

export const supportBoost = (world: World, labelId: string, artistId: string, kind: SupportKind): number => boostOf(supportLevel(world, labelId, artistId), kind);

/** For each artist, the lower-ranked labelmate better supported than him, or null. */
export const snubbedBy = (artists: ReadonlyArray<{ id: string; name: string; rank: Rank }>, shares: Record<string, number>): Record<string, string | null> =>
  Object.fromEntries(
    artists.map((a) => {
      const mine = shares[a.id] ?? 0;
      const over = artists
        .filter((b) => RANK_ORDER.indexOf(b.rank) > RANK_ORDER.indexOf(a.rank))
        .filter((b) => (shares[b.id] ?? 0) >= mine * SUPPORT.snubRatio && (shares[b.id] ?? 0) - mine >= SUPPORT.snubGap)
        .sort((x, y) => (shares[y.id] ?? 0) - (shares[x.id] ?? 0))[0];
      return [a.id, over?.name ?? null];
    }),
  );

/** The player moves the sliders: one number from 0 to 10 per artist of the label. */
export const setSupport = (world: World, label: Label, weights: Record<string, number>): void => {
  const roster = rosterOf(world, label.id);
  if (roster.length < 2) fail('Il faut au moins deux artistes pour partager le soutien.');
  for (const id of Object.keys(weights)) if (!roster.some((a) => a.id === id)) fail('Cet artiste n’est pas dans ton label.');
  const next: Record<string, number> = {};
  for (const artist of roster) {
    const weight = weights[artist.id] ?? label.support?.[artist.id] ?? SUPPORT.start;
    if (!Number.isInteger(weight) || weight < 0 || weight > SUPPORT.max) fail(`Le soutien va de 0 à ${SUPPORT.max}.`);
    next[artist.id] = weight;
  }
  if (Object.values(next).every((w) => w === 0)) fail('Donne du soutien à au moins un artiste.');
  label.support = next;
};
