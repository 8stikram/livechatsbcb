import { DISCORD_IMAGE_ORIGIN, type Account } from '@livechatsbcb/protocol';
import type { Channel, GuildMember, GuildStructure, Role } from './permissions';

export const AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';

// Discord refuses API calls from a client that doesn't say who it is, in this format.
const USER_AGENT = 'DiscordBot (https://github.com/8stikram/livechatsbcb, 1)';
const REQUEST_TIMEOUT_MS = 8_000;
// A free Worker may make 50 outside calls per request, and the service makes one call per server for each member.
const MAX_BOT_GUILDS = 20;

export type DiscordUser = { id: string; username: string; global_name?: string | null; avatar?: string | null };
export type DiscordMember = GuildMember & {
  user: DiscordUser;
  nick?: string | null;
  avatar?: string | null;
  // Still has to accept the rules of the server, which means Discord isn't showing them its channels yet.
  pending?: boolean;
};
export type BotGuild = { id: string; name: string; icon: string | null };

// "missing" is an answer: no such member, or the bot isn't on that server. "unavailable" means nothing can be
// concluded, and must never cost anyone their access.
export type DiscordResult<T> = { status: 'ok'; value: T } | { status: 'missing' } | { status: 'unavailable' };

const call = async <T>(env: Env, path: string, authorization: string): Promise<DiscordResult<T>> => {
  try {
    const response = await fetch(`${env.DISCORD_API_URL}${path}`, {
      headers: { authorization, 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.ok) return { status: 'ok', value: (await response.json()) as T };
    if (response.status === 404 || response.status === 403) return { status: 'missing' };
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
};

const asBot = <T>(env: Env, path: string): Promise<DiscordResult<T>> => call<T>(env, path, `Bot ${env.DISCORD_BOT_TOKEN}`);

const defaultAvatarUrl = (userId: string): string =>
  `${DISCORD_IMAGE_ORIGIN}/embed/avatars/${(BigInt(userId) >> 22n) % 6n}.png`;

export const avatarUrlOf = (user: DiscordUser): string =>
  user.avatar ? `${DISCORD_IMAGE_ORIGIN}/avatars/${user.id}/${user.avatar}.png?size=128` : defaultAvatarUrl(user.id);

export const guildIconUrl = (guildId: string, icon: string | null): string | null =>
  icon ? `${DISCORD_IMAGE_ORIGIN}/icons/${guildId}/${icon}.png?size=64` : null;

const toAccount = (user: DiscordUser): Account => ({
  id: user.id,
  name: user.global_name ?? user.username,
  avatarUrl: avatarUrlOf(user),
});

// On a server, people go by the nickname and the picture they have there.
export const accountOnServer = (guildId: string, member: DiscordMember): Account => ({
  id: member.user.id,
  name: member.nick ?? member.user.global_name ?? member.user.username,
  avatarUrl: member.avatar
    ? `${DISCORD_IMAGE_ORIGIN}/guilds/${guildId}/users/${member.user.id}/avatars/${member.avatar}.png?size=128`
    : avatarUrlOf(member.user),
});

// The access token is used once, to learn who just logged in, and is not kept anywhere.
export const exchangeLoginCode = async (env: Env, code: string, redirectUri: string): Promise<Account | null> => {
  try {
    const response = await fetch(`${env.DISCORD_API_URL}/oauth2/token`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${btoa(`${env.DISCORD_CLIENT_ID}:${env.DISCORD_CLIENT_SECRET}`)}`,
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': USER_AGENT,
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const { access_token: accessToken } = (await response.json()) as { access_token: string };
    const user = await call<DiscordUser>(env, '/users/@me', `Bearer ${accessToken}`);
    return user.status === 'ok' ? toAccount(user.value) : null;
  } catch {
    return null;
  }
};

export const fetchUser = async (env: Env, userId: string): Promise<Account | null> => {
  const user = await asBot<DiscordUser>(env, `/users/${userId}`);
  return user.status === 'ok' ? toAccount(user.value) : null;
};

export const fetchBotGuilds = async (env: Env): Promise<DiscordResult<BotGuild[]>> => {
  const guilds = await asBot<BotGuild[]>(env, `/users/@me/guilds?limit=${MAX_BOT_GUILDS}`);
  return guilds.status === 'ok' ? { status: 'ok', value: guilds.value.slice(0, MAX_BOT_GUILDS) } : guilds;
};

export const fetchGuildStructure = async (env: Env, guildId: string): Promise<DiscordResult<GuildStructure>> => {
  const [guild, channels] = await Promise.all([
    asBot<{ id: string; name: string; icon: string | null; owner_id: string; roles: Role[] }>(env, `/guilds/${guildId}`),
    asBot<Channel[]>(env, `/guilds/${guildId}/channels`),
  ]);
  if (guild.status === 'unavailable' || channels.status === 'unavailable') return { status: 'unavailable' };
  if (guild.status === 'missing' || channels.status === 'missing') return { status: 'missing' };

  const { id, name, icon, owner_id: ownerId, roles } = guild.value;
  return { status: 'ok', value: { id, name, icon, owner_id: ownerId, roles, channels: channels.value } };
};

export const fetchMember = async (env: Env, guildId: string, userId: string): Promise<DiscordResult<DiscordMember>> => {
  const member = await asBot<DiscordMember>(env, `/guilds/${guildId}/members/${userId}`);
  return member.status === 'ok' && member.value.pending ? { status: 'missing' } : member;
};
