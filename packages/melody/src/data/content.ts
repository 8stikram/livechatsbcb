// Genres, beats and themes (docs/melody-tycoon/08-contenus.md).
import type { Beat, GenreFamily, GenreId, Theme } from '../types.ts';

export const GENRES: Record<GenreId, { name: string; family: GenreFamily; neighbours: GenreId[] }> = {
  rap_fr: { name: 'Rap FR', family: 'rap', neighbours: ['trap', 'drill', 'rnb'] },
  rap_us: { name: 'Rap US', family: 'rap', neighbours: ['trap', 'rnb', 'hyperpop'] },
  drill: { name: 'Drill', family: 'rap', neighbours: ['rap_fr', 'trap'] },
  trap: { name: 'Trap', family: 'rap', neighbours: ['rap_us', 'rap_fr', 'hyperpop'] },
  rnb: { name: 'R&B', family: 'chant', neighbours: ['pop', 'rap_us', 'afro'] },
  pop: { name: 'Pop', family: 'chant', neighbours: ['rnb', 'variete', 'electro'] },
  afro: { name: 'Afro', family: 'chant', neighbours: ['rnb', 'pop', 'latin'] },
  latin: { name: 'Latin', family: 'chant', neighbours: ['afro', 'pop'] },
  variete: { name: 'Variété', family: 'chant', neighbours: ['pop', 'rock'] },
  hyperpop: { name: 'Hyperpop', family: 'machines', neighbours: ['trap', 'electro', 'pop'] },
  electro: { name: 'Électro', family: 'machines', neighbours: ['hyperpop', 'pop'] },
  rock: { name: 'Rock / Alternatif', family: 'groupe', neighbours: ['pop', 'variete', 'metal'] },
  metal: { name: 'Métal', family: 'groupe', neighbours: ['rock'] },
  reggae: { name: 'Reggae / Dub', family: 'chant', neighbours: ['afro', 'variete'] },
  jazz: { name: 'Jazz / Classique', family: 'groupe', neighbours: ['rnb', 'variete'] },
};

export const GENRE_IDS = Object.keys(GENRES) as GenreId[];

export const isGenre = (value: string): value is GenreId => value in GENRES;

export const THEMES: Theme[] = [
  { id: 'rue', name: 'Rue / Quartier' },
  { id: 'argent', name: 'Argent / Réussite' },
  { id: 'ego', name: 'Ego trip' },
  { id: 'amour', name: 'Amour' },
  { id: 'rupture', name: 'Rupture' },
  { id: 'toxique', name: 'Love toxique' },
  { id: 'fete', name: 'Fête' },
  { id: 'danse', name: 'Danse' },
  { id: 'soleil', name: 'Soleil / Vacances' },
  { id: 'melancolie', name: 'Mélancolie' },
  { id: 'mental', name: 'Santé mentale' },
  { id: 'nostalgie', name: 'Nostalgie / Enfance' },
  { id: 'famille', name: 'Famille' },
  { id: 'spirituel', name: 'Spiritualité' },
  { id: 'trahison', name: 'Trahison' },
  { id: 'clash', name: 'Clash' },
  { id: 'engagement', name: 'Engagement social' },
  { id: 'region', name: 'Fierté régionale' },
  { id: 'motivation', name: 'Motivation / Sport' },
  { id: 'voyage', name: 'Voyage' },
  { id: 'nuit', name: 'Nuit' },
  { id: 'mode', name: 'Mode / Luxe' },
  { id: 'voitures', name: 'Voitures' },
  { id: 'detente', name: 'Détente / Chill' },
];

export const BEATS: Beat[] = [
  { id: 'boom_bap', name: 'Boom bap', genres: ['rap_fr', 'rap_us'], themes: ['rue', 'nostalgie', 'engagement', 'ego'] },
  { id: 'trap', name: 'Trap classique', genres: ['trap'], themes: ['argent', 'rue', 'ego', 'fete'] },
  { id: 'supertrap', name: 'Supertrap', genres: ['trap'], themes: ['ego', 'fete', 'argent', 'clash'] },
  { id: 'lovetrap', name: 'Lovetrap', genres: ['trap', 'rnb'], themes: ['amour', 'rupture', 'toxique', 'melancolie'] },
  { id: 'regalia', name: 'Regalia', genres: ['trap'], themes: ['argent', 'ego', 'spirituel', 'famille'] },
  { id: 'crank', name: 'Crank', genres: ['rap_us'], themes: ['fete', 'danse', 'ego'] },
  { id: 'new_jazz', name: 'New jazz', genres: ['rap_us', 'hyperpop'], themes: ['ego', 'mode', 'nuit', 'argent'] },
  { id: 'rage', name: 'Rage', genres: ['trap', 'hyperpop'], themes: ['fete', 'ego', 'clash'] },
  { id: 'plugg', name: 'Plugg', genres: ['rap_us'], themes: ['argent', 'detente', 'amour'] },
  { id: 'pluggnb', name: 'PluggnB', genres: ['rnb', 'trap'], themes: ['amour', 'toxique', 'nuit'] },
  { id: 'cloud', name: 'Cloud', genres: ['rap_fr', 'rap_us'], themes: ['melancolie', 'mental', 'voyage'] },
  { id: 'drill_uk', name: 'Drill UK', genres: ['drill'], themes: ['rue', 'clash', 'trahison'] },
  { id: 'drill_fr', name: 'Drill FR', genres: ['drill'], themes: ['rue', 'trahison', 'region'] },
  { id: 'jersey', name: 'Jersey club', genres: ['hyperpop', 'pop'], themes: ['danse', 'fete', 'amour'] },
  { id: 'hyperpop', name: 'Hyperpop', genres: ['hyperpop'], themes: ['mental', 'amour', 'fete', 'mode'] },
  { id: 'phonk', name: 'Phonk', genres: ['trap'], themes: ['nuit', 'voitures', 'ego'] },
  { id: 'afrobeats', name: 'Afrobeats', genres: ['afro'], themes: ['danse', 'amour', 'soleil', 'fete'] },
  { id: 'amapiano', name: 'Amapiano', genres: ['afro'], themes: ['danse', 'fete', 'soleil'] },
  { id: 'dancehall', name: 'Dancehall / Shatta', genres: ['afro', 'latin'], themes: ['danse', 'fete', 'amour'] },
  { id: 'reggaeton', name: 'Reggaeton', genres: ['latin'], themes: ['amour', 'fete', 'soleil'] },
  { id: 'rnb_alt', name: 'R&B alternatif', genres: ['rnb'], themes: ['toxique', 'rupture', 'nuit'] },
  { id: 'pop_synthe', name: 'Pop synthé', genres: ['pop', 'variete'], themes: ['amour', 'nostalgie', 'motivation'] },
  { id: 'house', name: 'House / French touch', genres: ['electro'], themes: ['danse', 'nuit', 'fete'] },
  { id: 'guitare', name: 'Guitare / Emo', genres: ['rock', 'pop'], themes: ['rupture', 'mental', 'famille'] },
  { id: 'riff', name: 'Gros riff', genres: ['metal', 'rock'], themes: ['clash', 'mental', 'trahison', 'nuit'] },
  { id: 'blast', name: 'Blast beat', genres: ['metal'], themes: ['clash', 'spirituel', 'engagement'] },
  { id: 'roots', name: 'Roots reggae', genres: ['reggae'], themes: ['spirituel', 'engagement', 'soleil', 'detente'] },
  { id: 'dub', name: 'Dub', genres: ['reggae', 'electro'], themes: ['nuit', 'detente', 'engagement'] },
  { id: 'jazz_club', name: 'Jazz de club', genres: ['jazz', 'rnb'], themes: ['nuit', 'amour', 'melancolie', 'detente'] },
  { id: 'orchestre', name: 'Orchestre / Cinéma', genres: ['jazz', 'variete'], themes: ['nostalgie', 'spirituel', 'famille', 'motivation'] },
];

export const beatById = (id: string): Beat => {
  const beat = BEATS.find((b) => b.id === id);
  if (!beat) throw new Error(`unknown beat ${id}`);
  return beat;
};

/** Theme and beat that clash on purpose: low coherence. */
const MISMATCHES = new Set([
  'famille|rage', 'spirituel|crank', 'mental|amapiano', 'clash|lovetrap', 'soleil|drill_uk', 'rue|pop_synthe',
]);

/** How well a theme sits on a beat, 30 to 95. */
export const coherence = (themeId: string, beatId: string): number => {
  if (MISMATCHES.has(`${themeId}|${beatId}`)) return 30;
  const beat = beatById(beatId);
  if (beat.themes.includes(themeId)) return 95;
  const sameGenre = BEATS.some(
    (other) => other.id !== beat.id && other.themes.includes(themeId) && other.genres.some((g) => beat.genres.includes(g)),
  );
  return sameGenre ? 75 : 55;
};
