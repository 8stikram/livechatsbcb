import { useState, type MouseEvent } from 'react';
import { WHEEL_SIZE, type WheelView } from '../../../shared/ipc';

// In percent of the wheel's half width, as in its drawing.
const INNER = 34;
const OUTER = 98;
const LABEL = 66;
const SLICE = 360 / WHEEL_SIZE;
const GAP = 1.5;

const pointAt = (radius: number, degrees: number): string => {
  const radians = (degrees * Math.PI) / 180;
  return `${(radius * Math.sin(radians)).toFixed(2)} ${(-radius * Math.cos(radians)).toFixed(2)}`;
};

const wedge = (index: number): string => {
  const from = index * SLICE - SLICE / 2 + GAP;
  const to = index * SLICE + SLICE / 2 - GAP;
  return `M ${pointAt(INNER, from)} L ${pointAt(OUTER, from)} A ${OUTER} ${OUTER} 0 0 1 ${pointAt(OUTER, to)} L ${pointAt(INNER, to)} A ${INNER} ${INNER} 0 0 0 ${pointAt(INNER, from)} Z`;
};

// Which place the mouse points at, wherever on the screen it is. Near the middle, none.
const aimedAt = (event: MouseEvent): number | null => {
  const dx = event.clientX - window.innerWidth / 2;
  const dy = event.clientY - window.innerHeight / 2;
  const halfWidth = Math.min(window.innerWidth, window.innerHeight) * 0.35;
  if (Math.hypot(dx, dy) < (halfWidth * INNER) / 100) return null;
  const degrees = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360 + SLICE / 2) % 360;
  return Math.floor(degrees / SLICE) % WHEEL_SIZE;
};

export const Wheel = ({ wheel }: { wheel: WheelView }) => {
  const [aimed, setAimed] = useState<number | null>(null);

  const onMove = (event: MouseEvent) => {
    const next = aimedAt(event);
    if (next === aimed) return;
    setAimed(next);
    void window.liveChat.wheelActivity();
  };

  const onClick = (event: MouseEvent) => {
    const index = aimedAt(event);
    if (index !== null && wheel.slots[index]) void window.liveChat.pickWheel(index);
    else void window.liveChat.closeWheel();
  };

  return (
    <div className="wheel" data-testid="wheel" onMouseMove={onMove} onClick={onClick}>
      <div className="wheel-ring">
        <svg viewBox="-100 -100 200 200" aria-hidden="true">
          {wheel.slots.map((slot, index) => (
            <path key={index} d={wedge(index)} className={`wheel-slice${slot ? '' : ' is-empty'}${aimed === index ? ' is-aimed' : ''}`} />
          ))}
        </svg>
        {wheel.slots.map((slot, index) => {
          const radians = (index * SLICE * Math.PI) / 180;
          return (
            <span
              key={index}
              className={slot ? 'wheel-label' : 'wheel-label is-empty'}
              style={{ left: `${50 + (LABEL / 2) * Math.sin(radians)}%`, top: `${50 - (LABEL / 2) * Math.cos(radians)}%` }}
              data-testid={`wheel-slot-${index}`}
            >
              {slot?.name ?? 'Vide'}
            </span>
          );
        })}
        <span className="wheel-center" data-testid="wheel-center">
          {wheel.preview ? 'Aperçu : rien ne part' : wheel.last ? `Dernier : ${wheel.last}` : 'Vise, puis clique'}
        </span>
      </div>
    </div>
  );
};
