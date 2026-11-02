import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../use-app-state';
import { GuildPicker } from './GuildPicker';
import { Header, type View } from './Header';
import { HistoryScreen } from './HistoryScreen';
import { LibraryScreen, type Category } from './LibraryScreen';
import { bannedUntilOf, minutesLeft } from './messages';
import { loadInEditor } from './load-editor';
import { NotesScreen } from './NotesScreen';
import { LoginScreen } from './LoginScreen';
import { MediaScreen } from './MediaScreen';
import { errorMessage } from './messages';
import { NowBar } from './NowPlaying';
import { PartyScreen } from './PartyScreen';
import { ServerRail } from './ServerRail';
import { SettingsScreen } from './SettingsScreen';
import { UpdateBanner } from './UpdateBanner';
import { useDraft } from './use-draft';
import { useScene } from './use-scene';

const NOTICES = {
  session_expired: 'Tu ne fais plus partie de ta party privée.',
  guild_lost: "Tu n'es plus sur ce serveur Discord.",
} as const;

// You can't see the app while playing, so a small sound says what the key did. Only on this PC.
const playShortcutSound = (sent: boolean): void => {
  const audio = new AudioContext();
  const tone = audio.createOscillator();
  const volume = audio.createGain();
  tone.frequency.value = sent ? 880 : 220;
  volume.gain.setValueAtTime(0.08, audio.currentTime);
  volume.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
  tone.connect(volume).connect(audio.destination);
  tone.start();
  tone.stop(audio.currentTime + 0.12);
  tone.onended = () => void audio.close();
};

export const App = () => {
  const state = useAppState();
  const files = useDraft();
  const scene = useScene();
  const [chosenView, setChosenView] = useState<View>('media');
  const [picking, setPicking] = useState(false);
  const [libraryCategory, setLibraryCategory] = useState<Category>('image');
  const partyId = state?.party?.partyId;
  // Where an update found this window, for when the party comes back.
  const viewBeforeRestart = useRef<View | null>(null);
  const restartIn = state?.restartIn ?? null;

  useEffect(() => {
    void window.liveChat.takeRestartStash().then(({ view, loaded }) => {
      if (loaded) loadInEditor(loaded, files, scene);
      if (!view) return;
      viewBeforeRestart.current = view as View;
      setChosenView(view as View);
    });
  }, []);

  useEffect(() => {
    if (restartIn !== null) void window.liveChat.stashView(chosenView);
  }, [restartIn, chosenView]);

  // Bans and ignored people run out on their own: what they say has to follow.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const mutedRef = useRef(false);
  mutedRef.current = state?.settings.muted ?? false;
  useEffect(
    () =>
      window.liveChat.onShortcutFeedback((sent) => {
        if (!mutedRef.current) playShortcutSound(sent);
      }),
    [],
  );

  // Whoever just entered a party is there to send something.
  useEffect(() => {
    if (!partyId) return;
    setChosenView(viewBeforeRestart.current ?? 'media');
    viewBeforeRestart.current = null;
    setPicking(false);
  }, [partyId]);

  // Whoever just logged out is back at the start, wherever they did it from.
  const loggedOut = state !== null && state.account === null;
  useEffect(() => {
    if (!loggedOut) return;
    setChosenView('media');
    setPicking(false);
    files.reset();
    scene.forgetAll();
  }, [loggedOut]);

  if (!state) return null;

  const { account, addedGuilds, party, notice, joinError } = state;

  if (!account) {
    return (
      <div className="app is-login">
        <UpdateBanner update={state.update} restartIn={restartIn} />
        <LoginScreen state={state} />
      </div>
    );
  }

  const hasPlaces = addedGuilds.length > 0 || state.hasPrivateParty || party !== null;
  const standalone = chosenView === 'settings' || chosenView === 'notes';
  const view: View = !party && !standalone ? 'party' : chosenView;
  const showPicker = picking || (!hasPlaces && !standalone);
  const shownNotice = notice === 'session_expired' || notice === 'guild_lost' ? NOTICES[notice] : null;
  const { current } = state.queue;
  const ownBan = party ? bannedUntilOf(party) : null;

  return (
    <div className="app">
      <div className="titlebar" />
      <ServerRail
        state={state}
        picking={showPicker}
        settingsOpen={view === 'settings' && !showPicker}
        onShowParty={() => {
          setPicking(false);
          setChosenView('party');
        }}
        onAdd={() => setPicking(true)}
        onOpenSettings={() => {
          setPicking(false);
          setChosenView('settings');
        }}
      />

      <div className="workspace">
        {!showPicker && <Header party={party} view={view} joinError={joinError} onView={setChosenView} />}

        <UpdateBanner update={state.update} restartIn={restartIn} />
        {state.settings.clean && (
          <div className="banner is-clean" role="status" data-testid="clean-banner">
            <span>
              Mode clean actif : rien ne s’affiche ni ne s’entend chez toi. <span className="mono">{state.settings.cleanKey}</span> pour revenir.
            </span>
            <button type="button" className="pill primary small" onClick={() => void window.liveChat.setClean(false)}>
              Désactiver
            </button>
          </div>
        )}
        {state.unavailableKeys.includes(state.settings.cleanKey) && (
          <p className="banner is-error" role="status" data-testid="clean-key-taken">
            Une autre app utilise déjà <span className="mono">{state.settings.cleanKey}</span>. Choisis une autre touche pour le mode clean dans Réglages, Raccourcis.
          </p>
        )}
        {ownBan !== null && ownBan > Date.now() && (
          <p className="banner is-error" role="status" data-testid="own-ban">
            Tu as spammé : plus aucun envoi pendant encore {minutesLeft(ownBan)} min.
          </p>
        )}
        {state.whatsNew && view !== 'notes' && (
          <div className="banner" role="status" data-testid="whats-new">
            <span>Mise à jour installée : version {state.version}</span>
            <span className="history-actions">
              <button
                type="button"
                className="pill primary small"
                onClick={() => {
                  setPicking(false);
                  setChosenView('notes');
                  void window.liveChat.markNotesSeen();
                }}
              >
                Voir les nouveautés
              </button>
              <button type="button" className="pill quiet small" onClick={() => void window.liveChat.markNotesSeen()}>
                Fermer
              </button>
            </span>
          </div>
        )}
        {shownNotice && (
          <p className="banner" role="status" data-testid="notice">
            {shownNotice}
          </p>
        )}
        {joinError && (
          <p className="banner is-error" role="alert" data-testid="join-error">
            {errorMessage(joinError)}
          </p>
        )}

        {showPicker && (
          <GuildPicker
            key={addedGuilds.map(({ id }) => id).join()}
            state={state}
            onClose={() => setPicking(false)}
          />
        )}

        {/* Kept mounted but hidden, so that going elsewhere doesn't lose a media being prepared. */}
        <div className="views" hidden={showPicker}>
          <div className="view" hidden={view !== 'party'}>
            {party ? (
              <PartyScreen state={state} party={party} active={view === 'party' && !showPicker} />
            ) : (
              <p className="glass empty" data-testid="no-party">
                {joinError ? 'Clique sur un serveur pour réessayer.' : 'Connexion au serveur…'}
              </p>
            )}
          </div>
          {party && (
            <>
              <div className="view" hidden={view !== 'media'}>
                <MediaScreen
                  state={state}
                  files={files}
                  scene={scene}
                  active={view === 'media' && !showPicker}
                  onOpenLibrary={(category) => {
                    setLibraryCategory(category);
                    setChosenView('library');
                  }}
                />
              </div>
              <div className="view" hidden={view !== 'library'}>
                <LibraryScreen
                  state={state}
                  files={files}
                  scene={scene}
                  active={view === 'library' && !showPicker}
                  category={libraryCategory}
                  onCategory={setLibraryCategory}
                  onOpenEditor={() => setChosenView('media')}
                />
              </div>
              <div className="view" hidden={view !== 'history'}>
                <HistoryScreen state={state} active={view === 'history'} />
              </div>
            </>
          )}
          <div className="view" hidden={view !== 'settings'}>
            <SettingsScreen state={state} onOpenNotes={() => setChosenView('notes')} />
          </div>
          <div className="view" hidden={view !== 'notes'}>
            <NotesScreen version={state.version} />
          </div>
        </div>

        {party && current && !showPicker && (view === 'media' || view === 'library' || view === 'history') && (
          <NowBar current={current} waiting={state.queue.upcoming.length} settings={state.settings} />
        )}
      </div>
    </div>
  );
};
