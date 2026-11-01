import { WS_PING } from '@livechatsbcb/protocol';

export type KeepAliveTiming = { pingEveryMs: number; silenceLimitMs: number; retryDelaysMs: number[] };

type Events = {
  onMessage(raw: string): void;
  onClosed(code: number): void;
  // A socket whose peer vanished can stay "open" for minutes, so silence is what counts as a lost connection.
  onSilence(): void;
};

// A WebSocket to the service that notices when it dies. What to do about it is up to whoever owns it.
export class KeepAliveSocket {
  private socket: WebSocket | null = null;
  private attempts = 0;
  private lastHeardAt = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly url: string,
    private readonly protocols: string[],
    private readonly timing: KeepAliveTiming,
    private readonly events: Events,
  ) {}

  start(): void {
    this.open();
    this.pingTimer = setInterval(() => this.keepAlive(), this.timing.pingEveryMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.drop();
  }

  reconnectNow(): void {
    if (this.stopped) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.attempts = 0;
    this.drop();
    this.open();
  }

  // The service answered properly, so the next problem starts again from the shortest delay.
  markWelcomed(): void {
    this.attempts = 0;
  }

  send(text: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
  }

  drop(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
  }

  scheduleRetry(): void {
    if (this.stopped || this.retryTimer) return;
    const { retryDelaysMs } = this.timing;
    const delay = retryDelaysMs[Math.min(this.attempts, retryDelaysMs.length - 1)]!;
    this.attempts += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private open(): void {
    const socket = new WebSocket(this.url, this.protocols);
    this.socket = socket;
    this.lastHeardAt = Date.now();

    socket.addEventListener('message', (event) => {
      if (socket !== this.socket) return;
      this.lastHeardAt = Date.now();
      this.events.onMessage(String(event.data));
    });
    socket.addEventListener('close', (event) => {
      if (socket === this.socket) this.events.onClosed(event.code);
    });
    // Every failed attempt is followed by a close event, which is where the retry is decided.
    socket.addEventListener('error', () => {});
  }

  private keepAlive(): void {
    const socket = this.socket;
    if (!socket) return;
    if (socket.readyState === WebSocket.OPEN) socket.send(WS_PING);

    if (Date.now() - this.lastHeardAt > this.timing.silenceLimitMs) {
      this.drop();
      this.events.onSilence();
    }
  }
}
