import { Menu, nativeImage, Tray } from 'electron';
import iconPath from '../renderer/src/assets/logo.png?asset';

type TrayActions = {
  open: () => void;
  setMuted: (muted: boolean) => void;
  quit: () => void;
};

// The icon near the Windows clock: the app lives there once its window is closed, and quitting for real happens here.
export class AppTray {
  private readonly tray: Tray;
  private muted: boolean | null = null;

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 32, height: 32, quality: 'best' }));
    this.tray.setToolTip('LiveChatSBCB');
    this.tray.on('click', () => actions.open());
  }

  showMuted(muted: boolean): void {
    if (muted === this.muted) return;
    this.muted = muted;

    const { open, setMuted, quit } = this.actions;
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Ouvrir LiveChatSBCB', click: () => open() },
        { label: 'Couper le son', type: 'checkbox', checked: muted, click: (item) => setMuted(item.checked) },
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
