import { useState } from 'react';
import type { AppState } from '../../../shared/ipc';
import logo from '../assets/logo.png';
import { errorMessage } from './messages';

export const LoginScreen = ({ state }: { state: AppState }) => {
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setError(null);
    const result = await window.liveChat.login();
    if (!result.ok && result.error !== 'cancelled') setError(errorMessage(result.error));
  };

  return (
    <main className="screen home">
      <header className="brand">
        <img src={logo} alt="" width={88} height={88} />
        <h1>LiveChatSBCB</h1>
      </header>

      {state.notice === 'account_expired' && (
        <p className="banner" role="status">
          Ta connexion a expiré. Reconnecte-toi avec Discord.
        </p>
      )}

      <p className="hint">
        Connecte-toi avec ton compte Discord pour retrouver ton pseudo, ta photo et tes serveurs. L'app voit la liste de
        tes serveurs, mais jamais ton mot de passe ni tes messages.
      </p>

      {state.loggingIn ? (
        <>
          <p className="banner" role="status" data-testid="login-waiting">
            Termine la connexion dans ton navigateur, puis reviens ici.
          </p>
          <button type="button" className="secondary" onClick={() => void window.liveChat.cancelLogin()}>
            Annuler
          </button>
        </>
      ) : (
        <button type="button" className="primary" onClick={() => void login()}>
          Se connecter avec Discord
        </button>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="version">Version {state.version}</footer>
    </main>
  );
};
