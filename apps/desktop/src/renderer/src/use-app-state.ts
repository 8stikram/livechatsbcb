import { useEffect, useState } from 'react';
import type { AppState } from '../../shared/ipc';

export const useAppState = (): AppState | null => {
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    const unsubscribe = window.liveChat.onState(setState);
    void window.liveChat.getState().then(setState);
    return unsubscribe;
  }, []);

  return state;
};
