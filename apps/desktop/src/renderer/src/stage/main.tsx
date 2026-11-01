import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppState } from '../use-app-state';
import logo from '../assets/logo.png';
import '../styles.css';

const Stage = () => {
  const state = useAppState();
  const isOnline = state?.party?.connection === 'online';

  return (
    <main className="stage">
      <img src={logo} alt="" className="stage-logo" />
      <p data-testid="stage-status">{isOnline ? 'En attente d’un média…' : 'Pas connecté à une party'}</p>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage />
  </StrictMode>,
);
