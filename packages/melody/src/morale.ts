// Morale (docs/melody-tycoon/02-artistes-recrutement.md, 2.10): the rank of each artist in his label, what he expects,
// what hurts him, what happens when he is low, and what the label can do to cheer him up.
import { generalRating } from './artists.ts';
import { contractOf, rosterOf } from './economy.ts';
import { clamp, hashString, rngFor } from './rng.ts';
import { staffOf } from './staff.ts';
import type { Artist, Contract, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type Rank = 'star' | 'established' | 'hope' | 'development';
export type CheerKind = 'bonus' | 'trip' | 'party';
export type WorryKind = 'strike' | 'out' | 'injustice' | 'late' | 'jealous' | 'aside' | 'tired';

export const RANKS: Rank[] = ['star', 'established', 'hope', 'development'];

export const RANK_NAMES: Record<Rank, string> = {
  star: 'Tête d’affiche',
  established: 'Établi',
  hope: 'Espoir',
  development: 'Développement',
};

export const MORALE = {
  /** Morale settles back here, one point a week, when nothing bothers the artist. */
  calm: 60,
  drift: 1,
  /** A leader in the label: everybody settles this much higher. */
  leaderCalm: 3,
  /** Share of the artists who are leaders, in percent. */
  leaderShare: 12,
  /** Weeks between two releases each rank expects (development: none). */
  releaseEvery: { star: 4, established: 6, hope: 8, development: null } as Record<Rank, number | null>,
  late: -1,
  /** A lower rank paid more than this much above him: injustice, every week. */
  injusticeMargin: 0.1,
  injustice: -3,
  /** Jealousy: another artist of the label gets a promo this many times bigger, and at least this much (× the tier). */
  jealousRatio: 3,
  jealousMin: 3_000,
  jealousy: -4,
  jealousWeeks: 4,
  /** Left aside: nothing done for this many weeks. */
  asideTicks: 6,
  aside: -1,
  /** The coach follows him closely. */
  coachFocus: 1,
  /** Thresholds: more trouble in the studio, sometimes no studio and asks to leave, strike. */
  trouble: 40,
  refuse: 30,
  refuseChance: 0.3,
  backToWork: 40,
  strike: 15,
  happy: 80,
  /** Weight of each rank in the morale of the label. */
  weights: { star: 4, established: 3, hope: 2, development: 1 } as Record<Rank, number>,
  /** Ways to cheer him up: price (× the tier), morale won, weeks before doing it again. */
  cheers: {
    bonus: { name: 'Prime', cost: 500, morale: 8, every: 4 },
    trip: { name: 'Voyage d’inspiration', cost: 2_000, morale: 15, every: 8 },
    party: { name: 'Soirée du label', cost: 1_000, morale: 5, every: 4 },
  } as Record<CheerKind, { name: string; cost: number; morale: number; every: number }>,
  /** Chance, each week, that one of the artists says how he feels. */
  bubbleChance: 0.35,
} as const;

/* ---------------------------------- Ranks and pay ---------------------------------- */

const rankScore = (artist: Artist): number => generalRating(artist) + 8 * Math.log10(artist.fans + 1);

/** Rank of each artist of the label, from his rating and his fans: 10 % stars (at least one), 30 % established, 40 % hopes, the rest in development. */
export const ranksOf = (world: World, labelId: string): Map<string, Rank> => {
  const roster = [...rosterOf(world, labelId)].sort((a, b) => rankScore(b) - rankScore(a) || a.id.localeCompare(b.id));
  const ranks = new Map<string, Rank>();
  roster.forEach((artist, i) => {
    const place = i / roster.length;
    ranks.set(artist.id, i === 0 || place < 0.1 ? 'star' : place < 0.4 ? 'established' : place < 0.8 ? 'hope' : 'development');
  });
  return ranks;
};

/** What the contract guarantees him each week: the allowance, plus the advance spread over the contract. */
export const payOf = (contract: Contract): number => Math.round(contract.weeklyAllowance + contract.advance / Math.max(1, contract.endTick - contract.startTick));

/** Some artists lift the whole label. Always the same ones. */
export const isLeader = (artistId: string): boolean => hashString(`leader:${artistId}`) % 100 < MORALE.leaderShare;

/** The best-paid artist of a lower rank who earns clearly more than him, or null. */
const wrongedBy = (world: World, labelId: string, ranks: Map<string, Rank>, artist: Artist): { name: string; pay: number; mine: number } | null => {
  const rank = ranks.get(artist.id);
  const contract = contractOf(world, artist.id);
  if (!rank || !contract) return null;
  const mine = payOf(contract);
  let worst: { name: string; pay: number } | null = null;
  for (const other of rosterOf(world, labelId)) {
    const theirs = ranks.get(other.id);
    const deal = contractOf(world, other.id);
    if (!theirs || !deal || RANKS.indexOf(theirs) <= RANKS.indexOf(rank)) continue;
    const pay = payOf(deal);
    if (pay > mine * (1 + MORALE.injusticeMargin) && (!worst || pay > worst.pay)) worst = { name: other.name, pay };
  }
  return worst ? { ...worst, mine } : null;
};

const coachOn = (world: World, labelId: string, artistId: string): boolean => staffOf(world, labelId).some((m) => m.role === 'coach' && m.focusId === artistId);

const scheduledFor = (world: World, artistId: string): boolean => world.songs.some((s) => s.artistId === artistId && s.state === 'scheduled');

/* ---------------------------------- Worries ---------------------------------- */

export interface Worry {
  kind: WorryKind;
  text: string;
  /** The other artist it is about, if any. */
  name?: string;
  weeks?: number;
}

/** What bothers an artist right now, the worst first. */
export const worriesOf = (world: World, labelId: string, artist: Artist, ranks = ranksOf(world, labelId)): Worry[] => {
  const worries: Worry[] = [];
  const contract = contractOf(world, artist.id);
  const rank = ranks.get(artist.id);
  if (!contract || !rank) return worries;
  if (artist.morale < MORALE.strike) worries.push({ kind: 'strike', text: 'En grève : ni studio, ni concert, ni tournée.' });
  else if (artist.wantsOut) worries.push({ kind: 'out', text: 'Demande à partir. Il refuse parfois d’aller en studio.' });
  const wronged = wrongedBy(world, labelId, ranks, artist);
  if (wronged) worries.push({ kind: 'injustice', name: wronged.name, text: `${wronged.name} a un rang plus bas mais gagne plus (${wronged.pay.toLocaleString('fr-FR')} € contre ${wronged.mine.toLocaleString('fr-FR')} € par semaine).` });
  const every = MORALE.releaseEvery[rank];
  const since = world.tick - Math.max(artist.lastReleaseTick, contract.startTick);
  if (every !== null && since > every && !scheduledFor(world, artist.id))
    worries.push({ kind: 'late', weeks: since, text: `Pas de son depuis ${since} semaines. Il en attend un toutes les ${every}.` });
  if (artist.jealous && world.tick - artist.jealous.tick < MORALE.jealousWeeks)
    worries.push({ kind: 'jealous', name: artist.jealous.name, text: `Jaloux de la grosse promo de ${artist.jealous.name}.` });
  const idle = world.tick - artist.lastActiveTick;
  if (idle > MORALE.asideTicks && !coachOn(world, labelId, artist.id)) worries.push({ kind: 'aside', weeks: idle, text: `Mis de côté : rien fait depuis ${idle} semaines.` });
  if (artist.energy < 20) worries.push({ kind: 'tired', text: 'Épuisé.' });
  return worries;
};

/** Why the artist will not work this week, or null. Strike: nothing at all. Very low: sometimes no studio. */
export const moraleBlock = (world: World, artist: Artist, what: 'studio' | 'gig' | 'tour'): string | null => {
  const contract = contractOf(world, artist.id);
  const label = contract ? world.labels[contract.labelId] : undefined;
  if (!label || label.kind !== 'player') return null;
  if (artist.morale < MORALE.strike) return `${artist.name} est en grève. Remonte-lui le moral dans l’onglet Dynamique.`;
  if (what === 'studio' && artist.morale < MORALE.refuse && rngFor(world.seed, world.tick, `refuse:${artist.id}`).chance(MORALE.refuseChance))
    return `${artist.name} n’a pas envie d’aller en studio cette semaine : son moral est trop bas.`;
  return null;
};

/* ---------------------------------- What the label can do ---------------------------------- */

const weeksBefore = (last: number | undefined, every: number, tick: number): number => (last === undefined ? 0 : Math.max(0, every - (tick - last)));

/** A bonus or a trip for one artist, or a party for the whole label. */
export const cheerUp = (world: World, label: Label, kind: CheerKind, artistId: string | null): void => {
  const cheer = MORALE.cheers[kind] ?? fail('Action inconnue.');
  const cost = cheer.cost * label.tier;
  if (kind === 'party') {
    const roster = rosterOf(world, label.id);
    if (roster.length === 0) fail('Personne à inviter.');
    const wait = weeksBefore(label.partyTick, cheer.every, world.tick);
    if (wait > 0) fail(`Prochaine soirée possible dans ${wait} semaine${wait > 1 ? 's' : ''}.`);
    if (cost > label.cash) fail(`Pas assez de cash : la soirée coûte ${cost.toLocaleString('fr-FR')} €.`);
    label.cash -= cost;
    label.partyTick = world.tick;
    for (const artist of roster) artist.morale = clamp(artist.morale + cheer.morale, 0, 100);
    return;
  }
  const artist = (artistId ? world.artists[artistId] : undefined) ?? fail('Artiste introuvable.');
  if (contractOf(world, artist.id)?.labelId !== label.id) fail(`${artist.name} n’est pas dans ton label.`);
  const wait = weeksBefore(artist.cheers?.[kind], cheer.every, world.tick);
  if (wait > 0) fail(`Encore ${wait} semaine${wait > 1 ? 's' : ''} avant de refaire ça pour ${artist.name}.`);
  if (cost > label.cash) fail(`Pas assez de cash : ça coûte ${cost.toLocaleString('fr-FR')} €.`);
  label.cash -= cost;
  artist.cheers = { ...artist.cheers, [kind]: world.tick };
  artist.morale = clamp(artist.morale + cheer.morale, 0, 100);
  // The trip also ends the blank page.
  if (kind === 'trip') artist.creativeFatigue = 0;
};

/** Raises the weekly allowance just enough to end an injustice. */
export const raisePay = (world: World, label: Label, artistId: string): void => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  const contract = contractOf(world, artistId);
  if (!contract || contract.labelId !== label.id) fail(`${artist.name} n’est pas dans ton label.`);
  const wronged = wrongedBy(world, label.id, ranksOf(world, label.id), artist) ?? fail(`${artist.name} n’a pas de souci de salaire.`);
  contract!.weeklyAllowance += Math.ceil(wronged.pay - wronged.mine);
  artist.morale = clamp(artist.morale + 2, 0, 100);
};

/* ---------------------------------- Weekly ---------------------------------- */

const BUBBLES: Record<WorryKind | 'happy' | 'fine', string[]> = {
  strike: ['Je ne remets pas les pieds au studio. C’est la grève.', 'Grève illimitée. Enfin, jusqu’à ce qu’on me parle gentiment.', 'J’ai fait une pancarte. Elle dit « non ».'],
  out: ['Je réfléchis à mon avenir… ailleurs.', 'Mon cousin dit que l’herbe est plus verte dans un autre label.', 'J’ai liké la photo d’un autre label. C’est un signe.'],
  injustice: ['J’ai appris combien gagne {name}. On en parle ?', '{name} gagne plus que moi ? Sérieusement ?', 'Je fais les gros sons et c’est {name} qui a la grosse paie. Logique.'],
  late: ['Ça fait {weeks} semaines sans son. Mes fans croient que j’ai arrêté.', 'Ma mère me demande si j’ai changé de métier.', 'J’ai des couplets plein mon téléphone. On les sort quand ?'],
  jealous: ['{name} a eu une promo de star. Moi, un post sur un mur.', 'Les affiches de {name} sont partout. Et les miennes ?', 'Ah, {name} a droit au panneau géant. Super. Bravo.'],
  aside: ['Je suis toujours dans le label ? Quelqu’un ?', 'J’ai regardé le plafond toute la semaine. Il est joli.', 'Si on a besoin de moi, je suis sur le canapé.'],
  tired: ['Je dors debout. Un concert de plus et je chante en ronflant.', 'Mon lit me manque. On ne s’est pas vus depuis des jours.'],
  happy: ['Je me sens invincible. On retourne en studio ?', 'Meilleur label du monde. Je l’ai presque tatoué.', 'J’ai la pêche. Donnez-moi un micro.'],
  fine: ['Tranquille. On avance.', 'Ça va. J’ai trouvé une rime avec « label ». Non, en fait.', 'Rien à signaler. Enfin, j’ai faim.'],
};

const say = (text: string, worry?: Worry): string => text.replace('{name}', worry?.name ?? '').replace('{weeks}', String(worry?.weeks ?? ''));

/**
 * Weekly, for every label of a player: jealousy over this week's promos, late releases, injustice, artists left aside,
 * the coach's attention, then morale settles toward calm when nothing is wrong. Asking to leave and strikes are told.
 */
export const tickMorale = (world: World, tell: (labelId: string, text: string) => void, news: (text: string) => void): void => {
  const tick = world.tick;
  for (const label of Object.values(world.labels)) {
    if (label.kind !== 'player' || label.bankrupt) continue;
    const roster = rosterOf(world, label.id);
    if (roster.length === 0) continue;
    const ranks = ranksOf(world, label.id);
    // Jealousy: the biggest promo out this week, against the last promo of the artists of the same rank or above.
    const out = world.songs.filter((s) => s.labelId === label.id && s.state === 'released' && s.releaseTick === tick).sort((a, b) => b.marketingCost - a.marketingCost)[0];
    if (out && out.marketingCost >= MORALE.jealousMin * label.tier) {
      const star = world.artists[out.artistId];
      const level = RANKS.indexOf(ranks.get(out.artistId) ?? 'development');
      for (const artist of roster) {
        if (!star || artist.id === star.id || RANKS.indexOf(ranks.get(artist.id) ?? 'development') > level) continue;
        const own = world.songs.filter((s) => s.artistId === artist.id && s.state === 'released').reduce((best, s) => ((s.releaseTick ?? 0) > (best?.releaseTick ?? -1) ? s : best), undefined as (typeof world.songs)[number] | undefined);
        if (out.marketingCost < MORALE.jealousRatio * (own?.marketingCost ?? 0)) continue;
        artist.morale = clamp(artist.morale + MORALE.jealousy, 0, 100);
        artist.jealous = { name: star.name, tick };
      }
    }
    const calm = MORALE.calm + (roster.some((a) => isLeader(a.id)) ? MORALE.leaderCalm : 0);
    for (const artist of roster) {
      const worries = worriesOf(world, label.id, artist, ranks);
      let change = 0;
      const wronged = worries.find((w) => w.kind === 'injustice');
      if (wronged && artist.grudge !== wronged.name) tell(label.id, `${artist.name} a appris que ${wronged.name} gagne plus que lui. Il le prend mal : regarde l’onglet Dynamique.`);
      artist.grudge = wronged?.name;
      if (!artist.grudge) delete artist.grudge;
      for (const worry of worries) {
        if (worry.kind === 'late') change += MORALE.late;
        if (worry.kind === 'injustice') change += MORALE.injustice;
        if (worry.kind === 'aside') change += MORALE.aside;
      }
      if (coachOn(world, label.id, artist.id)) change += MORALE.coachFocus;
      // Nothing wrong this week: he calms down, up or down.
      const bothered = worries.some((w) => w.kind !== 'strike' && w.kind !== 'out' && (w.kind !== 'jealous' || artist.jealous?.tick === tick));
      if (!bothered) change += artist.morale < calm ? Math.min(MORALE.drift, calm - artist.morale) : -Math.min(MORALE.drift, artist.morale - calm);
      artist.morale = clamp(artist.morale + change, 0, 100);
      // Asking to leave, the strike, and the way back.
      if (artist.morale < MORALE.strike && !artist.onStrike) {
        artist.onStrike = true;
        tell(label.id, `${artist.name} se met en grève : plus de studio, de concert ni de tournée tant que son moral n’est pas remonté.`);
      } else if (artist.onStrike && artist.morale >= MORALE.strike) {
        artist.onStrike = false;
        tell(label.id, `${artist.name} arrête la grève.`);
      }
      if (artist.morale < MORALE.refuse && !artist.wantsOut) {
        artist.wantsOut = true;
        tell(label.id, `${artist.name} demande à partir. Son moral est au plus bas.`);
        news(`${artist.name} voudrait quitter ${label.name}.`);
      } else if (artist.wantsOut && artist.morale >= MORALE.backToWork) {
        artist.wantsOut = false;
        tell(label.id, `${artist.name} a retrouvé le sourire : il ne demande plus à partir.`);
      }
    }
    // Now and then, one of them says how he feels: the worst worry first.
    const rng = rngFor(world.seed, tick, `bubble:${label.id}`);
    if (rng.chance(MORALE.bubbleChance)) {
      const artist = rng.pick(roster);
      const worry = worriesOf(world, label.id, artist, ranks)[0];
      const kind = worry?.kind ?? (artist.morale >= MORALE.happy ? 'happy' : 'fine');
      tell(label.id, `« ${say(rng.pick(BUBBLES[kind]), worry)} » — ${artist.name}.`);
    }
  }
};

/* ---------------------------------- View ---------------------------------- */

export interface DynamicsArtist {
  id: string;
  name: string;
  genre: string;
  rank: Rank;
  rankName: string;
  morale: number;
  leader: boolean;
  /** Guaranteed pay per week. */
  pay: number;
  /** Weeks between releases he expects, or null. */
  expects: number | null;
  /** Weeks since his last release with the label, or null if none yet. */
  sinceRelease: number | null;
  worries: Worry[];
  /** Weeks before each action is possible again (0: now). */
  bonusIn: number;
  tripIn: number;
  /** Extra allowance per week that would end an injustice, or null. */
  raise: number | null;
}

export interface DynamicsView {
  /** Average morale, the higher ranks counting more. */
  labelMorale: number;
  leaders: string[];
  calm: number;
  partyIn: number;
  cheers: Record<CheerKind, { name: string; cost: number; morale: number; every: number }>;
  thresholds: { trouble: number; refuse: number; strike: number; happy: number };
  artists: DynamicsArtist[];
}

/** What a label sees of the mood of its artists. */
export const dynamicsView = (world: World, label: Label): DynamicsView => {
  const ranks = ranksOf(world, label.id);
  const roster = rosterOf(world, label.id).sort((a, b) => RANKS.indexOf(ranks.get(a.id) ?? 'development') - RANKS.indexOf(ranks.get(b.id) ?? 'development') || b.morale - a.morale);
  let weight = 0;
  let sum = 0;
  const artists = roster.map((artist): DynamicsArtist => {
    const rank = ranks.get(artist.id) ?? 'development';
    const contract = contractOf(world, artist.id);
    const wronged = wrongedBy(world, label.id, ranks, artist);
    weight += MORALE.weights[rank];
    sum += MORALE.weights[rank] * artist.morale;
    const released = contract && artist.lastReleaseTick >= contract.startTick;
    return {
      id: artist.id,
      name: artist.name,
      genre: artist.genre,
      rank,
      rankName: RANK_NAMES[rank],
      morale: Math.round(artist.morale),
      leader: isLeader(artist.id),
      pay: contract ? payOf(contract) : 0,
      expects: MORALE.releaseEvery[rank],
      sinceRelease: released ? world.tick - artist.lastReleaseTick : null,
      worries: worriesOf(world, label.id, artist, ranks),
      bonusIn: weeksBefore(artist.cheers?.bonus, MORALE.cheers.bonus.every, world.tick),
      tripIn: weeksBefore(artist.cheers?.trip, MORALE.cheers.trip.every, world.tick),
      raise: wronged ? Math.ceil(wronged.pay - wronged.mine) : null,
    };
  });
  const leaders = roster.filter((a) => isLeader(a.id)).map((a) => a.name);
  return {
    labelMorale: weight > 0 ? Math.round(sum / weight) : 0,
    leaders,
    calm: MORALE.calm + (leaders.length > 0 ? MORALE.leaderCalm : 0),
    partyIn: weeksBefore(label.partyTick, MORALE.cheers.party.every, world.tick),
    cheers: Object.fromEntries(Object.entries(MORALE.cheers).map(([k, c]) => [k, { ...c, cost: c.cost * label.tier }])) as DynamicsView['cheers'],
    thresholds: { trouble: MORALE.trouble, refuse: MORALE.refuse, strike: MORALE.strike, happy: MORALE.happy },
    artists,
  };
};
