import { useEffect, useRef, useState, type ReactNode } from 'react';

const CONFIRM_WINDOW_MS = 4_000;

export const ConfirmButton = ({
  label,
  confirmLabel,
  onConfirm,
  className = 'pill quiet small',
  title,
}: {
  label: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  title?: string;
}) => {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <button
      type="button"
      className={armed ? `${className} is-armed` : className}
      title={title}
      aria-label={title}
      onClick={() => {
        window.clearTimeout(timer.current);
        if (armed) {
          setArmed(false);
          onConfirm();
          return;
        }
        setArmed(true);
        timer.current = window.setTimeout(() => setArmed(false), CONFIRM_WINDOW_MS);
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  );
};
