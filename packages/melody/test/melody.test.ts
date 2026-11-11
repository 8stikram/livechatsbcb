import { describe, expect, it } from 'vitest';
import {
  CFG, GameError, addPlayerLabel, artistValue, bookGig, coherence, createRng, createSong, createWorld, estimateQuality,
  expectedOffer, featChance, featDemand, firstWeek, freeAgents, generalRating, playGig, producerOfLevel, ranking, rosterOf,
  runTick, scheduleRelease, signArtist, simulate, songCost, songEnergy, takeLoan, CATALOG_ARTISTS,
} from '../src/index.ts';
import type { Artist, World } from '../src/index.ts';

const starter = (world: World): Artist => {
  const artist = world.artists.fic_nova_kale;
  if (!artist) throw new Error('missing starter artist');
  return artist;
};

const worldWithLabel = (): { world: World; labelId: string; artist: Artist } => {
  const world = createWorld(42);
  const label = addPlayerLabel(world, 'u1', 'Chimchar Records');
  const artist = starter(world);
  signArtist(world, label.id, artist.id, expectedOffer(artist));
  return { world, labelId: label.id, artist };
};

describe('catalogue', () => {
  it('gives every artist a general rating equal to the catalogue value', () => {
    const world = createWorld(1);
    for (const source of CATALOG_ARTISTS) {
      const artist = world.artists[source.id];
      expect(artist, source.id).toBeDefined();
      if (artist) expect(Math.abs(generalRating(artist) - source.gen), source.id).toBeLessThanOrEqual(2);
    }
  });

  it('draws the hidden potential inside the catalogue range, differently per world', () => {
    const a = createWorld(1).artists.fic_kosmo;
    const b = createWorld(2).artists.fic_kosmo;
    expect(a?.potential).toBeGreaterThanOrEqual(68);
    expect(a?.potential).toBeLessThanOrEqual(90);
    expect(a?.attrs).toEqual(b?.attrs);
  });
});

describe('song creation', () => {
  it('prices the choices and the energy as in the design document', () => {
    const levels = { theme: 3, beat: 3, producer: 3, studio: 3 } as const;
    expect(songCost(levels, { level: 70, affinity: 1, price: 5_000 })).toBe(3_500 + 3_000 + 5_000 + 8_000);
    expect(songEnergy(levels, false)).toBe(30);
    expect(songEnergy({ theme: 1, beat: 1, producer: 1, studio: 1 }, false)).toBe(10);
    expect(songEnergy({ theme: 4, beat: 4, producer: 4, studio: 4 }, true)).toBe(35);
    expect(songCost({ theme: 1, beat: 4, producer: 4, studio: 1 }, { level: 86, affinity: 1, price: 40_000 })).toBe(60_000);
  });

  it('caps the quality when everything is free and widens with paid choices', () => {
    const { artist } = worldWithLabel();
    const free = estimateQuality({ artist, themeId: 'rupture', beatId: 'lovetrap', levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1) });
    const paid = estimateQuality({ artist, themeId: 'rupture', beatId: 'lovetrap', levels: { theme: 3, beat: 3, producer: 3, studio: 3 }, producer: producerOfLevel(3, 1) });
    expect(free.cap).toBe(62);
    expect(free.max).toBeLessThanOrEqual(62);
    expect(paid.center).toBeGreaterThan(free.center + 8);
    expect(paid.width).toBeLessThan(free.width);
  });

  it('rates theme and beat coherence', () => {
    expect(coherence('rupture', 'lovetrap')).toBe(95);
    expect(coherence('clash', 'lovetrap')).toBe(30);
    expect(coherence('rue', 'reggaeton')).toBe(55);
  });

  it('prices featurings and refuses insulting offers', () => {
    expect(featDemand({ fans: 1_000_000, hype: 40 })).toBeGreaterThan(13_000);
    expect(featDemand({ fans: 1_000_000, hype: 40 })).toBeLessThan(15_000);
    expect(featChance(390, 1_000, 0, 50)).toBeNull();
    expect(featChance(1_000, 1_000, 0, 50)).toBeCloseTo(0.5);
    expect(featChance(5_000, 1_000, 0, 50)).toBe(0.95);
  });

  it('refuses a song the label cannot pay or the artist cannot record', () => {
    const { world, labelId, artist } = worldWithLabel();
    const request = { artistId: artist.id, title: 'Rue Glacée', themeId: 'rupture', beatId: 'lovetrap', levels: { theme: 4, beat: 3, producer: 4, studio: 4 } as const, producer: producerOfLevel(4) };
    expect(() => createSong(world, labelId, request)).toThrow(GameError);
    artist.energy = 3;
    expect(() => createSong(world, labelId, { ...request, levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1) })).toThrow(/énergie/);
  });
});

describe('release and tick', () => {
  it('releases a single, pays the label and moves the artist', () => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId];
    const song = createSong(world, labelId, {
      artistId: artist.id, title: 'Rue Glacée', themeId: 'rupture', beatId: 'lovetrap',
      levels: { theme: 2, beat: 2, producer: 2, studio: 2 }, producer: producerOfLevel(2, 1),
    });
    expect(song.state).toBe('vault');
    expect(() => scheduleRelease(world, labelId, song.id, world.tick + 9, [])).toThrow(GameError);
    scheduleRelease(world, labelId, song.id, world.tick + 1, ['social_1', 'posters_1']);
    const fansBefore = artist.fans;
    const cashBefore = label?.cash ?? 0;
    const report = runTick(world);
    expect(report.releases).toHaveLength(1);
    expect(song.state).toBe('released');
    expect(song.streamsLast).toBeGreaterThan(10_000);
    expect(artist.fans).toBeGreaterThan(fansBefore);
    const income = report.labels[labelId]?.income ?? 0;
    expect(income).toBeCloseTo(song.streamsLast * CFG.release.payPerStream, 0);
    expect(label?.cash).toBeCloseTo(cashBefore + income - (CFG.tiers.fixedCosts[0] ?? 0), 0);
    const first = song.streamsLast;
    runTick(world);
    expect(song.streamsLast).toBeLessThan(first);
  });

  it('is deterministic for a seed', () => {
    const input = { quality: 68, fans: 3_200, featFans: 0, hype: 12, fit: 1.3, marketingReach: 60_000, rivals: 0 };
    expect(firstWeek(input, createRng(5))).toEqual(firstWeek(input, createRng(5)));
    const a = simulate(3, 28).snapshots;
    const b = simulate(3, 28).snapshots;
    expect(a).toEqual(b);
  });

  it('plays concerts in the venue that pays best', () => {
    const { world, labelId, artist } = worldWithLabel();
    expect(playGig({ ...artist, fans: 100_000, hype: 30 }).venue).toBe('Salle');
    expect(playGig({ ...artist, fans: 1_000, hype: 50 }).venue).toBe('Bar');
    bookGig(world, labelId, artist.id);
    const report = runTick(world);
    expect(report.labels[labelId]?.income).toBeGreaterThan(0);
    expect(artist.energy).toBeLessThanOrEqual(100);
  });
});

describe('labels', () => {
  it('only signs artists the label can attract and afford', () => {
    const world = createWorld(9);
    const label = addPlayerLabel(world, 'u1', 'Test');
    const star = world.artists.kendrick_lamar;
    const nova = starter(world);
    if (!star) throw new Error('missing');
    expect(() => signArtist(world, label.id, star.id, expectedOffer(star))).toThrow(/palier/);
    expect(() => signArtist(world, label.id, nova.id, { ...expectedOffer(nova), advance: 0, royaltyRate: 0.05 })).toThrow(/trop basse/);
    signArtist(world, label.id, nova.id, expectedOffer(nova));
    expect(rosterOf(world, label.id).map((a) => a.id)).toEqual([nova.id]);
    expect(freeAgents(world).some((a) => a.id === nova.id)).toBe(false);
    expect(() => addPlayerLabel(world, 'u1', 'Autre')).toThrow(GameError);
    expect(artistValue(star)).toBeGreaterThan(artistValue(nova) * 100);
  });

  it('lends once, then drives an overspending label to bankruptcy', () => {
    const world = createWorld(4);
    const label = addPlayerLabel(world, 'u1', 'Test');
    takeLoan(world, label.id, 20_000, 8);
    expect(label.cash).toBe(50_000);
    expect(() => takeLoan(world, label.id, 1_000, 8)).toThrow(GameError);
    label.cash = -40_000;
    let ticks = 0;
    while (!label.bankrupt && ticks < 40) {
      runTick(world);
      ticks += 1;
    }
    expect(label.bankrupt).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(CFG.bank.bankruptcyTicks);
    expect(ranking(world)).toHaveLength(0);
  });

  it('plays three seasons with sane numbers', () => {
    const { snapshots, world } = simulate(1, 84);
    const last = snapshots.filter((s) => s.tick === 84);
    expect(last).toHaveLength(4);
    for (const s of last) {
      expect(Number.isFinite(s.cash)).toBe(true);
      expect(s.fans).toBeGreaterThanOrEqual(0);
      expect(s.tier).toBeLessThanOrEqual(4);
    }
    const season1 = snapshots.filter((s) => s.tick === 28);
    expect(Math.max(...season1.map((s) => s.fans))).toBeGreaterThan(15_000);
    expect(Math.max(...season1.map((s) => s.fans))).toBeLessThan(2_000_000);
    expect(world.charts.global.length).toBeGreaterThan(20);
    expect(world.charts.global[0]?.streams).toBeGreaterThan(world.charts.global[1]?.streams ?? 0);
  });
});
