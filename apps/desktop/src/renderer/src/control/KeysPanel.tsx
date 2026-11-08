import { useState, type ReactNode } from 'react';
import type { ActionKey, AppState, KeyChange, LibraryView } from '../../../shared/ipc';
import { ConfirmButton } from './ConfirmButton';
import { KeyButton, useKeyCapture } from './KeyButton';
import { playLengthMs } from './play-length';
import { WheelEditor } from './WheelEditor';

const KeyRow = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="key-row">
    <span className="key-row-name">{label}</span>
    {children}
  </div>
);

export const keyChangeNote = (change: KeyChange): string | null => {
  if (!change.ok) return 'Une autre app utilise déjà cette touche.';
  return change.took ? `Cette touche servait à « ${change.took} », qui n’a plus de touche.` : null;
};

type Giving = { name: string; give: (key: string) => Promise<{ change: KeyChange }> };

// Two frames: the app's own keys, then the LiveChats sent with one press. Everything else waits behind a click.
export const KeysPanel = ({ state }: { state: AppState }) => {
  const { settings, keyTest } = state;
  const [note, setNote] = useState<string | null>(null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [library, setLibrary] = useState<LibraryView | null>(null);
  const [search, setSearch] = useState('');
  const [giving, setGiving] = useState<Giving | null>(null);

  const report = (change: KeyChange) => setNote(keyChangeNote(change));

  useKeyCapture(
    giving !== null,
    (key) => {
      const current = giving;
      setGiving(null);
      void current?.give(key).then(({ change }) => report(change));
    },
    () => setGiving(null),
  );

  const banned = (key: string | null) =>
    key !== null && state.unavailableKeys.includes(key) && <span className="row-sub is-banned"> Prise par une autre app</span>;

  const actionRow = (which: ActionKey, label: string, testId: string, extra?: ReactNode) => (
    <KeyRow
      label={
        <>
          {label}
          {banned(settings[which])}
        </>
      }
    >
      <KeyButton current={settings[which]} testId={testId} onChoose={(key) => void window.liveChat.setActionKey(which, key).then(report)} />
      {settings[which] !== null && (
        <button
          type="button"
          className="pill quiet small key-clear"
          aria-label={`Retirer la touche : ${label}`}
          title="Retirer la touche"
          onClick={() => void window.liveChat.setActionKey(which, null).then(report)}
        >
          ×
        </button>
      )}
      {extra}
    </KeyRow>
  );

  const toggleChooser = async () => {
    setNote(null);
    setSearch('');
    if (library) {
      setLibrary(null);
      return;
    }
    setLibrary(await window.liveChat.scanLibrary());
  };

  const matches = (name: string) => name.toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr'));

  const chooseFile = async (file: LibraryView['files'][number]) => {
    // A file sent alone needs its length, which only a page can measure.
    const length = await playLengthMs(file);
    if (length === null) {
      setNote('Ce fichier ne peut pas être lu. Essaie un autre format.');
      return;
    }
    setLibrary(null);
    setGiving({ name: file.name, give: (key) => window.liveChat.assignFileShortcut(file.id, key, length) });
  };

  const chooseSaved = (saved: LibraryView['saved'][number]) => {
    setLibrary(null);
    setGiving({ name: saved.name, give: (key) => window.liveChat.assignSavedShortcut(saved.id, key) });
  };

  return (
    <>
      {note && (
        <p className="hint" role="status" data-testid="key-note">
          {note}
        </p>
      )}

      <section className="glass panel" aria-labelledby="my-keys-title">
        <h2 id="my-keys-title">Mes touches</h2>
        {actionRow('cleanKey', 'Mode clean (tout couper chez moi)', 'clean-key')}
        {actionRow('skipKey', 'Passer pour tout le monde', 'skip-key')}
        {actionRow('skipMineKey', 'Passer pour moi', 'skip-mine-key')}
        {actionRow(
          'wheelKey',
          'Ouvrir la roue',
          'wheel-key',
          <button type="button" className="pill quiet small" aria-expanded={wheelOpen} onClick={() => setWheelOpen(!wheelOpen)}>
            {wheelOpen ? 'Fermer la roue' : 'Remplir la roue ›'}
          </button>,
        )}
        {wheelOpen && (
          <div className="keys-wheel">
            <WheelEditor slots={state.wheel.slots} />
            <p className="hint">Vise avec la souris, clique pour envoyer. Ne marche pas dans les jeux qui bloquent la souris.</p>
          </div>
        )}
      </section>

      <section className="glass panel" aria-labelledby="keys-title">
        <h2 id="keys-title" className="keys-title">
          Mes LiveChats en un appui
          <button
            type="button"
            className="pill quiet small keys-more"
            aria-label="Options des touches"
            aria-expanded={optionsOpen}
            onClick={() => setOptionsOpen(!optionsOpen)}
          >
            ⋯
          </button>
        </h2>

        {optionsOpen && (
          <div className="keys-options">
            <span className="key-row-name">Si un autre LiveChat passe déjà, ma touche</span>
            <div className="tabs" role="group" aria-label="Pendant un autre LiveChat">
              <button
                type="button"
                className={settings.keyWhilePlaying === 'wait' ? 'tab is-active' : 'tab'}
                aria-pressed={settings.keyWhilePlaying === 'wait'}
                onClick={() => void window.liveChat.setSettings({ keyWhilePlaying: 'wait' })}
              >
                Attend son tour
              </button>
              <button
                type="button"
                className={settings.keyWhilePlaying === 'replace' ? 'tab is-active' : 'tab'}
                aria-pressed={settings.keyWhilePlaying === 'replace'}
                data-testid="key-replace"
                onClick={() => void window.liveChat.setSettings({ keyWhilePlaying: 'replace' })}
              >
                Passe celui en cours
              </button>
            </div>
            <p className="hint">3 secondes minimum entre deux envois par touche.</p>
          </div>
        )}

        {state.shortcuts.length > 0 && (
          <div data-testid="shortcut-list">
            {state.shortcuts.map(({ key, name }) => (
              <KeyRow
                key={key}
                label={
                  <>
                    <span title={name}>{name}</span>
                    {banned(key)}
                  </>
                }
              >
                <KeyButton current={key} onChoose={(next) => void window.liveChat.changeShortcutKey(key, next).then(report)} />
                <button type="button" className="pill quiet small" onClick={() => void window.liveChat.clearShortcut(key)}>
                  Retirer
                </button>
              </KeyRow>
            ))}
          </div>
        )}

        {giving ? (
          <p className="banner" role="status" data-testid="give-key">
            Appuie sur la touche pour « {giving.name} ». Échap pour annuler.
          </p>
        ) : (
          <button type="button" className="keys-add" aria-expanded={library !== null} onClick={() => void toggleChooser()}>
            {library ? 'Annuler' : '+ Ajouter un LiveChat'}
          </button>
        )}

        {library && (
          <div className="wheel-choices">
            <input
              className="input"
              type="search"
              aria-label="Chercher un LiveChat"
              placeholder="Rechercher"
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {library.saved.length + library.files.length === 0 && <p className="hint">Ta bibliothèque est vide.</p>}
            <ul className="wheel-choice-list">
              {library.saved
                .filter(({ name }) => matches(name))
                .map((saved) => (
                  <li key={saved.id}>
                    <button type="button" className="pill quiet small wheel-choice" data-testid="key-choice" onClick={() => chooseSaved(saved)}>
                      {saved.name}
                    </button>
                  </li>
                ))}
              {library.files
                .filter(({ name }) => matches(name))
                .map((file) => (
                  <li key={file.id}>
                    <button type="button" className="pill quiet small wheel-choice" data-testid="key-choice" onClick={() => void chooseFile(file)}>
                      {file.name}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <div className="keys-tools">
        <span className="hint" role="status" data-testid="key-test">
          {!keyTest ? 'Une touche marche même en plein jeu.' : keyTest.heard ? `Reçu : ${keyTest.heard}` : 'Appuie sur une touche, même depuis un jeu…'}
        </span>
        <button type="button" className="pill quiet small" onClick={() => void window.liveChat.testKeys(!keyTest)}>
          {keyTest ? 'Arrêter le test' : 'Tester une touche'}
        </button>
        <ConfirmButton
          label="Tout remettre par défaut"
          confirmLabel="Vraiment ?"
          onConfirm={() => {
            setNote(null);
            void window.liveChat.resetKeys();
          }}
        />
      </div>
    </>
  );
};
