import { join } from 'node:path';
import { BrowserWindow, nativeImage, session, shell } from 'electron';
import { APP_ORIGIN } from './app-protocol';
import iconPath from '../renderer/src/assets/logo.png?asset';

const devServerUrl = process.env['ELECTRON_RENDERER_URL'];

const pageUrl = (page: 'control' | 'stage'): string =>
  devServerUrl ? `${devServerUrl}/${page}.html` : `${APP_ORIGIN}/${page}.html`;

export const isOwnPage = (url: string): boolean => {
  try {
    const { origin, protocol, host } = new URL(url);
    if (devServerUrl) return origin === new URL(devServerUrl).origin;
    return `${protocol}//${host}` === APP_ORIGIN;
  } catch {
    return false;
  }
};

const openInBrowser = (url: string): void => {
  try {
    const { protocol } = new URL(url);
    if (protocol === 'https:' || protocol === 'http:') void shell.openExternal(url);
  } catch {
    // Not a URL: nothing to open.
  }
};

const lockDown = (window: BrowserWindow): void => {
  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isOwnPage(url)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
};

export const denyAllPermissions = (): void => {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
};

const secureWebPreferences = {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  webSecurity: true,
};

export const createControlWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 440,
    height: 680,
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'LiveChatSBCB',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: '#120a1f',
    webPreferences: secureWebPreferences,
  });
  lockDown(window);
  window.once('ready-to-show', () => window.show());
  void window.loadURL(pageUrl('control'));
  return window;
};

export const createStageWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 960,
    height: 540,
    minWidth: 320,
    minHeight: 180,
    show: false,
    title: 'LiveChatSBCB — Scène',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: '#000000',
    webPreferences: {
      ...secureWebPreferences,
      // Medias must start on the shared timeline, with no click in this window.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  lockDown(window);
  void window.loadURL(pageUrl('stage'));
  return window;
};
