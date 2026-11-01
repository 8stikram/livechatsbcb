import {
  CreatePartyRequestSchema,
  JoinPartyRequestSchema,
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
  rate_limited: 429,
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

    return fail('not_found', 404);
  },
} satisfies ExportedHandler<Env>;
