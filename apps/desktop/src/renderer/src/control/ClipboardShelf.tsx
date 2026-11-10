import { useEffect, useState } from 'react';
import type { ClipView, IncomingResult } from '../../../shared/ipc';
import { Star } from './LibraryScreen';

// The pictures copied while the app ran. They stay on this PC; a click puts one in the LiveChat.
export const useClipboardShelf = () => {
  const [items, setItems] = useState<ClipView[]>([]);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const refresh = () =>
      void window.liveChat.listClipboard().then((list) => {
        setItems(list.items);
        setPaused(list.paused);
      });
    refresh();
    return window.liveChat.onClipboardChanged(refresh);
  }, []);

  return { items, paused };
};

export const ClipboardShelf = ({
  items,
  paused,
  advanced,
  onBringIn,
}: {
  items: ClipView[];
  paused: boolean;
  advanced: boolean;
  onBringIn: (pasted: Promise<IncomingResult>) => void;
}) => (
  <>
    <div className="library-manage clipboard-bar">
      <p className="hint">Les images que tu copies (Ctrl+C) pendant que l’app tourne. Elles restent sur ton PC.</p>
      <span className="spacer" />
      <button type="button" className="pill quiet small" data-testid="clipboard-pause" onClick={() => void window.liveChat.pauseClipboard(!paused)}>
        {paused ? 'Reprendre' : 'Pause'}
      </button>
      <button
        type="button"
        className="pill quiet small"
        data-testid="clipboard-clear"
        disabled={!items.some((item) => !item.starred)}
        onClick={() => void window.liveChat.clearClipboard()}
      >
        Vider
      </button>
    </div>
    {paused && (
      <p className="hint" role="status">
        En pause : ce que tu copies n’arrive plus ici.
      </p>
    )}
    {items.length === 0 ? (
      <div className="history-empty">
        <p className="draft-empty-title">Rien ici pour l’instant</p>
        <p className="hint">Copie une image (Ctrl+C) : elle arrive ici.</p>
      </div>
    ) : (
      <div className="library-list scroll">
        <ul className="library-grid">
          {items.map((item) => (
            <li key={item.id} className="library-card" data-testid="clipboard-item">
              <button
                type="button"
                className="library-picture"
                title="Mettre dans mon LiveChat"
                onClick={() => onBringIn(window.liveChat.useClipboardImage(item.id, advanced))}
              >
                <img src={item.url} alt="" loading="lazy" />
              </button>
              <span className="library-card-foot">
                <span className="row-title mono">
                  {item.width}×{item.height}
                </span>
                <span data-testid="clipboard-star" title="Une étoile la garde pour toujours, même après « Vider »">
                  <Star on={item.starred} onChange={(on) => void window.liveChat.starClipboardImage(item.id, on)} />
                </span>
                <button
                  type="button"
                  className="pill quiet small"
                  title="Retirer"
                  aria-label="Retirer"
                  onClick={() => void window.liveChat.removeClipboardImage(item.id)}
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}
  </>
);
