import { useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_DISPLAY_MS,
  MAX_CAPTION_LENGTH,
  MAX_CLIP_MS,
  MAX_DISPLAY_MS,
  MIN_DISPLAY_MS,
} from '@livechatsbcb/protocol';
import type { AppState, DraftMedia } from '../../../shared/ipc';
import { IconPlay, KindIcon } from './icons';
import { mediaErrorMessage } from './messages';
import { Slider } from './NowPlaying';
import type { Clip, DraftFiles } from './use-draft';

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

  const edge = (ms: number) => (lengthMs ? ms / lengthMs : 0);

  return (
    <>
      <div className="draft-picture">
        {draft.kind === 'video' ? (
          <video className="draft-media" playsInline {...handlers} />
        ) : (
          <>
            <span className="kind-tile is-large">
              <KindIcon kind="audio" size={28} />
            </span>
            <audio {...handlers} />
          </>
        )}
      </div>

      {clip && lengthMs !== null && lengthMs > MIN_DISPLAY_MS && (
        <div className="clip">
          <div
            className="clip-range"
            style={{ '--start': edge(clip.startMs), '--end': edge(clip.endMs) } as CSSProperties}
          >
            <i className="clip-chosen" aria-hidden="true" />
            <input
              type="range"
              aria-label="Début du passage"
              min={0}
              max={lengthMs}
              step={100}
              value={clip.startMs}
              onChange={(event) => setStart(Number(event.target.value))}
            />
            <input
              type="range"
              aria-label="Fin du passage"
              min={0}
              max={lengthMs}
              step={100}
              value={clip.endMs}
              onChange={(event) => setEnd(Number(event.target.value))}
            />
          </div>
          <div className="clip-foot">
            <span className="clip-time">
              Début <strong className="mono" data-testid="clip-start">{formatTime(clip.startMs)}</strong>
            </span>
            <span className="clip-time">
              Fin <strong className="mono" data-testid="clip-end">{formatTime(clip.endMs)}</strong>
            </span>
            <span className="spacer" />
            <button type="button" className="pill secondary small" onClick={preview}>
              <IconPlay size={16} />
              Prévisualiser <span className="mono">{formatTime(clip.endMs - clip.startMs)}</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const MediaScreen = ({ state, files }: { state: AppState; files: DraftFiles }) => {
  const { draft, clip, unreadable } = files;
  const [caption, setCaption] = useState('');
  const [displayMs, setDisplayMs] = useState(DEFAULT_DISPLAY_MS);
  const [error, setError] = useState<string | null>(null);

  const isUploading = state.upload !== null;
  const plays = draft !== null && draft.kind !== 'image';
  const hasContent = draft ? !unreadable && (!plays || clip !== null) : caption.trim().length > 0;
  const isOnline = state.party?.connection === 'online';

  const pick = async () => {
    setError(null);
    setError((await files.pick()).error);
  };

  const send = async () => {
    setError(null);
    const timing =
      plays && clip
        ? { clipStartMs: clip.startMs, durationMs: Math.max(MIN_DISPLAY_MS, clip.endMs - clip.startMs) }
        : { clipStartMs: 0, durationMs: displayMs };

    const result = await window.liveChat.sendMedia({ caption, withFile: draft !== null, ...timing });
    if (result.ok) {
      files.reset();
      // Keeps whatever was typed while this one was on its way.
      setCaption((typed) => (typed === caption ? '' : typed));
    } else if (result.error !== 'cancelled') {
      setError(mediaErrorMessage(result.error));
    }
  };

  return (
    <div className="media-grid">
      <section className="glass media-main" aria-label="Ton média">
        {draft ? (
          <>
            <header className="draft-head">
              <span className="kind-tile is-small">
                <KindIcon kind={draft.kind} size={16} />
              </span>
              <span className="draft-name" title={draft.name} data-testid="draft-name">
                {draft.name}
              </span>
              <span className="count mono">{formatSize(draft.size)}</span>
              {!isUploading && (
                <button type="button" className="pill quiet small" onClick={files.remove}>
                  Retirer
                </button>
              )}
            </header>
            {draft.kind === 'image' ? (
              <div className="draft-picture">
                <img
                  className="draft-media"
                  src={draft.previewUrl}
                  alt=""
                  onError={() => files.setUnreadable(true)}
                />
              </div>
            ) : (
              <ClipEditor
                key={draft.previewUrl}
                draft={draft}
                clip={clip}
                onClip={files.setClip}
                onUnreadable={() => files.setUnreadable(true)}
              />
            )}
            {unreadable && (
              <p className="error" role="alert">
                Ce fichier ne peut pas être lu. Essaie un autre format.
              </p>
            )}
          </>
        ) : (
          <div className="draft-empty">
            <p className="draft-empty-title">Une image, une vidéo ou un son</p>
            <p className="hint">500 Mo maximum. Effacé du serveur après 1 jour.</p>
            <button type="button" className="pill primary" disabled={isUploading} onClick={() => void pick()}>
              Choisir un fichier
            </button>
          </div>
        )}
      </section>

      <section className="glass panel media-side" aria-label="Envoyer un média">
        <h2>Envoyer à la party</h2>

        <label className="field">
          <span>{draft ? 'Texte à afficher (facultatif)' : 'Texte à afficher'}</span>
          <textarea
            className="input is-area"
            value={caption}
            maxLength={MAX_CAPTION_LENGTH}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Ton message, en bas de l’écran de tout le monde"
          />
        </label>

        <span className="spacer" />

        {!plays && (
          <label className="field">
            <span className="field-line">
              Durée d’affichage <strong className="mono" data-testid="display-seconds">{displayMs / 1000} s</strong>
            </span>
            <Slider
              value={displayMs}
              min={MIN_DISPLAY_MS}
              max={MAX_DISPLAY_MS}
              step={1000}
              onChange={setDisplayMs}
            />
          </label>
        )}

        {state.upload ? (
          <div className="upload" role="status">
            <div className="field-line">
              <span>
                Envoi… <span className="mono">{state.upload.percent} %</span>
              </span>
              <button type="button" className="pill quiet small" onClick={() => void window.liveChat.cancelUpload()}>
                Annuler
              </button>
            </div>
            <progress max={100} value={state.upload.percent} />
          </div>
        ) : (
          <button type="button" className="pill primary" disabled={!hasContent || !isOnline} onClick={() => void send()}>
            Envoyer à tout le monde
          </button>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
};
