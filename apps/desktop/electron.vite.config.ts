import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const ONLINE_SERVER_URL = 'https://livechatsbcb-party.livechatsbcb-party.workers.dev';
const LOCAL_SERVER_URL = 'http://127.0.0.1:8787';

// The address of the party service is baked into the build: released builds use the online service.
export default defineConfig(({ mode }) => {
  const serverUrl = process.env.LIVECHATSBCB_SERVER_URL ?? (mode === 'production' ? ONLINE_SERVER_URL : LOCAL_SERVER_URL);

  return {
    main: {
      define: { __SERVER_URL__: JSON.stringify(serverUrl) },
    },
    preload: {},
    renderer: {
      plugins: [react()],
      build: {
        rollupOptions: {
          input: {
            control: resolve(__dirname, 'src/renderer/control.html'),
            stage: resolve(__dirname, 'src/renderer/stage.html'),
          },
        },
      },
    },
  };
});
