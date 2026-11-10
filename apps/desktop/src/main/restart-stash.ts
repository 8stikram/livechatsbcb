import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { SceneLayerSchema, TextPlaceSchema } from '@livechatsbcb/protocol';
import { SavedFileSchema, type SavedLiveChat } from './library';

const StashSchema = z.object({
  view: z.string().nullable(),
  recipe: z
    .object({
      caption: z.string(),
      clipStartMs: z.number(),
      durationMs: z.number(),
      videoMuted: z.boolean(),
      soundMuted: z.boolean(),
      speak: z.boolean().default(false),
      files: z.array(SavedFileSchema),
      scene: z.array(SceneLayerSchema).nullable(),
      textPlace: TextPlaceSchema.nullable().default(null),
    })
    .nullable(),
});
export type RestartStash = z.infer<typeof StashSchema>;
export type StashedRecipe = Pick<SavedLiveChat, 'caption' | 'clipStartMs' | 'durationMs' | 'videoMuted' | 'soundMuted' | 'speak' | 'files' | 'scene' | 'textPlace'>;

const stashPath = () => join(app.getPath('userData'), 'restart-stash.json');

export const writeRestartStash = (stash: RestartStash): void => writeFileSync(stashPath(), JSON.stringify(stash));

export const forgetRestartStash = (): void => rmSync(stashPath(), { force: true });

// Only ever read once: a later start has nothing to bring back.
export const takeRestartStash = (): RestartStash | null => {
  try {
    return StashSchema.parse(JSON.parse(readFileSync(stashPath(), 'utf8')));
  } catch {
    return null;
  } finally {
    forgetRestartStash();
  }
};
