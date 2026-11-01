import type { ApiErrorCode, Member } from '@livechatsbcb/protocol';

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

export type AppState = {
  version: string;
  update: UpdateStatus;
  lastName: string;
  party: PartyView | null;
  // Set when the service dropped this member, so the home screen can say why they are back on it.
  notice: 'session_expired' | null;
  stage: { visible: boolean; pinned: boolean };
};

export type ActionError = ApiErrorCode | 'network';
export type ActionResult = { ok: true } | { ok: false; error: ActionError };

export const IpcChannel = {
  GetState: 'state:get',
  StateChanged: 'state:changed',
  CreateParty: 'party:create',
  JoinParty: 'party:join',
  RotateCode: 'party:rotate-code',
  LeaveParty: 'party:leave',
  Reconnect: 'party:reconnect',
  CopyCode: 'party:copy-code',
  SetStageVisible: 'stage:set-visible',
  SetStagePinned: 'stage:set-pinned',
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
  setStageVisible(visible: boolean): Promise<void>;
  setStagePinned(pinned: boolean): Promise<void>;
  installUpdate(): Promise<void>;
};
