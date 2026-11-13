// The label's roles (owner's idea, 2026-11-13, replacing the shared support): each artist gets a role. A role gives
// a bonus and never takes anything from the others. Places per role grow with the label's tier (1 at Maison, 2 at
// Underground...). A role can be changed once a week per artist. No jealousy.
// "En pleine forme" (like the special cards of a football game): after a number 1 or a gold record, the artist's
// card shines for 4 weeks, with a little more quality, promo and sales.
import { FORM, inForm } from './craft.ts';
import { CFG } from './config.ts';
import { rosterOf } from './economy.ts';
import type { Artist, Label, RoleId, World } from './types.ts';
import { GameError } from './world.ts';

export { FORM, inForm };

const fail = (message: string): never => {
  throw new GameError(message);
};

export type SupportKind = 'promo' | 'sales' | 'grow';

export interface RoleDef {
  name: string;
  about: string;
  promo: number;
  sales: number;
  grow: number;
}

export const ROLES: Record<RoleId, RoleDef> = {
  headliner: { name: 'Artiste phare', about: 'Promo +25 %, ventes de CD et vinyles +30 %.', promo: 1.25, sales: 1.3, grow: 1 },
  prospect: { name: 'Pépite', about: 'Progresse 25 % plus vite.', promo: 1, sales: 1, grow: 1.25 },
  pillar: { name: 'Pilier', about: 'Moral +1 par semaine. Quand il a le moral (60 ou plus), les autres artistes du label aussi : +1.', promo: 1, sales: 1, grow: 1 },
  free: { name: 'Artiste libre', about: 'Rôle de base : ni bonus ni malus.', promo: 1, sales: 1, grow: 1 },
};

export const ROLE_IDS: RoleId[] = ['headliner', 'prospect', 'pillar', 'free'];

export const ROLE_RULES = {
  /** Pillar: his own morale each week, and the others' when his morale is at least pillarMood. */
  pillar: 1,
  pillarMood: 60,
} as const;

/** Places for each role (not "free", which has no limit): one more at each tier. */
export const roleSlots = (tier: number): number => Math.max(1, tier);

const isPlayer = (world: World, labelId: string): Label | null => {
  const label = world.labels[labelId];
  return label && label.kind === 'player' ? label : null;
};

export const roleOf = (world: World, labelId: string, artistId: string): RoleId => isPlayer(world, labelId)?.roles?.[artistId] ?? 'free';

/** Promo views, CD and vinyl sales, or progress of an artist, times this: his role, and his form. */
export const supportBoost = (world: World, labelId: string, artistId: string, kind: SupportKind): number => {
  const role = ROLES[roleOf(world, labelId, artistId)][kind];
  const artist = world.artists[artistId];
  const form = artist && kind !== 'grow' && inForm(world, artist) ? FORM.boost : 1;
  return role * form;
};

/** How many artists of the label hold each role. */
export const roleCounts = (world: World, label: Label): Record<RoleId, number> => {
  const counts: Record<RoleId, number> = { headliner: 0, prospect: 0, pillar: 0, free: 0 };
  for (const artist of rosterOf(world, label.id)) counts[roleOf(world, label.id, artist.id)] += 1;
  return counts;
};

/** The player gives a role to one of his artists. */
export const setRole = (world: World, label: Label, artistId: string, role: RoleId): void => {
  const artist = rosterOf(world, label.id).find((a) => a.id === artistId);
  if (!artist) return fail('Cet artiste n’est pas dans ton label.');
  if (!ROLES[role]) return fail('Ce rôle n’existe pas.');
  const current = roleOf(world, label.id, artistId);
  if (current === role) return fail(`${artist.name} a déjà ce rôle.`);
  if (label.roleTicks?.[artistId] === world.tick) return fail(`Tu as déjà changé le rôle de ${artist.name} cette semaine.`);
  const slots = roleSlots(label.tier);
  if (role !== 'free' && roleCounts(world, label)[role] >= slots)
    return fail(`Plus de place : ${slots} ${ROLES[role].name} au plus à ton palier (${CFG.tiers.names[label.tier - 1] ?? ''}). Monte de palier pour en avoir plus.`);
  const roles = { ...(label.roles ?? {}) };
  if (role === 'free') delete roles[artistId];
  else roles[artistId] = role;
  label.roles = roles;
  label.roleTicks = { ...(label.roleTicks ?? {}), [artistId]: world.tick };
};

/** A number 1 or a gold record: the card shines for a few weeks (players' artists only). */
export const lightUp = (world: World, labelId: string, artist: Artist, why: string, tell: (labelId: string, text: string) => void): void => {
  if (!isPlayer(world, labelId)) return;
  const again = inForm(world, artist);
  artist.formUntil = world.tick + FORM.weeks;
  tell(labelId, again ? `${artist.name} reste en pleine forme (${why}) : encore ${FORM.weeks} semaines.` : `${artist.name} est en pleine forme (${why}) : sa carte brille ${FORM.weeks} semaines, note +${FORM.quality}, promo et ventes +${Math.round((FORM.boost - 1) * 100)} %.`);
};

/** Weeks of form left (0: none). */
export const formWeeks = (world: World, artist: Artist): number => (inForm(world, artist) ? (artist.formUntil ?? 0) - world.tick : 0);
