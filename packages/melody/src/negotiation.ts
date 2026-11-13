// Contract talks with an artist's agent: hidden expectations, one blocking point, a patience gauge,
// counter-offers and grudges. Also used to renew the contract of an artist already in the label.
// Every draw comes from the world's seed: asking twice gives the same answer.
import { generalRating } from './artists.ts';
import { agreedTransfer, completeTransfer, dropAgreed } from './transfers.ts';
import { CFG } from './config.ts';
import { contractOf, fameTier, rosterOf } from './economy.ts';
import { clamp, rngFor } from './rng.ts';
import type { Artist, Label, World } from './types.ts';
import { tutorialStep } from './tutorial.ts';
import { GameError, expectedOffer, type Offer } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type Clause = 'advance' | 'royaltyRate' | 'months' | 'weeklyAllowance';
export type Mood = 'deal' | 'counter' | 'dry' | 'cold' | 'lock' | 'vexed' | 'tired';

export const CONTRACT_MONTHS = [6, 12, 18, 24, 36] as const;

export const TALK = {
  /** Ticks a renewal can be talked before the end of the contract. */
  renewWindow: 8,
  /** Ticks the artist refuses to talk after an insulting offer. */
  grudgeTicks: 28,
  /** Ticks before trying again when patience runs out. */
  retryTicks: 4,
  /** A talk left open this long starts again from scratch. */
  staleTicks: 4,
  maxRounds: 6,
};

export interface Talk {
  labelId: string;
  artistId: string;
  startTick: number;
  renewal: boolean;
  /** Hidden: what the artist really wants. Never sent to the app. */
  expect: Offer;
  lock: Clause;
  /** Hidden until the player breaks it once. */
  lockValue: number;
  lockRevealed: boolean;
  patience: number;
  maxPatience: number;
  rounds: number;
  counter: Offer | null;
  last: { mood: Mood; text: string; offer: Offer } | null;
}

export interface TalkMemory {
  closedUntil: number;
  /** He was insulted once: every later talk starts a little colder. */
  grudge: boolean;
  /** The agent's last words, shown after the talk is over. */
  last?: { mood: Mood; text: string; tick: number };
}

const key = (labelId: string, artistId: string): string => `${labelId}:${artistId}`;

export const talkOf = (world: World, labelId: string, artistId: string): Talk | undefined => world.talks?.[key(labelId, artistId)];

const memoryOf = (world: World, labelId: string, artistId: string): TalkMemory | undefined => world.talkMemory?.[key(labelId, artistId)];

const round100 = (value: number): number => Math.round(value / 100) * 100;
const roundRate = (value: number): number => Math.ceil(value * 100 - 1e-9) / 100;

/** Why a label cannot talk with this artist right now, or null. */
export const talkBlocked = (world: World, label: Label, artist: Artist): string | null => {
  const contract = contractOf(world, artist.id);
  const memory = memoryOf(world, label.id, artist.id);
  if (memory && memory.closedUntil > world.tick) {
    const weeks = memory.closedUntil - world.tick;
    return `Ne répond plus (${weeks} sem.)`;
  }
  if (contract) {
    if (contract.labelId !== label.id) {
      if (!agreedTransfer(world, label.id, artist.id)) return 'Déjà sous contrat';
      const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
      return rosterOf(world, label.id).length >= max ? 'Effectif complet' : null;
    }
    if (contract.loan) return 'Prêté : pas de renouvellement';
    if (contract.endTick - world.tick > TALK.renewWindow) return 'Contrat encore long';
    return null;
  }
  if (fameTier(artist) > label.tier || (generalRating(artist) >= 80 && label.tier < 3)) return 'Trop connu pour ton palier';
  const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
  if (rosterOf(world, label.id).length >= max) return 'Effectif complet';
  return null;
};

/** What the artist really wants: the posted price moved by luck, and by his mood for a renewal. */
const drawTalk = (world: World, label: Label, artist: Artist, renewal: boolean): Talk => {
  const rng = rngFor(world.seed, world.tick, `talk:${label.id}:${artist.id}`);
  const base = expectedOffer(artist, label.tier);
  const mood = renewal ? clamp(1 + (60 - artist.morale) / 200, 0.8, 1.3) : 1;
  const greed = (0.85 + rng.next() * 0.35) * mood;
  const advance = round100(base.advance * greed);
  const royaltyRate = roundRate(clamp(base.royaltyRate * (0.9 + rng.next() * 0.25) * mood, 0.12, 0.45));
  const months = rng.pick([12, 18, 18, 24]);
  const weeklyAllowance = rng.next() < 0.4 ? Math.max(50, Math.round((advance * 0.03) / 10) * 10) : 0;
  const expect: Offer = { advance, royaltyRate, months, weeklyAllowance };
  const locks: Clause[] = weeklyAllowance > 0 ? ['advance', 'royaltyRate', 'months', 'weeklyAllowance'] : ['advance', 'royaltyRate', 'months'];
  const lock = rng.pick(locks);
  const lockValue =
    lock === 'advance' ? round100(advance * 0.9) : lock === 'royaltyRate' ? royaltyRate : lock === 'months' ? months : weeklyAllowance;
  const patience = rng.int(3, 5);
  return {
    labelId: label.id,
    artistId: artist.id,
    startTick: world.tick,
    renewal,
    expect,
    lock,
    lockValue,
    lockRevealed: false,
    patience,
    maxPatience: patience,
    rounds: 0,
    counter: null,
    last: null,
  };
};

/** True when the offer breaks the blocking point. */
const breaksLock = (talk: Talk, offer: Offer): boolean =>
  talk.lock === 'months' ? offer.months > talk.lockValue : offer[talk.lock] < talk.lockValue;

const ratio = (offered: number, wanted: number): number => (wanted <= 0 ? 1 : Math.min(1.5, offered / wanted));

/** How the agent rates an offer: 100 or more and he signs. */
export const offerScore = (talk: Talk, offer: Offer, reputation: number, grudge: boolean): number => {
  const e = talk.expect;
  const allowance =
    e.weeklyAllowance > 0 ? ratio(offer.weeklyAllowance, e.weeklyAllowance) : 1 + Math.min(0.5, offer.weeklyAllowance / Math.max(50, e.advance * 0.03) / 2);
  const steps = (offer.months - e.months) / 6;
  const duration = steps > 0 ? -5 * steps : Math.min(6, -3 * steps);
  return (
    45 * ratio(offer.advance, e.advance) +
    35 * ratio(offer.royaltyRate, e.royaltyRate) +
    10 * allowance +
    10 +
    duration +
    (reputation - 30) * 0.25 -
    (grudge ? 20 : 0)
  );
};

/** The offer the agent asks back: the player's offer raised just enough to reach 100. */
const counterOffer = (talk: Talk, offer: Offer, reputation: number, grudge: boolean): Offer => {
  const e = talk.expect;
  let best: Offer = offer;
  for (let k = 1; k <= 1.5 + 1e-9; k += 0.05) {
    best = {
      advance: Math.max(offer.advance, round100(e.advance * k)),
      royaltyRate: Math.max(offer.royaltyRate, roundRate(Math.min(0.5, e.royaltyRate * k))),
      months: Math.min(offer.months, e.months),
      weeklyAllowance: Math.max(offer.weeklyAllowance, e.weeklyAllowance),
    };
    if (talk.lock === 'advance') best.advance = Math.max(best.advance, talk.lockValue);
    if (offerScore(talk, best, reputation, grudge) >= 100) break;
  }
  return best;
};

/** The offer gives the artist at least as much as the counter-offer on every clause. */
const meets = (offer: Offer, counter: Offer): boolean =>
  offer.advance >= counter.advance &&
  offer.royaltyRate >= counter.royaltyRate - 1e-9 &&
  offer.months <= counter.months &&
  offer.weeklyAllowance >= counter.weeklyAllowance;

const CLAUSE_TEXT: Record<Clause, (value: number) => string> = {
  advance: (v) => `Pas de deal sous ${v.toLocaleString('fr-FR')} € d'avance.`,
  royaltyRate: (v) => `Pas de deal sous ${Math.round(v * 100)} % de royalties.`,
  months: (v) => `Il ne signe pas plus de ${v} mois.`,
  weeklyAllowance: (v) => `Il veut au moins ${v.toLocaleString('fr-FR')} € par semaine.`,
};

const LINES: Record<Exclude<Mood, 'lock'>, string[]> = {
  deal: ['Marché conclu. On signe !', 'Ça nous va. Où est le stylo ?', 'Deal. Il a hâte de commencer.'],
  counter: ['On y est presque. Voilà ce qu’on veut.', 'Pas loin. Monte un peu et c’est bon.', 'Intéressant… mais regarde notre contre-offre.'],
  dry: ['Hmm. C’est un peu léger.', 'Tu nous fais perdre du temps. Voilà notre prix.', 'On attendait mieux.'],
  cold: ['Tu n’es pas sérieux.', 'C’est une blague ?', 'On n’est pas venus pour ça.'],
  vexed: ['C’est une insulte. On s’en va.', 'Oublie-nous pendant un moment.', 'Il raccroche. Il s’en souviendra.'],
  tired: ['Il en a assez. Reviens dans quelques semaines.', 'Plus de patience. On en reparle plus tard.'],
};

const line = (world: World, talk: Talk, mood: Exclude<Mood, 'lock'>): string => {
  const options = LINES[mood];
  return options[rngFor(world.seed, world.tick, `line:${talk.labelId}:${talk.artistId}:${talk.rounds}`).int(0, options.length - 1)] ?? options[0] ?? '';
};

const cleanOffer = (offer: Offer): Offer => ({
  advance: Math.max(0, Math.round(offer.advance)),
  royaltyRate: clamp(Math.round(offer.royaltyRate * 100) / 100, 0.05, 0.5),
  months: CONTRACT_MONTHS.includes(offer.months as (typeof CONTRACT_MONTHS)[number]) ? offer.months : 18,
  weeklyAllowance: clamp(Math.round(offer.weeklyAllowance / 10) * 10, 0, 1_000_000),
});

/** Opens (or reopens) the talk with an artist. Returns the running talk if there is one. */
export const openTalk = (world: World, label: Label, artistId: string): Talk => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  const running = talkOf(world, label.id, artistId);
  if (running && world.tick - running.startTick < TALK.staleTicks) return running;
  const blocked = talkBlocked(world, label, artist);
  if (blocked) return fail(`${artist.name} : ${blocked.toLowerCase()}.`);
  const renewal = contractOf(world, artistId)?.labelId === label.id;
  const talk = drawTalk(world, label, artist, renewal);
  world.talks = { ...world.talks, [key(label.id, artistId)]: talk };
  return talk;
};

const closeTalk = (world: World, talk: Talk, closedFor: number, grudge: boolean): void => {
  const k = key(talk.labelId, talk.artistId);
  if (world.talks) delete world.talks[k];
  const before = world.talkMemory?.[k];
  const last = talk.last ? { mood: talk.last.mood, text: talk.last.text, tick: world.tick } : undefined;
  world.talkMemory = { ...world.talkMemory, [k]: { closedUntil: world.tick + closedFor, grudge: grudge || (before?.grudge ?? false), last } };
};

const signTalk = (world: World, label: Label, talk: Talk, offer: Offer): void => {
  const artist = world.artists[talk.artistId] ?? fail('Artiste introuvable.');
  const contract = contractOf(world, talk.artistId);
  if (talk.renewal) {
    if (!contract || contract.labelId !== label.id) fail(`${artist.name} n'est plus dans ton label.`);
  } else if (contract) {
    // Bought from another player: the fee is paid and his old contract ends here.
    completeTransfer(world, label, talk.artistId);
  }
  if (offer.advance > label.cash) fail("Pas assez de cash pour payer l'avance après le transfert.");
  label.cash -= offer.advance;
  if (talk.renewal && contract) {
    contract.endTick = Math.max(contract.endTick, world.tick) + offer.months * CFG.ticksPerMonth;
    contract.advance += offer.advance;
    contract.unrecouped += offer.advance;
    contract.royaltyRate = offer.royaltyRate;
    contract.weeklyAllowance = offer.weeklyAllowance;
    artist.morale = clamp(artist.morale + 10, 0, 100);
  } else {
    world.contracts.push({
      artistId: talk.artistId,
      labelId: label.id,
      startTick: world.tick,
      endTick: world.tick + offer.months * CFG.ticksPerMonth,
      advance: offer.advance,
      unrecouped: offer.advance,
      weeklyAllowance: offer.weeklyAllowance,
      royaltyRate: offer.royaltyRate,
    });
  }
};

/** The player puts an offer on the table. The agent signs, asks more, loses patience or leaves. */
export const makeOffer = (world: World, label: Label, artistId: string, raw: Offer): Mood => {
  const talk = openTalk(world, label, artistId);
  const offer = cleanOffer(raw);
  if (offer.advance > label.cash) return fail("Pas assez de cash pour payer l'avance.");
  if (!talk.renewal) {
    const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
    if (rosterOf(world, label.id).length >= max) return fail('Ton effectif est complet pour ce palier.');
  }
  const grudge = memoryOf(world, label.id, artistId)?.grudge ?? false;
  talk.rounds += 1;
  const say = (mood: Mood, text: string): Mood => {
    talk.last = { mood, text, offer };
    return mood;
  };

  const deal = (): Mood => {
    say('deal', line(world, talk, 'deal'));
    signTalk(world, label, talk, offer);
    closeTalk(world, talk, 0, false);
    return 'deal';
  };
  if (talk.counter && meets(offer, talk.counter)) return deal();
  const score = offerScore(talk, offer, label.reputation, grudge);
  // No contract talks in the tutorial any more: the first artist comes from the centre de formation.
  const guided = false;
  if (score < 40 && !guided) {
    say('vexed', line(world, talk, 'vexed'));
    closeTalk(world, talk, TALK.grudgeTicks, true);
    if (!talk.renewal) dropAgreed(world, label.id, artistId);
    if (talk.renewal) {
      const artist = world.artists[artistId];
      if (artist) artist.morale = clamp(artist.morale - 10, 0, 100);
    }
    return 'vexed';
  }
  let mood: Mood;
  if (breaksLock(talk, offer)) {
    talk.patience -= talk.lockRevealed ? 2 : 1;
    talk.lockRevealed = true;
    mood = say('lock', CLAUSE_TEXT[talk.lock](talk.lockValue));
  } else if (score >= 100) {
    return deal();
  } else if (score >= 80) {
    mood = say('counter', line(world, talk, 'counter'));
  } else if (score >= 60) {
    talk.patience -= 1;
    mood = say('dry', line(world, talk, 'dry'));
  } else {
    talk.patience -= 2;
    mood = say('cold', line(world, talk, 'cold'));
  }
  if (mood !== 'cold') talk.counter = counterOffer(talk, offer, label.reputation, grudge);
  if (guided) {
    talk.patience = Math.max(1, talk.patience);
    talk.rounds = Math.min(talk.rounds, TALK.maxRounds - 1);
  }
  if (talk.patience <= 0 || talk.rounds >= TALK.maxRounds) {
    say('tired', line(world, talk, 'tired'));
    closeTalk(world, talk, TALK.retryTicks, false);
    if (!talk.renewal) dropAgreed(world, label.id, artistId);
    return 'tired';
  }
  return mood;
};

/** The player leaves the table. Nothing is lost, but the same week gives the same agent. */
export const leaveTalk = (world: World, label: Label, artistId: string): void => {
  if (world.talks) delete world.talks[key(label.id, artistId)];
};

export interface TalkView {
  artistId: string;
  renewal: boolean;
  patience: number;
  maxPatience: number;
  rounds: number;
  maxRounds: number;
  /** The blocking point once revealed. */
  lock: { clause: Clause; value: number } | null;
  counter: Offer | null;
  last: Talk['last'];
  /** A rough idea of what he wants: the posted price, not the hidden one. */
  hint: Offer;
  /** Price agreed with his current label (transfer between players), paid when he signs. 0 otherwise. */
  transferFee: number;
}

export const talkView = (world: World, talk: Talk): TalkView => {
  const artist = world.artists[talk.artistId];
  return {
    artistId: talk.artistId,
    renewal: talk.renewal,
    patience: talk.patience,
    maxPatience: talk.maxPatience,
    rounds: talk.rounds,
    maxRounds: TALK.maxRounds,
    lock: talk.lockRevealed ? { clause: talk.lock, value: talk.lockValue } : null,
    counter: talk.counter,
    last: talk.last,
    hint: artist ? expectedOffer(artist, world.labels[talk.labelId]?.tier ?? 1) : talk.expect,
    transferFee: agreedTransfer(world, talk.labelId, talk.artistId)?.fee ?? 0,
  };
};

/** The talks of one label still open this week. */
export const talksOfLabel = (world: World, labelId: string): TalkView[] =>
  Object.values(world.talks ?? {})
    .filter((t) => t.labelId === labelId && world.tick - t.startTick < TALK.staleTicks)
    .map((t) => talkView(world, t));

/** Forgets old talks and old grudges. Called by the weekly tick. */
export const cleanTalks = (world: World): void => {
  for (const [k, talk] of Object.entries(world.talks ?? {})) if (world.tick - talk.startTick >= TALK.staleTicks) delete world.talks?.[k];
  for (const [k, memory] of Object.entries(world.talkMemory ?? {})) if (memory.closedUntil <= world.tick && !memory.grudge) delete world.talkMemory?.[k];
};


export interface TalkNews {
  artistId: string;
  mood: Mood;
  text: string;
  /** Weeks before he talks again (0 when signed). */
  closedFor: number;
}

/** The talks that ended this week for one label, with the agent's last words. */
export const talkNews = (world: World, labelId: string): TalkNews[] =>
  Object.entries(world.talkMemory ?? {})
    .filter(([k, m]) => k.startsWith(`${labelId}:`) && m.last && m.last.tick === world.tick)
    .map(([k, m]) => ({
      artistId: k.slice(labelId.length + 1),
      mood: m.last?.mood ?? 'tired',
      text: m.last?.text ?? '',
      closedFor: Math.max(0, m.closedUntil - world.tick),
    }));
