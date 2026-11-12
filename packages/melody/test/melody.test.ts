import { describe, expect, it } from 'vitest';
import {
  CFG, GameError, addPlayerLabel, artistValue, bookGig, coherence, createRng, createSong, createWorld, estimateQuality,
  expectedOffer, featChance, featDemand, firstWeek, freeAgents, generalRating, playGig, producerOfLevel, ranking, rosterOf,
  runTick, scheduleRelease, signArtist, simulate, songCost, songEnergy, takeLoan, CATALOG_ARTISTS,
  applyAction, buildView, cancelSession, guestDemand, offerFeat, reactToEvent, startSession,
  makeOffer, openTalk, talkOf, talkBlocked, contractOf,
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

describe('studio sessions', () => {
  const levels = { theme: 2, beat: 2, producer: 2, studio: 2 } as const;
  const plan = (artistId: string) => ({ artistId, themeId: 'rupture', beatId: 'lovetrap', levels: { ...levels } });

  // Moves the week until the draw gives at least one embrouille.
  const sessionWithClash = () => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 200_000;
    for (let week = 0; week < 60; week += 1) {
      world.tick = week;
      const session = startSession(world, label, plan(artist.id));
      if (session.events.some((e) => e.kind === 'clash')) return { world, label, artist, session };
    }
    throw new Error('no embrouille in 60 weeks');
  };

  it('draws one event after each choice, the same again if the player starts over', () => {
    const { world, label, artist, session } = sessionWithClash();
    expect(session.events.map((e) => e.stage)).toEqual(['theme', 'beat', 'producer', 'studio']);
    const first = JSON.stringify(session.events);
    cancelSession(world, label);
    expect(JSON.stringify(startSession(world, label, plan(artist.id)).events)).toBe(first);
  });

  it('waits for every embrouille to be answered, then records the song with what they cost', () => {
    const { world, label } = sessionWithClash();
    expect(() => applyAction(world, label.ownerId!, { type: 'song', title: 'Trop tôt' })).toThrow(GameError);
    let view = buildView(world, label.ownerId!);
    for (const event of view.session!.events.filter((e) => e.kind === 'clash')) {
      applyAction(world, label.ownerId!, { type: 'react', reactionId: event.reactions[0]!.id });
    }
    view = buildView(world, label.ownerId!);
    expect(view.session!.events.every((e) => e.kind === 'fluid' || e.result !== null)).toBe(true);
    applyAction(world, label.ownerId!, { type: 'feat_skip' });
    const extra = view.session!.extraCost;
    const before = label.cash;
    applyAction(world, label.ownerId!, { type: 'song', title: 'Après la tempête' });
    const song = world.songs.at(-1)!;
    expect(song.title).toBe('Après la tempête');
    expect(before - label.cash).toBe(view.session!.baseCost + extra);
    expect(buildView(world, label.ownerId!).session).toBeNull();
  });

  it('spins the featuring wheel: an insult closes the door, a refusal raises the price, a yes adds the guest', () => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 500_000;
    // A bigger label, so its budget per song leaves room for dear guests.
    label.tier = 4;
    startSession(world, label, plan(artist.id));
    const clashes = buildView(world, label.ownerId!).session!.events.filter((e) => e.kind === 'clash');
    for (const event of clashes) reactToEvent(world, label, event.reactions[0]!.id);
    const guests = buildView(world, label.ownerId!).session!.guests;
    expect(guests.length).toBeGreaterThan(2);

    const insulted = guests[0]!;
    offerFeat(world, label, insulted.id, Math.floor(insulted.demand * 0.3));
    expect(world.sessions![label.id]!.lastOffer).toMatchObject({ outcome: 'vexed', roll: null });
    expect(() => offerFeat(world, label, insulted.id, insulted.demand * 2)).toThrow(/boude/);

    // Offers just above 60 % of the demand: most are refused, each refusal makes the next one dearer.
    let accepted = false;
    for (const guest of guests.slice(1).reverse()) {
      for (let attempt = 0; attempt < 3 && !accepted; attempt += 1) {
        const demand = guestDemand(world, label.id, world.artists[guest.id]!);
        if (attempt > 0) expect(demand).toBeGreaterThan(guest.demand);
        offerFeat(world, label, guest.id, Math.round(demand * 1.5));
        accepted = world.sessions![label.id]!.lastOffer!.outcome === 'accepted';
      }
      if (accepted) break;
    }
    expect(accepted).toBe(true);
    const session = buildView(world, label.ownerId!).session!;
    expect(session.feat).not.toBeNull();
    expect(session.featDone).toBe(true);
    expect(session.guests).toEqual([]);
  });
});

describe('contract talks', () => {
  // A small free agent this label may sign, and the label with cash to spare.
  const table = () => {
    const world = createWorld(42);
    const label = addPlayerLabel(world, 'u1', 'Chimchar Records');
    label.cash = 500_000;
    const artist = freeAgents(world)
      .filter((a) => a.fans <= CFG.fameFans[0]! && generalRating(a) < 80)
      .sort((a, b) => expectedOffer(a).advance - expectedOffer(b).advance)[0]!;
    return { world, label, artist };
  };

  it('draws the same agent twice the same week, and hides what he wants', () => {
    const { world, label, artist } = table();
    const talk = openTalk(world, label, artist.id);
    const copy = structuredClone(talk);
    delete world.talks;
    expect(openTalk(world, label, artist.id)).toEqual(copy);
    expect(talk.patience).toBeGreaterThanOrEqual(3);
    expect(talk.patience).toBeLessThanOrEqual(5);
    const view = buildView(world, 'u1');
    expect(view.talks).toHaveLength(1);
    expect(JSON.stringify(view.talks)).not.toContain('expect');
    expect(view.talks[0]?.lock).toBeNull();
  });

  it('answers a fair offer with a counter-offer that signs when accepted', () => {
    const { world, label, artist } = table();
    const talk = openTalk(world, label, artist.id);
    // Gives exactly what he wants except a weak advance: close, not enough.
    const offer = { ...talk.expect, advance: Math.round(talk.expect.advance * 0.95) };
    if (talk.lock === 'advance') offer.advance = Math.max(offer.advance, talk.lockValue);
    const mood = makeOffer(world, label, artist.id, offer);
    expect(mood).toBe('counter');
    const counter = talkOf(world, label.id, artist.id)?.counter;
    expect(counter).toBeTruthy();
    const cash = label.cash;
    expect(makeOffer(world, label, artist.id, counter!)).toBe('deal');
    expect(contractOf(world, artist.id)?.labelId).toBe(label.id);
    expect(label.cash).toBe(cash - counter!.advance);
    expect(buildView(world, 'u1').talkNews[0]?.mood).toBe('deal');
  });

  it('reveals the blocking point, loses patience, then closes the door', () => {
    const { world, label, artist } = table();
    const talk = openTalk(world, label, artist.id);
    const fair = { ...talk.expect, advance: talk.expect.advance * 1.3, royaltyRate: talk.expect.royaltyRate * 1.3 };
    const broken =
      talk.lock === 'months' ? { ...fair, months: 36 }
      : talk.lock === 'advance' ? { ...fair, advance: talk.lockValue - 100, royaltyRate: talk.expect.royaltyRate * 1.5 }
      : talk.lock === 'royaltyRate' ? { ...fair, royaltyRate: talk.lockValue - 0.01, advance: talk.expect.advance * 1.5 }
      : { ...fair, weeklyAllowance: talk.lockValue - 10 };
    const patience = talk.patience;
    expect(makeOffer(world, label, artist.id, broken)).toBe('lock');
    expect(talk.patience).toBe(patience - 1);
    expect(buildView(world, 'u1').talks[0]?.lock?.clause).toBe(talk.lock);

    // An insult: he leaves and will not talk for a month.
    expect(makeOffer(world, label, artist.id, { advance: 0, royaltyRate: 0.05, months: 36, weeklyAllowance: 0 })).toBe('vexed');
    expect(talkOf(world, label.id, artist.id)).toBeUndefined();
    expect(() => openTalk(world, label, artist.id)).toThrow(/ne répond plus/);
    expect(talkBlocked(world, label, artist)).toMatch(/Ne répond plus/);
    expect(buildView(world, 'u1').talkNews[0]).toMatchObject({ artistId: artist.id, mood: 'vexed', closedFor: 28 });
  });

  it('lets the label renew a contract near its end only', () => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 500_000;
    expect(() => openTalk(world, label, artist.id)).toThrow(/contrat encore long/);
    const contract = contractOf(world, artist.id)!;
    world.tick = contract.endTick - 3;
    const talk = openTalk(world, label, artist.id);
    expect(talk.renewal).toBe(true);
    const generous = { advance: talk.expect.advance * 1.5, royaltyRate: Math.min(0.5, talk.expect.royaltyRate * 1.5), months: 12, weeklyAllowance: talk.expect.weeklyAllowance * 2 };
    const end = contract.endTick;
    expect(makeOffer(world, label, artist.id, generous)).toBe('deal');
    expect(contract.endTick).toBe(end + 12 * CFG.ticksPerMonth);
    expect(world.contracts.filter((c) => c.artistId === artist.id)).toHaveLength(1);
  });

  it('goes through the player actions and forgets old talks with the weekly tick', () => {
    const { world, label, artist } = table();
    applyAction(world, 'u1', { type: 'talk', artistId: artist.id });
    expect(buildView(world, 'u1').talks).toHaveLength(1);
    applyAction(world, 'u1', { type: 'talk_leave', artistId: artist.id });
    expect(buildView(world, 'u1').talks).toHaveLength(0);
    openTalk(world, label, artist.id);
    for (let i = 0; i < 4; i += 1) runTick(world);
    expect(world.talks?.[`${label.id}:${artist.id}`]).toBeUndefined();
  });
});

describe('tutorial', () => {
  const fresh = () => {
    const world = createWorld(42);
    const starterId = buildView(world, 'u1').starters[0]!.id;
    applyAction(world, 'u1', { type: 'found', name: 'Tuto Records', starterId });
    const label = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    return { world, label };
  };

  it('guides a new label through a protected first week, money given back', () => {
    const { world, label } = fresh();
    expect(buildView(world, 'u1').tutorial?.step).toBe('home');
    applyAction(world, 'u1', { type: 'tuto', move: 'next' });
    expect(buildView(world, 'u1').tutorial?.step).toBe('sign');

    // Sign a second artist: even an insult keeps him at the table, and the advance comes back.
    const target = buildView(world, 'u1').market.filter((m) => m.blocked === null).sort((a, b) => a.advance - b.advance)[0]!;
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'offer', artistId: target.id, offer: { advance: 0, royaltyRate: 0.05, months: 36, weeklyAllowance: 0 } });
    expect(buildView(world, 'u1').talks).toHaveLength(1);
    const counter = buildView(world, 'u1').talks[0]?.counter;
    applyAction(world, 'u1', { type: 'offer', artistId: target.id, offer: counter ?? { advance: Math.round(target.advance * 1.15), royaltyRate: 0.3, months: 12, weeklyAllowance: 0 } });
    if (buildView(world, 'u1').talks.length) {
      applyAction(world, 'u1', { type: 'offer', artistId: target.id, offer: buildView(world, 'u1').talks[0]!.counter! });
    }
    expect(rosterOf(world, label.id)).toHaveLength(2);
    expect(label.cash).toBe(cash);
    expect(buildView(world, 'u1').tutorial?.step).toBe('song');

    // The studio: three smooth sessions, one easy embrouille that always works out.
    const artistId = target.id;
    applyAction(world, 'u1', { type: 'studio', artistId, themeId: 'rupture', beatId: 'lovetrap', levels: { theme: 2, beat: 2, producer: 2, studio: 2 } });
    const session = buildView(world, 'u1').session!;
    expect(session.events.map((e) => e.kind)).toEqual(['fluid', 'fluid', 'clash', 'fluid']);
    applyAction(world, 'u1', { type: 'react', reactionId: 'pressure' });
    expect(buildView(world, 'u1').session!.events[2]?.result).toMatch(/débarque/);
    // The featuring wheel says yes by the second try.
    const guest = buildView(world, 'u1').session!.guests.at(-1)!;
    applyAction(world, 'u1', { type: 'feat', guestId: guest.id, offer: Math.max(1, Math.round(guest.demand * 0.3)) });
    if (!buildView(world, 'u1').session!.featDone) {
      applyAction(world, 'u1', { type: 'feat', guestId: guest.id, offer: Math.max(1, Math.round(guest.demand * 0.6)) });
    }
    expect(buildView(world, 'u1').session!.featDone).toBe(true);
    applyAction(world, 'u1', { type: 'song', title: 'Premier tube' });
    expect(label.cash).toBe(cash);
    expect(buildView(world, 'u1').tutorial?.step).toBe('release');

    const song = world.songs.find((s) => s.labelId === label.id)!;
    applyAction(world, 'u1', { type: 'release', songId: song.id, inWeeks: Math.max(1, song.availableTick - world.tick), marketing: ['social_1'] });
    const view = buildView(world, 'u1');
    expect(view.tutorial?.step).toBe('results');
    expect(view.tutorial?.preview?.streams).toBeGreaterThan(0);
    expect(label.cash).toBe(cash);
    applyAction(world, 'u1', { type: 'tuto', move: 'next' });
    expect(buildView(world, 'u1').tutorial).toBeNull();
  });

  it('can be skipped: the game makes and releases a free song', () => {
    const { world, label } = fresh();
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    expect(buildView(world, 'u1').tutorial).toBeNull();
    expect(world.songs.filter((s) => s.labelId === label.id && s.state === 'scheduled')).toHaveLength(1);
    expect(label.cash).toBe(cash);
  });
});

describe('featuring between players', () => {
  const twoPlayers = () => {
    const world = createWorld(42);
    for (const [owner, name] of [['u1', 'Alpha Records'], ['u2', 'Beta Records']] as const) {
      const starterId = buildView(world, owner).starters[0]!.id;
      applyAction(world, owner, { type: 'found', name, starterId });
      applyAction(world, owner, { type: 'tuto', move: 'next' });
      applyAction(world, owner, { type: 'tuto', move: 'next' });
    }
    // Out of the tutorial for good, without its free song.
    for (const t of Object.values(world.tutorials ?? {})) t.step = 'done';
    const [a, b] = ['u1', 'u2'].map((o) => Object.values(world.labels).find((l) => l.ownerId === o)!);
    return { world, a: a!, b: b!, guest: rosterOf(world, b!.id)[0]!, host: rosterOf(world, a!.id)[0]! };
  };

  it('goes back and forth on the price, then pays the owner on a yes', () => {
    const { world, a, b, guest } = twoPlayers();
    expect(buildView(world, 'u1').others.map((o) => o.id)).toContain(guest.id);
    applyAction(world, 'u1', { type: 'feat_ask', guestId: guest.id, fee: 1_000 });
    expect(() => applyAction(world, 'u1', { type: 'feat_ask', guestId: guest.id, fee: 2_000 })).toThrow(/déjà une demande/);
    const deal = buildView(world, 'u2').featDeals[0]!;
    expect(deal).toMatchObject({ direction: 'received', myTurn: true, fee: 1_000, otherLabel: 'Alpha Records' });
    expect(() => applyAction(world, 'u1', { type: 'feat_answer', dealId: deal.id, answer: 'accept' })).toThrow(/pas à toi/);
    applyAction(world, 'u2', { type: 'feat_answer', dealId: deal.id, answer: 'counter', fee: 1_500 });
    expect(buildView(world, 'u1').featDeals[0]).toMatchObject({ myTurn: true, fee: 1_500 });
    const [cashA, cashB] = [a.cash, b.cash];
    applyAction(world, 'u1', { type: 'feat_answer', dealId: deal.id, answer: 'accept' });
    expect(a.cash).toBe(cashA - 1_500);
    expect(b.cash).toBe(cashB + 1_500);
    expect(buildView(world, 'u1').featDeals[0]).toMatchObject({ status: 'accepted', weeksLeft: 4 });
  });

  it('puts the guest on the song without the wheel, with the friendship bonus', () => {
    const { world, a, guest, host } = twoPlayers();
    applyAction(world, 'u1', { type: 'feat_ask', guestId: guest.id, fee: 800 });
    const dealId = buildView(world, 'u2').featDeals[0]!.id;
    applyAction(world, 'u2', { type: 'feat_answer', dealId, answer: 'accept' });
    a.cash = 100_000;
    applyAction(world, 'u1', { type: 'studio', artistId: host.id, themeId: 'rupture', beatId: 'lovetrap', levels: { theme: 2, beat: 2, producer: 2, studio: 2 } });
    let session = buildView(world, 'u1').session!;
    for (const event of session.events) if (event.kind === 'clash') applyAction(world, 'u1', { type: 'react', reactionId: event.reactions[0]!.id });
    session = buildView(world, 'u1').session!;
    expect(session.guests[0]).toMatchObject({ id: guest.id, dealId, labelName: 'Beta Records' });
    const before = world.sessions![a.id]!.quality;
    applyAction(world, 'u1', { type: 'feat_deal', dealId });
    expect(world.sessions![a.id]!.quality).toBe(before + 2);
    const energy = guest.energy;
    const cash = a.cash;
    applyAction(world, 'u1', { type: 'song', title: 'Ensemble' });
    const song = world.songs.find((s) => s.labelId === a.id)!;
    expect(song.featArtistId).toBe(guest.id);
    expect(guest.energy).toBe(energy - 10);
    expect(a.cash).toBe(cash - session.baseCost - session.extraCost);
    expect(buildView(world, 'u1').featDeals[0]?.status).toBe('used');
  });

  it('counts silence as a no after two weeks', () => {
    const { world, a, guest } = twoPlayers();
    applyAction(world, 'u1', { type: 'feat_ask', guestId: guest.id, fee: 500 });
    runTick(world);
    expect(buildView(world, 'u1').featDeals[0]?.status).toBe('pending');
    const report = runTick(world);
    expect(buildView(world, 'u1').featDeals[0]?.status).toBe('expired');
    expect(report.labels[a.id]?.events.join(' ')).toMatch(/c'est non/);
    runTick(world);
    runTick(world);
    expect(world.featDeals).toHaveLength(0);
  });
});
