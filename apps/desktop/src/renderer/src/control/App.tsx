import { useEffect, useState } from 'react';
import { useAppState } from '../use-app-state';
import { GuildPicker } from './GuildPicker';
import { Header, type View } from './Header';
import { HistoryScreen } from './HistoryScreen';
import { LoginScreen } from './LoginScreen';
import { MediaScreen } from './MediaScreen';
import { errorMessage } from './messages';
import { NowBar } from './NowPlaying';
import { PartyScreen } from './PartyScreen';
import { ServerRail } from './ServerRail';
import { SettingsScreen } from './SettingsScreen';
import { UpdateBanner } from './UpdateBanner';
import { useDraft } from './use-draft';

const NOTICES = {
  session_expired: 'Tu ne fais plus partie de ta party privée.',
  guild_lost: "Tu n'es plus sur ce serveur Discord.",
} as const;

export const App = () => {
  const state = useAppState();
  const files = useDraft();
  const [chosenView, setChosenView] = useState<View>('party');
  const [picking, setPicking] = useState(false);
  const partyId = state?.party?.partyId;

  // Whoever just entered a party wants to see it.
  useEffect(() => {
    if (!partyId) return;
    setChosenView('party');
    setPicking(false);
  }, [partyId]);

  // Whoever just logged out is back at the start, wherever they did it from.
  const loggedOut = state !== null && state.account === null;
  useEffect(() => {
    if (!loggedOut) return;
    setChosenView('party');
    setPicking(false);
    files.reset();
  }, [loggedOut]);

  if (!state) return null;

  const { account, addedGuilds, party, notice, joinError } = state;

  if (!account) {
    return (
      <div className="app is-login">
        <UpdateBanner update={state.update} />
        <LoginScreen state={state} />
      </div>
    );
  }

  const hasPlaces = addedGuilds.length > 0 || state.hasPrivateParty || party !== null;
  const view: View = !party && chosenView !== 'settings' ? 'party' : chosenView;
  const showPicker = picking || (!hasPlaces && view !== 'settings');
  const shownNotice = notice === 'session_expired' || notice === 'guild_lost' ? NOTICES[notice] : null;
  const { current } = state.queue;

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

        <UpdateBanner update={state.update} />
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
              <PartyScreen
                state={state}
                party={party}
                files={files}
                active={view === 'party' && !showPicker}
                onOpenMedia={() => setChosenView('media')}
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
                <MediaScreen state={state} files={files} />
              </div>
              <div className="view" hidden={view !== 'history'}>
                <HistoryScreen state={state} active={view === 'history'} />
              </div>
            </>
          )}
          <div className="view" hidden={view !== 'settings'}>
            <SettingsScreen state={state} />
          </div>
        </div>

        {party && current && !showPicker && (view === 'media' || view === 'history') && (
          <NowBar current={current} waiting={state.queue.upcoming.length} settings={state.settings} />
        )}
      </div>
    </div>
  );
};
