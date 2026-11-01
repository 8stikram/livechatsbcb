import { z } from 'zod';

export const PROTOCOL_VERSION = 2;
export const WS_SUBPROTOCOL = `livechatsbcb.v${PROTOCOL_VERSION}`;
export const WS_SUBPROTOCOL_PREFIX = 'livechatsbcb.v';
export const WS_TOKEN_PREFIX = 'token.';

export const MAX_ONLINE_MEMBERS = 10;
export const MAX_REGISTERED_MEMBERS = 30;
export const MAX_NAME_LENGTH = 24;

export const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
// R2 needs every part of an upload but the last to be the same size, and at least 5 MiB.
export const MEDIA_PART_BYTES = 8 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 300;
export const MAX_QUEUE_LENGTH = 50;
export const MIN_DISPLAY_MS = 1_000;
export const DEFAULT_DISPLAY_MS = 5_000;
export const MAX_DISPLAY_MS = 60_000;
export const MAX_CLIP_MS = 60 * 60_000;

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

export const NameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);

export const CreatePartyRequestSchema = z.object({ name: NameSchema });
export const JoinPartyRequestSchema = z.object({ code: CodeSchema, name: NameSchema });

export const SessionResponseSchema = z.object({
  partyId: z.string(),
  code: z.string(),
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
  'not_found',
  'storage_full',
  'queue_full',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export const ApiErrorSchema = z.object({ error: ApiErrorCodeSchema });

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  online: z.boolean(),
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

export const MediaDraftSchema = z
  .object({
    caption: z.string().trim().max(MAX_CAPTION_LENGTH),
    clipStartMs: z.number().int().min(0).max(24 * MAX_CLIP_MS),
    durationMs: z.number().int().min(MIN_DISPLAY_MS).max(MAX_CLIP_MS),
    file: z
      .object({ contentType: MediaContentTypeSchema, size: z.number().int().positive().max(MAX_MEDIA_BYTES) })
      .nullable(),
  })
  .refine((draft) => draft.file !== null || draft.caption.length > 0)
  .refine((draft) => {
    const plays = draft.file !== null && fileKindOf(draft.file.contentType) !== 'image';
    return plays || (draft.clipStartMs === 0 && draft.durationMs <= MAX_DISPLAY_MS);
  });
export type MediaDraft = z.infer<typeof MediaDraftSchema>;

export const CreateMediaResponseSchema = z.object({ mediaId: z.string() });

export const UploadedPartSchema = z.object({ partNumber: z.number().int().positive(), etag: z.string() });
export type UploadedPart = z.infer<typeof UploadedPartSchema>;

export const CompleteMediaRequestSchema = z.object({
  parts: z.array(UploadedPartSchema).min(1).max(mediaPartCount(MAX_MEDIA_BYTES)),
});

export const QueueItemSchema = z.object({
  // A UUID, because the app names a file after it.
  id: z.uuid(),
  senderId: z.string(),
  senderName: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'text']),
  contentType: MediaContentTypeSchema.nullable(),
  size: z.number(),
  caption: z.string(),
  clipStartMs: z.number(),
  durationMs: z.number(),
  // On the service's clock. Null until the item may start: only the first item of the queue ever has one.
  startAt: z.number().nullable(),
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export const ClientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('ready'), mediaId: z.string() }),
  z.object({ t: z.literal('skip'), mediaId: z.string() }),
  z.object({ t: z.literal('time'), c: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('welcome'),
    partyId: z.string(),
    code: z.string(),
    memberId: z.string(),
    members: z.array(MemberSchema),
    queue: z.array(QueueItemSchema),
  }),
  z.object({ t: z.literal('members'), members: z.array(MemberSchema) }),
  z.object({ t: z.literal('queue'), queue: z.array(QueueItemSchema) }),
  z.object({ t: z.literal('time'), c: z.number(), s: z.number() }),
  z.object({ t: z.literal('code'), code: z.string() }),
  z.object({ t: z.literal('pong') }),
  z.object({ t: z.literal('closing'), code: z.number() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
