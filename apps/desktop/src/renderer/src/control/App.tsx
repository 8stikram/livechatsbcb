import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { DEFAULT_DISPLAY_MS, MAX_CAPTION_LENGTH } from '@livechatsbcb/protocol';
import { keyLabel, type IncomingResult } from '../../../shared/ipc';
import logo from '../assets/logo.png';
import { useAppState } from '../use-app-state';
import { GuildPicker } from './GuildPicker';
import { Header, type View } from './Header';
import { HistoryScreen } from './HistoryScreen';
import { LibraryScreen, type Category } from './LibraryScreen';
import { bannedUntilOf, incomingErrorMessage, mediaErrorMessage, minutesLeft } from './messages';
import { playLengthMs } from './play-length';
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

// The order they sit in, so that a tab further along comes in from the right.
const VIEW_ORDER: View[] = ['media', 'party', 'library', 'history', 'settings', 'notes'];
const SLIDE_PX = 18;
const LAUNCH_MS = 860;

const LINK = /^https?:\/\/\S+$/i;
const MEDIA_LINK = /\.(png|jpe?g|gif|webp|mp4|m4v|mov|webm|mp3|ogg|opus|wav|m4a|flac)$/i;

const looksLikeMedia = (link: string): boolean => {
  try {
    return MEDIA_LINK.test(new URL(link).pathname);
  } catch {
    return false;
  }
};

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
  // Unknown until we know whether this start comes from an update, which goes straight back to work.
  const [launch, setLaunch] = useState<'unknown' | 'playing' | 'over'>('unknown');
  const reduceMotion = state?.settings.reduceMotion ?? false;

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('calm', reduceMotion);
  }, [reduceMotion]);

  useEffect(() => {
    if (launch !== 'playing') return;
    const timer = setTimeout(() => setLaunch('over'), LAUNCH_MS);
    return () => clearTimeout(timer);
  }, [launch]);

  useEffect(() => {
    void window.liveChat.takeRestartStash().then(({ view, loaded }) => {
      setLaunch(view ? 'over' : 'playing');
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

  const [incomingBusy, setIncomingBusy] = useState(false);
  const [incomingNote, setIncomingNote] = useState<string | null>(null);

  useEffect(() => {
    if (!incomingNote) return;
    const timer = setTimeout(() => setIncomingNote(null), 8_000);
    return () => clearTimeout(timer);
  }, [incomingNote]);

  const bringIn = (result: IncomingResult) => {
    if (!result.ok) {
      setIncomingNote(incomingErrorMessage(result.error));
      return;
    }
    setPicking(false);
    setChosenView('media');
    if ('scene' in result) void scene.addIncoming(result.scene).then(setIncomingNote);
    else files.adoptAll(result.drafts);
  };

  const waitFor = async (pasted: Promise<IncomingResult>) => {
    setIncomingNote(null);
    setIncomingBusy(true);
    try {
      bringIn(await pasted);
    } finally {
      setIncomingBusy(false);
    }
  };

  const canTakeFiles = Boolean(state?.party && !state.upload && !incomingBusy);

  const takeFiles = (taken: File[]) => {
    const paths = taken.map((file) => window.liveChat.pathForFile(file)).filter((path) => path !== '');
    if (paths.length > 0) {
      void waitFor(window.liveChat.pasteFiles(paths, scene.active));
      return;
    }
    const image = taken[0];
    if (!image) return;
    void waitFor(
      image.arrayBuffer().then((bytes) => window.liveChat.pasteImage(new Uint8Array(bytes), image.type, image.name, scene.active)),
    );
  };

  const [dropping, setDropping] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('is-dropping', dropping);
  }, [dropping]);

  // Follows every render, as pasting does. What is dragged inside the app isn't a file, and stays with its own target.
  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = canTakeFiles ? 'copy' : 'none';
      setDropping(canTakeFiles);
    };
    const onLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setDropping(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      setDropping(false);
      if (canTakeFiles) takeFiles([...(event.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', onOver);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onOver);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  });

  // Follows every render: what it does depends on the tab and on what is being prepared.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data || !state?.party || state.upload || incomingBusy) return;
      const inField = (event.target as Element | null)?.closest?.('input, textarea') != null;
      const text = data.getData('text/plain').trim();
      const pasted = [...data.files];
      const hasPaths = pasted.some((file) => window.liveChat.pathForFile(file) !== '');

      if (pasted[0] && (hasPaths || !(inField && text))) {
        event.preventDefault();
        takeFiles(pasted);
      } else if (LINK.test(text) && (!inField || looksLikeMedia(text))) {
        event.preventDefault();
        void waitFor(window.liveChat.pasteLink(text, scene.active));
      } else if (text && !inField) {
        event.preventDefault();
        setPicking(false);
        setChosenView('media');
        files.setCaption((typed) => (typed ? `${typed} ${text}` : text).slice(0, MAX_CAPTION_LENGTH));
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const takeExternal = useRef<() => Promise<void>>(async () => {});
  takeExternal.current = async () => {
    const external = await window.liveChat.takeExternalFiles(scene.active);
    if (!external) return;
    if (external.mode === 'prepare') {
      bringIn(external.result);
      return;
    }
    if ('error' in external) {
      setIncomingNote(incomingErrorMessage(external.error));
      return;
    }
    const length = await playLengthMs(external.leader);
    const result = await window.liveChat.sendExternalFiles(length ?? DEFAULT_DISPLAY_MS);
    if (!mutedRef.current && !state?.settings.clean) playShortcutSound(result.ok);
    if (!result.ok && result.error !== 'cancelled') setIncomingNote(mediaErrorMessage(result.error));
  };
  useEffect(() => {
    const stop = window.liveChat.onExternalFiles(() => void takeExternal.current());
    void takeExternal.current();
    return stop;
  }, []);

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

  // Kept until the next tab: the page reads it for as long as the slide lasts, whatever renders meanwhile.
  const lastView = useRef<View>('media');
  const slide = useRef(SLIDE_PX);

  if (!state || launch === 'unknown') return null;

  const launchLogo = launch === 'playing' && (
    <div className="launch" aria-hidden="true">
      <img src={logo} alt="" width={96} height={96} />
    </div>
  );

  const { account, addedGuilds, party, notice, joinError } = state;

  if (!account) {
    return (
      <>
        {launchLogo}
        <div className="app is-login">
          <UpdateBanner update={state.update} restartIn={restartIn} />
          <LoginScreen state={state} />
        </div>
      </>
    );
  }

  const hasPlaces = addedGuilds.length > 0 || state.hasPrivateParty || party !== null;
  const standalone = chosenView === 'settings' || chosenView === 'notes';
  const view: View = !party && !standalone ? 'party' : chosenView;
  const showPicker = picking || (!hasPlaces && !standalone);
  const shownNotice = notice === 'session_expired' || notice === 'guild_lost' ? NOTICES[notice] : null;
  const { current } = state.queue;
  const ownBan = party ? bannedUntilOf(party) : null;
  if (view !== lastView.current) {
    slide.current = VIEW_ORDER.indexOf(view) < VIEW_ORDER.indexOf(lastView.current) ? -SLIDE_PX : SLIDE_PX;
    lastView.current = view;
  }

  const page = (
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
        {incomingBusy && (
          <p className="banner" role="status" data-testid="incoming-busy">
            Récupération du média…
          </p>
        )}
        {incomingNote && (
          <p className="banner is-error" role="alert" data-testid="incoming-note">
            {incomingNote}
          </p>
        )}
        {state.settings.clean && (
          <div className="banner is-clean" role="status" data-testid="clean-banner">
            <span>
              Mode clean actif : rien ne s’affiche ni ne s’entend chez toi. <span className="mono">{keyLabel(state.settings.cleanKey)}</span> pour revenir.
            </span>
            <button type="button" className="pill primary small" onClick={() => void window.liveChat.setClean(false)}>
              Désactiver
            </button>
          </div>
        )}
        {state.unavailableKeys.includes(state.settings.cleanKey) && (
          <p className="banner is-error" role="status" data-testid="clean-key-taken">
            Une autre app utilise déjà <span className="mono">{keyLabel(state.settings.cleanKey)}</span>. Choisis une autre touche pour le mode clean dans Réglages, Raccourcis.
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
        <div className="views" hidden={showPicker} style={{ '--slide': `${slide.current}px` } as CSSProperties}>
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

  return (
    <>
      {launchLogo}
      {page}
      {dropping && (
        <div className="drop-veil" data-testid="drop-veil">
          Lâche ici
        </div>
      )}
    </>
  );
};
