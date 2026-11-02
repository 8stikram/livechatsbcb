import { useState } from 'react';
import { MAX_ONLINE_MEMBERS } from '@livechatsbcb/protocol';
import type { ActionResult, AppState, PartyView, UpcomingView } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { ConfirmButton } from './ConfirmButton';
import { KindIcon } from './icons';
import { errorMessage } from './messages';
import { mediaTitle, NowCard } from './NowPlaying';

const Upcoming = ({ upcoming, active }: { upcoming: UpcomingView[]; active: boolean }) => (
  <section className="glass panel is-short" aria-labelledby="upcoming-title">
    <h2 id="upcoming-title" className="panel-title">
      À suivre
      {active && upcoming.length > 0 && (
        <span className="count mono" data-testid="queue-waiting">
          {upcoming.length} en attente
        </span>
      )}
    </h2>
    {upcoming.length === 0 ? (
      <p className="hint">Personne n'attend.</p>
    ) : (
      <ul className="rows scroll">
        {upcoming.map((item) => (
          <li key={item.id} className="row">
            <span className="kind-tile is-small">
              <KindIcon kind={item.kind} size={16} />
            </span>
            <span className="row-text">
              <span className="row-title" title={mediaTitle(item)}>
                {mediaTitle(item)}
              </span>
              <span className="row-sub">{item.replay ? `Relancé par ${item.senderName}` : item.senderName}</span>
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const Members = ({ party }: { party: PartyView }) => {
  const [error, setError] = useState<string | null>(null);
  const online = party.members.filter((member) => member.online).length;

  const run = async (action: () => Promise<ActionResult>) => {
    setError(null);
    const result = await action();
    if (!result.ok) setError(errorMessage(result.error));
  };

  return (
    <section className="glass panel is-fill" aria-labelledby="members-title">
      <h2 id="members-title" className="panel-title">
        Membres
        <span className="count" data-testid="online-count">
          <span className="mono">
            {online} / {MAX_ONLINE_MEMBERS}
          </span>{' '}
          en ligne
        </span>
      </h2>
      <ul className="rows scroll">
        {party.members.map((member) => (
          <li key={member.id} className={member.online ? 'row' : 'row is-offline'}>
            <Avatar className="avatar" name={member.name} url={member.avatarUrl} testId="member-avatar" />
            <span className="row-text">
              <span className="row-title">
                {member.name}
                {member.id === party.memberId && <span className="row-you"> (toi)</span>}
              </span>
            </span>
            {member.online && <span className="dot is-online" title="En ligne" />}
          </li>
        ))}
      </ul>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!party.guild && (
        <footer className="panel-actions">
          <ConfirmButton
            label="Changer le code"
            confirmLabel="Confirmer le changement ?"
            onConfirm={() => void run(window.liveChat.rotateCode)}
          />
          <ConfirmButton
            label="Quitter la party"
            confirmLabel="Confirmer le départ ?"
            onConfirm={() => void run(window.liveChat.leaveParty)}
          />
        </footer>
      )}
    </section>
  );
};

export const PartyScreen = ({ state, party, active }: { state: AppState; party: PartyView; active: boolean }) => (
  <div className="party-grid">
    <NowCard current={state.queue.current} settings={state.settings} active={active} />
    <aside className="party-side">
      <Upcoming upcoming={state.queue.upcoming} active={active} />
      <Members party={party} />
    </aside>
  </div>
);
