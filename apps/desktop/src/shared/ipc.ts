import type { ApiErrorCode, FileKind, MediaKind, Member } from '@livechatsbcb/protocol';

export type ConnectionStatus = 'connecting' | 'online' | 'reconnecting' | 'replaced' | 'party_full' | 'update_required';

export type PartyView = {
  code: string;
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
};

export type DisplayView = { id: number; label: string };

export type PlaybackView = {
  id: string;
  senderName: string;
  kind: MediaKind;
  caption: string;
  clipStartMs: number;
  durationMs: number;
  // On this PC's clock. Null while the party is still getting ready.
  startAt: number | null;
  // Null until the file has reached this PC.
  mediaUrl: string | null;
};

export type QueueView = { current: PlaybackView | null; waiting: number };

export type DraftMedia = { name: string; size: number; kind: FileKind; previewUrl: string };
export type UploadView = { name: string; percent: number };

export type AppState = {
  version: string;
  update: UpdateStatus;
  lastName: string;
  party: PartyView | null;
  // Set when the service dropped this member, so the home screen can say why they are back on it.
  notice: 'session_expired' | null;
  settings: Settings;
  displays: DisplayView[];
  overlayTest: boolean;
  queue: QueueView;
  upload: UploadView | null;
};

export type ActionError = ApiErrorCode | 'network' | 'cancelled';
export type ActionResult = { ok: true } | { ok: false; error: ActionError };

export type PickResult =
  | { ok: true; draft: DraftMedia }
  | { ok: false; error: 'cancelled' | 'too_large' | 'empty' | 'unsupported' };

export type SendMediaInput = {
  caption: string;
  clipStartMs: number;
  durationMs: number;
  withFile: boolean;
};

export const IpcChannel = {
  GetState: 'state:get',
  StateChanged: 'state:changed',
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
  SetSettings: 'settings:set',
  TestOverlay: 'overlay:test',
  InstallUpdate: 'update:install',
} as const;

export type LiveChatApi = {
  getState(): Promise<AppState>;
  onState(listener: (state: AppState) => void): () => void;
  createParty(name: string): Promise<ActionResult>;
  joinParty(code: string, name: string): Promise<ActionResult>;
  rotateCode(): Promise<ActionResult>;
  leaveParty(): Promise<ActionResult>;
  reconnect(): Promise<void>;
  copyCode(): Promise<void>;
  pickMedia(): Promise<PickResult>;
  clearDraft(): Promise<void>;
  sendMedia(input: SendMediaInput): Promise<ActionResult>;
  cancelUpload(): Promise<void>;
  skipMedia(mediaId: string): Promise<void>;
  setSettings(change: Partial<Settings>): Promise<void>;
  testOverlay(): Promise<void>;
  installUpdate(): Promise<void>;
};
