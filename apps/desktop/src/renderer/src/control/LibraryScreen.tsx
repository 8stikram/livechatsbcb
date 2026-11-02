import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppState, LibraryFileView, LibraryView, RenameOutcome, SavedView } from '../../../shared/ipc';
import { ConfirmButton } from './ConfirmButton';
import { IconPlay, IconStar, KindIcon } from './icons';
import { loadInEditor } from './load-editor';
import { playLengthMs } from './play-length';
import { canSendIn, mediaErrorMessage } from './messages';
import type { DraftFiles } from './use-draft';
import type { Scene } from './use-scene';

export type Category = 'image' | 'video' | 'audio' | 'saved';
type Sort = 'date' | 'name' | 'type';

const CATEGORIES: Array<[Category, string]> = [
  ['image', 'Images'],
  ['video', 'Vidéos'],
  ['audio', 'Sons'],
  ['saved', 'Sauvegardés'],
];

// Pictures of videos are costly to load: the rest waits until someone asks.
const PAGE_SIZE = 60;

const RENAME_ERRORS: Record<Exclude<RenameOutcome, 'renamed'>, string> = {
  invalid: 'Windows refuse ce nom. Évite ces signes : < > : " / \\ | ? *',
  exists: 'Un fichier porte déjà ce nom.',
  not_found: 'Ce fichier n’est plus là.',
  busy: 'Ce fichier est utilisé ailleurs. Ferme-le et réessaie.',
};

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

export const Star = ({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) => (
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

const ShortcutBadge = ({ shortcut }: { shortcut: string | null }) =>
  shortcut && (
    <span className="shortcut-badge mono" title={`Raccourci : ${shortcut}`} data-testid="shortcut-badge">
      {shortcut}
    </span>
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
      <ShortcutBadge shortcut={file.shortcut} />
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
      <ShortcutBadge shortcut={file.shortcut} />
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
  onMenu,
}: {
  saved: SavedView;
  canSend: boolean;
  onSend: () => void;
  onEdit: () => void;
  onRelocate: () => void;
  onFavorite: (on: boolean) => void;
  onDelete: () => void;
  onMenu: () => void;
}) => {
  const missing = saved.files.filter((file) => file.missing).length;
  const parts = saved.files.map((file) => file.name).join(' + ') || `« ${saved.caption} »`;

  return (
    <li className="history-row" data-testid="saved-livechat" onContextMenu={onMenu}>
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
        <ShortcutBadge shortcut={saved.shortcut} />
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
  scene,
  active,
  category,
  onCategory,
  onOpenEditor,
}: {
  state: AppState;
  files: DraftFiles;
  scene: Scene;
  active: boolean;
  category: Category;
  onCategory: (category: Category) => void;
  onOpenEditor: () => void;
}) => {
  const [library, setLibrary] = useState<LibraryView | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('date');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [showFolders, setShowFolders] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ file: LibraryFileView; name: string } | null>(null);
  const player = useRef<HTMLAudioElement>(null);

  // A file being listened to can't be renamed or thrown away on Windows.
  const stopListening = () => {
    player.current?.pause();
    player.current?.removeAttribute('src');
    player.current?.load();
    setListening(null);
  };

  // Files may have changed on the disk since the last visit.
  useEffect(() => {
    if (active) void window.liveChat.scanLibrary().then(setLibrary);
    else {
      player.current?.pause();
      setListening(null);
    }
  }, [active]);

  useEffect(() => setShown(PAGE_SIZE), [category, search, sort]);

  useEffect(() => {
    if (state.settings.clean) stopListening();
  }, [state.settings.clean]);

  if (!library) return <section className="glass panel library" aria-label="Bibliothèque" />;

  const needle = search.trim().toLocaleLowerCase('fr');
  const matches = (name: string) => name.toLocaleLowerCase('fr').includes(needle);
  const isOnline = canSendIn(state.party);
  const canSend = isOnline && state.upload === null;

  const addFolder = async () => {
    setError(null);
    const view = await window.liveChat.addLibraryFolder();
    if (view) setLibrary(view);
  };

  const use = async (file: LibraryFileView) => {
    setError(null);
    if (scene.active) {
      const problem = await scene.addFromLibrary(file.id);
      if (problem) setError(problem);
      else onOpenEditor();
      return;
    }
    const result = await window.liveChat.useLibraryFile(file.id);
    if (!result.ok) {
      setError('Ce fichier n’est plus là.');
      return;
    }
    files.adopt(result.draft);
    onOpenEditor();
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
    loadInEditor(result, files, scene);
    onOpenEditor();
  };

  const relocate = async (saved: SavedView) => {
    setError(null);
    const result = await window.liveChat.relocateSaved(saved.id);
    setLibrary(result.library);
    if (result.outcome === 'wrong_file') setError('Ce n’est pas un des fichiers qui manquent.');
  };

  const sendNow = async (file: LibraryFileView) => {
    const length = await playLengthMs(file);
    if (length === null) {
      setError('Ce fichier ne peut pas être lu. Essaie un autre format.');
      return;
    }
    const result = await window.liveChat.sendLibraryFile(file.id, length);
    if (!result.ok && result.error !== 'cancelled') setError(mediaErrorMessage(result.error));
  };

  const rename = async (event: FormEvent) => {
    event.preventDefault();
    if (!renaming) return;
    const result = await window.liveChat.renameLibraryFile(renaming.file.id, renaming.name);
    setLibrary(result.library);
    if (result.outcome === 'renamed') {
      setRenaming(null);
      setError(null);
    } else {
      setError(RENAME_ERRORS[result.outcome]);
    }
  };

  const trash = async (file: LibraryFileView) => {
    stopListening();
    const result = await window.liveChat.trashLibraryFile(file.id);
    setLibrary(result.library);
    if (result.outcome === 'busy') setError(RENAME_ERRORS.busy);
  };

  const showFileMenu = async (file: LibraryFileView) => {
    setError(null);
    const { action, missing, library: changed } = await window.liveChat.showLibraryFileMenu(file.id, canSend);
    if (changed) setLibrary(changed);
    if (missing) setError('Ce fichier n’est plus là.');
    if (action?.startsWith('assign:')) {
      const length = await playLengthMs(file);
      if (length === null) setError('Ce fichier ne peut pas être lu. Essaie un autre format.');
      else setLibrary(await window.liveChat.assignFileShortcut(file.id, action.slice('assign:'.length), length));
    }
    if (action === 'use') void use(file);
    if (action === 'send') void sendNow(file);
    if (action === 'listen') listen(file);
    if (action === 'favorite') favorite(file, !file.favorite);
    if (action === 'trash') void trash(file);
    if (action === 'rename') {
      stopListening();
      setRenaming({ file, name: file.name.slice(0, file.name.lastIndexOf('.')) });
    }
  };

  const showSavedMenu = async (saved: SavedView) => {
    setError(null);
    const { action, library: changed } = await window.liveChat.showSavedMenu(saved.id, canSend);
    if (changed) setLibrary(changed);
    if (action === 'send') void sendSaved(saved);
    if (action === 'edit') void editSaved(saved);
    if (action === 'relocate') void relocate(saved);
    if (action === 'favorite') void window.liveChat.setSavedFavorite(saved.id, !saved.favorite).then(setLibrary);
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
              onClick={() => onCategory(value)}
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

      {renaming && (
        <form className="library-manage library-rename" onSubmit={(event) => void rename(event)}>
          <label className="field">
            <span>Nouveau nom</span>
            <span className="library-rename-name">
              <input
                className="input"
                autoFocus
                value={renaming.name}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setRenaming(null);
                }}
              />
              <span className="mono hint">.{extensionOf(renaming.file.name)}</span>
            </span>
          </label>
          <span className="field-line">
            <button type="button" className="pill quiet small" onClick={() => setRenaming(null)}>
              Annuler
            </button>
            <button type="submit" className="pill secondary small" disabled={!renaming.name.trim()}>
              Renommer
            </button>
          </span>
        </form>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {state.upload && (
        <p className="hint" role="status">
          {state.upload.paused ? (
            <>Pas de connexion : {state.upload.name} partira tout seul à son retour</>
          ) : (
            <>
              Envoi de {state.upload.name}… <span className="mono">{state.upload.percent} %</span>
            </>
          )}
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
                  onMenu={() => void showSavedMenu(saved)}
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
                  onMenu={() => void showFileMenu(file)}
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
                  onMenu={() => void showFileMenu(file)}
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
