// The tutorial of a new label: a short guided first week on the player's real label.
// It is protected: money spent on the guided steps is given back, the studio is kind
// and the featuring wheel says yes by the second try. Kept on the server like the rest.
import { CFG } from './config.ts';
import { BEATS, THEMES } from './data/content.ts';
import { rosterOf } from './economy.ts';
import { releaseWeek } from './release.ts';
import type { Label, World } from './types.ts';

export type TutorialStep = 'home' | 'sign' | 'song' | 'release' | 'results' | 'done';

export interface Tutorial {
  step: TutorialStep;
  /** Money given back so far. */
  gift: number;
}

/** The most the tutorial gives back, whatever the player picks. */
export const TUTORIAL_GIFT_CAP = 40_000;

export const tutorialOf = (world: World, labelId: string): Tutorial | undefined => world.tutorials?.[labelId];

/** The step being played, or null when the label has no tutorial running. */
export const tutorialStep = (world: World, labelId: string): TutorialStep | null => {
  const step = tutorialOf(world, labelId)?.step;
  return step && step !== 'done' ? step : null;
};

export const startTutorial = (world: World, labelId: string): void => {
  world.tutorials = { ...world.tutorials, [labelId]: { step: 'home', gift: 0 } };
};

/** Which actions each step protects (and pays back). */
const GUARDED: Record<TutorialStep, string[]> = {
  home: [],
  sign: ['talk', 'offer', 'talk_leave'],
  song: ['studio', 'react', 'feat', 'feat_skip', 'studio_cancel', 'song'],
  release: ['release'],
  results: [],
  done: [],
};

export const isGuarded = (world: World, labelId: string, actionType: string): boolean => {
  const step = tutorialStep(world, labelId);
  return step !== null && GUARDED[step].includes(actionType);
};

/** Gives back what a guarded action cost, up to the cap. */
export const refund = (world: World, label: Label, cashBefore: number): void => {
  const tutorial = tutorialOf(world, label.id);
  if (!tutorial) return;
  const spent = cashBefore - label.cash;
  if (spent <= 0) return;
  const back = Math.min(spent, Math.max(0, TUTORIAL_GIFT_CAP - tutorial.gift));
  label.cash += back;
  tutorial.gift += back;
};

/** Moves to the next step once the player did what the step asks. */
export const afterAction = (world: World, label: Label, actionType: string, rosterBefore: number): void => {
  const tutorial = tutorialOf(world, label.id);
  if (!tutorial) return;
  if (tutorial.step === 'sign' && rosterOf(world, label.id).length > rosterBefore) tutorial.step = 'song';
  else if (tutorial.step === 'song' && actionType === 'song') tutorial.step = 'release';
  else if (tutorial.step === 'release' && actionType === 'release') tutorial.step = 'results';
};

/** "Suivant" on the steps that only explain. */
export const nextStep = (world: World, label: Label): void => {
  const tutorial = tutorialOf(world, label.id);
  if (!tutorial) return;
  if (tutorial.step === 'home') tutorial.step = 'sign';
  else if (tutorial.step === 'results') tutorial.step = 'done';
};

export interface SkipTools {
  record: (artistId: string, title: string, themeId: string, beatId: string) => void;
  release: (songId: string, releaseTick: number) => void;
}

/** "Passer": the game makes a free song with the first artist and releases it next week. */
export const skipTutorial = (world: World, label: Label, tools: SkipTools): void => {
  const tutorial = tutorialOf(world, label.id);
  if (!tutorial || tutorial.step === 'done') return;
  if (world.sessions) delete world.sessions[label.id];
  const cash = label.cash;
  try {
    const mine = world.songs.filter((s) => s.labelId === label.id);
    if (mine.length === 0) {
      const artist = rosterOf(world, label.id)[0];
      if (artist) {
        const beat = BEATS.find((b) => b.genres.includes(artist.genre)) ?? BEATS[0]!;
        const theme = THEMES.find((t) => beat.themes.includes(t.id)) ?? THEMES[0]!;
        tools.record(artist.id, 'Premier son', theme.id, beat.id);
      }
    }
    const vault = world.songs.find((s) => s.labelId === label.id && s.state === 'vault');
    if (vault && !world.songs.some((s) => s.labelId === label.id && s.state !== 'vault')) {
      tools.release(vault.id, Math.max(world.tick + 1, vault.availableTick));
    }
  } catch {
    // The defaults are a help, not a must: an artist out of energy simply skips them.
  }
  refund(world, label, cash);
  tutorial.step = 'done';
};

export interface TutorialView {
  step: TutorialStep;
  gift: number;
  /** For the results step: what the first song should do in its first week. */
  preview: null | { title: string; artistName: string; inWeeks: number; streams: number; newFans: number; money: number };
}

export const tutorialView = (world: World, labelId: string): TutorialView | null => {
  const tutorial = tutorialOf(world, labelId);
  if (!tutorial || tutorial.step === 'done') return null;
  let preview: TutorialView['preview'] = null;
  const song = world.songs.filter((s) => s.labelId === labelId && s.state === 'scheduled').sort((a, b) => (a.releaseTick ?? 0) - (b.releaseTick ?? 0))[0];
  const artist = song ? world.artists[song.artistId] : undefined;
  if (song && artist && song.releaseTick !== null) {
    const { week } = releaseWeek(world, song, artist, song.releaseTick, 0);
    preview = {
      title: song.title,
      artistName: artist.name,
      inWeeks: song.releaseTick - world.tick,
      streams: week.streams,
      newFans: week.newFans,
      money: Math.round(week.streams * CFG.release.payPerStream),
    };
  }
  return { step: tutorial.step, gift: Math.round(tutorial.gift), preview };
};
