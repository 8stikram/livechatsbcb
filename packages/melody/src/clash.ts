// Life between labels (docs/melody-tycoon/12-roadmap-risques.md, MVP 3 « Guerres »):
// - a weekly interview, FIFA style: three questions, three tones of answer (humble, confident, provocative);
// - a shade: one public pique a week at another label;
// - a clash: a disstrack against another label, who answers with his own or backs down (and looks bad).
// What is at stake: fans and buzz, never money. Every draw comes from the world's seed.
import { generalRating } from './artists.ts';
import { BEATS } from './data/content.ts';
import { rosterOf } from './economy.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import type { Artist, Label, World } from './types.ts';
import { GameError, createSong, releaseBlocked, scheduleRelease } from './world.ts';
import { producerOfLevel } from './quality.ts';
import { checkTarget, enemyBoost } from './coop.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export const CLASH = {
  /** Weeks the target has to answer a disstrack; then he backs down. */
  answerTicks: 2,
  /** Chance a label of the game answers a clash. */
  npcAnswers: 0.65,
  /** Energy a disstrack costs the artist. */
  energy: 10,
  /** What the winner takes: buzz, and a share of the loser's fans. */
  winHype: 12,
  loseHype: 8,
  fanShare: 0.04,
  fanLoss: 0.03,
  maxFans: 50_000,
  /** Backing down. */
  shameReputation: 3,
  shameHype: 5,
  /** Storage guards. */
  maxOpenPerLabel: 3,
  maxPerWorld: 200,
  keepTicks: 4,
  /** A shade can turn against its author. */
  backfire: 0.2,
};

export type Tone = 'humble' | 'confident' | 'provoc';
export type ClashStatus = 'waiting' | 'answered' | 'won' | 'refused';

export interface Clash {
  id: string;
  fromLabelId: string;
  toLabelId: string;
  fromArtistId: string;
  fromSongId: string;
  toArtistId: string | null;
  toSongId: string | null;
  status: ClashStatus;
  answerBy: number;
  /** Tick the result is known: the week after both disstracks are out. */
  resolveTick: number;
  winnerLabelId: string | null;
  updatedTick: number;
}

const clashesOf = (world: World): Clash[] => (world.clashes ??= []);
const isOpen = (c: Clash): boolean => c.status === 'waiting' || c.status === 'answered';
const news = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }];
};

const topArtist = (world: World, labelId: string): Artist | null =>
  rosterOf(world, labelId).sort((a, b) => b.fans - a.fans)[0] ?? null;

const bump = (artist: Artist | null, hype: number, morale = 0): void => {
  if (!artist) return;
  artist.hype = clamp(artist.hype + hype, 0, 100);
  artist.morale = clamp(artist.morale + morale, 0, 100);
};

const record = (label: Label | undefined, win: boolean): void => {
  if (!label) return;
  if (win) label.stats.clashWins = (label.stats.clashWins ?? 0) + 1;
  else label.stats.clashLosses = (label.stats.clashLosses ?? 0) + 1;
};

/** Who the artist is fighting right now (the other artist, or the other label), for the studio cards. */
export const clashRival = (world: World, artistId: string): string | null => {
  for (const c of world.clashes ?? []) {
    if (!isOpen(c)) continue;
    if (c.fromArtistId === artistId) return (c.toArtistId ? world.artists[c.toArtistId]?.name : undefined) ?? world.labels[c.toLabelId]?.name ?? null;
    if (c.toArtistId === artistId) return world.artists[c.fromArtistId]?.name ?? world.labels[c.fromLabelId]?.name ?? null;
  }
  return null;
};

/* ---------------------------------- Rivals ---------------------------------- */

/** Labels one can go after: the players, and the biggest labels of the game. */
export const rivalsOf = (world: World, labelId: string): Label[] => {
  const withArtists = Object.values(world.labels).filter((l) => l.id !== labelId && !l.bankrupt && rosterOf(world, l.id).length > 0);
  const players = withArtists.filter((l) => l.kind === 'player');
  const npcs = withArtists
    .filter((l) => l.kind === 'npc')
    .map((l) => ({ l, fans: rosterOf(world, l.id).reduce((s, a) => s + a.fans, 0) }))
    .sort((a, b) => b.fans - a.fans)
    .slice(0, 12)
    .map((x) => x.l);
  return [...players, ...npcs];
};

const rivalFor = (world: World, label: Label, rng: Rng): Label | null => {
  const rivals = rivalsOf(world, label.id);
  return rivals.length > 0 ? rng.pick(rivals) : null;
};

/* ---------------------------------- Disstracks ---------------------------------- */

const DISS_TITLES = [
  'Lettre à {t}',
  '{t} (Freestyle)',
  'Pas de cadeau',
  'Réponse',
  'Fin de l’histoire',
  'Dossier',
  'Je l’ai dit',
  'Mise au point',
  'Sans filtre',
  'Petit rappel',
];

/** Records a disstrack on the spot (free studio, theme Clash) and puts it out as soon as possible. */
const recordDiss = (world: World, label: Label, artist: Artist, target: Label): string => {
  if (artist.energy < CLASH.energy) fail(`${artist.name} est trop fatigué pour un disstrack.`);
  const rng = rngFor(world.seed, world.tick, `diss:${label.id}:${artist.id}`);
  const beat =
    BEATS.find((b) => b.genres.includes(artist.genre) && b.themes.includes('clash')) ?? BEATS.find((b) => b.genres.includes(artist.genre)) ?? BEATS[0]!;
  const title = rng.pick(DISS_TITLES).replace('{t}', target.name);
  const song = createSong(world, label.id, {
    artistId: artist.id,
    title,
    themeId: 'clash',
    beatId: beat.id,
    levels: { theme: 1, beat: 1, producer: 1, studio: 1 },
    producer: producerOfLevel(1),
  });
  song.diss = target.id;
  for (let week = 1; week <= 4; week += 1) {
    const when = Math.max(song.availableTick, world.tick + week);
    if (!releaseBlocked(world, label.id, artist.id, when)) {
      scheduleRelease(world, label.id, song.id, when, []);
      break;
    }
  }
  return song.id;
};

const artistOfLabel = (world: World, label: Label, artistId: string): Artist => {
  const artist = rosterOf(world, label.id).find((a) => a.id === artistId);
  return artist ?? fail('Cet artiste n’est pas dans ton label.');
};

/** Launches a clash: one of the label's artists drops a disstrack against another label. */
export const startClash = (world: World, label: Label, targetLabelId: string, artistId: string): Clash => {
  const target = world.labels[targetLabelId] ?? fail('Label introuvable.');
  if (target.id === label.id) fail('Tu ne peux pas te clasher toi-même.');
  if (!rivalsOf(world, label.id).some((l) => l.id === target.id)) fail(`${target.name} n’a personne à clasher.`);
  checkTarget(world, label, target.id);
  const all = clashesOf(world);
  if (all.some((c) => isOpen(c) && ((c.fromLabelId === label.id && c.toLabelId === target.id) || (c.fromLabelId === target.id && c.toLabelId === label.id))))
    fail(`Un clash avec ${target.name} est déjà en cours.`);
  if (all.filter((c) => isOpen(c) && c.fromLabelId === label.id).length >= CLASH.maxOpenPerLabel) fail('Trop de clashs en cours. Finis-en un avant.');
  if (all.length >= CLASH.maxPerWorld) fail('Trop de clashs sur ce serveur. Réessaie la semaine prochaine.');
  const artist = artistOfLabel(world, label, artistId);
  const songId = recordDiss(world, label, artist, target);
  const clash: Clash = {
    id: `c${world.nextId}`,
    fromLabelId: label.id,
    toLabelId: target.id,
    fromArtistId: artist.id,
    fromSongId: songId,
    toArtistId: null,
    toSongId: null,
    status: 'waiting',
    answerBy: world.tick + CLASH.answerTicks,
    resolveTick: 0,
    winnerLabelId: null,
    updatedTick: world.tick,
  };
  world.nextId += 1;
  all.push(clash);
  news(world, `Clash : ${artist.name} (${label.name}) sort un disstrack contre ${target.name}.`);
  return clash;
};

const clashOf = (world: World, id: string): Clash => clashesOf(world).find((c) => c.id === id) ?? fail('Clash introuvable.');

const releaseOf = (world: World, songId: string | null): number => world.songs.find((s) => s.id === songId)?.releaseTick ?? world.tick + 1;

const answer = (world: World, clash: Clash, label: Label, artist: Artist): void => {
  const challenger = world.labels[clash.fromLabelId];
  clash.toArtistId = artist.id;
  clash.toSongId = recordDiss(world, label, artist, challenger ?? label);
  clash.status = 'answered';
  clash.resolveTick = Math.max(releaseOf(world, clash.fromSongId), releaseOf(world, clash.toSongId)) + 1;
  clash.updatedTick = world.tick;
  news(world, `${artist.name} (${label.name}) répond à ${challenger?.name ?? 'son rival'} avec un disstrack.`);
};

/** The target answers with his own disstrack. */
export const answerClash = (world: World, label: Label, clashId: string, artistId: string): void => {
  const clash = clashOf(world, clashId);
  if (clash.toLabelId !== label.id) fail('Ce clash ne te vise pas.');
  if (clash.status !== 'waiting') fail('Ce clash est déjà réglé.');
  answer(world, clash, label, artistOfLabel(world, label, artistId));
};

const backDown = (world: World, clash: Clash): void => {
  const target = world.labels[clash.toLabelId];
  const challenger = world.labels[clash.fromLabelId];
  clash.status = 'refused';
  clash.winnerLabelId = clash.fromLabelId;
  clash.updatedTick = world.tick;
  if (target) {
    target.reputation = clamp(target.reputation - CLASH.shameReputation, 0, 100);
    bump(topArtist(world, target.id), -CLASH.shameHype);
  }
  bump(world.artists[clash.fromArtistId] ?? null, CLASH.shameHype);
  record(challenger, true);
  record(target, false);
  news(world, `${target?.name ?? 'Le label'} se dégonfle face à ${challenger?.name ?? 'son rival'}. La honte.`);
};

/** The target backs down: he loses face. */
export const refuseClash = (world: World, label: Label, clashId: string): void => {
  const clash = clashOf(world, clashId);
  if (clash.toLabelId !== label.id) fail('Ce clash ne te vise pas.');
  if (clash.status !== 'waiting') fail('Ce clash est déjà réglé.');
  backDown(world, clash);
};

/** How strong a disstrack lands: the song, the buzz of the artist, his audience, and some luck. */
const punch = (world: World, songId: string | null, artistId: string | null, rng: Rng): number => {
  const song = world.songs.find((s) => s.id === songId);
  const artist = artistId ? world.artists[artistId] : undefined;
  if (!song || !artist) return 0;
  return song.quality * 0.5 + artist.hype * 0.3 + Math.log10(artist.fans + 10) * 4 + rng.range(0, 12);
};

const settle = (world: World, clash: Clash, tell: (labelId: string, text: string) => void): void => {
  const rng = rngFor(world.seed, world.tick, `clash:${clash.id}`);
  const a = punch(world, clash.fromSongId, clash.fromArtistId, rng);
  const b = punch(world, clash.toSongId, clash.toArtistId, rng);
  const fromWins = a >= b;
  const winner = world.artists[fromWins ? clash.fromArtistId : (clash.toArtistId ?? '')];
  const loser = world.artists[fromWins ? (clash.toArtistId ?? '') : clash.fromArtistId];
  const winLabel = world.labels[fromWins ? clash.fromLabelId : clash.toLabelId];
  const loseLabel = world.labels[fromWins ? clash.toLabelId : clash.fromLabelId];
  if (winner && loser) {
    // 25 % more between declared enemies.
    const boost = enemyBoost(world, clash.fromLabelId, clash.toLabelId);
    const taken = Math.min(CLASH.maxFans * boost, Math.round(loser.fans * CLASH.fanShare * boost));
    winner.fans += taken;
    loser.fans = Math.max(0, loser.fans - Math.round(loser.fans * CLASH.fanLoss));
    bump(winner, Math.round(CLASH.winHype * boost), 5);
    bump(loser, -CLASH.loseHype, -5);
    if (winLabel) winLabel.reputation = clamp(winLabel.reputation + 3, 0, 100);
    if (loseLabel) loseLabel.reputation = clamp(loseLabel.reputation - 2, 0, 100);
    record(winLabel, true);
    record(loseLabel, false);
    news(world, `Clash : ${winner.name} (${winLabel?.name}) gagne contre ${loser.name} (${loseLabel?.name}) et prend ${taken.toLocaleString('fr-FR')} fans.`);
    if (winLabel) tell(winLabel.id, `Clash gagné : ${winner.name} écrase ${loser.name} (+${taken.toLocaleString('fr-FR')} fans, gros buzz).`);
    if (loseLabel) tell(loseLabel.id, `Clash perdu : ${loser.name} se fait éteindre par ${winner.name}. Il perd des fans.`);
  }
  clash.status = 'won';
  clash.winnerLabelId = winLabel?.id ?? null;
  clash.updatedTick = world.tick;
};

/** Weekly: the labels of the game answer, silence means backing down, and the results come in. */
export const tickClashes = (world: World, tell: (labelId: string, text: string) => void): void => {
  if (!world.clashes) return;
  for (const clash of world.clashes) {
    const target = world.labels[clash.toLabelId];
    if (clash.status === 'waiting' && target?.kind === 'npc') {
      const rng = rngFor(world.seed, world.tick, `npcclash:${clash.id}`);
      const artist = topArtist(world, target.id);
      if (artist && artist.energy >= CLASH.energy && rng.next() < CLASH.npcAnswers) {
        try {
          answer(world, clash, target, artist);
          tell(clash.fromLabelId, `${target.name} répond à ton clash avec ${artist.name}.`);
        } catch (error) {
          if (!(error instanceof GameError)) throw error;
          backDown(world, clash);
        }
      } else backDown(world, clash);
      if ((clash.status as ClashStatus) === 'refused') tell(clash.fromLabelId, `${target.name} ne répond pas à ton clash : il se dégonfle.`);
    } else if (clash.status === 'waiting' && clash.answerBy <= world.tick) {
      backDown(world, clash);
      tell(clash.fromLabelId, `${target?.name ?? 'Ton rival'} n’a pas répondu à ton clash : il se dégonfle.`);
      tell(clash.toLabelId, `Tu n’as pas répondu au clash : ton label passe pour un dégonflé.`);
    } else if (clash.status === 'answered' && clash.resolveTick <= world.tick) {
      settle(world, clash, tell);
    }
  }
  world.clashes = world.clashes.filter((c) => isOpen(c) || world.tick - c.updatedTick < CLASH.keepTicks);
};

/* ---------------------------------- Shade ---------------------------------- */

const SHADES = [
  '{t} ? Leur dernier son, même leur mère l’a skippé.',
  'Chez {t}, ils signent des artistes au poids, pas au talent.',
  '{t}, c’est le label préféré des gens qui n’écoutent pas de musique.',
  'On a vu les chiffres de {t}. On a ri, puis on a eu de la peine.',
  '{t} copie nos idées avec trois mois de retard. Merci pour l’hommage.',
  'Le studio de {t}, c’est une chambre avec une boîte à œufs au mur.',
  '{t} achète des vues, nous on achète des disques d’or.',
  'Leur directeur artistique a un abonnement à type beat gratuit.',
  '{t} ? Connais pas. Ah si, ceux qui font les premières parties.',
  'Chez {t}, le marketing c’est la tante qui partage en story.',
  'On ne clashe pas {t}. On ne tape pas les petits.',
  '{t} a plus de procès que de tubes.',
];

export interface ShadeView {
  /** Already used this week. */
  used: boolean;
  lines: Array<{ id: number; text: string }>;
}

const shadeLines = (world: World, label: Label): number[] => {
  const rng = rngFor(world.seed, world.tick, `shade:${label.id}`);
  const pool = SHADES.map((_, i) => i);
  const picked: number[] = [];
  while (picked.length < 3 && pool.length > 0) picked.push(...pool.splice(rng.int(0, pool.length - 1), 1));
  return picked;
};

export const shadeView = (world: World, label: Label): ShadeView => ({
  used: world.shades?.[label.id] === world.tick,
  lines: shadeLines(world, label).map((id) => ({ id, text: SHADES[id]! })),
});

/** One public pique a week at another label. It can turn against its author. */
export const throwShade = (world: World, label: Label, targetLabelId: string, line: number): { backfired: boolean } => {
  const target = world.labels[targetLabelId] ?? fail('Label introuvable.');
  if (target.id === label.id) fail('Tu ne peux pas te clasher toi-même.');
  if (!rivalsOf(world, label.id).some((l) => l.id === target.id)) fail(`${target.name} n’a personne à piquer.`);
  checkTarget(world, label, target.id);
  const boost = enemyBoost(world, label.id, target.id);
  if (world.shades?.[label.id] === world.tick) fail('Tu as déjà lancé une pique cette semaine.');
  if (!shadeLines(world, label).includes(line)) fail('Cette phrase n’est pas proposée cette semaine.');
  if (rosterOf(world, label.id).length === 0) fail('Il te faut au moins un artiste pour parler.');
  world.shades = { ...world.shades, [label.id]: world.tick };
  const text = SHADES[line]!.replace('{t}', target.name);
  const backfired = rngFor(world.seed, world.tick, `shadeluck:${label.id}`).next() < CLASH.backfire;
  if (backfired) {
    bump(topArtist(world, label.id), -4);
    label.reputation = clamp(label.reputation - 2, 0, 100);
    news(world, `${label.name} : « ${text} » Le public trouve ça gênant. Ça se retourne contre eux.`);
  } else {
    bump(topArtist(world, label.id), Math.round(4 * boost));
    bump(topArtist(world, target.id), -Math.round(2 * boost));
    news(world, `${label.name} pique ${target.name} : « ${text} »`);
  }
  return { backfired };
};

/* ---------------------------------- Interview ---------------------------------- */

interface Question {
  /** When the question can come up. */
  when?: (ctx: QuestionContext) => boolean;
  text: string;
  answers: Record<Tone, string>;
}

interface QuestionContext {
  artist: Artist;
  label: Label;
  rival: Label | null;
  song: string | null;
  clash: boolean;
}

const QUESTIONS: Question[] = [
  {
    when: (c) => c.rival !== null,
    text: 'On dit que {rival} est le label du moment. Ton avis ?',
    answers: { humble: 'Ils bossent bien, respect. Nous on avance à notre rythme.', confident: 'Le label du moment, c’est celui qui sort les meilleurs sons. Regarde les charts.', provoc: '{rival} ? Le label du moment… de l’année dernière.' },
  },
  {
    text: '{artist}, c’est quoi le secret de ta forme en ce moment ?',
    answers: { humble: 'Le travail, et une équipe qui me soutient.', confident: 'Je suis né pour ça, simplement.', provoc: 'Je dors pas. Les autres, si.' },
  },
  {
    text: 'Ton prochain projet, c’est pour quand ?',
    answers: { humble: 'Quand il sera prêt. Je préfère prendre le temps.', confident: 'Bientôt. Et ça va faire mal.', provoc: 'Assez tôt pour enterrer tout le monde.' },
  },
  {
    text: 'Tu écoutes quoi en ce moment ?',
    answers: { humble: 'Beaucoup de nouveaux, il y a du talent partout.', confident: 'Mes propres maquettes, en boucle.', provoc: 'Pas {rival}, en tout cas.' },
  },
  {
    text: 'Les gens disent que tu as changé depuis que tu as signé chez {label}. Vrai ?',
    answers: { humble: 'J’ai grandi, c’est tout. Je reste le même.', confident: 'J’ai changé de niveau, oui.', provoc: 'Les gens disent beaucoup de choses. Ils feraient mieux de rapper.' },
  },
  {
    when: (c) => c.rival !== null,
    text: 'Un featuring avec quelqu’un de {rival}, c’est possible ?',
    answers: { humble: 'Pourquoi pas, la musique avant tout.', confident: 'S’ils peuvent suivre le rythme, on verra.', provoc: 'Je fais pas de charité.' },
  },
  {
    text: 'Tu te vois où dans un an ?',
    answers: { humble: 'En train de faire de la musique, c’est déjà beaucoup.', confident: 'Numéro 1. Point.', provoc: 'Au-dessus de tous ceux qui parlent dans mon dos.' },
  },
  {
    text: 'Ta mère, elle écoute tes sons ?',
    answers: { humble: 'Oui, et elle me dit quand c’est nul. Merci maman.', confident: 'Elle connaît tous les textes par cœur.', provoc: 'Même elle écoute plus mes sons que ceux de {rival}.' },
  },
  {
    when: (c) => c.song !== null,
    text: '« {song} » vient de sortir. Content des chiffres ?',
    answers: { humble: 'Merci au public, chaque écoute compte.', confident: 'C’est qu’un début, attends la suite.', provoc: 'Les chiffres, c’est pour ceux qui ont rien à dire.' },
  },
  {
    when: (c) => c.clash,
    text: 'Le clash en cours, c’est sérieux ou c’est pour le buzz ?',
    answers: { humble: 'C’est de la compétition, rien de personnel.', confident: 'Le son a parlé. Le reste, c’est du bruit.', provoc: 'C’est sérieux. Et c’est pas fini.' },
  },
  {
    when: (c) => c.artist.morale < 45,
    text: 'On t’a vu énervé sur les réseaux cette semaine. Qu’est-ce qui se passe ?',
    answers: { humble: 'Une mauvaise passe. Je m’excuse auprès de ceux que j’ai blessés.', confident: 'Rien. Je canalise tout dans la musique.', provoc: 'Il se passe que certains devraient se taire.' },
  },
  {
    text: 'Le rap, c’était mieux avant ?',
    answers: { humble: 'Chaque époque a ses pépites.', confident: 'Non, parce que maintenant il y a moi.', provoc: 'C’était mieux avant que {rival} existe.' },
  },
  {
    text: 'Tu as un message pour tes fans ?',
    answers: { humble: 'Merci. Sans vous je suis rien.', confident: 'Accrochez-vous, ça va monter.', provoc: 'Restez loin des faux. Vous savez de qui je parle.' },
  },
];

/** Effects of a tone: humble keeps the artist happy, confident makes buzz, provocative makes more buzz but costs face. */
const TONE = {
  humble: { hype: 1, morale: 4, reputation: 1, rival: 0 },
  confident: { hype: 4, morale: 2, reputation: 0, rival: 0 },
  provoc: { hype: 8, morale: 0, reputation: -2, rival: -3 },
} as const satisfies Record<Tone, { hype: number; morale: number; reputation: number; rival: number }>;

export interface InterviewView {
  artistId: string;
  artistName: string;
  questions: Array<{ text: string; answers: Array<{ tone: Tone; text: string }>; answered: Tone | null }>;
}

const interviewPlan = (world: World, label: Label): { artist: Artist; rival: Label | null; questions: Question[]; ctx: QuestionContext } | null => {
  const roster = rosterOf(world, label.id);
  if (roster.length === 0) return null;
  const rng = rngFor(world.seed, world.tick, `interview:${label.id}`);
  const artist = rng.pick(roster);
  const rival = rivalFor(world, label, rng);
  const last = world.songs.filter((s) => s.artistId === artist.id && s.state === 'released' && world.tick - (s.releaseTick ?? 0) <= 2).at(-1);
  const clash = clashesOf(world).some((c) => isOpen(c) && (c.fromLabelId === label.id || c.toLabelId === label.id));
  const ctx: QuestionContext = { artist, label, rival, song: last?.title ?? null, clash };
  // Questions tied to what just happened come first, then the others.
  const fitting = QUESTIONS.filter((q) => !q.when || q.when(ctx));
  const picked: Question[] = [];
  for (const q of fitting.filter((q) => q.when && !q.text.includes('{rival}'))) {
    if (picked.length < 2 && rng.next() < 0.7) picked.push(q);
  }
  const rest = fitting.filter((q) => !picked.includes(q));
  while (picked.length < 3 && rest.length > 0) picked.push(...rest.splice(rng.int(0, rest.length - 1), 1));
  return { artist, rival, questions: picked, ctx };
};

const fill = (text: string, ctx: QuestionContext): string =>
  text
    .split('{artist}').join(ctx.artist.name)
    .split('{label}').join(ctx.label.name)
    .split('{rival}').join(ctx.rival?.name ?? 'les autres')
    .split('{song}').join(ctx.song ?? 'ton son');

const answersOf = (world: World, labelId: string): Partial<Record<number, Tone>> => {
  const saved = world.interviews?.[labelId];
  return saved && saved.tick === world.tick ? saved.answers : {};
};

export const interviewView = (world: World, label: Label): InterviewView | null => {
  const plan = interviewPlan(world, label);
  if (!plan) return null;
  const done = answersOf(world, label.id);
  return {
    artistId: plan.artist.id,
    artistName: plan.artist.name,
    questions: plan.questions.map((q, i) => ({
      text: fill(q.text, plan.ctx),
      answers: (['humble', 'confident', 'provoc'] as const).map((tone) => ({ tone, text: fill(q.answers[tone], plan.ctx) })),
      answered: done[i] ?? null,
    })),
  };
};

/** Answers one question of the weekly interview. */
export const answerInterview = (world: World, label: Label, question: number, tone: Tone): void => {
  const plan = interviewPlan(world, label) ?? fail('Pas d’interview cette semaine : il te faut un artiste.');
  const q = plan.questions[question] ?? fail('Question introuvable.');
  const done = answersOf(world, label.id);
  if (done[question]) fail('Tu as déjà répondu à cette question.');
  const effect = TONE[tone];
  bump(plan.artist, effect.hype, effect.morale);
  label.reputation = clamp(label.reputation + effect.reputation, 0, 100);
  if (effect.rival && plan.rival && q.answers.provoc.includes('{rival}')) bump(topArtist(world, plan.rival.id), effect.rival);
  world.interviews = { ...world.interviews, [label.id]: { tick: world.tick, answers: { ...done, [question]: tone } } };
  if (tone === 'provoc') news(world, `Interview : ${plan.artist.name} (${label.name}) : « ${fill(q.answers.provoc, plan.ctx)} »`);
};

/* ---------------------------------- View ---------------------------------- */

export interface ClashView {
  id: string;
  direction: 'sent' | 'received';
  otherLabel: string;
  myArtist: string | null;
  theirArtist: string | null;
  status: ClashStatus;
  /** Weeks left to answer (waiting) or before the result (answered). */
  weeksLeft: number;
  won: boolean | null;
}

export const clashesView = (world: World, labelId: string): ClashView[] =>
  clashesOf(world)
    .filter((c) => c.fromLabelId === labelId || c.toLabelId === labelId)
    .map((c) => {
      const sent = c.fromLabelId === labelId;
      const mine = sent ? c.fromArtistId : c.toArtistId;
      const theirs = sent ? c.toArtistId : c.fromArtistId;
      return {
        id: c.id,
        direction: sent ? 'sent' : 'received',
        otherLabel: world.labels[sent ? c.toLabelId : c.fromLabelId]?.name ?? '?',
        myArtist: mine ? (world.artists[mine]?.name ?? null) : null,
        theirArtist: theirs ? (world.artists[theirs]?.name ?? null) : null,
        status: c.status,
        weeksLeft: Math.max(0, (c.status === 'waiting' ? c.answerBy : c.resolveTick) - world.tick),
        won: c.status === 'won' || c.status === 'refused' ? c.winnerLabelId === labelId : null,
      } satisfies ClashView;
    })
    .sort((a, b) => Number(b.status === 'waiting' && b.direction === 'received') - Number(a.status === 'waiting' && a.direction === 'received'));

export interface RivalView {
  id: string;
  name: string;
  player: boolean;
  topArtist: string;
  gen: number;
}

export const rivalsView = (world: World, labelId: string): RivalView[] =>
  rivalsOf(world, labelId)
    .filter((l) => l.kind !== 'player' || (world.labels[labelId]?.enemies ?? []).includes(l.id))
    .map((l) => {
    const top = topArtist(world, l.id);
    return { id: l.id, name: l.name, player: l.kind === 'player', topArtist: top?.name ?? '', gen: top ? generalRating(top) : 0 };
  });
