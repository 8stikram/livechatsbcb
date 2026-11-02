import { useState } from 'react';
import { MAX_MEDIA_BYTES, MAX_SCENE_PICTURES } from '@livechatsbcb/protocol';
import type { EditedLayer, LoadedScene, SceneFile, SceneResult } from '../../../shared/ipc';

export type Layer = EditedLayer & { key: string };
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

  const { stage } = timeline;
  const { layers, soundId } = stage;

  const fileOf = (id: string | null, known: SceneFile[] = files) => known.find((file) => file.id === id) ?? null;
  const videoLayer = layers.find((layer) => fileOf(layer.fileId)?.kind === 'video') ?? null;
  // The one that sets the passage and the duration: the video if there is one, or else the sound.
  const leader = fileOf(videoLayer?.fileId ?? soundId);
  const shownClip = clip && clip.leader === leader?.id ? clip.clip : null;
  const pictureCount = layers.filter((layer) => fileOf(layer.fileId)?.kind === 'image').length;

  // A gesture counts as one step back, however many small changes it is made of.
  const change = (update: (current: Stage) => Stage, gesture: string | null = null) =>
    setTimeline((current) => {
      const next = update(current.stage);
      if (next === current.stage) return current;
      if (gesture !== null && current.gesture === gesture) return { ...current, stage: next };
      return { stage: next, past: [...current.past.slice(-MAX_UNDO + 1), current.stage], future: [], gesture };
    });

  const totalSize = (more: SceneFile, known: SceneFile[]) => {
    const used = new Set([...layers.map(({ fileId }) => fileId), soundId]);
    return known.filter(({ id }) => used.has(id)).reduce((total, { size }) => total + size, more.size);
  };

  // Answers with what stands in the way, if anything.
  const add = async (file: SceneFile, known: SceneFile[], at?: { x: number; y: number }): Promise<string | null> => {
    if (totalSize(file, known) > MAX_MEDIA_BYTES) return 'Ça dépasse 500 Mo au total.';
    if (file.kind === 'audio') {
      change((current) => ({ ...current, soundId: file.id }));
      return null;
    }
    if (file.kind === 'image' && pictureCount >= MAX_SCENE_PICTURES) return `${MAX_SCENE_PICTURES} images maximum.`;
    if (file.kind === 'video' && videoLayer) return 'Une seule vidéo à la fois.';

    const aspect = await proportionsOf(file);
    if (aspect === null) return 'Ce fichier ne peut pas être lu. Essaie un autre format.';
    const key = crypto.randomUUID();
    change((current) => {
      const offset = current.layers.length * 4;
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
      };
      return { ...current, layers: [...current.layers, layer] };
    });
    setSelected(key);
    return null;
  };

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
  };

  return {
    active,
    files,
    layers,
    soundId,
    selected,
    leader,
    clip: shownClip,
    sound: fileOf(soundId),
    pictureCount,
    hasVideo: videoLayer !== null,
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
    fileOf: (id: string) => fileOf(id),
    setSelected,
    setClip: (next: Clip) => {
      if (leader) setClipState({ leader: leader.id, clip: next });
    },
    leave: () => setActive(false),
    // What is already in the simple mode comes along, the first time.
    enter: async (): Promise<string | null> => {
      setActive(true);
      if (layers.length > 0 || soundId) return null;
      const started = await window.liveChat.startScene();
      setFiles(started);
      for (const file of started) {
        const problem = await add(file, started);
        if (problem) return problem;
      }
      return null;
    },
    pick: async (wanted: 'picture' | 'sound') => accept(await window.liveChat.pickSceneFile(wanted)),
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
      const leaderFile =
        loaded.files.find(({ id, kind }) => kind === 'video' && loaded.layers.some(({ fileId }) => fileId === id)) ??
        loaded.files.find(({ id }) => id === loaded.soundId);
      setClipState(
        leaderFile
          ? { leader: leaderFile.id, clip: { startMs: loaded.clipStartMs, endMs: loaded.clipStartMs + loaded.durationMs } }
          : null,
      );
      setTimeline({
        ...EMPTY,
        stage: { layers: loaded.layers.map((layer) => ({ ...layer, key: crypto.randomUUID() })), soundId: loaded.soundId },
      });
      setSelected(null);
      setActive(true);
    },
  };
};

export type Scene = ReturnType<typeof useScene>;
