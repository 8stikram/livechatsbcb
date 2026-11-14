// Scandals (docs/melody-tycoon/06-evenements-notifications.md, 6.3): rare, about one a season for ten artists,
// more often with a high buzz, a low morale, or after an excess. Always in the news for the whole party.
// Rule H3: a real artist only gets a bad buzz or a public wish to leave, with neutral words. The heavy ones
// (lawsuit, plagiarism, health, excess) and the trash tone are for the invented artists only.
// The label has 2 weeks to answer: communicate, pay, deny, fire or support. Without an answer, it takes the hit.
import { artistValue, contractOf, rosterOf } from './economy.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import type { Artist, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type ScandalKind = 'badbuzz' | 'departure' | 'lawsuit' | 'plagiarism' | 'health' | 'excess';
export type ScandalAnswer = 'talk' | 'pay' | 'deny' | 'fire' | 'support';

export const SCANDALS = {
  /** Chance per artist and per week, times his risk (0.5 to 2, drawn per world), his buzz and his morale. */
  base: 0.0012,
  riskMin: 0.5,
  riskMax: 2,
  lowMorale: 30,
  lowMoraleMult: 1.3,
  /** After an excess, the risk of another one is higher for this long. */
  relapseWeeks: 26,
  relapseMult: 3,
  answerWeeks: 2,
  /** Communicate: odds from his media skill and the community manager's stars. */
  talkBase: 0.35,
  perMedia: 0.006,
  perStar: 0.05,
  talkMin: 0.1,
  talkMax: 0.85,
  talkFailHype: 3,
  /** Pay: a share of the artist's value; damages divided by 3, health and excess weeks by 2. */
  payShare: [0.05, 0.3] as const,
  payMin: 500,
  denyOdds: 0.5,
  denyReputation: 3,
  fireGood: 1,
  fireBad: 2,
  /** Over this many fans, the public loved him: firing him costs reputation. */
  lovedFans: 1_000_000,
  fireTeamMorale: 5,
  supportMorale: 15,
  keep: 30,
} as const;

export const KIND_NAMES: Record<ScandalKind, string> = {
  badbuzz: 'Bad buzz',
  departure: 'Départ en public',
  lawsuit: 'Procès',
  plagiarism: 'Plagiat',
  health: 'Santé',
  excess: 'Excès',
};

export const ANSWER_NAMES: Record<ScandalAnswer, string> = {
  talk: 'Communiquer',
  pay: 'Payer',
  deny: 'Nier',
  fire: 'Virer',
  support: 'Soutenir',
};

/** The texts: {a} is the artist. The invented artists get the trash ones, the real ones only neutral words. */
export const SCANDAL_TEXTS: { invented: Record<ScandalKind, readonly string[]>; real: Record<'badbuzz' | 'departure', readonly string[]> } = {
  invented: {
    badbuzz: [
      '{a} a été filmé en train de pleurer devant un fast-food fermé à 4 h du matin. 3 millions de vues.',
      '{a} a confondu sa story privée et son compte principal. On a tout vu : ses pieds, et son historique de recherche.',
      '{a} a appelé ses fans « mes clients » en live. Les clients ne sont pas contents.',
      '{a} a vomi sur le premier rang d’un showcase. Le premier rang s’en souviendra toute sa vie.',
      '{a} a déclaré en interview être « meilleur que Mozart, et Mozart il a même pas d’Insta ».',
      'Un vieux tweet de {a} ressort : « la musique c’est pour les ratés ». Il avait 14 ans. Internet s’en fiche.',
    ],
    departure: [
      '{a} annonce en live qu’il veut quitter le label « parce que le boss sent le poisson pané ».',
      '{a} poste une story « LIBÉREZ-MOI » avec le logo du label barré au feutre.',
      '{a} raconte en interview que le label le traite « comme un stagiaire sans tickets-resto ».',
    ],
    lawsuit: [
      'Son ancien manager attaque {a} : il réclame 20 % de tout, y compris de sa grand-mère.',
      'Un voisin porte plainte contre {a} : 14 nuits de basses à 3 h du matin, et un perroquet traumatisé.',
      '{a} a samplé une pub pour du dentifrice sans demander. Les avocats du dentifrice ont les dents longues.',
      'Son ex attaque {a} pour avoir mis ses vocaux de rupture dans un son. Sans la créditer. Ni la payer.',
    ],
    plagiarism: [
      'Un youtubeur prouve que le dernier son de {a} est une comptine de maternelle accélérée.',
      'Le refrain de {a} est, note pour note, celui d’un groupe de rock lituanien de 1994. Les Lituaniens ont remarqué.',
      '{a} a « emprunté » la prod d’un gamin de 15 ans sur YouTube. Le gamin a des avocats. Et des parents.',
    ],
    health: [
      '{a} s’est cassé le poignet en faisant un salto arrière pour TikTok. Le salto était raté. Le poignet aussi.',
      '{a} a perdu sa voix après 9 heures de karaoké. Repos forcé, et interdiction de chanter du Céline.',
      '{a} fait un burn-out en plein studio. Le médecin a dit : repos, et plus de téléphone.',
      '{a} a mangé un kebab douteux à la sortie d’un concert. Le kebab a gagné.',
    ],
    excess: [
      '{a} a été retrouvé à 7 h du matin en train de parler à un lampadaire. Trop de cocaïne, a conclu le lampadaire.',
      '{a} a fait un live sous kétamine : 40 minutes à fixer la caméra sans un mot. Record d’audience.',
      '{a} a raté le studio trois jours de suite : il était « en voyage ». Le voyage s’appelait LSD.',
      '{a} boit de la lean au petit-déjeuner. L’ingé son retrouve des gobelets violets jusque dans la console.',
      '{a} a fini la soirée champagne-vodka sur le toit d’un taxi. Le taxi roulait.',
      '{a} a tellement fumé de beuh avant l’interview qu’il a demandé au journaliste qui il était. Lui, pas le journaliste.',
    ],
  },
  real: {
    badbuzz: [
      'Une interview de {a} mal coupée tourne partout. Les gens s’énervent sans avoir vu la fin.',
      'Un live de {a} où le son coupe trois fois devient un mème.',
      '{a} arrive en retard à une émission. Les commentaires ne pardonnent pas.',
      'Une phrase de {a} sortie de son contexte fait débat toute la semaine.',
    ],
    departure: [
      '{a} laisse entendre en interview qu’il aimerait voir ailleurs.',
      '{a} retire le nom du label de sa bio. Tout le monde l’a remarqué.',
    ],
  },
};

export interface ScandalDamage {
  hype: number;
  /** Share of his fans lost. */
  fans: number;
  fine: number;
  reputation: number;
  /** Morale lost by everyone in the label. */
  team: number;
  /** Weeks without studio, concert, tour or festival. */
  weeks: number;
  discipline: number;
  /** Share of his energy lost. */
  energy: number;
  /** Weeks the song earns nothing. */
  pulled: number;
}

export interface Scandal {
  id: string;
  labelId: string;
  artistId: string;
  kind: ScandalKind;
  text: string;
  tick: number;
  songId: string | null;
  damage: ScandalDamage;
  status: 'open' | 'done';
  answer: ScandalAnswer | 'none' | null;
  outcome: string | null;
}

const ZERO: ScandalDamage = { hype: 0, fans: 0, fine: 0, reputation: 0, team: 0, weeks: 0, discipline: 0, energy: 0, pulled: 0 };

const listOf = (world: World): Scandal[] => (world.scandals ??= []);

const news = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text: text[0]!.toUpperCase() + text.slice(1) }];
};

/** His own risk, the same all along a world. */
export const scandalRisk = (world: World, artistId: string): number =>
  rngFor(world.seed, 0, `scandal-risk:${artistId}`).range(SCANDALS.riskMin, SCANDALS.riskMax);

export const scandalChance = (world: World, artist: Artist): number =>
  SCANDALS.base *
  scandalRisk(world, artist.id) *
  (1 + artist.hype / 100) *
  (artist.morale < SCANDALS.lowMorale ? SCANDALS.lowMoraleMult : 1) *
  ((artist.relapseUntil ?? 0) > world.tick ? SCANDALS.relapseMult : 1);

const lastSong = (world: World, artistId: string, labelId: string): string | null =>
  world.songs
    .filter((s) => s.artistId === artistId && s.labelId === labelId && s.state === 'released' && !s.seized)
    .sort((a, b) => (b.releaseTick ?? 0) - (a.releaseTick ?? 0))[0]?.id ?? null;

const pickKind = (world: World, artist: Artist, labelId: string, rng: Rng): ScandalKind => {
  if (artist.real) return rng.chance(0.75) ? 'badbuzz' : 'departure';
  if ((artist.relapseUntil ?? 0) > world.tick && rng.chance(0.5)) return 'excess';
  const roll = rng.next() * 100;
  const kind: ScandalKind = roll < 30 ? 'badbuzz' : roll < 45 ? 'departure' : roll < 60 ? 'lawsuit' : roll < 70 ? 'plagiarism' : roll < 85 ? 'health' : 'excess';
  return kind === 'plagiarism' && !lastSong(world, artist.id, labelId) ? 'badbuzz' : kind;
};

const damageOf = (kind: ScandalKind, artist: Artist, label: Label, rng: Rng): ScandalDamage => {
  switch (kind) {
    case 'badbuzz':
      return { ...ZERO, hype: Math.round(rng.range(10, 20)), fans: 0.02 };
    case 'departure':
      return { ...ZERO, reputation: 2, team: 5 };
    case 'lawsuit':
      return { ...ZERO, fine: Math.round(Math.max(1_000 * Math.max(1, label.tier), artist.fans * 0.05 * rng.range(1, 4)) / 100) * 100 };
    case 'plagiarism':
      return { ...ZERO, reputation: 3, pulled: 3 };
    case 'health':
      return { ...ZERO, weeks: rng.int(2, 6) };
    case 'excess':
      return { ...ZERO, discipline: 15, energy: 0.3, hype: 5 };
  }
};

export const describeDamage = (d: ScandalDamage): string => {
  const parts: string[] = [];
  if (d.hype) parts.push(`buzz −${d.hype}`);
  if (d.fans) parts.push(`fans −${Math.round(d.fans * 100)} %`);
  if (d.fine) parts.push(`amende ${d.fine.toLocaleString('fr-FR')} €`);
  if (d.reputation) parts.push(`réputation −${d.reputation}`);
  if (d.team) parts.push(`moral du label −${d.team}`);
  if (d.weeks) parts.push(`indisponible ${d.weeks} semaine${d.weeks > 1 ? 's' : ''}`);
  if (d.discipline) parts.push(`discipline −${d.discipline}`);
  if (d.energy) parts.push(`énergie −${Math.round(d.energy * 100)} %`);
  if (d.pulled) parts.push(`son retiré ${d.pulled} semaines (plus de revenus)`);
  return parts.join(', ');
};

/** Starts a scandal on this artist (the weekly draw, or a test). */
export const startScandal = (world: World, label: Label, artist: Artist, kind?: ScandalKind): Scandal => {
  const rng = rngFor(world.seed, world.tick, `scandal:${artist.id}`);
  const k = kind ?? pickKind(world, artist, label.id, rng);
  const pool = artist.real ? SCANDAL_TEXTS.real[k === 'departure' ? 'departure' : 'badbuzz'] : SCANDAL_TEXTS.invented[k];
  const scandal: Scandal = {
    id: `scandal_${world.nextId++}`,
    labelId: label.id,
    artistId: artist.id,
    kind: artist.real && k !== 'departure' ? 'badbuzz' : k,
    text: rng.pick(pool).replaceAll('{a}', artist.name),
    tick: world.tick,
    songId: k === 'plagiarism' ? lastSong(world, artist.id, label.id) : null,
    damage: damageOf(artist.real && k !== 'departure' ? 'badbuzz' : k, artist, label, rng),
    status: 'open',
    answer: null,
    outcome: null,
  };
  listOf(world).push(scandal);
  label.stats.scandals = (label.stats.scandals ?? 0) + 1;
  news(world, `Scandale chez ${label.name} : ${scandal.text}`);
  return scandal;
};

const communityStars = (world: World, labelId: string): number =>
  (world.staff?.[labelId] ?? []).find((m) => m.role === 'community')?.stars ?? 0;

export const talkOdds = (world: World, labelId: string, artist: Artist): number =>
  clamp(SCANDALS.talkBase + (artist.attrs.medias - 50) * SCANDALS.perMedia + SCANDALS.perStar * communityStars(world, labelId), SCANDALS.talkMin, SCANDALS.talkMax);

export const payCost = (world: World, s: Scandal, artist: Artist): number => {
  const share = rngFor(world.seed, s.tick, `scandal-pay:${s.id}`).range(SCANDALS.payShare[0], SCANDALS.payShare[1]);
  return Math.max(SCANDALS.payMin, Math.round((artistValue(artist) * share) / 100) * 100);
};

/** Applies the damages, times m (and times mWeeks for the weeks away). Without the artist when he was fired. */
const applyDamage = (world: World, s: Scandal, label: Label, artist: Artist | undefined, m: number, mWeeks = m): void => {
  const d = s.damage;
  if (artist) {
    artist.hype = clamp(artist.hype - Math.round(d.hype * m), 0, 100);
    artist.fans = Math.max(0, Math.round(artist.fans * (1 - d.fans * m)));
    if (d.weeks) artist.outUntil = Math.max(artist.outUntil ?? 0, world.tick + Math.round(d.weeks * mWeeks));
    if (d.discipline) artist.attrs.discipline = clamp(artist.attrs.discipline - Math.round(d.discipline * m), 1, 99);
    if (d.energy) artist.energy = clamp(artist.energy * (1 - d.energy * Math.min(1, m)), 0, 100);
    if (s.kind === 'excess') artist.relapseUntil = world.tick + SCANDALS.relapseWeeks;
  }
  if (d.fine) label.cash -= Math.round(d.fine * m);
  label.reputation = clamp(label.reputation - Math.round(d.reputation * m), 0, 100);
  if (d.team) for (const a of rosterOf(world, label.id)) a.morale = clamp(a.morale - Math.round(d.team * m), 0, 100);
  if (d.pulled && s.songId) {
    const song = world.songs.find((x) => x.id === s.songId);
    if (song && Math.round(d.pulled * m) > 0) song.pulledUntil = world.tick + Math.round(d.pulled * m);
  }
};

const scaled = (d: ScandalDamage, m: number, mWeeks = m): string =>
  describeDamage({
    hype: Math.round(d.hype * m), fans: d.fans * m, fine: Math.round(d.fine * m), reputation: Math.round(d.reputation * m), team: Math.round(d.team * m),
    weeks: Math.round(d.weeks * mWeeks), discipline: Math.round(d.discipline * m), energy: d.energy * Math.min(1, m), pulled: Math.round(d.pulled * m),
  }) || 'aucun dégât';

export const answerScandal = (world: World, label: Label, scandalId: string, answer: ScandalAnswer): string => {
  const s = listOf(world).find((x) => x.id === scandalId && x.labelId === label.id) ?? fail('Scandale introuvable.');
  if (s.status !== 'open') fail('Ce scandale est déjà réglé.');
  const artist = world.artists[s.artistId];
  const still = !!artist && contractOf(world, s.artistId)?.labelId === label.id;
  const rng = rngFor(world.seed, world.tick, `scandal-answer:${s.id}`);
  let outcome = '';
  switch (answer) {
    case 'talk': {
      if (!still) return fail('Il n’est plus dans ton label.');
      if (rng.chance(talkOdds(world, label.id, artist!))) {
        applyDamage(world, s, label, artist, 0.5);
        outcome = `Communication réussie : dégâts divisés par 2 (${scaled(s.damage, 0.5)}).`;
      } else {
        applyDamage(world, s, label, artist, 1);
        artist!.hype = clamp(artist!.hype - SCANDALS.talkFailHype, 0, 100);
        outcome = `Communication ratée : ${scaled(s.damage, 1)}, et buzz −${SCANDALS.talkFailHype} de plus.`;
      }
      break;
    }
    case 'pay': {
      if (!still) return fail('Il n’est plus dans ton label.');
      const cost = payCost(world, s, artist!);
      if (label.cash < cost) fail(`Il faut ${cost.toLocaleString('fr-FR')} € pour payer.`);
      label.cash -= cost;
      applyDamage(world, s, label, artist, 1 / 3, 0.5);
      outcome = `Payé ${cost.toLocaleString('fr-FR')} € : dégâts divisés par 3 (${scaled(s.damage, 1 / 3, 0.5)}).`;
      break;
    }
    case 'deny': {
      if (s.kind === 'health' || s.kind === 'departure') fail('On ne peut pas nier ça.');
      if (rng.chance(SCANDALS.denyOdds)) {
        outcome = 'Démenti avalé : le scandale s’éteint, aucun dégât.';
      } else {
        applyDamage(world, s, label, still ? artist : undefined, 2);
        label.reputation = clamp(label.reputation - SCANDALS.denyReputation, 0, 100);
        outcome = `Le démenti a fait pire : ${scaled(s.damage, 2)}, réputation −${SCANDALS.denyReputation}.`;
        news(world, `${label.name} nie le scandale de ${artist?.name ?? 'son artiste'}… et personne ne le croit.`);
      }
      break;
    }
    case 'fire': {
      if (!still) return fail('Il n’est plus dans ton label.');
      if (contractOf(world, s.artistId)?.loan) fail(`${artist!.name} est prêté : il n’est pas à toi.`);
      world.contracts = world.contracts.filter((c) => c.artistId !== s.artistId);
      world.gigs = world.gigs.filter((g) => g.artistId !== s.artistId);
      artist!.grudge = label.name;
      const loved = artist!.fans > SCANDALS.lovedFans;
      label.reputation = clamp(label.reputation + (loved ? -SCANDALS.fireBad : SCANDALS.fireGood), 0, 100);
      for (const a of rosterOf(world, label.id)) a.morale = clamp(a.morale - SCANDALS.fireTeamMorale, 0, 100);
      // What hits the label still hits it (fine, song pulled, reputation), not the artist anymore.
      applyDamage(world, s, label, undefined, 1);
      outcome = `${artist!.name} est viré : il est libre. Réputation ${loved ? `−${SCANDALS.fireBad} (le public l’aimait)` : `+${SCANDALS.fireGood} (« label ferme »)`}, moral du label −${SCANDALS.fireTeamMorale}.`;
      news(world, `${label.name} vire ${artist!.name} après le scandale.`);
      break;
    }
    case 'support': {
      applyDamage(world, s, label, still ? artist : undefined, 1);
      if (still) artist!.morale = clamp(artist!.morale + SCANDALS.supportMorale, 0, 100);
      outcome = `Soutien public : moral +${SCANDALS.supportMorale}, mais les dégâts restent (${scaled(s.damage, 1)}).`;
      break;
    }
  }
  s.status = 'done';
  s.answer = answer;
  s.outcome = outcome;
  return outcome;
};

/** Each week: unanswered scandals take their full hit, and new ones may fall. */
export const tickScandals = (world: World, tell: (labelId: string, text: string) => void): void => {
  for (const s of listOf(world).filter((x) => x.status === 'open' && world.tick - x.tick >= SCANDALS.answerWeeks)) {
    const label = world.labels[s.labelId];
    if (!label) continue;
    const artist = world.artists[s.artistId];
    const still = !!artist && contractOf(world, s.artistId)?.labelId === label.id;
    applyDamage(world, s, label, still ? artist : undefined, 1);
    s.status = 'done';
    s.answer = 'none';
    s.outcome = `Pas de réponse : ${scaled(s.damage, 1)}.`;
    tell(label.id, `Scandale de ${artist?.name ?? 'ton artiste'} laissé sans réponse : ${scaled(s.damage, 1)}.`);
  }
  for (const label of Object.values(world.labels)) {
    if (label.kind !== 'player' || label.bankrupt) continue;
    for (const artist of rosterOf(world, label.id)) {
      if (contractOf(world, artist.id)?.labelId !== label.id) continue;
      if (listOf(world).some((x) => x.artistId === artist.id && x.status === 'open')) continue;
      if (!rngFor(world.seed, world.tick, `scandal-roll:${artist.id}`).chance(scandalChance(world, artist))) continue;
      const s = startScandal(world, label, artist);
      tell(label.id, `Scandale ! ${s.text} Tu as ${SCANDALS.answerWeeks} semaines pour répondre (Accueil).`);
    }
  }
  const done = listOf(world).filter((x) => x.status === 'done');
  if (done.length > SCANDALS.keep) {
    const old = new Set(done.slice(0, done.length - SCANDALS.keep));
    world.scandals = listOf(world).filter((x) => !old.has(x));
  }
};

/** Health or excess: is he away? */
export const awayFor = (world: World, artist: Artist): number => Math.max(0, (artist.outUntil ?? 0) - world.tick);

export interface ScandalView {
  open: Array<{
    id: string;
    artistName: string;
    kind: ScandalKind;
    kindName: string;
    text: string;
    weeksLeft: number;
    damage: string;
    talkOdds: number;
    payCost: number;
    canDeny: boolean;
    canFire: boolean;
    still: boolean;
  }>;
  /** This week's scandals of the whole server, for the front page. */
  front: Array<{ id: string; artistName: string; labelName: string; kindName: string; text: string; mine: boolean }>;
  log: Array<{ id: string; artistName: string; kindName: string; answer: string; outcome: string; tick: number }>;
}

export const scandalsView = (world: World, label: Label | undefined): ScandalView => {
  const all = listOf(world);
  const mine = label ? all.filter((s) => s.labelId === label.id) : [];
  return {
    open: mine.filter((s) => s.status === 'open').map((s) => {
      const artist = world.artists[s.artistId];
      const still = !!artist && contractOf(world, s.artistId)?.labelId === label!.id;
      return {
        id: s.id,
        artistName: artist?.name ?? '?',
        kind: s.kind,
        kindName: KIND_NAMES[s.kind],
        text: s.text,
        weeksLeft: Math.max(1, SCANDALS.answerWeeks - (world.tick - s.tick)),
        damage: describeDamage(s.damage),
        talkOdds: artist ? Math.round(talkOdds(world, s.labelId, artist) * 100) : 0,
        payCost: artist ? payCost(world, s, artist) : 0,
        canDeny: s.kind !== 'health' && s.kind !== 'departure',
        canFire: still && !contractOf(world, s.artistId)?.loan,
        still,
      };
    }),
    front: all
      .filter((s) => s.tick === world.tick)
      .map((s) => ({
        id: s.id,
        artistName: world.artists[s.artistId]?.name ?? '?',
        labelName: world.labels[s.labelId]?.name ?? '?',
        kindName: KIND_NAMES[s.kind],
        text: s.text,
        mine: s.labelId === label?.id,
      })),
    log: mine
      .filter((s) => s.status === 'done')
      .slice(-5)
      .reverse()
      .map((s) => ({
        id: s.id,
        artistName: world.artists[s.artistId]?.name ?? '?',
        kindName: KIND_NAMES[s.kind],
        answer: s.answer && s.answer !== 'none' ? ANSWER_NAMES[s.answer] : 'Sans réponse',
        outcome: s.outcome ?? '',
        tick: s.tick,
      })),
  };
};
