import { useEffect, useRef, type RefObject } from 'react';
import type { MediaLink } from '@livechatsbcb/protocol';

// The official player of each site, spoken to in the site's own way. Nothing of the video passes through this app.

export type LinkControl = {
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  // From 0 to 100. TikTok only knows on and off.
  setVolume: (percent: number) => void;
};

export type LinkReport = { ready?: true; timeMs?: number; lengthMs?: number; playing?: boolean; failed?: true };

type Post = (message: unknown) => void;
type Driver = {
  src: (id: string, controls: boolean, startMs: number) => string;
  greet?: (post: Post) => void;
  onReady?: (post: Post) => void;
  read: (data: unknown) => LinkReport | null;
  control: (post: Post) => LinkControl;
};

const parsed = (data: unknown): Record<string, unknown> | null => {
  try {
    const value: unknown = typeof data === 'string' ? JSON.parse(data) : data;
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const inMs = (seconds: number | undefined): number | undefined => (seconds === undefined ? undefined : Math.round(seconds * 1_000));
const withoutEmpty = (report: LinkReport): LinkReport => Object.fromEntries(Object.entries(report).filter(([, value]) => value !== undefined));

const youtubeCommand = (post: Post, func: string, args: unknown[] = []) => post(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }));

const youtube: Driver = {
  src: (id, controls, startMs) =>
    `https://www.youtube.com/embed/${id}?enablejsapi=1&playsinline=1&rel=0&fs=0&disablekb=1&iv_load_policy=3&cc_load_policy=0&hl=fr&controls=${controls ? 1 : 0}&start=${Math.floor(startMs / 1_000)}`,
  greet: (post) => post(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' })),
  read: (data) => {
    const message = parsed(data);
    if (!message) return null;
    if (message['event'] === 'onError') return { failed: true };
    if (message['event'] === 'onReady') return { ready: true };
    if (message['event'] === 'onStateChange') return { playing: message['info'] === 1 };
    const info = parsed(message['info']);
    if (!info || (message['event'] !== 'infoDelivery' && message['event'] !== 'initialDelivery')) return null;
    const state = asNumber(info['playerState']);
    return withoutEmpty({
      timeMs: inMs(asNumber(info['currentTime'])),
      lengthMs: inMs(asNumber(info['duration'])),
      ...(state === undefined ? {} : { playing: state === 1 }),
    });
  },
  control: (post) => ({
    play: () => youtubeCommand(post, 'playVideo'),
    pause: () => youtubeCommand(post, 'pauseVideo'),
    seek: (ms) => youtubeCommand(post, 'seekTo', [ms / 1_000, true]),
    setVolume: (percent) => {
      youtubeCommand(post, 'unMute');
      youtubeCommand(post, 'setVolume', [percent]);
    },
  }),
};

const tiktokSay = (post: Post, type: string, value?: number) => post({ type, ...(value === undefined ? {} : { value }), 'x-tiktok-player': true });

const tiktok: Driver = {
  // Without autoplay it doesn't even get ready. With it, it still waits to be told to play.
  src: (id, controls) =>
    `https://www.tiktok.com/player/v1/${id}?autoplay=1&description=0&music_info=0&rel=0&controls=${controls ? 1 : 0}&native_context_menu=0&fullscreen_button=0`,
  // It only tells how long it is once it has been asked to go somewhere.
  onReady: (post) => tiktokSay(post, 'seekTo', 0),
  read: (data) => {
    const message = parsed(data);
    if (!message || message['x-tiktok-player'] !== true) return null;
    if (message['type'] === 'onPlayerReady') return { ready: true };
    if (message['type'] === 'onPlayerError') return { failed: true };
    if (message['type'] === 'onStateChange') return { playing: message['value'] === 1 };
    if (message['type'] !== 'onCurrentTime') return null;
    const time = parsed(message['value']);
    return time && withoutEmpty({ timeMs: inMs(asNumber(time['currentTime'])), lengthMs: inMs(asNumber(time['duration'])) });
  },
  control: (post) => {
    // It starts with its sound, and being told so anyway before it plays breaks it.
    let muted = false;
    return {
      play: () => tiktokSay(post, 'play'),
      pause: () => tiktokSay(post, 'pause'),
      seek: (ms) => tiktokSay(post, 'seekTo', ms / 1_000),
      setVolume: (percent) => {
        if (muted === (percent === 0)) return;
        muted = percent === 0;
        tiktokSay(post, muted ? 'mute' : 'unMute');
      },
    };
  },
};

const soundcloudSay = (post: Post, method: string, value?: number | string) => post(JSON.stringify({ method, ...(value === undefined ? {} : { value }) }));

const soundcloud: Driver = {
  src: (id) =>
    `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com/${id}`)}&auto_play=false&visual=false&show_comments=false&show_teaser=false&hide_related=true&show_reposts=false`,
  greet: (post) => soundcloudSay(post, 'addEventListener', 'ready'),
  onReady: (post) => {
    for (const event of ['playProgress', 'play', 'pause', 'finish', 'error']) soundcloudSay(post, 'addEventListener', event);
    soundcloudSay(post, 'getDuration');
  },
  read: (data) => {
    const message = parsed(data);
    if (!message) return null;
    const value = parsed(message['value']);
    switch (message['method']) {
      case 'ready':
        return { ready: true };
      case 'error':
        return { failed: true };
      case 'play':
        return { playing: true };
      case 'pause':
      case 'finish':
        return { playing: false };
      case 'getDuration':
        return withoutEmpty({ lengthMs: asNumber(message['value']) });
      case 'playProgress':
        return withoutEmpty({ timeMs: asNumber(value?.['currentPosition']), playing: true });
      default:
        return null;
    }
  },
  control: (post) => ({
    play: () => soundcloudSay(post, 'play'),
    pause: () => soundcloudSay(post, 'pause'),
    seek: (ms) => soundcloudSay(post, 'seekTo', ms),
    setVolume: (percent) => soundcloudSay(post, 'setVolume', percent),
  }),
};

const DRIVERS: Record<MediaLink['site'], Driver> = { youtube, tiktok, soundcloud };

const GREET_EVERY_MS = 500;

export const LinkFrame = ({
  link,
  controls,
  startMs,
  control,
  onReport,
}: {
  link: Pick<MediaLink, 'site' | 'id' | 'title'>;
  controls: boolean;
  startMs: number;
  control: RefObject<LinkControl | null>;
  onReport: (report: LinkReport) => void;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const report = useRef(onReport);
  report.current = onReport;
  const driver = DRIVERS[link.site];
  // Where it starts is only asked once: moving the passage must not load the player again.
  const src = useRef(driver.src(link.id, controls, startMs));

  useEffect(() => {
    const post: Post = (message) => frame.current?.contentWindow?.postMessage(message, '*');
    control.current = driver.control(post);
    let ready = false;
    let retried = false;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const heard = driver.read(event.data);
      if (!heard) return;
      // On a PC that never went to TikTok, its player fails the first time and works the second.
      if (heard.failed && !retried && frame.current) {
        retried = true;
        ready = false;
        frame.current.src = src.current;
        return;
      }
      if (heard.ready && !ready) {
        ready = true;
        driver.onReady?.(post);
      }
      report.current(heard);
    };
    window.addEventListener('message', onMessage);
    const greeting = setInterval(() => {
      if (!ready) driver.greet?.(post);
    }, GREET_EVERY_MS);

    return () => {
      clearInterval(greeting);
      window.removeEventListener('message', onMessage);
      control.current = null;
    };
  }, [control, driver]);

  return (
    <iframe
      ref={frame}
      className={link.site === 'soundcloud' ? 'link-frame is-sound' : 'link-frame'}
      src={src.current}
      title={link.title}
      allow="autoplay; encrypted-media"
      sandbox="allow-scripts allow-same-origin allow-presentation"
      data-testid="link-frame"
    />
  );
};

// A video site can be slower than a file already on this PC, and being a little off doesn't show on a joke.
const LINK_DRIFT_MS = 1_500;
const LINK_SEEK_PAUSE_MS = 3_000;
const LINK_CHECK_MS = 400;
// It never came: this PC moves on, and the others see it as usual.
const LINK_GIVE_UP_MS = 20_000;

export const LinkPlayback = ({
  link,
  clipStartMs,
  durationMs,
  startAt,
  volume,
  onFailed,
}: {
  link: MediaLink;
  clipStartMs: number;
  durationMs: number;
  startAt: number;
  volume: number;
  onFailed: () => void;
}) => {
  const control = useRef<LinkControl | null>(null);
  const player = useRef({ ready: false, playing: false, timeMs: null as number | null, lastSeek: 0, volume: -1, gone: false, everPlayed: false });
  const percent = Math.round(volume * link.volume);
  const wanted = useRef({ clipStartMs, durationMs, startAt, percent });
  wanted.current = { clipStartMs, durationMs, startAt, percent };

  const fail = useRef(onFailed);
  fail.current = onFailed;
  const failOnce = () => {
    if (player.current.gone) return;
    player.current.gone = true;
    fail.current();
  };

  const onReport = (report: LinkReport) => {
    const seen = player.current;
    if (report.failed) failOnce();
    if (report.ready) seen.ready = true;
    if (report.timeMs !== undefined) seen.timeMs = report.timeMs;
    if (report.playing !== undefined) {
      seen.playing = report.playing;
      if (report.playing) seen.everPlayed = true;
    }
  };

  useEffect(() => {
    const check = () => {
      const seen = player.current;
      const now = Date.now();
      const { clipStartMs: clipStart, durationMs: duration, startAt: start, percent: loudness } = wanted.current;
      const elapsedMs = now - start;
      if (elapsedMs > LINK_GIVE_UP_MS && !seen.everPlayed) failOnce();
      if (!seen.ready || !control.current || seen.gone) return;

      if (seen.volume !== loudness) {
        seen.volume = loudness;
        control.current.setVolume(loudness);
      }
      if (elapsedMs < 0) return;
      if (elapsedMs >= duration) {
        if (seen.playing) control.current.pause();
        return;
      }

      const targetMs = clipStart + elapsedMs;
      const drifted = seen.timeMs === null || Math.abs(seen.timeMs - targetMs) > LINK_DRIFT_MS;
      if ((!seen.playing || drifted) && now - seen.lastSeek > LINK_SEEK_PAUSE_MS) {
        seen.lastSeek = now;
        if (drifted) control.current.seek(targetMs);
        control.current.play();
      }
    };
    const interval = setInterval(check, LINK_CHECK_MS);
    const first = setTimeout(check, Math.max(0, wanted.current.startAt - Date.now()));
    return () => {
      clearInterval(interval);
      clearTimeout(first);
      control.current?.pause();
    };
  }, []);

  return <LinkFrame link={link} controls={false} startMs={clipStartMs} control={control} onReport={onReport} />;
};
