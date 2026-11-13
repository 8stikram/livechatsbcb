// Transfers between players: a label offers a price for an artist of another player.
// The seller accepts, refuses or asks another price (free price, even 1 €). Once the labels agree,
// the buyer still has to agree a new contract with the artist: the money moves only when he signs.
// A seller can put a release clause on his artist: whoever offers that price skips his answer.
import { generalRating } from './artists.ts';
import { contractOf, rosterOf } from './economy.ts';
import { CFG } from './config.ts';
import { sessionOf } from './studio.ts';
import { tourOf } from './tours.ts';
import type { GenreId, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type TransferStatus = 'pending' | 'agreed' | 'done' | 'refused' | 'expired' | 'cancelled';

export interface Transfer {
  id: string;
  /** The label that wants the artist. */
  buyerId: string;
  /** The label that has him. */
  sellerId: string;
  artistId: string;
  fee: number;
  /** Who must answer the current price. */
  turn: 'seller' | 'buyer';
  status: TransferStatus;
  /** Last tick to answer a pending price. */
  answerBy: number;
  /** Last tick the buyer has to agree a contract with the artist. */
  signBy: number;
  /** The price matched the release clause: the seller had no say. */
  byClause: boolean;
  /** One of the buyer's artists offered on top of (or instead of) the money. */
  swapId?: string;
  /** Won at an auction. */
  auctionId?: string;
  updatedTick: number;
}

export const TRANSFERS = {
  /** Weeks to answer a price; then it counts as a no. */
  answerTicks: 2,
  /** Weeks the buyer has to agree a contract with the artist once the labels agree. */
  signTicks: 2,
  /** Closed transfers are shown this long, then forgotten. */
  keepTicks: 2,
  /** Storage guards: the game never needs more. */
  maxOpenPerLabel: 10,
  maxPerWorld: 300,
  maxClause: 1e9,
};

const transfersOf = (world: World): Transfer[] => (world.transfers ??= []);
const isOpen = (t: Transfer): boolean => t.status === 'pending' || t.status === 'agreed';

const playerLabelOf = (world: World, artistId: string): Label | null => {
  const contract = contractOf(world, artistId);
  const label = contract ? world.labels[contract.labelId] : undefined;
  return label && label.kind === 'player' && !label.bankrupt ? label : null;
};

/** The release clause the seller put on this artist, or null. */
export const clauseOf = (world: World, artistId: string): number | null => contractOf(world, artistId)?.releaseClause ?? null;

/** The seller sets (or removes, with null) the release clause of one of his artists. */
export const setClause = (world: World, label: Label, artistId: string, amount: number | null): void => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  const contract = contractOf(world, artistId);
  if (!contract || contract.labelId !== label.id) fail(`${artist.name} n'est pas dans ton label.`);
  if (contract!.loan) fail(`${artist.name} est prêté : pas de clause pendant le prêt.`);
  if (amount === null) {
    delete contract!.releaseClause;
    return;
  }
  const price = Math.round(amount);
  if (price < 1 || price > TRANSFERS.maxClause) fail('Choisis un montant.');
  contract!.releaseClause = price;
};

/** The open transfer where the labels agreed on this artist for this buyer, if any. */
export const agreedTransfer = (world: World, buyerId: string, artistId: string): Transfer | undefined =>
  transfersOf(world).find((t) => t.status === 'agreed' && t.buyerId === buyerId && t.artistId === artistId && t.signBy > world.tick);

const news = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }];
};

const agree = (world: World, t: Transfer): void => {
  t.status = 'agreed';
  t.signBy = world.tick + TRANSFERS.signTicks;
  t.updatedTick = world.tick;
  const artist = world.artists[t.artistId];
  const buyer = world.labels[t.buyerId];
  const seller = world.labels[t.sellerId];
  if (artist && buyer && seller) news(world, `${buyer.name} et ${seller.name} sont d'accord pour ${artist.name} (${t.fee.toLocaleString('fr-FR')} €). Il doit encore signer.`);
};

/** Weeks an artist stays before his label can trade him (as for a sale). */
const SWAP_AFTER = 8;

/** Why this artist of the buyer cannot be offered in exchange, or null. */
export const swapBlocked = (world: World, buyerId: string, swapId: string): string | null => {
  const artist = world.artists[swapId];
  const contract = contractOf(world, swapId);
  if (!artist || !contract || contract.labelId !== buyerId) return 'Cet artiste n’est pas dans ton label.';
  if (contract.loan) return `${artist.name} est prêté.`;
  if (world.auctions?.some((a) => a.artistId === swapId && (a.status === 'open' || a.status === 'signing'))) return `${artist.name} est aux enchères.`;
  if (world.lendings?.some((l) => l.artistId === swapId && l.status === 'listed')) return `${artist.name} est proposé en prêt.`;
  const since = world.tick - contract.startTick;
  if (since < SWAP_AFTER) return `${artist.name} vient de signer : échange possible dans ${SWAP_AFTER - since} sem.`;
  if (sessionOf(world, buyerId)?.artistId === swapId) return `${artist.name} est en studio.`;
  if (tourOf(world, swapId)) return `${artist.name} a une tournée prévue.`;
  return null;
};

/** The buyer offers a price for an artist of another player, maybe with one of his own artists in exchange. Matching the release clause makes it agreed at once. */
export const askTransfer = (world: World, label: Label, artistId: string, fee: number, swapId?: string | null): Transfer => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  if (contractOf(world, artistId)?.loan) return fail(`${artist.name} est prêté : attends son retour.`);
  const seller = playerLabelOf(world, artistId);
  if (!seller || seller.id === label.id) return fail(`${artist.name} n'est pas chez un autre joueur.`);
  if (world.auctions?.some((a) => a.artistId === artistId && (a.status === 'open' || a.status === 'signing'))) return fail(`${artist.name} est aux enchères : enchéris dans le Marché.`);
  const swap = swapId ? swapId : undefined;
  if (swap) {
    const why = swapBlocked(world, label.id, swap);
    if (why) return fail(why);
  }
  const price = Math.round(fee);
  if (price < (swap ? 0 : 1)) return fail('Propose une somme.');
  if (price > label.cash) return fail('Pas assez de cash pour cette offre.');
  const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
  if (rosterOf(world, label.id).length >= max) return fail('Ton effectif est complet pour ce palier.');
  const all = transfersOf(world);
  if (all.some((t) => isOpen(t) && t.buyerId === label.id && t.artistId === artistId)) return fail(`Tu as déjà une offre en cours pour ${artist.name}.`);
  if (all.filter((t) => isOpen(t) && t.buyerId === label.id).length >= TRANSFERS.maxOpenPerLabel) return fail('Trop d’offres en cours. Attends quelques réponses.');
  if (all.length >= TRANSFERS.maxPerWorld) return fail('Trop d’offres sur ce serveur. Réessaie la semaine prochaine.');
  const t: Transfer = {
    id: `t${world.nextId}`,
    buyerId: label.id,
    sellerId: seller.id,
    artistId,
    fee: price,
    turn: 'seller',
    status: 'pending',
    answerBy: world.tick + TRANSFERS.answerTicks,
    signBy: 0,
    byClause: false,
    ...(swap ? { swapId: swap } : {}),
    updatedTick: world.tick,
  };
  world.nextId += 1;
  all.push(t);
  const clause = clauseOf(world, artistId);
  if (clause !== null && price >= clause) {
    t.byClause = true;
    agree(world, t);
  }
  return t;
};

const transferOf = (world: World, id: string): Transfer => transfersOf(world).find((t) => t.id === id) ?? fail('Offre introuvable.');

/** The label whose turn it is answers: yes (the artist then talks with the buyer), no, or another price. */
export const answerTransfer = (world: World, label: Label, id: string, answer: 'accept' | 'refuse' | 'counter', fee?: number): void => {
  const t = transferOf(world, id);
  if (t.status !== 'pending') fail('Cette offre est déjà réglée.');
  const answering = t.turn === 'seller' ? t.sellerId : t.buyerId;
  if (answering !== label.id) fail("Ce n'est pas à toi de répondre.");
  const artist = world.artists[t.artistId] ?? fail('Artiste introuvable.');
  if (playerLabelOf(world, t.artistId)?.id !== t.sellerId) {
    t.status = 'cancelled';
    t.updatedTick = world.tick;
    fail(`${artist.name} n'est plus dans ce label.`);
  }
  t.updatedTick = world.tick;
  if (answer === 'refuse') {
    t.status = 'refused';
    return;
  }
  if (answer === 'counter') {
    const price = Math.round(fee ?? 0);
    if (price < (t.swapId ? 0 : 1)) fail('Propose une somme.');
    if (price === t.fee) fail('Change le prix, ou accepte celui-ci.');
    t.fee = price;
    t.turn = t.turn === 'seller' ? 'buyer' : 'seller';
    t.answerBy = world.tick + TRANSFERS.answerTicks;
    return;
  }
  const buyer = world.labels[t.buyerId];
  if (!buyer || buyer.bankrupt) fail("Ce label n'existe plus.");
  if (buyer!.cash < t.fee) fail(buyer!.id === label.id ? 'Pas assez de cash pour ce prix.' : `${buyer!.name} n'a plus assez de cash pour ce prix.`);
  agree(world, t);
};

/** The buyer takes back an offer, before the artist signs. */
export const cancelTransfer = (world: World, label: Label, id: string): void => {
  const t = transferOf(world, id);
  if (t.buyerId !== label.id) fail("Ce n'est pas ton offre.");
  if (!isOpen(t)) fail('Cette offre est déjà réglée.');
  t.status = 'cancelled';
  t.updatedTick = world.tick;
};

/**
 * The artist signed with the buyer: the fee goes to the seller and his old contract ends.
 * Called by the contract talks, just before the new contract is written.
 */
export const completeTransfer = (world: World, buyer: Label, artistId: string): void => {
  const t = agreedTransfer(world, buyer.id, artistId) ?? fail("Aucun accord de transfert pour cet artiste.");
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  const seller = world.labels[t.sellerId];
  if (!seller || playerLabelOf(world, artistId)?.id !== seller.id) fail(`${artist.name} n'est plus dans ce label.`);
  if (world.sessions?.[seller!.id]?.artistId === artistId) fail(`${artist.name} est en studio chez ${seller!.name}. Réessaie après sa session.`);
  if (buyer.cash < t.fee) fail('Pas assez de cash pour payer le transfert.');
  const swap = t.swapId ? world.artists[t.swapId] : undefined;
  if (t.swapId) {
    const why = swapBlocked(world, buyer.id, t.swapId);
    if (why) fail(`Échange impossible : ${why}`);
  }
  buyer.cash -= t.fee;
  seller!.cash += t.fee;
  seller!.stats.revenueTotal += t.fee;
  world.contracts = world.contracts.filter((c) => c.artistId !== artistId);
  world.gigs = world.gigs.filter((g) => g.artistId !== artistId);
  // The artist given in exchange joins the seller with his contract as it is.
  if (swap) {
    const contract = contractOf(world, swap.id)!;
    contract.labelId = seller!.id;
    contract.startTick = world.tick;
    delete contract.releaseClause;
    world.gigs = world.gigs.filter((g) => g.artistId !== swap.id);
  }
  t.status = 'done';
  t.updatedTick = world.tick;
  // Every other offer for him (and for the one given in exchange) is over.
  for (const other of transfersOf(world)) {
    if (other !== t && (other.artistId === artistId || (swap && (other.artistId === swap.id || other.swapId === swap.id))) && isOpen(other)) {
      other.status = 'cancelled';
      other.updatedTick = world.tick;
    }
  }
  if (!t.auctionId) news(world, `Transfert : ${artist.name} quitte ${seller!.name} pour ${buyer.name} (${t.fee.toLocaleString('fr-FR')} €${swap ? ` + ${swap.name}` : ''}).`);
};

/** The artist walked out of the talks: the agreement falls at once (at an auction, the next bidder gets his chance). */
export const dropAgreed = (world: World, buyerId: string, artistId: string): void => {
  const t = agreedTransfer(world, buyerId, artistId);
  if (!t) return;
  t.status = 'expired';
  t.updatedTick = world.tick;
};

/** Weekly: unanswered prices become a no, unsigned agreements fall, old ones are forgotten. */
export const tickTransfers = (world: World, tell: (labelId: string, text: string) => void): void => {
  if (!world.transfers) return;
  for (const t of world.transfers) {
    const name = world.artists[t.artistId]?.name ?? 'l’artiste';
    if (t.status === 'pending' && t.answerBy <= world.tick) {
      t.status = 'expired';
      t.updatedTick = world.tick;
      tell(t.buyerId, `Pas de réponse pour le transfert de ${name} : c'est non.`);
    } else if (t.status === 'agreed' && t.signBy <= world.tick) {
      t.status = 'expired';
      t.updatedTick = world.tick;
      tell(t.buyerId, `${name} n'a pas signé à temps : le transfert tombe.`);
      tell(t.sellerId, `${name} n'a pas signé chez l'acheteur : il reste chez toi.`);
    }
  }
  world.transfers = world.transfers.filter((t) => isOpen(t) || world.tick - t.updatedTick < TRANSFERS.keepTicks);
};

export interface TransferView {
  id: string;
  direction: 'sent' | 'received';
  artistId: string;
  artistName: string;
  genre: GenreId;
  gen: number;
  otherLabel: string;
  fee: number;
  status: TransferStatus;
  myTurn: boolean;
  byClause: boolean;
  /** The artist offered in exchange, if any. */
  swap: { id: string; name: string; gen: number } | null;
  fromAuction: boolean;
  /** Weeks left to answer (pending) or for the artist to sign (agreed). */
  weeksLeft: number;
}

export const transfersView = (world: World, labelId: string): TransferView[] =>
  transfersOf(world)
    .filter((t) => t.buyerId === labelId || t.sellerId === labelId)
    .map((t) => {
      const sent = t.buyerId === labelId;
      const artist = world.artists[t.artistId];
      return {
        id: t.id,
        direction: sent ? 'sent' : 'received',
        artistId: t.artistId,
        artistName: artist?.name ?? '?',
        genre: artist?.genre ?? 'pop',
        gen: artist ? generalRating(artist) : 0,
        otherLabel: world.labels[sent ? t.sellerId : t.buyerId]?.name ?? '?',
        fee: t.fee,
        status: t.status,
        myTurn: t.status === 'pending' && (t.turn === 'seller') !== sent,
        byClause: t.byClause,
        swap: t.swapId && world.artists[t.swapId] ? { id: t.swapId, name: world.artists[t.swapId]!.name, gen: generalRating(world.artists[t.swapId]!) } : null,
        fromAuction: !!t.auctionId,
        weeksLeft: Math.max(0, (t.status === 'agreed' ? t.signBy : t.answerBy) - world.tick),
      } satisfies TransferView;
    })
    .sort((a, b) => Number(b.myTurn) - Number(a.myTurn) || Number(b.status === 'agreed') - Number(a.status === 'agreed') || Number(b.status === 'pending') - Number(a.status === 'pending'));

/** This label has an open offer for the artist. */
export const transferAsked = (world: World, labelId: string, artistId: string): boolean =>
  transfersOf(world).some((t) => isOpen(t) && t.buyerId === labelId && t.artistId === artistId);
