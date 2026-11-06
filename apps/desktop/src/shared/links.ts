import type { MediaLink } from '@livechatsbcb/protocol';

export type FoundLink =
  | { found: 'site'; site: MediaLink['site']; id: string; startMs: number }
  // A short address: only the site knows what is behind it.
  | { found: 'short'; url: string }
  // These two start nothing without a click, and the overlay can't be clicked.
  | { found: 'waiting' };

const hostOf = (url: URL): string => url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');

// In a YouTube address: 90, 90s or 1m30s.
const secondsOf = (time: string | null): number => {
  const parts = time?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
  if (!parts) return 0;
  return Number(parts[1] ?? 0) * 3_600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0);
};

const YOUTUBE_ID = /^[\w-]{11}$/;
const youtube = (url: URL, host: string): FoundLink | null => {
  const [first, second] = url.pathname.split('/').filter(Boolean);
  const id = host === 'youtu.be' ? first : first === 'watch' ? url.searchParams.get('v') : ['shorts', 'live', 'embed'].includes(first ?? '') ? second : null;
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return { found: 'site', site: 'youtube', id, startMs: secondsOf(url.searchParams.get('t') ?? url.searchParams.get('start')) * 1_000 };
};

const tiktok = (url: URL, host: string): FoundLink | null => {
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || url.pathname.startsWith('/t/')) return { found: 'short', url: url.href };
  const id = url.pathname.match(/^\/(?:@[^/]+\/video|player\/v1|embed\/v2)\/(\d+)/)?.[1];
  return id ? { found: 'site', site: 'tiktok', id, startMs: 0 } : null;
};

// Pages of the site, and pages of a profile: none of them is a sound.
const SOUNDCLOUD_PAGES = new Set(['search', 'discover', 'you', 'charts', 'stream', 'upload', 'settings', 'people', 'pages', 'mobile', 'terms-of-use', 'messages', 'notifications', 'feed']);
const SOUNDCLOUD_TABS = new Set(['tracks', 'albums', 'sets', 'reposts', 'popular-tracks', 'likes', 'followers', 'following', 'comments', 'toptracks', 'spotlight']);
const SOUNDCLOUD_NAME = /^[\w-]+$/;
const soundcloud = (url: URL): FoundLink | null => {
  const [artist, sound, ...more] = url.pathname.split('/').filter(Boolean);
  if (!artist || !sound || more.length > 0 || SOUNDCLOUD_PAGES.has(artist) || SOUNDCLOUD_TABS.has(sound)) return null;
  if (!SOUNDCLOUD_NAME.test(artist) || !SOUNDCLOUD_NAME.test(sound)) return null;
  return { found: 'site', site: 'soundcloud', id: `${artist}/${sound}`, startMs: 0 };
};

export const findLink = (text: string): FoundLink | null => {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = hostOf(url);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') return youtube(url, host);
  if (host === 'tiktok.com' || host === 'vm.tiktok.com' || host === 'vt.tiktok.com') return tiktok(url, host);
  if (host === 'on.soundcloud.com') return { found: 'short', url: url.href };
  if (host === 'soundcloud.com') return soundcloud(url);
  if (host === 'instagram.com' || host === 'x.com' || host === 'twitter.com') return { found: 'waiting' };
  return null;
};
