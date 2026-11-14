import { describe, expect, it } from 'vitest';
import {
  CFG, GameError, addPlayerLabel, artistValue, bookGig, coherence, createRng, createSong, createWorld, estimateQuality,
  expectedOffer, featChance, featDemand, firstWeek, freeAgents, generalRating, playGig, producerOfLevel, ranking, rosterOf,
  runTick, scheduleRelease, signArtist, simulate, songCost, songEnergy, takeLoan, CATALOG_ARTISTS,
  applyAction, buildView, cancelSession, guestDemand, offerFeat, reactToEvent, startSession,
  makeOffer, openTalk, talkOf, talkBlocked, contractOf, studioOffers, BEATS, THEMES,
  releaseBlocked, promoViews, secretCombos, trendOf, rollSurprise, langOf, inventTitle, academyOf, LOOKS, lookOf, parseLook, seasonsOf,
  STAFF, staffOf, staffWage, coachBoost, producerShare, houseProducer, viewsBoost, crowdBoost, gigEnergy,
  MORALE, RANKS, ranksOf, isLeader, worriesOf, moraleBlock, tickMorale, dynamicsView,
  shareLoan, returnLoans, STUDIO_CONTENT, studioCardsFor, usualNote, isLetdown, judgeRelease,
  SALES, salesQuote, createProject, tickProjects, supportBoost, ROLES, ROLE_RULES, FORM, roleSlots, inForm, lightUp, experienceBonus,
  WARS, pressOdds, COOP, relationsView, enemyBoost, tickCoop, FESTIVAL, festivalView, nextFestivalTick, runFestival,
  CARD_IDS, EVENTS, EVENT_CONTENT, SERVER_CONTENT, SERVER_IDS, eventsView, streamMult, tickCards, tickServerEvents, applyStreamEvents,
  ESTATE, TIER_TABLE, assetBase, assetLoanCap, buybackPrice, tickAssetLoan, tierProgress, catalogueValue,
  SKILL_IDS, skillsOf, skillLevel, skillPlus, stageBoost, tirelessFactor, PROFILES, EVOLUTION, GENRE_CHANGE, profileOf, profileGrowth, afterRelease, tickEvolution, GENRES,
} from '../src/index.ts';
import type { Artist, Song, StaffMember, World } from '../src/index.ts';

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

  it('keeps the note around the artist: money takes the risk away, choices move it a little', () => {
    const { artist } = worldWithLabel();
    const level = generalRating(artist);
    const cheap = { theme: 1, beat: 1, producer: 1, studio: 1 } as const;
    const dear = { theme: 4, beat: 3, producer: 4, studio: 4 } as const;
    const fit = BEATS.find((b) => b.genres.includes(artist.genre))!;
    const free = estimateQuality({ artist, themeId: fit.themes[0]!, beatId: fit.id, levels: cheap, producer: producerOfLevel(1) });
    const paid = estimateQuality({ artist, themeId: fit.themes[0]!, beatId: fit.id, levels: dear, producer: producerOfLevel(4, 1) });
    // Same ceiling, a few points above the artist; paying only lifts the floor.
    expect(paid.max).toBe(free.max);
    expect(paid.max).toBeLessThanOrEqual(level + 12);
    expect(paid.min).toBeGreaterThan(free.min + 8);
    expect(free.min).toBeLessThan(level - 8);
    // Choices that clash cost more than money can give back.
    const offBeat = BEATS.find((b) => !b.genres.includes(artist.genre) && !artist.secondary.some((g) => b.genres.includes(g)))!;
    const wrong = estimateQuality({ artist, themeId: 'clash', beatId: offBeat.id, levels: dear, producer: producerOfLevel(4, 1) });
    expect(free.center).toBeGreaterThan(wrong.center + 5);
  });

  it('rates theme and beat coherence', () => {
    expect(coherence('rupture', 'lovetrap')).toBe(95);
    expect(coherence('clash', 'lovetrap')).toBe(30);
    expect(coherence('rue', 'reggaeton')).toBe(55);
  });

  it('prices featurings and refuses insulting offers', () => {
    expect(featDemand({ fans: 1_000_000, hype: 40 })).toBeGreaterThan(26_000);
    expect(featDemand({ fans: 1_000_000, hype: 40 })).toBeLessThan(30_000);
    // A star asks far more from an unknown than from an equal.
    const irko = { fans: 60_000, hype: 48 };
    expect(featDemand(irko, 0, { fans: 3_000 })).toBeGreaterThan(20_000);
    expect(featDemand(irko, 0, { fans: 80_000 })).toBe(featDemand(irko));
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
    if (label) label.cash = 30_000;
    world.lastServerEvents = [...SERVER_IDS];
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
    expect(song.streamsLast).toBeGreaterThan(300);
    expect(song.streamsLast).toBeLessThan(40_000);
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
    expect(label.cash).toBe(30_000);
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
  // The first theme and beat the studio offers this week.
  const plan = (world: World, labelId: string, artist: Artist) => {
    const offers = studioOffers(world, labelId, artist);
    return { artistId: artist.id, themeId: offers.themes[0]!.id, beatId: offers.beats[0]!.id, levels: { ...levels } };
  };

  // Moves the week until the draw gives at least one embrouille.
  const sessionWithClash = () => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 200_000;
    for (let week = 0; week < 60; week += 1) {
      world.tick = week;
      const session = startSession(world, label, plan(world, label.id, artist));
      if (session.events.some((e) => e.kind === 'clash')) return { world, label, artist, session };
    }
    throw new Error('no embrouille in 60 weeks');
  };

  it('draws one event after each choice, the same again if the player starts over', () => {
    const { world, label, artist, session } = sessionWithClash();
    expect(session.events.map((e) => e.stage)).toEqual(['theme', 'beat', 'producer', 'studio']);
    const first = JSON.stringify(session.events);
    cancelSession(world, label);
    expect(JSON.stringify(startSession(world, label, plan(world, label.id, artist)).events)).toBe(first);
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
    startSession(world, label, plan(world, label.id, artist));
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
    applyAction(world, 'u1', { type: 'found', name: 'Tuto Records' });
    const label = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    return { world, label };
  };

  it('guides a new label through a protected first week, money given back', () => {
    const { world, label } = fresh();
    expect(buildView(world, 'u1').tutorial?.step).toBe('home');
    applyAction(world, 'u1', { type: 'tuto', move: 'next' });
    expect(buildView(world, 'u1').tutorial?.step).toBe('academy');

    // No artist at the start: the first one comes out of the centre de formation, with a new name.
    expect(rosterOf(world, label.id)).toHaveLength(0);
    const youths = buildView(world, 'u1').academy!.youths;
    expect(youths).toHaveLength(3);
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'youth_rename', youthId: youths[0]!.id, name: 'Kid Néon' });
    applyAction(world, 'u1', { type: 'youth_promote', youthId: youths[0]!.id });
    const roster = rosterOf(world, label.id);
    expect(roster.map((a) => a.name)).toEqual(['Kid Néon']);
    expect(buildView(world, 'u1').academy!.youths).toHaveLength(2);
    expect(buildView(world, 'u1').tutorial?.step).toBe('song');

    // The studio: three smooth sessions, one easy embrouille that always works out.
    const artistId = roster[0]!.id;
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

  it('can be skipped: the game takes a youth out of the centre, makes and releases a free song', () => {
    const { world, label } = fresh();
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    expect(buildView(world, 'u1').tutorial).toBeNull();
    expect(world.songs.filter((s) => s.labelId === label.id && s.state === 'scheduled')).toHaveLength(1);
    expect(rosterOf(world, label.id)).toHaveLength(1);
    expect(label.cash).toBe(cash);
  });
});

describe('featuring between players', () => {
  const twoPlayers = () => {
    const world = createWorld(42);
    for (const [owner, name] of [['u1', 'Alpha Records'], ['u2', 'Beta Records']] as const) {
      applyAction(world, owner, { type: 'found', name });
      const youth = buildView(world, owner).academy!.youths[0]!;
      applyAction(world, owner, { type: 'youth_promote', youthId: youth.id });
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
    const offers = studioOffers(world, a.id, host);
    applyAction(world, 'u1', { type: 'studio', artistId: host.id, themeId: offers.themes[0]!.id, beatId: offers.beats[0]!.id, levels: { theme: 2, beat: 2, producer: 2, studio: 2 } });
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

describe('studio choices and releases', () => {
  it('offers five themes and five beats a week, the same all week, and refuses the others', () => {
    const { world, labelId, artist } = worldWithLabel();
    const offers = studioOffers(world, labelId, artist);
    expect(offers.themes).toHaveLength(5);
    expect(offers.beats).toHaveLength(5);
    expect(studioOffers(world, labelId, artist)).toEqual(offers);
    const missing = THEMES.find((t) => !offers.themes.some((o) => o.id === t.id))!;
    const levels = { theme: 2, beat: 2, producer: 2, studio: 2 } as const;
    expect(() => startSession(world, world.labels[labelId]!, { artistId: artist.id, themeId: missing.id, beatId: offers.beats[0]!.id, levels })).toThrow(/proposé/);
  });

  it('lets one song per artist and three per label out each week', () => {
    const { world, labelId, artist } = worldWithLabel();
    const make = (title: string) => {
      artist.energy = 100;
      const label = world.labels[labelId]!;
      label.cash = 1e6;
      return createSong(world, labelId, {
        artistId: artist.id, title, themeId: 'rupture', beatId: 'lovetrap',
        levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
      });
    };
    const week = world.tick + 2;
    scheduleRelease(world, labelId, make('Un').id, week, ['posts']);
    expect(releaseBlocked(world, labelId, artist.id, week)).toMatch(/semaine/);
    expect(() => scheduleRelease(world, labelId, make('Deux').id, week, [])).toThrow(GameError);
    expect(releaseBlocked(world, labelId, artist.id, week + 1)).toBeNull();
  });

  it('finds promo views from the buzz, and goes viral only now and then', () => {
    const rng = createRng(9);
    const small = { fans: 500, hype: 0 };
    const big = { fans: 2_000_000, hype: 40 };
    const sum = (artist: typeof small, ids: string[]) => promoViews(ids, artist, createRng(3)).reduce((s, p) => s + p.views, 0);
    expect(sum(big, ['posts'])).toBeGreaterThan(sum(small, ['posts']));
    expect(sum(small, ['posts', 'clip'])).toBeGreaterThan(sum(small, ['posts']));
    let viral = 0;
    for (let i = 0; i < 3_000; i += 1) viral += promoViews(['posts'], small, rng).filter((p) => p.viral).length;
    expect(viral / 3_000).toBeGreaterThan(0.01);
    expect(viral / 3_000).toBeLessThan(0.07);
  });

  it('keeps ten secret combos a season and a trend each month', () => {
    const world = createWorld(7);
    expect(secretCombos(world, 0).size).toBe(10);
    expect(secretCombos(world, 5)).toEqual(secretCombos(world, 0));
    const trend = trendOf(world, 0);
    expect(trend.weeksLeft).toBeGreaterThan(0);
    expect(trendOf(world, 1)).toMatchObject({ genre: trend.genre });
  });

  it('surprises more often when the session took risks', () => {
    const artist = { attrs: { creativite: 50, discipline: 50 } } as Artist;
    const count = (risk: number) => {
      const rng = createRng(11);
      let hits = 0;
      for (let i = 0; i < 4_000; i += 1) if (rollSurprise(rng, risk, artist).kind !== null) hits += 1;
      return hits;
    };
    expect(count(3)).toBeGreaterThan(count(0) * 1.5);
  });

  it('invents titles in the language of the artist', () => {
    expect(langOf('FR')).toBe('fr');
    expect(langOf('US')).toBe('en');
    expect(langOf('US', 'latin')).toBe('es');
    const rng = createRng(4);
    const titles = new Set(Array.from({ length: 40 }, () => inventTitle(rng, 'fr', 'rap_fr')));
    expect(titles.size).toBeGreaterThan(20);
    for (const title of titles) expect(title.length).toBeGreaterThan(1);
  });
});

describe('centre de formation', () => {
  const start = () => {
    const world = createWorld(42);
    applyAction(world, 'u1', { type: 'found', name: 'Centre Records' });
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    const label = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    label.cash = 50_000;
    return { world, label };
  };

  it('opens with three youths and a free scout, and hides their true level behind a range', () => {
    const world = createWorld(42);
    applyAction(world, 'u1', { type: 'found', name: 'Centre Records' });
    const view = buildView(world, 'u1');
    expect(view.roster).toHaveLength(0);
    expect(view.academy!.youths).toHaveLength(3);
    expect(view.academy!.scout).toMatchObject({ stars: 1, wage: 0 });
    expect(view.academy!.hiring).toHaveLength(4);
    expect(JSON.stringify(view.academy)).not.toContain('"potential"');
    for (const youth of view.academy!.youths) expect(youth.genMax).toBeGreaterThanOrEqual(youth.genMin);
  });

  it('sends the scout away, brings talents back, and lets them go if nobody answers', () => {
    const { world } = start();
    applyAction(world, 'u1', { type: 'scout_send', zone: 'fr', genre: 'drill' });
    expect(() => applyAction(world, 'u1', { type: 'scout_send', zone: 'us', genre: null })).toThrow(/mission/);
    runTick(world);
    expect(buildView(world, 'u1').academy!.found).toHaveLength(0);
    runTick(world);
    const found = buildView(world, 'u1').academy!.found;
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((y) => y.genre === 'drill')).toBe(true);
    applyAction(world, 'u1', { type: 'youth_take', youthId: found[0]!.id });
    expect(buildView(world, 'u1').academy!.youths).toHaveLength(3);
    for (let i = 0; i < 4; i += 1) runTick(world);
    expect(buildView(world, 'u1').academy!.found).toHaveLength(0);
  });

  it('tightens the range as weeks go by, and grows youths slower than signed artists', () => {
    const { world, label } = start();
    const before = buildView(world, 'u1').academy!.youths[0]!;
    const truth = academyOf(world, label.id).youths.find((y) => y.id === before.id)!;
    const level = truth.gen;
    for (let i = 0; i < 20; i += 1) runTick(world);
    const after = buildView(world, 'u1').academy!.youths.find((y) => y.id === before.id)!;
    expect(after.genMax - after.genMin).toBeLessThan(before.genMax - before.genMin);
    expect(after.known).toBeGreaterThan(before.known);
    expect(truth.gen).toBeGreaterThan(level);
    expect(truth.gen).toBeLessThan(level + 3);
  });

  it('hires a scout from the weekly list, renames only youths, and sells an artist for half his value', () => {
    const { world, label } = start();
    const scout = buildView(world, 'u1').academy!.hiring[0]!;
    applyAction(world, 'u1', { type: 'scout_hire', scoutId: scout.id });
    expect(buildView(world, 'u1').academy!.scout.name).toBe(scout.name);
    const youth = buildView(world, 'u1').academy!.youths[0]!;
    expect(() => applyAction(world, 'u1', { type: 'youth_rename', youthId: youth.id, name: 'X' })).toThrow(GameError);
    applyAction(world, 'u1', { type: 'youth_drop', youthId: youth.id });
    expect(buildView(world, 'u1').academy!.youths).toHaveLength(1);

    const artist = rosterOf(world, label.id)[0]!;
    expect(() => applyAction(world, 'u1', { type: 'sell', artistId: artist.id })).toThrow(/vient de signer/);
    contractOf(world, artist.id)!.startTick -= 8;
    const price = buildView(world, 'u1').roster[0]!.salePrice;
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'sell', artistId: artist.id });
    expect(label.cash).toBe(cash + price);
    expect(rosterOf(world, label.id)).toHaveLength(0);
    expect(buildView(world, 'u1').news[0]).toMatch(/vend/);
  });

  it('shows the stars of the game labels with a padlock, and keeps favourites', () => {
    const { world } = start();
    const market = buildView(world, 'u1').market;
    const locked = market.filter((m) => m.lockedBy !== null);
    expect(locked.length).toBeGreaterThan(20);
    expect(locked.every((m) => m.blocked !== null)).toBe(true);
    applyAction(world, 'u1', { type: 'fav', artistId: locked[0]!.id });
    expect(buildView(world, 'u1').market.find((m) => m.id === locked[0]!.id)?.fav).toBe(true);
  });
});

describe('transferts entre joueurs', () => {
  const twoLabels = () => {
    const world = createWorld(42);
    for (const [user, name] of [['u1', 'Acheteur Records'], ['u2', 'Vendeur Records']] as const) {
      applyAction(world, user, { type: 'found', name });
      applyAction(world, user, { type: 'tuto', move: 'skip' });
    }
    const buyer = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    const seller = Object.values(world.labels).find((l) => l.ownerId === 'u2')!;
    buyer.cash = 100_000;
    seller.cash = 5_000;
    const artist = rosterOf(world, seller.id)[0]!;
    return { world, buyer, seller, artist };
  };
  const generous = (artist: Artist) => {
    const e = expectedOffer(artist);
    return { advance: Math.round(e.advance * 1.5) + 500, royaltyRate: Math.min(0.5, e.royaltyRate * 1.5), months: 12 as const, weeklyAllowance: 100 };
  };

  it('agrees a price with counter-offers, then pays only when the artist signs', () => {
    const { world, buyer, seller, artist } = twoLabels();
    applyAction(world, 'u1', { type: 'transfer_ask', artistId: artist.id, fee: 1 });
    const offer = buildView(world, 'u2').transfers[0]!;
    expect(offer).toMatchObject({ direction: 'received', myTurn: true, fee: 1 });
    applyAction(world, 'u2', { type: 'transfer_answer', transferId: offer.id, answer: 'counter', fee: 9_000 });
    expect(() => applyAction(world, 'u2', { type: 'transfer_answer', transferId: offer.id, answer: 'accept' })).toThrow(/pas à toi/);
    applyAction(world, 'u1', { type: 'transfer_answer', transferId: offer.id, answer: 'accept' });
    expect(buildView(world, 'u1').transfers[0]!.status).toBe('agreed');
    expect(buyer.cash).toBe(100_000);
    expect(contractOf(world, artist.id)!.labelId).toBe(seller.id);
    expect(world.marketNews!.at(-1)!.text).toMatch(/9\s000/);

    const mood = applyAction(world, 'u1', { type: 'offer', artistId: artist.id, offer: generous(artist) });
    void mood;
    expect(contractOf(world, artist.id)!.labelId).toBe(buyer.id);
    expect(seller.cash).toBe(5_000 + 9_000);
    expect(buildView(world, 'u1').transfers[0]!.status).toBe('done');
    expect(world.marketNews!.some((n) => n.text.startsWith('Transfert'))).toBe(true);
  });

  it('lets the release clause skip the seller, and keeps others away from a signed artist', () => {
    const { world, artist } = twoLabels();
    expect(talkBlocked(world, Object.values(world.labels).find((l) => l.ownerId === 'u1')!, artist)).toBe('Déjà sous contrat');
    applyAction(world, 'u2', { type: 'clause', artistId: artist.id, amount: 20_000 });
    expect(buildView(world, 'u1').others.find((o) => o.id === artist.id)!.clause).toBe(20_000);
    applyAction(world, 'u1', { type: 'transfer_ask', artistId: artist.id, fee: 20_000 });
    expect(buildView(world, 'u1').transfers[0]).toMatchObject({ status: 'agreed', byClause: true });
  });

  it('drops an unsigned agreement after two weeks, and the artist stays', () => {
    const { world, seller, artist } = twoLabels();
    applyAction(world, 'u2', { type: 'clause', artistId: artist.id, amount: 100 });
    applyAction(world, 'u1', { type: 'transfer_ask', artistId: artist.id, fee: 100 });
    runTick(world);
    runTick(world);
    expect(buildView(world, 'u1').transfers[0]!.status).toBe('expired');
    expect(contractOf(world, artist.id)!.labelId).toBe(seller.id);
  });
});

describe('prix du studio', () => {
  it('makes a small label pay small prices', () => {
    const levels = { theme: 3, beat: 3, producer: 3, studio: 3 } as const;
    const producer = producerOfLevel(3);
    expect(songCost(levels, producer, 1)).toBeLessThan(songCost(levels, producer, 3) / 5);
  });
});

describe('clashs, piques et interviews', () => {
  const twoLabels = () => {
    const world = createWorld(7);
    for (const [user, name] of [['u1', 'Rouge Records'], ['u2', 'Bleu Records']] as const) {
      applyAction(world, user, { type: 'found', name });
      applyAction(world, user, { type: 'tuto', move: 'skip' });
    }
    const a = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    const b = Object.values(world.labels).find((l) => l.ownerId === 'u2')!;
    // Between players, one only attacks one's enemies.
    expect(() => applyAction(world, 'u1', { type: 'shade', targetLabelId: b.id, line: 0 })).toThrow(/ennemi/);
    applyAction(world, 'u1', { type: 'enemy_add', labelId: b.id });
    return { world, a, b, artistA: rosterOf(world, a.id)[0]!, artistB: rosterOf(world, b.id)[0]! };
  };

  it('puts out two disstracks and gives fans and buzz to the winner', () => {
    const { world, a, b, artistA, artistB } = twoLabels();
    expect(buildView(world, 'u1').rivals.some((r) => r.id === b.id && r.player)).toBe(true);
    applyAction(world, 'u1', { type: 'clash', targetLabelId: b.id, artistId: artistA.id });
    const diss = world.songs.at(-1)!;
    expect(diss).toMatchObject({ themeId: 'clash', diss: b.id, state: 'scheduled' });
    expect(() => applyAction(world, 'u1', { type: 'clash', targetLabelId: b.id, artistId: artistA.id })).toThrow(/déjà en cours/);
    const received = buildView(world, 'u2').clashes[0]!;
    expect(received).toMatchObject({ direction: 'received', status: 'waiting' });
    applyAction(world, 'u2', { type: 'clash_answer', clashId: received.id, artistId: artistB.id });
    const fans = artistA.fans + artistB.fans;
    for (let i = 0; i < 4; i += 1) runTick(world);
    const done = buildView(world, 'u1').clashes[0]!;
    expect(done.status).toBe('won');
    expect(typeof done.won).toBe('boolean');
    expect((a.stats.clashWins ?? 0) + (b.stats.clashWins ?? 0)).toBe(1);
    expect(artistA.fans + artistB.fans).not.toBe(fans);
    expect(world.marketNews!.some((n) => n.text.startsWith('Clash : ') && n.text.includes('gagne'))).toBe(true);
  });

  it('shames the label that backs down', () => {
    const { world, a, b, artistA } = twoLabels();
    applyAction(world, 'u1', { type: 'clash', targetLabelId: b.id, artistId: artistA.id });
    const rep = b.reputation;
    applyAction(world, 'u2', { type: 'clash_refuse', clashId: buildView(world, 'u2').clashes[0]!.id });
    expect(b.reputation).toBeLessThan(rep);
    expect(a.stats.clashWins).toBe(1);
    expect(buildView(world, 'u2').labels.find((l) => l.id === b.id)!.clashLosses).toBe(1);
    expect(world.marketNews!.at(-1)!.text).toMatch(/dégonfle/);
  });

  it('lets a label of the game answer or back down', () => {
    const { world, artistA } = twoLabels();
    const npc = buildView(world, 'u1').rivals.find((r) => !r.player)!;
    applyAction(world, 'u1', { type: 'clash', targetLabelId: npc.id, artistId: artistA.id });
    runTick(world);
    expect(['answered', 'refused']).toContain(buildView(world, 'u1').clashes[0]!.status);
  });

  it('throws one shade a week, and answers the interview once per question', () => {
    const { world, b } = twoLabels();
    const shade = buildView(world, 'u1').shade!;
    expect(shade.lines).toHaveLength(3);
    applyAction(world, 'u1', { type: 'shade', targetLabelId: b.id, line: shade.lines[0]!.id });
    expect(buildView(world, 'u1').shade!.used).toBe(true);
    expect(() => applyAction(world, 'u1', { type: 'shade', targetLabelId: b.id, line: shade.lines[1]!.id })).toThrow(/déjà/);

    const interview = buildView(world, 'u1').interview!;
    expect(interview.questions).toHaveLength(3);
    const artist = world.artists[interview.artistId]!;
    const hype = artist.hype;
    applyAction(world, 'u1', { type: 'interview', question: 0, tone: 'confident' });
    expect(artist.hype).toBeGreaterThan(hype);
    expect(buildView(world, 'u1').interview!.questions[0]!.answered).toBe('confident');
    expect(() => applyAction(world, 'u1', { type: 'interview', question: 0, tone: 'provoc' })).toThrow(/déjà/);
    runTick(world);
    expect(buildView(world, 'u1').interview!.questions.every((q) => q.answered === null)).toBe(true);
  });
});

describe('EP, albums et deluxe', () => {
  const vault = (world: World, labelId: string, artist: Artist, count: number): string[] =>
    Array.from({ length: count }, (_, i) => {
      artist.energy = 100;
      return createSong(world, labelId, {
        artistId: artist.id,
        title: `Piste ${i + 1}`,
        themeId: 'ego',
        beatId: 'boom_bap',
        levels: { theme: 1, beat: 1, producer: 1, studio: 1 },
        producer: producerOfLevel(1),
      }).id;
    });

  it('puts an EP together, releases every track the same week with a boost, and notes it', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 50_000;
    const ids = vault(world, labelId, artist, 4);
    expect(() => applyAction(world, 'u1', { type: 'project', artistId: artist.id, kind: 'album', title: 'Trop court', songIds: ids, inWeeks: 1 })).toThrow(/8 à 16/);
    applyAction(world, 'u1', { type: 'project', artistId: artist.id, kind: 'ep', title: 'Premiers pas', songIds: ids, inWeeks: 1 });
    expect(world.songs.filter((s) => ids.includes(s.id)).every((s) => s.state === 'scheduled' && s.boost === 1.2)).toBe(true);
    expect(() => applyAction(world, 'u1', { type: 'project', artistId: artist.id, kind: 'ep', title: 'Encore', songIds: ids.slice(0, 3), inWeeks: 2 })).toThrow(/déjà/);
    const report = runTick(world);
    expect(world.songs.filter((s) => ids.includes(s.id)).every((s) => s.state === 'released' && s.boost === undefined)).toBe(true);
    const ep = buildView(world, 'u1').projects[0]!;
    expect(ep).toMatchObject({ kind: 'ep', state: 'released', title: 'Premiers pas' });
    expect(ep.quality).toBeGreaterThan(0);
    expect(report.labels[labelId]!.events.some((e) => e.includes('EP « Premiers pas »'))).toBe(true);
  });

  it('adds a deluxe to an album once, within ten weeks', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 200_000;
    const ids = vault(world, labelId, artist, 8);
    applyAction(world, 'u1', { type: 'project', artistId: artist.id, kind: 'album', title: 'Grand saut', songIds: ids, inWeeks: 1 });
    runTick(world);
    const album = buildView(world, 'u1').projects[0]!;
    expect(album.canDeluxe).toBe(true);
    const extra = vault(world, labelId, artist, 3);
    applyAction(world, 'u1', { type: 'deluxe', projectId: album.id, songIds: extra });
    expect(() => applyAction(world, 'u1', { type: 'deluxe', projectId: album.id, songIds: extra })).toThrow(/déjà/);
    runTick(world);
    const after = buildView(world, 'u1').projects[0]!;
    expect(after.tracks).toHaveLength(11);
    expect(after.canDeluxe).toBe(false);
  });
});

describe('tournées', () => {
  it('announces a tour two weeks ahead, keeps the artist out of the studio, and plays two dates a week', () => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 50_000;
    artist.energy = 100;
    applyAction(world, 'u1', { type: 'tour', artistId: artist.id, dates: 4, merch: true });
    const tour = buildView(world, 'u1').tours[0]!;
    expect(tour).toMatchObject({ state: 'announced', startsIn: 2, dates: 4 });
    expect(label.cash).toBeLessThan(50_000);
    runTick(world);
    expect(() => applyAction(world, 'u1', { type: 'gig', artistId: artist.id })).toThrow(/tournée/);
    runTick(world);
    expect(buildView(world, 'u1').tours[0]!.state).toBe('running');
    expect(buildView(world, 'u1').tours[0]!.played).toBe(2);
    expect(() =>
      startSession(world, label, { artistId: artist.id, themeId: 'ego', beatId: 'boom_bap', levels: { theme: 1, beat: 1, producer: 1, studio: 1 } }),
    ).toThrow(/tournée/);
    const fans = artist.fans;
    runTick(world);
    const done = buildView(world, 'u1').tours[0]!;
    expect(done.state).toBe('done');
    expect(done.totals.audience).toBeGreaterThan(0);
    expect(done.totals.merch).toBeGreaterThan(0);
    expect(done.log.length).toBeGreaterThanOrEqual(3);
    expect(artist.fans).not.toBe(fans);
  });

  it('invites a friend’s artist on a joint tour, and adds an opening act', () => {
    const world = createWorld(42);
    for (const [user, name] of [['u1', 'Tête Records'], ['u2', 'Ami Records']] as const) {
      applyAction(world, user, { type: 'found', name });
      applyAction(world, user, { type: 'tuto', move: 'skip' });
    }
    const a = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    const b = Object.values(world.labels).find((l) => l.ownerId === 'u2')!;
    a.cash = 50_000;
    const youth = buildView(world, 'u1').academy!.youths[0]!;
    applyAction(world, 'u1', { type: 'youth_promote', youthId: youth.id });
    const [head, opener] = rosterOf(world, a.id);
    const guest = rosterOf(world, b.id)[0]!;
    head!.energy = 100;
    applyAction(world, 'u1', { type: 'tour', artistId: head!.id, dates: 4, partnerId: guest.id, openerId: opener!.id });
    const invite = buildView(world, 'u2').tours[0]!;
    expect(invite).toMatchObject({ mine: false, partnerStatus: 'pending' });
    applyAction(world, 'u2', { type: 'tour_answer', tourId: invite.id, accept: true });
    const cashB = b.cash;
    for (let i = 0; i < 3; i += 1) runTick(world);
    expect(buildView(world, 'u1').tours[0]!.partnerStatus).toBe('accepted');
    expect(b.cash).not.toBe(cashB);
  });
});

describe('avatars', () => {
  it('gives every written look valid words and a real artist of the catalogue', () => {
    const ids = new Set(CATALOG_ARTISTS.map((a) => a.id));
    for (const [id, text] of Object.entries(LOOKS)) {
      expect(ids.has(id), id).toBe(true);
      expect(() => parseLook(text), id).not.toThrow();
    }
    expect(lookOf('daft_punk')).toMatchObject({ hat: 'helmet', group: true });
    expect(lookOf('ariana_grande').hair).toBe('ponytail');
  });

  it('draws the same look for the same artist, by genre, and never glasses on a hidden face', () => {
    expect(lookOf('y_p3_y1', 'metal')).toEqual(lookOf('y_p3_y1', 'metal'));
    const looks = Array.from({ length: 300 }, (_, i) => lookOf('someone_' + i, 'drill'));
    expect(looks.some((l) => l.hat === 'cagoule')).toBe(true);
    expect(looks.every((l) => l.hat !== 'cagoule' || (l.face === null && !l.beard))).toBe(true);
    expect(new Set(looks.map((l) => l.hair + ' ' + l.hat)).size).toBeGreaterThan(10);
    const metal = Array.from({ length: 300 }, (_, i) => lookOf('someone_' + i, 'metal'));
    expect(metal.filter((l) => l.hair === 'long').length).toBeGreaterThan(100);
  });
});

describe('saisons', () => {
  it('offers three goals, lets the label pick two once, and picks for it after four weeks', () => {
    const { world, labelId } = worldWithLabel();
    const before = buildView(world, 'u1').seasonInfo;
    expect(before).toMatchObject({ number: 1, week: 1, picked: false, picks: 2 });
    expect(before.goals).toHaveLength(3);
    const [a, b, c] = before.goals.map((g) => g.id);
    expect(() => applyAction(world, 'u1', { type: 'season_goals', goals: [a!] })).toThrow(/Choisis 2/);
    expect(() => applyAction(world, 'u1', { type: 'season_goals', goals: [a!, 'nope'] })).toThrow(/pas proposé/);
    applyAction(world, 'u1', { type: 'season_goals', goals: [a!, c!] });
    const after = buildView(world, 'u1').seasonInfo;
    expect(after.picked).toBe(true);
    expect(after.goals.filter((g) => g.chosen).map((g) => g.id)).toEqual([a, c]);
    expect(() => applyAction(world, 'u1', { type: 'season_goals', goals: [a!, b!] })).toThrow(/déjà/);

    const lazy = worldWithLabel();
    lazy.world.labels[lazy.labelId]!.cash = 500_000;
    for (let i = 0; i < 5; i += 1) runTick(lazy.world);
    const auto = buildView(lazy.world, 'u1').seasonInfo;
    expect(auto.picked).toBe(true);
    expect(auto.goals.filter((g) => g.chosen)).toHaveLength(2);
    expect(labelId).toBeTruthy();
  });

  it('closes the season after 28 weeks: ranking, trophies, rewards for the goals kept, and a new season', () => {
    const { world, labelId } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 500_000;
    const mine = seasonsOf(world).current.labels[labelId]!;
    mine.offered = ['no_debt', 'streams', 'number1'];
    applyAction(world, 'u1', { type: 'season_goals', goals: ['no_debt', 'streams'] });
    mine.streams = mine.start.streamsTarget;
    const reputation = label.reputation;
    let last = runTick(world);
    expect(last.labels[labelId]!.events.some((e) => e.includes('Objectif de saison atteint'))).toBe(true);
    for (let i = 1; i < 28; i += 1) last = runTick(world);
    expect(world.tick).toBe(28);
    const view = buildView(world, 'u1');
    expect(view.seasonInfo).toMatchObject({ number: 2, week: 1, picked: false, unseen: true });
    const result = view.seasonInfo.last!;
    expect(result.number).toBe(1);
    expect(result.ranking[0]).toMatchObject({ labelId, place: 1 });
    expect(result.trophies.some((t) => t.kind === 'label' && t.labelId === labelId)).toBe(true);
    const took = result.labels[labelId]!;
    expect(took.goals.map((g) => g.done)).toEqual([true, true]);
    // Two goals (1 + 2), first place (3), and the trophies of its artists.
    expect(took.reputation).toBeGreaterThanOrEqual(6);
    expect(took.cash).toBe(1_500 * label.tier + 2_500 * label.tier);
    expect(label.reputation).toBeGreaterThan(reputation);
    expect(last.labels[labelId]!.events.some((e) => e.includes('Saison 1 terminée : tu finis 1er sur 1'))).toBe(true);
    expect(view.labels.find((l) => l.id === labelId)!.honours[0]).toMatchObject({ season: 1, place: 1 });
    applyAction(world, 'u1', { type: 'season_seen' });
    expect(buildView(world, 'u1').seasonInfo.unseen).toBe(false);
    expect(buildView(world, 'u1').seasonInfo.goals).toHaveLength(3);
  });

  it('gives the last label a hand when there are several', () => {
    const world = createWorld(7);
    for (const [user, name] of [['u1', 'Gros Label'], ['u2', 'Petit Label']] as const) {
      applyAction(world, user, { type: 'found', name });
      applyAction(world, user, { type: 'tuto', move: 'skip' });
    }
    const big = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    const small = Object.values(world.labels).find((l) => l.ownerId === 'u2')!;
    big.cash = 2_000_000;
    small.cash = 300_000;
    for (let i = 0; i < 28; i += 1) runTick(world);
    const result = seasonsOf(world).history[0]!;
    expect(result.ranking.map((r) => r.labelId)).toEqual([big.id, small.id]);
    expect(result.labels[small.id]!.cash).toBeGreaterThanOrEqual(10_000);
    expect(buildView(world, 'u2').seasonInfo.last!.labels[small.id]!.place).toBe(2);
  });
});

describe('staff', () => {
  const hire = (world: World, user: string, role: string): StaffMember => {
    const view = buildView(world, user).staff!;
    const candidate = view.candidates.find((c) => c.role === role)!;
    applyAction(world, user, { type: 'staff_hire', candidateId: candidate.id });
    const labelId = buildView(world, user).label!.id;
    return staffOf(world, labelId).find((m) => m.role === role)!;
  };

  const twoPlayers = (): { world: World; a: string; b: string } => {
    const world = createWorld(11);
    for (const [user, name] of [['u1', 'Label Un'], ['u2', 'Label Deux']] as const) {
      applyAction(world, user, { type: 'found', name });
      applyAction(world, user, { type: 'tuto', move: 'skip' });
    }
    const a = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    const b = Object.values(world.labels).find((l) => l.ownerId === 'u2')!;
    a.cash = 500_000;
    b.cash = 500_000;
    return { world, a: a.id, b: b.id };
  };

  it('offers six candidates a week, at least one per job, and a hired one leaves the list', () => {
    const { world, labelId } = worldWithLabel();
    world.labels[labelId]!.cash = 500_000;
    const view = buildView(world, 'u1').staff!;
    expect(view.candidates).toHaveLength(6);
    for (const role of STAFF.roles) expect(view.candidates.some((c) => c.role === role), role).toBe(true);
    expect(view.jobs.map((j) => j.member)).toEqual([null, null, null, null]);
    const first = view.candidates[0]!;
    applyAction(world, 'u1', { type: 'staff_hire', candidateId: first.id });
    const after = buildView(world, 'u1').staff!;
    expect(after.candidates).toHaveLength(5);
    expect(after.jobs.find((j) => j.role === first.role)!.member).toMatchObject({ name: first.name, stars: first.stars });
    expect(() => applyAction(world, 'u1', { type: 'staff_hire', candidateId: first.id })).toThrow(/plus disponible/);
  });

  it('pays the wages each week, and two weeks of wage to let someone go or replace him', () => {
    const { world, labelId } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 500_000;
    const coach = hire(world, 'u1', 'coach');
    const wage = staffWage(coach, label.tier);
    expect(buildView(world, 'u1').staff!.wages).toBe(wage);
    runTick(world);
    // A new list each week: the next coach replaces the first one, who costs two weeks of wage to leave.
    const next = buildView(world, 'u1').staff!.candidates.find((c) => c.role === 'coach')!;
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'staff_hire', candidateId: next.id });
    expect(label.cash).toBe(cash - wage * STAFF.fireWeeks);
    expect(staffOf(world, labelId).filter((m) => m.role === 'coach')).toHaveLength(1);
    expect(staffOf(world, labelId)[0]!.name).toBe(next.name);
    const newWage = staffWage(staffOf(world, labelId)[0]!, label.tier);
    const before = label.cash;
    applyAction(world, 'u1', { type: 'staff_fire', role: 'coach' });
    expect(label.cash).toBe(before - newWage * STAFF.fireWeeks);
    expect(staffOf(world, labelId)).toHaveLength(0);
    expect(() => applyAction(world, 'u1', { type: 'staff_fire', role: 'coach' })).toThrow(/Personne/);
  });

  it('makes the artists progress faster, more for the one the coach follows', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 500_000;
    expect(coachBoost(world, labelId, artist.id)).toBe(1);
    const coach = hire(world, 'u1', 'coach');
    coach.stars = 3;
    expect(coachBoost(world, labelId, artist.id)).toBeCloseTo(1.3);
    applyAction(world, 'u1', { type: 'staff_focus', artistId: artist.id });
    expect(coachBoost(world, labelId, artist.id)).toBeCloseTo(1.9);
    expect(coachBoost(world, labelId, 'someone_else')).toBeCloseTo(1.3);
    const stranger = Object.keys(world.artists).find((id) => !contractOf(world, id))!;
    expect(() => applyAction(world, 'u1', { type: 'staff_focus', artistId: stranger })).toThrow(/pas dans ton label/);
    applyAction(world, 'u1', { type: 'staff_focus', artistId: null });
    expect(coach.focusId).toBeNull();
  });

  it('makes the producer cheaper, the promos bigger, and the concerts fuller and less tiring', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 500_000;
    const producer = producerOfLevel(3);
    expect(houseProducer(world, labelId, producer).price).toBe(producer.price);
    expect(viewsBoost(world, labelId)).toBe(1);
    expect(crowdBoost(world, labelId)).toBe(1);
    expect(gigEnergy(world, labelId)).toBe(CFG.energy.gig);
    for (const role of STAFF.roles) hire(world, 'u1', role).stars = 4;
    expect(producerShare(world, labelId)).toBeCloseTo(0.2);
    expect(houseProducer(world, labelId, producer).price).toBe(Math.round(producer.price * 0.2));
    staffOf(world, labelId).find((m) => m.role === 'producer')!.stars = 5;
    expect(houseProducer(world, labelId, producer).price).toBe(0);
    expect(viewsBoost(world, labelId)).toBeCloseTo(1.6);
    expect(crowdBoost(world, labelId)).toBeCloseTo(1.2);
    expect(gigEnergy(world, labelId)).toBeLessThan(CFG.energy.gig);
    expect(playGig(artist, 0, 1.2).audience).toBeGreaterThanOrEqual(playGig(artist, 0, 1).audience);
    expect(buildView(world, 'u1').crowdBoost).toBeCloseTo(1.2);
  });

  it('gives a star after a season at the label, and the staff talks now and then', () => {
    const { world, labelId } = worldWithLabel();
    world.labels[labelId]!.cash = 2_000_000;
    const booker = hire(world, 'u1', 'booker');
    booker.stars = 2;
    let quotes = 0;
    let star = false;
    for (let i = 0; i < STAFF.starTicks; i += 1) {
      const events = runTick(world).labels[labelId]!.events;
      if (events.some((e) => e.includes('pris du galon'))) star = true;
      quotes += events.filter((e) => e.startsWith('«')).length;
    }
    expect(star).toBe(true);
    expect(booker.stars).toBe(3);
    expect(quotes).toBeGreaterThan(0);
  });

  it('lets a friend poach a staff member: match the raise to keep him, or he leaves', () => {
    const { world, a, b } = twoPlayers();
    const coach = hire(world, 'u1', 'coach');
    expect(() => applyAction(world, 'u2', { type: 'staff_poach', labelId: a, role: 'coach', raise: 0.5 })).toThrow(/attends un peu/);
    coach.shieldUntil = 0;
    expect(() => applyAction(world, 'u2', { type: 'staff_poach', labelId: a, role: 'coach', raise: 0.3 })).toThrow(/augmentations proposées/);
    expect(() => applyAction(world, 'u2', { type: 'staff_poach', labelId: a, role: 'booker', raise: 0.5 })).toThrow(/Personne/);
    expect(() => applyAction(world, 'u1', { type: 'staff_poach', labelId: a, role: 'coach', raise: 0.5 })).toThrow(/introuvable/);
    expect(buildView(world, 'u2').staff!.rivals).toHaveLength(1);
    applyAction(world, 'u2', { type: 'staff_poach', labelId: a, role: 'coach', raise: 0.5 });
    expect(world.marketNews!.at(-1)!.text).toContain('veut débaucher');
    expect(buildView(world, 'u1').staff!.offersIn).toHaveLength(1);
    expect(buildView(world, 'u2').staff!.offersOut).toHaveLength(1);
    expect(buildView(world, 'u2').staff!.rivals[0]!.blocked).toBeTruthy();
    // Matching keeps him, with the raise, and nobody can try again for a while.
    applyAction(world, 'u1', { type: 'staff_poach_answer', offerId: buildView(world, 'u1').staff!.offersIn[0]!.id, match: true });
    expect(coach.premium).toBe(0.5);
    expect(staffOf(world, a)).toHaveLength(1);
    expect(world.staffOffers).toHaveLength(0);
    expect(() => applyAction(world, 'u2', { type: 'staff_poach', labelId: a, role: 'coach', raise: 0.2 })).toThrow(/attends un peu/);
    // Refusing lets him go, with the new raise on top.
    coach.shieldUntil = 0;
    applyAction(world, 'u2', { type: 'staff_poach', labelId: a, role: 'coach', raise: 0.2 });
    applyAction(world, 'u1', { type: 'staff_poach_answer', offerId: world.staffOffers![0]!.id, match: false });
    expect(staffOf(world, a)).toHaveLength(0);
    expect(staffOf(world, b)[0]).toMatchObject({ name: coach.name, premium: 0.7, focusId: null });
    expect(world.marketNews!.at(-1)!.text).toContain('Débauchage');
  });

  it('moves the member when nobody answers in two weeks, and lets the offer be taken back', () => {
    const { world, a, b } = twoPlayers();
    hire(world, 'u2', 'community').shieldUntil = 0;
    applyAction(world, 'u1', { type: 'staff_poach', labelId: b, role: 'community', raise: 1 });
    applyAction(world, 'u1', { type: 'staff_poach_cancel', offerId: world.staffOffers![0]!.id });
    expect(world.staffOffers).toHaveLength(0);
    applyAction(world, 'u1', { type: 'staff_poach', labelId: b, role: 'community', raise: 1 });
    runTick(world);
    expect(staffOf(world, b)).toHaveLength(1);
    const events = runTick(world).labels;
    expect(staffOf(world, b)).toHaveLength(0);
    expect(staffOf(world, a)[0]!.premium).toBe(1);
    expect(events[a]!.events.some((e) => e.includes('rejoint ton staff'))).toBe(true);
    expect(events[b]!.events.some((e) => e.includes('est parti chez'))).toBe(true);
  });
});

describe('moral', () => {
  // A label with three artists: the starter, and two more from the catalogue.
  const bigLabel = (): { world: World; labelId: string; artists: Artist[] } => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 2_000_000;
    label.tier = 3;
    const others = freeAgents(world).filter((a) => a.id !== artist.id).slice(0, 2);
    for (const other of others) signArtist(world, labelId, other.id, expectedOffer(other));
    return { world, labelId, artists: rosterOf(world, labelId) };
  };

  it('ranks the artists of a label from their rating and fans, with at least one star', () => {
    const { world, labelId, artist } = worldWithLabel();
    expect(ranksOf(world, labelId).get(artist.id)).toBe('star');
    const big = bigLabel();
    const ranks = ranksOf(big.world, big.labelId);
    expect([...ranks.values()].filter((r) => r === 'star')).toHaveLength(1);
    expect(new Set(ranks.values()).size).toBeGreaterThan(1);
    const view = buildView(big.world, 'u1');
    expect(view.dynamics!.artists.map((a) => a.rank)[0]).toBe('star');
    expect(view.roster.every((a) => a.rankName.length > 0)).toBe(true);
  });

  it('settles back toward calm when nothing is wrong, and higher with a leader', () => {
    const { world, labelId, artist } = worldWithLabel();
    artist.morale = 50;
    artist.lastActiveTick = 0;
    artist.lastReleaseTick = 0;
    world.contracts.find((c) => c.artistId === artist.id)!.startTick = 0;
    tickMorale(world, () => {}, () => {});
    expect(artist.morale).toBe(51);
    artist.morale = 70;
    tickMorale(world, () => {}, () => {});
    expect(artist.morale).toBe(69);
    expect(dynamicsView(world, world.labels[labelId]!).calm).toBe(isLeader(artist.id) ? 63 : 60);
  });

  it('hurts the artists left without a release, left aside, or paid less than a lower rank', () => {
    const { world, labelId, artists } = bigLabel();
    const ranks = ranksOf(world, labelId);
    const star = artists.find((a) => ranks.get(a.id) === 'star')!;
    const low = artists.find((a) => ranks.get(a.id) !== 'star')!;
    world.tick = 20;
    star.lastReleaseTick = 5;
    star.lastActiveTick = 5;
    for (const c of world.contracts) if (c.labelId === labelId) c.startTick = 0;
    star.morale = 60;
    const worries = worriesOf(world, labelId, star).map((w) => w.kind);
    expect(worries).toContain('late');
    expect(worries).toContain('aside');
    // The lower rank gets a much bigger allowance: injustice for the star.
    world.contracts.find((c) => c.artistId === low.id)!.weeklyAllowance = 5_000;
    expect(worriesOf(world, labelId, star).map((w) => w.kind)).toContain('injustice');
    const told: string[] = [];
    tickMorale(world, (_, text) => told.push(text), () => {});
    expect(star.morale).toBe(60 + MORALE.late + MORALE.aside + MORALE.injustice);
    expect(told.filter((t) => t.startsWith(star.name) && t.includes('gagne plus que lui'))).toHaveLength(1);
    tickMorale(world, (_, text) => told.push(text), () => {});
    expect(told.filter((t) => t.startsWith(star.name) && t.includes('gagne plus que lui'))).toHaveLength(1);
    // Raising his pay ends the injustice.
    applyAction(world, 'u1', { type: 'raise', artistId: star.id });
    expect(worriesOf(world, labelId, star).map((w) => w.kind)).not.toContain('injustice');
    expect(() => applyAction(world, 'u1', { type: 'raise', artistId: star.id })).toThrow(/pas de souci/);
    // The coach following him: no longer left aside.
    world.staff = { [labelId]: [{ id: 'st1', role: 'coach', name: 'Coach', rank: 'Coach', stars: 1, hiredTick: 0, starTick: 0, premium: 0, focusId: star.id, shieldUntil: 0 }] };
    expect(worriesOf(world, labelId, star).map((w) => w.kind)).not.toContain('aside');
  });

  it('makes the others jealous of a much bigger promo', () => {
    const { world, labelId, artists } = bigLabel();
    const ranks = ranksOf(world, labelId);
    const order = [...artists].sort((a, b) => RANKS.indexOf(ranks.get(a.id)!) - RANKS.indexOf(ranks.get(b.id)!));
    const [top, , bottom] = order;
    // The lowest rank gets a huge promo: the star is jealous.
    world.songs.push({
      id: 'jealous_song', labelId, artistId: bottom!.id, featArtistId: null, title: 'Gros son', themeId: 'x', beatId: 'x',
      levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, quality: 50, cost: 0, state: 'released', createdTick: 0, availableTick: 0,
      releaseTick: world.tick, marketingReach: 0, marketingCost: 50_000, streamsLast: 0, streamsTotal: 0, decay: 0, hitScore: 40,
      peakGlobal: null, peakGenre: null, weeksOut: 0,
    });
    top!.morale = 60;
    tickMorale(world, () => {}, () => {});
    expect(top!.jealous).toMatchObject({ name: bottom!.name, tick: world.tick });
    expect(worriesOf(world, labelId, top!).map((w) => w.kind)).toContain('jealous');
    expect(top!.morale).toBeLessThan(60);
  });

  it('refuses the studio sometimes under 30, strikes under 15, and asks to leave', () => {
    const { world, labelId, artist } = worldWithLabel();
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    const told: string[] = [];
    const news: string[] = [];
    artist.morale = 10;
    expect(moraleBlock(world, artist, 'gig')).toMatch(/grève/);
    expect(() => bookGig(world, labelId, artist.id)).toThrow(/grève/);
    tickMorale(world, (_, text) => told.push(text), (text) => news.push(text));
    expect(artist.onStrike).toBe(true);
    expect(artist.wantsOut).toBe(true);
    expect(told.some((t) => t.includes('grève'))).toBe(true);
    expect(news.some((t) => t.includes('voudrait quitter'))).toBe(true);
    // Between 15 and 30: no strike, but some weeks no studio at all.
    artist.morale = 25;
    world.contracts.find((c) => c.artistId === artist.id)!.endTick = 1_000;
    let refused = 0;
    for (let t = 0; t < 40; t += 1) {
      world.tick = 100 + t;
      if (moraleBlock(world, artist, 'studio')) refused += 1;
      expect(moraleBlock(world, artist, 'gig')).toBeNull();
    }
    expect(refused).toBeGreaterThan(3);
    expect(refused).toBeLessThan(25);
    // Back above 40: he stays.
    artist.morale = 45;
    tickMorale(world, (_, text) => told.push(text), () => {});
    expect(artist.wantsOut).toBe(false);
    expect(artist.onStrike).toBe(false);
  });

  it('cheers them up: a bonus, a trip, a party, each with its price and its wait', () => {
    const { world, labelId, artists } = bigLabel();
    const label = world.labels[labelId]!;
    const [a, b] = artists;
    a!.morale = 40;
    b!.morale = 40;
    a!.creativeFatigue = 50;
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'cheer', kind: 'bonus', artistId: a!.id });
    expect(a!.morale).toBe(40 + MORALE.cheers.bonus.morale);
    expect(label.cash).toBe(cash - MORALE.cheers.bonus.cost * label.tier);
    expect(() => applyAction(world, 'u1', { type: 'cheer', kind: 'bonus', artistId: a!.id })).toThrow(/semaine/);
    applyAction(world, 'u1', { type: 'cheer', kind: 'trip', artistId: a!.id });
    expect(a!.creativeFatigue).toBe(0);
    applyAction(world, 'u1', { type: 'cheer', kind: 'party', artistId: null });
    expect(b!.morale).toBe(40 + MORALE.cheers.party.morale);
    expect(() => applyAction(world, 'u1', { type: 'cheer', kind: 'party', artistId: null })).toThrow(/soirée/);
    const view = buildView(world, 'u1').dynamics!;
    expect(view.partyIn).toBe(MORALE.cheers.party.every);
    expect(view.artists.find((x) => x.id === a!.id)!.tripIn).toBe(MORALE.cheers.trip.every);
    for (let i = 0; i < MORALE.cheers.bonus.every; i += 1) runTick(world);
    applyAction(world, 'u1', { type: 'cheer', kind: 'bonus', artistId: a!.id });
    label.cash = 0;
    expect(() => applyAction(world, 'u1', { type: 'cheer', kind: 'bonus', artistId: b!.id })).toThrow(/cash/);
  });

  it('lets an artist say how he feels now and then', () => {
    const { world, labelId } = worldWithLabel();
    world.labels[labelId]!.cash = 2_000_000;
    let bubbles = 0;
    for (let i = 0; i < 20; i += 1) bubbles += runTick(world).labels[labelId]!.events.filter((e) => e.startsWith('«') && e.includes('Nova')).length;
    expect(bubbles).toBeGreaterThan(0);
  });
});

describe('évolution des artistes', () => {
  const findId = (test: (id: string) => boolean): string => CATALOG_ARTISTS.map((a) => a.id).find(test)!;
  const cheap = { theme: 1, beat: 1, producer: 1, studio: 1 } as const;
  const song = (artistId: string, labelId: string, quality: number) => ({
    id: `s_${Math.random()}`, labelId, artistId, featArtistId: null, title: 'Son', themeId: 'amour', beatId: 'trap',
    levels: cheap, quality, cost: 0, state: 'released' as const, createdTick: 0, availableTick: 0, releaseTick: 0,
    marketingReach: 0, marketingCost: 0, streamsLast: 0, streamsTotal: 0, decay: 0, hitScore: 50, peakGlobal: null, peakGenre: null, weeksOut: 0,
  });

  it('gives each artist a hidden profile and 0 to 2 skills, always the same', () => {
    const profiles = new Set(CATALOG_ARTISTS.map((a) => profileOf(a.id)));
    expect(profiles.size).toBe(6);
    for (const a of CATALOG_ARTISTS.slice(0, 50)) {
      expect(profileOf(a.id)).toBe(profileOf(a.id));
      expect(skillsOf(a.id)).toEqual(skillsOf(a.id));
      expect(skillsOf(a.id).length).toBeLessThanOrEqual(2);
      expect(new Set(skillsOf(a.id)).size).toBe(skillsOf(a.id).length);
    }
    expect(new Set(CATALOG_ARTISTS.flatMap((a) => skillsOf(a.id))).size).toBe(SKILL_IDS.length);
  });

  it('reveals the profile after 8 weeks, and tells the label', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 1_000_000;
    expect(buildView(world, 'u1').roster[0]!.evolution!.profile).toBeNull();
    const told: string[] = [];
    for (let i = 0; i < EVOLUTION.revealWeeks; i += 1) told.push(...runTick(world).labels[labelId]!.events);
    expect(told.filter((t) => t.includes(`profil de ${artist.name}`))).toHaveLength(1);
    expect(buildView(world, 'u1').roster[0]!.evolution!.profile!.name).toBe(PROFILES[profileOf(artist.id)].name);
  });

  it('makes the early profile fast then slow, the late one the other way, and the late bloomer jump', () => {
    const world = createWorld(1);
    const early = world.artists[findId((id) => profileOf(id) === 'early')]!;
    const late = world.artists[findId((id) => profileOf(id) === 'late')]!;
    expect(profileGrowth(world, early)).toBe(1.5);
    expect(profileGrowth(world, late)).toBe(0.7);
    early.career = 30;
    late.career = 30;
    expect(profileGrowth(world, early)).toBe(0.5);
    expect(profileGrowth(world, late)).toBe(1.4);
    const bloomer = world.artists[CATALOG_ARTISTS.find((a) => profileOf(a.id) === 'bloomer' && a.gen < 70)!.id]!;
    expect(profileGrowth(world, bloomer)).toBe(0.3);
    const before = generalRating(bloomer);
    let told: string[] = [];
    for (let i = 0; i < EVOLUTION.bloomSongs; i += 1) told = afterRelease(world, bloomer, song(bloomer.id, 'x', 70));
    expect(bloomer.bloomed).toBe(true);
    expect(told.some((t) => t.includes('Éclosion'))).toBe(true);
    expect(generalRating(bloomer)).toBeGreaterThanOrEqual(before + EVOLUTION.bloomMin - 1);
    expect(profileGrowth(world, bloomer)).toBe(1);
  });

  it('raises the ceiling after three very good songs in a row, six times a season at most', () => {
    const world = createWorld(2);
    const artist = world.artists[findId((id) => profileOf(id) !== 'bloomer')]!;
    const potential = artist.potential;
    const good = (): number => generalRating(artist) + EVOLUTION.streakMargin;
    afterRelease(world, artist, song(artist.id, 'x', good()));
    afterRelease(world, artist, song(artist.id, 'x', good()));
    afterRelease(world, artist, song(artist.id, 'x', 10));
    expect(artist.streak).toBe(0);
    for (let i = 0; i < 3; i += 1) afterRelease(world, artist, song(artist.id, 'x', good()));
    expect(artist.potential).toBe(potential + 1);
    for (let i = 0; i < 30; i += 1) afterRelease(world, artist, song(artist.id, 'x', good()));
    expect(artist.potential).toBe(potential + EVOLUTION.ceilingPerSeason);
    expect(artist.releases).toBe(36);
  });

  it('loses ground when idle for long, unless the coach follows him', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 1_000_000;
    const sum = (): number => Object.values(artist.attrs).reduce((a, b) => a + b, 0);
    artist.lastActiveTick = world.tick - 20;
    const start = sum();
    for (let i = 0; i < 6; i += 1) {
      world.tick += 1;
      tickEvolution(world, new Map(), () => {});
    }
    expect(sum()).toBeLessThan(start);
    world.staff = { [labelId]: [{ id: 'st1', role: 'coach', name: 'Coach', rank: 'Coach', stars: 1, hiredTick: 0, starTick: 0, premium: 0, focusId: artist.id, shieldUntil: 0 }] };
    const held = sum();
    for (let i = 0; i < 6; i += 1) {
      world.tick += 1;
      tickEvolution(world, new Map(), () => {});
    }
    expect(sum()).toBe(held);
  });

  it('lets the skills change the studio, the releases and the concerts', () => {
    const world = createWorld(3);
    const withSkill = (skill: string): Artist => world.artists[findId((id) => skillsOf(id).includes(skill as never))]!;
    const stage = withSkill('stage');
    expect(stageBoost(stage)).toBeCloseTo(skillPlus(stage) ? 1.3 : 1.15);
    const tireless = withSkill('tireless');
    expect(tirelessFactor(tireless)).toBeLessThan(1);
    const perfect = withSkill('perfect');
    const plain = { ...perfect, id: findId((id) => skillsOf(id).length === 0) };
    const beat = BEATS.find((b) => b.genres.includes(perfect.genre))!;
    const a = estimateQuality({ artist: perfect, themeId: beat.themes[0]!, beatId: beat.id, levels: cheap, producer: producerOfLevel(1) });
    const b = estimateQuality({ artist: plain, themeId: beat.themes[0]!, beatId: beat.id, levels: cheap, producer: producerOfLevel(1) });
    expect(a.max - a.min).toBeLessThan(b.max - b.min);
    const story = withSkill('story');
    const storyBeat = BEATS.find((x) => x.themes.includes('rue'))!;
    const told = estimateQuality({ artist: story, themeId: 'rue', beatId: storyBeat.id, levels: cheap, producer: producerOfLevel(1) });
    const flat = estimateQuality({ artist: { ...story, id: plain.id }, themeId: 'rue', beatId: storyBeat.id, levels: cheap, producer: producerOfLevel(1) });
    expect(told.center).toBeGreaterThan(flat.center);
    const input = { quality: 68, fans: 3_200, featFans: 0, hype: 12, fit: 1.3, marketingReach: 60_000, rivals: 0 };
    const base = firstWeek(input, createRng(5));
    const boosted = firstWeek({ ...input, discovery: 1.2, hitBonus: 10, decayBonus: 0.03 }, createRng(5));
    expect(boosted.discovery).toBeGreaterThan(base.discovery);
    expect(boosted.hitScore).toBeGreaterThan(base.hitScore);
    expect(boosted.decay).toBeGreaterThan(base.decay);
    // The "+" level: ten releases.
    const fresh = withSkill('hook');
    if (!skillPlus(fresh)) {
      fresh.releases = 10;
      expect(skillLevel(fresh, 'hook')).toBe(2);
    }
  });

  it('changes genre with a price, a transition, fans lost and the old genre kept', () => {
    const { world, labelId, artist } = worldWithLabel();
    const label = world.labels[labelId]!;
    label.cash = 1_000_000;
    const from = artist.genre;
    const neighbour = GENRES[from].neighbours[0]!;
    const fans = artist.fans;
    const view = buildView(world, 'u1').roster[0]!.evolution!;
    const option = view.genres.options.find((o) => o.genre === neighbour)!;
    expect(option.weeks).toBe(skillLevel(artist, 'chameleon') === 2 ? GENRE_CHANGE.chameleonWeeks : GENRE_CHANGE.weeks);
    const beat = BEATS.find((b) => b.genres.includes(neighbour))!;
    const plan = { themeId: beat.themes[0]!, beatId: beat.id, levels: cheap, producer: producerOfLevel(1) };
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'genre_change', artistId: artist.id, genre: neighbour });
    expect(label.cash).toBe(cash - option.cost);
    expect(artist.genre).toBe(neighbour);
    expect(artist.secondary[0]).toBe(from);
    expect(artist.fans).toBe(Math.round(fans * (1 - option.loss[0])));
    const during = estimateQuality({ artist, ...plan }).center;
    expect(() => applyAction(world, 'u1', { type: 'genre_change', artistId: artist.id, genre: from })).toThrow(/transition/);
    const told: string[] = [];
    for (let i = 0; i < option.weeks; i += 1) told.push(...runTick(world).labels[labelId]!.events);
    expect(artist.shift).toBeUndefined();
    expect(told.some((t) => t.includes('a fini sa transition'))).toBe(true);
    expect(estimateQuality({ artist, ...plan }).center).toBeGreaterThan(during);
    expect(() => applyAction(world, 'u1', { type: 'genre_change', artistId: artist.id, genre: from })).toThrow(/cette saison/);
    expect(() => applyAction(world, 'u1', { type: 'genre_change', artistId: artist.id, genre: 'nope' })).toThrow(/inconnu/);
  });

  it('lets the artist ask for a genre: half price and happy if yes, upset if no or no answer', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 1_000_000;
    artist.releases = 10;
    artist.attrs.creativite = 90;
    let weeks = 0;
    while (!artist.wish && weeks < 200) {
      world.contracts.find((c) => c.artistId === artist.id)!.endTick = world.tick + 100;
      artist.wishSeason = undefined;
      runTick(world);
      weeks += 1;
    }
    expect(artist.wish).toBeDefined();
    const wish = artist.wish!;
    const option = buildView(world, 'u1').roster[0]!.evolution!.genres.options.find((o) => o.genre === wish.genre)!;
    expect(option.wished).toBe(true);
    expect(option.cost).toBe((GENRE_CHANGE.cost * world.labels[labelId]!.tier) / 2);
    artist.morale = 50;
    applyAction(world, 'u1', { type: 'genre_change', artistId: artist.id, genre: wish.genre });
    expect(artist.morale).toBe(50 + GENRE_CHANGE.wished);
    expect(artist.wish).toBeUndefined();
    // Saying no.
    artist.wish = { genre: 'pop', until: world.tick + 4 };
    applyAction(world, 'u1', { type: 'genre_wish_refuse', artistId: artist.id });
    expect(artist.morale).toBe(50 + GENRE_CHANGE.wished + GENRE_CHANGE.refused);
    expect(() => applyAction(world, 'u1', { type: 'genre_wish_refuse', artistId: artist.id })).toThrow(/rien demandé/);
  });

  it('tells the progress of the week and keeps the rating curve', () => {
    const { world, labelId, artist } = worldWithLabel();
    world.labels[labelId]!.cash = 1_000_000;
    const told: string[] = [];
    const before = new Map([[artist.id, generalRating(artist) - 2]]);
    tickEvolution(world, before, (_, text) => told.push(text));
    expect(told).toContain(`Progrès de la semaine : ${artist.name} +2.`);
    for (let i = 0; i < 40; i += 1) runTick(world);
    expect(artist.genHistory!.length).toBe(EVOLUTION.history);
    expect(buildView(world, 'u1').roster[0]!.evolution!.history).toHaveLength(EVOLUTION.history);
  });
});

describe('enchères, prêts et échanges', () => {
  const labels = (count = 3) => {
    const world = createWorld(42);
    const users = ['u1', 'u2', 'u3'].slice(0, count);
    for (const user of users) {
      applyAction(world, user, { type: 'found', name: `Label ${user}` });
      applyAction(world, user, { type: 'tuto', move: 'skip' });
    }
    const [seller, buyer, third] = users.map((u) => Object.values(world.labels).find((l) => l.ownerId === u)!);
    for (const l of [seller, buyer, third]) if (l) l.cash = 200_000;
    // Old enough contracts, long enough to lend.
    for (const c of world.contracts) {
      if (world.labels[c.labelId]?.kind !== 'player') continue;
      c.startTick = -20;
      c.endTick = 1_000;
    }
    const artist = rosterOf(world, seller!.id)[0]!;
    return { world, seller: seller!, buyer: buyer!, third: third!, artist };
  };
  const generous = (artist: Artist) => {
    const e = expectedOffer(artist);
    return { advance: Math.round(e.advance * 1.5) + 500, royaltyRate: Math.min(0.5, e.royaltyRate * 1.5), months: 12 as const, weeklyAllowance: 100 };
  };
  // No label of the game in this auction: only the friends bid.
  const quiet = (world: World): string => {
    const a = world.auctions!.at(-1)!;
    a.npc = null;
    a.bids = [];
    return a.id;
  };

  it('sells to the best friend at the end, who then signs the artist', () => {
    const { world, seller, buyer, artist } = labels(2);
    applyAction(world, 'u1', { type: 'auction_start', artistId: artist.id, start: 1_000, weeks: 2, reserve: null });
    const id = quiet(world);
    expect(() => applyAction(world, 'u1', { type: 'sell', artistId: artist.id })).toThrow(/enchères/);
    expect(() => applyAction(world, 'u2', { type: 'auction_bid', auctionId: id, amount: 900 })).toThrow(/au moins/);
    applyAction(world, 'u2', { type: 'auction_bid', auctionId: id, amount: 1_000 });
    expect(buildView(world, 'u2').auctions[0]).toMatchObject({ best: { amount: 1_000, mine: true }, nextBid: 1_100 });
    expect(() => applyAction(world, 'u1', { type: 'auction_cancel', auctionId: id })).toThrow(/déjà enchéri/);
    runTick(world);
    expect(world.auctions![0]!.status).toBe('open');
    const told = runTick(world).labels[buyer.id]!.events;
    expect(told.some((t) => t.includes('remportes'))).toBe(true);
    expect(world.auctions![0]!.status).toBe('signing');
    expect(buildView(world, 'u2').transfers[0]).toMatchObject({ status: 'agreed', fromAuction: true, fee: 1_000 });
    const cash = seller.cash;
    applyAction(world, 'u2', { type: 'offer', artistId: artist.id, offer: generous(artist) });
    expect(contractOf(world, artist.id)!.labelId).toBe(buyer.id);
    expect(seller.cash).toBe(cash + 1_000);
    runTick(world);
    expect(world.auctions![0]!.status).toBe('sold');
  });

  it('tells the outbid friend, and gives the next one his chance when the winner does not sign', () => {
    const { world, seller, buyer, third, artist } = labels(3);
    applyAction(world, 'u1', { type: 'auction_start', artistId: artist.id, start: 1_000, weeks: 1, reserve: null });
    const id = quiet(world);
    applyAction(world, 'u2', { type: 'auction_bid', auctionId: id, amount: 1_000 });
    applyAction(world, 'u3', { type: 'auction_bid', auctionId: id, amount: 2_000 });
    expect(buildView(world, 'u2').auctions[0]!.outbid).toBe(true);
    let report = runTick(world);
    expect(report.labels[buyer.id]!.events.some((t) => t.includes('plus que toi'))).toBe(true);
    expect(report.labels[third.id]!.events.some((t) => t.includes('remportes'))).toBe(true);
    // The winner lets the two weeks pass: the next bidder gets the artist's talks.
    runTick(world);
    report = runTick(world);
    if (!report.labels[buyer.id]!.events.some((t) => t.includes('remportes'))) report = runTick(world);
    expect(report.labels[buyer.id]!.events.some((t) => t.includes('remportes'))).toBe(true);
    expect(buildView(world, 'u2').transfers.find((t) => t.status === 'agreed')!.fee).toBe(1_000);
    expect(contractOf(world, artist.id)!.labelId).toBe(seller.id);
  });

  it('keeps the reserve secret and does not sell under it', () => {
    const { world, seller, artist } = labels(2);
    applyAction(world, 'u1', { type: 'auction_start', artistId: artist.id, start: 1_000, weeks: 1, reserve: 50_000 });
    const id = quiet(world);
    applyAction(world, 'u2', { type: 'auction_bid', auctionId: id, amount: 3_000 });
    expect(buildView(world, 'u2').auctions[0]).toMatchObject({ reserve: null, reserveMet: false });
    expect(buildView(world, 'u1').auctions[0]).toMatchObject({ reserve: 50_000, reserveMet: false });
    const told = runTick(world).labels[seller.id]!.events;
    expect(told.some((t) => t.includes('prix de réserve'))).toBe(true);
    expect(world.auctions![0]!.status).toBe('unsold');
    expect(contractOf(world, artist.id)!.labelId).toBe(seller.id);
  });

  it('lets a label of the game bid up to its price, and buy at once when it wins', () => {
    const { world, seller, artist } = labels(2);
    const npc = Object.values(world.labels).find((l) => l.kind === 'npc' && !l.bankrupt)!;
    applyAction(world, 'u1', { type: 'auction_start', artistId: artist.id, start: 1_000, weeks: 1, reserve: null });
    const a = world.auctions![0]!;
    a.bids = [];
    a.npc = { labelId: npc.id, max: 5_000 };
    applyAction(world, 'u2', { type: 'auction_bid', auctionId: a.id, amount: 1_000 });
    expect(a.bids.at(-1)).toMatchObject({ labelId: npc.id, amount: 1_100 });
    applyAction(world, 'u2', { type: 'auction_bid', auctionId: a.id, amount: 4_000 });
    expect(a.bids.at(-1)).toMatchObject({ labelId: npc.id, amount: 4_200 });
    const cash = seller.cash;
    // The friend gives up: the label of the game wins and pays at once.
    runTick(world);
    expect(a.status).toBe('sold');
    expect(contractOf(world, artist.id)!.labelId).toBe(npc.id);
    expect(seller.cash).toBeGreaterThanOrEqual(cash + 4_200 - 5_000);
    // A label of the game is always interested in a fresh auction, when the start price is fair.
    const { world: w2, artist: other } = labels(2);
    applyAction(w2, 'u1', { type: 'auction_start', artistId: other.id, start: 1, weeks: 1, reserve: null });
    expect(w2.auctions![0]!.bids[0]!.amount).toBe(1);
  });

  it('lends an artist: fee, 70/30 split, rules frozen, and back home at the end', () => {
    const { world, seller: lender, buyer: borrower, artist } = labels(2);
    applyAction(world, 'u1', { type: 'lend', artistId: artist.id, weeks: 4, fee: 2_000 });
    const offer = buildView(world, 'u2').lendings.find((l) => l.side === 'offer')!;
    expect(offer).toMatchObject({ fee: 2_000, weeks: 4, blocked: null });
    applyAction(world, 'u2', { type: 'borrow', lendingId: offer.id });
    expect(lender.cash).toBe(202_000);
    expect(borrower.cash).toBe(198_000);
    expect(contractOf(world, artist.id)).toMatchObject({ labelId: borrower.id, loan: { lenderId: lender.id } });
    expect(buildView(world, 'u2').roster.find((a) => a.id === artist.id)!.loan).toMatchObject({ weeksLeft: 4 });
    expect(buildView(world, 'u2').roster.find((a) => a.id === artist.id)!.renewBlocked).toMatch(/Prêté/);
    expect(() => applyAction(world, 'u2', { type: 'sell', artistId: artist.id })).toThrow(/prêté/);
    expect(() => applyAction(world, 'u2', { type: 'clause', artistId: artist.id, amount: 10 })).toThrow(/prêté/);
    expect(() => applyAction(world, 'u2', { type: 'raise', artistId: artist.id })).toThrow(/prêté/);
    expect(() => applyAction(world, 'u2', { type: 'tour', artistId: artist.id, dates: 12 })).toThrow(/rentre de prêt/);
    // The 30 % of what he earns go back to his label; old money stays where it is.
    const paid: number[] = [];
    expect(shareLoan(world, artist.id, borrower.id, 1_000, (_, cut) => paid.push(cut))).toBe(700);
    expect(paid).toEqual([300]);
    expect(shareLoan(world, artist.id, borrower.id, 1_000, () => paid.push(-1), world.tick - 5)).toBe(1_000);
    let told: string[] = [];
    for (let i = 0; i < 4; i += 1) told = runTick(world).labels[lender.id]!.events;
    expect(told.some((t) => t.includes('rentre de prêt'))).toBe(true);
    expect(contractOf(world, artist.id)!.labelId).toBe(lender.id);
    expect(contractOf(world, artist.id)!.loan).toBeUndefined();
  });

  it('lets a label of the game borrow a fair listing, and sends the lender his share', () => {
    const { world, seller: lender, artist } = labels(1);
    let taken = false;
    for (let round = 0; round < 15 && !taken; round += 1) {
      applyAction(world, 'u1', { type: 'lend', artistId: artist.id, weeks: 4, fee: 0 });
      for (let i = 0; i < 4 && !taken; i += 1) {
        runTick(world);
        taken = world.labels[contractOf(world, artist.id)!.labelId]!.kind === 'npc';
      }
      while (!taken && world.lendings!.some((l) => l.status === 'listed')) runTick(world);
    }
    expect(taken).toBe(true);
    const lending = world.lendings!.find((l) => l.status === 'running')!;
    runTick(world);
    expect(lending.earned).toBeGreaterThan(0);
    for (let i = 0; i < 4; i += 1) runTick(world);
    expect(contractOf(world, artist.id)!.labelId).toBe(lender.id);
  });

  it('sends a borrowed artist home when the borrower goes bankrupt', () => {
    const { world, seller: lender, buyer: borrower, artist } = labels(2);
    applyAction(world, 'u1', { type: 'lend', artistId: artist.id, weeks: 6, fee: 0 });
    applyAction(world, 'u2', { type: 'borrow', lendingId: world.lendings![0]!.id });
    returnLoans(world, borrower.id, () => {});
    expect(contractOf(world, artist.id)!.labelId).toBe(lender.id);
  });

  it('trades an artist of the buyer in a transfer, with or without money', () => {
    const { world, seller, buyer, artist } = labels(2);
    const mine = rosterOf(world, buyer.id)[0]!;
    applyAction(world, 'u2', { type: 'transfer_ask', artistId: artist.id, fee: 0, swapId: mine.id });
    const received = buildView(world, 'u1').transfers[0]!;
    expect(received.swap).toMatchObject({ id: mine.id, name: mine.name });
    applyAction(world, 'u1', { type: 'transfer_answer', transferId: received.id, answer: 'accept' });
    applyAction(world, 'u2', { type: 'offer', artistId: artist.id, offer: generous(artist) });
    expect(contractOf(world, artist.id)!.labelId).toBe(buyer.id);
    expect(contractOf(world, mine.id)!.labelId).toBe(seller.id);
    expect(() => applyAction(world, 'u2', { type: 'transfer_ask', artistId: mine.id, fee: 0 })).toThrow(/somme/);
  });
});

describe('enchères : le label du jeu et la réserve', () => {
  it('goes up to the reserve when its price allows it', () => {
    const world = createWorld(42);
    for (const user of ['u1', 'u2']) {
      applyAction(world, user, { type: 'found', name: `Label ${user}` });
      applyAction(world, user, { type: 'tuto', move: 'skip' });
    }
    const seller = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    Object.values(world.labels).find((l) => l.ownerId === 'u2')!.cash = 50_000;
    const artist = rosterOf(world, seller.id)[0]!;
    contractOf(world, artist.id)!.startTick = -20;
    applyAction(world, 'u1', { type: 'auction_start', artistId: artist.id, start: 100, weeks: 1, reserve: 2_000 });
    const a = world.auctions![0]!;
    a.bids = [];
    a.npc = { labelId: Object.values(world.labels).find((l) => l.kind === 'npc')!.id, max: 3_000 };
    applyAction(world, 'u2', { type: 'auction_bid', auctionId: a.id, amount: 100 });
    expect(a.bids.at(-1)).toMatchObject({ labelId: a.npc.labelId, amount: 2_000 });
    expect(buildView(world, 'u2').auctions[0]).toMatchObject({ reserveMet: true, outbid: true });
  });
});

describe('studio : 40 embrouilles, situations et sorties ratées', () => {
  const players = () => {
    const world = createWorld(42);
    applyAction(world, 'u1', { type: 'found', name: 'Label u1' });
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    const label = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    label.cash = 500_000;
    const artist = rosterOf(world, label.id)[0]!;
    artist.energy = 90;
    artist.morale = 70;
    return { world, label, artist };
  };
  const past = (world: World, artist: Artist, tick: number, quality: number) =>
    world.songs.push({ id: `old${tick}`, artistId: artist.id, labelId: contractOf(world, artist.id)!.labelId, state: 'released', releaseTick: tick, quality } as unknown as Song);

  it('has 40 embrouilles and fifteen good surprises', () => {
    expect(STUDIO_CONTENT).toEqual({ cards: 40, surprises: 15 });
  });

  it('keeps black humour for invented artists and never repeats the last embrouilles', () => {
    const { world, label, artist } = players();
    artist.real = false;
    expect(studioCardsFor(world, label.id, artist.id, 'theme')).toContain('lyricist_dead');
    expect(studioCardsFor(world, label.id, artist.id, 'beat')).toContain('cursed_beat');
    artist.real = true;
    expect(studioCardsFor(world, label.id, artist.id, 'theme')).not.toContain('lyricist_dead');
    expect(studioCardsFor(world, label.id, artist.id, 'beat')).not.toContain('cursed_beat');
    // A real guest keeps the darkest featuring card away, even with an invented host.
    artist.real = false;
    const realGuest = Object.values(world.artists).find((a) => a.real)!;
    const fakeGuest = Object.values(world.artists).find((a) => !a.real && a.id !== artist.id)!;
    expect(studioCardsFor(world, label.id, artist.id, 'feat', fakeGuest.id)).toHaveLength(8);
    expect(studioCardsFor(world, label.id, artist.id, 'feat', realGuest.id)).not.toContain('guest_gone');
    label.lastCards = ['blank_page', 'greedy'];
    expect(studioCardsFor(world, label.id, artist.id, 'theme')).not.toContain('blank_page');
    expect(studioCardsFor(world, label.id, artist.id, 'feat', fakeGuest.id)).not.toContain('greedy');
  });

  it('brings the situation cards only in their situation', () => {
    const { world, label, artist } = players();
    const has = (artistId: string, stage: 'theme' | 'beat' | 'producer' | 'studio', id: string) => studioCardsFor(world, label.id, artistId, stage).includes(id);
    // Tired or low.
    expect(has(artist.id, 'studio', 'asleep')).toBe(false);
    artist.energy = 20;
    expect(has(artist.id, 'studio', 'asleep')).toBe(true);
    artist.energy = 90;
    artist.morale = 30;
    expect(has(artist.id, 'studio', 'asleep')).toBe(true);
    artist.morale = 70;
    // On loan.
    const lender = addPlayerLabel(world, 'u9', 'Prêteur Records');
    expect(has(artist.id, 'beat', 'loan_compare')).toBe(false);
    contractOf(world, artist.id)!.loan = { id: 'l1', lenderId: lender.id, startTick: world.tick, until: world.tick + 6 };
    expect(has(artist.id, 'beat', 'loan_compare')).toBe(true);
    // In a clash.
    const rival = Object.values(world.artists).find((a) => a.id !== artist.id && !contractOf(world, a.id))!;
    expect(has(artist.id, 'theme', 'clash_rewrite')).toBe(false);
    world.clashes = [
      { id: 'c1', fromLabelId: lender.id, toLabelId: label.id, fromArtistId: rival.id, fromSongId: 's', toArtistId: artist.id, toSongId: null, status: 'answered', answerBy: 9, resolveTick: 9, winnerLabelId: null, updatedTick: 0 },
    ] as World['clashes'];
    expect(has(artist.id, 'theme', 'clash_rewrite')).toBe(true);
    // The star of a label of three or more.
    expect(has(artist.id, 'producer', 'star_rider')).toBe(false);
    label.tier = 3;
    for (const free of freeAgents(world).slice(0, 2)) signArtist(world, label.id, free.id, expectedOffer(free));
    const ranks = ranksOf(world, label.id);
    for (const a of rosterOf(world, label.id)) expect(has(a.id, 'producer', 'star_rider'), a.name).toBe(ranks.get(a.id) === 'star');
  });

  it('fills the names in the cards, and gives the buzz of the session with the song', () => {
    const { world, label, artist } = players();
    for (let week = 0; week < 20; week += 1) {
      world.tick = week;
      artist.energy = week % 2 ? 100 : 30;
      artist.morale = 70;
      const offers = studioOffers(world, label.id, artist);
      applyAction(world, 'u1', { type: 'studio', artistId: artist.id, themeId: offers.themes[0]!.id, beatId: offers.beats[0]!.id, levels: { theme: 1, beat: 1, producer: 1, studio: 1 } });
      for (const event of buildView(world, 'u1').session!.events) {
        if (event.kind === 'clash') applyAction(world, 'u1', { type: 'react', reactionId: event.reactions.at(-1)!.id });
      }
      for (const event of buildView(world, 'u1').session!.events) {
        expect(`${event.title} ${event.text} ${event.result} ${event.reactions.map((r) => r.text).join(' ')}`).not.toMatch(/[{}]/);
      }
      applyAction(world, 'u1', { type: 'studio_cancel' });
    }
    // The buzz won during the session reaches the artist with the song, and its embrouilles are remembered.
    world.tick = 30;
    artist.energy = 100;
    const offers = studioOffers(world, label.id, artist);
    applyAction(world, 'u1', { type: 'studio', artistId: artist.id, themeId: offers.themes[0]!.id, beatId: offers.beats[0]!.id, levels: { theme: 1, beat: 1, producer: 1, studio: 1 } });
    for (const event of buildView(world, 'u1').session!.events) if (event.kind === 'clash') applyAction(world, 'u1', { type: 'react', reactionId: event.reactions[0]!.id });
    applyAction(world, 'u1', { type: 'feat_skip' });
    const session = world.sessions![label.id]!;
    session.hype = (session.hype ?? 0) + 4;
    const gained = session.hype;
    const cards = session.events.filter((e) => e.kind === 'clash').map((e) => e.cardId);
    artist.hype = 40;
    applyAction(world, 'u1', { type: 'song', title: 'Buzz' });
    expect(artist.hype).toBe(Math.min(100, 40 + gained));
    expect(label.lastCards).toEqual(cards);
  });

  it('lets the fans down after two weak releases out of four, more each time, until a good one', () => {
    const { world, label, artist } = players();
    world.tick = 20;
    for (const tick of [5, 6, 7]) past(world, artist, tick, 70);
    expect(usualNote(world, artist.id)).toBe(70);
    expect([isLetdown(65, 70), isLetdown(66, 70), isLetdown(49, null), isLetdown(60, null)]).toEqual([true, false, true, false]);
    const told: string[] = [];
    const tell = (text: string) => told.push(text);
    Object.assign(artist, { hype: 50, morale: 60, fans: 10_000 });
    judgeRelease(world, label, artist, 64, '« Un »', tell);
    judgeRelease(world, label, artist, 68, '« Deux »', tell);
    expect(told).toEqual([]);
    expect(artist.hype).toBe(50);
    judgeRelease(world, label, artist, 60, '« Trois »', tell);
    expect(told[0]).toMatch(/^« Trois » déçoit les fans de .+ : 2 sorties ratées sur ses 3 dernières\. Buzz −5, 100 fans partis, moral −3\.$/);
    expect([artist.hype, artist.fans, artist.morale]).toEqual([45, 9_900, 57]);
    judgeRelease(world, label, artist, 45, '« Quatre »', tell);
    expect([artist.hype, artist.fans, artist.morale]).toEqual([35, 9_702, 51]);
    judgeRelease(world, label, artist, 75, '« Cinq »', tell);
    expect(artist.letdown?.recent).toEqual([]);
    judgeRelease(world, label, artist, 60, '« Six »', tell);
    expect(artist.hype).toBe(35);
    expect(told).toHaveLength(2);
  });

  it('costs the label a little reputation when several artists miss together, never for the game labels', () => {
    const { world, label, artist } = players();
    label.tier = 3;
    const other = freeAgents(world)[0]!;
    signArtist(world, label.id, other.id, expectedOffer(other));
    label.reputation = 30;
    const told: string[] = [];
    const tell = (text: string) => told.push(text);
    artist.letdown = { recent: [true] };
    other.letdown = { recent: [true] };
    judgeRelease(world, label, artist, 30, '« A »', tell);
    expect(label.reputation).toBe(30);
    world.tick += 1;
    judgeRelease(world, label, other, 30, '« B »', tell);
    expect(label.reputation).toBe(29);
    expect(told.at(-1)).toMatch(/réputation baisse/);
    judgeRelease(world, label, artist, 30, '« C »', tell);
    expect(label.reputation).toBe(29);
    world.tick += 10;
    judgeRelease(world, label, artist, 30, '« D »', tell);
    expect(label.reputation).toBe(29);
    const npc = Object.values(world.labels).find((l) => l.kind !== 'player')!;
    const npcArtist = rosterOf(world, npc.id)[0]!;
    judgeRelease(world, npc, npcArtist, 10, '« E »', tell);
    expect(npcArtist.letdown).toBeUndefined();
  });

  it('judges a single in the weekly report', () => {
    const { world, label, artist } = players();
    // Under 50: a letdown even without a usual note; with one already, the fans react.
    artist.letdown = { recent: [true] };
    artist.energy = 100;
    const song = createSong(world, label.id, {
      artistId: artist.id, title: 'Raté', themeId: 'rupture', beatId: 'lovetrap',
      levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
    });
    song.quality = 30;
    // The starter song of the label comes out next week: this one the week after.
    scheduleRelease(world, label.id, song.id, world.tick + 2, []);
    const events = [...runTick(world).labels[label.id]!.events, ...runTick(world).labels[label.id]!.events];
    expect(events.filter((e) => e.startsWith('« Raté » déçoit les fans'))).toHaveLength(1);
  });
});

describe('ventes de CD et vinyles, et soutien du label', () => {
  const players = () => {
    const world = createWorld(42);
    applyAction(world, 'u1', { type: 'found', name: 'Label u1' });
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    const label = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    label.cash = 2_000_000;
    label.tier = 3;
    const artist = rosterOf(world, label.id)[0]!;
    return { world, label, artist };
  };
  const songsFor = (world: World, labelId: string, artist: Artist, count: number, quality: number) =>
    Array.from({ length: count }, (_, i) => {
      artist.energy = 100;
      const song = createSong(world, labelId, {
        artistId: artist.id, title: `Piste ${i + 1}`, themeId: 'rupture', beatId: 'lovetrap',
        levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
      });
      song.quality = quality;
      song.availableTick = 0;
      return song;
    });

  it('prices CDs and vinyls from the fans: an album of 100 000 fans brings about 8 000 €', () => {
    const base = { fans: 100_000, hype: 30, kind: 'album' as const, quality: 70, cover: false, signing: false, boost: 1 };
    expect(salesQuote(base)).toEqual({ units: 670, money: 8_040 });
    expect(salesQuote({ ...base, kind: 'ep' }).units).toBe(335);
    expect(salesQuote({ ...base, quality: 90 }).units).toBe(1_005);
    expect(salesQuote({ ...base, quality: 40 }).units).toBe(Math.round(670 * 0.25));
    expect(salesQuote({ ...base, hype: 80 }).units).toBe(1_005);
    expect(salesQuote({ ...base, cover: true, signing: true }).units).toBe(Math.round(670 * 1.1 * 1.25));
    expect(salesQuote({ ...base, boost: 1.3 }).units).toBe(871);
  });

  it('sells at release with the signing session, then the deluxe, and certifies gold then platinum', () => {
    const { world, label, artist } = players();
    const songs = songsFor(world, label.id, artist, 3, 70);
    const project = createProject(world, label, { artistId: artist.id, kind: 'ep', title: 'Or Massif', songIds: songs.map((x) => x.id), inWeeks: 2, signing: true });
    expect(project.signing).toBe(true);
    world.tick = project.releaseTick;
    Object.assign(artist, { fans: 1_000_000, hype: 30, energy: 50 });
    label.reputation = 20;
    const told: string[] = [];
    const news: string[] = [];
    const paid: number[] = [];
    tickProjects(world, (_, text) => told.push(text), (text) => news.push(text), (_, amount) => paid.push(amount));
    const quote = salesQuote({ fans: 1_000_000, hype: 30, kind: 'ep', quality: project.quality!, cover: false, signing: true, boost: 1 });
    expect(project.sales).toBe(quote.units);
    expect(paid).toEqual([quote.money]);
    expect(artist.energy).toBe(50 - SALES.signingEnergy);
    expect(told[0]).toMatch(/CD et vinyles vendus .*séance de dédicace/);
    expect(project.cert).toBe('gold');
    expect(label.reputation).toBe(20 + SALES.goldReputation);
    expect(news.some((n) => n.includes('disque d’or pour « Or Massif »'))).toBe(true);
    // A deluxe out the week after: a third of what the album would sell, and the total reaches platinum.
    project.kind = 'album';
    project.deluxe = { songIds: [], tick: world.tick + 1 };
    world.tick += 1;
    tickProjects(world, (_, text) => told.push(text), (text) => news.push(text), (_, amount) => paid.push(amount));
    // Gold lit him up: in form, he sells a little more.
    const album = salesQuote({ fans: 1_000_000, hype: 30, kind: 'album', quality: project.quality!, cover: false, signing: false, boost: FORM.boost });
    expect(project.deluxe.sales).toBe(Math.round(album.units * SALES.deluxe));
    expect(paid[1]).toBe(project.deluxe.sales! * SALES.price);
    expect(project.cert).toBe('platinum');
    expect(label.reputation).toBe(20 + SALES.goldReputation + SALES.platinumReputation);
    // Sold once only.
    world.tick += 1;
    tickProjects(world, () => undefined, () => undefined, (_, amount) => paid.push(amount));
    expect(paid).toHaveLength(2);
    const view = buildView(world, 'u1').projects.find((x) => x.id === project.id)!;
    expect(view).toMatchObject({ sales: project.sales! + project.deluxe.sales!, cert: 'platinum', signing: true });
  });

  it('gives roles with bonuses that take nothing from the others, places by tier, once a week', () => {
    const { world, label, artist } = players();
    for (const free of freeAgents(world).slice(0, 2)) signArtist(world, label.id, free.id, expectedOffer(free));
    label.tier = 1;
    const [a, b, c] = rosterOf(world, label.id);
    expect(supportBoost(world, label.id, a!.id, 'promo')).toBe(1);
    applyAction(world, 'u1', { type: 'role', artistId: a!.id, role: 'headliner' });
    expect(supportBoost(world, label.id, a!.id, 'promo')).toBeCloseTo(ROLES.headliner.promo);
    expect(supportBoost(world, label.id, a!.id, 'sales')).toBeCloseTo(ROLES.headliner.sales);
    // The others lose nothing.
    expect(supportBoost(world, label.id, b!.id, 'promo')).toBe(1);
    expect(supportBoost(world, label.id, c!.id, 'grow')).toBe(1);
    // One place per role at Maison, two at Underground.
    expect(roleSlots(1)).toBe(1);
    expect(() => applyAction(world, 'u1', { type: 'role', artistId: b!.id, role: 'headliner' })).toThrow(/Plus de place/);
    label.tier = 2;
    applyAction(world, 'u1', { type: 'role', artistId: b!.id, role: 'headliner' });
    // Once a week per artist.
    expect(() => applyAction(world, 'u1', { type: 'role', artistId: b!.id, role: 'prospect' })).toThrow(/cette semaine/);
    expect(() => applyAction(world, 'u1', { type: 'role', artistId: b!.id, role: 'headliner' })).toThrow(/déjà ce rôle|cette semaine/);
    world.tick += 1;
    applyAction(world, 'u1', { type: 'role', artistId: b!.id, role: 'prospect' });
    expect(supportBoost(world, label.id, b!.id, 'grow')).toBeCloseTo(ROLES.prospect.grow);
    expect(() => applyAction(world, 'u1', { type: 'role', artistId: 'fic_inconnu', role: 'pillar' })).toThrow(/pas dans ton label/);
    const dyn = buildView(world, 'u1').dynamics!.artists.find((x) => x.id === b!.id)!;
    expect(dyn).toMatchObject({ role: 'prospect', roleName: 'Pépite', roleLocked: true, form: 0 });
    expect(artist).toBeDefined();
    // A game label never has roles.
    const npc = Object.values(world.labels).find((l) => l.kind !== 'player')!;
    expect(supportBoost(world, npc.id, rosterOf(world, npc.id)[0]!.id, 'promo')).toBe(1);
  });

  it('lets a pillar in a good mood lift the others, without any jealousy', () => {
    const { world, label } = players();
    for (const free of freeAgents(world).slice(0, 2)) signArtist(world, label.id, free.id, expectedOffer(free));
    const [a, b] = rosterOf(world, label.id);
    applyAction(world, 'u1', { type: 'role', artistId: a!.id, role: 'pillar' });
    const calm = buildView(world, 'u1').dynamics!.calm;
    a!.morale = 80;
    b!.morale = calm;
    tickMorale(world, () => undefined, () => undefined);
    // b is at his calm point: only the pillar moves him.
    expect(b!.morale).toBe(calm + ROLE_RULES.pillar);
    expect(worriesOf(world, label.id, b!).map((w) => w.kind)).not.toContain('jealous');
  });

  it('lights an artist up after a gold record: his card shines 4 weeks with a little more of everything', () => {
    const { world, label, artist } = players();
    const before = experienceBonus(world, artist);
    const told: string[] = [];
    lightUp(world, label.id, artist, 'disque d’or', (_, text) => told.push(text));
    expect(inForm(world, artist)).toBe(true);
    expect(told[0]).toMatch(/en pleine forme/);
    expect(experienceBonus(world, artist)).toBeCloseTo(before + FORM.quality);
    expect(supportBoost(world, label.id, artist.id, 'promo')).toBeCloseTo(FORM.boost);
    expect(supportBoost(world, label.id, artist.id, 'grow')).toBe(1);
    expect(buildView(world, 'u1').roster.find((r) => r.id === artist.id)?.form).toBe(FORM.weeks);
    world.tick += FORM.weeks;
    expect(inForm(world, artist)).toBe(false);
    // A game label's artist never lights up.
    const npc = Object.values(world.labels).find((l) => l.kind !== 'player')!;
    const theirs = rosterOf(world, npc.id)[0]!;
    lightUp(world, npc.id, theirs, 'n°1', () => undefined);
    expect(inForm(world, theirs)).toBe(false);
  });
});

describe('prêt sur patrimoine et paliers Mainstream et Empire', () => {
  const setup = (tier: number) => {
    const world = createWorld(42);
    applyAction(world, 'u1', { type: 'found', name: 'Label u1' });
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    const label = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    label.cash = 2_000_000;
    label.tier = tier;
    const artist = rosterOf(world, label.id)[0]!;
    return { world, label, artist };
  };
  const hits = (world: World, labelId: string, artist: Artist, streams: number[]) =>
    streams.map((weekly, i) => {
      artist.energy = 100;
      const song = createSong(world, labelId, {
        artistId: artist.id, title: `Tube ${i + 1}`, themeId: 'rupture', beatId: 'lovetrap',
        levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
      });
      Object.assign(song, { state: 'released', releaseTick: 0, streamsLast: weekly, decay: 0.95 });
      return song;
    });

  it('lends 40 % of the assets from the Respecté tier, over 13, 26 or 52 weeks, one at a time, repaid early without fees', () => {
    const { world, label, artist } = setup(2);
    hits(world, label.id, artist, [2_000_000, 500_000]);
    expect(assetLoanCap(world, label)).toBe(0);
    expect(() => applyAction(world, 'u1', { type: 'asset_loan', amount: 10_000, weeks: 26 })).toThrow(/palier/);
    label.tier = 3;
    const cap = assetLoanCap(world, label);
    expect(cap).toBe(Math.floor((ESTATE.share * assetBase(world, label)) / 1_000) * 1_000);
    expect(cap).toBeGreaterThan(0);
    expect(() => applyAction(world, 'u1', { type: 'asset_loan', amount: 10_000, weeks: 20 })).toThrow(/13, 26 ou 52/);
    expect(() => applyAction(world, 'u1', { type: 'asset_loan', amount: cap + 1_000, weeks: 26 })).toThrow(/au plus/);
    const cash = label.cash;
    applyAction(world, 'u1', { type: 'asset_loan', amount: 10_000, weeks: 52 });
    expect(label.cash).toBe(cash + 10_000);
    expect(world.loans.find((l) => l.labelId === label.id && l.kind === 'asset')).toMatchObject({ ratePerTick: ESTATE.rate, ticksLeft: 52 });
    expect(() => applyAction(world, 'u1', { type: 'asset_loan', amount: 1_000, weeks: 13 })).toThrow(/déjà/);
    applyAction(world, 'u1', { type: 'repay', kind: 'asset' });
    expect(label.cash).toBe(cash);
    expect(world.loans.some((l) => l.labelId === label.id)).toBe(false);
    expect(() => applyAction(world, 'u1', { type: 'repay', kind: 'classic' })).toThrow(/Pas de prêt/);
  });

  it('warns, then 2 weeks later seizes the songs that earn the most, which can be bought back dearer', () => {
    const { world, label, artist } = setup(3);
    const [big, small] = hits(world, label.id, artist, [2_000_000, 100_000]);
    applyAction(world, 'u1', { type: 'asset_loan', amount: 50_000, weeks: 26 });
    const told: string[] = [];
    // Back in the green: nothing happens.
    tickAssetLoan(world, label, (t) => told.push(t));
    expect(told).toHaveLength(0);
    label.cash = -1_000;
    tickAssetLoan(world, label, (t) => told.push(t));
    expect(told[0]).toMatch(/Alerte de la banque/);
    expect(buildView(world, 'u1').estate!.seizeIn).toBe(ESTATE.warnWeeks);
    world.tick += 1;
    tickAssetLoan(world, label, (t) => told.push(t));
    expect(big!.seized).toBeUndefined();
    world.tick += 1;
    const before = catalogueValue(world, label.id);
    tickAssetLoan(world, label, (t) => told.push(t));
    // The biggest song covers the debt alone.
    expect(big!.seized).toEqual({ tick: world.tick });
    expect(small!.seized).toBeUndefined();
    expect(told.at(-1)).toMatch(/saisit 1 son : « Tube 1 »/);
    expect(world.loans.some((l) => l.labelId === label.id && l.kind === 'asset')).toBe(false);
    expect(catalogueValue(world, label.id)).toBeLessThan(before);
    // It earns nothing any more.
    const report = runTick(world);
    expect(report).toBeDefined();
    const view = buildView(world, 'u1').estate!;
    expect(view.seized.map((x) => x.id)).toEqual([big!.id]);
    expect(view.seized[0]!.price).toBe(buybackPrice(world, big!.id));
    // Dearer than what it is worth: its value as if it were still the label's, plus 25 %.
    expect(view.seized[0]!.price).toBeGreaterThan(10_000);
    label.cash = 0;
    expect(() => applyAction(world, 'u1', { type: 'buyback', songId: big!.id })).toThrow(/Il te faut/);
    label.cash = 10_000_000;
    applyAction(world, 'u1', { type: 'buyback', songId: big!.id });
    expect(big!.seized).toBeUndefined();
    expect(() => applyAction(world, 'u1', { type: 'buyback', songId: small!.id })).toThrow(/pas saisi/);
  });

  it('lifts the warning when the label is back in the green without emergency loan', () => {
    const { world, label, artist } = setup(3);
    hits(world, label.id, artist, [2_000_000]);
    applyAction(world, 'u1', { type: 'asset_loan', amount: 20_000, weeks: 13 });
    const told: string[] = [];
    label.cash = -5;
    tickAssetLoan(world, label, (t) => told.push(t));
    label.cash = 100;
    tickAssetLoan(world, label, (t) => told.push(t));
    expect(told[1]).toMatch(/lève son alerte/);
    expect(buildView(world, 'u1').estate!.seizeIn).toBeNull();
  });

  it('opens legend producers at Mainstream, stadiums and cheaper stars at Empire', () => {
    const { world, label, artist } = setup(3);
    artist.energy = 100;
    const legend = { artistId: artist.id, title: 'Légende', themeId: 'rupture', beatId: 'lovetrap', levels: { theme: 1, beat: 1, producer: 5, studio: 1 } as const, producer: producerOfLevel(5, 1) };
    expect(() => createSong(world, label.id, legend)).toThrow(/légende arrivent au palier Label Mainstream/);
    label.tier = 4;
    const song = createSong(world, label.id, legend);
    expect(song.cost).toBe(CFG.quality.producerPrice[4]);
    // Stadiums: Empire only.
    const star = { ...artist, fans: 80_000_000, hype: 90 };
    expect(playGig(star, 0, 1, 4).venue).not.toBe('Stade');
    expect(playGig(star, 0, 1, 5).venue).toBe('Stade');
    // Stars (only Mainstream labels and up can sign them) ask an Empire 25 % less.
    const famous = { ...artist, fans: 10_000_000 };
    expect(expectedOffer(famous, 5).advance).toBe(Math.round(artistValue(famous) * CFG.advanceShare * (1 - CFG.tiers.starDiscount)));
    expect(expectedOffer(famous, 5).advance).toBeLessThan(expectedOffer(famous, 4).advance);
    expect(expectedOffer(artist, 5).advance).toBe(expectedOffer(artist, 1).advance);
  });

  it('shows the progress to the next tier, the table of the 6 tiers, and throws a party when the label goes up', () => {
    const { world, label } = setup(1);
    expect(TIER_TABLE).toHaveLength(6);
    expect(TIER_TABLE[0]!.needs).toBe('Au départ');
    expect(TIER_TABLE[4]!.unlocks).toMatch(/stades/);
    const next = tierProgress(world, label)!;
    expect(next.name).toBe('Label Underground');
    expect(next.conditions.map((c) => c.text)).toEqual(['Réputation', 'Fans', 'Son dans un top 50 de genre']);
    // Meet every condition: the label goes up at the next tick.
    Object.assign(label, { reputation: 30 });
    label.stats.top50Genre = 1;
    const roster = rosterOf(world, label.id);
    roster[0]!.fans = 30_000;
    const report = runTick(world);
    expect(label.tier).toBe(2);
    expect(report.labels[label.id]?.events.some((e) => e.includes('Le label devient Label Underground'))).toBe(true);
    expect(world.marketNews?.some((n) => n.text === 'Label u1 devient Label Underground !')).toBe(true);
    expect(buildView(world, 'u1').estate!.party).toEqual({ tier: 2, name: 'Label Underground' });
    applyAction(world, 'u1', { type: 'tier_seen' });
    expect(buildView(world, 'u1').estate!.party).toBeNull();
    // At the top, nothing more to show.
    label.tier = 6;
    expect(tierProgress(world, label)).toBeNull();
  });
});

describe('événements de label, opportunités et événements du serveur', () => {
  const setup = () => {
    const world = createWorld(42);
    applyAction(world, 'u1', { type: 'found', name: 'Label u1' });
    applyAction(world, 'u1', { type: 'tuto', move: 'skip' });
    const label = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    label.cash = 500_000;
    const artist = rosterOf(world, label.id)[0]!;
    world.lastServerEvents = [...SERVER_IDS];
    return { world, label, artist };
  };

  it('has 40 label cards, 6 opportunities and 13 server events', () => {
    expect(EVENT_CONTENT).toEqual({ events: 40, chances: 6 });
    expect(new Set(CARD_IDS).size).toBe(46);
    expect(SERVER_CONTENT).toBe(13);
  });

  it('draws at most 3 cards, answers one, and applies the ignore answer after 4 weeks', () => {
    const { world, label } = setup();
    for (let i = 0; i < 30 && (label.cards ?? []).length < EVENTS.maxWaiting; i += 1) {
      world.tick += 1;
      tickCards(world, () => {});
    }
    expect(label.cards).toHaveLength(EVENTS.maxWaiting);
    world.tick += 1;
    tickCards(world, () => {});
    expect((label.cards ?? []).length).toBeLessThanOrEqual(EVENTS.maxWaiting);
    const view = buildView(world, 'u1').events!;
    expect(view.cards.length).toBeGreaterThan(0);
    for (const c of view.cards) expect(c.title + c.text + c.choices.map((x) => x.text).join()).not.toMatch(/\{[abslk]\}/);
    const card = label.cards![0]!;
    const choice = card.choices.find((c) => c.odds === undefined)!;
    applyAction(world, 'u1', { type: 'card', cardId: card.id, choiceId: choice.id });
    expect(label.cards!.some((c) => c.id === card.id)).toBe(false);
    expect(label.cardLog![0]).toContain(card.title);
    expect(() => applyAction(world, 'u1', { type: 'card', cardId: card.id, choiceId: choice.id })).toThrow(/n’existe plus/);
    // The others wait 4 weeks, then answer themselves.
    const left = [...label.cards!];
    world.tick = Math.max(...left.map((c) => c.tick)) + EVENTS.expireWeeks;
    const told: string[] = [];
    tickCards(world, (_, text) => told.push(text));
    for (const c of left) expect(label.cards!.some((x) => x.id === c.id)).toBe(false);
    if (left.length > 0) expect(told.some((t) => t.includes('Sans réponse'))).toBe(true);
  });

  it('keeps the dark cards for invented artists', () => {
    const { world, label, artist } = setup();
    artist.real = true;
    for (let i = 0; i < 200; i += 1) {
      world.tick += 1;
      label.cards = [];
      tickCards(world, () => {});
      for (const c of label.cards) expect(['testament', 'accountant', 'ghost', 'dead_rumour']).not.toContain(c.defId);
    }
  });

  it('negotiates a sync at 50/50: half more, or nothing', () => {
    const { world, label, artist } = setup();
    const song = createSong(world, label.id, {
      artistId: artist.id, title: 'Pub', themeId: 'rupture', beatId: 'lovetrap',
      levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
    });
    Object.assign(song, { state: 'released', releaseTick: 0, streamsLast: 10_000, quality: 80 });
    let won = 0;
    let lost = 0;
    for (let i = 0; i < 40; i += 1) {
      const card = {
        id: `card_t${i}`, defId: 'sync', kind: 'chance' as const, title: 'Sync', text: '', artistId: artist.id, songId: song.id, tick: world.tick,
        choices: [{ id: 'deal', text: 'Négocier (50 %)', odds: 0.5, win: { cash: 15_000, boost: { mult: 2, weeks: 2 } }, lose: {} }], ignore: 'deal',
      };
      label.cards = [card];
      const cash = label.cash;
      applyAction(world, 'u1', { type: 'card', cardId: card.id, choiceId: 'deal' });
      if (label.cash === cash + 15_000) won += 1;
      else if (label.cash === cash) lost += 1;
      world.tick += 1;
    }
    expect(won + lost).toBe(40);
    expect(won).toBeGreaterThan(5);
    expect(lost).toBeGreaterThan(5);
    // A won sync doubles the song's streams.
    expect(streamMult(world, song, 'trap')).toBeGreaterThan(1);
  });

  it('runs 1 or 2 server events a week: money is paid, trends lift a genre, and the boost does not stay', () => {
    const { world, label, artist } = setup();
    world.lastServerEvents = [];
    const song = createSong(world, label.id, {
      artistId: artist.id, title: 'Tendance', themeId: 'rupture', beatId: 'lovetrap',
      levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
    });
    Object.assign(song, { state: 'released', releaseTick: 0, streamsLast: 10_000, decay: 1, quality: 70 });
    const news: string[] = [];
    let paid = 0;
    for (let i = 0; i < 20; i += 1) {
      world.tick += 1;
      const before = news.length;
      tickServerEvents(world, (_, amount) => { paid += Math.abs(amount); }, () => {}, (t) => news.push(t));
      expect(news.length - before).toBeGreaterThanOrEqual(1);
      expect(news.length - before).toBeLessThanOrEqual(2);
    }
    expect(paid).toBeGreaterThan(0);
    // A genre trend: +30 % on that genre only, then taken off the next week.
    world.serverEvents = [{ id: 'x', title: 'Mode', text: '', tick: world.tick, until: world.tick, mult: 1.3, genre: 'trap' }];
    song.streamsLast = 10_000;
    applyStreamEvents(world, () => 'trap');
    expect(song.streamsLast).toBe(13_000);
    expect(song.eventMult).toBe(1.3);
    song.streamsLast = 10_000;
    delete song.eventMult;
    applyStreamEvents(world, () => 'pop' as never);
    expect(song.streamsLast).toBe(10_000);
    song.streamsLast = 13_000;
    song.eventMult = 1.3;
    world.serverEvents = [];
    world.lastServerEvents = [...SERVER_IDS];
    runTick(world);
    expect(song.eventMult).toBeUndefined();
    expect(song.streamsLast).toBeLessThan(13_000);
  });

  it('only sends festivals and brand promos to known artists, with a fee that grows with the fans', () => {
    const { world, label, artist } = setup();
    artist.fans = 2_000;
    for (let i = 0; i < 60; i += 1) {
      world.tick += 1;
      label.cards = [];
      tickCards(world, () => {});
      expect(label.cards.some((c) => c.defId === 'brand' || c.defId === 'festival')).toBe(false);
    }
    artist.fans = 1_000_000;
    let fee = 0;
    for (let i = 0; i < 60 && fee === 0; i += 1) {
      world.tick += 1;
      label.cards = [];
      tickCards(world, () => {});
      const brand = label.cards.find((c) => c.defId === 'brand');
      if (brand) fee = brand.choices[0]!.effect!.cash!;
    }
    expect(fee).toBeGreaterThan(15_000);
    expect(eventsView(world, label).cards.length).toBeGreaterThan(0);
  });
});

describe('guerres : conférence de presse et guerre de charts', () => {
  const setup = () => {
    const world = createWorld(42);
    for (const u of ['u1', 'u2']) {
      applyAction(world, u, { type: 'found', name: `Label ${u}` });
      applyAction(world, u, { type: 'tuto', move: 'skip' });
    }
    world.lastServerEvents = [...SERVER_IDS];
    const a = Object.values(world.labels).find((l) => l.ownerId === 'u1')!;
    const b = Object.values(world.labels).find((l) => l.ownerId === 'u2')!;
    applyAction(world, 'u1', { type: 'enemy_add', labelId: b.id });
    return { world, a, b, artA: rosterOf(world, a.id)[0]!, artB: rosterOf(world, b.id)[0]! };
  };

  it('gives better press odds with more buzz than the target, once a week, free', () => {
    const { world, a, artA, artB } = setup();
    artA.hype = 10;
    artB.hype = 60;
    const low = pressOdds(world, a.id, artA, artB);
    artA.hype = 90;
    artB.hype = 10;
    const high = pressOdds(world, a.id, artA, artB);
    expect(high).toBeGreaterThan(low + 0.3);
    expect(pressOdds(world, a.id, null, artB)).toBeGreaterThan(0);
    const cash = a.cash;
    applyAction(world, 'u1', { type: 'press', speakerId: null, targetId: artB.id });
    expect(a.cash).toBe(cash);
    expect(() => applyAction(world, 'u1', { type: 'press', speakerId: artA.id, targetId: artB.id })).toThrow(/par semaine/);
    expect(() => applyAction(world, 'u2', { type: 'press', speakerId: null, targetId: rosterOf(world, Object.values(world.labels).find((l) => l.ownerId === 'u2')!.id)[0]!.id })).toThrow(/propre/);
  });

  it('hits the target on success, costs reputation on failure, and a good riposte cancels it', () => {
    let hits = 0;
    let misses = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const { world, a, b, artA, artB } = setup();
      world.seed = seed;
      artA.hype = 50;
      artB.hype = 50;
      const rep = a.reputation;
      applyAction(world, 'u1', { type: 'press', speakerId: artA.id, targetId: artB.id });
      const conf = world.pressConfs![0]!;
      if (conf.success) {
        hits += 1;
        expect(artB.hype).toBe(50 - Math.round(WARS.hit * COOP.enemyBoost));
        expect(artA.hype).toBe(50 + Math.round(WARS.gain * COOP.enemyBoost));
        expect(buildView(world, 'u2').press!.toAnswer).toHaveLength(1);
        applyAction(world, 'u2', { type: 'press_reply', confId: conf.id, speakerId: artB.id });
        if (conf.reply!.success) {
          expect(artB.hype).toBe(50 + WARS.replyGain);
          expect(artA.hype).toBe(50);
        }
        expect(() => applyAction(world, 'u2', { type: 'press_reply', confId: conf.id, speakerId: null })).toThrow(/déjà/);
      } else {
        misses += 1;
        expect(a.reputation).toBeCloseTo(Math.max(0, rep - WARS.failReputation));
        expect(artA.hype).toBe(50 - WARS.failHype);
      }
      expect(b.id).not.toBe(a.id);
    }
    expect(hits).toBeGreaterThan(3);
    expect(misses).toBeGreaterThan(3);
  });

  const release = (world: World, labelId: string, artist: Artist, week: number, title: string) => {
    artist.energy = 100;
    const song = createSong(world, labelId, {
      artistId: artist.id, title, themeId: 'rupture', beatId: 'lovetrap',
      levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
    });
    Object.assign(song, { state: 'scheduled', releaseTick: week, availableTick: 0 });
    return song;
  };

  it('settles a duel on first-week streams: buzz, reputation and 10 % of the new fans', () => {
    const { world, a, b, artA, artB } = setup();
    world.labels[a.id]!.cash = 1_000_000;
    expect(() => applyAction(world, 'u1', { type: 'duel', targetLabelId: b.id, artistId: artA.id, week: world.tick + 1 })).toThrow(/entre 3 et 8/);
    const week = world.tick + 3;
    applyAction(world, 'u1', { type: 'duel', targetLabelId: b.id, artistId: artA.id, week });
    const duel = world.duels![0]!;
    expect(() => applyAction(world, 'u1', { type: 'duel', targetLabelId: b.id, artistId: artA.id, week })).toThrow(/déjà un duel/);
    applyAction(world, 'u2', { type: 'duel_answer', duelId: duel.id, accept: true, artistId: artB.id });
    expect(duel.status).toBe('accepted');
    artA.fans = 200_000;
    artB.fans = 1_000;
    release(world, a.id, artA, week, 'Gros son');
    release(world, b.id, artB, week, 'Petit son');
    const repA = a.reputation;
    while (world.tick < week) runTick(world);
    expect(duel.status).toBe('done');
    expect(duel.winnerLabelId).toBe(a.id);
    expect(duel.fromStreams!).toBeGreaterThan(duel.toStreams!);
    expect(a.stats.duelWins).toBe(1);
    expect(b.stats.duelLosses).toBe(1);
    expect(a.reputation).toBeGreaterThan(repA - 1);
    const view = buildView(world, 'u2').duels[0]!;
    expect(view).toMatchObject({ mine: 'received', status: 'done', winner: a.name, fromSong: 'Gros son', toSong: 'Petit son' });
    expect(buildView(world, 'u1').labels.find((l) => l.id === a.id)!.duelWins).toBe(1);
  });

  it('shames a label that flees or does not answer in 2 weeks, unless the challenger is bigger', () => {
    const { world, a, b, artA, artB } = setup();
    applyAction(world, 'u1', { type: 'duel', targetLabelId: b.id, artistId: artA.id, week: world.tick + 4 });
    const repB = b.reputation;
    applyAction(world, 'u2', { type: 'duel_answer', duelId: world.duels![0]!.id, accept: false, artistId: null });
    expect(world.duels![0]!.status).toBe('fled');
    expect(b.reputation).toBeCloseTo(Math.max(0, repB - WARS.fleeReputation));
    expect(b.stats.duelFled).toBe(1);
    expect(world.marketNews!.some((n) => n.text.includes('a fui le duel'))).toBe(true);
    // No answer: counts as a refusal. A smaller label keeps its honour.
    a.tier = 2;
    applyAction(world, 'u1', { type: 'duel', targetLabelId: b.id, artistId: artA.id, week: world.tick + 5 });
    const rep2 = b.reputation;
    runTick(world);
    runTick(world);
    expect(world.duels!.find((d) => d.askedTick === world.tick - 2)!.status).toBe('fled');
    expect(b.reputation).toBeGreaterThanOrEqual(rep2 - 0.5);
    expect(b.stats.duelFled).toBe(1);
    expect(artB.id).toBeTruthy();
  });
});

describe('coopérations : alliés, ennemis et renflouement', () => {
  const setup = () => {
    const world = createWorld(42);
    for (const u of ['u1', 'u2', 'u3', 'u4']) {
      applyAction(world, u, { type: 'found', name: `Label ${u}` });
      applyAction(world, u, { type: 'tuto', move: 'skip' });
    }
    world.lastServerEvents = [...SERVER_IDS];
    const [a, b, c, d] = ['u1', 'u2', 'u3', 'u4'].map((u) => Object.values(world.labels).find((l) => l.ownerId === u)!);
    return { world, a: a!, b: b!, c: c!, d: d! };
  };

  it('makes allies when both agree, at most 2, and forbids attacks between them', () => {
    const { world, a, b, c, d } = setup();
    applyAction(world, 'u1', { type: 'ally_ask', targetLabelId: b.id });
    const offer = relationsView(world, b).offersIn[0]!;
    applyAction(world, 'u2', { type: 'ally_answer', offerId: offer.id, accept: true });
    expect(a.allies).toEqual([b.id]);
    expect(b.allies).toEqual([a.id]);
    expect(() => applyAction(world, 'u1', { type: 'enemy_add', labelId: b.id })).toThrow(/allié/);
    applyAction(world, 'u1', { type: 'ally_ask', targetLabelId: c.id });
    applyAction(world, 'u3', { type: 'ally_answer', offerId: relationsView(world, c).offersIn[0]!.id, accept: true });
    expect(() => applyAction(world, 'u1', { type: 'ally_ask', targetLabelId: d.id })).toThrow(/2 alliés/);
    // Breaking: once a season.
    applyAction(world, 'u1', { type: 'ally_break', labelId: c.id });
    expect(c.allies).toEqual([]);
    expect(() => applyAction(world, 'u1', { type: 'ally_break', labelId: b.id })).toThrow(/cette saison/);
    expect(buildView(world, 'u1').labels.find((l) => l.id === a.id)!.allies).toEqual([b.name]);
  });

  it('lets one declare 2 enemies alone, attack only them among players, with 25 % more', () => {
    const { world, a, b, c, d } = setup();
    const artA = rosterOf(world, a.id)[0]!;
    expect(() => applyAction(world, 'u1', { type: 'clash', targetLabelId: b.id, artistId: artA.id })).toThrow(/ennemi/);
    expect(buildView(world, 'u1').rivals.some((r) => r.player)).toBe(false);
    applyAction(world, 'u1', { type: 'enemy_add', labelId: b.id });
    applyAction(world, 'u1', { type: 'enemy_add', labelId: c.id });
    expect(() => applyAction(world, 'u1', { type: 'enemy_add', labelId: d.id })).toThrow(/2 ennemis/);
    expect(relationsView(world, b).enemyOf.map((e) => e.id)).toEqual([a.id]);
    expect(enemyBoost(world, b.id, a.id)).toBe(COOP.enemyBoost);
    expect(enemyBoost(world, a.id, d.id)).toBe(1);
    expect(buildView(world, 'u1').rivals.filter((r) => r.player).map((r) => r.id).sort()).toEqual([b.id, c.id].sort());
    // b has not declared a: it cannot attack back, but it can still answer.
    expect(() => applyAction(world, 'u2', { type: 'enemy_add', labelId: a.id })).not.toThrow();
    applyAction(world, 'u1', { type: 'enemy_remove', labelId: c.id });
    expect(() => applyAction(world, 'u1', { type: 'enemy_remove', labelId: b.id })).toThrow(/cette saison/);
    // The labels of the game stay free targets.
    const npc = buildView(world, 'u1').rivals.find((r) => !r.player)!;
    expect(() => applyAction(world, 'u1', { type: 'clash', targetLabelId: npc.id, artistId: artA.id })).not.toThrow();
  });

  it('gives money, and lends with a rate paid back a bit each week', () => {
    const { world, a, b } = setup();
    a.cash = 100_000;
    b.cash = -500;
    applyAction(world, 'u1', { type: 'gift', targetLabelId: b.id, amount: 5_000 });
    expect(b.cash).toBe(4_500);
    expect(world.marketNews!.some((n) => n.text.includes('au secours'))).toBe(true);
    applyAction(world, 'u1', { type: 'friend_loan', targetLabelId: b.id, amount: 10_000, rate: 10, weeks: 4 });
    const loan = world.friendLoans![0]!;
    expect(loan).toMatchObject({ status: 'offered', remaining: 11_000, perWeek: 2_750 });
    applyAction(world, 'u2', { type: 'friend_loan_answer', loanId: loan.id, accept: true });
    expect(b.cash).toBe(14_500);
    expect(a.cash).toBe(85_000);
    for (let i = 0; i < 4; i += 1) {
      b.cash = Math.max(b.cash, 50_000);
      runTick(world);
    }
    expect(loan.status).toBe('done');
    expect(loan.remaining).toBe(0);
  });

  it('postpones a part it cannot pay with reputation −1, never between allies, and warns allies in danger', () => {
    const { world, a, b } = setup();
    a.cash = 100_000;
    applyAction(world, 'u1', { type: 'friend_loan', targetLabelId: b.id, amount: 10_000, rate: 0, weeks: 4 });
    applyAction(world, 'u2', { type: 'friend_loan_answer', loanId: world.friendLoans![0]!.id, accept: true });
    const told: Array<[string, string]> = [];
    b.cash = 0;
    let rep = (b.reputation = 50);
    world.tick += 1;
    tickCoop(world, () => {}, (id, t) => told.push([id, t]));
    expect(b.reputation).toBe(rep - COOP.lateReputation);
    expect(world.friendLoans![0]!.late).toBe(1);
    expect(told.some(([id, t]) => id === a.id && t.includes('reporté'))).toBe(true);
    // Allies: no shame, and an alert when the ally is in danger.
    a.allies = [b.id];
    b.allies = [a.id];
    b.cash = -1_000;
    rep = b.reputation;
    world.tick += 1;
    told.length = 0;
    tickCoop(world, () => {}, (id, t) => told.push([id, t]));
    expect(b.reputation).toBe(rep);
    expect(told.some(([id, t]) => id === a.id && t.startsWith('Alerte'))).toBe(true);
  });

  it('gives +2 quality to a featuring with an allied artist', () => {
    const make = (allied: boolean) => {
      const { world, a, b } = setup();
      a.cash = 1_000_000;
      if (allied) a.allies = [b.id];
      const artA = rosterOf(world, a.id)[0]!;
      artA.energy = 100;
      return createSong(world, a.id, {
        artistId: artA.id, title: 'Feat', themeId: 'rupture', beatId: 'lovetrap', featArtistId: rosterOf(world, b.id)[0]!.id,
        levels: { theme: 1, beat: 1, producer: 1, studio: 1 }, producer: producerOfLevel(1, 1),
      }).quality;
    };
    expect(make(true) - make(false)).toBe(COOP.allyQuality);
  });

});

describe('Festival du Serveur', () => {
  const setup = () => {
    const world = createWorld(42);
    for (const u of ['u1', 'u2']) {
      applyAction(world, u, { type: 'found', name: 'Label ' + u });
      applyAction(world, u, { type: 'tuto', move: 'skip' });
    }
    world.lastServerEvents = [...SERVER_IDS];
    const [a, b] = ['u1', 'u2'].map((u) => Object.values(world.labels).find((l) => l.ownerId === u)!);
    // Go to the week the registrations open.
    while (nextFestivalTick(world.tick) - world.tick !== FESTIVAL.openWeeks) runTick(world);
    return { world, a: a!, b: b! };
  };

  it('opens registrations 4 weeks before, every 7 weeks', () => {
    const { world } = setup();
    expect(world.festival?.tick).toBe(nextFestivalTick(world.tick));
    expect(world.festival!.tick % FESTIVAL.every).toBe(0);
    expect(festivalView(world, undefined).open).toBe(true);
  });

  it('takes fees, at most 3 artists per label, small artists only in discovery', () => {
    const { world, a } = setup();
    a.cash = 1_000_000;
    const roster = rosterOf(world, a.id);
    const big = roster[0]!;
    big.fans = 500_000;
    expect(() => applyAction(world, 'u1', { type: 'festival_register', artistId: big.id, stage: 'discovery' })).toThrow(/100 000/);
    const cash = a.cash;
    applyAction(world, 'u1', { type: 'festival_register', artistId: big.id, stage: 'main' });
    expect(a.cash).toBe(cash - FESTIVAL.mainFee * a.tier);
    expect(() => applyAction(world, 'u1', { type: 'festival_register', artistId: big.id, stage: 'main' })).toThrow(/déjà/);
    applyAction(world, 'u1', { type: 'festival_withdraw', artistId: big.id });
    expect(a.cash).toBe(cash);
    // Fill to 3, the 4th is refused.
    const extra = Object.values(world.artists).filter((x) => !contractOf(world, x.id) && x.fans < 50_000).slice(0, 4);
    for (const x of extra) world.contracts.push({ artistId: x.id, labelId: a.id, startTick: world.tick, endTick: world.tick + 100, advance: 0, unrecouped: 0 } as never);
    for (const x of extra.slice(0, 3)) applyAction(world, 'u1', { type: 'festival_register', artistId: x.id, stage: 'discovery' });
    expect(() => applyAction(world, 'u1', { type: 'festival_register', artistId: extra[3]!.id, stage: 'discovery' })).toThrow(/3 artistes/);
  });

  it('holds only the best headliner bid and gives the money back to the outbid', () => {
    const { world, a, b } = setup();
    a.cash = 1_000_000;
    b.cash = 1_000_000;
    const artA = rosterOf(world, a.id)[0]!;
    const artB = rosterOf(world, b.id)[0]!;
    const start = festivalView(world, a).nextHeadBid;
    expect(() => applyAction(world, 'u1', { type: 'festival_bid', artistId: artA.id, amount: start - 1 })).toThrow(/trop basse/);
    applyAction(world, 'u1', { type: 'festival_bid', artistId: artA.id, amount: start });
    expect(a.cash).toBe(1_000_000 - start);
    const next = festivalView(world, b).nextHeadBid;
    expect(next).toBeGreaterThan(start);
    applyAction(world, 'u2', { type: 'festival_bid', artistId: artB.id, amount: next });
    expect(a.cash).toBe(1_000_000);
    expect(b.cash).toBe(1_000_000 - next);
    expect(festivalView(world, a).head).toMatchObject({ artistName: artB.name, mine: false });
  });

  it('plays the show: line-up filled by the game, notes, fees, prize, and cancels a striker', () => {
    const { world, a, b } = setup();
    a.cash = 1_000_000;
    b.cash = 1_000_000;
    const artA = rosterOf(world, a.id)[0]!;
    const artB = rosterOf(world, b.id)[0]!;
    applyAction(world, 'u1', { type: 'festival_bid', artistId: artA.id, amount: festivalView(world, a).nextHeadBid });
    artB.fans = 20_000;
    applyAction(world, 'u2', { type: 'festival_register', artistId: artB.id, stage: 'discovery' });
    const repB = b.reputation;
    artB.onStrike = true;
    artA.energy = 100;
    artA.onStrike = false;
    const show = world.festival!.tick;
    while (world.tick < show) {
      artA.energy = 100;
      artB.morale = 0;
      artB.onStrike = true;
      runTick(world);
    }
    const r = world.festivals!.at(-1)!;
    expect(r.tick).toBe(show);
    expect(r.acts.filter((x) => x.stage === 'head')).toHaveLength(1);
    expect(r.acts.filter((x) => x.stage === 'main')).toHaveLength(FESTIVAL.places.main);
    expect(r.acts.filter((x) => x.stage === 'discovery').length).toBeLessThanOrEqual(FESTIVAL.places.discovery);
    const head = r.acts.find((x) => x.stage === 'head')!;
    expect(head.artistId).toBe(artA.id);
    expect(head.fee).toBeGreaterThan(0);
    expect(head.note).toBeGreaterThan(0);
    expect(r.acts.map((x) => x.stage)[0]).toBe('discovery');
    const cancelled = r.acts.find((x) => x.artistId === artB.id)!;
    expect(cancelled.cancelled).toBe(true);
    expect(b.reputation).toBeLessThanOrEqual(repB - FESTIVAL.cancelReputation + 1);
    expect(r.prize?.labelId).toBe(a.id);
    expect(head.fee).toBeLessThanOrEqual(Math.ceil(world.artists[artA.id]!.fans * FESTIVAL.feePerFan.head));
    expect(world.festival).toBeUndefined();
    expect(buildView(world, 'u1').festival.last?.number).toBe(r.number);
  });

  it('runs with the labels of the game alone when nobody registers', () => {
    const world = createWorld(7);
    world.lastServerEvents = [...SERVER_IDS];
    while (world.tick < FESTIVAL.every) runTick(world);
    expect(world.festivals?.length).toBe(1);
    expect(world.festivals![0]!.acts.length).toBeGreaterThan(0);
    expect(runFestival).toBeTypeOf('function');
  });
});
