import { useEffect, useState } from 'react';
import { useAppState } from '../use-app-state';
import { GuildPicker } from './GuildPicker';
import { LoginScreen } from './LoginScreen';
import { MediaScreen } from './MediaScreen';
import { errorMessage } from './messages';
import { PartyScreen } from './PartyScreen';
import { ServerRail } from './ServerRail';
import { SettingsScreen } from './SettingsScreen';
import { UpdateBanner } from './UpdateBanner';

type Tab = 'main' | 'media' | 'settings';

const NOTICES = {
  session_expired: 'Tu ne fais plus partie de ta party privée.',
  guild_lost: "Tu n'es plus sur ce serveur Discord.",
} as const;

export const App = () => {
  const state = useAppState();
  const [chosenTab, setChosenTab] = useState<Tab>('main');
  const [picking, setPicking] = useState(false);
  const partyId = state?.party?.partyId;

  // Whoever just entered a party wants to see it.
  useEffect(() => {
    if (!partyId) return;
    setChosenTab('main');
    setPicking(false);
  }, [partyId]);

  // Whoever just logged out is back at the start, wherever they did it from.
  const loggedOut = state !== null && state.account === null;
  useEffect(() => {
    if (!loggedOut) return;
    setChosenTab('main');
    setPicking(false);
  }, [loggedOut]);

  if (!state) return null;

  const { account, addedGuilds, party, notice, joinError } = state;
  const hasPlaces = addedGuilds.length > 0 || state.hasPrivateParty || party !== null;
  const showPicker = account !== null && (picking || !hasPlaces);

  const tabs: Array<[Tab, string]> = [
    ['main', account ? 'Party' : 'Accueil'],
    ...(party ? ([['media', 'Médias']] as Array<[Tab, string]>) : []),
    ['settings', 'Réglages'],
  ];
  const tab = !party && chosenTab === 'media' ? 'main' : chosenTab;
  const shownNotice = notice === 'session_expired' || notice === 'guild_lost' ? NOTICES[notice] : null;

  return (
    <div className="app">
      <UpdateBanner update={state.update} />
      <div className="app-body">
        {account && hasPlaces && (
          <ServerRail
            state={state}
            picking={showPicker}
            onShowParty={() => {
              setPicking(false);
              setChosenTab('main');
            }}
            onAdd={() => setPicking(true)}
          />
        )}

        <div className="app-main">
          {account && shownNotice && (
            <p className="banner notice" role="status" data-testid="notice">
              {shownNotice}
            </p>
          )}
          {account && joinError && (
            <p className="error notice" role="alert" data-testid="join-error">
              {errorMessage(joinError)}
            </p>
          )}

          {showPicker && <GuildPicker state={state} onClose={() => setPicking(false)} />}

          {/* Kept mounted but hidden, so that going elsewhere doesn't lose a media being prepared. */}
          <div className="tabbed" hidden={showPicker}>
            <nav className="tabs" role="tablist">
              {tabs.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  className={id === tab ? 'tab is-active' : 'tab'}
                  aria-selected={id === tab}
                  onClick={() => setChosenTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className="tab-panel" hidden={tab !== 'main'}>
              {!account && <LoginScreen state={state} />}
              {account && party && <PartyScreen state={state} party={party} />}
              {account && !party && (
                <main className="screen">
                  <p className="hint" data-testid="no-party">
                    {joinError ? 'Clique sur un serveur pour réessayer.' : 'Connexion au serveur…'}
                  </p>
                </main>
              )}
            </div>
            {party && (
              <div className="tab-panel" hidden={tab !== 'media'}>
                <MediaScreen state={state} />
              </div>
            )}
            <div className="tab-panel" hidden={tab !== 'settings'}>
              <SettingsScreen state={state} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
