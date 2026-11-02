import { open } from 'node:fs/promises';
import { MEDIA_PART_BYTES, mediaPartBytes, mediaPartCount, type SessionResponse, type UploadedPart } from '@livechatsbcb/protocol';
import type { ActionError } from '../shared/ipc';
import { completeMedia, putMediaPart, type ApiResult } from './party-api';

const PARALLEL_PARTS = 3;
const OFFLINE_PATIENCE_MS = 10 * 60_000;
const FIRST_RETRY_MS = 1_000;
const LONGEST_RETRY_MS = 15_000;

const waitFor = (ms: number, signal: AbortSignal) =>
  new Promise<void>((done) => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      done();
    }, { once: true });
  });

// Waits out a lost connection. A request that gets no answer costs nothing: the service counts what reaches the storage,
// and refuses a part once its attempts are used up.
export const retryWhileOffline = async <T>(
  attempt: () => Promise<ApiResult<T>>,
  signal: AbortSignal,
  onPaused: (paused: boolean) => void,
): Promise<ApiResult<T>> => {
  const startedAt = Date.now();
  let delay = FIRST_RETRY_MS;
  let waited = false;

  for (;;) {
    const result = await attempt();
    if (signal.aborted && !result.ok) return { ok: false, error: 'cancelled' };
    if (result.ok || result.error !== 'network') {
      if (waited) onPaused(false);
      return result;
    }
    if (Date.now() - startedAt >= OFFLINE_PATIENCE_MS) return { ok: false, error: 'gave_up' };

    if (!waited) onPaused(true);
    waited = true;
    await waitFor(delay, signal);
    if (signal.aborted) return { ok: false, error: 'cancelled' };
    delay = Math.min(delay * 2, LONGEST_RETRY_MS);
  }
};

export const uploadFile = async (
  session: SessionResponse,
  mediaId: string,
  path: string,
  size: number,
  signal: AbortSignal,
  onPercent: (percent: number) => void,
  onPaused: (paused: boolean) => void,
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

          const uploaded = await retryWhileOffline(() => putMediaPart(session, mediaId, part, buffer, signal), signal, onPaused);
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

  // The answer can be what got lost: finding the upload gone after that means it went through.
  let retried = false;
  const completed = await retryWhileOffline(
    () => completeMedia(session, mediaId, parts.toSorted((a, b) => a.partNumber - b.partNumber)),
    signal,
    (paused) => {
      retried ||= paused;
      onPaused(paused);
    },
  );
  return retried && !completed.ok && completed.error === 'not_found' ? { ok: true, value: null } : completed;
};
