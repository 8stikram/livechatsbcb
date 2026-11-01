import { useState, type FormEvent } from 'react';
import { CODE_LENGTH, normalizeCode, type Account, type GuildSummary, type LobbyChannel } from '@livechatsbcb/protocol';
import type { ActionResult, AppState, LobbyView } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { ConfirmButton } from './ConfirmButton';
import { errorMessage } from './messages';

const MAX_OCCUPANTS_SHOWN = 5;

const LOBBY_STATUS_TEXT: Partial<Record<LobbyView['status'], string>> = {
  connecting: 'Connexion au serveur…',
  reconnecting: 'Connexion au serveur perdue, nouvelle tentative…',
  replaced: 'Ce serveur est ouvert sur un autre PC.',
  update_required: 'Une mise à jour est nécessaire.',
};

const ChannelButton = ({
  channel,
  current,
  onJoin,
}: {
  channel: LobbyChannel;
  current: boolean;
  onJoin: () => void;
}) => (
  <li>
    <button
      type="button"
      className={current ? 'channel is-current' : 'channel'}
      aria-current={current}
      onClick={onJoin}
      data-testid="channel"
    >
      <span className="channel-icon" aria-hidden="true">
        {channel.kind === 'voice' ? '🔊' : '#'}
      </span>
      <span className="channel-name">{channel.name}</span>
      <span
        className="channel-occupants"
        data-testid="channel-occupants"
        aria-label={channel.occupants.length > 0 ? `${channel.occupants.length} présents` : undefined}
      >
        {channel.occupants.slice(0, MAX_OCCUPANTS_SHOWN).map((occupant) => (
          <Avatar key={occupant.id} className="avatar" name={occupant.name} url={occupant.avatarUrl} />
        ))}
      </span>
    </button>
  </li>
);

const GuildPanel = ({
  guild,
  lobby,
  currentChannelId,
  onJoin,
}: {
  guild: GuildSummary;
  lobby: LobbyView | null;
  currentChannelId: string | null;
  onJoin: (channelId: string) => void;
}) => {
  if (guild.locked) {
    return (
      <p className="banner" role="status" data-testid="guild-locked">
        Il te manque le rôle LiveChat sur {guild.name}. Demande-le à un admin du serveur.
      </p>
    );
  }
  if (!lobby) {
    return (
      <p className="banner" role="status" data-testid="guild-unavailable">
        {guild.name} n'est pas accessible pour le moment.
      </p>
    );
  }

  const statusText = LOBBY_STATUS_TEXT[lobby.status];
  return (
    <>
      {statusText && (
        <p className="connection is-away" role="status" data-testid="lobby-status">
          <span className="dot" aria-hidden="true" />
          {statusText}
        </p>
      )}
      {lobby.status === 'replaced' && (
        <button type="button" className="secondary" onClick={() => void window.liveChat.selectGuild(guild.id)}>
          Reprendre ici
        </button>
      )}

      <nav aria-label="Salons" data-testid="channels">
        {lobby.categories.map((category) => (
          <section key={category.id ?? 'none'} className="channel-section">
            {category.name && <h3>{category.name}</h3>}
            <ul className="channel-list">
              {category.channels.map((channel) => (
                <ChannelButton
                  key={channel.id}
                  channel={channel}
                  current={channel.id === currentChannelId}
                  onJoin={() => onJoin(channel.id)}
                />
              ))}
            </ul>
          </section>
        ))}
        {lobby.status === 'online' && lobby.categories.length === 0 && (
          <p className="hint">Aucun salon à afficher : le bot n'a accès à aucun salon que tu peux voir.</p>
        )}
      </nav>

      {lobby.online.length > 0 && (
        <section className="members" aria-label="Connectés sur ce serveur">
          <h2>
            Connectés sur ce serveur
            <span className="count" data-testid="guild-online-count">
              {lobby.online.length}
            </span>
          </h2>
          <ul>
            {lobby.online.map((member) => (
              <li key={member.id} className="member" data-testid="guild-online-member">
                <Avatar className="avatar" name={member.name} url={member.avatarUrl} />
                <span className="member-name">{member.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
};

export const HomeScreen = ({
  state,
  account,
  onShowParty,
}: {
  state: AppState;
  account: Account;
  onShowParty: () => void;
}) => {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<ActionResult>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    if (!result.ok) setError(errorMessage(result.error));
    setBusy(false);
  };

  const joinPrivate = (event: FormEvent) => {
    event.preventDefault();
    void run(() => window.liveChat.joinParty(code));
  };

  const { guilds, lobby, party } = state;
  const selected = guilds?.find(({ id }) => id === state.selectedGuildId) ?? null;

  return (
    <main className="screen home">
      <header className="account-bar">
        <Avatar className="avatar" name={account.name} url={account.avatarUrl} testId="account-avatar" />
        <span className="account-name" data-testid="account-name">
          {account.name}
        </span>
        <ConfirmButton
          label="Se déconnecter"
          confirmLabel="Confirmer ?"
          onConfirm={() => void window.liveChat.logout()}
        />
      </header>

      {state.notice === 'session_expired' && (
        <p className="banner" role="status">
          Tu ne fais plus partie de ta party précédente. Rejoins-la avec son code.
        </p>
      )}
      {state.notice === 'channel_lost' && (
        <p className="banner" role="status" data-testid="channel-lost">
          Tu n'as plus accès au salon où tu étais.
        </p>
      )}

      {guilds === null && <p className="hint">Chargement de tes serveurs…</p>}

      {guilds?.length === 0 && !state.guildsPartial && (
        <p className="hint" data-testid="no-guilds">
          Aucun serveur pour l'instant : le bot LiveChatSBCB doit être installé sur un serveur Discord dont tu es membre.
          Tu peux quand même utiliser une party privée.
        </p>
      )}

      {state.guildsPartial && (
        <p className="banner" role="status" data-testid="guilds-partial">
          Discord ne répond pas pour le moment : la liste de tes serveurs est peut-être incomplète.
        </p>
      )}

      {guilds !== null && guilds.length > 1 && (
        <div className="guild-picker" role="group" aria-label="Tes serveurs">
          {guilds.map((guild) => (
            <button
              key={guild.id}
              type="button"
              className={guild.id === selected?.id ? 'guild-choice is-active' : 'guild-choice'}
              aria-pressed={guild.id === selected?.id}
              onClick={() => void window.liveChat.selectGuild(guild.id)}
            >
              <Avatar className="avatar" name={guild.name} url={guild.iconUrl} />
              {guild.name}
            </button>
          ))}
        </div>
      )}

      {guilds?.length === 1 && selected && <h1 className="guild-title">{selected.name}</h1>}

      {selected && (
        <GuildPanel
          guild={selected}
          lobby={lobby?.guildId === selected.id ? lobby : null}
          currentChannelId={party?.channel?.channelId ?? null}
          onJoin={(channelId) => {
            if (channelId === party?.channel?.channelId) onShowParty();
            else void run(() => window.liveChat.joinChannel(selected.id, channelId));
          }}
        />
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="divider">Party privée</div>

      <form className="panel" onSubmit={joinPrivate}>
        <label className="field">
          <span>Code de la party</span>
          <input
            className="code-input"
            value={code}
            maxLength={CODE_LENGTH + 2}
            spellCheck={false}
            onChange={(event) => setCode(normalizeCode(event.target.value))}
            placeholder="K7M2QX"
          />
        </label>
        <button className="primary" type="submit" disabled={busy || code.length !== CODE_LENGTH}>
          Rejoindre
        </button>
      </form>

      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={() => void run(window.liveChat.createParty)}
      >
        Créer une party privée
      </button>

      <footer className="version">
        Version {state.version}
        {' · '}
        <button type="button" className="quiet" onClick={() => void window.liveChat.refreshGuilds()}>
          Actualiser mes serveurs
        </button>
      </footer>
    </main>
  );
};
