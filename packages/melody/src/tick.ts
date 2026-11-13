// One tick = one game week for the whole world (docs/melody-tycoon/01-piliers-boucles.md §1.2).
import { FAMILY_WEIGHTS, energyRegen, generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { BEATS, GENRES, THEMES, beatById } from './data/content.ts';
import { canTierUp, contractOf, debtOf, netWorth, playGig, rosterOf } from './economy.ts';
import { tickAcademy } from './academy.ts';
import { tickDeals } from './featdeals.ts';
import { tickTransfers } from './transfers.ts';
import { tickAuctions } from './auctions.ts';
import { returnLoans, shareLoan, tickLending } from './lending.ts';
import { tickClashes } from './clash.ts';
import { tickProjects } from './projects.ts';
import { ESTATE, tickAssetLoan } from './estate.ts';
import { judgeRelease } from './letdown.ts';
import { lightUp, supportBoost } from './support.ts';
import { tickSeason } from './seasons.ts';
import { coachBoost, crowdBoost, gigEnergy, tickStaff } from './staff.ts';
import { tickMorale } from './morale.ts';
import { afterRelease, profileGrowth, ratingsBefore, tickEvolution } from './evolution.ts';
import { stageBoost, tirelessFactor } from './skills.ts';
import { tickTours } from './tours.ts';
import { cleanTalks } from './negotiation.ts';
import { countryOf, noteCombo } from './craft.ts';
import { firstWeek, releaseWeek } from './release.ts';
import { inventTitle, langOf } from './titles.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import type { Artist, ChartEntry, GenreId, Label, Song, World } from './types.ts';

export interface ReleaseReport {
  songId: string;
  labelId: string;
  title: string;
  artistName: string;
  streams: number;
  hitScore: number;
  newFans: number;
  viral: boolean;
  quality: number;
  surprise: 'boom' | 'flop' | null;
  combo: 'secret' | 'perfect' | null;
}

export interface LabelReport {
  labelId: string;
  income: number;
  costs: number;
  cash: number;
  events: string[];
}

export interface TickReport {
  tick: number;
  releases: ReleaseReport[];
  labels: Record<string, LabelReport>;
}

const rollTrends = (world: World, rng: Rng): void => {
  const shuffle = <T,>(items: readonly T[]): T[] => [...items].sort(() => rng.next() - 0.5);
  const beats = shuffle(BEATS);
  const themes = shuffle(THEMES);
  for (const beat of BEATS) world.trends.beats[beat.id] = Math.round(clamp((world.trends.beats[beat.id] ?? 50) * 0.5 + 25 + rng.range(-8, 8), 20, 80));
  for (const theme of THEMES) world.trends.themes[theme.id] = Math.round(clamp((world.trends.themes[theme.id] ?? 50) * 0.5 + 25 + rng.range(-8, 8), 20, 80));
  for (const beat of beats.slice(0, 3)) world.trends.beats[beat.id] = Math.round(rng.range(70, 95));
  for (const beat of beats.slice(3, 5)) world.trends.beats[beat.id] = Math.round(rng.range(15, 35));
  for (const theme of themes.slice(0, 2)) world.trends.themes[theme.id] = Math.round(rng.range(70, 95));
  for (const theme of themes.slice(2, 3)) world.trends.themes[theme.id] = Math.round(rng.range(15, 35));
};

const songGenre = (song: Song, artist: Artist): GenreId => beatById(song.beatId).genres[0] ?? artist.genre;

/** Releases of the artists the players do not manage: they keep the charts alive. */
const npcReleases = (world: World, rng: Rng): void => {
  const pool = Object.values(world.artists).filter((artist) => {
    const contract = contractOf(world, artist.id);
    if (contract) return world.labels[contract.labelId]?.kind === 'npc';
    return artist.real;
  });
  const chance = Math.min(0.14, CFG.npc.releasesPerTick / Math.max(1, pool.length));
  for (const artist of pool) {
    if (!rng.chance(chance)) continue;
    const quality = clamp(generalRating(artist) - 8 + rng.range(-8, 8), 30, 97);
    const week = firstWeek(
      { quality, fans: artist.fans, featFans: 0, hype: artist.hype, fit: rng.range(0.85, 1.2), marketingReach: artist.fans * 0.3, rivals: 0 },
      rng,
    );
    world.npcSongs.push({
      title: inventTitle(rng, langOf(countryOf(artist), artist.genre), artist.genre),
      artistId: artist.id,
      artistName: artist.name,
      labelId: contractOf(world, artist.id)?.labelId ?? 'inde',
      genre: artist.genre,
      streams: week.streams,
      decay: week.decay,
      weeks: 0,
    });
  }
};

const report = (reports: Record<string, LabelReport>, label: Label): LabelReport =>
  (reports[label.id] ??= { labelId: label.id, income: 0, costs: 0, cash: label.cash, events: [] });

const earn = (reports: Record<string, LabelReport>, label: Label, amount: number): void => {
  label.cash += amount;
  if (amount > 0) label.stats.revenueTotal += amount;
  const line = report(reports, label);
  if (amount >= 0) line.income += amount;
  else line.costs -= amount;
};

const growArtist = (artist: Artist, active: boolean, rng: Rng, coach = 1): void => {
  const gen = generalRating(artist);
  const margin = clamp((artist.potential - gen) / 20, 0.1, 1);
  artist.growth += 0.25 * (active ? 1 : 0) * clamp(artist.morale / 60, 0.2, 1.5) * margin * coach;
  while (artist.growth >= 1) {
    artist.growth -= 1;
    const weights = FAMILY_WEIGHTS[GENRES[artist.genre].family];
    const keys = (Object.keys(weights) as (keyof typeof weights)[]).filter((k) => weights[k] > 0);
    const key = rng.pick(keys);
    artist.attrs[key] = Math.min(99, artist.attrs[key] + 1);
  }
};

export const runTick = (world: World): TickReport => {
  world.tick += 1;
  const tick = world.tick;
  const rng = rngFor(world.seed, tick, 'tick');
  const reports: Record<string, LabelReport> = {};
  const releases: ReleaseReport[] = [];
  const players = Object.values(world.labels).filter((l) => l.kind === 'player' && !l.bankrupt);
  const activeArtists = new Set<string>();
  // Ratings before the week, to tell each label how its artists moved.
  const before = ratingsBefore(world);

  cleanTalks(world);

  if (tick % CFG.ticksPerMonth === 1) rollTrends(world, rngFor(world.seed, tick, 'trends'));

  // 1. Songs already out lose listeners; background releases too.
  for (const song of world.songs) {
    if (song.state !== 'released') continue;
    const artist = world.artists[song.artistId];
    const floor = artist ? artist.fans * CFG.release.catalogFloor * (song.quality / 70) : 0;
    song.streamsLast = Math.round(Math.max(song.streamsLast * song.decay, floor));
    song.streamsTotal += song.streamsLast;
    song.weeksOut += 1;
    if (song.history) {
      song.history.push(song.streamsLast);
      if (song.history.length > 12) song.history.shift();
    }
  }
  for (const npc of world.npcSongs) {
    npc.streams = Math.round(npc.streams * npc.decay);
    npc.weeks += 1;
  }
  world.npcSongs = world.npcSongs.filter((n) => n.streams >= CFG.npc.keepAboveStreams);
  npcReleases(world, rngFor(world.seed, tick, 'npc'));

  // 2. This week's releases.
  const due = world.songs.filter((s) => s.state === 'scheduled' && s.releaseTick === tick);
  for (const song of due) {
    const artist = world.artists[song.artistId];
    const label = world.labels[song.labelId];
    if (!artist || !label) continue;
    const feat = song.featArtistId ? world.artists[song.featArtistId] : undefined;
    const genre = songGenre(song, artist);
    // The promo that was paid weeks ago meets the artist's buzz of today.
    const rivals =
      due.filter((o) => o !== song && (world.artists[o.artistId]?.fans ?? 0) > artist.fans && songGenre(o, artist) === genre).length +
      world.npcSongs.filter((n) => n.weeks === 0 && n.genre === genre && n.streams > artist.fans * 6).length;
    const { week: raw, promo } = releaseWeek(world, song, artist, tick, rivals);
    // A track of an EP or an album: the fans listen to the whole project the first week.
    const week = song.boost ? { ...raw, streams: Math.round(raw.streams * song.boost), newFans: Math.round(raw.newFans * song.boost) } : raw;
    delete song.boost;
    song.promo = promo;
    song.marketingReach = promo.reduce((sum, p) => sum + p.views, 0) || song.marketingReach;
    song.state = 'released';
    song.history = [week.streams];
    song.streamsLast = week.streams;
    song.streamsTotal = week.streams;
    song.decay = week.decay;
    song.hitScore = week.hitScore;
    song.weeksOut = 0;
    artist.fans += week.newFans + (feat ? Math.round(feat.fans * 0.02 * Math.min(1, week.streams / Math.max(1, feat.fans))) : 0);
    // The guest gets a share of the new listeners too.
    if (feat) feat.fans += Math.round(week.newFans * 0.3);
    artist.hype = clamp(artist.hype + week.hypeChange, 0, 100);
    artist.lastReleaseTick = tick;
    artist.lastActiveTick = tick;
    activeArtists.add(artist.id);
    // Evolution: the fit with a new genre, the streak toward a higher ceiling, the late bloom.
    for (const text of afterRelease(world, artist, song)) if (label.kind === 'player') report(reports, label).events.push(text);
    // Fans tired of weak songs: a track of an EP or an album is judged with its project.
    if (!song.projectId) judgeRelease(world, label, artist, song.quality, `« ${song.title} »`, (text) => report(reports, label).events.push(text), tick);
    if (week.hitScore >= 50) artist.morale = clamp(artist.morale + CFG.morale.hit, 0, 100);
    if (week.hitScore < 25) {
      artist.morale = clamp(artist.morale + CFG.morale.flop, 0, 100);
      artist.fans = Math.round(artist.fans * (1 - CFG.fans.flopLoss));
      if (song.marketingCost > 20_000) label.reputation -= 1;
    }
    // The more famous the label, the harder each new point of reputation.
    const room = (100 - label.reputation) / 100;
    if (week.hitScore >= 90) label.reputation += 2 * room;
    else if (week.hitScore >= 70) label.reputation += 0.5 * room;
    else if (week.hitScore >= 50) label.reputation += 0.2 * room;
    if (week.hitScore >= 70) artist.superfanRate = Math.min(0.05, artist.superfanRate + 0.001);
    // A combo found with this song goes in the label's notebook.
    if (song.combo && label.kind === 'player') {
      const added = noteCombo(world, label.id, { themeId: song.themeId, beatId: song.beatId, kind: song.combo, season: Math.floor(tick / CFG.ticksPerSeason), songTitle: song.title });
      if (added) report(reports, label).events.push(song.combo === 'secret' ? `Combo secret trouvé avec « ${song.title} » : noté dans ton carnet.` : `Combo parfait avec « ${song.title} » : noté dans ton carnet.`);
    }
    if (song.surprise === 'boom') report(reports, label).events.push(`« ${song.title} » sonne bien mieux que prévu !`);
    if (song.surprise === 'flop') report(reports, label).events.push(`« ${song.title} » est moins bon que prévu.`);
    releases.push({
      songId: song.id,
      labelId: label.id,
      title: song.title,
      artistName: artist.name,
      streams: week.streams,
      hitScore: week.hitScore,
      newFans: week.newFans,
      viral: week.viral || promo.some((p) => p.viral),
      quality: song.quality,
      surprise: song.surprise ?? null,
      combo: song.combo ?? null,
    });
  }

  // 3. Charts.
  interface Line { title: string; artistName: string; labelId: string; streams: number; genre: GenreId; song: Song | null }
  const lines: Line[] = [];
  for (const song of world.songs) {
    const artist = world.artists[song.artistId];
    if (song.state !== 'released' || !artist) continue;
    lines.push({ title: song.title, artistName: artist.name, labelId: song.labelId, streams: song.streamsLast, genre: songGenre(song, artist), song });
  }
  for (const npc of world.npcSongs) {
    lines.push({ title: npc.title ?? `${npc.artistName} — single`, artistName: npc.artistName, labelId: npc.labelId, streams: npc.streams, genre: npc.genre, song: null });
  }
  lines.sort((a, b) => b.streams - a.streams);
  const toEntries = (list: Line[], size: number): ChartEntry[] =>
    list.slice(0, size).map((l, i) => ({
      rank: i + 1,
      title: l.title,
      artistName: l.artistName,
      labelId: l.labelId,
      streams: l.streams,
      songId: l.song?.id ?? null,
      player: world.labels[l.labelId]?.kind === 'player',
      cover: l.song?.cover ?? false,
    }));
  const globalLines = lines.filter((l) => l.streams >= CFG.charts.globalMin);
  world.charts.global = toEntries(globalLines, 100);
  world.charts.genres = {};
  for (const genre of Object.keys(GENRES) as GenreId[]) {
    const genreLines = lines.filter((l) => l.genre === genre && l.streams >= CFG.charts.genreMin);
    world.charts.genres[genre] = toEntries(genreLines, 50);
    genreLines.slice(0, 50).forEach((line, index) => {
      const song = line.song;
      const label = song ? world.labels[song.labelId] : undefined;
      if (!song || !label) return;
      if (song.peakGenre === null) {
        label.stats.top50Genre += 1;
        report(reports, label).events.push(`« ${song.title} » entre ${index + 1}e du chart ${GENRES[genre].name}.`);
      }
      song.peakGenre = Math.min(song.peakGenre ?? 999, index + 1);
      const artist = world.artists[song.artistId];
      if (artist && index < 10) artist.hype = clamp(artist.hype + CFG.hype.top10Genre, 0, 100);
    });
  }
  globalLines.slice(0, 100).forEach((line, index) => {
    const song = line.song;
    const label = song ? world.labels[song.labelId] : undefined;
    if (!song || !label) return;
    const rank = index + 1;
    const before = song.peakGlobal;
    if (before === null) {
      label.stats.top100Global += 1;
      report(reports, label).events.push(`« ${song.title} » entre dans le top 100 global (${rank}e).`);
    }
    if (rank <= 10 && (before === null || before > 10)) label.stats.top10Global += 1;
    if (rank === 1 && before !== 1) {
      label.stats.numberOnes += 1;
      label.reputation += (3 * (100 - label.reputation)) / 100;
      const star = world.artists[song.artistId];
      if (star) lightUp(world, label.id, star, `n°1 du top global avec « ${song.title} »`, (_, text) => report(reports, label).events.push(text));
    }
    song.peakGlobal = Math.min(before ?? 999, rank);
    const artist = world.artists[song.artistId];
    if (artist && rank <= 10) artist.hype = clamp(artist.hype + CFG.hype.top10Global, 0, 100);
  });

  const toLender = (lenderId: string, cut: number): void => {
    const lender = world.labels[lenderId];
    if (lender && !lender.bankrupt) earn(reports, lender, cut);
  };

  // 4. Streaming money. The artist's royalties first repay his advance.
  for (const song of world.songs) {
    const label = world.labels[song.labelId];
    if (song.state !== 'released' || song.seized || !label || label.kind !== 'player' || label.bankrupt) continue;
    const gross = song.streamsLast * CFG.release.payPerStream;
    const contract = contractOf(world, song.artistId);
    let paidToArtist = 0;
    if (contract && contract.labelId === label.id) {
      const share = gross * contract.royaltyRate;
      const recouped = Math.min(contract.unrecouped, share);
      contract.unrecouped -= recouped;
      paidToArtist = share - recouped;
    }
    // A borrowed artist: 30 % of what his songs made here bring goes back to his label.
    const kept = shareLoan(world, song.artistId, label.id, gross - paidToArtist, (lenderId, cut) => toLender(lenderId, cut), song.createdTick);
    earn(reports, label, kept);
  }

  // 5. Concerts booked for this week.
  const gigsPlayed = new Map<string, number>();
  for (const gig of world.gigs.filter((g) => g.tick === tick)) {
    const artist = world.artists[gig.artistId];
    const label = world.labels[gig.labelId];
    const tiring = Math.round(gigEnergy(world, label?.id ?? '') * (artist ? tirelessFactor(artist) : 1));
    if (!artist || !label || label.bankrupt || artist.energy < tiring) continue;
    const already = gigsPlayed.get(artist.id) ?? 0;
    gigsPlayed.set(artist.id, already + 1);
    const result = playGig(artist, already, crowdBoost(world, label.id) * stageBoost(artist), label.tier);
    artist.energy -= tiring;
    artist.fans += Math.round(result.audience * CFG.fans.gigGain);
    artist.lastActiveTick = tick;
    activeArtists.add(artist.id);
    if (result.fill >= 0.8) artist.morale = clamp(artist.morale + CFG.morale.gigFull, 0, 100);
    earn(reports, label, result.profit > 0 ? shareLoan(world, artist.id, label.id, result.profit * CFG.live.labelShare, toLender) : result.profit);
  }
  world.gigs = world.gigs.filter((g) => g.tick > tick);

  // 5 bis. Tours on the road.
  const touring = tickTours(
    world,
    (labelId, amount, artistId) => {
      const label = world.labels[labelId];
      if (label) earn(reports, label, artistId ? shareLoan(world, artistId, labelId, amount, toLender) : amount);
    },
    (labelId, text) => {
      const label = world.labels[labelId];
      if (label && label.kind === 'player' && !label.bankrupt) report(reports, label).events.push(text);
    },
  );
  for (const id of touring) activeArtists.add(id);

  // 6. Costs, loans, artists, bankruptcy, tiers.
  for (const label of players) {
    const roster = rosterOf(world, label.id);
    earn(reports, label, -(CFG.tiers.fixedCosts[label.tier - 1] ?? 200));
    for (const contract of world.contracts) {
      if (contract.labelId === label.id && contract.endTick > tick && contract.weeklyAllowance > 0) earn(reports, label, -contract.weeklyAllowance);
    }
    for (const loan of world.loans.filter((l) => l.labelId === label.id)) {
      const interest = loan.remaining * loan.ratePerTick;
      const capital = loan.remaining / Math.max(1, loan.ticksLeft);
      loan.remaining -= capital;
      loan.ticksLeft -= 1;
      earn(reports, label, -(capital + interest));
    }
    world.loans = world.loans.filter((l) => l.labelId !== label.id || (l.ticksLeft > 0 && l.remaining > 0.5));
    tickAcademy(world, label, (amount) => earn(reports, label, -amount), (text) => report(reports, label).events.push(text));

    for (const artist of roster) {
      artist.energy = clamp(artist.energy + energyRegen(artist, tick), 0, 100);
      artist.creativeFatigue = Math.max(0, artist.creativeFatigue - CFG.fatigue.recovery);
      artist.hype = clamp(artist.hype * CFG.hype.decay, 0, 100);
      const idle = tick - artist.lastActiveTick;
      if (idle > CFG.hype.idleTicks) artist.hype = Math.max(0, artist.hype - CFG.hype.idlePenalty);
      if (idle > CFG.fans.idleTicks) artist.fans = Math.round(artist.fans * (1 - CFG.fans.idleLoss));
      if (artist.energy < 20) artist.morale = clamp(artist.morale + CFG.morale.lowEnergy, 0, 100);
      growArtist(artist, activeArtists.has(artist.id) || artist.lastActiveTick >= tick - 1, rng, coachBoost(world, label.id, artist.id) * profileGrowth(world, artist) * supportBoost(world, label.id, artist.id, 'grow'));
    }

    // The asset loan: warning, then seizure of songs.
    tickAssetLoan(world, label, (text) => report(reports, label).events.push(text));
    if (label.cash < 0) {
      const emergencies = world.loans.filter((l) => l.labelId === label.id && l.kind === 'emergency').length;
      if (emergencies < CFG.bank.maxEmergency) {
        const amount = -label.cash * 1.1;
        label.cash += amount;
        label.reputation -= 1;
        world.loans.push({ labelId: label.id, kind: 'emergency', remaining: amount, ratePerTick: CFG.bank.emergencyRate, ticksLeft: CFG.bank.emergencyTicks });
        report(reports, label).events.push(`Prêt d'urgence de ${Math.round(amount)} €.`);
      }
    }
    const inDistress = label.cash < 0 || debtOf(world, label.id) > Math.max(0, netWorth(world, label));
    label.distress = inDistress ? label.distress + 1 : Math.max(0, label.distress - 2);
    if (label.distress >= CFG.bank.bankruptcyTicks) {
      // Borrowed artists go home first.
      returnLoans(world, label.id, (labelId, text) => {
        const other = world.labels[labelId];
        if (other && other.kind === 'player' && !other.bankrupt) report(reports, other).events.push(text);
      });
      label.bankrupt = true;
      world.contracts = world.contracts.filter((c) => c.labelId !== label.id);
      world.loans = world.loans.filter((l) => l.labelId !== label.id);
      report(reports, label).events.push('Faillite : le label est remis à zéro.');
    } else if (canTierUp(world, label)) {
      label.tier += 1;
      const name = CFG.tiers.names[label.tier - 1] ?? '';
      for (const artist of roster) artist.morale = clamp(artist.morale + ESTATE.tierMorale, 0, 100);
      label.tierParty = label.tier;
      world.marketNews = [...(world.marketNews ?? []), { tick, text: `${label.name} devient ${name} !` }];
      report(reports, label).events.push(`Le label devient ${name}. Moral +${ESTATE.tierMorale} pour tous tes artistes.`);
    }
    label.reputation = clamp(label.reputation, 0, 100);
    report(reports, label).cash = Math.round(label.cash);
  }

  const tell = (labelId: string, text: string): void => {
    const label = world.labels[labelId];
    if (label && label.kind === 'player' && !label.bankrupt) report(reports, label).events.push(text);
  };
  // The staff: wages, stars, poaching, and a word now and then.
  tickStaff(
    world,
    (labelId, amount) => {
      const label = world.labels[labelId];
      if (label) earn(reports, label, amount);
    },
    tell,
  );
  // Morale: ranks, what each artist expects, what hurts him, and a word from one of them now and then.
  tickMorale(world, tell, (text) => {
    world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }];
  });
  // Evolution: profiles revealed, ground lost when idle, transitions, wishes, and the progress of the week.
  tickEvolution(world, before, tell);
  tickDeals(world, tell);
  tickTransfers(world, tell);
  tickAuctions(world, tell);
  tickLending(
    world,
    (labelId, amount) => {
      const label = world.labels[labelId];
      if (label && !label.bankrupt) earn(reports, label, amount);
    },
    tell,
  );
  tickClashes(world, tell);
  tickProjects(
    world,
    tell,
    (text) => {
      world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }];
    },
    // CD and vinyl sales: an artist on loan shares them with his label, like the rest.
    (labelId, amount, artistId) => {
      const label = world.labels[labelId];
      if (label) earn(reports, label, shareLoan(world, artistId, labelId, amount, toLender));
    },
  );
  // The season: streams counted, goals noted, and on its last week the ranking, the trophies and the rewards.
  tickSeason(
    world,
    (labelId, amount) => {
      const label = world.labels[labelId];
      if (label) earn(reports, label, amount);
    },
    tell,
    (text) => {
      world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }];
    },
  );
  for (const label of players) if (!label.bankrupt) report(reports, label).cash = Math.round(label.cash);
  for (const contract of world.contracts.filter((c) => c.endTick <= tick)) {
    const label = world.labels[contract.labelId];
    const artist = world.artists[contract.artistId];
    if (label && artist && label.kind === 'player' && !label.bankrupt) report(reports, label).events.push(`Le contrat de ${artist.name} est fini : il est libre.`);
  }
  world.contracts = world.contracts.filter((c) => c.endTick > tick);
  if (world.marketNews) world.marketNews = world.marketNews.filter((n) => n.tick > tick - 3).slice(-30);
  return { tick, releases, labels: reports };
};
