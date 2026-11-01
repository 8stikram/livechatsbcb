import { useEffect, useRef, useState } from 'react';
import { MAX_ONLINE_MEMBERS } from '@livechatsbcb/protocol';
import type { ActionResult, AppState, ConnectionStatus, PartyView } from '../../../shared/ipc';
import { errorMessage } from './messages';

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connexion…',
  online: 'Connecté',
  reconnecting: 'Connexion perdue, nouvelle tentative…',
  replaced: 'Tu es connecté sur une autre fenêtre ou un autre PC.',
  party_full: 'La party est pleine. Tu entreras dès qu’une place se libère.',
  update_required: 'Une mise à jour est nécessaire pour rejoindre la party.',
};

const CONFIRM_WINDOW_MS = 4_000;

const ConfirmButton = ({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) => {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={armed ? 'quiet danger' : 'quiet'}
      onClick={() => {
        window.clearTimeout(timer.current);
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
};

export const PartyScreen = ({ state, party }: { state: AppState; party: PartyView }) => {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const run = async (action: () => Promise<ActionResult>) => {
    setError(null);
    const result = await action();
    if (!result.ok) setError(errorMessage(result.error));
  };

  const copyCode = async () => {
    await window.liveChat.copyCode();
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1_500);
  };

  const online = party.members.filter((member) => member.online).length;
  const isOnline = party.connection === 'online';

  return (
    <main className="screen party">
      <section className="code-card" aria-label="Code de la party">
        <span className="eyebrow">Code de la party</span>
        <div className="code-row">
          <strong className="code" data-testid="party-code">
            {party.code}
          </strong>
          <button type="button" className="secondary compact" onClick={() => void copyCode()}>
            {copied ? 'Copié !' : 'Copier'}
          </button>
        </div>
      </section>

      <p className={`connection ${isOnline ? 'is-online' : 'is-away'}`} role="status" data-testid="connection">
        <span className="dot" aria-hidden="true" />
        {STATUS_TEXT[party.connection]}
      </p>

      {party.connection === 'replaced' && (
        <button type="button" className="primary" onClick={() => void window.liveChat.reconnect()}>
          Reprendre ici
        </button>
      )}

      <section className="members" aria-label="Membres">
        <h2>
          Membres
          <span className="count" data-testid="online-count">
            {online} / {MAX_ONLINE_MEMBERS} en ligne
          </span>
        </h2>
        <ul>
          {party.members.map((member) => (
            <li key={member.id} className={member.online ? 'member' : 'member is-offline'}>
              <span className="avatar" aria-hidden="true">
                {member.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="member-name">
                {member.name}
                {member.id === party.memberId && <span className="you"> (toi)</span>}
              </span>
              <span className="member-status">{member.online ? 'En ligne' : 'Hors ligne'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="stage-controls" aria-label="Scène">
        <label className="toggle">
          <input
            type="checkbox"
            checked={state.stage.visible}
            onChange={(event) => void window.liveChat.setStageVisible(event.target.checked)}
          />
          Afficher la scène
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={state.stage.pinned}
            onChange={(event) => void window.liveChat.setStagePinned(event.target.checked)}
          />
          Garder la scène au premier plan
        </label>
      </section>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="party-actions">
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
      <footer className="version">Version {state.version}</footer>
    </main>
  );
};
