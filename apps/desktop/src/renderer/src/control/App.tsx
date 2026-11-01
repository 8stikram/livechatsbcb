import { useEffect, useState } from 'react';
import { useAppState } from '../use-app-state';
import { HomeScreen } from './HomeScreen';
import { LoginScreen } from './LoginScreen';
import { MediaScreen } from './MediaScreen';
import { PartyScreen } from './PartyScreen';
import { SettingsScreen } from './SettingsScreen';
import { UpdateBanner } from './UpdateBanner';

type Tab = 'main' | 'party' | 'media' | 'settings';

export const App = () => {
  const state = useAppState();
  const [chosenTab, setChosenTab] = useState<Tab>('main');
  const partyId = state?.party?.partyId;

  // Whoever just entered a party wants to see it.
  useEffect(() => {
    if (partyId) setChosenTab('party');
  }, [partyId]);

  if (!state) return null;

  const { account, party } = state;
  const tabs: Array<[Tab, string]> = [
    ['main', 'Accueil'],
    ...(party
      ? ([
          ['party', 'Party'],
          ['media', 'Médias'],
        ] as Array<[Tab, string]>)
      : []),
    ['settings', 'Réglages'],
  ];
  const tab = !party && (chosenTab === 'party' || chosenTab === 'media') ? 'main' : chosenTab;

  return (
    <div className="app">
      <UpdateBanner update={state.update} />
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

      {/* Kept mounted but hidden, so that a change of tab doesn't lose a media being prepared. */}
      <div className="tab-panel" hidden={tab !== 'main'}>
        {account ? (
          <HomeScreen state={state} account={account} onShowParty={() => setChosenTab('party')} />
        ) : (
          <LoginScreen state={state} />
        )}
      </div>
      {party && (
        <>
          <div className="tab-panel" hidden={tab !== 'party'}>
            <PartyScreen state={state} party={party} />
          </div>
          <div className="tab-panel" hidden={tab !== 'media'}>
            <MediaScreen state={state} />
          </div>
        </>
      )}
      <div className="tab-panel" hidden={tab !== 'settings'}>
        <SettingsScreen state={state} />
      </div>
    </div>
  );
};
