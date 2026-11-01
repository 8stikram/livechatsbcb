import {
  CloseCode,
  LobbyMessageSchema,
  WS_SUBPROTOCOL,
  WS_TOKEN_PREFIX,
  type LobbyCategory,
  type LobbyMember,
  type LobbyMessage,
} from '@livechatsbcb/protocol';
import type { LobbyStatus } from '../shared/ipc';
import { KeepAliveSocket } from './keep-alive-socket';
import { SERVER_URL } from './party-api';

export type LobbySnapshot = {
  status: LobbyStatus;
  categories: LobbyCategory[];
  online: LobbyMember[];
};

type Listener = {
  onChange(snapshot: LobbySnapshot): void;
  onAccessLost(): void;
  onSignedOut(): void;
};

// What a Discord server looks like right now: its channels and who is around. Nothing here is urgent, unlike a party,
// so it checks on the connection far less often.
export class LobbyConnection {
  private readonly socket: KeepAliveSocket;
  private snapshot: LobbySnapshot = { status: 'connecting', categories: [], online: [] };

  constructor(
    readonly guildId: string,
    accountToken: string,
    private readonly listener: Listener,
  ) {
    this.socket = new KeepAliveSocket(
      `${SERVER_URL.replace(/^http/, 'ws')}/v1/guilds/${guildId}/ws`,
      [WS_SUBPROTOCOL, `${WS_TOKEN_PREFIX}${accountToken}`],
      { pingEveryMs: 20_000, silenceLimitMs: 45_000, retryDelaysMs: [1_000, 2_000, 5_000, 15_000, 30_000] },
      {
        onMessage: (raw) => this.onMessage(raw),
        onClosed: (code) => this.onClosed(code),
        onSilence: () => {
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
    this.publish({ status: 'connecting' });
    this.socket.reconnectNow();
  }

  current(): LobbySnapshot {
    return this.snapshot;
  }

  private onMessage(raw: string): void {
    let message: LobbyMessage;
    try {
      message = LobbyMessageSchema.parse(JSON.parse(raw));
    } catch {
      return;
    }

    if (message.t === 'lobby') {
      this.socket.markWelcomed();
      this.publish({ status: 'online', categories: message.categories, online: message.online });
    } else if (message.t === 'closing') {
      this.onClosed(message.code);
    }
  }

  private onClosed(code: number): void {
    this.socket.drop();

    switch (code) {
      case CloseCode.SignedOut:
        this.listener.onSignedOut();
        return;
      case CloseCode.Removed:
        this.listener.onAccessLost();
        return;
      case CloseCode.Replaced:
        this.publish({ status: 'replaced', online: [] });
        return;
      case CloseCode.UpdateRequired:
        this.publish({ status: 'update_required' });
        return;
      default:
        this.publish({ status: 'reconnecting' });
        this.socket.scheduleRetry();
    }
  }

  private publish(change: Partial<LobbySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    this.listener.onChange(this.snapshot);
  }
}
