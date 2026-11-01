import { useRef, useState } from 'react';
import {
  DEFAULT_DISPLAY_MS,
  MAX_CAPTION_LENGTH,
  MAX_CLIP_MS,
  MAX_DISPLAY_MS,
  MIN_DISPLAY_MS,
  type MediaKind,
} from '@livechatsbcb/protocol';
import type { AppState, DraftMedia, PlaybackView } from '../../../shared/ipc';
import { mediaErrorMessage, pickErrorMessage } from './messages';

const KIND_TEXT: Record<MediaKind, string> = {
  image: 'une image',
  video: 'une vidéo',
  audio: 'un son',
  text: 'un texte',
};

type Clip = { startMs: number; endMs: number };

const formatTime = (ms: number): string => {
  const tenths = Math.floor(ms / 100);
  const minutes = Math.floor(tenths / 600);
  const seconds = Math.floor(tenths / 10) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')},${tenths % 10}`;
};

const formatSize = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} Ko`
    : `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;

const ClipEditor = ({
  draft,
  clip,
  onClip,
  onUnreadable,
}: {
  draft: DraftMedia;
  clip: Clip | null;
  onClip: (clip: Clip) => void;
  onUnreadable: () => void;
}) => {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const previewEndMs = useRef<number | null>(null);
  const [lengthMs, setLengthMs] = useState<number | null>(null);

  const onDuration = () => {
    const element = media.current;
    if (!element || lengthMs !== null || !Number.isFinite(element.duration) || element.duration <= 0) return;

    const length = Math.round(element.duration * 1000);
    element.currentTime = 0;
    setLengthMs(length);
    onClip({ startMs: 0, endMs: Math.min(length, MAX_CLIP_MS) });
  };

  // Some recorders write no duration in the file: asking for a far-off position makes the browser work it out.
  const onMetadata = () => {
    const element = media.current;
    if (element && !Number.isFinite(element.duration)) element.currentTime = Number.MAX_SAFE_INTEGER;
    else onDuration();
  };

  const seek = (ms: number) => {
    previewEndMs.current = null;
    if (media.current) {
      media.current.pause();
      media.current.currentTime = ms / 1000;
    }
  };

  const setStart = (startMs: number) => {
    if (!clip) return;
    const start = Math.min(startMs, Math.max(0, clip.endMs - MIN_DISPLAY_MS));
    onClip({ startMs: start, endMs: Math.min(clip.endMs, start + MAX_CLIP_MS) });
    seek(start);
  };

  const setEnd = (endMs: number) => {
    if (!clip || lengthMs === null) return;
    const end = Math.min(lengthMs, Math.max(endMs, clip.startMs + MIN_DISPLAY_MS));
    onClip({ startMs: Math.max(clip.startMs, end - MAX_CLIP_MS), endMs: end });
    seek(end);
  };

  const preview = () => {
    if (!clip || !media.current) return;
    media.current.currentTime = clip.startMs / 1000;
    previewEndMs.current = clip.endMs;
    void media.current.play().catch(() => {});
  };

  const onTime = () => {
    const element = media.current;
    if (element && previewEndMs.current !== null && element.currentTime * 1000 >= previewEndMs.current) {
      element.pause();
      previewEndMs.current = null;
    }
  };

  const handlers = {
    ref: media,
    src: draft.previewUrl,
    preload: 'metadata',
    onLoadedMetadata: onMetadata,
    onDurationChange: onDuration,
    onTimeUpdate: onTime,
    onError: onUnreadable,
  };

  return (
    <>
      {draft.kind === 'video' ? <video className="draft-preview" playsInline {...handlers} /> : <audio {...handlers} />}
      {clip && lengthMs !== null && lengthMs > MIN_DISPLAY_MS && (
        <div className="clip">
          <label className="field">
            <span>
              Début du passage : <strong data-testid="clip-start">{formatTime(clip.startMs)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={lengthMs}
              step={100}
              value={clip.startMs}
              onChange={(event) => setStart(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>
              Fin du passage : <strong data-testid="clip-end">{formatTime(clip.endMs)}</strong>
            </span>
            <input
              type="range"
              min={0}
              max={lengthMs}
              step={100}
              value={clip.endMs}
              onChange={(event) => setEnd(Number(event.target.value))}
            />
          </label>
          <button type="button" className="secondary compact" onClick={preview}>
            Prévisualiser le passage ({formatTime(clip.endMs - clip.startMs)})
          </button>
        </div>
      )}
    </>
  );
};

const NowPlaying = ({ current, waiting }: { current: PlaybackView | null; waiting: number }) => (
  <section className="panel" aria-label="File d’attente">
    <h2>À l’écran</h2>
    {current ? (
      <div className="now-playing">
        <p data-testid="now-playing">
          {current.startAt === null ? 'Bientôt : ' : ''}
          {current.senderName} a envoyé {KIND_TEXT[current.kind]}
        </p>
        <button type="button" className="secondary compact" onClick={() => void window.liveChat.skipMedia(current.id)}>
          Passer
        </button>
      </div>
    ) : (
      <p className="hint">Rien pour le moment.</p>
    )}
    {waiting > 0 && (
      <p className="hint" data-testid="queue-waiting">
        {waiting} en attente
      </p>
    )}
  </section>
);

export const MediaScreen = ({ state }: { state: AppState }) => {
  const [draft, setDraft] = useState<DraftMedia | null>(null);
  const [caption, setCaption] = useState('');
  const [clip, setClip] = useState<Clip | null>(null);
  const [displayMs, setDisplayMs] = useState(DEFAULT_DISPLAY_MS);
  const [unreadable, setUnreadable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isUploading = state.upload !== null;
  const plays = draft !== null && draft.kind !== 'image';
  const hasContent = draft ? !unreadable && (!plays || clip !== null) : caption.trim().length > 0;
  const isOnline = state.party?.connection === 'online';

  const reset = () => {
    setDraft(null);
    setClip(null);
    setUnreadable(false);
  };

  const pick = async () => {
    setError(null);
    const result = await window.liveChat.pickMedia();
    if (result.ok) {
      setClip(null);
      setUnreadable(false);
      setDraft(result.draft);
    } else if (result.error !== 'cancelled') {
      setError(pickErrorMessage(result.error));
    }
  };

  const remove = () => {
    reset();
    void window.liveChat.clearDraft();
  };

  const send = async () => {
    setError(null);
    const timing =
      plays && clip
        ? { clipStartMs: clip.startMs, durationMs: Math.max(MIN_DISPLAY_MS, clip.endMs - clip.startMs) }
        : { clipStartMs: 0, durationMs: displayMs };

    const result = await window.liveChat.sendMedia({ caption, withFile: draft !== null, ...timing });
    if (result.ok) {
      reset();
      // Keeps whatever was typed while this one was on its way.
      setCaption((typed) => (typed === caption ? '' : typed));
    } else if (result.error !== 'cancelled') {
      setError(mediaErrorMessage(result.error));
    }
  };

  return (
    <main className="screen">
      <section className="panel" aria-label="Envoyer un média">
        <h2>Envoyer à la party</h2>

        {draft ? (
          <div className="draft">
            <div className="draft-head">
              <span className="draft-name" data-testid="draft-name">
                {draft.name}
              </span>
              <span className="hint">{formatSize(draft.size)}</span>
              {!isUploading && (
                <button type="button" className="quiet" onClick={remove}>
                  Retirer
                </button>
              )}
            </div>
            {draft.kind === 'image' ? (
              <img className="draft-preview" src={draft.previewUrl} alt="" onError={() => setUnreadable(true)} />
            ) : (
              <ClipEditor key={draft.previewUrl} draft={draft} clip={clip} onClip={setClip} onUnreadable={() => setUnreadable(true)} />
            )}
            {unreadable && (
              <p className="error" role="alert">
                Ce fichier ne peut pas être lu. Essaie un autre format.
              </p>
            )}
          </div>
        ) : (
          <div className="draft-empty">
            <button type="button" className="secondary" disabled={isUploading} onClick={() => void pick()}>
              Choisir un fichier
            </button>
            <p className="hint">Image, vidéo ou son, 500 Mo maximum. Effacé du serveur après 1 jour.</p>
          </div>
        )}

        {!plays && (
          <label className="field">
            <span>
              Durée d’affichage : <strong data-testid="display-seconds">{displayMs / 1000} s</strong>
            </span>
            <input
              type="range"
              min={MIN_DISPLAY_MS}
              max={MAX_DISPLAY_MS}
              step={1000}
              value={displayMs}
              onChange={(event) => setDisplayMs(Number(event.target.value))}
            />
          </label>
        )}

        <label className="field">
          <span>{draft ? 'Texte à afficher (facultatif)' : 'Texte à afficher'}</span>
          <textarea
            rows={2}
            value={caption}
            maxLength={MAX_CAPTION_LENGTH}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Ton message, en bas de l’écran de tout le monde"
          />
        </label>

        {state.upload ? (
          <div className="upload" role="status">
            <div className="upload-head">
              <span>Envoi… {state.upload.percent} %</span>
              <button type="button" className="quiet" onClick={() => void window.liveChat.cancelUpload()}>
                Annuler
              </button>
            </div>
            <progress max={100} value={state.upload.percent} />
          </div>
        ) : (
          <button type="button" className="primary" disabled={!hasContent || !isOnline} onClick={() => void send()}>
            Envoyer à tout le monde
          </button>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>

      <NowPlaying current={state.queue.current} waiting={state.queue.waiting} />
    </main>
  );
};
