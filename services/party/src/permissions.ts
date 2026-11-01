// Works out what a member may see, the way Discord itself does. Everything here decides who gets access to what, and
// nothing here touches the network, so that it can be tested on its own.

export type Role = { id: string; name: string; permissions: string };
export type Overwrite = { id: string; type: number; allow: string; deny: string };
export type Channel = {
  id: string;
  type: number;
  name: string;
  position: number;
  parent_id?: string | null;
  permission_overwrites?: Overwrite[];
};
export type GuildStructure = {
  id: string;
  name: string;
  icon: string | null;
  owner_id: string;
  roles: Role[];
  channels: Channel[];
};
export type GuildMember = { roles: string[] };

const ADMINISTRATOR = 1n << 3n;
const VIEW_CHANNEL = 1n << 10n;

const OVERWRITE_FOR_ROLE = 0;
const OVERWRITE_FOR_MEMBER = 1;

// The role a server gives to the people allowed to use the app, unless that server is open to all its members.
const ACCESS_ROLE_NAME = 'livechat';

export const CHANNEL_TYPE = {
  text: 0,
  voice: 2,
  category: 4,
  announcement: 5,
  stage: 13,
  forum: 15,
  media: 16,
} as const;

const TEXT_LIKE = new Set<number>([CHANNEL_TYPE.text, CHANNEL_TYPE.announcement, CHANNEL_TYPE.forum, CHANNEL_TYPE.media]);
const VOICE_LIKE = new Set<number>([CHANNEL_TYPE.voice, CHANNEL_TYPE.stage]);

const basePermissions = (guild: GuildStructure, member: GuildMember): bigint => {
  const held = new Set(member.roles);
  let permissions = 0n;
  for (const role of guild.roles) {
    // The @everyone role has the id of the guild, and members don't list it among their roles.
    if (role.id === guild.id || held.has(role.id)) permissions |= BigInt(role.permissions);
  }
  return permissions;
};

export const isServerAdmin = (guild: GuildStructure, userId: string, member: GuildMember): boolean =>
  guild.owner_id === userId || (basePermissions(guild, member) & ADMINISTRATOR) !== 0n;

export const hasAppAccess = (guild: GuildStructure, userId: string, member: GuildMember, open: boolean): boolean => {
  if (open || isServerAdmin(guild, userId, member)) return true;
  const held = new Set(member.roles);
  return guild.roles.some((role) => held.has(role.id) && role.name.toLowerCase() === ACCESS_ROLE_NAME);
};

export const canViewChannel = (
  guild: GuildStructure,
  userId: string,
  member: GuildMember,
  channel: Channel,
): boolean => {
  if (isServerAdmin(guild, userId, member)) return true;

  const overwrites = channel.permission_overwrites ?? [];
  const held = new Set(member.roles);
  let permissions = basePermissions(guild, member);

  const everyone = overwrites.find((overwrite) => overwrite.id === guild.id);
  if (everyone) permissions = (permissions & ~BigInt(everyone.deny)) | BigInt(everyone.allow);

  // Taken together rather than one after the other: an allow on any role beats a deny on any other.
  let allow = 0n;
  let deny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type === OVERWRITE_FOR_ROLE && overwrite.id !== guild.id && held.has(overwrite.id)) {
      allow |= BigInt(overwrite.allow);
      deny |= BigInt(overwrite.deny);
    }
  }
  permissions = (permissions & ~deny) | allow;

  const own = overwrites.find((overwrite) => overwrite.type === OVERWRITE_FOR_MEMBER && overwrite.id === userId);
  if (own) permissions = (permissions & ~BigInt(own.deny)) | BigInt(own.allow);

  return (permissions & VIEW_CHANNEL) !== 0n;
};

export const isPartyChannel = (channel: Channel): boolean => TEXT_LIKE.has(channel.type) || VOICE_LIKE.has(channel.type);

export const channelKind = (channel: Channel): 'text' | 'voice' => (VOICE_LIKE.has(channel.type) ? 'voice' : 'text');

const byPosition = (a: Channel, b: Channel): number =>
  a.position - b.position || (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

// Discord lists text channels above voice channels in each section, whatever their positions say.
const inDisplayOrder = (channels: Channel[]): Channel[] => [
  ...channels.filter((channel) => !VOICE_LIKE.has(channel.type)).toSorted(byPosition),
  ...channels.filter((channel) => VOICE_LIKE.has(channel.type)).toSorted(byPosition),
];

export type ChannelSection = { id: string | null; name: string; channels: Channel[] };

// The way Discord shows a server: what has no category first, then each category with something left to show.
export const sectionsInDisplayOrder = (guild: GuildStructure, visible: (channel: Channel) => boolean): ChannelSection[] => {
  const channels = guild.channels.filter((channel) => isPartyChannel(channel) && visible(channel));
  const categories = guild.channels.filter((channel) => channel.type === CHANNEL_TYPE.category).toSorted(byPosition);
  const known = new Set(categories.map((category) => category.id));

  const sections: ChannelSection[] = [
    {
      id: null,
      name: '',
      channels: inDisplayOrder(channels.filter((channel) => !channel.parent_id || !known.has(channel.parent_id))),
    },
    ...categories.map((category) => ({
      id: category.id,
      name: category.name,
      channels: inDisplayOrder(channels.filter((channel) => channel.parent_id === category.id)),
    })),
  ];
  return sections.filter((section) => section.channels.length > 0);
};
