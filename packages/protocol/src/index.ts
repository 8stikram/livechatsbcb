import { z } from 'zod';

export const PROTOCOL_VERSION = 8;
export const WS_SUBPROTOCOL = `livechatsbcb.v${PROTOCOL_VERSION}`;
export const WS_SUBPROTOCOL_PREFIX = 'livechatsbcb.v';
export const WS_TOKEN_PREFIX = 'token.';
// Which version of the app is connecting, so that the others can tell when theirs is behind.
export const WS_APP_PREFIX = 'app.';
// Offered by apps that know the game lobby (0.22.0 and later). Older ones are not shown it.
export const WS_LOBBY = 'feature.lobby';

export const MAX_ONLINE_MEMBERS = 15;
export const MAX_REGISTERED_MEMBERS = 30;

export const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
// In the advanced mode: 5 pictures, 3 videos and a sound. Otherwise, a picture or a video, and a sound.
export const MAX_SCENE_PICTURES = 5;
export const MAX_SCENE_VIDEOS = 3;
export const MAX_MEDIA_FILES = MAX_SCENE_PICTURES + MAX_SCENE_VIDEOS + 1;
// R2 needs every part of an upload but the last to be the same size, and at least 5 MiB.
export const MEDIA_PART_BYTES = 8 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 300;
export const MAX_FILE_NAME_LENGTH = 200;
export const MAX_QUEUE_LENGTH = 50;
// The same LiveChat this many times in the window, and that person sends nothing for a while.
export const SPAM_SENDS = 5;
export const SPAM_WINDOW_MS = 60_000;
export const SPAM_BAN_MS = 30 * 60_000;
export const MAX_HISTORY_LENGTH = 50;
export const MIN_DISPLAY_MS = 1_000;
export const DEFAULT_DISPLAY_MS = 5_000;
export const MAX_DISPLAY_MS = 60_000;
export const MAX_CLIP_MS = 60 * 60_000;
export const MAX_NOTE_LENGTH = 60;
export const MAX_GAME_NAME_LENGTH = 40;
export const POLL_MS = 30_000;
export const MAX_POLL_QUESTION_LENGTH = 100;
export const MAX_POLL_OPTION_LENGTH = 40;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 4;

export const mediaPartCount = (size: number): number => Math.ceil(size / MEDIA_PART_BYTES);
export const mediaPartBytes = (size: number, part: number): number =>
  part < mediaPartCount(size) ? MEDIA_PART_BYTES : size - (part - 1) * MEDIA_PART_BYTES;

// No 0/O, 1/I/L or U, so a code survives being read aloud.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 6;

export const WS_PING = '{"t":"ping"}';
export const WS_PONG = '{"t":"pong"}';

export const CloseCode = {
  Unauthorized: 4001,
  Replaced: 4002,
  PartyFull: 4003,
  UpdateRequired: 4004,
  Removed: 4005,
} as const;

export const normalizeCode = (input: string): string => input.toUpperCase().replace(/[^0-9A-Z]/g, '');

export const CodeSchema = z
  .string()
  .transform(normalizeCode)
  .refine((code) => code.length === CODE_LENGTH && [...code].every((char) => CODE_ALPHABET.includes(char)));

export const JoinPartyRequestSchema = z.object({ code: CodeSchema });

// The only host the overlay may load a picture from: it shows them above whatever the member is doing.
export const DISCORD_IMAGE_ORIGIN = 'https://cdn.discordapp.com';
const ImageUrlSchema = z.string().startsWith(`${DISCORD_IMAGE_ORIGIN}/`);

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: ImageUrlSchema.nullable(),
});
export type Account = z.infer<typeof AccountSchema>;

// A SHA-256 in base64url. The app keeps what it hashes, and needs it to collect the result of a login.
export const AuthStartRequestSchema = z.object({
  challenge: z.string().regex(/^[\w-]{43}$/),
  port: z.number().int().min(1024).max(65_535),
});
export const AuthStartResponseSchema = z.object({ url: z.string() });
export const AuthRedeemRequestSchema = z.object({
  ticket: z.string().min(1).max(128),
  verifier: z.string().min(43).max(128),
});
export const AuthRedeemResponseSchema = z.object({ token: z.string(), account: AccountSchema });
export type AuthRedeemResponse = z.infer<typeof AuthRedeemResponseSchema>;

export const GuildSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  iconUrl: ImageUrlSchema.nullable(),
});
export type GuildSummary = z.infer<typeof GuildSummarySchema>;

export const MeResponseSchema = z.object({
  account: AccountSchema,
  guilds: z.array(GuildSummarySchema),
  // Discord didn't answer, so this is the list from earlier, if there is one.
  partial: z.boolean(),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const SessionResponseSchema = z.object({
  partyId: z.string(),
  // A party is either private, entered with a code, or that of a Discord server.
  code: z.string().nullable(),
  guild: GuildSummarySchema.nullable(),
  memberId: z.string(),
  token: z.string(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const RotateCodeResponseSchema = z.object({ code: z.string() });

export const ApiErrorCodeSchema = z.enum([
  'invalid_request',
  'code_not_found',
  'party_full',
  'rate_limited',
  'unauthorized',
  // The account is no longer valid: only logging in again helps.
  'signed_out',
  'forbidden',
  'discord_unavailable',
  'not_found',
  'storage_full',
  'queue_full',
  'banned',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export const ApiErrorSchema = z.object({ error: ApiErrorCodeSchema });

export const ActivitySchema = z.enum(['here', 'playing', 'away', 'panic']);
export type Activity = z.infer<typeof ActivitySchema>;

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: ImageUrlSchema.nullable(),
  online: z.boolean(),
  // On the service's clock. Null for someone free to send.
  bannedUntil: z.number().nullable(),
  // Null when offline, or for an app too old to say.
  version: z.string().nullable().default(null),
  // Found by the app itself: playing a game in full screen, away from the PC, or with everything hidden.
  activity: ActivitySchema.default('here'),
  // A few words of their own.
  note: z.string().max(MAX_NOTE_LENGTH).default(''),
  // LiveChats sent to everybody since midnight, in France.
  sentToday: z.number().int().min(0).default(0),
  // The game they play, when they let it show. Null otherwise, or from an app too old to say.
  game: z.string().nullable().default(null),
  // When they started that game, on the service's clock.
  playingSince: z.number().nullable().default(null),
});
export type Member = z.infer<typeof MemberSchema>;


export const MediaContentTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/mp4',
  'audio/flac',
]);
export type MediaContentType = z.infer<typeof MediaContentTypeSchema>;

export type FileKind = 'image' | 'video' | 'audio';
export type MediaKind = FileKind | 'text';
export const fileKindOf = (contentType: MediaContentType): FileKind => contentType.split('/')[0] as FileKind;

type WithType = { contentType: MediaContentType };

// Whatever is on screen. A video sets the passage and the duration. Otherwise, a sound beside the picture does.
// In the advanced mode there can be several pictures, and a video among them is what plays.
export const pictureOf = <File extends WithType>(files: File[]): File | null =>
  files.find(({ contentType }) => fileKindOf(contentType) === 'video') ??
  files.find(({ contentType }) => fileKindOf(contentType) === 'image') ??
  null;
export const soundOf = <File extends WithType>(files: File[]): File | null =>
  files.find(({ contentType }) => fileKindOf(contentType) === 'audio') ?? null;

export const mediaKindOf = (files: WithType[]): MediaKind => {
  const file = pictureOf(files) ?? soundOf(files);
  return file ? fileKindOf(file.contentType) : 'text';
};

export const fileNamesOf = (files: { name: string }[]): string | null =>
  files.length > 0 ? files.map(({ name }) => name).join(' + ') : null;

const SceneMotionSchema = z.enum(['none', 'pop', 'fade', 'slide']);
export type SceneMotion = z.infer<typeof SceneMotionSchema>;

// One picture placed on the whole screen, in percent of it. Its height follows from its proportions, so no screen stretches it.
export const SceneLayerSchema = z.object({
  file: z.number().int().min(0).max(MAX_MEDIA_FILES - 1),
  x: z.number().min(-50).max(150),
  y: z.number().min(-50).max(150),
  width: z.number().min(2).max(300),
  aspect: z.number().min(0.05).max(20),
  rotation: z.number().min(-360).max(360),
  flip: z.boolean(),
  grayscale: z.boolean(),
  // In percent of the width of the screen.
  blur: z.number().min(0).max(3),
  // Turns per minute, negative the other way.
  spinRpm: z.number().int().min(-120).max(120),
  enter: SceneMotionSchema,
  exit: SceneMotionSchema,
  // A video has its own passage and its own sound. Saved before they did, it follows the LiveChat.
  clipStartMs: z.number().int().min(0).max(24 * MAX_CLIP_MS).optional(),
  clipMs: z.number().int().min(MIN_DISPLAY_MS).max(MAX_CLIP_MS).optional(),
  muted: z.boolean().default(false),
  // The player of the link, placed like a picture. Its file is then meaningless.
  link: z.literal(true).optional(),
});
export type SceneLayer = z.infer<typeof SceneLayerSchema>;

// From the back to the front. The same file can be there twice, and is only sent once.
const SceneSchema = z.array(SceneLayerSchema).min(1).max(MAX_SCENE_PICTURES + MAX_SCENE_VIDEOS).nullable();

const isValidScene = (all: SceneLayer[], files: WithType[], withLink: boolean): boolean => {
  const links = all.filter((layer) => layer.link).length;
  const scene = all.filter((layer) => !layer.link);
  const kindOfLayer = (layer: SceneLayer) => {
    const file = files[layer.file];
    return file ? fileKindOf(file.contentType) : null;
  };
  const kinds = scene.map(kindOfLayer);
  // A link has its own sound and its own passage: only pictures go around it.
  if (withLink ? links !== 1 || files.some(({ contentType }) => fileKindOf(contentType) !== 'image') : links !== 0) return false;
  const used = new Set(scene.map((layer) => layer.file));
  const unused = files.filter((file, index) => !used.has(index) && fileKindOf(file.contentType) !== 'audio');
  return (
    !kinds.includes(null) &&
    !kinds.includes('audio') &&
    unused.length === 0 &&
    kinds.filter((kind) => kind === 'image').length <= MAX_SCENE_PICTURES &&
    kinds.filter((kind) => kind === 'video').length <= MAX_SCENE_VIDEOS &&
    files.filter(({ contentType }) => fileKindOf(contentType) === 'audio').length <= 1 &&
    // Blur is what costs the most on a PC that is playing.
    all.filter(({ blur }) => blur > 0).length <= 1
  );
};

// A video or a sound on another site, played by that site's own player: no file, and nothing stored.
const LINK_IDS = {
  youtube: /^[\w-]{11}$/,
  tiktok: /^\d{1,30}$/,
  soundcloud: /^[\w-]{1,100}\/[\w-]{1,100}$/,
} as const;

export const MediaLinkSchema = z
  .object({
    site: z.enum(['youtube', 'tiktok', 'soundcloud']),
    id: z.string(),
    title: z.string().trim().min(1).max(MAX_FILE_NAME_LENGTH),
    volume: z.number().int().min(0).max(100).default(100),
  })
  .refine(({ site, id }) => LINK_IDS[site].test(id));
export type MediaLink = z.infer<typeof MediaLinkSchema>;

export const linkKindOf = ({ site }: Pick<MediaLink, 'site'>): 'video' | 'audio' => (site === 'soundcloud' ? 'audio' : 'video');

export const MediaDraftSchema = z
  .object({
    caption: z.string().trim().max(MAX_CAPTION_LENGTH),
    clipStartMs: z.number().int().min(0).max(24 * MAX_CLIP_MS),
    durationMs: z.number().int().min(MIN_DISPLAY_MS).max(MAX_CLIP_MS),
    // With a video and a sound together, whoever sends chooses which of the two is heard: one, both or neither.
    videoMuted: z.boolean().default(false),
    soundMuted: z.boolean().default(false),
    // Read aloud on each PC, in that PC's own voice.
    speak: z.boolean().default(false),
    scene: SceneSchema.default(null),
    link: MediaLinkSchema.nullable().default(null),
    // Only for these members, and nobody else ever knows. Empty is for everybody.
    to: z.array(z.string().min(1).max(64)).max(MAX_ONLINE_MEMBERS).default([]),
    // Sent with a key during another one: that one stops for everybody, and this one plays at once.
    jump: z.boolean().default(false),
    // Sent for a party game: it goes to the game, never in the queue.
    game: z.string().min(1).max(64).nullable().default(null),
    files: z
      .array(
        z.object({
          contentType: MediaContentTypeSchema,
          size: z.number().int().positive().max(MAX_MEDIA_BYTES),
          name: z.string().trim().min(1).max(MAX_FILE_NAME_LENGTH),
        }),
      )
      .max(MAX_MEDIA_FILES),
  })
  .refine((draft) => draft.files.length > 0 || draft.caption.length > 0 || draft.link !== null)
  .refine(({ link, files, scene }) => link === null || scene !== null || files.length === 0)
  .refine(({ game, link, scene, to, jump }) => game === null || (link === null && scene === null && to.length === 0 && !jump))
  .refine((draft) => draft.files.reduce((total, { size }) => total + size, 0) <= MAX_MEDIA_BYTES)
  .refine(({ scene, files, ...draft }) => {
    if (scene) return isValidScene(scene, files, draft.link !== null);
    // Two files are one to look at and one to listen to, never two of the same.
    return files.length <= 2 && (files.length < 2 || (pictureOf(files) !== null && soundOf(files) !== null));
  })
  .refine((draft) => {
    const plays = draft.files.some(({ contentType }) => fileKindOf(contentType) !== 'image');
    return plays || draft.link !== null || (draft.clipStartMs === 0 && draft.durationMs <= MAX_DISPLAY_MS);
  });
export type MediaDraft = z.infer<typeof MediaDraftSchema>;

// The media takes the name of its first file. Parts and the end of the upload are then sent file by file.
export const CreateMediaResponseSchema = z.object({ mediaId: z.string(), fileIds: z.array(z.uuid()) });
export type CreateMediaResponse = z.infer<typeof CreateMediaResponseSchema>;

export const UploadedPartSchema = z.object({ partNumber: z.number().int().positive(), etag: z.string() });
export type UploadedPart = z.infer<typeof UploadedPartSchema>;

export const CompleteMediaRequestSchema = z.object({
  parts: z.array(UploadedPartSchema).min(1).max(mediaPartCount(MAX_MEDIA_BYTES)),
});

export const QueueItemSchema = z.object({
  // A UUID, because the app names a file after it.
  id: z.uuid(),
  // The stored files, which playing something again shares with the first time: nothing is uploaded twice.
  files: z.array(z.object({ id: z.uuid(), name: z.string(), contentType: MediaContentTypeSchema, size: z.number() })),
  // Asked for again from the history, by whoever is named as the sender.
  replay: z.boolean(),
  senderId: z.string(),
  senderName: z.string(),
  senderAvatarUrl: ImageUrlSchema.nullable(),
  kind: z.enum(['image', 'video', 'audio', 'text']),
  caption: z.string(),
  clipStartMs: z.number(),
  durationMs: z.number(),
  videoMuted: z.boolean(),
  soundMuted: z.boolean(),
  speak: z.boolean().default(false),
  scene: SceneSchema,
  link: MediaLinkSchema.nullable().default(null),
  to: z.array(z.string()).default([]),
  // When the service forgets it, and deletes its file. Playing it again doesn't push this back.
  expiresAt: z.number(),
  // On the service's clock. Null until the item may start: only the first item of the queue ever has one.
  startAt: z.number().nullable(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const HistoryItemSchema = QueueItemSchema.omit({ replay: true, startAt: true }).extend({ playedAt: z.number() });
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

// Votes are counted, never named. Only one at a time in a party.
export const PollSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  counts: z.array(z.number().int().min(0)),
  starterName: z.string(),
  // On the service's clock.
  endsAt: z.number(),
  done: z.boolean(),
  // What this member chose, so the app can show it. Nobody else is told.
  myVote: z.number().int().nullable(),
});
export type Poll = z.infer<typeof PollSchema>;

export const PollRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_POLL_QUESTION_LENGTH),
  options: z.array(z.string().trim().min(1).max(MAX_POLL_OPTION_LENGTH)).min(MIN_POLL_OPTIONS).max(MAX_POLL_OPTIONS),
});
export type PollRequest = z.infer<typeof PollRequestSchema>;

// Party games. One at a time, played in the app's window, never over a game.
export const GameKindSchema = z.enum(['joke', 'question', 'who', 'undercover']);
export type GameKind = z.infer<typeof GameKindSchema>;
// The lobby comes first: players click to join, then it starts.
export const GamePhaseSchema = z.enum(['lobby', 'collect', 'write', 'vote', 'reveal', 'done']);
export type GamePhase = z.infer<typeof GamePhaseSchema>;
export const MAX_GAME_TEXT_LENGTH = 80;
// Who has to be there to start: guessing among two people, or hiding among them, is no game.
export const GAME_MIN_PLAYERS: Record<GameKind, number> = { joke: 2, question: 3, who: 3, undercover: 3 };
// What each player sends at the start: pictures for the jokes, one LiveChat for the others.
export const GAME_ENTRIES_PER_PLAYER: Record<GameKind, number> = { joke: 5, question: 1, who: 1, undercover: 1 };

const GameFileSchema = z.object({ id: z.uuid(), name: z.string(), contentType: MediaContentTypeSchema, size: z.number() });
export type GameFile = z.infer<typeof GameFileSchema>;

export const GameEntrySchema = z.object({
  // A player's id when the entry is what they wrote, otherwise the id of what was sent.
  id: z.string(),
  // Null while it is still a secret.
  ownerId: z.string().nullable(),
  files: z.array(GameFileSchema),
  caption: z.string(),
  // Only told at the reveal.
  votes: z.number().int().nullable(),
  mine: z.boolean(),
});
export type GameEntry = z.infer<typeof GameEntrySchema>;

export const GameSchema = z.object({
  id: z.string(),
  kind: GameKindSchema,
  starterName: z.string(),
  players: z.array(z.string()),
  scores: z.record(z.string(), z.number()),
  phase: GamePhaseSchema,
  round: z.number().int(),
  rounds: z.number().int(),
  // On the service's clock.
  endsAt: z.number(),
  // The question of the round, for the question game.
  prompt: z.string(),
  entries: z.array(GameEntrySchema),
  // The picture this player got: the one to joke about, or the one to describe.
  myPicture: z.array(GameFileSchema),
  mySent: z.number().int(),
  // Who has done their part of this phase.
  acted: z.array(z.string()),
  myChoice: z.string().nullable(),
  // At the reveal: who sent it, or who the impostor was.
  answer: z.string().nullable(),
  // Why it ended early: not enough sent.
  reason: z.enum(['few', 'stopped']).nullable(),
  // Who runs the lobby, who is ready, and who joined late and plays from the next round.
  chefId: z.string().default(''),
  ready: z.array(z.string()).default([]),
  waiting: z.array(z.string()).default([]),
});
export type Game = z.infer<typeof GameSchema>;

// Quick reactions that float on everyone's screen during a game.
export const GAME_REACTIONS = ['😂', '🔥', '😮', '👏', '💀', '❤️'] as const;
export const GameReactionSchema = z.enum(GAME_REACTIONS);
export type GameReaction = z.infer<typeof GameReactionSchema>;

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('game-start'), kind: GameKindSchema }),
  z.object({ t: z.literal('game-say'), gameId: z.string(), text: z.string().trim().min(1).max(MAX_GAME_TEXT_LENGTH) }),
  z.object({ t: z.literal('game-vote'), gameId: z.string(), choice: z.string().min(1).max(64) }),
  z.object({ t: z.literal('game-stop'), gameId: z.string() }),
  z.object({ t: z.literal('game-join'), gameId: z.string() }),
  z.object({ t: z.literal('game-ready'), gameId: z.string(), ready: z.boolean() }),
  z.object({ t: z.literal('game-launch'), gameId: z.string() }),
  z.object({ t: z.literal('game-leave'), gameId: z.string() }),
  z.object({ t: z.literal('game-rematch'), gameId: z.string() }),
  z.object({ t: z.literal('game-react'), gameId: z.string(), emoji: GameReactionSchema }),
  z.object({ t: z.literal('ready'), mediaId: z.string() }),
  z.object({ t: z.literal('skip'), mediaId: z.string() }),
  // This PC has stopped showing it. Once nobody is watching any more, the queue moves on.
  z.object({ t: z.literal('cut'), mediaId: z.string() }),
  z.object({ t: z.literal('time'), c: z.number() }),
  z.object({
    t: z.literal('status'),
    activity: ActivitySchema,
    note: z.string().trim().max(MAX_NOTE_LENGTH),
    game: z.string().trim().min(1).max(MAX_GAME_NAME_LENGTH).nullable().default(null),
  }),
  z.object({ t: z.literal('poll') }).extend(PollRequestSchema.shape),
  z.object({ t: z.literal('vote'), pollId: z.string(), choice: z.number().int().min(0).max(MAX_POLL_OPTIONS - 1) }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('welcome'),
    partyId: z.string(),
    code: z.string().nullable(),
    memberId: z.string(),
    members: z.array(MemberSchema),
    queue: z.array(QueueItemSchema),
    history: z.array(HistoryItemSchema),
    poll: PollSchema.nullable().default(null),
    game: GameSchema.nullable().default(null),
  }),
  z.object({ t: z.literal('poll'), poll: PollSchema.nullable() }),
  z.object({ t: z.literal('game'), game: GameSchema.nullable() }),
  z.object({ t: z.literal('game-react'), memberId: z.string(), emoji: GameReactionSchema }),
  z.object({ t: z.literal('members'), members: z.array(MemberSchema) }),
  z.object({ t: z.literal('queue'), queue: z.array(QueueItemSchema) }),
  z.object({ t: z.literal('history'), history: z.array(HistoryItemSchema) }),
  z.object({ t: z.literal('time'), c: z.number(), s: z.number() }),
  z.object({ t: z.literal('code'), code: z.string() }),
  // Someone skipped for everybody, so that nobody wonders where it went.
  z.object({ t: z.literal('skipped'), memberId: z.string(), name: z.string() }),
  z.object({ t: z.literal('pong') }),
  z.object({ t: z.literal('closing'), code: z.number() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
