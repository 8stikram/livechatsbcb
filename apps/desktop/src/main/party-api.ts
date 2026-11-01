import {
  ApiErrorSchema,
  AuthRedeemResponseSchema,
  AuthStartResponseSchema,
  CreateMediaResponseSchema,
  type CreateMediaResponse,
  MeResponseSchema,
  RotateCodeResponseSchema,
  SessionResponseSchema,
  UploadedPartSchema,
  type AuthRedeemResponse,
  type MeResponse,
  type MediaDraft,
  type SessionResponse,
  type UploadedPart,
} from '@livechatsbcb/protocol';
import type { ActionError } from '../shared/ipc';

declare const __SERVER_URL__: string;

export const SERVER_URL = __SERVER_URL__;

const REQUEST_TIMEOUT_MS = 10_000;
const MEDIA_PART_TIMEOUT_MS = 180_000;
// The service counts two attempts per part towards its monthly budget, so no more than that.
const MEDIA_PART_ATTEMPTS = 2;

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ActionError };

const request = async (path: string, body: unknown, token?: string): Promise<Response | null> => {
  try {
    return await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
};

const failure = async (response: Response | null): Promise<{ ok: false; error: ActionError }> => {
  if (!response) return { ok: false, error: 'network' };
  const parsed = ApiErrorSchema.safeParse(await response.json().catch(() => undefined));
  return { ok: false, error: parsed.success ? parsed.data.error : 'network' };
};

const sessionFrom = async (response: Response | null): Promise<ApiResult<SessionResponse>> => {
  if (!response?.ok) return failure(response);
  const session = SessionResponseSchema.safeParse(await response.json().catch(() => undefined));
  return session.success ? { ok: true, value: session.data } : { ok: false, error: 'network' };
};

export const startLogin = async (challenge: string, port: number): Promise<ApiResult<string>> => {
  const response = await request('/v1/auth/start', { challenge, port });
  if (!response?.ok) return failure(response);
  return { ok: true, value: AuthStartResponseSchema.parse(await response.json()).url };
};

export const redeemLogin = async (ticket: string, verifier: string): Promise<ApiResult<AuthRedeemResponse>> => {
  const response = await request('/v1/auth/redeem', { ticket, verifier });
  if (!response?.ok) return failure(response);
  return { ok: true, value: AuthRedeemResponseSchema.parse(await response.json()) };
};

export const logout = async (accountToken: string): Promise<void> => {
  await request('/v1/auth/logout', {}, accountToken);
};

export const fetchMe = async (accountToken: string, fresh: boolean): Promise<ApiResult<MeResponse>> => {
  let response: Response | null = null;
  try {
    response = await fetch(`${SERVER_URL}/v1/me${fresh ? '?fresh=1' : ''}`, {
      headers: { authorization: `Bearer ${accountToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Reported below, like any other way of not getting an answer.
  }
  if (!response?.ok) return failure(response);
  const me = MeResponseSchema.safeParse(await response.json().catch(() => undefined));
  return me.success ? { ok: true, value: me.data } : { ok: false, error: 'network' };
};

export const createParty = async (accountToken: string) =>
  sessionFrom(await request('/v1/parties', {}, accountToken));

export const joinParty = async (accountToken: string, code: string) =>
  sessionFrom(await request('/v1/join', { code }, accountToken));

export const joinGuild = async (accountToken: string, guildId: string) =>
  sessionFrom(await request(`/v1/guilds/${guildId}/join`, {}, accountToken));

export const rotateCode = async (session: SessionResponse): Promise<ApiResult<string>> => {
  const response = await request(`/v1/parties/${session.partyId}/rotate-code`, {}, session.token);
  if (!response?.ok) return failure(response);
  return { ok: true, value: RotateCodeResponseSchema.parse(await response.json()).code };
};

export const leaveParty = async (session: SessionResponse): Promise<ApiResult<null>> => {
  const response = await request(`/v1/parties/${session.partyId}/leave`, {}, session.token);
  return response?.ok ? { ok: true, value: null } : failure(response);
};

export const replayMedia = async (session: SessionResponse, historyId: string): Promise<ApiResult<null>> => {
  const response = await request(`/v1/parties/${session.partyId}/history/${historyId}/replay`, {}, session.token);
  return response?.ok ? { ok: true, value: null } : failure(response);
};

const mediaPath = (session: SessionResponse, mediaId: string) => `/v1/parties/${session.partyId}/media/${mediaId}`;

export const createMedia = async (session: SessionResponse, draft: MediaDraft): Promise<ApiResult<CreateMediaResponse>> => {
  const response = await request(`/v1/parties/${session.partyId}/media`, draft, session.token);
  if (!response?.ok) return failure(response);
  return { ok: true, value: CreateMediaResponseSchema.parse(await response.json()) };
};

export const putMediaPart = async (
  session: SessionResponse,
  mediaId: string,
  part: number,
  body: Buffer<ArrayBuffer>,
  signal: AbortSignal,
): Promise<ApiResult<UploadedPart>> => {
  let response: Response | null = null;

  for (let attempt = 0; attempt < MEDIA_PART_ATTEMPTS && !signal.aborted; attempt++) {
    try {
      response = await fetch(`${SERVER_URL}${mediaPath(session, mediaId)}/parts/${part}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${session.token}` },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(MEDIA_PART_TIMEOUT_MS)]),
      });
      if (response.status < 500) break;
    } catch {
      response = null;
    }
  }

  if (!response?.ok) return failure(response);
  return { ok: true, value: UploadedPartSchema.parse(await response.json()) };
};

export const completeMedia = async (
  session: SessionResponse,
  mediaId: string,
  parts: UploadedPart[],
): Promise<ApiResult<null>> => {
  const response = await request(`${mediaPath(session, mediaId)}/complete`, { parts }, session.token);
  return response?.ok ? { ok: true, value: null } : failure(response);
};

export const cancelMedia = async (session: SessionResponse, mediaId: string): Promise<void> => {
  await fetch(`${SERVER_URL}${mediaPath(session, mediaId)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${session.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {});
};

export const fetchMedia = (session: SessionResponse, mediaId: string, signal: AbortSignal): Promise<Response> =>
  fetch(`${SERVER_URL}${mediaPath(session, mediaId)}`, {
    headers: { authorization: `Bearer ${session.token}` },
    signal,
  });
