// Label wars (docs/melody-tycoon/05-contrats-marche-labels.md 5.8 A and C, owner's choices 2026-11-13).
// - Press conference: free, once a week, from the start. One of your artists, or you the boss, runs down an artist
//   of another player. A bet: the more buzz the speaker has against the target, the better the odds. The target's
//   label can answer once, for free, the next week: if it works, the hit is cancelled and the target gains buzz.
// - Chart duel: a label challenges a player label for a week. Each puts out a song that week; the most first-week
//   streams wins. Honour only (no money): buzz +8, reputation +1 and 10 % of the loser's new fans; the loser loses
//   buzz. 2 weeks to answer; refusing (or not answering) is public shame, unless the challenger is bigger.
import { contractOf, rosterOf } from './economy.ts';
import { clamp, rngFor } from './rng.ts';
import type { Artist, Label, World } from './types.ts';
import { GameError } from './world.ts';
import { checkTarget, enemyBoost } from './coop.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export const WARS = {
  /** Press conference odds: base, per point of medias over 50, per point of buzz over the target, per community star. */
  base: 0.4,
  perMedia: 0.005,
  perHype: 0.006,
  perStar: 0.05,
  minOdds: 0.1,
  maxOdds: 0.85,
  /** The boss talks like an artist with medias 50 and no buzz. */
  bossMedia: 50,
  hit: 8,
  gain: 4,
  failReputation: 2,
  failHype: 4,
  replyGain: 4,
  /** Chart duel. */
  answerWeeks: 2,
  minWeeks: 3,
  maxWeeks: 8,
  winHype: 8,
  winReputation: 1,
  loseHype: 4,
  fanShare: 0.1,
  fleeReputation: 2,
  maxOpenPerLabel: 3,
  keepWeeks: 6,
} as const;

/* ---------------------------------- Press conference ---------------------------------- */

export interface PressConf {
  id: string;
  tick: number;
  fromLabelId: string;
  /** Null: the boss talked. */
  speakerId: string | null;
  toLabelId: string;
  targetId: string;
  success: boolean;
  /** The target's label may answer until this tick (included), once. */
  replyBy: number;
  reply: { speakerId: string | null; success: boolean } | null;
}

const confsOf = (world: World): PressConf[] => (world.pressConfs ??= []);

const news = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text: text[0]!.toUpperCase() + text.slice(1) }];
};

const communityStars = (world: World, labelId: string): number =>
  (world.staff?.[labelId] ?? []).find((m) => m.role === 'community')?.stars ?? 0;

/** Chance the speaker (or the boss, null) gets the target. */
export const pressOdds = (world: World, labelId: string, speaker: Artist | null, target: Artist): number => {
  const media = speaker ? speaker.attrs.medias : WARS.bossMedia;
  const hype = speaker ? speaker.hype : 0;
  return clamp(
    WARS.base + (media - 50) * WARS.perMedia + (hype - target.hype) * WARS.perHype + WARS.perStar * communityStars(world, labelId),
    WARS.minOdds,
    WARS.maxOdds,
  );
};

const bumpHype = (artist: Artist | null | undefined, n: number): void => {
  if (artist) artist.hype = clamp(artist.hype + n, 0, 100);
};

const speakerOf = (world: World, label: Label, speakerId: string | null): Artist | null => {
  if (speakerId === null) return null;
  const artist = world.artists[speakerId];
  if (!artist || contractOf(world, speakerId)?.labelId !== label.id) return fail('Cet artiste n’est pas dans ton label.');
  return artist;
};

const nameOf = (world: World, label: Label, speaker: Artist | null): string => speaker?.name ?? `le patron de ${label.name}`;

export const pressUsed = (world: World, labelId: string): boolean => confsOf(world).some((c) => c.fromLabelId === labelId && c.tick === world.tick);

export const pressConference = (world: World, label: Label, speakerId: string | null, targetId: string): PressConf => {
  if (pressUsed(world, label.id)) fail('Une conférence de presse par semaine : reviens la semaine prochaine.');
  const target = world.artists[targetId] ?? fail('Artiste introuvable.');
  const toLabelId = contractOf(world, targetId)?.labelId;
  const toLabel = toLabelId ? world.labels[toLabelId] : undefined;
  if (!toLabel || toLabel.kind !== 'player' || toLabel.bankrupt) return fail('On ne vise que les artistes des autres joueurs.');
  if (toLabel.id === label.id) fail('Tu ne vas pas descendre ton propre artiste.');
  checkTarget(world, label, toLabel.id);
  const boost = enemyBoost(world, label.id, toLabel.id);
  const speaker = speakerOf(world, label, speakerId);
  const success = rngFor(world.seed, world.tick, `press:${label.id}`).chance(pressOdds(world, label.id, speaker, target));
  if (success) {
    bumpHype(target, -Math.round(WARS.hit * boost));
    bumpHype(speaker, Math.round(WARS.gain * boost));
  } else {
    label.reputation = clamp(label.reputation - WARS.failReputation, 0, 100);
    bumpHype(speaker, -WARS.failHype);
  }
  const conf: PressConf = {
    id: `press_${world.nextId++}`,
    tick: world.tick,
    fromLabelId: label.id,
    speakerId,
    toLabelId: toLabel.id,
    targetId,
    success,
    replyBy: world.tick + 1,
    reply: null,
  };
  confsOf(world).push(conf);
  const who = nameOf(world, label, speaker);
  news(
    world,
    success
      ? `Conférence de presse : ${who} descend ${target.name} (${toLabel.name}). Ça fait mal.`
      : `Conférence de presse : ${who} s’en prend à ${target.name} (${toLabel.name})… et se ridiculise.`,
  );
  return conf;
};

export const replyPress = (world: World, label: Label, confId: string, speakerId: string | null): void => {
  const conf = confsOf(world).find((c) => c.id === confId) ?? fail('Conférence introuvable.');
  if (conf.toLabelId !== label.id) fail('Cette conférence ne te visait pas.');
  if (conf.reply) fail('Tu as déjà répondu.');
  if (world.tick > conf.replyBy) fail('Trop tard pour répondre.');
  const target = world.artists[conf.targetId];
  const attacker = conf.speakerId ? world.artists[conf.speakerId] : undefined;
  const speaker = speakerOf(world, label, speakerId);
  // The answer is aimed at the one who talked; against the boss, at his label's best-known artist.
  const aim = attacker ?? rosterOf(world, conf.fromLabelId).sort((a, b) => b.hype - a.hype)[0];
  const odds = aim ? pressOdds(world, label.id, speaker, aim) : WARS.base;
  const success = rngFor(world.seed, world.tick, `press-reply:${conf.id}`).chance(odds);
  conf.reply = { speakerId, success };
  const from = world.labels[conf.fromLabelId];
  if (success) {
    // Cancel what the conference did, and the target comes out on top.
    if (conf.success) {
      const boost = enemyBoost(world, conf.fromLabelId, conf.toLabelId);
      bumpHype(target, Math.round(WARS.hit * boost));
      bumpHype(attacker, -Math.round(WARS.gain * boost));
    }
    bumpHype(target, WARS.replyGain);
    news(world, `${nameOf(world, label, speaker)} répond à ${from?.name ?? 'l’attaque'} : retour à l’envoyeur, ${target?.name ?? 'son artiste'} sort grandi.`);
  } else {
    news(world, `${nameOf(world, label, speaker)} tente de répondre à ${from?.name ?? 'l’attaque'}… personne n’écoute.`);
  }
};

/* ---------------------------------- Chart duel ---------------------------------- */

export type DuelStatus = 'asked' | 'accepted' | 'done' | 'fled' | 'void';

export interface Duel {
  id: string;
  fromLabelId: string;
  toLabelId: string;
  fromArtistId: string;
  toArtistId: string | null;
  /** The release week. */
  week: number;
  askedTick: number;
  status: DuelStatus;
  /** First-week streams of each side's best song that week, once known. */
  fromStreams: number | null;
  toStreams: number | null;
  fromSong: string | null;
  toSong: string | null;
  winnerLabelId: string | null;
  stolenFans: number;
  doneTick: number | null;
}

const duelsOf = (world: World): Duel[] => (world.duels ??= []);
const isOpen = (d: Duel): boolean => d.status === 'asked' || d.status === 'accepted';

const record = (label: Label | undefined, key: 'duelWins' | 'duelLosses' | 'duelFled'): void => {
  if (label) label.stats[key] = (label.stats[key] ?? 0) + 1;
};

export const askDuel = (world: World, label: Label, targetLabelId: string, artistId: string, week: number): Duel => {
  const target = world.labels[targetLabelId];
  if (!target || target.kind !== 'player' || target.bankrupt || target.id === label.id) return fail('Tu ne peux défier qu’un autre joueur.');
  if (rosterOf(world, target.id).length === 0) fail('Ce label n’a pas d’artiste.');
  checkTarget(world, label, target.id);
  speakerOf(world, label, artistId);
  if (!Number.isInteger(week) || week < world.tick + WARS.minWeeks || week > world.tick + WARS.maxWeeks)
    fail(`Choisis une semaine entre ${WARS.minWeeks} et ${WARS.maxWeeks} semaines d’ici.`);
  const open = duelsOf(world).filter((d) => isOpen(d) && (d.fromLabelId === label.id || d.toLabelId === label.id));
  if (open.length >= WARS.maxOpenPerLabel) fail(`${WARS.maxOpenPerLabel} duels en cours au plus.`);
  if (open.some((d) => d.fromLabelId === target.id || d.toLabelId === target.id)) fail(`Tu as déjà un duel en cours avec ${target.name}.`);
  const duel: Duel = {
    id: `duel_${world.nextId++}`,
    fromLabelId: label.id,
    toLabelId: target.id,
    fromArtistId: artistId,
    toArtistId: null,
    week,
    askedTick: world.tick,
    status: 'asked',
    fromStreams: null,
    toStreams: null,
    fromSong: null,
    toSong: null,
    winnerLabelId: null,
    stolenFans: 0,
    doneTick: null,
  };
  duelsOf(world).push(duel);
  news(world, `${label.name} défie ${target.name} en guerre de charts, la semaine ${week + 1}.`);
  return duel;
};

/** A smaller label refusing a bigger one keeps its honour. */
const flee = (world: World, duel: Duel, why: string): void => {
  const from = world.labels[duel.fromLabelId];
  const to = world.labels[duel.toLabelId];
  duel.status = 'fled';
  duel.doneTick = world.tick;
  if (!to) return;
  if (from && to.tier < from.tier) {
    news(world, `${to.name} ne relève pas le défi de ${from.name}${why}. Pas de honte : ${from.name} est plus gros.`);
    return;
  }
  to.reputation = clamp(to.reputation - WARS.fleeReputation, 0, 100);
  record(to, 'duelFled');
  news(world, `${to.name} a fui le duel contre ${from?.name ?? '?'}${why}.`);
};

export const answerDuel = (world: World, label: Label, duelId: string, accept: boolean, artistId: string | null): void => {
  const duel = duelsOf(world).find((d) => d.id === duelId) ?? fail('Duel introuvable.');
  if (duel.toLabelId !== label.id) fail('Ce duel ne t’est pas adressé.');
  if (duel.status !== 'asked') fail('Ce duel a déjà une réponse.');
  if (!accept) {
    flee(world, duel, '');
    return;
  }
  if (!artistId) return fail('Choisis ton artiste pour le duel.');
  speakerOf(world, label, artistId);
  duel.toArtistId = artistId;
  duel.status = 'accepted';
  const from = world.labels[duel.fromLabelId];
  news(world, `Duel accepté : ${world.artists[duel.fromArtistId]?.name ?? '?'} (${from?.name ?? '?'}) contre ${world.artists[artistId]?.name ?? '?'} (${label.name}), semaine ${duel.week + 1}.`);
};

/** Best first-week streams of the artist's songs out this week for this label. */
const bestRelease = (world: World, labelId: string, artistId: string | null): { id: string; streams: number } | null => {
  if (!artistId) return null;
  const songs = world.songs.filter((s) => s.labelId === labelId && s.artistId === artistId && s.state === 'released' && s.releaseTick === world.tick);
  const best = songs.sort((a, b) => b.streamsLast - a.streamsLast)[0];
  return best ? { id: best.id, streams: best.streamsLast } : null;
};

/**
 * After the releases of the week: unanswered duels time out (shame), and duels of this week are settled on the
 * first-week streams. newFans: the new fans each released song brought this week.
 */
export const tickDuels = (world: World, newFans: Record<string, number>, tell: (labelId: string, text: string) => void): void => {
  for (const duel of duelsOf(world)) {
    if (duel.status === 'asked' && world.tick >= duel.askedTick + WARS.answerWeeks) {
      flee(world, duel, ' (pas de réponse en 2 semaines)');
      tell(duel.toLabelId, `Tu n’as pas répondu au duel de ${world.labels[duel.fromLabelId]?.name ?? '?'} : il compte comme refusé.`);
      continue;
    }
    if (duel.status !== 'accepted' || duel.week !== world.tick) continue;
    const from = world.labels[duel.fromLabelId];
    const to = world.labels[duel.toLabelId];
    // An artist who left his label in the meantime: his side has nothing.
    const a = contractOf(world, duel.fromArtistId)?.labelId === duel.fromLabelId ? bestRelease(world, duel.fromLabelId, duel.fromArtistId) : null;
    const b = duel.toArtistId && contractOf(world, duel.toArtistId)?.labelId === duel.toLabelId ? bestRelease(world, duel.toLabelId, duel.toArtistId) : null;
    duel.fromStreams = a?.streams ?? null;
    duel.toStreams = b?.streams ?? null;
    duel.fromSong = a?.id ?? null;
    duel.toSong = b?.id ?? null;
    duel.doneTick = world.tick;
    if (!a && !b) {
      duel.status = 'void';
      news(world, `Duel ${from?.name ?? '?'} contre ${to?.name ?? '?'} : aucun des deux n’a sorti de son. Match nul.`);
      continue;
    }
    duel.status = 'done';
    const fromWins = (a?.streams ?? -1) >= (b?.streams ?? -1);
    const winLabel = fromWins ? from : to;
    const loseLabel = fromWins ? to : from;
    const winner = world.artists[fromWins ? duel.fromArtistId : (duel.toArtistId ?? '')];
    const loser = world.artists[fromWins ? (duel.toArtistId ?? '') : duel.fromArtistId];
    const loserSong = fromWins ? b : a;
    duel.winnerLabelId = winLabel?.id ?? null;
    // 10 % of the new fans the loser's song brought, taken from him (none if he did not release).
    const boost = enemyBoost(world, duel.fromLabelId, duel.toLabelId);
    const stolen = loserSong && loser ? Math.min(loser.fans, Math.round((newFans[loserSong.id] ?? 0) * WARS.fanShare * boost)) : 0;
    duel.stolenFans = stolen;
    if (winner) {
      winner.hype = clamp(winner.hype + Math.round(WARS.winHype * boost), 0, 100);
      winner.fans += stolen;
    }
    if (loser) {
      loser.hype = clamp(loser.hype - WARS.loseHype, 0, 100);
      loser.fans -= stolen;
    }
    if (winLabel) winLabel.reputation = clamp(winLabel.reputation + WARS.winReputation, 0, 100);
    record(winLabel, 'duelWins');
    record(loseLabel, 'duelLosses');
    const [best, worst] = fromWins ? [a?.streams ?? 0, b?.streams ?? 0] : [b?.streams ?? 0, a?.streams ?? 0];
    const score = `${best.toLocaleString('fr-FR')} contre ${worst.toLocaleString('fr-FR')} streams`;
    const forfeit = !loserSong ? ' (l’autre n’a rien sorti)' : '';
    news(world, `Guerre de charts : ${winLabel?.name ?? '?'} bat ${loseLabel?.name ?? '?'}, ${score}${forfeit}.`);
    if (winLabel) tell(winLabel.id, `Duel gagné contre ${loseLabel?.name ?? '?'}${forfeit} : buzz +${WARS.winHype}, réputation +${WARS.winReputation}${stolen > 0 ? `, ${stolen.toLocaleString('fr-FR')} fans pris` : ''}.`);
    if (loseLabel) tell(loseLabel.id, `Duel perdu contre ${winLabel?.name ?? '?'} : buzz −${WARS.loseHype}${stolen > 0 ? `, ${stolen.toLocaleString('fr-FR')} fans perdus` : ''}.`);
  }
  world.duels = duelsOf(world).filter((d) => isOpen(d) || world.tick - (d.doneTick ?? world.tick) <= WARS.keepWeeks);
  world.pressConfs = confsOf(world).filter((c) => world.tick - c.tick <= WARS.keepWeeks);
};

/* ---------------------------------- Views ---------------------------------- */

export interface PressView {
  used: boolean;
  /** Artists of the other players one can go after, with the odds of each of your speakers. */
  targets: Array<{ id: string; name: string; label: string; hype: number; odds: Array<{ speakerId: string | null; name: string; odds: number }> }>;
  /** Conferences against you that you can still answer. */
  toAnswer: Array<{ id: string; from: string; speaker: string; target: string; success: boolean }>;
  /** The last conferences that involve you. */
  recent: Array<{ text: string }>;
}

export const pressView = (world: World, label: Label): PressView => {
  const targets = Object.values(world.labels)
    .filter((l) => l.kind === 'player' && !l.bankrupt && l.id !== label.id && (label.enemies ?? []).includes(l.id))
    .flatMap((l) =>
      rosterOf(world, l.id).map((a) => ({
        id: a.id,
        name: a.name,
        label: l.name,
        hype: Math.round(a.hype),
        odds: [
          { speakerId: null, name: 'Toi (le patron)', odds: pressOdds(world, label.id, null, a) },
          ...rosterOf(world, label.id).map((s) => ({ speakerId: s.id, name: s.name, odds: pressOdds(world, label.id, s, a) })),
        ],
      })),
    );
  const mine = confsOf(world).filter((c) => c.fromLabelId === label.id || c.toLabelId === label.id);
  return {
    used: pressUsed(world, label.id),
    targets,
    toAnswer: mine
      .filter((c) => c.toLabelId === label.id && !c.reply && world.tick <= c.replyBy)
      .map((c) => {
        const from = world.labels[c.fromLabelId];
        return {
          id: c.id,
          from: from?.name ?? '?',
          speaker: c.speakerId ? (world.artists[c.speakerId]?.name ?? '?') : 'le patron',
          target: world.artists[c.targetId]?.name ?? '?',
          success: c.success,
        };
      }),
    recent: mine
      .slice(-5)
      .reverse()
      .map((c) => {
        const sent = c.fromLabelId === label.id;
        const target = world.artists[c.targetId]?.name ?? '?';
        const other = world.labels[sent ? c.toLabelId : c.fromLabelId]?.name ?? '?';
        const result = sent ? (c.success ? `tu as descendu ${target}` : `ta conférence contre ${target} a raté`) : c.success ? `${other} a descendu ${target}` : `${other} a raté sa conférence contre ${target}`;
        const reply = c.reply ? (c.reply.success ? ' · riposte réussie' : ' · riposte ratée') : '';
        return { text: `Semaine ${c.tick + 1} : ${result}${reply}.` };
      }),
  };
};

export interface DuelView {
  id: string;
  mine: 'sent' | 'received' | null;
  status: DuelStatus;
  fromLabel: string;
  toLabel: string;
  fromArtist: string;
  toArtist: string | null;
  /** Week number shown to players (tick + 1), and weeks until it. */
  week: number;
  weeksLeft: number;
  answerLeft: number;
  fromStreams: number | null;
  toStreams: number | null;
  fromSong: string | null;
  toSong: string | null;
  winner: string | null;
  stolenFans: number;
}

const songTitle = (world: World, id: string | null): string | null => (id ? (world.songs.find((s) => s.id === id)?.title ?? null) : null);

/** Every duel of the server (live in the Charts), yours first. */
export const duelsView = (world: World, labelId: string | null): DuelView[] =>
  duelsOf(world)
    .map((d) => ({
      id: d.id,
      mine: d.fromLabelId === labelId ? ('sent' as const) : d.toLabelId === labelId ? ('received' as const) : null,
      status: d.status,
      fromLabel: world.labels[d.fromLabelId]?.name ?? '?',
      toLabel: world.labels[d.toLabelId]?.name ?? '?',
      fromArtist: world.artists[d.fromArtistId]?.name ?? '?',
      toArtist: d.toArtistId ? (world.artists[d.toArtistId]?.name ?? '?') : null,
      week: d.week + 1,
      weeksLeft: Math.max(0, d.week - world.tick),
      answerLeft: Math.max(0, d.askedTick + WARS.answerWeeks - world.tick),
      fromStreams: d.fromStreams,
      toStreams: d.toStreams,
      fromSong: songTitle(world, d.fromSong),
      toSong: songTitle(world, d.toSong),
      winner: d.winnerLabelId ? (world.labels[d.winnerLabelId]?.name ?? null) : null,
      stolenFans: d.stolenFans,
    }))
    .sort((a, b) => Number(b.mine !== null) - Number(a.mine !== null) || Number(isOpenView(b)) - Number(isOpenView(a)));

const isOpenView = (d: DuelView): boolean => d.status === 'asked' || d.status === 'accepted';

