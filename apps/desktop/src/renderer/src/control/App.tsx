import { useState } from 'react';
import { useAppState } from '../use-app-state';
import { HomeScreen } from './HomeScreen';
import { MediaScreen } from './MediaScreen';
import { PartyScreen } from './PartyScreen';
import { SettingsScreen } from './SettingsScreen';
import { UpdateBanner } from './UpdateBanner';

type Tab = 'main' | 'media' | 'settings';

export const App = () => {
  const state = useAppState();
  const [chosenTab, setChosenTab] = useState<Tab>('main');
  if (!state) return null;

  const { party } = state;
  const tabs: Array<[Tab, string]> = party
    ? [
        ['main', 'Party'],
        ['media', 'Médias'],
        ['settings', 'Réglages'],
      ]
    : [
        ['main', 'Accueil'],
        ['settings', 'Réglages'],
      ];
  const tab = chosenTab === 'media' && !party ? 'main' : chosenTab;

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
        {party ? <PartyScreen state={state} party={party} /> : <HomeScreen state={state} />}
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
  );
};
