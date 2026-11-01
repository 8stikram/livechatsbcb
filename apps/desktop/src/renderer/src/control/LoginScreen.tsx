import { useState } from 'react';
import type { AppState } from '../../../shared/ipc';
import logo from '../assets/logo.png';
import { IconDiscord } from './icons';
import { errorMessage } from './messages';

export const LoginScreen = ({ state }: { state: AppState }) => {
  const [error, setError] = useState<string | null>(null);

  const login = async () => {
    setError(null);
    const result = await window.liveChat.login();
    if (!result.ok && result.error !== 'cancelled') setError(errorMessage(result.error));
  };

  return (
    <div className="login">
      <span className="login-shade" aria-hidden="true" />
      <main className="login-card">
        <img className="login-logo" src={logo} alt="" width={72} height={72} />
        <div>
          <h1>LiveChatSBCB</h1>
          <p className="login-tagline">Ce que tu envoies s'affiche chez tout le monde, au même moment.</p>
        </div>

        {state.notice === 'account_expired' && (
          <p className="banner" role="status">
            Ta connexion a expiré. Reconnecte-toi avec Discord.
          </p>
        )}

        {state.loggingIn ? (
          <div className="login-waiting">
            <p role="status" data-testid="login-waiting">
              <span className="spinner" aria-hidden="true" />
              Termine la connexion dans ton navigateur, puis reviens ici.
            </p>
            <button type="button" className="pill secondary is-wide" onClick={() => void window.liveChat.cancelLogin()}>
              Annuler
            </button>
          </div>
        ) : (
          <button type="button" className="pill primary is-large is-wide" onClick={() => void login()}>
            <IconDiscord />
            Se connecter avec Discord
          </button>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <p className="login-fine">
          L'app voit ton pseudo, ta photo et la liste de tes serveurs. Jamais ton mot de passe ni tes messages.
        </p>
      </main>
      <p className="login-version mono">Version {state.version}</p>
    </div>
  );
};
