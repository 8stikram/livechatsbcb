import { useAppState } from '../use-app-state';
import { HomeScreen } from './HomeScreen';
import { PartyScreen } from './PartyScreen';
import { UpdateBanner } from './UpdateBanner';

export const App = () => {
  const state = useAppState();
  if (!state) return null;

  return (
    <div className="app">
      <UpdateBanner update={state.update} />
      {state.party ? <PartyScreen state={state} party={state.party} /> : <HomeScreen state={state} />}
    </div>
  );
};
