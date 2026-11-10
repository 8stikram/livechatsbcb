import { useEffect, useRef, useState } from 'react';
import type { GameReactionView, GameView } from '../../../../shared/ipc';
import { personaOf, type FxSpec, type Mood } from './persona';

export type GameMood = { mood: Mood; pulse: number; look: number; burst?: FxSpec[] };

const LOOK_MS = 3000;

/** Index of a player mapped to -1 (first) ... 1 (last). */
function lookAt(game: GameView, id: string | null | undefined): number | null {
  if (!id) return null;
  const i = game.players.indexOf(id);
  if (i < 0) return null;
  return game.players.length > 1 ? (i / (game.players.length - 1)) * 2 - 1 : 0;
}

const total = (game: GameView) => Object.values(game.scores).reduce((a, b) => a + b, 0);

/**
 * What the mascot should feel, from the change between the previous game state and the new one.
 * `reactions` is the feed of floating emojis (a laughing one makes the mascot laugh).
 */
export function useGameMood(game: GameView, me: string, reactions: GameReactionView[] = []): GameMood {
  const [state, setState] = useState<GameMood>({ mood: 'repos', pulse: 0, look: 0 });
  const prev = useRef<GameView | null>(null);
  const lookTimer = useRef(0);
  const seenReaction = useRef(reactions.reduce((m, r) => Math.max(m, r.id), 0));

  const fire = (mood: Mood, lookTo: number | null) => {
    setState((s) => ({ mood, pulse: s.pulse + 1, look: lookTo ?? s.look }));
    if (lookTo !== null) {
      window.clearTimeout(lookTimer.current);
      lookTimer.current = window.setTimeout(() => setState((s) => ({ ...s, look: 0 })), LOOK_MS);
    }
  };

  useEffect(() => {
    const before = prev.current;
    prev.current = game;
    // A different game (or the very first state): nothing to compare with.
    if (!before || before.id !== game.id) return;
    const react = personaOf(game.kind).react;

    // Newly acting players, to look toward.
    const newActor = game.acted.find((id) => !before.acted.includes(id));
    const newPlayer = game.players.find((id) => !before.players.includes(id));
    const actor = lookAt(game, newActor ?? newPlayer);

    if (game.phase === 'reveal' && before.phase !== 'reveal') {
      const best = Math.max(0, ...game.entries.map((e) => e.votes ?? 0));
      fire(best > 0 || game.answer ? 'victoire' : 'decu', null);
    } else if (game.phase === 'vote' && before.phase !== 'vote') {
      fire('surprise', null);
    } else if (game.voteStarted && !before.voteStarted) {
      fire('louche', null);
    } else if (game.kind === 'guess' && game.turn !== before.turn && game.turn) {
      fire('surprise', lookAt(game, game.turn));
    } else if (
      game.kind === 'guess' &&
      game.turn === before.turn &&
      ((game.secret !== null && before.secret !== null && game.secret !== before.secret) || total(game) > total(before))
    ) {
      fire('victoire', lookAt(game, game.turn));
    } else if (
      game.players.length > before.players.length ||
      game.entries.length > before.entries.length ||
      game.acted.length > before.acted.length
    ) {
      fire(react, actor);
    }
  }, [game, me]);

  // A laughing reaction floating by.
  useEffect(() => {
    const fresh = reactions.filter((r) => r.id > seenReaction.current);
    if (!fresh.length) return;
    seenReaction.current = Math.max(...fresh.map((r) => r.id));
    if (fresh.some((r) => r.emoji === '😂')) fire('rire', null);
  }, [reactions]);

  useEffect(() => () => window.clearTimeout(lookTimer.current), []);

  return state;
}
