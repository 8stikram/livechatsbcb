import type { GameKind } from '@livechatsbcb/protocol';
import { boule } from './personas/boule';
import { boum } from './personas/boum';
import { chrono } from './personas/chrono';
import { insp } from './personas/insp';
import { micro } from './personas/micro';

export type PersonaId = 'insp' | 'micro' | 'boum' | 'boule' | 'chrono';
export type Mood = 'repos' | 'louche' | 'rire' | 'victoire' | 'decu' | 'surprise';
/** A particle effect, exactly as written in the persona files (type + free options). */
export type FxSpec = { type: string; [key: string]: unknown };

export type Persona = {
  id: PersonaId;
  name: string;
  /** The drawing (640x400 scene), injected as is. */
  svg: string;
  /** The animation CSS of the drawing, injected as is. */
  css: string;
  /** The CSS of the game screen look that goes with the persona. */
  worldCss: string;
  variants: { famille: string; nom: string; choix: [string, string][] }[];
  moodLabels: Partial<Record<Mood, string>>;
  react: Mood;
  moments: [string, Mood, FxSpec[]?][];
  ambient: FxSpec[];
  bursts: Partial<Record<Mood, FxSpec[]>>;
  moodMs: number;
};

export const PERSONAS: Record<PersonaId, Persona> = { insp, micro, boum, boule, chrono };

const PERSONA_OF_GAME: Record<GameKind, PersonaId> = {
  undercover: 'insp',
  joke: 'micro',
  question: 'boum',
  who: 'boule',
  guess: 'chrono',
};

export function personaOf(kind: GameKind): Persona {
  return PERSONAS[PERSONA_OF_GAME[kind]];
}
