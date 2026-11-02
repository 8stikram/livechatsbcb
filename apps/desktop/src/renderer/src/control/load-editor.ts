import type { LoadedDraft, LoadedScene } from '../../../shared/ipc';
import type { DraftFiles } from './use-draft';
import type { useScene } from './use-scene';

// Puts a saved LiveChat, or the one being prepared before a restart, back in the editor.
export const loadInEditor = (
  loaded: { draft: LoadedDraft } | { scene: LoadedScene },
  files: DraftFiles,
  scene: ReturnType<typeof useScene>,
): void => {
  if ('scene' in loaded) {
    scene.load(loaded.scene);
    files.setCaption(loaded.scene.caption);
    files.setVideoMuted(loaded.scene.videoMuted);
    files.setSoundMuted(loaded.scene.soundMuted);
    files.setSpeak(loaded.scene.speak);
    if (!loaded.scene.soundId && !loaded.scene.layers.some(({ fileId }) => loaded.scene.files.find(({ id }) => id === fileId)?.kind === 'video')) {
      files.setDisplayMs(loaded.scene.durationMs);
    }
  } else {
    scene.leave();
    files.load(loaded.draft);
  }
};
