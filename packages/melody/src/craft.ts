// The craft of a song: what makes it good besides money (docs/melody-tycoon/03-creation-de-son.md, update
// "Studio & sorties"). Each week the studio offers a few themes and beats; good choices fit the artist,
// fit each other and follow the trend; a few secret combos give more; a bold choice can make a hit or a flop.
import { genreAffinity } from './artists.ts';
import { CFG } from './config.ts';
import { CATALOG_ARTISTS } from './data/catalog.gen.ts';
import { BEATS, GENRES, THEMES, beatById, coherence } from './data/content.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import type { Artist, GenreId, World } from './types.ts';

export const CRAFT = {
  /** Themes and beats offered each week. */
  offers: 5,
  /** Hidden bonus of a secret combo, and how many exist each season. */
  secretBonus: 7,
  secrets: 10,
  /** Bonus of a theme + beat that fit each other and the artist. */
  perfectBonus: 3,
  /** Surprise: chance to blow up or flop, more with each bold choice. */
  boomBase: 0.05,
  boomPerRisk: 0.035,
  flopBase: 0.05,
  flopPerRisk: 0.04,
  boom: [6, 16] as const,
  flop: [6, 14] as const,
  /** Entries a label keeps in its notebook. */
  notebookMax: 40,
} as const;

/* ---------------------------------- Fit ---------------------------------- */

/** True when the theme is one the artist's own scene sings about. */
export const themeFits = (artist: Pick<Artist, 'genre' | 'secondary'>, themeId: string): boolean =>
  BEATS.some((b) => b.themes.includes(themeId) && (b.genres.includes(artist.genre) || artist.secondary.some((g) => b.genres.includes(g))));

/** True when the beat is in the artist's genres. */
export const beatFits = (artist: Pick<Artist, 'genre' | 'secondary'>, beatId: string): boolean => genreAffinity(artist, beatById(beatId).genres) >= 0.9;

/** How well the choices go together, 0 to 100: theme and beat, beat and artist, theme and artist. */
export const choiceScore = (artist: Pick<Artist, 'genre' | 'secondary'>, themeId: string, beatId: string): number => {
  const beat = clamp(40 + ((genreAffinity(artist, beatById(beatId).genres) - 0.6) / 0.45) * 60, 40, 100);
  const theme = themeFits(artist, themeId) ? 90 : 55;
  return 0.35 * coherence(themeId, beatId) + 0.35 * beat + 0.3 * theme;
};

/** Bold choices: off-genre beat, theme and beat that do not go together, a theme far from the artist. */
export const riskOf = (artist: Pick<Artist, 'genre' | 'secondary'>, themeId: string, beatId: string): number =>
  Number(genreAffinity(artist, beatById(beatId).genres) <= 0.75) + Number(coherence(themeId, beatId) <= 55) + Number(!themeFits(artist, themeId));

/** Theme and beat made for each other, on the artist's own beat. */
export const isPerfect = (artist: Pick<Artist, 'genre' | 'secondary'>, themeId: string, beatId: string): boolean =>
  coherence(themeId, beatId) >= 95 && beatById(beatId).genres.includes(artist.genre) && themeFits(artist, themeId);

/* ---------------------------------- Experience ---------------------------------- */

/** Fame and songs already made: a newcomer makes weaker songs, the artist grows with the fans and the work. */
/** "En pleine forme": weeks, note bonus, and promo and sales boost. */
export const FORM = { weeks: 4, quality: 3, boost: 1.1 } as const;

export const inForm = (world: World, artist: Pick<Artist, 'formUntil'>): boolean => (artist.formUntil ?? -1) > world.tick;

export const experienceBonus = (world: World, artist: Artist): number => {
  const songs = world.songs.filter((s) => s.artistId === artist.id).length;
  const fame = clamp(1.5 * Math.log10(Math.max(artist.fans, 1_000) / 10_000), -2, 5);
  const work = Math.min(5, 1.5 * Math.sqrt(songs));
  const newcomer = songs === 0 ? -2 : 0;
  return fame + work + newcomer + (inForm(world, artist) ? FORM.quality : 0);
};

/* ---------------------------------- Weekly offers ---------------------------------- */

export interface Offered {
  id: string;
  /** Fits the artist: a star on the card. */
  star: boolean;
}

export interface StudioOffers {
  themes: Offered[];
  beats: Offered[];
}

const draw = <T extends { id: string }>(rng: Rng, items: readonly T[], fits: (item: T) => boolean, count: number): Offered[] => {
  const good = items.filter(fits);
  const picked: T[] = [];
  // Usually one or two that fit the artist, never guaranteed.
  for (let i = 0; i < 2; i += 1) {
    const left = good.filter((g) => !picked.includes(g));
    if (left.length > 0 && rng.next() < 0.6) picked.push(rng.pick(left));
  }
  while (picked.length < count) {
    const left = items.filter((g) => !picked.includes(g));
    if (left.length === 0) break;
    picked.push(rng.pick(left));
  }
  return picked.sort(() => rng.next() - 0.5).map((item) => ({ id: item.id, star: fits(item) }));
};

/** The themes and beats the studio offers this week to one artist of one label. */
export const studioOffers = (world: World, labelId: string, artist: Artist): StudioOffers => {
  const rng = rngFor(world.seed, world.tick, `offers:${labelId}:${artist.id}`);
  return {
    themes: draw(rng, THEMES, (t) => themeFits(artist, t.id), CRAFT.offers),
    beats: draw(rng, BEATS, (b) => beatFits(artist, b.id), CRAFT.offers),
  };
};

/* ---------------------------------- Trend ---------------------------------- */

export interface Trend {
  genre: GenreId;
  themeId: string;
  beatId: string;
  /** Weeks left before it changes. */
  weeksLeft: number;
}

/** What the public wants this month: one genre, one theme, one beat. */
export const trendOf = (world: World, tick = world.tick): Trend => {
  const month = Math.floor(tick / 4);
  const rng = rngFor(world.seed, month, 'trend');
  const genres = Object.keys(GENRES) as GenreId[];
  return { genre: rng.pick(genres), themeId: rng.pick(THEMES).id, beatId: rng.pick(BEATS).id, weeksLeft: 4 - (tick % 4) };
};

/** 1 when the song follows nothing of the trend, up to 1.6 when it follows all of it. */
export const trendBoost = (world: World, tick: number, genres: readonly GenreId[], themeId: string, beatId: string): number => {
  const trend = trendOf(world, tick);
  return 1 + 0.25 * Number(genres.includes(trend.genre)) + 0.15 * Number(trend.themeId === themeId) + 0.2 * Number(trend.beatId === beatId);
};

/* ---------------------------------- Secret combos and notebook ---------------------------------- */

const secretKey = (themeId: string, beatId: string) => `${themeId}|${beatId}`;

/** The secret combos of the season: theme + beat pairs that make a song better, found by playing. */
export const secretCombos = (world: World, tick = world.tick): Set<string> => {
  const season = Math.floor(tick / CFG.ticksPerSeason);
  const rng = rngFor(world.seed, season, 'secret-combos');
  const combos = new Set<string>();
  while (combos.size < CRAFT.secrets) combos.add(secretKey(rng.pick(THEMES).id, rng.pick(BEATS).id));
  return combos;
};

export const isSecret = (world: World, themeId: string, beatId: string, tick = world.tick): boolean => secretCombos(world, tick).has(secretKey(themeId, beatId));

export interface NotebookEntry {
  themeId: string;
  beatId: string;
  kind: 'secret' | 'perfect';
  /** Season it was found in: secret combos change each season. */
  season: number;
  songTitle: string;
}

export const notebookOf = (world: World, labelId: string): NotebookEntry[] => world.notebooks?.[labelId] ?? [];

/** Writes a combo down once its song is out. */
export const noteCombo = (world: World, labelId: string, entry: NotebookEntry): boolean => {
  const notebooks = (world.notebooks ??= {});
  const list = (notebooks[labelId] ??= []);
  if (list.some((e) => e.themeId === entry.themeId && e.beatId === entry.beatId && e.kind === entry.kind && e.season === entry.season)) return false;
  list.unshift(entry);
  if (list.length > CRAFT.notebookMax) list.length = CRAFT.notebookMax;
  return true;
};

/* ---------------------------------- Surprise ---------------------------------- */

export interface Surprise {
  delta: number;
  kind: 'boom' | 'flop' | null;
}

/** Sometimes a song lands far from what the studio expected. Bold choices make it more likely, both ways. */
export const rollSurprise = (rng: Rng, risk: number, artist: Pick<Artist, 'attrs'>): Surprise => {
  const boom = CRAFT.boomBase + CRAFT.boomPerRisk * risk + (artist.attrs.creativite - 50) * 0.001;
  const flop = CRAFT.flopBase + CRAFT.flopPerRisk * risk - (artist.attrs.discipline - 50) * 0.0005;
  const roll = rng.next();
  if (roll < boom) return { delta: Math.round(rng.range(CRAFT.boom[0], CRAFT.boom[1])), kind: 'boom' };
  if (roll < boom + Math.max(0.02, flop)) return { delta: -Math.round(rng.range(CRAFT.flop[0], CRAFT.flop[1])), kind: 'flop' };
  return { delta: 0, kind: null };
};

/* ---------------------------------- Countries ---------------------------------- */

let countries: Map<string, string> | null = null;

/** Country of an artist of the catalogue (null for made-up artists, who are French). */
export const countryOf = (artist: Pick<Artist, 'id' | 'real'>): string => {
  countries ??= new Map(CATALOG_ARTISTS.map((a) => [a.id, a.country]));
  return countries.get(artist.id) ?? 'FR';
};
