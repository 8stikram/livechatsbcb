import { useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { MAX_SCENE_PICTURES, type SceneLayer } from '@livechatsbcb/protocol';
import type { AppState, LibraryFileView, PlaybackView } from '../../../shared/ipc';
import { Caption, Playing, Profile, ScreenPreview, layerLook, layerPlace } from '../scene';
import { KindIcon } from './icons';
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
const EditingStage = ({ scene, state, caption }: { scene: Scene; state: AppState; caption: string }) => {
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
                data-name={file?.name}
                onPointerDown={(event) => startGrip(layer, 'move', event)}
              >
                {file?.kind === 'video' ? (
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
  const needle = search.trim().toLocaleLowerCase('fr');
  const shown = files
    .filter((file) => file.kind === kind && file.name.toLocaleLowerCase('fr').includes(needle))
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
          placeholder="Rechercher"
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
                {file.kind === 'video' && <video src={`${file.url}#t=0.1`} preload="metadata" muted playsInline />}
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

export const SceneBoard = ({
  scene,
  state,
  caption,
  preview,
  onError,
  onStopPreview,
}: {
  scene: Scene;
  state: AppState;
  caption: string;
  preview: { item: PlaybackView; startAt: number } | null;
  onError: (message: string | null) => void;
  onStopPreview: () => void;
}) => {
  const [showLibrary, setShowLibrary] = useState(true);

  const pick = async (wanted: 'picture' | 'sound') => onError(await scene.pick(wanted));

  return (
    <div className="scene-workspace">
      {showLibrary && <LibraryStrip scene={scene} />}
      <div className="scene-work">
        <div className="scene-tools">
          <button type="button" className={showLibrary ? 'pill secondary small' : 'pill quiet small'} aria-expanded={showLibrary} onClick={() => setShowLibrary(!showLibrary)}>
            Bibliothèque
          </button>
          <button type="button" className="pill quiet small" onClick={() => void pick('picture')}>
            Depuis mon PC
          </button>
          <span className="spacer" />
          <button type="button" className="pill quiet small" disabled={!scene.canUndo} onClick={scene.undo}>
            Annuler
          </button>
          <button type="button" className="pill quiet small" disabled={!scene.canRedo} onClick={scene.redo}>
            Rétablir
          </button>
        </div>

        <ScreenPreview testId="scene-preview">
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
            <EditingStage scene={scene} state={state} caption={caption} />
          )}
        </ScreenPreview>

        {!scene.sound && (
          <div className="draft-add" role="group" aria-label="Ajouter un son">
            <span className="hint">Ajouter un son</span>
            <button type="button" className="pill quiet small" onClick={() => setShowLibrary(true)}>
              Depuis ma bibliothèque
            </button>
            <button type="button" className="pill quiet small" onClick={() => void pick('sound')}>
              Depuis mon PC
            </button>
          </div>
        )}
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

const nameOf = <Value,>(options: Array<[Value, string]>, value: Value) => options.find(([option]) => option === value)?.[1] ?? '';

// Follows what is selected: nothing is on screen that doesn't concern it.
export const LayerPanel = ({ scene, layer }: { scene: Scene; layer: Layer }) => {
  const file = scene.fileOf(layer.fileId);
  const index = scene.layers.findIndex(({ key }) => key === layer.key);
  const blurTaken = scene.layers.some(({ key, blur }) => key !== layer.key && blur > 0);
  const canCopy = file?.kind === 'image' && scene.pictureCount < MAX_SCENE_PICTURES;
  const set = (values: Partial<Layer>, gesture: string | null = null) => scene.updateLayer(layer.key, () => values, gesture);
  const gesture = (name: string) => `${name}-${layer.key}`;

  const effects = [
    layer.grayscale ? 'noir et blanc' : '',
    layer.blur > 0 ? 'flou' : '',
    layer.spinRpm !== 0 ? 'rotation' : '',
    layer.enter !== 'none' ? 'apparition' : '',
    layer.exit !== 'none' ? 'sortie' : '',
  ].filter(Boolean);

  return (
    <div className="layer-panel scroll" data-testid="layer-panel">
      <p className="row-title" title={file?.name}>
        {file?.name}
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
            <span>Rotation animée</span>
            <select className="input" value={layer.spinRpm} onChange={(event) => set({ spinRpm: Number(event.target.value) })}>
              {SPINS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Apparition</span>
            <select className="input" value={layer.enter} onChange={(event) => set({ enter: event.target.value as Layer['enter'] })}>
              {MOTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sortie</span>
            <select className="input" value={layer.exit} onChange={(event) => set({ exit: event.target.value as Layer['exit'] })}>
              {MOTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>

      <div className="field-line">
        <button type="button" className="pill quiet small" onClick={() => scene.removeLayer(layer.key)}>
          Retirer
        </button>
        <button type="button" className="pill secondary small" onClick={() => scene.setSelected(null)}>
          Terminé
        </button>
      </div>
      <p className="hint">{nameOf(SPINS, layer.spinRpm) !== 'Aucune' || layer.enter !== 'none' || layer.exit !== 'none' ? 'Les mouvements se voient dans l’aperçu.' : ''}</p>
    </div>
  );
};
