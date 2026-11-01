import { open } from 'node:fs/promises';
import { MEDIA_PART_BYTES, mediaPartBytes, mediaPartCount, type SessionResponse, type UploadedPart } from '@livechatsbcb/protocol';
import type { ActionError } from '../shared/ipc';
import { completeMedia, putMediaPart, type ApiResult } from './party-api';

const PARALLEL_PARTS = 3;

export const uploadFile = async (
  session: SessionResponse,
  mediaId: string,
  path: string,
  size: number,
  signal: AbortSignal,
  onPercent: (percent: number) => void,
): Promise<ApiResult<null>> => {
  const total = mediaPartCount(size);
  const parts: UploadedPart[] = [];
  const outcome: { error: ActionError | null } = { error: null };
  let next = 1;
  let sent = 0;

  try {
    const file = await open(path, 'r');
    try {
      const sendParts = async () => {
        while (next <= total && !outcome.error && !signal.aborted) {
          const part = next++;
          const bytes = mediaPartBytes(size, part);
          const buffer = Buffer.allocUnsafe(bytes);
          const { bytesRead } = await file.read(buffer, 0, bytes, (part - 1) * MEDIA_PART_BYTES);
          if (bytesRead !== bytes) {
            outcome.error = 'invalid_request';
            return;
          }

          const uploaded = await putMediaPart(session, mediaId, part, buffer, signal);
          if (!uploaded.ok) {
            outcome.error = uploaded.error;
            return;
          }
          parts.push(uploaded.value);
          sent += bytes;
          onPercent(Math.round((sent / size) * 100));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, total) }, sendParts));
    } finally {
      await file.close();
    }
  } catch {
    // The file moved or can't be read any more.
    outcome.error = 'invalid_request';
  }

  if (signal.aborted) return { ok: false, error: 'cancelled' };
  if (outcome.error) return { ok: false, error: outcome.error };
  return completeMedia(session, mediaId, parts.toSorted((a, b) => a.partNumber - b.partNumber));
};
