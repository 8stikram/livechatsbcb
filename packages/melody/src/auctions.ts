// Auctions between players (docs/melody-tycoon/05-contrats-marche-labels.md, 5.4): the seller sets a start price,
// 1 to 3 weeks and maybe a secret reserve. Friends bid, and one label of the game too, so an auction never falls flat.
// At the end the best bidder negotiates his contract with the artist; if he fails, the next one has his chance.
import { generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { artistValue, contractOf, fameTier, rosterOf } from './economy.ts';
import { clamp, rngFor } from './rng.ts';
import { SKILLS, skillsOf } from './skills.ts';
import { sessionOf } from './studio.ts';
import { TRANSFERS, type Transfer } from './transfers.ts';
import type { GenreId, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type AuctionStatus = 'open' | 'signing' | 'sold' | 'unsold' | 'cancelled';

export interface Bid {
  labelId: string;
  amount: number;
  tick: number;
}

export interface Auction {
  id: string;
  sellerId: string;
  artistId: string;
  start: number;
  /** Secret minimum price, or null. */
  reserve: number | null;
  endTick: number;
  bids: Bid[];
  status: AuctionStatus;
  /** The label of the game that wants him, and the most it will pay (hidden). */
  npc: { labelId: string; max: number } | null;
  /** Bidders already offered the artist, in order: the last one is negotiating now. */
  tried: string[];
  /** Players outbid since the last week, to tell them. */
  outbid: string[];
  updatedTick: number;
}

export const AUCTIONS = {
  minWeeks: 1,
  maxWeeks: 3,
  /** Smallest raise: this share of the best bid, and at least this much. */
  stepShare: 0.05,
  stepMin: 100,
  /** The label of the game pays at most this share of the artist's value. */
  npcMax: [0.55, 1] as const,
  /** Weeks an artist must stay before his label can sell him (as for a sale). */
  sellAfter: 8,
  /** Closed auctions are shown this long, then forgotten. */
  keepTicks: 2,
  maxOpenPerLabel: 2,
  maxPerWorld: 40,
  maxPrice: 1e9,
};

const auctionsOf = (world: World): Auction[] => (world.auctions ??= []);
const isOpen = (a: Auction): boolean => a.status === 'open' || a.status === 'signing';

/** The open auction of an artist, if any. */
export const auctionOf = (world: World, artistId: string): Auction | undefined => auctionsOf(world).find((a) => isOpen(a) && a.artistId === artistId);

const best = (a: Auction): Bid | undefined => a.bids[a.bids.length - 1];

/** The smallest bid accepted now. */
export const nextBid = (a: Auction): number => {
  const top = best(a);
  return top ? top.amount + Math.max(AUCTIONS.stepMin, Math.round((top.amount * AUCTIONS.stepShare) / 100) * 100) : a.start;
};

const push = (a: Auction, labelId: string, amount: number, tick: number): void => {
  const before = best(a);
  if (before && before.labelId !== labelId && !a.outbid.includes(before.labelId)) a.outbid.push(before.labelId);
  a.bids.push({ labelId, amount, tick });
  a.outbid = a.outbid.filter((id) => id !== labelId);
};

/** The label of the game outbids the players while its price allows it. */
const npcAnswer = (world: World, a: Auction): void => {
  if (!a.npc) return;
  // It sees that a reserve is not reached yet, like everyone: it goes up to it when its price allows.
  const reserve = a.reserve !== null && a.npc.max >= a.reserve ? a.reserve : 0;
  const top = best(a);
  if (top?.labelId === a.npc.labelId) {
    if (reserve > top.amount) push(a, a.npc.labelId, reserve, world.tick);
    return;
  }
  const amount = Math.max(nextBid(a), reserve);
  if (amount <= a.npc.max) push(a, a.npc.labelId, amount, world.tick);
};

const round100 = (x: number): number => Math.round(x / 100) * 100;

/** The seller puts one of his artists up for auction. */
export const startAuction = (world: World, label: Label, artistId: string, start: number, weeks: number, reserve: number | null): Auction => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  const contract = contractOf(world, artistId);
  if (!contract || contract.labelId !== label.id) fail(`${artist.name} n’est pas dans ton label.`);
  if (contract!.loan) fail(`${artist.name} est prêté : attends son retour.`);
  if (world.lendings?.some((l) => l.artistId === artistId && l.status === 'listed')) fail(`${artist.name} est proposé en prêt. Retire d’abord l’annonce.`);
  if (auctionOf(world, artistId)) fail(`${artist.name} est déjà aux enchères.`);
  const since = world.tick - contract!.startTick;
  if (since < AUCTIONS.sellAfter) fail(`${artist.name} vient de signer : tu pourras le vendre dans ${AUCTIONS.sellAfter - since} sem.`);
  if (sessionOf(world, label.id)?.artistId === artistId) fail('Il est en studio : finis ou quitte la session.');
  const w = Math.round(weeks);
  if (w < AUCTIONS.minWeeks || w > AUCTIONS.maxWeeks) fail(`Une enchère dure ${AUCTIONS.minWeeks} à ${AUCTIONS.maxWeeks} semaines.`);
  const price = Math.round(start);
  if (!(price >= 1 && price <= AUCTIONS.maxPrice)) fail('Choisis un prix de départ.');
  const secret = reserve === null ? null : Math.round(reserve);
  if (secret !== null && !(secret >= price && secret <= AUCTIONS.maxPrice)) fail('Le prix de réserve doit être au moins le prix de départ.');
  const all = auctionsOf(world);
  if (all.filter((a) => isOpen(a) && a.sellerId === label.id).length >= AUCTIONS.maxOpenPerLabel) fail(`Pas plus de ${AUCTIONS.maxOpenPerLabel} enchères à la fois.`);
  if (all.length >= AUCTIONS.maxPerWorld) fail('Trop d’enchères sur ce serveur. Réessaie la semaine prochaine.');
  const id = `au${world.nextId}`;
  world.nextId += 1;
  // One label of the game, big enough for him, wants him up to a hidden price.
  const rng = rngFor(world.seed, world.tick, `auction:${id}`);
  const npcs = Object.values(world.labels).filter((l) => l.kind === 'npc' && !l.bankrupt && l.tier >= fameTier(artist));
  const npc = npcs.length > 0 ? { labelId: rng.pick(npcs).id, max: round100(artistValue(artist) * rng.range(AUCTIONS.npcMax[0], AUCTIONS.npcMax[1])) } : null;
  const auction: Auction = {
    id,
    sellerId: label.id,
    artistId,
    start: price,
    reserve: secret,
    endTick: world.tick + w,
    bids: [],
    status: 'open',
    npc,
    tried: [],
    outbid: [],
    updatedTick: world.tick,
  };
  all.push(auction);
  npcAnswer(world, auction);
  return auction;
};

const auctionById = (world: World, id: string): Auction => auctionsOf(world).find((a) => a.id === id) ?? fail('Enchère introuvable.');

/** A friend bids. The label of the game may answer at once. */
export const bid = (world: World, label: Label, auctionId: string, amount: number): void => {
  const a = auctionById(world, auctionId);
  if (a.status !== 'open' || a.endTick <= world.tick) fail('Cette enchère est finie.');
  if (a.sellerId === label.id) fail('Tu ne peux pas enchérir sur ton artiste.');
  const artist = world.artists[a.artistId] ?? fail('Artiste introuvable.');
  if (best(a)?.labelId === label.id) fail('Tu as déjà la meilleure offre.');
  const price = Math.round(amount);
  const min = nextBid(a);
  if (!(price >= min)) fail(`Il faut au moins ${min.toLocaleString('fr-FR')} €.`);
  if (price > AUCTIONS.maxPrice) fail('Montant trop grand.');
  if (price > label.cash) fail('Pas assez de cash pour cette offre.');
  const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
  if (rosterOf(world, label.id).length >= max) fail('Ton effectif est complet pour ce palier.');
  if (!stillHis(world, a)) fail(`${artist.name} n’est plus dans ce label.`);
  push(a, label.id, price, world.tick);
  a.updatedTick = world.tick;
  npcAnswer(world, a);
};

/** The seller takes his artist back, while no friend has bid. */
export const cancelAuction = (world: World, label: Label, auctionId: string): void => {
  const a = auctionById(world, auctionId);
  if (a.sellerId !== label.id) fail('Ce n’est pas ton enchère.');
  if (a.status !== 'open') fail('Cette enchère est déjà finie.');
  if (a.bids.some((b) => world.labels[b.labelId]?.kind === 'player')) fail('Un ami a déjà enchéri : tu ne peux plus l’arrêter.');
  a.status = 'cancelled';
  a.updatedTick = world.tick;
};

const stillHis = (world: World, a: Auction): boolean => contractOf(world, a.artistId)?.labelId === a.sellerId && !contractOf(world, a.artistId)?.loan;

/** The best offer of each bidder not tried yet, highest first, above the reserve. */
const queue = (a: Auction): Bid[] => {
  const last = new Map<string, Bid>();
  for (const b of a.bids) last.set(b.labelId, b);
  return [...last.values()]
    .filter((b) => !a.tried.includes(b.labelId) && (a.reserve === null || b.amount >= a.reserve))
    .sort((x, y) => y.amount - x.amount || x.tick - y.tick);
};

/** Sells the artist to the label of the game at once: it does not negotiate. */
const sellToNpc = (world: World, a: Auction, b: Bid): void => {
  const seller = world.labels[a.sellerId];
  if (seller) {
    seller.cash += b.amount;
    seller.stats.revenueTotal += b.amount;
  }
  world.contracts = world.contracts.filter((c) => c.artistId !== a.artistId);
  world.contracts.push({ artistId: a.artistId, labelId: b.labelId, startTick: world.tick, endTick: world.tick + 104, advance: 0, unrecouped: 0, weeklyAllowance: 0, royaltyRate: 0.2 });
  world.gigs = world.gigs.filter((g) => g.artistId !== a.artistId);
  for (const t of world.transfers ?? []) {
    if (t.artistId === a.artistId && (t.status === 'pending' || t.status === 'agreed')) {
      t.status = 'cancelled';
      t.updatedTick = world.tick;
    }
  }
};

/** Offers the artist to the next bidder in line; returns false when nobody is left. */
const offerNext = (world: World, a: Auction, tell: (labelId: string, text: string) => void): boolean => {
  const name = world.artists[a.artistId]?.name ?? 'ton artiste';
  for (const b of queue(a)) {
    a.tried.push(b.labelId);
    const buyer = world.labels[b.labelId];
    if (!buyer || buyer.bankrupt) continue;
    if (buyer.kind === 'npc') {
      sellToNpc(world, a, b);
      a.status = 'sold';
      tell(a.sellerId, `Enchère : ${name} part chez ${buyer.name} pour ${b.amount.toLocaleString('fr-FR')} €.`);
      return true;
    }
    const max = CFG.tiers.maxArtists[buyer.tier - 1] ?? 5;
    if (buyer.cash < b.amount || rosterOf(world, buyer.id).length >= max) {
      tell(buyer.id, `Enchère pour ${name} : tu n’as plus le cash ou la place, c’est le suivant qui a sa chance.`);
      continue;
    }
    // Same path as a transfer agreed between labels: the buyer now negotiates with the artist.
    const t: Transfer = {
      id: `t${world.nextId}`,
      buyerId: buyer.id,
      sellerId: a.sellerId,
      artistId: a.artistId,
      fee: b.amount,
      turn: 'buyer',
      status: 'agreed',
      answerBy: world.tick,
      signBy: world.tick + TRANSFERS.signTicks,
      byClause: false,
      auctionId: a.id,
      updatedTick: world.tick,
    };
    world.nextId += 1;
    (world.transfers ??= []).push(t);
    a.status = 'signing';
    tell(buyer.id, `Tu remportes l’enchère pour ${name} (${b.amount.toLocaleString('fr-FR')} €) ! Négocie son contrat dans les ${TRANSFERS.signTicks} semaines (onglet Label).`);
    tell(a.sellerId, `Enchère : ${buyer.name} propose ${b.amount.toLocaleString('fr-FR')} € pour ${name}. Il doit encore le faire signer.`);
    return true;
  }
  return false;
};

/** Weekly: tells the outbid friends, closes the auctions that end, and gives the next bidder his chance when a signing falls. */
export const tickAuctions = (world: World, tell: (labelId: string, text: string) => void): void => {
  if (!world.auctions) return;
  for (const a of world.auctions) {
    const name = world.artists[a.artistId]?.name ?? 'l’artiste';
    for (const id of a.outbid) if (a.status === 'open') tell(id, `Enchère pour ${name} : quelqu’un a mis plus que toi (${(best(a)?.amount ?? 0).toLocaleString('fr-FR')} €).`);
    a.outbid = [];
    if (!isOpen(a)) continue;
    if (!stillHis(world, a) && !(a.status === 'signing' && signingOf(world, a)?.status === 'done')) {
      a.status = 'cancelled';
      a.updatedTick = world.tick;
      continue;
    }
    if (a.status === 'signing') {
      const t = signingOf(world, a);
      if (t?.status === 'done') {
        a.status = 'sold';
        a.updatedTick = world.tick;
      } else if (!t || (t.status !== 'agreed' && t.status !== 'pending')) {
        a.updatedTick = world.tick;
        if (!offerNext(world, a, tell)) {
          a.status = 'unsold';
          tell(a.sellerId, `Personne n’a fait signer ${name} : il reste chez toi.`);
        }
      }
      continue;
    }
    if (a.endTick > world.tick) continue;
    a.updatedTick = world.tick;
    if (a.bids.length === 0) {
      a.status = 'unsold';
      tell(a.sellerId, `Aucune offre pour ${name} : il reste chez toi.`);
    } else if (!offerNext(world, a, tell)) {
      a.status = 'unsold';
      tell(a.sellerId, a.reserve !== null ? `Personne n’a atteint ton prix de réserve pour ${name} : il reste chez toi.` : `Personne n’a pu payer ${name} : il reste chez toi.`);
    }
  }
  world.auctions = world.auctions.filter((a) => isOpen(a) || world.tick - a.updatedTick < AUCTIONS.keepTicks);
};

const signingOf = (world: World, a: Auction): Transfer | undefined =>
  [...(world.transfers ?? [])].reverse().find((t) => t.auctionId === a.id && t.buyerId === a.tried[a.tried.length - 1]);

/* ---------------------------------- View ---------------------------------- */

export interface AuctionView {
  id: string;
  artistId: string;
  artistName: string;
  genre: GenreId;
  gen: number;
  fans: number;
  skills: string[];
  sellerName: string;
  mine: boolean;
  start: number;
  best: { amount: number; labelName: string; mine: boolean } | null;
  nextBid: number;
  bids: number;
  weeksLeft: number;
  status: AuctionStatus;
  /** The secret reserve: its amount for the seller only; for the others, only whether it is reached. */
  reserve: number | null;
  reserveMet: boolean | null;
  myBid: number | null;
  /** I bid and someone put more. */
  outbid: boolean;
  /** Friends have bid: the seller can no longer stop it. */
  locked: boolean;
}

export const auctionsView = (world: World, labelId: string): AuctionView[] =>
  auctionsOf(world)
    .filter((a) => isOpen(a) || a.sellerId === labelId || a.bids.some((b) => b.labelId === labelId))
    .map((a) => {
      const artist = world.artists[a.artistId];
      const top = best(a);
      const mineBids = a.bids.filter((b) => b.labelId === labelId);
      return {
        id: a.id,
        artistId: a.artistId,
        artistName: artist?.name ?? '?',
        genre: artist?.genre ?? 'pop',
        gen: artist ? generalRating(artist) : 0,
        fans: artist?.fans ?? 0,
        skills: skillsOf(a.artistId).map((id) => SKILLS[id].name),
        sellerName: world.labels[a.sellerId]?.name ?? '?',
        mine: a.sellerId === labelId,
        start: a.start,
        best: top ? { amount: top.amount, labelName: world.labels[top.labelId]?.name ?? '?', mine: top.labelId === labelId } : null,
        nextBid: nextBid(a),
        bids: a.bids.length,
        weeksLeft: clamp(a.endTick - world.tick, 0, AUCTIONS.maxWeeks),
        status: a.status,
        reserve: a.sellerId === labelId ? a.reserve : null,
        reserveMet: a.reserve === null ? null : (top?.amount ?? 0) >= a.reserve,
        myBid: mineBids.length > 0 ? mineBids[mineBids.length - 1]!.amount : null,
        outbid: a.status === 'open' && mineBids.length > 0 && top?.labelId !== labelId,
        locked: a.bids.some((b) => world.labels[b.labelId]?.kind === 'player'),
      } satisfies AuctionView;
    })
    .sort((x, y) => Number(y.outbid) - Number(x.outbid) || Number(x.status !== 'open') - Number(y.status !== 'open') || x.weeksLeft - y.weeksLeft);
