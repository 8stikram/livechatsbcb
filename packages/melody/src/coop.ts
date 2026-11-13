// Cooperation between players (docs/melody-tycoon/05-contrats-marche-labels.md 5.9, owner's choices 2026-11-13).
// - Allies and enemies, 2 of each at most. An alliance needs both labels; an enemy is declared alone.
//   Between players you only attack your enemies (clash, shade, press conference, chart duel), with 25 % more
//   effect; the labels of the game stay free targets. Allies never fight; they get a better featuring (+2 quality,
//   more crossed fans), no shame on a late loan payment, and an alert when the ally nears bankruptcy.
//   Filling an empty place is free; breaking an alliance or ending a war, once a season.
// - Bailout: a gift, or a loan with the rate the lender picks (0, 5 or 10 %), paid back a bit each week over 4, 8 or
//   12 weeks. A week it cannot pay waits, with reputation −1 (not between allies). No cap.
import { CFG } from './config.ts';
import { clamp } from './rng.ts';
import type { Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export const COOP = {
  maxAllies: 2,
  maxEnemies: 2,
  offerWeeks: 2,
  enemyBoost: 1.25,
  allyQuality: 2,
  allyFans: 1.5,
  rates: [0, 5, 10] as const,
  weeks: [4, 8, 12] as const,
  lateReputation: 1,
  /** An ally in danger is told about again after this many weeks. */
  alertWeeks: 4,
  maxLoans: 100,
} as const;

export interface AllyOffer {
  id: string;
  fromLabelId: string;
  toLabelId: string;
  tick: number;
}

export type FriendLoanStatus = 'offered' | 'running' | 'done' | 'refused' | 'expired';

export interface FriendLoan {
  id: string;
  lenderId: string;
  borrowerId: string;
  amount: number;
  /** Percent on top, paid with the weekly parts. */
  rate: number;
  weeks: number;
  /** What is still owed, interest included. */
  remaining: number;
  perWeek: number;
  status: FriendLoanStatus;
  tick: number;
  /** Weeks it could not pay. */
  late: number;
}

const news = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }];
};

const season = (world: World): number => Math.floor(world.tick / CFG.ticksPerSeason) + 1;
const playerLabel = (world: World, id: string): Label | null => {
  const l = world.labels[id];
  return l && l.kind === 'player' && !l.bankrupt ? l : null;
};

export const alliesOf = (label: Label | undefined): string[] => label?.allies ?? [];
export const enemiesOf = (label: Label | undefined): string[] => label?.enemies ?? [];

export const areAllies = (world: World, a: string, b: string): boolean => alliesOf(world.labels[a]).includes(b);

/** Effect of an attack between two labels: 25 % more when one has declared the other an enemy. */
export const enemyBoost = (world: World, a: string, b: string): number =>
  enemiesOf(world.labels[a]).includes(b) || enemiesOf(world.labels[b]).includes(a) ? COOP.enemyBoost : 1;

/** Between players, one only attacks one's enemies. The labels of the game are free targets. */
export const checkTarget = (world: World, label: Label, targetLabelId: string): void => {
  const target = world.labels[targetLabelId];
  if (!target || target.kind !== 'player') return;
  if (alliesOf(label).includes(target.id)) fail(`${target.name} est ton allié : pas d’attaque entre alliés.`);
  if (!enemiesOf(label).includes(target.id)) fail(`Déclare d’abord ${target.name} comme ennemi (onglet Label) pour l’attaquer.`);
};

/* ---------------------------------- Allies and enemies ---------------------------------- */

const offersOf = (world: World): AllyOffer[] => (world.allyOffers ??= []);

/** Breaking an alliance or ending a war: once a season. */
const useChange = (world: World, label: Label): void => {
  if (label.relationSeason === season(world)) fail('Tu as déjà changé tes alliés ou ennemis cette saison. Attends la prochaine.');
  label.relationSeason = season(world);
};

export const askAlly = (world: World, label: Label, targetLabelId: string): AllyOffer => {
  const target = playerLabel(world, targetLabelId);
  if (!target || target.id === label.id) return fail('On ne s’allie qu’avec un autre joueur.');
  if (alliesOf(label).includes(target.id)) fail(`${target.name} est déjà ton allié.`);
  if (enemiesOf(label).includes(target.id)) fail(`${target.name} est ton ennemi. Arrête d’abord la guerre.`);
  if (alliesOf(label).length >= COOP.maxAllies) fail(`${COOP.maxAllies} alliés au plus.`);
  if (offersOf(world).some((o) => (o.fromLabelId === label.id && o.toLabelId === target.id) || (o.fromLabelId === target.id && o.toLabelId === label.id)))
    fail('Une proposition d’alliance est déjà en cours entre vous.');
  const offer: AllyOffer = { id: `ally_${world.nextId++}`, fromLabelId: label.id, toLabelId: target.id, tick: world.tick };
  offersOf(world).push(offer);
  news(world, `${label.name} propose une alliance à ${target.name}.`);
  return offer;
};

export const answerAlly = (world: World, label: Label, offerId: string, accept: boolean): void => {
  const offer = offersOf(world).find((o) => o.id === offerId) ?? fail('Proposition introuvable.');
  if (offer.toLabelId !== label.id) fail('Cette proposition ne t’est pas adressée.');
  world.allyOffers = offersOf(world).filter((o) => o !== offer);
  const from = playerLabel(world, offer.fromLabelId);
  if (!accept || !from) return;
  if (alliesOf(label).length >= COOP.maxAllies) fail(`Tu as déjà ${COOP.maxAllies} alliés.`);
  if (alliesOf(from).length >= COOP.maxAllies) fail(`${from.name} a déjà ${COOP.maxAllies} alliés.`);
  if (enemiesOf(label).includes(from.id) || enemiesOf(from).includes(label.id)) fail('Vous êtes ennemis : arrêtez d’abord la guerre.');
  label.allies = [...alliesOf(label), from.id];
  from.allies = [...alliesOf(from), label.id];
  news(world, `${from.name} et ${label.name} deviennent alliés.`);
};

export const breakAlly = (world: World, label: Label, otherId: string): void => {
  const other = world.labels[otherId];
  if (!other || !alliesOf(label).includes(otherId)) return fail('Ce label n’est pas ton allié.');
  useChange(world, label);
  label.allies = alliesOf(label).filter((id) => id !== otherId);
  other.allies = alliesOf(other).filter((id) => id !== label.id);
  news(world, `${label.name} lâche son allié ${other.name}.`);
};

export const addEnemy = (world: World, label: Label, targetLabelId: string): void => {
  const target = playerLabel(world, targetLabelId);
  if (!target || target.id === label.id) return fail('On ne déclare ennemi qu’un autre joueur.');
  if (enemiesOf(label).includes(target.id)) fail(`${target.name} est déjà ton ennemi.`);
  if (alliesOf(label).includes(target.id)) fail(`${target.name} est ton allié. Lâche-le d’abord.`);
  if (enemiesOf(label).length >= COOP.maxEnemies) fail(`${COOP.maxEnemies} ennemis au plus.`);
  label.enemies = [...enemiesOf(label), target.id];
  news(world, `${label.name} déclare la guerre à ${target.name} !`);
};

export const removeEnemy = (world: World, label: Label, targetLabelId: string): void => {
  const target = world.labels[targetLabelId];
  if (!target || !enemiesOf(label).includes(targetLabelId)) return fail('Ce label n’est pas ton ennemi.');
  useChange(world, label);
  label.enemies = enemiesOf(label).filter((id) => id !== targetLabelId);
  news(world, `${label.name} enterre la hache de guerre avec ${target.name}.`);
};

/* ---------------------------------- Bailout ---------------------------------- */

const loansOf = (world: World): FriendLoan[] => (world.friendLoans ??= []);

export const inDanger = (label: Label): boolean => label.cash < 0 || label.distress > 0;

const saved = (world: World, from: Label, to: Label): void => {
  if (inDanger(to)) news(world, `${from.name} vient au secours de ${to.name}, au bord de la faillite. Respect.`);
};

export const giveMoney = (world: World, label: Label, targetLabelId: string, amount: number): void => {
  const target = playerLabel(world, targetLabelId);
  if (!target || target.id === label.id) return fail('On ne donne qu’à un autre joueur.');
  if (!Number.isInteger(amount) || amount < 100) fail('Donne au moins 100 €.');
  if (amount > label.cash) fail('Tu n’as pas assez de cash.');
  label.cash -= amount;
  saved(world, label, target);
  target.cash += amount;
};

export const offerLoan = (world: World, label: Label, targetLabelId: string, amount: number, rate: number, weeks: number): FriendLoan => {
  const target = playerLabel(world, targetLabelId);
  if (!target || target.id === label.id) return fail('On ne prête qu’à un autre joueur.');
  if (!Number.isInteger(amount) || amount < 100) fail('Prête au moins 100 €.');
  if (amount > label.cash) fail('Tu n’as pas assez de cash.');
  if (!(COOP.rates as readonly number[]).includes(rate)) fail('Taux : 0, 5 ou 10 %.');
  if (!(COOP.weeks as readonly number[]).includes(weeks)) fail('Durée : 4, 8 ou 12 semaines.');
  if (loansOf(world).some((l) => l.status === 'offered' && l.lenderId === label.id && l.borrowerId === target.id)) fail('Tu lui as déjà proposé un prêt.');
  if (loansOf(world).length >= COOP.maxLoans) fail('Trop de prêts sur ce serveur. Réessaie plus tard.');
  const total = Math.round(amount * (1 + rate / 100));
  const loan: FriendLoan = {
    id: `floan_${world.nextId++}`,
    lenderId: label.id,
    borrowerId: target.id,
    amount,
    rate,
    weeks,
    remaining: total,
    perWeek: Math.ceil(total / weeks),
    status: 'offered',
    tick: world.tick,
    late: 0,
  };
  loansOf(world).push(loan);
  return loan;
};

export const answerLoan = (world: World, label: Label, loanId: string, accept: boolean): void => {
  const loan = loansOf(world).find((l) => l.id === loanId) ?? fail('Prêt introuvable.');
  if (loan.borrowerId !== label.id) fail('Ce prêt ne t’est pas proposé.');
  if (loan.status !== 'offered') fail('Ce prêt a déjà une réponse.');
  if (!accept) {
    loan.status = 'refused';
    return;
  }
  const lender = world.labels[loan.lenderId];
  if (!lender || lender.cash < loan.amount) fail('Le prêteur n’a plus assez de cash.');
  lender!.cash -= loan.amount;
  saved(world, lender!, label);
  label.cash += loan.amount;
  loan.status = 'running';
  loan.tick = world.tick;
};

/** Each week: loan parts, offers that expire, and the alerts for allies in danger. */
export const tickCoop = (world: World, pay: (labelId: string, amount: number) => void, tell: (labelId: string, text: string) => void): void => {
  world.allyOffers = offersOf(world).filter((o) => {
    const keep = world.tick - o.tick < COOP.offerWeeks && playerLabel(world, o.fromLabelId) && playerLabel(world, o.toLabelId);
    if (!keep) tell(o.fromLabelId, `${world.labels[o.toLabelId]?.name ?? '?'} n’a pas répondu à ta proposition d’alliance.`);
    return keep;
  });
  for (const loan of loansOf(world)) {
    if (loan.status === 'offered' && world.tick - loan.tick >= COOP.offerWeeks) loan.status = 'expired';
    if (loan.status !== 'running') continue;
    const borrower = world.labels[loan.borrowerId];
    const lender = world.labels[loan.lenderId];
    if (!borrower || borrower.bankrupt || !lender) {
      loan.status = 'done';
      if (lender && borrower) tell(lender.id, `${borrower.name} a fait faillite : ton prêt ne sera pas remboursé.`);
      continue;
    }
    const part = Math.min(loan.perWeek, loan.remaining);
    if (borrower.cash < part) {
      loan.late += 1;
      const friends = areAllies(world, borrower.id, lender.id);
      if (!friends) borrower.reputation = clamp(borrower.reputation - COOP.lateReputation, 0, 100);
      tell(borrower.id, `Pas assez de cash pour rembourser ${lender.name} cette semaine (${part.toLocaleString('fr-FR')} €) : c’est reporté.${friends ? '' : ` Réputation −${COOP.lateReputation}.`}`);
      tell(lender.id, `${borrower.name} n’a pas pu te rembourser cette semaine : c’est reporté.`);
      continue;
    }
    pay(borrower.id, -part);
    pay(lender.id, part);
    loan.remaining -= part;
    if (loan.remaining <= 0) {
      loan.status = 'done';
      tell(lender.id, `${borrower.name} a fini de te rembourser.`);
      tell(borrower.id, `Prêt de ${lender.name} remboursé en entier.`);
    }
  }
  world.friendLoans = loansOf(world).filter((l) => l.status === 'offered' || l.status === 'running' || world.tick - l.tick < 12);
  // Allies near bankruptcy.
  for (const label of Object.values(world.labels)) {
    if (label.kind !== 'player' || label.bankrupt) continue;
    if (!inDanger(label)) {
      delete label.dangerTick;
      continue;
    }
    if (label.dangerTick !== undefined && world.tick - label.dangerTick < COOP.alertWeeks) continue;
    label.dangerTick = world.tick;
    for (const ally of alliesOf(label)) tell(ally, `Alerte : ton allié ${label.name} est en danger (cash ${Math.round(label.cash).toLocaleString('fr-FR')} €). Tu peux l’aider depuis l’onglet Label.`);
  }
};

/* ---------------------------------- View ---------------------------------- */

export interface RelationsView {
  allies: Array<{ id: string; name: string; danger: boolean }>;
  enemies: Array<{ id: string; name: string }>;
  /** Players who declared you their enemy. */
  enemyOf: Array<{ id: string; name: string }>;
  /** The other players: who can be asked or declared. */
  players: Array<{ id: string; name: string; danger: boolean; cash: number }>;
  offersIn: Array<{ id: string; from: string }>;
  offersOut: Array<{ id: string; to: string }>;
  /** Breaking an alliance or ending a war is still possible this season. */
  canChange: boolean;
  loans: Array<{
    id: string;
    mine: 'lent' | 'borrowed';
    other: string;
    amount: number;
    rate: number;
    weeks: number;
    remaining: number;
    perWeek: number;
    status: FriendLoanStatus;
  }>;
  rates: readonly number[];
  weeks: readonly number[];
}

export const relationsView = (world: World, label: Label): RelationsView => {
  const name = (id: string): string => world.labels[id]?.name ?? '?';
  const players = Object.values(world.labels).filter((l) => l.kind === 'player' && !l.bankrupt && l.id !== label.id);
  return {
    allies: alliesOf(label).map((id) => ({ id, name: name(id), danger: world.labels[id] ? inDanger(world.labels[id]!) : false })),
    enemies: enemiesOf(label).map((id) => ({ id, name: name(id) })),
    enemyOf: players.filter((l) => enemiesOf(l).includes(label.id)).map((l) => ({ id: l.id, name: l.name })),
    players: players.map((l) => ({ id: l.id, name: l.name, danger: inDanger(l), cash: Math.round(l.cash) })),
    offersIn: offersOf(world).filter((o) => o.toLabelId === label.id).map((o) => ({ id: o.id, from: name(o.fromLabelId) })),
    offersOut: offersOf(world).filter((o) => o.fromLabelId === label.id).map((o) => ({ id: o.id, to: name(o.toLabelId) })),
    canChange: label.relationSeason !== season(world),
    loans: loansOf(world)
      .filter((l) => (l.lenderId === label.id || l.borrowerId === label.id) && l.status !== 'refused' && l.status !== 'expired')
      .map((l) => ({
        id: l.id,
        mine: l.lenderId === label.id ? ('lent' as const) : ('borrowed' as const),
        other: name(l.lenderId === label.id ? l.borrowerId : l.lenderId),
        amount: l.amount,
        rate: l.rate,
        weeks: l.weeks,
        remaining: l.remaining,
        perWeek: l.perWeek,
        status: l.status,
      })),
    rates: COOP.rates,
    weeks: COOP.weeks,
  };
};
