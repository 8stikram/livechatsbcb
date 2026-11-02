import type {
  Account,
  ApiErrorCode,
  FileKind,
  GuildSummary,
  MediaKind,
  Member,
  SceneLayer,
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

export type UpdateCheckOutcome = 'latest' | 'found' | 'failed' | 'unavailable';

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
  // The notes were offered for this version. Null for someone who never had the choice yet.
  seenVersion: string | null;
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
  seenVersion: null,
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
  // A sound played beside the picture. Beside a video it starts at 0, as the passage is the video's.
  hasSound: boolean;
  soundUrl: string | null;
  videoMuted: boolean;
  soundMuted: boolean;
  // The advanced mode: what replaces the picture, each with its file. Null url until it has reached this PC.
  scene: SceneLayerView[] | null;
};

export type SceneLayerView = Omit<SceneLayer, 'file'> & { kind: 'image' | 'video'; url: string | null };

// Starred in the history, and kept on this PC for as long as the star stays.
export type FavoriteView = {
  id: string;
  name: string;
  kind: MediaKind;
  senderName: string;
  senderAvatarUrl: string | null;
  savedAt: number;
  thumbnailUrl: string | null;
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
  // Null until it is starred. Keeping says its files are on their way to this PC.
  favoriteId: string | null;
  keeping: boolean;
};

// Played again on this PC alone. Null playback while the file is on its way.
export type LocalReplayView = { historyId: string; playback: PlaybackView | null };

export type DraftMedia = { name: string; size: number; kind: FileKind; previewUrl: string };
// A file of the advanced mode, which the window then points at.
export type SceneFile = DraftMedia & { id: string };
export type SceneResult = { ok: true; file: SceneFile } | { ok: false; error: 'cancelled' | 'unsupported' | 'empty' | 'not_found' };
export type EditedLayer = Omit<SceneLayer, 'file'> & { fileId: string };
export type SceneInput = {
  caption: string;
  clipStartMs: number;
  durationMs: number;
  videoMuted: boolean;
  soundMuted: boolean;
  layers: EditedLayer[];
  soundId: string | null;
};
export type LoadedScene = SceneInput & { files: SceneFile[] };
// What is being asked for: anything at first, then whichever of the two is still missing.
export type DraftSlot = 'picture' | 'sound';

export type LibraryFileView = {
  id: string;
  url: string;
  name: string;
  size: number;
  kind: FileKind;
  modifiedAt: number;
  favorite: boolean;
};

export type SavedView = {
  id: string;
  name: string;
  caption: string;
  favorite: boolean;
  savedAt: number;
  kind: MediaKind;
  files: Array<{ name: string; kind: FileKind; missing: boolean }>;
  thumbnailUrl: string | null;
};

export type LibraryView = {
  folders: Array<{ path: string; missing: boolean }>;
  files: LibraryFileView[];
  // Too many files in the folders: only the first ones are listed.
  truncated: boolean;
  saved: SavedView[];
};

// What a line of a right-click menu leaves to the window. The other lines are done by the app itself.
export type FileMenuAction = 'use' | 'send' | 'listen' | 'favorite' | 'rename' | 'trash';
export type SavedMenuAction = 'send' | 'edit' | 'relocate' | 'favorite';
export type RenameOutcome = 'renamed' | 'invalid' | 'exists' | 'not_found' | 'busy';

// A saved LiveChat put back in the editor.
export type LoadedDraft = {
  picture: DraftMedia | null;
  sound: DraftMedia | null;
  caption: string;
  clipStartMs: number;
  durationMs: number;
  videoMuted: boolean;
  soundMuted: boolean;
};
// Paused: no connection for now, and it carries on by itself when it comes back.
export type UploadView = { name: string; percent: number; paused: boolean };

export type AppState = {
  version: string;
  update: UpdateStatus;
  // Seconds before the app restarts to install an update. Null when it isn't about to.
  restartIn: number | null;
  whatsNew: boolean;
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
  favorites: FavoriteView[];
  localReplay: LocalReplayView | null;
  upload: UploadView | null;
};

export type ActionError = ApiErrorCode | 'network' | 'gave_up' | 'cancelled' | 'login_denied' | 'login_timeout';
export type ActionResult = { ok: true } | { ok: false; error: ActionError };

export type PickResult =
  | { ok: true; draft: DraftMedia }
  | { ok: false; error: 'cancelled' | 'too_large' | 'empty' | 'unsupported' };

export type SendMediaInput = {
  caption: string;
  clipStartMs: number;
  durationMs: number;
  videoMuted: boolean;
  soundMuted: boolean;
  withPicture: boolean;
  withSound: boolean;
};

export type SaveLiveChatInput = SendMediaInput & { name: string };

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
  ScanLibrary: 'library:scan',
  AddLibraryFolder: 'library:add-folder',
  RemoveLibraryFolder: 'library:remove-folder',
  SetLibraryFavorite: 'library:set-favorite',
  UseLibraryFile: 'library:use-file',
  ShowLibraryFileMenu: 'library:file-menu',
  StartScene: 'scene:start',
  PickSceneFile: 'scene:pick-file',
  UseLibraryFileInScene: 'scene:use-library-file',
  ForgetSceneFile: 'scene:forget-file',
  SendScene: 'scene:send',
  SaveScene: 'scene:save',
  ShowSavedMenu: 'library:saved-menu',
  SendLibraryFile: 'library:send-file',
  RenameLibraryFile: 'library:rename-file',
  TrashLibraryFile: 'library:trash-file',
  SaveLiveChat: 'library:save',
  SendSaved: 'library:send-saved',
  EditSaved: 'library:edit-saved',
  RelocateSaved: 'library:relocate-saved',
  SetSavedFavorite: 'library:set-saved-favorite',
  DeleteSaved: 'library:delete-saved',
  ReplayForAll: 'history:replay-for-all',
  ReplayForMe: 'history:replay-for-me',
  KeepHistory: 'history:keep',
  ReplayFavoriteForMe: 'history:replay-favorite-for-me',
  StopLocalReplay: 'history:stop-local-replay',
  SetSettings: 'settings:set',
  TestOverlay: 'overlay:test',
  CheckForUpdates: 'update:check',
  MarkNotesSeen: 'update:notes-seen',
  StashView: 'restart:stash-view',
  StashDraft: 'restart:stash-draft',
  TakeRestartStash: 'restart:take-stash',
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
  scanLibrary(): Promise<LibraryView>;
  // Null when the person changed their mind.
  addLibraryFolder(): Promise<LibraryView | null>;
  removeLibraryFolder(path: string): Promise<LibraryView>;
  setLibraryFavorite(fileId: string, favorite: boolean): Promise<LibraryView>;
  useLibraryFile(fileId: string): Promise<{ ok: true; draft: DraftMedia } | { ok: false }>;
  startScene(): Promise<SceneFile[]>;
  pickSceneFile(wanted: 'picture' | 'sound'): Promise<SceneResult>;
  useLibraryFileInScene(fileId: string): Promise<SceneResult>;
  forgetSceneFile(id: string): Promise<void>;
  sendScene(input: SceneInput): Promise<ActionResult>;
  saveScene(input: SceneInput & { name: string }): Promise<ActionResult>;
  showLibraryFileMenu(fileId: string, canSend: boolean): Promise<{ action: FileMenuAction | null; missing?: true }>;
  showSavedMenu(savedId: string, canSend: boolean): Promise<{ action: SavedMenuAction | null; library?: LibraryView }>;
  sendLibraryFile(fileId: string, durationMs: number): Promise<ActionResult>;
  renameLibraryFile(fileId: string, name: string): Promise<{ outcome: RenameOutcome; library: LibraryView }>;
  trashLibraryFile(fileId: string): Promise<{ outcome: 'trashed' | 'cancelled' | 'busy'; library: LibraryView }>;
  saveLiveChat(input: SaveLiveChatInput): Promise<ActionResult>;
  sendSaved(savedId: string): Promise<ActionResult>;
  editSaved(savedId: string): Promise<{ ok: true; draft: LoadedDraft } | { ok: true; scene: LoadedScene } | { ok: false }>;
  relocateSaved(savedId: string): Promise<{ outcome: 'found' | 'cancelled' | 'wrong_file'; library: LibraryView }>;
  setSavedFavorite(savedId: string, favorite: boolean): Promise<LibraryView>;
  deleteSaved(savedId: string): Promise<LibraryView>;
  replayForAll(historyId: string): Promise<ActionResult>;
  replayForMe(historyId: string): Promise<ActionResult>;
  keepHistory(historyId: string): Promise<ActionResult>;
  replayFavoriteForMe(savedId: string): Promise<ActionResult>;
  stopLocalReplay(): Promise<void>;
  setSettings(change: Partial<Settings>): Promise<void>;
  testOverlay(): Promise<void>;
  checkForUpdates(): Promise<UpdateCheckOutcome>;
  markNotesSeen(): Promise<void>;
  stashView(view: string): Promise<void>;
  stashDraft(advanced: boolean, input: unknown): Promise<void>;
  takeRestartStash(): Promise<{ view: string | null; loaded: { draft: LoadedDraft } | { scene: LoadedScene } | null }>;
};
