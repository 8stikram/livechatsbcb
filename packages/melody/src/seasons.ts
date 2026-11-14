// Seasons (docs/melody-tycoon/01-piliers-boucles.md, 1.6 and 1.7): 28 weeks. At the start each label is offered
// three goals and picks two. At the end: final ranking, trophies, small rewards. Everything is kept (labels,
// artists, cash); only the season counters and the goals start again.
import { generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { debtOf, fansOf, ranking, rosterOf } from './economy.ts';
import { clamp, rngFor } from './rng.ts';
import type { Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export const SEASONS = {
  offered: 3,
  picks: 2,
  /** Weeks to pick the goals; after that the game takes the first two. */
  pickTicks: 4,
  /** Reputation for the first three labels. */
  podiumReputation: [3, 2, 1],
  /** A hand for the last label, when there are at least two. */
  lastPrize: 10_000,
  trophyReputation: 2,
  trophyHype: 10,
  /** The "révélation" trophy is for artists who started the season under this many fans. */
  newcomerMaxFans: 50_000,
  /** Past seasons kept in the world. */
  keep: 12,
} as const;

export type GoalId =
  | 'genre50' | 'top100' | 'top10' | 'number1' | 'no_debt' | 'double_fans' | 'project' | 'album75'
  | 'tier_up' | 'clash_win' | 'tour' | 'releases' | 'streams' | 'sign60' | 'sign70' | 'sign80' | 'feat';

/** Where a label stood when its season started (or when it joined). */
interface Snapshot {
  tick: number;
  fans: number;
  tier: number;
  top50Genre: number;
  top100: number;
  top10: number;
  numberOnes: number;
  clashWins: number;
  roster: string[];
  streamsTarget: number;
}

export interface SeasonLabel {
  start: Snapshot;
  offered: GoalId[];
  /** Null until the label picks (or the game picks for it). */
  picked: GoalId[] | null;
  /** Goals reached so far: once reached, a goal stays reached. */
  done: GoalId[];
  streams: number;
}

export interface SeasonState {
  number: number;
  startTick: number;
  labels: Record<string, SeasonLabel>;
  artistStreams: Record<string, number>;
  fansAtStart: Record<string, number>;
}

export type TrophyKind = 'label' | 'song' | 'project' | 'artist' | 'newcomer';

export const TROPHY_NAMES: Record<TrophyKind, string> = {
  label: 'Label de la saison',
  song: 'Son de la saison',
  project: 'Projet de la saison',
  artist: 'Artiste de la saison',
  newcomer: 'Révélation de la saison',
};

export interface SeasonResult {
  number: number;
  endTick: number;
  ranking: Array<{ labelId: string; name: string; score: number; place: number }>;
  trophies: Array<{ kind: TrophyKind; labelId: string; labelName: string; winner: string; detail: string }>;
  /** What each label got out of the season. */
  labels: Record<string, { place: number; goals: Array<{ id: GoalId; text: string; done: boolean; reputation: number; cash: number }>; reputation: number; cash: number }>;
}

export interface Seasons {
  current: SeasonState;
  history: SeasonResult[];
  /** Last season whose ceremony each label has watched. */
  seen: Record<string, number>;
}

interface Ctx {
  world: World;
  label: Label;
  season: SeasonState;
  mine: SeasonLabel;
}

interface GoalDef {
  text: (start: Snapshot) => string;
  reputation: number;
  /** Cash for a Label Maison; multiplied by the tier. */
  cash: number;
  minTier?: number;
  maxTier?: number;
  /** Goals of the same family are never offered together. */
  family?: string;
  /** Judged on the last day only. */
  atEnd?: boolean;
  check: (ctx: Ctx) => boolean;
  progress?: (ctx: Ctx) => string;
}

const fr = (value: number): string => Math.round(value).toLocaleString('fr-FR');

const outThisSeason = ({ world, label, season }: Ctx) =>
  world.songs.filter((s) => s.labelId === label.id && s.state === 'released' && (s.releaseTick ?? 0) > season.startTick);

const projectsThisSeason = ({ world, label, season }: Ctx) =>
  (world.projects ?? []).filter((p) => p.labelId === label.id && p.state === 'released' && p.releaseTick > season.startTick);

const signed = (ctx: Ctx, rating: number): boolean =>
  rosterOf(ctx.world, ctx.label.id).some((a) => !ctx.mine.start.roster.includes(a.id) && generalRating(a) >= rating);

const fansTarget = (start: Snapshot): number => 2 * Math.max(500, start.fans);

const GOALS: Record<GoalId, GoalDef> = {
  genre50: { text: () => 'Placer un son dans un top 50 de genre', reputation: 1, cash: 1_000, family: 'chart', check: (c) => c.label.stats.top50Genre > c.mine.start.top50Genre },
  top100: { text: () => 'Placer un son dans le top 100 global', reputation: 2, cash: 2_500, family: 'chart', check: (c) => c.label.stats.top100Global > c.mine.start.top100 },
  top10: { text: () => 'Placer un son dans le top 10 global', reputation: 3, cash: 6_000, family: 'chart', minTier: 2, check: (c) => c.label.stats.top10Global > c.mine.start.top10 },
  number1: { text: () => 'Décrocher un n°1 global', reputation: 3, cash: 10_000, family: 'chart', minTier: 3, check: (c) => c.label.stats.numberOnes > c.mine.start.numberOnes },
  no_debt: {
    text: () => 'Finir la saison sans dette',
    reputation: 1,
    cash: 1_500,
    atEnd: true,
    check: (c) => debtOf(c.world, c.label.id) <= 0,
    progress: (c) => (debtOf(c.world, c.label.id) <= 0 ? 'Pas de dette pour l’instant' : `Dette : ${fr(debtOf(c.world, c.label.id))} €`),
  },
  double_fans: {
    text: (start) => `Atteindre ${fr(fansTarget(start))} fans`,
    reputation: 2,
    cash: 2_500,
    check: (c) => fansOf(c.world, c.label.id) >= fansTarget(c.mine.start),
    progress: (c) => `${fr(fansOf(c.world, c.label.id))} / ${fr(fansTarget(c.mine.start))}`,
  },
  project: { text: () => 'Sortir un EP ou un album', reputation: 1, cash: 1_500, family: 'project', check: (c) => projectsThisSeason(c).length > 0 },
  album75: {
    text: () => 'Sortir un album noté 75 ou plus',
    reputation: 3,
    cash: 6_000,
    family: 'project',
    minTier: 2,
    check: (c) => projectsThisSeason(c).some((p) => p.kind === 'album' && (p.quality ?? 0) >= 75),
  },
  tier_up: { text: () => 'Monter d’un palier', reputation: 2, cash: 3_000, maxTier: 5, check: (c) => c.label.tier > c.mine.start.tier },
  clash_win: { text: () => 'Gagner un clash', reputation: 2, cash: 2_000, check: (c) => (c.label.stats.clashWins ?? 0) > c.mine.start.clashWins },
  tour: {
    text: () => 'Finir une tournée',
    reputation: 2,
    cash: 2_500,
    check: (c) => (c.world.tours ?? []).some((t) => t.labelId === c.label.id && t.state === 'done' && t.updatedTick > Math.max(c.season.startTick, c.mine.start.tick)),
  },
  releases: {
    text: () => 'Sortir 10 sons',
    reputation: 1,
    cash: 1_500,
    check: (c) => outThisSeason(c).length >= 10,
    progress: (c) => `${Math.min(10, outThisSeason(c).length)} / 10`,
  },
  streams: {
    text: (start) => `Faire ${fr(start.streamsTarget)} streams sur la saison`,
    reputation: 2,
    cash: 2_500,
    check: (c) => c.mine.streams >= c.mine.start.streamsTarget,
    progress: (c) => `${fr(c.mine.streams)} / ${fr(c.mine.start.streamsTarget)}`,
  },
  sign60: { text: () => 'Signer un artiste noté 60 ou plus', reputation: 1, cash: 1_500, family: 'sign', maxTier: 2, check: (c) => signed(c, 60) },
  sign70: { text: () => 'Signer un artiste noté 70 ou plus', reputation: 2, cash: 3_000, family: 'sign', minTier: 2, maxTier: 4, check: (c) => signed(c, 70) },
  sign80: { text: () => 'Signer un artiste noté 80 ou plus', reputation: 3, cash: 6_000, family: 'sign', minTier: 4, check: (c) => signed(c, 80) },
  feat: { text: () => 'Sortir un son avec un featuring', reputation: 1, cash: 1_500, check: (c) => outThisSeason(c).some((s) => s.featArtistId !== null) },
};

export const seasonNumber = (tick: number): number => Math.floor(tick / CFG.ticksPerSeason) + 1;

const players = (world: World): Label[] => Object.values(world.labels).filter((l) => l.kind === 'player' && !l.bankrupt);

const round2 = (value: number): number => {
  const digits = Math.max(0, Math.floor(Math.log10(Math.max(1, value))) - 1);
  return Math.round(value / 10 ** digits) * 10 ** digits;
};

const snapshot = (world: World, label: Label): Snapshot => {
  const fans = fansOf(world, label.id);
  return {
    tick: world.tick,
    fans,
    tier: label.tier,
    top50Genre: label.stats.top50Genre,
    top100: label.stats.top100Global,
    top10: label.stats.top10Global,
    numberOnes: label.stats.numberOnes,
    clashWins: label.stats.clashWins ?? 0,
    roster: rosterOf(world, label.id).map((a) => a.id),
    // Scaled to the length of the season (25 streams per fan over 28 weeks).
    streamsTarget: round2(Math.max(50_000, (fans * 25 * CFG.ticksPerSeason) / 28)),
  };
};

const offer = (world: World, label: Label, season: SeasonState, mine: SeasonLabel): GoalId[] => {
  const rng = rngFor(world.seed, season.number, `goals:${label.id}`);
  const ctx: Ctx = { world, label, season, mine };
  const fits = (Object.keys(GOALS) as GoalId[])
    .filter((id) => {
      const goal = GOALS[id];
      if (label.tier < (goal.minTier ?? 1) || label.tier > (goal.maxTier ?? 6)) return false;
      // Nothing that is already won on the first day.
      return goal.atEnd || !goal.check(ctx);
    })
    .map((id) => ({ id, order: rng.next() }))
    .sort((a, b) => a.order - b.order);
  const picked: GoalId[] = [];
  const families = new Set<string>();
  for (const { id } of fits) {
    const family = GOALS[id].family;
    if (family && families.has(family)) continue;
    if (family) families.add(family);
    picked.push(id);
    if (picked.length === SEASONS.offered) break;
  }
  return picked;
};

const openSeason = (world: World, number: number): SeasonState => {
  const season: SeasonState = { number, startTick: (number - 1) * CFG.ticksPerSeason, labels: {}, artistStreams: {}, fansAtStart: {} };
  for (const label of players(world)) joinSeason(world, season, label);
  return season;
};

const joinSeason = (world: World, season: SeasonState, label: Label): SeasonLabel => {
  const existing = season.labels[label.id];
  if (existing) return existing;
  const mine = preview(world, label, season);
  season.labels[label.id] = mine;
  for (const artist of rosterOf(world, label.id)) season.fansAtStart[artist.id] ??= artist.fans;
  return mine;
};

const preview = (world: World, label: Label, season: SeasonState): SeasonLabel => {
  const mine: SeasonLabel = { start: snapshot(world, label), offered: [], picked: null, done: [], streams: 0 };
  mine.offered = offer(world, label, season, mine);
  return mine;
};

/** The seasons of a world, created on the way for worlds saved before they existed. */
export const seasonsOf = (world: World): Seasons => {
  world.seasons ??= { current: openSeason(world, seasonNumber(world.tick)), history: [], seen: {} };
  return world.seasons;
};

/** Makes sure the label has its goals for the season. Called on each of its actions. */
export const enterSeason = (world: World, label: Label): SeasonLabel => joinSeason(world, seasonsOf(world).current, label);

/** The label picks two of its three goals. Once picked, they are locked. */
export const pickGoals = (world: World, label: Label, goals: string[]): void => {
  const mine = enterSeason(world, label);
  if (mine.picked) fail('Tes objectifs de la saison sont déjà choisis.');
  const wanted = Math.min(SEASONS.picks, mine.offered.length);
  const unique = [...new Set(goals)];
  if (unique.length !== wanted || unique.length !== goals.length) fail(`Choisis ${wanted} objectifs.`);
  const picked = unique.map((id) => mine.offered.find((o) => o === id) ?? fail('Cet objectif ne t’est pas proposé.'));
  mine.picked = picked;
};

/** The label has watched the ceremony of the last season. */
export const watchCeremony = (world: World, label: Label): void => {
  const seasons = seasonsOf(world);
  const last = seasons.history.at(-1);
  if (last) seasons.seen[label.id] = last.number;
};

const place = (n: number): string => (n === 1 ? '1er' : `${n}e`);

const closeSeason = (
  world: World,
  seasons: Seasons,
  pay: (labelId: string, amount: number) => void,
  tell: (labelId: string, text: string) => void,
  news: (text: string) => void,
): void => {
  const season = seasons.current;
  const labels = players(world);
  const lines = ranking(world);
  const result: SeasonResult = {
    number: season.number,
    endTick: world.tick,
    ranking: lines.map((line, index) => ({ labelId: line.labelId, name: line.name, score: line.score, place: index + 1 })),
    trophies: [],
    labels: {},
  };
  const ids = new Set(labels.map((l) => l.id));
  const nameOf = (labelId: string): string => world.labels[labelId]?.name ?? '?';
  const trophy = (kind: TrophyKind, labelId: string, winner: string, detail: string, artistId?: string): void => {
    result.trophies.push({ kind, labelId, labelName: nameOf(labelId), winner, detail });
    const artist = artistId ? world.artists[artistId] : undefined;
    if (artist) artist.hype = clamp(artist.hype + SEASONS.trophyHype, 0, 100);
  };

  // The trophies: only between the players' labels.
  const first = lines[0];
  if (first) trophy('label', first.labelId, first.name, `${first.score} points`);
  const songs = world.songs.filter((s) => ids.has(s.labelId) && s.state === 'released' && (s.releaseTick ?? 0) > season.startTick);
  const bestSong = [...songs].sort((a, b) => b.hitScore - a.hitScore || b.streamsTotal - a.streamsTotal)[0];
  if (bestSong) trophy('song', bestSong.labelId, `« ${bestSong.title} »`, `${world.artists[bestSong.artistId]?.name ?? '?'} · ${fr(bestSong.streamsTotal)} streams`, bestSong.artistId);
  const projects = (world.projects ?? []).filter((p) => ids.has(p.labelId) && p.state === 'released' && p.releaseTick > season.startTick);
  const bestProject = [...projects].sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))[0];
  if (bestProject) trophy('project', bestProject.labelId, `« ${bestProject.title} »`, `${world.artists[bestProject.artistId]?.name ?? '?'} · note ${bestProject.quality ?? 0}`, bestProject.artistId);
  const roster = labels.flatMap((l) => rosterOf(world, l.id).map((artist) => ({ artist, labelId: l.id })));
  const topArtist = roster
    .map((r) => ({ ...r, streams: season.artistStreams[r.artist.id] ?? 0 }))
    .filter((r) => r.streams > 0)
    .sort((a, b) => b.streams - a.streams)[0];
  if (topArtist) trophy('artist', topArtist.labelId, topArtist.artist.name, `${fr(topArtist.streams)} streams sur la saison`, topArtist.artist.id);
  const newcomer = roster
    .map((r) => ({ ...r, before: season.fansAtStart[r.artist.id] ?? r.artist.fans }))
    .filter((r) => r.before < SEASONS.newcomerMaxFans && r.artist.fans > r.before)
    .sort((a, b) => b.artist.fans - b.before - (a.artist.fans - a.before))[0];
  if (newcomer) trophy('newcomer', newcomer.labelId, newcomer.artist.name, `+${fr(newcomer.artist.fans - newcomer.before)} fans`, newcomer.artist.id);

  // What each label takes home.
  for (const label of labels) {
    const mine = joinSeason(world, season, label);
    const ctx: Ctx = { world, label, season, mine };
    const rank = result.ranking.find((r) => r.labelId === label.id)?.place ?? lines.length;
    let reputation = 0;
    let cash = 0;
    tell(label.id, `Saison ${season.number} terminée : tu finis ${place(rank)} sur ${lines.length}.`);
    const goals = (mine.picked ?? []).map((id) => {
      const goal = GOALS[id];
      const done = goal.atEnd ? goal.check(ctx) : mine.done.includes(id) || goal.check(ctx);
      const prize = goal.cash * label.tier;
      if (done) {
        reputation += goal.reputation;
        cash += prize;
        tell(label.id, `Objectif tenu : « ${goal.text(mine.start)} » (+${goal.reputation} de réputation, +${fr(prize)} €).`);
      }
      return { id, text: goal.text(mine.start), done, reputation: goal.reputation, cash: prize };
    });
    reputation += SEASONS.podiumReputation[rank - 1] ?? 0;
    const won = result.trophies.filter((t) => t.labelId === label.id);
    for (const t of won) {
      if (t.kind !== 'label') reputation += SEASONS.trophyReputation;
      tell(label.id, `Trophée « ${TROPHY_NAMES[t.kind]} » : ${t.winner}.`);
    }
    if (lines.length >= 2 && rank === lines.length) {
      cash += SEASONS.lastPrize;
      tell(label.id, `Coup de pouce au dernier du classement : +${fr(SEASONS.lastPrize)} €.`);
    }
    label.reputation = clamp(label.reputation + reputation, 0, 100);
    if (cash > 0) pay(label.id, cash);
    result.labels[label.id] = { place: rank, goals, reputation, cash };
  }
  if (first) news(`Fin de la saison ${season.number} : ${first.name} est le label de la saison.`);
  seasons.history.push(result);
  if (seasons.history.length > SEASONS.keep) seasons.history.splice(0, seasons.history.length - SEASONS.keep);
  seasons.current = openSeason(world, season.number + 1);
};

/** Weekly, at the end of the tick: counts the season's streams, notes the goals reached, and closes the season on its last week. */
export const tickSeason = (
  world: World,
  pay: (labelId: string, amount: number) => void,
  tell: (labelId: string, text: string) => void,
  news: (text: string) => void,
): void => {
  const seasons = seasonsOf(world);
  const season = seasons.current;
  for (const label of players(world)) {
    const mine = joinSeason(world, season, label);
    for (const artist of rosterOf(world, label.id)) season.fansAtStart[artist.id] ??= artist.fans;
    for (const song of world.songs) {
      if (song.labelId !== label.id || song.state !== 'released') continue;
      mine.streams += song.streamsLast;
      season.artistStreams[song.artistId] = (season.artistStreams[song.artistId] ?? 0) + song.streamsLast;
    }
    if (!mine.picked && world.tick - mine.start.tick >= SEASONS.pickTicks) {
      mine.picked = mine.offered.slice(0, SEASONS.picks);
      if (mine.picked.length > 0) tell(label.id, 'Tu n’avais pas choisi tes objectifs de saison : le jeu a pris les deux premiers.');
    }
    const ctx: Ctx = { world, label, season, mine };
    for (const id of mine.picked ?? []) {
      const goal = GOALS[id];
      if (goal.atEnd || mine.done.includes(id) || !goal.check(ctx)) continue;
      mine.done.push(id);
      tell(label.id, `Objectif de saison atteint : « ${goal.text(mine.start)} ». La récompense tombe à la fin de la saison.`);
    }
  }
  if (world.tick > 0 && world.tick % CFG.ticksPerSeason === 0 && season.number < seasonNumber(world.tick)) closeSeason(world, seasons, pay, tell, news);
};

export interface GoalView {
  id: GoalId;
  text: string;
  reputation: number;
  cash: number;
  chosen: boolean;
  done: boolean;
  /** Judged on the last day only. */
  atEnd: boolean;
  progress: string | null;
}

export interface SeasonView {
  number: number;
  week: number;
  weeksLeft: number;
  goals: GoalView[];
  picked: boolean;
  /** Goals to pick. */
  picks: number;
  /** Weeks left to pick before the game does it. */
  pickWeeksLeft: number;
  streams: number;
  /** The last season finished, and whether this label has watched its ceremony. */
  last: SeasonResult | null;
  unseen: boolean;
}

/** What a label sees of the season. Changes nothing in the world. */
export const seasonView = (world: World, label: Label | undefined): SeasonView => {
  const number = seasonNumber(world.tick);
  const week = (world.tick % CFG.ticksPerSeason) + 1;
  const seasons = world.seasons;
  // A label that has not played since the season opened sees the goals it will get, without the world changing.
  const season: SeasonState = seasons?.current ?? { number, startTick: (number - 1) * CFG.ticksPerSeason, labels: {}, artistStreams: {}, fansAtStart: {} };
  const mine = label ? (season.labels[label.id] ?? preview(world, label, season)) : undefined;
  const last = seasons?.history.at(-1) ?? null;
  const base = { number, week, weeksLeft: CFG.ticksPerSeason - week + 1, last, unseen: !!(label && last && last.labels[label.id] && (seasons?.seen[label.id] ?? 0) < last.number) };
  if (!label || !mine) return { ...base, goals: [], picked: false, picks: SEASONS.picks, pickWeeksLeft: SEASONS.pickTicks, streams: 0 };
  const ctx: Ctx = { world, label, season, mine };
  return {
    ...base,
    goals: mine.offered.map((id) => {
      const goal = GOALS[id];
      return {
        id,
        text: goal.text(mine.start),
        reputation: goal.reputation,
        cash: goal.cash * label.tier,
        chosen: mine.picked?.includes(id) ?? false,
        done: !goal.atEnd && (mine.done.includes(id) || goal.check(ctx)),
        atEnd: goal.atEnd ?? false,
        progress: goal.progress ? goal.progress(ctx) : null,
      };
    }),
    picked: mine.picked !== null,
    picks: Math.min(SEASONS.picks, mine.offered.length),
    pickWeeksLeft: Math.max(0, SEASONS.pickTicks - (world.tick - mine.start.tick)),
    streams: mine.streams,
  };
};

export interface Honour {
  season: number;
  place: number;
  trophies: TrophyKind[];
}

/** Past seasons of a label: its places and its trophies. */
export const honoursOf = (world: World, labelId: string): Honour[] =>
  (world.seasons?.history ?? [])
    .filter((r) => r.labels[labelId])
    .map((r) => ({ season: r.number, place: r.labels[labelId]!.place, trophies: r.trophies.filter((t) => t.labelId === labelId).map((t) => t.kind) }));
