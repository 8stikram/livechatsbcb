// The Festival du Serveur (docs/melody-tycoon/05-contrats-marche-labels.md, 5.10): every 7 weeks, for the whole
// party. Registrations open 4 weeks before. Three stages: the headliner (1 place, a visible auction, the money is
// held while you lead and given back when someone outbids you), the main stage (the 4 biggest registered artists)
// and the discovery stage (8 artists under 100 000 fans, drawn if too many). Each label sends 3 artists at most.
// Empty places go to the artists of the game labels. On the day each artist plays, gets a note, a fee, fans and
// buzz; the best note wins the Prix du public (+3 reputation and a line in the palmarès). An artist on strike,
// too tired or gone from the label cancels: fees lost and reputation −1.
import { contractOf, rosterOf } from './economy.ts';
import { clamp, rngFor } from './rng.ts';
import { skillLevel } from './skills.ts';
import type { Artist, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type Stage = 'head' | 'main' | 'discovery';

export const FESTIVAL = {
  every: 7,
  /** Registrations open this many weeks before the show. */
  openWeeks: 4,
  perLabel: 3,
  places: { head: 1, main: 4, discovery: 8 } as Record<Stage, number>,
  /** Main stage fee: this much per tier of the label. Discovery: flat. */
  mainFee: 3_000,
  discoveryFee: 500,
  discoveryMaxFans: 100_000,
  /** Headliner auction: starts at this much per average tier of the party; smallest raise. */
  headStart: 10_000,
  stepShare: 0.05,
  stepMin: 100,
  maxBid: 1e9,
  /** Share of the ticket sales paid to each stage, but never more than this much per fan of the artist. */
  feeShare: { head: 0.3, main: 0.08, discovery: 0 } as Record<Stage, number>,
  feePerFan: { head: 0.5, main: 0.2, discovery: 0 } as Record<Stage, number>,
  /** Fans won from the crowd: this share of it, times the note. */
  reach: { head: 0.05, main: 0.03, discovery: 0.02 } as Record<Stage, number>,
  /** Simulated crowd: this share of the line-up's fans, between these bounds; ticket price. */
  crowdShare: 0.01,
  crowdMin: 5_000,
  crowdMax: 120_000,
  ticket: 20,
  energy: 15,
  minEnergy: 20,
  /** Note = scene × 0.5 + buzz × 0.2 + energy × 0.1 + draw (0 to 20) + 5 per level of Bête de scène. */
  stageBonus: 5,
  /** Fans won: note / 2000 of his fans, at most 5 %, and a share of the crowd. */
  fanCap: 0.05,
  badNote: 40,
  badHype: 5,
  prizeReputation: 3,
  cancelReputation: 1,
  keep: 12,
} as const;

export interface FestivalEntry {
  labelId: string;
  artistId: string;
  stage: Stage;
  /** What the label paid (fee or held bid). */
  paid: number;
}

export interface Festival {
  number: number;
  /** The week of the show. */
  tick: number;
  entries: FestivalEntry[];
  /** Players outbid on the headliner since last week, to tell them. */
  outbid: string[];
}

export interface FestivalAct {
  artistId: string;
  artistName: string;
  labelId: string;
  labelName: string;
  player: boolean;
  stage: Stage;
  note: number;
  fee: number;
  fans: number;
  hype: number;
  /** Cancelled on the day: no note. */
  cancelled: boolean;
}

export interface FestivalResult {
  number: number;
  tick: number;
  crowd: number;
  /** In the order of the show: discovery, main stage, headliner. */
  acts: FestivalAct[];
  prize: { artistId: string; labelId: string } | null;
}

const news = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text: text[0]!.toUpperCase() + text.slice(1) }];
};

/** The next show week, strictly after this week when the show of this week is already over. */
export const nextFestivalTick = (tick: number): number => (Math.floor(tick / FESTIVAL.every) + 1) * FESTIVAL.every;

const isOpenWeek = (tick: number): boolean => nextFestivalTick(tick) - tick <= FESTIVAL.openWeeks;

const playersOf = (world: World): Label[] => Object.values(world.labels).filter((l) => l.kind === 'player' && !l.bankrupt);

const avgTier = (world: World): number => {
  const players = playersOf(world);
  return players.length ? Math.max(1, Math.round(players.reduce((s, l) => s + l.tier, 0) / players.length)) : 1;
};

export const headStart = (world: World): number => FESTIVAL.headStart * avgTier(world);

export const mainFee = (label: Label): number => FESTIVAL.mainFee * Math.max(1, label.tier);

/** Opens the festival of the coming show once registrations start. */
export const currentFestival = (world: World): Festival | null => {
  const f = world.festival;
  if (f && f.tick > world.tick) return f;
  return null;
};

const ensureFestival = (world: World): Festival => {
  const open = currentFestival(world);
  if (open) return open;
  if (!isOpenWeek(world.tick)) return fail('Les inscriptions au festival ne sont pas ouvertes.');
  const number = (world.festivals?.length ? world.festivals[world.festivals.length - 1]!.number : 0) + 1;
  world.festival = { number, tick: nextFestivalTick(world.tick), entries: [], outbid: [] };
  return world.festival;
};

export const bestHeadBid = (f: Festival): FestivalEntry | undefined =>
  f.entries.filter((e) => e.stage === 'head').sort((a, b) => b.paid - a.paid)[0];

export const nextHeadBid = (world: World, f: Festival): number => {
  const best = bestHeadBid(f);
  if (!best) return headStart(world);
  return best.paid + Math.max(FESTIVAL.stepMin, Math.round(best.paid * FESTIVAL.stepShare));
};

const checkArtist = (world: World, label: Label, f: Festival, artistId: string): Artist => {
  const artist = world.artists[artistId] ?? fail('Artiste introuvable.');
  if (contractOf(world, artistId)?.labelId !== label.id) fail('Cet artiste n’est pas dans ton label.');
  if (f.entries.some((e) => e.artistId === artistId && (e.stage !== 'head' || e.labelId === label.id))) fail(`${artist.name} est déjà inscrit.`);
  const mine = new Set(f.entries.filter((e) => e.labelId === label.id).map((e) => e.artistId));
  if (mine.size >= FESTIVAL.perLabel) fail(`${FESTIVAL.perLabel} artistes au plus par label.`);
  return artist;
};

/** Registers an artist on the main stage or the discovery stage: the fee is paid now, given back if he is not picked. */
export const registerFestival = (world: World, label: Label, artistId: string, stage: Stage): void => {
  if (stage === 'head') return fail('La tête d’affiche se gagne aux enchères.');
  const f = ensureFestival(world);
  const artist = checkArtist(world, label, f, artistId);
  if (stage === 'discovery' && artist.fans >= FESTIVAL.discoveryMaxFans) fail('La scène découverte est pour les artistes de moins de 100 000 fans.');
  const fee = stage === 'main' ? mainFee(label) : FESTIVAL.discoveryFee;
  if (label.cash < fee) fail('Pas assez d’argent pour l’inscription.');
  label.cash -= fee;
  f.entries.push({ labelId: label.id, artistId, stage, paid: fee });
};

/** Takes an artist back before the show: the fee is given back. */
export const withdrawFestival = (world: World, label: Label, artistId: string): void => {
  const f = currentFestival(world) ?? fail('Pas de festival en cours.');
  const entry = f.entries.find((e) => e.labelId === label.id && e.artistId === artistId && e.stage !== 'head');
  if (!entry) return fail('Cet artiste n’est pas inscrit.');
  label.cash += entry.paid;
  f.entries = f.entries.filter((e) => e !== entry);
};

/** Bids for the headliner place: the bid is held, and given back when someone bids more. */
export const bidHeadliner = (world: World, label: Label, artistId: string, amount: number): void => {
  const f = ensureFestival(world);
  const best = bestHeadBid(f);
  if (best?.labelId === label.id) fail('Tu as déjà la meilleure offre.');
  const old = f.entries.find((e) => e.stage === 'head' && e.labelId === label.id);
  if (old) f.entries = f.entries.filter((e) => e !== old);
  try {
    checkArtist(world, label, f, artistId);
  } catch (error) {
    if (old) f.entries.push(old);
    throw error;
  }
  if (old) f.entries.push(old);
  const min = nextHeadBid(world, f);
  if (!Number.isFinite(amount) || amount < min) fail(`Offre trop basse : au moins ${min.toLocaleString('fr-FR')} €.`);
  if (amount > FESTIVAL.maxBid) fail('Offre trop haute.');
  if (label.cash < amount) fail('Pas assez d’argent pour cette offre.');
  // Only the best bid is held: every other one goes back to its label.
  for (const e of f.entries.filter((x) => x.stage === 'head')) {
    const owner = world.labels[e.labelId];
    if (owner) owner.cash += e.paid;
    if (e.labelId !== label.id && !f.outbid.includes(e.labelId)) f.outbid.push(e.labelId);
  }
  f.entries = f.entries.filter((e) => e.stage !== 'head');
  label.cash -= Math.round(amount);
  f.entries.push({ labelId: label.id, artistId, stage: 'head', paid: Math.round(amount) });
  news(world, `${label.name} prend la tête des enchères pour la tête d’affiche du Festival du Serveur (${Math.round(amount).toLocaleString('fr-FR')} €).`);
};

const npcPool = (world: World, taken: Set<string>): Artist[] =>
  Object.values(world.artists).filter((a) => {
    if (taken.has(a.id)) return false;
    const c = contractOf(world, a.id);
    return !!c && world.labels[c.labelId]?.kind === 'npc';
  });

const power = (a: Artist): number => a.fans * (1 + a.hype / 100);

const canPlay = (world: World, e: FestivalEntry): boolean => {
  const artist = world.artists[e.artistId];
  return !!artist && contractOf(world, e.artistId)?.labelId === e.labelId && !artist.onStrike && artist.energy >= FESTIVAL.minEnergy;
};

/** The week of the show: line-up, shows, results, fees, fans, buzz and the Prix du public. */
export const runFestival = (world: World, pay: (labelId: string, amount: number) => void, tell: (labelId: string, text: string) => void): void => {
  const f = world.festival;
  if (!f || f.tick !== world.tick) {
    // No player registered: the festival still happens with the labels of the game.
    if (world.tick % FESTIVAL.every !== 0 || world.tick === 0) return;
  }
  const festival: Festival = f && f.tick === world.tick ? f : { number: (world.festivals?.at(-1)?.number ?? 0) + 1, tick: world.tick, entries: [], outbid: [] };
  world.festival = undefined;
  const rng = rngFor(world.seed, world.tick, 'festival');
  const lineup: Array<{ e: FestivalEntry; npc: boolean }> = [];
  const head = bestHeadBid(festival);
  if (head) lineup.push({ e: head, npc: false });
  const main = festival.entries.filter((e) => e.stage === 'main').sort((a, b) => power(world.artists[b.artistId]!) - power(world.artists[a.artistId]!));
  for (const e of main.slice(0, FESTIVAL.places.main)) lineup.push({ e, npc: false });
  const disc = festival.entries.filter((e) => e.stage === 'discovery');
  const drawn = disc.length > FESTIVAL.places.discovery ? [...disc].sort(() => rng.next() - 0.5).slice(0, FESTIVAL.places.discovery) : disc;
  for (const e of drawn) lineup.push({ e, npc: false });
  // Registered but not picked: the fee goes back.
  for (const e of festival.entries.filter((x) => x.stage !== 'head' && !lineup.some((l) => l.e === x))) {
    pay(e.labelId, e.paid);
    tell(e.labelId, `${world.artists[e.artistId]?.name ?? 'Ton artiste'} n’a pas été retenu au festival : l’inscription t’est rendue.`);
  }
  // The labels of the game fill the empty places.
  const taken = new Set(lineup.map((l) => l.e.artistId));
  const pool = npcPool(world, taken).sort((a, b) => power(b) - power(a));
  const fill = (stage: Stage, from: Artist[]): void => {
    const missing = FESTIVAL.places[stage] - lineup.filter((l) => l.e.stage === stage).length;
    for (const a of from.filter((x) => !taken.has(x.id)).slice(0, Math.max(0, missing))) {
      taken.add(a.id);
      lineup.push({ e: { labelId: contractOf(world, a.id)!.labelId, artistId: a.id, stage, paid: 0 }, npc: true });
    }
  };
  fill('head', pool);
  fill('main', pool.slice(1));
  fill('discovery', pool.filter((a) => a.fans < FESTIVAL.discoveryMaxFans).sort(() => rng.next() - 0.5));
  const order: Stage[] = ['discovery', 'main', 'head'];
  lineup.sort((a, b) => order.indexOf(a.e.stage) - order.indexOf(b.e.stage));
  const crowd = Math.round(clamp(lineup.reduce((s, l) => s + (world.artists[l.e.artistId]?.fans ?? 0), 0) * FESTIVAL.crowdShare, FESTIVAL.crowdMin, FESTIVAL.crowdMax));
  const tickets = crowd * FESTIVAL.ticket;
  const acts: FestivalAct[] = [];
  for (const { e, npc } of lineup) {
    const artist = world.artists[e.artistId]!;
    const label = world.labels[e.labelId]!;
    const base = {
      artistId: artist.id, artistName: artist.name, labelId: label.id, labelName: label.name, player: !npc, stage: e.stage,
    };
    if (!npc && !canPlay(world, e)) {
      label.reputation = clamp(label.reputation - FESTIVAL.cancelReputation, 0, 100);
      acts.push({ ...base, note: 0, fee: 0, fans: 0, hype: 0, cancelled: true });
      news(world, `${artist.name} (${label.name}) a annulé son concert au Festival du Serveur.`);
      tell(label.id, `${artist.name} n’a pas pu jouer au festival (grève, fatigue ou départ) : inscription perdue, réputation −${FESTIVAL.cancelReputation}.`);
      continue;
    }
    const note = Math.round(clamp(
      artist.attrs.scene * 0.5 + artist.hype * 0.2 + artist.energy * 0.1 + rng.range(0, 20) + FESTIVAL.stageBonus * skillLevel(artist, 'stage'),
      0,
      100,
    ));
    const fee = Math.round(Math.min(tickets * FESTIVAL.feeShare[e.stage], artist.fans * FESTIVAL.feePerFan[e.stage]));
    const fans = Math.round(artist.fans * Math.min(FESTIVAL.fanCap, note / 2000) + crowd * FESTIVAL.reach[e.stage] * (note / 100));
    const hype = note < FESTIVAL.badNote ? -FESTIVAL.badHype : Math.round(5 + ((note - FESTIVAL.badNote) / (100 - FESTIVAL.badNote)) * 10);
    if (!npc) {
      artist.fans += fans;
      artist.hype = clamp(artist.hype + hype, 0, 100);
      artist.energy = clamp(artist.energy - FESTIVAL.energy, 0, 100);
      if (fee > 0) pay(label.id, fee);
      const where = e.stage === 'head' ? 'en tête d’affiche' : e.stage === 'main' ? 'sur la scène principale' : 'sur la scène découverte';
      tell(label.id, `Festival : ${artist.name} a joué ${where}. Note ${note}/100, ${fee > 0 ? `cachet ${fee.toLocaleString('fr-FR')} €, ` : ''}+${fans.toLocaleString('fr-FR')} fans, buzz ${hype >= 0 ? '+' : ''}${hype}.`);
      if (note < FESTIVAL.badNote) news(world, `${artist.name} a raté son concert au festival. Le public a surtout applaudi la buvette.`);
    }
    acts.push({ ...base, note, fee, fans, hype, cancelled: false });
  }
  // The Prix du public goes to the best artist of a player; without one, to the best of the day.
  const played = acts.filter((a) => !a.cancelled).sort((a, b) => b.note - a.note);
  const best = played.find((a) => a.player) ?? played[0];
  const prize = best ? { artistId: best.artistId, labelId: best.labelId } : null;
  if (best) {
    const label = world.labels[best.labelId]!;
    if (best.player) {
      label.reputation = clamp(label.reputation + FESTIVAL.prizeReputation, 0, 100);
      tell(label.id, `${best.artistName} gagne le Prix du public du festival ! Réputation +${FESTIVAL.prizeReputation}, une ligne de plus au palmarès.`);
    }
    news(world, `Festival du Serveur n°${festival.number} : Prix du public pour ${best.artistName} (${best.labelName}), ${best.note}/100.`);
  }
  world.festivals = [...(world.festivals ?? []), { number: festival.number, tick: world.tick, crowd, acts, prize }].slice(-FESTIVAL.keep);
};

/** Each week: opens registrations, warns the outbid, and plays the show on its week. */
export const tickFestival = (world: World, pay: (labelId: string, amount: number) => void, tell: (labelId: string, text: string) => void): void => {
  if (world.tick > 0 && world.tick % FESTIVAL.every === 0) {
    runFestival(world, pay, tell);
    return;
  }
  const f = currentFestival(world);
  if (f) {
    for (const id of f.outbid) {
      if (bestHeadBid(f)?.labelId !== id) tell(id, 'On t’a dépassé aux enchères pour la tête d’affiche du festival : ton argent t’est rendu. Tu peux surenchérir.');
    }
    f.outbid = [];
  }
  if (nextFestivalTick(world.tick) - world.tick === FESTIVAL.openWeeks && !f) {
    const number = (world.festivals?.at(-1)?.number ?? 0) + 1;
    world.festival = { number, tick: nextFestivalTick(world.tick), entries: [], outbid: [] };
    news(world, `Festival du Serveur n°${number} dans ${FESTIVAL.openWeeks} semaines : les inscriptions sont ouvertes !`);
  }
};

/** How many Prix du public a label won. */
export const festivalPrizes = (world: World, labelId: string): number =>
  (world.festivals ?? []).filter((r) => r.prize?.labelId === labelId).length;

export interface FestivalView {
  /** The coming festival: open (registrations) or not yet. */
  number: number;
  tick: number;
  weeksLeft: number;
  open: boolean;
  headStart: number;
  nextHeadBid: number;
  head: { artistName: string; labelName: string; amount: number; mine: boolean } | null;
  mainFee: number;
  discoveryFee: number;
  perLabel: number;
  places: Record<Stage, number>;
  entries: Array<{ artistId: string; artistName: string; labelName: string; stage: Stage; mine: boolean; fans: number }>;
  /** My artists who can still register, with where they can go. */
  candidates: Array<{ id: string; name: string; fans: number; scene: number; energy: number; discovery: boolean; tired: boolean; strike: boolean }>;
  myCount: number;
  /** The last results, kept a few weeks for the poster and the live reveal. */
  last: (FestivalResult & { weeksAgo: number }) | null;
}

export const festivalView = (world: World, label: Label | undefined): FestivalView => {
  const f = currentFestival(world);
  const tick = f?.tick ?? nextFestivalTick(world.tick);
  const number = f?.number ?? (world.festivals?.at(-1)?.number ?? 0) + 1;
  const head = f ? bestHeadBid(f) : undefined;
  const entries = (f?.entries ?? []).filter((e) => e.stage !== 'head').map((e) => ({
    artistId: e.artistId,
    artistName: world.artists[e.artistId]?.name ?? '?',
    labelName: world.labels[e.labelId]?.name ?? '?',
    stage: e.stage,
    mine: e.labelId === label?.id,
    fans: world.artists[e.artistId]?.fans ?? 0,
  }));
  if (head) entries.unshift({ artistId: head.artistId, artistName: world.artists[head.artistId]?.name ?? '?', labelName: world.labels[head.labelId]?.name ?? '?', stage: 'head', mine: head.labelId === label?.id, fans: world.artists[head.artistId]?.fans ?? 0 });
  const taken = new Set(entries.filter((e) => e.mine).map((e) => e.artistId));
  const last = world.festivals?.at(-1);
  return {
    number,
    tick,
    weeksLeft: tick - world.tick,
    open: isOpenWeek(world.tick),
    headStart: headStart(world),
    nextHeadBid: f ? nextHeadBid(world, f) : headStart(world),
    head: head ? { artistName: world.artists[head.artistId]?.name ?? '?', labelName: world.labels[head.labelId]?.name ?? '?', amount: head.paid, mine: head.labelId === label?.id } : null,
    mainFee: label ? mainFee(label) : FESTIVAL.mainFee,
    discoveryFee: FESTIVAL.discoveryFee,
    perLabel: FESTIVAL.perLabel,
    places: FESTIVAL.places,
    entries,
    candidates: label
      ? rosterOf(world, label.id).filter((a) => !taken.has(a.id)).map((a) => ({
        id: a.id, name: a.name, fans: a.fans, scene: a.attrs.scene, energy: Math.round(a.energy),
        discovery: a.fans < FESTIVAL.discoveryMaxFans, tired: a.energy < FESTIVAL.minEnergy, strike: !!a.onStrike,
      }))
      : [],
    myCount: taken.size,
    last: last && world.tick - last.tick <= 2 ? { ...last, weeksAgo: world.tick - last.tick } : null,
  };
};
