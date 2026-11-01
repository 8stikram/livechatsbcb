import { useEffect, useRef, type RefObject } from 'react';

const DRIFT_CHECK_MS = 500;
// Too far off to catch up unnoticed: jump. Close enough: play a touch faster or slower, which nobody hears.
const SEEK_DRIFT_S = 0.5;
const NUDGE_DRIFT_S = 0.06;
const NUDGE_RATE = 0.04;

type Timing = { startAt: number; clipStartMs: number; durationMs: number; mediaUrl: string | null };

// Keeps a video or a sound on the shared timeline, whoever is playing it and wherever.
export const useSyncedMedia = (
  element: RefObject<HTMLMediaElement | null>,
  { startAt, clipStartMs, durationMs, mediaUrl }: Timing,
): void => {
  // The clock correction can still shift the start by a few ms: that must adjust playback, not restart it.
  const timing = useRef({ startAt, clipStartMs, durationMs });
  timing.current = { startAt, clipStartMs, durationMs };

  useEffect(() => {
    const media = element.current;
    if (!media) return;

    const correct = () => {
      const { startAt: start, clipStartMs: clipStart, durationMs: duration } = timing.current;
      const elapsedMs = Date.now() - start;
      if (elapsedMs < 0 || media.ended) return;
      if (elapsedMs >= duration) {
        media.pause();
        return;
      }

      const target = (clipStart + elapsedMs) / 1000;
      if (media.paused) {
        media.currentTime = target;
        void media.play().catch(() => {});
        return;
      }

      const drift = media.currentTime - target;
      if (Math.abs(drift) > SEEK_DRIFT_S) {
        media.currentTime = target;
        media.playbackRate = 1;
      } else if (Math.abs(drift) > NUDGE_DRIFT_S) {
        media.playbackRate = drift > 0 ? 1 - NUDGE_RATE : 1 + NUDGE_RATE;
      } else {
        media.playbackRate = 1;
      }
    };

    media.currentTime = timing.current.clipStartMs / 1000;
    const first = setTimeout(correct, Math.max(0, timing.current.startAt - Date.now()));
    const interval = setInterval(correct, DRIFT_CHECK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
      media.pause();
    };
  }, [element, mediaUrl]);
};
