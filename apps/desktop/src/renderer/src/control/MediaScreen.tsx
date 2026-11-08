import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  MAX_CAPTION_LENGTH,
  MAX_CLIP_MS,
  MAX_DISPLAY_MS,
  MIN_DISPLAY_MS,
} from '@livechatsbcb/protocol';
import { DEFAULT_SETTINGS, type AppState, type DraftMedia, type DraftSlot, type LinkDraft, type PlaybackView, type SceneInput } from '../../../shared/ipc';
import { LinkFrame, type LinkControl, type LinkReport } from '../link-player';
import { Caption, Profile, ScreenPreview, zoneStyle } from '../scene';
import { Avatar } from '../Avatar';
import { LayerPanel, SceneBoard } from './AdvancedEditor';
import { ClipBar, type ClipEdge } from './ClipBar';
import { IconCheck, IconPlay, IconPlus, KindIcon } from './icons';
import { isLongerThanSpoken, readingMs } from '../speech';
import { EmojiButton } from './EmojiPicker';
import { canSendIn, mediaErrorMessage } from './messages';
import { Slider } from './NowPlaying';
import { Switch } from './SettingsScreen';
import type { Clip, DraftFiles } from './use-draft';
import type { Scene } from './use-scene';

const SENT_SHOWN_MS = 1_400;
// Letting go of the end plays what leads to it, as that is what is being judged.
const REPLAY_BEFORE_END_MS = 2_000;

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
  shownIn,
  silent = false,
}: {
  draft: Pick<DraftMedia, 'kind' | 'previewUrl' | 'size'>;
  // The picture is shown above it, so a sound doesn't need its own place.
  besidePicture: boolean;
  // The advanced mode has its own preview, of everything at once.
  noPreview?: boolean;
  state: AppState;
  caption: string;
  clip: Clip | null;
  onClip: (clip: Clip) => void;
  onUnreadable: () => void;
  // Where the video can be seen, when that is somewhere else than here.
  shownIn?: () => HTMLVideoElement | null;
  silent?: boolean;
}) => {
  const media = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const playing = useRef<HTMLMediaElement | null>(null);
  const [lengthMs, setLengthMs] = useState<number | null>(null);

  const player = (): HTMLMediaElement | null => shownIn?.() ?? media.current;

  const stopPlaying = () => {
    const element = playing.current;
    if (!element) return;
    playing.current = null;
    element.ontimeupdate = null;
    element.pause();
    if (element !== media.current) element.muted = true;
  };

  const play = (fromMs: number, toMs: number) => {
    stopPlaying();
    const element = player();
    if (!element) return;
    element.currentTime = fromMs / 1000;
    element.volume = state.settings.muted ? 0 : state.settings.volume / 100;
    if (element !== media.current) element.muted = silent;
    playing.current = element;
    element.ontimeupdate = () => {
      if (element.currentTime * 1000 >= toMs) stopPlaying();
    };
    void element.play().catch(() => {});
  };

  useEffect(() => stopPlaying, []);

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
    stopPlaying();
    const element = player();
    if (element) {
      element.pause();
      element.currentTime = ms / 1000;
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

  const moveTo = (startMs: number) => {
    if (!clip) return;
    onClip({ startMs, endMs: startMs + clip.endMs - clip.startMs });
    seek(startMs);
  };

  const onRelease = (edge: ClipEdge) => {
    if (!clip) return;
    play(edge === 'end' ? Math.max(clip.startMs, clip.endMs - REPLAY_BEFORE_END_MS) : clip.startMs, clip.endMs);
  };

  const handlers = {
    ref: media,
    src: draft.previewUrl,
    preload: 'metadata',
    onLoadedMetadata: onMetadata,
    onDurationChange: onDuration,
    onError: onUnreadable,
  };

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
        <ClipBar
          draft={draft}
          totalMs={lengthMs}
          clip={clip}
          lengthLabel={formatTime(clip.endMs - clip.startMs)}
          onStart={setStart}
          onEnd={setEnd}
          onMove={moveTo}
          onRelease={onRelease}
        >
          <span className="clip-time">
            Début <strong className="mono" data-testid="clip-start">{formatTime(clip.startMs)}</strong>
          </span>
          <span className="clip-time">
            Fin <strong className="mono" data-testid="clip-end">{formatTime(clip.endMs)}</strong>
          </span>
          <span className="spacer" />
          {!noPreview && (
            <button type="button" className="pill secondary small" onClick={() => play(clip.startMs, clip.endMs)}>
              <IconPlay size={16} />
              Prévisualiser <span className="mono">{formatTime(clip.endMs - clip.startMs)}</span>
            </button>
          )}
        </ClipBar>
      )}
    </>
  );
};

const SITE_NAMES: Record<LinkDraft['site'], string> = { youtube: 'YouTube', tiktok: 'TikTok', soundcloud: 'SoundCloud' };
// Past this, the site has not answered: better say so than wait in silence.
const LINK_ANSWER_MS = 20_000;
const LINK_ASK_LENGTH_MS = 1_500;

const LinkEditor = ({
  link,
  state,
  caption,
  clip,
  onClip,
  volume,
  onVolume,
  failed,
  onFailed,
  onRemove,
  locked,
  compact = false,
}: {
  compact?: boolean;
  link: LinkDraft;
  state: AppState;
  caption: string;
  clip: Clip | null;
  onClip: (clip: Clip) => void;
  volume: number;
  onVolume: (volume: number) => void;
  failed: string | null;
  onFailed: (problem: string) => void;
  onRemove: () => void;
  locked: boolean;
}) => {
  const control = useRef<LinkControl | null>(null);
  const [lengthMs, setLengthMs] = useState<number | null>(null);
  const known = useRef(false);
  // Nothing is said to a player before it is ready: TikTok's breaks for good.
  const ready = useRef(false);
  const until = useRef<number | null>(null);

  const heardVolume = Math.round((state.settings.muted ? 0 : state.settings.volume / 100) * volume);
  const heard = useRef(heardVolume);
  heard.current = heardVolume;

  const onReport = (report: LinkReport) => {
    if (report.failed) onFailed('Cette vidéo ne veut pas se lancer ici. Son auteur l’interdit peut-être hors du site.');
    if (report.ready) {
      ready.current = true;
      control.current?.setVolume(heard.current);
    }
    if (report.lengthMs !== undefined && report.lengthMs > 0 && !known.current) {
      known.current = true;
      const length = report.lengthMs;
      setLengthMs(length);
      const startMs = link.startMs < length ? link.startMs : 0;
      if (!clip) onClip({ startMs, endMs: Math.min(length, startMs + MAX_CLIP_MS) });
    }
    if (report.timeMs !== undefined && until.current !== null && report.timeMs >= until.current) {
      until.current = null;
      control.current?.pause();
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!known.current) onFailed('Le site ne répond pas, ou c’est un direct. Essaie un autre lien.');
    }, LINK_ANSWER_MS);
    // TikTok only tells its length when asked to go somewhere, and doesn't hear it in its first instants.
    const asking = setInterval(() => {
      if (ready.current && !known.current) control.current?.seek(link.startMs);
    }, LINK_ASK_LENGTH_MS);
    return () => {
      clearTimeout(timer);
      clearInterval(asking);
    };
  }, []);

  useEffect(() => {
    if (ready.current) control.current?.setVolume(heardVolume);
  }, [heardVolume]);

  const seek = (ms: number) => {
    until.current = null;
    control.current?.pause();
    control.current?.seek(ms);
  };

  const setStart = (startMs: number) => {
    if (!clip) return;
    const start = Math.min(startMs, Math.max(0, clip.endMs - MIN_DISPLAY_MS));
    onClip({ startMs: start, endMs: Math.min(clip.endMs, start + MAX_CLIP_MS) });
    seek(start);
  };

  const setEnd = (endMs: number) => {
    if (!clip) return;
    const end = Math.max(endMs, clip.startMs + MIN_DISPLAY_MS);
    onClip({ startMs: Math.max(clip.startMs, end - MAX_CLIP_MS), endMs: end });
    seek(end);
  };

  const preview = () => {
    if (!clip) return;
    until.current = clip.endMs;
    control.current?.seek(clip.startMs);
    control.current?.play();
  };

  return (
    <>
      <header className="draft-head">
        <span className="kind-tile is-small">
          <KindIcon kind={link.site === 'soundcloud' ? 'audio' : 'video'} size={16} />
        </span>
        <span className="draft-name" title={link.title} data-testid="draft-name">
          {link.title}
        </span>
        <span className="count">{SITE_NAMES[link.site]}</span>
        {!locked && (
          <button type="button" className="pill quiet small" onClick={onRemove}>
            Retirer
          </button>
        )}
      </header>
      {compact ? (
        // The board shows where it goes: this small player is for choosing the passage.
        <div className="link-frame-box" data-testid="link-compact">
          <LinkFrame link={link} controls startMs={link.startMs} control={control} onReport={onReport} />
        </div>
      ) : (
        <LivePreview state={state} caption={caption}>
          <LinkFrame link={link} controls startMs={link.startMs} control={control} onReport={onReport} />
        </LivePreview>
      )}
      {failed && (
        <p className="error" role="alert" data-testid="link-problem">
          {failed}
        </p>
      )}
      {clip && lengthMs !== null && lengthMs > MIN_DISPLAY_MS && (
        <div className="link-times">
          <label className="field">
            <span className="field-line">
              Début <strong className="mono" data-testid="clip-start">{formatTime(clip.startMs)}</strong>
            </span>
            <Slider value={clip.startMs} min={0} max={lengthMs} step={100} label="Début" onChange={setStart} />
          </label>
          <label className="field">
            <span className="field-line">
              Fin <strong className="mono" data-testid="clip-end">{formatTime(clip.endMs)}</strong>
            </span>
            <Slider value={clip.endMs} min={0} max={lengthMs} step={100} label="Fin" onChange={setEnd} />
          </label>
          {link.site === 'tiktok' ? (
            <Switch checked={volume > 0} onChange={(on) => onVolume(on ? 100 : 0)}>
              Son de la vidéo
            </Switch>
          ) : (
            <label className="field">
              <span className="field-line">
                Volume <strong className="mono" data-testid="link-volume">{volume} %</strong>
              </span>
              <Slider value={volume} min={0} max={100} step={5} label="Volume" onChange={onVolume} />
            </label>
          )}
          <button type="button" className="pill secondary small" onClick={preview}>
            <IconPlay size={16} />
            Prévisualiser <span className="mono">{formatTime(clip.endMs - clip.startMs)}</span>
          </button>
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

// A whisper: only the chosen friends see it, and the others never know.
const WhisperPicker = ({ state, to, onChange }: { state: AppState; to: string[]; onChange: (to: string[]) => void }) => {
  const others = (state.party?.members ?? []).filter((member) => member.online && member.id !== state.party?.memberId);
  const [chosen, setOpen] = useState(false);
  const open = chosen || to.length > 0;
  if (others.length === 0 && to.length === 0) return null;
  const toggle = (id: string) => onChange(to.includes(id) ? to.filter((chosen) => chosen !== id) : [...to, id]);

  return (
    <div className="whisper" data-testid="whisper">
      <div className="field-line">
        <span>Pour</span>
        <div className="tabs whisper-mode" role="group" aria-label="Pour qui">
          <button
            type="button"
            className={open ? 'tab' : 'tab is-active'}
            aria-pressed={!open}
            onClick={() => {
              setOpen(false);
              onChange([]);
            }}
          >
            Tout le monde
          </button>
          <button type="button" className={open ? 'tab is-active' : 'tab'} aria-pressed={open} data-testid="whisper-open" onClick={() => setOpen(true)}>
            Chuchoter
          </button>
        </div>
      </div>
      {open && (
        <>
          <div className="whisper-people">
            {others.map((member) => (
              <button
                key={member.id}
                type="button"
                className={to.includes(member.id) ? 'chip is-on' : 'chip'}
                aria-pressed={to.includes(member.id)}
                data-testid="whisper-member"
                onClick={() => toggle(member.id)}
              >
                <Avatar className="chip-avatar" name={member.name} url={member.avatarUrl} />
                {member.name}
              </button>
            ))}
          </div>
          <p className="hint">Seuls ceux que tu choisis le voient. Les autres ne savent rien.</p>
        </>
      )}
    </div>
  );
};

const sendLabel = (state: AppState, to: string[]): string => {
  if (to.length === 0) return 'Envoyer à tout le monde';
  if (to.length > 1) return `Chuchoter à ${to.length} potes`;
  return `Chuchoter à ${state.party?.members.find(({ id }) => id === to[0])?.name ?? '1 pote'}`;
};

const SHELVES: Array<['image' | 'video' | 'audio', string]> = [
  ['image', 'Image'],
  ['video', 'Vidéo'],
  ['audio', 'Son'],
];

export const MediaScreen = ({
  state,
  files,
  scene,
  active,
  onOpenLibrary,
  whisperTo,
  onWhisperTo: setWhisperTo,
}: {
  state: AppState;
  files: DraftFiles;
  scene: Scene;
  active: boolean;
  onOpenLibrary: (category: 'image' | 'video' | 'audio') => void;
  // Kept by the window, so that the party can open this tab already whispering to someone.
  whisperTo: string[];
  onWhisperTo: (to: string[]) => void;
}) => {
  const { link, linkVolume, picture, sound, leader, hasFiles, clip, unreadable, caption, displayMs, videoMuted, soundMuted } = files;
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [soundSearch, setSoundSearch] = useState('');
  // "Depuis ma bibliothèque" first asks which shelf: images, videos or sounds.
  const [choosingShelf, setChoosingShelf] = useState(false);
  useEffect(() => setLinkProblem(null), [link]);
  const [preview, setPreview] = useState<{ item: PlaybackView; startAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingSpeech, setConfirmingSpeech] = useState(false);
  const [changingLength, setChangingLength] = useState(false);
  // Someone who left can't be whispered to.
  const to = whisperTo.filter((id) => state.party?.members.some((member) => member.id === id && member.online));
  const captionField = useRef<HTMLTextAreaElement>(null);

  const speak = files.speak && caption.trim() !== '';
  // A text that is read stays for as long as the reading takes.
  const shownMs = speak ? Math.min(MAX_CLIP_MS, Math.max(displayMs, readingMs(caption))) : displayMs;

  const isUploading = state.upload !== null;
  const advanced = scene.active;
  // In the advanced mode, the link is there only as long as its player is on the board.
  const sceneLink = advanced && scene.hasLink ? link : null;
  const plays = advanced ? scene.leader !== null || sceneLink !== null : link !== null || leader !== null;
  const hasContent = advanced
    ? scene.layers.length > 0 && (sceneLink ? clip !== null && linkProblem === null : !plays || scene.passage !== null)
    : link
      ? clip !== null && linkProblem === null
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
    speak,
    withPicture: picture !== null,
    withSound: sound !== null,
    link: link ? { site: link.site, id: link.id, title: link.title, volume: linkVolume } : null,
    to,
    ...(plays && clip
      ? { clipStartMs: clip.startMs, durationMs: Math.max(MIN_DISPLAY_MS, clip.endMs - clip.startMs) }
      : { clipStartMs: 0, durationMs: shownMs }),
  });

  const sceneInput = (): SceneInput => ({
    caption,
    videoMuted: scene.hasVideo && !scene.hasVideoSound,
    soundMuted,
    speak,
    layers: scene.layers.filter((layer) => sceneLink || !layer.link).map(({ key: _key, ...layer }) => layer),
    soundId: scene.soundId,
    to,
    link: sceneLink ? { site: sceneLink.site, id: sceneLink.id, title: sceneLink.title, volume: linkVolume } : null,
    ...(sceneLink && clip
      ? { clipStartMs: clip.startMs, durationMs: Math.max(MIN_DISPLAY_MS, clip.endMs - clip.startMs) }
      : (scene.passage ?? { clipStartMs: 0, durationMs: shownMs })),
  });

  useEffect(() => {
    if (advanced && !link && scene.hasLink) scene.dropLink();
  }, [advanced, link, scene.hasLink]);

  const stopPreview = () => setPreview(null);

  const lengthSeconds = (advanced ? sceneInput() : recipe()).durationMs / 1_000;
  const hasMusic = (advanced ? scene.sound : sound) !== null && !soundMuted;
  const hasVideoSound = advanced ? (sceneLink ? linkVolume > 0 : scene.hasVideoSound) : link ? linkVolume > 0 : picture?.kind === 'video' && !videoMuted;
  const summary = [
    `${lengthSeconds.toLocaleString('fr', { maximumFractionDigits: 1 })} s`,
    hasMusic ? 'avec musique' : hasVideoSound ? 'avec le son de la vidéo' : 'sans son',
    ...(speak ? ['voix robot'] : []),
  ].join(', ');

  const insertEmoji = (emoji: string) => {
    const field = captionField.current;
    const start = field?.selectionStart ?? caption.length;
    const end = field?.selectionEnd ?? caption.length;
    const next = caption.slice(0, start) + emoji + caption.slice(end);
    if (next.length > MAX_CAPTION_LENGTH) return;
    files.setCaption(next);
    requestAnimationFrame(() => field?.setSelectionRange(start + emoji.length, start + emoji.length));
  };

  // Played right here with its sound and its effects: nothing leaves this PC.
  const startPreview = () => {
    const input = sceneInput();
    const startAt = Date.now() + 300;
    setPreview({
      startAt,
      item: {
        hiddenForMe: null,
        id: 'preview',
        senderId: state.party?.memberId ?? '',
        whisper: false,
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
        videoMuted: input.videoMuted,
        soundMuted,
        speak: false,
        link: input.link,
        scene: input.layers.map(({ fileId, ...layer }) => {
          if (layer.link) return { ...layer, kind: 'link', url: null };
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
    else {
      // The link comes along as an element to place, with texts and pictures around it.
      const linkProblem = link ? scene.ensureLink(link.site) : null;
      setError((await scene.enter(picture?.kind === 'video' ? clip : null, picture?.kind === 'video' && videoMuted)) ?? linkProblem);
    }
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

  const [justSent, setJustSent] = useState(false);
  const sentTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(sentTimer.current), []);

  const send = async () => {
    setError(null);
    setSaved(false);
    stopPreview();
    const result = advanced ? await window.liveChat.sendScene(sceneInput()) : await window.liveChat.sendMedia(recipe());
    if (result.ok) {
      if (advanced) {
        scene.clearStage();
        if (sceneLink) files.setLink(null);
      } else files.reset();
      files.setSpeak(false);
      setWhisperTo([]);
      // Keeps whatever was typed while this one was on its way.
      files.setCaption((typed) => (typed === caption ? '' : typed));
      setJustSent(true);
      window.clearTimeout(sentTimer.current);
      sentTimer.current = window.setTimeout(() => setJustSent(false), SENT_SHOWN_MS);
    } else if (result.error !== 'cancelled') {
      setError(mediaErrorMessage(result.error));
    }
  };

  useEffect(() => {
    if (state.settings.clean) stopPreview();
  }, [state.settings.clean]);

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
        if (scene.layers.find(({ key }) => key === scene.selected)?.link) files.setLink(null);
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
            <SceneBoard scene={scene} state={state} caption={caption} preview={preview} onError={setError} onStopPreview={stopPreview} link={sceneLink} />
            {sceneLink && (
              <div className="link-editor-compact">
                <LinkEditor
                  key={`${sceneLink.site}-${sceneLink.id}`}
                  compact
                  link={sceneLink}
                  state={state}
                  caption={caption}
                  clip={clip}
                  onClip={files.setClip}
                  volume={linkVolume}
                  onVolume={files.setLinkVolume}
                  failed={linkProblem}
                  onFailed={setLinkProblem}
                  onRemove={() => files.setLink(null)}
                  locked={isUploading}
                />
              </div>
            )}
            {scene.sound && <DraftRow file={scene.sound} slot="sound" locked={isUploading} onRemove={scene.removeSound} />}
            {scene.hasVideo && (
              <div className="clip-videos" role="group" aria-label="Vidéos">
                {scene.videos.map(({ layer, name }) => (
                  <span key={layer.key} className="clip-video" data-testid="clip-video">
                    <button
                      type="button"
                      className={layer.key === scene.clipLayerKey ? 'pill secondary small clip-video-name' : 'pill quiet small clip-video-name'}
                      aria-pressed={layer.key === scene.clipLayerKey}
                      title={name}
                      onClick={() => scene.showVideo(layer.key)}
                    >
                      {name}
                    </button>
                    <button
                      type="button"
                      className="pill quiet small"
                      data-testid="video-sound"
                      aria-pressed={!layer.muted}
                      onClick={() => scene.setVideoMuted(layer.key, !layer.muted)}
                    >
                      {layer.muted ? 'Muet' : 'Son'}
                    </button>
                  </span>
                ))}
              </div>
            )}
            {scene.leader && (
              <ClipEditor
                key={scene.clipLayerKey ?? scene.leader.previewUrl}
                draft={scene.leader}
                besidePicture
                noPreview
                state={state}
                caption={caption}
                clip={scene.clip}
                onClip={scene.setClip}
                onUnreadable={() => setError('Ce fichier ne peut pas être lu. Essaie un autre format.')}
                silent={scene.videos.find(({ layer }) => layer.key === scene.clipLayerKey)?.layer.muted ?? false}
                {...(scene.clipLayerKey ? { shownIn: () => scene.stageVideo(scene.clipLayerKey!) } : {})}
              />
            )}
          </>
        ) : link ? (
          <LinkEditor
            key={`${link.site}-${link.id}`}
            link={link}
            state={state}
            caption={caption}
            clip={clip}
            onClip={files.setClip}
            volume={linkVolume}
            onVolume={files.setLinkVolume}
            failed={linkProblem}
            onFailed={setLinkProblem}
            onRemove={() => files.setLink(null)}
            locked={isUploading}
          />
        ) : (
          <>
            {!hasFiles ? (
              /* One big square: drop anything on it, or say where it comes from. */
              <div className="draft-drop" data-testid="draft-drop">
                <span className="draft-drop-icon" aria-hidden="true">
                  <IconPlus size={28} />
                </span>
                <p className="draft-empty-title">Glisse une image, une vidéo ou un son</p>
                <div className="draft-choice">
                  <button
                    type="button"
                    className="pill primary"
                    disabled={isUploading}
                    aria-expanded={choosingShelf}
                    onClick={() => setChoosingShelf(!choosingShelf)}
                  >
                    Depuis ma bibliothèque
                  </button>
                  <button type="button" className="pill secondary" disabled={isUploading} onClick={() => void pick()}>
                    Depuis mon PC
                  </button>
                </div>
                {choosingShelf && (
                  <div className="draft-shelves" role="group" aria-label="Quoi de ta bibliothèque">
                    {SHELVES.map(([category, label]) => (
                      <button
                        key={category}
                        type="button"
                        className="draft-shelf"
                        onClick={() => {
                          setChoosingShelf(false);
                          onOpenLibrary(category);
                        }}
                      >
                        <KindIcon kind={category} size={22} />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <form
                  className="link-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void window.liveChat.searchSoundCloud(soundSearch);
                  }}
                >
                  <input
                    className="input is-small"
                    type="search"
                    aria-label="Chercher sur SoundCloud"
                    placeholder="Chercher un son sur SoundCloud"
                    value={soundSearch}
                    onChange={(event) => setSoundSearch(event.target.value)}
                  />
                  <button type="submit" className="pill secondary small" disabled={!soundSearch.trim()}>
                    Chercher
                  </button>
                </form>
                <p className="hint">Ou colle un lien YouTube, TikTok ou SoundCloud avec Ctrl+V.</p>
              </div>
            ) : (
              <>
                {picture && <DraftRow file={picture} slot="picture" locked={isUploading} onRemove={files.remove} />}
                {sound && <DraftRow file={sound} slot="sound" locked={isUploading} onRemove={files.remove} />}
                {!isUploading && (!picture || !sound) && (
                  <div className="draft-add" role="group" aria-label={picture ? 'Ajouter une musique' : 'Ajouter une image ou une vidéo'}>
                    <span className="draft-add-title">{picture ? 'Ajouter un son ?' : 'Ajouter une image ou une vidéo ?'}</span>
                    <button type="button" className="pill secondary small" onClick={() => onOpenLibrary(picture ? 'audio' : 'image')}>
                      Depuis ma bibliothèque
                    </button>
                    <button type="button" className="pill secondary small" onClick={() => void pick(picture ? 'sound' : 'picture')}>
                      Depuis mon PC
                    </button>
                  </div>
                )}
              </>
            )}
            {picture?.kind === 'image' ? (
              <LivePreview state={state} caption={caption}>
                <img className="overlay-media" src={picture.previewUrl} alt="" onError={() => files.setUnreadable(true)} />
              </LivePreview>
            ) : (
              !hasFiles && caption.trim() && <LivePreview state={state} caption={caption} />
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
        )}
      </section>

      <section className="glass panel media-side" aria-label="Envoyer ton LiveChat">
        <h2>{selectedLayer ? 'Cet élément' : 'Envoyer à la party'}</h2>

        {selectedLayer && <LayerPanel scene={scene} layer={selectedLayer} link={sceneLink} onRemoveLink={() => files.setLink(null)} />}

        <label className="field caption-field" hidden={selectedLayer !== null}>
          <span>{hasFiles || advanced ? 'Texte à afficher (facultatif)' : 'Texte à afficher'}</span>
          <textarea
            className="input is-area"
            ref={captionField}
            value={caption}
            maxLength={MAX_CAPTION_LENGTH}
            onChange={(event) => files.setCaption(event.target.value)}
            placeholder="Ton message, en bas de l’écran de tout le monde"
          />
        </label>

        {!selectedLayer && (
          <div className="caption-tools">
            <EmojiButton onPick={insertEmoji} />
            {caption.trim() && !confirmingSpeech && (
              <Switch
                checked={files.speak}
                onChange={(on) => {
                  if (on) setConfirmingSpeech(true);
                  else files.setSpeak(false);
                }}
              >
                Lire à voix haute
              </Switch>
            )}
          </div>
        )}

        {!selectedLayer && confirmingSpeech && (
          <div className="speech-confirm" role="alertdialog" aria-label="Confirmer la voix robot">
            <p>Tu es sûr ? La voix robot s’entend chez tout le monde, et ça peut vite être pénible.</p>
            <div className="field-line">
              <button type="button" className="pill quiet small" onClick={() => setConfirmingSpeech(false)}>
                Annuler
              </button>
              <button
                type="button"
                className="pill secondary small"
                onClick={() => {
                  files.setSpeak(true);
                  setConfirmingSpeech(false);
                }}
              >
                Oui, lire
              </button>
            </div>
          </div>
        )}

        {!selectedLayer && speak && isLongerThanSpoken(caption) && (
          <p className="hint" data-testid="speech-limit">
            Seuls les 200 premiers caractères seront lus.
          </p>
        )}

        {!selectedLayer && speak && !plays && shownMs > displayMs && (
          <p className="hint" data-testid="speech-duration">
            Reste affiché {Math.ceil(shownMs / 1000)} s, le temps de la lecture.
          </p>
        )}

        {!selectedLayer && (advanced ? scene.hasVideo && scene.sound : picture?.kind === 'video' && sound) && (
          <div className="stack">
            {!advanced && (
              <Switch checked={!videoMuted} onChange={(on) => files.setVideoMuted(!on)}>
                Son de la vidéo
              </Switch>
            )}
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

        {selectedLayer || link ? null : saveName !== null ? (
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
        {saved && !selectedLayer && !link && (
          <p className="hint" role="status">
            Sauvegardé sur ce PC.
          </p>
        )}

        {!plays && !selectedLayer && changingLength && (
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

        {(advanced ? sceneInput() : recipe()).durationMs > (DEFAULT_SETTINGS.maxDurationSec ?? Infinity) * 1_000 && (
          <p className="hint" data-testid="too-long">
            Coupé après {DEFAULT_SETTINGS.maxDurationSec} s chez ceux qui gardent la limite. Rogne l’extrait à {DEFAULT_SETTINGS.maxDurationSec} s pour que tout soit vu.
          </p>
        )}

        {plays ? (
          <p className="send-summary" data-testid="send-summary">
            {summary}
          </p>
        ) : (
          <button
            type="button"
            className="send-summary is-button"
            data-testid="send-summary"
            aria-expanded={changingLength}
            title="Changer la durée"
            onClick={() => setChangingLength(!changingLength)}
          >
            {summary}
          </button>
        )}

        {!state.upload && <WhisperPicker state={state} to={to} onChange={setWhisperTo} />}

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
            <progress className={state.upload.paused ? 'is-paused' : undefined} max={100} value={state.upload.percent} />
          </div>
        ) : (
          <button
            type="button"
            className={justSent ? 'pill primary is-sent' : 'pill primary'}
            data-tour="send"
            disabled={!hasContent || !isOnline}
            onClick={() => void send()}
          >
            {justSent && (
              <span className="sent-check" aria-hidden="true" data-testid="sent-check">
                <IconCheck size={16} />
              </span>
            )}
            {sendLabel(state, to)}
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
