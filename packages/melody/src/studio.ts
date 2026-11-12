// Studio sessions: the events between the choices of a song (smooth sessions and "embrouilles"),
// then the featuring talks and their wheel. Everything is drawn on the server from the world's seed,
// so starting again or asking twice the same week gives the same draw.
import { artisticSkill, generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { GENRES, beatById } from './data/content.ts';
import { contractOf } from './economy.ts';
import { onTour } from './tours.ts';
import { houseProducer } from './staff.ts';
import { estimateQuality, featChance, featDemand, producerOfLevel, songCost, songEnergy } from './quality.ts';
import { clamp, rngFor } from './rng.ts';
import type { Artist, Label, SessionEvent, SongLevels, StudioSession, StudioStage, World } from './types.ts';
import { DEALS, checkDealGuest, spendDeal, usableDeals } from './featdeals.ts';
import { tutorialStep } from './tutorial.ts';
import { experienceBonus, studioOffers } from './craft.ts';
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
    id: 'phone_notes',
    stage: 'theme',
    title: 'Les paroles sont dans son ancien téléphone',
    text: 'Écran cassé, aucune sauvegarde. Il jure que c’était son meilleur couplet.',
    reactions: [
      { id: 'repair', text: 'Payer la réparation express', effect: () => ({ cost: 250 }) },
      {
        id: 'memory',
        text: 'Réécrire de mémoire',
        roll: { chance: discipline, success: () => ({ quality: 1 }), failure: () => ({ quality: -2 }), successText: 'La version de mémoire est encore meilleure.', failureText: 'Il ne se rappelle que du refrain.' },
      },
      {
        id: 'freestyle',
        text: 'Freestyle direct',
        roll: { chance: fifty, success: () => ({ quality: 3 }), failure: () => ({ quality: -3 }), successText: 'Une prise, pas une retouche.', failureText: 'Il rime « téléphone » avec « téléphone ».' },
      },
    ],
  },
  {
    id: 'ex',
    stage: 'theme',
    title: 'Il veut dédier le son à son ex',
    text: '« Faut qu’elle sache. » Elle l’a bloqué partout.',
    reactions: [
      { id: 'let', text: 'Le laisser faire', effect: () => ({ morale: 5, quality: -1 }) },
      {
        id: 'phone',
        text: 'Lui confisquer le téléphone',
        roll: { chance: discipline, success: () => ({}), failure: () => ({ morale: -6 }), successText: 'Il souffle, puis il bosse.', failureText: 'Il boude en regardant ses stories.' },
      },
      { id: 'eat', text: 'L’emmener manger pour oublier', effect: () => ({ cost: 60, morale: 3 }) },
    ],
  },
  {
    id: 'cousin',
    stage: 'theme',
    title: 'Son cousin veut écrire le refrain',
    text: '« Il a fait un BTS com’, il s’y connaît. »',
    reactions: [
      {
        id: 'accept',
        text: 'Laisser le cousin essayer',
        roll: { chance: fifty, success: () => ({ quality: 2 }), failure: () => ({ quality: -3 }), successText: 'Le cousin a un vrai don.', failureText: 'Le refrain parle de son BTS.' },
      },
      { id: 'refuse', text: 'Refuser poliment', effect: () => ({ morale: -3 }) },
      { id: 'taxi', text: 'Payer le taxi du cousin', effect: () => ({ cost: 100 }) },
    ],
  },
  {
    id: 'type_beat',
    stage: 'beat',
    title: 'Le beat vient de YouTube',
    text: '« Free for profit » était écrit… dans le titre seulement.',
    reactions: [
      { id: 'licence', text: 'Acheter la licence', effect: () => ({ cost: 250 }) },
      { id: 'redo', text: 'Le faire refaire à l’oreille', effect: () => ({ quality: -1 }) },
      {
        id: 'gamble',
        text: 'Tenter le coup',
        roll: { chance: fifty, success: () => ({}), failure: () => ({ cost: 1_500 }), successText: 'Personne ne réclame rien.', failureText: 'Le beatmaker de 16 ans a un avocat. 1 500 €.' },
      },
    ],
  },
  {
    id: 'usb',
    stage: 'beat',
    title: 'La clé USB est restée dans le Uber',
    text: 'Toutes les pistes sont dessus. Le chauffeur s’appelle Didier.',
    reactions: [
      {
        id: 'call',
        text: 'Rappeler Didier',
        roll: { chance: fifty, success: () => ({}), failure: () => ({ delay: 1 }), successText: 'Didier fait demi-tour. Cinq étoiles.', failureText: 'Didier est déjà à l’aéroport.' },
      },
      { id: 'redo', text: 'Refaire le beat de tête', effect: () => ({ quality: -2 }) },
      { id: 'pay', text: 'Payer la course retour', effect: () => ({ cost: 80 }) },
    ],
  },
  {
    id: 'bpm',
    stage: 'beat',
    title: 'Il veut le beat « plus rapide mais plus lent »',
    text: 'Le producteur a arrêté de cligner des yeux.',
    reactions: [
      { id: 'search', text: 'Les laisser chercher', effect: () => ({ energy: -5, quality: 1 }) },
      {
        id: 'decide',
        text: 'Trancher toi-même',
        roll: { chance: fifty, success: () => ({ quality: 2 }), failure: () => ({ quality: -2 }), successText: 'Tout le monde fait semblant d’avoir eu l’idée.', failureText: 'Maintenant personne n’aime le beat.' },
      },
      { id: 'keep', text: 'Garder la première version', effect: () => ({ morale: -3 }) },
    ],
  },
  {
    id: 'late',
    stage: 'producer',
    title: 'Le producteur a quatre heures de retard',
    text: '« J’suis en route », envoyé depuis son lit.',
    reactions: [
      {
        id: 'bill',
        text: 'Lui faire la morale',
        roll: { chance: fifty, success: () => ({ quality: 1 }), failure: () => ({ quality: -2 }), successText: 'Il s’excuse et bosse double.', failureText: 'Il bosse en faisant la tête.' },
      },
      { id: 'food', text: 'Commander à manger en attendant', effect: () => ({ cost: 70, morale: 3 }) },
      { id: 'start', text: 'Commencer sans lui', effect: () => ({ quality: -2 }) },
    ],
  },
  {
    id: 'tag',
    stage: 'producer',
    title: 'Le producteur veut son tag trois fois',
    text: 'Au début, au milieu, et « au cas où ».',
    reactions: [
      { id: 'accept', text: 'Accepter les trois tags', effect: () => ({ quality: -1 }) },
      {
        id: 'one',
        text: 'Négocier un seul tag',
        roll: { chance: fifty, success: () => ({}), failure: () => ({ morale: -4 }), successText: 'Un tag, bien placé.', failureText: 'Il boude derrière sa console, l’ambiance retombe.' },
      },
      { id: 'pay', text: 'Payer pour zéro tag', effect: () => ({ cost: 400, quality: 1 }) },
    ],
  },
  {
    id: 'update',
    stage: 'producer',
    title: 'Son ordi fait une mise à jour',
    text: '« Ne pas éteindre. 12 %. » Depuis une heure.',
    reactions: [
      { id: 'wait', text: 'Attendre', effect: () => ({ energy: -5 }) },
      { id: 'rent', text: 'Louer un autre ordi', effect: () => ({ cost: 150 }) },
      {
        id: 'phone',
        text: 'Enregistrer sur le téléphone',
        roll: { chance: fifty, success: () => ({ quality: 2 }), failure: () => ({ quality: -3 }), successText: 'Le grain du téléphone fait tout le charme.', failureText: 'Ça sonne comme un vocal WhatsApp.' },
      },
    ],
  },
  {
    id: 'mom',
    stage: 'studio',
    title: 'Sa mère appelle en pleine prise',
    text: 'Troisième appel. Elle veut savoir s’il a mangé.',
    reactions: [
      { id: 'answer', text: 'Le laisser répondre', effect: () => ({ morale: 4, energy: -3 }) },
      {
        id: 'keep',
        text: 'Garder la sonnerie dans le son',
        roll: { chance: fifty, success: () => ({ quality: 2 }), failure: () => ({ quality: -2 }), successText: 'La sonnerie devient le gimmick du son.', failureText: 'Non. Juste non.' },
      },
      { id: 'plane', text: 'Mode avion', effect: () => ({ morale: -2 }) },
    ],
  },
  {
    id: 'food',
    stage: 'studio',
    title: 'La commande est arrivée',
    text: 'Tacos trois viandes, pile avant le refrain.',
    reactions: [
      { id: 'break', text: 'Pause repas', effect: () => ({ energy: 4, quality: -1 }) },
      {
        id: 'finish',
        text: 'Finir la prise d’abord',
        roll: { chance: discipline, success: () => ({ quality: 1 }), failure: () => ({ morale: -4 }), successText: 'Prise parfaite, tacos mérité.', failureText: 'Il rappe en fixant le sac. Ça s’entend.' },
      },
    ],
  },
  {
    id: 'aircon',
    stage: 'studio',
    title: 'La clim s’entend sur la prise',
    text: 'Un souffle continu derrière la voix. 34 degrés dehors.',
    reactions: [
      { id: 'off', text: 'Couper la clim', effect: () => ({ energy: -6 }) },
      { id: 'booth', text: 'Payer une cabine mieux isolée', effect: () => ({ cost: 200 }) },
      {
        id: 'texture',
        text: '« C’est de la texture »',
        roll: { chance: fifty, success: () => ({ quality: 1 }), failure: () => ({ quality: -3 }), successText: 'On dirait un effet voulu.', failureText: 'On dirait une clim.' },
      },
    ],
  },
  {
    id: 'story',
    stage: 'studio',
    title: 'Il filme toute la session en story',
    text: 'Le refrain est déjà sur Insta.',
    reactions: [
      {
        id: 'let',
        text: 'Le laisser filmer',
        roll: { chance: fifty, success: () => ({ morale: 3 }), failure: () => ({ quality: -2 }), successText: 'Les fans réclament déjà le son.', failureText: 'Tout le monde connaît le refrain avant la sortie.' },
      },
      { id: 'take', text: 'Lui prendre le téléphone', effect: () => ({ morale: -4 }) },
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
/** Share of the sessions with two embrouilles instead of one. */
const TWO_CLASHES = 0.35;
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

/** Tier of the label that has this artist: it sets the studio prices. */
const tierOfArtist = (world: World, artistId: string): number => world.labels[contractOf(world, artistId)?.labelId ?? '']?.tier ?? 3;

const contextOf = (world: World, session: StudioSession): Context => {
  const artist = world.artists[session.artistId] ?? fail('Artiste introuvable.');
  return {
    artist,
    levels: session.levels,
    baseCost: songCost(session.levels, houseProducer(world, contractOf(world, session.artistId)?.labelId ?? '', producerOfLevel(session.levels.producer)), tierOfArtist(world, session.artistId)),
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
  if (onTour(world, artist.id)) fail(`${artist.name} est en tournée : pas de studio avant la fin.`);
  beatById(request.beatId);
  // Only what the studio offers this week to this artist (the guided first song takes any).
  if (tutorialStep(world, label.id) !== 'song') {
    const offers = studioOffers(world, label.id, artist);
    if (!offers.themes.some((t) => t.id === request.themeId)) fail('Ce thème n’est pas proposé cette semaine.');
    if (!offers.beats.some((b) => b.id === request.beatId)) fail('Ce beat n’est pas proposé cette semaine.');
  }
  const cost = songCost(request.levels, houseProducer(world, label.id, producerOfLevel(request.levels.producer)), label.tier);
  const cap = CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000;
  if (cost > cap) fail('Ce son dépasse le budget autorisé pour ton palier.');
  if (cost > label.cash) fail('Pas assez de cash pour ce son.');
  if (artist.energy < songEnergy(request.levels, false, artist)) fail(`${artist.name} n'a pas assez d'énergie.`);

  const index = recordedThisWeek(world, label.id);
  const events: SessionEvent[] = [];
  let clashes = 0;
  // The tutorial: smooth sessions around one easy embrouille with the producer.
  const guided = tutorialStep(world, label.id) === 'song';
  if (guided) {
    events.push(
      { stage: 'theme', kind: 'fluid', cardId: 'flow', reaction: null, result: fluidById('flow').text },
      { stage: 'beat', kind: 'fluid', cardId: 'vibe', reaction: null, result: fluidById('vibe').text },
      { stage: 'producer', kind: 'clash', cardId: 'ghost', reaction: null, result: null },
      { stage: 'studio', kind: 'fluid', cardId: 'express', reaction: null, result: fluidById('express').text },
    );
  }
  // Every session has one embrouille, sometimes two: the cheap choices are the ones that break most.
  const plan = rngFor(world.seed, world.tick, `studio:${label.id}:${artist.id}:${index}:plan`);
  const troubled = new Set<string>();
  const wanted = guided ? 0 : plan.next() < TWO_CLASHES ? 2 : 1;
  while (troubled.size < wanted) {
    const left = STAGES.filter((stage) => !troubled.has(stage));
    const weights = left.map((stage) => clashChance(artist, request.levels[stage], 0));
    let roll = plan.next() * weights.reduce((sum, w) => sum + w, 0);
    troubled.add(left.find((_, i) => (roll -= weights[i] ?? 0) < 0) ?? left[0]!);
  }
  for (const stage of guided ? [] : STAGES) {
    const rng = rngFor(world.seed, world.tick, `studio:${label.id}:${artist.id}:${index}:${stage}`);
    if (troubled.has(stage)) {
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
    const won = tutorialStep(world, label.id) === 'song' || rng.next() < reaction.roll.chance(ctx);
    // Each gamble makes the song's surprise (good or bad) more likely.
    session.risk = (session.risk ?? 0) + 1;
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
export const guestDemand = (world: World, labelId: string, guest: Artist, host?: Artist): number =>
  Math.round(featDemand(guest, 0, host) * 1.1 ** memoryFor(world, labelId, guest.id).tries);

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
  const base = songCost(session.levels, houseProducer(world, label.id, producerOfLevel(session.levels.producer)), label.tier);
  const cap = CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000;
  const budget = Math.max(0, Math.min(label.cash - base - session.cost, cap - base));
  const affordable = Object.values(world.artists)
    .filter((a) => a.id !== host.id && (near.has(a.genre) || GENRES[a.genre].family === family))
    .filter((a) => {
      const owner = contractOf(world, a.id);
      return !owner || world.labels[owner.labelId]?.kind !== 'player';
    })
    .filter((a) => featDemand(a, 0, host) * 0.6 <= budget)
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
  const base = songCost(session.levels, houseProducer(world, label.id, producerOfLevel(session.levels.producer)), label.tier);
  const price = Math.round(offer);
  if (price < 1) fail('Propose une somme.');
  if (base + session.cost + price > label.cash) fail('Pas assez de cash pour cette offre.');
  if (base + price > (CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000)) fail('Cette offre dépasse le budget de ton palier.');

  const demand = guestDemand(world, label.id, guest, host);
  const memory = memoryFor(world, label.id, guest.id);
  const chance = featChance(price, demand, 0, label.reputation, guestBonus(host, guest));
  // The tutorial: no insult possible, and the second try always works.
  const guided = tutorialStep(world, label.id) === 'song';
  if (chance === null && guided) {
    memoryOf(world)[memoryKey(label.id, guest.id)] = { ...memory, tries: memory.tries + 1 };
    session.lastOffer = { guestId: guest.id, offer: price, chance: 0, roll: null, outcome: 'refused' };
    return;
  }
  if (chance === null) {
    // Insulted before the wheel even turns: he refuses everything for four weeks.
    memoryOf(world)[memoryKey(label.id, guest.id)] = { ...memory, closedUntil: world.tick + CFG.ticksPerMonth };
    session.lastOffer = { guestId: guest.id, offer: price, chance: 0, roll: null, outcome: 'vexed' };
    return;
  }
  const drawn = rngFor(world.seed, world.tick, `feat:${label.id}:${guest.id}:${memory.tries}`).next();
  const roll = guided && memory.tries >= 1 ? Math.min(drawn, chance * 0.9) : drawn;
  if (roll < chance) {
    if (host.energy < songEnergy(session.levels, true, host)) fail(`${host.name} n'a pas assez d'énergie pour un featuring.`);
    session.feat = { guestId: guest.id, fee: price };
    session.featDone = true;
    session.lastOffer = { guestId: guest.id, offer: price, chance, roll, outcome: 'accepted' };
    // One time in four, the guest asks for more once in the booth.
    if (!guided && rngFor(world.seed, world.tick, `greedy:${label.id}:${guest.id}`).next() < 0.25) {
      session.events.push({ stage: 'feat', kind: 'clash', cardId: 'greedy', reaction: null, result: null });
    }
    memoryOf(world)[memoryKey(label.id, guest.id)] = { ...memory, tries: memory.tries + 1 };
    return;
  }
  const vexed = !guided && price < demand * 0.6;
  memoryOf(world)[memoryKey(label.id, guest.id)] = { ...memory, tries: memory.tries + 1, closedUntil: vexed ? world.tick + 1 : memory.closedUntil };
  session.lastOffer = { guestId: guest.id, offer: price, chance, roll, outcome: vexed ? 'vexed' : 'refused' };
};

/** Puts the guest of an accepted deal with another player on the song: already paid, no wheel. */
export const useDeal = (world: World, label: Label, dealId: string): void => {
  const session = openSession(world, label);
  if (pending(session)) fail("Règle d'abord ce qui se passe en studio.");
  if (session.featDone) fail('Le featuring est déjà réglé pour ce son.');
  const guest = checkDealGuest(world, label, dealId);
  const host = world.artists[session.artistId] ?? fail('Artiste introuvable.');
  if (guest.id === host.id) fail('Un artiste ne peut pas être son propre invité.');
  if (host.energy < songEnergy(session.levels, true, host)) fail(`${host.name} n'a pas assez d'énergie pour un featuring.`);
  session.feat = { guestId: guest.id, fee: 0, dealId };
  session.featDone = true;
  // Two players working together: the song gets a little better.
  session.quality += DEALS.friendship;
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
  if (session.feat?.dealId) spendDeal(world, label, session.feat.dealId);
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
    gambles: session.risk ?? 0,
    safe: tutorialStep(world, label.id) === 'song',
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
  /** How many times more fans than the host: a far bigger guest asks much more (1 between equals). */
  gap: number;
  bonus: number;
  blocked: string | null;
  /** A deal with another player: already paid, no wheel. */
  dealId: string | null;
  labelName: string | null;
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
    experience: experienceBonus(world, artist),
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
        // What a reaction does stays hidden until it is chosen: taking a risk is part of the game.
        reactions: card.reactions.map((r) => ({ id: r.id, text: r.text, hint: '' })),
        reaction: event.reaction,
        result: event.result,
      };
    }),
    qualityMin: estimate.min,
    qualityMax: estimate.max,
    baseCost: songCost(session.levels, producer, label.tier),
    extraCost: session.cost + (session.feat?.fee ?? 0),
    energy: Math.max(0, songEnergy(session.levels, session.feat !== null, artist) - session.energy),
    delayWeeks: session.delay + (session.levels.studio >= 3 ? 1 : 0),
    feat: session.feat && featArtist ? { guestId: featArtist.id, name: featArtist.name, fee: session.feat.fee } : null,
    featDone: session.featDone,
    lastOffer: session.lastOffer ? { ...session.lastOffer, guestName: lastGuest?.name ?? '?' } : null,
    guests: session.featDone
      ? []
      : [
          ...usableDeals(world, label.id)
            .map((deal) => ({ deal, guest: world.artists[deal.guestId] }))
            .filter((x): x is { deal: typeof x.deal; guest: Artist } => !!x.guest && x.guest.id !== artist.id)
            .map(({ deal, guest }) => ({
              id: guest.id,
              name: guest.name,
              genre: guest.genre,
              gen: Math.round(artisticSkill(guest.attrs, GENRES[guest.genre].family)),
              fans: guest.fans,
              real: guest.real,
              demand: deal.fee,
              gap: 1,
              bonus: 0,
              blocked: guest.energy < DEALS.guestEnergy ? 'Trop fatigué cette semaine' : null,
              dealId: deal.id,
              labelName: world.labels[deal.toLabelId]?.name ?? null,
            })),
          ...guestChoices(world, label, session).map((guest) => ({
          id: guest.id,
          name: guest.name,
          genre: guest.genre,
          gen: Math.round(artisticSkill(guest.attrs, GENRES[guest.genre].family)),
          fans: guest.fans,
          real: guest.real,
          demand: guestDemand(world, label.id, guest, artist),
          gap: Math.max(1, Math.round((guest.fans + 100) / (artist.fans + 100))),
          bonus: guestBonus(artist, guest),
          blocked: guestBlocked(world, label.id, guest),
          dealId: null,
          labelName: null,
        })),
        ],
  };
};
