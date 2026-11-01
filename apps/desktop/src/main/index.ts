import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  CodeSchema,
  DEFAULT_DISPLAY_MS,
  MAX_MEDIA_BYTES,
  NameSchema,
  fileKindOf,
  type MediaContentType,
  type QueueItem,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { IpcChannel, type ActionResult, type AppState, type PickResult, type PlaybackView } from '../shared/ipc';
import { registerAppScheme, serveRenderer } from './app-protocol';
import { MediaCache } from './media-cache';
import { CONTENT_TYPE_BY_EXTENSION, contentTypeOf, forgetMediaFile, registerMediaFile, serveMediaFiles } from './media-files';
import { uploadFile } from './media-upload';
import * as partyApi from './party-api';
import { PartyConnection } from './party-connection';
import { SessionStore } from './session-store';
import { SettingsSchema, SettingsStore } from './settings-store';
import { Updater } from './updater';
import { createControlWindow, createStageWindow, denyAllPermissions, isOwnPage, placeOverlay } from './windows';

// Lets one PC run several members for testing; each profile has its own folder and its own single-instance lock.
const profile = process.env['LIVECHATSBCB_PROFILE'];
if (profile) app.setPath('userData', profile);

registerAppScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(start);
}

const SendMediaInputSchema = z.object({
  caption: z.string(),
  clipStartMs: z.number(),
  durationMs: z.number(),
  withFile: z.boolean(),
});

function start(): void {
  denyAllPermissions();
  serveMediaFiles();
  if (!process.env['ELECTRON_RENDERER_URL']) serveRenderer();

  const store = new SessionStore();
  const settings = new SettingsStore();
  let connection: PartyConnection | null = null;
  let notice: AppState['notice'] = null;
  let overlayTest = false;
  let overlayTestTimer: NodeJS.Timeout | undefined;
  let draft: { path: string; name: string; size: number; contentType: MediaContentType; fileId: string } | null = null;
  let upload: { name: string; percent: number; controller: AbortController } | null = null;
  let quitting = false;

  const stageWindow = createStageWindow(settings.current.displayId);
  const controlWindow = createControlWindow();

  const cache = new MediaCache(join(app.getPath('userData'), 'media-cache'), (mediaId) => {
    connection?.reportReady(mediaId);
    publishState();
  });

  const toPlayback = (item: QueueItem): PlaybackView => ({
    id: item.id,
    senderName: item.senderName,
    kind: item.kind,
    caption: item.caption,
    clipStartMs: item.clipStartMs,
    durationMs: item.durationMs,
    startAt: item.startAt === null || !connection ? null : connection.toLocalTime(item.startAt),
    mediaUrl: cache.urlOf(item.id),
  });

  const getState = (): AppState => {
    const snapshot = connection?.current();
    const [head, ...rest] = snapshot?.queue ?? [];
    const primaryId = screen.getPrimaryDisplay().id;
    return {
      version: app.getVersion(),
      update: updater.current(),
      lastName: store.lastName,
      notice,
      party: snapshot
        ? {
            code: snapshot.code,
            memberId: snapshot.memberId,
            members: snapshot.members,
            connection: snapshot.status,
          }
        : null,
      settings: settings.current,
      displays: screen.getAllDisplays().map((display, index) => ({
        id: display.id,
        label: `Écran ${index + 1} (${display.size.width} × ${display.size.height})${
          display.id === primaryId ? ' principal' : ''
        }`,
      })),
      overlayTest,
      queue: { current: head ? toPlayback(head) : null, waiting: rest.length },
      upload: upload && { name: upload.name, percent: upload.percent },
    };
  };

  // The overlay is only on screen while it has something to show: over a borderless game, a window that is always
  // there would cost the game its direct path to the display, and with it some speed.
  const syncOverlay = (): void => {
    if (stageWindow.isDestroyed()) return;

    const playing = connection?.current().queue[0]?.startAt != null;
    const wanted = overlayTest || (playing && settings.current.overlayEnabled);

    if (wanted && !stageWindow.isVisible()) {
      placeOverlay(stageWindow, settings.current.displayId);
      // A game may have put itself above the overlay since last time.
      stageWindow.setAlwaysOnTop(true, 'screen-saver');
      stageWindow.showInactive();
      stageWindow.moveTop();
    } else if (!wanted && stageWindow.isVisible()) {
      stageWindow.hide();
    }
  };

  const publishState = (): void => {
    const state = getState();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IpcChannel.StateChanged, state);
    }
    syncOverlay();
  };

  const updater = new Updater(publishState);

  const leaveConnection = (): void => {
    upload?.controller.abort();
    connection?.stop();
    connection = null;
    cache.clear();
  };

  const connectTo = (session: SessionResponse): void => {
    connection?.stop();
    connection = new PartyConnection(session, {
      onChange: (snapshot) => {
        if (snapshot.status === 'update_required') updater.check();
        cache.sync(session, snapshot.queue);
        publishState();
      },
      onSessionRevoked: () => {
        leaveConnection();
        notice = 'session_expired';
        store.update({ session: null });
        publishState();
      },
    });
    connection.start();
    publishState();
  };

  const enterParty = (session: SessionResponse, name: string): void => {
    notice = null;
    store.update({ session, lastName: name });
    connectTo(session);
  };

  const clearDraft = (): void => {
    if (draft) forgetMediaFile(draft.fileId);
    draft = null;
  };

  const showOverlayTest = (): void => {
    clearTimeout(overlayTestTimer);
    overlayTest = true;
    publishState();
    overlayTestTimer = setTimeout(() => {
      overlayTest = false;
      publishState();
    }, DEFAULT_DISPLAY_MS);
  };

  // Windows only ever show our own pages, but a handler should still refuse anything else that reaches it.
  const handle = <Args extends unknown[], Result>(
    channel: string,
    handler: (...args: Args) => Result | Promise<Result>,
  ): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!event.senderFrame || !isOwnPage(event.senderFrame.url)) throw new Error('Refused');
      return handler(...(args as Args));
    });
  };

  handle(IpcChannel.GetState, getState);

  handle(IpcChannel.CreateParty, async (rawName: unknown): Promise<ActionResult> => {
    const name = NameSchema.safeParse(rawName);
    if (!name.success) return { ok: false, error: 'invalid_request' };

    const result = await partyApi.createParty(name.data);
    if (!result.ok) return result;
    enterParty(result.value, name.data);
    return { ok: true };
  });

  handle(IpcChannel.JoinParty, async (rawCode: unknown, rawName: unknown): Promise<ActionResult> => {
    const input = z.object({ code: CodeSchema, name: NameSchema }).safeParse({ code: rawCode, name: rawName });
    if (!input.success) return { ok: false, error: 'invalid_request' };

    const result = await partyApi.joinParty(input.data.code, input.data.name);
    if (!result.ok) return result;
    enterParty(result.value, input.data.name);
    return { ok: true };
  });

  handle(IpcChannel.RotateCode, async (): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };

    const result = await partyApi.rotateCode(session);
    if (!result.ok) return result;
    store.update({ session: { ...session, code: result.value } });
    connection?.setCode(result.value);
    return { ok: true };
  });

  handle(IpcChannel.LeaveParty, async (): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: true };

    const result = await partyApi.leaveParty(session);
    if (!result.ok && result.error !== 'unauthorized') return result;

    leaveConnection();
    store.update({ session: null });
    publishState();
    return { ok: true };
  });

  handle(IpcChannel.Reconnect, () => connection?.reconnectNow());

  handle(IpcChannel.CopyCode, () => {
    const code = connection?.current().code;
    if (code) clipboard.writeText(code);
  });

  handle(IpcChannel.PickMedia, async (): Promise<PickResult> => {
    const picked = await dialog.showOpenDialog(controlWindow, {
      title: 'Choisir un média',
      properties: ['openFile'],
      filters: [{ name: 'Images, vidéos et sons', extensions: Object.keys(CONTENT_TYPE_BY_EXTENSION) }],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return { ok: false, error: 'cancelled' };

    const contentType = contentTypeOf(path);
    if (!contentType) return { ok: false, error: 'unsupported' };

    const { size } = await stat(path);
    if (size === 0) return { ok: false, error: 'empty' };
    if (size > MAX_MEDIA_BYTES) return { ok: false, error: 'too_large' };

    clearDraft();
    const preview = registerMediaFile(path, contentType);
    draft = { path, name: basename(path), size, contentType, fileId: preview.id };
    return { ok: true, draft: { name: draft.name, size, kind: fileKindOf(contentType), previewUrl: preview.url } };
  });

  handle(IpcChannel.ClearDraft, clearDraft);

  handle(IpcChannel.SendMedia, async (raw: unknown): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };

    const input = SendMediaInputSchema.safeParse(raw);
    if (!input.success || upload) return { ok: false, error: 'invalid_request' };

    const file = input.data.withFile ? draft : null;
    if (input.data.withFile && !file) return { ok: false, error: 'invalid_request' };

    const created = await partyApi.createMedia(session, {
      caption: input.data.caption,
      clipStartMs: input.data.clipStartMs,
      durationMs: input.data.durationMs,
      file: file && { contentType: file.contentType, size: file.size },
    });
    if (!created.ok) return created;
    if (!file) return { ok: true };

    const mediaId = created.value;
    const controller = new AbortController();
    const current = { name: file.name, percent: 0, controller };
    upload = current;
    publishState();

    // Before the last step: the service can announce the media before it answers that step.
    cache.adopt(mediaId, file.path, file.contentType);

    const result = await uploadFile(session, mediaId, file.path, file.size, controller.signal, (percent) => {
      current.percent = percent;
      publishState();
    });
    upload = null;

    if (!result.ok) {
      cache.forget(mediaId);
      void partyApi.cancelMedia(session, mediaId);
      publishState();
      return result;
    }

    clearDraft();
    publishState();
    return { ok: true };
  });

  handle(IpcChannel.CancelUpload, () => upload?.controller.abort());

  handle(IpcChannel.SkipMedia, (mediaId: unknown) => {
    if (typeof mediaId === 'string') connection?.skip(mediaId);
  });

  handle(IpcChannel.SetSettings, (raw: unknown) => {
    const change = SettingsSchema.partial().safeParse(raw);
    if (!change.success) return;

    settings.update(change.data);
    if (change.data.displayId !== undefined) placeOverlay(stageWindow, settings.current.displayId);

    // Moving something is only useful if you can see where it lands on the real screen.
    if (change.data.layout || change.data.displayId !== undefined) showOverlayTest();
    else publishState();
  });

  handle(IpcChannel.TestOverlay, showOverlayTest);

  handle(IpcChannel.InstallUpdate, () => {
    // The updater closes every window before it emits before-quit, so the stage must already allow closing.
    quitting = true;
    updater.installNow();
  });

  // Nothing should close the overlay but quitting: the control window remains the way to do that.
  stageWindow.on('close', (event) => {
    if (!quitting) event.preventDefault();
  });

  const onDisplaysChanged = (): void => {
    placeOverlay(stageWindow, settings.current.displayId);
    publishState();
  };
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);

  controlWindow.on('closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    connection?.stop();
    settings.flush();
  });
  app.on('second-instance', () => {
    if (controlWindow.isMinimized()) controlWindow.restore();
    controlWindow.focus();
  });

  const saved = store.session;
  if (saved) connectTo(saved);

  updater.start();
}
