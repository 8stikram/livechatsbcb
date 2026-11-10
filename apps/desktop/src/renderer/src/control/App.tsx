import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_DISPLAY_MS, MAX_CAPTION_LENGTH } from '@livechatsbcb/protocol';
import { keyLabel, type EditResult, type GameView, type IncomingResult } from '../../../shared/ipc';
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
import { GamesScreen, gameIsLive } from './GamesScreen';
import { ServerRail } from './ServerRail';
import { SettingsScreen } from './SettingsScreen';
import { Tour } from './Tour';
import { UpdateBanner } from './UpdateBanner';
import { useDraft } from './use-draft';
import { useScene } from './use-scene';

const NOTICES = {
  session_expired: 'Tu ne fais plus partie de ta party privée.',
  guild_lost: "Tu n'es plus sur ce serveur Discord.",
} as const;

// The order they sit in, so that a tab further along comes in from the right.
const VIEW_ORDER: View[] = ['media', 'party', 'library', 'history', 'games', 'settings', 'notes'];
const SLIDE_PX = 18;
const LAUNCH_MS = 860;

import { findLink } from '../../../shared/links';

const LINK = /^https?:\/\/\S+$/i;
const MEDIA_LINK = /\.(png|jpe?g|gif|webp|mp4|m4v|mov|webm|mp3|ogg|opus|wav|m4a|flac)$/i;

const looksLikeMedia = (link: string): boolean => {
  if (findLink(link)) return true;
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
  const [chosenView, setShownView] = useState<View>('media');
  const shownView = useRef<View>('media');
  shownView.current = chosenView;
  // Changing tab is one movement: the frames both pages have change shape into each other, the others leave and come
  // in by their side, all on the axis of the tabs. Pages are snapshots meanwhile, so it stays smooth on any PC.
  const setChosenView = (next: View) => {
    const from = shownView.current;
    if (next === from) return;
    const calm = document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm || !document.startViewTransition) {
      setShownView(next);
      return;
    }
    const forward = VIEW_ORDER.indexOf(next) > VIEW_ORDER.indexOf(from);
    try {
      document.startViewTransition({ update: () => flushSync(() => setShownView(next)), types: [forward ? 'forward' : 'back'] });
    } catch {
      setShownView(next);
    }
  };
  // Whose LiveChats the history shows. Null for everybody's.
  const [historyFrom, setHistoryFrom] = useState<string | null>(null);
  const [whisperTo, setWhisperTo] = useState<string[]>([]);

  // The ring around whoever sent what plays moves with what the overlay hears, without drawing the app again.
  useEffect(
    () =>
      window.liveChat.onLiveLevel((level) => {
        const root = document.documentElement;
        root.style.setProperty('--live-level', Math.max(0, level).toFixed(3));
        root.classList.toggle('live-pulse', level < 0);
      }),
    [],
  );
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

  // The living background rests whenever the app isn't in front: nothing moves for nobody, and games keep the GPU.
  useEffect(() => {
    const sync = () => document.documentElement.classList.toggle('is-away', document.hidden || !document.hasFocus());
    sync();
    window.addEventListener('focus', sync);
    window.addEventListener('blur', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('focus', sync);
      window.removeEventListener('blur', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

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

  // An answer to the question game, made in LiveChat avancé with the question as its text.
  const [gameAnswer, setGameAnswer] = useState<{ gameId: string; prompt: string } | null>(null);
  const answerGame = async (game: GameView) => {
    setGameAnswer({ gameId: game.id, prompt: game.prompt });
    files.setCaption(game.prompt.slice(0, MAX_CAPTION_LENGTH));
    setPicking(false);
    setChosenView('media');
    if (!scene.active) {
      const problem = await scene.enter(null, false);
      if (problem) setIncomingNote(problem);
    }
  };
  const answering = state?.game?.id === gameAnswer?.gameId && state?.game?.phase === 'collect';
  useEffect(() => {
    if (gameAnswer && !answering) setGameAnswer(null);
  }, [gameAnswer, answering]);

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
    if ('link' in result) {
      // In the advanced mode, its player becomes an element to place like a picture.
      const problem = scene.active ? scene.ensureLink(result.link.site) : null;
      if (problem) setIncomingNote(problem);
      else files.setLink(result.link);
    } else if ('scene' in result) void scene.addIncoming(result.scene).then(setIncomingNote);
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

  // Always in the advanced mode, with what the simple mode would have shown already placed.
  const editInAdvanced = async (loading: Promise<EditResult>): Promise<boolean> => {
    const result = await loading;
    if (!result.ok) return false;
    setPicking(false);
    setChosenView('media');
    loadInEditor(result, files, scene);
    if ('draft' in result) {
      const { picture, sound, clipStartMs, durationMs } = result.draft;
      const plays = sound !== null || picture?.kind === 'video';
      const passage = plays ? { startMs: clipStartMs, endMs: clipStartMs + durationMs } : null;
      const problem = await scene.openWith(await window.liveChat.startScene(), passage, result.draft.videoMuted);
      if (problem) setIncomingNote(problem);
    }
    return true;
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

      // On the games tab, while a game waits for pictures, what is pasted goes to the game.
      const game = state.game;
      const me = state.party.memberId;
      const takesPictures =
        game !== null &&
        game.players.includes(me) &&
        (game.kind === 'guess' ? game.phase === 'write' && game.round === 3 && game.turn === me : game.phase === 'collect');
      if (view === 'games' && game && takesPictures) {
        const image = pasted[0];
        if (!image) return;
        event.preventDefault();
        const paths = pasted.map((file) => window.liveChat.pathForFile(file)).filter((path) => path !== '');
        const sent =
          paths.length > 0
            ? window.liveChat.sendGamePaste(game.id, paths, null, '', '')
            : image
                .arrayBuffer()
                .then((bytes) => window.liveChat.sendGamePaste(game.id, null, new Uint8Array(bytes), image.type, image.name || 'Image collée.png'));
        void sent.then((result) => {
          if (!result.ok && result.error !== 'cancelled') setIncomingNote('Cette image n’a pas pu aller au jeu.');
        });
        return;
      }

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

  const onPicked = useRef(bringIn);
  onPicked.current = bringIn;
  useEffect(() => window.liveChat.onLinkPicked((result) => onPicked.current(result)), []);

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
          <UpdateBanner update={state.update} restartIn={restartIn} failed={state.updateFailed} />
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
        {!showPicker && <Header party={party} view={view} joinError={joinError} gameLive={gameIsLive(state)} onView={setChosenView} />}

        <UpdateBanner update={state.update} restartIn={restartIn} failed={state.updateFailed} />
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
        {state.skippedBy && (
          <p className="banner" role="status" data-testid="skipped-by">
            Passé par {state.skippedBy}
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
        {state.settings.cleanKey !== null && state.unavailableKeys.includes(state.settings.cleanKey) && (
          <p className="banner is-error" role="status" data-testid="clean-key-taken">
            {/* One piece of text: the banner spreads its parts apart. */}
            <span>
              Une autre app utilise déjà <span className="mono">{keyLabel(state.settings.cleanKey)}</span>. Choisis une autre touche pour Arrêter dans Réglages, Raccourcis.
            </span>
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
              <PartyScreen
                state={state}
                party={party}
                active={view === 'party' && !showPicker}
                onOpenHistory={(memberId) => {
                  setHistoryFrom(memberId);
                  setChosenView('history');
                }}
                onWhisper={(memberId) => {
                  setWhisperTo([memberId]);
                  setChosenView('media');
                }}
              />
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
                  whisperTo={whisperTo}
                  onWhisperTo={setWhisperTo}
                  gameAnswer={answering ? gameAnswer : null}
                  onGameAnswer={(sent) => {
                    setGameAnswer(null);
                    if (sent) setChosenView('games');
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
                  onBringIn={(pasted) => void waitFor(pasted)}
                />
              </div>
              <div className="view" hidden={view !== 'history'}>
                <HistoryScreen state={state} active={view === 'history'} onEdit={editInAdvanced} from={historyFrom} onFrom={setHistoryFrom} />
              </div>
              <div className="view" hidden={view !== 'games'}>
                <GamesScreen state={state} party={party} active={view === 'games' && !showPicker} onAnswer={(game) => void answerGame(game)} />
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
      {party && !showPicker && !state.settings.tutorialDone && (
        <Tour
          settings={state.settings}
          onView={setChosenView}
          onDone={() => void window.liveChat.setSettings({ tutorialDone: true })}
        />
      )}
      {dropping && (
        <div className="drop-veil" data-testid="drop-veil">
          Lâche ici
        </div>
      )}
    </>
  );
};
