import { useEffect, useState } from 'react';
import type { LibraryFileView } from '../../../shared/ipc';
import { KindIcon } from './icons';
import { LazyVideo } from './LazyVideo';

export type Shelf = 'image' | 'video' | 'audio';

const TITLES: Record<Shelf, string> = { image: 'Mes images', video: 'Mes vidéos', audio: 'Mes sons' };

// A small window over the LiveChat tab: pick from the library without leaving it.
export const LibraryPicker = ({ shelf, onShelf, onPick, onClose }: { shelf: Shelf; onShelf: (shelf: Shelf) => void; onPick: (file: LibraryFileView) => void; onClose: () => void }) => {
  const [files, setFiles] = useState<LibraryFileView[] | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void window.liveChat.scanLibrary().then(({ files: found }) => setFiles(found));
  }, []);

  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);

  // By name or by tag: "#drôle" and "drôle" find the same.
  const needle = search.trim().replace(/^#+/, '').toLocaleLowerCase('fr');
  const matches = (text: string) => text.toLocaleLowerCase('fr').includes(needle);
  const shown = (files ?? [])
    .filter((file) => file.kind === shelf && (matches(file.name) || file.tags.some(matches)))
    .toSorted((a, b) => Number(b.favorite) - Number(a.favorite) || b.modifiedAt - a.modifiedAt);

  return (
    <div className="shelf-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="glass shelf-picker" role="dialog" aria-label={TITLES[shelf]} data-testid="library-picker">
        <div className="shelf-head">
          <div className="tabs" role="group" aria-label="Type de fichier">
            {(['image', 'video', 'audio'] as const).map((value) => (
              <button key={value} type="button" className={shelf === value ? 'tab is-active' : 'tab'} aria-pressed={shelf === value} onClick={() => onShelf(value)}>
                {{ image: 'Images', video: 'Vidéos', audio: 'Sons' }[value]}
              </button>
            ))}
          </div>
          <button type="button" className="pill quiet small shelf-close" aria-label="Fermer" onClick={onClose}>
            ×
          </button>
        </div>
        <input
          className="input"
          type="search"
          aria-label="Chercher dans ma bibliothèque"
          placeholder="Nom ou tag"
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {files === null ? null : shown.length === 0 ? (
          <p className="hint">{files.length === 0 ? 'Montre tes dossiers dans l’onglet Bibliothèque.' : 'Rien ici.'}</p>
        ) : (
          <ul className="shelf-list">
            {shown.map((file) => (
              <li key={file.id}>
                <button type="button" className="shelf-file" title={file.name} data-testid="picker-file" onClick={() => onPick(file)}>
                  {file.kind === 'image' && <img src={file.url} alt="" loading="lazy" decoding="async" />}
                  {file.kind === 'video' && <LazyVideo className="shelf-thumb" src={file.url} />}
                  {file.kind === 'audio' && (
                    <span className="shelf-sound">
                      <KindIcon kind="audio" size={24} />
                    </span>
                  )}
                  <span className="shelf-name">{file.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
