import { useAppState } from '../use-app-state';
import { HomeScreen } from './HomeScreen';
import { PartyScreen } from './PartyScreen';

export const App = () => {
  const state = useAppState();
  if (!state) return null;

  return state.party ? <PartyScreen state={state} party={state.party} /> : <HomeScreen state={state} />;
};
