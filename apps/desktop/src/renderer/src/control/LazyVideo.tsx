import { useEffect, useRef, useState } from 'react';

// A video thumbnail that only exists once it scrolls into view: a long list of them would make every one start a
// decoder at once, enough to freeze a modest PC.
export const LazyVideo = ({ src, className, testId }: { src: string; className?: string; testId?: string }) => {
  const holder = useRef<HTMLSpanElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const element = holder.current;
    if (!element || seen) return;
    const watcher = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    });
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [seen]);

  if (!seen) return <span ref={holder} className={className} data-testid={testId} />;
  return <video className={className} src={`${src}#t=0.1`} muted loop playsInline preload="metadata" data-testid={testId} />;
};
