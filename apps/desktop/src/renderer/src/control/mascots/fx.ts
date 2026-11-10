import type { FxSpec } from './persona';

export type Fx = {
  burst(specs: FxSpec[]): void;
  setAmbient(specs: FxSpec[]): void;
  enable(on: boolean): void;
  destroy(): void;
};

/**
 * One canvas over the stage, positions in scene units (640x400).
 * Port of the `fx` block of docs/persos/engine.html: same particles, same maths.
 * The loop only runs while the stage is on screen and the page is visible.
 */
export function createFx(canvas: HTMLCanvasElement, svg: SVGSVGElement, stage: HTMLElement): Fx {
  const cv = canvas;
  const ctx = cv.getContext('2d')!;
  type Part = Record<string, any>;
  let parts: Part[] = [];
  let ambient: Part[] = [];
  let on = true;
  let last = performance.now();
  let W = 0;
  let H = 0;
  let dpr = 1;
  const MAX = 700;
  const timers = new Set<number>();

  const resize = () => {
    const r = stage.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    H = r.height;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  let M = { a: 1, d: 1, e: 0, f: 0 };
  let S = 1;
  const refresh = () => {
    const m = svg.getScreenCTM();
    if (!m) return;
    const r = cv.getBoundingClientRect();
    M = { a: m.a, d: m.d, e: m.e - r.left, f: m.f - r.top };
    S = m.a;
  };
  const P = (x: number, y: number): [number, number] => [M.a * x + M.e, M.d * y + M.f];
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)] as T;
  const add = (p: Part) => {
    if (parts.length < MAX) parts.push(p);
  };
  const CONF = ['#ffcf4a', '#ff4d6d', '#4cc9f0', '#8ee6b4', '#b48cff', '#ffffff'];
  const RATES: Record<string, number> = { rain: 60, dust: 6, smoke: 5, bubbles: 6, stars: 4, embers: 5 };

  const make: Record<string, (s: any) => void> = {
    rain(s) { const [x, y, w] = s.box; add({ t: 'rain', x: rnd(x, x + w), y: y - 10, vx: s.wind ?? -60, vy: rnd(520, 700), len: rnd(10, 22), life: 2, box: s.box, c: s.color || 'rgba(190,210,240,.35)' }); },
    dust(s) { const [x, y, w, h] = s.box; add({ t: 'dust', x: rnd(x, x + w), y: rnd(y, y + h), vx: rnd(-6, 6), vy: rnd(-8, 2), r: rnd(.6, 1.8), life: rnd(3, 7), max: 0, ph: rnd(0, 6), c: s.color || '255,236,190' }); },
    smoke(s) { const [x, y] = s.from; add({ t: 'smoke', x: x + rnd(-4, 4), y, vx: rnd(-6, 6) + (s.wind || 0), vy: rnd(-26, -14) * (s.speed || 1), r: rnd(4, 8) * (s.size || 1), grow: rnd(8, 16) * (s.size || 1), life: rnd(2.2, 3.6), max: 0, c: s.color || '200,200,210', a: s.alpha ?? .22 }); },
    bubbles(s) { const [x, y] = s.from; add({ t: 'bubble', x: x + rnd(-6, 6), y, vx: rnd(-4, 4), vy: rnd(-40, -22), r: rnd(1.5, 4), life: rnd(1, 2), max: 0, c: s.color || '160,255,190' }); },
    stars(s) { const [x, y, w, h] = s.box; add({ t: 'star', x: rnd(x, x + w), y: rnd(y, y + h), r: rnd(.8, 2.2), life: rnd(1.5, 3.5), max: 0, c: s.color || '255,240,200' }); },
    embers(s) { const [x, y] = s.from; add({ t: 'spark', x: x + rnd(-8, 8), y, vx: rnd(-10, 10), vy: rnd(-50, -20), g: -6, life: rnd(1, 2.2), max: 0, c: s.color || '255,170,60', w: 1.6 }); },
  };
  const burstMake: Record<string, (s: any) => void> = {
    confetti(s) {
      const n = s.n || 120;
      for (let i = 0; i < n; i++) add({ t: 'conf', x: rnd(0, 640), y: rnd(-60, -5), vx: rnd(-40, 40), vy: rnd(60, 180), rot: rnd(0, 6), vr: rnd(-8, 8), w: rnd(4, 7), h: rnd(7, 12), life: rnd(2.5, 4), max: 0, c: pick(s.colors || CONF), g: 60 });
    },
    sparks(s) {
      const [x, y] = s.at, n = s.n || 40;
      for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(80, 260) * (s.power || 1); add({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 260, life: rnd(.4, 1), max: 0, c: s.color || '255,200,90', w: 2 }); }
    },
    smoke(s) {
      const [x, y] = s.at, n = s.n || 14;
      for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(10, 60); add({ t: 'smoke', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, r: rnd(8, 16), grow: rnd(20, 40), life: rnd(1.2, 2.4), max: 0, c: s.color || '190,190,200', a: s.alpha ?? .4 }); }
    },
    lines(s) {
      const [x, y] = s.at, n = s.n || 22;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rnd(-.08, .08); add({ t: 'line', x, y, a, d: rnd(40, 70), sp: rnd(380, 560), len: rnd(18, 46), life: rnd(.28, .45), max: 0, c: s.color || '255,255,255' }); }
    },
    stars(s) {
      const [x, y] = s.at, n = s.n || 24;
      for (let i = 0; i < n; i++) { const a = rnd(0, Math.PI * 2), v = rnd(30, 140); add({ t: 'starb', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rnd(2, 4.5), life: rnd(.7, 1.4), max: 0, c: s.color || '255,230,150' }); }
    },
    bubbles(s) { for (let i = 0; i < (s.n || 20); i++) make.bubbles!({ from: s.at, color: s.color }); },
    arc(s) { add({ t: 'arc', from: s.from, to: s.to, life: s.life || .5, max: 0, c: s.color || '170,220,255', seed: 0 }); },
    flash() {
      const f = stage.querySelector<HTMLElement>('.mascot-flash');
      if (!f) return;
      f.classList.remove('on');
      void f.offsetWidth;
      f.classList.add('on');
    },
    shake() {
      stage.classList.remove('shake');
      void stage.offsetWidth;
      stage.classList.add('shake');
    },
  };

  const burst = (specs: FxSpec[]) => {
    if (!on) return;
    refresh();
    for (const s of ([] as FxSpec[]).concat(specs || [])) {
      const go = () => {
        refresh();
        burstMake[s.type]?.(s);
      };
      const delay = s.delay as number | undefined;
      if (delay) {
        const id = window.setTimeout(() => {
          timers.delete(id);
          if (on) go();
        }, delay);
        timers.add(id);
      } else go();
    }
  };
  const setAmbient = (specs: FxSpec[]) => {
    ambient = (specs || []).map((s) => ({ ...s, acc: 0 }));
    parts = [];
  };
  const zig = (x1: number, y1: number, x2: number, y2: number): [number, number][] => {
    const pts: [number, number][] = [[x1, y1]];
    const n = 9;
    for (let i = 1; i < n; i++) { const t = i / n; pts.push([x1 + (x2 - x1) * t + rnd(-9, 9), y1 + (y2 - y1) * t + rnd(-9, 9)]); }
    pts.push([x2, y2]);
    return pts;
  };

  let raf = 0;
  let running = false;
  const frame = (now: number) => {
    raf = 0;
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (on) {
      refresh();
      for (const a of ambient) {
        if (a.type === 'arc') {
          a.acc += dt * 1000;
          if (a.acc > (a.every || 1400)) { a.acc = 0; burstMake.arc!({ from: a.from, to: a.to, color: a.color, life: .35 }); }
          continue;
        }
        const rate = (a.density || 1) * (RATES[a.type] || 4);
        a.acc += dt * rate;
        while (a.acc >= 1) { a.acc -= 1; make[a.type]?.(a); }
      }
      const keep: Part[] = [];
      for (const p of parts) {
        p.life -= dt;
        if (p.max === 0) p.max = p.life + dt;
        if (p.life <= 0) continue;
        keep.push(p);
        const k = Math.max(0, p.life / (p.max || 1));
        if (p.t === 'rain') {
          p.x += p.vx * dt; p.y += p.vy * dt;
          const [bx, by, bw, bh] = p.box;
          if (p.y > by + bh || p.x < bx || p.x > bx + bw) { p.life = 0; continue; }
          const [x1, y1] = P(p.x, p.y), [x2, y2] = P(p.x - p.vx * .02, p.y - p.len);
          ctx.strokeStyle = p.c; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        } else if (p.t === 'dust' || p.t === 'star') {
          if (p.t === 'dust') { p.x += (p.vx + Math.sin(now / 900 + p.ph) * 4) * dt; p.y += p.vy * dt; }
          const tw = Math.sin((1 - k) * Math.PI);
          const [x, y] = P(p.x, p.y);
          ctx.fillStyle = `rgba(${p.c},${(p.t === 'star' ? .9 : .6) * tw})`;
          ctx.beginPath(); ctx.arc(x, y, p.r * S, 0, Math.PI * 2); ctx.fill();
          if (p.t === 'star') { ctx.strokeStyle = `rgba(${p.c},${.5 * tw})`; ctx.lineWidth = .8 * S; ctx.beginPath(); ctx.moveTo(x - p.r * 3 * S, y); ctx.lineTo(x + p.r * 3 * S, y); ctx.moveTo(x, y - p.r * 3 * S); ctx.lineTo(x, y + p.r * 3 * S); ctx.stroke(); }
        } else if (p.t === 'smoke') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .99;
          const r = (p.r + p.grow * (1 - k)) * S, [x, y] = P(p.x, p.y);
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, `rgba(${p.c},${p.a * Math.sin(k * Math.PI)})`); g.addColorStop(1, `rgba(${p.c},0)`);
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        } else if (p.t === 'bubble') {
          p.x += (p.vx + Math.sin(now / 200 + p.y) * 8) * dt; p.y += p.vy * dt;
          const [x, y] = P(p.x, p.y);
          ctx.strokeStyle = `rgba(${p.c},${.8 * k})`; ctx.lineWidth = 1 * S; ctx.beginPath(); ctx.arc(x, y, p.r * S, 0, Math.PI * 2); ctx.stroke();
        } else if (p.t === 'spark') {
          p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
          const [x1, y1] = P(p.x, p.y), [x2, y2] = P(p.x - p.vx * .03, p.y - p.vy * .03);
          ctx.strokeStyle = `rgba(${p.c},${k})`; ctx.lineWidth = (p.w || 2) * S; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        } else if (p.t === 'conf') {
          p.vy += p.g * dt * .2; p.x += (p.vx + Math.sin(now / 300 + p.rot) * 30) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
          const [x, y] = P(p.x, p.y);
          ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 2));
          ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.c; ctx.fillRect(-p.w * S / 2, -p.h * S / 2, p.w * S, p.h * S); ctx.restore();
        } else if (p.t === 'line') {
          p.d += p.sp * dt;
          const [x1, y1] = P(p.x + Math.cos(p.a) * p.d, p.y + Math.sin(p.a) * p.d), [x2, y2] = P(p.x + Math.cos(p.a) * (p.d + p.len), p.y + Math.sin(p.a) * (p.d + p.len));
          ctx.strokeStyle = `rgba(${p.c},${k})`; ctx.lineWidth = 3 * S * k; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        } else if (p.t === 'starb') {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .96; p.vy *= .96;
          const [x, y] = P(p.x, p.y), r = p.r * S * (0.6 + k * .6);
          ctx.fillStyle = `rgba(${p.c},${k})`;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .38 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
          ctx.closePath(); ctx.fill();
        } else if (p.t === 'arc') {
          const pts = zig(...P(p.from[0], p.from[1]), ...P(p.to[0], p.to[1]));
          ctx.save(); ctx.shadowColor = `rgba(${p.c},1)`; ctx.shadowBlur = 12 * S;
          ctx.strokeStyle = `rgba(${p.c},${k})`; ctx.lineWidth = 2 * S; ctx.lineJoin = 'round';
          ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
          ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = .8 * S; ctx.stroke(); ctx.restore();
        }
      }
      parts = keep;
    }
    if (running) raf = requestAnimationFrame(frame);
  };

  // The loop runs only while on screen and the page is visible.
  let onScreen = true;
  const sync = () => {
    const want = onScreen && document.visibilityState === 'visible';
    if (want && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!want && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) onScreen = e.isIntersecting;
    sync();
  });
  io.observe(stage);
  document.addEventListener('visibilitychange', sync);
  sync();

  return {
    burst,
    setAmbient,
    enable(v: boolean) {
      on = v;
      if (!v) {
        parts = [];
        for (const id of timers) clearTimeout(id);
        timers.clear();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
      }
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      for (const id of timers) clearTimeout(id);
      timers.clear();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', sync);
      parts = [];
    },
  };
}
