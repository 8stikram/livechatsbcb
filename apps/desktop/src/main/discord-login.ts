import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AuthRedeemResponse } from '@livechatsbcb/protocol';
import { redeemLogin, startLogin, type ApiResult } from './party-api';

// Plenty of time to read Discord's page, or to log in to Discord first.
const LOGIN_TIMEOUT_MS = 5 * 60_000;

const pageFor = (title: string, text: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:'Segoe UI',sans-serif;background:#120a1f;color:#f6effc;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h1>${title}</h1><p>${text}</p></div></body></html>`;

const DONE_PAGE = pageFor('C’est bon !', 'Tu peux fermer cet onglet et retourner dans LiveChatSBCB.');
const FAILED_PAGE = pageFor('La connexion n’a pas abouti', 'Retourne dans LiveChatSBCB pour réessayer.');

const listenOnThisPcOnly = (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

type BrowserAnswer = { ticket: string } | { error: string };

// The browser is sent back here at the very end, which is how the result finds its way to this PC and no other.
const waitForBrowser = (server: Server, signal: AbortSignal): Promise<BrowserAnswer> =>
  new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ error: 'timeout' }), LOGIN_TIMEOUT_MS);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      resolve({ error: 'cancelled' });
    });

    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const ticket = url.searchParams.get('ticket');
      const error = url.searchParams.get('error');

      if (url.pathname !== '/auth' || (!ticket && !error)) {
        response.writeHead(404).end();
        return;
      }

      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        connection: 'close',
      });
      response.end(ticket ? DONE_PAGE : FAILED_PAGE, () => {
        clearTimeout(timeout);
        resolve(ticket ? { ticket } : { error: error! });
      });
    });
  });

export const loginWithDiscord = async (
  openInBrowser: (url: string) => void,
  signal: AbortSignal,
): Promise<ApiResult<AuthRedeemResponse>> => {
  // Only the hash leaves this PC before the end, so a ticket caught on the way is useless without this.
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const server = createServer();

  try {
    const port = await listenOnThisPcOnly(server);
    const answerFromBrowser = waitForBrowser(server, signal);

    const started = await startLogin(challenge, port);
    if (!started.ok) return started;
    openInBrowser(started.value);

    const answer = await answerFromBrowser;
    if ('ticket' in answer) return await redeemLogin(answer.ticket, verifier);

    switch (answer.error) {
      case 'cancelled':
        return { ok: false, error: 'cancelled' };
      case 'denied':
        return { ok: false, error: 'login_denied' };
      case 'timeout':
        return { ok: false, error: 'login_timeout' };
      default:
        return { ok: false, error: 'discord_unavailable' };
    }
  } catch {
    return { ok: false, error: 'network' };
  } finally {
    server.closeAllConnections();
    server.close();
  }
};
