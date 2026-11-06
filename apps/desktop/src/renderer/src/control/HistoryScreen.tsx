import { useEffect, useRef, useState } from 'react';
import type { ActionResult, AppState, EditResult, FavoriteView, HistoryView } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { FitText } from '../scene';
import { ConfirmButton } from './ConfirmButton';
import { GlideList } from './glide';
import { IconPlay, KindIcon } from './icons';
import { Star } from './LibraryScreen';
import { canSendIn, errorMessage, replayErrorMessage } from './messages';
import { mediaTitle } from './NowPlaying';

const CLOCK_TICK_MS = 30_000;

const relativeTime = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

const whenPlayed = (playedAt: number, now: number): string => {
  const minutes = Math.floor((now - playedAt) / 60_000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return relativeTime.format(-minutes, 'minute');
  return relativeTime.format(-Math.floor(minutes / 60), 'hour');
};

const savedDay = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long' });

const ReplayForMeButton = ({
  replayState,
  busyPlaying,
  onReplay,
}: {
  replayState: 'loading' | 'playing' | null;
  busyPlaying: boolean;
  onReplay: () => void;
}) =>
  replayState ? (
    <button type="button" className="pill secondary small" onClick={() => void window.liveChat.stopLocalReplay()}>
      {replayState === 'loading' && <span className="spinner is-small" aria-hidden="true" />}
      {replayState === 'loading' ? 'Chargement…' : 'Arrêter'}
    </button>
  ) : (
    <button type="button" className="pill quiet small" disabled={busyPlaying} onClick={onReplay}>
      Revoir pour moi
    </button>
  );

// Pinning makes a copy first, so the star that lands is a new one.
const KeepStar = ({ item, onResult }: { item: HistoryView; onResult: (result: ActionResult) => void }) => {
  const wasKeeping = useRef(false);
  const justKept = wasKeeping.current && !item.keeping && item.favoriteId !== null;
  wasKeeping.current = item.keeping;

  if (item.keeping) {
    return (
      <span className="round tiny star is-on" title="Copie sur ton PC…" data-testid="keeping">
        <span className="spinner is-small" aria-hidden="true" />
      </span>
    );
  }

  return (
    <Star
      on={item.favoriteId !== null}
      landing={justKept}
      onChange={(on) => {
        if (on) void window.liveChat.keepHistory(item.id).then(onResult);
        else if (item.favoriteId) void window.liveChat.deleteSaved(item.favoriteId);
      }}
    />
  );
};

const FavoriteRow = ({
  favorite,
  busyPlaying,
  canSend,
  replayState,
  onResult,
  onEdit,
}: {
  onEdit: () => Promise<void>;
  favorite: FavoriteView;
  busyPlaying: boolean;
  canSend: boolean;
  replayState: 'loading' | 'playing' | null;
  onResult: (result: ActionResult) => void;
}) => (
  <li className="history-row" data-testid="favorite-item">
    {favorite.thumbnailUrl ? (
      <img className="history-picture" src={favorite.thumbnailUrl} alt="" />
    ) : (
      <span className="kind-tile">
        <KindIcon kind={favorite.kind} />
      </span>
    )}
    <span className="row-text">
      <span className="row-title" title={favorite.name}>
        {favorite.name}
      </span>
      <FitText className="row-sub" text={`${favorite.senderName} · gardé le ${savedDay.format(favorite.savedAt)}`}>
        <Avatar className="avatar is-tiny" name={favorite.senderName} url={favorite.senderAvatarUrl} />
        {favorite.senderName} · gardé le {savedDay.format(favorite.savedAt)}
      </FitText>
    </span>
    <span className="history-actions">
      <EditButton onEdit={onEdit} />
      <ConfirmButton
        label="Retirer"
        confirmLabel="Effacer pour de bon ?"
        onConfirm={() => void window.liveChat.deleteSaved(favorite.id)}
      />
      <ReplayForMeButton
        replayState={replayState}
        busyPlaying={busyPlaying}
        onReplay={() => void window.liveChat.replayFavoriteForMe(favorite.id).then(onResult)}
      />
      <button
        type="button"
        className="pill secondary small"
        disabled={!canSend}
        onClick={() => void window.liveChat.sendSaved(favorite.id).then(onResult)}
      >
        <IconPlay size={16} />
        Envoyer à tous
      </button>
    </span>
  </li>
);

const EditButton = ({ onEdit }: { onEdit: () => Promise<void> }) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="pill quiet small"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void onEdit().finally(() => setBusy(false));
      }}
    >
      {busy ? 'Ouverture…' : 'Modifier'}
    </button>
  );
};

const HistoryRow = ({
  item,
  now,
  busyPlaying,
  replayState,
  onResult,
  onEdit,
}: {
  onEdit: () => Promise<void>;
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
      <FitText className="row-sub" text={`${item.senderName} · ${whenPlayed(item.playedAt, now)}${item.whisper ? ' · chuchoté' : ''}`}>
        <Avatar className="avatar is-tiny" name={item.senderName} url={item.senderAvatarUrl} />
        {item.senderName} · {whenPlayed(item.playedAt, now)}
        {item.whisper && ' · chuchoté'}
      </FitText>
    </span>
    <span className="history-actions">
      {/* A link stays on its site: there is nothing here to keep or to change. */}
      {!item.isLink && <KeepStar item={item} onResult={onResult} />}
      {!item.isLink && <EditButton onEdit={onEdit} />}
      <ReplayForMeButton
        replayState={replayState}
        busyPlaying={busyPlaying}
        onReplay={() => void window.liveChat.replayForMe(item.id).then(onResult)}
      />
      <button
        type="button"
        className="pill secondary small"
        onClick={() => void window.liveChat.replayForAll(item.id).then(onResult)}
      >
        <IconPlay size={16} />
        {item.whisper ? 'Rejouer en chuchotant' : 'Rejouer pour tous'}
      </button>
    </span>
  </li>
);

export const HistoryScreen = ({
  state,
  active,
  onEdit,
  from,
  onFrom,
}: {
  state: AppState;
  active: boolean;
  onEdit: (loading: Promise<EditResult>) => Promise<boolean>;
  from: string | null;
  onFrom: (memberId: string | null) => void;
}) => {
  const { favorites, localReplay } = state;
  // Everyone who sent something still in the history, and whoever was picked in the party even with nothing yet.
  const senders = new Map(state.history.map((item) => [item.senderId, item.senderName]));
  const picked = from ? state.party?.members.find(({ id }) => id === from) : undefined;
  if (from && picked && !senders.has(from)) senders.set(from, picked.name);
  const history = from ? state.history.filter((item) => item.senderId === from) : state.history;
  const [showFavorites, setShowFavorites] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const busyPlaying = state.queue.current?.startAt != null;

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [active, history]);

  const edit = async (loading: Promise<EditResult>) => {
    setError((await onEdit(loading)) ? null : 'Ce LiveChat n’est plus disponible.');
  };

  const onResult = (result: ActionResult) => setError(result.ok ? null : replayErrorMessage(result.error));
  const onFavoriteResult = (result: ActionResult) => {
    if (result.ok) setError(null);
    else setError(result.error === 'not_found' ? 'Les fichiers de ce favori ne sont plus sur ce PC.' : errorMessage(result.error));
  };
  const replayStateOf = (id: string) => (localReplay?.historyId === id ? (localReplay.playback ? 'playing' : 'loading') : null);

  return (
    <section className="glass panel history" aria-labelledby="history-title">
      <div className="panel-title history-head">
        <h2 id="history-title">Déjà passé</h2>
        <div className="tabs" role="group" aria-label="Ce qui est affiché">
          <button type="button" className={showFavorites ? 'tab' : 'tab is-active'} aria-pressed={!showFavorites} onClick={() => setShowFavorites(false)}>
            Récents
          </button>
          <button type="button" className={showFavorites ? 'tab is-active' : 'tab'} aria-pressed={showFavorites} onClick={() => setShowFavorites(true)}>
            Favoris
          </button>
        </div>
        {!showFavorites && senders.size > 0 && (
          <label className="history-from">
            <span>De qui</span>
            <select
              className="input is-small"
              value={from ?? ''}
              data-testid="history-from"
              onChange={(event) => onFrom(event.target.value || null)}
            >
              <option value="">Tout le monde</option>
              {[...senders].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="count">
          {busyPlaying
            ? '« Revoir pour moi » revient à la fin du média en cours'
            : showFavorites
              ? 'Gardés sur ton PC'
              : 'Gardé 1 jour, ou plus avec l’étoile'}
        </span>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {showFavorites ? (
        favorites.length === 0 ? (
          <div className="history-empty">
            <p className="draft-empty-title">Aucun favori</p>
            <p className="hint">Clique sur l'étoile d'un LiveChat marrant : il reste sur ton PC et tu pourras le ressortir quand tu veux.</p>
          </div>
        ) : (
          <GlideList className="history-list scroll">
            {favorites.map((favorite) => (
              <FavoriteRow
                key={favorite.id}
                favorite={favorite}
                busyPlaying={busyPlaying}
                canSend={state.upload === null && canSendIn(state.party)}
                replayState={replayStateOf(favorite.id)}
                onResult={onFavoriteResult}
                onEdit={() => edit(window.liveChat.editSaved(favorite.id))}
              />
            ))}
          </GlideList>
        )
      ) : history.length === 0 ? (
        <div className="history-empty">
          <p className="draft-empty-title">{from ? 'Rien de sa part' : "Rien pour l'instant"}</p>
          <p className="hint">{from ? 'Rien de cette personne dans la dernière journée.' : "Ce qui passe dans la party s'affiche ici pendant 1 jour."}</p>
        </div>
      ) : (
        <GlideList className="history-list scroll">
          {history.map((item) => (
            <HistoryRow
              key={item.id}
              item={item}
              now={now}
              busyPlaying={busyPlaying}
              replayState={replayStateOf(item.id)}
              onResult={onResult}
              onEdit={() => edit(window.liveChat.editHistory(item.id))}
            />
          ))}
        </GlideList>
      )}
    </section>
  );
};
