// Regions (docs/melody-tycoon/04-sortie-charts-economie.md, fans and charts): five regions. Each artist has his
// fans split between them (60 % at home by default). A release aims its promo at one region: most new fans
// arrive there, and the promo works a bit less away from his biggest region. Each region has its top 50.
import { countryOf } from './craft.ts';
import type { Artist } from './types.ts';

export type RegionId = 'fr' | 'us' | 'uk' | 'afrique' | 'monde';

export const REGION_IDS: readonly RegionId[] = ['fr', 'us', 'uk', 'afrique', 'monde'];

export const REGION_NAMES: Record<RegionId, string> = {
  fr: 'France-Belgique-Suisse',
  us: 'États-Unis',
  uk: 'Royaume-Uni',
  afrique: 'Afrique',
  monde: 'Reste du monde',
};

/** Where the "n°1 in…" news says it. */
export const REGION_IN: Record<RegionId, string> = {
  fr: 'en France',
  us: 'aux États-Unis',
  uk: 'au Royaume-Uni',
  afrique: 'en Afrique',
  monde: 'dans le reste du monde',
};

export const REGIONS = {
  home: 0.6,
  second: 0.25,
  /** Share of the new fans of a release that arrive in the aimed region; the rest follows his split. */
  aimed: 0.7,
  /** Promo aimed away from his biggest region. */
  awayReach: 0.8,
} as const;

const AFRICA = new Set(['SN', 'CI', 'ML', 'CM', 'CD', 'CG', 'NG', 'GH', 'ZA', 'MA', 'DZ', 'TN', 'KE', 'GA', 'BF', 'GN', 'BJ', 'TG', 'AO', 'ET', 'TZ', 'UG', 'RW', 'MG', 'NE', 'TD', 'MR', 'GM', 'SL', 'LR', 'ZW', 'ZM', 'MZ', 'NA', 'BW', 'CV', 'KM', 'DJ', 'EG', 'LY', 'SD']);

export const regionOfCountry = (country: string): RegionId => {
  const c = country.toUpperCase();
  if (c === 'FR' || c === 'BE' || c === 'CH' || c === 'LU' || c === 'MC') return 'fr';
  if (c === 'US' || c === 'CA' || c === 'PR') return 'us';
  if (c === 'GB' || c === 'UK' || c === 'IE') return 'uk';
  if (AFRICA.has(c)) return 'afrique';
  return 'monde';
};

export const homeRegion = (artist: Pick<Artist, 'id' | 'real'>): RegionId => regionOfCountry(countryOf(artist));

const SECOND: Record<RegionId, RegionId> = { fr: 'afrique', us: 'monde', uk: 'us', afrique: 'fr', monde: 'us' };

const defaultShares = (artist: Pick<Artist, 'id' | 'real'>): Record<RegionId, number> => {
  const home = homeRegion(artist);
  const second = SECOND[home];
  const rest = (1 - REGIONS.home - REGIONS.second) / 3;
  return Object.fromEntries(REGION_IDS.map((r) => [r, r === home ? REGIONS.home : r === second ? REGIONS.second : rest])) as Record<RegionId, number>;
};

/** His fans per region, as shares that add up to 1. */
export const sharesOf = (artist: Pick<Artist, 'id' | 'real' | 'regions'>): Record<RegionId, number> => artist.regions ?? defaultShares(artist);

export const topRegion = (artist: Pick<Artist, 'id' | 'real' | 'regions'>): RegionId => {
  const shares = sharesOf(artist);
  return REGION_IDS.reduce((best, r) => (shares[r] > shares[best] ? r : best), REGION_IDS[0]!);
};

/** The promo reaches a bit less away from his biggest region. */
export const regionReach = (artist: Pick<Artist, 'id' | 'real' | 'regions'>, aimed: RegionId | undefined): number =>
  !aimed || aimed === topRegion(artist) ? 1 : REGIONS.awayReach;

/** New fans arrive: most of them in the aimed region. Call it with his fans before they were added. */
export const steerFans = (artist: Artist, before: number, added: number, aimed: RegionId | undefined): void => {
  if (added <= 0) return;
  const shares = sharesOf(artist);
  const region = aimed ?? topRegion(artist);
  const total = before + added;
  if (total <= 0) return;
  const next = {} as Record<RegionId, number>;
  for (const r of REGION_IDS) next[r] = (shares[r] * before + added * ((1 - REGIONS.aimed) * shares[r] + (r === region ? REGIONS.aimed : 0))) / total;
  artist.regions = next;
};

/** His fans in each region, rounded. */
export const fansByRegion = (artist: Artist): Record<RegionId, number> => {
  const shares = sharesOf(artist);
  return Object.fromEntries(REGION_IDS.map((r) => [r, Math.round(artist.fans * shares[r])])) as Record<RegionId, number>;
};
