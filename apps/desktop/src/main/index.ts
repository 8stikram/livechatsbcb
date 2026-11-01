import { stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, screen, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  CloseCode,
  CodeSchema,
  DEFAULT_DISPLAY_MS,
  MAX_MEDIA_BYTES,
  fileKindOf,
  type GuildSummary,
  type MediaContentType,
  type QueueItem,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { IpcChannel, type ActionResult, type AppState, type PickResult, type PlaybackView } from '../shared/ipc';
import { registerAppScheme, serveRenderer } from './app-protocol';
import { loginWithDiscord } from './discord-login';
import { MediaCache } from './media-cache';
import { CONTENT_TYPE_BY_EXTENSION, contentTypeOf, forgetMediaFile, registerMediaFile, serveMediaFiles } from './media-files';
import { uploadFile } from './media-upload';
import * as partyApi from './party-api';
import { PartyConnection } from './party-connection';
import { SessionStore } from './session-store';
import { SettingsSchema, SettingsStore } from './settings-store';
import { Updater } from './updater';
import { createControlWindow, createStageWindow, denyAllPermissions, isOwnPage, openInBrowser, placeOverlay } from './windows';

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

const DISCORD_ID = z.string().regex(/^\d{17,20}$/);

// Coming back to the window is what someone does after joining a server on Discord.
const REFRESH_ON_FOCUS_AFTER_MS = 60_000;
const RETRY_GUILDS_AFTER_MS = 30_000;
// A connection refused for its token gets one quiet attempt at a new one: the account behind it may still have access.
const REJOIN_AT_MOST_EVERY_MS = 30_000;
// Put out of a server's party: trying it again straight away by itself would just go round in circles.
const RETRY_REFUSED_GUILD_AFTER_MS = 60_000;

function start(): void {
  denyAllPermissions();
  serveMediaFiles();
  if (!process.env['ELECTRON_RENDERER_URL']) serveRenderer();

  const store = new SessionStore();
  const settings = new SettingsStore();
  let connection: PartyConnection | null = null;
  let guilds: GuildSummary[] | null = null;
  let guildsPartial = false;
  let guildsRefreshedAt = 0;
  let guildsRetryTimer: NodeJS.Timeout | undefined;
  let lastRejoinAt = 0;
  let refusedGuild: { id: string; at: number } | null = null;
  let login: AbortController | null = null;
  let entering = false;
  let joinError: AppState['joinError'] = null;
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
    senderAvatarUrl: item.senderAvatarUrl,
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
    const session = store.session;
    return {
      version: app.getVersion(),
      update: updater.current(),
      account: store.login?.account ?? null,
      loggingIn: login !== null,
      guilds,
      guildsPartial,
      addedGuilds: store.addedGuilds,
      hasPrivateParty: store.privateSession !== null,
      joinError,
      notice,
      party:
        snapshot && session
          ? {
              partyId: session.partyId,
              code: snapshot.code,
              guild: session.guild,
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

  const signOut = (reason: AppState['notice']): void => {
    login?.abort();
    leaveConnection();
    clearTimeout(guildsRetryTimer);
    guilds = null;
    guildsPartial = false;
    joinError = null;
    notice = reason;
    store.update({ login: null, addedGuilds: [], lastGuildId: null, session: null, privateSession: null });
    publishState();
  };

  const refreshGuilds = async (fresh = false): Promise<void> => {
    const auth = store.login;
    if (!auth) return;

    clearTimeout(guildsRetryTimer);
    guildsRefreshedAt = Date.now();
    const result = await partyApi.fetchMe(auth.token, fresh);
    // Logged out while waiting for the answer.
    if (store.login?.token !== auth.token) return;

    if (!result.ok) {
      if (result.error === 'signed_out') {
        signOut('account_expired');
        return;
      }
      guilds ??= [];
      guildsPartial = true;
    } else {
      const latest = result.value.guilds;
      guilds = latest;
      guildsPartial = result.value.partial;
      // Names and pictures change, and a server the person left goes, unless the list is only short for now.
      const addedGuilds = store.addedGuilds.flatMap((guild) => {
        const found = latest.find(({ id }) => id === guild.id);
        return found ? [found] : guildsPartial ? [guild] : [];
      });
      store.update({ login: { ...auth, account: result.value.account }, addedGuilds });
      void enterLastGuild();
    }

    if (guildsPartial) guildsRetryTimer = setTimeout(() => void refreshGuilds(), RETRY_GUILDS_AFTER_MS);
    publishState();
  };

  const connectTo = (session: SessionResponse): void => {
    connection?.stop();
    connection = new PartyConnection(session, {
      onChange: (snapshot) => {
        if (snapshot.status === 'update_required') updater.check();
        // Someone may have changed the code, and it is what gets this member back in later.
        const saved = store.session;
        if (saved?.partyId === session.partyId && saved.code !== snapshot.code) {
          const updated = { ...saved, code: snapshot.code };
          store.update({
            session: updated,
            privateSession: store.privateSession?.partyId === saved.partyId ? updated : store.privateSession,
          });
        }
        cache.sync(session, snapshot.queue);
        publishState();
      },
      onSessionRevoked: (closeCode) => {
        if (closeCode === CloseCode.Unauthorized && Date.now() - lastRejoinAt > REJOIN_AT_MOST_EVERY_MS) {
          void rejoin(session);
          return;
        }
        loseParty(session);
      },
    });
    connection.start();
    publishState();
  };

  const loseParty = (session: SessionResponse): void => {
    leaveConnection();
    notice = session.guild ? 'guild_lost' : 'session_expired';
    if (session.guild) refusedGuild = { id: session.guild.id, at: Date.now() };
    store.update(session.guild ? { session: null } : { session: null, privateSession: null });
    publishState();
    void refreshGuilds();
  };

  const enterParty = (session: SessionResponse): void => {
    store.update(session.guild ? { session } : { session, privateSession: session });
    connectTo(session);
  };

  // A new token for the same place: on another PC, this account took over and the old token is gone.
  const askForPlace = (token: string, session: SessionResponse) =>
    session.guild ? partyApi.joinGuild(token, session.guild.id) : partyApi.joinParty(token, session.code ?? '');

  const rejoin = async (session: SessionResponse): Promise<void> => {
    const auth = store.login;
    if (!auth) return;

    lastRejoinAt = Date.now();
    const result = await askForPlace(auth.token, session);
    if (store.session?.partyId !== session.partyId) return;

    if (result.ok) enterParty(result.value);
    else if (result.error === 'signed_out') signOut('account_expired');
    else loseParty(session);
  };

  // Moving somewhere else. A server's party is simply left, but a private party keeps its member, who can come back.
  const moveTo = (session: SessionResponse): void => {
    const previous = store.session;
    if (previous?.partyId !== session.partyId) {
      leaveConnection();
      if (previous?.guild) void partyApi.leaveParty(previous);
    }
    enterParty(session);
  };

  // Joining anything goes through the account: this runs the request and deals with what every kind has in common.
  const enterWith = async (
    ask: (token: string) => Promise<partyApi.ApiResult<SessionResponse>>,
  ): Promise<ActionResult> => {
    const auth = store.login;
    if (!auth) return { ok: false, error: 'signed_out' };
    // One move at a time: an answer arriving late would otherwise undo the click that came after it.
    if (entering) return { ok: true };

    entering = true;
    const result = await ask(auth.token);
    entering = false;
    if (store.login?.token !== auth.token) return { ok: true };

    if (!result.ok) {
      if (result.error === 'signed_out') signOut('account_expired');
      return result;
    }
    moveTo(result.value);
    return { ok: true };
  };

  const enterGuild = async (guildId: string): Promise<ActionResult> => {
    const result = await enterWith((token) => partyApi.joinGuild(token, guildId));
    joinError = result.ok || result.error === 'signed_out' ? null : result.error;
    if (result.ok && store.session?.guild?.id === guildId) store.update({ lastGuildId: guildId });
    if (!result.ok && result.error === 'forbidden') {
      store.update({ addedGuilds: store.addedGuilds.filter(({ id }) => id !== guildId) });
    }
    publishState();
    return result;
  };

  // Someone with servers chosen is always in one of them, starting with the one they were last on.
  const enterLastGuild = async (): Promise<void> => {
    if (store.session) return;
    const guild = store.addedGuilds.find(({ id }) => id === store.lastGuildId) ?? store.addedGuilds[0];
    if (!guild) return;
    if (refusedGuild?.id === guild.id && Date.now() - refusedGuild.at < RETRY_REFUSED_GUILD_AFTER_MS) return;
    await enterGuild(guild.id);
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

  handle(IpcChannel.Login, async (): Promise<ActionResult> => {
    if (login || store.login) return { ok: true };

    const controller = new AbortController();
    login = controller;
    publishState();

    const result = await loginWithDiscord(openInBrowser, controller.signal);
    login = null;
    if (!result.ok) {
      publishState();
      return result;
    }

    notice = null;
    store.update({ login: result.value });
    if (controlWindow.isMinimized()) controlWindow.restore();
    controlWindow.focus();
    publishState();
    void refreshGuilds();
    return { ok: true };
  });

  handle(IpcChannel.CancelLogin, () => login?.abort());

  handle(IpcChannel.Logout, async () => {
    const auth = store.login;
    const session = store.session;
    if (!auth) return;

    signOut(null);
    // Nothing left to do with the answers: this PC has already forgotten everything.
    if (session?.guild) void partyApi.leaveParty(session);
    void partyApi.logout(auth.token);
  });

  handle(IpcChannel.RefreshGuilds, () => refreshGuilds(true));

  handle(IpcChannel.SetGuilds, async (raw: unknown): Promise<ActionResult> => {
    const ids = z.array(DISCORD_ID).max(200).safeParse(raw);
    if (!ids.success) return { ok: false, error: 'invalid_request' };

    const kept = store.addedGuilds.filter(({ id }) => ids.data.includes(id));
    const added = ids.data.flatMap((id) =>
      kept.some((guild) => guild.id === id) ? [] : (guilds ?? []).filter((guild) => guild.id === id),
    );
    store.update({ addedGuilds: [...kept, ...added] });

    const session = store.session;
    if (session?.guild && !ids.data.includes(session.guild.id)) {
      leaveConnection();
      void partyApi.leaveParty(session);
      store.update({ session: null });
    }
    publishState();

    // Whoever just added a server wants to be there.
    const next = added[0] ?? (store.session ? null : kept[0]);
    if (!next) return { ok: true };
    notice = null;
    return enterGuild(next.id);
  });

  handle(IpcChannel.JoinGuild, (rawGuildId: unknown): Promise<ActionResult> | ActionResult => {
    const guildId = DISCORD_ID.safeParse(rawGuildId);
    if (!guildId.success) return { ok: false, error: 'invalid_request' };
    if (store.session?.guild?.id === guildId.data) return { ok: true };

    notice = null;
    return enterGuild(guildId.data);
  });

  handle(IpcChannel.CreateParty, () => {
    notice = null;
    return enterWith((token) => partyApi.createParty(token));
  });

  handle(IpcChannel.JoinParty, (rawCode: unknown): Promise<ActionResult> | ActionResult => {
    const code = CodeSchema.safeParse(rawCode);
    if (!code.success) return { ok: false, error: 'invalid_request' };
    notice = null;
    return enterWith((token) => partyApi.joinParty(token, code.data));
  });

  handle(IpcChannel.ReturnToPrivateParty, (): ActionResult => {
    const saved = store.privateSession;
    if (saved && store.session?.partyId !== saved.partyId) {
      notice = null;
      moveTo(saved);
    }
    return { ok: true };
  });

  handle(IpcChannel.RotateCode, async (): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };

    const result = await partyApi.rotateCode(session);
    if (!result.ok) return result;
    connection?.setCode(result.value);
    return { ok: true };
  });

  handle(IpcChannel.LeaveParty, async (): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: true };

    const result = await partyApi.leaveParty(session);
    if (!result.ok && result.error !== 'unauthorized') return result;

    leaveConnection();
    store.update(session.guild ? { session: null } : { session: null, privateSession: null });
    publishState();
    void enterLastGuild();
    return { ok: true };
  });

  handle(IpcChannel.Reconnect, async () => {
    const session = store.session;
    // On another PC, this account was given a new token and this one stopped working.
    if (session && connection?.current().status === 'replaced') await rejoin(session);
    else connection?.reconnectNow();
  });

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

  controlWindow.on('focus', () => {
    if (store.login && Date.now() - guildsRefreshedAt > REFRESH_ON_FOCUS_AFTER_MS) void refreshGuilds();
  });
  controlWindow.on('closed', () => app.quit());
  app.on('before-quit', () => {
    quitting = true;
    login?.abort();
    connection?.stop();
    settings.flush();
  });
  app.on('second-instance', () => {
    if (controlWindow.isMinimized()) controlWindow.restore();
    controlWindow.focus();
  });

  if (store.login) {
    void refreshGuilds();
    const saved = store.session;
    if (saved) connectTo(saved);
  }

  updater.start();
}
