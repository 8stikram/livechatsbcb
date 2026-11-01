import {
  AuthRedeemRequestSchema,
  AuthStartRequestSchema,
  CompleteMediaRequestSchema,
  JoinPartyRequestSchema,
  MediaDraftSchema,
  mediaPartCount,
  type Account,
  type ApiErrorCode,
  type GuildSummary,
  type MeResponse,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { WS_TOKEN_PREFIX } from '@livechatsbcb/protocol';
import { Directory } from './directory';
import { AUTHORIZE_URL, exchangeLoginCode } from './discord';
import { ACCOUNT_HEADER, Guild, channelPartyId } from './guild';
import { Party } from './party';
import { sha256Base64Url } from './tokens';

export { Directory, Guild, Party };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fail = (error: ApiErrorCode, status: number): Response => json({ error }, status);

const STATUS_BY_ERROR: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  signed_out: 401,
  forbidden: 403,
  discord_unavailable: 503,
  code_not_found: 404,
  not_found: 404,
  party_full: 409,
  queue_full: 409,
  rate_limited: 429,
  storage_full: 507,
};

const directoryOf = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
const partyOf = (env: Env, partyId: string) => env.PARTY.get(env.PARTY.idFromName(partyId));
const guildOf = (env: Env, guildId: string) => env.GUILD.get(env.GUILD.idFromName(guildId));
const clientIp = (request: Request) => request.headers.get('cf-connecting-ip') ?? 'local';
const bearerToken = (request: Request) => request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

const accountOf = (request: Request, env: Env): Promise<Account | null> =>
  directoryOf(env).accountForToken(bearerToken(request));

const redirectUriOf = (request: Request): string => `${new URL(request.url).origin}/v1/auth/callback`;

const startLogin = async (request: Request, env: Env): Promise<Response> => {
  const body = AuthStartRequestSchema.safeParse(await readJson(request));
  if (!body.success) return fail('invalid_request', 400);
  if (!env.DISCORD_CLIENT_ID) return fail('discord_unavailable', 503);

  const login = await directoryOf(env).openLogin(clientIp(request), body.data.challenge, body.data.port);
  if (!login.ok) return fail(login.error, STATUS_BY_ERROR[login.error]);

  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.DISCORD_CLIENT_ID,
    // Who you are and nothing else: not your e-mail, your servers or your messages.
    scope: 'identify',
    state: login.state,
    redirect_uri: redirectUriOf(request),
  }).toString();
  return json({ url: url.toString() });
};

const htmlPage = (title: string, body: string, status = 200): Response =>
  new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head><body style="font-family:sans-serif;max-width:40em;margin:3em auto;padding:0 1em;line-height:1.5"><h1>${title}</h1>${body}</body></html>`,
    {
      status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'",
      },
    },
  );

// Discord brings the browser back here, and the browser then goes on to the app, which is waiting on this PC. Going
// through the browser is what guarantees the result lands on the PC of the person who just clicked "authorize".
const finishLogin = async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const login = await directoryOf(env).takeLogin(url.searchParams.get('state') ?? '');
  if (!login) {
    return htmlPage('Connexion expirée', '<p>Retourne dans LiveChatSBCB et clique de nouveau sur Se connecter.</p>', 400);
  }

  const backToApp = (query: Record<string, string>) =>
    new Response(null, {
      status: 302,
      headers: {
        location: `http://127.0.0.1:${login.port}/auth?${new URLSearchParams(query).toString()}`,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });

  const code = url.searchParams.get('code');
  if (!code) return backToApp({ error: 'denied' });

  const account = await exchangeLoginCode(env, code, redirectUriOf(request));
  if (!account) return backToApp({ error: 'discord' });

  return backToApp({ ticket: await directoryOf(env).issueTicket(login.challenge, account) });
};

const redeemLogin = async (request: Request, env: Env): Promise<Response> => {
  const body = AuthRedeemRequestSchema.safeParse(await readJson(request));
  if (!body.success) return fail('invalid_request', 400);

  const challenge = await sha256Base64Url(body.data.verifier);
  const result = await directoryOf(env).redeemTicket(body.data.ticket, challenge);
  return result ? json(result) : fail('signed_out', 401);
};

const logout = async (request: Request, env: Env): Promise<Response> => {
  await directoryOf(env).endSession(bearerToken(request));
  return new Response(null, { status: 204 });
};

const me = async (request: Request, env: Env): Promise<Response> => {
  const known = await accountOf(request, env);
  if (!known) return fail('signed_out', 401);

  const directory = directoryOf(env);
  const [account, bot] = await Promise.all([directory.refreshAccount(known), directory.botGuilds()]);

  // The bot says which servers exist, and each of them says whether this person is on it. Discord itself is never
  // asked for the list of someone's servers.
  const answers = await Promise.all(bot.guilds.map(({ id }) => guildOf(env, id).summary(id, known.id)));
  const guilds: GuildSummary[] = answers.flatMap((answer) =>
    answer.status === 'ok' ? [{ id: answer.id, name: answer.name, iconUrl: answer.iconUrl, locked: answer.locked }] : [],
  );
  const partial = !bot.complete || answers.some(({ status }) => status === 'unavailable');
  return json({ account, guilds, partial } satisfies MeResponse);
};

const openLobby = async (request: Request, env: Env, guildId: string): Promise<Response> => {
  const offered = (request.headers.get('sec-websocket-protocol') ?? '').split(',').map((part) => part.trim());
  const token = offered.find((part) => part.startsWith(WS_TOKEN_PREFIX))?.slice(WS_TOKEN_PREFIX.length) ?? '';
  const account = await directoryOf(env).accountForToken(token);

  const forwarded = new Request(request);
  forwarded.headers.delete(ACCOUNT_HEADER);
  if (account) forwarded.headers.set(ACCOUNT_HEADER, JSON.stringify(account));
  return guildOf(env, guildId).fetch(forwarded);
};

const joinChannel = async (request: Request, env: Env, guildId: string, channelId: string): Promise<Response> => {
  const account = await accountOf(request, env);
  if (!account) return fail('signed_out', 401);

  const access = await guildOf(env, guildId).access(guildId, account.id, channelId);
  if (!access.ok) return fail(access.error, STATUS_BY_ERROR[access.error]);

  const partyId = channelPartyId(channelId);
  const added = await partyOf(env, partyId).enterChannel(partyId, guildId, channelId, access.account);
  if (!added.ok) return fail(added.error, STATUS_BY_ERROR[added.error]);

  const session: SessionResponse = {
    partyId,
    code: null,
    channel: { guildId, guildName: access.guildName, channelId, channelName: access.channelName },
    ...added.member,
  };
  return json(session);
};

const createParty = async (request: Request, env: Env): Promise<Response> => {
  const account = await accountOf(request, env);
  if (!account) return fail('signed_out', 401);

  const allocated = await directoryOf(env).allocate(clientIp(request));
  if (!allocated.ok) return fail(allocated.error, STATUS_BY_ERROR[allocated.error]);

  const party = partyOf(env, allocated.partyId);
  await party.init(allocated.partyId, allocated.code);
  const added = await party.addMember(account);
  if (!added.ok) return fail(added.error, STATUS_BY_ERROR[added.error]);

  const session: SessionResponse = { partyId: allocated.partyId, code: allocated.code, channel: null, ...added.member };
  return json(session, 201);
};

const joinParty = async (request: Request, env: Env): Promise<Response> => {
  const account = await accountOf(request, env);
  if (!account) return fail('signed_out', 401);

  const body = JoinPartyRequestSchema.safeParse(await readJson(request));
  if (!body.success) return fail('invalid_request', 400);

  const resolved = await directoryOf(env).resolve(body.data.code, clientIp(request));
  if (!resolved.ok) return fail(resolved.error, STATUS_BY_ERROR[resolved.error]);

  const added = await partyOf(env, resolved.partyId).addMember(account);
  if (!added.ok) return fail(added.error, STATUS_BY_ERROR[added.error]);

  const session: SessionResponse = { partyId: resolved.partyId, code: body.data.code, channel: null, ...added.member };
  return json(session);
};

const rotateCode = async (request: Request, env: Env, partyId: string): Promise<Response> => {
  const party = partyOf(env, partyId);
  const currentCode = await party.codeForToken(bearerToken(request));
  // A party tied to a Discord channel has no code to change.
  if (!currentCode) return fail('unauthorized', 401);

  const code = await directoryOf(env).rotate(partyId, currentCode);
  await party.setCode(code);
  return json({ code });
};

const leaveParty = async (request: Request, env: Env, partyId: string): Promise<Response> => {
  const result = await partyOf(env, partyId).removeMemberByToken(bearerToken(request));
  if (!result.ok) return fail('unauthorized', 401);
  if (result.releasedCode) await directoryOf(env).release(result.releasedCode);
  return new Response(null, { status: 204 });
};

const mediaKey = (partyId: string, mediaId: string) => `${partyId}/${mediaId}`;

const createMedia = async (request: Request, env: Env, partyId: string): Promise<Response> => {
  const body = MediaDraftSchema.safeParse(await readJson(request));
  if (!body.success) return fail('invalid_request', 400);
  const draft = body.data;

  const party = partyOf(env, partyId);
  const token = bearerToken(request);
  const mediaId = crypto.randomUUID();

  if (!draft.file) {
    const sent = await party.sendText(token, mediaId, draft);
    return sent.ok ? json({ mediaId }, 201) : fail(sent.error, STATUS_BY_ERROR[sent.error]);
  }

  const allowed = await party.canUpload(token);
  if (!allowed.ok) return fail(allowed.error, STATUS_BY_ERROR[allowed.error]);

  // One retry per part is plenty, and the monthly budget counts it: creating, finishing, and two attempts per part.
  const attempts = 2 * mediaPartCount(draft.file.size);
  const opened = await directoryOf(env).openUpload(
    mediaKey(partyId, mediaId),
    draft.file.size,
    draft.file.contentType,
    attempts + 2,
  );
  if (!opened.ok) return fail(opened.error, STATUS_BY_ERROR[opened.error]);

  await party.registerUpload(mediaId, allowed.memberId, opened.uploadId, draft, attempts);
  return json({ mediaId }, 201);
};

const putMediaPart = async (
  request: Request,
  env: Env,
  partyId: string,
  mediaId: string,
  part: number,
): Promise<Response> => {
  if (!request.body) return fail('invalid_request', 400);

  const bytes = Number(request.headers.get('content-length'));
  const claim = await partyOf(env, partyId).claimPart(bearerToken(request), mediaId, part, bytes);
  if (!claim.ok) return fail(claim.error, STATUS_BY_ERROR[claim.error]);

  const uploaded = await env.MEDIA.resumeMultipartUpload(mediaKey(partyId, mediaId), claim.uploadId).uploadPart(
    part,
    request.body,
  );
  return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
};

const completeMedia = async (request: Request, env: Env, partyId: string, mediaId: string): Promise<Response> => {
  const body = CompleteMediaRequestSchema.safeParse(await readJson(request));
  if (!body.success) return fail('invalid_request', 400);

  const party = partyOf(env, partyId);
  const upload = await party.uploadFor(bearerToken(request), mediaId);
  if (!upload.ok) return fail(upload.error, STATUS_BY_ERROR[upload.error]);

  const key = mediaKey(partyId, mediaId);
  const object = await env.MEDIA.resumeMultipartUpload(key, upload.uploadId)
    .complete(body.data.parts)
    .catch(() => null);

  // The space was reserved for the announced size, so nothing else may be kept.
  if (object?.size !== upload.size) {
    await directoryOf(env).closeUpload(key);
    await party.forgetUpload(mediaId);
    return fail('invalid_request', 400);
  }

  await directoryOf(env).confirmUpload(key);
  await party.finishUpload(mediaId);
  return new Response(null, { status: 204 });
};

const cancelMedia = async (request: Request, env: Env, partyId: string, mediaId: string): Promise<Response> => {
  const party = partyOf(env, partyId);
  const upload = await party.uploadFor(bearerToken(request), mediaId);
  if (!upload.ok) return fail(upload.error, STATUS_BY_ERROR[upload.error]);

  await directoryOf(env).closeUpload(mediaKey(partyId, mediaId));
  await party.forgetUpload(mediaId);
  return new Response(null, { status: 204 });
};

const downloadMedia = async (request: Request, env: Env, partyId: string, mediaId: string): Promise<Response> => {
  if (!(await partyOf(env, partyId).isMember(bearerToken(request)))) return fail('unauthorized', 401);

  const object = await env.MEDIA.get(mediaKey(partyId, mediaId));
  if (!object) return fail('not_found', 404);

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'content-length': String(object.size),
      'x-content-type-options': 'nosniff',
    },
  });
};

const privacyPage = (): Response =>
  htmlPage(
    'LiveChatSBCB : confidentialité',
    `<p>LiveChatSBCB est une app privée entre amis. Voici ce qu'elle garde quand tu te connectes avec Discord.</p>
<ul>
<li><strong>Gardé :</strong> ton identifiant Discord, ton pseudo et ta photo, pour t'afficher aux autres membres.</li>
<li><strong>Gardé 1 jour :</strong> les médias envoyés dans une party, puis ils sont effacés.</li>
<li><strong>Jamais gardé :</strong> ton jeton Discord, ton e-mail, la liste de tes serveurs, tes messages.</li>
</ul>
<p>Le bot lit seulement la liste des salons et les rôles des serveurs où il est installé. Il ne lit aucun message.</p>
<p>Pour tout effacer, déconnecte-toi de l'app et retire son autorisation dans Discord (Paramètres, Applications autorisées).</p>`,
  );

const UPDATE_MANIFEST = 'latest.yml';
const UPDATE_FILE = /^(latest\.yml|LiveChatSBCB-Setup-\d+\.\d+\.\d+\.exe)$/;

const serveUpdateFile = async (env: Env, file: string): Promise<Response> => {
  if (!UPDATE_FILE.test(file)) return fail('not_found', 404);

  const object = await env.UPDATES.get(file);
  if (!object) return fail('not_found', 404);

  const isManifest = file === UPDATE_MANIFEST;
  return new Response(object.body, {
    headers: {
      'content-type': isManifest ? 'text/yaml; charset=utf-8' : 'application/octet-stream',
      // The manifest decides who updates, so it must never be served stale.
      'cache-control': isManifest ? 'no-store' : 'public, max-age=86400',
      etag: object.httpEtag,
      ...(isManifest ? {} : { 'content-disposition': `attachment; filename="${file}"` }),
    },
  });
};

// A stable link to share with friends: always the installer of the latest version.
const redirectToLatestInstaller = async (request: Request, env: Env): Promise<Response> => {
  const manifest = await env.UPDATES.get(UPDATE_MANIFEST);
  const installer = (await manifest?.text())?.match(/^path:\s*(\S+)\s*$/m)?.[1];
  if (!installer || !UPDATE_FILE.test(installer)) return fail('not_found', 404);
  return Response.redirect(new URL(`/updates/${installer}`, request.url).toString(), 302);
};

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const { method } = request;

    if (method === 'GET' && pathname === '/v1/health') return json({ ok: true });
    if (method === 'GET' && pathname === '/download') return redirectToLatestInstaller(request, env);
    if (method === 'GET' && pathname.startsWith('/updates/')) {
      return serveUpdateFile(env, pathname.slice('/updates/'.length));
    }
    if (method === 'GET' && pathname === '/privacy') return privacyPage();
    if (method === 'POST' && pathname === '/v1/auth/start') return startLogin(request, env);
    if (method === 'GET' && pathname === '/v1/auth/callback') return finishLogin(request, env);
    if (method === 'POST' && pathname === '/v1/auth/redeem') return redeemLogin(request, env);
    if (method === 'POST' && pathname === '/v1/auth/logout') return logout(request, env);
    if (method === 'GET' && pathname === '/v1/me') return me(request, env);
    if (method === 'POST' && pathname === '/v1/parties') return createParty(request, env);
    if (method === 'POST' && pathname === '/v1/join') return joinParty(request, env);

    const guildRoute = pathname.match(/^\/v1\/guilds\/(\d{17,20})\/(?:ws|channels\/(\d{17,20})\/join)$/);
    if (guildRoute) {
      const guildId = guildRoute[1]!;
      const channelId = guildRoute[2];
      if (method === 'GET' && !channelId) return openLobby(request, env, guildId);
      if (method === 'POST' && channelId) return joinChannel(request, env, guildId, channelId);
    }

    const route = pathname.match(/^\/v1\/parties\/([0-9a-f-]{36}|c-\d{17,20})\/(ws|rotate-code|leave)$/);
    if (route) {
      const partyId = route[1]!;
      const action = route[2]!;
      if (method === 'GET' && action === 'ws') return partyOf(env, partyId).fetch(request);
      if (method === 'POST' && action === 'rotate-code') return rotateCode(request, env, partyId);
      if (method === 'POST' && action === 'leave') return leaveParty(request, env, partyId);
    }

    const media = pathname.match(
      /^\/v1\/parties\/([0-9a-f-]{36}|c-\d{17,20})\/media(?:\/([0-9a-f-]{36})(?:\/(complete|parts\/(\d{1,4})))?)?$/,
    );
    if (media) {
      const partyId = media[1]!;
      const mediaId = media[2];
      const action = media[3];
      const part = Number(media[4]);
      if (!mediaId && method === 'POST') return createMedia(request, env, partyId);
      if (mediaId && !action && method === 'GET') return downloadMedia(request, env, partyId, mediaId);
      if (mediaId && !action && method === 'DELETE') return cancelMedia(request, env, partyId, mediaId);
      if (mediaId && action === 'complete' && method === 'POST') return completeMedia(request, env, partyId, mediaId);
      if (mediaId && action?.startsWith('parts/') && part > 0 && method === 'PUT') {
        return putMediaPart(request, env, partyId, mediaId, part);
      }
    }

    return fail('not_found', 404);
  },
} satisfies ExportedHandler<Env>;
