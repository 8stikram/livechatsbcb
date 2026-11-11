// Studio sessions: the events between the choices of a song (smooth sessions and "embrouilles"),
// then the featuring talks and their wheel. Everything is drawn on the server from the world's seed,
// so starting again or asking twice the same week gives the same draw.
import { artisticSkill, generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { GENRES, beatById } from './data/content.ts';
import { contractOf } from './economy.ts';
import { estimateQuality, featChance, featDemand, producerOfLevel, songCost, songEnergy } from './quality.ts';
import { clamp, rngFor } from './rng.ts';
import type { Artist, Label, SessionEvent, SongLevels, StudioSession, StudioStage, World } from './types.ts';
import { GameError, createSong, type SongRequest } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

/* ---------------------------------- Cards ---------------------------------- */

interface Effect {
  cost?: number;
  quality?: number;
  delay?: number;
  morale?: number;
  energy?: number;
  /** The guest leaves; this share of his fee is still paid. */
  dropFeat?: number;
  /** The guest's fee goes up by this share. */
  featRaise?: number;
}

interface Context {
  artist: Artist;
  levels: SongLevels;
  baseCost: number;
  featFee: number;
}

interface ReactionDef {
  id: string;
  text: string;
  effect?: (ctx: Context) => Effect;
  /** A gamble: success chance and the effect of each side. */
  roll?: { chance: (ctx: Context) => number; success: (ctx: Context) => Effect; failure: (ctx: Context) => Effect; successText: string; failureText: string };
}

interface CardDef {
  id: string;
  stage: StudioStage;
  title: string;
  text: string;
  reactions: ReactionDef[];
}

const price = (table: readonly number[], level: number): number => table[level - 1] ?? 0;
const Q = CFG.quality;
// Keeping an artist in line works better when he is disciplined.
const discipline = (ctx: Context): number => clamp(0.3 + ctx.artist.attrs.discipline / 150, 0.2, 0.9);
const fifty = (): number => 0.5;

const CARDS: CardDef[] = [
  {
    id: 'theme_change',
    stage: 'theme',
    title: 'Il veut changer de thème',
    text: 'En cabine, ton artiste lâche : « Ce thème, c’est pas moi. »',
    reactions: [
      { id: 'accept', text: 'Accepter son idée', effect: () => ({ morale: 6, quality: -1 }) },
      {
        id: 'reframe',
        text: 'Le recadrer',
        roll: { chance: discipline, success: () => ({}), failure: () => ({ morale: -8, quality: -3 }), successText: 'Il se remet au travail.', failureText: 'Il boude et bâcle ses couplets.' },
      },
      { id: 'coauthor', text: 'Payer un co-auteur', effect: () => ({ cost: 1_500, quality: 1 }) },
    ],
  },
  {
    id: 'blank_page',
    stage: 'theme',
    title: 'Page blanche',
    text: 'Trois heures devant le micro, pas une ligne.',
    reactions: [
      { id: 'pay', text: 'Payer une séance d’écriture', effect: () => ({ cost: 800 }) },
      {
        id: 'push',
        text: 'Le pousser à finir',
        roll: { chance: discipline, success: () => ({ quality: 1 }), failure: () => ({ quality: -3, morale: -4 }), successText: 'Ça finit par sortir, et c’est bon.', failureText: 'Il force, ça s’entend.' },
      },
      { id: 'ignore', text: 'Garder le brouillon', effect: () => ({ quality: -2 }) },
    ],
  },
  {
    id: 'leak',
    stage: 'theme',
    title: 'Le texte a fuité',
    text: 'Une capture du texte tourne sur les réseaux.',
    reactions: [
      { id: 'rewrite', text: 'Tout réécrire', effect: () => ({ delay: 1 }) },
      { id: 'keep', text: 'Garder le texte quand même', effect: () => ({ quality: -2 }) },
      { id: 'silence', text: 'Faire retirer la capture', effect: () => ({ cost: 1_000 }) },
    ],
  },
  {
    id: 'sample',
    stage: 'beat',
    title: 'Le sample est refusé',
    text: 'Les ayants droit du sample disent non.',
    reactions: [
      { id: 'pay', text: 'Payer les droits', effect: (ctx) => ({ cost: Math.max(500, Math.round(ctx.baseCost * 0.15)) }) },
      { id: 'redo', text: 'Refaire le beat sans', effect: () => ({ quality: -3 }) },
      {
        id: 'gamble',
        text: 'Sortir quand même',
        roll: { chance: fifty, success: () => ({}), failure: () => ({ cost: 2_000 }), successText: 'Personne ne remarque rien.', failureText: 'Amende : 2 000 € à payer.' },
      },
    ],
  },
  {
    id: 'beat_sold',
    stage: 'beat',
    title: 'Le beat est déjà vendu',
    text: 'Un autre rappeur vient de poser sur la même prod.',
    reactions: [
      { id: 'buy', text: 'Racheter l’exclusivité', effect: (ctx) => ({ cost: Math.max(300, Math.round(price(Q.beatPrice, ctx.levels.beat) * 0.5) + 300) }) },
      { id: 'change', text: 'Prendre un autre beat', effect: () => ({ quality: -3 }) },
    ],
  },
  {
    id: 'tempo',
    stage: 'beat',
    title: 'Il galère sur le tempo',
    text: 'Le flow ne rentre pas dans la prod.',
    reactions: [
      {
        id: 'reframe',
        text: 'Insister prise après prise',
        roll: { chance: discipline, success: () => ({ quality: 1 }), failure: () => ({ quality: -3 }), successText: 'La dixième prise est la bonne.', failureText: 'Ça reste bancal.' },
      },
      { id: 'slow', text: 'Revenir la semaine prochaine', effect: () => ({ delay: 1 }) },
      { id: 'ignore', text: 'Garder la prise la moins pire', effect: () => ({ quality: -2 }) },
    ],
  },
  {
    id: 'ghost',
    stage: 'producer',
    title: 'Le producteur ne répond plus',
    text: 'Messages lus, pas de réponse. La session est dans deux heures.',
    reactions: [
      { id: 'pay', text: 'Payer une rallonge', effect: (ctx) => ({ cost: Math.max(300, Math.round(price(Q.producerPrice, ctx.levels.producer) * 0.3)) }) },
      {
        id: 'pressure',
        text: 'Lui mettre la pression',
        roll: { chance: fifty, success: () => ({}), failure: () => ({ quality: -3 }), successText: 'Il débarque, un peu vexé.', failureText: 'Il ne vient pas. Tu bricoles sans lui.' },
      },
      { id: 'wait', text: 'Attendre', effect: () => ({ delay: 1, morale: -3 }) },
    ],
  },
  {
    id: 'clash',
    stage: 'producer',
    title: 'Ça clashe en studio',
    text: 'L’artiste et le producteur ne sont d’accord sur rien.',
    reactions: [
      { id: 'mediate', text: 'Payer un médiateur', effect: () => ({ cost: 500 }) },
      { id: 'artist', text: 'Donner raison à l’artiste', effect: () => ({ morale: 4, quality: -2 }) },
      { id: 'producer', text: 'Donner raison au producteur', effect: () => ({ morale: -6 }) },
    ],
  },
  {
    id: 'vision',
    stage: 'producer',
    title: 'Le producteur veut tout changer',
    text: '« Fais-moi confiance, on repart de zéro. »',
    reactions: [
      {
        id: 'trust',
        text: 'Lui faire confiance',
        roll: { chance: fifty, success: () => ({ quality: 3 }), failure: () => ({ quality: -3 }), successText: 'Pari gagné : le son décolle.', failureText: 'Pari perdu : c’était mieux avant.' },
      },
      { id: 'refuse', text: 'Garder l’idée de départ', effect: () => ({ quality: -1 }) },
    ],
  },
  {
    id: 'breakdown',
    stage: 'studio',
    title: 'Panne au studio',
    text: 'La console lâche en pleine prise.',
    reactions: [
      { id: 'rent', text: 'Louer une autre cabine', effect: (ctx) => ({ cost: Math.max(200, Math.round(price(Q.studioPrice, ctx.levels.studio) * 0.25)) }) },
      { id: 'home', text: 'Finir à la maison', effect: () => ({ quality: -3 }) },
      { id: 'tomorrow', text: 'Revenir plus tard', effect: () => ({ delay: 1 }) },
    ],
  },
  {
    id: 'neighbours',
    stage: 'studio',
    title: 'Les voisins appellent la police',
    text: 'Trop de basses, trop tard.',
    reactions: [
      { id: 'pay', text: 'Calmer tout le monde', effect: () => ({ cost: 300 }) },
      { id: 'night', text: 'Finir au casque toute la nuit', effect: () => ({ energy: -5 }) },
      { id: 'ignore', text: 'Couper la session', effect: () => ({ quality: -2 }) },
    ],
  },
  {
    id: 'crew',
    stage: 'studio',
    title: 'Il a ramené toute sa bande',
    text: 'Quinze potes dans la cabine, ambiance soirée.',
    reactions: [
      { id: 'kick', text: 'Faire sortir tout le monde', effect: () => ({ morale: -5 }) },
      {
        id: 'keep',
        text: 'Laisser l’ambiance',
        roll: { chance: discipline, success: () => ({ morale: 4, quality: 1 }), failure: () => ({ quality: -3 }), successText: 'L’énergie de la bande passe dans le son.', failureText: 'Personne ne bosse.' },
      },
    ],
  },
  {
    id: 'greedy',
    stage: 'feat',
    title: 'L’invité demande plus',
    text: 'Au moment de poser, l’invité veut 20 % de plus.',
    reactions: [
      { id: 'pay', text: 'Payer 20 % de plus', effect: () => ({ featRaise: 0.2 }) },
      {
        id: 'refuse',
        text: 'Refuser',
        roll: { chance: fifty, success: () => ({}), failure: () => ({ dropFeat: 0.5 }), successText: 'Il râle mais il pose.', failureText: 'Il s’en va. Tu perds la moitié de son cachet.' },
      },
    ],
  },
];

const FLUIDS: Array<{ id: string; title: string; text: string; effect: Effect }> = [
  { id: 'flow', title: 'Ça coule tout seul', text: 'Qualité +2', effect: { quality: 2 } },
  { id: 'express', title: 'Session express', text: 'Énergie +3', effect: { energy: 3 } },
  { id: 'vibe', title: 'Bonne ambiance', text: 'Moral +5', effect: { morale: 5 } },
  { id: 'genius', title: 'Coup de génie', text: 'Qualité +5', effect: { quality: 5 } },
];

const cardById = (id: string): CardDef => CARDS.find((c) => c.id === id) ?? fail('Événement inconnu.');
const fluidById = (id: string) => FLUIDS.find((f) => f.id === id) ?? fail('Événement inconnu.');

/** Base chance of trouble by level of the choice: the cheap options break more often. */
const RISK = [0.28, 0.2, 0.13, 0.08];
const STAGES: Array<Exclude<StudioStage, 'feat'>> = ['theme', 'beat', 'producer', 'studio'];

const clashChance = (artist: Artist, level: number, clashesSoFar: number): number => {
  let chance = RISK[level - 1] ?? 0.2;
  chance -= (artist.attrs.discipline - 50) * 0.002;
  if (artist.morale < 40) chance += 0.15;
  if (artist.creativeFatigue > 70) chance += 0.1;
  chance -= 0.1 * clashesSoFar;
  return clamp(chance, 0.03, 0.6);
};

/* ---------------------------------- Helpers ---------------------------------- */

const sessionsOf = (world: World): Record<string, StudioSession> => (world.sessions ??= {});
const memoryOf = (world: World) => (world.featMemory ??= {});

export const sessionOf = (world: World, labelId: string): StudioSession | null => world.sessions?.[labelId] ?? null;

const contextOf = (world: World, session: StudioSession): Context => {
  const artist = world.artists[session.artistId] ?? fail('Artiste introuvable.');
  return {
    artist,
    levels: session.levels,
    baseCost: songCost(session.levels, producerOfLevel(session.levels.producer)),
    featFee: session.feat?.fee ?? 0,
  };
};

const apply = (session: StudioSession, effect: Effect): void => {
  session.cost += effect.cost ?? 0;
  session.quality += effect.quality ?? 0;
  session.delay += effect.delay ?? 0;
  session.morale += effect.morale ?? 0;
  session.energy += effect.energy ?? 0;
  if (effect.featRaise && session.feat) session.feat.fee = Math.round(session.feat.fee * (1 + effect.featRaise));
  if (effect.dropFeat !== undefined && session.feat) {
    session.cost += Math.round(session.feat.fee * effect.dropFeat);
    session.feat = null;
  }
};

const number = (value: number): string => Math.round(value).toLocaleString('fr-FR').replace(/ | /g, ' ');

/** A few words on what a reaction does, shown on its button. */
const describe = (effect: Effect, ctx: Context): string => {
  const parts: string[] = [];
  if (effect.cost) parts.push(`+${number(effect.cost)} €`);
  if (effect.featRaise) parts.push(`+${number(ctx.featFee * effect.featRaise)} €`);
  if (effect.quality) parts.push(`Qualité ${effect.quality > 0 ? '+' : '−'}${Math.abs(effect.quality)}`);
  if (effect.delay) parts.push(`+${effect.delay} semaine`);
  if (effect.morale) parts.push(`Moral ${effect.morale > 0 ? '+' : '−'}${Math.abs(effect.morale)}`);
  if (effect.energy) parts.push(`Énergie ${effect.energy > 0 ? '+' : '−'}${Math.abs(effect.energy)}`);
  return parts.join(' · ') || 'Rien ne change';
};

const recordedThisWeek = (world: World, labelId: string): number =>
  world.songs.filter((s) => s.labelId === labelId && s.createdTick === world.tick).length;

/* ---------------------------------- Session ---------------------------------- */

/** Enters the studio: checks the song can be paid, then draws what happens after each choice. */
export const startSession = (world: World, label: Label, request: { artistId: string; themeId: string; beatId: string; levels: SongLevels }): StudioSession => {
  const artist = world.artists[request.artistId] ?? fail('Artiste introuvable.');
  if (contractOf(world, artist.id)?.labelId !== label.id) fail(`${artist.name} n'est pas dans ton label.`);
  beatById(request.beatId);
  const cost = songCost(request.levels, producerOfLevel(request.levels.producer));
  const cap = CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000;
  if (cost > cap) fail('Ce son dépasse le budget autorisé pour ton palier.');
  if (cost > label.cash) fail('Pas assez de cash pour ce son.');
  if (artist.energy < songEnergy(request.levels, false, artist)) fail(`${artist.name} n'a pas assez d'énergie.`);

  const index = recordedThisWeek(world, label.id);
  const events: SessionEvent[] = [];
  let clashes = 0;
  for (const stage of STAGES) {
    const rng = rngFor(world.seed, world.tick, `studio:${label.id}:${artist.id}:${index}:${stage}`);
    if (rng.next() < clashChance(artist, request.levels[stage], clashes)) {
      clashes += 1;
      const card = rng.pick(CARDS.filter((c) => c.stage === stage));
      events.push({ stage, kind: 'clash', cardId: card.id, reaction: null, result: null });
    } else {
      const fluid = rng.next() < 0.05 ? fluidById('genius') : rng.pick(FLUIDS.filter((f) => f.id !== 'genius'));
      events.push({ stage, kind: 'fluid', cardId: fluid.id, reaction: null, result: fluid.text });
    }
  }

  const session: StudioSession = {
    ...request,
    tick: world.tick,
    index,
    events,
    quality: 0,
    cost: 0,
    delay: 0,
    morale: 0,
    energy: 0,
    feat: null,
    featDone: false,
    lastOffer: null,
  };
  for (const event of events) if (event.kind === 'fluid') apply(session, fluidById(event.cardId).effect);
  sessionsOf(world)[label.id] = session;
  return session;
};

const openSession = (world: World, label: Label): StudioSession => sessionOf(world, label.id) ?? fail("Tu n'es pas en studio.");

/** Answers the first embrouille still waiting. */
export const reactToEvent = (world: World, label: Label, reactionId: string): void => {
  const session = openSession(world, label);
  const event = session.events.find((e) => e.kind === 'clash' && e.reaction === null) ?? fail('Rien à régler pour le moment.');
  const card = cardById(event.cardId);
  const reaction = card.reactions.find((r) => r.id === reactionId) ?? fail('Réaction inconnue.');
  const ctx = contextOf(world, session);
  if (reaction.roll) {
    const rng = rngFor(world.seed, session.tick, `react:${label.id}:${session.artistId}:${session.index}:${event.stage}:${reaction.id}`);
    const won = rng.next() < reaction.roll.chance(ctx);
    const effect = won ? reaction.roll.success(ctx) : reaction.roll.failure(ctx);
    apply(session, effect);
    event.result = `${won ? reaction.roll.successText : reaction.roll.failureText}${Object.keys(effect).length ? ` ${describe(effect, ctx)}.` : ''}`;
  } else {
    const effect = reaction.effect?.(ctx) ?? {};
    if (effect.cost && effect.cost + session.cost + ctx.baseCost + ctx.featFee > label.cash) fail('Pas assez de cash pour ça.');
    apply(session, effect);
    event.result = describe(effect, ctx);
  }
  event.reaction = reaction.id;
};

export const cancelSession = (world: World, label: Label): void => {
  delete sessionsOf(world)[label.id];
};

const pending = (session: StudioSession): boolean => session.events.some((e) => e.kind === 'clash' && e.reaction === null);

/* ---------------------------------- Featuring ---------------------------------- */

const memoryKey = (labelId: string, guestId: string) => `${labelId}:${guestId}`;

const memoryFor = (world: World, labelId: string, guestId: string) => {
  const memory = memoryOf(world)[memoryKey(labelId, guestId)];
  if (!memory) return { tick: world.tick, tries: 0, closedUntil: -1 };
  return memory.tick === world.tick ? memory : { ...memory, tick: world.tick, tries: 0 };
};

/** What a guest asks now: +10 % after each refusal of the week. */
export const guestDemand = (world: World, labelId: string, guest: Artist): number =>
  Math.round(featDemand(guest) * 1.1 ** memoryFor(world, labelId, guest.id).tries);

/** Extra chance when the guest makes the same kind of music. */
export const guestBonus = (host: Artist, guest: Artist): number => (GENRES[host.genre].family === GENRES[guest.genre].family ? 0.05 : 0);

/** Why a guest will not talk this week, or null. */
export const guestBlocked = (world: World, labelId: string, guest: Artist): string | null => {
  const memory = memoryFor(world, labelId, guest.id);
  if (memory.closedUntil > world.tick) return memory.closedUntil - world.tick > 1 ? 'Vexé, il te boude' : 'Vexé, revient la semaine prochaine';
  if (memory.tries >= 3) return 'Trois refus cette semaine';
  return null;
};

/** Artists who could pose on the song: not in a player's label, of a near genre, that the label can afford. */
export const guestChoices = (world: World, label: Label, session: StudioSession): Artist[] => {
  const host = world.artists[session.artistId];
  if (!host) return [];
  const family = GENRES[host.genre].family;
  const near = new Set([host.genre, ...GENRES[host.genre].neighbours]);
  const base = songCost(session.levels, producerOfLevel(session.levels.producer));
  const cap = CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000;
  const budget = Math.max(0, Math.min(label.cash - base - session.cost, cap - base));
  const affordable = Object.values(world.artists)
    .filter((a) => a.id !== host.id && (near.has(a.genre) || GENRES[a.genre].family === family))
    .filter((a) => {
      const owner = contractOf(world, a.id);
      return !owner || world.labels[owner.labelId]?.kind !== 'player';
    })
    .filter((a) => featDemand(a) * 0.6 <= budget)
    .sort((a, b) => b.fans - a.fans);
  // Eight guests spread from the biggest affordable star to the smallest name: there is always a cheap option.
  if (affordable.length <= GUESTS) return affordable;
  return Array.from({ length: GUESTS }, (_, i) => affordable[Math.round((i * (affordable.length - 1)) / (GUESTS - 1))]!);
};
const GUESTS = 8;

/** Spins the wheel for an offer. The result stays in the session so the app can show the spin. */
export const offerFeat = (world: World, label: Label, guestId: string, offer: number): void => {
  const session = openSession(world, label);
  if (pending(session)) fail("Règle d'abord ce qui se passe en studio.");
  if (session.featDone) fail('Le featuring est déjà réglé pour ce son.');
  const guest = world.artists[guestId] ?? fail('Artiste introuvable.');
  if (!guestChoices(world, label, session).some((a) => a.id === guest.id)) fail("Cet artiste n'est pas disponible pour ce son.");
  const blocked = guestBlocked(world, label.id, guest);
  if (blocked) fail(`${guest.name} : ${blocked.toLowerCase()}.`);
  const host = world.artists[session.artistId] ?? fail('Artiste introuvable.');
  const base = songCost(session.levels, producerOfLevel(session.levels.producer));
  const price = Math.round(offer);
  if (price < 1) fail('Propose une somme.');
  if (base + session.cost + price > label.cash) fail('Pas assez de cash pour cette offre.');
  if (base + price > (CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000)) fail('Cette offre dépasse le budget de ton palier.');

  const demand = guestDemand(world, label.id, guest);
  const memory = memoryFor(world, label.id, guest.id);
  const chance = featChance(price, demand, 0, label.reputation, guestBonus(host, guest));
  if (chance === null) {
    // Insulted before the wheel even turns: he refuses everything for four weeks.
    memoryOf(world)[memoryKey(label.id, guest.id)] = { ...memory, closedUntil: world.tick + CFG.ticksPerMonth };
    session.lastOffer = { guestId: guest.id, offer: price, chance: 0, roll: null, outcome: 'vexed' };
    return;
  }
  const roll = rngFor(world.seed, world.tick, `feat:${label.id}:${guest.id}:${memory.tries}`).next();
  if (roll < chance) {
    if (host.energy < songEnergy(session.levels, true, host)) fail(`${host.name} n'a pas assez d'énergie pour un featuring.`);
    session.feat = { guestId: guest.id, fee: price };
    session.featDone = true;
    session.lastOffer = { guestId: guest.id, offer: price, chance, roll, outcome: 'accepted' };
    // One time in four, the guest asks for more once in the booth.
    if (rngFor(world.seed, world.tick, `greedy:${label.id}:${guest.id}`).next() < 0.25) {
      session.events.push({ stage: 'feat', kind: 'clash', cardId: 'greedy', reaction: null, result: null });
    }
    memoryOf(world)[memoryKey(label.id, guest.id)] = { ...memory, tries: memory.tries + 1 };
    return;
  }
  const vexed = price < demand * 0.6;
  memoryOf(world)[memoryKey(label.id, guest.id)] = { ...memory, tries: memory.tries + 1, closedUntil: vexed ? world.tick + 1 : memory.closedUntil };
  session.lastOffer = { guestId: guest.id, offer: price, chance, roll, outcome: vexed ? 'vexed' : 'refused' };
};

export const skipFeat = (world: World, label: Label): void => {
  const session = openSession(world, label);
  if (pending(session)) fail("Règle d'abord ce qui se passe en studio.");
  session.featDone = true;
};

/** Records the song of the session. */
export const finishSession = (world: World, label: Label, title: string, producer: SongRequest['producer']): void => {
  const session = openSession(world, label);
  if (pending(session)) fail("Règle d'abord ce qui se passe en studio.");
  if (!session.featDone) fail('Choisis un featuring ou passe cette étape.');
  const request: SongRequest = {
    artistId: session.artistId,
    title,
    themeId: session.themeId,
    beatId: session.beatId,
    levels: session.levels,
    producer,
    featArtistId: session.feat?.guestId ?? null,
    featFee: session.feat?.fee ?? 0,
    eventBonus: session.quality,
    eventCost: session.cost,
    extraDelay: session.delay,
    moraleDelta: session.morale,
    energyDelta: session.energy,
  };
  createSong(world, label.id, request);
  delete sessionsOf(world)[label.id];
};

/* ---------------------------------- View ---------------------------------- */

export interface SessionEventView {
  stage: StudioStage;
  kind: 'fluid' | 'clash';
  title: string;
  text: string;
  reactions: Array<{ id: string; text: string; hint: string }>;
  reaction: string | null;
  result: string | null;
}

export interface GuestView {
  id: string;
  name: string;
  genre: string;
  gen: number;
  fans: number;
  real: boolean;
  demand: number;
  bonus: number;
  blocked: string | null;
}

export interface SessionView {
  artistId: string;
  artistName: string;
  themeId: string;
  beatId: string;
  levels: SongLevels;
  events: SessionEventView[];
  qualityMin: number;
  qualityMax: number;
  baseCost: number;
  extraCost: number;
  energy: number;
  delayWeeks: number;
  feat: { guestId: string; name: string; fee: number } | null;
  featDone: boolean;
  lastOffer: (StudioSession['lastOffer'] & { guestName: string }) | null;
  guests: GuestView[];
}

export const sessionView = (world: World, label: Label, producer: SongRequest['producer']): SessionView | null => {
  const session = sessionOf(world, label.id);
  const artist = session ? world.artists[session.artistId] : undefined;
  if (!session || !artist) return null;
  const ctx = contextOf(world, session);
  const featArtist = session.feat ? world.artists[session.feat.guestId] : undefined;
  const estimate = estimateQuality({
    artist,
    themeId: session.themeId,
    beatId: session.beatId,
    levels: session.levels,
    producer,
    feat: featArtist ? { gen: generalRating(featArtist) } : null,
    eventBonus: session.quality,
  });
  const lastGuest = session.lastOffer ? world.artists[session.lastOffer.guestId] : undefined;
  return {
    artistId: artist.id,
    artistName: artist.name,
    themeId: session.themeId,
    beatId: session.beatId,
    levels: session.levels,
    events: session.events.map((event) => {
      if (event.kind === 'fluid') {
        const fluid = fluidById(event.cardId);
        return { stage: event.stage, kind: event.kind, title: fluid.title, text: fluid.text, reactions: [], reaction: null, result: event.result };
      }
      const card = cardById(event.cardId);
      return {
        stage: event.stage,
        kind: event.kind,
        title: card.title,
        text: card.text,
        reactions: card.reactions.map((r) => ({ id: r.id, text: r.text, hint: r.roll ? `Pari : ${Math.round(r.roll.chance(ctx) * 100)} % de chances` : describe(r.effect?.(ctx) ?? {}, ctx) })),
        reaction: event.reaction,
        result: event.result,
      };
    }),
    qualityMin: estimate.min,
    qualityMax: estimate.max,
    baseCost: songCost(session.levels, producer),
    extraCost: session.cost + (session.feat?.fee ?? 0),
    energy: Math.max(0, songEnergy(session.levels, session.feat !== null, artist) - session.energy),
    delayWeeks: session.delay + (session.levels.studio >= 3 ? 1 : 0),
    feat: session.feat && featArtist ? { guestId: featArtist.id, name: featArtist.name, fee: session.feat.fee } : null,
    featDone: session.featDone,
    lastOffer: session.lastOffer ? { ...session.lastOffer, guestName: lastGuest?.name ?? '?' } : null,
    guests: session.featDone
      ? []
      : guestChoices(world, label, session).map((guest) => ({
          id: guest.id,
          name: guest.name,
          genre: guest.genre,
          gen: Math.round(artisticSkill(guest.attrs, GENRES[guest.genre].family)),
          fans: guest.fans,
          real: guest.real,
          demand: guestDemand(world, label.id, guest),
          bonus: guestBonus(artist, guest),
          blocked: guestBlocked(world, label.id, guest),
        })),
  };
};
