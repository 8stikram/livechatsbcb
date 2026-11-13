// Projects (docs/melody-tycoon/03-creation-de-son.md, formats): an EP or an album gathers songs made in the studio
// and puts them out the same week, with a first-week boost. A deluxe adds songs to an album just out and relaunches it.
import { contractOf } from './economy.ts';
import { priceScale } from './quality.ts';
import { clamp } from './rng.ts';
import { albumBonus } from './skills.ts';
import { judgeRelease } from './letdown.ts';
import { supportBoost } from './support.ts';
import type { Label, Song, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type ProjectKind = 'ep' | 'album';

export const PROJECTS = {
  ep: { name: 'EP', min: 3, max: 6, boost: 1.2, cost: 2_000 },
  album: { name: 'Album', min: 8, max: 16, boost: 1.4, cost: 8_000 },
  deluxe: { min: 3, max: 6, boost: 1.2, cost: 3_000, withinTicks: 10 },
  /** Singles already out that can go on a project. */
  maxSingles: 2,
  /** An album noted this much or more raises the label's reputation. */
  goodAlbum: 75,
  goodAlbumReputation: 3,
  maxWeeksAhead: 8,
  maxPerWorld: 600,
} as const;

export interface Project {
  id: string;
  labelId: string;
  artistId: string;
  kind: ProjectKind;
  title: string;
  songIds: string[];
  cover?: boolean;
  /** The artist signs CDs the week it comes out: more sales, less energy. */
  signing?: boolean;
  state: 'scheduled' | 'released';
  releaseTick: number;
  deluxe?: { songIds: string[]; tick: number; sales?: number; money?: number };
  /** CDs and vinyls sold at release, and what they brought. */
  sales?: number;
  salesMoney?: number;
  cert?: 'gold' | 'platinum';
  /** Average note of the tracks, known at release. */
  quality?: number;
}

const projectsOf = (world: World): Project[] => (world.projects ??= []);

/**
 * CDs and vinyls (owner's choice, 2026-11-13): sold by themselves when an EP or an album comes out, from the fans.
 * An album of an artist with 100 000 fans brings about 8 000 €. An album sells twice an EP; the note, the buzz,
 * a cover, a signing session and the label's support sell more. A deluxe sells about a third of the album.
 */
export const SALES = {
  perFan: 0.0067,
  ep: 0.5,
  price: 12,
  cover: 1.1,
  signing: 1.25,
  signingEnergy: 15,
  deluxe: 1 / 3,
  gold: 2_000,
  platinum: 6_000,
  goldReputation: 2,
  platinumReputation: 4,
} as const;

export interface SalesInput {
  fans: number;
  hype: number;
  kind: ProjectKind;
  quality: number;
  cover: boolean;
  signing: boolean;
  /** The label's support of the artist (1 for an equal share). */
  boost: number;
}

/** Copies sold and money: shared by the release and the estimate of the project maker. */
export const salesQuote = (input: SalesInput): { units: number; money: number } => {
  const note = clamp((input.quality - 30) / 40, 0.25, 1.5);
  const buzz = clamp(1 + (input.hype - 30) / 100, 0.7, 1.6);
  const units = Math.max(
    0,
    Math.round(input.fans * SALES.perFan * (input.kind === 'ep' ? SALES.ep : 1) * note * buzz * (input.cover ? SALES.cover : 1) * (input.signing ? SALES.signing : 1) * input.boost),
  );
  return { units, money: units * SALES.price };
};

const certify = (project: Project, label: Label, artistName: string, tell: (labelId: string, text: string) => void, news: (text: string) => void): void => {
  if (project.cert === 'platinum') return;
  const total = (project.sales ?? 0) + (project.deluxe?.sales ?? 0);
  const cert = total >= SALES.platinum ? 'platinum' : total >= SALES.gold ? 'gold' : null;
  if (!cert || cert === project.cert) return;
  const reputation = cert === 'platinum' ? SALES.platinumReputation : SALES.goldReputation;
  project.cert = cert;
  label.reputation = clamp(label.reputation + reputation, 0, 100);
  const word = cert === 'platinum' ? 'disque de platine' : 'disque d’or';
  tell(label.id, `« ${project.title} » est ${word} : ${total.toLocaleString('fr-FR')} CD et vinyles vendus. Réputation +${reputation}.`);
  news(`${artistName} (${label.name}) : ${word} pour « ${project.title} ».`);
};

/** Mixing, mastering and pressing: small labels pay small-label prices. */
export const projectCost = (kind: ProjectKind | 'deluxe', tier: number): number =>
  Math.round(PROJECTS[kind].cost * tier * priceScale(tier));

const inProject = (world: World, songId: string): boolean =>
  projectsOf(world).some((p) => p.songIds.includes(songId) || p.deluxe?.songIds.includes(songId));

const tracksOf = (world: World, label: Label, artistId: string, songIds: string[]): Song[] => {
  if (new Set(songIds).size !== songIds.length) fail('Un son ne peut pas être deux fois dans le projet.');
  return songIds.map((id) => {
    const song = world.songs.find((s) => s.id === id) ?? fail('Son introuvable.');
    if (song.labelId !== label.id || song.artistId !== artistId) fail(`« ${song.title} » n’est pas un son de cet artiste.`);
    if (song.state === 'scheduled') fail(`« ${song.title} » est déjà programmé.`);
    if (inProject(world, song.id)) fail(`« ${song.title} » est déjà dans un projet.`);
    return song;
  });
};

const artistBusy = (world: World, artistId: string, tick: number): boolean =>
  world.songs.some((s) => s.artistId === artistId && (s.state === 'scheduled' || s.state === 'released') && s.releaseTick === tick);

const schedule = (songs: Song[], tick: number, boost: number, projectId: string): void => {
  for (const song of songs) {
    song.projectId = projectId;
    if (song.state !== 'vault') continue;
    song.state = 'scheduled';
    song.releaseTick = tick;
    song.boost = boost;
    song.marketingIds = [];
    song.marketingCost = 0;
    song.marketingReach = 0;
  }
};

/** Puts an EP or an album together from the artist's songs, and schedules it. */
export const createProject = (
  world: World,
  label: Label,
  request: { artistId: string; kind: ProjectKind; title: string; songIds: string[]; inWeeks: number; cover?: boolean; signing?: boolean },
): Project => {
  const artist = world.artists[request.artistId] ?? fail('Artiste introuvable.');
  if (contractOf(world, artist.id)?.labelId !== label.id) fail(`${artist.name} n'est pas dans ton label.`);
  const rules = PROJECTS[request.kind];
  const title = request.title.trim();
  if (title.length < 1 || title.length > 60) fail('Donne un titre au projet.');
  const songs = tracksOf(world, label, artist.id, request.songIds);
  if (songs.length < rules.min || songs.length > rules.max) fail(`Un ${rules.name} a ${rules.min} à ${rules.max} sons.`);
  const singles = songs.filter((s) => s.state === 'released').length;
  if (singles > PROJECTS.maxSingles) fail(`Au plus ${PROJECTS.maxSingles} sons déjà sortis dans un projet.`);
  if (singles === songs.length) fail('Il faut au moins un son inédit.');
  const weeks = Math.round(request.inWeeks);
  if (weeks < 1 || weeks > PROJECTS.maxWeeksAhead) fail(`Un projet se programme 1 à ${PROJECTS.maxWeeksAhead} semaines à l’avance.`);
  const tick = world.tick + weeks;
  const late = songs.find((s) => s.state === 'vault' && s.availableTick > tick);
  if (late) fail(`« ${late.title} » ne sera pas prêt pour cette semaine.`);
  if (artistBusy(world, artist.id, tick)) fail(`${artist.name} sort déjà un son cette semaine-là.`);
  if (projectsOf(world).length >= PROJECTS.maxPerWorld) fail('Trop de projets sur ce serveur.');
  const cost = projectCost(request.kind, label.tier);
  if (cost > label.cash) fail(`Pas assez de cash : le mix et le pressage coûtent ${cost.toLocaleString('fr-FR')} €.`);
  label.cash -= cost;
  const project: Project = {
    id: `pj${world.nextId}`,
    labelId: label.id,
    artistId: artist.id,
    kind: request.kind,
    title,
    songIds: songs.map((s) => s.id),
    cover: request.cover ? true : undefined,
    signing: request.signing ? true : undefined,
    state: 'scheduled',
    releaseTick: tick,
  };
  world.nextId += 1;
  schedule(songs, tick, rules.boost, project.id);
  projectsOf(world).push(project);
  return project;
};

/** Adds three to six songs to an album out for less than ten weeks, and relaunches it. Once per album. */
export const addDeluxe = (world: World, label: Label, projectId: string, songIds: string[]): void => {
  const project = projectsOf(world).find((p) => p.id === projectId && p.labelId === label.id) ?? fail('Projet introuvable.');
  if (project.kind !== 'album') fail('Seul un album peut avoir une version deluxe.');
  if (project.state !== 'released') fail('L’album doit être sorti.');
  if (project.deluxe) fail('Cet album a déjà sa deluxe.');
  if (world.tick - project.releaseTick >= PROJECTS.deluxe.withinTicks) fail(`Trop tard : une deluxe sort dans les ${PROJECTS.deluxe.withinTicks} semaines après l’album.`);
  const songs = tracksOf(world, label, project.artistId, songIds);
  if (songs.length < PROJECTS.deluxe.min || songs.length > PROJECTS.deluxe.max) fail(`Une deluxe ajoute ${PROJECTS.deluxe.min} à ${PROJECTS.deluxe.max} sons.`);
  if (songs.some((s) => s.state !== 'vault')) fail('La deluxe ne prend que des sons inédits.');
  const tick = world.tick + 1;
  const late = songs.find((s) => s.availableTick > tick);
  if (late) fail(`« ${late.title} » ne sera pas prêt la semaine prochaine.`);
  if (artistBusy(world, project.artistId, tick)) fail('Cet artiste sort déjà un son la semaine prochaine.');
  const cost = projectCost('deluxe', label.tier);
  if (cost > label.cash) fail(`Pas assez de cash : la deluxe coûte ${cost.toLocaleString('fr-FR')} €.`);
  label.cash -= cost;
  schedule(songs, tick, PROJECTS.deluxe.boost, project.id);
  project.deluxe = { songIds: songs.map((s) => s.id), tick };
  // The album starts again from its second week.
  for (const id of project.songIds) {
    const song = world.songs.find((s) => s.id === id);
    if (song?.state === 'released' && song.history && song.history.length > 1) song.streamsLast = Math.max(song.streamsLast, song.history[1] ?? 0);
  }
};

/** Weekly, after the releases: projects out this week get their note, and a good album raises the label. */
export const tickProjects = (
  world: World,
  tell: (labelId: string, text: string) => void,
  news: (text: string) => void,
  pay: (labelId: string, amount: number, artistId: string) => void = () => undefined,
): void => {
  for (const project of world.projects ?? []) {
    // A deluxe out this week: the fans buy the new edition too.
    if (project.state === 'released' && project.deluxe && project.deluxe.tick <= world.tick && project.deluxe.sales === undefined) {
      const label = world.labels[project.labelId];
      const artist = world.artists[project.artistId];
      if (label && artist) {
        const sale = salesQuote({ fans: artist.fans, hype: artist.hype, kind: project.kind, quality: project.quality ?? 0, cover: !!project.cover, signing: false, boost: supportBoost(world, label.id, artist.id, 'sales') });
        project.deluxe.sales = Math.round(sale.units * SALES.deluxe);
        project.deluxe.money = project.deluxe.sales * SALES.price;
        if (project.deluxe.money > 0) pay(label.id, project.deluxe.money, artist.id);
        tell(project.labelId, `Deluxe de « ${project.title} » : ${project.deluxe.sales.toLocaleString('fr-FR')} CD et vinyles vendus (+${project.deluxe.money.toLocaleString('fr-FR')} €).`);
        certify(project, label, artist.name, tell, news);
      }
    }
    if (project.state !== 'scheduled' || project.releaseTick > world.tick) continue;
    const tracks = project.songIds.map((id) => world.songs.find((s) => s.id === id)).filter((s): s is Song => !!s);
    project.state = 'released';
    project.quality = Math.round(tracks.reduce((sum, s) => sum + s.quality, 0) / Math.max(1, tracks.length));
    const streams = tracks.reduce((sum, s) => sum + s.streamsLast, 0);
    const label = world.labels[project.labelId];
    const artist = world.artists[project.artistId];
    if (artist) project.quality = Math.min(99, (project.quality ?? 0) + albumBonus(artist));
    if (label && artist) {
      const what = project.kind === 'ep' ? `L’EP « ${project.title} »` : `L’album « ${project.title} »`;
      judgeRelease(world, label, artist, project.quality, what, (text) => tell(project.labelId, text));
    }
    const name = `${PROJECTS[project.kind].name} « ${project.title} »`;
    let sold = '';
    if (label && artist) {
      const sale = salesQuote({ fans: artist.fans, hype: artist.hype, kind: project.kind, quality: project.quality, cover: !!project.cover, signing: !!project.signing, boost: supportBoost(world, label.id, artist.id, 'sales') });
      if (project.signing) artist.energy = Math.max(0, artist.energy - SALES.signingEnergy);
      project.sales = sale.units;
      project.salesMoney = sale.money;
      if (sale.money > 0) pay(label.id, sale.money, artist.id);
      sold = ` ${sale.units.toLocaleString('fr-FR')} CD et vinyles vendus (+${sale.money.toLocaleString('fr-FR')} €)${project.signing ? `, avec la séance de dédicace (énergie −${SALES.signingEnergy})` : ''}.`;
    }
    tell(project.labelId, `${name} est sorti : ${streams.toLocaleString('fr-FR')} streams la première semaine, note ${project.quality}.${sold}`);
    if (label && artist) certify(project, label, artist.name, tell, news);
    if (label && artist) news(`${artist.name} (${label.name}) sort son ${name}.`);
    if (label && project.kind === 'album' && project.quality >= PROJECTS.goodAlbum) {
      label.reputation = clamp(label.reputation + PROJECTS.goodAlbumReputation, 0, 100);
      tell(project.labelId, `La critique adore l’album « ${project.title} » : ta réputation monte.`);
    }
  }
};

export interface ProjectView {
  id: string;
  kind: ProjectKind;
  title: string;
  artistId: string;
  artistName: string;
  state: 'scheduled' | 'released';
  weeksLeft: number;
  tracks: Array<{ id: string; title: string; deluxe: boolean }>;
  streamsTotal: number;
  quality: number | null;
  cover: boolean;
  /** A deluxe can still be added. */
  canDeluxe: boolean;
  signing: boolean;
  /** CDs and vinyls sold (with the deluxe), what they brought, and the record it earned. */
  sales: number | null;
  salesMoney: number | null;
  cert: 'gold' | 'platinum' | null;
}

export const projectsView = (world: World, labelId: string): ProjectView[] =>
  (world.projects ?? [])
    .filter((p) => p.labelId === labelId)
    .map((p) => {
      const ids = [...p.songIds, ...(p.deluxe?.songIds ?? [])];
      const songs = ids.map((id) => world.songs.find((s) => s.id === id)).filter((s): s is Song => !!s);
      return {
        id: p.id,
        kind: p.kind,
        title: p.title,
        artistId: p.artistId,
        artistName: world.artists[p.artistId]?.name ?? '?',
        state: p.state,
        weeksLeft: Math.max(0, p.releaseTick - world.tick),
        tracks: songs.map((s) => ({ id: s.id, title: s.title, deluxe: p.deluxe?.songIds.includes(s.id) ?? false })),
        streamsTotal: songs.reduce((sum, s) => sum + s.streamsTotal, 0),
        quality: p.quality ?? null,
        cover: p.cover ?? false,
        canDeluxe: p.kind === 'album' && p.state === 'released' && !p.deluxe && world.tick - p.releaseTick < PROJECTS.deluxe.withinTicks,
        signing: p.signing ?? false,
        sales: p.sales === undefined ? null : p.sales + (p.deluxe?.sales ?? 0),
        salesMoney: p.salesMoney === undefined ? null : p.salesMoney + (p.deluxe?.money ?? 0),
        cert: p.cert ?? null,
      } satisfies ProjectView;
    })
    .sort((a, b) => Number(a.state === 'released') - Number(b.state === 'released') || b.weeksLeft - a.weeksLeft);
