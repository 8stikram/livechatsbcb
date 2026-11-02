import { Children, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

const GLIDE_MS = 525;
const LEAVE_MS = 180;
// Past this, the list didn't change a little: it is another list.
const MOST_RIDERS = 150;
const MOST_LEAVING = 3;

const isCalm = (): boolean =>
  document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;

const rowsOf = (list: HTMLElement): HTMLElement[] =>
  ([...list.children] as HTMLElement[]).filter((row) => !row.classList.contains('is-leaving'));

// What left is drawn once more where it was, out of reach of the page and of anything that counts rows.
const fadeOut = (row: HTMLElement, box: DOMRect, list: HTMLElement): void => {
  const area = list.getBoundingClientRect();
  row.classList.add('is-leaving');
  row.inert = true;
  row.setAttribute('aria-hidden', 'true');
  for (const part of [row, ...row.querySelectorAll('[data-testid]')]) part.removeAttribute('data-testid');
  Object.assign(row.style, {
    position: 'absolute',
    left: `${box.left - area.left - list.clientLeft + list.scrollLeft}px`,
    top: `${box.top - area.top - list.clientTop + list.scrollTop}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: '0',
  });
  list.append(row);
  row.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.96)' }], { duration: LEAVE_MS, easing: 'ease-in' }).onfinish = () => row.remove();
};

// Rows that stay move to their new place instead of jumping there, the way iOS lists do.
export const GlideList = ({ className, children }: { className: string; children: ReactNode }) => {
  const list = useRef<HTMLUListElement>(null);
  const keys = Children.toArray(children)
    .map((child) => (child as { key?: string }).key)
    .join();
  const lastKeys = useRef(keys);
  const before = useRef(new Map<HTMLElement, DOMRect>());

  // While rendering, because the page still shows the old order: it is gone by the time an effect runs.
  if (keys !== lastKeys.current && list.current && list.current.offsetParent !== null) {
    before.current = new Map(rowsOf(list.current).map((row) => [row, row.getBoundingClientRect()]));
  }

  useLayoutEffect(() => {
    lastKeys.current = keys;
    const previous = before.current;
    before.current = new Map();
    const element = list.current;
    if (!element || previous.size === 0 || element.offsetParent === null || isCalm()) return;

    const rows = rowsOf(element);
    const stayed = rows.filter((row) => previous.has(row));
    if (stayed.length === 0 || rows.length > MOST_RIDERS) return;

    const easing = getComputedStyle(document.documentElement).getPropertyValue('--spring');
    for (const row of stayed) {
      const was = previous.get(row)!;
      const box = row.getBoundingClientRect();
      const x = was.left - box.left;
      const y = was.top - box.top;
      if (x !== 0 || y !== 0) row.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing });
    }

    const gone = [...previous].filter(([row]) => !row.isConnected);
    if (gone.length <= MOST_LEAVING) for (const [row, box] of gone) fadeOut(row, box, element);
  }, [keys]);

  return (
    <ul ref={list} className={`glide cascade ${className}`}>
      {children}
    </ul>
  );
};

// The highlight behind the chosen tab, which travels from one to the next. No chosen tab, no highlight.
export const useTabMarker = <T extends HTMLElement>(chosen: string): RefObject<T | null> => {
  const area = useRef<T>(null);

  useLayoutEffect(() => {
    const element = area.current;
    const marker = element?.querySelector<HTMLElement>(':scope > .tab-marker');
    if (!element || !marker) return;

    const place = () => {
      const tab = element.querySelector<HTMLElement>(':scope > .tab.is-active');
      if (!tab) {
        marker.style.opacity = '0';
        return;
      }
      if (tab.offsetWidth === 0) return;
      Object.assign(marker.style, {
        opacity: '1',
        width: `${tab.offsetWidth}px`,
        height: `${tab.offsetHeight}px`,
        transform: `translate(${tab.offsetLeft}px, ${tab.offsetTop}px)`,
        borderRadius: getComputedStyle(tab).borderRadius,
      });
    };

    // Its first place isn't a move, and neither is the window changing size.
    const settle = () => {
      marker.classList.remove('is-moving');
      place();
      void marker.offsetWidth;
      marker.classList.add('is-moving');
    };

    if (marker.style.width) place();
    else settle();

    const watcher = new ResizeObserver(settle);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [chosen]);

  return area;
};
