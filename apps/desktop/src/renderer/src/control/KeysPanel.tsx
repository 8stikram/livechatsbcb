import { useState, type ReactNode } from 'react';
import type { ActionKey, AppState, KeyChange } from '../../../shared/ipc';
import { ConfirmButton } from './ConfirmButton';
import { KeyButton } from './KeyButton';
import { Switch } from './SettingsScreen';
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

// Every key on one page, by what it is for: the name on the left, the key on the right, click and press.
export const KeysPanel = ({ state }: { state: AppState }) => {
  const { settings, keyTest } = state;
  const [note, setNote] = useState<string | null>(null);

  const banned = (key: string | null) =>
    key !== null && state.unavailableKeys.includes(key) && <span className="row-sub is-banned"> Prise par une autre app</span>;

  const report = (change: KeyChange) => setNote(keyChangeNote(change));

  const actionRow = (which: ActionKey, label: string, testId: string) => (
    <KeyRow
      label={
        <>
          {label}
          {banned(settings[which])}
        </>
      }
    >
      <KeyButton current={settings[which]} testId={testId} onChoose={(key) => void window.liveChat.setActionKey(which, key).then(report)} />
      <button
        type="button"
        className="pill quiet small"
        disabled={settings[which] === null}
        onClick={() => void window.liveChat.setActionKey(which, null).then(report)}
      >
        Retirer
      </button>
    </KeyRow>
  );

  return (
    <>
      {note && (
        <p className="hint" role="status" data-testid="key-note">
          {note}
        </p>
      )}

      <section className="glass panel" aria-labelledby="clean-title">
        <h2 id="clean-title">Général</h2>
        <Switch checked={settings.clean} onChange={(clean) => void window.liveChat.setClean(clean)}>
          Mode clean : tout couper chez moi, son, image, affichage en jeu
        </Switch>
        {actionRow('cleanKey', 'Mode clean', 'clean-key')}
        <p className="hint">Une touche marche même en plein jeu. Les autres ne voient rien.</p>
      </section>

      <section className="glass panel" aria-labelledby="skip-title">
        <h2 id="skip-title">Passer</h2>
        {actionRow('skipKey', 'Passer pour tout le monde', 'skip-key')}
        {actionRow('skipMineKey', 'Passer pour moi', 'skip-mine-key')}
      </section>

      <section className="glass panel" aria-labelledby="wheel-title">
        <h2 id="wheel-title">Roue</h2>
        {actionRow('wheelKey', 'Ouvrir la roue', 'wheel-key')}
        <WheelEditor slots={state.wheel.slots} />
        <p className="hint">La touche ouvre la roue. Vise avec la souris, clique pour envoyer. Dans les jeux qui bloquent la souris, le curseur ne bouge pas : la roue ne peut pas servir.</p>
      </section>

      <section className="glass panel" aria-labelledby="keys-title">
        <h2 id="keys-title">Mes LiveChats</h2>
        {state.shortcuts.length === 0 ? (
          <p className="hint">Aucune touche pour l’instant. Dans la bibliothèque, fais un clic droit sur un fichier ou un LiveChat sauvegardé, puis Donner un raccourci.</p>
        ) : (
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
        <p className="hint">Un petit son confirme l’envoi. Il faut attendre 3 secondes entre deux envois par touche.</p>
      </section>

      <section className="glass panel" aria-labelledby="keys-tools-title">
        <h2 id="keys-tools-title">Outils</h2>
        <div className="key-row">
          <span className="key-row-name" role="status" data-testid="key-test">
            {!keyTest
              ? 'Vérifie qu’une touche marche, sans rien envoyer.'
              : keyTest.heard
                ? `Reçu : ${keyTest.heard}`
                : 'Appuie sur une touche, même depuis un jeu…'}
          </span>
          <button type="button" className="pill secondary small" onClick={() => void window.liveChat.testKeys(!keyTest)}>
            {keyTest ? 'Arrêter le test' : 'Tester une touche'}
          </button>
        </div>
        <div className="key-row">
          <span className="key-row-name hint">Les touches reviennent à zéro et tes LiveChats perdent la leur. La roue garde ce qu’elle contient.</span>
          <ConfirmButton
            label="Tout remettre par défaut"
            confirmLabel="Vraiment ?"
            onConfirm={() => {
              setNote(null);
              void window.liveChat.resetKeys();
            }}
          />
        </div>
      </section>
    </>
  );
};
