import { useState } from 'react';
import type { DraftMedia } from '../../../shared/ipc';
import { pickErrorMessage } from './messages';

export type Clip = { startMs: number; endMs: number };

// The file being prepared. Chosen from the party as well as from the media tab, and it follows from one to the other.
export const useDraft = () => {
  const [draft, setDraft] = useState<DraftMedia | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  const reset = () => {
    setDraft(null);
    setClip(null);
    setUnreadable(false);
  };

  return {
    draft,
    clip,
    unreadable,
    setClip,
    setUnreadable,
    reset,
    remove: () => {
      reset();
      void window.liveChat.clearDraft();
    },
    pick: async (): Promise<{ picked: boolean; error: string | null }> => {
      const result = await window.liveChat.pickMedia();
      if (result.ok) {
        setClip(null);
        setUnreadable(false);
        setDraft(result.draft);
        return { picked: true, error: null };
      }
      return { picked: false, error: result.error === 'cancelled' ? null : pickErrorMessage(result.error) };
    },
  };
};

export type DraftFiles = ReturnType<typeof useDraft>;
