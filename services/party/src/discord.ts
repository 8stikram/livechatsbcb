import { DISCORD_IMAGE_ORIGIN, type Account, type GuildSummary } from '@livechatsbcb/protocol';

export const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';
// Who you are and which servers you are on: not your e-mail, and none of your messages.
export const LOGIN_SCOPE = 'identify guilds';

// Discord refuses API calls from a client that doesn't say who it is, in this format.
const USER_AGENT = 'DiscordBot (https://github.com/8stikram/livechatsbcb, 1)';
const REQUEST_TIMEOUT_MS = 8_000;

type DiscordUser = { id: string; username: string; global_name?: string | null; avatar?: string | null };
type DiscordGuild = { id: string; name: string; icon: string | null };
type TokenAnswer = { access_token: string; refresh_token?: string; expires_in: number };

export type DiscordTokens = { access: string; refresh: string; expiresAt: number };

// "refused" is an answer: Discord no longer honours this person's authorization. "unavailable" means nothing can be
// concluded, and must never cost anyone their access.
export type DiscordResult<T> = { status: 'ok'; value: T } | { status: 'refused' } | { status: 'unavailable' };

const clientAuthorization = (env: Env): string => `Basic ${btoa(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`)}`;

const postForm = (env: Env, path: string, form: Record<string, string>): Promise<Response> =>
  fetch(`${env.DISCORD_API_URL}${path}`, {
    method: 'POST',
    headers: {
      authorization: clientAuthorization(env),
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': USER_AGENT,
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

const requestTokens = async (env: Env, form: Record<string, string>): Promise<DiscordResult<DiscordTokens>> => {
  try {
    const response = await postForm(env, '/oauth2/token', form);
    // A 401 here would be about the app's own secret, which is no reason to sign anyone out.
    if (response.status === 400) return { status: 'refused' };
    if (!response.ok) return { status: 'unavailable' };

    const answer = (await response.json()) as TokenAnswer;
    return {
      status: 'ok',
      value: {
        access: answer.access_token,
        refresh: answer.refresh_token ?? form['refresh_token'] ?? '',
        expiresAt: Date.now() + answer.expires_in * 1_000,
      },
    };
  } catch {
    return { status: 'unavailable' };
  }
};

const call = async <T>(env: Env, path: string, accessToken: string): Promise<DiscordResult<T>> => {
  try {
    const response = await fetch(`${env.DISCORD_API_URL}${path}`, {
      headers: { authorization: `Bearer ${accessToken}`, 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return { status: 'ok', value: (await response.json()) as T };
    return { status: response.status === 401 ? 'refused' : 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
};

const defaultAvatarUrl = (userId: string): string =>
  `${DISCORD_IMAGE_ORIGIN}/embed/avatars/${(BigInt(userId) >> 22n) % 6n}.png`;

const avatarUrlOf = (user: DiscordUser): string =>
  user.avatar ? `${DISCORD_IMAGE_ORIGIN}/avatars/${user.id}/${user.avatar}.png?size=128` : defaultAvatarUrl(user.id);

const toAccount = (user: DiscordUser): Account => ({
  id: user.id,
  name: user.global_name ?? user.username,
  avatarUrl: avatarUrlOf(user),
});

const toGuildSummary = ({ id, name, icon }: DiscordGuild): GuildSummary => ({
  id,
  name,
  iconUrl: icon ? `${DISCORD_IMAGE_ORIGIN}/icons/${id}/${icon}.png?size=128` : null,
});

export const fetchUser = async (env: Env, accessToken: string): Promise<DiscordResult<Account>> => {
  const user = await call<DiscordUser>(env, '/users/@me', accessToken);
  return user.status === 'ok' ? { status: 'ok', value: toAccount(user.value) } : user;
};

export const fetchGuilds = async (env: Env, accessToken: string): Promise<DiscordResult<GuildSummary[]>> => {
  const guilds = await call<DiscordGuild[]>(env, '/users/@me/guilds', accessToken);
  return guilds.status === 'ok' ? { status: 'ok', value: guilds.value.map(toGuildSummary) } : guilds;
};

export const exchangeLoginCode = async (
  env: Env,
  code: string,
  redirectUri: string,
): Promise<{ account: Account; tokens: DiscordTokens } | null> => {
  const tokens = await requestTokens(env, { grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (tokens.status !== 'ok') return null;

  const user = await fetchUser(env, tokens.value.access);
  return user.status === 'ok' ? { account: user.value, tokens: tokens.value } : null;
};

export const renewTokens = (env: Env, refreshToken: string): Promise<DiscordResult<DiscordTokens>> =>
  requestTokens(env, { grant_type: 'refresh_token', refresh_token: refreshToken });

// Worth trying when someone logs out, but they are logged out whatever Discord answers.
export const revokeTokens = async (env: Env, { refresh }: DiscordTokens): Promise<void> => {
  await postForm(env, '/oauth2/token/revoke', { token: refresh, token_type_hint: 'refresh_token' }).catch(() => {});
};
