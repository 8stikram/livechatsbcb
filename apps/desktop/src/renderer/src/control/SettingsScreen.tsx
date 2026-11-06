import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useTabMarker } from './glide';
import { DEFAULT_LAYOUT, ON_MAC, type AppState, type OverlayLayout, type Settings, type UpdateCheckOutcome, type Zone } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { FitText } from '../scene';
import { say } from '../speech';
import { ConfirmButton } from './ConfirmButton';
import { KeysPanel } from './KeysPanel';
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

// Over these apps, nothing shows and nothing plays on this PC. The others see it as usual.
const ExcludedApps = ({ excluded }: { excluded: string[] }) => {
  const [apps, setApps] = useState<Array<{ name: string; title: string }> | null>(null);
  const [chosen, setChosen] = useState('');
  const set = (excludedApps: string[]) => void window.liveChat.setSettings({ excludedApps });
  const choices = (apps ?? []).filter(({ name }) => !excluded.includes(name));

  return (
    <section className="glass panel" aria-labelledby="excluded-title">
      <h2 id="excluded-title">Apps sans LiveChat</h2>
      {excluded.length > 0 && (
        <div className="whisper-people" data-testid="excluded-apps">
          {excluded.map((name) => (
            <button key={name} type="button" className="chip is-on" title="Retirer" onClick={() => set(excluded.filter((other) => other !== name))}>
              {name} ✕
            </button>
          ))}
        </div>
      )}
      {apps === null ? (
        <button type="button" className="pill secondary" data-testid="excluded-add" onClick={() => void window.liveChat.listApps().then(setApps)}>
          Choisir une app
        </button>
      ) : (
        <div className="field-line">
          <select className="input" value={chosen} aria-label="App ouverte" data-testid="excluded-choice" onChange={(event) => setChosen(event.target.value)}>
            <option value="">{choices.length > 0 ? 'Une app ouverte…' : 'Aucune autre app ouverte'}</option>
            {choices.map(({ name, title }) => (
              <option key={name} value={name}>
                {name} · {title.slice(0, 50)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pill primary small"
            disabled={!chosen}
            onClick={() => {
              set([...excluded, chosen]);
              setChosen('');
              setApps(null);
            }}
          >
            Ajouter
          </button>
        </div>
      )}
      <p className="hint">Quand une de ces apps est devant, rien ne s’affiche ni ne s’entend chez toi. Ouvre l’app d’abord pour la voir dans la liste.</p>
    </section>
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
            data-tour={`settings-${id}`}
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

          <section className="glass panel" aria-labelledby="tour-title">
            <h2 id="tour-title">Découverte</h2>
            <p className="hint">Les bulles du premier lancement, qui montrent les boutons principaux.</p>
            <button type="button" className="pill secondary small" onClick={() => set({ tutorialDone: false })}>
              Revoir la découverte
            </button>
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

          {!ON_MAC && <ExcludedApps excluded={settings.excludedApps} />}

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
          <KeysPanel state={state} />
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
