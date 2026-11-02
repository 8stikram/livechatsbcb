import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from 'react';
import type { DraftMedia } from '../../../shared/ipc';
import { Slider } from './NowPlaying';
import type { Clip } from './use-draft';

const STEP_MS = 100;
const MIN_VIEW_MS = 2_000;
const BAR_HEIGHT = 52;
const HANDLE = 14;
const SEEK_GIVE_UP_MS = 2_000;
const MAX_KEPT_FRAMES = 240;
// Decoding a sound takes memory: past this, it stays a plain bar.
const MAX_WAVE_BYTES = 40 * 1024 * 1024;
const WAVE_RATE = 8_000;
const WAVE_BUCKETS = 1_500;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const snap = (ms: number) => Math.round(ms / STEP_MS) * STEP_MS;

export type ClipEdge = 'start' | 'end' | 'move';

const useWidth = (box: RefObject<HTMLElement | null>): number => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const watcher = new ResizeObserver(() => setWidth(element.clientWidth));
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [box]);
  return width;
};

const grabFrame = (video: HTMLVideoElement, ms: number, width: number, height: number): Promise<ImageBitmap | null> =>
  new Promise((resolve) => {
    const finish = (seeked: boolean) => {
      clearTimeout(giveUp);
      video.removeEventListener('seeked', onSeeked);
      resolve(seeked ? createImageBitmap(video, { resizeWidth: width, resizeHeight: height }).catch(() => null) : null);
    };
    const onSeeked = () => finish(true);
    const giveUp = setTimeout(() => finish(false), SEEK_GIVE_UP_MS);
    video.addEventListener('seeked', onSeeked);
    video.currentTime = ms / 1000;
  });

type View = { startMs: number; lengthMs: number };

// Pictures of the video side by side, read from a copy of its own so that the preview doesn't jump around.
const FrameStrip = ({ url, totalMs, view, width }: { url: string; totalMs: number; view: View; width: number }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLVideoElement | null>(null);
  const kept = useRef(new Map<number, ImageBitmap>());
  const turn = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    const video = document.createElement('video');
    const frames = kept.current;
    video.muted = true;
    video.preload = 'auto';
    video.onloadedmetadata = () => setReady(true);
    video.src = url;
    source.current = video;
    return () => {
      video.onloadedmetadata = null;
      video.removeAttribute('src');
      video.load();
      source.current = null;
      setReady(false);
      for (const frame of frames.values()) frame.close();
      frames.clear();
    };
  }, [url]);

  useEffect(() => {
    const video = source.current;
    const target = canvas.current;
    if (!ready || !video || !target || width === 0 || video.videoWidth === 0) return;
    let stopped = false;

    const fill = async () => {
      if (stopped) return;
      const context = target.getContext('2d');
      if (!context) return;
      const ratio = window.devicePixelRatio || 1;
      target.width = Math.round(width * ratio);
      target.height = Math.round(BAR_HEIGHT * ratio);
      const frameWidth = Math.max(8, Math.round((target.height * video.videoWidth) / video.videoHeight));
      const count = Math.ceil(target.width / frameWidth);
      let drawn = 0;
      for (let index = 0; index < count && !stopped; index++) {
        const at = snap(clamp(view.startMs + (((index + 0.5) * frameWidth) / target.width) * view.lengthMs, 0, totalMs));
        let frame = kept.current.get(at) ?? null;
        if (!frame) {
          frame = await grabFrame(video, at, frameWidth, target.height);
          if (frame && kept.current.size < MAX_KEPT_FRAMES) kept.current.set(at, frame);
        }
        if (frame && !stopped) {
          context.drawImage(frame, index * frameWidth, 0, frameWidth, target.height);
          setFilled(++drawn);
        }
      }
    };

    // One at a time: the same video can't be in two places.
    const wait = setTimeout(() => {
      turn.current = turn.current.then(fill).catch(() => {});
    }, 120);
    return () => {
      stopped = true;
      clearTimeout(wait);
    };
  }, [ready, width, view.startMs, view.lengthMs, totalMs]);

  return <canvas ref={canvas} className="clip-picture" data-testid="clip-frames" data-filled={filled} aria-hidden="true" />;
};

// The shape of the sound, to see the loud moments and the silences.
const SoundShape = ({ url, size, totalMs, view, width }: { url: string; size: number; totalMs: number; view: View; width: number }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);

  useEffect(() => {
    if (size > MAX_WAVE_BYTES) return;
    let stopped = false;
    void (async () => {
      const bytes = await (await fetch(url)).arrayBuffer();
      const decoded = await new OfflineAudioContext(1, 1, WAVE_RATE).decodeAudioData(bytes);
      const samples = decoded.getChannelData(0);
      const found = new Float32Array(WAVE_BUCKETS);
      const perBucket = Math.max(1, Math.floor(samples.length / WAVE_BUCKETS));
      let loudest = 0;
      for (let bucket = 0; bucket < WAVE_BUCKETS; bucket++) {
        let peak = 0;
        const end = Math.min(samples.length, (bucket + 1) * perBucket);
        for (let index = bucket * perBucket; index < end; index++) peak = Math.max(peak, Math.abs(samples[index]!));
        found[bucket] = peak;
        loudest = Math.max(loudest, peak);
      }
      if (loudest > 0) for (let bucket = 0; bucket < WAVE_BUCKETS; bucket++) found[bucket]! /= loudest;
      if (!stopped) setPeaks(found);
    })().catch(() => {});
    return () => {
      stopped = true;
    };
  }, [url, size]);

  useEffect(() => {
    const target = canvas.current;
    const context = target?.getContext('2d');
    if (!target || !context || !peaks || width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    target.width = Math.round(width * ratio);
    target.height = Math.round(BAR_HEIGHT * ratio);
    context.fillStyle = 'rgb(255 255 255 / 60%)';
    const middle = target.height / 2;
    for (let x = 0; x < target.width; x += 2 * ratio) {
      const at = view.startMs + (x / target.width) * view.lengthMs;
      const peak = peaks[Math.min(WAVE_BUCKETS - 1, Math.floor((at / totalMs) * WAVE_BUCKETS))] ?? 0;
      const height = Math.max(ratio, peak * target.height * 0.9);
      context.fillRect(x, middle - height / 2, ratio, height);
    }
  }, [peaks, width, view.startMs, view.lengthMs, totalMs]);

  return <canvas ref={canvas} className="clip-picture" data-testid="clip-wave" data-ready={peaks !== null} aria-hidden="true" />;
};

// Two sliders over a picture of the passage, as in an editing program, and the chosen part can be moved whole.
export const ClipBar = ({
  draft,
  totalMs,
  clip,
  lengthLabel,
  onStart,
  onEnd,
  onMove,
  onRelease,
  children,
}: {
  draft: Pick<DraftMedia, 'kind' | 'previewUrl' | 'size'>;
  totalMs: number;
  clip: Clip;
  lengthLabel: string;
  onStart: (ms: number) => void;
  onEnd: (ms: number) => void;
  onMove: (startMs: number) => void;
  onRelease: (edge: ClipEdge) => void;
  children: ReactNode;
}) => {
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const [zoom, setZoom] = useState(1);
  const [viewStartMs, setViewStartMs] = useState(0);

  const viewLengthMs = totalMs / zoom;
  const lastViewStartMs = Math.max(0, snap(totalMs - viewLengthMs));
  const viewStart = clamp(viewStartMs, 0, lastViewStartMs);
  const view = { startMs: viewStart, lengthMs: viewLengthMs };
  const edge = (ms: number) => clamp((ms - viewStart) / viewLengthMs, 0, 1);

  const zoomTo = (next: number) => {
    const length = totalMs / next;
    setZoom(next);
    setViewStartMs(snap(clamp((clip.startMs + clip.endMs - length) / 2, 0, totalMs - length)));
  };

  const startMove = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget;
    const usable = target.parentElement!.clientWidth - HANDLE;
    const { clientX: startX } = event;
    const { startMs, endMs } = clip;
    target.setPointerCapture(event.pointerId);
    const onPointerMove = (move: globalThis.PointerEvent) => {
      const by = ((move.clientX - startX) / usable) * viewLengthMs;
      onMove(snap(clamp(startMs + by, 0, totalMs - (endMs - startMs))));
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onPointerMove as EventListener);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      onRelease('move');
    };
    target.addEventListener('pointermove', onPointerMove as EventListener);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  return (
    <div className="clip">
      <div
        className="clip-range"
        style={{ '--start': edge(clip.startMs), '--end': edge(clip.endMs) } as CSSProperties}
        onWheel={(event) => {
          if (zoom > 1) setViewStartMs(snap(clamp(viewStart + Math.sign(event.deltaY || event.deltaX) * viewLengthMs * 0.2, 0, lastViewStartMs)));
        }}
      >
        <div ref={box} className="clip-pictures">
          {draft.kind === 'video' ? (
            <FrameStrip url={draft.previewUrl} totalMs={totalMs} view={view} width={width} />
          ) : (
            <SoundShape url={draft.previewUrl} size={draft.size} totalMs={totalMs} view={view} width={width} />
          )}
        </div>
        <i className="clip-dim is-before" aria-hidden="true" />
        <i className="clip-dim is-after" aria-hidden="true" />
        <span className="clip-chosen" data-testid="clip-chosen" onPointerDown={startMove}>
          <span className="clip-length mono" data-testid="clip-length">
            {lengthLabel}
          </span>
        </span>
        <input
          type="range"
          aria-label="Début du passage"
          min={viewStart}
          max={viewStart + viewLengthMs}
          step={STEP_MS}
          value={clip.startMs}
          onChange={(event) => onStart(Number(event.target.value))}
          onPointerUp={() => onRelease('start')}
        />
        <input
          type="range"
          aria-label="Fin du passage"
          min={viewStart}
          max={viewStart + viewLengthMs}
          step={STEP_MS}
          value={clip.endMs}
          onChange={(event) => onEnd(Number(event.target.value))}
          onPointerUp={() => onRelease('end')}
        />
      </div>
      {zoom > 1 && (
        <Slider label="Déplacer la vue" value={viewStart} min={0} max={lastViewStartMs} step={STEP_MS} onChange={setViewStartMs} />
      )}
      <div className="clip-foot">
        {children}
        {totalMs >= 2 * MIN_VIEW_MS && (
          <span className="clip-zoom">
            <button type="button" className="pill quiet small" aria-label="Dézoomer" disabled={zoom === 1} onClick={() => zoomTo(zoom / 2)}>
              −
            </button>
            <button
              type="button"
              className="pill quiet small"
              aria-label="Zoomer"
              disabled={totalMs / (zoom * 2) < MIN_VIEW_MS}
              onClick={() => zoomTo(zoom * 2)}
            >
              +
            </button>
          </span>
        )}
      </div>
    </div>
  );
};
