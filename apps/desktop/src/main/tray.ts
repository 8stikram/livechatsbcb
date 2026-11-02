import { Menu, nativeImage, Tray } from 'electron';
import iconPath from '../renderer/src/assets/logo.png?asset';

// The bar at the top of a Mac is thinner than the Windows one.
const TRAY_ICON_SIZE = process.platform === 'darwin' ? 18 : 32;

type TrayActions = {
  open: () => void;
  setMuted: (muted: boolean) => void;
  setClean: (clean: boolean) => void;
  quit: () => void;
};

// The icon near the Windows clock: the app lives there once its window is closed, and quitting for real happens here.
export class AppTray {
  private readonly tray: Tray;
  private muted: boolean | null = null;
  private clean: boolean | null = null;
  private readonly normalIcon = nativeImage.createFromPath(iconPath).resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE, quality: 'best' });

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(this.normalIcon);
    this.tray.setToolTip('LiveChatSBCB');
    this.tray.on('click', () => actions.open());
  }

  show(muted: boolean, clean: boolean): void {
    if (muted === this.muted && clean === this.clean) return;
    if (clean !== this.clean) {
      // Dimmed, so that it can't be left on without noticing.
      const bitmap = Buffer.from(this.normalIcon.toBitmap());
      if (clean) for (let index = 0; index < bitmap.length; index += 4) for (let color = 0; color < 3; color++) bitmap[index + color] = bitmap[index + color]! >> 2;
      const { width, height } = this.normalIcon.getSize();
      this.tray.setImage(clean ? nativeImage.createFromBitmap(bitmap, { width, height }) : this.normalIcon);
      this.tray.setToolTip(clean ? 'LiveChatSBCB : mode clean actif' : 'LiveChatSBCB');
    }
    this.muted = muted;
    this.clean = clean;

    const { open, setMuted, setClean, quit } = this.actions;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir LiveChatSBCB', click: () => open() },
        { label: 'Couper le son', type: 'checkbox', checked: muted, click: (item) => setMuted(item.checked) },
        { label: 'Mode clean', type: 'checkbox', checked: clean, click: (item) => setClean(item.checked) },
        { type: 'separator' },
        { label: 'Quitter', click: () => quit() },
      ]),
    );
  }

  explain(): void {
    this.tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(iconPath),
      title: 'LiveChatSBCB reste ouvert',
      content: 'Tu continues de recevoir les médias. Pour quitter : clic droit sur cette icône.',
      noSound: true,
    });
  }

  destroy(): void {
    this.tray.destroy();
  }
}
