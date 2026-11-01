import {
  CloseCode,
  ServerMessageSchema,
  WS_PING,
  WS_SUBPROTOCOL,
  WS_TOKEN_PREFIX,
  type Member,
  type ServerMessage,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import type { ConnectionStatus } from '../shared/ipc';
import { SERVER_URL } from './party-api';

const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000];
const PING_INTERVAL_MS = 3_000;
// A socket whose peer vanished can stay "open" for minutes, so silence is what counts as a lost connection.
const SILENCE_LIMIT_MS = 7_000;

export type ConnectionSnapshot = {
  status: ConnectionStatus;
  code: string;
  memberId: string;
  members: Member[];
};

type Listener = {
  onChange(snapshot: ConnectionSnapshot): void;
  onSessionRevoked(): void;
};

// Lives in the main process so the member token never reaches a window, and so both windows share one connection.
export class PartyConnection {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private lastHeardAt = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private stopped = false;
  private snapshot: ConnectionSnapshot;

  constructor(
    private readonly session: SessionResponse,
    private readonly listener: Listener,
  ) {
    this.snapshot = { status: 'connecting', code: session.code, memberId: session.memberId, members: [] };
  }

  start(): void {
    this.open();
    this.pingTimer = setInterval(() => this.keepAlive(), PING_INTERVAL_MS);
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.dropSocket();
  }

  reconnectNow(): void {
    if (this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.attempts = 0;
    this.dropSocket();
    this.publish({ status: 'connecting' });
    this.open();
  }

  setCode(code: string): void {
    this.publish({ code });
  }

  current(): ConnectionSnapshot {
    return this.snapshot;
  }

  private open(): void {
    const url = `${SERVER_URL.replace(/^http/, 'ws')}/v1/parties/${this.session.partyId}/ws`;
    const socket = new WebSocket(url, [WS_SUBPROTOCOL, `${WS_TOKEN_PREFIX}${this.session.token}`]);
    this.socket = socket;
    this.lastHeardAt = Date.now();

    socket.addEventListener('message', (event) => {
      if (socket === this.socket) this.onMessage(String(event.data));
    });
    socket.addEventListener('close', (event) => {
      if (socket === this.socket) this.onClosed(event.code);
    });
    // Every failed attempt is followed by a close event, which is where the retry is decided.
    socket.addEventListener('error', () => {});
  }

  private onMessage(raw: string): void {
    this.lastHeardAt = Date.now();

    let message: ServerMessage;
    try {
      message = ServerMessageSchema.parse(JSON.parse(raw));
    } catch {
      return;
    }

    switch (message.t) {
      case 'welcome':
        this.attempts = 0;
        this.publish({ status: 'online', code: message.code, memberId: message.memberId, members: message.members });
        break;
      case 'members':
        this.publish({ members: message.members });
        break;
      case 'code':
        this.publish({ code: message.code });
        break;
      case 'closing':
        this.onClosed(message.code);
        break;
      case 'pong':
        break;
    }
  }

  private onClosed(code: number): void {
    this.dropSocket();

    switch (code) {
      case CloseCode.Unauthorized:
      case CloseCode.Removed:
        this.listener.onSessionRevoked();
        return;
      case CloseCode.Replaced:
        this.publish({ status: 'replaced', members: [] });
        return;
      case CloseCode.UpdateRequired:
        this.publish({ status: 'update_required', members: [] });
        return;
      case CloseCode.PartyFull:
        this.publish({ status: 'party_full', members: [] });
        this.scheduleRetry();
        return;
      default:
        this.publish({ status: 'reconnecting' });
        this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempts, RECONNECT_DELAYS_MS.length - 1)]!;
    this.attempts += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private keepAlive(): void {
    const socket = this.socket;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) socket.send(WS_PING);

    if (Date.now() - this.lastHeardAt > SILENCE_LIMIT_MS) {
      this.dropSocket();
      this.publish({ status: 'reconnecting' });
      this.scheduleRetry();
    }
  }

  private dropSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }

  private publish(change: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.listener.onChange(this.snapshot);
  }
}
