// Fans tired of weak songs (owner's rule, 2026-11-13), so that nobody spams songs every week.
// A release is a letdown when its note is under 50, or 5 points or more under the artist's usual songs.
// Two letdowns among his last four releases and he loses buzz, fans and morale, more with each one;
// a release above his usual level wipes the slate. When several artists of a label miss at the same time,
// the label loses a little reputation. Releasing often is fine: only the weak songs count.
import { contractOf } from './economy.ts';
import { clamp } from './rng.ts';
import type { Artist, Label, World } from './types.ts';

export const LETDOWN = {
  /** Under this note, any song is a letdown. */
  floor: 50,
  /** This many points under his usual songs is a letdown too. */
  under: 5,
  /** Releases looked at. */
  window: 4,
  /** Letdowns in the window before it costs anything. */
  trigger: 2,
  /** His usual note: the average of his last released songs, once he has a few. */
  usualOf: 6,
  usualMin: 3,
  /** Without a usual note yet, a song above this wipes the slate. */
  freshBar: 55,
  /** Cost of each step (the second letdown is step 1, the third step 2...). */
  hype: 5,
  fans: 0.01,
  morale: 3,
  /** Another artist of the label let the fans down this recently: the label pays too. */
  labelWeeks: 4,
  reputation: 1,
} as const;

/** The artist's usual note: the average of his last songs released before this week, or null while he has too few. */
export const usualNote = (world: World, artistId: string, tick = world.tick): number | null => {
  const past = world.songs
    .filter((s) => s.artistId === artistId && s.state === 'released' && (s.releaseTick ?? tick) < tick)
    .sort((a, b) => (b.releaseTick ?? 0) - (a.releaseTick ?? 0))
    .slice(0, LETDOWN.usualOf);
  if (past.length < LETDOWN.usualMin) return null;
  return past.reduce((sum, s) => sum + s.quality, 0) / past.length;
};

export const isLetdown = (quality: number, usual: number | null): boolean =>
  quality < LETDOWN.floor || (usual !== null && quality <= usual - LETDOWN.under);

/** After a release of a player's label (a single, or an EP or album as a whole): the fans judge it. */
export const judgeRelease = (world: World, label: Label, artist: Artist, quality: number, what: string, tell: (text: string) => void, tick = world.tick): void => {
  if (label.kind !== 'player') return;
  const usual = usualNote(world, artist.id, tick);
  const bad = isLetdown(quality, usual);
  const state = (artist.letdown ??= { recent: [] });
  if (!bad && quality > (usual ?? LETDOWN.freshBar)) {
    state.recent = [];
    return;
  }
  state.recent = [...state.recent, bad].slice(-LETDOWN.window);
  const count = state.recent.filter(Boolean).length;
  if (!bad || count < LETDOWN.trigger) return;

  const step = count - LETDOWN.trigger + 1;
  const hype = LETDOWN.hype * step;
  const lost = Math.round(artist.fans * LETDOWN.fans * step);
  const morale = LETDOWN.morale * step;
  artist.hype = clamp(artist.hype - hype, 0, 100);
  artist.fans = Math.max(0, artist.fans - lost);
  artist.morale = clamp(artist.morale - morale, 0, 100);
  tell(
    `${what} déçoit les fans de ${artist.name} : ${count} sorties ratées sur ses ${state.recent.length} dernières. Buzz −${hype}, ${lost.toLocaleString('fr-FR')} fans partis, moral −${morale}.`,
  );

  // Several artists of the label letting the fans down at the same time: the label's name suffers.
  const others = Object.values(world.artists).some(
    (a) => a.id !== artist.id && a.letdown?.hitTick !== undefined && tick - a.letdown.hitTick <= LETDOWN.labelWeeks && contractOf(world, a.id)?.labelId === label.id,
  );
  state.hitTick = tick;
  if (others && label.letdownTick !== tick) {
    label.letdownTick = tick;
    label.reputation = clamp(label.reputation - LETDOWN.reputation, 0, 100);
    tell(`Trop de sorties ratées au label en ce moment : ta réputation baisse (−${LETDOWN.reputation}).`);
  }
};
