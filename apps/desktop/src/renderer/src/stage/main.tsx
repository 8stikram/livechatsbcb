import { StrictMode, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import type { Account } from '@livechatsbcb/protocol';
import type { OverlayLayout, PlaybackView, Zone } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { useAppState } from '../use-app-state';
import { useSyncedMedia } from '../use-synced-media';
import logo from '../assets/logo.png';
import '../styles.css';

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

const Profile = ({ name, avatarUrl, zone }: { name: string; avatarUrl: string | null; zone: Zone }) => (
  <div className="zone zone-profile" style={zoneStyle(zone)} data-testid="overlay-profile">
    <Avatar className="profile-avatar" name={name} url={avatarUrl} testId="overlay-avatar" />
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
  useSyncedMedia(element, { ...item, startAt });

  useEffect(() => {
    if (element.current) element.current.volume = volume;
  }, [volume]);

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
      <Profile name={item.senderName} avatarUrl={item.senderAvatarUrl} zone={layout.profile} />
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

const TestScene = ({ layout, account }: { layout: OverlayLayout; account: Account | null }) => (
  <div className="scene" data-testid="overlay-test">
    <Profile name={account?.name ?? 'Ton pseudo'} avatarUrl={account?.avatarUrl ?? null} zone={layout.profile} />
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
  const shared = settings.overlayEnabled && current?.startAt != null ? current : null;
  const replay = state.localReplay?.playback ?? null;
  const playing = shared ?? replay;
  const volume = settings.muted ? 0 : settings.volume / 100;
  const scene = shared ? 'playing' : replay ? 'replay' : overlayTest ? 'test' : 'idle';

  return (
    <main className="stage" data-testid="stage" data-state={scene}>
      {playing && (
        <Playing key={playing.id} item={playing} startAt={playing.startAt!} layout={settings.layout} volume={volume} />
      )}
      {!playing && overlayTest && <TestScene layout={settings.layout} account={state.account} />}
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage />
  </StrictMode>,
);
