import {
  CompleteMediaRequestSchema,
  CreatePartyRequestSchema,
  JoinPartyRequestSchema,
  MediaDraftSchema,
  mediaPartCount,
  type ApiErrorCode,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { Directory } from './directory';
import { Party } from './party';

export { Directory, Party };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fail = (error: ApiErrorCode, status: number): Response => json({ error }, status);

const STATUS_BY_ERROR: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  code_not_found: 404,
  not_found: 404,
  party_full: 409,
  queue_full: 409,
  rate_limited: 429,
  storage_full: 507,
};

const directoryOf = (env: Env) => env.DIRECTORY.get(env.DIRECTORY.idFromName('global'));
const partyOf = (env: Env, partyId: string) => env.PARTY.get(env.PARTY.idFromName(partyId));
const clientIp = (request: Request) => request.headers.get('cf-connecting-ip') ?? 'local';
const bearerToken = (request: Request) => request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';

const readJson = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

const createParty = async (request: Request, env: Env): Promise<Response> => {
  const body = CreatePartyRequestSchema.safeParse(await readJson(request));
  if (!body.success) return fail('invalid_request', 400);

  const allocated = await directoryOf(env).allocate(clientIp(request));
  if (!allocated.ok) return fail(allocated.error, STATUS_BY_ERROR[allocated.error]);

  const party = partyOf(env, allocated.partyId);
  await party.init(allocated.partyId, allocated.code);
  const added = await party.addMember(body.data.name);
  if (!added.ok) return fail(added.error, STATUS_BY_ERROR[added.error]);

  const session: SessionResponse = { partyId: allocated.partyId, code: allocated.code, ...added.member };
  return json(session, 201);
};

const joinParty = async (request: Request, env: Env): Promise<Response> => {
  const body = JoinPartyRequestSchema.safeParse(await readJson(request));
  if (!body.success) return fail('invalid_request', 400);

  const resolved = await directoryOf(env).resolve(body.data.code, clientIp(request));
  if (!resolved.ok) return fail(resolved.error, STATUS_BY_ERROR[resolved.error]);

  const added = await partyOf(env, resolved.partyId).addMember(body.data.name);
  if (!added.ok) return fail(added.error, STATUS_BY_ERROR[added.error]);

  const session: SessionResponse = { partyId: resolved.partyId, code: body.data.code, ...added.member };
  return json(session);
};

const rotateCode = async (request: Request, env: Env, partyId: string): Promise<Response> => {
  const party = partyOf(env, partyId);
  const currentCode = await party.codeForToken(bearerToken(request));
  if (currentCode === null) return fail('unauthorized', 401);

  const code = await directoryOf(env).rotate(partyId, currentCode);
  await party.setCode(code);
  return json({ code });
};

const leaveParty = async (request: Request, env: Env, partyId: string): Promise<Response> => {
  const result = await partyOf(env, partyId).removeMemberByToken(bearerToken(request));
  if (!result.ok) return fail('unauthorized', 401);
  if (result.releasedCode !== null) await directoryOf(env).release(result.releasedCode);
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
    if (method === 'POST' && pathname === '/v1/parties') return createParty(request, env);
    if (method === 'POST' && pathname === '/v1/join') return joinParty(request, env);

    const route = pathname.match(/^\/v1\/parties\/([0-9a-f-]{36})\/(ws|rotate-code|leave)$/);
    if (route) {
      const partyId = route[1]!;
      const action = route[2]!;
      if (method === 'GET' && action === 'ws') return partyOf(env, partyId).fetch(request);
      if (method === 'POST' && action === 'rotate-code') return rotateCode(request, env, partyId);
      if (method === 'POST' && action === 'leave') return leaveParty(request, env, partyId);
    }

    const media = pathname.match(
      /^\/v1\/parties\/([0-9a-f-]{36})\/media(?:\/([0-9a-f-]{36})(?:\/(complete|parts\/(\d{1,4})))?)?$/,
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
