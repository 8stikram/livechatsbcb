import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateCheckOutcome, UpdateStatus } from '../shared/ipc';
import { MacUpdate } from './mac-update';

const CHECK_INTERVAL_MS = 60 * 60 * 1_000;

export class Updater {
  private status: UpdateStatus = { state: 'idle' };
  private mac: MacUpdate | null = null;

  constructor(private readonly onChange: () => void) {}

  current(): UpdateStatus {
    return this.status;
  }

  start(): void {
    // Dev and test builds have no published version to compare with.
    if (!app.isPackaged) return;

    if (process.platform === 'darwin') {
      this.mac = new MacUpdate((status) => this.publish(status));
      this.check();
      setInterval(() => this.check(), CHECK_INTERVAL_MS);
      return;
    }

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Installers are served whole: the storage can't answer the multi-range requests differential updates rely on.
    autoUpdater.disableDifferentialDownload = true;

    autoUpdater.on('update-available', ({ version }) => this.publish({ state: 'downloading', version, percent: 0 }));
    autoUpdater.on('download-progress', ({ percent }) => {
      if (this.status.state !== 'downloading') return;
      const rounded = Math.floor(percent);
      if (rounded !== this.status.percent) this.publish({ ...this.status, percent: rounded });
    });
    autoUpdater.on('update-downloaded', ({ version }) => this.publish({ state: 'ready', version }));
    autoUpdater.on('error', (error) => {
      // A failed check or download only costs a delay: the next check tries again.
      console.error('Update failed:', error.message);
      if (this.status.state !== 'ready') this.publish({ state: 'idle' });
    });

    this.check();
    setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  check(): void {
    if (!app.isPackaged || this.status.state !== 'idle') return;
    if (this.mac) {
      // A failed check or download only costs a delay: the next check tries again.
      this.mac.check().catch((error: Error) => {
        console.error('Update failed:', error.message);
        this.publish({ state: 'idle' });
      });
      return;
    }
    autoUpdater.checkForUpdates().catch(() => {
      // Already reported by the error event.
    });
  }

  // Said to someone waiting on the button, unlike the regular checks.
  async checkNow(): Promise<UpdateCheckOutcome> {
    if (!app.isPackaged) return 'unavailable';
    if (this.status.state !== 'idle') return 'found';
    try {
      await (this.mac ? this.mac.check() : autoUpdater.checkForUpdates());
    } catch {
      if (this.mac) this.publish({ state: 'idle' });
      return 'failed';
    }
    return this.status.state === 'idle' ? 'latest' : 'found';
  }

  installNow(): void {
    if (this.status.state !== 'ready') return;
    if (this.mac) this.mac.install();
    else autoUpdater.quitAndInstall(true, true);
  }

  private publish(status: UpdateStatus): void {
    this.status = status;
    this.onChange();
  }
}
