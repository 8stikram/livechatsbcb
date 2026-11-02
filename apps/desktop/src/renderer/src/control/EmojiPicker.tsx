import { useEffect, useRef, useState } from 'react';

type Emoji = { u: string; l: string; g: number; t: string };

const GROUPS: Array<[number, string, string]> = [
  [0, 'Smileys', '😀'],
  [1, 'Personnes', '👋'],
  [3, 'Animaux', '🐱'],
  [4, 'Nourriture', '🍔'],
  [5, 'Voyages', '🚗'],
  [6, 'Activités', '⚽'],
  [7, 'Objets', '💡'],
  [8, 'Symboles', '❤️'],
  [9, 'Drapeaux', '🏁'],
];

const RECENT_KEY = 'recent-emojis';
const MAX_RECENT = 16;
const MAX_FOUND = 120;

// The newest combined emojis aren't drawn by the font yet: they would show as two side by side.
const drawnAsOne = async (emojis: Emoji[]): Promise<Emoji[]> => {
  await document.fonts.load('20px Twemoji', '😀');
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return emojis;
  context.font = '20px Twemoji, "Segoe UI Emoji"';
  const one = context.measureText('😀').width;
  return emojis.filter(({ u }) => context.measureText(u).width <= one * 1.2);
};

const plain = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const readRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};

export const EmojiButton = ({ onPick }: { onPick: (emoji: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<Emoji[] | null>(null);
  const [group, setGroup] = useState(0);
  const [search, setSearch] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (!all) void import('./emojis.json').then(({ default: emojis }) => drawnAsOne(emojis as Emoji[])).then(setAll);
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (emoji: string) => {
    onPick(emoji);
    const next = [emoji, ...recent.filter((other) => other !== emoji)].slice(0, MAX_RECENT);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Only the recent ones are lost.
    }
  };

  const needle = plain(search.trim());
  const shown = !all
    ? []
    : needle
      ? all.filter(({ l, t }) => plain(`${l} ${t}`).includes(needle)).slice(0, MAX_FOUND)
      : all.filter(({ g }) => g === group);

  const grid = (emojis: Array<{ u: string; l: string }>, prefix: string) =>
    emojis.map(({ u, l }) => (
      <button key={prefix + u} type="button" className="emoji" title={l} aria-label={l} onClick={() => pick(u)}>
        {u}
      </button>
    ));

  return (
    <div className="emoji-root" ref={root}>
      <button type="button" className="pill quiet small" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span aria-hidden="true">😀</span> Emoji
      </button>
      {open && (
        <div className="emoji-panel" role="dialog" aria-label="Choisir un emoji">
          <input
            className="input"
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Chercher un emoji"
            aria-label="Chercher un emoji"
          />
          {!needle && (
            <div className="emoji-groups" role="group" aria-label="Catégories">
              {GROUPS.map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  className={id === group ? 'emoji is-active' : 'emoji'}
                  title={label}
                  aria-label={label}
                  aria-pressed={id === group}
                  onClick={() => setGroup(id)}
                >
                  {icon}
                </button>
              ))}
            </div>
          )}
          <div className="emoji-grid scroll">
            {!needle && recent.length > 0 && (
              <>
                <p className="emoji-title">Récents</p>
                {grid(recent.map((u) => ({ u, l: all?.find((emoji) => emoji.u === u)?.l ?? u })), 'recent-')}
                <p className="emoji-title">{GROUPS.find(([id]) => id === group)?.[1]}</p>
              </>
            )}
            {grid(shown, '')}
            {needle && all && shown.length === 0 && <p className="hint">Aucun emoji trouvé.</p>}
          </div>
        </div>
      )}
    </div>
  );
};
