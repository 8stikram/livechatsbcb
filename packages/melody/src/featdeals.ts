// Featuring between players: a label asks another player for one of his artists, before the studio.
// The owner accepts, refuses or asks another price; the price goes back and forth until a yes or a no.
// Once accepted the fee is paid, and the deal can be used in the studio for four weeks, without the wheel.
import { generalRating } from './artists.ts';
import { featDemand } from './quality.ts';
import { contractOf } from './economy.ts';
import type { Artist, GenreId, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type DealStatus = 'pending' | 'accepted' | 'refused' | 'expired' | 'used' | 'cancelled';

export interface FeatDeal {
  id: string;
  /** The label that wants the guest on its song. */
  fromLabelId: string;
  /** The label of the guest. */
  toLabelId: string;
  guestId: string;
  fee: number;
  /** Who must answer the current price. */
  turn: 'owner' | 'asker';
  status: DealStatus;
  /** Last tick to answer a pending price. */
  answerBy: number;
  /** Last tick an accepted deal can be used in the studio. */
  validUntil: number;
  updatedTick: number;
}

export const DEALS = {
  /** Weeks to answer a price; then it counts as a no. */
  answerTicks: 2,
  /** Weeks an accepted deal stays usable in the studio. */
  validTicks: 4,
  /** Energy the guest spends on the song. */
  guestEnergy: 10,
  /** Quality bonus when two players work together. */
  friendship: 2,
  /** Closed deals are shown this long, then forgotten. */
  keepTicks: 2,
  /** Storage guards: the game never needs more. */
  maxOpenPerLabel: 10,
  maxPerWorld: 300,
};

const dealsOf = (world: World): FeatDeal[] => (world.featDeals ??= []);
const isOpen = (deal: FeatDeal): boolean => deal.status === 'pending' || deal.status === 'accepted';

/** The player label that has this artist under contract, if any. */
const ownerOf = (world: World, artist: Artist): Label | null => {
  const contract = contractOf(world, artist.id);
  const label = contract ? world.labels[contract.labelId] : undefined;
  return label && label.kind === 'player' && !label.bankrupt ? label : null;
};

/** Sends a featuring request for an artist of another player. */
export const askFeat = (world: World, label: Label, guestId: string, fee: number): FeatDeal => {
  const guest = world.artists[guestId] ?? fail('Artiste introuvable.');
  const owner = ownerOf(world, guest);
  if (!owner || owner.id === label.id) return fail(`${guest.name} n'est pas chez un autre joueur.`);
  const price = Math.round(fee);
  if (price < 1) return fail('Propose une somme.');
  if (price > label.cash) return fail('Pas assez de cash pour cette offre.');
  const deals = dealsOf(world);
  if (deals.some((d) => isOpen(d) && d.fromLabelId === label.id && d.guestId === guestId)) return fail(`Tu as déjà une demande en cours pour ${guest.name}.`);
  if (deals.filter((d) => isOpen(d) && d.fromLabelId === label.id).length >= DEALS.maxOpenPerLabel) return fail('Trop de demandes en cours. Attends quelques réponses.');
  if (deals.length >= DEALS.maxPerWorld) return fail('Trop de demandes sur ce serveur. Réessaie la semaine prochaine.');
  const deal: FeatDeal = {
    id: `d${world.nextId}`,
    fromLabelId: label.id,
    toLabelId: owner.id,
    guestId,
    fee: price,
    turn: 'owner',
    status: 'pending',
    answerBy: world.tick + DEALS.answerTicks,
    validUntil: 0,
    updatedTick: world.tick,
  };
  world.nextId += 1;
  deals.push(deal);
  return deal;
};

const dealOf = (world: World, dealId: string): FeatDeal => dealsOf(world).find((d) => d.id === dealId) ?? fail('Demande introuvable.');

/** The label whose turn it is answers: yes (the fee is paid at once), no, or another price. */
export const answerDeal = (world: World, label: Label, dealId: string, answer: 'accept' | 'refuse' | 'counter', fee?: number): void => {
  const deal = dealOf(world, dealId);
  if (deal.status !== 'pending') fail('Cette demande est déjà réglée.');
  const answering = deal.turn === 'owner' ? deal.toLabelId : deal.fromLabelId;
  if (answering !== label.id) fail("Ce n'est pas à toi de répondre.");
  const guest = world.artists[deal.guestId] ?? fail('Artiste introuvable.');
  if (ownerOf(world, guest)?.id !== deal.toLabelId) {
    deal.status = 'cancelled';
    deal.updatedTick = world.tick;
    fail(`${guest.name} n'est plus dans ce label.`);
  }
  deal.updatedTick = world.tick;
  if (answer === 'refuse') {
    deal.status = 'refused';
    return;
  }
  if (answer === 'counter') {
    const price = Math.round(fee ?? 0);
    if (price < 1) fail('Propose une somme.');
    if (price === deal.fee) fail('Change le prix, ou accepte celui-ci.');
    deal.fee = price;
    deal.turn = deal.turn === 'owner' ? 'asker' : 'owner';
    deal.answerBy = world.tick + DEALS.answerTicks;
    return;
  }
  const asker = world.labels[deal.fromLabelId];
  const owner = world.labels[deal.toLabelId];
  if (!asker || !owner || asker.bankrupt || owner.bankrupt) fail("Ce label n'existe plus.");
  if (asker!.cash < deal.fee) fail(asker!.id === label.id ? 'Pas assez de cash pour ce cachet.' : `${asker!.name} n'a plus assez de cash pour ce cachet.`);
  asker!.cash -= deal.fee;
  owner!.cash += deal.fee;
  owner!.stats.revenueTotal += deal.fee;
  deal.status = 'accepted';
  deal.validUntil = world.tick + DEALS.validTicks;
};

/** The asker takes back a request still waiting. */
export const cancelDeal = (world: World, label: Label, dealId: string): void => {
  const deal = dealOf(world, dealId);
  if (deal.fromLabelId !== label.id) fail("Ce n'est pas ta demande.");
  if (deal.status !== 'pending') fail('Cette demande est déjà réglée.');
  deal.status = 'cancelled';
  deal.updatedTick = world.tick;
};

/** Accepted deals this label can use in the studio now. */
export const usableDeals = (world: World, labelId: string): FeatDeal[] =>
  dealsOf(world).filter((d) => d.status === 'accepted' && d.fromLabelId === labelId && d.validUntil > world.tick);

/** Checks a deal can go on the song now, and gives the guest. */
export const checkDealGuest = (world: World, label: Label, dealId: string): Artist => {
  const deal = dealOf(world, dealId);
  if (deal.fromLabelId !== label.id || deal.status !== 'accepted') fail("Cet accord n'est pas utilisable.");
  if (deal.validUntil <= world.tick) fail('Cet accord a expiré.');
  const guest = world.artists[deal.guestId] ?? fail('Artiste introuvable.');
  if (ownerOf(world, guest)?.id !== deal.toLabelId) fail(`${guest.name} n'est plus dans ce label.`);
  if (guest.energy < DEALS.guestEnergy) fail(`${guest.name} est trop fatigué pour poser cette semaine.`);
  return guest;
};

/** The song is recorded: the deal is spent and the guest gets tired. */
export const spendDeal = (world: World, label: Label, dealId: string): void => {
  const guest = checkDealGuest(world, label, dealId);
  const deal = dealOf(world, dealId);
  guest.energy = Math.max(0, guest.energy - DEALS.guestEnergy);
  deal.status = 'used';
  deal.updatedTick = world.tick;
};

/** Weekly: unanswered prices become a no, unused deals run out, old ones are forgotten. */
export const tickDeals = (world: World, tell: (labelId: string, text: string) => void): void => {
  if (!world.featDeals) return;
  for (const deal of world.featDeals) {
    const guest = world.artists[deal.guestId];
    const name = guest?.name ?? 'l’invité';
    if (deal.status === 'pending' && deal.answerBy <= world.tick) {
      deal.status = 'expired';
      deal.updatedTick = world.tick;
      tell(deal.fromLabelId, `Pas de réponse pour le featuring de ${name} : c'est non.`);
    } else if (deal.status === 'accepted' && deal.validUntil <= world.tick) {
      deal.status = 'expired';
      deal.updatedTick = world.tick;
      tell(deal.fromLabelId, `L'accord de featuring avec ${name} n'a pas servi : il a expiré.`);
    }
  }
  world.featDeals = world.featDeals.filter((d) => isOpen(d) || world.tick - d.updatedTick < DEALS.keepTicks);
};

export interface FeatDealView {
  id: string;
  direction: 'sent' | 'received';
  guestId: string;
  guestName: string;
  guestGenre: GenreId;
  guestGen: number;
  otherLabel: string;
  fee: number;
  status: DealStatus;
  myTurn: boolean;
  /** Weeks left to answer (pending) or to use the deal (accepted). */
  weeksLeft: number;
}

export const dealsView = (world: World, labelId: string): FeatDealView[] =>
  dealsOf(world)
    .filter((d) => d.fromLabelId === labelId || d.toLabelId === labelId)
    .map((d) => {
      const sent = d.fromLabelId === labelId;
      const guest = world.artists[d.guestId];
      return {
        id: d.id,
        direction: sent ? 'sent' : 'received',
        guestId: d.guestId,
        guestName: guest?.name ?? '?',
        guestGenre: guest?.genre ?? 'pop',
        guestGen: guest ? generalRating(guest) : 0,
        otherLabel: world.labels[sent ? d.toLabelId : d.fromLabelId]?.name ?? '?',
        fee: d.fee,
        status: d.status,
        myTurn: d.status === 'pending' && (d.turn === 'owner') !== sent,
        weeksLeft: Math.max(0, (d.status === 'accepted' ? d.validUntil : d.answerBy) - world.tick),
      } satisfies FeatDealView;
    })
    .sort((a, b) => Number(b.myTurn) - Number(a.myTurn) || Number(b.status === 'pending') - Number(a.status === 'pending'));

export interface OtherArtistView {
  id: string;
  name: string;
  real: boolean;
  genre: GenreId;
  gen: number;
  fans: number;
  labelName: string;
  /** What he would ask from a stranger: a starting point for the price. */
  demand: number;
  /** A request of this label is already open for him. */
  asked: boolean;
}

/** The artists of the other players, to ask for a featuring. */
export const otherArtists = (world: World, labelId: string): OtherArtistView[] => {
  const asked = new Set(dealsOf(world).filter((d) => isOpen(d) && d.fromLabelId === labelId).map((d) => d.guestId));
  return world.contracts
    .filter((c) => c.labelId !== labelId && c.endTick > world.tick)
    .map((c) => ({ contract: c, label: world.labels[c.labelId], artist: world.artists[c.artistId] }))
    .filter((x): x is { contract: typeof x.contract; label: Label; artist: Artist } => !!x.artist && !!x.label && x.label.kind === 'player' && !x.label.bankrupt)
    .map(({ artist, label }) => ({
      id: artist.id,
      name: artist.name,
      real: artist.real,
      genre: artist.genre,
      gen: generalRating(artist),
      fans: artist.fans,
      labelName: label.name,
      demand: featDemand(artist),
      asked: asked.has(artist.id),
    }))
    .sort((a, b) => b.fans - a.fans)
    .slice(0, 60);
};
