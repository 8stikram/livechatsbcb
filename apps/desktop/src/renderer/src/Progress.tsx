import { useState } from 'react';

// Drawn by the browser alone, so that nothing runs for it while a game is playing. Its delay is relative to when it
// first appears, which is why it can't follow every new render.
export const Progress = ({ startAt, durationMs }: { startAt: number; durationMs: number }) => {
  const [delayMs] = useState(() => startAt - Date.now());

  return (
    <div className="progress" aria-hidden="true">
      <i style={{ animationDuration: `${durationMs}ms`, animationDelay: `${delayMs}ms` }} />
    </div>
  );
};
