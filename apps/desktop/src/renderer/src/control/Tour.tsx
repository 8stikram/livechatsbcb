import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { keyLabel, type Settings } from '../../../shared/ipc';
import type { View } from './Header';

type Step = { view: View; target: string; title: string; text: string };

const stepsFor = (settings: Settings): Step[] => [
  {
    view: 'media',
    target: 'tab-media',
    title: 'Prépare un LiveChat',
    text: 'Glisse une image, une vidéo ou un son, ou colle un lien YouTube, TikTok, SoundCloud. Ctrl+V marche partout.',
  },
  {
    view: 'media',
    target: 'send',
    title: 'Envoie',
    text: 'Toute la party le voit en même temps, par-dessus le jeu.',
  },
  {
    view: 'party',
    target: 'tab-party',
    title: 'Ta party',
    text: 'Tes potes, leur statut, et Chuchoter pour n’envoyer qu’à un seul.',
  },
  {
    view: 'party',
    target: 'stop',
    title: 'Panique',
    text: settings.cleanKey
      ? `Arrête tout chez toi d’un clic. En jeu, appuie sur ${keyLabel(settings.cleanKey)}.`
      : 'Arrête tout chez toi d’un clic. Les autres ne voient rien.',
  },
  {
    view: 'settings',
    target: 'settings-shortcuts',
    title: 'Raccourcis',
    text: 'Donne une touche à tes LiveChats préférés pour les envoyer sans quitter le jeu.',
  },
];

const GAP = 12;
const MARGIN = 16;
const WIDTH = 300;

type Place = { top: number; left: number; arrow: number; below: boolean } | null;

// Bubbles that point at the real buttons, one after the other. Nothing behind them is blocked.
export const Tour = ({ settings, onView, onDone }: { settings: Settings; onView: (view: View) => void; onDone: () => void }) => {
  const [index, setIndex] = useState(0);
  const [place, setPlace] = useState<Place>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const steps = stepsFor(settings);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  useEffect(() => onView(step.view), [step.view]);

  // The views slide in, and the window can change size: the place is measured again a few times a second.
  useLayoutEffect(() => {
    const measure = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      const box = target?.getBoundingClientRect();
      const height = bubble.current?.offsetHeight ?? 150;
      if (!box || box.width === 0) {
        setPlace(null);
        return;
      }
      const centre = box.left + box.width / 2;
      const left = Math.min(Math.max(centre - WIDTH / 2, MARGIN), window.innerWidth - WIDTH - MARGIN);
      const below = box.bottom + GAP + height < window.innerHeight - MARGIN;
      const top = below ? box.bottom + GAP : Math.max(MARGIN, box.top - GAP - height);
      setPlace((old) =>
        old && old.top === top && old.left === left && old.below === below ? old : { top, left, below, arrow: centre - left },
      );
    };
    measure();
    const timer = setInterval(measure, 200);
    window.addEventListener('resize', measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  const style: CSSProperties = place
    ? ({ top: place.top, left: place.left, '--arrow': `${place.arrow}px` } as CSSProperties)
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div
      ref={bubble}
      key={index}
      className={`tour-bubble glass${place ? (place.below ? ' is-below' : ' is-above') : ''}`}
      style={style}
      role="dialog"
      aria-label="Découverte de l’app"
      data-testid="tour"
    >
      <p className="tour-count mono">
        {index + 1} / {steps.length}
      </p>
      <p className="tour-title">{step.title}</p>
      <p className="tour-text">{step.text}</p>
      <span className="tour-actions">
        <button type="button" className="pill quiet small" onClick={onDone}>
          Passer
        </button>
        <button type="button" className="pill primary small" autoFocus onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? 'C’est parti' : 'Suivant'}
        </button>
      </span>
    </div>
  );
};
