import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { MAX_SCENE_PICTURES, type Scene3dEffect, type Scene3dMotion, type Scene3dSpeed, type SceneLayer } from '@livechatsbcb/protocol';
import type { AppState, BackdropView, LibraryFileView, LinkDraft, PlaybackView } from '../../../shared/ipc';
import { Caption, Playing, Profile, ScreenPreview, layerLook, layerPlace } from '../scene';
import { KindIcon } from './icons';
import { LazyVideo } from './LazyVideo';
import { Slider } from './NowPlaying';
import { Switch } from './SettingsScreen';
import type { Layer, Scene } from './use-scene';

const PICKER_SIZE = 40;
const DROP_TYPE = 'application/x-livechat-file';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;
const normalizeAngle = (degrees: number) => ((((degrees + 180) % 360) + 360) % 360) - 180;

type Edge = 'n' | 'e' | 's' | 'w';
type Grip = 'move' | 'resize' | 'rotate' | Edge;

const EDGES: readonly Edge[] = ['n', 'e', 's', 'w'];

const Handles = ({ onGrip }: { onGrip: (grip: Grip, event: PointerEvent) => void }) => (
  <>
    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
      <span
        key={corner}
        className={`scene-handle is-${corner}`}
        data-testid={`scene-resize-${corner}`}
        onPointerDown={(event) => onGrip('resize', event)}
      />
    ))}
    {EDGES.map((edge) => (
      <span
        key={edge}
        className={`scene-handle is-edge is-${edge}`}
        data-testid={`scene-stretch-${edge}`}
        onPointerDown={(event) => onGrip(edge, event)}
      />
    ))}
    <span className="scene-handle is-rotate" data-testid="scene-rotate" onPointerDown={(event) => onGrip('rotate', event)} />
  </>
);

// Where you place things, at the proportions of the screen. Everything is in percent of it, as on the overlay.
const SITE_NAMES: Record<LinkDraft['site'], string> = { youtube: 'YouTube', tiktok: 'TikTok', soundcloud: 'SoundCloud' };

const EditingStage = ({ scene, state, caption, link }: { scene: Scene; state: AppState; caption: string; link: LinkDraft | null }) => {
  const box = useRef<HTMLDivElement>(null);
  const gesture = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const { layout } = state.settings;

  // A click next to it lets go of it, anywhere in the window. Controls keep it: they may well be acting on it.
  useEffect(() => {
    if (scene.selected === null) return;
    const onDown = (event: globalThis.PointerEvent) => {
      if (!(event.target as Element).closest?.('.scene-layer, .layer-panel, .clip, button, input, select, textarea, label, a')) scene.setSelected(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') scene.setSelected(null);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [scene.selected]);

  const startGrip = (layer: Layer, grip: Grip, event: PointerEvent) => {
    event.stopPropagation();
    event.preventDefault();
    scene.setSelected(layer.key);
    const rect = box.current?.getBoundingClientRect();
    if (!rect || event.button !== 0) return;

    const id = `grip-${++gesture.current}`;
    const centerX = rect.left + (layer.x / 100) * rect.width;
    const centerY = rect.top + (layer.y / 100) * rect.height;
    const startDistance = Math.max(1, Math.hypot(event.clientX - centerX, event.clientY - centerY));
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);
    const { clientX: startX, clientY: startY } = event;

    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const onMove = (move: globalThis.PointerEvent) => {
      if (grip === 'move') {
        scene.updateLayer(
          layer.key,
          () => ({
            x: round(clamp(layer.x + ((move.clientX - startX) / rect.width) * 100, -50, 150)),
            y: round(clamp(layer.y + ((move.clientY - startY) / rect.height) * 100, -50, 150)),
          }),
          id,
        );
      } else if (EDGES.includes(grip as Edge)) {
        // Along the picture's own sides, whichever way it is turned, with the side across from it staying put.
        const turned = (layer.rotation * Math.PI) / 180;
        const across = [Math.cos(turned), Math.sin(turned)] as const;
        const down = [-Math.sin(turned), Math.cos(turned)] as const;
        const [pushX, pushY] = [move.clientX - startX, move.clientY - startY];
        const startW = (layer.width / 100) * rect.width;
        const startH = startW / layer.aspect;
        const side = grip === 'e' || grip === 's' ? 1 : -1;
        const wide = grip === 'e' || grip === 'w';
        const push = wide ? pushX * across[0] + pushY * across[1] : pushX * down[0] + pushY * down[1];
        const nextW = clamp(wide ? startW + side * push : startW, (2 / 100) * rect.width, (300 / 100) * rect.width);
        const nextH = Math.max(4, wide ? startH : startH + side * push);
        const moved = side * (wide ? nextW - startW : nextH - startH) * 0.5;
        const axis = wide ? across : down;
        scene.updateLayer(
          layer.key,
          () => ({
            width: round((nextW / rect.width) * 100),
            aspect: Math.round(clamp(nextW / nextH, 0.05, 20) * 10_000) / 10_000,
            x: round(clamp(layer.x + ((moved * axis[0]) / rect.width) * 100, -50, 150)),
            y: round(clamp(layer.y + ((moved * axis[1]) / rect.height) * 100, -50, 150)),
          }),
          id,
        );
      } else if (grip === 'resize') {
        const distance = Math.hypot(move.clientX - centerX, move.clientY - centerY);
        scene.updateLayer(layer.key, () => ({ width: round(clamp((layer.width * distance) / startDistance, 2, 300)) }), id);
      } else {
        const angle = Math.atan2(move.clientY - centerY, move.clientX - centerX);
        const degrees = layer.rotation + ((angle - startAngle) * 180) / Math.PI;
        scene.updateLayer(layer.key, () => ({ rotation: round(normalizeAngle(degrees)) }), id);
      }
    };
    const onUp = () => {
      target.removeEventListener('pointermove', onMove as EventListener);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
    };
    target.addEventListener('pointermove', onMove as EventListener);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  const onDrop = (event: DragEvent) => {
    const fileId = event.dataTransfer.getData(DROP_TYPE);
    const rect = box.current?.getBoundingClientRect();
    if (!fileId || !rect) return;
    event.preventDefault();
    const at = {
      x: round(((event.clientX - rect.left) / rect.width) * 100),
      y: round(((event.clientY - rect.top) / rect.height) * 100),
    };
    void scene.addFromLibrary(fileId, at).then(setError);
  };

  return (
    <>
      <div
        ref={box}
        className="scene is-editing"
        data-testid="scene-stage"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(DROP_TYPE)) event.preventDefault();
        }}
        onDrop={onDrop}
      >
        <div className="scene-canvas">
          {scene.layers.map((layer) => {
            const file = scene.fileOf(layer.fileId);
            const isSelected = scene.selected === layer.key;
            return (
              <div
                key={layer.key}
                className={isSelected ? 'scene-layer is-selected' : 'scene-layer'}
                style={layerPlace(layer)}
                data-testid="scene-layer"
                data-name={layer.link ? link?.title : file?.name}
                onPointerDown={(event) => startGrip(layer, 'move', event)}
              >
                {layer.link ? (
                  <div className="overlay-media scene-link-box" style={layerLook(layer)} data-testid="scene-link">
                    <strong>{link ? SITE_NAMES[link.site] : 'Lien'}</strong>
                    <span>{link?.title}</span>
                  </div>
                ) : file?.kind === 'video' ? (
                  <video
                    ref={(element) => scene.registerVideo(layer.key, element)}
                    className="overlay-media"
                    style={layerLook(layer)}
                    src={`${file.previewUrl}#t=0.1`}
                    preload="metadata"
                    muted
                    playsInline
                  />
                ) : (
                  <img className="overlay-media" style={layerLook(layer)} src={file?.previewUrl} alt="" draggable={false} />
                )}
                {isSelected && <Handles onGrip={(grip, event) => startGrip(layer, grip, event)} />}
              </div>
            );
          })}
        </div>
        <div className="scene-info">
          <Profile name={state.account?.name ?? ''} avatarUrl={state.account?.avatarUrl ?? null} zone={layout.profile} />
          {caption.trim() && <Caption text={caption} zone={layout.text} />}
        </div>
        {scene.layers.length === 0 && <p className="scene-empty hint">Ajoute une image ou une vidéo, puis place-la où tu veux.</p>}
      </div>
      {error && (
        <p className="error scene-stage-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
};

// Folds away: it fills the stage, then leaves the room to it. Sorting and favourites stay in the Library tab.
const LibraryStrip = ({ scene }: { scene: Scene }) => {
  const [files, setFiles] = useState<LibraryFileView[] | null>(null);
  const [kind, setKind] = useState<'image' | 'video' | 'audio'>('image');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.liveChat.scanLibrary().then(({ files: found }) => setFiles(found));
  }, []);

  if (!files) return <div className="scene-strip" />;
  // By name or by tag, as in the Library tab: "#drôle" and "drôle" find the same.
  const needle = search.trim().replace(/^#+/, '').toLocaleLowerCase('fr');
  const matches = (text: string) => text.toLocaleLowerCase('fr').includes(needle);
  const shown = files
    .filter((file) => file.kind === kind && (matches(file.name) || file.tags.some(matches)))
    .toSorted((a, b) => Number(b.favorite) - Number(a.favorite) || b.modifiedAt - a.modifiedAt)
    .slice(0, PICKER_SIZE);

  return (
    <div className="scene-strip" data-testid="scene-strip">
      <div className="field-line">
        <div className="tabs" role="group" aria-label="Type de fichier">
          {(
            [
              ['image', 'Images'],
              ['video', 'Vidéos'],
              ['audio', 'Sons'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" className={kind === value ? 'tab is-active' : 'tab'} aria-pressed={kind === value} onClick={() => setKind(value)}>
              {label}
            </button>
          ))}
        </div>
        <input
          className="input library-search"
          type="search"
          aria-label="Chercher un fichier"
          placeholder="Nom ou tag"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {shown.length === 0 ? (
        <p className="hint">{files.length === 0 ? 'Montre tes dossiers dans l’onglet Bibliothèque.' : 'Rien ici.'}</p>
      ) : (
        <ul className="scene-strip-list">
          {shown.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                className="scene-strip-file"
                title={`Ajouter ${file.name}`}
                draggable={file.kind !== 'audio'}
                onDragStart={(event) => event.dataTransfer.setData(DROP_TYPE, file.id)}
                onClick={() => void scene.addFromLibrary(file.id).then(setError)}
              >
                {file.kind === 'image' && <img src={file.url} alt="" loading="lazy" draggable={false} />}
                {file.kind === 'video' && <LazyVideo className="lazy-thumb" src={file.url} />}
                {file.kind === 'audio' && <KindIcon kind="audio" size={20} />}
                <span className="scene-strip-name">{file.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const BACKDROP_FPS = 15;
const BACKDROP_KEY = 'backdrop-opacity';
const readOpacity = (): number => {
  try {
    const saved = Number(localStorage.getItem(BACKDROP_KEY));
    return saved >= 10 && saved <= 100 ? saved : 60;
  } catch {
    return 60;
  }
};

// A window of this PC, live behind the board, to place things exactly on a game. Only here: nothing of it is sent.
const useBackdrop = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [name, setName] = useState('');
  const [opacity, setOpacityNow] = useState(readOpacity);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  return {
    stream,
    name,
    opacity,
    setOpacity: (value: number) => {
      setOpacityNow(value);
      try {
        localStorage.setItem(BACKDROP_KEY, String(value));
      } catch {
        // Kept until the window closes.
      }
    },
    choose: async (picked: BackdropView): Promise<string | null> => {
      await window.liveChat.chooseBackdrop(picked.id);
      try {
        const next = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: BACKDROP_FPS }, audio: false });
        // The window closed: the board goes back to plain.
        next.getVideoTracks()[0]?.addEventListener('ended', () => setStream(null));
        setStream(next);
        setName(picked.name);
        return null;
      } catch (problem) {
        console.warn('backdrop', problem);
        return 'Cette fenêtre ne peut pas être affichée.';
      }
    },
    remove: () => setStream(null),
  };
};
type Backdrop = ReturnType<typeof useBackdrop>;

const BackdropVideo = ({ backdrop }: { backdrop: Backdrop }) => {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = backdrop.stream;
  }, [backdrop.stream]);
  if (!backdrop.stream) return null;
  return <video ref={video} className="scene-backdrop" style={{ opacity: backdrop.opacity / 100 }} autoPlay muted playsInline data-testid="scene-backdrop" />;
};

const BackdropPicker = ({ backdrop, onClose, onError }: { backdrop: Backdrop; onClose: () => void; onError: (message: string | null) => void }) => {
  const [windows, setWindows] = useState<BackdropView[] | null>(null);
  useEffect(() => {
    void window.liveChat.listBackdrops().then(setWindows);
  }, []);
  return (
    <div className="glass backdrop-picker" data-testid="backdrop-picker">
      <div className="field-line">
        <strong>Une fenêtre derrière</strong>
        <span className="hint">Seulement chez toi, rien n’est envoyé.</span>
        <span className="spacer" />
        <button type="button" className="pill quiet small" onClick={onClose}>
          Fermer
        </button>
      </div>
      {windows === null ? (
        <p className="hint">Recherche des fenêtres…</p>
      ) : windows.length === 0 ? (
        <p className="hint">Aucune fenêtre à montrer. Un jeu doit être en fenêtré ou en plein écran fenêtré.</p>
      ) : (
        <ul className="backdrop-list scroll">
          {windows.map((one) => (
            <li key={one.id}>
              <button
                type="button"
                className={backdrop.stream && backdrop.name === one.name ? 'backdrop-window is-on' : 'backdrop-window'}
                title={one.name}
                onClick={() =>
                  void backdrop.choose(one).then((problem) => {
                    onError(problem);
                    if (!problem) onClose();
                  })
                }
              >
                <img src={one.thumbnail} alt="" />
                <span>{one.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const SceneBoard = ({
  scene,
  state,
  caption,
  preview,
  onError,
  onStopPreview,
  link,
}: {
  scene: Scene;
  state: AppState;
  caption: string;
  preview: { item: PlaybackView; startAt: number } | null;
  onError: (message: string | null) => void;
  onStopPreview: () => void;
  link: LinkDraft | null;
}) => {
  const [showLibrary, setShowLibrary] = useState(true);
  const backdrop = useBackdrop();
  const [picking, setPicking] = useState(false);

  const pick = async () => onError(await scene.pick());

  return (
    <div className="scene-workspace">
      {showLibrary && <LibraryStrip scene={scene} />}
      <div className="scene-work">
        <div className="scene-tools">
          <button type="button" className={showLibrary ? 'pill secondary small' : 'pill quiet small'} aria-expanded={showLibrary} onClick={() => setShowLibrary(!showLibrary)}>
            Bibliothèque
          </button>
          <button type="button" className="pill quiet small" onClick={() => void pick()}>
            Depuis mon PC
          </button>
          <button type="button" className={backdrop.stream ? 'pill secondary small' : 'pill quiet small'} aria-expanded={picking} onClick={() => setPicking(!picking)}>
            Fond
          </button>
          {backdrop.stream && (
            <>
              <span className="backdrop-opacity">
                <Slider label="Visibilité du fond" value={backdrop.opacity} min={10} max={100} step={5} onChange={backdrop.setOpacity} />
              </span>
              <button type="button" className="pill quiet small" title={`Retirer ${backdrop.name}`} onClick={backdrop.remove}>
                Sans fond
              </button>
            </>
          )}
          <span className="spacer" />
          <button type="button" className="pill quiet small" disabled={!scene.canUndo} onClick={scene.undo}>
            Annuler
          </button>
          <button type="button" className="pill quiet small" disabled={!scene.canRedo} onClick={scene.redo}>
            Rétablir
          </button>
        </div>

        {picking && <BackdropPicker backdrop={backdrop} onClose={() => setPicking(false)} onError={onError} />}

        <ScreenPreview testId="scene-preview">
          <BackdropVideo backdrop={backdrop} />
          {preview ? (
            <>
              <Playing
                key={preview.startAt}
                item={preview.item}
                startAt={preview.startAt}
                layout={state.settings.layout}
                volume={state.settings.muted ? 0 : state.settings.volume / 100}
              />
              <button type="button" className="pill secondary small scene-stop" onClick={onStopPreview}>
                Arrêter l’aperçu
              </button>
            </>
          ) : (
            <EditingStage scene={scene} state={state} caption={caption} link={link} />
          )}
        </ScreenPreview>

      </div>
    </div>
  );
};

const MOTIONS: Array<[SceneLayer['enter'], string]> = [
  ['none', 'Aucune'],
  ['pop', 'Pop'],
  ['fade', 'Fondu'],
  ['slide', 'Glissé'],
];

const SPINS: Array<[number, string]> = [
  [0, 'Aucune'],
  [10, 'Lente'],
  [40, 'Rapide'],
  [-10, 'Lente, sens inverse'],
  [-40, 'Rapide, sens inverse'],
];

// In 3D, the same list as the spin: one or the other.
const EFFECTS_3D: Array<[Scene3dEffect, string]> = [
  ['turn', 'Tour 360'],
  ['turn-thick', 'Tour 360 épais'],
  ['half', 'Demi-tour'],
  ['flip', 'Salto avant'],
  ['cube', 'Cube qui tourne'],
  ['tilt', 'Bascule'],
  ['wobble', 'Wobble'],
  ['float', 'Flotte'],
  ['jump', 'Saute'],
  ['heart', 'Battement de cœur'],
  ['eight', 'Huit'],
  ['zoom-tilt', 'Zoom penché'],
];

const SPEEDS: Array<[Scene3dSpeed, string]> = [
  ['slow', 'Lent'],
  ['medium', 'Moyen'],
  ['fast', 'Rapide'],
];

// An app from before 3D shows the closest plain move instead.
const MOTIONS_3D: Array<[Scene3dMotion, string, SceneLayer['enter']]> = [
  ['turn', 'Se retourne', 'pop'],
  ['depth', 'Arrive du fond', 'pop'],
  ['door', 'Porte qui s’ouvre', 'fade'],
];

const motionValue = (plain: SceneLayer['enter'], deep: Scene3dMotion | undefined) => (deep ? `3d:${deep}` : plain);

const MotionSelect = ({ label, value, onChange }: { label: string; value: string; onChange: (plain: SceneLayer['enter'], deep: Scene3dMotion | undefined) => void }) => (
  <label className="field">
    <span>{label}</span>
    <select
      className="input"
      value={value}
      onChange={(event) => {
        const chosen = event.target.value;
        const deep = MOTIONS_3D.find(([one]) => `3d:${one}` === chosen);
        if (deep) onChange(deep[2], deep[0]);
        else onChange(chosen as SceneLayer['enter'], undefined);
      }}
    >
      {MOTIONS.map(([one, name]) => (
        <option key={one} value={one}>
          {name}
        </option>
      ))}
      <optgroup label="En 3D">
        {MOTIONS_3D.map(([one, name]) => (
          <option key={one} value={`3d:${one}`}>
            {name}
          </option>
        ))}
      </optgroup>
    </select>
  </label>
);

const nameOf = <Value,>(options: Array<[Value, string]>, value: Value) => options.find(([option]) => option === value)?.[1] ?? '';

// Follows what is selected: nothing is on screen that doesn't concern it.
export const LayerPanel = ({ scene, layer, link, onRemoveLink }: { scene: Scene; layer: Layer; link: LinkDraft | null; onRemoveLink: () => void }) => {
  const file = scene.fileOf(layer.fileId);
  const name = layer.link ? link?.title : file?.name;
  const index = scene.layers.findIndex(({ key }) => key === layer.key);
  const blurTaken = scene.layers.some(({ key, blur }) => key !== layer.key && blur > 0);
  const canCopy = file?.kind === 'image' && scene.pictureCount < MAX_SCENE_PICTURES;
  const set = (values: Partial<Layer>, gesture: string | null = null) => scene.updateLayer(layer.key, () => values, gesture);
  const gesture = (name: string) => `${name}-${layer.key}`;

  const effects = [
    layer.grayscale ? 'noir et blanc' : '',
    layer.blur > 0 ? 'flou' : '',
    layer.effect3d ? (nameOf(EFFECTS_3D, layer.effect3d).toLowerCase()) : layer.spinRpm !== 0 ? 'rotation' : '',
    layer.enter !== 'none' || layer.enter3d ? 'apparition' : '',
    layer.exit !== 'none' || layer.exit3d ? 'sortie' : '',
  ].filter(Boolean);

  return (
    <div className="layer-panel scroll" data-testid="layer-panel">
      <p className="row-title" title={name}>
        {name}
      </p>
      <div className="layer-actions">
        <button type="button" className="pill quiet small" aria-pressed={layer.flip} onClick={() => set({ flip: !layer.flip })}>
          Miroir
        </button>
        <button type="button" className="pill quiet small" disabled={!canCopy} onClick={() => scene.duplicateMirrored(layer.key)}>
          Dupliquer en miroir
        </button>
        <button type="button" className="pill quiet small" disabled={index === scene.layers.length - 1} onClick={() => scene.moveLayer(layer.key, 1)}>
          Devant
        </button>
        <button type="button" className="pill quiet small" disabled={index === 0} onClick={() => scene.moveLayer(layer.key, -1)}>
          Derrière
        </button>
      </div>

      <label className="field">
        <span className="field-line">
          Taille <strong className="mono">{Math.round(layer.width)} %</strong>
        </span>
        <Slider label="Taille" value={layer.width} min={2} max={150} step={1} onChange={(width) => set({ width }, gesture('size'))} />
      </label>
      <label className="field">
        <span className="field-line">
          Rotation <strong className="mono">{Math.round(layer.rotation)}°</strong>
        </span>
        <Slider label="Rotation" value={layer.rotation} min={-180} max={180} step={1} onChange={(rotation) => set({ rotation }, gesture('angle'))} />
      </label>

      <details className="layer-effects">
        <summary>
          Effets <span className="hint">{effects.length > 0 ? effects.join(', ') : 'aucun'}</span>
        </summary>
        <div className="stack">
          <Switch checked={layer.grayscale} onChange={(grayscale) => set({ grayscale })}>
            Noir et blanc
          </Switch>
          <label className="field">
            <span className="field-line">
              Flou <strong className="mono">{layer.blur.toLocaleString('fr')}</strong>
            </span>
            {blurTaken ? (
              <span className="hint">Un seul élément flou à la fois.</span>
            ) : (
              <Slider label="Flou" value={layer.blur} min={0} max={3} step={0.1} onChange={(blur) => set({ blur }, gesture('blur'))} />
            )}
          </label>
          <label className="field">
            <span>Animation</span>
            <select
              className="input"
              data-testid="layer-animation"
              value={layer.effect3d ? `3d:${layer.effect3d}` : String(layer.spinRpm)}
              onChange={(event) => {
                const chosen = event.target.value;
                const effect = EFFECTS_3D.find(([one]) => `3d:${one}` === chosen)?.[0];
                set(effect ? { effect3d: effect, effectSpeed: layer.effectSpeed ?? 'medium', spinRpm: 0 } : { effect3d: undefined, spinRpm: Number(chosen) });
              }}
            >
              <optgroup label="Rotation">
                {SPINS.map(([value, label]) => (
                  <option key={value} value={String(value)}>
                    {label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="En 3D">
                {EFFECTS_3D.map(([value, label]) => (
                  <option key={value} value={`3d:${value}`}>
                    {label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {layer.effect3d && (
            <label className="field">
              <span>Vitesse</span>
              <select className="input" data-testid="layer-speed" value={layer.effectSpeed ?? 'medium'} onChange={(event) => set({ effectSpeed: event.target.value as Scene3dSpeed })}>
                {SPEEDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {layer.effect3d && file?.kind === 'video' && (layer.effect3d === 'cube' || layer.effect3d === 'turn-thick') && (
            <span className="hint">Sur une vidéo, il tourne sans épaisseur ni faces.</span>
          )}
          <MotionSelect label="Apparition" value={motionValue(layer.enter, layer.enter3d)} onChange={(enter, enter3d) => set({ enter, enter3d })} />
          <MotionSelect label="Sortie" value={motionValue(layer.exit, layer.exit3d)} onChange={(exit, exit3d) => set({ exit, exit3d })} />
        </div>
      </details>

      <div className="field-line">
        <button
          type="button"
          className="pill quiet small"
          onClick={() => {
            scene.removeLayer(layer.key);
            if (layer.link) onRemoveLink();
          }}
        >
          Retirer
        </button>
        <button type="button" className="pill secondary small" onClick={() => scene.setSelected(null)}>
          Terminé
        </button>
      </div>
      <p className="hint">{layer.spinRpm !== 0 || layer.effect3d || layer.enter !== 'none' || layer.exit !== 'none' || layer.enter3d || layer.exit3d ? 'Les mouvements se voient dans l’aperçu.' : ''}</p>
    </div>
  );
};
