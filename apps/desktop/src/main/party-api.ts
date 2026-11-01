import {
  ApiErrorSchema,
  RotateCodeResponseSchema,
  SessionResponseSchema,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import type { ActionError } from '../shared/ipc';

declare const __SERVER_URL__: string;

export const SERVER_URL = __SERVER_URL__;

const REQUEST_TIMEOUT_MS = 10_000;

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
  return { ok: true, value: SessionResponseSchema.parse(await response.json()) };
};

export const createParty = async (name: string) => sessionFrom(await request('/v1/parties', { name }));

export const joinParty = async (code: string, name: string) => sessionFrom(await request('/v1/join', { code, name }));

export const rotateCode = async (session: SessionResponse): Promise<ApiResult<string>> => {
  const response = await request(`/v1/parties/${session.partyId}/rotate-code`, {}, session.token);
  if (!response?.ok) return failure(response);
  return { ok: true, value: RotateCodeResponseSchema.parse(await response.json()).code };
};

export const leaveParty = async (session: SessionResponse): Promise<ApiResult<null>> => {
  const response = await request(`/v1/parties/${session.partyId}/leave`, {}, session.token);
  return response?.ok ? { ok: true, value: null } : failure(response);
};
