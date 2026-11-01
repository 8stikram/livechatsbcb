import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { DEFAULT_LAYOUT, type AppState, type OverlayLayout, type Settings, type Zone } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { ConfirmButton } from './ConfirmButton';
import { Slider } from './NowPlaying';

const ZONE_LABELS: Record<keyof OverlayLayout, string> = {
  profile: 'Photo et pseudo',
  media: 'Média',
  text: 'Texte',
};
const ZONES = Object.keys(ZONE_LABELS) as Array<keyof OverlayLayout>;

export const Switch = ({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) => (
  <label className="switch">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span className="switch-track" aria-hidden="true" />
    <span>{children}</span>
  </label>
);

const MIN_ZONE_PERCENT = 6;
const SEND_EVERY_MS = 100;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const tidy = ({ x, y, w, h }: Zone): Zone => ({
  x: Math.round(x * 10) / 10,
  y: Math.round(y * 10) / 10,
  w: Math.round(w * 10) / 10,
  h: Math.round(h * 10) / 10,
});

// A small copy of the screen: dragging here moves things on the real overlay, which stays click-through the whole time.
const LayoutEditor = ({ layout }: { layout: OverlayLayout }) => {
  const box = useRef<HTMLDivElement>(null);
  const lastSentAt = useRef(0);
  const [dragged, setDragged] = useState<OverlayLayout | null>(null);
  const shown = dragged ?? layout;

  const begin = (zone: keyof OverlayLayout, mode: 'move' | 'resize') => (down: ReactPointerEvent) => {
    down.preventDefault();
    down.stopPropagation();

    const bounds = box.current!.getBoundingClientRect();
    const origin = shown[zone];
    let latest = shown;

    const onMove = (move: PointerEvent) => {
      const dx = ((move.clientX - down.clientX) / bounds.width) * 100;
      const dy = ((move.clientY - down.clientY) / bounds.height) * 100;
      const next =
        mode === 'move'
          ? { ...origin, x: clamp(origin.x + dx, 0, 100 - origin.w), y: clamp(origin.y + dy, 0, 100 - origin.h) }
          : {
              ...origin,
              w: clamp(origin.w + dx, MIN_ZONE_PERCENT, 100 - origin.x),
              h: clamp(origin.h + dy, MIN_ZONE_PERCENT, 100 - origin.y),
            };
      latest = { ...latest, [zone]: tidy(next) };
      setDragged(latest);

      if (Date.now() - lastSentAt.current >= SEND_EVERY_MS) {
        lastSentAt.current = Date.now();
        void window.liveChat.setSettings({ layout: latest });
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      void window.liveChat.setSettings({ layout: latest });
      setDragged(null);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div className="layout-box" ref={box} data-testid="layout-box">
      {ZONES.map((zone) => {
        const { x, y, w, h } = shown[zone];
        return (
          <div
            key={zone}
            className={`layout-zone is-${zone}`}
            style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
            data-testid={`layout-${zone}`}
            onPointerDown={begin(zone, 'move')}
          >
            <span>{ZONE_LABELS[zone]}</span>
            <i className="layout-handle" data-testid={`layout-${zone}-resize`} onPointerDown={begin(zone, 'resize')} />
          </div>
        );
      })}
    </div>
  );
};

export const SettingsScreen = ({ state }: { state: AppState }) => {
  const { settings, displays } = state;
  const set = (change: Partial<Settings>) => void window.liveChat.setSettings(change);

  return (
    <div className="settings-grid scroll">
      <div className="settings-column">
        {state.account && (
          <section className="glass panel" aria-labelledby="account-title">
            <h2 id="account-title">Ton compte</h2>
            <div className="account">
              <Avatar className="avatar is-large" name={state.account.name} url={state.account.avatarUrl} testId="account-avatar" />
              <span className="row-text">
                <span className="row-title" data-testid="account-name">
                  {state.account.name}
                </span>
                <span className="row-sub">Reste connecté sur ce PC.</span>
              </span>
              <ConfirmButton
                label="Se déconnecter"
                confirmLabel="Confirmer ?"
                onConfirm={() => void window.liveChat.logout()}
              />
            </div>
          </section>
        )}

        <section className="glass panel" aria-labelledby="startup-title">
          <h2 id="startup-title">Démarrage</h2>
          <Switch checked={settings.launchAtStartup} onChange={(launchAtStartup) => set({ launchAtStartup })}>
            Lancer LiveChatSBCB au démarrage de Windows
          </Switch>
          <p className="hint">
            Il démarre discrètement près de l'horloge. Fermer la fenêtre le laisse ouvert : pour quitter, fais un clic
            droit sur son icône.
          </p>
        </section>

        <section className="glass panel" aria-labelledby="sound-title">
          <h2 id="sound-title">Son</h2>
          <label className="field">
            <span className="field-line">
              Volume <strong className="mono" data-testid="volume-value">{settings.volume} %</strong>
            </span>
            <Slider value={settings.volume} min={0} max={100} onChange={(volume) => set({ volume })} />
          </label>
          <Switch checked={settings.muted} onChange={(muted) => set({ muted })}>
            Couper le son
          </Switch>
        </section>

        <p className="version mono">Version {state.version}</p>
      </div>

      <div className="settings-column">
        <section className="glass panel" aria-labelledby="overlay-title">
          <h2 id="overlay-title">Affichage en jeu</h2>
          <Switch checked={settings.overlayEnabled} onChange={(overlayEnabled) => set({ overlayEnabled })}>
            Afficher les médias sur mon écran
          </Switch>
          <label className="field">
            <span>Écran</span>
            <select
              className="input"
              value={settings.displayId ?? displays[0]?.id ?? ''}
              onChange={(event) => set({ displayId: Number(event.target.value) })}
            >
              {displays.map((display) => (
                <option key={display.id} value={display.id}>
                  {display.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="pill primary" onClick={() => void window.liveChat.testOverlay()}>
            Test d’affichage
          </button>
          <p className="hint">Affiche une image et un texte de test sur ton écran. Les autres ne voient rien.</p>
        </section>

        <section className="glass panel" aria-labelledby="layout-title">
          <h2 id="layout-title" className="panel-title">
            Recadrer
            <button type="button" className="pill quiet small" onClick={() => set({ layout: DEFAULT_LAYOUT })}>
              Remettre par défaut
            </button>
          </h2>
          <p className="hint">Déplace les zones, ou tire leur coin pour les redimensionner. Ton écran montre le résultat.</p>
          <LayoutEditor layout={settings.layout} />
        </section>
      </div>
    </div>
  );
};
