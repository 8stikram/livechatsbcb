import {
  CloseCode,
  ServerMessageSchema,
  WS_SUBPROTOCOL,
  WS_TOKEN_PREFIX,
  type ClientMessage,
  type Member,
  type QueueItem,
  type ServerMessage,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import type { ConnectionStatus } from '../shared/ipc';
import { KeepAliveSocket } from './keep-alive-socket';
import { SERVER_URL } from './party-api';

const CLOCK_SAMPLES = 4;

export type ConnectionSnapshot = {
  status: ConnectionStatus;
  code: string | null;
  memberId: string;
  members: Member[];
  queue: QueueItem[];
};

type Listener = {
  onChange(snapshot: ConnectionSnapshot): void;
  onSessionRevoked(closeCode: number): void;
};

// Lives in the main process so the member token never reaches a window, and so both windows share one connection.
export class PartyConnection {
  private readonly socket: KeepAliveSocket;
  private snapshot: ConnectionSnapshot;
  private clockOffsetMs = 0;
  private bestRoundTripMs = Infinity;
  private clockSamplesLeft = 0;
  private readonly readyIds = new Set<string>();

  constructor(
    session: SessionResponse,
    private readonly listener: Listener,
  ) {
    this.snapshot = { status: 'connecting', code: session.code, memberId: session.memberId, members: [], queue: [] };
    this.socket = new KeepAliveSocket(
      `${SERVER_URL.replace(/^http/, 'ws')}/v1/parties/${session.partyId}/ws`,
      [WS_SUBPROTOCOL, `${WS_TOKEN_PREFIX}${session.token}`],
      { pingEveryMs: 3_000, silenceLimitMs: 7_000, retryDelaysMs: [250, 500, 1_000, 2_000, 4_000] },
      {
        onMessage: (raw) => this.onMessage(raw),
        onClosed: (code) => this.onClosed(code),
        onSilence: () => {
          this.clockSamplesLeft = 0;
          this.publish({ status: 'reconnecting' });
          this.socket.scheduleRetry();
        },
      },
    );
  }

  start(): void {
    this.socket.start();
  }

  stop(): void {
    this.socket.stop();
  }

  reconnectNow(): void {
    this.clockSamplesLeft = 0;
    this.publish({ status: 'connecting' });
    this.socket.reconnectNow();
  }

  setCode(code: string): void {
    this.publish({ code });
  }

  current(): ConnectionSnapshot {
    return this.snapshot;
  }

  toLocalTime(serviceTime: number): number {
    return Math.round(serviceTime - this.clockOffsetMs);
  }

  reportReady(mediaId: string): void {
    this.readyIds.add(mediaId);
    this.send({ t: 'ready', mediaId });
  }

  skip(mediaId: string): void {
    this.send({ t: 'skip', mediaId });
  }

  private send(message: ClientMessage): void {
    this.socket.send(JSON.stringify(message));
  }

  private onMessage(raw: string): void {
    let message: ServerMessage;
    try {
      message = ServerMessageSchema.parse(JSON.parse(raw));
    } catch {
      return;
    }

    switch (message.t) {
      case 'welcome':
        this.socket.markWelcomed();
        this.publish({
          status: 'online',
          code: message.code,
          memberId: message.memberId,
          members: message.members,
          queue: message.queue,
        });
        // The service forgets nothing, but anything reported while disconnected never reached it.
        for (const mediaId of this.readyIds) this.send({ t: 'ready', mediaId });
        this.syncClock();
        break;
      case 'members':
        this.publish({ members: message.members });
        break;
      case 'code':
        this.publish({ code: message.code });
        break;
      case 'queue': {
        const known = new Set(this.snapshot.queue.map((item) => item.id));
        const hasNewItem = message.queue.some((item) => !known.has(item.id));
        const queued = new Set(message.queue.map((item) => item.id));
        for (const mediaId of this.readyIds) if (!queued.has(mediaId)) this.readyIds.delete(mediaId);
        this.publish({ queue: message.queue });
        // Clocks drift slowly, so correcting whenever something new arrives is often enough.
        if (hasNewItem) this.syncClock();
        break;
      }
      case 'time':
        this.onClockSample(message.c, message.s);
        break;
      case 'closing':
        this.onClosed(message.code);
        break;
      case 'pong':
        break;
    }
  }

  private onClosed(code: number): void {
    this.socket.drop();
    this.clockSamplesLeft = 0;

    switch (code) {
      case CloseCode.Unauthorized:
      case CloseCode.Removed:
        this.listener.onSessionRevoked(code);
        return;
      case CloseCode.Replaced:
        this.publish({ status: 'replaced', members: [] });
        return;
      case CloseCode.UpdateRequired:
        this.publish({ status: 'update_required', members: [] });
        return;
      case CloseCode.PartyFull:
        this.publish({ status: 'party_full', members: [] });
        this.socket.scheduleRetry();
        return;
      default:
        this.publish({ status: 'reconnecting' });
        this.socket.scheduleRetry();
    }
  }

  private syncClock(): void {
    if (this.clockSamplesLeft > 0) return;
    this.bestRoundTripMs = Infinity;
    this.clockSamplesLeft = CLOCK_SAMPLES;
    this.send({ t: 'time', c: Date.now() });
  }

  // The quickest exchange is the one least distorted by the network, so it is the one to trust.
  private onClockSample(sentAt: number, serviceTime: number): void {
    const now = Date.now();
    const roundTrip = now - sentAt;
    if (roundTrip < this.bestRoundTripMs) {
      this.bestRoundTripMs = roundTrip;
      this.clockOffsetMs = serviceTime - (sentAt + now) / 2;
    }

    this.clockSamplesLeft -= 1;
    if (this.clockSamplesLeft > 0) {
      this.send({ t: 'time', c: Date.now() });
    } else {
      this.publish({});
    }
  }

  private publish(change: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.listener.onChange(this.snapshot);
  }
}
