import { useState } from 'react';
import type { DraftMedia, DraftSlot } from '../../../shared/ipc';
import { pickErrorMessage } from './messages';

export type Clip = { startMs: number; endMs: number };

// The files being prepared. Chosen from the party as well as from the meme tab, and they follow from one to the other.
export const useDraft = () => {
  const [picture, setPicture] = useState<DraftMedia | null>(null);
  const [sound, setSound] = useState<DraftMedia | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  const reset = () => {
    setPicture(null);
    setSound(null);
    setClip(null);
    setUnreadable(false);
  };

  return {
    picture,
    sound,
    clip,
    unreadable,
    hasFiles: picture !== null || sound !== null,
    // The one that sets the passage and the duration: the sound if there is one, or else a video.
    leader: sound ?? (picture?.kind === 'video' ? picture : null),
    setClip,
    setUnreadable,
    reset,
    remove: (slot: DraftSlot) => {
      (slot === 'sound' ? setSound : setPicture)(null);
      setClip(null);
      setUnreadable(false);
      void window.liveChat.clearDraft(slot);
    },
    pick: async (slot?: DraftSlot): Promise<{ picked: boolean; error: string | null }> => {
      const result = await window.liveChat.pickMedia(slot);
      if (result.ok) {
        setClip(null);
        setUnreadable(false);
        (result.draft.kind === 'audio' ? setSound : setPicture)(result.draft);
        return { picked: true, error: null };
      }
      return { picked: false, error: result.error === 'cancelled' ? null : pickErrorMessage(result.error) };
    },
  };
};

export type DraftFiles = ReturnType<typeof useDraft>;
