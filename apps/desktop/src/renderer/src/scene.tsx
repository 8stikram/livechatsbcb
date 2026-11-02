import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { SceneLayer } from '@livechatsbcb/protocol';
import type { OverlayLayout, PlaybackView, SceneLayerView, Zone } from '../../shared/ipc';
import { Avatar } from './Avatar';
import { say, spokenText } from './speech';
import { useSyncedMedia } from './use-synced-media';

// What the overlay draws, and what the LiveChat tab draws in small: what you see is what the others see.

const MOTION_MS = 400;

export const zoneStyle = ({ x, y, w, h }: Zone): CSSProperties => ({
  left: `${x}%`,
  top: `${y}%`,
  width: `${w}%`,
  height: `${h}%`,
});

const captionSize = (text: string): string => {
  if (text.length > 120) return 'is-long';
  return text.length > 50 ? 'is-medium' : '';
};

const FIT_MIN_SCALE = 0.5;
const FIT_MIN_PX = 10;

// Whole names rather than cut ones: the text gets smaller until it fits, and only an impossible length is cut.
export const FitText = ({ text, className, children }: { text: string; className: string; children?: ReactNode }) => {
  const box = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const fit = () => {
      element.style.fontSize = '';
      if (element.clientWidth === 0 || element.scrollWidth <= element.clientWidth) return;
      const size = parseFloat(getComputedStyle(element).fontSize);
      const smallest = Math.max(size * FIT_MIN_SCALE, Math.min(size, FIT_MIN_PX));
      element.style.fontSize = `${Math.max(smallest, (size * element.clientWidth) / element.scrollWidth)}px`;
    };
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(element);
    void document.fonts.ready.then(fit);
    return () => watcher.disconnect();
  }, [text]);

  return (
    <span ref={box} className={className} title={text}>
      {children ?? text}
    </span>
  );
};

export const Profile = ({ name, avatarUrl, zone }: { name: string; avatarUrl: string | null; zone: Zone }) => (
  <div className="zone zone-profile" style={zoneStyle(zone)} data-testid="overlay-profile">
    <Avatar className="profile-avatar" name={name} url={avatarUrl} testId="overlay-avatar" />
    <FitText className="profile-name outlined" text={name} />
  </div>
);

export const Caption = ({ text, zone }: { text: string; zone: Zone }) => (
  <div className="zone zone-text" style={zoneStyle(zone)} data-testid="overlay-text">
    <p className={`outlined ${captionSize(text)}`}>{text}</p>
  </div>
);

export const layerPlace = ({ x, y, width, aspect, rotation }: Pick<SceneLayer, 'x' | 'y' | 'width' | 'aspect' | 'rotation'>): CSSProperties => ({
  left: `${x}%`,
  top: `${y}%`,
  width: `${width}%`,
  aspectRatio: String(aspect),
  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
});

export const layerLook = ({ flip, grayscale, blur }: Pick<SceneLayer, 'flip' | 'grayscale' | 'blur'>): CSSProperties => {
  const filters = [grayscale ? 'grayscale(1)' : '', blur > 0 ? `blur(${blur}cqw)` : ''].filter(Boolean);
  return {
    ...(flip ? { transform: 'scaleX(-1)' } : {}),
    ...(filters.length > 0 ? { filter: filters.join(' ') } : {}),
  };
};

const motionStyle = ({ enter, exit }: SceneLayerView, durationMs: number): CSSProperties => {
  const motions = [
    ...(enter === 'none' ? [] : [{ name: `scene-enter-${enter}`, delay: 0, fill: 'backwards' }]),
    // Too short to be seen leaving: it would cut into how it came in.
    ...(exit === 'none' || durationMs < 2 * MOTION_MS
      ? []
      : [{ name: `scene-exit-${exit}`, delay: durationMs - MOTION_MS, fill: 'forwards' }]),
  ];
  if (motions.length === 0) return {};
  return {
    animationName: motions.map(({ name }) => name).join(', '),
    animationDuration: `${MOTION_MS}ms`,
    animationDelay: motions.map(({ delay }) => `${delay}ms`).join(', '),
    animationFillMode: motions.map(({ fill }) => fill).join(', '),
    animationTimingFunction: 'ease-out',
  };
};

const spinStyle = ({ spinRpm }: SceneLayerView): CSSProperties =>
  spinRpm === 0
    ? {}
    : {
        animationName: 'scene-spin',
        animationDuration: `${60 / Math.abs(spinRpm)}s`,
        animationDirection: spinRpm > 0 ? 'normal' : 'reverse',
        animationTimingFunction: 'linear',
        animationIterationCount: 'infinite',
      };

const SyncedMedia = ({
  kind,
  url,
  clipStartMs,
  durationMs,
  startAt,
  volume,
  style,
}: {
  kind: 'video' | 'audio';
  url: string | null;
  clipStartMs: number;
  durationMs: number;
  startAt: number;
  volume: number;
  style?: CSSProperties;
}) => {
  const element = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  useSyncedMedia(element, { clipStartMs, durationMs, startAt, mediaUrl: url });

  useEffect(() => {
    if (element.current) element.current.volume = volume;
  }, [volume]);

  const src = url ?? undefined;
  return kind === 'video' ? (
    <video ref={element} className="overlay-media" style={style} src={src} preload="auto" playsInline data-testid="overlay-video" />
  ) : (
    <audio ref={element} src={src} preload="auto" data-testid="overlay-audio" />
  );
};

// Everything appears at the shared start time, not when the message happened to arrive.
const useOnScreen = (startAt: number, durationMs: number): boolean => {
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const update = () => {
      const elapsedMs = Date.now() - startAt;
      setOnScreen(elapsedMs >= 0 && elapsedMs < durationMs);
    };
    update();
    const timers = [
      setTimeout(update, startAt - Date.now() + 1),
      setTimeout(update, startAt + durationMs - Date.now() + 1),
    ];
    return () => timers.forEach(clearTimeout);
  }, [startAt, durationMs]);

  return onScreen;
};

const PlayingLayer = ({
  layer,
  item,
  startAt,
  onScreen,
  volume,
}: {
  layer: SceneLayerView;
  item: PlaybackView;
  startAt: number;
  onScreen: boolean;
  volume: number;
}) => (
  <div className="scene-layer" style={layerPlace(layer)} data-testid="overlay-layer">
    {/* Three levels, as moving in, spinning and being placed each need a transform of their own. */}
    <div className="scene-motion" style={onScreen ? motionStyle(layer, item.durationMs) : undefined}>
      <div className="scene-motion" style={onScreen ? spinStyle(layer) : undefined}>
        {layer.kind === 'image' ? (
          <img className="overlay-media" style={layerLook(layer)} src={layer.url ?? undefined} alt="" data-testid="overlay-image" />
        ) : (
          <SyncedMedia
            kind="video"
            url={layer.url}
            clipStartMs={item.clipStartMs}
            durationMs={item.durationMs}
            startAt={startAt}
            volume={item.hasSound && item.videoMuted ? 0 : volume}
            style={layerLook(layer)}
          />
        )}
      </div>
    </div>
  </div>
);

export type Speech = { voice: string | null; rate: number };

// Someone arriving late hears nothing rather than a sentence already over for the others.
const SPEECH_LATE_MS = 1_000;

const useSpeech = (item: PlaybackView, startAt: number, volume: number, speech: Speech | null) => {
  useEffect(() => {
    const text = item.speak && speech ? spokenText(item.caption) : '';
    const wait = startAt - Date.now();
    if (!text || !speech || wait < -SPEECH_LATE_MS) return;
    const timer = setTimeout(() => say(text, speech.voice, speech.rate, volume), Math.max(0, wait));
    return () => {
      clearTimeout(timer);
      speechSynthesis.cancel();
    };
  }, [item.id, startAt]);
};

export const Playing = ({
  item,
  startAt,
  layout,
  volume,
  speech = null,
}: {
  item: PlaybackView;
  startAt: number;
  layout: OverlayLayout;
  volume: number;
  speech?: Speech | null;
}) => {
  const onScreen = useOnScreen(startAt, item.durationMs);
  useSpeech(item, startAt, volume, speech);

  return (
    <div className={onScreen ? 'scene' : 'scene is-waiting'} data-testid="overlay-scene" data-on-screen={onScreen}>
      {item.scene && (
        <div className="scene-canvas">
          {item.scene.map((layer, index) => (
            <PlayingLayer key={index} layer={layer} item={item} startAt={startAt} onScreen={onScreen} volume={volume} />
          ))}
        </div>
      )}
      <Profile name={item.senderName} avatarUrl={item.senderAvatarUrl} zone={layout.profile} />
      {!item.scene && item.mediaUrl && item.kind === 'image' && (
        <div className="zone zone-media" style={zoneStyle(layout.media)}>
          <img className="overlay-media" src={item.mediaUrl} alt="" data-testid="overlay-image" />
        </div>
      )}
      {!item.scene && item.kind === 'video' && (
        <div className="zone zone-media" style={zoneStyle(layout.media)}>
          <SyncedMedia
            kind="video"
            url={item.mediaUrl}
            clipStartMs={item.clipStartMs}
            durationMs={item.durationMs}
            startAt={startAt}
            volume={item.hasSound && item.videoMuted ? 0 : volume}
          />
        </div>
      )}
      {(item.kind === 'audio' || item.hasSound) && (
        <SyncedMedia
          kind="audio"
          url={item.hasSound ? item.soundUrl : item.mediaUrl}
          clipStartMs={item.kind === 'video' ? 0 : item.clipStartMs}
          durationMs={item.durationMs}
          startAt={startAt}
          volume={item.hasSound && item.soundMuted ? 0 : volume}
        />
      )}
      {item.caption && <Caption text={item.caption} zone={layout.text} />}
    </div>
  );
};

// A small screen, with the proportions of the real one.
export const ScreenPreview = ({ children, testId }: { children: ReactNode; testId?: string }) => (
  <div className="screen-preview-frame">
    <div
      className="screen-preview"
      style={{ '--screen-ratio': window.screen.width / window.screen.height } as CSSProperties}
      data-testid={testId}
    >
      {children}
    </div>
  </div>
);
