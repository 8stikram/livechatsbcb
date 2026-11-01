import { useState, type FormEvent } from 'react';
import { CODE_LENGTH, MAX_NAME_LENGTH, normalizeCode } from '@livechatsbcb/protocol';
import type { ActionResult, AppState } from '../../../shared/ipc';
import logo from '../assets/logo.png';
import { errorMessage } from './messages';

export const HomeScreen = ({ state }: { state: AppState }) => {
  const [name, setName] = useState(state.lastName);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasName = name.trim().length > 0;

  const run = async (action: () => Promise<ActionResult>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) setError(errorMessage(result.error));
    setBusy(false);
  };

  const join = (event: FormEvent) => {
    event.preventDefault();
    void run(() => window.liveChat.joinParty(code, name));
  };

  return (
    <main className="screen home">
      <header className="brand">
        <img src={logo} alt="" width={88} height={88} />
        <h1>LiveChatSBCB</h1>
      </header>

      {state.notice === 'session_expired' && (
        <p className="banner" role="status">
          Tu ne fais plus partie de ta party précédente. Rejoins-la avec son code.
        </p>
      )}

      <label className="field">
        <span>Ton pseudo</span>
        <input
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="Comment tes potes t'appellent"
        />
      </label>

      <form className="panel" onSubmit={join}>
        <label className="field">
          <span>Code de la party</span>
          <input
            className="code-input"
            value={code}
            maxLength={CODE_LENGTH + 2}
            spellCheck={false}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            placeholder="K7M2QX"
          />
        </label>
        <button className="primary" type="submit" disabled={busy || !hasName || code.length !== CODE_LENGTH}>
          Rejoindre
        </button>
      </form>

      <div className="divider">ou</div>

      <button
        className="secondary"
        type="button"
        disabled={busy || !hasName}
        onClick={() => void run(() => window.liveChat.createParty(name))}
      >
        Créer une nouvelle party
      </button>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="version">Version {state.version}</footer>
    </main>
  );
};
