import { useEffect, useState, type FormEvent } from 'react';
import { CODE_LENGTH, normalizeCode } from '@livechatsbcb/protocol';
import type { ActionResult, AppState } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { errorMessage } from './messages';

const searchable = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Tucked away: most people only ever use the party of their Discord server.
const PrivateParty = () => {
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

  const join = (event: FormEvent) => {
    event.preventDefault();
    void run(() => window.liveChat.joinParty(code));
  };

  return (
    <details className="private-corner">
      <summary>Party privée</summary>
      <form className="panel" onSubmit={join}>
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
        <button className="secondary" type="button" disabled={busy} onClick={() => void run(window.liveChat.createParty)}>
          Créer une party privée
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
};

export const GuildPicker = ({ state, onClose }: { state: AppState; onClose: () => void }) => {
  const { guilds, addedGuilds } = state;
  const [search, setSearch] = useState('');
  const [chosen, setChosen] = useState<string[]>(() => addedGuilds.map(({ id }) => id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Someone opening this, or coming back to it from Discord, may well have just joined a server.
  useEffect(() => {
    const refresh = () => void window.liveChat.refreshGuilds();
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  const toggle = (id: string) =>
    setChosen((current) => (current.includes(id) ? current.filter((other) => other !== id) : [...current, id]));

  const validate = async () => {
    setBusy(true);
    setError(null);
    const result = await window.liveChat.setGuilds(chosen);
    setBusy(false);
    if (result.ok) onClose();
    else setError(errorMessage(result.error));
  };

  const wanted = searchable(search.trim());
  const shown = (guilds ?? []).filter(({ name }) => searchable(name).includes(wanted));

  return (
    <main className="screen picker">
      <h1 className="picker-title">Avec quel serveur veux-tu utiliser LiveChatSBCB ?</h1>

      {guilds === null && <p className="hint">Chargement de tes serveurs…</p>}
      {guilds?.length === 0 && !state.guildsPartial && (
        <p className="hint" data-testid="no-guilds">
          Tu n'es sur aucun serveur Discord pour l'instant.
        </p>
      )}
      {state.guildsPartial && (
        <p className="banner" role="status" data-testid="guilds-partial">
          Discord ne répond pas pour le moment : la liste de tes serveurs est peut-être incomplète.
        </p>
      )}

      {guilds !== null && guilds.length > 0 && (
        <input
          type="search"
          aria-label="Rechercher un serveur"
          placeholder="Rechercher un serveur"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      )}

      <div className="guild-grid" role="group" aria-label="Tes serveurs">
        {shown.map(({ id, name, iconUrl }) => (
          <button
            key={id}
            type="button"
            className={chosen.includes(id) ? 'guild-card is-chosen' : 'guild-card'}
            aria-pressed={chosen.includes(id)}
            onClick={() => toggle(id)}
            data-testid="guild-card"
          >
            <Avatar className="guild-card-icon" name={name} url={iconUrl} />
            <span className="guild-card-name">{name}</span>
          </button>
        ))}
      </div>
      {guilds !== null && guilds.length > 0 && shown.length === 0 && <p className="hint">Aucun serveur à ce nom.</p>}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button
        className="primary"
        type="button"
        disabled={busy || (chosen.length === 0 && addedGuilds.length === 0)}
        onClick={() => void validate()}
      >
        Valider
      </button>
      {(addedGuilds.length > 0 || state.party) && (
        <button className="quiet" type="button" onClick={onClose}>
          Annuler
        </button>
      )}

      <PrivateParty />
    </main>
  );
};
