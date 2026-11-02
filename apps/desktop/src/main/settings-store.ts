import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';
import { DEFAULT_SETTINGS, type Settings } from '../shared/ipc';

const SAVE_DELAY_MS = 300;

const percent = z.number().min(0).max(100);
const ZoneSchema = z.object({ x: percent, y: percent, w: percent, h: percent });

export const SettingsSchema = z.object({
  overlayEnabled: z.boolean(),
  displayId: z.number().nullable(),
  volume: percent,
  muted: z.boolean(),
  layout: z.object({ profile: ZoneSchema, media: ZoneSchema, text: ZoneSchema }),
  launchAtStartup: z.boolean(),
  reduceMotion: z.boolean(),
  backgroundHintShown: z.boolean(),
  clean: z.boolean(),
  cleanKey: z.string(),
  skipKey: z.string(),
  skipMineKey: z.string(),
  speechEnabled: z.boolean(),
  speechVoice: z.string().nullable(),
  speechRate: z.number().min(50).max(200),
  maxDurationSec: z.number().positive().nullable(),
  ignored: z.record(z.string(), z.number().nullable()),
  seenVersion: z.string().nullable(),
});

const settingsPath = () => join(app.getPath('userData'), 'settings.json');

export class SettingsStore {
  private data: Settings;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.load();
  }

  get current(): Settings {
    return this.data;
  }

  // Dragging a zone changes the layout many times a second, so saving waits for a pause.
  update(change: Partial<Settings>): void {
    this.data = { ...this.data, ...change };
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DELAY_MS);
  }

  flush(): void {
    if (!this.saveTimer) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = null;

    const target = settingsPath();
    const temporary = `${target}.tmp`;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(temporary, JSON.stringify(this.data, null, 2));
    renameSync(temporary, target);
  }

  private load(): Settings {
    try {
      const saved = JSON.parse(readFileSync(settingsPath(), 'utf8')) as object;
      return SettingsSchema.parse({ ...DEFAULT_SETTINGS, ...saved });
    } catch {
      // No file yet, or a damaged one: settings are never worth refusing to open over.
      return DEFAULT_SETTINGS;
    }
  }
}
