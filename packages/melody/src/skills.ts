// Signature skills (docs/melody-tycoon/08-contenu.md, 8.5): 0 to 2 per artist, always the same ones,
// with a "+" level after ten releases or a rating of 80. Kept light: the studio, the releases and the concerts read it.
import { generalRating } from './artists.ts';
import { hashString } from './rng.ts';
import type { Artist } from './types.ts';

export type SkillId = 'hook' | 'stage' | 'perfect' | 'hits' | 'album' | 'magnet' | 'tireless' | 'chameleon' | 'viral' | 'story';

export const SKILLS: Record<SkillId, { name: string; base: string; plus: string }> = {
  hook: { name: 'Refrain contagieux', base: '+10 % de streams de découverte.', plus: '+20 % de streams de découverte, et ses sons tiennent plus longtemps.' },
  stage: { name: 'Bête de scène', base: '+15 % de public en concert et en tournée.', plus: '+30 % de public en concert et en tournée.' },
  perfect: { name: 'Perfectionniste', base: 'Fourchette de note plus serrée au studio (3 points).', plus: 'Fourchette encore plus serrée (5 points), mais +5 d’énergie par son.' },
  hits: { name: 'Machine à tubes', base: 'Singles : score de hit +5.', plus: 'Singles : score de hit +10.' },
  album: { name: 'Artiste d’album', base: 'Note de ses EP et albums +3.', plus: 'Note de ses EP et albums +6.' },
  magnet: { name: 'Aimant à featurings', base: 'Les invités acceptent plus souvent (+10 %).', plus: 'Les invités acceptent plus souvent (+20 %) et demandent 15 % de moins.' },
  tireless: { name: 'Infatigable', base: 'Les concerts le fatiguent 30 % de moins.', plus: 'Les concerts le fatiguent 50 % de moins.' },
  chameleon: { name: 'Caméléon', base: 'Plus à l’aise dans ses genres secondaires.', plus: 'À l’aise dans ses genres secondaires, et change de genre en 2 semaines sans perdre de fans.' },
  viral: { name: 'Viral', base: 'Deux fois plus de chances qu’un son explose sur les réseaux.', plus: 'Trois fois plus de chances qu’un son explose sur les réseaux.' },
  story: { name: 'Storyteller', base: 'Thèmes Rue, Famille, Nostalgie, Trahison : note +2.', plus: 'Thèmes Rue, Famille, Nostalgie, Trahison : note +4.' },
};

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** The "+" level: this many releases, or this rating. */
export const SKILL_PLUS = { releases: 10, gen: 80 } as const;

const STORY_THEMES = ['rue', 'famille', 'nostalgie', 'trahison'];

/** A genre change makes him weaker for a few weeks: his skill is multiplied by this. */
export const SHIFT_MALUS = 0.85;
/** After a genre change, songs of the new genre reach more new listeners for a while. */
export const NEW_AUDIENCE = 1.25;

const mix = (h: number): number => {
  let x = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
};

/** The skills of an artist: none for about a third, one for most, two for one in five. */
export const skillsOf = (artistId: string): SkillId[] => {
  const h = mix(hashString(`skills:${artistId}`));
  const roll = h % 100;
  const count = roll < 35 ? 0 : roll < 80 ? 1 : 2;
  if (count === 0) return [];
  const first = SKILL_IDS[Math.floor(h / 100) % SKILL_IDS.length]!;
  if (count === 1) return [first];
  const second = SKILL_IDS[(SKILL_IDS.indexOf(first) + 1 + (Math.floor(h / 10_000) % (SKILL_IDS.length - 1))) % SKILL_IDS.length]!;
  return [first, second];
};

/** Is the "+" level unlocked? */
export const skillPlus = (artist: Pick<Artist, 'attrs' | 'genre'> & { releases?: number }): boolean =>
  (artist.releases ?? 0) >= SKILL_PLUS.releases || generalRating(artist) >= SKILL_PLUS.gen;

/** 0: he does not have it, 1: base, 2: "+". */
export const skillLevel = (artist: Pick<Artist, 'id' | 'attrs' | 'genre'> & { releases?: number }, skill: SkillId): 0 | 1 | 2 =>
  !skillsOf(artist.id).includes(skill) ? 0 : skillPlus(artist) ? 2 : 1;

type Who = Pick<Artist, 'id' | 'attrs' | 'genre'> & { releases?: number };

export const discoveryBoost = (artist: Who): number => 1 + 0.1 * skillLevel(artist, 'hook');
export const decayBonus = (artist: Who): number => (skillLevel(artist, 'hook') === 2 ? 0.03 : 0);
export const stageBoost = (artist: Who): number => 1 + 0.15 * skillLevel(artist, 'stage');
export const tightness = (artist: Who): number => [0, 3, 5][skillLevel(artist, 'perfect')] ?? 0;
export const perfectEnergy = (artist: Who): number => (skillLevel(artist, 'perfect') === 2 ? 5 : 0);
export const hitBonus = (artist: Who, single: boolean): number => (single ? 5 * skillLevel(artist, 'hits') : 0);
export const albumBonus = (artist: Who): number => 3 * skillLevel(artist, 'album');
export const magnetChance = (artist: Who): number => 0.1 * skillLevel(artist, 'magnet');
export const magnetDemand = (artist: Who): number => (skillLevel(artist, 'magnet') === 2 ? 0.85 : 1);
export const tirelessFactor = (artist: Who): number => [1, 0.7, 0.5][skillLevel(artist, 'tireless')] ?? 1;
export const chameleonBonus = (artist: Who): number => (skillLevel(artist, 'chameleon') > 0 ? 0.05 : 0);
export const viralFactor = (artist: Who): number => [1, 2, 3][skillLevel(artist, 'viral')] ?? 1;
export const storyBonus = (artist: Who, themeId: string): number => (STORY_THEMES.includes(themeId) ? 2 * skillLevel(artist, 'story') : 0);
