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
import { LobbyConnection } from './lobby-connection';
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

// Going back to the list on the window is what someone does after getting a role or adding the bot.
const REFRESH_ON_FOCUS_AFTER_MS = 60_000;
const RETRY_GUILDS_AFTER_MS = 30_000;
// A connection refused for its token gets one quiet attempt at a new one: the account behind it may still have access.
const REJOIN_AT_MOST_EVERY_MS = 30_000;
// Refused by a server the list still shows as open: opening it again straight away would just go round in circles.
const RETRY_REFUSED_GUILD_AFTER_MS = 60_000;

function start(): void {
  denyAllPermissions();
  serveMediaFiles();
  if (!process.env['ELECTRON_RENDERER_URL']) serveRenderer();

  const store = new SessionStore();
  const settings = new SettingsStore();
  let connection: PartyConnection | null = null;
  let lobby: LobbyConnection | null = null;
  let guilds: GuildSummary[] | null = null;
  let guildsPartial = false;
  let guildsRefreshedAt = 0;
  let guildsRetryTimer: NodeJS.Timeout | undefined;
  let lastRejoinAt = 0;
  let refusedGuild: { id: string; at: number } | null = null;
  let login: AbortController | null = null;
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
      selectedGuildId: store.guildId,
      lobby: lobby && { guildId: lobby.guildId, ...lobby.current() },
      notice,
      party:
        snapshot && session
          ? {
              partyId: session.partyId,
              code: snapshot.code,
              channel: session.channel,
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

  const closeLobby = (): void => {
    lobby?.stop();
    lobby = null;
  };

  const signOut = (reason: AppState['notice']): void => {
    login?.abort();
    leaveConnection();
    closeLobby();
    clearTimeout(guildsRetryTimer);
    guilds = null;
    guildsPartial = false;
    notice = reason;
    store.update({ login: null, session: null, guildId: null });
    publishState();
  };

  const openLobby = (guildId: string): void => {
    const auth = store.login;
    if (!auth) return;

    closeLobby();
    lobby = new LobbyConnection(guildId, auth.token, {
      onChange: (snapshot) => {
        if (snapshot.status === 'update_required') updater.check();
        publishState();
      },
      onAccessLost: () => {
        refusedGuild = { id: guildId, at: Date.now() };
        closeLobby();
        publishState();
        void refreshGuilds();
      },
      onSignedOut: () => signOut('account_expired'),
    });
    lobby.start();
  };

  // A server with no access is still shown, for the app to say what's missing, but there is nothing to connect to.
  const followSelectedGuild = (): void => {
    const known = guilds ?? [];
    const saved = known.find(({ id }) => id === store.guildId);
    // A short list may only mean that Discord didn't answer for the rest, which is no reason to forget the choice.
    if (!saved && store.guildId && guildsPartial) return;

    const chosen = saved ?? known.find(({ locked }) => !locked) ?? known[0];
    if (chosen?.id !== store.guildId) store.update({ guildId: chosen?.id ?? null });

    const justRefused =
      refusedGuild?.id === chosen?.id && Date.now() - (refusedGuild?.at ?? 0) < RETRY_REFUSED_GUILD_AFTER_MS;
    if (!chosen || chosen.locked || justRefused) closeLobby();
    else if (lobby?.guildId !== chosen.id) openLobby(chosen.id);
  };

  const refreshGuilds = async (): Promise<void> => {
    const auth = store.login;
    if (!auth) return;

    clearTimeout(guildsRetryTimer);
    guildsRefreshedAt = Date.now();
    const result = await partyApi.fetchMe(auth.token);
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
      store.update({ login: { ...auth, account: result.value.account } });
      guilds = result.value.guilds;
      guildsPartial = result.value.partial;
      followSelectedGuild();
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
          store.update({ session: { ...saved, code: snapshot.code } });
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
    notice = session.channel ? 'channel_lost' : 'session_expired';
    store.update({ session: null });
    publishState();
  };

  const enterParty = (session: SessionResponse): void => {
    notice = null;
    store.update({ session });
    connectTo(session);
  };

  // A new token for the same place: on another PC, this account took over and the old token is gone.
  const askForPlace = (token: string, session: SessionResponse) =>
    session.channel
      ? partyApi.joinChannel(token, session.channel.guildId, session.channel.channelId)
      : partyApi.joinParty(token, session.code ?? '');

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

  // Moving somewhere else. A Discord channel is simply left, but a private party keeps its member, who can come back.
  const moveTo = (session: SessionResponse): void => {
    const previous = store.session;
    leaveConnection();
    if (previous?.channel && previous.partyId !== session.partyId) void partyApi.leaveParty(previous);
    enterParty(session);
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

  // Joining anything goes through the account: this runs the request and deals with what every kind has in common.
  const enterWith = async (
    ask: (token: string) => Promise<partyApi.ApiResult<SessionResponse>>,
  ): Promise<ActionResult> => {
    const auth = store.login;
    if (!auth) return { ok: false, error: 'signed_out' };

    const result = await ask(auth.token);
    if (!result.ok) {
      if (result.error === 'signed_out') signOut('account_expired');
      return result;
    }
    moveTo(result.value);
    return { ok: true };
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
    if (session?.channel) void partyApi.leaveParty(session);
    void partyApi.logout(auth.token);
  });

  handle(IpcChannel.RefreshGuilds, () => refreshGuilds());

  handle(IpcChannel.SelectGuild, (rawGuildId: unknown) => {
    const guildId = DISCORD_ID.safeParse(rawGuildId);
    if (!guildId.success || !guilds?.some(({ id }) => id === guildId.data)) return;

    // Asking for it again is the way out of a refusal that has since been sorted out.
    refusedGuild = null;
    store.update({ guildId: guildId.data });
    followSelectedGuild();
    // The same server, after this account opened it on another PC.
    if (lobby?.guildId === guildId.data && lobby.current().status === 'replaced') lobby.reconnectNow();
    publishState();
  });

  handle(IpcChannel.JoinChannel, (rawGuildId: unknown, rawChannelId: unknown): Promise<ActionResult> | ActionResult => {
    const guildId = DISCORD_ID.safeParse(rawGuildId);
    const channelId = DISCORD_ID.safeParse(rawChannelId);
    if (!guildId.success || !channelId.success) return { ok: false, error: 'invalid_request' };
    if (store.session?.channel?.channelId === channelId.data) return { ok: true };

    return enterWith((token) => partyApi.joinChannel(token, guildId.data, channelId.data));
  });

  handle(IpcChannel.CreateParty, () => enterWith((token) => partyApi.createParty(token)));

  handle(IpcChannel.JoinParty, (rawCode: unknown): Promise<ActionResult> | ActionResult => {
    const code = CodeSchema.safeParse(rawCode);
    if (!code.success) return { ok: false, error: 'invalid_request' };
    return enterWith((token) => partyApi.joinParty(token, code.data));
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
    lobby?.stop();
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
