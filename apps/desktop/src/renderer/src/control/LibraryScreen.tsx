import { useEffect, useRef, useState } from 'react';
import type { AppState, LibraryFileView, LibraryView, SavedView } from '../../../shared/ipc';
import { ConfirmButton } from './ConfirmButton';
import { IconPlay, IconStar, KindIcon } from './icons';
import { mediaErrorMessage } from './messages';
import type { DraftFiles } from './use-draft';

type Category = 'image' | 'video' | 'audio' | 'saved';
type Sort = 'date' | 'name' | 'type';

const CATEGORIES: Array<[Category, string]> = [
  ['image', 'Images'],
  ['video', 'Vidéos'],
  ['audio', 'Sons'],
  ['saved', 'Sauvegardés'],
];

// Pictures of videos are costly to load: the rest waits until someone asks.
const PAGE_SIZE = 60;

const extensionOf = (name: string): string => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

const sorted = <Item extends { name: string; favorite: boolean }>(
  items: Item[],
  sort: Sort,
  dateOf: (item: Item) => number,
  typeOf: (item: Item) => string,
): Item[] =>
  items.toSorted((a, b) => {
    // What is pinned stays on top, whatever the order.
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    if (sort === 'date') return dateOf(b) - dateOf(a);
    if (sort === 'type') return typeOf(a).localeCompare(typeOf(b)) || byName(a, b);
    return byName(a, b);
  });

const Star = ({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) => (
  <button
    type="button"
    className={on ? 'round tiny star is-on' : 'round tiny star'}
    title={on ? 'Retirer des favoris' : 'Épingler en favori'}
    aria-label={on ? 'Retirer des favoris' : 'Épingler en favori'}
    aria-pressed={on}
    onClick={() => onChange(!on)}
  >
    <IconStar size={16} />
  </button>
);

const FileCard = ({
  file,
  onUse,
  onFavorite,
  onMenu,
}: {
  file: LibraryFileView;
  onUse: () => void;
  onFavorite: (on: boolean) => void;
  onMenu: () => void;
}) => (
  <li className="library-card" data-testid="library-file" onContextMenu={onMenu}>
    <button type="button" className="library-picture" title={`Utiliser ${file.name}`} onClick={onUse}>
      {file.kind === 'image' ? (
        <img src={file.url} alt="" loading="lazy" />
      ) : (
        <video src={`${file.url}#t=0.1`} preload="metadata" muted playsInline />
      )}
    </button>
    <span className="library-card-foot">
      <span className="row-title" title={file.name}>
        {file.name}
      </span>
      <Star on={file.favorite} onChange={onFavorite} />
    </span>
  </li>
);

const SoundRow = ({
  file,
  playing,
  onListen,
  onUse,
  onFavorite,
  onMenu,
}: {
  file: LibraryFileView;
  playing: boolean;
  onListen: () => void;
  onUse: () => void;
  onFavorite: (on: boolean) => void;
  onMenu: () => void;
}) => (
  <li className="history-row" data-testid="library-file" onContextMenu={onMenu}>
    <button
      type="button"
      className="round tiny"
      title={playing ? 'Arrêter' : 'Écouter'}
      aria-label={playing ? 'Arrêter' : 'Écouter'}
      onClick={onListen}
    >
      {playing ? <span className="sound-bars" aria-hidden="true"><i /><i /><i /></span> : <IconPlay size={16} />}
    </button>
    <span className="row-text">
      <span className="row-title" title={file.name}>
        {file.name}
      </span>
    </span>
    <span className="history-actions">
      <Star on={file.favorite} onChange={onFavorite} />
      <button type="button" className="pill secondary small" onClick={onUse}>
        Utiliser
      </button>
    </span>
  </li>
);

const missingText = (count: number) => (count > 1 ? `${count} fichiers introuvables` : '1 fichier introuvable');

const SavedRow = ({
  saved,
  canSend,
  onSend,
  onEdit,
  onRelocate,
  onFavorite,
  onDelete,
}: {
  saved: SavedView;
  canSend: boolean;
  onSend: () => void;
  onEdit: () => void;
  onRelocate: () => void;
  onFavorite: (on: boolean) => void;
  onDelete: () => void;
}) => {
  const missing = saved.files.filter((file) => file.missing).length;
  const parts = saved.files.map((file) => file.name).join(' + ') || `« ${saved.caption} »`;

  return (
    <li className="history-row" data-testid="saved-livechat">
      {saved.thumbnailUrl ? (
        <img className="saved-picture" src={saved.thumbnailUrl} alt="" />
      ) : (
        <span className="kind-tile">
          <KindIcon kind={saved.kind} />
        </span>
      )}
      <span className="row-text">
        <span className="row-title" title={saved.name}>
          {saved.name}
        </span>
        {missing > 0 ? (
          <span className="row-sub is-missing" data-testid="saved-missing">
            {missingText(missing)}
          </span>
        ) : (
          <span className="row-sub" title={parts}>
            {parts}
          </span>
        )}
      </span>
      <span className="history-actions">
        <Star on={saved.favorite} onChange={onFavorite} />
        <ConfirmButton label="Supprimer" confirmLabel="Vraiment ?" onConfirm={onDelete} />
        {missing > 0 ? (
          <button type="button" className="pill secondary small" onClick={onRelocate}>
            Retrouver
          </button>
        ) : (
          <button type="button" className="pill quiet small" onClick={onEdit}>
            Modifier
          </button>
        )}
        <button type="button" className="pill secondary small" disabled={!canSend || missing > 0} onClick={onSend}>
          <IconPlay size={16} />
          Envoyer
        </button>
      </span>
    </li>
  );
};

const Folders = ({ library, onChange }: { library: LibraryView; onChange: (view: LibraryView) => void }) => (
  <ul className="library-folders" aria-label="Tes dossiers">
    {library.folders.map(({ path, missing }) => (
      <li key={path} className="library-folder">
        <span className={missing ? 'row-title is-missing' : 'row-title'} title={path}>
          {path}
          {missing && ' (introuvable)'}
        </span>
        <button
          type="button"
          className="pill quiet small"
          onClick={() => void window.liveChat.removeLibraryFolder(path).then(onChange)}
        >
          Retirer
        </button>
      </li>
    ))}
  </ul>
);

export const LibraryScreen = ({
  state,
  files,
  active,
  onOpenEditor,
}: {
  state: AppState;
  files: DraftFiles;
  active: boolean;
  onOpenEditor: () => void;
}) => {
  const [library, setLibrary] = useState<LibraryView | null>(null);
  const [category, setCategory] = useState<Category>('image');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [showFolders, setShowFolders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement>(null);

  // Files may have changed on the disk since the last visit.
  useEffect(() => {
    if (active) void window.liveChat.scanLibrary().then(setLibrary);
    else {
      player.current?.pause();
      setListening(null);
    }
  }, [active]);

  useEffect(() => setShown(PAGE_SIZE), [category, search, sort]);

  if (!library) return <section className="glass panel library" aria-label="Bibliothèque" />;

  const needle = search.trim().toLocaleLowerCase('fr');
  const matches = (name: string) => name.toLocaleLowerCase('fr').includes(needle);
  const isOnline = state.party?.connection === 'online';
  const canSend = isOnline && state.upload === null;

  const addFolder = async () => {
    setError(null);
    const view = await window.liveChat.addLibraryFolder();
    if (view) setLibrary(view);
  };

  const use = async (file: LibraryFileView) => {
    setError(null);
    const result = await window.liveChat.useLibraryFile(file.id);
    if (!result.ok) {
      setError('Ce fichier n’est plus là.');
      return;
    }
    files.adopt(result.draft);
    onOpenEditor();
  };

  const showMenu = async (file: LibraryFileView) => {
    setError(null);
    const result = await window.liveChat.showLibraryFileMenu(file.id);
    if (!result.ok) setError('Ce fichier n’est plus là.');
  };

  const favorite = (file: LibraryFileView, on: boolean) =>
    void window.liveChat.setLibraryFavorite(file.id, on).then(setLibrary);

  const listen = (file: LibraryFileView) => {
    const element = player.current;
    if (!element) return;
    if (listening === file.id) {
      element.pause();
      setListening(null);
      return;
    }
    element.src = file.url;
    void element.play().catch(() => setListening(null));
    setListening(file.id);
  };

  const sendSaved = async (saved: SavedView) => {
    setError(null);
    const result = await window.liveChat.sendSaved(saved.id);
    if (!result.ok && result.error !== 'cancelled') setError(mediaErrorMessage(result.error));
  };

  const editSaved = async (saved: SavedView) => {
    setError(null);
    const result = await window.liveChat.editSaved(saved.id);
    if (!result.ok) {
      setError('Un fichier de ce LiveChat n’est plus là.');
      return;
    }
    files.load(result.draft);
    onOpenEditor();
  };

  const relocate = async (saved: SavedView) => {
    setError(null);
    const result = await window.liveChat.relocateSaved(saved.id);
    setLibrary(result.library);
    if (result.outcome === 'wrong_file') setError('Ce n’est pas un des fichiers qui manquent.');
  };

  const kindFiles =
    category === 'saved'
      ? []
      : sorted(
          library.files.filter((file) => file.kind === category && matches(file.name)),
          sort,
          (file) => file.modifiedAt,
          (file) => extensionOf(file.name),
        );
  const savedItems = sorted(
    library.saved.filter((saved) => matches(saved.name) || matches(saved.caption)),
    sort,
    (saved) => saved.savedAt,
    (saved) => saved.kind,
  );
  const count = (kind: Category) =>
    kind === 'saved' ? library.saved.length : library.files.filter((file) => file.kind === kind).length;

  const noFolder = library.folders.length === 0 && category !== 'saved';
  const nothing = category === 'saved' ? savedItems.length === 0 : kindFiles.length === 0;

  return (
    <section className="glass panel library" aria-label="Bibliothèque">
      <div className="library-bar">
        <div className="tabs" role="group" aria-label="Catégories">
          {CATEGORIES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={category === value ? 'tab is-active' : 'tab'}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {label} <span className="mono library-count">{count(value)}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <input
          className="input library-search"
          type="search"
          aria-label="Rechercher par nom"
          placeholder="Rechercher"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="input library-sort"
          aria-label="Trier"
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
        >
          <option value="date">Récents</option>
          <option value="name">Nom</option>
          <option value="type">Type</option>
        </select>
        <button
          type="button"
          className="pill secondary small"
          aria-expanded={showFolders}
          onClick={() => setShowFolders(!showFolders)}
        >
          Dossiers
        </button>
      </div>

      {showFolders && (
        <div className="library-manage">
          <Folders library={library} onChange={setLibrary} />
          <button type="button" className="pill secondary small" onClick={() => void addFolder()}>
            Ajouter un dossier
          </button>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {state.upload && (
        <p className="hint" role="status">
          Envoi de {state.upload.name}… <span className="mono">{state.upload.percent} %</span>
        </p>
      )}

      {noFolder ? (
        <div className="history-empty">
          <p className="draft-empty-title">Montre où sont tes fichiers</p>
          <p className="hint">L'app les range toute seule. Rien ne quitte ton PC tant que tu n'envoies pas.</p>
          <button type="button" className="pill primary" onClick={() => void addFolder()}>
            Ajouter un dossier
          </button>
        </div>
      ) : nothing ? (
        <div className="history-empty">
          <p className="draft-empty-title">{needle ? 'Rien à ce nom' : 'Rien ici pour l’instant'}</p>
          <p className="hint">
            {category === 'saved' && !needle
              ? 'Prépare un LiveChat, puis sauvegarde-le avec un nom pour le renvoyer quand tu veux.'
              : 'Essaie une autre catégorie, ou ajoute un dossier.'}
          </p>
        </div>
      ) : (
        <div className="library-list scroll">
          {category === 'saved' && (
            <ul className="history-list">
              {savedItems.map((saved) => (
                <SavedRow
                  key={saved.id}
                  saved={saved}
                  canSend={canSend}
                  onSend={() => void sendSaved(saved)}
                  onEdit={() => void editSaved(saved)}
                  onRelocate={() => void relocate(saved)}
                  onFavorite={(on) => void window.liveChat.setSavedFavorite(saved.id, on).then(setLibrary)}
                  onDelete={() => void window.liveChat.deleteSaved(saved.id).then(setLibrary)}
                />
              ))}
            </ul>
          )}
          {category === 'audio' && (
            <ul className="history-list">
              {kindFiles.slice(0, shown).map((file) => (
                <SoundRow
                  key={file.id}
                  file={file}
                  playing={listening === file.id}
                  onListen={() => listen(file)}
                  onUse={() => void use(file)}
                  onFavorite={(on) => favorite(file, on)}
                  onMenu={() => void showMenu(file)}
                />
              ))}
            </ul>
          )}
          {(category === 'image' || category === 'video') && (
            <ul className="library-grid">
              {kindFiles.slice(0, shown).map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  onUse={() => void use(file)}
                  onFavorite={(on) => favorite(file, on)}
                  onMenu={() => void showMenu(file)}
                />
              ))}
            </ul>
          )}
          {category !== 'saved' && kindFiles.length > shown && (
            <button type="button" className="pill quiet small library-more" onClick={() => setShown(shown + PAGE_SIZE)}>
              Afficher plus ({kindFiles.length - shown})
            </button>
          )}
          {library.truncated && category !== 'saved' && (
            <p className="hint">Tes dossiers contiennent beaucoup de fichiers : seuls les 5 000 premiers sont affichés.</p>
          )}
        </div>
      )}
      <audio ref={player} onEnded={() => setListening(null)} />
    </section>
  );
};
