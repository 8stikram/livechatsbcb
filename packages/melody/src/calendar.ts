// The calendar (docs/melody-tycoon/06-evenements-notifications.md, 6.4). A season is a year of 52 weeks that
// starts in January. A few periods change what the public wants: Saint-Valentin, summer, autumn, Christmas.
// Also the calendar of the releases the players planned: artist, genre and week are known, the title is not.
import { CFG } from './config.ts';
import { THEMES, beatById } from './data/content.ts';

const themeName = (id: string): string => THEMES.find((t) => t.id === id)?.name ?? id;
import type { GenreId, World } from './types.ts';

export type PeriodId = 'valentin' | 'ete' | 'automne' | 'noel';

export interface Period {
  id: PeriodId;
  name: string;
  /** Weeks of the year, 1 to 52, included. */
  from: number;
  to: number;
  /** Bonus on how well a song fits the public (0.15 = +15 %), by theme and by beat. */
  themes: Partial<Record<string, number>>;
  beats: Partial<Record<string, number>>;
  /** Concert crowds, merch at the tours, CD and vinyl. */
  live: number;
  merch: number;
  sales: number;
  text: string;
}

export const PERIODS: readonly Period[] = [
  {
    id: 'valentin', name: 'Saint-Valentin', from: 6, to: 7,
    themes: { amour: 0.15, rupture: 0.15, toxique: 0.15 }, beats: { lovetrap: 0.1 }, live: 1, merch: 1, sales: 1,
    text: 'Amour, rupture et love toxique marchent mieux (+15 %), le lovetrap aussi.',
  },
  {
    id: 'ete', name: 'Été', from: 24, to: 35,
    themes: { fete: 0.15, danse: 0.15, voyage: 0.15, soleil: 0.15, melancolie: -0.1 },
    beats: { afrobeats: 0.05, dancehall: 0.05, jersey: 0.05, amapiano: 0.05 }, live: 1.3, merch: 1, sales: 1,
    text: 'Fête, danse, voyage et soleil +15 %, afro et dancehall en forme, concerts +30 %. La mélancolie −10 %.',
  },
  {
    id: 'automne', name: 'Automne', from: 41, to: 47,
    themes: { melancolie: 0.1, nostalgie: 0.1, mental: 0.1 }, beats: {}, live: 1, merch: 1, sales: 1,
    text: 'Mélancolie, nostalgie et santé mentale +10 %.',
  },
  {
    id: 'noel', name: 'Noël', from: 48, to: 52,
    themes: { famille: 0.1, nostalgie: 0.05 }, beats: {}, live: 1, merch: 2, sales: 1.5,
    text: 'Merch ×2 en tournée, CD et vinyles ×1,5. Famille et nostalgie un peu mieux.',
  },
];

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;

/** Week of the year, 1 to 52: the season starts in January. Tick 0 is week 1. */
export const weekOfYear = (tick: number): number => (((tick % CFG.ticksPerSeason) + CFG.ticksPerSeason) % CFG.ticksPerSeason) + 1;

export const monthOf = (tick: number): string => MONTHS[Math.min(11, Math.floor(((weekOfYear(tick) - 1) * 12) / 52))]!;

export const periodAt = (tick: number): Period | null => {
  const week = weekOfYear(tick);
  return PERIODS.find((p) => week >= p.from && week <= p.to) ?? null;
};

/** How much better (or worse) a theme and a beat fit the public this week. 1 = no change. */
export const seasonFit = (tick: number, themeId: string, beatId: string): number => {
  const p = periodAt(tick);
  if (!p) return 1;
  return 1 + (p.themes[themeId] ?? 0) + (p.beats[beatId] ?? 0);
};

export const liveBoost = (tick: number): number => periodAt(tick)?.live ?? 1;
export const merchBoost = (tick: number): number => periodAt(tick)?.merch ?? 1;
export const salesBoost = (tick: number): number => periodAt(tick)?.sales ?? 1;

/** A word for the studio: is this theme or beat good for the current or the coming period? */
export const seasonTip = (tick: number, themeId: string, beatId: string): string | null => {
  for (const ahead of [0, 4]) {
    const p = periodAt(tick + ahead);
    if (!p) continue;
    const t = p.themes[themeId] ?? 0;
    const b = p.beats[beatId] ?? 0;
    const when = ahead === 0 || periodAt(tick)?.id === p.id ? '' : ' qui arrive';
    if (t > 0) return `Parfait pour ${p.id === 'ete' ? 'l’été' : p.id === 'automne' ? 'l’automne' : p.id === 'noel' ? 'Noël' : 'la Saint-Valentin'}${when} : ${themeName(themeId)} +${Math.round(t * 100)} %.`;
    if (b > 0) return `${beatById(beatId).name} marche bien ${p.id === 'ete' ? 'l’été' : 'en ce moment'}${when}.`;
    if (t < 0) return `${themeName(themeId)} marche moins bien ${p.id === 'ete' ? 'l’été' : 'en ce moment'}${when} (${Math.round(t * 100)} %).`;
  }
  return null;
};

export interface CalendarView {
  week: number;
  month: string;
  now: { id: PeriodId; name: string; text: string; weeksLeft: number } | null;
  next: { id: PeriodId; name: string; text: string; inWeeks: number } | null;
  /** Releases planned by the players for the next weeks: no title. */
  releases: Array<{ inWeeks: number; artistName: string; labelName: string; genre: GenreId; mine: boolean; project: boolean }>;
}

export const calendarView = (world: World, labelId: string | null): CalendarView => {
  const week = weekOfYear(world.tick);
  const now = periodAt(world.tick);
  let next: CalendarView['next'] = null;
  for (let i = 1; i <= CFG.ticksPerSeason; i += 1) {
    const p = periodAt(world.tick + i);
    if (p && p.id !== now?.id) {
      next = { id: p.id, name: p.name, text: p.text, inWeeks: i };
      break;
    }
  }
  const releases = world.songs
    .filter((s) => s.state === 'scheduled' && s.releaseTick !== null && s.releaseTick > world.tick && world.labels[s.labelId]?.kind === 'player' && !world.labels[s.labelId]!.bankrupt)
    .map((s) => {
      const artist = world.artists[s.artistId];
      return {
        inWeeks: s.releaseTick! - world.tick,
        artistName: artist?.name ?? '?',
        labelName: world.labels[s.labelId]?.name ?? '?',
        genre: beatById(s.beatId).genres[0] ?? artist?.genre ?? 'pop',
        mine: s.labelId === labelId,
        project: !!s.projectId,
      };
    })
    .sort((a, b) => a.inWeeks - b.inWeeks)
    .slice(0, 30);
  return {
    week,
    month: monthOf(world.tick),
    now: now ? { id: now.id, name: now.name, text: now.text, weeksLeft: now.to - week + 1 } : null,
    next,
    releases,
  };
};
