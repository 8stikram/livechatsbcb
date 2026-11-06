import { MAX_FILE_NAME_LENGTH } from '@livechatsbcb/protocol';
import { findLink, type FoundLink } from '../shared/links';
import type { IncomingError, LinkDraft } from '../shared/ipc';

const ASK_TIMEOUT_MS = 10_000;

const PAGE_OF: Record<LinkDraft['site'], (id: string) => string> = {
  youtube: (id) => `https://www.youtube.com/watch?v=${id}`,
  tiktok: (id) => `https://www.tiktok.com/@/video/${id}`,
  soundcloud: (id) => `https://soundcloud.com/${id}`,
};

const ASK_AT: Record<LinkDraft['site'], (page: string) => string> = {
  youtube: (page) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(page)}`,
  tiktok: (page) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(page)}`,
  soundcloud: (page) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(page)}`,
};

const NAME_OF: Record<LinkDraft['site'], string> = { youtube: 'Vidéo YouTube', tiktok: 'Vidéo TikTok', soundcloud: 'Son SoundCloud' };

type Outcome = { ok: true; link: LinkDraft } | { ok: false; error: IncomingError };

const followShort = async (url: string): Promise<FoundLink | null> => {
  const answer = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
  await answer.body?.cancel();
  const found = findLink(answer.url);
  return found?.found === 'short' ? null : found;
};

// What the site itself says, before anyone tries to play it: its title, or that it can't be played elsewhere.
export const checkLink = async (found: FoundLink): Promise<Outcome> => {
  if (found.found === 'waiting') return { ok: false, error: 'link_waiting' };
  try {
    const site = found.found === 'short' ? await followShort(found.url) : found;
    if (!site || site.found !== 'site') return { ok: false, error: 'link_gone' };

    const answer = await fetch(ASK_AT[site.site](PAGE_OF[site.site](site.id)), { signal: AbortSignal.timeout(ASK_TIMEOUT_MS) });
    if (answer.status === 401 || answer.status === 403) return { ok: false, error: 'link_blocked' };
    if (!answer.ok) return { ok: false, error: 'link_gone' };
    const { title } = (await answer.json()) as { title?: unknown };
    const name = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, MAX_FILE_NAME_LENGTH) : '';
    return { ok: true, link: { site: site.site, id: site.id, startMs: site.startMs, title: name || NAME_OF[site.site] } };
  } catch {
    return { ok: false, error: 'bad_link' };
  }
};
