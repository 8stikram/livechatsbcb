// Label events, opportunities and server events (docs/melody-tycoon/06-evenements-notifications.md and 08 8.8-8.9,
// owner's choices 2026-11-13).
// - Label cards: 40 small stories with 2 to 4 answers, absurd or black humour like the studio (the darkest only on
//   invented artists). Never real political parties or real people.
// - Opportunities: syncs (ad, series, film, video game) with a 50/50 negotiation, festival offers with a fair fee,
//   brands that pay a famous artist for a promo, and small extras (playlist, official remix, filmed live session).
// - A card waits at most 4 weeks, then its "ignore" answer applies. At most 3 waiting per label.
// - Server events: 1 or 2 a week for everyone (platforms, trends, funny ones, money).
import { CFG } from './config.ts';
import { GENRES } from './data/content.ts';
import { contractOf, playGig, rosterOf } from './economy.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import type { Artist, GenreId, Label, Song, World } from './types.ts';
import { GameError } from './world.ts';

const shuffle = <T>(rng: Rng, items: readonly T[]): T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

const fail = (message: string): never => {
  throw new GameError(message);
};

export const EVENTS = {
  maxWaiting: 3,
  expireWeeks: 4,
  /** Each week: a first label card, a second one, an opportunity. */
  cardChance: 0.4,
  secondChance: 0.1,
  chanceChance: 0.3,
  /** Server events: one every week, a second one sometimes. */
  secondServer: 0.35,
  /** Money of the cards, times this by tier. */
  scale: [1, 2, 5, 12, 30, 80],
  log: 6,
} as const;

/* ---------------------------------- Effects ---------------------------------- */

export interface CardEffect {
  cash?: number;
  morale?: number;
  energy?: number;
  hype?: number;
  /** Share of the artist's fans won or lost (0.02 = +2 %). */
  fans?: number;
  reputation?: number;
  /** Morale of every artist of the label. */
  team?: number;
  /** Streams of the card's song, times mult for some weeks. */
  boost?: { mult: number; weeks: number };
}

export interface CardChoice {
  id: string;
  text: string;
  effect?: CardEffect;
  /** A gamble: chance to win, and what each side does. */
  odds?: number;
  win?: CardEffect;
  lose?: CardEffect;
}

export interface Card {
  id: string;
  defId: string;
  kind: 'event' | 'chance';
  title: string;
  text: string;
  artistId: string | null;
  songId: string | null;
  tick: number;
  choices: CardChoice[];
  ignore: string;
}

interface Ctx {
  world: World;
  label: Label;
  artist: Artist;
  other: Artist | null;
  song: Song | null;
  rng: Rng;
  /** Money for this tier. */
  m: (base: number) => number;
}

interface CardDef {
  id: string;
  kind: 'event' | 'chance';
  title: string;
  text: string;
  dark?: boolean;
  /** Needs another artist of the label ({b}), or a released song ({s}). */
  needsOther?: boolean;
  needsSong?: boolean | ((song: Song, c: Ctx) => boolean);
  when?: (c: Ctx) => boolean;
  choices: (c: Ctx) => CardChoice[];
  ignore: string;
}

const pick = (id: string, text: string, effect?: CardEffect): CardChoice => ({ id, text, effect });
const bet = (id: string, text: string, odds: number, win: CardEffect, lose: CardEffect): CardChoice => ({ id, text, odds, win, lose });

/* ---------------------------------- The 40 label cards ---------------------------------- */

const EVENT_CARDS: CardDef[] = [
  { id: 'clip', kind: 'event', title: '« Je veux un clip »', text: '{a} veut un clip tourné dans un hangar, avec des lamas. Il a déjà acheté les lamas.', ignore: 'no',
    choices: (c) => [pick('pay', 'Payer le clip', { cash: -c.m(3_000), morale: 6, hype: 4 }), pick('promise', 'Promettre « bientôt »', { morale: 1 }), pick('no', 'Refuser', { morale: -6 })] },
  { id: 'tax', kind: 'event', title: 'Contrôle fiscal', text: 'Un inspecteur des impôts s’installe dans le canapé du studio. Il a apporté son thermos.', ignore: 'pay',
    when: (c) => c.label.cash > 20 * (CFG.tiers.fixedCosts[c.label.tier - 1] ?? 200),
    choices: (c) => [pick('pay', 'Payer l’amende', { cash: -c.m(2_000) }), bet('fight', 'Contester (50 %)', 0.5, { reputation: 1 }, { cash: -c.m(5_000) })] },
  { id: 'patron', kind: 'event', title: 'Don d’un mécène', text: 'Un vieux monsieur très riche aime « le bruit que font les jeunes ». Il veut aider {l}.', ignore: 'no',
    when: (c) => c.label.tier <= 2,
    choices: (c) => [pick('yes', 'Accepter le chèque', { cash: c.m(3_000) }), pick('no', 'Refuser poliment', { reputation: 1 })] },
  { id: 'portrait', kind: 'event', title: 'Un média veut un portrait', text: 'Un magazine veut raconter « l’ascension fulgurante » de {l}. Il faudra sourire.', ignore: 'no',
    choices: () => [pick('yes', 'Accepter, avec {a} en couverture', { energy: -5, reputation: 1, hype: 3 }), pick('no', 'Refuser')] },
  { id: 'holiday', kind: 'event', title: '{a} veut des vacances', text: '{a} a vu un reportage sur la Bretagne et veut partir « se retrouver ».', ignore: 'no',
    choices: () => [pick('yes', 'Accorder 1 semaine', { energy: 40, morale: 5, hype: -5 }), pick('no', 'Refuser', { morale: -5 })] },
  { id: 'pizza', kind: 'event', title: 'Bagarre pour une pizza', text: '{a} et {b} se battent pour la dernière part. Personne n’a vu qui l’a commandée.', needsOther: true, ignore: 'let',
    choices: (c) => [pick('mediator', 'Payer un médiateur', { cash: -c.m(500), team: 1 }), pick('pizza', 'Commander une autre pizza', { cash: -c.m(60) }), pick('let', 'Laisser faire', { morale: -3 })] },
  { id: 'friends', kind: 'event', title: 'Amitié au label', text: '{a} et {b} sont devenus inséparables. Ils ont même des sweats assortis.', needsOther: true, ignore: 'nothing',
    choices: (c) => [pick('party', 'Fêter ça', { cash: -c.m(300), team: 2 }), pick('nothing', 'Ne rien faire')] },
  { id: 'famous_fan', kind: 'event', title: 'Un fan devenu célèbre', text: 'Un acteur connu dit en interview qu’il écoute {l} sous la douche.', ignore: 'ignore',
    choices: () => [pick('thanks', 'Le remercier en public', { reputation: 1, hype: 3 }), pick('ignore', 'Faire semblant de ne pas avoir vu')] },
  { id: 'ex_artist', kind: 'event', title: 'Un ancien parle mal du label', text: 'Un ancien artiste raconte que {l} lui faisait « porter les cafés ». C’est vrai, mais quand même.', ignore: 'quiet',
    choices: () => [bet('answer', 'Répondre (50 %)', 0.5, { reputation: 1, hype: 3 }, { reputation: -1 }), pick('quiet', 'Se taire')] },
  { id: 'studio_gift', kind: 'event', title: 'Le studio de quartier rembourse', text: 'Le studio de quartier a facturé deux fois la même séance. Il s’excuse avec des croissants.', ignore: 'take',
    choices: (c) => [pick('take', 'Prendre le remboursement', { cash: c.m(800) }), pick('keep', 'Laisser l’argent, garder les croissants', { team: 1 })] },
  { id: 'tv', kind: 'event', title: 'Invitation à la télé', text: 'Une émission du samedi soir veut {a}, entre un magicien et un chien qui chante.', ignore: 'no',
    choices: () => [pick('yes', 'Y aller', { energy: -10, fans: 0.02, hype: 5 }), pick('no', 'Refuser')] },
  { id: 'ghostwriter', kind: 'event', title: '{a} écrit pour une star', text: 'Une grosse star veut acheter un refrain que {a} a écrit sur un ticket de métro.', ignore: 'keep',
    choices: (c) => [pick('sell', 'Vendre le refrain', { cash: c.m(2_500) }), pick('keep', 'Le garder', { morale: 3 })] },
  { id: 'merch_bug', kind: 'event', title: 'Le merch a un défaut', text: 'Les nouveaux t-shirts ont le logo de {l} à l’envers. 2 000 pièces.', ignore: 'refund',
    choices: (c) => [pick('refund', 'Rembourser les fans', { cash: -c.m(1_000), reputation: 1 }), bet('art', 'Dire que c’est fait exprès (50 %)', 0.5, { hype: 6 }, { reputation: -1 })] },
  { id: 'birthday', kind: 'event', title: 'Anniversaire du label', text: '{l} a un an de plus. Quelqu’un a déjà mangé la moitié du gâteau.', ignore: 'cake',
    when: (c) => c.world.tick % CFG.ticksPerSeason < 4,
    choices: (c) => [pick('party', 'Grosse soirée', { cash: -c.m(2_000), team: 4 }), pick('cake', 'Gâteau surgelé', { team: 1 })] },
  { id: 'all_nighter', kind: 'event', title: 'Nuit blanche', text: '{a} n’a pas dormi et a écrit 14 refrains. Deux sont en anglais, un en klingon.', ignore: 'sleep',
    choices: () => [pick('sleep', 'Le laisser dormir', { energy: 20 }), pick('use', 'En profiter', { hype: 4, energy: -10, morale: -2 })] },
  { id: 'leak', kind: 'event', title: 'Fuite d’un son', text: 'Une maquette de {a} circule sur un forum. Avec sa voix de 7 h du matin.', ignore: 'enjoy',
    choices: (c) => [pick('enjoy', 'En profiter', { hype: 5 }), pick('lawyer', 'Porter plainte', { cash: -c.m(1_000), reputation: 1 })] },
  { id: 'wants_out', kind: 'event', title: '{a} veut changer d’air', text: '{a} a laissé un mot : « Je réfléchis à ma vie. » Sur la porte du frigo.', ignore: 'no',
    when: (c) => c.artist.morale < 45,
    choices: (c) => [pick('bonus', 'Lui donner une prime', { cash: -c.m(2_000), morale: 8 }), pick('talk', 'Discuter une heure', { energy: -5, morale: 3 }), pick('no', 'Refuser d’en parler', { morale: -5 })] },
  { id: 'pan_flute', kind: 'event', title: 'Projet de flûte de pan', text: '{a} veut sortir un album entier à la flûte de pan. Il dit que c’est « l’avenir ».', ignore: 'dream',
    choices: () => [pick('dream', 'Le laisser rêver', { morale: 3 }), pick('no', 'Dire non', { morale: -3 })] },
  { id: 'teddy', kind: 'event', title: 'L’ours en peluche', text: '{a} refuse d’enregistrer sans son ours en peluche. L’ours a disparu.', ignore: 'buy',
    choices: (c) => [pick('buy', 'Racheter le même', { cash: -c.m(200), morale: 3 }), bet('tour', 'Dire que l’ours est en tournée (50 %)', 0.5, { morale: 2 }, { morale: -6 })] },
  { id: 'testament', kind: 'event', title: 'Freestyle testament', text: '{a} a écrit son testament en freestyle. Il lègue sa casquette à son rival.', dark: true, ignore: 'release',
    choices: (c) => [pick('release', 'Le sortir en vidéo', { hype: 6, morale: -2 }), pick('therapy', 'Lui payer un psy', { cash: -c.m(800), morale: 6 })] },
  { id: 'accountant', kind: 'event', title: 'Le comptable a disparu', text: 'Le comptable de {l} est parti avec la caisse… à biscuits. On ne retrouve plus les factures non plus.', dark: true, ignore: 'sheet',
    choices: (c) => [pick('sheet', 'Le remplacer par un tableur', { cash: -c.m(300) }), pick('hunt', 'Mettre sa tête à prix (en biscuits)', { cash: -c.m(600), team: 2 })] },
  { id: 'ghost', kind: 'event', title: 'Le fantôme du studio', text: '{a} jure avoir croisé son propre fantôme dans la cabine. Le fantôme chantait faux.', dark: true, ignore: 'song',
    choices: (c) => [pick('priest', 'Appeler un exorciste', { cash: -c.m(700), morale: 5 }), pick('song', 'En faire un son', { hype: 4, morale: -3 })] },
  { id: 'dead_rumour', kind: 'event', title: 'Rumeur de mort', text: 'Internet dit que {a} est mort. Il est en train de manger des chips.', dark: true, ignore: 'let',
    choices: () => [pick('deny', 'Démentir', { reputation: 1 }), pick('let', 'Laisser courir', { hype: 8, morale: -4 })] },
  { id: 'influencer', kind: 'event', title: 'Un influenceur veut être payé', text: 'Un influenceur propose de citer {a} dans une vidéo, entre deux pubs de shampoing.', ignore: 'no',
    choices: (c) => [pick('pay', 'Payer', { cash: -c.m(1_500), hype: 6, fans: 0.01 }), pick('no', 'Refuser')] },
  { id: 'neighbours', kind: 'event', title: 'Les voisins se plaignent', text: 'Les voisins du studio ont mis un mot : « Moins de basses. Ou plus de basses. On ne sait plus. »', ignore: 'loud',
    choices: (c) => [pick('wall', 'Insonoriser', { cash: -c.m(1_200), team: 1 }), pick('loud', 'Jouer plus fort', { reputation: -1, hype: 2 })] },
  { id: 'poster', kind: 'event', title: 'Une question d’affiche', text: '{a} veut son nom en plus gros sur l’affiche. Et une photo de son chien.', ignore: 'no',
    choices: () => [pick('yes', 'Accepter', { morale: 4, team: -1 }), pick('no', 'Refuser', { morale: -4 })] },
  { id: 'crypto', kind: 'event', title: 'Le coach crypto', text: 'Un « coach » propose de placer la caisse de {l} dans une crypto en forme de chien.', ignore: 'no',
    choices: (c) => [bet('invest', 'Investir (35 %)', 0.35, { cash: c.m(4_000) }, { cash: -c.m(2_000) }), pick('no', 'Le mettre dehors')] },
  { id: 'intern', kind: 'event', title: 'Le stagiaire', text: 'Le stagiaire a supprimé les fichiers du dernier son de {a}. « J’ai cru que c’était la corbeille. »', ignore: 'forgive',
    choices: () => [pick('forgive', 'Pardonner', { team: 1, morale: -2 }), pick('fire', 'Le renvoyer', { reputation: -1 })] },
  { id: 'garlic', kind: 'event', title: 'Le traiteur', text: 'Le traiteur du label met de l’ail partout, même dans le café.', ignore: 'keep',
    choices: (c) => [pick('keep', 'Garder le traiteur', { team: -1 }), pick('new', 'Changer de traiteur', { cash: -c.m(400), team: 2 })] },
  { id: 'parody', kind: 'event', title: 'Une parodie', text: 'Un humoriste imite {a} en train de rater un selfie. 2 millions de vues.', ignore: 'laugh',
    choices: () => [pick('laugh', 'En rire', { hype: 4, morale: -1 }), pick('answer', 'Répondre en son', { energy: -10, hype: 6 }), pick('sulk', 'Bouder', { morale: -3 })] },
  { id: 'haircut', kind: 'event', title: 'Prix de la meilleure coiffure', text: '{a} est nommé « Meilleure coiffure de l’année ». Il est chauve.', ignore: 'no',
    choices: () => [pick('go', 'Y aller', { energy: -8, hype: 5, morale: 3 }), pick('no', 'Ignorer')] },
  { id: 'van', kind: 'event', title: 'Le van est en panne', text: 'Le van du label est tombé en panne sur l’autoroute. Avec {a} dedans.', ignore: 'hitch',
    choices: (c) => [pick('fix', 'Réparer', { cash: -c.m(900) }), pick('hitch', 'Finir en stop', { morale: -4, hype: 2 })] },
  { id: 'ex', kind: 'event', title: 'Le son de l’ex', text: 'L’ex de {a} sort un son contre lui. Le refrain est vraiment bon, c’est ça le pire.', ignore: 'ignore',
    choices: () => [pick('answer', 'Répondre', { energy: -10, hype: 6, morale: -2 }), pick('ignore', 'Ignorer', { morale: -2 })] },
  { id: 'mum', kind: 'event', title: 'Sa mère veut gérer', text: 'La mère de {a} veut gérer sa carrière. Elle a imprimé un tableau.', ignore: 'no',
    choices: () => [pick('yes', 'Lui donner un rôle de conseil', { morale: 5, reputation: -1 }), pick('no', 'Refuser poliment', { morale: -2 })] },
  { id: 'tiger', kind: 'event', title: 'Un tigre pour le clip', text: '{a} veut un vrai tigre dans son clip. Le tigre ne veut pas.', ignore: 'cat',
    choices: (c) => [pick('cat', 'Un chat déguisé', { cash: -c.m(300), hype: 2 }), bet('tiger', 'Le vrai tigre (50 %)', 0.5, { hype: 10 }, { cash: -c.m(3_000), morale: -5 })] },
  { id: 'double', kind: 'event', title: 'Un sosie', text: 'Un sosie de {a} fait des concerts à sa place en province. Il chante mieux.', ignore: 'sue',
    choices: (c) => [pick('sue', 'Le poursuivre', { cash: -c.m(800), reputation: 1 }), pick('hire', 'L’engager pour les petites dates', { cash: c.m(1_500), morale: -3 })] },
  { id: 'tweet', kind: 'event', title: 'Message de 3 h du matin', text: '{a} a posté « les nuages sont des moutons qui ont réussi » à 3 h du matin.', ignore: 'delete',
    choices: () => [pick('delete', 'Supprimer'), bet('own', 'Assumer (50 %)', 0.5, { hype: 6 }, { reputation: -1 })] },
  { id: 'japan', kind: 'event', title: 'Fan club japonais', text: 'Un fan club japonais de {a} demande une dédicace vidéo. Ils sont 40 et très motivés.', ignore: 'no',
    choices: () => [pick('yes', 'Faire la vidéo', { energy: -3, fans: 0.01, morale: 2 }), pick('no', 'Pas le temps')] },
  { id: 'genius', kind: 'event', title: 'Crédité « génie »', text: 'Le producteur maison veut être crédité « génie » sur toutes les pochettes.', ignore: 'no',
    choices: () => [pick('yes', 'Accepter', { team: 1, reputation: -1 }), pick('no', 'Refuser')] },
  { id: 'recouped', kind: 'event', title: 'Premier vrai salaire', text: '{a} a remboursé son avance : il touche enfin ses royalties. Il veut s’acheter un jet-ski.', ignore: 'nothing',
    when: (c) => (contractOf(c.world, c.artist.id)?.unrecouped ?? 1) <= 0,
    choices: (c) => [pick('party', 'Fêter ça', { cash: -c.m(500), morale: 8 }), pick('nothing', 'Le féliciter', { morale: 3 })] },
];

/* ---------------------------------- Opportunities ---------------------------------- */

const SYNC_KINDS = ['une pub de voiture', 'une série', 'un film', 'un jeu vidéo', 'une pub de yaourt', 'la bande-annonce d’un film d’horreur'];
const BRANDS = ['une marque de boisson', 'une marque de baskets', 'une marque de chips', 'une appli de rencontre', 'une marque de parfum'];

const syncFee = (c: Ctx): number =>
  Math.round((2_000 * Math.sqrt(1 + c.artist.fans / 100_000) * c.rng.range(0.5, 3) * (0.5 + c.artist.attrs.charisme / 100)) / 100) * 100;

const CHANCE_CARDS: CardDef[] = [
  { id: 'sync', kind: 'chance', title: 'Sync : {k}', text: '{k} veut « {s} » de {a}. Une sync paie bien et double les streams du son 2 semaines.', needsSong: (s) => s.quality >= 55 && !s.seized, ignore: 'no',
    choices: (c) => {
      const fee = syncFee(c);
      return [
        pick('yes', 'Accepter', { cash: fee, boost: { mult: 2, weeks: 2 } }),
        bet('deal', 'Négocier (50 %)', 0.5, { cash: Math.round(fee * 1.5), boost: { mult: 2, weeks: 2 } }, {}),
        pick('no', 'Refuser'),
      ];
    } },
  { id: 'festival', kind: 'chance', title: 'Offre de festival', text: 'Un festival d’été invite {a}. Le cachet suit ses fans.', ignore: 'no',
    when: (c) => c.artist.fans >= 5_000,
    choices: (c) => {
      const fee = Math.max(c.m(500), Math.round((Math.max(0, playGig(c.artist, 0, 1, c.label.tier).profit) * 2) / 100) * 100);
      return [pick('yes', 'Accepter', { cash: fee, energy: -15, fans: 0.03, hype: 4 }), pick('no', 'Refuser')];
    } },
  { id: 'brand', kind: 'chance', title: 'Une marque veut {a}', text: '{k} paie {a} pour une vidéo promo. Il devra sourire avec le produit.', ignore: 'no',
    when: (c) => c.artist.fans >= 100_000,
    choices: (c) => {
      const fee = Math.round((5_000 * (c.artist.fans / 100_000) ** 0.6) / 100) * 100;
      return [pick('yes', 'Accepter', { cash: fee, energy: -10, morale: -1 }), pick('no', 'Refuser', { morale: 1 })];
    } },
  { id: 'playlist', kind: 'chance', title: 'Playlist éditoriale', text: 'Une grosse playlist ajoute « {s} » de {a}, sans rien demander.', needsSong: (s, c) => c.world.tick - (s.releaseTick ?? 0) <= 6, ignore: 'yes',
    choices: () => [pick('yes', 'Merci !', { boost: { mult: 1.5, weeks: 2 } }), pick('no', 'Refuser, on reste underground', { morale: 2, reputation: 1 })] },
  { id: 'remix', kind: 'chance', title: 'Remix officiel', text: 'Un DJ connu veut remixer « {s} » de {a}. Il faut payer son ingé son.', needsSong: (s) => s.quality >= 50, ignore: 'no',
    choices: (c) => [pick('yes', 'Payer le remix', { cash: -c.m(2_000), hype: 5, boost: { mult: 1.3, weeks: 2 } }), pick('no', 'Refuser')] },
  { id: 'live', kind: 'chance', title: 'Session live filmée', text: 'Une chaîne de vidéos veut filmer {a} en live, dans une laverie.', ignore: 'no',
    choices: () => [pick('yes', 'Y aller', { energy: -10, fans: 0.02, hype: 3 }), pick('no', 'Refuser')] },
];

const ALL_CARDS = [...EVENT_CARDS, ...CHANCE_CARDS];
export const EVENT_CONTENT = { events: EVENT_CARDS.length, chances: CHANCE_CARDS.length };

/* ---------------------------------- Drawing ---------------------------------- */

const scaleOf = (label: Label): number => EVENTS.scale[label.tier - 1] ?? 1;

const fill = (text: string, c: Ctx, k: string): string =>
  text
    .replaceAll('{a}', c.artist.name)
    .replaceAll('{b}', c.other?.name ?? '')
    .replaceAll('{l}', c.label.name)
    .replaceAll('{s}', c.song?.title ?? '')
    .replaceAll('{k}', k);

const cardsOf = (label: Label): Card[] => (label.cards ??= []);

const buildCard = (world: World, label: Label, def: CardDef, rng: Rng): Card | null => {
  const roster = rosterOf(world, label.id);
  if (roster.length === 0) return null;
  for (const artist of shuffle(rng, roster)) {
    if (def.dark && artist.real) continue;
    const other = def.needsOther ? (shuffle(rng, roster.filter((a) => a.id !== artist.id && (!def.dark || !a.real)))[0] ?? null) : null;
    if (def.needsOther && !other) return null;
    const base: Ctx = { world, label, artist, other, song: null, rng, m: (n) => Math.round((n * scaleOf(label)) / 10) * 10 };
    let song: Song | null = null;
    if (def.needsSong) {
      const test = typeof def.needsSong === 'function' ? def.needsSong : () => true;
      song = shuffle(rng, world.songs.filter((s) => s.artistId === artist.id && s.labelId === label.id && s.state === 'released' && test(s, base)))[0] ?? null;
      if (!song) continue;
    }
    const c = { ...base, song };
    if (def.when && !def.when(c)) continue;
    const k = def.id === 'sync' ? rng.pick(SYNC_KINDS) : def.id === 'brand' ? rng.pick(BRANDS) : '';
    const choices = def.choices(c).map((ch) => ({ ...ch, text: fill(ch.text, c, k) }));
    const text = fill(def.text, c, k);
    return {
      id: `card_${world.nextId++}`,
      defId: def.id,
      kind: def.kind,
      title: fill(def.title, c, k).replace(/^./, (x) => x.toUpperCase()),
      text: text[0]!.toUpperCase() + text.slice(1),
      artistId: artist.id,
      songId: song?.id ?? null,
      tick: world.tick,
      choices,
      ignore: def.ignore,
    };
  }
  return null;
};

const drawFrom = (world: World, label: Label, pool: CardDef[], rng: Rng): void => {
  const waiting = cardsOf(label);
  if (waiting.length >= EVENTS.maxWaiting) return;
  const recent = new Set([...(label.lastEvents ?? []), ...waiting.map((c) => c.defId)]);
  const fresh = pool.filter((d) => !recent.has(d.id));
  for (const def of shuffle(rng, fresh.length > 0 ? fresh : pool)) {
    const card = buildCard(world, label, def, rng);
    if (!card) continue;
    waiting.push(card);
    label.lastEvents = [...(label.lastEvents ?? []), def.id].slice(-12);
    return;
  }
};

/* ---------------------------------- Answering ---------------------------------- */

const signed = (n: number): string => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('fr-FR')}`;

/** The effect in plain words: "+2 000 € · moral +5 · énergie −10". */
export const describeEffect = (e: CardEffect | undefined): string => {
  if (!e) return 'Rien ne se passe';
  const parts: string[] = [];
  if (e.cash) parts.push(`${signed(e.cash)} €`);
  if (e.morale) parts.push(`moral ${signed(e.morale)}`);
  if (e.team) parts.push(`moral de tout le label ${signed(e.team)}`);
  if (e.energy) parts.push(`énergie ${signed(e.energy)}`);
  if (e.hype) parts.push(`buzz ${signed(e.hype)}`);
  if (e.fans) parts.push(`fans ${signed(e.fans * 100)} %`);
  if (e.reputation) parts.push(`réputation ${signed(e.reputation)}`);
  if (e.boost) parts.push(`streams du son ×${e.boost.mult.toLocaleString('fr-FR')} pendant ${e.boost.weeks} semaines`);
  return parts.length > 0 ? parts.join(' · ') : 'Rien ne se passe';
};

const applyEffect = (world: World, label: Label, card: Card, e: CardEffect): void => {
  const artist = card.artistId ? world.artists[card.artistId] : undefined;
  if (e.cash) {
    label.cash += e.cash;
    if (e.cash > 0) label.stats.revenueTotal += e.cash;
  }
  if (e.reputation) label.reputation = clamp(label.reputation + e.reputation, 0, 100);
  if (e.team) for (const a of rosterOf(world, label.id)) a.morale = clamp(a.morale + e.team, 0, 100);
  if (artist) {
    if (e.morale) artist.morale = clamp(artist.morale + e.morale, 0, 100);
    if (e.energy) artist.energy = clamp(artist.energy + e.energy, 0, 100);
    if (e.hype) artist.hype = clamp(artist.hype + e.hype, 0, 100);
    if (e.fans) artist.fans = Math.max(0, Math.round(artist.fans * (1 + e.fans)));
  }
  if (e.boost && card.songId) {
    const song = world.songs.find((s) => s.id === card.songId);
    if (song) addServerEvent(world, { title: '', text: '', mult: e.boost.mult, weeks: e.boost.weeks, songId: song.id, hidden: true });
  }
};

/** Plays an answer; returns what happened. */
const resolve = (world: World, label: Label, card: Card, choice: CardChoice): string => {
  let effect = choice.effect;
  let luck = '';
  if (choice.odds !== undefined) {
    const won = rngFor(world.seed, world.tick, `card:${card.id}`).chance(choice.odds);
    effect = won ? choice.win : choice.lose;
    luck = won ? 'Réussi ! ' : 'Raté. ';
  }
  if (effect) applyEffect(world, label, card, effect);
  const said = choice.text.replace(/ \(\d+ %\)$/, '').replace(/[ !.?]+$/, '');
  const what = describeEffect(effect);
  const text = `${card.title} : ${said}. ${luck}${what[0]!.toUpperCase()}${what.slice(1)}.`;
  label.cardLog = [text, ...(label.cardLog ?? [])].slice(0, EVENTS.log);
  label.cards = cardsOf(label).filter((c) => c.id !== card.id);
  return text;
};

export const answerCard = (world: World, label: Label, cardId: string, choiceId: string): string => {
  const card = cardsOf(label).find((c) => c.id === cardId) ?? fail('Cette carte n’existe plus.');
  const choice = card.choices.find((c) => c.id === choiceId) ?? fail('Cette réponse n’existe pas.');
  const artist = card.artistId ? world.artists[card.artistId] : undefined;
  if (artist && contractOf(world, artist.id)?.labelId !== label.id) {
    label.cards = cardsOf(label).filter((c) => c.id !== card.id);
    return fail(`${artist.name} n’est plus dans ton label : la carte s’en va.`);
  }
  const cost = Math.max(0, -(choice.effect?.cash ?? 0));
  if (cost > label.cash) fail('Pas assez de cash pour cette réponse.');
  return resolve(world, label, card, choice);
};

/* ---------------------------------- Server events ---------------------------------- */

export interface ServerEvent {
  id: string;
  title: string;
  text: string;
  tick: number;
  /** Last week it counts (included). */
  until: number;
  mult: number;
  genre?: GenreId;
  songId?: string;
  /** A card's boost on one song: not shown in the news. */
  hidden?: boolean;
}

const addServerEvent = (world: World, e: { title: string; text: string; mult: number; weeks: number; genre?: GenreId; songId?: string; hidden?: boolean }): void => {
  const event: ServerEvent = { id: `sev_${world.nextId++}`, title: e.title, text: e.text, tick: world.tick, until: world.tick + e.weeks - 1, mult: e.mult };
  if (e.genre) event.genre = e.genre;
  if (e.songId) event.songId = e.songId;
  if (e.hidden) event.hidden = true;
  // A card answered during the week counts from next week.
  if (e.hidden) {
    event.tick = world.tick + 1;
    event.until = world.tick + e.weeks;
  }
  world.serverEvents = [...(world.serverEvents ?? []).filter((x) => x.until >= world.tick), event];
};

interface ServerDef {
  id: string;
  kind: 'platform' | 'trend' | 'funny' | 'money';
  make: (world: World, rng: Rng) => { title: string; text: string; mult?: number; weeks?: number; genre?: GenreId; songId?: string; money?: (label: Label) => number } | null;
}

const genreName = (g: GenreId): string => GENRES[g].name;
const randomGenre = (rng: Rng): GenreId => rng.pick(Object.keys(GENRES) as GenreId[]);
const playerSong = (world: World, rng: Rng): Song | null => {
  const songs = world.songs.filter((s) => s.state === 'released' && !s.seized && world.labels[s.labelId]?.kind === 'player' && world.tick - (s.releaseTick ?? 0) <= 12);
  return songs.length > 0 ? rng.pick(songs) : null;
};

const SERVER_EVENTS: ServerDef[] = [
  { id: 'outage', kind: 'platform', make: () => ({ title: 'Panne géante du streaming', text: 'La plus grosse plateforme est en panne trois jours. Streams −20 % cette semaine pour tout le monde.', mult: 0.8, weeks: 1 }) },
  { id: 'rain', kind: 'platform', make: () => ({ title: 'Week-end de pluie', text: 'Il pleut partout, tout le monde reste écouter de la musique. Streams +15 % cette semaine.', mult: 1.15, weeks: 1 }) },
  { id: 'big_playlist', kind: 'platform', make: (_, rng) => { const g = randomGenre(rng); return { title: `Playlist géante ${genreName(g)}`, text: `Une plateforme met le ${genreName(g)} en avant. Ces sons font +30 % cette semaine.`, mult: 1.3, weeks: 1, genre: g }; } },
  { id: 'trend', kind: 'trend', make: (_, rng) => { const g = randomGenre(rng); return { title: `Le ${genreName(g)} explose`, text: `Tout le monde ne parle que de ça : le ${genreName(g)} fait +30 % pendant 2 semaines.`, mult: 1.3, weeks: 2, genre: g }; } },
  { id: 'retro', kind: 'trend', make: (_, rng) => { const g = randomGenre(rng); return { title: 'Retour des années 2000', text: `Les gens ressortent leurs vieux baladeurs : le ${genreName(g)} fait +25 % pendant 2 semaines.`, mult: 1.25, weeks: 2, genre: g }; } },
  { id: 'dance', kind: 'funny', make: (world, rng) => { const s = playerSong(world, rng); if (!s) return null; return { title: 'Une danse virale', text: `Un influenceur danse sur « ${s.title} » en pyjama. Ce son fait ×2 cette semaine.`, mult: 2, weeks: 1, songId: s.id }; } },
  { id: 'space', kind: 'funny', make: (world, rng) => { const s = playerSong(world, rng); if (!s) return null; return { title: 'Écouté depuis l’espace', text: `Un astronaute écoute « ${s.title} » en boucle depuis la station spatiale. +50 % cette semaine.`, mult: 1.5, weeks: 1, songId: s.id }; } },
  { id: 'intros', kind: 'funny', make: () => ({ title: 'Boycott des intros', text: 'Les fans boycottent les intros de plus de 3 secondes. Streams −5 % cette semaine.', mult: 0.95, weeks: 1 }) },
  { id: 'robot', kind: 'funny', make: () => ({ title: 'Une IA sature tout', text: 'Une IA sort 10 000 sons par jour. Les gens saturent : streams −10 % cette semaine.', mult: 0.9, weeks: 1 }) },
  { id: 'cat_dj', kind: 'funny', make: (_, rng) => { const g = randomGenre(rng); return { title: 'Un chat DJ', text: `Un chat devient DJ star d’Internet. Il ne passe que du ${genreName(g)} : +20 % cette semaine.`, mult: 1.2, weeks: 1, genre: g }; } },
  { id: 'tax', kind: 'money', make: () => ({ title: 'Taxe surprise', text: 'Une taxe sur la musique tombe : les labels qui ont beaucoup de cash paient 3 %.', money: (l) => (l.cash > 10 * (CFG.tiers.fixedCosts[l.tier - 1] ?? 200) ? -Math.round(l.cash * 0.03) : 0) }) },
  { id: 'culture', kind: 'money', make: () => ({ title: 'Bonus pour la culture', text: 'L’État aide la musique : chaque label reçoit une prime selon son palier.', money: (l) => 1_000 * l.tier }) },
  { id: 'refund', kind: 'money', make: () => ({ title: 'Les plateformes s’excusent', text: 'Après un bug de paiement, les plateformes versent un petit dédommagement à tous les labels.', money: (l) => 500 * l.tier }) },
];

export const SERVER_CONTENT = SERVER_EVENTS.length;
/** Every server event id: put them all in world.lastServerEvents to keep a world quiet (tests). */
export const SERVER_IDS = SERVER_EVENTS.map((e) => e.id);

/** Streams of a player song this week, times this (server events and card boosts). */
export const streamMult = (world: World, song: Song, genre: GenreId): number =>
  (world.serverEvents ?? [])
    .filter((e) => e.tick <= world.tick && e.until >= world.tick && (e.songId ? e.songId === song.id : !e.genre || e.genre === genre))
    .reduce((m, e) => m * e.mult, 1);

/** The server event(s) of the week. Money ones are paid at once. */
const drawServer = (world: World, pay: (labelId: string, amount: number) => void, tell: (labelId: string, text: string) => void, news: (text: string) => void): void => {
  const rng = rngFor(world.seed, world.tick, 'server-events');
  const count = rng.chance(EVENTS.secondServer) ? 2 : 1;
  const recent = new Set(world.lastServerEvents ?? []);
  let done = 0;
  for (const def of shuffle(rng, SERVER_EVENTS.filter((d) => !recent.has(d.id)))) {
    if (done >= count) break;
    const made = def.make(world, rng);
    if (!made) continue;
    done += 1;
    world.lastServerEvents = [...(world.lastServerEvents ?? []), def.id].slice(-6);
    if (made.money) {
      for (const label of Object.values(world.labels)) {
        if (label.kind !== 'player' || label.bankrupt) continue;
        const amount = made.money(label);
        if (amount === 0) continue;
        pay(label.id, amount);
        tell(label.id, `${made.title} : ${amount > 0 ? '+' : '−'}${Math.abs(amount).toLocaleString('fr-FR')} €.`);
      }
      world.serverEvents = [...(world.serverEvents ?? []).filter((x) => x.until >= world.tick), { id: `sev_${world.nextId++}`, title: made.title, text: made.text, tick: world.tick, until: world.tick, mult: 1 }];
    } else {
      addServerEvent(world, { title: made.title, text: made.text, mult: made.mult ?? 1, weeks: made.weeks ?? 1, ...(made.genre ? { genre: made.genre } : {}), ...(made.songId ? { songId: made.songId } : {}) });
    }
    news(`${made.title} : ${made.text}`);
  }
};

/* ---------------------------------- The week ---------------------------------- */

/** Start of the week: server events (before the streams). */
export const tickServerEvents = (
  world: World,
  pay: (labelId: string, amount: number) => void,
  tell: (labelId: string, text: string) => void,
  news: (text: string) => void,
): void => {
  world.serverEvents = (world.serverEvents ?? []).filter((e) => e.until >= world.tick);
  drawServer(world, pay, tell, news);
};

/** After the releases: each song out gets this week's server events and card boosts. */
export const applyStreamEvents = (world: World, genreOf: (song: Song) => GenreId | null): void => {
  if (!(world.serverEvents ?? []).some((e) => e.tick <= world.tick && e.until >= world.tick && e.mult !== 1)) return;
  for (const song of world.songs) {
    if (song.state !== 'released' || song.streamsLast <= 0) continue;
    const genre = genreOf(song);
    if (!genre) continue;
    const mult = streamMult(world, song, genre);
    if (mult === 1) continue;
    const extra = Math.round(song.streamsLast * mult) - song.streamsLast;
    song.streamsLast += extra;
    song.streamsTotal += extra;
    if (song.history && song.history.length > 0) song.history[song.history.length - 1] = song.streamsLast;
    song.eventMult = mult;
  }
};

/** End of the week: old cards answer themselves, new ones come. */
export const tickCards = (world: World, tell: (labelId: string, text: string) => void): void => {
  for (const label of Object.values(world.labels)) {
    if (label.kind !== 'player' || label.bankrupt) continue;
    for (const card of [...cardsOf(label)]) {
      const gone = card.artistId && contractOf(world, card.artistId)?.labelId !== label.id;
      if (gone) {
        label.cards = cardsOf(label).filter((c) => c.id !== card.id);
        continue;
      }
      if (world.tick - card.tick < EVENTS.expireWeeks) continue;
      const choice = card.choices.find((c) => c.id === card.ignore) ?? card.choices[card.choices.length - 1]!;
      tell(label.id, `Sans réponse depuis ${EVENTS.expireWeeks} semaines. ${resolve(world, label, card, choice)}`);
    }
    if (rosterOf(world, label.id).length === 0) continue;
    const rng = rngFor(world.seed, world.tick, `cards:${label.id}`);
    const before = cardsOf(label).length;
    if (rng.chance(EVENTS.cardChance)) drawFrom(world, label, EVENT_CARDS, rng);
    if (rng.chance(EVENTS.secondChance)) drawFrom(world, label, EVENT_CARDS, rng);
    if (rng.chance(EVENTS.chanceChance)) drawFrom(world, label, CHANCE_CARDS, rng);
    const fresh = cardsOf(label).length - before;
    if (fresh > 0) tell(label.id, `${fresh} nouvelle${fresh > 1 ? 's' : ''} carte${fresh > 1 ? 's' : ''} à l’accueil : ${cardsOf(label).slice(-fresh).map((c) => c.title).join(', ')}.`);
  }
};

/* ---------------------------------- View ---------------------------------- */

export interface CardView {
  id: string;
  kind: 'event' | 'chance';
  title: string;
  text: string;
  artist: string | null;
  weeksLeft: number;
  choices: Array<{ id: string; text: string; effect: string; odds: number | null; win: string | null; lose: string | null; cost: number }>;
}

export interface EventsView {
  cards: CardView[];
  log: string[];
  server: Array<{ title: string; text: string; weeksLeft: number }>;
}

export const eventsView = (world: World, label: Label): EventsView => ({
  cards: cardsOf(label).map((c) => ({
    id: c.id,
    kind: c.kind,
    title: c.title,
    text: c.text,
    artist: c.artistId ? (world.artists[c.artistId]?.name ?? null) : null,
    weeksLeft: Math.max(0, c.tick + EVENTS.expireWeeks - world.tick),
    choices: c.choices.map((ch) => ({
      id: ch.id,
      text: ch.text,
      effect: ch.odds === undefined ? describeEffect(ch.effect) : '',
      odds: ch.odds ?? null,
      win: ch.odds === undefined ? null : describeEffect(ch.win),
      lose: ch.odds === undefined ? null : describeEffect(ch.lose),
      cost: Math.max(0, -(ch.effect?.cash ?? 0)),
    })),
  })),
  log: label.cardLog ?? [],
  server: (world.serverEvents ?? [])
    .filter((e) => !e.hidden && e.tick <= world.tick && e.until >= world.tick)
    .map((e) => ({ title: e.title, text: e.text, weeksLeft: e.until - world.tick + 1 })),
});

/** For the tests: every card id. */
export const CARD_IDS = ALL_CARDS.map((c) => c.id);
