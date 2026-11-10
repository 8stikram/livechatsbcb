import { useRef, useState } from 'react';
import type { TextPlace } from '@livechatsbcb/protocol';
import { MAX_MEDIA_BYTES, MAX_SCENE_PICTURES, MAX_SCENE_VIDEOS, MIN_DISPLAY_MS } from '@livechatsbcb/protocol';
import type { EditedLayer, LoadedScene, SceneFile, SceneResult } from '../../../shared/ipc';
import { playLengthMs } from './play-length';

export type Layer = EditedLayer & { key: string };

// Stands for the player of the link: it has no file of its own.
export const LINK_LAYER = 'link';
const LINK_ASPECTS = { youtube: 16 / 9, tiktok: 9 / 16, soundcloud: 3 } as const;
export type Clip = { startMs: number; endMs: number };

type Stage = { layers: Layer[]; soundId: string | null };
type Timeline = { stage: Stage; past: Stage[]; future: Stage[]; gesture: string | null };

const EMPTY: Timeline = { stage: { layers: [], soundId: null }, past: [], future: [], gesture: null };
const MAX_UNDO = 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SCENE_ERRORS = {
  cancelled: null,
  unsupported: 'Ce format n’est pas pris en charge.',
  empty: 'Ce fichier est vide.',
  not_found: 'Ce fichier n’est plus là.',
} as const;

const proportionsOf = (file: SceneFile): Promise<number | null> =>
  new Promise((resolve) => {
    const check = (width: number, height: number) => resolve(width > 0 && height > 0 ? clamp(width / height, 0.05, 20) : null);
    if (file.kind === 'image') {
      const image = new Image();
      image.onload = () => check(image.naturalWidth, image.naturalHeight);
      image.onerror = () => resolve(null);
      image.src = file.previewUrl;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => check(video.videoWidth, video.videoHeight);
      video.onerror = () => resolve(null);
      video.src = file.previewUrl;
    }
  });

// The advanced mode: its own files and what is placed with them. Going back to the simple mode loses neither.
export const useScene = () => {
  const [active, setActive] = useState(false);
  const [files, setFiles] = useState<SceneFile[]>([]);
  const [timeline, setTimeline] = useState<Timeline>(EMPTY);
  const [selected, setSelected] = useState<string | null>(null);
  const [clip, setClipState] = useState<{ leader: string; clip: Clip } | null>(null);
  const [clipKey, setClipKey] = useState<string | null>(null);
  // Where the text was dragged to, in percent of the screen. Null where the viewer usually shows it.
  const [textPlace, setTextPlace] = useState<TextPlace | null>(null);
  const stageVideos = useRef(new Map<string, HTMLVideoElement>());

  const { stage } = timeline;
  const { layers, soundId } = stage;
  // Files can come several at once, faster than the screen is drawn again.
  const stageNow = useRef(stage);
  stageNow.current = stage;

  const fileOf = (id: string | null, known: SceneFile[] = files) => known.find((file) => file.id === id) ?? null;
  const videoLayers = layers.filter((layer) => fileOf(layer.fileId)?.kind === 'video');
  const clipLayer = videoLayers.find(({ key }) => key === clipKey) ?? videoLayers[0] ?? null;
  // The one whose passage is being chosen: a video if there is one, or else the sound.
  const leader = fileOf(clipLayer?.fileId ?? soundId);
  const shownClip = clipLayer
    ? { startMs: clipLayer.clipStartMs ?? 0, endMs: (clipLayer.clipStartMs ?? 0) + (clipLayer.clipMs ?? 0) }
    : clip && clip.leader === leader?.id
      ? clip.clip
      : null;
  // The LiveChat lasts as long as the longest video.
  const passage = videoLayers[0]
    ? {
        clipStartMs: videoLayers[0].clipStartMs ?? 0,
        durationMs: Math.max(...videoLayers.map(({ clipMs }) => clipMs ?? MIN_DISPLAY_MS)),
      }
    : shownClip
      ? { clipStartMs: shownClip.startMs, durationMs: Math.max(MIN_DISPLAY_MS, shownClip.endMs - shownClip.startMs) }
      : null;
  const pictureCount = layers.filter((layer) => fileOf(layer.fileId)?.kind === 'image').length;
  const hasLink = layers.some((layer) => layer.link);

  // A gesture counts as one step back, however many small changes it is made of.
  const change = (update: (current: Stage) => Stage, gesture: string | null = null) =>
    setTimeline((current) => {
      const next = update(current.stage);
      if (next === current.stage) return current;
      if (gesture !== null && current.gesture === gesture) return { ...current, stage: next };
      return { stage: next, past: [...current.past.slice(-MAX_UNDO + 1), current.stage], future: [], gesture };
    });

  const totalSize = (more: SceneFile, known: SceneFile[]) => {
    const used = new Set([...stageNow.current.layers.map(({ fileId }) => fileId), stageNow.current.soundId]);
    return known.filter(({ id }) => used.has(id)).reduce((total, { size }) => total + size, more.size);
  };

  // Answers with what stands in the way, if anything.
  const add = async (file: SceneFile, known: SceneFile[], at?: { x: number; y: number }): Promise<string | null> => {
    if (totalSize(file, known) > MAX_MEDIA_BYTES) return 'Ça dépasse 500 Mo au total.';
    // The link has its own sound and passage: only pictures go with it.
    if (file.kind !== 'image' && stageNow.current.layers.some((layer) => layer.link)) return 'Avec un lien, ajoute seulement des images.';
    if (file.kind === 'audio') {
      change((current) => ({ ...current, soundId: file.id }));
      return null;
    }
    const already = stageNow.current.layers.filter((layer) => fileOf(layer.fileId, known)?.kind === file.kind).length;
    if (file.kind === 'image' && already >= MAX_SCENE_PICTURES) return `${MAX_SCENE_PICTURES} images maximum.`;
    if (file.kind === 'video' && already >= MAX_SCENE_VIDEOS) return `${MAX_SCENE_VIDEOS} vidéos maximum.`;

    const aspect = await proportionsOf(file);
    const lengthMs = file.kind === 'video' ? await playLengthMs({ kind: 'video', url: file.previewUrl }) : null;
    if (aspect === null || (file.kind === 'video' && lengthMs === null)) return 'Ce fichier ne peut pas être lu. Essaie un autre format.';
    const key = crypto.randomUUID();
    const offset = stageNow.current.layers.length * 4;
    const layer: Layer = {
      key,
      fileId: file.id,
      x: at?.x ?? 50 + offset,
      y: at?.y ?? 45 + offset,
      width: aspect < 1 ? 22 : 36,
      aspect,
      rotation: 0,
      flip: false,
      grayscale: false,
      blur: 0,
      spinRpm: 0,
      enter: 'none',
      exit: 'none',
      muted: false,
      ...(lengthMs !== null ? { clipStartMs: 0, clipMs: lengthMs } : {}),
    };
    stageNow.current = { ...stageNow.current, layers: [...stageNow.current.layers, layer] };
    change((current) => ({ ...current, layers: [...current.layers, layer] }));
    setSelected(key);
    if (file.kind === 'video') setClipKey(key);
    return null;
  };

  // What the first video already had, when it comes from elsewhere.
  const settleVideo = (known: SceneFile[], chosen: Clip | null, muted: boolean) =>
    change((current) => {
      const video = current.layers.find((layer) => fileOf(layer.fileId, known)?.kind === 'video');
      if (!video || (!chosen && !muted)) return current;
      const settled: Layer = {
        ...video,
        muted,
        ...(chosen ? { clipStartMs: chosen.startMs, clipMs: Math.max(MIN_DISPLAY_MS, chosen.endMs - chosen.startMs) } : {}),
      };
      return { ...current, layers: current.layers.map((layer) => (layer === video ? settled : layer)) };
    });

  const accept = async (result: SceneResult, at?: { x: number; y: number }): Promise<string | null> => {
    if (!result.ok) return SCENE_ERRORS[result.error];
    const known = [...files, result.file];
    setFiles(known);
    return add(result.file, known, at);
  };

  const updateLayer = (key: string, update: (layer: Layer) => Partial<Layer>, gesture: string | null = null) =>
    change(
      (current) => ({
        ...current,
        layers: current.layers.map((layer) => (layer.key === key ? { ...layer, ...update(layer) } : layer)),
      }),
      gesture,
    );

  const clearStage = () => {
    setFiles([]);
    setTimeline(EMPTY);
    setSelected(null);
    setClipState(null);
    setClipKey(null);
    setTextPlace(null);
  };

  return {
    active,
    textPlace,
    setTextPlace,
    files,
    layers,
    soundId,
    selected,
    leader,
    clip: shownClip,
    clipLayerKey: clipLayer?.key ?? null,
    passage,
    videos: videoLayers.map((layer) => ({ layer, name: fileOf(layer.fileId)?.name ?? '' })),
    sound: fileOf(soundId),
    pictureCount,
    hasVideo: videoLayers.length > 0,
    hasLink,
    // Placed like a picture, the first time. A link from another site keeps the place of the one before.
    ensureLink: (site: keyof typeof LINK_ASPECTS): string | null => {
      const existing = stageNow.current.layers.find((layer) => layer.link);
      if (existing) {
        if (existing.aspect !== LINK_ASPECTS[site]) updateLayer(existing.key, () => ({ aspect: LINK_ASPECTS[site] }));
        return null;
      }
      if (videoLayers.length > 0 || soundId) return 'Retire d’abord les vidéos et le son : le lien a les siens.';
      const key = crypto.randomUUID();
      const layer: Layer = {
        key,
        fileId: LINK_LAYER,
        link: true,
        x: 50,
        y: 45,
        width: site === 'tiktok' ? 22 : 48,
        aspect: LINK_ASPECTS[site],
        rotation: 0,
        flip: false,
        grayscale: false,
        blur: 0,
        spinRpm: 0,
        enter: 'none',
        exit: 'none',
        muted: false,
      };
      stageNow.current = { ...stageNow.current, layers: [...stageNow.current.layers, layer] };
      change((current) => ({ ...current, layers: [...current.layers, layer] }));
      setSelected(key);
      return null;
    },
    dropLink: () => change((current) => ({ ...current, layers: current.layers.filter((layer) => !layer.link) })),
    hasVideoSound: videoLayers.some(({ muted }) => !muted),
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
    fileOf: (id: string) => fileOf(id),
    setSelected: (key: string | null) => {
      setSelected(key);
      if (key && videoLayers.some((layer) => layer.key === key)) setClipKey(key);
    },
    setClip: (next: Clip) => {
      if (clipLayer) {
        const values = { clipStartMs: next.startMs, clipMs: Math.max(MIN_DISPLAY_MS, next.endMs - next.startMs) };
        updateLayer(clipLayer.key, () => values, `clip-${clipLayer.key}`);
      } else if (leader) setClipState({ leader: leader.id, clip: next });
    },
    showVideo: setClipKey,
    setVideoMuted: (key: string, muted: boolean) => updateLayer(key, () => ({ muted })),
    registerVideo: (key: string, element: HTMLVideoElement | null) => {
      if (element) stageVideos.current.set(key, element);
      else stageVideos.current.delete(key);
    },
    stageVideo: (key: string) => stageVideos.current.get(key) ?? null,
    leave: () => setActive(false),
    // What is already in the simple mode comes along, the first time.
    enter: async (videoClip: Clip | null, videoMuted: boolean): Promise<string | null> => {
      setActive(true);
      if (layers.length > 0 || soundId) return null;
      const started = await window.liveChat.startScene();
      setFiles(started);
      for (const file of started) {
        const problem = await add(file, started);
        if (problem) return problem;
      }
      settleVideo(started, videoClip, videoMuted);
      return null;
    },
    // What was prepared here gives way to a LiveChat brought back to be reworked.
    openWith: async (started: SceneFile[], chosen: Clip | null, videoMuted: boolean): Promise<string | null> => {
      setFiles(started);
      setTimeline(EMPTY);
      stageNow.current = EMPTY.stage;
      setClipKey(null);
      setSelected(null);
      setActive(true);
      for (const file of started) {
        const problem = await add(file, started);
        if (problem) return problem;
      }
      settleVideo(started, chosen, videoMuted);
      const sound = started.some(({ kind }) => kind === 'video') ? null : started.find(({ kind }) => kind === 'audio');
      setClipState(sound && chosen ? { leader: sound.id, clip: chosen } : null);
      return null;
    },
    pick: async (wanted?: 'picture' | 'sound') => accept(await window.liveChat.pickSceneFile(wanted)),
    addIncoming: async (incoming: SceneFile[]): Promise<string | null> => {
      const everything = [...files, ...incoming];
      setFiles(everything);
      for (const file of incoming) {
        const problem = await add(file, everything);
        if (problem) return problem;
      }
      return null;
    },
    addFromLibrary: async (fileId: string, at?: { x: number; y: number }) =>
      accept(await window.liveChat.useLibraryFileInScene(fileId), at),
    updateLayer,
    removeSound: () => change((current) => ({ ...current, soundId: null })),
    removeLayer: (key: string) => {
      change((current) => ({ ...current, layers: current.layers.filter((layer) => layer.key !== key) }));
      setSelected(null);
    },
    moveLayer: (key: string, by: 1 | -1) =>
      change((current) => {
        const index = current.layers.findIndex((layer) => layer.key === key);
        const target = index + by;
        if (index < 0 || target < 0 || target >= current.layers.length) return current;
        const reordered = [...current.layers];
        [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
        return { ...current, layers: reordered };
      }),
    // Two clicks for a face to face.
    duplicateMirrored: (key: string) => {
      const copyKey = crypto.randomUUID();
      change((current) => {
        const layer = current.layers.find((candidate) => candidate.key === key);
        if (!layer) return current;
        const copy: Layer = { ...layer, key: copyKey, x: 100 - layer.x, rotation: -layer.rotation, flip: !layer.flip, spinRpm: -layer.spinRpm, blur: 0 };
        return { ...current, layers: [...current.layers, copy] };
      });
      setSelected(copyKey);
    },
    undo: () =>
      setTimeline((current) => {
        const previous = current.past.at(-1);
        if (!previous) return current;
        return { stage: previous, past: current.past.slice(0, -1), future: [current.stage, ...current.future], gesture: null };
      }),
    redo: () =>
      setTimeline((current) => {
        const [next, ...rest] = current.future;
        if (!next) return current;
        return { stage: next, past: [...current.past, current.stage], future: rest, gesture: null };
      }),
    clearStage,
    forgetAll: () => {
      for (const { id } of files) void window.liveChat.forgetSceneFile(id);
      clearStage();
    },
    load: (loaded: LoadedScene) => {
      setFiles(loaded.files);
      const isVideo = (id: string) => loaded.files.find((file) => file.id === id)?.kind === 'video';
      const withVideo = loaded.layers.some(({ fileId }) => isVideo(fileId));
      setClipState(
        !withVideo && loaded.soundId
          ? { leader: loaded.soundId, clip: { startMs: loaded.clipStartMs, endMs: loaded.clipStartMs + loaded.durationMs } }
          : null,
      );
      setClipKey(null);
      setTimeline({
        ...EMPTY,
        stage: {
          layers: loaded.layers.map((layer) => ({
            ...layer,
            key: crypto.randomUUID(),
            // Saved when a whole LiveChat had one passage and one switch.
            ...(isVideo(layer.fileId)
              ? {
                  clipStartMs: layer.clipStartMs ?? loaded.clipStartMs,
                  clipMs: layer.clipMs ?? loaded.durationMs,
                  muted: layer.muted || loaded.videoMuted,
                }
              : {}),
          })),
          soundId: loaded.soundId,
        },
      });
      setTextPlace(loaded.textPlace ?? null);
      setSelected(null);
      setActive(true);
    },
  };
};

export type Scene = ReturnType<typeof useScene>;
