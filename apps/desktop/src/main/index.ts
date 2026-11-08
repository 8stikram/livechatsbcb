import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, powerMonitor, screen, shell, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { z } from 'zod';
import {
  CloseCode,
  CodeSchema,
  DEFAULT_DISPLAY_MS,
  MAX_FILE_NAME_LENGTH,
  MAX_MEDIA_BYTES,
  MAX_ONLINE_MEMBERS,
  MediaDraftSchema,
  PollRequestSchema,
  GameKindSchema,
  MAX_GAME_TEXT_LENGTH,
  MAX_CAPTION_LENGTH,
  GAME_ENTRIES_PER_PLAYER,
  type Game,
  type GameFile,
  MediaLinkSchema,
  SceneLayerSchema,
  fileKindOf,
  mediaKindOf,
  fileNamesOf,
  pictureOf,
  soundOf,
  type Activity,
  type GuildSummary,
  type HistoryItem,
  type Member,
  type MediaContentType,
  type QueueItem,
  type MediaLink,
  type SceneLayer,
  type SessionResponse,
} from '@livechatsbcb/protocol';
import { IpcChannel, isNewerVersion, keyLabel, DEFAULT_SETTINGS, WHEEL_SIZE, type ActionKey, type KeyChange, type ExternalFiles, type IncomingError, type IncomingResult, type ActionResult, type GameSendResult, type HiddenReason, type IgnoreChoice, type MemberView, type AppState, type DraftMedia, type DraftSlot, type FileMenuAction, type HistoryView, type PickResult, type PlaybackView, type SavedMenuAction, type SceneFile, type SceneResult } from '../shared/ipc';
import { registerAppScheme, serveRenderer } from './app-protocol';
import { loginWithDiscord } from './discord-login';
import { Library, type SavedFile } from './library';
import { MediaCache } from './media-cache';
import { cleanPasted, downloadLink, folder as pastedFolder, savePastedImage, type Incoming } from './incoming';
import { PREPARE_ARG, registerExplorerMenu, SEND_ARG } from './explorer-menu';
import { CONTENT_TYPE_BY_EXTENSION, contentTypeOf, extensionOf, forgetMediaFile, registerMediaFile, serveMediaFiles } from './media-files';
import { retryWhileOffline, uploadFile } from './media-upload';
import { forgetRestartStash, takeRestartStash, writeRestartStash, type RestartStash, type StashedRecipe } from './restart-stash';
import { RestartCountdown } from './update-restart';
import * as partyApi from './party-api';
import { PartyConnection } from './party-connection';
import { SessionStore } from './session-store';
import { SettingsSchema, SettingsStore } from './settings-store';
import { AppTray } from './tray';
import { Updater } from './updater';
import { createControlWindow, createStageWindow, denyAllPermissions, introduceToPlayers, isOwnPage, openInBrowser, openSoundCloudSearch, placeOverlay, type StartMode } from './windows';
import { checkLink } from './links';
import { GameWatch, openApps } from './game-watch';
import { findLink } from '../shared/links';

// Lets one PC run several members for testing; each profile has its own folder and its own single-instance lock.
const profile = process.env['LIVECHATSBCB_PROFILE'];
// For the tests: everything plays as usual, and nothing comes out of the speakers.
if (process.env['LIVECHATSBCB_SILENT'] === '1') app.on('web-contents-created', (_event, contents) => contents.setAudioMuted(true));
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
  speak: z.boolean().default(false),
  withPicture: z.boolean(),
  withSound: z.boolean(),
  link: MediaLinkSchema.nullable().default(null),
  to: z.array(z.string()).max(MAX_ONLINE_MEMBERS).default([]),
});

const WheelChoiceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('saved'), id: z.string() }),
  z.object({ kind: z.literal('file'), fileId: z.string(), durationMs: z.number() }),
]);

const ACTION_KEYS: readonly ActionKey[] = ['cleanKey', 'skipKey', 'skipMineKey', 'wheelKey'];
const ACTION_NAMES: Record<ActionKey, string> = {
  cleanKey: 'Mode clean',
  skipKey: 'Passer pour tout le monde',
  skipMineKey: 'Passer pour moi',
  wheelKey: 'Ouvrir la roue',
};
const WHEEL_OPEN_MS = 4_000;
const KEY_TEST_MS = 20_000;

const SAVE_NAME = z.string().trim().min(1).max(80);
const SaveLiveChatInputSchema = SendMediaInputSchema.extend({ name: SAVE_NAME });

const SceneInputSchema = z.object({
  caption: z.string(),
  clipStartMs: z.number(),
  durationMs: z.number(),
  videoMuted: z.boolean(),
  soundMuted: z.boolean(),
  speak: z.boolean().default(false),
  layers: z.array(SceneLayerSchema.omit({ file: true }).extend({ fileId: z.string() })),
  soundId: z.string().nullable(),
  to: z.array(z.string()).max(MAX_ONLINE_MEMBERS).default([]),
  // Its player is the layer marked as the link.
  link: MediaLinkSchema.nullable().default(null),
});

// Nothing touched for this long, and the others see this member as away.
const AWAY_AFTER_S = 5 * 60;
const STATUS_CHECK_MS = 15_000;
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
const SHORTCUT_COOLDOWN_MS = 3_000;

// How Windows starts the app at login: no window, only the icon near the clock.
const START_HIDDEN_ARG = '--hidden';
const SKIPPED_BY_SHOWN_MS = 6_000;

// An update installed unnoticed should come back the same way, and an installer can't pass an argument along.
const quietRestartFlag = () => join(app.getPath('userData'), 'restart-quietly');

// Says how the window was. A flag written by an older version is empty, and it only ever restarted hidden.
const takeRestartMode = (): StartMode | null => {
  const flag = quietRestartFlag();
  if (!existsSync(flag)) return null;
  const written = readFileSync(flag, 'utf8');
  rmSync(flag, { force: true });
  return written === 'shown' || written === 'inactive' ? written : 'hidden';
};

function start(): void {
  denyAllPermissions();
  introduceToPlayers();
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
  let upload: { name: string; percent: number; paused: boolean; controller: AbortController } | null = null;
  let quitting = false;
  let localReplay: { key: string; historyId: string; item: HistoryItem; startAt: number | null } | null = null;
  let localReplayTimer: NodeJS.Timeout | undefined;
  const keeping = new Set<string>();
  // Passed on this PC only: the others keep watching, and the queue moves on once nobody is.
  const skippedHere = new Set<string>();
  let wheelOpen: { preview: boolean } | null = null;
  let wheelTimer: NodeJS.Timeout | undefined;
  let wheelLast: string | null = null;
  let keyTest: { heard: string | null } | null = null;
  let keyTestTimer: NodeJS.Timeout | undefined;
  let skippedBy: string | null = null;
  let skippedByTimer: NodeJS.Timeout | undefined;
  let unavailableKeys: string[] = [];
  let cutTimer: NodeJS.Timeout | undefined;
  let lastShortcutAt = 0;

  const restartMode = takeRestartMode();
  // Someone ignored "until the app closes" stays so through an update, which nobody chose.
  settings.update({
    ignored: Object.fromEntries(
      Object.entries(settings.current.ignored).filter(([, until]) => (until === null ? restartMode !== null : until > Date.now())),
    ),
  });
  const stageWindow = createStageWindow(settings.current.displayId);
  // A Mac doesn't pass arguments to what it starts at login, it says so instead.
  const startedAtLogin = process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin;
  const controlWindow = createControlWindow(
    restartMode ?? (startedAtLogin || process.argv.includes(START_HIDDEN_ARG) || process.argv.includes(SEND_ARG) ? 'hidden' : 'shown'),
  );
  const restartStash = takeRestartStash();
  const stashed: RestartStash = { view: null, recipe: null };
  // Someone new starts on this version. Someone already logged in came from an older one, and gets told what changed.
  if (settings.current.seenVersion === null && !store.login) {
    // The bubbles wait for the first party. The tests turn them on only when they look at them.
    const tutorial = process.env['LIVECHATSBCB_SILENT'] !== '1' || process.env['LIVECHATSBCB_TUTORIAL'] === '1';
    settings.update({ seenVersion: app.getVersion(), tutorialDone: !tutorial });
  }

  const cache = new MediaCache(join(app.getPath('userData'), 'media-cache'), (mediaId) => {
    connection?.reportReady(mediaId);
    publishState();
  });

  // Files stay under the media they came with, which is the replay's own key when played on this PC alone.
  // The pictures and LiveChats of a game, fetched as they are shown, and forgotten with the game.
  const gameFiles = new Set<string>();
  let gameFilesOf: string | null = null;
  let gameSending = 0;
  // Also the name of the file on disk, so nothing Windows refuses in a name.
  const gameKey = (fileId: string) => `game-${fileId}`;

  const syncGameFiles = (session: SessionResponse, game: Game | null): void => {
    if (gameFilesOf !== (game?.id ?? null)) {
      for (const id of gameFiles) cache.forget(gameKey(id));
      gameFiles.clear();
      gameFilesOf = game?.id ?? null;
    }
    if (!game) return;
    const files = [...game.myPicture, ...game.entries.flatMap(({ files: entryFiles }) => entryFiles)];
    for (const file of files) {
      if (gameFiles.has(file.id)) continue;
      gameFiles.add(file.id);
      void cache.fetchForMe(gameKey(file.id), session, [file]).then(() => publishState());
    }
  };

  const toGameFile = (file: GameFile) => ({
    id: file.id,
    name: file.name,
    kind: fileKindOf(file.contentType),
    url: cache.urlOf(gameKey(file.id), file.id),
  });

  const gameView = (game: Game, party: PartyConnection): AppState['game'] => ({
    ...game,
    endsAt: party.toLocalTime(game.endsAt),
    entries: game.entries.map((entry) => ({ ...entry, files: entry.files.map(toGameFile) })),
    myPicture: game.myPicture.map(toGameFile),
    sending: gameSending,
  });

  const playbackFiles = (
    key: string,
    { files, scene, link }: Pick<QueueItem, 'files' | 'scene' | 'link'>,
  ): Pick<PlaybackView, 'fileName' | 'mediaUrl' | 'hasSound' | 'soundUrl' | 'scene' | 'link'> => {
    const picture = pictureOf(files);
    const sound = soundOf(files);
    const urlOf = (file: QueueItem['files'][number] | null) => (file ? cache.urlOf(key, file.id) : null);
    return {
      fileName: link?.title ?? fileNamesOf(files),
      link,
      mediaUrl: urlOf(picture ?? sound),
      hasSound: picture !== null && sound !== null,
      soundUrl: picture ? urlOf(sound) : null,
      scene:
        scene?.map(({ file: index, ...layer }) => {
          if (layer.link) return { ...layer, kind: 'link' as const, url: null };
          const file = files[index]!;
          return { ...layer, kind: fileKindOf(file.contentType) === 'video' ? ('video' as const) : ('image' as const), url: urlOf(file) };
        }) ?? null,
    };
  };

  const maxDurationMs = (): number | null =>
    settings.current.maxDurationSec === null ? null : settings.current.maxDurationSec * 1_000;

  const isIgnored = (memberId: string): boolean => {
    const until = settings.current.ignored[memberId];
    return until === null || (until !== undefined && until > Date.now());
  };

  const hiddenReason = (item: Pick<QueueItem, 'id' | 'senderId' | 'durationMs' | 'startAt'>): HiddenReason | null => {
    if (settings.current.clean) return 'clean';
    if (skippedHere.has(item.id)) return 'skipped';
    if (isIgnored(item.senderId)) return 'ignored';
    const limit = maxDurationMs();
    const startedAt = item.startAt !== null && connection ? connection.toLocalTime(item.startAt) : null;
    if (limit !== null && startedAt !== null && item.durationMs > limit && Date.now() >= startedAt + limit) return 'cut';
    return null;
  };

  const toMemberView = (member: Member, party: PartyConnection): MemberView => ({
    ...member,
    bannedUntil: member.bannedUntil === null ? null : party.toLocalTime(member.bannedUntil),
    ignored: isIgnored(member.id) ? { until: settings.current.ignored[member.id] ?? null } : null,
  });

  const toPlayback = (item: QueueItem): PlaybackView => ({
    hiddenForMe: hiddenReason(item),
    id: item.id,
    senderId: item.senderId,
    whisper: item.to.length > 0,
    senderName: item.senderName,
    senderAvatarUrl: item.senderAvatarUrl,
    kind: item.kind,
    caption: item.caption,
    clipStartMs: item.clipStartMs,
    durationMs: item.durationMs,
    videoMuted: item.videoMuted,
    soundMuted: item.soundMuted,
    speak: item.speak,
    startAt: item.startAt === null || !connection ? null : connection.toLocalTime(item.startAt),
    ...playbackFiles(item.id, item),
  });

  // A look at what was sent, when it is still on this PC.
  const previewOf = (item: HistoryItem): HistoryView['preview'] => {
    const picture = pictureOf(item.files);
    if (!picture) return null;
    const url = cache.urlOf(item.id, picture.id);
    return url ? { url, video: fileKindOf(picture.contentType) === 'video' } : null;
  };

  const toHistoryView = (item: HistoryItem, party: PartyConnection): HistoryView => ({
    id: item.id,
    senderId: item.senderId,
    whisper: item.to.length > 0,
    senderName: item.senderName,
    senderAvatarUrl: item.senderAvatarUrl,
    kind: item.kind,
    caption: item.caption,
    fileName: item.link?.title ?? fileNamesOf(item.files),
    isLink: item.link !== null,
    preview: previewOf(item),
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
        hiddenForMe: null,
        id: key,
        senderId: item.senderId,
        whisper: item.to.length > 0,
        senderName: item.senderName,
        senderAvatarUrl: item.senderAvatarUrl,
        kind: item.kind,
        caption: item.caption,
        clipStartMs: item.clipStartMs,
        durationMs: item.durationMs,
        videoMuted: item.videoMuted,
        soundMuted: item.soundMuted,
        speak: item.speak,
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
      shortcuts: library.shortcutKeys().map((key) => ({ key, name: library.shortcutName(key) })),
      unavailableKeys,
      restartIn: restartCountdown.seconds,
      whatsNew: settings.current.seenVersion !== app.getVersion(),
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
              members: snapshot.members.map((member) => toMemberView(member, connection!)),
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
        upcoming: rest.map(({ id, senderName, kind, caption, files, replay, to, link }) => ({
          id,
          senderName,
          kind,
          caption,
          fileName: link?.title ?? fileNamesOf(files),
          replay,
          whisper: to.length > 0,
        })),
      },
      history: connection
        ? snapshot!.history
            .filter((item) => connection!.toLocalTime(item.expiresAt) > Date.now())
            .map((item) => toHistoryView(item, connection!))
        : [],
      excludedNow: excludedNow(),
      poll: snapshot?.poll && connection ? { ...snapshot.poll, endsAt: connection.toLocalTime(snapshot.poll.endsAt) } : null,
      game: snapshot?.game && connection ? gameView(snapshot.game, connection) : null,
      favorites: library.favorites(),
      localReplay: localReplayView(),
      skippedBy,
      wheel: { open: wheelOpen !== null, preview: wheelOpen?.preview ?? false, slots: library.wheelSlots(), last: wheelLast },
      keyTest,
      upload: upload && { name: upload.name, percent: upload.percent, paused: upload.paused },
    };
  };

  // A poll is on everyone's screen while it runs, then its winner for a moment. The overlay counts the same time.
  const POLL_RESULT_MS = 8_000;
  let pollRunning: string | null = null;
  let pollResultUntil = 0;
  const pollOnScreen = (): boolean => {
    const poll = connection?.current().poll ?? null;
    if (!poll) return false;
    if (!poll.done) {
      pollRunning = poll.id;
      return true;
    }
    if (pollRunning === poll.id) {
      pollRunning = null;
      pollResultUntil = Date.now() + POLL_RESULT_MS;
      setTimeout(syncOverlay, POLL_RESULT_MS + 100);
    }
    return Date.now() < pollResultUntil;
  };

  // The overlay is only on screen while it has something to show: over a borderless game, a window that is always
  // there would cost the game its direct path to the display, and with it some speed.
  const syncOverlay = (): void => {
    if (stageWindow.isDestroyed()) return;

    const head = connection?.current().queue[0];
    const playing = head?.startAt != null && hiddenReason(head) === null && !excludedNow();
    // Asked for on this PC, like the test: it shows even for someone who keeps the overlay off.
    const showsPoll = settings.current.overlayEnabled && !settings.current.clean && !excludedNow() && pollOnScreen();
    const wanted = wheelOpen !== null || overlayTest || localReplay?.startAt != null || (playing && settings.current.overlayEnabled) || showsPoll;

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

  const installUpdate = (): void => {
    const mode: StartMode = !controlWindow.isVisible() ? 'hidden' : controlWindow.isFocused() ? 'shown' : 'inactive';
    writeFileSync(quietRestartFlag(), mode);
    // The updater closes every window before it emits before-quit, so the stage must already allow closing.
    quitting = true;
    updater.installNow();
  };

  const restartCountdown = new RestartCountdown(() => publishState(), installUpdate, () => {
    stashed.view = null;
    stashed.recipe = null;
    forgetRestartStash();
  });

  // An old version ends up shut out of the party, so nobody has to think of it. Never in the middle of anything.
  const syncRestart = (): void => {
    const busy = upload || localReplay || login || keeping.size > 0 || connection?.current().queue.length;
    restartCountdown.sync(!quitting && updater.current().state === 'ready' && !busy);
  };

  // Tells the service once this PC has stopped showing something, and comes back at the moment the limit says it stops.
  const syncCut = (): void => {
    clearTimeout(cutTimer);
    const head = connection?.current().queue[0];
    if (!connection || head?.startAt == null) return;
    if (hiddenReason(head)) {
      connection.reportCut(head.id);
      return;
    }
    const limit = maxDurationMs();
    if (limit !== null && head.durationMs > limit) {
      cutTimer = setTimeout(publishState, connection.toLocalTime(head.startAt) + limit - Date.now() + 20);
    }
  };

  // What the others see beside this member's name, found without asking anything.
  const currentActivity = (): Activity => {
    if (settings.current.clean) return 'panic';
    if (powerMonitor.getSystemIdleTime() >= AWAY_AFTER_S) return 'away';
    return gameWatch.isPlaying ? 'playing' : 'here';
  };
  // The game's name goes out only while playing, and only for whoever lets it show.
  const syncStatus = (): void => {
    const activity = currentActivity();
    connection?.setStatus(activity, settings.current.note, activity === 'playing' && settings.current.showGame ? gameWatch.gameName : null);
  };
  const excludedNow = (): boolean => {
    const front = gameWatch.foreground;
    return front !== null && settings.current.excludedApps.includes(front);
  };
  let wasExcluded = false;
  const gameWatch = new GameWatch(() => {
    syncStatus();
    // Coming in front of an excluded app, or leaving it, changes what the overlay may show.
    if (excludedNow() !== wasExcluded) {
      wasExcluded = excludedNow();
      publishState();
    }
  });
  gameWatch.start();
  setInterval(syncStatus, STATUS_CHECK_MS);

  const publishState = (): void => {
    syncRestart();
    syncCut();
    syncStatus();
    const state = getState();
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IpcChannel.StateChanged, state);
    }
    syncOverlay();
    tray.show(settings.current.muted, settings.current.clean);
  };

  const updater = new Updater(publishState);

  const showControlWindow = (): void => {
    controlWindow.show();
    if (controlWindow.isMinimized()) controlWindow.restore();
    controlWindow.focus();
  };

  const tray = new AppTray({
    open: showControlWindow,
    setClean: (clean) => setClean(clean),
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

  // Only from Applications can the app replace itself later. A Mac starts it where it was opened, even in the disk image.
  const offerApplicationsFolder = async (): Promise<void> => {
    if (process.platform !== 'darwin' || !app.isPackaged || profile || app.isInApplicationsFolder()) return;
    const { response } = await dialog.showMessageBox(controlWindow, {
      type: 'question',
      message: 'Mettre LiveChatSBCB dans Applications ?',
      detail: 'C’est nécessaire pour que l’app se mette à jour toute seule.',
      buttons: ['Oui', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;
    try {
      app.moveToApplicationsFolder();
    } catch (error) {
      console.error('Could not move to Applications:', (error as Error).message);
    }
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
    gameFiles.clear();
    gameFilesOf = null;
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

  // A version already seen in the party, so that it only sends this app looking for it once.
  let aheadVersion: string | null = null;

  const connectTo = (session: SessionResponse): void => {
    connection?.stop();
    let wasOnline = false;
    connection = new PartyConnection(session, {
      onUnreadable: () => updater.check(),
      onSkipped: (memberId, name) => {
        if (memberId === connection?.current().memberId) return;
        skippedBy = name;
        clearTimeout(skippedByTimer);
        skippedByTimer = setTimeout(() => {
          skippedBy = null;
          publishState();
        }, SKIPPED_BY_SHOWN_MS);
        publishState();
      },
      onChange: (snapshot) => {
        for (const id of skippedHere) if (!snapshot.queue.some((item) => item.id === id)) skippedHere.delete(id);
        if (snapshot.status === 'update_required') updater.check();
        // Joining is when being behind starts to matter, and a friend on a newer version proves there is one.
        if (snapshot.status === 'online' && !wasOnline) updater.check();
        wasOnline = snapshot.status === 'online';
        const ahead = snapshot.members.find(({ version }) => version && isNewerVersion(version, app.getVersion()))?.version ?? null;
        if (ahead && ahead !== aheadVersion) {
          aheadVersion = ahead;
          updater.check();
        }
        // Someone may have changed the code, and it is what gets this member back in later.
        const saved = store.session;
        if (saved?.partyId === session.partyId && saved.code !== snapshot.code) {
          const updated = { ...saved, code: snapshot.code };
          store.update({
            session: updated,
            privateSession: store.privateSession?.partyId === saved.partyId ? updated : store.privateSession,
          });
        }
        cache.sync(session, snapshot.queue, new Set(snapshot.history.map(({ id }) => id)));
        syncGameFiles(session, snapshot.game);
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
    }, app.getVersion());
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
    speak?: boolean;
    scene?: SceneLayer[] | null;
    link?: MediaLink | null;
    to?: string[];
    jump?: boolean;
    game?: string;
    // Counted for the « Plus envoyés » order of the library, never sent.
    savedId?: string;
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
    const placed = input.layers.filter((layer) => !layer.link);
    const ids = [...new Set(placed.map(({ fileId }) => fileId)), ...(input.soundId ? [input.soundId] : [])];
    const files = ids.map((id) => sceneFiles.get(id));
    if (files.includes(undefined)) return null;
    return {
      files: (files as SavedFile[]).map(({ path, name, size, contentType }) => ({ path, name, size, contentType })),
      scene: input.layers.map(({ fileId, ...layer }) => ({ ...layer, file: layer.link ? 0 : ids.indexOf(fileId) })),
    };
  };

  const sendFiles = async (session: SessionResponse, files: SavedFile[], { savedId, ...timing }: Timing): Promise<ActionResult> => {
    const controller = new AbortController();
    const online = connection?.current().status === 'online';
    const current = { name: files.map(({ name }) => name).join(' + ') || 'Texte', percent: 0, paused: !online, controller };
    // A text normally leaves at once, so it only shows when it has to wait.
    if (files.length > 0 || !online) upload = current;
    publishState();

    const onPaused = (paused: boolean): void => {
      current.paused = paused;
      upload ??= current;
      publishState();
    };
    const created = await retryWhileOffline(
      () =>
        partyApi.createMedia(session, {
          ...timing,
          speak: timing.speak ?? false,
          scene: timing.scene ?? null,
          link: timing.link ?? null,
          to: timing.to ?? [],
          jump: timing.jump ?? false,
          game: timing.game ?? null,
          files: files.map(({ contentType, size, name }) => ({ contentType, size, name: name.slice(0, MAX_FILE_NAME_LENGTH) })),
        }),
      controller.signal,
      onPaused,
    );
    if (!created.ok || files.length === 0) {
      if (upload === current) upload = null;
      publishState();
      return created.ok ? { ok: true } : created;
    }

    const { mediaId, fileIds } = created.value;
    current.paused = false;

    // Before the last step: the service can announce the media before it answers that step.
    for (const [index, file] of files.entries()) {
      const fileId = fileIds[index]!;
      // A file sent for a game is shown from where it is, with the key the game looks it up by.
      if (timing.game) {
        gameFiles.add(fileId);
        cache.adopt(gameKey(fileId), fileId, file.path, file.contentType);
      } else cache.adopt(mediaId, fileId, file.path, file.contentType);
    }

    const totalBytes = files.reduce((total, { size }) => total + size, 0);
    let sentBytes = 0;
    let result: Awaited<ReturnType<typeof uploadFile>> = { ok: true, value: null };
    for (const [index, file] of files.entries()) {
      result = await uploadFile(session, fileIds[index]!, file.path, file.size, controller.signal, (percent) => {
        current.percent = Math.round(((sentBytes + (file.size * percent) / 100) / totalBytes) * 100);
        publishState();
      }, onPaused);
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
    if (!timing.game) library.countSent(files.map(({ path }) => path), savedId);
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

  const bringIn = (files: Incoming[], advanced: boolean): IncomingResult => {
    if (advanced) return { ok: true, scene: files.map((file) => putInScene(file)) };
    const sounds = files.filter(({ contentType }) => slotOf(contentType) === 'sound');
    if (sounds.length > 1 || files.length - sounds.length > 1) return { ok: false, error: 'too_many' };
    // Whatever arrives takes the place of its kind in what is being prepared.
    const kept = sounds.length > 0 ? draft.picture : draft.sound;
    const keptSize = files.length > 1 ? 0 : (kept?.size ?? 0);
    if (files.reduce((total, { size }) => total + size, keptSize) > MAX_MEDIA_BYTES) return { ok: false, error: 'too_large' };
    return { ok: true, drafts: files.map((file) => putInDraft(file)) };
  };

  const readFiles = async (paths: string[]): Promise<{ ok: true; files: Incoming[] } | { ok: false; error: IncomingError }> => {
    const files: Incoming[] = [];
    for (const path of paths) {
      const contentType = contentTypeOf(path);
      if (!contentType) return { ok: false, error: 'unsupported' };
      const info = await stat(path).catch(() => null);
      if (!info) return { ok: false, error: 'not_found' };
      if (info.size === 0) return { ok: false, error: 'empty' };
      if (info.size > MAX_MEDIA_BYTES) return { ok: false, error: 'too_large' };
      files.push({ path, name: basename(path), size: info.size, contentType });
    }
    return { ok: true, files };
  };

  const PATH_LIST = z.array(z.string()).min(1).max(20);

  handle(IpcChannel.PasteFiles, async (raw: unknown, advanced: unknown): Promise<IncomingResult> => {
    const paths = PATH_LIST.safeParse(raw);
    if (!paths.success) return { ok: false, error: 'unsupported' };
    const read = await readFiles(paths.data);
    return read.ok ? bringIn(read.files, advanced === true) : read;
  });

  handle(IpcChannel.PasteImage, async (bytes: unknown, contentType: unknown, name: unknown, advanced: unknown): Promise<IncomingResult> => {
    if (!(bytes instanceof Uint8Array) || typeof contentType !== 'string' || typeof name !== 'string') return { ok: false, error: 'unsupported' };
    const saved = await savePastedImage(bytes, contentType, name);
    return saved.ok ? bringIn([saved.file], advanced === true) : saved;
  });

  handle(IpcChannel.PasteLink, async (url: unknown, advanced: unknown): Promise<IncomingResult> => {
    if (typeof url !== 'string') return { ok: false, error: 'bad_link' };
    const found = findLink(url);
    if (found) return checkLink(found);
    const saved = await downloadLink(url);
    return saved.ok ? bringIn([saved.file], advanced === true) : saved;
  });

  handle(IpcChannel.SearchSoundCloud, (query: unknown) => {
    if (typeof query !== 'string' || !query.trim()) return;
    openSoundCloudSearch(query.trim().slice(0, 200), (url) => {
      const found = findLink(url);
      if (!found) return;
      void checkLink(found).then((result) => {
        if (controlWindow.isDestroyed()) return;
        showControlWindow();
        controlWindow.webContents.send(IpcChannel.LinkPicked, result);
      });
    });
  });

  // Windows starts the app once per selected file: the ones that arrive together make one LiveChat.
  const EXTERNAL_GATHER_MS = 400;
  let gathering: { mode: ExternalFiles['mode']; paths: string[] } | null = null;
  let gatherTimer: NodeJS.Timeout | undefined;
  let waitingExternal: { mode: ExternalFiles['mode']; paths: string[] } | null = null;
  let externalToSend: { files: Incoming[]; previewIds: string[] } | null = null;

  const noticeExternal = (argv: string[]): boolean => {
    const mode = argv.includes(SEND_ARG) ? 'send' : argv.includes(PREPARE_ARG) ? 'prepare' : null;
    if (!mode) return false;
    const paths = argv.slice(1).filter((arg) => !arg.startsWith('-') && contentTypeOf(arg));
    gathering = { mode, paths: [...new Set([...(gathering?.paths ?? []), ...paths])] };
    clearTimeout(gatherTimer);
    gatherTimer = setTimeout(() => {
      waitingExternal = gathering;
      gathering = null;
      if (waitingExternal?.mode === 'prepare') showControlWindow();
      if (!controlWindow.isDestroyed()) controlWindow.webContents.send(IpcChannel.ExternalFilesWaiting);
    }, EXTERNAL_GATHER_MS);
    return true;
  };

  handle(IpcChannel.TakeExternalFiles, async (advanced: unknown): Promise<ExternalFiles | null> => {
    const waiting = waitingExternal;
    waitingExternal = null;
    if (!waiting) return null;
    const read = await readFiles(waiting.paths);
    if (waiting.mode === 'prepare') return { mode: 'prepare', result: read.ok ? bringIn(read.files, advanced === true) : read };

    if (!read.ok) return { mode: 'send', error: read.error };
    const pictures = read.files.filter(({ contentType }) => slotOf(contentType) === 'picture');
    const sounds = read.files.filter(({ contentType }) => slotOf(contentType) === 'sound');
    if (read.files.length === 0) return { mode: 'send', error: 'unsupported' };
    if (pictures.length > 1 || sounds.length > 1) return { mode: 'send', error: 'too_many' };
    if (read.files.reduce((total, { size }) => total + size, 0) > MAX_MEDIA_BYTES) return { mode: 'send', error: 'too_large' };

    // Pictures first, as everywhere else: a video leads, and a sound leads beside a picture.
    const files = [...pictures, ...sounds];
    const previews = files.map((file) => registerMediaFile(file.path, file.contentType));
    externalToSend = { files, previewIds: previews.map(({ id }) => id) };
    const video = files.findIndex(({ contentType }) => fileKindOf(contentType) === 'video');
    const audio = files.findIndex(({ contentType }) => fileKindOf(contentType) === 'audio');
    const leader = video >= 0 ? video : audio >= 0 ? audio : 0;
    return { mode: 'send', leader: { kind: fileKindOf(files[leader]!.contentType), url: previews[leader]!.url } };
  });

  handle(IpcChannel.SendExternalFiles, async (durationMs: unknown): Promise<ActionResult> => {
    const sending = externalToSend;
    externalToSend = null;
    const session = store.session;
    let result: ActionResult = { ok: false, error: 'invalid_request' };
    if (!session) result = { ok: false, error: 'unauthorized' };
    else if (sending && !upload && typeof durationMs === 'number') {
      result = await sendFiles(session, sending.files, { caption: '', clipStartMs: 0, durationMs, videoMuted: false, soundMuted: false });
    }
    for (const id of sending?.previewIds ?? []) forgetMediaFile(id);
    if (!result.ok && result.error !== 'cancelled') showControlWindow();
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

  handle(IpcChannel.SetLibraryTags, (target: unknown, tags: unknown) => {
    const where = typeof target === 'object' && target !== null ? (target as Record<string, unknown>) : {};
    if (typeof where.fileId === 'string') library.setFileTags(where.fileId, tags);
    if (typeof where.savedId === 'string') library.setSavedTags(where.savedId, tags);
    return library.view();
  });

  handle(IpcChannel.UseLibraryFile, async (fileId: unknown) => {
    const file = typeof fileId === 'string' ? library.fileById(fileId) : null;
    const info = file && (await stat(file.path).catch(() => null));
    if (!file || !info) return { ok: false };
    return { ok: true, draft: putInDraft({ ...file, size: info.size }) };
  });

  type MenuLine<Action> = { label: string; enabled?: boolean } & ({ action: Action } | { run: () => void } | { submenu: Array<MenuLine<Action>> });

  // Answers with the line chosen. The menu can say it closed just before the click arrives, so closing decides nothing at once.
  const chooseFromMenu = <Action>(groups: Array<Array<MenuLine<Action>>>) =>
    new Promise<Action | null>((resolve) => {
      const toItem = (line: MenuLine<Action>): MenuItemConstructorOptions =>
        'submenu' in line
          ? { label: line.label, enabled: line.enabled ?? true, submenu: line.submenu.map(toItem) }
          : {
              label: line.label,
              enabled: line.enabled ?? true,
              click: () => {
                if ('run' in line) line.run();
                resolve('action' in line ? line.action : null);
              },
            };
      const lines = groups
        .filter((group) => group.length > 0)
        .flatMap((group, index) => [...(index > 0 ? [{ type: 'separator' as const }] : []), ...group.map(toItem)]);
      Menu.buildFromTemplate(lines).popup({ window: controlWindow, callback: () => setTimeout(() => resolve(null), 1_000) });
    });

  const shortcutLines = <Action>(current: string | null, ask: Action): Array<MenuLine<Action>> => [
    { label: current ? `Changer le raccourci (${keyLabel(current)})` : 'Donner un raccourci…', action: ask },
    ...(current
      ? [
          {
            label: 'Retirer le raccourci',
            run: () => {
              library.clearShortcut(current);
              syncShortcuts();
              publishState();
            },
          },
        ]
      : []),
  ];

  const shortcutFeedback = (sent: boolean): void => {
    if (!settings.current.clean && !controlWindow.isDestroyed()) controlWindow.webContents.send(IpcChannel.ShortcutFeedback, sent);
  };

  const sendTarget = async (target: ReturnType<typeof library.shortcutTarget>): Promise<boolean> => {
    // A key held down, or pressed twice by accident, sends once.
    if (Date.now() - lastShortcutAt < SHORTCUT_COOLDOWN_MS) return false;
    lastShortcutAt = Date.now();

    const session = store.session;
    if (!session || !target || upload) {
      shortcutFeedback(false);
      return false;
    }

    let result: ActionResult = { ok: false, error: 'not_found' };
    const jump = settings.current.keyWhilePlaying === 'replace';
    if (target.kind === 'saved') {
      const saved = library.savedById(target.id);
      if (saved && (await library.allThere(saved))) result = await sendFiles(session, saved.files, { ...saved, jump, savedId: saved.id });
    } else {
      const info = await stat(target.path).catch(() => null);
      const contentType = contentTypeOf(target.path);
      if (info && contentType) {
        const file = { path: target.path, name: basename(target.path), size: info.size, contentType };
        const { durationMs } = target;
        result = await sendFiles(session, [file], { caption: '', clipStartMs: 0, durationMs, videoMuted: false, soundMuted: false, jump });
      }
    }
    shortcutFeedback(result.ok);
    return result.ok;
  };

  const closeWheel = (): void => {
    if (!wheelOpen) return;
    wheelOpen = null;
    clearTimeout(wheelTimer);
    if (!stageWindow.isDestroyed()) stageWindow.setIgnoreMouseEvents(true);
    publishState();
    syncOverlay();
  };

  const keepWheelOpen = (): void => {
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(closeWheel, WHEEL_OPEN_MS);
  };

  const openWheel = (preview: boolean): void => {
    if (stageWindow.isDestroyed() || (settings.current.clean && !preview)) return;
    wheelOpen = { preview };
    // For as long as it is there, the overlay catches the mouse instead of letting it through.
    stageWindow.setIgnoreMouseEvents(false);
    keepWheelOpen();
    publishState();
    syncOverlay();
  };

  const setClean = (clean: boolean): void => {
    settings.update({ clean });
    if (clean) {
      stopLocalReplay();
      clearTimeout(overlayTestTimer);
      overlayTest = false;
    }
    publishState();
  };

  const skipForMe = (mediaId: string): void => {
    skippedHere.add(mediaId);
    publishState();
  };

  // A key is only taken from games while it does something here.
  const syncShortcuts = (): void => {
    globalShortcut.unregisterAll();
    const { cleanKey, skipKey, skipMineKey, wheelKey } = settings.current;
    const actions: Array<[string | null, string, () => void]> = [
      [cleanKey, ACTION_NAMES.cleanKey, () => setClean(!settings.current.clean)],
      [
        skipKey,
        ACTION_NAMES.skipKey,
        () => {
          const head = connection?.current().queue[0];
          if (head) connection?.skip(head.id);
          shortcutFeedback(head !== undefined);
        },
      ],
      [
        skipMineKey,
        ACTION_NAMES.skipMineKey,
        () => {
          const head = connection?.current().queue[0];
          if (head) skipForMe(head.id);
          shortcutFeedback(head !== undefined);
        },
      ],
      [wheelKey, ACTION_NAMES.wheelKey, () => (wheelOpen ? closeWheel() : openWheel(false))],
      ...library.shortcutKeys().map((key): [string, string, () => void] => [key, library.shortcutName(key), () => void sendTarget(library.shortcutTarget(key))]),
    ];
    const wanted = actions.filter((action): action is [string, string, () => void] => action[0] !== null);
    unavailableKeys = wanted
      .filter(([key, name, run]) => {
        const onPress = () => {
          if (!keyTest) {
            run();
            return;
          }
          keyTest = { heard: `${keyLabel(key)} : ${name}` };
          shortcutFeedback(true);
          publishState();
        };
        try {
          return !globalShortcut.register(key, onPress);
        } catch {
          return true;
        }
      })
      .map(([key]) => key);
  };

  // Is it ours already, or can it be? Another app may be holding it.
  const canUseKey = (key: string): boolean => {
    try {
      if (globalShortcut.isRegistered(key)) return true;
      const free = globalShortcut.register(key, () => {});
      if (free) globalShortcut.unregister(key);
      return free;
    } catch {
      return false;
    }
  };

  // Whatever had this key gives it up.
  const freeKey = (key: string, except?: ActionKey): string | null => {
    for (const which of ACTION_KEYS) {
      if (which !== except && settings.current[which] === key) {
        settings.update({ [which]: null });
        return ACTION_NAMES[which];
      }
    }
    if (!library.shortcutTarget(key)) return null;
    const name = library.shortcutName(key);
    library.clearShortcut(key);
    return name;
  };

  const giveKey = (key: string, target: NonNullable<ReturnType<typeof library.shortcutTarget>>): KeyChange => {
    if (!canUseKey(key)) return { ok: false };
    const same = JSON.stringify(library.shortcutTarget(key)) === JSON.stringify(target);
    const took = same ? null : freeKey(key);
    library.setShortcut(key, target);
    syncShortcuts();
    publishState();
    return { ok: true, took };
  };
  syncShortcuts();

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
      [
        { label: library.isFileFavorite(id) ? 'Retirer des favoris' : 'Épingler en favori', action: 'favorite' },
        ...shortcutLines<FileMenuAction>(library.shortcutOfFile(file.path), 'shortcut'),
      ],
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
    return { action, library: await library.view() };
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
      [
        { label: saved.favorite ? 'Retirer des favoris' : 'Épingler en favori', action: 'favorite' },
        ...shortcutLines<SavedMenuAction | 'delete'>(library.shortcutOfSaved(saved.id), 'shortcut'),
      ],
      saved.files.flatMap((file, index) =>
        there[index] ? [{ label: `Afficher ${file.name} dans l’Explorateur`, run: () => shell.showItemInFolder(file.path) }] : [],
      ),
      [{ label: 'Supprimer', action: 'delete' }],
    ]);
    if (action !== 'delete') return { action, library: await library.view() };

    const detail = saved.kept ? 'La copie gardée sur ce PC sera effacée.' : 'Tes fichiers ne bougent pas.';
    if (await confirmed(`Supprimer « ${saved.name} » ?`, detail, 'Supprimer')) library.deleteSaved(saved.id);
    syncShortcuts();
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
      `Tu pourras le récupérer depuis la ${process.platform === 'darwin' ? 'corbeille' : 'corbeille de Windows'}.`;
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

  // Nothing asked for: a picture, a video or a sound, whatever is chosen goes where it belongs.
  handle(IpcChannel.PickSceneFile, async (wanted: unknown): Promise<SceneResult> => {
    const slot: DraftSlot | null = wanted === 'sound' || wanted === 'picture' ? wanted : null;
    const picked = await dialog.showOpenDialog(controlWindow, {
      title: 'Choisir un média',
      properties: ['openFile'],
      filters: [
        {
          name: slot === 'sound' ? 'Sons' : slot ? 'Images et vidéos' : 'Images, vidéos et sons',
          extensions: Object.entries(CONTENT_TYPE_BY_EXTENSION)
            .filter(([, contentType]) => !slot || slotOf(contentType) === slot)
            .map(([extension]) => extension),
        },
      ],
    });
    const path = picked.filePaths[0];
    if (picked.canceled || !path) return { ok: false, error: 'cancelled' };
    const contentType = contentTypeOf(path);
    if (!contentType || (slot && slotOf(contentType) !== slot)) return { ok: false, error: 'unsupported' };
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
    // A link is not kept in the library.
    if (!input.success || !recipe || input.data.link) return { ok: false, error: 'invalid_request' };
    const { name, caption, clipStartMs, durationMs, videoMuted, soundMuted, speak } = input.data;
    await library.saveLiveChat({ name, caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, ...recipe });
    return { ok: true };
  });

  handle(IpcChannel.SaveLiveChat, async (raw: unknown): Promise<ActionResult> => {
    const input = SaveLiveChatInputSchema.safeParse(raw);
    if (!input.success) return { ok: false, error: 'invalid_request' };
    const { name, caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, withPicture, withSound } = input.data;

    const chosen = [withPicture ? draft.picture : null, withSound ? draft.sound : null].filter((file) => file !== null);
    const files = chosen.map(({ path, name: fileName, size, contentType }) => ({ path, name: fileName, size, contentType }));
    if (files.length === 0 && !caption.trim()) return { ok: false, error: 'invalid_request' };

    await library.saveLiveChat({ name, caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, files, scene: null });
    return { ok: true };
  });

  handle(IpcChannel.SendSaved, async (savedId: unknown): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };
    const saved = typeof savedId === 'string' ? library.savedById(savedId) : null;
    if (!saved || upload) return { ok: false, error: 'invalid_request' };
    // Never half of it: the button is already off, but a file can go missing while it is on screen.
    if (!(await library.allThere(saved))) return { ok: false, error: 'not_found' };
    return sendFiles(session, saved.files, { ...saved, savedId: saved.id });
  });

  const loadRecipe = (saved: StashedRecipe) => {
    if (saved.scene) {
      const { caption, clipStartMs, durationMs, videoMuted, soundMuted, speak } = saved;
      for (const id of [...sceneFiles.keys()]) forgetSceneFile(id);
      const files = saved.files.map((file) => putInScene(file));
      return {
        ok: true as const,
        scene: {
          caption,
          clipStartMs,
          durationMs,
          videoMuted,
          soundMuted,
          speak,
          files,
          layers: saved.scene.map(({ file, ...layer }) => ({ ...layer, fileId: files[file]!.id })),
          soundId: files.find(({ kind }) => kind === 'audio')?.id ?? null,
        },
      };
    }

    clearDraft('picture');
    clearDraft('sound');
    const loaded = saved.files.map((file) => putInDraft(file));
    const { caption, clipStartMs, durationMs, videoMuted, soundMuted, speak } = saved;
    return {
      ok: true as const,
      draft: {
        picture: loaded.find(({ kind }) => kind !== 'audio') ?? null,
        sound: loaded.find(({ kind }) => kind === 'audio') ?? null,
        caption,
        clipStartMs,
        durationMs,
        videoMuted,
        soundMuted,
        speak,
      },
    };
  };

  handle(IpcChannel.EditSaved, async (savedId: unknown) => {
    const saved = typeof savedId === 'string' ? library.savedById(savedId) : null;
    if (!saved || !(await library.allThere(saved))) return { ok: false };
    return loadRecipe(saved);
  });

  // A copy to rework: what played stays as it was, and nothing leaves without a click.
  handle(IpcChannel.EditHistory, async (rawId: unknown) => {
    const session = store.session;
    const item = connection?.current().history.find(({ id }) => id === rawId);
    if (!session || !item) return { ok: false };
    const key = randomUUID();
    try {
      if (!(await cache.fetchForMe(key, session, item.files))) return { ok: false };
      await mkdir(pastedFolder(), { recursive: true });
      const files: SavedFile[] = [];
      for (const { id: fileId, name, size, contentType } of item.files) {
        const path = join(pastedFolder(), `${randomUUID()}.${extensionOf(contentType)}`);
        if (!(await cache.moveOut(key, fileId, path))) return { ok: false };
        // Written by someone else, and this name can end up in a path.
        files.push({ path, name: name.replace(/[\\/]/g, '_'), size, contentType });
      }
      const { caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, scene } = item;
      return loadRecipe({ caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, scene, files });
    } catch {
      return { ok: false };
    } finally {
      cache.forget(key);
    }
  });

  handle(IpcChannel.StashView, (view: unknown) => {
    if (typeof view !== 'string') return;
    stashed.view = view;
    writeRestartStash(stashed);
  });

  handle(IpcChannel.StashDraft, (advanced: unknown, raw: unknown) => {
    stashed.recipe = null;
    if (advanced === true) {
      const input = SceneInputSchema.safeParse(raw);
      const recipe = input.success ? sceneRecipe(input.data) : null;
      if (input.success && recipe) {
        const { soundId: _soundId, layers: _layers, to: _to, link: _link, ...timing } = input.data;
        stashed.recipe = { ...timing, files: recipe.files, scene: recipe.scene.filter((layer) => !layer.link) };
        if (stashed.recipe.scene?.length === 0) stashed.recipe.scene = null;
      }
    } else {
      const input = SendMediaInputSchema.safeParse(raw);
      if (input.success) {
        // A link is quick to paste again, and has no file to come back with.
        const { withPicture, withSound, link: _link, to: _to, ...timing } = input.data;
        const chosen = [withPicture ? draft.picture : null, withSound ? draft.sound : null].filter((file) => file !== null);
        const files = chosen.map(({ path, name, size, contentType }) => ({ path, name, size, contentType }));
        stashed.recipe = { ...timing, files, scene: null };
      }
    }
    if (stashed.recipe?.files.length === 0 && !stashed.recipe.caption.trim()) stashed.recipe = null;
    writeRestartStash(stashed);
  });

  handle(IpcChannel.TakeRestartStash, async () => {
    const recipe = restartStash?.recipe;
    const loaded = recipe && (await library.allThere(recipe)) ? loadRecipe(recipe) : null;
    return { view: restartStash?.view ?? null, loaded };
  });

  handle(IpcChannel.SetClean, (clean: unknown) => setClean(clean === true));

  handle(IpcChannel.SetActionKey, (rawWhich: unknown, key: unknown): KeyChange => {
    const which = rawWhich as ActionKey;
    if (!ACTION_KEYS.includes(which) || (key !== null && typeof key !== 'string')) return { ok: false };
    if (key !== null && !canUseKey(key)) return { ok: false };
    const took = key === null ? null : freeKey(key, which);
    settings.update({ [which]: key });
    syncShortcuts();
    publishState();
    return { ok: true, took };
  });

  handle(IpcChannel.ShowMemberMenu, (memberId: unknown) => {
    const member = connection?.current().members.find(({ id }) => id === memberId);
    if (!member || member.id === connection?.current().memberId) return null;
    return chooseFromMenu<IgnoreChoice>([
      [
        { label: `Ignorer ${member.name} 10 minutes`, action: '10min' },
        { label: `Ignorer ${member.name} 1 heure`, action: '1h' },
        { label: `Ignorer ${member.name} jusqu’à la fermeture de l’app`, action: 'close' },
      ],
      [{ label: 'Ne plus ignorer', action: 'stop', enabled: isIgnored(member.id) }],
    ]);
  });

  handle(IpcChannel.IgnoreMember, (memberId: unknown, choice: unknown) => {
    if (typeof memberId !== 'string' || memberId === connection?.current().memberId) return;
    const { [memberId]: _before, ...others } = settings.current.ignored;
    const until = choice === '10min' ? Date.now() + 10 * 60_000 : choice === '1h' ? Date.now() + 60 * 60_000 : null;
    settings.update({ ignored: choice === 'stop' ? others : { ...others, [memberId]: until } });
    publishState();
  });

  handle(IpcChannel.AssignFileShortcut, async (fileId: unknown, key: unknown, durationMs: unknown) => {
    const file = typeof fileId === 'string' ? library.fileById(fileId) : null;
    const change: KeyChange =
      file && typeof key === 'string' && typeof durationMs === 'number' ? giveKey(key, { kind: 'file', path: file.path, durationMs }) : { ok: false };
    return { library: await library.view(), change };
  });

  handle(IpcChannel.AssignSavedShortcut, async (savedId: unknown, key: unknown) => {
    const change: KeyChange =
      typeof savedId === 'string' && library.savedById(savedId) && typeof key === 'string' ? giveKey(key, { kind: 'saved', id: savedId }) : { ok: false };
    return { library: await library.view(), change };
  });

  handle(IpcChannel.ChangeShortcutKey, (key: unknown, next: unknown): KeyChange => {
    const target = typeof key === 'string' ? library.shortcutTarget(key) : null;
    return target && typeof next === 'string' ? giveKey(next, target) : { ok: false };
  });

  handle(IpcChannel.TestKeys, (on: unknown) => {
    clearTimeout(keyTestTimer);
    keyTest = on === true ? { heard: null } : null;
    if (keyTest) {
      keyTestTimer = setTimeout(() => {
        keyTest = null;
        publishState();
      }, KEY_TEST_MS);
    }
    publishState();
  });

  handle(IpcChannel.ResetKeys, () => {
    const { cleanKey, skipKey, skipMineKey, wheelKey } = DEFAULT_SETTINGS;
    settings.update({ cleanKey, skipKey, skipMineKey, wheelKey });
    library.clearShortcuts();
    syncShortcuts();
    publishState();
  });

  handle(IpcChannel.SetWheelSlot, (rawIndex: unknown, rawChoice: unknown) => {
    const index = typeof rawIndex === 'number' && Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < WHEEL_SIZE ? rawIndex : null;
    const choice = WheelChoiceSchema.nullable().safeParse(rawChoice);
    if (index === null || !choice.success) return;
    if (choice.data === null) library.setWheel(index, null);
    else if (choice.data.kind === 'saved') {
      if (library.savedById(choice.data.id)) library.setWheel(index, { kind: 'saved', id: choice.data.id });
    } else {
      const file = library.fileById(choice.data.fileId);
      if (file) library.setWheel(index, { kind: 'file', path: file.path, durationMs: choice.data.durationMs });
    }
    publishState();
  });

  handle(IpcChannel.PreviewWheel, () => openWheel(true));
  handle(IpcChannel.CloseWheel, closeWheel);
  handle(IpcChannel.WheelActivity, () => {
    if (wheelOpen) keepWheelOpen();
  });
  handle(IpcChannel.PickWheel, async (index: unknown) => {
    const preview = wheelOpen?.preview ?? true;
    closeWheel();
    if (preview || typeof index !== 'number') return;
    const name = library.wheelName(index);
    if (await sendTarget(library.wheelTarget(index))) {
      wheelLast = name;
      publishState();
    }
  });

  handle(IpcChannel.ClearShortcut, (key: unknown) => {
    if (typeof key === 'string') library.clearShortcut(key);
    syncShortcuts();
    publishState();
  });

  handle(IpcChannel.CheckForUpdates, () => updater.checkNow());

  handle(IpcChannel.MarkNotesSeen, () => {
    settings.update({ seenVersion: app.getVersion() });
    publishState();
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
    syncShortcuts();
    publishState();
    return library.view();
  });

  handle(IpcChannel.CancelUpload, () => upload?.controller.abort());

  handle(IpcChannel.SkipMediaForMe, (mediaId: unknown) => {
    if (typeof mediaId === 'string') skipForMe(mediaId);
  });

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
    }, LOCAL_REPLAY_LEAD_MS + Math.min(replay.item.durationMs, maxDurationMs() ?? Infinity));
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

      const { caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, scene, senderName, senderAvatarUrl } = item;
      const name = caption.split('\n')[0]!.trim().slice(0, 60) || item.files[0]?.name.replace(/\.[^.]*$/, '') || 'LiveChat';
      await library.keepFromHistory(
        id,
        { name, caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, scene, files },
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
    if (settings.current.clean || connection?.current().queue[0]?.startAt != null) return { ok: true };

    stopLocalReplay();
    const key = randomUUID();
    const files = saved.files.map(({ name, size, contentType }) => ({ id: randomUUID(), name, size, contentType }));
    for (const [index, file] of saved.files.entries()) cache.adopt(key, files[index]!.id, file.path, file.contentType);

    const { caption, clipStartMs, durationMs, videoMuted, soundMuted, speak, scene, savedAt, kept } = saved;
    const item: HistoryItem = {
      id: saved.id,
      files,
      to: [],
      senderId: '',
      senderName: kept.senderName,
      senderAvatarUrl: kept.senderAvatarUrl,
      kind: mediaKindOf(saved.files),
      caption,
      clipStartMs,
      durationMs,
      videoMuted,
      soundMuted,
      speak,
      scene,
      link: null,
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
    if (settings.current.clean || connection?.current().queue[0]?.startAt != null) return { ok: true };

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

  handle(IpcChannel.StartPoll, (question: unknown, options: unknown) => {
    const request = PollRequestSchema.safeParse({ question, options });
    if (request.success) connection?.startPoll(request.data.question, request.data.options);
  });

  handle(IpcChannel.ListApps, () => openApps());

  handle(IpcChannel.VotePoll, (pollId: unknown, choice: unknown) => {
    if (typeof pollId === 'string' && typeof choice === 'number' && Number.isInteger(choice)) connection?.vote(pollId, choice);
  });

  handle(IpcChannel.StartGame, (kind: unknown) => {
    const parsed = GameKindSchema.safeParse(kind);
    if (parsed.success) connection?.startGame(parsed.data);
  });

  handle(IpcChannel.GameSay, (gameId: unknown, text: unknown) => {
    if (typeof gameId !== 'string' || typeof text !== 'string') return;
    const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, MAX_GAME_TEXT_LENGTH);
    if (cleaned) connection?.gameSay(gameId, cleaned);
  });

  handle(IpcChannel.GameVote, (gameId: unknown, choice: unknown) => {
    if (typeof gameId === 'string' && typeof choice === 'string') connection?.gameVote(gameId, choice);
  });

  handle(IpcChannel.StopGame, (gameId: unknown) => {
    if (typeof gameId === 'string') connection?.stopGame(gameId);
  });

  const sendForGame = async (gameId: string, files: SavedFile[], caption: string): Promise<ActionResult> => {
    const session = store.session;
    if (!session) return { ok: false, error: 'unauthorized' };
    gameSending += Math.max(1, files.length);
    publishState();
    const result = await sendFiles(session, files, {
      caption,
      clipStartMs: 0,
      durationMs: DEFAULT_DISPLAY_MS,
      videoMuted: false,
      soundMuted: false,
      game: gameId,
    });
    gameSending -= Math.max(1, files.length);
    publishState();
    return result;
  };

  handle(IpcChannel.SendGameFiles, async (gameId: unknown): Promise<GameSendResult> => {
    const game = connection?.current().game;
    if (typeof gameId !== 'string' || game?.id !== gameId || game.phase !== 'collect') return { ok: false, error: 'invalid_request' };
    const picturesOnly = game.kind === 'joke' || game.kind === 'undercover';
    const left = GAME_ENTRIES_PER_PLAYER[game.kind] - game.mySent - gameSending;
    if (left <= 0) return { ok: true };
    const extensions = Object.entries(CONTENT_TYPE_BY_EXTENSION)
      .filter(([, contentType]) => (picturesOnly ? fileKindOf(contentType) === 'image' : true))
      .map(([extension]) => extension);
    const picked = await dialog.showOpenDialog(controlWindow, {
      title: picturesOnly ? 'Choisir des images' : 'Choisir un LiveChat',
      properties: left > 1 ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: picturesOnly ? 'Images' : 'Images, vidéos et sons', extensions }],
    });
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, error: 'cancelled' };

    const chosen: SavedFile[] = [];
    for (const path of picked.filePaths.slice(0, left)) {
      const contentType = contentTypeOf(path);
      if (!contentType || (picturesOnly && fileKindOf(contentType) !== 'image')) return { ok: false, error: 'unsupported' };
      const { size } = await stat(path);
      if (size === 0) return { ok: false, error: 'empty' };
      if (size > MAX_MEDIA_BYTES) return { ok: false, error: 'too_large' };
      chosen.push({ path, name: basename(path), size, contentType });
    }
    // One entry per picture, sent side by side.
    const results = await Promise.all(chosen.map((file) => sendForGame(gameId, [file], '')));
    return results.find((result) => !result.ok) ?? { ok: true };
  });

  handle(IpcChannel.SendGameText, (gameId: unknown, text: unknown): Promise<ActionResult> | ActionResult => {
    if (typeof gameId !== 'string' || typeof text !== 'string') return { ok: false, error: 'invalid_request' };
    const caption = text.trim().slice(0, MAX_CAPTION_LENGTH);
    if (!caption) return { ok: false, error: 'invalid_request' };
    return sendForGame(gameId, [], caption);
  });

  // The ring around the sender's picture in the app moves with what the overlay hears.
  ipcMain.on(IpcChannel.SoundLevel, (event, level: unknown) => {
    if (event.sender !== stageWindow.webContents || typeof level !== 'number' || controlWindow.isDestroyed()) return;
    controlWindow.webContents.send(IpcChannel.LiveLevel, Math.min(1, Math.max(0, level)));
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
    globalShortcut.unregisterAll();
    login?.abort();
    connection?.stop();
    gameWatch.stop();
    settings.flush();
    tray.destroy();
  });
  // Timers stood still and the network is back from nothing: no need to wait for the silence to be noticed.
  powerMonitor.on('resume', () => {
    const status = connection?.current().status;
    if (status === 'online' || status === 'reconnecting') connection?.reconnectNow();
    updater.check();
  });
  // On a Mac, clicking the Dock is how the closed window comes back.
  app.on('activate', () => showControlWindow());
  app.on('second-instance', (_event, argv) => {
    if (!noticeExternal(argv)) showControlWindow();
  });
  noticeExternal(process.argv);
  void registerExplorerMenu();
  void offerApplicationsFolder();
  void cleanPasted((path) => library.usesPath(path));

  applyLaunchAtStartup();

  if (store.login) {
    void refreshGuilds();
    const saved = store.session;
    if (saved) connectTo(saved);
  }

  updater.start();
}
