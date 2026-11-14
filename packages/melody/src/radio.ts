// Radio (docs/melody-tycoon/04-sortie-charts-economie.md, promo): a 4-week rotation. The song goes by itself to the
// radio of its genre; some genres only have small radios. If it enters the global top 50 during the rotation, it
// moves up to the mainstream radio, with a much bigger audience. Each week: extra streams, a bit of money (radio
// rights) and a little buzz. All radios are invented.
import { beatById, GENRES } from './data/content.ts';
import { contractOf } from './economy.ts';
import { clamp } from './rng.ts';
import type { GenreId, Label, Song, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export interface Station {
  id: string;
  name: string;
  /** Listeners a week. */
  audience: number;
  genres: readonly GenreId[];
  note: string;
}

export const MAINSTREAM: Station = { id: 'mega', name: 'Méga Tubes FM', audience: 8_000_000, genres: [], note: 'La radio que ta tante écoute en voiture. Tout le pays.' };

export const STATIONS: readonly Station[] = [
  { id: 'bitume', name: 'Bitume FM', audience: 2_500_000, genres: ['rap_fr', 'rap_us', 'trap', 'drill'], note: 'Du rap, du rap, et des pubs pour des sneakers.' },
  { id: 'guimauve', name: 'Radio Guimauve', audience: 3_000_000, genres: ['pop', 'variete'], note: 'Que des refrains qui restent dans la tête, même contre ton gré.' },
  { id: 'velours', name: 'Velours FM', audience: 1_200_000, genres: ['rnb'], note: 'Lumière tamisée, voix suaves, bougies parfumées.' },
  { id: 'tropical', name: 'Tropical Pression', audience: 1_500_000, genres: ['afro', 'latin'], note: 'Ça bouge les épaules même à 8 h du matin.' },
  { id: 'boumboum', name: 'Boum Boum Radio', audience: 900_000, genres: ['electro'], note: 'Un seul tempo : celui du cœur après trois cafés.' },
  { id: 'larsen', name: 'Larsen FM', audience: 700_000, genres: ['rock', 'metal'], note: 'Les animateurs crient. Tout le temps.' },
  { id: 'skank', name: 'Skank Express', audience: 350_000, genres: ['reggae'], note: 'Personne n’est pressé. Même pas les infos.' },
  { id: 'pixel', name: 'Radio Pixel', audience: 300_000, genres: ['hyperpop'], note: 'Des voix de chipmunk et des basses qui saturent. Exprès.' },
  { id: 'feutre', name: 'France Feutrée', audience: 250_000, genres: ['jazz'], note: 'On chuchote, on applaudit poliment.' },
];

/** Every genre that has no station of its own goes to this one. */
const FALLBACK: Station = { id: 'cocktail', name: 'Radio Cocktail', audience: 400_000, genres: [], note: 'Un peu de tout, beaucoup de pubs pour des matelas.' };

export const RADIO = {
  weeks: 4,
  /** Price: this much per tier of the label. */
  costPerTier: 2_500,
  /** Only for a song out for at most this many weeks. */
  maxWeeksOut: 8,
  /** Extra streams a week: this share of the audience, times quality / 70. */
  streamShare: 0.03,
  /** Radio rights a week: euros per listener. */
  rights: 0.001,
  /** Radios play the known artists more: share of airtime = sqrt(fans / this), between 5 % and 100 %. */
  fameFans: 500_000,
  minFame: 0.05,
  hype: 1,
  mainstreamRank: 50,
} as const;

export interface Rotation {
  stationId: string;
  startTick: number;
  until: number;
  mainstream: boolean;
  /** Plays (listeners reached) last week, and the money earned so far. */
  plays: number;
  money: number;
}

export const stationById = (id: string): Station => (id === MAINSTREAM.id ? MAINSTREAM : STATIONS.find((s) => s.id === id) ?? FALLBACK);

const songGenre = (world: World, song: Song): GenreId => beatById(song.beatId).genres[0] ?? world.artists[song.artistId]?.genre ?? 'pop';

/** The radio of the song's genre. */
export const stationFor = (genre: GenreId): Station => STATIONS.find((s) => s.genres.includes(genre)) ?? FALLBACK;

export const radioCost = (label: Label): number => RADIO.costPerTier * Math.max(1, label.tier);

export const onRadio = (world: World, song: Song): boolean => !!song.radio && song.radio.until > world.tick;

export const startRadio = (world: World, label: Label, songId: string): Song => {
  const song = world.songs.find((s) => s.id === songId && s.labelId === label.id) ?? fail('Son introuvable.');
  if (song.state !== 'released') fail('Le son doit être sorti pour passer à la radio.');
  if (song.radio) fail('Ce son a déjà eu sa rotation radio.');
  if (song.weeksOut > RADIO.maxWeeksOut) fail(`Trop vieux pour la radio : ${RADIO.maxWeeksOut} semaines après la sortie au plus.`);
  if ((song.pulledUntil ?? 0) > world.tick || song.seized) fail('Ce son n’est pas disponible en ce moment.');
  const cost = radioCost(label);
  if (label.cash < cost) fail('Pas assez d’argent pour la radio.');
  label.cash -= cost;
  const station = stationFor(songGenre(world, song));
  song.radio = { stationId: station.id, startTick: world.tick, until: world.tick + RADIO.weeks, mainstream: false, plays: 0, money: 0 };
  return song;
};

/**
 * Each week, before the charts: songs on rotation get their radio streams, money and buzz. A song in the global
 * top 50 (of last week) moves up to the mainstream radio.
 */
export const tickRadio = (world: World, pay: (labelId: string, amount: number) => void, tell: (labelId: string, text: string) => void): void => {
  const top = new Set(world.charts.global.slice(0, RADIO.mainstreamRank).map((e) => e.songId).filter(Boolean));
  for (const song of world.songs) {
    const r = song.radio;
    if (!r || r.until < world.tick || song.state !== 'released') continue;
    if (r.until === world.tick) {
      // The last week is over.
      r.until = world.tick - 1;
      r.plays = 0;
      tell(song.labelId, `Fin de la rotation radio de « ${song.title} » : ${r.money.toLocaleString('fr-FR')} € de droits radio.`);
      continue;
    }
    if (!r.mainstream && top.has(song.id)) {
      r.mainstream = true;
      r.stationId = MAINSTREAM.id;
      world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text: `« ${song.title} » passe sur ${MAINSTREAM.name} : tout le pays l’entend.` }];
      tell(song.labelId, `« ${song.title} » est dans le top 50 : il monte sur ${MAINSTREAM.name} !`);
    }
    const station = stationById(r.stationId);
    const fame = clamp(Math.sqrt((world.artists[song.artistId]?.fans ?? 0) / RADIO.fameFans), RADIO.minFame, 1);
    const plays = Math.round(station.audience * clamp(song.quality / 70, 0.4, 1.4) * fame);
    const streams = Math.round(plays * RADIO.streamShare);
    song.streamsLast += streams;
    song.streamsTotal += streams;
    const money = Math.round(plays * RADIO.rights);
    r.plays = plays;
    r.money += money;
    if (world.labels[song.labelId]?.kind === 'player') pay(song.labelId, money);
    const artist = world.artists[song.artistId];
    if (artist && contractOf(world, artist.id)?.labelId === song.labelId) artist.hype = clamp(artist.hype + RADIO.hype, 0, 100);
  }
};

export interface RadioLine {
  songId: string;
  title: string;
  artistName: string;
  labelName: string;
  station: string;
  plays: number;
  mine: boolean;
}

/** Top radio: the songs on rotation this week, most played first. */
export const radioChart = (world: World, labelId: string | null): RadioLine[] =>
  world.songs
    .filter((s) => s.radio && s.radio.until >= world.tick && s.radio.plays > 0)
    .sort((a, b) => b.radio!.plays - a.radio!.plays)
    .slice(0, 20)
    .map((s) => ({
      songId: s.id,
      title: s.title,
      artistName: world.artists[s.artistId]?.name ?? '?',
      labelName: world.labels[s.labelId]?.name ?? '?',
      station: stationById(s.radio!.stationId).name,
      plays: s.radio!.plays,
      mine: s.labelId === labelId,
    }));

/** What the song page shows about the radio. */
export const radioOf = (world: World, song: Song, label: Label | undefined): {
  on: boolean;
  station: string;
  note: string;
  audience: number;
  weeksLeft: number;
  mainstream: boolean;
  money: number;
  canStart: boolean;
  cost: number;
  why: string | null;
} => {
  const r = song.radio;
  const station = r ? stationById(r.stationId) : stationFor(songGenre(world, song));
  const why =
    song.state !== 'released' ? 'Le son doit être sorti.'
    : r ? null
    : song.weeksOut > RADIO.maxWeeksOut ? 'Trop vieux pour la radio.'
    : null;
  return {
    on: !!r && r.until >= world.tick,
    station: station.name,
    note: station.note,
    audience: station.audience,
    weeksLeft: r ? Math.max(0, r.until - world.tick) : 0,
    mainstream: !!r?.mainstream,
    money: r?.money ?? 0,
    canStart: !r && !why && !!label,
    cost: label ? radioCost(label) : RADIO.costPerTier,
    why,
  };
};

export const GENRE_IDS = Object.keys(GENRES) as GenreId[];
