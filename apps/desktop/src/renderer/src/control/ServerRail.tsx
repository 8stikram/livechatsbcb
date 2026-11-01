import type { AppState } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { ConfirmButton } from './ConfirmButton';
import { IconClose, IconLock, IconPlus, IconSliders } from './icons';

// The round pictures on the side, like in Discord: one click and you are in the party of that server.
export const ServerRail = ({
  state,
  picking,
  settingsOpen,
  onShowParty,
  onAdd,
  onOpenSettings,
}: {
  state: AppState;
  picking: boolean;
  settingsOpen: boolean;
  onShowParty: () => void;
  onAdd: () => void;
  onOpenSettings: () => void;
}) => {
  const { party, addedGuilds } = state;
  const inPrivateParty = party !== null && party.guild === null;

  return (
    <aside className="rail glass">
      <nav className="rail-list" aria-label="Tes serveurs">
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
                onClick={() =>
                  void window.liveChat.setGuilds(addedGuilds.filter((guild) => guild.id !== id).map((guild) => guild.id))
                }
              >
                <IconClose size={12} />
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
              <span className="rail-icon">
                <IconLock />
              </span>
            </button>
            <ConfirmButton
              className="rail-remove"
              title="Quitter la party privée"
              label={<IconClose size={12} />}
              confirmLabel="?"
              onConfirm={() => void window.liveChat.leaveParty()}
            />
          </div>
        )}

        <button
          type="button"
          className={picking ? 'rail-item rail-add is-active' : 'rail-item rail-add'}
          title="Ajouter un serveur"
          aria-label="Ajouter un serveur"
          onClick={onAdd}
        >
          <IconPlus />
        </button>
      </nav>

      <button
        type="button"
        className={settingsOpen ? 'rail-item rail-settings is-active' : 'rail-item rail-settings'}
        title="Réglages"
        aria-label="Réglages"
        aria-pressed={settingsOpen}
        onClick={onOpenSettings}
      >
        <IconSliders />
      </button>
    </aside>
  );
};
