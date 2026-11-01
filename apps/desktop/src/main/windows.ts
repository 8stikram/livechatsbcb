import { join } from 'node:path';
import { BrowserWindow, nativeImage, screen, session, shell } from 'electron';
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

export const openInBrowser = (url: string): void => {
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

export const createControlWindow = (startHidden: boolean): BrowserWindow => {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const window = new BrowserWindow({
    width: Math.min(1120, workAreaSize.width),
    height: Math.min(720, workAreaSize.height),
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: 'LiveChatSBCB',
    icon: nativeImage.createFromPath(iconPath),
    backgroundColor: '#0a0a0d',
    // The page goes all the way up, and Windows keeps drawing its own buttons on top of it.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#f4f4f5', height: 40 },
    webPreferences: secureWebPreferences,
  });
  lockDown(window);
  window.once('ready-to-show', () => {
    if (!startHidden) window.show();
  });
  void window.loadURL(pageUrl('control'));
  return window;
};

export const placeOverlay = (window: BrowserWindow, displayId: number | null): void => {
  const display = screen.getAllDisplays().find(({ id }) => id === displayId) ?? screen.getPrimaryDisplay();
  // One pixel short of the full screen: Windows takes a topmost window covering a whole monitor for a fullscreen app,
  // and would hide the taskbar and silence notifications because of it.
  window.setBounds({ ...display.bounds, height: display.bounds.height - 1 });
};

export const createStageWindow = (displayId: number | null): BrowserWindow => {
  const window = new BrowserWindow({
    show: false,
    title: 'LiveChatSBCB — Scène',
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Never takes the keyboard from the game, and has no place in the taskbar or in Alt+Tab.
    focusable: false,
    skipTaskbar: true,
    webPreferences: {
      ...secureWebPreferences,
      // Medias must start on the shared timeline, with no click in this window.
      autoplayPolicy: 'no-user-gesture-required',
      // The page gets ready while the window is hidden, and its timers must stay on time.
      backgroundThrottling: false,
    },
  });
  // Clicks go through to whatever is underneath.
  window.setIgnoreMouseEvents(true);
  window.setAlwaysOnTop(true, 'screen-saver');
  placeOverlay(window, displayId);
  lockDown(window);
  void window.loadURL(pageUrl('stage'));
  return window;
};
