import type { LiveChatApi } from '../../shared/ipc';

declare global {
  interface Window {
    liveChat: LiveChatApi;
  }
}
