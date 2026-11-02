import { useEffect, useRef, useState } from 'react';
import { keyLabel, ON_MAC } from '../../../shared/ipc';

const acceleratorOf = (event: KeyboardEvent): string | null => {
  // Option changes the character typed on a Mac, so the key is read from its place.
  const typed = ON_MAC ? (event.code.match(/^(?:Digit|Key)(.)$/)?.[1] ?? event.key) : event.key;
  const key =
    event.code === 'Space' ? 'Space' : /^F\d{1,2}$/.test(event.key) || event.key === 'Pause' ? event.key : /^[a-z0-9]$/i.test(typed) ? typed.toUpperCase() : null;
  if (!key) return null;
  const mods = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift'].filter(Boolean);
  // A letter alone would be taken from everything you type, everywhere.
  if (mods.length === 0 && !/^F\d|^Pause$/.test(key)) return null;
  return [...mods, key].join('+');
};

// The next key pressed, whatever has the focus. Escape changes your mind.
export const useKeyCapture = (active: boolean, onKey: (key: string) => void, onCancel: () => void): void => {
  const latest = useRef({ onKey, onCancel });
  latest.current = { onKey, onCancel };

  useEffect(() => {
    if (!active) return;
    const listen = (event: KeyboardEvent) => {
      event.preventDefault();
      if (event.key === 'Escape') {
        latest.current.onCancel();
        return;
      }
      const accelerator = acceleratorOf(event);
      if (accelerator) latest.current.onKey(accelerator);
    };
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, [active]);
};

export const KeyButton = ({ current, onChoose, testId }: { current: string | null; onChoose: (key: string) => void; testId?: string }) => {
  const [recording, setRecording] = useState(false);
  useKeyCapture(
    recording,
    (key) => {
      setRecording(false);
      onChoose(key);
    },
    () => setRecording(false),
  );

  return (
    <button type="button" className="pill secondary small mono key-button" data-testid={testId} onClick={() => setRecording(!recording)}>
      {recording ? 'Appuie sur une touche…' : keyLabel(current)}
    </button>
  );
};
