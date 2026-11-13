// Turning a catalogue line into a playable artist, and the ratings derived from attributes.
import { CFG } from './config.ts';
import { GENRES, isGenre } from './data/content.ts';
import { clamp, createRng, hashString } from './rng.ts';
import { skillsOf } from './skills.ts';
import type { Artist, Attributes, CatalogArtist, EnergyProfile, GenreFamily, GenreId } from './types.ts';

type Technical = 'voix' | 'ecriture' | 'instrument' | 'production' | 'scene' | 'creativite';

/** Share of each technical attribute in the general rating, per genre family. */
export const FAMILY_WEIGHTS: Record<GenreFamily, Record<Technical, number>> = {
  rap: { voix: 0.2, ecriture: 0.35, instrument: 0, production: 0.1, scene: 0.15, creativite: 0.2 },
  chant: { voix: 0.4, ecriture: 0.15, instrument: 0.1, production: 0.05, scene: 0.15, creativite: 0.15 },
  machines: { voix: 0.15, ecriture: 0.1, instrument: 0.1, production: 0.35, scene: 0.1, creativite: 0.2 },
  groupe: { voix: 0.25, ecriture: 0.2, instrument: 0.25, production: 0.05, scene: 0.15, creativite: 0.1 },
};

const TECHNICAL = Object.keys(FAMILY_WEIGHTS.rap) as Technical[];

const FAMILY_SHAPE: Record<GenreFamily, Partial<Record<Technical, number>>> = {
  rap: { ecriture: 6, voix: -3, instrument: -25 },
  chant: { voix: 6, instrument: -8, production: -10 },
  machines: { production: 8, ecriture: -6, instrument: -5 },
  groupe: { instrument: 6, production: -12 },
};

const TAG_SHAPE: Record<string, Partial<Attributes>> = {
  plume: { ecriture: 6 },
  scene: { scene: 8 },
  stade: { scene: 8 },
  voix: { voix: 8 },
  auto_produit: { production: 15 },
  producteur: { production: 18 },
  rare: { endurance: -15 },
  prolifique: { endurance: 15 },
  viral: { charisme: 6 },
  charisme: { charisme: 8 },
  concept: { creativite: 8 },
  cameleon: { creativite: 6 },
  energie: { scene: 5 },
  clash: { medias: 6, charisme: 4 },
};

const ENERGY_PROFILES: readonly EnergyProfile[] = ['normal', 'bourreau', 'lazy', 'par_a_coups', 'oiseau_de_nuit'];

export const toGenre = (value: string): GenreId => (isGenre(value) ? value : 'rap_fr');

/** Artistic skill used by the quality formula: weighted technical attributes for a genre family. */
export const artisticSkill = (attrs: Attributes, family: GenreFamily): number => {
  const weights = FAMILY_WEIGHTS[family];
  return TECHNICAL.reduce((sum, key) => sum + attrs[key] * weights[key], 0);
};

/** General rating (GEN) shown to the player. */
export const generalRating = (artist: Pick<Artist, 'attrs' | 'genre'>): number =>
  Math.round(artisticSkill(artist.attrs, GENRES[artist.genre].family));

/** 1.00-1.10 for the main genre, lower for the others. */
export const genreAffinity = (artist: Pick<Artist, 'genre' | 'secondary'> & Partial<Pick<Artist, 'id' | 'mainFit'>>, beatGenres: readonly GenreId[]): number => {
  // Right after a genre change, the new genre is not yet his best one.
  if (beatGenres.includes(artist.genre)) return artist.mainFit ?? 1.05;
  // The chameleon is more at ease in his other genres.
  if (artist.secondary.some((g) => beatGenres.includes(g))) return 0.9 + (artist.id && skillsOf(artist.id).includes('chameleon') ? 0.05 : 0);
  if (GENRES[artist.genre].neighbours.some((g) => beatGenres.includes(g))) return 0.75;
  return 0.6;
};

const buildAttributes = (source: CatalogArtist, genre: GenreId): Attributes => {
  const rng = createRng(hashString(source.id));
  const family = GENRES[genre].family;
  const jitter = (): number => Math.round(rng.range(-4, 4));
  const attrs: Attributes = {
    voix: source.gen + jitter(),
    ecriture: source.gen + jitter(),
    instrument: source.gen + jitter(),
    production: source.gen + jitter(),
    scene: source.gen + jitter(),
    creativite: source.gen + jitter(),
    discipline: 60 + Math.round(rng.range(-15, 20)),
    resilience: 60 + Math.round(rng.range(-15, 20)),
    charisme: Math.round(source.gen * 0.6 + source.hype * 0.3 + rng.range(0, 12)),
    professionnalisme: 60 + Math.round(rng.range(-15, 20)),
    medias: 55 + Math.round(rng.range(-15, 25)),
    endurance: 70 + Math.round(rng.range(-12, 12)),
  };
  const apply = (shape: Partial<Attributes>): void => {
    for (const key of Object.keys(shape) as (keyof Attributes)[]) attrs[key] += shape[key] ?? 0;
  };
  apply(FAMILY_SHAPE[family]);
  for (const tag of source.tags) apply(TAG_SHAPE[tag] ?? {});
  // Shift the technical attributes so the general rating lands on the catalogue value.
  const gap = source.gen - artisticSkill(attrs, family);
  for (const key of TECHNICAL) attrs[key] += gap;
  for (const key of Object.keys(attrs) as (keyof Attributes)[]) attrs[key] = Math.round(clamp(attrs[key], 5, 99));
  return attrs;
};

/** Builds the world's own copy of a catalogue artist. The hidden potential depends on the world seed. */
export const artistFromCatalog = (source: CatalogArtist, worldSeed: number): Artist => {
  const genre = toGenre(source.genre);
  const rng = createRng(worldSeed ^ hashString(source.id));
  const profile = ENERGY_PROFILES.find((p) => p === source.energyProfile) ?? 'normal';
  return {
    id: source.id,
    name: source.name,
    real: source.real,
    genre,
    // Two styles at most: his own and one other.
    secondary: source.secondary.filter(isGenre).filter((g) => g !== genre).slice(0, 1),
    attrs: buildAttributes(source, genre),
    potential: Math.round(rng.range(source.potMin, source.potMax)),
    fans: source.fans,
    hype: source.hype,
    superfanRate: 0.01,
    energy: 100,
    creativeFatigue: 0,
    morale: CFG.morale.start,
    energyProfile: profile,
    growth: 0,
    lastActiveTick: 0,
    lastReleaseTick: -99,
  };
};

/** Energy won back each tick. */
export const energyRegen = (artist: Artist, tick: number): number => {
  const base = (CFG.energy.regenBase * artist.attrs.endurance) / 70;
  switch (artist.energyProfile) {
    case 'bourreau': return base * 1.3;
    case 'lazy': return base * 0.8;
    case 'par_a_coups': return tick % 3 === 0 ? base * 2 : base * 0.6;
    default: return base;
  }
};
