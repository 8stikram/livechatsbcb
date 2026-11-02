import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, screen, shell, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import {
  CloseCode,
  CodeSchema,
  DEFAULT_DISPLAY_MS,
  MAX_FILE_NAME_LENGTH,
  MAX_MEDIA_BYTES,
  MediaDraftSchema,
  SceneLayerSchema,
  fileKindOf,
  mediaKindOf,
  fileNamesOf,
  pictureOf,
  soundOf,
  type GuildSummary,
  type HistoryItem,
  type MediaContentType,
  type QueueItem,
  type SceneLayer,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { IpcChannel, type ActionResult, type AppState, type DraftMedia, type DraftSlot, type FileMenuAction, type HistoryView, type PickResult, type PlaybackView, type SavedMenuAction, type SceneFile, type SceneResult } from '../shared/ipc';
import { registerAppScheme, serveRenderer } from './app-protocol';
import { loginWithDiscord } from './discord-login';
import { Library, type SavedFile } from './library';
import { MediaCache } from './media-cache';
import { CONTENT_TYPE_BY_EXTENSION, contentTypeOf, extensionOf, forgetMediaFile, registerMediaFile, serveMediaFiles } from './media-files';
import { uploadFile } from './media-upload';
import * as partyApi from './party-api';
import { PartyConnection } from './party-connection';
import { SessionStore } from './session-store';
import { SettingsSchema, SettingsStore } from './settings-store';
import { AppTray } from './tray';
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
  videoMuted: z.boolean(),
  soundMuted: z.boolean(),
  withPicture: z.boolean(),
  withSound: z.boolean(),
});

const SAVE_NAME = z.string().trim().min(1).max(80);
const SaveLiveChatInputSchema = SendMediaInputSchema.extend({ name: SAVE_NAME });

const SceneInputSchema = z.object({
  caption: z.string(),
  clipStartMs: z.number(),
  durationMs: z.number(),
  videoMuted: z.boolean(),
  soundMuted: z.boolean(),
  layers: z.array(SceneLayerSchema.omit({ file: true }).extend({ fileId: z.string() })),
  soundId: z.string().nullable(),
});
const SaveSceneInputSchema = SceneInputSchema.extend({ name: SAVE_NAME });

const DISCORD_ID = z.string().regex(/^\d{17,20}$/);

// Coming back to the window is what someone does after joining a server on Discord.
const REFRESH_ON_FOCUS_AFTER_MS = 60_000;
const RETRY_GUILDS_AFTER_MS = 30_000;
// A connection refused for its token gets one quiet attempt at a new one: the account behind it may still have access.
const REJOIN_AT_MOST_EVERY_MS = 30_000;
// Put out of a server's party: trying it again straight away by itself would just go round in circles.
const RETRY_REFUSED_GUILD_AFTER_MS = 60_000;
// Long enough for the overlay to load a file this PC already has.
const LOCAL_REPLAY_LEAD_MS = 400;

// How Windows starts the app at login: no window, only the icon near the clock.
const START_HIDDEN_ARG = '--hidden';

// An update installed unnoticed should come back the same way, and an installer can't pass an argument along.
const quietRestartFlag = () => join(app.getPath('userData'), 'restart-quietly');

const takeQuietRestart = (): boolean => {
  const flag = quietRestartFlag();
  if (!existsSync(flag)) return false;
  rmSync(flag, { force: true });
  return true;
};

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
  const library = new Library(app.getPath('userData'));
  type DraftFile = SavedFile & { fileId: string };
  const draft: Record<DraftSlot, DraftFile | null> = { picture: null, sound: null };
  let upload: { name: string; percent: number; controller: AbortController } | null = null;
  let quitting = false;
  let localReplay: { key: string; historyId: string; item: HistoryItem; startAt: number | null } | null = null;
  let localReplayTimer: NodeJS.Timeout | undefined;
  const keeping = new Set<string>();

  const stageWindow = createStageWindow(settings.current.displayId);
  const controlWindow = createControlWindow(process.argv.includes(START_HIDDEN_ARG) || takeQuietRestart());

  const cache = new MediaCache(join(app.getPath('userData'), 'media-cache'), (mediaId) => {
    connection?.reportReady(mediaId);
    publishState();
  });

  // Files stay under the media they came with, which is the replay's own key when played on this PC alone.
  const playbackFiles = (
    key: string,
    { files, scene }: Pick<QueueItem, 'files' | 'scene'>,
  ): Pick<PlaybackView, 'fileName' | 'mediaUrl' | 'hasSound' | 'soundUrl' | 'scene'> => {
    const picture = pictureOf(files);
    const sound = soundOf(files);
    const urlOf = (file: QueueItem['files'][number] | null) => (file ? cache.urlOf(key, file.id) : null);
    return {
      fileName: fileNamesOf(files),
      mediaUrl: urlOf(picture ?? sound),
      hasSound: picture !== null && sound !== null,
      soundUrl: picture ? urlOf(sound) : null,
      scene:
        scene?.map(({ file: index, ...layer }) => {
          const file = files[index]!;
          return { ...layer, kind: fileKindOf(file.contentType) === 'video' ? ('video' as const) : ('image' as const), url: urlOf(file) };
        }) ?? null,
    };
  };

  const toPlayback = (item: QueueItem): PlaybackView => ({
    id: item.id,
    senderName: item.senderName,
    senderAvatarUrl: item.senderAvatarUrl,
    kind: item.kind,
    caption: item.caption,
    clipStartMs: item.clipStartMs,
    durationMs: item.durationMs,
    videoMuted: item.videoMuted,
    soundMuted: item.soundMuted,
    startAt: item.startAt === null || !connection ? null : connection.toLocalTime(item.startAt),
    ...playbackFiles(item.id, item),
  });

  const toHistoryView = (item: HistoryItem, party: PartyConnection): HistoryView => ({
    id: item.id,
    senderName: item.senderName,
    senderAvatarUrl: item.senderAvatarUrl,
    kind: item.kind,
    caption: item.caption,
    fileName: fileNamesOf(item.files),
    playedAt: party.toLocalTime(item.playedAt),
    favoriteId: library.keptFrom(item.id)?.id ?? null,
    keeping: keeping.has(item.id),
  });

  const localReplayView = (): AppState['localReplay'] => {
    if (!localReplay) return null;
    const { key, historyId, item, startAt } = localReplay;
    if (startAt === null) return { historyId, playback: null };
    return {
      historyId,
      playback: {
        id: key,
        senderName: item.senderName,
        senderAvatarUrl: item.senderAvatarUrl,
        kind: item.kind,
        caption: item.caption,
        clipStartMs: item.clipStartMs,
        durationMs: item.durationMs,
        videoMuted: item.videoMuted,
        soundMuted: item.soundMuted,
        startAt,
        ...playbackFiles(key, item),
      },
    };
  };

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
      queue: {
        current: head ? toPlayback(head) : null,
        upcoming: rest.map(({ id, senderName, kind, caption, files, replay }) => ({
          id,
          senderName,
          kind,
          caption,
          fileName: fileNamesOf(files),
          replay,
        })),
      },
      history: connection
        ? snapshot!.history
            .filter((item) => connection!.toLocalTime(item.expiresAt) > Date.now())
            .map((item) => toHistoryView(item, connection!))
        : [],
      favorites: library.favorites(),
      localReplay: localReplayView(),
      upload: upload && { name: upload.name, percent: upload.percent },
    };
  };

  // The overlay is only on screen while it has something to show: over a borderless game, a window that is always
  // there would cost the game its direct path to the display, and with it some speed.
  const syncOverlay = (): void => {
    if (stageWindow.isDestroyed()) return;

    const playing = connection?.current().queue[0]?.startAt != null;
    // Asked for on this PC, like the test: it shows even for someone who keeps the overlay off.
    const wanted = overlayTest || localReplay?.startAt != null || (playing && settings.current.overlayEnabled);

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

  // Someone living near the clock never sees the button to restart, and an old version ends up shut out of the party.
  const installUpdateUnnoticed = (): void => {
    if (quitting || updater.current().state !== 'ready') return;
    if (controlWindow.isVisible() || upload || localReplay || connection?.current().queue.length) return;

    writeFileSync(quietRestartFlag(), '');
    quitting = true;
    updater.installNow();
  };

  const publishState = (): void => {
    const state = getState();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IpcChannel.StateChanged, state);
    }
    syncOverlay();
    tray.showMuted(settings.current.muted);
    installUpdateUnnoticed();
  };

  const updater = new Updater(publishState);

  const showControlWindow = (): void => {
    controlWindow.show();
    if (controlWindow.isMinimized()) controlWindow.restore();
    controlWindow.focus();
  };

  const tray = new AppTray({
    open: showControlWindow,
    setMuted: (muted) => {
      settings.update({ muted });
      publishState();
    },
    quit: () => app.quit(),
  });

  // Only for a real install: anything else would have Windows launch a test copy at every start.
  const applyLaunchAtStartup = (): void => {
    if (!app.isPackaged || profile) return;
    app.setLoginItemSettings({
      openAtLogin: settings.current.launchAtStartup,
      name: 'LiveChatSBCB',
      args: [START_HIDDEN_ARG],
    });
  };

  const stopLocalReplay = (): void => {
    clearTimeout(localReplayTimer);
    if (localReplay) cache.forget(localReplay.key);
    localReplay = null;
  };

  const leaveConnection = (): void => {
    upload?.controller.abort();
    stopLocalReplay();
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
        // What is for everyone comes first, and the moment it starts is already decided.
        if (snapshot.queue[0]?.startAt != null) stopLocalReplay();
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
    // Removed from the side while the answer was on its way.
    const session = store.session;
    if (result.ok && session?.guild?.id === guildId && !store.addedGuilds.some(({ id }) => id === guildId)) {
      leaveConnection();
      void partyApi.leaveParty(session);
      store.update({ session: null });
      publishState();
      await enterLastGuild();
      return result;
    }
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
    if (!guild) {
      if (store.privateSession) enterParty(store.privateSession);
      return;
    }
    if (refusedGuild?.id === guild.id && Date.now() - refusedGuild.at < RETRY_REFUSED_GUILD_AFTER_MS) return;
    await enterGuild(guild.id);
  };

  const clearDraft = (slot: DraftSlot): void => {
    const file = draft[slot];
    if (file) forgetMediaFile(file.fileId);
    draft[slot] = null;
  };

  const slotOf = (contentType: MediaContentType): DraftSlot =>
    fileKindOf(contentType) === 'audio' ? 'sound' : 'picture';

  const putInDraft = (file: SavedFile): DraftMedia => {
    const slot = slotOf(file.contentType);
    clearDraft(slot);
    const preview = registerMediaFile(file.path, file.contentType);
    draft[slot] = { ...file, fileId: preview.id };
    return { name: file.name, size: file.size, kind: fileKindOf(file.contentType), previewUrl: preview.url };
  };

  type Timing = Pick<z.infer<typeof SendMediaInputSchema>, 'caption' | 'clipStartMs' | 'durationMs' | 'videoMuted' | 'soundMuted'> & {
    scene?: SceneLayer[] | null;
  };

  // What is on the stage of the advanced mode. Kept apart, so that going back to the simple mode finds its own files.
  const sceneFiles = new Map<string, SavedFile & { preview: SceneFile }>();

  const putInScene = (file: SavedFile): SceneFile => {
    const preview = registerMediaFile(file.path, file.contentType);
    const view = { id: preview.id, name: file.name, size: file.size, kind: fileKindOf(file.contentType), previewUrl: preview.url };
    sceneFiles.set(preview.id, { ...file, preview: view });
    return view;
  };

  const forgetSceneFile = (id: string): void => {
    if (sceneFiles.delete(id)) forgetMediaFile(id);
  };

  // The same file used twice is only sent once, and what is on the stage points at its place in the list.
  const sceneRecipe = (input: z.infer<typeof SceneInputSchema>): { files: SavedFile[]; scene: SceneLayer[] } | null => {
    const ids = [...new Set(input.layers.map(({ fileId }) => fileId)), ...(input.soundId ? [input.soundId] : [])];
    const files = ids.map((id) => sceneFiles.get(id));
    if (files.includes(undefined)) return null;
    return {
      files: (files as SavedFile[]).map(({ path, name, size, contentType }) => ({ path, name, size, contentType })),
      scene: input.layers.map(({ fileId, ...layer }) => ({ ...layer, file: ids.indexOf(fileId) })),
    };
  };

  const sendFiles = async (session: SessionResponse, files: SavedFile[], timing: Timing): Promise<ActionResult> => {
    const created = await partyApi.createMedia(session, {
      ...timing,
      scene: timing.scene ?? null,
      files: files.map(({ contentType, size, name }) => ({ contentType, size, name: name.slice(0, MAX_FILE_NAME_LENGTH) })),
    });
    if (!created.ok) return created;
    if (files.length === 0) return { ok: true };

    const { mediaId, fileIds } = created.value;
    const controller = new AbortController();
    const current = { name: files.map(({ name }) => name).join(' + '), percent: 0, controller };
    upload = current;
    publishState();

    // Before the last step: the service can announce the media before it answers that step.
    for (const [index, file] of files.entries()) cache.adopt(mediaId, fileIds[index]!, file.path, file.contentType);

    const totalBytes = files.reduce((total, { size }) => total + size, 0);
    let sentBytes = 0;
    let result: Awaited<ReturnType<typeof uploadFile>> = { ok: true, value: null };
    for (const [index, file] of files.entries()) {
      result = await uploadFile(session, fileIds[index]!, file.path, file.size, controller.signal, (percent) => {
        current.percent = Math.round(((sentBytes + (file.size * percent) / 100) / totalBytes) * 100);
        publishState();
      });
      if (!result.ok) break;
      sentBytes += file.size;
    }
    upload = null;

    if (!result.ok) {
      cache.forget(mediaId);
      void partyApi.cancelMedia(session, mediaId);
      publishState();
      return result;
    }
    publishState();
    return { ok: true };
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
    if (!controlWindow.isVisible()) controlWindow.show();
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
    if (!next) {
      await enterLastGuild();
      return { ok: true };
    }
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

  // A server is left by removing its picture, so this is always about the private party, whether someone is in it or not.
  handle(IpcChannel.LeaveParty, async (): Promise<ActionResult> => {
    const session = store.privateSession;
    if (!session) return { ok: true };

    const result = await partyApi.leaveParty(session);
    if (!result.ok && result.error !== 'unauthorized') return result;

    const wasInIt = store.session?.partyId === session.partyId;
    if (wasInIt) leaveConnection();
    store.update(wasInIt ? { session: null, privateSession: null } : { privateSession: null });
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

  handle(IpcChannel.PickMedia, async (rawSlot: unknown): Promise<PickResult> => {
    const wanted = rawSlot === 'picture' || rawSlot === 'sound' ? rawSlot : null;
    const extensions = Object.entries(CONTENT_TYPE_BY_EXTENSION)
      .filter(([, contentType]) => !wanted || slotOf(contentType) === wanted)
      .map(([extension]) => extension);
    const picked = await dialog.showOpenDialog(controlWindow, {
      title: 'Choisir un média',
      properties: ['openFile'],
      filters: [{ name: wanted === 'sound' ? 'Sons' : wanted ? 'Images et vidéos' : 'Images, vidéos et sons', extensions }],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return { ok: false, error: 'cancelled' };

    const contentType = contentTypeOf(path);
    if (!contentType || (wanted && slotOf(contentType) !== wanted)) return { ok: false, error: 'unsupported' };

    const { size } = await stat(path);
    if (size === 0) return { ok: false, error: 'empty' };
    const other = draft[slotOf(contentType) === 'sound' ? 'picture' : 'sound'];
    if (size + (other?.size ?? 0) > MAX_MEDIA_BYTES) return { ok: false, error: 'too_large' };

    return { ok: true, draft: putInDraft({ path, name: basename(path), size, contentType }) };
  });

  handle(IpcChannel.ClearDraft, (slot: unknown) => {
    if (slot === 'picture' || slot === 'sound') clearDraft(slot);
  });

  handle(IpcChannel.SendMedia, async (raw: unknown): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };

    const input = SendMediaInputSchema.safeParse(raw);
    if (!input.success || upload) return { ok: false, error: 'invalid_request' };

    const chosen = [input.data.withPicture ? draft.picture : null, input.data.withSound ? draft.sound : null];
    if ((input.data.withPicture && !draft.picture) || (input.data.withSound && !draft.sound)) {
      return { ok: false, error: 'invalid_request' };
    }
    const files = chosen.filter((file) => file !== null);

    const result = await sendFiles(session, files, input.data);
    if (result.ok && files.length > 0) {
      clearDraft('picture');
      clearDraft('sound');
      publishState();
    }
    return result;
  });

  handle(IpcChannel.ScanLibrary, async () => {
    await library.scan();
    return library.view();
  });

  handle(IpcChannel.AddLibraryFolder, async () => {
    const picked = await dialog.showOpenDialog(controlWindow, {
      title: 'Choisir un dossier',
      properties: ['openDirectory'],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return null;
    library.addFolder(path);
    await library.scan();
    return library.view();
  });

  handle(IpcChannel.RemoveLibraryFolder, async (path: unknown) => {
    if (typeof path === 'string') library.removeFolder(path);
    await library.scan();
    return library.view();
  });

  handle(IpcChannel.SetLibraryFavorite, (fileId: unknown, favorite: unknown) => {
    if (typeof fileId === 'string') library.setFileFavorite(fileId, favorite === true);
    return library.view();
  });

  handle(IpcChannel.UseLibraryFile, async (fileId: unknown) => {
    const file = typeof fileId === 'string' ? library.fileById(fileId) : null;
    const info = file && (await stat(file.path).catch(() => null));
    if (!file || !info) return { ok: false };
    return { ok: true, draft: putInDraft({ ...file, size: info.size }) };
  });

  type MenuLine<Action> = { label: string; enabled?: boolean } & ({ action: Action } | { run: () => void });

  // Answers with the line chosen. The menu can say it closed just before the click arrives, so closing decides nothing at once.
  const chooseFromMenu = <Action>(groups: Array<Array<MenuLine<Action>>>) =>
    new Promise<Action | null>((resolve) => {
      const lines = groups
        .filter((group) => group.length > 0)
        .flatMap((group, index) => [
          ...(index > 0 ? [{ type: 'separator' as const }] : []),
          ...group.map((line) => ({
            label: line.label,
            enabled: line.enabled ?? true,
            click: () => {
              if ('run' in line) line.run();
              resolve('action' in line ? line.action : null);
            },
          })),
        ]);
      Menu.buildFromTemplate(lines).popup({ window: controlWindow, callback: () => setTimeout(() => resolve(null), 1_000) });
    });

  const confirmed = async (message: string, detail: string, button: string): Promise<boolean> => {
    const { response } = await dialog.showMessageBox(controlWindow, {
      type: 'warning',
      message,
      detail,
      buttons: [button, 'Annuler'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return response === 0;
  };

  handle(IpcChannel.ShowLibraryFileMenu, async (fileId: unknown, canSend: unknown) => {
    const id = typeof fileId === 'string' ? fileId : '';
    const file = library.fileById(id);
    if (!file || !(await stat(file.path).catch(() => null))) return { action: null, missing: true };

    // On its way, about to play or in the LiveChat tab: the app is counting on finding it where it is.
    const locked =
      upload !== null ||
      Boolean(connection?.current().queue.length) ||
      [...sceneFiles.values()].some(({ path }) => path === file.path) ||
      draft.picture?.path === file.path ||
      draft.sound?.path === file.path;
    const action = await chooseFromMenu<FileMenuAction>([
      [
        { label: 'Utiliser dans un LiveChat', action: 'use' },
        { label: 'Envoyer tout de suite', action: 'send', enabled: canSend === true },
        ...(fileKindOf(file.contentType) === 'audio' ? [{ label: 'Écouter ou arrêter', action: 'listen' as const }] : []),
      ],
      [{ label: library.isFileFavorite(id) ? 'Retirer des favoris' : 'Épingler en favori', action: 'favorite' }],
      [
        { label: 'Afficher dans l’Explorateur', run: () => shell.showItemInFolder(file.path) },
        { label: 'Ouvrir avec l’app par défaut', run: () => void shell.openPath(file.path) },
        { label: 'Copier le chemin', run: () => clipboard.writeText(file.path) },
      ],
      [
        { label: 'Renommer', action: 'rename', enabled: !locked },
        { label: 'Mettre à la corbeille', action: 'trash', enabled: !locked },
      ],
    ]);
    return { action };
  });

  handle(IpcChannel.ShowSavedMenu, async (savedId: unknown, canSend: unknown) => {
    const saved = typeof savedId === 'string' ? library.savedById(savedId) : null;
    if (!saved) return { action: null };

    const there = await Promise.all(saved.files.map(async (file) => (await stat(file.path).catch(() => null)) !== null));
    const complete = await library.allThere(saved);
    const action = await chooseFromMenu<SavedMenuAction | 'delete'>([
      [
        { label: 'Envoyer', action: 'send', enabled: canSend === true && complete },
        complete ? { label: 'Modifier', action: 'edit' } : { label: 'Retrouver', action: 'relocate' },
      ],
      [{ label: saved.favorite ? 'Retirer des favoris' : 'Épingler en favori', action: 'favorite' }],
      saved.files.flatMap((file, index) =>
        there[index] ? [{ label: `Afficher ${file.name} dans l’Explorateur`, run: () => shell.showItemInFolder(file.path) }] : [],
      ),
      [{ label: 'Supprimer', action: 'delete' }],
    ]);
    if (action !== 'delete') return { action };

    const detail = saved.kept ? 'La copie gardée sur ce PC sera effacée.' : 'Tes fichiers ne bougent pas.';
    if (await confirmed(`Supprimer « ${saved.name} » ?`, detail, 'Supprimer')) library.deleteSaved(saved.id);
    publishState();
    return { action: null, library: await library.view() };
  });

  handle(IpcChannel.SendLibraryFile, async (fileId: unknown, durationMs: unknown): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };
    const file = typeof fileId === 'string' ? library.fileById(fileId) : null;
    if (!file || upload || typeof durationMs !== 'number') return { ok: false, error: 'invalid_request' };
    const info = await stat(file.path).catch(() => null);
    if (!info) return { ok: false, error: 'invalid_request' };
    return sendFiles(session, [{ ...file, size: info.size }], { caption: '', clipStartMs: 0, durationMs, videoMuted: false, soundMuted: false });
  });

  handle(IpcChannel.RenameLibraryFile, async (fileId: unknown, name: unknown) => {
    const outcome = typeof fileId === 'string' && typeof name === 'string' ? await library.renameFile(fileId, name) : 'invalid';
    await library.scan();
    return { outcome, library: await library.view() };
  });

  handle(IpcChannel.TrashLibraryFile, async (fileId: unknown) => {
    const file = typeof fileId === 'string' ? library.fileById(fileId) : null;
    const used = file ? library.savedUsing(file.path).length : 0;
    const detail =
      (used > 0 ? `${used > 1 ? `${used} LiveChats sauvegardés l’utilisent` : 'Un LiveChat sauvegardé l’utilise'} et ne pourra plus partir sans lui. ` : '') +
      'Tu pourras le récupérer depuis la corbeille de Windows.';
    let outcome: 'trashed' | 'cancelled' | 'busy' = 'cancelled';
    if (file && (await confirmed(`Mettre ${file.name} à la corbeille ?`, detail, 'Mettre à la corbeille'))) {
      outcome = await shell.trashItem(file.path).then(
        () => 'trashed' as const,
        () => 'busy' as const,
      );
      if (outcome === 'trashed') library.forgetFavorite(file.path);
    }
    await library.scan();
    return { outcome, library: await library.view() };
  });

  handle(IpcChannel.StartScene, () => [draft.picture, draft.sound].filter((file) => file !== null).map((file) => putInScene(file)));

  handle(IpcChannel.PickSceneFile, async (wanted: unknown): Promise<SceneResult> => {
    const slot: DraftSlot = wanted === 'sound' ? 'sound' : 'picture';
    const picked = await dialog.showOpenDialog(controlWindow, {
      title: 'Choisir un média',
      properties: ['openFile'],
      filters: [
        {
          name: slot === 'sound' ? 'Sons' : 'Images et vidéos',
          extensions: Object.entries(CONTENT_TYPE_BY_EXTENSION)
            .filter(([, contentType]) => slotOf(contentType) === slot)
            .map(([extension]) => extension),
        },
      ],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return { ok: false, error: 'cancelled' };
    const contentType = contentTypeOf(path);
    if (!contentType || slotOf(contentType) !== slot) return { ok: false, error: 'unsupported' };
    const { size } = await stat(path);
    if (size === 0) return { ok: false, error: 'empty' };
    return { ok: true, file: putInScene({ path, name: basename(path), size, contentType }) };
  });

  handle(IpcChannel.UseLibraryFileInScene, async (fileId: unknown): Promise<SceneResult> => {
    const file = typeof fileId === 'string' ? library.fileById(fileId) : null;
    const info = file && (await stat(file.path).catch(() => null));
    if (!file || !info) return { ok: false, error: 'not_found' };
    return { ok: true, file: putInScene({ ...file, size: info.size }) };
  });

  handle(IpcChannel.ForgetSceneFile, (id: unknown) => {
    if (typeof id === 'string') forgetSceneFile(id);
  });

  handle(IpcChannel.SendScene, async (raw: unknown): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };
    const input = SceneInputSchema.safeParse(raw);
    const recipe = input.success ? sceneRecipe(input.data) : null;
    if (!input.success || !recipe || upload) return { ok: false, error: 'invalid_request' };
    const { soundId: _soundId, layers: _layers, ...timing } = input.data;

    // Said here rather than by the service, which would have started on the upload.
    if (!MediaDraftSchema.safeParse({ ...timing, ...recipe }).success) return { ok: false, error: 'invalid_request' };

    const result = await sendFiles(session, recipe.files, { ...timing, scene: recipe.scene });
    if (result.ok) {
      for (const id of [...sceneFiles.keys()]) forgetSceneFile(id);
      publishState();
    }
    return result;
  });

  handle(IpcChannel.SaveScene, async (raw: unknown): Promise<ActionResult> => {
    const input = SaveSceneInputSchema.safeParse(raw);
    const recipe = input.success ? sceneRecipe(input.data) : null;
    if (!input.success || !recipe) return { ok: false, error: 'invalid_request' };
    const { name, caption, clipStartMs, durationMs, videoMuted, soundMuted } = input.data;
    await library.saveLiveChat({ name, caption, clipStartMs, durationMs, videoMuted, soundMuted, ...recipe });
    return { ok: true };
  });

  handle(IpcChannel.SaveLiveChat, async (raw: unknown): Promise<ActionResult> => {
    const input = SaveLiveChatInputSchema.safeParse(raw);
    if (!input.success) return { ok: false, error: 'invalid_request' };
    const { name, caption, clipStartMs, durationMs, videoMuted, soundMuted, withPicture, withSound } = input.data;

    const chosen = [withPicture ? draft.picture : null, withSound ? draft.sound : null].filter((file) => file !== null);
    const files = chosen.map(({ path, name: fileName, size, contentType }) => ({ path, name: fileName, size, contentType }));
    if (files.length === 0 && !caption.trim()) return { ok: false, error: 'invalid_request' };

    await library.saveLiveChat({ name, caption, clipStartMs, durationMs, videoMuted, soundMuted, files, scene: null });
    return { ok: true };
  });

  handle(IpcChannel.SendSaved, async (savedId: unknown): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };
    const saved = typeof savedId === 'string' ? library.savedById(savedId) : null;
    if (!saved || upload) return { ok: false, error: 'invalid_request' };
    // Never half of it: the button is already off, but a file can go missing while it is on screen.
    if (!(await library.allThere(saved))) return { ok: false, error: 'not_found' };
    return sendFiles(session, saved.files, saved);
  });

  handle(IpcChannel.EditSaved, async (savedId: unknown) => {
    const saved = typeof savedId === 'string' ? library.savedById(savedId) : null;
    if (!saved || !(await library.allThere(saved))) return { ok: false };

    if (saved.scene) {
      const { caption, clipStartMs, durationMs, videoMuted, soundMuted } = saved;
      for (const id of [...sceneFiles.keys()]) forgetSceneFile(id);
      const files = saved.files.map((file) => putInScene(file));
      return {
        ok: true,
        scene: {
          caption,
          clipStartMs,
          durationMs,
          videoMuted,
          soundMuted,
          files,
          layers: saved.scene.map(({ file, ...layer }) => ({ ...layer, fileId: files[file]!.id })),
          soundId: files.find(({ kind }) => kind === 'audio')?.id ?? null,
        },
      };
    }

    clearDraft('picture');
    clearDraft('sound');
    const loaded = saved.files.map((file) => putInDraft(file));
    const { caption, clipStartMs, durationMs, videoMuted, soundMuted } = saved;
    return {
      ok: true,
      draft: {
        picture: loaded.find(({ kind }) => kind !== 'audio') ?? null,
        sound: loaded.find(({ kind }) => kind === 'audio') ?? null,
        caption,
        clipStartMs,
        durationMs,
        videoMuted,
        soundMuted,
      },
    };
  });

  handle(IpcChannel.RelocateSaved, async (savedId: unknown) => {
    const id = typeof savedId === 'string' ? savedId : '';
    const picked = await dialog.showOpenDialog(controlWindow, {
      title: 'Montrer un des fichiers qui manquent',
      properties: ['openFile'],
      filters: [{ name: 'Images, vidéos et sons', extensions: Object.keys(CONTENT_TYPE_BY_EXTENSION) }],
    });
    const path = picked.filePaths[0];
    const outcome =
      picked.canceled || !path ? ('cancelled' as const) : (await library.relocate(id, path)) ? ('found' as const) : ('wrong_file' as const);
    return { outcome, library: await library.view() };
  });

  handle(IpcChannel.SetSavedFavorite, (savedId: unknown, favorite: unknown) => {
    if (typeof savedId === 'string') library.setSavedFavorite(savedId, favorite === true);
    return library.view();
  });

  handle(IpcChannel.DeleteSaved, (savedId: unknown) => {
    if (typeof savedId === 'string') library.deleteSaved(savedId);
    publishState();
    return library.view();
  });

  handle(IpcChannel.CancelUpload, () => upload?.controller.abort());

  handle(IpcChannel.SkipMedia, (mediaId: unknown) => {
    if (typeof mediaId === 'string') connection?.skip(mediaId);
  });

  handle(IpcChannel.ReplayForAll, async (rawId: unknown): Promise<ActionResult> => {
    const session = store.session;
    if (!session || typeof rawId !== 'string') return { ok: false, error: 'unauthorized' };
    return partyApi.replayMedia(session, rawId);
  });

  const playLocalReplay = (replay: NonNullable<typeof localReplay>): void => {
    replay.startAt = Date.now() + LOCAL_REPLAY_LEAD_MS;
    localReplayTimer = setTimeout(() => {
      stopLocalReplay();
      publishState();
    }, LOCAL_REPLAY_LEAD_MS + replay.item.durationMs);
    publishState();
  };

  // The online copy goes after 1 day, so a favourite brings its files down to this PC, which costs the service nothing.
  const keepFromHistory = async (session: SessionResponse, item: HistoryItem): Promise<ActionResult> => {
    const key = randomUUID();
    const id = randomUUID();
    const folder = library.keptFolder(id);
    try {
      if (!(await cache.fetchForMe(key, session, item.files))) return { ok: false, error: 'not_found' };

      await mkdir(folder, { recursive: true });
      const files: SavedFile[] = [];
      for (const [index, { id: fileId, name, size, contentType }] of item.files.entries()) {
        const path = join(folder, `${index}.${extensionOf(contentType)}`);
        if (!(await cache.moveOut(key, fileId, path))) throw new Error('Not downloaded');
        // Written by someone else, and this name can end up in a path.
        files.push({ path, name: name.replace(/[\\/]/g, '_'), size, contentType });
      }

      const { caption, clipStartMs, durationMs, videoMuted, soundMuted, scene, senderName, senderAvatarUrl } = item;
      const name = caption.split('\n')[0]!.trim().slice(0, 60) || item.files[0]?.name.replace(/\.[^.]*$/, '') || 'LiveChat';
      await library.keepFromHistory(
        id,
        { name, caption, clipStartMs, durationMs, videoMuted, soundMuted, scene, files },
        { historyId: item.id, senderName, senderAvatarUrl },
      );
      return { ok: true };
    } catch {
      await rm(folder, { recursive: true, force: true }).catch(() => {});
      return { ok: false, error: 'network' };
    } finally {
      cache.forget(key);
    }
  };

  handle(IpcChannel.KeepHistory, async (rawId: unknown): Promise<ActionResult> => {
    const session = store.session;
    const item = connection?.current().history.find(({ id }) => id === rawId);
    if (!session || !item) return { ok: false, error: 'not_found' };
    if (keeping.has(item.id) || library.keptFrom(item.id)) return { ok: true };

    keeping.add(item.id);
    publishState();
    const result = await keepFromHistory(session, item);
    keeping.delete(item.id);
    publishState();
    return result;
  });

  handle(IpcChannel.ReplayFavoriteForMe, async (savedId: unknown): Promise<ActionResult> => {
    const saved = typeof savedId === 'string' ? library.savedById(savedId) : null;
    if (!saved?.kept || !(await library.allThere(saved))) return { ok: false, error: 'not_found' };
    if (connection?.current().queue[0]?.startAt != null) return { ok: true };

    stopLocalReplay();
    const key = randomUUID();
    const files = saved.files.map(({ name, size, contentType }) => ({ id: randomUUID(), name, size, contentType }));
    for (const [index, file] of saved.files.entries()) cache.adopt(key, files[index]!.id, file.path, file.contentType);

    const { caption, clipStartMs, durationMs, videoMuted, soundMuted, scene, savedAt, kept } = saved;
    const item: HistoryItem = {
      id: saved.id,
      files,
      senderId: '',
      senderName: kept.senderName,
      senderAvatarUrl: kept.senderAvatarUrl,
      kind: mediaKindOf(saved.files),
      caption,
      clipStartMs,
      durationMs,
      videoMuted,
      soundMuted,
      scene,
      expiresAt: Number.MAX_SAFE_INTEGER,
      playedAt: savedAt,
    };
    const replay = { key, historyId: saved.id, item, startAt: null as number | null };
    localReplay = replay;
    playLocalReplay(replay);
    return { ok: true };
  });

  handle(IpcChannel.ReplayForMe, async (rawId: unknown): Promise<ActionResult> => {
    const session = store.session;
    const item = connection?.current().history.find(({ id }) => id === rawId);
    if (!session || !item) return { ok: false, error: 'not_found' };
    // Nothing for everyone is ever interrupted, and the button says so too.
    if (connection?.current().queue[0]?.startAt != null) return { ok: true };

    stopLocalReplay();
    const replay = { key: randomUUID(), historyId: item.id, item, startAt: null as number | null };
    localReplay = replay;
    publishState();

    if (!(await cache.fetchForMe(replay.key, session, item.files))) {
      if (localReplay === replay) stopLocalReplay();
      publishState();
      return { ok: false, error: 'not_found' };
    }
    // Stopped, or replaced by something else, while the file was on its way.
    if (localReplay !== replay) return { ok: true };

    playLocalReplay(replay);
    return { ok: true };
  });

  handle(IpcChannel.StopLocalReplay, () => {
    stopLocalReplay();
    publishState();
  });

  handle(IpcChannel.SetSettings, (raw: unknown) => {
    const change = SettingsSchema.partial().safeParse(raw);
    if (!change.success) return;

    settings.update(change.data);
    if (change.data.launchAtStartup !== undefined) applyLaunchAtStartup();
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

  // Nothing should close the overlay but quitting.
  stageWindow.on('close', (event) => {
    if (!quitting) event.preventDefault();
  });

  // The cross only puts the app away: medias keep arriving, and quitting is on the icon near the clock.
  controlWindow.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    controlWindow.hide();
    if (settings.current.backgroundHintShown) return;

    settings.update({ backgroundHintShown: true });
    // Not during the tests: the point of them is to leave this PC alone.
    if (!profile) tray.explain();
  });
  controlWindow.on('hide', installUpdateUnnoticed);

  // Windows doesn't announce a quit when it shuts down, and a window refusing to close would hold up the shutdown.
  for (const window of [controlWindow, stageWindow]) {
    window.on('session-end', () => {
      quitting = true;
      settings.flush();
    });
  }

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
  app.on('before-quit', () => {
    quitting = true;
    login?.abort();
    connection?.stop();
    settings.flush();
    tray.destroy();
  });
  app.on('second-instance', showControlWindow);

  applyLaunchAtStartup();

  if (store.login) {
    void refreshGuilds();
    const saved = store.session;
    if (saved) connectTo(saved);
  }

  updater.start();
}
