import type { AppState } from '../../../shared/ipc';
import { Avatar } from '../Avatar';

// The round pictures on the side, like in Discord: one click and you are in the party of that server.
export const ServerRail = ({
  state,
  picking,
  onShowParty,
  onAdd,
}: {
  state: AppState;
  picking: boolean;
  onShowParty: () => void;
  onAdd: () => void;
}) => {
  const { party } = state;
  const inPrivateParty = party !== null && party.guild === null;

  return (
    <nav className="rail" aria-label="Tes serveurs">
      {state.addedGuilds.map(({ id, name, iconUrl }) => {
        const active = party?.guild?.id === id;
        return (
          <button
            key={id}
            type="button"
            className={active ? 'rail-item is-active' : 'rail-item'}
            title={name}
            aria-label={name}
            aria-pressed={active}
            onClick={() => {
              onShowParty();
              if (!active) void window.liveChat.joinGuild(id);
            }}
          >
            <Avatar className="rail-icon" name={name} url={iconUrl} />
          </button>
        );
      })}

      {state.hasPrivateParty && (
        <button
          type="button"
          className={inPrivateParty ? 'rail-item is-active' : 'rail-item'}
          title="Party privée"
          aria-label="Party privée"
          aria-pressed={inPrivateParty}
          onClick={() => {
            onShowParty();
            if (!inPrivateParty) void window.liveChat.returnToPrivateParty();
          }}
        >
          <span className="rail-icon" aria-hidden="true">
            🔒
          </span>
        </button>
      )}

      <button
        type="button"
        className={picking ? 'rail-item is-active' : 'rail-item'}
        title="Ajouter un serveur"
        aria-label="Ajouter un serveur"
        onClick={onAdd}
      >
        <span className="rail-icon rail-add" aria-hidden="true">
          +
        </span>
      </button>
    </nav>
  );
};
