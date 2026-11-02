import { DEFAULT_DISPLAY_MS, MAX_CLIP_MS, MIN_DISPLAY_MS } from '@livechatsbcb/protocol';
import type { DraftMedia } from '../../../shared/ipc';

// How long a file sent straight away plays: all of it, as nobody chose a passage.
export const playLengthMs = (file: { kind: DraftMedia['kind']; url: string }): Promise<number | null> => {
  if (file.kind === 'image') return Promise.resolve(DEFAULT_DISPLAY_MS);
  return new Promise((resolve) => {
    const element = document.createElement(file.kind === 'video' ? 'video' : 'audio');
    const done = (length: number | null) => {
      element.onerror = null;
      element.removeAttribute('src');
      element.load();
      resolve(length);
    };
    const onLength = () => {
      if (!Number.isFinite(element.duration) || element.duration <= 0) return;
      done(Math.max(MIN_DISPLAY_MS, Math.min(MAX_CLIP_MS, Math.round(element.duration * 1000))));
    };
    element.preload = 'metadata';
    element.onerror = () => done(null);
    element.ondurationchange = onLength;
    // Some recorders write no duration in the file: asking for a far-off position makes the browser work it out.
    element.onloadedmetadata = () => {
      if (Number.isFinite(element.duration)) onLength();
      else element.currentTime = Number.MAX_SAFE_INTEGER;
    };
    element.src = file.url;
  });
};
