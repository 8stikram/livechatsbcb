import type {
  Account,
  ApiErrorCode,
  FileKind,
  GuildSummary,
  MediaKind,
  Member,
} from '@livechatsbcb/protocol';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'replaced' | 'party_full' | 'update_required';

export type PartyView = {
  partyId: string;
  // Either a private party with its code, or the party of a Discord server.
  code: string | null;
  guild: GuildSummary | null;
  memberId: string;
  members: Member[];
  connection: ConnectionStatus;
};

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string };

// In percent of the screen, so a layout survives a change of resolution.
export type Zone = { x: number; y: number; w: number; h: number };
export type OverlayLayout = { profile: Zone; media: Zone; text: Zone };

export type Settings = {
  overlayEnabled: boolean;
  displayId: number | null;
  volume: number;
  muted: boolean;
  layout: OverlayLayout;
  launchAtStartup: boolean;
  // Closing the window keeps the app running, which is worth explaining the first time and only then.
  backgroundHintShown: boolean;
};

export const DEFAULT_LAYOUT: OverlayLayout = {
  profile: { x: 2, y: 3, w: 34, h: 12 },
  media: { x: 20, y: 14, w: 60, h: 62 },
  text: { x: 5, y: 78, w: 90, h: 18 },
};

export const DEFAULT_SETTINGS: Settings = {
  overlayEnabled: true,
  displayId: null,
  volume: 100,
  muted: false,
  layout: DEFAULT_LAYOUT,
  launchAtStartup: true,
  backgroundHintShown: false,
};

export type DisplayView = { id: number; label: string };

export type PlaybackView = {
  id: string;
  senderName: string;
  senderAvatarUrl: string | null;
  kind: MediaKind;
  caption: string;
  fileName: string | null;
  clipStartMs: number;
  durationMs: number;
  // On this PC's clock. Null while the party is still getting ready.
  startAt: number | null;
  // Null until the file has reached this PC.
  mediaUrl: string | null;
  // A sound played beside the picture. It leads: the passage is its own, and a video stays silent and starts at 0.
  hasSound: boolean;
  soundUrl: string | null;
};

export type UpcomingView = {
  id: string;
  senderName: string;
  kind: MediaKind;
  caption: string;
  fileName: string | null;
  replay: boolean;
};

export type QueueView = { current: PlaybackView | null; upcoming: UpcomingView[] };

export type HistoryView = {
  id: string;
  senderName: string;
  senderAvatarUrl: string | null;
  kind: MediaKind;
  caption: string;
  fileName: string | null;
  // On this PC's clock.
  playedAt: number;
};

// Played again on this PC alone. Null playback while the file is on its way.
export type LocalReplayView = { historyId: string; playback: PlaybackView | null };

export type DraftMedia = { name: string; size: number; kind: FileKind; previewUrl: string };
// What is being asked for: anything at first, then whichever of the two is still missing.
export type DraftSlot = 'picture' | 'sound';
export type UploadView = { name: string; percent: number };

export type AppState = {
  version: string;
  update: UpdateStatus;
  account: Account | null;
  // Waiting for the browser to come back from Discord.
  loggingIn: boolean;
  // All the person's Discord servers. Null until the service has answered.
  guilds: GuildSummary[] | null;
  // Discord didn't answer, so the list may be short.
  guildsPartial: boolean;
  // The ones the person chose to use the app with, shown as round pictures on the side.
  addedGuilds: GuildSummary[];
  // A private party can be gone back to without typing its code again.
  hasPrivateParty: boolean;
  party: PartyView | null;
  // Why the last attempt at entering a server's party failed.
  joinError: ActionError | null;
  // Set when the service dropped this member, so the home screen can say why they are back on it.
  notice: 'session_expired' | 'guild_lost' | 'account_expired' | null;
  settings: Settings;
  displays: DisplayView[];
  overlayTest: boolean;
  queue: QueueView;
  history: HistoryView[];
  localReplay: LocalReplayView | null;
  upload: UploadView | null;
};

export type ActionError = ApiErrorCode | 'network' | 'cancelled' | 'login_denied' | 'login_timeout';
export type ActionResult = { ok: true } | { ok: false; error: ActionError };

export type PickResult =
  | { ok: true; draft: DraftMedia }
  | { ok: false; error: 'cancelled' | 'too_large' | 'empty' | 'unsupported' };

export type SendMediaInput = {
  caption: string;
  clipStartMs: number;
  durationMs: number;
  withPicture: boolean;
  withSound: boolean;
};

export const IpcChannel = {
  GetState: 'state:get',
  StateChanged: 'state:changed',
  Login: 'account:login',
  CancelLogin: 'account:cancel-login',
  Logout: 'account:logout',
  RefreshGuilds: 'guilds:refresh',
  SetGuilds: 'guilds:set',
  JoinGuild: 'guilds:join',
  ReturnToPrivateParty: 'party:return-private',
  CreateParty: 'party:create',
  JoinParty: 'party:join',
  RotateCode: 'party:rotate-code',
  LeaveParty: 'party:leave',
  Reconnect: 'party:reconnect',
  CopyCode: 'party:copy-code',
  PickMedia: 'media:pick',
  ClearDraft: 'media:clear-draft',
  SendMedia: 'media:send',
  CancelUpload: 'media:cancel-upload',
  SkipMedia: 'media:skip',
  ReplayForAll: 'history:replay-for-all',
  ReplayForMe: 'history:replay-for-me',
  StopLocalReplay: 'history:stop-local-replay',
  SetSettings: 'settings:set',
  TestOverlay: 'overlay:test',
  InstallUpdate: 'update:install',
} as const;

export type LiveChatApi = {
  getState(): Promise<AppState>;
  onState(listener: (state: AppState) => void): () => void;
  login(): Promise<ActionResult>;
  cancelLogin(): Promise<void>;
  logout(): Promise<void>;
  refreshGuilds(): Promise<void>;
  setGuilds(guildIds: string[]): Promise<ActionResult>;
  joinGuild(guildId: string): Promise<ActionResult>;
  returnToPrivateParty(): Promise<ActionResult>;
  createParty(): Promise<ActionResult>;
  joinParty(code: string): Promise<ActionResult>;
  rotateCode(): Promise<ActionResult>;
  leaveParty(): Promise<ActionResult>;
  reconnect(): Promise<void>;
  copyCode(): Promise<void>;
  pickMedia(slot?: DraftSlot): Promise<PickResult>;
  clearDraft(slot: DraftSlot): Promise<void>;
  sendMedia(input: SendMediaInput): Promise<ActionResult>;
  cancelUpload(): Promise<void>;
  skipMedia(mediaId: string): Promise<void>;
  replayForAll(historyId: string): Promise<ActionResult>;
  replayForMe(historyId: string): Promise<ActionResult>;
  stopLocalReplay(): Promise<void>;
  setSettings(change: Partial<Settings>): Promise<void>;
  testOverlay(): Promise<void>;
  installUpdate(): Promise<void>;
};
