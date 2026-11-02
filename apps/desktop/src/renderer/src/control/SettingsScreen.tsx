import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTabMarker } from './glide';
import { DEFAULT_LAYOUT, keyLabel, ON_MAC, type ActionKey, type AppState, type CleanKeyOutcome, type OverlayLayout, type Settings, type UpdateCheckOutcome, type Zone } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { FitText } from '../scene';
import { say } from '../speech';
import { ConfirmButton } from './ConfirmButton';
import { Slider } from './NowPlaying';

const ZONE_LABELS: Record<keyof OverlayLayout, string> = {
  profile: 'Photo et pseudo',
  media: 'Média',
  text: 'Texte',
};
const ZONES = Object.keys(ZONE_LABELS) as Array<keyof OverlayLayout>;

const CHECK_MESSAGES: Record<UpdateCheckOutcome, string> = {
  latest: 'Tu as déjà la dernière version.',
  found: 'Une nouvelle version arrive : elle s’installe toute seule.',
  failed: 'Impossible de vérifier pour le moment. Vérifie ta connexion et réessaie.',
  unavailable: 'Les mises à jour ne marchent que sur l’app installée.',
};

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

const useVoices = () => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const load = () => setVoices(speechSynthesis.getVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
};

const MAX_DURATION_CHOICES = [10, 15, 20, 30, 45, 60];

const CLEAN_KEY_ERRORS: Record<Exclude<CleanKeyOutcome, 'ok'>, string> = {
  reserved: 'Cette touche sert déjà à autre chose dans l’app.',
  taken: 'Une autre app utilise déjà cette touche.',
};

const acceleratorOf = (event: KeyboardEvent): string | null => {
  // Option changes the character typed on a Mac, so the key is read from its place.
  const typed = ON_MAC ? (event.code.match(/^(?:Digit|Key)(.)$/)?.[1] ?? event.key) : event.key;
  const key = /^F\d{1,2}$/.test(event.key) || event.key === 'Pause' ? event.key : /^[a-z0-9]$/i.test(typed) ? typed.toUpperCase() : null;
  if (!key) return null;
  const mods = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
  // A letter alone would be taken from everything you type, everywhere.
  if (mods.length === 0 && !/^F\d|^Pause$/.test(key)) return null;
  return [...mods, key].join('+');
};

const ActionKeyButton = ({ which, current, testId }: { which: ActionKey; current: string; testId: string }) => {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === 'Escape') {
        setRecording(false);
        return;
      }
      const accelerator = acceleratorOf(event);
      if (!accelerator) return;
      setRecording(false);
      void window.liveChat.setActionKey(which, accelerator).then((outcome) => setError(outcome === 'ok' ? null : CLEAN_KEY_ERRORS[outcome]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recording, which]);

  return (
    <>
      <button type="button" className="pill secondary small mono" data-testid={testId} onClick={() => setRecording(true)}>
        {recording ? 'Appuie sur une touche…' : keyLabel(current)}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
};

const SECTIONS = [
  ['general', 'Général'],
  ['display', 'Affichage en jeu'],
  ['sound', 'Son'],
  ['shortcuts', 'Raccourcis'],
  ['updates', 'Mises à jour'],
] as const;
type Section = (typeof SECTIONS)[number][0];

export const SettingsScreen = ({ state, onOpenNotes }: { state: AppState; onOpenNotes: () => void }) => {
  const { settings, displays } = state;
  const [section, setSection] = useState<Section>('general');
  const tabArea = useTabMarker<HTMLElement>(section);
  const voices = useVoices();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<UpdateCheckOutcome | null>(null);
  const set = (change: Partial<Settings>) => void window.liveChat.setSettings(change);

  const check = async () => {
    setChecking(true);
    setChecked(await window.liveChat.checkForUpdates());
    setChecking(false);
  };

  const unavailable = (key: string) =>
    state.unavailableKeys.includes(key) && <span className="row-sub is-banned"> Prise par une autre app</span>;

  return (
    <div className="settings-layout">
      <nav ref={tabArea} className="glass settings-nav" aria-label="Sections des réglages">
        <span className="tab-marker" aria-hidden="true" />
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={id === section ? 'tab is-active' : 'tab'}
            aria-current={id === section ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="settings-grid scroll">
        <div className="settings-column" hidden={section !== 'general'}>
          {state.account && (
            <section className="glass panel" aria-labelledby="account-title">
              <h2 id="account-title">Ton compte</h2>
              <div className="account">
                <Avatar className="avatar is-large" name={state.account.name} url={state.account.avatarUrl} testId="account-avatar" />
                <span className="row-text">
                  <span data-testid="account-name">
                    <FitText className="row-title" text={state.account.name} />
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

          <section className="glass panel" aria-labelledby="motion-title">
            <h2 id="motion-title">Animations</h2>
            <Switch checked={settings.reduceMotion} onChange={(reduceMotion) => set({ reduceMotion })}>
              Réduire les animations
            </Switch>
            <p className="hint">L'app devient plus calme. Ce qui s'affiche en jeu ne change pas.</p>
          </section>

          <section className="glass panel" aria-labelledby="startup-title">
            <h2 id="startup-title">Démarrage</h2>
            <Switch checked={settings.launchAtStartup} onChange={(launchAtStartup) => set({ launchAtStartup })}>
              Lancer LiveChatSBCB au démarrage {ON_MAC ? 'du Mac' : 'de Windows'}
            </Switch>
            <p className="hint">
              Il démarre discrètement près de l'horloge. Fermer la fenêtre le laisse ouvert : pour quitter, fais un clic
              droit sur son icône.
            </p>
          </section>
        </div>

        <div className="settings-column" hidden={section !== 'display'}>
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

          <section className="glass panel" aria-labelledby="limit-title">
            <h2 id="limit-title">Durée max</h2>
            <label className="field">
              <span>Couper chez moi après</span>
              <select
                className="input"
                value={settings.maxDurationSec ?? ''}
                onChange={(event) => set({ maxDurationSec: event.target.value ? Number(event.target.value) : null })}
              >
                {MAX_DURATION_CHOICES.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} secondes
                  </option>
                ))}
                <option value="">Jamais</option>
              </select>
            </label>
            <p className="hint">Les autres voient la suite selon leur propre réglage. Quand tout le monde a été coupé, on passe au suivant.</p>
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

        <div className="settings-column" hidden={section !== 'sound'}>
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

          <section className="glass panel" aria-labelledby="speech-title">
            <h2 id="speech-title">Voix robot</h2>
            <Switch checked={settings.speechEnabled} onChange={(speechEnabled) => set({ speechEnabled })}>
              Entendre la voix robot chez moi
            </Switch>
            <label className="field">
              <span>Voix</span>
              <select
                className="input"
                value={settings.speechVoice ?? ''}
                onChange={(event) => set({ speechVoice: event.target.value || null })}
              >
                <option value="">Voix par défaut {ON_MAC ? 'du Mac' : 'de Windows'}</option>
                {voices.map(({ voiceURI, name }) => (
                  <option key={voiceURI} value={voiceURI}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-line">
                Vitesse <strong className="mono" data-testid="speech-rate">{settings.speechRate} %</strong>
              </span>
              <Slider value={settings.speechRate} min={50} max={200} onChange={(speechRate) => set({ speechRate })} />
            </label>
            <div className="panel-actions">
              <button
                type="button"
                className="pill secondary small"
                onClick={() => say('Ceci est la voix robot de LiveChat.', settings.speechVoice, settings.speechRate, settings.muted ? 0 : settings.volume / 100)}
              >
                Essayer
              </button>
            </div>
            <p className="hint">Chaque PC lit avec sa propre voix : elle n’est pas forcément la même chez tout le monde.</p>
          </section>
        </div>

        <div className="settings-column" hidden={section !== 'shortcuts'}>
          <section className="glass panel" aria-labelledby="clean-title">
            <h2 id="clean-title">Mode clean</h2>
            <Switch checked={settings.clean} onChange={(clean) => void window.liveChat.setClean(clean)}>
              Tout couper chez moi : son, image, affichage en jeu
            </Switch>
            <div className="field-line">
              <span>Touche {unavailable(settings.cleanKey)}</span>
              <ActionKeyButton which="cleanKey" current={settings.cleanKey} testId="clean-key" />
            </div>
            <p className="hint">Une touche marche même en plein jeu. Les autres ne voient rien.</p>
          </section>

          <section className="glass panel" aria-labelledby="keys-title">
            <h2 id="keys-title">Raccourcis en jeu</h2>
            <div className="field-line">
              <span>Passer pour tout le monde {unavailable(settings.skipKey)}</span>
              <ActionKeyButton which="skipKey" current={settings.skipKey} testId="skip-key" />
            </div>
            <div className="field-line">
              <span>Passer pour moi {unavailable(settings.skipMineKey)}</span>
              <ActionKeyButton which="skipMineKey" current={settings.skipMineKey} testId="skip-mine-key" />
            </div>
            {state.shortcuts.length === 0 ? (
              <p className="hint">Dans la bibliothèque, fais un clic droit sur un fichier ou un LiveChat sauvegardé pour lui donner une touche, de Shift+F1 à Shift+F10.</p>
            ) : (
              <ul className="rows" data-testid="shortcut-list">
                {state.shortcuts.map(({ key, name }) => (
                  <li key={key} className="row">
                    <span className="shortcut-badge mono">{keyLabel(key)}</span>
                    <span className="row-text">
                      <span className="row-title" title={name}>
                        {name}
                      </span>
                      {unavailable(key)}
                    </span>
                    <button type="button" className="pill quiet small" onClick={() => void window.liveChat.clearShortcut(key)}>
                      Retirer
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">Un petit son confirme l’envoi. Il faut attendre 3 secondes entre deux envois par touche.</p>
          </section>
        </div>

        <div className="settings-column" hidden={section !== 'updates'}>
          <section className="glass panel" aria-labelledby="updates-title">
            <h2 id="updates-title" className="panel-title">
              Mises à jour
              <span className="count mono">Version {state.version}</span>
            </h2>
            <div className="panel-actions">
              <button type="button" className="pill secondary small" disabled={checking} onClick={() => void check()}>
                {checking ? 'Vérification…' : 'Vérifier les mises à jour'}
              </button>
              <button type="button" className="pill quiet small" onClick={onOpenNotes}>
                Voir les nouveautés
              </button>
            </div>
            {checked && (
              <p className="hint" role="status" data-testid="update-check">
                {CHECK_MESSAGES[checked]}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
