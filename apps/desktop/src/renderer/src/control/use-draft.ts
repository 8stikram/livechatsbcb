import { useState } from 'react';
import { DEFAULT_DISPLAY_MS } from '@livechatsbcb/protocol';
import type { DraftMedia, DraftSlot, LinkDraft, LoadedDraft } from '../../../shared/ipc';
import { pickErrorMessage } from './messages';

export type Clip = { startMs: number; endMs: number };

// What is being prepared. Chosen from the party or the library as well as from the LiveChat tab, and it follows along.
export const useDraft = () => {
  const [link, setLinkState] = useState<LinkDraft | null>(null);
  const [linkVolume, setLinkVolume] = useState(100);
  const [picture, setPicture] = useState<DraftMedia | null>(null);
  const [sound, setSound] = useState<DraftMedia | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [caption, setCaption] = useState('');
  const [displayMs, setDisplayMs] = useState(DEFAULT_DISPLAY_MS);
  const [videoMuted, setVideoMuted] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [speak, setSpeak] = useState(false);

  const leaderOf = (shownPicture: DraftMedia | null, shownSound: DraftMedia | null) =>
    shownPicture?.kind === 'video' ? shownPicture : shownSound;

  // The passage belongs to the file that leads: it only starts over when that file changes.
  const change = (nextPicture: DraftMedia | null, nextSound: DraftMedia | null) => {
    if (leaderOf(nextPicture, nextSound) !== leaderOf(picture, sound)) setClip(null);
    setPicture(nextPicture);
    setSound(nextSound);
    setUnreadable(false);
    if (nextPicture || nextSound) setLinkState(null);
  };

  const adopt = (file: DraftMedia) => {
    if (file.kind === 'audio') change(picture, file);
    else change(file, sound);
  };

  const reset = () => {
    setLinkState(null);
    setLinkVolume(100);
    setPicture(null);
    setSound(null);
    setClip(null);
    setUnreadable(false);
    setVideoMuted(false);
    setSoundMuted(false);
    setSpeak(false);
  };

  return {
    link,
    linkVolume,
    setLinkVolume,
    // A link takes the place of the files, which go on waiting for nothing.
    setLink: (next: LinkDraft | null) => {
      if (next) {
        void window.liveChat.clearDraft('picture');
        void window.liveChat.clearDraft('sound');
        setPicture(null);
        setSound(null);
        setUnreadable(false);
        setVideoMuted(false);
        setSoundMuted(false);
      }
      setClip(null);
      setLinkVolume(100);
      setLinkState(next);
    },
    picture,
    sound,
    clip,
    unreadable,
    caption,
    displayMs,
    videoMuted,
    soundMuted,
    speak,
    hasFiles: picture !== null || sound !== null,
    // The one that sets the passage and the duration: a video if there is one, or else a sound.
    leader: leaderOf(picture, sound),
    setClip,
    setUnreadable,
    setCaption,
    setDisplayMs,
    setVideoMuted,
    setSoundMuted,
    setSpeak,
    adopt,
    // Several at once: each takes its own place.
    adoptAll: (arrived: DraftMedia[]) => {
      const nextPicture = arrived.find(({ kind }) => kind !== 'audio') ?? picture;
      const nextSound = arrived.find(({ kind }) => kind === 'audio') ?? sound;
      change(nextPicture, nextSound);
    },
    reset,
    load: (loaded: LoadedDraft) => {
      setLinkState(null);
      setPicture(loaded.picture);
      setSound(loaded.sound);
      setUnreadable(false);
      setCaption(loaded.caption);
      setVideoMuted(loaded.videoMuted);
      setSoundMuted(loaded.soundMuted);
      setSpeak(loaded.speak);
      const plays = loaded.sound !== null || loaded.picture?.kind === 'video';
      setClip(plays ? { startMs: loaded.clipStartMs, endMs: loaded.clipStartMs + loaded.durationMs } : null);
      if (!plays) setDisplayMs(loaded.durationMs);
    },
    remove: (slot: DraftSlot) => {
      if (slot === 'sound') change(picture, null);
      else change(null, sound);
      void window.liveChat.clearDraft(slot);
    },
    pick: async (slot?: DraftSlot): Promise<{ picked: boolean; error: string | null }> => {
      const result = await window.liveChat.pickMedia(slot);
      if (result.ok) {
        adopt(result.draft);
        return { picked: true, error: null };
      }
      return { picked: false, error: result.error === 'cancelled' ? null : pickErrorMessage(result.error) };
    },
  };
};

export type DraftFiles = ReturnType<typeof useDraft>;
