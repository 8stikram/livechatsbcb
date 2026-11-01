import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { HistoryView, PlaybackView, Settings, UpcomingView } from '../../../shared/ipc';
import { Progress } from '../Progress';
import { useSyncedMedia } from '../use-synced-media';
import { IconMuted, IconSkip, IconSound, KindIcon } from './icons';

const KIND_TEXT = {
  image: 'Une image',
  video: 'Une vidéo',
  audio: 'Un son',
  text: 'Un texte',
};

export const mediaTitle = ({ fileName, caption, kind }: Pick<HistoryView | UpcomingView, 'fileName' | 'caption' | 'kind'>): string =>
  fileName ?? (caption ? `« ${caption} »` : KIND_TEXT[kind]);

export const Slider = ({
  value,
  min,
  max,
  step,
  label,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label?: string;
  onChange: (value: number) => void;
}) => (
  <input
    className="slider"
    type="range"
    min={min}
    max={max}
    step={step}
    value={value}
    aria-label={label}
    style={{ '--fill': (value - min) / (max - min) } as CSSProperties}
    onChange={(event) => onChange(Number(event.target.value))}
  />
);

export const MuteButton = ({ settings }: { settings: Settings }) => (
  <button
    type="button"
    className="round glassy"
    title={settings.muted ? 'Remettre le son' : 'Couper le son chez moi'}
    aria-label={settings.muted ? 'Remettre le son' : 'Couper le son chez moi'}
    aria-pressed={settings.muted}
    onClick={() => void window.liveChat.setSettings({ muted: !settings.muted })}
  >
    {settings.muted ? <IconMuted /> : <IconSound />}
  </button>
);

const SkipButton = ({ mediaId }: { mediaId: string | null }) => (
  <button
    type="button"
    className="round solid"
    title="Passer"
    aria-label="Passer"
    disabled={mediaId === null}
    onClick={() => mediaId && void window.liveChat.skipMedia(mediaId)}
  >
    <IconSkip />
  </button>
);

const PreviewVideo = ({ item, startAt }: { item: PlaybackView; startAt: number }) => {
  const element = useRef<HTMLVideoElement>(null);
  useSyncedMedia(element, { ...item, startAt, clipStartMs: item.hasSound ? 0 : item.clipStartMs });
  // The sound is the overlay's job: this is only there to see what everyone is seeing.
  return <video ref={element} className="now-media" src={item.mediaUrl ?? undefined} muted playsInline preload="auto" />;
};

const Preview = ({ item }: { item: PlaybackView }) => {
  const { kind, mediaUrl, startAt, caption } = item;

  if (startAt === null) {
    return (
      <div className="now-empty">
        <span className="spinner" aria-hidden="true" />
        <p>Le média arrive sur tous les PC…</p>
      </div>
    );
  }

  return (
    <>
      {kind === 'image' && mediaUrl && <img className="now-media" src={mediaUrl} alt="" />}
      {kind === 'video' && mediaUrl && <PreviewVideo item={item} startAt={startAt} />}
      {kind === 'audio' && (
        <span className="sound-bars is-large" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      {caption && <p className={kind === 'text' ? 'now-caption is-alone' : 'now-caption'}>{caption}</p>}
    </>
  );
};

// Nothing should be decoding a video in here while the window is out of sight and a game needs the machine.
const usePageVisible = (): boolean => {
  const [visible, setVisible] = useState(document.visibilityState === 'visible');

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return visible;
};

export const NowCard = ({
  current,
  settings,
  active,
}: {
  current: PlaybackView | null;
  settings: Settings;
  active: boolean;
}) => {
  const visible = usePageVisible();
  const startAt = current?.startAt ?? null;

  return (
    <section className="glass now" aria-label="En ce moment">
      <div className="now-stage">
        {current ? (
          active && visible && <Preview key={`${current.id}-${startAt !== null}`} item={current} />
        ) : (
          <div className="now-empty">
            <p className="now-empty-title">Rien à l'écran pour l'instant</p>
            <p>Ce que quelqu'un envoie s'affiche ici, et chez tout le monde au même moment.</p>
          </div>
        )}
        {startAt !== null && (
          <span className="now-pill">
            <span className="dot" aria-hidden="true" />
            En ce moment sur tous les écrans
          </span>
        )}
      </div>

      <div className="now-foot">
        <div className="now-info">
          {current ? (
            <>
              <p className="now-title" title={mediaTitle(current)} data-testid="now-playing">
                {mediaTitle(current)}
              </p>
              <p className="now-by">Envoyé par {current.senderName}</p>
              {/* A hidden animation starts over when it comes back, so this one is drawn again from where things are. */}
              {active && startAt !== null && <Progress key={current.id} startAt={startAt} durationMs={current.durationMs} />}
            </>
          ) : (
            <p className="now-by">La file est vide.</p>
          )}
        </div>
        <div className="now-controls">
          <MuteButton settings={settings} />
          <Slider
            label="Niveau du son"
            value={settings.volume}
            min={0}
            max={100}
            onChange={(volume) => void window.liveChat.setSettings({ volume })}
          />
          <SkipButton mediaId={current?.id ?? null} />
        </div>
      </div>
    </section>
  );
};

// The same thing, smaller, on the tabs where the big card isn't.
export const NowBar = ({
  current,
  waiting,
  settings,
}: {
  current: PlaybackView;
  waiting: number;
  settings: Settings;
}) => (
  <section className="glass nowbar" aria-label="En ce moment">
    <span className="kind-tile">
      <KindIcon kind={current.kind} />
    </span>
    <div className="now-info">
      <p className="now-title" title={mediaTitle(current)} data-testid="now-playing">
        {current.startAt === null ? 'Bientôt : ' : ''}
        {mediaTitle(current)}
      </p>
      <p className="now-by">
        Envoyé par {current.senderName}
        {waiting > 0 && (
          <span data-testid="queue-waiting"> · {waiting} en attente</span>
        )}
      </p>
      {current.startAt !== null && <Progress key={current.id} startAt={current.startAt} durationMs={current.durationMs} />}
    </div>
    <MuteButton settings={settings} />
    <SkipButton mediaId={current.id} />
  </section>
);
