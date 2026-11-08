import {
  CloseCode,
  ServerMessageSchema,
  WS_APP_PREFIX,
  WS_LOBBY,
  WS_PING,
  WS_SUBPROTOCOL,
  WS_TOKEN_PREFIX,
  type Activity,
  type ClientMessage,
  type Game,
  type GameKind,
  type GameReaction,
  type HistoryItem,
  type Member,
  type Poll,
  type QueueItem,
  type ServerMessage,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import type { ConnectionStatus } from '../shared/ipc';
import { SERVER_URL } from './party-api';

const RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000];
const PING_INTERVAL_MS = 3_000;
// A socket whose peer vanished can stay "open" for minutes, so silence is what counts as a lost connection.
const SILENCE_LIMIT_MS = 7_000;
// A connection that never answers is given up on sooner than one that stopped talking.
const CONNECT_LIMIT_MS = 5_000;
const CLOCK_SAMPLES = 4;

export type ConnectionSnapshot = {
  status: ConnectionStatus;
  code: string | null;
  memberId: string;
  members: Member[];
  queue: QueueItem[];
  history: HistoryItem[];
  poll: Poll | null;
  game: Game | null;
};

type Listener = {
  onChange(snapshot: ConnectionSnapshot): void;
  onSessionRevoked(closeCode: number): void;
  onUnreadable(): void;
  onSkipped(memberId: string, name: string): void;
  onReaction(memberId: string, emoji: GameReaction): void;
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
  private clockOffsetMs = 0;
  private bestRoundTripMs = Infinity;
  private clockSamplesLeft = 0;
  private readonly readyIds = new Set<string>();
  private readonly cutIds = new Set<string>();

  constructor(
    private readonly session: SessionResponse,
    private readonly listener: Listener,
    private readonly appVersion: string,
  ) {
    this.snapshot = { status: 'connecting', code: session.code, memberId: session.memberId, members: [], queue: [], history: [], poll: null, game: null };
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

  toLocalTime(serviceTime: number): number {
    return Math.round(serviceTime - this.clockOffsetMs);
  }

  reportReady(mediaId: string): void {
    this.readyIds.add(mediaId);
    this.send({ t: 'ready', mediaId });
  }

  reportCut(mediaId: string): void {
    if (this.cutIds.has(mediaId)) return;
    this.cutIds.add(mediaId);
    this.send({ t: 'cut', mediaId });
  }

  skip(mediaId: string): void {
    this.send({ t: 'skip', mediaId });
  }

  private status: { activity: Activity; note: string; game: string | null } | null = null;

  // Said again on each connection, as the service may have forgotten it.
  setStatus(activity: Activity, note: string, game: string | null): void {
    if (this.status?.activity === activity && this.status.note === note && this.status.game === game) return;
    this.status = { activity, note, game };
    this.send({ t: 'status', activity, note, game });
  }

  startPoll(question: string, options: string[]): void {
    this.send({ t: 'poll', question, options });
  }

  vote(pollId: string, choice: number): void {
    this.send({ t: 'vote', pollId, choice });
  }

  startGame(kind: GameKind): void {
    this.send({ t: 'game-start', kind });
  }

  gameSay(gameId: string, text: string): void {
    this.send({ t: 'game-say', gameId, text });
  }

  gameVote(gameId: string, choice: string): void {
    this.send({ t: 'game-vote', gameId, choice });
  }

  stopGame(gameId: string): void {
    this.send({ t: 'game-stop', gameId });
  }

  gameAction(gameId: string, action: 'join' | 'ready' | 'unready' | 'launch' | 'leave' | 'rematch'): void {
    if (action === 'ready' || action === 'unready') this.send({ t: 'game-ready', gameId, ready: action === 'ready' });
    else this.send({ t: `game-${action}`, gameId });
  }

  gameReact(gameId: string, emoji: GameReaction): void {
    this.send({ t: 'game-react', gameId, emoji });
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private open(): void {
    const url = `${SERVER_URL.replace(/^http/, 'ws')}/v1/parties/${this.session.partyId}/ws`;
    const socket = new WebSocket(url, [WS_SUBPROTOCOL, `${WS_APP_PREFIX}${this.appVersion}`, WS_LOBBY, `${WS_TOKEN_PREFIX}${this.session.token}`]);
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
    } catch (error) {
      // What gets lost here never shows up on screen, and a newer version on the other side is the likely reason.
      console.error('Unreadable message:', (error as Error).message);
      this.listener.onUnreadable();
      return;
    }

    switch (message.t) {
      case 'welcome':
        this.attempts = 0;
        this.publish({
          status: 'online',
          code: message.code,
          memberId: message.memberId,
          members: message.members,
          queue: message.queue,
          history: message.history,
          poll: message.poll,
          game: message.game,
        });
        if (this.status) this.send({ t: 'status', ...this.status });
        // The service forgets nothing, but anything reported while disconnected never reached it.
        for (const mediaId of this.readyIds) this.send({ t: 'ready', mediaId });
        for (const mediaId of this.cutIds) this.send({ t: 'cut', mediaId });
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
      case 'history':
        this.publish({ history: message.history });
        break;
      case 'poll':
        this.publish({ poll: message.poll });
        break;
      case 'game':
        this.publish({ game: message.game });
        break;
      case 'time':
        this.onClockSample(message.c, message.s);
        break;
      case 'closing':
        this.onClosed(message.code);
        break;
      case 'skipped':
        this.listener.onSkipped(message.memberId, message.name);
        break;
      case 'game-react':
        this.listener.onReaction(message.memberId, message.emoji);
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
        this.scheduleRetry();
        return;
      default:
        this.publish({ status: 'reconnecting' });
        this.scheduleRetry();
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

    const limit = socket.readyState === WebSocket.CONNECTING ? CONNECT_LIMIT_MS : SILENCE_LIMIT_MS;
    if (Date.now() - this.lastHeardAt > limit) {
      this.dropSocket();
      this.publish({ status: 'reconnecting' });
      this.scheduleRetry();
    }
  }

  private dropSocket(): void {
    const socket = this.socket;
    this.socket = null;
    this.clockSamplesLeft = 0;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }

  private publish(change: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.listener.onChange(this.snapshot);
  }
}
