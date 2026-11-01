import { describe, expect, it } from 'vitest';
import {
  CHANNEL_TYPE,
  canViewChannel,
  hasAppAccess,
  sectionsInDisplayOrder,
  type Channel,
  type GuildStructure,
  type Overwrite,
} from '../src/permissions';

const VIEW = '1024';
const ADMIN = '8';
const GUILD_ID = '1000';
const OWNER_ID = '1';
const USER_ID = '2';
const ROLE_A = '11';
const ROLE_B = '12';

const guildWith = (everyone = VIEW, extra: GuildStructure['roles'] = []): GuildStructure => ({
  id: GUILD_ID,
  name: 'Serveur',
  icon: null,
  owner_id: OWNER_ID,
  roles: [
    { id: GUILD_ID, name: '@everyone', permissions: everyone },
    { id: ROLE_A, name: 'Role A', permissions: '0' },
    { id: ROLE_B, name: 'Role B', permissions: '0' },
    ...extra,
  ],
  channels: [],
});

const channelWith = (permission_overwrites: Overwrite[]): Channel => ({
  id: '500',
  type: CHANNEL_TYPE.text,
  name: 'salon',
  position: 0,
  permission_overwrites,
});

const role = (id: string, allow: string, deny: string): Overwrite => ({ id, type: 0, allow, deny });
const person = (id: string, allow: string, deny: string): Overwrite => ({ id, type: 1, allow, deny });

const sees = (guild: GuildStructure, roles: string[], overwrites: Overwrite[], userId = USER_ID) =>
  canViewChannel(guild, userId, { roles }, channelWith(overwrites));

describe('who can see a channel', () => {
  it('follows the server when the channel says nothing', () => {
    expect(sees(guildWith(VIEW), [], [])).toBe(true);
    expect(sees(guildWith('0'), [], [])).toBe(false);
  });

  it('hides a channel closed to everyone', () => {
    expect(sees(guildWith(), [], [role(GUILD_ID, '0', VIEW)])).toBe(false);
  });

  it('opens it to the holders of a role', () => {
    const overwrites = [role(GUILD_ID, '0', VIEW), role(ROLE_A, VIEW, '0')];
    expect(sees(guildWith(), [ROLE_A], overwrites)).toBe(true);
    expect(sees(guildWith(), [ROLE_B], overwrites)).toBe(false);
  });

  it('lets an allow on one role beat a deny on another', () => {
    const overwrites = [role(ROLE_A, '0', VIEW), role(ROLE_B, VIEW, '0')];
    expect(sees(guildWith(), [ROLE_A, ROLE_B], overwrites)).toBe(true);
    expect(sees(guildWith(), [ROLE_A], overwrites)).toBe(false);
  });

  it('gives the last word to what is set for that person', () => {
    expect(sees(guildWith(), [ROLE_A], [role(ROLE_A, VIEW, '0'), person(USER_ID, '0', VIEW)])).toBe(false);
    expect(sees(guildWith(), [], [role(GUILD_ID, '0', VIEW), person(USER_ID, VIEW, '0')])).toBe(true);
  });

  it('does not mistake a person for a role with the same id', () => {
    expect(sees(guildWith(), [ROLE_A], [person(ROLE_A, '0', VIEW)])).toBe(true);
  });

  it('never hides anything from the owner or an administrator', () => {
    const closed = [role(GUILD_ID, '0', VIEW), person(OWNER_ID, '0', VIEW)];
    expect(sees(guildWith(), [], closed, OWNER_ID)).toBe(true);

    const withAdmin = guildWith(VIEW, [{ id: '13', name: 'Admin', permissions: ADMIN }]);
    expect(sees(withAdmin, ['13'], [role(GUILD_ID, '0', VIEW), person(USER_ID, '0', VIEW)])).toBe(true);
  });
});

describe('who can use the app on a server', () => {
  const guild = guildWith(VIEW, [
    { id: '14', name: 'LiveChat', permissions: '0' },
    { id: '13', name: 'Admin', permissions: ADMIN },
  ]);

  it('takes the LiveChat role, whatever its case', () => {
    expect(hasAppAccess(guild, USER_ID, { roles: ['14'] }, false)).toBe(true);
    const lowered = guildWith(VIEW, [{ id: '14', name: 'livechat', permissions: '0' }]);
    expect(hasAppAccess(lowered, USER_ID, { roles: ['14'] }, false)).toBe(true);
  });

  it('refuses anyone else', () => {
    expect(hasAppAccess(guild, USER_ID, { roles: [ROLE_A] }, false)).toBe(false);
    expect(hasAppAccess(guild, USER_ID, { roles: [] }, false)).toBe(false);
  });

  it('needs no role from the owner, an administrator, or on a server open to all', () => {
    expect(hasAppAccess(guild, OWNER_ID, { roles: [] }, false)).toBe(true);
    expect(hasAppAccess(guild, USER_ID, { roles: ['13'] }, false)).toBe(true);
    expect(hasAppAccess(guild, USER_ID, { roles: [] }, true)).toBe(true);
  });
});

describe('the order of channels', () => {
  const channel = (id: string, type: number, position: number, parent_id: string | null = null, name = id): Channel => ({
    id,
    type,
    name,
    position,
    parent_id,
  });

  const guild: GuildStructure = {
    ...guildWith(),
    channels: [
      channel('100', CHANNEL_TYPE.category, 1, null, 'Deuxième'),
      channel('101', CHANNEL_TYPE.category, 0, null, 'Première'),
      channel('102', CHANNEL_TYPE.category, 2, null, 'Vide'),
      channel('201', CHANNEL_TYPE.voice, 0, '101', 'vocal'),
      channel('202', CHANNEL_TYPE.text, 5, '101', 'texte-b'),
      channel('203', CHANNEL_TYPE.text, 1, '101', 'texte-a'),
      channel('204', CHANNEL_TYPE.announcement, 0, '100', 'annonces'),
      channel('205', CHANNEL_TYPE.text, 3, null, 'sans-categorie'),
      channel('206', CHANNEL_TYPE.text, 2, '102', 'cache'),
      // A thread or anything unknown isn't a place to meet.
      channel('207', 11, 0, null, 'fil'),
    ],
  };

  const names = (visible: (channel: Channel) => boolean) =>
    sectionsInDisplayOrder(guild, visible).map((section) => [section.name, section.channels.map(({ name }) => name)]);

  it('follows Discord: no category first, then categories in order, text above voice', () => {
    expect(names(({ id }) => id !== '206')).toEqual([
      ['', ['sans-categorie']],
      ['Première', ['texte-a', 'texte-b', 'vocal']],
      ['Deuxième', ['annonces']],
    ]);
  });

  it('breaks a tie on position by id', () => {
    const tied: GuildStructure = {
      ...guild,
      channels: [channel('302', CHANNEL_TYPE.text, 0, null, 'deux'), channel('301', CHANNEL_TYPE.text, 0, null, 'un')],
    };
    expect(sectionsInDisplayOrder(tied, () => true)[0]!.channels.map(({ name }) => name)).toEqual(['un', 'deux']);
  });
});
