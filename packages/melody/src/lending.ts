// Lending an artist (docs/melody-tycoon/05-contrats-marche-labels.md, 5.4): the lender lists him for 4 to 14 weeks
// with a fee. A friend, or a label of the game, takes him. The borrower keeps 70 % of what he earns and the songs
// made during the loan; the lender gets the fee and the other 30 %. Fans and progress stay with the artist.
import { generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { artistValue, contractOf, fameTier, playGig, rosterOf } from './economy.ts';
import { rngFor } from './rng.ts';
import { SKILLS, skillsOf } from './skills.ts';
import { cancelSession, sessionOf } from './studio.ts';
import { tourOf } from './tours.ts';
import type { GenreId, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type LendingStatus = 'listed' | 'running' | 'done' | 'cancelled' | 'expired';

export interface Lending {
  id: string;
  lenderId: string;
  artistId: string;
  weeks: number;
  fee: number;
  status: LendingStatus;
  borrowerId: string | null;
  /** Last week the listing stays up. */
  listedUntil: number;
  startTick: number;
  untilTick: number;
  /** What the lender got from the 30 % so far. */
  earned: number;
  updatedTick: number;
}

export const LENDING = {
  minWeeks: 4,
  maxWeeks: 14,
  /** Share of what he earns that goes back to the lender. */
  share: 0.3,
  /** A listing nobody takes is removed after this many weeks. */
  listedWeeks: 4,
  /** A label of the game takes a listing with this chance a week, when the fee is fair. */
  npcChance: 0.3,
  /** Fair fee: this share of his weekly worth, per week. */
  fairShare: 0.3,
  keepTicks: 2,
  maxListedPerLabel: 3,
  maxPerWorld: 60,
  maxFee: 1e8,
};

const lendingsOf = (world: World): Lending[] => (world.lendings ??= []);

/** A fair fee for this many weeks: what the market would pay to have him. */
export const fairFee = (world: World, artistId: string, weeks: number): number => {
  const artist = world.artists[artistId];
  if (!artist) return 0;
  return Math.round((artistValue(artist) / 20) * weeks * LENDING.fairShare / 100) * 100;
};

/** The lender lists one of his artists for a loan. */
export const listLoan = (world: World, label: Label, artistId: string, weeks: number, fee: number): Lending => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  const contract = contractOf(world, artistId);
  if (!contract || contract.labelId !== label.id) fail(`${artist.name} n’est pas dans ton label.`);
  if (contract!.loan) fail(`${artist.name} est déjà prêté.`);
  if (world.auctions?.some((a) => a.artistId === artistId && (a.status === 'open' || a.status === 'signing'))) fail(`${artist.name} est aux enchères.`);
  const all = lendingsOf(world);
  if (all.some((l) => l.artistId === artistId && l.status === 'listed')) fail(`${artist.name} est déjà proposé en prêt.`);
  const w = Math.round(weeks);
  if (w < LENDING.minWeeks || w > LENDING.maxWeeks) fail(`Un prêt dure ${LENDING.minWeeks} à ${LENDING.maxWeeks} semaines.`);
  if (contract!.endTick - world.tick <= w + LENDING.listedWeeks) fail(`Son contrat finit trop tôt pour un prêt de ${w} semaines.`);
  const price = Math.round(fee);
  if (!(price >= 0 && price <= LENDING.maxFee)) fail('Choisis des frais de prêt.');
  if (all.filter((l) => l.lenderId === label.id && l.status === 'listed').length >= LENDING.maxListedPerLabel) fail(`Pas plus de ${LENDING.maxListedPerLabel} annonces de prêt à la fois.`);
  if (all.length >= LENDING.maxPerWorld) fail('Trop de prêts sur ce serveur. Réessaie la semaine prochaine.');
  const lending: Lending = {
    id: `ln${world.nextId}`,
    lenderId: label.id,
    artistId,
    weeks: w,
    fee: price,
    status: 'listed',
    borrowerId: null,
    listedUntil: world.tick + LENDING.listedWeeks,
    startTick: 0,
    untilTick: 0,
    earned: 0,
    updatedTick: world.tick,
  };
  world.nextId += 1;
  all.push(lending);
  return lending;
};

const lendingById = (world: World, id: string): Lending => lendingsOf(world).find((l) => l.id === id) ?? fail('Prêt introuvable.');

/** The lender removes his listing before anyone takes him. */
export const cancelListing = (world: World, label: Label, id: string): void => {
  const l = lendingById(world, id);
  if (l.lenderId !== label.id) fail('Ce n’est pas ton annonce.');
  if (l.status !== 'listed') fail('Ce prêt n’est plus en annonce.');
  l.status = 'cancelled';
  l.updatedTick = world.tick;
};

/** Why this listing cannot start now, or null. */
const startBlocked = (world: World, l: Lending): string | null => {
  const artist = world.artists[l.artistId];
  const contract = contractOf(world, l.artistId);
  if (!artist || !contract || contract.labelId !== l.lenderId || contract.loan) return 'Il n’est plus disponible.';
  if (contract.endTick - world.tick <= l.weeks) return 'Son contrat finit trop tôt.';
  if (sessionOf(world, l.lenderId)?.artistId === l.artistId) return 'Il est en studio chez son label.';
  if (tourOf(world, l.artistId)) return 'Il a une tournée prévue.';
  return null;
};

/** Hands the artist to the borrower: the fee is paid and the contract now points to him until the end. */
const begin = (world: World, l: Lending, borrower: Label): void => {
  const contract = contractOf(world, l.artistId)!;
  const lender = world.labels[l.lenderId];
  if (borrower.kind === 'player') borrower.cash -= l.fee;
  if (lender) {
    lender.cash += l.fee;
    lender.stats.revenueTotal += l.fee;
  }
  contract.labelId = borrower.id;
  contract.loan = { id: l.id, lenderId: l.lenderId, startTick: world.tick, until: world.tick + l.weeks };
  delete contract.releaseClause;
  world.gigs = world.gigs.filter((g) => g.artistId !== l.artistId);
  for (const t of world.transfers ?? []) {
    if (t.artistId === l.artistId && (t.status === 'pending' || t.status === 'agreed')) {
      t.status = 'cancelled';
      t.updatedTick = world.tick;
    }
  }
  l.status = 'running';
  l.borrowerId = borrower.id;
  l.startTick = world.tick;
  l.untilTick = world.tick + l.weeks;
  l.updatedTick = world.tick;
};

/** A friend borrows the artist: first come, first served. */
export const borrow = (world: World, label: Label, id: string): void => {
  const l = lendingById(world, id);
  if (l.status !== 'listed') fail('Ce prêt n’est plus disponible.');
  if (l.lenderId === label.id) fail('C’est ton artiste.');
  const blocked = startBlocked(world, l);
  if (blocked) fail(blocked);
  if (l.fee > label.cash) fail('Pas assez de cash pour les frais de prêt.');
  const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
  if (rosterOf(world, label.id).length >= max) fail('Ton effectif est complet pour ce palier.');
  begin(world, l, label);
};

/** The loan of this artist, as seen from his contract. */
export const loanOf = (world: World, artistId: string): { lenderId: string; until: number; startTick: number } | null => contractOf(world, artistId)?.loan ?? null;

/**
 * What the borrower keeps of an amount the artist earned for him; the lender's 30 % is paid through `pay`.
 * `since`: only money from songs made during the loan is shared.
 */
export const shareLoan = (world: World, artistId: string, labelId: string, amount: number, pay: (lenderId: string, cut: number) => void, since?: number): number => {
  const loan = contractOf(world, artistId)?.loan;
  if (!loan || contractOf(world, artistId)?.labelId !== labelId || amount <= 0) return amount;
  if (since !== undefined && since < loan.startTick) return amount;
  const cut = Math.round(amount * LENDING.share);
  if (cut <= 0) return amount;
  pay(loan.lenderId, cut);
  const l = lendingsOf(world).find((x) => x.id === loan.id);
  if (l) l.earned += cut;
  return amount - cut;
};

/** The artist goes back to his label: at the end of the loan, or when the borrower goes bankrupt. */
const giveBack = (world: World, l: Lending, tell: (labelId: string, text: string) => void): void => {
  const contract = world.contracts.find((c) => c.artistId === l.artistId && c.loan?.id === l.id);
  const artist = world.artists[l.artistId];
  const name = artist?.name ?? 'l’artiste';
  l.status = 'done';
  l.updatedTick = world.tick;
  if (!contract) return;
  const borrower = world.labels[contract.labelId];
  if (borrower && sessionOf(world, borrower.id)?.artistId === l.artistId) cancelSession(world, borrower);
  world.gigs = world.gigs.filter((g) => g.artistId !== l.artistId);
  delete contract.loan;
  const lender = world.labels[l.lenderId];
  if (!lender || lender.bankrupt) {
    world.contracts = world.contracts.filter((c) => c !== contract);
    if (borrower) tell(borrower.id, `${name} rentre de prêt, mais son label n’existe plus : il est libre.`);
    return;
  }
  contract.labelId = lender.id;
  tell(lender.id, `${name} rentre de prêt. Ta part pendant le prêt : ${l.earned.toLocaleString('fr-FR')} € (en plus des frais).`);
  if (borrower) tell(borrower.id, `Fin du prêt : ${name} rentre chez ${lender.name}. Ses sons faits chez toi restent à toi.`);
};

/** The borrower goes bankrupt: his borrowed artists go home first. */
export const returnLoans = (world: World, labelId: string, tell: (labelId: string, text: string) => void): void => {
  for (const l of lendingsOf(world)) if (l.status === 'running' && l.borrowerId === labelId) giveBack(world, l, tell);
};

/** What the borrowing label of the game earns with him in a week, roughly: the lender gets his 30 % of it. */
const npcWeekly = (world: World, artistId: string): number => {
  const artist = world.artists[artistId];
  if (!artist) return 0;
  return artist.fans * 0.012 + Math.max(0, playGig(artist).profit) * CFG.live.labelShare;
};

/** Weekly: labels of the game take fair listings, old listings go, loans end, and the lender gets his share from a label of the game. */
export const tickLending = (world: World, pay: (labelId: string, amount: number) => void, tell: (labelId: string, text: string) => void): void => {
  if (!world.lendings) return;
  for (const l of world.lendings) {
    const name = world.artists[l.artistId]?.name ?? 'ton artiste';
    if (l.status === 'running') {
      const borrower = l.borrowerId ? world.labels[l.borrowerId] : undefined;
      if (borrower?.kind === 'npc' && world.tick < l.untilTick) {
        const cut = Math.round(npcWeekly(world, l.artistId) * LENDING.share);
        if (cut > 0) {
          pay(l.lenderId, cut);
          l.earned += cut;
        }
      }
      if (world.tick >= l.untilTick) giveBack(world, l, tell);
      continue;
    }
    if (l.status !== 'listed') continue;
    if (startBlocked(world, l)) {
      l.status = 'cancelled';
      l.updatedTick = world.tick;
      continue;
    }
    if (world.tick >= l.listedUntil) {
      l.status = 'expired';
      l.updatedTick = world.tick;
      tell(l.lenderId, `Personne n’a emprunté ${name} : l’annonce est retirée.`);
      continue;
    }
    // A label of the game, big enough for him, takes him when the fee is fair.
    const rng = rngFor(world.seed, world.tick, `lend:${l.id}`);
    const artist = world.artists[l.artistId]!;
    const npcs = Object.values(world.labels).filter((x) => x.kind === 'npc' && !x.bankrupt && x.tier >= fameTier(artist));
    if (npcs.length > 0 && rng.chance(LENDING.npcChance) && l.fee <= fairFee(world, l.artistId, l.weeks) * rng.range(0.8, 1.3)) {
      const npc = rng.pick(npcs);
      begin(world, l, npc);
      tell(l.lenderId, `${npc.name} emprunte ${name} pour ${l.weeks} semaines : +${l.fee.toLocaleString('fr-FR')} €, puis 30 % de ce qu’il rapporte.`);
    }
  }
  world.lendings = world.lendings.filter((l) => l.status === 'listed' || l.status === 'running' || world.tick - l.updatedTick < LENDING.keepTicks);
};

/* ---------------------------------- View ---------------------------------- */

export interface LendingView {
  id: string;
  artistId: string;
  artistName: string;
  genre: GenreId;
  gen: number;
  fans: number;
  skills: string[];
  lenderName: string;
  borrowerName: string | null;
  /** lent: my artist; borrowed: I have him; offer: a friend's listing. */
  side: 'lent' | 'borrowed' | 'offer';
  weeks: number;
  fee: number;
  status: LendingStatus;
  weeksLeft: number;
  earned: number;
  /** Why I cannot borrow him now, or null. */
  blocked: string | null;
}

export const lendingsView = (world: World, labelId: string): LendingView[] => {
  const label = world.labels[labelId];
  return lendingsOf(world)
    .filter((l) => l.lenderId === labelId || l.borrowerId === labelId || l.status === 'listed')
    .map((l) => {
      const artist = world.artists[l.artistId];
      const side = l.lenderId === labelId ? 'lent' : l.borrowerId === labelId ? 'borrowed' : 'offer';
      const max = label ? (CFG.tiers.maxArtists[label.tier - 1] ?? 5) : 0;
      const blocked =
        side !== 'offer'
          ? null
          : (startBlocked(world, l) ??
            (!label ? 'Fonde ton label.' : l.fee > label.cash ? 'Pas assez de cash.' : rosterOf(world, labelId).length >= max ? 'Effectif complet.' : null));
      return {
        id: l.id,
        artistId: l.artistId,
        artistName: artist?.name ?? '?',
        genre: artist?.genre ?? 'pop',
        gen: artist ? generalRating(artist) : 0,
        fans: artist?.fans ?? 0,
        skills: skillsOf(l.artistId).map((id) => SKILLS[id].name),
        lenderName: world.labels[l.lenderId]?.name ?? '?',
        borrowerName: l.borrowerId ? (world.labels[l.borrowerId]?.name ?? '?') : null,
        side,
        weeks: l.weeks,
        fee: l.fee,
        status: l.status,
        weeksLeft: Math.max(0, (l.status === 'listed' ? l.listedUntil : l.untilTick) - world.tick),
        earned: l.earned,
        blocked,
      } satisfies LendingView;
    })
    .sort((a, b) => Number(a.status !== 'running') - Number(b.status !== 'running') || Number(a.side === 'offer') - Number(b.side === 'offer'));
};
