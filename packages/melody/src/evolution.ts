// Artist evolution (docs/melody-tycoon/02-artistes-recrutement.md, 2.2 and 2.5): hidden growth profiles,
// losing ground when idle, a ceiling that goes up after very good songs, and changing genre with a transition.
import { FAMILY_WEIGHTS, generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { GENRES } from './data/content.ts';
import { contractOf, rosterOf } from './economy.ts';
import { clamp, hashString, rngFor } from './rng.ts';
import { SKILLS, skillLevel, skillPlus, skillsOf } from './skills.ts';
import { staffOf } from './staff.ts';
import type { Artist, GenreId, Label, Song, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type GrowthProfile = 'early' | 'late' | 'steady' | 'explosive' | 'fragile' | 'bloomer';

export const PROFILES: Record<GrowthProfile, { name: string; text: string; weight: number }> = {
  early: { name: 'Précoce', text: 'Progresse très vite ses 20 premières semaines, puis ralentit.', weight: 15 },
  late: { name: 'Tardif', text: 'Lent au début, puis progresse vite après 20 semaines.', weight: 15 },
  steady: { name: 'Régulier', text: 'Progresse au même rythme toute sa carrière.', weight: 35 },
  explosive: { name: 'Explosif', text: 'Imprévisible : certaines semaines rien, d’autres énorme.', weight: 12 },
  fragile: { name: 'Fragile', text: 'Progresse vite, mais perd ses acquis plus vite quand il ne fait rien.', weight: 12 },
  bloomer: { name: 'Éclosion tardive', text: 'Presque rien… jusqu’à son 6e son noté 65 ou plus : là, il fait un bond.', weight: 11 },
};

export const EVOLUTION = {
  /** Weeks with a player's label before the profile is known (a coach of 3 stars or more sees it at once). */
  revealWeeks: 8,
  revealCoach: 3,
  /** Early and late profiles turn around this many weeks. */
  turn: 20,
  /** Idle this many weeks: −1 on a technical attribute every few weeks, unless the coach follows him. */
  idle: 6,
  every: 3,
  fragileEvery: 2,
  /** Three songs in a row noted this much above his rating: his ceiling goes up by one, six times a season at most. */
  streak: 3,
  streakMargin: 5,
  ceilingPerSeason: 6,
  /** The late bloomer: his sixth song noted 65 or more, and a jump of 4 to 8 points. */
  bloomSongs: 6,
  bloomQuality: 65,
  bloomMin: 4,
  bloomMax: 8,
  /** The rating curve keeps this many weeks. */
  history: 28,
} as const;

export const GENRE_CHANGE = {
  /** × the tier of the label; half price when he asked for it. */
  cost: 3_000,
  weeks: 8,
  fastWeeks: 4,
  /** A coach or a house producer of this many stars makes it faster. */
  fastStars: 3,
  chameleonWeeks: 2,
  /** Fit with the new genre: starts here, then grows with each release. */
  startFit: 0.8,
  fitStep: 0.03,
  maxFit: 1.05,
  /** Fans lost: a neighbour genre, or a far one (a community manager of 3 stars or more halves it). */
  neighbourLoss: 0.03,
  farLoss: [0.08, 0.2] as const,
  /** New listeners for the new genre this many weeks after the transition. */
  audienceWeeks: 8,
  perLabel: 3,
  /** The artist's own wish: chance a week once he has this many releases and enough creativity. */
  wishChance: 0.08,
  wishReleases: 6,
  wishCreativity: 50,
  wishWeeks: 4,
  wished: 10,
  forced: -10,
  refused: -5,
} as const;

const mix = (h: number): number => {
  let x = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
};

/** The growth profile of an artist: hidden, always the same. */
export const profileOf = (artistId: string): GrowthProfile => {
  let roll = mix(hashString(`profile:${artistId}`)) % 100;
  for (const [id, p] of Object.entries(PROFILES) as Array<[GrowthProfile, (typeof PROFILES)[GrowthProfile]]>) {
    if (roll < p.weight) return id;
    roll -= p.weight;
  }
  return 'steady';
};

const seasonOf = (tick: number): number => Math.floor(tick / CFG.ticksPerSeason) + 1;

const starsOf = (world: World, labelId: string, role: 'coach' | 'producer' | 'community'): number =>
  staffOf(world, labelId).find((m) => m.role === role)?.stars ?? 0;

const coachOn = (world: World, labelId: string, artistId: string): boolean => staffOf(world, labelId).some((m) => m.role === 'coach' && m.focusId === artistId);

/** Is his profile known to his label? */
export const profileKnown = (world: World, labelId: string, artist: Artist): boolean =>
  artist.profileKnown === true || (artist.career ?? 0) >= EVOLUTION.revealWeeks || starsOf(world, labelId, 'coach') >= EVOLUTION.revealCoach;

/** How fast he progresses this week because of his profile. */
export const profileGrowth = (world: World, artist: Artist): number => {
  const career = artist.career ?? 0;
  switch (profileOf(artist.id)) {
    case 'early':
      return career < EVOLUTION.turn ? 1.5 : 0.5;
    case 'late':
      return career < EVOLUTION.turn ? 0.7 : 1.4;
    case 'explosive':
      return rngFor(world.seed, world.tick, `explosive:${artist.id}`).range(0, 3);
    case 'fragile':
      return 1.3;
    case 'bloomer':
      return artist.bloomed ? 1 : 0.3;
    default:
      return 1;
  }
};

const technicalKeys = (artist: Artist): Array<keyof typeof FAMILY_WEIGHTS.rap> => {
  const weights = FAMILY_WEIGHTS[GENRES[artist.genre].family];
  return (Object.keys(weights) as Array<keyof typeof weights>).filter((k) => weights[k] > 0);
};

/* ---------------------------------- At each release ---------------------------------- */

/** After a release of his: counts, fit with a new genre, the streak toward a higher ceiling, the late bloom. Returns what to tell. */
export const afterRelease = (world: World, artist: Artist, song: Song): string[] => {
  const told: string[] = [];
  artist.releases = (artist.releases ?? 0) + 1;
  if (artist.mainFit !== undefined) {
    artist.mainFit = Math.min(GENRE_CHANGE.maxFit, artist.mainFit + GENRE_CHANGE.fitStep);
    if (artist.mainFit >= GENRE_CHANGE.maxFit) delete artist.mainFit;
  }
  const gen = generalRating(artist);
  artist.streak = song.quality >= gen + EVOLUTION.streakMargin ? (artist.streak ?? 0) + 1 : 0;
  if (artist.streak >= EVOLUTION.streak) {
    artist.streak = 0;
    const season = seasonOf(world.tick);
    const ceiling = artist.ceiling?.season === season ? artist.ceiling : { season, gained: 0 };
    if (ceiling.gained < EVOLUTION.ceilingPerSeason) {
      artist.potential += 1;
      artist.ceiling = { season, gained: ceiling.gained + 1 };
      told.push(`${artist.name} enchaîne ${EVOLUTION.streak} très bons sons : il repousse ses limites, son plafond monte.`);
    }
  }
  if (song.quality >= EVOLUTION.bloomQuality) artist.goodSongs = (artist.goodSongs ?? 0) + 1;
  if (profileOf(artist.id) === 'bloomer' && !artist.bloomed && (artist.goodSongs ?? 0) >= EVOLUTION.bloomSongs) {
    artist.bloomed = true;
    artist.profileKnown = true;
    const rng = rngFor(world.seed, world.tick, `bloom:${artist.id}`);
    const jump = Math.round(rng.range(EVOLUTION.bloomMin, EVOLUTION.bloomMax));
    const before = generalRating(artist);
    const keys = technicalKeys(artist);
    // One attribute point moves the rating by a fraction of a point: add points until the jump is reached.
    for (let i = 0; i < 400 && generalRating(artist) < before + jump; i += 1) {
      const open = keys.filter((k) => artist.attrs[k] < 99);
      if (open.length === 0) break;
      const key = rng.pick(open);
      artist.attrs[key] += 1;
    }
    artist.potential = Math.max(artist.potential, generalRating(artist));
    told.push(`Éclosion ! ${artist.name} fait un bond : ${before} → ${generalRating(artist)}.`);
  }
  return told;
};

/* ---------------------------------- Changing genre ---------------------------------- */

const isNeighbour = (from: GenreId, to: GenreId): boolean =>
  GENRES[from].family === GENRES[to].family || GENRES[from].neighbours.includes(to) || GENRES[to].neighbours.includes(from);

export interface GenreOption {
  genre: GenreId;
  name: string;
  cost: number;
  weeks: number;
  /** Share of fans lost: a range, the draw is made at the change. */
  loss: [number, number];
  wished: boolean;
}

/** What changing to each genre would cost him, or why he cannot change now. */
export const genreOptions = (world: World, label: Label, artist: Artist): { blocked: string | null; options: GenreOption[] } => {
  const season = seasonOf(world.tick);
  const plus = skillLevel(artist, 'chameleon') === 2;
  const fast = Math.max(starsOf(world, label.id, 'coach'), starsOf(world, label.id, 'producer')) >= GENRE_CHANGE.fastStars;
  const weeks = plus ? GENRE_CHANGE.chameleonWeeks : fast ? GENRE_CHANGE.fastWeeks : GENRE_CHANGE.weeks;
  const halved = starsOf(world, label.id, 'community') >= 3 ? 0.5 : 1;
  const changes = label.genreChanges?.season === season ? label.genreChanges.count : 0;
  const blocked = artist.shift
    ? `${artist.name} est déjà en transition.`
    : artist.genreSeason === season
      ? `${artist.name} a déjà changé de genre cette saison.`
      : changes >= GENRE_CHANGE.perLabel
        ? `Déjà ${GENRE_CHANGE.perLabel} changements de genre dans ton label cette saison.`
        : null;
  const options = (Object.keys(GENRES) as GenreId[])
    .filter((g) => g !== artist.genre)
    .map((genre): GenreOption => {
      const wished = artist.wish?.genre === genre;
      const loss: [number, number] = plus
        ? [0, 0]
        : isNeighbour(artist.genre, genre)
          ? [GENRE_CHANGE.neighbourLoss, GENRE_CHANGE.neighbourLoss]
          : [GENRE_CHANGE.farLoss[0] * halved, GENRE_CHANGE.farLoss[1] * halved];
      return { genre, name: GENRES[genre].name, cost: Math.round((GENRE_CHANGE.cost * label.tier) / (wished ? 2 : 1)), weeks, loss, wished };
    });
  return { blocked, options };
};

/** Moves the artist to another genre: paid, a few weaker weeks, some fans lost, the old genre kept as secondary. */
export const changeGenre = (world: World, label: Label, artistId: string, genre: string): void => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  if (contractOf(world, artistId)?.labelId !== label.id) fail(`${artist.name} n’est pas dans ton label.`);
  if (!(genre in GENRES)) fail('Genre inconnu.');
  if (genre === artist.genre) fail(`${artist.name} fait déjà ce genre.`);
  const { blocked, options } = genreOptions(world, label, artist);
  if (blocked) fail(blocked);
  const option = options.find((o) => o.genre === genre)!;
  if (option.cost > label.cash) fail(`Pas assez de cash : il faut ${option.cost.toLocaleString('fr-FR')} €.`);
  const season = seasonOf(world.tick);
  label.cash -= option.cost;
  label.genreChanges = { season, count: (label.genreChanges?.season === season ? label.genreChanges.count : 0) + 1 };
  const loss = option.loss[0] === option.loss[1] ? option.loss[0] : rngFor(world.seed, world.tick, `shift:${artist.id}`).range(option.loss[0], option.loss[1]);
  artist.fans = Math.round(artist.fans * (1 - loss));
  const from = artist.genre;
  artist.secondary = [from, ...artist.secondary.filter((g) => g !== from && g !== genre)].slice(0, 2);
  artist.genre = genre as GenreId;
  artist.shift = { from, until: world.tick + option.weeks };
  artist.mainFit = GENRE_CHANGE.startFit;
  artist.audienceUntil = world.tick + option.weeks + GENRE_CHANGE.audienceWeeks;
  artist.genreSeason = season;
  artist.morale = clamp(artist.morale + (option.wished ? GENRE_CHANGE.wished : GENRE_CHANGE.forced), 0, 100);
  delete artist.wish;
};

/** The label says no to the artist's wish. */
export const refuseWish = (world: World, label: Label, artistId: string): void => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  if (contractOf(world, artistId)?.labelId !== label.id) fail(`${artist.name} n’est pas dans ton label.`);
  if (!artist.wish) fail(`${artist.name} n’a rien demandé.`);
  delete artist.wish;
  artist.morale = clamp(artist.morale + GENRE_CHANGE.refused, 0, 100);
};

/* ---------------------------------- Weekly ---------------------------------- */

/** The rating of every artist under contract with a player, before the week: to tell the progress after it. */
export const ratingsBefore = (world: World): Map<string, number> => {
  const ratings = new Map<string, number>();
  for (const label of Object.values(world.labels)) {
    if (label.kind !== 'player' || label.bankrupt) continue;
    for (const artist of rosterOf(world, label.id)) ratings.set(artist.id, generalRating(artist));
  }
  return ratings;
};

/**
 * Weekly, for the artists of the players: time with the label, the profile revealed, losing ground when idle,
 * the end of a transition, the artist's wish to change genre, the rating curve, and a line on the week's progress.
 */
export const tickEvolution = (world: World, before: Map<string, number>, tell: (labelId: string, text: string) => void): void => {
  const tick = world.tick;
  const season = seasonOf(tick);
  for (const label of Object.values(world.labels)) {
    if (label.kind !== 'player' || label.bankrupt) continue;
    const moves: string[] = [];
    for (const artist of rosterOf(world, label.id)) {
      artist.career = (artist.career ?? 0) + 1;
      if (!artist.profileKnown && profileKnown(world, label.id, artist)) {
        artist.profileKnown = true;
        const profile = PROFILES[profileOf(artist.id)];
        tell(label.id, `On connaît maintenant le profil de ${artist.name} : ${profile.name}. ${profile.text}`);
      }
      // Idle too long: he loses ground, faster when fragile, not at all when the coach follows him.
      const idle = tick - artist.lastActiveTick;
      const every = profileOf(artist.id) === 'fragile' ? EVOLUTION.fragileEvery : EVOLUTION.every;
      if (idle >= EVOLUTION.idle && (idle - EVOLUTION.idle) % every === 0 && !coachOn(world, label.id, artist.id)) {
        const keys = technicalKeys(artist).filter((k) => artist.attrs[k] > 1);
        if (keys.length > 0) {
          const key = rngFor(world.seed, tick, `regress:${artist.id}`).pick(keys);
          artist.attrs[key] -= 1;
        }
      }
      if (artist.shift && tick >= artist.shift.until) {
        delete artist.shift;
        tell(label.id, `${artist.name} a fini sa transition : il est maintenant ${GENRES[artist.genre].name}. Ses sons de ce genre touchent plus de nouveaux auditeurs quelques semaines.`);
      }
      if (artist.audienceUntil !== undefined && tick >= artist.audienceUntil) delete artist.audienceUntil;
      // His own wish to change genre, and what happens when nobody answers.
      if (artist.wish && tick >= artist.wish.until) {
        delete artist.wish;
        artist.morale = clamp(artist.morale + GENRE_CHANGE.refused, 0, 100);
        tell(label.id, `${artist.name} n’a pas eu de réponse pour changer de genre. Il le prend mal.`);
      } else if (
        !artist.wish &&
        !artist.shift &&
        artist.genreSeason !== season &&
        artist.wishSeason !== season &&
        (artist.releases ?? 0) >= GENRE_CHANGE.wishReleases &&
        artist.attrs.creativite >= GENRE_CHANGE.wishCreativity
      ) {
        const rng = rngFor(world.seed, tick, `wish:${artist.id}`);
        if (rng.chance(GENRE_CHANGE.wishChance)) {
          const genre = artist.secondary[0] ?? rng.pick(GENRES[artist.genre].neighbours);
          artist.wish = { genre, until: tick + GENRE_CHANGE.wishWeeks };
          artist.wishSeason = season;
          tell(label.id, `${artist.name} a envie de passer au ${GENRES[genre].name}. Dis oui dans l’Effectif : c’est à moitié prix et il sera ravi.`);
        }
      }
      const gen = generalRating(artist);
      artist.genHistory = [...(artist.genHistory ?? []), gen].slice(-EVOLUTION.history);
      const was = before.get(artist.id);
      if (was !== undefined && was !== gen) moves.push(`${artist.name} ${gen > was ? '+' : '−'}${Math.abs(gen - was)}`);
    }
    if (moves.length > 0) tell(label.id, `Progrès de la semaine : ${moves.join(' · ')}.`);
  }
};

/* ---------------------------------- View ---------------------------------- */

export interface EvolutionView {
  profile: { name: string; text: string } | null;
  /** Weeks before the profile is known, when it is not yet. */
  profileIn: number;
  skills: Array<{ id: string; name: string; plus: boolean; text: string; next: string | null }>;
  /** Releases counted toward the "+" level. */
  releases: number;
  history: number[];
  /** Very good songs in a row, toward a higher ceiling. */
  streak: number;
  shift: { from: string; weeksLeft: number } | null;
  audienceWeeks: number;
  wish: { genre: GenreId; name: string; weeksLeft: number } | null;
  genres: { blocked: string | null; options: GenreOption[] };
}

export const evolutionView = (world: World, label: Label, artist: Artist): EvolutionView => {
  const known = profileKnown(world, label.id, artist);
  const plus = skillPlus(artist);
  const skills = skillsOf(artist.id).map((id) => ({ id, ...SKILLS[id] }));
  return {
    profile: known ? { name: PROFILES[profileOf(artist.id)].name, text: PROFILES[profileOf(artist.id)].text } : null,
    profileIn: known ? 0 : Math.max(1, EVOLUTION.revealWeeks - (artist.career ?? 0)),
    skills: skills.map((s) => ({ id: s.id, name: s.name, plus, text: plus ? s.plus : s.base, next: plus ? null : s.plus })),
    releases: artist.releases ?? 0,
    history: artist.genHistory ?? [],
    streak: artist.streak ?? 0,
    shift: artist.shift ? { from: GENRES[artist.shift.from].name, weeksLeft: Math.max(0, artist.shift.until - world.tick) } : null,
    audienceWeeks: !artist.shift && artist.audienceUntil !== undefined ? Math.max(0, artist.audienceUntil - world.tick) : 0,
    wish: artist.wish ? { genre: artist.wish.genre, name: GENRES[artist.wish.genre].name, weeksLeft: Math.max(0, artist.wish.until - world.tick) } : null,
    genres: genreOptions(world, label, artist),
  };
};

