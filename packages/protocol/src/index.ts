import { z } from 'zod';

export const PROTOCOL_VERSION = 1;
export const WS_SUBPROTOCOL = `livechatsbcb.v${PROTOCOL_VERSION}`;
export const WS_SUBPROTOCOL_PREFIX = 'livechatsbcb.v';
export const WS_TOKEN_PREFIX = 'token.';

export const MAX_ONLINE_MEMBERS = 10;
export const MAX_REGISTERED_MEMBERS = 30;
export const MAX_NAME_LENGTH = 24;

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
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export const ApiErrorSchema = z.object({ error: ApiErrorCodeSchema });

export const MemberSchema = z.object({
  id: z.string(),
  name: z.string(),
  online: z.boolean(),
});
export type Member = z.infer<typeof MemberSchema>;

export const ServerMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('welcome'),
    partyId: z.string(),
    code: z.string(),
    memberId: z.string(),
    members: z.array(MemberSchema),
  }),
  z.object({ t: z.literal('members'), members: z.array(MemberSchema) }),
  z.object({ t: z.literal('code'), code: z.string() }),
  z.object({ t: z.literal('pong') }),
  z.object({ t: z.literal('closing'), code: z.number() }),
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;
