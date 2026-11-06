import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Account } from '@livechatsbcb/protocol';
import type { OverlayLayout } from '../../../shared/ipc';
import { Caption, Playing, Profile, zoneStyle } from '../scene';
import { Wheel } from './Wheel';
import { useAppState } from '../use-app-state';
import logo from '../assets/logo.png';
import '../styles.css';

const TestScene = ({ layout, account }: { layout: OverlayLayout; account: Account | null }) => (
  <div className="scene" data-testid="overlay-test">
    <Profile name={account?.name ?? 'Ton pseudo'} avatarUrl={account?.avatarUrl ?? null} zone={layout.profile} />
    <div className="zone zone-media" style={zoneStyle(layout.media)}>
      <img className="overlay-media" src={logo} alt="" />
    </div>
    <Caption text="Ceci est un texte de test" zone={layout.text} />
  </div>
);

const Stage = () => {
  const state = useAppState();
  if (!state) return null;

  const { settings, overlayTest } = state;
  const { current } = state.queue;
  const shared = settings.overlayEnabled && current?.startAt != null && !current.hiddenForMe ? current : null;
  const replay = state.localReplay?.playback ?? null;
  const playing = shared ?? replay;
  const volume = settings.muted ? 0 : settings.volume / 100;
  const scene = shared ? 'playing' : replay ? 'replay' : overlayTest ? 'test' : 'idle';

  return (
    <main className="stage" data-testid="stage" data-state={scene}>
      {playing && (
        <Playing
          key={playing.id}
          item={playing}
          startAt={playing.startAt!}
          layout={settings.layout}
          volume={volume}
          speech={settings.speechEnabled ? { voice: settings.speechVoice, rate: settings.speechRate } : null}
          onLevel={shared ? (level) => window.liveChat.reportLevel(level) : undefined}
        />
      )}
      {!playing && overlayTest && <TestScene layout={settings.layout} account={state.account} />}
      {state.wheel.open && <Wheel wheel={state.wheel} />}
    </main>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Stage />
  </StrictMode>,
);
