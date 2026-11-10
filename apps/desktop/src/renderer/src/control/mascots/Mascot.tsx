import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './mascot.css';
import { createFx, type Fx } from './fx';
import { PERSONAS, type FxSpec, type Mood, type Persona, type PersonaId } from './persona';
import { PIECE_SETTINGS } from './settings';

const MOODS: Mood[] = ['repos', 'louche', 'rire', 'victoire', 'decu', 'surprise'];

export type MascotProps = {
  persona: PersonaId;
  mood: Mood;
  /** A counter: each increment replays the current mood and fires its bursts. */
  pulse: number;
  /** -1 (left) ... 1 (right): where the eyes lean. */
  look: number;
  effects: boolean;
  frame: 'scene' | 'banner' | 'head';
  /** Animations paused and no effects loop (cards, until hover). */
  still?: boolean;
  /** Extra bursts fired with each pulse, on top of the persona's own. */
  burst?: FxSpec[];
};

// ---------- persona CSS: injected once per persona, reference-counted ----------
const styleRefs = new Map<PersonaId, { el: HTMLStyleElement; n: number }>();
function acquireStyle(p: Persona) {
  const hit = styleRefs.get(p.id);
  if (hit) {
    hit.n++;
    return;
  }
  const el = document.createElement('style');
  el.dataset.persona = p.id;
  el.textContent = p.css || '';
  document.head.appendChild(el);
  styleRefs.set(p.id, { el, n: 1 });
}
function releaseStyle(id: PersonaId) {
  const hit = styleRefs.get(id);
  if (!hit) return;
  if (--hit.n <= 0) {
    hit.el.remove();
    styleRefs.delete(id);
  }
}

/** Gives every id of the drawing an instance prefix so two copies on screen never share gradients. */
function prefixIds(svg: string, pre: string): string {
  return svg
    .replace(/(\s)id="([^"]+)"/g, (_m, sp, id) => `${sp}id="${pre}${id}"`)
    .replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (_m, q, id) => `url(${q}#${pre}${id}${q})`)
    .replace(/((?:xlink:)?href)="#([^"]+)"/g, (_m, attr, id) => `${attr}="#${pre}${id}"`);
}

/** Reduced motion: the OS setting or the app's own `calm` class on <html>. */
function useMotionOk(): boolean {
  const read = () =>
    !document.documentElement.classList.contains('calm') &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [ok, setOk] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const upd = () => setOk(read());
    mq.addEventListener('change', upd);
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    upd();
    return () => {
      mq.removeEventListener('change', upd);
      mo.disconnect();
    };
  }, []);
  return ok;
}

export function Mascot({ persona: id, mood, pulse, look, effects, frame, still, burst }: MascotProps) {
  const persona = PERSONAS[id];
  const uid = useId().replace(/\W/g, '');
  const motionOk = useMotionOk();
  const fxOn = effects && motionOk && !still;

  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<Fx | null>(null);
  const [shown, setShown] = useState<Mood>(mood);

  const inner = useMemo(() => prefixIds(persona.svg, `${uid}-`), [persona, uid]);

  // Persona CSS (shared, reference-counted).
  useLayoutEffect(() => {
    acquireStyle(persona);
    return () => releaseStyle(persona.id);
  }, [persona]);

  // ---------- piece placement: variants, then the owner's offsets and scales ----------
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const settings = PIECE_SETTINGS[id];
    const groups = () => [...svg.querySelectorAll<SVGGElement>('[data-el]')];
    const raw = new Map<string, DOMRect | null>();

    const applyVariants = () => {
      for (const el of svg.querySelectorAll<SVGElement>('[data-var]')) {
        el.style.display = settings.vars[el.dataset.var!] === el.dataset.variante ? '' : 'none';
      }
    };
    const place = (g: SVGGElement) => {
      const key = g.dataset.el!;
      const e = settings.pieces[g.dataset.nom ?? ''] ?? { dx: 0, dy: 0, echX: 1, echY: 1 };
      const b = raw.get(key);
      if (g.dataset.t0 === undefined) g.dataset.t0 = g.getAttribute('transform') || '';
      const ident = !e.dx && !e.dy && e.echX === 1 && e.echY === 1;
      if (ident || !b) {
        if (g.dataset.t0) g.setAttribute('transform', g.dataset.t0);
        else g.removeAttribute('transform');
        return;
      }
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      g.setAttribute(
        'transform',
        `translate(${e.dx} ${e.dy}) ${g.dataset.t0} translate(${cx} ${cy}) scale(${e.echX} ${e.echY}) translate(${-cx} ${-cy})`,
      );
    };
    // Raw boxes depend on which variant is shown.
    const recalc = () => {
      for (const g of groups()) {
        const t = g.getAttribute('transform');
        g.removeAttribute('transform');
        if (g.dataset.t0) g.setAttribute('transform', g.dataset.t0);
        try {
          raw.set(g.dataset.el!, g.getBBox());
        } catch {
          raw.set(g.dataset.el!, null);
        }
        if (t !== null) g.setAttribute('transform', t);
        place(g);
      }
    };

    applyVariants();
    recalc();
    let cancelled = false;
    // Boxes measured while hidden or before fonts load are empty: measure again then.
    document.fonts?.ready.then(() => {
      if (!cancelled) recalc();
    });
    const root = rootRef.current;
    let seen = false;
    const io = root
      ? new IntersectionObserver((es) => {
          if (!seen && es.some((x) => x.isIntersecting)) {
            seen = true;
            recalc();
          }
        })
      : null;
    if (root) io!.observe(root);
    return () => {
      cancelled = true;
      io?.disconnect();
    };
  }, [id, inner]);

  // ---------- effects: canvas, flash, shake ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const svg = svgRef.current;
    const root = rootRef.current;
    if (!fxOn || !canvas || !svg || !root) return;
    const fx = createFx(canvas, svg, root);
    fx.setAmbient(persona.ambient || []);
    fxRef.current = fx;
    return () => {
      fx.destroy();
      fxRef.current = null;
    };
  }, [fxOn, persona]);

  // ---------- moods: classes on the svg, replayed on each pulse ----------
  const burstRef = useRef(burst);
  burstRef.current = burst;
  const first = useRef(true);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const apply = (m: Mood) => {
      for (const k of MOODS) svg.classList.remove('mood-' + k);
      void svg.getBoundingClientRect(); // restart the CSS animations
      svg.classList.add('mood-' + m);
      setShown(m);
    };
    apply(mood);
    if (!first.current && mood !== 'repos') {
      fxRef.current?.burst(persona.bursts[mood] || []);
      if (burstRef.current?.length) fxRef.current?.burst(burstRef.current);
    }
    first.current = false;
    if (mood === 'repos') return;
    const t = window.setTimeout(() => apply('repos'), persona.moodMs || 3000);
    return () => clearTimeout(t);
  }, [mood, pulse, persona]);

  // ---------- eyes: ease --look toward the target ----------
  const lookNow = useRef(0);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (!motionOk) {
      lookNow.current = look;
      svg.style.setProperty('--look', look.toFixed(3));
      return;
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      lookNow.current += (look - lookNow.current) * Math.min(1, dt * 7);
      if (Math.abs(look - lookNow.current) < 0.001) lookNow.current = look;
      svg.style.setProperty('--look', lookNow.current.toFixed(3));
      if (lookNow.current !== look) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [look, motionOk, persona]);

  const head = PIECE_SETTINGS[id].head;
  const viewBox = frame === 'head' ? `${head.x} ${head.y} ${head.w} ${head.h}` : '0 0 640 400';
  // The banner is wide and short: anchor to the top so the face stays in view.
  const aspect = frame === 'banner' ? 'xMidYMin slice' : 'xMidYMid slice';
  const cls = `mascot-svg p-${id} mood-${shown}${still ? ' paused' : ''}${motionOk ? '' : ' no-anim'}`;

  return (
    <div ref={rootRef} className="mascot" data-testid="mascot" data-persona={id} data-mood={shown}>
      <svg
        key={id}
        ref={svgRef}
        className={cls}
        viewBox={viewBox}
        preserveAspectRatio={aspect}
        aria-hidden="true"
      >
        <g className="persona" dangerouslySetInnerHTML={{ __html: inner }} />
      </svg>
      {fxOn && <canvas ref={canvasRef} className="mascot-canvas" aria-hidden="true" />}
      {fxOn && <div className="mascot-flash" />}
    </div>
  );
}
