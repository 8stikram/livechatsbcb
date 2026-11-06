import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol } from 'electron';
import { DISCORD_IMAGE_ORIGIN } from '@livechatsbcb/protocol';
import { MEDIA_SCHEME } from './media-files';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://bundle`;

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  `img-src 'self' ${MEDIA_SCHEME}: ${DISCORD_IMAGE_ORIGIN}`,
  `media-src ${MEDIA_SCHEME}:`,
  `connect-src ${MEDIA_SCHEME}:`,
  "font-src 'self'",
  // The official players of the sites a link can come from, and nothing else.
  'frame-src https://www.youtube.com https://www.tiktok.com https://w.soundcloud.com',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

// Must run before the app is ready.
export const registerAppScheme = (): void => {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    // "stream" is what lets a video element read it progressively and seek.
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
};

// Serves the built pages from a real origin rather than file://, which would give every local file the same origin.
export const serveRenderer = (): void => {
  const root = resolve(join(__dirname, '../renderer'));

  protocol.handle(APP_SCHEME, async (request) => {
    const { host, pathname } = new URL(request.url);
    const target = resolve(root, `.${decodeURIComponent(pathname)}`);
    const inside = relative(root, target);

    if (host !== 'bundle' || inside.startsWith('..') || isAbsolute(inside)) {
      return new Response('Not found', { status: 404 });
    }

    const file = await net.fetch(pathToFileURL(target).toString());
    const headers = new Headers(file.headers);
    headers.set('content-security-policy', CONTENT_SECURITY_POLICY);
    return new Response(file.body, { status: file.status, headers });
  });
};
