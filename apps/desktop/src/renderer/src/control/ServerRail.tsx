import type { AppState } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { ConfirmButton } from './ConfirmButton';

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
  const { party, addedGuilds } = state;
  const inPrivateParty = party !== null && party.guild === null;

  return (
    <nav className="rail" aria-label="Tes serveurs">
      {addedGuilds.map(({ id, name, iconUrl }) => {
        const active = party?.guild?.id === id;
        return (
          <div key={id} className="rail-slot">
            <button
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
            {/* No need to confirm: the round plus brings it back. */}
            <button
              type="button"
              className="rail-remove"
              title={`Retirer ${name}`}
              aria-label={`Retirer ${name}`}
              onClick={() => void window.liveChat.setGuilds(addedGuilds.filter((guild) => guild.id !== id).map((guild) => guild.id))}
            >
              ×
            </button>
          </div>
        );
      })}

      {state.hasPrivateParty && (
        <div className="rail-slot">
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
          <ConfirmButton
            className="rail-remove"
            title="Quitter la party privée"
            label="×"
            confirmLabel="?"
            onConfirm={() => void window.liveChat.leaveParty()}
          />
        </div>
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
