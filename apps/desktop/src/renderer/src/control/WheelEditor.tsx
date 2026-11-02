import { useState } from 'react';
import { WHEEL_SIZE, type LibraryView, type WheelSlotView } from '../../../shared/ipc';
import { playLengthMs } from './play-length';

// The same places as on the real wheel, starting from the top and going clockwise.
const PLACES: Array<[row: number, column: number]> = [
  [1, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [3, 2],
  [3, 1],
  [2, 1],
  [1, 1],
];

export const WheelEditor = ({ slots }: { slots: WheelSlotView[] }) => {
  const [choosing, setChoosing] = useState<number | null>(null);
  const [library, setLibrary] = useState<LibraryView | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = async (index: number) => {
    setError(null);
    setSearch('');
    setChoosing(index === choosing ? null : index);
    setLibrary(await window.liveChat.scanLibrary());
  };

  const matches = (name: string) => name.toLowerCase().includes(search.trim().toLowerCase());

  const chooseFile = async (file: LibraryView['files'][number]) => {
    if (choosing === null) return;
    // A file sent alone needs its length, which only a page can measure.
    const durationMs = await playLengthMs(file);
    if (durationMs === null) {
      setError('Ce fichier ne peut pas être lu. Essaie un autre format.');
      return;
    }
    await window.liveChat.setWheelSlot(choosing, { kind: 'file', fileId: file.id, durationMs });
    setChoosing(null);
  };

  return (
    <div className="wheel-editor">
      <div className="wheel-places">
        {Array.from({ length: WHEEL_SIZE }, (_, index) => {
          const [row, column] = PLACES[index]!;
          const slot = slots[index] ?? null;
          return (
            <button
              key={index}
              type="button"
              className={choosing === index ? 'wheel-place is-choosing' : 'wheel-place'}
              style={{ gridRow: row, gridColumn: column }}
              title={slot?.name}
              data-testid={`wheel-place-${index}`}
              onClick={() => void open(index)}
            >
              {slot?.name ?? 'Vide'}
            </button>
          );
        })}
        <button type="button" className="pill secondary small wheel-try" style={{ gridRow: 2, gridColumn: 2 }} onClick={() => void window.liveChat.previewWheel()}>
          Aperçu
        </button>
      </div>

      {choosing !== null && (
        <div className="wheel-choices">
          <input
            className="input"
            type="search"
            aria-label="Chercher pour cette place"
            placeholder="Rechercher"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <ul className="wheel-choice-list">
            {library?.saved
              .filter(({ name }) => matches(name))
              .map((saved) => (
                <li key={saved.id}>
                  <button
                    type="button"
                    className="pill quiet small wheel-choice"
                    data-testid="wheel-choice"
                    onClick={() => void window.liveChat.setWheelSlot(choosing, { kind: 'saved', id: saved.id }).then(() => setChoosing(null))}
                  >
                    {saved.name}
                  </button>
                </li>
              ))}
            {library?.files
              .filter(({ name }) => matches(name))
              .map((file) => (
                <li key={file.id}>
                  <button type="button" className="pill quiet small wheel-choice" data-testid="wheel-choice" onClick={() => void chooseFile(file)}>
                    {file.name}
                  </button>
                </li>
              ))}
          </ul>
          <button
            type="button"
            className="pill quiet small"
            disabled={!slots[choosing]}
            onClick={() => void window.liveChat.setWheelSlot(choosing, null).then(() => setChoosing(null))}
          >
            Vider cette place
          </button>
        </div>
      )}
    </div>
  );
};
