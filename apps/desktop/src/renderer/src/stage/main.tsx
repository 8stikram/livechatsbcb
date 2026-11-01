import { StrictMode, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type { OverlayLayout, PlaybackView, Zone } from '../../../shared/ipc';
import { useAppState } from '../use-app-state';
import logo from '../assets/logo.png';
import '../styles.css';

const DRIFT_CHECK_MS = 500;
// Too far off to catch up unnoticed: jump. Close enough: play a touch faster or slower, which nobody hears.
const SEEK_DRIFT_S = 0.5;
const NUDGE_DRIFT_S = 0.06;
const NUDGE_RATE = 0.04;

const zoneStyle = ({ x, y, w, h }: Zone): CSSProperties => ({
  left: `${x}%`,
  top: `${y}%`,
  width: `${w}%`,
  height: `${h}%`,
});

const captionSize = (text: string): string => {
  if (text.length > 120) return 'is-long';
  return text.length > 50 ? 'is-medium' : '';
};

const Profile = ({ name, zone }: { name: string; zone: Zone }) => (
  <div className="zone zone-profile" style={zoneStyle(zone)} data-testid="overlay-profile">
    <span className="profile-avatar" aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
    <span className="profile-name outlined">{name}</span>
  </div>
);

const Caption = ({ text, zone }: { text: string; zone: Zone }) => (
  <div className="zone zone-text" style={zoneStyle(zone)} data-testid="overlay-text">
    <p className={`outlined ${captionSize(text)}`}>{text}</p>
  </div>
);

const SyncedMedia = ({ item, startAt, volume }: { item: PlaybackView; startAt: number; volume: number }) => {
  const element = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  // The clock correction can still shift the start by a few ms: that must adjust playback, not restart it.
  const timing = useRef({ startAt, clipStartMs: item.clipStartMs, durationMs: item.durationMs });
  timing.current = { startAt, clipStartMs: item.clipStartMs, durationMs: item.durationMs };

  useEffect(() => {
    if (element.current) element.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const media = element.current;
    if (!media) return;

    const correct = () => {
      const { startAt: start, clipStartMs, durationMs } = timing.current;
      const elapsedMs = Date.now() - start;
      if (elapsedMs < 0 || media.ended) return;
      if (elapsedMs >= durationMs) {
        media.pause();
        return;
      }

      const target = (clipStartMs + elapsedMs) / 1000;
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
  }, [item.mediaUrl]);

  const url = item.mediaUrl ?? undefined;
  return item.kind === 'video' ? (
    <video ref={element} className="overlay-media" src={url} preload="auto" playsInline data-testid="overlay-video" />
  ) : (
    <audio ref={element} src={url} preload="auto" data-testid="overlay-audio" />
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

const Playing = ({
  item,
  startAt,
  layout,
  volume,
}: {
  item: PlaybackView;
  startAt: number;
  layout: OverlayLayout;
  volume: number;
}) => {
  const onScreen = useOnScreen(startAt, item.durationMs);

  return (
    <div className={onScreen ? 'scene' : 'scene is-waiting'} data-testid="overlay-scene" data-on-screen={onScreen}>
      <Profile name={item.senderName} zone={layout.profile} />
      {item.mediaUrl && item.kind === 'image' && (
        <div className="zone zone-media" style={zoneStyle(layout.media)}>
          <img className="overlay-media" src={item.mediaUrl} alt="" data-testid="overlay-image" />
        </div>
      )}
      {item.kind === 'video' && (
        <div className="zone zone-media" style={zoneStyle(layout.media)}>
          <SyncedMedia item={item} startAt={startAt} volume={volume} />
        </div>
      )}
      {item.kind === 'audio' && <SyncedMedia item={item} startAt={startAt} volume={volume} />}
      {item.caption && <Caption text={item.caption} zone={layout.text} />}
    </div>
  );
};

const TestScene = ({ layout }: { layout: OverlayLayout }) => (
  <div className="scene" data-testid="overlay-test">
    <Profile name="Ton pseudo" zone={layout.profile} />
    <div className="zone zone-media" style={zoneStyle(layout.media)}>
      <img className="overlay-media" src={logo} alt="" />
    </div>
    <Caption text="Ceci est un texte de test" zone={layout.text} />
  </div>
);

const Stage = () => {
  const state = useAppState();
  if (!state) return null;

  const { settings, overlayTest } = state;
  const { current } = state.queue;
  const playing = settings.overlayEnabled && current?.startAt != null ? current : null;
  const volume = settings.muted ? 0 : settings.volume / 100;

  return (
    <main className="stage" data-testid="stage" data-state={playing ? 'playing' : overlayTest ? 'test' : 'idle'}>
      {playing && (
        <Playing key={playing.id} item={playing} startAt={playing.startAt!} layout={settings.layout} volume={volume} />
      )}
      {!playing && overlayTest && <TestScene layout={settings.layout} />}
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage />
  </StrictMode>,
);
