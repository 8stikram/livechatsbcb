// Tours (docs/melody-tycoon/04-sortie-charts-economie.md, live): 4 to 20 dates over several weeks, announced
// two weeks ahead. The artist is on the road: no studio, no single concerts. Each week brings its story
// (a crowd that sings every word, a speech that gets booed...), the buzz goes up, fans come, merch sells.
// Options: a co-headliner (even a friend's artist, who must accept) and an opening act.
import { CFG } from './config.ts';
import { contractOf, rosterOf } from './economy.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import type { Artist, Label, World } from './types.ts';
import { crowdBoost } from './staff.ts';
import { moraleBlock } from './morale.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export const TOURS = {
  minDates: 4,
  maxDates: 20,
  datesPerWeek: 2,
  /** Weeks between the announce and the first date. */
  notice: 2,
  /** A tour draws more than a single concert. */
  demandBonus: 1.1,
  /** Setup: this share of the venue's fixed cost, per date, paid at the announce. */
  setupShare: 0.1,
  energyPerWeek: 8,
  minEnergy: 30,
  /** The tour relaunches the artist. */
  hypePerWeek: 3,
  /** Merch: part of the crowd that buys, margin per item, cost per item stocked. */
  merchBuy: 0.12,
  merchPrice: 18,
  merchCost: 4,
  /** The co-headliner's label gets this share of the money. */
  partnerShare: 0.5,
  /** The opening act gains this share of the crowd as fans. */
  openerFans: 0.01,
  inviteTicks: 2,
  keepTicks: 4,
  maxPerWorld: 150,
  maxLog: 12,
};

export type TourState = 'announced' | 'running' | 'done' | 'cancelled';

export interface Tour {
  id: string;
  labelId: string;
  artistId: string;
  partner: { artistId: string; labelId: string; status: 'pending' | 'accepted' | 'refused' } | null;
  openerId: string | null;
  startTick: number;
  dates: number;
  played: number;
  merch: boolean;
  merchStock: number;
  state: TourState;
  log: Array<{ tick: number; text: string; mood: 'good' | 'bad' | 'fun' }>;
  totals: { audience: number; money: number; merch: number; fans: number };
  updatedTick: number;
}

const toursOf = (world: World): Tour[] => (world.tours ??= []);
const isLive = (t: Tour): boolean => t.state === 'announced' || t.state === 'running';
const weeksOf = (dates: number): number => Math.ceil(dates / TOURS.datesPerWeek);

/** The tour an artist is on (headliner, co-headliner or opening act), if any. */
export const tourOf = (world: World, artistId: string): Tour | undefined =>
  toursOf(world).find(
    (t) =>
      isLive(t) &&
      (t.artistId === artistId || t.openerId === artistId || (t.partner?.artistId === artistId && t.partner.status !== 'refused')),
  );

/** True when the artist is on the road this week. */
export const onTour = (world: World, artistId: string): boolean => {
  const tour = tourOf(world, artistId);
  return !!tour && tour.startTick <= world.tick + 1;
};

/** The crowd one date draws, and the venue it fills. */
const dateDemand = (fans: number, hype: number): number => CFG.live.demandFactor * Math.sqrt(fans) * (0.5 + hype / 50) * TOURS.demandBonus;

const bestVenue = (demand: number): { name: string; seats: number; price: number; fixed: number; audience: number; profit: number } => {
  let best: ReturnType<typeof bestVenue> | null = null;
  for (const venue of CFG.live.venues) {
    const audience = Math.min(demand, venue.seats);
    const profit = audience * venue.price * CFG.live.margin - venue.fixed;
    if (!best || profit > best.profit) best = { ...venue, audience: Math.round(audience), profit: Math.round(profit) };
  }
  return best!;
};

export interface TourQuote {
  venue: string;
  audiencePerDate: number;
  setup: number;
  merchCost: number;
  /** Rough money for the label over the whole tour, before the events. */
  expected: number;
}

/** What a tour would look like, before announcing it. */
/** split: the co-headliner is another player's artist, whose label takes half the money. */
export const tourQuote = (fans: number, hype: number, dates: number, merch: boolean, partnerFans = 0, split = false, crowd = 1): TourQuote => {
  const venue = bestVenue(dateDemand(fans + partnerFans, hype) * crowd);
  const setup = Math.round(venue.fixed * TOURS.setupShare * dates);
  const items = Math.round(venue.audience * TOURS.merchBuy * dates);
  const merchCost = merch ? items * TOURS.merchCost : 0;
  const takings = venue.profit * CFG.live.labelShare * dates + (merch ? items * TOURS.merchPrice : 0);
  const expected = Math.round(takings * (split ? 1 - TOURS.partnerShare : 1) - setup - merchCost);
  return { venue: venue.name, audiencePerDate: venue.audience, setup, merchCost, expected };
};

const mineOrFail = (world: World, label: Label, artistId: string): Artist => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  if (contractOf(world, artistId)?.labelId !== label.id) fail(`${artist.name} n'est pas dans ton label.`);
  return artist;
};

/** Announces a tour, two weeks ahead. Setup and merch stock are paid now. */
export const announceTour = (
  world: World,
  label: Label,
  request: { artistId: string; dates: number; partnerId?: string | null; openerId?: string | null; merch?: boolean },
): Tour => {
  const artist = mineOrFail(world, label, request.artistId);
  const dates = Math.round(request.dates);
  if (dates < TOURS.minDates || dates > TOURS.maxDates) fail(`Une tournée a ${TOURS.minDates} à ${TOURS.maxDates} dates.`);
  if (tourOf(world, artist.id)) fail(`${artist.name} a déjà une tournée prévue.`);
  if (artist.energy < TOURS.minEnergy) fail(`${artist.name} est trop fatigué pour partir en tournée.`);
  const unwilling = moraleBlock(world, artist, 'tour');
  if (unwilling) fail(unwilling);
  let partner: Tour['partner'] = null;
  let partnerFans = 0;
  if (request.partnerId) {
    const guest = world.artists[request.partnerId] ?? fail('Artiste introuvable.');
    if (guest.id === artist.id) fail('Choisis un autre artiste pour la tournée commune.');
    const contract = contractOf(world, guest.id);
    const owner = contract ? world.labels[contract.labelId] : undefined;
    if (!owner || owner.kind !== 'player' || owner.bankrupt) fail(`${guest.name} doit être chez toi ou chez un autre joueur.`);
    if (tourOf(world, guest.id)) fail(`${guest.name} a déjà une tournée prévue.`);
    partner = { artistId: guest.id, labelId: owner!.id, status: owner!.id === label.id ? 'accepted' : 'pending' };
    partnerFans = guest.fans;
  }
  let openerId: string | null = null;
  if (request.openerId) {
    const opener = mineOrFail(world, label, request.openerId);
    if (opener.id === artist.id || opener.id === partner?.artistId) fail('La première partie doit être un autre artiste.');
    if (tourOf(world, opener.id)) fail(`${opener.name} a déjà une tournée prévue.`);
    openerId = opener.id;
  }
  if (toursOf(world).length >= TOURS.maxPerWorld) fail('Trop de tournées sur ce serveur. Réessaie la semaine prochaine.');
  const quote = tourQuote(artist.fans, artist.hype, dates, request.merch ?? false, partnerFans, false, crowdBoost(world, label.id));
  const cost = quote.setup + quote.merchCost;
  if (cost > label.cash) fail(`Pas assez de cash : la tournée coûte ${cost.toLocaleString('fr-FR')} € à monter.`);
  label.cash -= cost;
  const tour: Tour = {
    id: `to${world.nextId}`,
    labelId: label.id,
    artistId: artist.id,
    partner,
    openerId,
    startTick: world.tick + TOURS.notice,
    dates,
    played: 0,
    merch: request.merch ?? false,
    merchStock: request.merch ? Math.round(quote.merchCost / TOURS.merchCost) : 0,
    state: 'announced',
    log: [{ tick: world.tick, text: `Tournée annoncée : ${dates} dates, départ dans ${TOURS.notice} semaines.`, mood: 'good' }],
    totals: { audience: 0, money: 0, merch: 0, fans: 0 },
    updatedTick: world.tick,
  };
  world.nextId += 1;
  toursOf(world).push(tour);
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text: `${artist.name} (${label.name}) annonce une tournée de ${dates} dates.` }];
  return tour;
};

/** The friend whose artist is invited says yes or no. */
export const answerTourInvite = (world: World, label: Label, tourId: string, accept: boolean): void => {
  const tour = toursOf(world).find((t) => t.id === tourId) ?? fail('Tournée introuvable.');
  const partner = tour.partner;
  if (!partner || partner.labelId !== label.id) return fail('Cette invitation ne te concerne pas.');
  if (partner.status !== 'pending') fail('Tu as déjà répondu.');
  if (tour.state !== 'announced') fail('La tournée est déjà partie.');
  partner.status = accept ? 'accepted' : 'refused';
  tour.updatedTick = world.tick;
  const guest = world.artists[partner.artistId];
  tour.log.push({ tick: world.tick, text: accept ? `${guest?.name} rejoint la tournée.` : `${guest?.name} ne viendra pas.`, mood: accept ? 'good' : 'bad' });
};

/** Cancels a tour before its first date. The setup is lost. */
export const cancelTour = (world: World, label: Label, tourId: string): void => {
  const tour = toursOf(world).find((t) => t.id === tourId && t.labelId === label.id) ?? fail('Tournée introuvable.');
  if (tour.state !== 'announced') fail('La tournée est déjà partie.');
  tour.state = 'cancelled';
  tour.updatedTick = world.tick;
  const artist = world.artists[tour.artistId];
  if (artist) artist.hype = clamp(artist.hype - 3, 0, 100);
};

/* ---------------------------------- Stories of the road ---------------------------------- */

interface RoadEvent {
  text: string;
  mood: 'good' | 'bad' | 'fun';
  /** Only for invented artists: nothing touchy on a real person. */
  fiction?: boolean;
  hype?: number;
  morale?: number;
  /** Share of the artist's fans won or lost. */
  fans?: number;
  reputation?: number;
  /** Money for the label, × tier. */
  cash?: number;
  /** Goes to the party feed. */
  loud?: boolean;
}

const ROAD: RoadEvent[] = [
  { text: 'Salle pleine à craquer : le public chante tous les refrains.', mood: 'good', hype: 4, morale: 5 },
  { text: 'Un invité surprise monte sur scène. Les vidéos tournent partout.', mood: 'good', hype: 6, fans: 0.01, loud: true },
  { text: 'Un média culte filme le concert. Belle pub.', mood: 'good', hype: 5 },
  { text: 'Il a slamé dans la foule. Il a perdu une chaussure, mais gagné des fans.', mood: 'fun', hype: 2, fans: 0.005 },
  { text: 'Le tourbus tombe en panne sur l’autoroute. Concert en retard, mais le public a attendu.', mood: 'fun', morale: -2 },
  { text: 'Un fan lui offre son portrait peint sur une planche à découper. Il l’a gardé.', mood: 'fun', morale: 3 },
  { text: 'Il a oublié le nom de la ville sur scène. Les réseaux en rient, gentiment.', mood: 'fun', hype: 1 },
  { text: 'Problème de son pendant dix minutes. Quelques sifflets.', mood: 'bad', hype: -2, morale: -3 },
  { text: 'Extinction de voix : playback sur deux titres. Les gens ont remarqué.', mood: 'bad', hype: -3, morale: -2 },
  { text: 'Il fait monter une fan pour chanter avec lui. Elle chante mieux que lui. Moment viral.', mood: 'good', fiction: true, hype: 8, fans: 0.01, loud: true },
  { text: 'Il a lancé un discours politique au micro. La moitié de la salle a sifflé.', mood: 'bad', fiction: true, hype: -6, reputation: -2, loud: true },
  { text: 'Arrivé avec une heure de retard pour jouer 25 minutes. Remboursements demandés.', mood: 'bad', fiction: true, hype: -4, cash: -500, loud: true },
  { text: 'Embrouille avec la sécu devant les loges. Ça a filmé. Mauvaise pub… mais de la pub.', mood: 'bad', fiction: true, hype: 3, reputation: -2, loud: true },
  { text: 'Il annonce sur scène un album qui n’existe pas. Le label l’apprend sur les réseaux.', mood: 'fun', fiction: true, hype: 5, morale: 2, loud: true },
  { text: 'Il a chambré la ville d’à côté. Petite polémique locale.', mood: 'fun', fiction: true, hype: 2, reputation: -1 },
  { text: 'Il pleure en chantant son son le plus perso. Toute la salle avec lui.', mood: 'good', fiction: true, hype: 5, morale: 4, fans: 0.005 },
];

const roadEvent = (rng: Rng, artist: Artist): RoadEvent => {
  const pool = ROAD.filter((e) => !e.fiction || !artist.real);
  return rng.pick(pool);
};

/* ---------------------------------- Weekly ---------------------------------- */

/** Weekly: the tours on the road play their dates, sell merch and write their story. */
export const tickTours = (
  world: World,
  pay: (labelId: string, amount: number) => void,
  tell: (labelId: string, text: string) => void,
): Set<string> => {
  const busy = new Set<string>();
  if (!world.tours) return busy;
  for (const tour of world.tours) {
    if (tour.state === 'announced' && tour.startTick <= world.tick) {
      tour.state = 'running';
      if (tour.partner?.status === 'pending') tour.partner.status = 'refused';
    }
    if (tour.state !== 'running') continue;
    const artist = world.artists[tour.artistId];
    const label = world.labels[tour.labelId];
    if (!artist || !label || label.bankrupt || contractOf(world, artist.id)?.labelId !== label.id) {
      tour.state = 'cancelled';
      tour.updatedTick = world.tick;
      continue;
    }
    const partner = tour.partner?.status === 'accepted' ? world.artists[tour.partner.artistId] : undefined;
    const opener = tour.openerId ? world.artists[tour.openerId] : undefined;
    const rng = rngFor(world.seed, world.tick, `tour:${tour.id}`);
    const tonight = Math.min(TOURS.datesPerWeek, tour.dates - tour.played);
    let money = 0;
    let merch = 0;
    let crowd = 0;
    for (let i = 0; i < tonight; i += 1) {
      const venue = bestVenue(dateDemand(artist.fans + (partner?.fans ?? 0), artist.hype) * crowdBoost(world, label.id) * rng.range(0.85, 1.15));
      crowd += venue.audience;
      money += venue.profit > 0 ? venue.profit * CFG.live.labelShare : venue.profit;
      if (tour.merch && tour.merchStock > 0) {
        const sold = Math.min(tour.merchStock, Math.round(venue.audience * TOURS.merchBuy));
        tour.merchStock -= sold;
        merch += sold * TOURS.merchPrice;
      }
    }
    tour.played += tonight;
    const gained = Math.round(crowd * CFG.fans.gigGain);
    artist.fans += gained;
    if (partner) partner.fans += Math.round(gained * 0.7);
    if (opener) {
      opener.fans += Math.round(crowd * TOURS.openerFans);
      opener.hype = clamp(opener.hype + 1, 0, 100);
      opener.energy = Math.max(0, opener.energy - TOURS.energyPerWeek / 2);
    }
    for (const a of [artist, partner]) {
      if (!a) continue;
      a.energy = Math.max(0, a.energy - TOURS.energyPerWeek);
      a.hype = clamp(a.hype + TOURS.hypePerWeek, 0, 100);
      a.lastActiveTick = world.tick;
      busy.add(a.id);
    }
    // The story of the week.
    const event = roadEvent(rng, artist);
    const story = `${artist.name} : ${event.text}`;
    artist.hype = clamp(artist.hype + (event.hype ?? 0), 0, 100);
    artist.morale = clamp(artist.morale + (event.morale ?? 0), 0, 100);
    if (event.fans) artist.fans = Math.max(0, Math.round(artist.fans * (1 + event.fans)));
    if (event.reputation) label.reputation = clamp(label.reputation + event.reputation, 0, 100);
    if (event.cash) money += event.cash * label.tier;
    if (event.loud) world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text: `En tournée, ${story}` }];
    tour.log.push({ tick: world.tick, text: event.text, mood: event.mood });
    if (tour.log.length > TOURS.maxLog) tour.log.splice(0, tour.log.length - TOURS.maxLog);
    // The money: a co-headliner from another player takes his share.
    const total = Math.round(money + merch);
    const theirs = partner && tour.partner!.labelId !== label.id ? Math.round(Math.max(0, total) * TOURS.partnerShare) : 0;
    pay(label.id, total - theirs);
    if (theirs > 0) pay(tour.partner!.labelId, theirs);
    tour.totals.audience += crowd;
    tour.totals.money += total - theirs;
    tour.totals.merch += merch;
    tour.totals.fans += gained;
    tell(label.id, `Tournée de ${artist.name} : ${tonight} date${tonight > 1 ? 's' : ''}, ${crowd.toLocaleString('fr-FR')} personnes. ${event.text}`);
    if (theirs > 0) tell(tour.partner!.labelId, `Tournée commune avec ${artist.name} : ta part, ${theirs.toLocaleString('fr-FR')} €.`);
    if (tour.played >= tour.dates) {
      tour.state = 'done';
      tour.updatedTick = world.tick;
      tell(label.id, `Fin de la tournée de ${artist.name} : ${tour.totals.audience.toLocaleString('fr-FR')} personnes, ${tour.totals.fans.toLocaleString('fr-FR')} nouveaux fans.`);
    }
  }
  world.tours = world.tours.filter((t) => isLive(t) || world.tick - t.updatedTick < TOURS.keepTicks);
  return busy;
};

/* ---------------------------------- View ---------------------------------- */

export interface TourView {
  id: string;
  /** My tour, or an invitation for one of my artists. */
  mine: boolean;
  artistId: string;
  artistName: string;
  partnerId: string | null;
  partnerName: string | null;
  partnerLabel: string | null;
  partnerStatus: 'pending' | 'accepted' | 'refused' | null;
  openerId: string | null;
  openerName: string | null;
  state: TourState;
  startsIn: number;
  dates: number;
  played: number;
  merch: boolean;
  log: Tour['log'];
  totals: Tour['totals'];
}

export const toursView = (world: World, labelId: string): TourView[] =>
  toursOf(world)
    .filter((t) => t.labelId === labelId || t.partner?.labelId === labelId)
    .map((t) => ({
      id: t.id,
      mine: t.labelId === labelId,
      artistId: t.artistId,
      artistName: world.artists[t.artistId]?.name ?? '?',
      partnerId: t.partner?.artistId ?? null,
      partnerName: t.partner ? (world.artists[t.partner.artistId]?.name ?? '?') : null,
      partnerLabel: t.partner ? (world.labels[t.partner.labelId]?.name ?? '?') : null,
      partnerStatus: t.partner?.status ?? null,
      openerId: t.openerId,
      openerName: t.openerId ? (world.artists[t.openerId]?.name ?? '?') : null,
      state: t.state,
      startsIn: Math.max(0, t.startTick - world.tick),
      dates: t.dates,
      played: t.played,
      merch: t.merch,
      log: t.log,
      totals: t.totals,
    }));

/** Artists of the other players one can invite on a joint tour. */
export const tourGuests = (world: World, labelId: string): Array<{ id: string; name: string; labelName: string; fans: number }> =>
  Object.values(world.labels)
    .filter((l) => l.kind === 'player' && !l.bankrupt && l.id !== labelId)
    .flatMap((l) => rosterOf(world, l.id).map((a) => ({ id: a.id, name: a.name, labelName: l.name, fans: a.fans })))
    .slice(0, 40);
