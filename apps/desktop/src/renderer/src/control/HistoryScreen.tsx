import { useEffect, useState } from 'react';
import type { ActionResult, AppState, HistoryView } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { IconPlay, KindIcon } from './icons';
import { replayErrorMessage } from './messages';
import { mediaTitle } from './NowPlaying';

const CLOCK_TICK_MS = 30_000;

const relativeTime = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const whenPlayed = (playedAt: number, now: number): string => {
  const minutes = Math.floor((now - playedAt) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return relativeTime.format(-minutes, 'minute');
  return relativeTime.format(-Math.floor(minutes / 60), 'hour');
};

const HistoryRow = ({
  item,
  now,
  busyPlaying,
  replayState,
  onResult,
}: {
  item: HistoryView;
  now: number;
  busyPlaying: boolean;
  replayState: 'loading' | 'playing' | null;
  onResult: (result: ActionResult) => void;
}) => (
  <li className="history-row" data-testid="history-item">
    <span className="kind-tile">
      <KindIcon kind={item.kind} />
    </span>
    <span className="row-text">
      <span className="row-title" title={mediaTitle(item)}>
        {mediaTitle(item)}
      </span>
      <span className="row-sub">
        <Avatar className="avatar is-tiny" name={item.senderName} url={item.senderAvatarUrl} />
        {item.senderName} · {whenPlayed(item.playedAt, now)}
      </span>
    </span>
    <span className="history-actions">
      {replayState ? (
        <button type="button" className="pill secondary small" onClick={() => void window.liveChat.stopLocalReplay()}>
          {replayState === 'loading' && <span className="spinner is-small" aria-hidden="true" />}
          {replayState === 'loading' ? 'Chargement…' : 'Arrêter'}
        </button>
      ) : (
        <button
          type="button"
          className="pill quiet small"
          disabled={busyPlaying}
          onClick={() => void window.liveChat.replayForMe(item.id).then(onResult)}
        >
          Revoir pour moi
        </button>
      )}
      <button
        type="button"
        className="pill secondary small"
        onClick={() => void window.liveChat.replayForAll(item.id).then(onResult)}
      >
        <IconPlay size={16} />
        Rejouer pour tous
      </button>
    </span>
  </li>
);

export const HistoryScreen = ({ state, active }: { state: AppState; active: boolean }) => {
  const { history, localReplay } = state;
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const busyPlaying = state.queue.current?.startAt != null;

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [active, history]);

  const onResult = (result: ActionResult) => setError(result.ok ? null : replayErrorMessage(result.error));

  return (
    <section className="glass panel history" aria-labelledby="history-title">
      <h2 id="history-title" className="panel-title">
        Déjà passé
        <span className="count">{busyPlaying ? '« Revoir pour moi » revient à la fin du média en cours' : 'Gardé 1 jour'}</span>
      </h2>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {history.length === 0 ? (
        <div className="history-empty">
          <p className="draft-empty-title">Rien pour l'instant</p>
          <p className="hint">Ce qui passe dans la party s'affiche ici pendant 1 jour.</p>
        </div>
      ) : (
        <ul className="history-list scroll">
          {history.map((item) => (
            <HistoryRow
              key={item.id}
              item={item}
              now={now}
              busyPlaying={busyPlaying}
              replayState={localReplay?.historyId === item.id ? (localReplay.playback ? 'playing' : 'loading') : null}
              onResult={onResult}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
