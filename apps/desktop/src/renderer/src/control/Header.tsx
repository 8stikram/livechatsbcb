import { useEffect, useRef, useState } from 'react';
import type { ActionError, ConnectionStatus, PartyView } from '../../../shared/ipc';
import { useTabMarker } from './glide';
import { IconCheck, IconCopy } from './icons';

export type View = 'party' | 'media' | 'library' | 'history' | 'settings' | 'notes';

const TABS: Array<[View, string]> = [
  ['media', 'LiveChat'],
  ['party', 'Party'],
  ['library', 'Bibliothèque'],
  ['history', 'Historique'],
];

const STATUS_TEXT: Record<ConnectionStatus, string> = {
  connecting: 'Connexion…',
  online: 'Connecté',
  reconnecting: 'Connexion perdue, nouvelle tentative…',
  replaced: 'Tu es connecté sur une autre fenêtre ou un autre PC.',
  party_full: 'La party est pleine. Tu entreras dès qu’une place se libère.',
  update_required: 'Une mise à jour est nécessaire pour rejoindre la party.',
};

const CopyCode = () => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className="pill secondary small"
      onClick={() => {
        void window.liveChat.copyCode();
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1_500);
      }}
    >
      {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
      {copied ? 'Copié !' : 'Copier'}
    </button>
  );
};

const Connection = ({ status }: { status: ConnectionStatus }) => (
  <span
    className={status === 'online' ? 'connection is-online' : 'connection is-away'}
    role="status"
    title={STATUS_TEXT[status]}
    data-testid="connection"
  >
    <span className="dot" aria-hidden="true" />
    {STATUS_TEXT[status]}
  </span>
);

export const Header = ({
  party,
  view,
  joinError,
  onView,
}: {
  party: PartyView | null;
  view: View;
  joinError: ActionError | null;
  onView: (view: View) => void;
}) => {
  const inSettings = view === 'settings' || view === 'notes';
  const tabArea = useTabMarker<HTMLDivElement>(view);

  return (
    <header className="head">
      <div className="head-text">
        <p className="eyebrow">
          <span>{inSettings || !party ? 'LiveChatSBCB' : party.guild ? 'Party du serveur' : 'Code de la party'}</span>
          {party && <Connection status={party.connection} />}
        </p>
        <div className="head-title">
          {inSettings && <h1 className="title">{view === 'notes' ? 'Nouveautés' : 'Réglages'}</h1>}
          {!inSettings && !party && <h1 className="title">{joinError ? 'Aucune party' : 'Connexion…'}</h1>}
          {!inSettings && party?.guild && (
            <h1 className="title" title={party.guild.name} data-testid="party-guild">
              {party.guild.name}
            </h1>
          )}
          {!inSettings && party && !party.guild && (
            <>
              <h1 className="title is-code" data-testid="party-code">
                {party.code}
              </h1>
              <CopyCode />
            </>
          )}
          {party?.connection === 'replaced' && (
            <button type="button" className="pill primary small" onClick={() => void window.liveChat.reconnect()}>
              Reprendre ici
            </button>
          )}
        </div>
      </div>

      {party && (
        <div ref={tabArea} className="tabs" role="tablist" aria-label="Sections">
          <span className="tab-marker" aria-hidden="true" />
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={id === view ? 'tab is-active' : 'tab'}
              aria-selected={id === view}
              data-tour={`tab-${id}`}
              onClick={() => onView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </header>
  );
};
