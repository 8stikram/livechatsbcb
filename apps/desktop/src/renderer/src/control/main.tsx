import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist/wght.css';
import '@fontsource-variable/geist-mono/wght.css';
import { ON_MAC } from '../../../shared/ipc';
import { App } from './App';
import '../styles.css';

if (location.search === '?see-through') document.documentElement.classList.add('see-through');
if (ON_MAC) document.documentElement.classList.add('mac');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
