import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import {
  MAX_CAPTION_LENGTH,
  MAX_CLIP_MS,
  MAX_DISPLAY_MS,
  MIN_DISPLAY_MS,
} from '@livechatsbcb/protocol';
import type { AppState, DraftMedia, DraftSlot, PlaybackView, SceneInput } from '../../../shared/ipc';
import { Caption, Profile, ScreenPreview, zoneStyle } from '../scene';
import { LayerPanel, SceneBoard } from './AdvancedEditor';
import { IconPlay, KindIcon } from './icons';
import { canSendIn, mediaErrorMessage } from './messages';
import { Slider } from './NowPlaying';
import { Switch } from './SettingsScreen';
import type { Clip, DraftFiles } from './use-draft';
import type { Scene } from './use-scene';

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

// The screen in small, with what the others will see: the same zones, the same text.
const LivePreview = ({ state, caption, children }: { state: AppState; caption: string; children?: ReactNode }) => {
  const { layout } = state.settings;
  return (
    <ScreenPreview testId="live-preview">
      <div className="scene">
        <Profile name={state.account?.name ?? ''} avatarUrl={state.account?.avatarUrl ?? null} zone={layout.profile} />
        {children && (
          <div className="zone zone-media" style={zoneStyle(layout.media)}>
            {children}
          </div>
        )}
        {caption.trim() && <Caption text={caption} zone={layout.text} />}
      </div>
    </ScreenPreview>
  );
};

const ClipEditor = ({
  draft,
  besidePicture,
  noPreview = false,
  state,
  caption,
  clip,
  onClip,
  onUnreadable,
}: {
  draft: Pick<DraftMedia, 'kind' | 'previewUrl'>;
  // The picture is shown above it, so a sound doesn't need its own place.
  besidePicture: boolean;
  // The advanced mode has its own preview, of everything at once.
  noPreview?: boolean;
  state: AppState;
  caption: string;
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
    // A saved LiveChat comes back with its passage already chosen.
    if (!clip || clip.endMs > length) onClip({ startMs: 0, endMs: Math.min(length, MAX_CLIP_MS) });
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
      {besidePicture ? (
        <audio {...handlers} />
      ) : draft.kind === 'video' ? (
        <LivePreview state={state} caption={caption}>
          <video className="overlay-media" playsInline {...handlers} />
        </LivePreview>
      ) : (
        <>
          <LivePreview state={state} caption={caption} />
          <audio {...handlers} />
        </>
      )}

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
            {noPreview ? (
              <span className="mono hint">{formatTime(clip.endMs - clip.startMs)}</span>
            ) : (
              <button type="button" className="pill secondary small" onClick={preview}>
                <IconPlay size={16} />
                Prévisualiser <span className="mono">{formatTime(clip.endMs - clip.startMs)}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
};

const DraftRow = ({
  file,
  slot,
  locked,
  onRemove,
}: {
  file: DraftMedia;
  slot: DraftSlot;
  locked: boolean;
  onRemove: (slot: DraftSlot) => void;
}) => (
  <header className="draft-head">
    <span className="kind-tile is-small">
      <KindIcon kind={file.kind} size={16} />
    </span>
    <span className="draft-name" title={file.name} data-testid="draft-name">
      {file.name}
    </span>
    <span className="count mono">{formatSize(file.size)}</span>
    {!locked && (
      <button type="button" className="pill quiet small" onClick={() => onRemove(slot)}>
        Retirer
      </button>
    )}
  </header>
);

export const MediaScreen = ({
  state,
  files,
  scene,
  active,
  onOpenLibrary,
}: {
  state: AppState;
  files: DraftFiles;
  scene: Scene;
  active: boolean;
  onOpenLibrary: (category: 'image' | 'audio') => void;
}) => {
  const { picture, sound, leader, hasFiles, clip, unreadable, caption, displayMs, videoMuted, soundMuted } = files;
  const [preview, setPreview] = useState<{ item: PlaybackView; startAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isUploading = state.upload !== null;
  const advanced = scene.active;
  const plays = advanced ? scene.leader !== null : leader !== null;
  const hasContent = advanced
    ? scene.layers.length > 0 && (!plays || scene.clip !== null)
    : hasFiles
      ? !unreadable && (!plays || clip !== null)
      : caption.trim().length > 0;
  const selectedLayer = advanced ? (scene.layers.find(({ key }) => key === scene.selected) ?? null) : null;
  const isOnline = canSendIn(state.party);

  const pick = async (slot?: DraftSlot) => {
    setError(null);
    setError((await files.pick(slot)).error);
  };

  const recipe = () => ({
    caption,
    videoMuted,
    soundMuted,
    withPicture: picture !== null,
    withSound: sound !== null,
    ...(plays && clip
      ? { clipStartMs: clip.startMs, durationMs: Math.max(MIN_DISPLAY_MS, clip.endMs - clip.startMs) }
      : { clipStartMs: 0, durationMs: displayMs }),
  });

  const sceneInput = (): SceneInput => ({
    caption,
    videoMuted,
    soundMuted,
    layers: scene.layers.map(({ key: _key, ...layer }) => layer),
    soundId: scene.soundId,
    ...(scene.clip
      ? { clipStartMs: scene.clip.startMs, durationMs: Math.max(MIN_DISPLAY_MS, scene.clip.endMs - scene.clip.startMs) }
      : { clipStartMs: 0, durationMs: displayMs }),
  });

  const stopPreview = () => setPreview(null);

  // Played right here with its sound and its effects: nothing leaves this PC.
  const startPreview = () => {
    const input = sceneInput();
    const startAt = Date.now() + 300;
    setPreview({
      startAt,
      item: {
        id: 'preview',
        senderName: state.account?.name ?? '',
        senderAvatarUrl: state.account?.avatarUrl ?? null,
        kind: scene.hasVideo ? 'video' : 'image',
        caption: input.caption.trim(),
        fileName: null,
        clipStartMs: input.clipStartMs,
        durationMs: input.durationMs,
        startAt,
        mediaUrl: null,
        hasSound: scene.sound !== null,
        soundUrl: scene.sound?.previewUrl ?? null,
        videoMuted,
        soundMuted,
        scene: input.layers.map(({ fileId, ...layer }) => {
          const file = scene.fileOf(fileId);
          return { ...layer, kind: file?.kind === 'video' ? 'video' : 'image', url: file?.previewUrl ?? null };
        }),
      },
    });
  };

  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(stopPreview, preview.startAt + preview.item.durationMs - Date.now() + 200);
    return () => clearTimeout(timer);
  }, [preview]);

  useEffect(() => {
    if (!active) stopPreview();
  }, [active]);

  const switchMode = async (toAdvanced: boolean) => {
    setError(null);
    setSaved(false);
    stopPreview();
    if (!toAdvanced) scene.leave();
    else setError(await scene.enter());
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!saveName?.trim()) return;
    setError(null);
    const result = advanced
      ? await window.liveChat.saveScene({ ...sceneInput(), name: saveName })
      : await window.liveChat.saveLiveChat({ ...recipe(), name: saveName });
    if (result.ok) {
      setSaveName(null);
      setSaved(true);
    } else {
      setError(mediaErrorMessage(result.error));
    }
  };

  const send = async () => {
    setError(null);
    setSaved(false);
    stopPreview();
    const result = advanced ? await window.liveChat.sendScene(sceneInput()) : await window.liveChat.sendMedia(recipe());
    if (result.ok) {
      if (advanced) scene.clearStage();
      else files.reset();
      // Keeps whatever was typed while this one was on its way.
      files.setCaption((typed) => (typed === caption ? '' : typed));
    } else if (result.error !== 'cancelled') {
      setError(mediaErrorMessage(result.error));
    }
  };

  // Each second of the countdown, so that what was just typed comes back too.
  useEffect(() => {
    if (state.restartIn !== null) void window.liveChat.stashDraft(advanced, advanced ? sceneInput() : recipe());
  }, [state.restartIn]);

  // Only while this screen is the one in use, and never while someone types.
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'Enter' && hasContent && isOnline && !isUploading) {
        event.preventDefault();
        void send();
        return;
      }
      const target = event.target as HTMLElement;
      if (!advanced || target.closest('input, textarea, select')) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey && key === 'z') {
        event.preventDefault();
        scene.undo();
      } else if (event.ctrlKey && key === 'y') {
        event.preventDefault();
        scene.redo();
      } else if (event.key === 'Delete' && scene.selected) {
        scene.removeLayer(scene.selected);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const modeSwitch = (
    <div className="tabs media-mode" role="group" aria-label="Mode">
      <button type="button" className={advanced ? 'tab' : 'tab is-active'} aria-pressed={!advanced} onClick={() => void switchMode(false)}>
        Simple
      </button>
      <button type="button" className={advanced ? 'tab is-active' : 'tab'} aria-pressed={advanced} onClick={() => void switchMode(true)}>
        Avancé
      </button>
    </div>
  );

  return (
    <div className="media-grid">
      <section className="glass media-main" aria-label="Ton LiveChat">
        {modeSwitch}
        {advanced ? (
          <>
            <SceneBoard scene={scene} state={state} caption={caption} preview={preview} onError={setError} onStopPreview={stopPreview} />
            {scene.sound && <DraftRow file={scene.sound} slot="sound" locked={isUploading} onRemove={scene.removeSound} />}
            {scene.leader && (
              <ClipEditor
                key={scene.leader.previewUrl}
                draft={scene.leader}
                besidePicture
                noPreview
                state={state}
                caption={caption}
                clip={scene.clip}
                onClip={scene.setClip}
                onUnreadable={() => setError('Ce fichier ne peut pas être lu. Essaie un autre format.')}
              />
            )}
          </>
        ) : hasFiles ? (
          <>
            {picture && <DraftRow file={picture} slot="picture" locked={isUploading} onRemove={files.remove} />}
            {sound && <DraftRow file={sound} slot="sound" locked={isUploading} onRemove={files.remove} />}
            {!isUploading && (!picture || !sound) && (
              <div className="draft-add" role="group" aria-label={picture ? 'Ajouter un son' : 'Ajouter une image ou une vidéo'}>
                <span className="hint">{picture ? 'Ajouter un son' : 'Ajouter une image ou une vidéo'}</span>
                <button type="button" className="pill quiet small" onClick={() => onOpenLibrary(picture ? 'audio' : 'image')}>
                  Depuis ma bibliothèque
                </button>
                <button type="button" className="pill quiet small" onClick={() => void pick(picture ? 'sound' : 'picture')}>
                  Depuis mon PC
                </button>
              </div>
            )}
            {picture?.kind === 'image' && (
              <LivePreview state={state} caption={caption}>
                <img className="overlay-media" src={picture.previewUrl} alt="" onError={() => files.setUnreadable(true)} />
              </LivePreview>
            )}
            {leader && (
              <ClipEditor
                key={leader.previewUrl}
                draft={leader}
                besidePicture={leader === sound && picture !== null}
                state={state}
                caption={caption}
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
            {caption.trim() && <LivePreview state={state} caption={caption} />}
            <p className="draft-empty-title">Une image ou une vidéo, avec un son si tu veux</p>
            <p className="hint">500 Mo maximum. Effacé du serveur après 1 jour.</p>
            <div className="draft-choice">
              <button type="button" className="pill primary" disabled={isUploading} onClick={() => onOpenLibrary('image')}>
                Depuis ma bibliothèque
              </button>
              <button type="button" className="pill secondary" disabled={isUploading} onClick={() => void pick()}>
                Depuis mon PC
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="glass panel media-side" aria-label="Envoyer ton LiveChat">
        <h2>{selectedLayer ? 'Cet élément' : 'Envoyer à la party'}</h2>

        {selectedLayer && <LayerPanel scene={scene} layer={selectedLayer} />}

        <label className="field" hidden={selectedLayer !== null}>
          <span>{hasFiles || advanced ? 'Texte à afficher (facultatif)' : 'Texte à afficher'}</span>
          <textarea
            className="input is-area"
            value={caption}
            maxLength={MAX_CAPTION_LENGTH}
            onChange={(event) => files.setCaption(event.target.value)}
            placeholder="Ton message, en bas de l’écran de tout le monde"
          />
        </label>

        {!selectedLayer && (advanced ? scene.hasVideo && scene.sound : picture?.kind === 'video' && sound) && (
          <div className="stack">
            <Switch checked={!videoMuted} onChange={(on) => files.setVideoMuted(!on)}>
              Son de la vidéo
            </Switch>
            <Switch checked={!soundMuted} onChange={(on) => files.setSoundMuted(!on)}>
              Son ajouté
            </Switch>
          </div>
        )}

        {!selectedLayer && <span className="spacer" />}

        {advanced && !selectedLayer && (
          preview ? (
            <button type="button" className="pill quiet small" onClick={stopPreview}>
              Arrêter l’aperçu
            </button>
          ) : (
            <button type="button" className="pill secondary small" disabled={!hasContent} onClick={startPreview}>
              <IconPlay size={16} />
              Aperçu
            </button>
          )
        )}

        {selectedLayer ? null : saveName !== null ? (
          <form className="save-form" onSubmit={(event) => void save(event)}>
            <label className="field">
              <span>Nom de ce LiveChat</span>
              <input
                className="input"
                autoFocus
                maxLength={80}
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
              />
            </label>
            <div className="field-line">
              <button type="button" className="pill quiet small" onClick={() => setSaveName(null)}>
                Annuler
              </button>
              <button type="submit" className="pill secondary small" disabled={!saveName.trim()}>
                Sauvegarder
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="pill quiet small"
            disabled={!hasContent}
            onClick={() => {
              setSaved(false);
              setSaveName('');
            }}
          >
            Sauvegarder dans la bibliothèque
          </button>
        )}
        {saved && !selectedLayer && (
          <p className="hint" role="status">
            Sauvegardé sur ce PC.
          </p>
        )}

        {!plays && !selectedLayer && (
          <label className="field">
            <span className="field-line">
              Durée d’affichage <strong className="mono" data-testid="display-seconds">{displayMs / 1000} s</strong>
            </span>
            <Slider
              value={displayMs}
              min={MIN_DISPLAY_MS}
              max={MAX_DISPLAY_MS}
              step={1000}
              onChange={files.setDisplayMs}
            />
          </label>
        )}

        {state.upload ? (
          <div className="upload" role="status">
            <div className="field-line">
              {state.upload.paused ? (
                <span data-testid="upload-paused">Pas de connexion : ça partira tout seul à son retour</span>
              ) : (
                <span>
                  Envoi… <span className="mono">{state.upload.percent} %</span>
                </span>
              )}
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
