// @ts-nocheck - the drawing is built by untyped helper code ported unchanged from docs/persos; only the exported object is typed (Persona).
import type { Persona } from '../persona';
// Monsieur Micro, the club MC of « Meilleure blague ». Original character, no real person.
const r1 = (n) => Math.round(n * 10) / 10;
const pt = (x, y) => `${r1(x)} ${r1(y)}`;
const nest = (cls, inner) => cls.reduceRight((acc, c) => `<g class="${c}">${acc}</g>`, inner);
const piece = (key, nom, cls, inner) => `<g data-el="${key}" data-nom="${nom}">${nest(cls, inner)}</g>`;
const BODY = ['micro-sway', 'micro-breath'];
const HEAD = [...BODY, 'micro-head', 'micro-hl'];
const FACE = [...HEAD, 'micro-face'];
const MOODS = ['repos', 'louche', 'rire', 'victoire', 'decu', 'surprise'];
const mood = (m, inner) => `<g class="micro-mood ${m.split(' ').map((k) => 'micro-is-' + k).join(' ')}">${inner}</g>`;
// Move or mirror a path: every "x y" pair becomes (cx + s*x, cy + y).
const mp = (d, cx = 0, cy = 0, s = 1) => d.replace(/(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)/g, (_, x, y) => `${r1(cx + s * x)} ${r1(cy + +y)}`);
const MX = (d) => mp(d, 644, 0, -1); // mirror across the face axis x = 322
const EK = .9; // eye size
const eyeD = (d, cx, s) => d.replace(/(-?\d*\.?\d+)[ ,]+(-?\d*\.?\d+)/g, (_, x, y) => `${r1(cx + s * EK * x)} ${r1(108 + EK * y)}`);

// Tapered capsule from (x1,y1) to (x2,y2) with widths w1, w2 and round ends.
function cap(x1, y1, x2, y2, w1, w2) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const a = w1 / 2, b = w2 / 2, k = 1.33;
  return `M${pt(x1 + nx * a, y1 + ny * a)} L${pt(x2 + nx * b, y2 + ny * b)} C${pt(x2 + nx * b + ux * b * k, y2 + ny * b + uy * b * k)} ${pt(x2 - nx * b + ux * b * k, y2 - ny * b + uy * b * k)} ${pt(x2 - nx * b, y2 - ny * b)} L${pt(x1 - nx * a, y1 - ny * a)} C${pt(x1 - nx * a - ux * a * k, y1 - ny * a - uy * a * k)} ${pt(x1 + nx * a - ux * a * k, y1 + ny * a - uy * a * k)} ${pt(x1 + nx * a, y1 + ny * a)} Z`;
}

// A velvet sleeve: upper arm S->E, forearm E->W, white cuff and gold cufflink at W.
// The key light comes from the upper left, so the cel shadow sits on the lower-right side.
function sleeve(id, S, E, W, o = {}) {
  const ws = o.ws || 38, we = o.we || 31, ww = o.ww || 25;
  const dx = W[0] - E[0], dy = W[1] - E[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const Wc = [W[0] - ux * (ww / 2 - 2), W[1] - uy * (ww / 2 - 2)];
  const up = cap(S[0], S[1], E[0], E[1], ws, we), fo = cap(E[0], E[1], Wc[0], Wc[1], we, ww);
  const seg = (A, B, a, b) => {
    const ex = B[0] - A[0], ey = B[1] - A[1], M = Math.hypot(ex, ey) || 1, vx = ex / M, vy = ey / M;
    let nx = -vy, ny = vx; if (nx + ny < 0) { nx = -nx; ny = -ny; }
    const A2 = [A[0] - vx * a * .6, A[1] - vy * a * .6], B2 = [B[0] + vx * b * .6, B[1] + vy * b * .6];
    const P = (Q, w, f) => pt(Q[0] + nx * w * f, Q[1] + ny * w * f);
    const Am = [A[0] + ex * .2, A[1] + ey * .2], Bm = [A[0] + ex * .8, A[1] + ey * .8];
    return {
      sh: `M${P(A2, a, .7)} L${P(B2, b, .7)} L${P(B2, b, .06)} L${P(A2, a, .06)} Z`,
      rim: `M${P(Am, a, .44)} L${P(Bm, b, .44)}`,
      hi: `M${P(A2, a, -.36)} L${P(B2, b, -.36)} L${P(B2, b, -.12)} L${P(A2, a, -.12)} Z`,
    };
  };
  const u = seg(S, E, ws, we), f = seg(E, Wc, we, ww);
  const c1 = [W[0] - ux * 7, W[1] - uy * 7], c2 = [W[0] + ux * 6, W[1] + uy * 6];
  const side = (o.link || 1) * (ww * .24);
  const lk = [W[0] + ux * 2.6 - uy * side, W[1] + uy * 2.6 + ux * side];
  const cr = ((E[0] - S[0]) * dy - (E[1] - S[1]) * dx) > 0 ? 1 : -1;
  const fold = (k) => `M${pt(E[0] + ux * k - uy * cr * we * .42, E[1] + uy * k + ux * cr * we * .42)} Q${pt(E[0] + ux * (k + 4), E[1] + uy * (k + 4))} ${pt(E[0] + ux * k + uy * cr * we * .02, E[1] + uy * k - ux * cr * we * .02)}`;
  return `<clipPath id="micro-c-${id}"><path d="${up}"/><path d="${fo}"/></clipPath>
<path d="${cap(c1[0], c1[1], c2[0], c2[1], ww - 2, ww - 4)}" fill="url(#micro-shirt)" stroke="#8f857b" stroke-width=".7"/>
<path d="${fo}" transform="translate(3 5)" fill="#0c0006" opacity=".5" filter="url(#micro-b2)"/>
<path d="${up}" fill="url(#micro-velvet)"/><path d="${fo}" fill="url(#micro-velvet)"/>
<g clip-path="url(#micro-c-${id})">
<path d="${u.hi}" fill="#e0657f" opacity=".24" filter="url(#micro-b2)"/><path d="${f.hi}" fill="#e0657f" opacity=".24" filter="url(#micro-b2)"/>
<path d="${u.sh}" fill="#14020a" opacity=".6" filter="url(#micro-b2)"/><path d="${f.sh}" fill="#14020a" opacity=".6" filter="url(#micro-b2)"/>
<path d="${fold(5)} ${fold(11)}" fill="none" stroke="#1d040c" stroke-width="1.5" opacity=".55" stroke-linecap="round"/>
<path d="${u.rim} ${f.rim}" fill="none" stroke="#c9b6ff" stroke-width="1" opacity=".32" stroke-linecap="round"/>
</g>
<path d="${up}" fill="none" stroke="#2a0510" stroke-width=".8" opacity=".5"/><path d="${fo}" fill="none" stroke="#2a0510" stroke-width=".8" opacity=".5"/>
<circle cx="${r1(lk[0])}" cy="${r1(lk[1])}" r="2.2" fill="#e9bd4f" stroke="#6d4a0e" stroke-width=".7"/><circle cx="${r1(lk[0] - .6)}" cy="${r1(lk[1] - .6)}" r=".7" fill="#fff6c8"/>`;
}

// Open hand, wrist at 0 0, fingers up. back = we see the back of the hand (nails, knuckles), thumb on the other side.
function openHand(spread = 0, back = false) {
  const D = (d) => (back ? mp(d, 0, 0, -1) : d);
  const sg = back ? -1 : 1;
  const F = [[-8.8, -26, 22.6, 7.4, -6 - spread * 9], [-2.6, -28, 25.4, 7.8, -1 - spread * 3], [3.6, -27.4, 23.6, 7.4, 4 + spread * 4], [9.2, -25, 18, 6.6, 10 + spread * 10]];
  let fingers = '';
  for (const [bx, by, len, w, ang] of F) {
    const a = ang * Math.PI / 180, sx = Math.sin(a), cy = Math.cos(a), tx = bx + sx * len, ty = by - cy * len;
    fingers += `<path d="${D(cap(bx, by + 5, tx, ty, w, w * .84))}" fill="url(#micro-fing)" stroke="#7a4227" stroke-width=".7"/>`;
    for (const k of [.42, .72]) {
      const x = bx + sx * len * k, y = by - cy * len * k;
      fingers += `<path d="${D(`M${pt(x - cy * w * .3, y - sx * w * .3)} L${pt(x + cy * w * .3, y + sx * w * .3)}`)}" stroke="#8a4a2c" stroke-width=".6" opacity=".5"/>`;
    }
    if (back) fingers += `<path d="${D(cap(bx + sx * len * .84, by - cy * len * .84, bx + sx * len * .97, by - cy * len * .97, w * .56, w * .5))}" fill="#f1cbb4" opacity=".85"/>`;
  }
  const t1 = [-10.5, -8], t2 = [-18.5 - spread * 2, -18], t3 = [-23.5 - spread * 5, -28.5 + spread * 2];
  const thumb = `<path d="${D(cap(t1[0], t1[1], t2[0], t2[1], 9.4, 8))}" fill="url(#micro-fing)" stroke="#7a4227" stroke-width=".7"/><path d="${D(cap(t2[0], t2[1], t3[0], t3[1], 8, 6.8))}" fill="url(#micro-fing)" stroke="#7a4227" stroke-width=".7"/>`
    + (back ? `<path d="${D(cap(t3[0] + 1.2, t3[1] + 3.2, t3[0] + .3, t3[1] + .6, 4, 3.6))}" fill="#f1cbb4" opacity=".85"/>` : '');
  const palm = `<path d="${D('M-11 2 C-14.6 -6 -15 -17 -13 -26.6 C-8 -30.6 8 -30.6 12.6 -26 C14.2 -16 13.6 -6 11 2 Z')}" fill="url(#micro-skinH)" stroke="#7a4227" stroke-width=".7"/>`;
  const lines = back
    ? `<path d="${D('M-8 -27 C-8.6 -18 -7.4 -9 -6 -2 M-2.6 -28 C-2.4 -19 -2 -10 -1 -2 M3.4 -27 C3 -18 2.6 -10 2 -2')}" stroke="#a45c3a" stroke-width=".7" opacity=".35" fill="none"/><path d="${D('M-11 -27.6 C-9 -30 -6.6 -30 -5 -28 M-5 -29.4 C-3 -31.4 -.6 -31.4 1 -29.4 M1 -29 C3 -31 5.6 -31 7 -28.6')}" stroke="#ffd9bd" stroke-width="1" opacity=".55" fill="none"/>`
    : `<path d="${D('M-11 -14 C-5 -18 4 -19 11.4 -21 M-12 -21 C-5 -23.4 2 -24.6 7.4 -24 M-8 -5 C-6 -12 -4.6 -17 -6.4 -25')}" stroke="#94502f" stroke-width=".75" opacity=".45" fill="none"/><ellipse cx="${sg * 2}" cy="-6" rx="7" ry="4" fill="#ffe0c4" opacity=".25"/>`;
  return back ? thumb + fingers + palm + lines : fingers + palm + lines + thumb;
}

// Closed fist around a vertical bar: origin = centre of the bar at the middle finger, hand coming from the left.
function fist(tapIndex) {
  let s = `<path d="M-27 21 C-31 10 -30 -6 -24 -13 C-20 -17.5 -11 -17.6 -6 -15 L-5 14 C-10 20 -19 26 -27 21 Z" fill="url(#micro-skinH)" stroke="#7a4227" stroke-width=".7"/>
<path d="M-24 -4 C-22 4 -21 12 -23 18" stroke="#ffdcbc" stroke-width="1.4" opacity=".35" fill="none"/>`;
  const rows = [[-15, 7, 9.6], [-8, 7, 10.2], [-1, 7, 9.4], [6, 6.2, 7.6]];
  rows.forEach(([y0, h, xr], i) => {
    const f = `<path d="M-10.5 ${y0} L${r1(xr - 3.6)} ${y0} C${r1(xr + .6)} ${y0} ${r1(xr + .6)} ${r1(y0 + h)} ${r1(xr - 3.6)} ${r1(y0 + h)} L-10.5 ${r1(y0 + h)} Z" fill="url(#micro-fingV)" stroke="#7a4227" stroke-width=".7"/>
<circle cx="-9.4" cy="${r1(y0 + h / 2)}" r="${r1(h * .56)}" fill="url(#micro-skinH)" stroke="#7a4227" stroke-width=".6"/>
<path d="M-12 ${r1(y0 + 1.6)} C-10.6 ${r1(y0 + .4)} -8.6 ${r1(y0 + .4)} -7.4 ${r1(y0 + 1.4)}" stroke="#ffe2c6" stroke-width=".9" opacity=".7" fill="none"/>
<path d="M-2 ${r1(y0 + h - .5)} L${r1(xr - 4)} ${r1(y0 + h - .5)}" stroke="#6a361f" stroke-width=".7" opacity=".45"/>`;
    s += i === 0 && tapIndex ? `<g class="micro-tap">${f}</g>` : f;
  });
  s += `<path d="${cap(-18, -14.2, 2.6, -18.6, 8.2, 6.8)}" fill="url(#micro-fing)" stroke="#7a4227" stroke-width=".7"/>
<path d="${cap(-1.4, -18.4, 2.4, -19, 4.4, 4)}" fill="#f2cdb7" opacity=".9"/>`;
  return s;
}

// Finger gun, wrist at 0 0, pointing right.
const gunHand = `<path d="M-3 -10 C4 -14.4 16 -14.6 24 -11.4 C29.4 -9.2 30.4 -2 29.4 5 C28.4 11.4 22 14.4 14 14.4 C6 14.4 -.4 12.4 -3.4 7 Z" fill="url(#micro-skinH)" stroke="#7a4227" stroke-width=".7"/>
<path d="M13 -1.6 C19 -2.8 25 -2 28.6 1 M12 4.4 C18 3.4 24 4.2 28 6.8 M12 9.8 C17 9.2 22 10.2 25.4 12.4" stroke="#8a4a2c" stroke-width=".7" opacity=".6" fill="none"/>
<path d="${cap(16, -7.6, 48, -10.4, 7.4, 6.2)}" fill="url(#micro-fingV)" stroke="#7a4227" stroke-width=".7"/>
<path d="${cap(41.6, -12.2, 46.6, -12.6, 3.4, 3)}" fill="#f2cdb7" opacity=".9"/>
<path d="M29 -11.8 L29.4 -6.2 M38 -12 L38.2 -6.8" stroke="#8a4a2c" stroke-width=".6" opacity=".5"/>
<path d="${cap(7, -10, 12.6, -31, 8.6, 7.2)}" fill="url(#micro-fing)" stroke="#7a4227" stroke-width=".7"/>
<path d="${cap(10.2, -27.4, 11.6, -31.6, 4, 3.6)}" fill="#f2cdb7" opacity=".9"/>
<path d="M2 -9 C8 -12 16 -12.4 22 -10.6" stroke="#ffe0c4" stroke-width="1.2" opacity=".5" fill="none"/>`;

const DEFS = `<defs>
<linearGradient id="micro-skin" gradientUnits="userSpaceOnUse" x1="292" y1="68" x2="360" y2="166"><stop offset="0" stop-color="#f7cfab"/><stop offset=".5" stop-color="#dc9e75"/><stop offset="1" stop-color="#a35e3c"/></linearGradient>
<linearGradient id="micro-skinH" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4c6a1"/><stop offset=".55" stop-color="#d4946c"/><stop offset="1" stop-color="#9b5a39"/></linearGradient>
<linearGradient id="micro-fing" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3c39e"/><stop offset=".6" stop-color="#d4946c"/><stop offset="1" stop-color="#a25f3d"/></linearGradient>
<linearGradient id="micro-fingV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5c9a4"/><stop offset=".55" stop-color="#d4946c"/><stop offset="1" stop-color="#97542f"/></linearGradient>
<linearGradient id="micro-neck" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cf8d66"/><stop offset=".6" stop-color="#ae6c48"/><stop offset="1" stop-color="#7c4026"/></linearGradient>
<radialGradient id="micro-velvet" gradientUnits="userSpaceOnUse" cx="270" cy="196" r="250"><stop offset="0" stop-color="#ad3753"/><stop offset=".42" stop-color="#7a1c35"/><stop offset="1" stop-color="#360816"/></radialGradient>
<linearGradient id="micro-satin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#57505f"/><stop offset=".3" stop-color="#211b27"/><stop offset="1" stop-color="#070509"/></linearGradient>
<linearGradient id="micro-shirt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdfaf4"/><stop offset="1" stop-color="#cdc3b8"/></linearGradient>
<linearGradient id="micro-hair" gradientUnits="userSpaceOnUse" x1="0" y1="30" x2="0" y2="112"><stop offset="0" stop-color="#4d372a"/><stop offset=".45" stop-color="#22160f"/><stop offset="1" stop-color="#0c0705"/></linearGradient>
<linearGradient id="micro-roll" gradientUnits="userSpaceOnUse" x1="0" y1="30" x2="0" y2="88"><stop offset="0" stop-color="#5e4535"/><stop offset=".5" stop-color="#2a1b13"/><stop offset="1" stop-color="#0b0604"/></linearGradient>
<linearGradient id="micro-chrome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4b525c"/><stop offset=".22" stop-color="#f2f5f9"/><stop offset=".45" stop-color="#8e97a4"/><stop offset=".72" stop-color="#2a2f37"/><stop offset="1" stop-color="#aab3be"/></linearGradient>
<linearGradient id="micro-chromeO" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".25" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity=".6"/><stop offset="1" stop-color="#b9c4ff" stop-opacity=".35"/></linearGradient>
<radialGradient id="micro-iris" cx=".42" cy=".38" r=".62"><stop offset="0" stop-color="#c39a52"/><stop offset=".5" stop-color="#6a4519"/><stop offset="1" stop-color="#1c1006"/></radialGradient>
<linearGradient id="micro-sclera" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bba99a"/><stop offset=".5" stop-color="#f5efe7"/><stop offset="1" stop-color="#e6dbcf"/></linearGradient>
<linearGradient id="micro-fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#23030a"/><stop offset=".3" stop-color="#6c0e20"/><stop offset=".56" stop-color="#b52b41"/><stop offset=".78" stop-color="#680d1e"/><stop offset="1" stop-color="#20030a"/></linearGradient>
<linearGradient id="micro-valance" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0610"/><stop offset=".6" stop-color="#8e1529"/><stop offset="1" stop-color="#5a0a18"/></linearGradient>
<linearGradient id="micro-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4da" stop-opacity=".55"/><stop offset=".55" stop-color="#ffe2b2" stop-opacity=".15"/><stop offset="1" stop-color="#ffd59a" stop-opacity=".03"/></linearGradient>
<radialGradient id="micro-pool" gradientUnits="userSpaceOnUse" cx="300" cy="185" r="230"><stop offset="0" stop-color="#ffc68e" stop-opacity=".42"/><stop offset=".5" stop-color="#ff9a5c" stop-opacity=".12"/><stop offset="1" stop-color="#ff9a5c" stop-opacity="0"/></radialGradient>
<radialGradient id="micro-vig" gradientUnits="userSpaceOnUse" cx="320" cy="180" r="400"><stop offset=".35" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".88"/></radialGradient>
<linearGradient id="micro-topdark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<radialGradient id="micro-bulbg"><stop offset="0" stop-color="#fffbe8"/><stop offset=".28" stop-color="#ffd76a" stop-opacity=".95"/><stop offset="1" stop-color="#ff9a1a" stop-opacity="0"/></radialGradient>
<linearGradient id="micro-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a06a40"/><stop offset=".5" stop-color="#5a3520"/><stop offset="1" stop-color="#2a170d"/></linearGradient>
<linearGradient id="micro-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a2a1a"/><stop offset=".5" stop-color="#2c170e"/><stop offset="1" stop-color="#140906"/></linearGradient>
<linearGradient id="micro-frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2618"/><stop offset="1" stop-color="#160c08"/></linearGradient>
<pattern id="micro-brick" patternUnits="userSpaceOnUse" width="64" height="32"><rect width="64" height="32" fill="#1e0d0a"/>
<rect x="1" y="1" width="30" height="14" rx="1.2" fill="#6c3324"/><rect x="33" y="1" width="30" height="14" rx="1.2" fill="#5c2a1e"/><rect x="-15" y="17" width="30" height="14" rx="1.2" fill="#74402d"/><rect x="17" y="17" width="30" height="14" rx="1.2" fill="#642f1f"/><rect x="49" y="17" width="30" height="14" rx="1.2" fill="#74402d"/>
<path d="M1 1.9h30M33 1.9h30M-15 17.9h30M17 17.9h30M49 17.9h30" stroke="#9a5a40" stroke-width=".8" opacity=".55"/><path d="M1 14.4h30M33 14.4h30M-15 30.4h30M17 30.4h30M49 30.4h30" stroke="#250f0a" stroke-width="1.1" opacity=".65"/></pattern>
<pattern id="micro-mesh" patternUnits="userSpaceOnUse" width="2.4" height="2.4"><rect width="2.4" height="2.4" fill="#1a1e24"/><circle cx="1.2" cy="1.2" r=".78" fill="#a7b1bd"/></pattern>
<filter id="micro-b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1"/></filter>
<filter id="micro-b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="micro-b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="micro-b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
<filter id="micro-b14" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
<filter id="micro-glow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="2.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="micro-ecL"><path d="${eyeD('M-9.5 1.2 C-6 -4.4 .5 -6.4 6.2 -4.2 C8.2 -3.4 9.6 -1.6 10.2 .6 C5.6 3.8 -3.8 4.6 -9.5 1.2 Z', 306, 1)}"/></clipPath>
<clipPath id="micro-ecR"><path d="${eyeD('M-9.5 1.2 C-6 -4.4 .5 -6.4 6.2 -4.2 C8.2 -3.4 9.6 -1.6 10.2 .6 C5.6 3.8 -3.8 4.6 -9.5 1.2 Z', 338, -1)}"/></clipPath>
<clipPath id="micro-neckc"><path d="M305 120 L339 120 L341 176 C332 182 312 182 303 176 Z"/></clipPath>
<clipPath id="micro-jacketc"><path d="M304 166 C288 174 262 178 242 182 C226 185 214 194 212 212 L214 345 L430 345 L432 212 C430 194 418 185 402 182 C382 178 356 174 340 166 Z"/></clipPath>
</defs>`;

// ---------------- DECOR ----------------
// A few odd bricks so the wall is not a perfect repeat.
let odd = '';
let seed = 7;
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
for (let i = 0; i < 26; i++) {
  const row = Math.floor(rnd() * 21), col = Math.floor(rnd() * 21);
  const x = col * 32 + (row % 2 ? -15 : 1) + (row % 2 ? 0 : 0), y = row * 16 + 1;
  const c = ['#7d4632', '#4f2419', '#85503a', '#5a2a1d', '#6e3a2a'][i % 5];
  odd += `<rect x="${x}" y="${y}" width="30" height="14" rx="1.2" fill="${c}"/>`;
}
const wall = piece('mur', 'Mur de briques', [], `
<rect x="-10" y="-10" width="660" height="360" fill="url(#micro-brick)"/>${odd}
<rect x="-10" y="-10" width="660" height="360" fill="url(#micro-pool)"/>
<rect x="-10" y="-10" width="660" height="360" fill="url(#micro-vig)"/>
<rect x="-10" y="-10" width="660" height="150" fill="url(#micro-topdark)"/>
<path d="M560 40 L560 330" stroke="#2b2422" stroke-width="5"/><path d="M558.6 40 L558.6 330" stroke="#6b5a52" stroke-width="1" opacity=".5"/>
<g class="micro-sway"><path d="M356 70 C392 66 412 96 410 128 C408 150 398 166 384 176 C430 182 470 192 486 214 L500 340 L270 340 L282 220 C296 194 326 184 346 176 C332 164 324 146 324 124 C324 96 334 74 356 70 Z" fill="#100305" opacity=".42" filter="url(#micro-b8)"/></g>`);

// The poster pinned on the bricks.
const poster = piece('affiche', 'Affiche', [], `<g transform="rotate(-4 168 106)">
<rect x="141" y="72" width="56" height="72" fill="#d8c296"/><rect x="141" y="72" width="56" height="72" fill="url(#micro-topdark)" opacity=".25"/>
<rect x="141" y="72" width="56" height="17" fill="#a3172d"/>
<text x="169" y="85.6" text-anchor="middle" font-family="Bebas Neue" font-size="13" fill="#f6e7c9" letter-spacing=".6">SCÈNE</text>
<text x="169" y="102" text-anchor="middle" font-family="Bebas Neue" font-size="13.5" fill="#3a1a12" letter-spacing=".4">OUVERTE</text>
<ellipse cx="169" cy="113" rx="4" ry="5.4" fill="#3a1a12"/><path d="M169 118 V128 M164 128 H174" stroke="#3a1a12" stroke-width="1.6"/>
<text x="169" y="139.4" text-anchor="middle" font-family="Barlow" font-weight="800" font-size="6.4" fill="#5a2a1a">JEUDI · 21H</text>
<path d="M141 144 L146 140 L151 144 L157 141 L162 144 L168 140 L174 144 L180 141 L186 144 L192 140 L197 144 Z" fill="#1e0d0a"/>
<rect x="160" y="68" width="18" height="7" fill="#efe6c8" opacity=".55" transform="rotate(6 169 71)"/>
<rect x="141" y="72" width="56" height="72" fill="#000" opacity=".28"/></g>`);

// The sign: dark until the room laughs.
const sign = piece('enseigne', 'Enseigne APPLAUDISSEZ', [], `
<path d="M402 64 L402 40 M466 64 L466 40" stroke="#151012" stroke-width="2"/>
<rect x="372" y="62" width="124" height="36" rx="6" fill="#1a1113" stroke="#5b4446" stroke-width="1.4"/>
<rect x="377" y="67" width="114" height="26" rx="3" fill="#0b0708"/>
<text x="434" y="88" text-anchor="middle" font-family="Bebas Neue" font-size="20" textLength="104" lengthAdjust="spacingAndGlyphs" fill="#3c1b20" stroke="#5e2a30" stroke-width=".6">APPLAUDISSEZ</text>
<g class="micro-signlit"><rect x="374" y="64" width="120" height="32" rx="5" fill="#ff2a44" opacity=".28" filter="url(#micro-b8)"/>
<text x="434" y="88" text-anchor="middle" font-family="Bebas Neue" font-size="20" textLength="104" lengthAdjust="spacingAndGlyphs" fill="#fff0f2" stroke="#ff3550" stroke-width="1.6" paint-order="stroke" filter="url(#micro-glow)">APPLAUDISSEZ</text></g>
<circle cx="377" cy="67" r="1.4" fill="#8a7a7c"/><circle cx="491" cy="67" r="1.4" fill="#8a7a7c"/><circle cx="377" cy="93" r="1.4" fill="#8a7a7c"/><circle cx="491" cy="93" r="1.4" fill="#8a7a7c"/>
<path d="M373 63.4 H495" stroke="#c7a9ff" stroke-width=".8" opacity=".35"/>`);

// Marquee frame with chasing bulbs, numbered clockwise.
const bulbPos = [];
for (let y = 314; y >= 74; y -= 24) bulbPos.push([132, y]);
for (let x = 132; x <= 508.1; x += 23.5) bulbPos.push([x, 51]);
for (let y = 74; y <= 314; y += 24) bulbPos.push([508, y]);
const bulbs = bulbPos.map(([x, y], i) => `<circle cx="${r1(x)}" cy="${y}" r="4.6" fill="#24170f"/><circle cx="${r1(x)}" cy="${y}" r="3.3" fill="#6d5833"/><g class="micro-blit" style="--i:${i}"><circle cx="${r1(x)}" cy="${y}" r="10" fill="url(#micro-bulbg)"/><circle cx="${r1(x - .8)}" cy="${y - .8}" r="1.6" fill="#fff"/></g>`).join('');
const frame = piece('ampoules', 'Cadre d\'ampoules', [], `
<path d="M124 334 V48 Q124 43 129 43 H511 Q516 43 516 48 V334 H500 V59 H140 V334 Z" fill="url(#micro-frame)" stroke="#b8862e" stroke-width="1.2"/>
<path d="M140 334 V59 H500 V334" fill="none" stroke="#6a4a1c" stroke-width="1"/><path d="M125 46 H515" stroke="#ffd98a" stroke-width=".8" opacity=".4"/>
${bulbs}`);

// The spotlight shaft and its haze, behind the character.
const spot = piece('projecteur', 'Projecteur et brume', [], `<g class="micro-cone">
<path d="M264 -12 L340 -12 L482 345 L162 345 Z" fill="url(#micro-cone)" filter="url(#micro-b8)"/>
<path d="M284 -12 L320 -12 L414 345 L228 345 Z" fill="url(#micro-cone)" opacity=".55" filter="url(#micro-b4)"/>
<g class="micro-haze1"><ellipse cx="300" cy="118" rx="92" ry="24" fill="#ffe9c8" opacity=".13" filter="url(#micro-b14)"/></g>
<g class="micro-haze2"><ellipse cx="346" cy="262" rx="120" ry="30" fill="#ffe2bd" opacity=".12" filter="url(#micro-b14)"/></g>
<g class="micro-haze1"><ellipse cx="372" cy="196" rx="60" ry="16" fill="#fff0d8" opacity=".08" filter="url(#micro-b8)"/></g>
<ellipse cx="302" cy="-6" rx="54" ry="18" fill="#fff4dc" opacity=".75" filter="url(#micro-b8)"/></g>`);

// Velvet curtains: fold bands that pinch at the tie-back, plus the swag valance.
function curtain(right) {
  const n = 8; let s = '';
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const a0 = -14 + 140 * t0, a1 = -14 + 140 * t1, b0 = -14 + 92 * t0, b1 = -14 + 92 * t1, c0 = -14 + 128 * t0, c1 = -14 + 128 * t1;
    s += `<path d="M${r1(a0)} -4 C${r1(a0)} 80 ${r1(b0)} 150 ${r1(b0)} 214 C${r1(b0)} 262 ${r1(c0)} 300 ${r1(c0)} 346 L${r1(c1)} 346 C${r1(c1)} 300 ${r1(b1)} 262 ${r1(b1)} 214 C${r1(b1)} 150 ${r1(a1)} 80 ${r1(a1)} -4 Z" fill="url(#micro-fold)"/>`;
  }
  s += `<path d="M-14 -4 L126 -4 C126 80 78 150 78 214 C78 262 114 300 114 346 L-14 346 Z" fill="url(#micro-cshade)"/>`;
  s += `<path d="M126 -4 C126 80 78 150 78 214 C78 262 114 300 114 346" fill="none" stroke="#ff7a8e" stroke-width="2.4" opacity=".35" filter="url(#micro-b1)"/>`;
  s += `<path d="M-12 204 C20 222 58 224 82 210" stroke="#7a5512" stroke-width="5.4" fill="none"/><path d="M-12 204 C20 222 58 224 82 210" stroke="#e2b04a" stroke-width="3" fill="none" stroke-dasharray="3 2"/>
<path d="M80 210 C86 212 88 220 84 226 L90 252 L72 252 L78 226 C74 220 75 212 80 210 Z" fill="#c9962e"/><path d="M73 236 H89 M72 244 H90" stroke="#7a5512" stroke-width="1"/>`;
  return right ? s.replace(/ d="([^"]+)"/g, (m, d) => ` d="${mp(d, 640, 0, -1)}"`) : s;
}
const valance = (() => {
  let d = 'M-10 -10 L650 -10 L650 24';
  let folds = '', fringe = 'M650 24';
  for (let x = 650; x > -10; x -= 82) {
    const xl = x - 82, xm = x - 41;
    d += ` Q${xm} 54 ${xl} 24`; fringe += ` Q${xm} 54 ${xl} 24`;
    folds += `<path d="M${x - 14} 2 Q${xm} 36 ${xl + 14} 2" stroke="#2a030a" stroke-width="3" fill="none" opacity=".45"/><path d="M${x - 24} 4 Q${xm} 26 ${xl + 24} 4" stroke="#d4405a" stroke-width="1.6" fill="none" opacity=".3"/>`;
  }
  return `<path d="${d} Z" fill="url(#micro-valance)"/>${folds}<path d="${fringe}" fill="none" stroke="#6a4810" stroke-width="5"/><path d="${fringe}" fill="none" stroke="#e2b04a" stroke-width="4" stroke-dasharray="1.2 1.8"/>`;
})();
const curtains = piece('rideaux', 'Rideaux', [], `<defs><linearGradient id="micro-cshade" gradientUnits="userSpaceOnUse" x1="-14" y1="0" x2="126" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset=".7" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
<g class="micro-curtL">${curtain(false)}</g><g class="micro-curtR">${curtain(true).replace('url(#micro-cshade)', 'url(#micro-cshadeR)')}</g>
<defs><linearGradient id="micro-cshadeR" gradientUnits="userSpaceOnUse" x1="654" y1="0" x2="514" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".6"/><stop offset=".7" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs>
${valance}`);

// Bar stool with a glass of water.
const stool = piece('tabouret', 'Tabouret et verre d\'eau', [], `
<path d="M478 312 L468 346 M522 312 L532 346 M500 314 L500 346" stroke="#8d96a3" stroke-width="3.4"/><path d="M478 312 L468 346 M522 312 L532 346" stroke="#e9eef5" stroke-width="1" opacity=".7"/>
<ellipse cx="500" cy="330" rx="26" ry="4.6" fill="none" stroke="#9aa3b0" stroke-width="2.2"/>
<path d="M470 300 L470 308 C470 313 530 313 530 308 L530 300 Z" fill="#160d0c"/>
<ellipse cx="500" cy="300" rx="30" ry="7.4" fill="#2c1a17"/><ellipse cx="494" cy="298.6" rx="18" ry="3.6" fill="#5a3c33" opacity=".7"/>
<path d="M471 302 C478 307 522 307 529 302" stroke="#c7b4ff" stroke-width="1" opacity=".4" fill="none"/>
<ellipse cx="502" cy="302" rx="12" ry="2.4" fill="#000" opacity=".4" filter="url(#micro-b1)"/>
<g class="micro-water"><path d="M493.6 279 L508.4 279 L507.4 300 C507 302.2 495 302.2 494.6 300 Z" fill="#8fc6e8" opacity=".32"/><ellipse cx="501" cy="279" rx="7.4" ry="1.5" fill="#d6f0ff" opacity=".55"/></g>
<path d="M492.6 266 L509.4 266 L507.4 300 C507 302.6 495 302.6 494.6 300 Z" fill="#cfe8ff" opacity=".12" stroke="#e8f6ff" stroke-width=".8" stroke-opacity=".6"/>
<ellipse cx="501" cy="266" rx="8.4" ry="1.7" fill="none" stroke="#f2fbff" stroke-width=".8" opacity=".8"/>
<path d="M495.6 269 L496.4 297" stroke="#fff" stroke-width="1.4" opacity=".55" stroke-linecap="round"/><path d="M506 272 L505.4 294" stroke="#fff" stroke-width=".6" opacity=".3"/>
<ellipse cx="498" cy="303.4" rx="4" ry="1" fill="#fff4d0" opacity=".5"/>`);

// ---------------- BODY ----------------
const lapelL = 'M308 166 C294 172 280 184 274 204 C268 228 280 260 300 280 L320.6 293 L321.2 289 C314 262 309.4 228 309.4 200 C309.4 186 311.4 176 314 170 Z';
const JACKET = 'M304 166 C288 174 262 178 242 182 C226 185 214 194 212 212 L214 345 L430 345 L432 212 C430 194 418 185 402 182 C382 178 356 174 340 166 Z';
const torso = piece('torse', 'Torse et veste', BODY, `
<path d="M305 120 L339 120 L341 176 C332 182 312 182 303 176 Z" fill="url(#micro-neck)"/>
<g clip-path="url(#micro-neckc)"><ellipse cx="326" cy="158" rx="25" ry="13" fill="#3a1408" opacity=".6" filter="url(#micro-b2)"/><path d="M332 120 L341 176 L331 179 Z" fill="#1a0602" opacity=".25"/>
<path d="M311 150 C313 160 315 168 316 176 M334 148 C332 160 330 168 329 176" stroke="#7a3e22" stroke-width="1" opacity=".35" fill="none"/></g>
<path d="${JACKET}" fill="url(#micro-velvet)"/>
<g clip-path="url(#micro-jacketc)">
<path d="M388 180 C404 214 408 262 402 346 L446 346 L446 176 Z" fill="#12020a" opacity=".5" filter="url(#micro-b4)"/>
<ellipse cx="256" cy="196" rx="36" ry="12" fill="#ff8aa6" opacity=".16" filter="url(#micro-b4)"/>
<path d="${lapelL}" transform="translate(-3 3)" fill="#12020a" opacity=".45" filter="url(#micro-b2)"/>
<path d="${MX(lapelL)}" transform="translate(5 4)" fill="#12020a" opacity=".55" filter="url(#micro-b2)"/>
<path d="M322 294 C300 276 282 264 262 256 M322 294 C346 276 364 264 384 256 M230 296 C240 308 246 322 248 344 M414 296 C406 308 400 322 398 344" stroke="#1b030b" stroke-width="1.8" opacity=".38" fill="none" stroke-linecap="round"/>
<path d="M316 289 C298 273 282 262 264 252 M240 196 C236 210 234 226 236 240" stroke="#e0607c" stroke-width=".9" opacity=".22" fill="none"/>
</g>
<path d="${JACKET}" fill="none" stroke="#2a0510" stroke-width=".9" opacity=".55"/>
<path d="M310 166 L334 166 L324.6 296 L319.4 296 Z" fill="url(#micro-shirt)"/>
<path d="M316 186 L320.4 290 M328 186 L323.6 290" stroke="#b5aa9c" stroke-width=".7" opacity=".7"/>
<ellipse cx="322" cy="191" rx="9" ry="4.4" fill="#5a4a40" opacity=".25" filter="url(#micro-b1)"/>
<circle cx="322" cy="214" r="1.7" fill="#141016"/><circle cx="322" cy="238" r="1.7" fill="#141016"/><circle cx="322" cy="262" r="1.7" fill="#141016"/>
<path d="M305 160 C311 169 333 169 339 160 L340 170 C334 178 310 178 304 170 Z" fill="url(#micro-shirt)" stroke="#9b9086" stroke-width=".6"/>
<path d="M304 168 C308 176 315 182 321 185 L313.6 191 C308.6 185 305 177 302.6 171 Z" fill="url(#micro-shirt)" stroke="#9b9086" stroke-width=".6"/>
<path d="${MX('M304 168 C308 176 315 182 321 185 L313.6 191 C308.6 185 305 177 302.6 171 Z')}" fill="#dcd3c9" stroke="#9b9086" stroke-width=".6"/>
<path d="${lapelL}" fill="url(#micro-satin)"/><path d="${MX(lapelL)}" fill="url(#micro-satin)"/><path d="${MX(lapelL)}" fill="#000" opacity=".28"/>
<path d="M304 170 C292 178 282 190 278 206 C273 228 282 254 298 272" stroke="#9a92a6" stroke-width="1.6" opacity=".5" fill="none" stroke-linecap="round"/>
<path d="M300 186 C292 200 290 222 296 244" stroke="#c9c1d4" stroke-width="2.6" opacity=".18" fill="none" stroke-linecap="round" filter="url(#micro-b1)"/>
<path d="M370 204 C376 228 364 260 344 280" stroke="#c9b6ff" stroke-width="1.1" opacity=".45" fill="none"/>
<path d="M313 172 C311 186 310.6 210 311.4 232 C312.6 256 316 276 320 290" stroke="#5a5266" stroke-width=".6" stroke-dasharray="1.6 1.6" opacity=".6" fill="none"/>
<path d="M377 244 L403 241.6" stroke="#22040d" stroke-width="2.4" stroke-linecap="round"/>
<path d="M380 243.4 L383.4 231 L387.6 240 L392.4 228.6 L396 238.8 L399.6 232.6 L401.4 242 Z" fill="#f6f1e8"/><path d="M383.4 231 L385 242 M392.4 228.6 L392.6 241.6 M399.6 232.6 L398.6 241.8" stroke="#bcb2a6" stroke-width=".7"/>
<path d="M392.4 228.6 L396 238.8 L399.6 232.6 L401.4 242 L394 242.4 Z" fill="#000" opacity=".12"/>
<path d="M322 300 L300 346 L344 346 Z" fill="#120a10"/>
<circle cx="322" cy="296" r="4.8" fill="url(#micro-satin)" stroke="#000" stroke-width=".6"/><circle cx="320.6" cy="294.6" r="1.3" fill="#a9a1b4" opacity=".7"/>`);

const tie = piece('cravate', 'Nœud ou cravate', [...BODY, 'micro-tie'], `
<g data-var="cravate" data-variante="noeud">
<ellipse cx="323" cy="186" rx="18" ry="4" fill="#3a2a22" opacity=".3" filter="url(#micro-b1)"/>
<path d="M321 181 C316 176.6 309.6 172 304.6 172.6 C300.4 175.6 300.4 186.4 304.6 189.4 C309.6 190 316 185.4 321 181 Z" fill="url(#micro-satin)"/>
<path d="${MX('M321 181 C316 176.6 309.6 172 304.6 172.6 C300.4 175.6 300.4 186.4 304.6 189.4 C309.6 190 316 185.4 321 181 Z')}" fill="url(#micro-satin)"/>
<path d="${MX('M321 181 C316 176.6 309.6 172 304.6 172.6 C300.4 175.6 300.4 186.4 304.6 189.4 C309.6 190 316 185.4 321 181 Z')}" fill="#000" opacity=".25"/>
<path d="M305 175.6 C310 177.6 314 179.4 318.4 180.2 M305 186.4 C310 184.6 314 183 318.4 182" stroke="#5c5466" stroke-width=".8" opacity=".7" fill="none"/>
<path d="M305.4 174 C309 173.4 313 175.4 316.4 177.6" stroke="#b8b0c4" stroke-width="1" opacity=".6" fill="none"/>
<path d="M318.4 176.6 C320.6 175.6 323.4 175.6 325.6 176.6 L325 185.4 C323 186.4 321 186.4 319 185.4 Z" fill="#1d1823" stroke="#000" stroke-width=".5"/><path d="M319.6 177.8 L320.2 184" stroke="#8c849a" stroke-width=".8" opacity=".6"/>
<path d="M339.4 173.4 C341.6 177 341.6 185 339.4 189" stroke="#c9b6ff" stroke-width=".9" opacity=".45" fill="none"/></g>
<g data-var="cravate" data-variante="fine">
<path d="M319.4 187 L324.6 187 L327.4 280 L322 289 L316.6 280 Z" fill="url(#micro-satin)"/><path d="M321.4 190 L320.4 280" stroke="#7a7286" stroke-width=".8" opacity=".6"/>
<path d="M324.6 187 L327.4 280 L322 289 L323 187 Z" fill="#000" opacity=".25"/>
<path d="M317.6 176 L326.4 176 L324.6 187.4 L319.4 187.4 Z" fill="#1d1823" stroke="#000" stroke-width=".5"/><path d="M319 177.4 L320.4 186" stroke="#8c849a" stroke-width=".8" opacity=".6"/>
<path d="M322 290 L322 296" stroke="#000" stroke-width="0"/></g>`);

const armR = piece('brasD', 'Bras droit', BODY, sleeve('R', [230, 200], [210, 316], [238, 230], { ws: 40, we: 32, ww: 26, link: -1 }));

// ---------------- HEAD ----------------
const earL = 'M287.4 102 C282.6 97 278.2 100 278.2 108 C278.2 116 281 123.6 286 127.6 C288 128.6 289.6 127 289.8 124 Z';
const earIn = 'M285.2 106 C282.6 106.6 282 110.6 282.8 114.4 C283.6 118 285.2 120.4 286.8 121.2';
const ears = piece('oreilles', 'Oreilles', HEAD, `
<path d="${earL}" fill="url(#micro-skin)" stroke="#8a4a2c" stroke-width=".6"/><path d="${earIn}" stroke="#8f5032" stroke-width="1.1" opacity=".6" fill="none"/>
<path d="M285 108.4 C283.6 110.4 283.8 114 285 116.6 C286 114.6 286 111 285 108.4 Z" fill="#6a3018" opacity=".4"/>
<path d="${MX(earL)}" fill="url(#micro-skin)" stroke="#6a3418" stroke-width=".6"/><path d="${MX(earL)}" fill="#2a0a04" opacity=".3"/>
<path d="${MX(earIn)}" stroke="#5a2a14" stroke-width="1.1" opacity=".6" fill="none"/>
<path d="M356.6 102 C361.4 97 365.8 100 365.8 108 C365.8 116 363 123.6 358 127.6" stroke="#c9b6ff" stroke-width="1.1" opacity=".55" fill="none"/>`);

const HEADP = 'M322 61 C345 61 360 76 361 97 C362 110 360 121 357 131 L353 143 C349 151 340 159 331 163 C327 165 317 165 313 163 C304 159 295 151 291 143 L287 131 C284 121 282 110 283 97 C284 76 299 61 322 61 Z';
const hollow = 'M290 124 C294 134 299 142 306 148 C298 146 291 138 288 128 Z';
const head = piece('tete', 'Tête', [...HEAD, 'micro-jaw'], `
<path d="${HEADP}" fill="url(#micro-skin)"/>
<path d="M361 97 C362 110 360 121 357 131 L353 143 C349 151 340 159 331 163 C327 165 322 165 320 164.6 C330 158 340 148 344 136 C348 122 348 108 345 92 C343 80 338 70 330 63 C348 66 360 80 361 97 Z" fill="#4a1a08" opacity=".22"/>
<ellipse cx="312" cy="88" rx="17" ry="9" fill="#fff1dc" opacity=".3" filter="url(#micro-b2)"/>
<ellipse cx="297" cy="119" rx="7" ry="4" fill="#ffe6cc" opacity=".35" filter="url(#micro-b2)"/>
<path d="${hollow}" fill="#3a1205" opacity=".2" filter="url(#micro-b2)"/><path d="${MX(hollow)}" fill="#3a1205" opacity=".3" filter="url(#micro-b2)"/>
<ellipse cx="306" cy="104" rx="11" ry="6" fill="#6a3018" opacity=".18" filter="url(#micro-b2)"/><ellipse cx="338" cy="104" rx="11" ry="6" fill="#5a2410" opacity=".24" filter="url(#micro-b2)"/>
<path d="M291 143 C295 151 304 159 313 163" stroke="#8a4a2c" stroke-width="1" opacity=".35" fill="none"/>
<path d="M307 88.6 C315 86.8 329 86.8 337 88.6" stroke="#9a5a3c" stroke-width=".8" opacity=".28" fill="none"/>
<ellipse cx="319" cy="157.6" rx="6.4" ry="3" fill="#ffe2c8" opacity=".32" filter="url(#micro-b1)"/>
<path d="M322.2 159.8 C322.5 160.8 322.5 161.8 322.2 162.8" stroke="#8a4a2c" stroke-width=".9" opacity=".4" fill="none"/>
<path d="M361 98 C362 111 360 122 357 131 L353 143 C349 151 341 158.6 332 162.6" stroke="#c9b6ff" stroke-width="1.3" opacity=".55" fill="none"/>
<path d="${HEADP}" fill="none" stroke="#7a3e22" stroke-width=".7" opacity=".45"/>`);

// Hair: glossy pompadour or slicked back. The front volume is the "quiff" that springs up on surprise.
const spring = `<g class="micro-spring"><path d="M322 64 L312 61 L332 56.6 L312 52.2 L332 47.8 L312 43.4 L332 39 L322 35" stroke="#454b55" stroke-width="3.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/><path d="M322 64 L312 61 L332 56.6 L312 52.2 L332 47.8 L312 43.4 L332 39 L322 35" stroke="#eef2f8" stroke-width="1.2" fill="none" stroke-linejoin="round" opacity=".85"/></g>`;
const hair = piece('cheveux', 'Cheveux', HEAD, `
<g data-var="coiffure" data-variante="banane">
<ellipse cx="322" cy="81" rx="30" ry="5" fill="#3a1a10" opacity=".45" filter="url(#micro-b2)"/>
<path d="M284.6 106 C283 88 285 72 293 63 C302 55 312 53 322 53 C334 53 346 57 353 65 C360 73 361 90 359.4 106 L357.4 113 C356.6 102 355 94 351 88 C345 82 337 79 329 78 C317 77 304 79 297 86 C292 92 290.4 101 289.8 113 Z" fill="url(#micro-hair)"/>
<path d="M285 104 C285.6 96 287.6 90 291 86 L289.8 113 Z M359 104 C358.4 96 356.4 90 353 86 L357.4 113 Z" fill="#6b4a38" opacity=".35"/>
<path d="M289.4 98 C290.4 88 295 81 303 77 M286.4 96 C287.4 84 291 76 297 70 M354.6 98 C353.4 88 349 82 342 79 M357.6 96 C356.6 84 353 76 347 70" stroke="#7a5e4c" stroke-width=".8" opacity=".55" fill="none"/>
<path d="M353 65 C360 73 361 90 359.4 106" stroke="#c9b6ff" stroke-width="1.1" opacity=".5" fill="none"/>
${spring}
<g class="micro-quiff">
<path d="M289 90 C284 74 287 56 298 44 C307 34 320 28 334 28 C348 28 359 36 362 48 C364 58 361 68 355 76 C353 78.6 351 80.4 349.4 82 C343 75 333 72 321 72.6 C307 73.4 297 79 292 90 Z" fill="url(#micro-roll)"/>
<path d="M292 90 C297 79 307 73.4 321 72.6 C333 72 343 75 349.4 82 C344 79.6 337 78.4 329 78 C315 77.6 302 80.6 294 91 Z" fill="#050302" opacity=".6"/>
<path d="M294.6 82 C291 64 301 46 321 36.6 M305 76.4 C303 59 314 44 334 36.6 M318 73 C318 57 330 44 350 41 M333 73.4 C336 60 347 51 359.4 53" stroke="#0a0605" stroke-width="1.5" opacity=".7" fill="none" stroke-linecap="round"/>
<path d="M299.6 79.4 C297 62 308 47 327 40 M311.6 74.6 C311 58 322 46 342 40.6 M325.6 72.8 C327 59 338 48.4 355 46.6" stroke="#93745f" stroke-width=".85" opacity=".55" fill="none" stroke-linecap="round"/>
<path d="M296.4 56.6 C302.6 44.4 315.6 35.6 331 34.4 C344.4 33.4 355.6 38.4 360.4 46.6 C353.6 42 343 39.8 332 40.4 C317 41.4 304.6 47.6 296.4 56.6 Z" fill="#e2cbb6" opacity=".52"/>
<path d="M305.4 47.4 C314 39.6 327 36.4 341 37" stroke="#fff4e6" stroke-width="1.5" opacity=".88" fill="none" stroke-linecap="round"/>
<circle cx="320.6" cy="38.6" r="1.4" fill="#fff"/>
<path d="M352 32.6 C359.6 38.4 363.4 47 362.6 57" stroke="#c9b6ff" stroke-width="1.3" opacity=".6" fill="none"/>
<path d="M289 90 C285.6 76 286.4 62 292.6 51" stroke="#7a6050" stroke-width="1" opacity=".5" fill="none"/>
<path d="M311 75 C305 78 302 83.4 303.6 89 C304.4 84.6 307 81 312 79.2 Z" fill="#1a110c"/>
<path d="M304.4 85 C305.4 81.8 307.4 79.6 310.4 78.4" stroke="#8c6e5a" stroke-width=".7" opacity=".7" fill="none"/></g></g>
<g data-var="coiffure" data-variante="plaquee">
<ellipse cx="322" cy="81" rx="27" ry="4" fill="#3a1a10" opacity=".35" filter="url(#micro-b2)"/>
<path d="M283 106 C281 84 286 66 298 57 C308 50 316 48 324 48 C336 48 348 53 355 62 C362 72 363 88 361 106 L357.6 113 C357 100 355 92 350 86 C343 79.6 335 77 327 77.6 L322 81.4 L317 77.6 C309 77 301 79.6 294 86 C290.4 92 289.4 101 288.6 113 Z" fill="url(#micro-hair)"/>
<path d="M298 84 C298 72 304 62 314 55 M307 80 C308 69 313 60 320 53 M317 79 C318 68 322 59 328 52 M329 79 C331 68 336 60 343 55 M340 81 C344 72 348 64 352 60 M350 88 C354 80 357 72 357 66 M292 92 C291 82 294 72 300 64" stroke="#0a0605" stroke-width="1.1" opacity=".6" fill="none" stroke-linecap="round"/>
<path d="M302.4 82 C302.6 71 308 62 317 56 M312.4 79 C313.4 68 318 60 324 54 M323 78.6 C325 68 329 60 335 54 M335 80 C338 70 342 62 348 58" stroke="#8c6e5a" stroke-width=".7" opacity=".55" fill="none"/>
<path d="M296 62 C306 54 318 51 330 51.4 C340 52 348 55 352 59 C344 56 334 55 324 55.4 C312 56 302 59 296 62 Z" fill="#d6bea9" opacity=".5"/>
<path d="M304 56.4 C314 52.6 326 51.6 338 52.6" stroke="#fff3e4" stroke-width="1.2" opacity=".8" fill="none" stroke-linecap="round"/>
<path d="M355 62 C362 72 362.6 88 360.6 106" stroke="#c9b6ff" stroke-width="1.1" opacity=".5" fill="none"/>
${spring}
<g class="micro-quiff"><path d="M300 80 C298 68 306 58 318 55 C330 52 344 56 350 66 C340 61 330 60 320 62 C310 64 304 71 302 80 Z" fill="url(#micro-roll)"/>
<path d="M303 70 C309 61 320 57 332 57.4 C340 58 346 61 349 64 C342 61.6 334 61 326 61.6 C316 62.4 308 66 303 70 Z" fill="#d6bea9" opacity=".45"/></g></g>`);

// ---------------- FACE ----------------
const BR = (L, R) => `<path d="${L}" fill="#1c120d"/><path d="${MX(R || L)}" fill="#1c120d"/><path d="${L} ${MX(R || L)}" fill="none" stroke="#5a4236" stroke-width=".5" opacity=".7"/>`;
const brows = piece('sourcils', 'Sourcils', FACE, `
${mood('repos', BR('M318.6 96.4 C311 92.6 302 92 293.6 97.6 C301.6 95.2 310.6 96.6 318 100.6 Z'))}
${mood('louche', BR('M318.6 99.4 C311 97 302 96.6 293.6 99.8 C301.6 98.6 310.6 99.6 318 103.4 Z', 'M318.6 92.6 C311 87.2 302 85.6 293.6 90.6 C301.6 88.6 310.6 90.6 318 96.6 Z'))}
${mood('rire', BR('M318.6 93.4 C311 91.6 302 92.6 294.4 98.4 C302 95.6 310.6 95.4 318 97.6 Z'))}
${mood('victoire', BR('M318.6 94 C311 89.4 302 88.6 293.6 93.6 C301.6 91.4 310.6 92.8 318 97.8 Z', 'M318.6 99.6 C311 97.6 302 98.2 294.4 102 C302 100.2 310.6 100.6 318 103.2 Z'))}
${mood('decu', BR('M318.8 93.8 C312 94.2 303 96.4 295 101.8 C302.6 98.6 311 97.8 318.4 98 Z'))}
${mood('surprise', BR('M318.6 88.6 C311 83.4 302 82.6 293.6 87.8 C301.6 85.6 310.6 86.8 318 92.4 Z') + '<path d="M306 80 C314 77.4 330 77.4 338 80 M309 85.4 C316 83.6 328 83.6 335 85.4" stroke="#9a5a3c" stroke-width=".9" opacity=".5" fill="none"/>')}`);

const SCL = 'M-9.5 1.2 C-6 -4.4 .5 -6.4 6.2 -4.2 C8.2 -3.4 9.6 -1.6 10.2 .6 C5.6 3.8 -3.8 4.6 -9.5 1.2 Z';
const LASH = 'M-10.4 1.6 C-7 -5.2 .8 -7.6 6.8 -4.9 C8.9 -4 10.4 -1.9 11 .6 C9.2 -.9 7.4 -2.3 5.6 -2.8 C0 -4.1 -5.6 -2.7 -9.2 1.8 Z';
const LID = 'M-11.4 1.6 C-7.4 -5.8 .8 -8.2 7 -5.4 C9.2 -4.4 10.8 -2.2 11.6 .6 C5.6 4.8 -4 5.6 -11.4 1.6 Z';
const LIDLINE = 'M-11.4 1.6 C-4 5.6 5.6 4.8 11.6 .6';
function eye(cx, s, side) {
  const E = (d) => eyeD(d, cx, s);
  const ix = cx + s * .4, top = `transform-origin:${cx}px 101px`;
  const lid = `<path d="${E(LID)}" fill="url(#micro-skin)"/><path d="${E(LIDLINE)}" stroke="#24130d" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  return `<g class="micro-eye${side}">
<g class="micro-eo" style="transform-origin:${cx}px 108px">
<path d="${E(SCL)}" fill="url(#micro-sclera)"/>
<g clip-path="url(#micro-ec${side})"><g class="micro-pupil"><g class="micro-dart"><g class="micro-iris" style="transform-origin:${ix}px 107.8px">
<circle cx="${ix}" cy="107.8" r="4.3" fill="url(#micro-iris)" stroke="#120a04" stroke-width=".8"/><circle cx="${ix}" cy="107.8" r="2" fill="#070403"/>
<circle cx="${r1(ix + 1.5)}" cy="106" r="1.1" fill="#fff"/><circle cx="${r1(ix - 1.5)}" cy="109.6" r=".55" fill="#fff" opacity=".7"/></g></g></g>
<path d="${E('M-11 -.6 C-6 -6.6 4 -7.6 11 -2.6 L11 0 C4 -3.6 -6 -2.6 -11 1.6 Z')}" fill="#3a1a0c" opacity=".35" filter="url(#micro-b1)"/></g>
<path d="${E(LASH)}" fill="#24130d"/>
<path d="${E('M-7.2 -5.4 C-3 -9.2 4 -9.4 8.6 -6.2')}" stroke="#8f5236" stroke-width=".9" opacity=".6" fill="none"/>
<path d="${E('M-7.4 3.2 C-2.6 5.4 3.6 5.2 8.2 2.6')}" stroke="#9a5c40" stroke-width=".8" opacity=".55" fill="none"/>
<g class="micro-lidlow" style="${top}">${lid}</g><g class="micro-blink" style="${top}">${lid}</g></g>
<g class="micro-ec"><path d="${E('M-10 2 C-5 -4.2 4 -4.4 10 .6')}" stroke="#24130d" stroke-width="2.3" fill="none" stroke-linecap="round"/>
<path d="${E('M-7 5 C-2 7 4 6.8 8 4')}" stroke="#8f5236" stroke-width="1" opacity=".6" fill="none"/></g>
<g class="micro-ew"><path d="${E('M-10 .8 C-4 4.6 4 4.6 10 .4')}" stroke="#24130d" stroke-width="2.3" fill="none" stroke-linecap="round"/>
<path d="${E('M-8 -4.4 C-3 -7.4 4 -7.4 8.6 -4.6 M-6 6.6 C-1 8.4 4 8.2 7.6 6.2')}" stroke="#8f5236" stroke-width=".9" opacity=".6" fill="none"/></g>
</g>`;
}
const drop = (x, y, cls, dl) => `<g class="${cls}" style="animation-delay:${dl}s;transform-origin:${x}px ${y}px"><path d="M${x} ${y - 4} C${x - 2.8} ${y} ${x - 2.8} ${y + 3} ${x} ${y + 3.6} C${x + 2.8} ${y + 3} ${x + 2.8} ${y} ${x} ${y - 4} Z" fill="#c8ecff" stroke="#6fb6e0" stroke-width=".5"/></g>`;
const AGE = 'M298.4 114.8 C302.4 117.2 308.4 117.8 313.4 116.2 M293.8 105.4 L290.4 103.8 M293.8 108.4 L290.2 108.6';
const eyes = piece('yeux', 'Yeux', FACE, `<path d="${AGE}" stroke="#8f5236" stroke-width=".8" opacity=".38" fill="none" stroke-linecap="round"/><path d="${MX(AGE)}" stroke="#6e3418" stroke-width=".8" opacity=".42" fill="none" stroke-linecap="round"/>${eye(306, 1, 'L')}${eye(338, -1, 'R')}
<g class="micro-tears">${[0, -.11, -.22, -.33].map((d) => drop(296, 108, 'micro-dropL', d) + drop(348, 108, 'micro-dropR', d - .05)).join('')}
<path d="M296 110 C293 114 292 118 293 121 M348 110 C351 114 352 118 351 121" stroke="#c8ecff" stroke-width="1.4" opacity=".7" fill="none" stroke-linecap="round"/></g>`);

const nose = piece('nez', 'Nez', [...FACE, 'micro-nosebit'], `
<ellipse cx="324.4" cy="128.6" rx="6" ry="4.2" fill="#6a2c12" opacity=".14" filter="url(#micro-b1)"/>
<path d="M325 102 C326.4 112 328.6 120 330.6 126 C331 129.4 328.6 131.6 325 132 C326.2 125 325.4 113 323.6 102 Z" fill="#5a2410" opacity=".24"/>
<path d="M320.4 104 C319.8 112 319.4 120 319.6 125.6" stroke="#ffe6cf" stroke-width="1.5" opacity=".45" fill="none" stroke-linecap="round"/>
<path d="M314.6 129.6 C312.6 127 313.4 123.6 316.8 123" stroke="#9a5a3c" stroke-width="1.2" opacity=".7" fill="none" stroke-linecap="round"/>
<path d="M329.4 129.6 C331.4 127 330.6 123.6 327.2 123" stroke="#6e3418" stroke-width="1.2" opacity=".8" fill="none" stroke-linecap="round"/>
<path d="M317.4 131.2 C318.4 129.4 320.8 129.6 321 131.6 C319.8 132.3 318.6 132.2 317.4 131.2 Z" fill="#3a170c" opacity=".9"/>
<path d="M326.6 131.2 C325.6 129.4 323.2 129.6 323 131.6 C324.2 132.3 325.4 132.2 326.6 131.2 Z" fill="#3a170c" opacity=".9"/>
<path d="M318 131.8 C320.4 133.6 323.6 133.6 326 131.8" stroke="#8a4a30" stroke-width=".7" opacity=".5" fill="none"/>
<ellipse cx="326.4" cy="135.4" rx="8" ry="2.2" fill="#5a2a18" opacity=".34" filter="url(#micro-b1)"/>
<ellipse cx="320.6" cy="127.2" rx="2.6" ry="1.7" fill="#fff" opacity=".38"/>`);

const MUST = 'M308.4 141.2 C312 137.8 316.8 136.4 320.9 137.5 L321.2 139.8 C317 139 312.6 139.8 308.4 141.2 Z';
const must = piece('moustache', 'Moustache', [...FACE, 'micro-must'], `
<g data-var="moustache" data-variante="fine"><path d="${MUST}" fill="#1e140f"/><path d="${MX(MUST)}" fill="#1e140f"/>
<path d="M311.4 139.6 C314.4 138 317.4 137.6 320.2 138.1 M332.6 139.6 C329.6 138 326.6 137.6 323.8 138.1" stroke="#7a5e4c" stroke-width=".6" opacity=".6" fill="none"/></g>
<g data-var="moustache" data-variante="rase"><path d="M300 132 C306 138 311 141 322 139.6 C333 141 338 138 344 132 C350 142 346 158 334 165 C326 168.6 318 168.6 310 165 C298 158 294 142 300 132 Z" fill="#2b3644" opacity=".09" filter="url(#micro-b2)"/></g>`);

const FOLDL = 'M311.4 133 C306.4 136.6 305 141.6 306.6 146.4';
const fold = (k = 1) => `<path d="${FOLDL}" stroke="#8a4a2c" stroke-width="1.1" opacity="${.4 * k}" fill="none" stroke-linecap="round"/><path d="${MX(FOLDL)}" stroke="#6e3418" stroke-width="1.1" opacity="${.5 * k}" fill="none" stroke-linecap="round"/>`;
const sep = (y1, y2, xs) => `<path d="${xs.map((x) => `M${x} ${y1} L${x} ${y2}`).join(' ')}" stroke="#c9bfb2" stroke-width=".55" opacity=".8"/>`;
const mouth = piece('bouche', 'Bouche', FACE, `
${mood('repos', `${fold()}
<path d="M308 143.4 C315 145.6 329 145.6 336 143.4 C334 149.6 327 152.6 322 152.6 C317 152.6 310 149.6 308 143.4 Z" fill="#3a0c0d"/>
<path d="M310.5 144.4 C316 146 328 146 333.5 144.4 L332.6 148 C326 149.6 318 149.6 311.4 148 Z" fill="#f7f2ea"/>${sep(145.4, 148.6, [315.6, 318.8, 322, 325.2, 328.4])}
<path d="M313 150.5 C318 151.6 326 151.6 331 150.5 L330 151.8 C325 152.8 319 152.8 314 151.8 Z" fill="#d9cfc2" opacity=".85"/>
<path d="M308 143.4 C312.5 141 317.5 140.6 322 142 C326.5 140.6 331.5 141 336 143.4 C330 144.6 314 144.6 308 143.4 Z" fill="#94483b"/>
<path d="M310.5 150 C315 155.6 329 155.6 333.5 150 C331.5 157.4 312.5 157.4 310.5 150 Z" fill="#a85a4b"/><path d="M316 154.4 C320 155.6 324 155.6 328 154.4" stroke="#eaa595" stroke-width="1" opacity=".55" fill="none"/>
<path d="M305.6 141.2 C306.4 143 307.2 144.2 308.6 144.4 M338.4 141.2 C337.6 143 336.8 144.2 335.4 144.4" stroke="#7a3a24" stroke-width=".9" opacity=".7" fill="none"/>
<ellipse cx="322" cy="159.4" rx="7" ry="2" fill="#6b3020" opacity=".25" filter="url(#micro-b1)"/>`)}
${mood('louche', `${fold(.7)}
<path d="M309 147 C313 145 318 144.6 322 145.6 C326 144.4 331 143.4 336.6 140.6 C332 145.6 326 147.8 322 147.6 C317 148.2 312 148 309 147 Z" fill="#94483b"/>
<path d="M309 147 C315 148.6 324 148.4 330 146 C332.6 145 334.6 143 336.6 140.6" stroke="#4a1612" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M312 148.4 C317 152.6 327 152 332 146 C330 153.4 315 154.4 312 148.4 Z" fill="#a85a4b"/><path d="M317 151.6 C321 152.4 325 151.8 328 150.2" stroke="#eaa595" stroke-width=".9" opacity=".5" fill="none"/>
<path d="M336.6 140.6 C338.6 141.4 339.2 143.4 338.4 145.6 M307.4 146 C308 147.6 309 148.2 310.4 148" stroke="#7a3a24" stroke-width=".9" opacity=".7" fill="none"/>`)}
${mood('rire', `${fold(1.5)}<path d="M296 126 C300 129.4 306 130.4 311 128.6 M348 126 C344 129.4 338 130.4 333 128.6" stroke="#8a4a2c" stroke-width=".9" opacity=".45" fill="none"/>
<path d="M305 140 C313 144 331 144 339 140 C337 153 330 161 322 161 C314 161 307 153 305 140 Z" fill="#2c0708"/>
<path d="M313.6 155 C316 150.6 328 150.6 330.4 155 C327 158.4 317 158.4 313.6 155 Z" fill="#c2545a"/><path d="M318 153 C320 152.2 323 152.2 325 153" stroke="#f08c8c" stroke-width=".8" opacity=".6" fill="none"/>
<path d="M307.5 141.2 C315 144.6 329 144.6 336.5 141.2 L335.6 145.6 C328 148 316 148 308.4 145.6 Z" fill="#f7f2ea"/>${sep(143, 147.4, [313.6, 317.8, 322, 326.2, 330.4])}
<path d="M311.6 157.6 C317 159.6 327 159.6 332.4 157.6 L331.4 160.2 C326 161.8 318 161.8 312.6 160.2 Z" fill="#e3d9cc"/>
<path d="M304 139.6 C311 136.6 317 136.4 322 137.8 C327 136.4 333 136.6 340 139.6 C332 141.6 312 141.6 304 139.6 Z" fill="#94483b"/>
<path d="M309 157 C314 163.4 330 163.4 335 157 C333 166 311 166 309 157 Z" fill="#a85a4b"/>`)}
${mood('victoire', `${fold(1.3)}
<path d="M304 141 C312 146 332 146 340 141 C337 151 329 156.6 322 156.6 C315 156.6 307 151 304 141 Z" fill="#2c0708"/>
<path d="M306.6 142.4 C314 147 330 147 337.4 142.4 L336.4 147.6 C329 150.4 315 150.4 307.6 147.6 Z" fill="#fbf8f2"/>${sep(144.6, 149.4, [311.8, 316.8, 322, 327.2, 332.2])}
<path d="M311 151.6 C317 153.4 327 153.4 333 151.6 L331.6 154 C326 155.6 318 155.6 312.4 154 Z" fill="#e3d9cc"/>
<path d="M303 140.6 C310 137.6 316.5 137.2 322 138.8 C327.5 137.2 334 137.6 341 140.6 C333 142.6 311 142.6 303 140.6 Z" fill="#94483b"/>
<path d="M307 152 C313 159.6 331 159.6 337 152 C334.6 161.6 309.4 161.6 307 152 Z" fill="#a85a4b"/>
<path d="M301.6 138.2 C302.6 140.4 303.6 141.6 305.4 142 M342.4 138.2 C341.4 140.4 340.4 141.6 338.6 142" stroke="#7a3a24" stroke-width="1" opacity=".75" fill="none"/>
<g class="micro-ting" style="transform-origin:330px 145px"><circle cx="330" cy="145" r="7" fill="#fffbe0" opacity=".55" filter="url(#micro-b2)"/><path d="M330 131 L332.2 142.8 L344 145 L332.2 147.2 L330 159 L327.8 147.2 L316 145 L327.8 142.8 Z" fill="#fff"/></g>`)}
${mood('decu', `${fold(.8)}
<path d="M310 148 C315 145.4 319 145 322 146 C325 145 329 145.4 334 148 C328 147.6 316 147.6 310 148 Z" fill="#94483b"/>
<path d="M309 149.6 C314 146.6 330 146.6 335 149.6" stroke="#4a1612" stroke-width="1.7" fill="none" stroke-linecap="round"/>
<path d="M312 149 C316 151.6 328 151.6 332 149 C330 154.6 314 154.6 312 149 Z" fill="#a85a4b"/>
<path d="M307.6 149.6 C307 151.6 307.4 153.6 308.6 155 M336.4 149.6 C337 151.6 336.6 153.6 335.4 155 M316 157.6 C319 159 325 159 328 157.6" stroke="#7a3a24" stroke-width=".9" opacity=".55" fill="none"/>`)}
${mood('surprise', `${fold(.6)}
<path d="M322 141 C328.5 141 331.6 147 331.6 153 C331.6 160 327.6 164.4 322 164.4 C316.4 164.4 312.4 160 312.4 153 C312.4 147 315.5 141 322 141 Z" fill="#2c0708"/>
<path d="M315.4 144.6 C319 142.8 325 142.8 328.6 144.6 L327.8 146.8 C324 145.8 320 145.8 316.2 146.8 Z" fill="#f2ece3"/>
<path d="M315.6 160 C318 156.4 326 156.4 328.4 160 C326 163 318 163 315.6 160 Z" fill="#b84c52"/>
<path d="M311 146 C313 139.6 318 138 322 139.4 C326 138 331 139.6 333 146 C330 142 326 141.2 322 141.6 C318 141.2 314 142 311 146 Z" fill="#94483b"/>
<path d="M312 158 C314 166 330 166 332 158 C330 162.6 326 165 322 165.2 C318 165 314 162.6 312 158 Z" fill="#a85a4b"/>`)}`);

// ---------------- ARMS, MIC, HANDS ----------------
const SL = [416, 198];
const at = (E, W, k = 3) => { const L = Math.hypot(W[0] - E[0], W[1] - E[1]) || 1; return [r1(W[0] + (W[0] - E[0]) / L * k), r1(W[1] + (W[1] - E[1]) / L * k)]; };
// Left arm poses. pr = start angle of the swing-in, so each pose arrives on its own arc.
const POSES = [
  ['rest', 'repos', [444, 302], [463, 262], (E, W) => `<g transform="translate(${at(E, W, 8)}) rotate(22) scale(1 .86)">${openHand(.25)}</g>`, 0],
  ['tie', 'repos', [410, 296], [354, 203], () => `<g transform="translate(334.4 184.4) scale(-.82 .82)">${fist()}</g>`, 0],
  ['louche', 'louche', [404, 298], [345, 194], () => `<g transform="translate(325.4 175.4) scale(-.82 .82)">${fist()}</g>`, 9],
  ['rire', 'rire', [426, 312], [302, 304], (E, W) => `<g transform="translate(${at(E, W, 2)}) rotate(-82)">${openHand(.1, true)}</g>`, -10],
  ['victoire', 'victoire', [446, 300], [452, 240], () => `<g transform="translate(452 237) rotate(-38)"><g class="micro-flick" style="transform-origin:0px 0px">${gunHand}<g class="micro-puff"><circle cx="54" cy="-11" r="4" fill="#e8e2dc" opacity=".7" filter="url(#micro-b1)"/><circle cx="59" cy="-15" r="3" fill="#e8e2dc" opacity=".5" filter="url(#micro-b1)"/></g></g></g>`, 14],
  ['decu', 'decu', [398, 258], [356, 134], (E, W) => `<g transform="translate(${at(E, W, 1)}) rotate(-36) scale(1.14)">${openHand(.3, true)}</g>`, 18],
  ['surprise', 'surprise', [446, 300], [457, 226], (E, W) => `<g transform="translate(${at(E, W)}) rotate(12)">${openHand(1)}</g>`, 8],
];
const poseWrap = (name, m, pr, inner) => mood(m, `<g class="micro-pose-${name}"><g class="micro-pin" style="--pr:${pr}deg"><g class="micro-swing">${inner}</g></g></g>`);
const armL = piece('brasG', 'Bras gauche', BODY, POSES.map(([n, m, E, W, , pr]) => poseWrap(n, m, pr, sleeve('L' + n, SL, E, W, { ws: 38, we: 31, ww: 25 }))).join(''));
const handL = piece('mainG', 'Main gauche', BODY, POSES.map(([n, m, E, W, h, pr]) => poseWrap(n, m, pr, h(E, W))).join(''));

const micHead = 'M250 148 C250 140 255.4 136 262 136 C268.6 136 274 140 274 148 L274 168 C274 176 268.6 180 262 180 C255.4 180 250 176 250 168 Z';
const mic = piece('micro', 'Micro sur pied', [...BODY, 'micro-stand'], `
<path d="M263 236 C266 252 277 262 273 280 C269 298 252 302 252 320" stroke="#0d0b0d" stroke-width="3.2" fill="none" stroke-linecap="round"/>
<rect x="259" y="230" width="6" height="122" fill="url(#micro-chrome)"/>
<path d="M252 320 C252 332 262 338 266 352" stroke="#0d0b0d" stroke-width="3.2" fill="none"/><path d="M253 318 C253 330 261 336 265 350" stroke="#5c5862" stroke-width=".8" fill="none"/>
<rect x="255.6" y="294" width="12.8" height="10" rx="2" fill="url(#micro-chrome)" stroke="#1a1d22" stroke-width=".6"/><path d="M256 299 H268" stroke="#1a1d22" stroke-width=".8"/>
<path d="M253.4 222 L270.6 222 L268.8 236 L255.2 236 Z" fill="#23272e"/><path d="M254 223.4 L270 223.4" stroke="#c9d1db" stroke-width=".9" opacity=".7"/><circle cx="270.4" cy="230" r="2.2" fill="url(#micro-chrome)"/>
<path d="M255.4 182 L268.6 182 L267.2 224 L256.8 224 Z" fill="url(#micro-chrome)"/><path d="M255.6 186 H268.4 M256.4 219 H267.6" stroke="#2a2f37" stroke-width="1.2"/>
<path d="M273 236 C277 258 286 286 286 330" stroke="#000" stroke-width="5" opacity=".18" fill="none" filter="url(#micro-b2)"/>
<g class="micro-mich" style="transform-origin:262px 183px">
<path d="M250.6 166 C250.2 177 255 183 262 183 C269 183 273.8 177 273.4 166" stroke="#5d6672" stroke-width="3.2" fill="none"/><path d="M251 167 C251 176 255.4 181.4 262 181.6" stroke="#eef2f7" stroke-width="1" fill="none" opacity=".8"/>
<path d="${micHead}" fill="url(#micro-mesh)"/><path d="${micHead}" fill="url(#micro-chromeO)"/>
<rect x="249.2" y="156.2" width="25.6" height="3.8" rx="1.2" fill="url(#micro-chrome)"/>
<path d="M251.6 142.6 C255 140 269 140 272.4 142.6" stroke="#eef2f7" stroke-width="1.1" opacity=".75" fill="none"/>
<path d="M255 141.6 L255 175" stroke="#fff" stroke-width="1.7" opacity=".55" stroke-linecap="round"/>
<path d="M273.4 146 L273.4 171" stroke="#c9b6ff" stroke-width="1.1" opacity=".6"/>
<path d="${micHead}" fill="none" stroke="#14171c" stroke-width=".9"/>
<circle cx="250.8" cy="166" r="2.3" fill="url(#micro-chrome)" stroke="#1a1d22" stroke-width=".5"/><circle cx="273.2" cy="166" r="2.3" fill="url(#micro-chrome)" stroke="#1a1d22" stroke-width=".5"/>
<g class="micro-fb"><path d="M243 142 l-6 4 l5 4 l-6 4 l5 4 l-6 4 l5 4 M233 136 l-7 5 l6 5 l-7 5 l6 5 l-7 5 l6 5 l-7 5 M252 129 l4 -6 l4 5 l4 -6 l4 5 l3 -5" stroke="#bfe6ff" stroke-width="1.7" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
<path d="M243 142 l-6 4 l5 4 l-6 4 l5 4 l-6 4 l5 4" stroke="#fff" stroke-width=".7" fill="none"/></g></g>`);

const handR = piece('mainD', 'Main droite', [...BODY, 'micro-stand'], `<g transform="translate(262 205)">${fist(true)}</g>
<path d="M240 222 C246 226 252 226 256 222" stroke="#000" stroke-width="2" opacity=".2" fill="none" filter="url(#micro-b1)"/>`);

// ---------------- FOREGROUND ----------------
const dim = `<rect class="micro-dim" x="-10" y="-10" width="660" height="420" fill="#06020c"/>`;
const foot = [96, 184, 456, 544].map((x, i) => `<g class="micro-foot" style="animation-delay:${-i * .7}s"><ellipse cx="${x}" cy="312" rx="20" ry="9" fill="#ffb347" opacity=".35" filter="url(#micro-b4)"/></g><path d="M${x - 9} 323 C${x - 9} 314.6 ${x + 9} 314.6 ${x + 9} 323 Z" fill="#120a08"/><path d="M${x - 6} 318 C${x - 3} 316 ${x + 3} 316 ${x + 6} 318" stroke="#ffd58a" stroke-width="1.4" fill="none"/>`).join('');
const stage = piece('scene', 'Bord de scène', [], `
<rect x="-10" y="321" width="660" height="10" fill="url(#micro-wood)"/>
<path d="M-10 321.4 H650" stroke="#f0c060" stroke-width="1.3" opacity=".8"/>
<ellipse cx="318" cy="322" rx="170" ry="3.4" fill="#ffe6b8" opacity=".45" filter="url(#micro-b2)"/>
<rect x="-10" y="331" width="660" height="70" fill="url(#micro-front)"/>
<path d="${Array.from({ length: 9 }, (_, i) => `M${i * 80 - 6} 336 h68 v60 h-68 Z`).join(' ')}" fill="none" stroke="#120806" stroke-width="2" opacity=".7"/><path d="${Array.from({ length: 9 }, (_, i) => `M${i * 80 - 5} 337.4 h66`).join(' ')}" stroke="#a8724a" stroke-width="1" opacity=".35"/>
<rect x="-10" y="331" width="660" height="12" fill="url(#micro-topdark)" opacity=".8"/>${foot}`);

const HEADS = [[28, 340, 2, 'bun'], [140, 352, 1.8, ''], [250, 346, 2.05, 'curl'], [372, 368, 1.8, ''], [478, 346, 2, 'cap'], [600, 352, 1.9, '']];
const aud = HEADS.map(([x, y, s, kind], i) => {
  const rx = 15 * s, ry = 19 * s, cy = y + ry, sy = y + 40 * s;
  const arc = (a, b, R1, R2, X, Y) => `M${pt(X + R1 * Math.cos(a), Y + R2 * Math.sin(a))} A${r1(R1)} ${r1(R2)} 0 0 1 ${pt(X + R1 * Math.cos(b), Y + R2 * Math.sin(b))}`;
  let extra = '';
  if (kind === 'bun') extra = `<circle cx="${x}" cy="${r1(y - 4 * s)}" r="${r1(8 * s)}" fill="#09050a"/>`;
  if (kind === 'curl') extra = `<path d="M${x - rx} ${cy} ${Array.from({ length: 7 }, (_, k) => { const a = Math.PI * (1.05 + k * .15); return `Q${pt(x + (rx + 6) * Math.cos(a + .08), cy + (ry + 5) * Math.sin(a + .08))} ${pt(x + rx * Math.cos(a + .15), cy + ry * Math.sin(a + .15))}`; }).join(' ')} Z" fill="#09050a"/>`;
  if (kind === 'cap') extra = `<path d="M${r1(x - rx - 1)} ${r1(cy - 6 * s)} C${r1(x - rx)} ${r1(y - 4)} ${r1(x + rx)} ${r1(y - 4)} ${r1(x + rx + 1)} ${r1(cy - 6 * s)} L${r1(x + rx + 12)} ${r1(cy - 3 * s)} Z" fill="#0c070c"/>`;
  return `<g class="micro-aud" style="--d:${(3.6 + (i * 0.7) % 2.2).toFixed(1)}s;--dl:${(-i * 0.53).toFixed(2)}s;transform-origin:${x}px 400px">
<path d="M${r1(x - 48 * s)} 402 C${r1(x - 48 * s)} ${r1(sy + 12 * s)} ${r1(x - 30 * s)} ${r1(sy)} ${x} ${r1(sy)} C${r1(x + 30 * s)} ${r1(sy)} ${r1(x + 48 * s)} ${r1(sy + 12 * s)} ${r1(x + 48 * s)} 402 Z" fill="#09050a"/>
<ellipse cx="${x}" cy="${r1(cy)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="#09050a"/>${extra}
<path d="${arc(Math.PI * 1.12, Math.PI * 1.88, rx, ry, x, cy)} ${arc(Math.PI * 1.08, Math.PI * 1.4, 30 * s, 12 * s, x, sy + 12 * s)}" stroke="#ffc482" stroke-width="1.8" opacity=".7" fill="none"/></g>`;
}).join('');
const pub = piece('public', 'Public', [], `${aud}
<path d="M598 366 C592 352 580 342 566 334" stroke="#09050a" stroke-width="9" stroke-linecap="round" fill="none"/>
<rect x="557" y="316" width="11" height="19" rx="2" fill="#111" transform="rotate(-12 562 325)"/>
<g class="micro-phone"><rect x="558.4" y="318" width="8.2" height="15" rx="1.2" fill="#9fd8ff" transform="rotate(-12 562 325)"/><ellipse cx="561" cy="326" rx="16" ry="14" fill="#7cc8ff" opacity=".22" filter="url(#micro-b4)"/></g>`);

const cricket = piece('criquet', 'Criquet', [], `<g class="micro-cricket">
<linearGradient id="micro-pinspot" gradientUnits="userSpaceOnUse" x1="0" y1="236" x2="0" y2="324"><stop offset="0" stop-color="#ffe6b8" stop-opacity="0"/><stop offset="1" stop-color="#ffe6b8" stop-opacity=".3"/></linearGradient><path d="M424 236 L440 236 L460 324 L400 324 Z" fill="url(#micro-pinspot)" filter="url(#micro-b2)"/>
<ellipse cx="430" cy="322.6" rx="26" ry="4.4" fill="#ffe6b8" opacity=".55" filter="url(#micro-b2)"/>
<g class="micro-hop"><path d="M433 318 L441 308.6 L447 321" stroke="#25300f" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
<ellipse cx="434" cy="317" rx="8.4" ry="3.6" fill="#3d4a1c"/>
<path d="M427.6 314.4 C432 312.2 440 312.6 443.4 316 C438 315.2 432 315.6 427.6 317 Z" fill="#5d6d2c"/><path d="M431 314 L440 315" stroke="#2a3312" stroke-width=".5"/>
<ellipse cx="424.4" cy="316.4" rx="3.8" ry="3.3" fill="#2f3a14"/><circle cx="423" cy="315.4" r=".9" fill="#e8f0c0"/>
<path d="M422 314.4 C416 306 410 304 403 306 M423 313.8 C418 304 414 300 407 299.6" stroke="#25300f" stroke-width=".8" fill="none"/>
<path d="M424 319 L421 322.6 M428 319.4 L427 322.8" stroke="#25300f" stroke-width="1.1"/>
<g class="micro-cleg" style="transform-origin:437px 317px"><path d="M436 317 L445.4 306.4 L450.6 322" stroke="#435222" stroke-width="2.2" fill="none" stroke-linejoin="round" stroke-linecap="round"/></g>
<g class="micro-chirp"><path d="M452 306 C455 309 455 313 452 316 M457 302.6 C461.4 308 461.4 314 457 319.4" stroke="#eef8d2" stroke-width="1.3" fill="none" stroke-linecap="round"/></g>
</g><text class="micro-crtext" x="458" y="298" font-family="Barlow" font-style="italic" font-weight="700" font-size="9.5" fill="#eef8d2">cri… cri…</text></g>`);

const SVG = DEFS + wall + poster + sign + frame + spot + curtains + stool + torso + tie + armR + ears + head + hair + brows + eyes + nose + must + mouth + armL + mic + handR + handL + dim + stage + pub + cricket;

// ---------------- MOTION ----------------
// Layers per mood: primary = body + head, secondary = quiff, tie, mic, hands (50-150 ms behind),
// ambient = bulbs, haze, curtains, audience, footlights. Spatial moves never use linear easing.
const SINE = 'cubic-bezier(.45,0,.55,1)', OUT = 'cubic-bezier(.2,0,0,1)', BACK = 'cubic-bezier(.175,.885,.32,1.275)', ANT = 'cubic-bezier(.3,0,.2,1)';
const showMood = MOODS.map((m) => `.p-micro.mood-${m} .micro-is-${m}`).join(',') + '{display:inline}';
const poseIn = MOODS.filter((m) => m !== 'repos').map((m) => `.p-micro.mood-${m} .micro-pose-${m}>.micro-pin`).join(',') + `{animation:micro-pin .46s ${BACK} both}`;
const CSS = `
.p-micro g{transform-box:view-box}
.p-micro .micro-mood,.p-micro .micro-ec,.p-micro .micro-ew,.p-micro .micro-tears{display:none}
${showMood}
.p-micro .micro-sway{transform-origin:322px 345px;animation:micro-settle .5s ${BACK},micro-sway 7s .5s ${SINE} infinite}
.p-micro .micro-breath{transform-origin:322px 330px;animation:micro-breath 3.8s ${SINE} infinite}
.p-micro .micro-head{transform-origin:322px 168px;animation:micro-headidle 5.3s ${SINE} infinite}
.p-micro .micro-hl{transform:translate(calc(var(--look,0) * 2.6px),0)}
.p-micro .micro-face{transform:translate(calc(var(--look,0) * 1.8px),0)}
.p-micro .micro-pupil{transform:translate(calc(var(--look,0) * 3.2px),0)}
.p-micro .micro-quiff{transform-origin:322px 80px;animation:micro-quiffidle 5.3s .14s ${SINE} infinite}
.p-micro .micro-spring{transform-origin:322px 64px;transform:scaleY(0);opacity:0}
.p-micro .micro-tie{transform-origin:322px 181px;animation:micro-tieidle 11s ${SINE} infinite}
.p-micro .micro-stand{transform-origin:262px 345px}
.p-micro .micro-jaw{transform-origin:322px 96px;transition:transform .18s ${BACK}}
.p-micro .micro-must{transform-origin:322px 140px;transition:transform .2s ${OUT}}
.p-micro .micro-nosebit{transform-origin:322px 126px;transition:transform .2s ${OUT}}
.p-micro .micro-pin,.p-micro .micro-swing{transform-origin:416px 198px}
.p-micro .micro-blink{transform:scaleY(0);animation:micro-blink 4.3s infinite}
.p-micro .micro-lidlow{transform:scaleY(0);transition:transform .22s ${OUT}}
.p-micro .micro-dart{animation:micro-dart 6.7s ${OUT} infinite}
.p-micro .micro-eo{transition:transform .16s ${BACK}}
.p-micro .micro-iris{transition:transform .16s ${OUT}}
.p-micro .micro-tap{transform-origin:-9.4px -11.5px;animation:micro-tap 4.7s ${OUT} infinite}
.p-micro .micro-ting{transform:scale(0)}
.p-micro .micro-fb,.p-micro .micro-puff,.p-micro .micro-chirp,.p-micro .micro-crtext,.p-micro .micro-cricket{opacity:0}
.p-micro .micro-fb{transform-origin:262px 158px}
.p-micro .micro-puff{transform-origin:54px -11px}
.p-micro .micro-chirp{transform-origin:452px 311px}
.p-micro .micro-dim{opacity:0;transition:opacity .6s cubic-bezier(.4,0,.2,1)}
.p-micro .micro-signlit{opacity:0}
.p-micro .micro-cone{transition:opacity .6s cubic-bezier(.4,0,.2,1)}
.p-micro .micro-water{transform-origin:501px 300px}
.p-micro .micro-blit{animation:micro-chase 2.4s linear infinite;animation-delay:calc(var(--i) * -.3s)}
.p-micro .micro-haze1{animation:micro-haze 17s ${SINE} infinite alternate}
.p-micro .micro-haze2{animation:micro-haze 23s ${SINE} -9s infinite alternate-reverse}
.p-micro .micro-curtL{transform-origin:60px 0px;animation:micro-curt 9s ${SINE} infinite}
.p-micro .micro-curtR{transform-origin:580px 0px;animation:micro-curt 11.5s ${SINE} -4s infinite reverse}
.p-micro .micro-aud{animation:micro-audIdle var(--d) ${SINE} infinite;animation-delay:var(--dl)}
.p-micro .micro-foot{animation:micro-footfl 3.1s ${SINE} infinite}
.p-micro .micro-phone{animation:micro-phone 2.3s ${SINE} infinite}
.p-micro.mood-repos .micro-pose-rest>.micro-pin{animation:micro-idleA 11s ${OUT} infinite}
.p-micro.mood-repos .micro-pose-tie>.micro-pin{animation:micro-idleB 11s ${OUT} infinite}
${poseIn}

.p-micro.mood-louche .micro-sway{animation:micro-lBody .9s ${OUT} forwards}
.p-micro.mood-louche .micro-head{animation:micro-lHead .9s ${BACK} forwards,micro-lHmm 1.8s .9s ${SINE} infinite}
.p-micro.mood-louche .micro-quiff{animation:micro-lag .9s .1s ${OUT} forwards}
.p-micro.mood-louche .micro-mich{animation:micro-mLean .8s .12s ${BACK} forwards}
.p-micro.mood-louche .micro-lidlow{transform:scaleY(.5)}
.p-micro.mood-louche .micro-pupil{transform:translate(calc(var(--look,0) * 4.6px),.6px)}
.p-micro.mood-louche .micro-must{transform:rotate(-5deg) translate(0,.6px)}
.p-micro.mood-louche .micro-nosebit{transform:translate(.4px,0) scale(1.02,.99)}

.p-micro.mood-rire .micro-sway{animation:micro-rIn .4s ${ANT} forwards,micro-rLoop .3s .4s ${SINE} infinite}
.p-micro.mood-rire .micro-breath{animation:micro-shoulders .3s .4s ${SINE} infinite}
.p-micro.mood-rire .micro-head{animation:micro-rHead .4s ${ANT} forwards,micro-rHeadL .3s .46s ${SINE} infinite}
.p-micro.mood-rire .micro-quiff{animation:micro-qBob .3s .52s ${SINE} infinite}
.p-micro.mood-rire .micro-jaw{transform:scale(1,1.07)}
.p-micro.mood-rire .micro-must{transform:translate(0,-2.4px) scale(1.12,1)}
.p-micro.mood-rire .micro-nosebit{transform:translate(0,-1px) scale(1.04,.95)}
.p-micro.mood-rire .micro-eo{display:none}
.p-micro.mood-rire .micro-ec,.p-micro.mood-rire .micro-tears{display:inline}
.p-micro .micro-dropL{animation:micro-squirtL .45s cubic-bezier(.2,0,.6,1) infinite}
.p-micro .micro-dropR{animation:micro-squirtR .45s cubic-bezier(.2,0,.6,1) infinite}
.p-micro.mood-rire .micro-pose-rire .micro-swing{animation:micro-slap .6s .45s infinite}
.p-micro.mood-rire .micro-stand{animation:micro-hit .6s .45s ${OUT} infinite}
.p-micro.mood-rire .micro-mich{animation:micro-mJig .6s .5s ${OUT} infinite}
.p-micro.mood-rire .micro-water{animation:micro-slosh .6s .5s ${SINE} infinite}
.p-micro.mood-rire .micro-signlit,.p-micro.mood-victoire .micro-signlit{animation:micro-signOn 1s .12s forwards}
.p-micro.mood-rire .micro-blit,.p-micro.mood-victoire .micro-blit{animation-duration:.8s;animation-delay:calc(var(--i) * -.1s)}
.p-micro.mood-rire .micro-aud,.p-micro.mood-victoire .micro-aud{animation:micro-audLaugh .34s ${SINE} infinite;animation-delay:var(--dl)}

.p-micro.mood-victoire .micro-sway{animation:micro-vBody 1s ${BACK} forwards}
.p-micro.mood-victoire .micro-head{animation:micro-vHead 1s ${BACK} forwards}
.p-micro.mood-victoire .micro-quiff{animation:micro-qBounce 1s .12s ${OUT} forwards}
.p-micro.mood-victoire .micro-eyeR .micro-eo{display:none}
.p-micro.mood-victoire .micro-eyeR .micro-ew{display:inline}
.p-micro.mood-victoire .micro-jaw{transform:scale(1,1.02)}
.p-micro.mood-victoire .micro-must{transform:translate(0,-1.8px) scale(1.1,1)}
.p-micro.mood-victoire .micro-ting{animation:micro-ting .75s .5s ${OUT} forwards}
.p-micro.mood-victoire .micro-flick{animation:micro-bang 1.2s .32s forwards}
.p-micro.mood-victoire .micro-puff{animation:micro-puff .9s .42s ${OUT} forwards}
.p-micro.mood-victoire .micro-mich{animation:micro-mJig .7s .2s ${OUT}}
.p-micro.mood-victoire .micro-water{animation:micro-slosh .5s .1s ${SINE} 3}

.p-micro.mood-decu .micro-sway{animation:micro-dBody 1.1s cubic-bezier(.4,0,.2,1) forwards}
.p-micro.mood-decu .micro-breath{animation:micro-sigh 1.6s .25s ${SINE} forwards}
.p-micro.mood-decu .micro-head{animation:micro-dHead 1s .08s cubic-bezier(.4,0,.2,1) forwards}
.p-micro.mood-decu .micro-quiff{animation:micro-qDroop 1.2s .2s cubic-bezier(.4,0,.2,1) forwards}
.p-micro.mood-decu .micro-lidlow{transform:scaleY(.62)}
.p-micro.mood-decu .micro-pupil{transform:translate(calc(var(--look,0) * 2px),1.4px)}
.p-micro.mood-decu .micro-must{transform:translate(0,1.2px)}
.p-micro.mood-decu .micro-nosebit{transform:translate(0,.4px)}
.p-micro.mood-decu .micro-mich{animation:micro-droop 1.3s .3s ${SINE} forwards}
.p-micro.mood-decu .micro-dim{opacity:.4}
.p-micro.mood-decu .micro-cone{opacity:.35}
.p-micro.mood-decu .micro-blit{animation:micro-dimbulb 1.4s .2s cubic-bezier(.4,0,.2,1) forwards}
.p-micro.mood-decu .micro-aud{animation-play-state:paused}
.p-micro.mood-decu .micro-cricket{opacity:1;transition:opacity .4s .45s}
.p-micro.mood-decu .micro-hop{animation:micro-hop .55s .45s ${OUT} both}
.p-micro.mood-decu .micro-chirp{animation:micro-chirp .5s 1.05s ${OUT} infinite}
.p-micro.mood-decu .micro-cleg{animation:micro-rub .25s 1.05s ${SINE} infinite}
.p-micro.mood-decu .micro-crtext{animation:micro-crtext 1.2s 1.05s ${SINE} infinite}

.p-micro.mood-surprise .micro-sway{animation:micro-sBody .7s ${BACK} forwards}
.p-micro.mood-surprise .micro-head{animation:micro-sHead .7s ${BACK} forwards}
.p-micro.mood-surprise .micro-jaw{transform:scale(1,1.06)}
.p-micro.mood-surprise .micro-eo{transform:scale(1.22)}
.p-micro.mood-surprise .micro-iris{transform:scale(.7)}
.p-micro.mood-surprise .micro-blink{animation:none}
.p-micro.mood-surprise .micro-must{transform:translate(0,-1.4px) scale(.82,1)}
.p-micro.mood-surprise .micro-nosebit{transform:translate(0,-.6px) scale(.98,1.03)}
.p-micro.mood-surprise .micro-quiff{animation:micro-boing 1.3s .08s ${SINE} forwards}
.p-micro.mood-surprise .micro-spring{animation:micro-springK 1.3s .08s ${SINE} forwards}
.p-micro.mood-surprise .micro-fb{animation:micro-fb .22s .1s ${SINE} infinite}
.p-micro.mood-surprise .micro-mich{animation:micro-jit .08s .1s ${SINE} infinite}
.p-micro.mood-surprise .micro-cone{animation:micro-surge .6s cubic-bezier(.4,0,.2,1)}
.p-micro.mood-surprise .micro-aud{animation:micro-audJump .5s ${BACK} both;animation-delay:calc(var(--dl) * -.06)}

@keyframes micro-settle{0%{transform:translate(0,2px) scale(1.008,.988)}100%{transform:translate(-1px,0) rotate(-.5deg)}}
@keyframes micro-sway{0%,100%{transform:translate(-1px,0) rotate(-.5deg)}50%{transform:translate(1.4px,-.6px) rotate(.6deg)}}
@keyframes micro-breath{0%,100%{transform:none}45%{transform:scale(1.005,1.014)}}
@keyframes micro-headidle{0%,100%{transform:none}22%{transform:rotate(-1.6deg) translate(-.5px,0)}48%{transform:rotate(.9deg) translate(.4px,-.4px)}72%{transform:rotate(-.4deg)}}
@keyframes micro-quiffidle{0%,100%{transform:none}24%{transform:rotate(-1.2deg)}50%{transform:rotate(1deg)}74%{transform:rotate(-.3deg)}}
@keyframes micro-tieidle{0%,68%{transform:none}71%{transform:rotate(-7deg)}74%{transform:rotate(5deg)}77%{transform:rotate(-3deg)}80%{transform:rotate(1.5deg)}84%,100%{transform:none}}
@keyframes micro-blink{0%,92%,100%{transform:scaleY(0)}94.5%{transform:scaleY(1)}97%{transform:scaleY(.15)}}
@keyframes micro-dart{0%,16%{transform:none}19%,38%{transform:translate(1.6px,-.3px)}41%,62%{transform:translate(-1.3px,.2px)}65%,100%{transform:none}}
@keyframes micro-tap{0%,76%,100%{transform:none}79%{transform:rotate(-16deg)}82.5%{transform:rotate(1deg)}85%{transform:rotate(-13deg)}88.5%{transform:rotate(.5deg)}91%{transform:none}}
@keyframes micro-idleA{0%,64%{opacity:1;transform:none}64.6%,92%{opacity:0;transform:none}92.6%{opacity:1;transform:rotate(7deg)}96%{transform:rotate(-1deg)}100%{opacity:1;transform:none}}
@keyframes micro-idleB{0%,64%{opacity:0;transform:rotate(-8deg)}64.6%{opacity:1;transform:rotate(-8deg)}68%{transform:rotate(1.2deg)}70.5%{transform:none}74%{transform:translate(0,-1px)}77%{transform:translate(0,1px)}80%{transform:translate(0,-.6px)}83%,92%{opacity:1;transform:none}92.6%,100%{opacity:0;transform:none}}
@keyframes micro-pin{0%{transform:rotate(var(--pr,0deg))}100%{transform:none}}
@keyframes micro-chase{0%,36%{opacity:1}44%,100%{opacity:.14}}
@keyframes micro-haze{from{transform:translate(-26px,3px)}to{transform:translate(28px,-5px)}}
@keyframes micro-curt{0%,100%{transform:skewX(0)}50%{transform:skewX(.7deg)}}
@keyframes micro-audIdle{0%,100%{transform:none}50%{transform:translate(0,-1.4px) rotate(.4deg)}}
@keyframes micro-footfl{0%,100%{opacity:1}40%{opacity:.75}55%{opacity:.95}70%{opacity:.6}}
@keyframes micro-phone{0%,100%{opacity:1}50%{opacity:.7}}

@keyframes micro-lBody{0%{transform:none;animation-timing-function:${ANT}}14%{transform:translate(2px,-1px) rotate(.8deg)}100%{transform:translate(-4px,1px) rotate(-1.4deg)}}
@keyframes micro-lHead{0%{transform:none}14%{transform:rotate(1.6deg)}100%{transform:translate(-5px,2px) rotate(-6deg)}}
@keyframes micro-lHmm{0%,100%{transform:translate(-5px,2px) rotate(-6deg)}50%{transform:translate(-5px,3px) rotate(-4.8deg)}}
@keyframes micro-lag{0%{transform:none}30%{transform:rotate(3.4deg)}62%{transform:rotate(-1.4deg)}100%{transform:none}}
@keyframes micro-mLean{to{transform:rotate(9deg)}}

@keyframes micro-rIn{0%{transform:none}30%{transform:translate(0,-4px) rotate(1.2deg)}100%{transform:translate(-4px,18px) rotate(-4deg)}}
@keyframes micro-rLoop{0%,100%{transform:translate(-4px,18px) rotate(-4deg)}50%{transform:translate(-4px,22px) rotate(-3deg)}}
@keyframes micro-shoulders{0%,100%{transform:none}50%{transform:scale(1.012,.984)}}
@keyframes micro-rHead{0%{transform:none}30%{transform:rotate(3deg) translate(0,-2px)}100%{transform:rotate(-13deg) translate(-5px,9px)}}
@keyframes micro-rHeadL{0%,100%{transform:rotate(-13deg) translate(-5px,9px)}50%{transform:rotate(-9.5deg) translate(-4px,6px)}}
@keyframes micro-qBob{0%,100%{transform:none}50%{transform:translate(0,-1.4px) rotate(-1.5deg)}}
@keyframes micro-squirtL{0%{transform:translate(0,0) scale(.3) rotate(-60deg);opacity:0}12%{opacity:1}45%{transform:translate(-20px,-12px) scale(1) rotate(-90deg)}100%{transform:translate(-38px,14px) scale(.8) rotate(-150deg);opacity:0}}
@keyframes micro-squirtR{0%{transform:translate(0,0) scale(.3) rotate(60deg);opacity:0}12%{opacity:1}45%{transform:translate(20px,-12px) scale(1) rotate(90deg)}100%{transform:translate(38px,14px) scale(.8) rotate(150deg);opacity:0}}
@keyframes micro-slap{0%,100%{transform:none;animation-timing-function:${ANT}}40%{transform:rotate(5deg);animation-timing-function:cubic-bezier(.7,0,1,.5)}52%{transform:rotate(-.8deg);animation-timing-function:${OUT}}66%{transform:none}}
@keyframes micro-hit{0%,50%{transform:none}56%{transform:rotate(-1.4deg)}68%{transform:rotate(.8deg)}80%{transform:rotate(-.3deg)}92%,100%{transform:none}}
@keyframes micro-mJig{0%,50%{transform:none}60%{transform:rotate(-4deg)}74%{transform:rotate(2.5deg)}88%{transform:rotate(-1deg)}100%{transform:none}}
@keyframes micro-slosh{0%,100%{transform:none}50%{transform:rotate(3deg)}}
@keyframes micro-signOn{0%{opacity:0}8%{opacity:1}14%{opacity:.15}22%{opacity:1}28%{opacity:.4}36%,100%{opacity:1}}
@keyframes micro-audLaugh{0%,100%{transform:none}50%{transform:translate(0,-3px) rotate(1deg)}}

@keyframes micro-vBody{0%{transform:none;animation-timing-function:${ANT}}12%{transform:translate(0,4px) scale(1.012,.978);animation-timing-function:${BACK}}42%{transform:translate(2px,-7px) rotate(1.8deg) scale(.992,1.012)}100%{transform:translate(2px,-3px) rotate(1.2deg)}}
@keyframes micro-vHead{0%{transform:none}12%{transform:translate(0,2px) rotate(-1deg)}45%{transform:rotate(6deg) translate(1px,-2px)}100%{transform:rotate(4deg)}}
@keyframes micro-qBounce{0%{transform:none}20%{transform:translate(0,2px) scale(1.03,.95)}45%{transform:translate(0,-3px) scale(.98,1.06) rotate(-2deg)}70%{transform:translate(0,.5px) rotate(1deg)}100%{transform:none}}
@keyframes micro-ting{0%{transform:scale(0) rotate(0);opacity:1}35%{transform:scale(1.5) rotate(45deg);opacity:1}100%{transform:scale(0) rotate(100deg);opacity:0}}
@keyframes micro-bang{0%{transform:none}10%{transform:rotate(-16deg);animation-timing-function:${OUT}}30%{transform:none}48%{transform:rotate(-12deg);animation-timing-function:${OUT}}66%,100%{transform:none}}
@keyframes micro-puff{0%{opacity:0;transform:none}20%{opacity:1}100%{opacity:0;transform:translate(8px,-10px) scale(1.8)}}

@keyframes micro-dBody{0%{transform:none}14%{transform:translate(0,-2px) scale(1,1.008)}100%{transform:translate(1px,6px) rotate(.8deg)}}
@keyframes micro-sigh{0%{transform:none}35%{transform:scale(1.008,1.02)}100%{transform:scale(.996,.986)}}
@keyframes micro-dHead{0%{transform:none}15%{transform:rotate(-1deg) translate(0,-1.5px)}100%{transform:rotate(4deg) translate(2px,6px)}}
@keyframes micro-qDroop{0%{transform:none}60%{transform:rotate(4deg) translate(0,1.5px)}100%{transform:rotate(3deg) translate(0,1px)}}
@keyframes micro-droop{0%{transform:none}10%{transform:rotate(3deg)}70%{transform:rotate(-46deg)}84%{transform:rotate(-38deg)}100%{transform:rotate(-41deg)}}
@keyframes micro-dimbulb{0%{opacity:1}30%{opacity:.45}45%{opacity:.8}100%{opacity:.08}}
@keyframes micro-hop{0%{opacity:0;transform:translate(18px,-2px)}45%{opacity:1;transform:translate(8px,-14px)}80%{transform:translate(0,1px) scale(1.06,.9)}100%{transform:none}}
@keyframes micro-chirp{0%{opacity:0;transform:scale(.6)}30%{opacity:1}100%{opacity:0;transform:scale(1.3)}}
@keyframes micro-rub{0%,100%{transform:none}50%{transform:rotate(-12deg)}}
@keyframes micro-crtext{0%,100%{opacity:.2;transform:translate(0,1px)}50%{opacity:1;transform:translate(0,-1px)}}

@keyframes micro-sBody{0%{transform:none;animation-timing-function:${ANT}}12%{transform:translate(0,3px) scale(1.01,.975);animation-timing-function:cubic-bezier(.05,.7,.1,1)}32%{transform:translate(-1px,-9px) rotate(-1deg) scale(.99,1.02)}100%{transform:translate(0,-4px) rotate(-.4deg)}}
@keyframes micro-sHead{0%{transform:none}12%{transform:translate(0,2px)}32%{transform:translate(0,-5px) rotate(-2deg)}100%{transform:translate(0,-2px) rotate(-1deg)}}
@keyframes micro-boing{0%{transform:none;animation-timing-function:${ANT}}9%{transform:translate(0,3px) scale(1.06,.9);animation-timing-function:cubic-bezier(.05,.7,.1,1)}22%{transform:translate(0,-50px) scale(.94,1.1)}34%{transform:translate(0,-34px) scale(1.04,.96)}46%{transform:translate(0,-45px)}58%{transform:translate(0,-38px)}72%{transform:translate(0,-42px)}100%{transform:translate(0,-41px)}}
@keyframes micro-springK{0%,9%{transform:scaleY(0);opacity:1}22%{transform:scaleY(1.32);opacity:1}34%{transform:scaleY(.77);opacity:1}46%{transform:scaleY(1.15);opacity:1}58%{transform:scaleY(.91);opacity:1}72%{transform:scaleY(1.05);opacity:1}100%{transform:scaleY(1.01);opacity:1}}
@keyframes micro-fb{0%,100%{opacity:1;transform:scale(.9)}50%{opacity:.35;transform:scale(1.08)}}
@keyframes micro-jit{0%,100%{transform:none}25%{transform:translate(-.8px,.4px) rotate(-1.5deg)}75%{transform:translate(.8px,-.4px) rotate(1.5deg)}}
@keyframes micro-surge{0%,100%{opacity:1}20%{opacity:.45}40%{opacity:1}60%{opacity:.7}}
@keyframes micro-audJump{0%{transform:none}30%{transform:translate(0,-7px)}100%{transform:none}}
@media (prefers-reduced-motion: reduce){.p-micro .micro-blit{animation:none}}
`;

const DOT = (c) => `radial-gradient(circle at center,${c})`;
const LIT = DOT('#fffbe6 0 1.6px,#ffcf4a 2.6px,rgba(255,170,40,.4) 4px,transparent 6px');
const OFF = DOT('#6a4a22 0 1.8px,transparent 2.6px');
const UI_CSS = `
.ui-micro{font-family:Barlow,system-ui,sans-serif;color:#fff6e6;container-type:inline-size}
.ui-micro .ui-micro-wrap{position:relative;border-radius:16px;overflow:hidden;background:radial-gradient(120% 90% at 50% 0%,#4a1220 0%,#21070e 55%,#10040a 100%);padding:22px}
.ui-micro .ui-micro-wrap::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent 0 15px,rgba(0,0,0,.18) 15px 16px),repeating-linear-gradient(90deg,transparent 0 31px,rgba(0,0,0,.12) 31px 32px);opacity:.5;pointer-events:none}
.ui-micro .ui-micro-bulbs{position:absolute;inset:0;pointer-events:none;
background:${OFF} 0 0/12px 14px repeat-x,${OFF} 0 100%/12px 14px repeat-x,${OFF} 0 0/14px 12px repeat-y,${OFF} 100% 0/14px 12px repeat-y;}
.ui-micro .ui-micro-bulbs::after{content:"";position:absolute;inset:0;
background:${LIT} 0 0/24px 14px repeat-x,${LIT} 0 100%/24px 14px repeat-x,${LIT} 0 0/14px 24px repeat-y,${LIT} 100% 0/14px 24px repeat-y;animation:ui-micro-chase 1s steps(2) infinite}
@keyframes ui-micro-chase{from{background-position:0 0,0 100%,0 0,100% 0}to{background-position:24px 0,24px 100%,0 24px,100% 24px}}
.ui-micro .ui-micro-in{position:relative;display:grid;gap:16px}
.ui-micro .ui-micro-top{display:grid;grid-template-columns:1fr minmax(220px,300px) 1fr;gap:18px;align-items:center}
.ui-micro .ui-micro-kick{font:400 15px/1 "Bebas Neue",sans-serif;letter-spacing:.14em;color:#ffcf4a}
.ui-micro h4{margin:4px 0 6px;font:400 clamp(26px,3.4vw,36px)/1 Shrikhand,serif;color:#fff6e6;text-shadow:0 3px 0 #8e1529,0 0 18px rgba(255,80,100,.35)}
.ui-micro .ui-micro-title p{margin:0;font-weight:600;font-size:14px;color:#e8c9b8;max-width:24ch}
.ui-micro .ui-micro-pic{margin:0;display:grid;gap:6px;justify-items:center}
.ui-micro .ui-micro-frame{width:100%;padding:8px;border-radius:6px;background:linear-gradient(145deg,#f3c45a,#a8741c 45%,#f6d27a 70%,#8a5a12);box-shadow:0 10px 24px rgba(0,0,0,.5),inset 0 0 0 2px rgba(0,0,0,.25);transform:rotate(-1.2deg);animation:ui-micro-hang 6s cubic-bezier(.45,0,.55,1) infinite}
.ui-micro .ui-micro-frame svg{display:block;width:100%;height:auto;border-radius:2px;box-shadow:inset 0 0 0 2px #3a2208}
.ui-micro figcaption{font:400 14px/1 "Bebas Neue",sans-serif;letter-spacing:.16em;color:#d9b48a}
.ui-micro .ui-micro-timer{justify-self:end;display:grid;justify-items:center;gap:8px}
.ui-micro .ui-micro-onair{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:6px;border:2px solid #ff3550;color:#ffe6ea;font:400 17px/1 "Bebas Neue",sans-serif;letter-spacing:.18em;background:rgba(255,40,70,.16);box-shadow:0 0 14px rgba(255,53,80,.45)}
.ui-micro .ui-micro-onair i{width:9px;height:9px;border-radius:50%;background:#ff3550;box-shadow:0 0 8px #ff3550;animation:ui-micro-blink 1.2s cubic-bezier(.45,0,.55,1) infinite}
.ui-micro .ui-micro-clock{position:relative;width:92px;height:92px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle,#2a0a12 0 58%,#14050a 60%);box-shadow:0 0 0 3px #3a1a10,0 8px 18px rgba(0,0,0,.5)}
.ui-micro .ui-micro-clock svg{position:absolute;inset:0;transform:rotate(-90deg)}
.ui-micro .ui-micro-track{fill:none;stroke:rgba(255,255,255,.1);stroke-width:5}
.ui-micro .ui-micro-sweep{fill:none;stroke:#ff3550;stroke-width:5;stroke-linecap:round;stroke-dasharray:169.6;animation:ui-micro-sweep 20s linear infinite}
.ui-micro .ui-micro-clock b{font:400 34px/1 "Bebas Neue",sans-serif;color:#fff6e6;animation:ui-micro-tick 1s cubic-bezier(.2,0,0,1) infinite;margin-top:4px}
.ui-micro .ui-micro-clock small{position:absolute;bottom:20px;font:700 10px/1 Barlow,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#d9b48a}
.ui-micro .ui-micro-duel{display:grid;grid-template-columns:1fr 150px 1fr;gap:18px;align-items:center;padding-top:34px}
.ui-micro .ui-micro-card{position:relative;animation:ui-micro-dealA .5s cubic-bezier(.175,.885,.32,1.275) .05s both}
.ui-micro .ui-micro-b{animation-name:ui-micro-dealB;animation-delay:.14s}
.ui-micro .ui-micro-bal{position:relative;background:#fff7e8;color:#24121a;border:3px solid #1a0a0e;border-radius:26px;padding:22px 24px 30px;box-shadow:7px 9px 0 rgba(0,0,0,.4);transform:rotate(-3deg)}
.ui-micro .ui-micro-b .ui-micro-bal{transform:rotate(2.6deg)}
.ui-micro .ui-micro-bal::after{content:"";position:absolute;bottom:-17px;right:36px;width:26px;height:26px;background:#fff7e8;border-right:3px solid #1a0a0e;border-bottom:3px solid #1a0a0e;transform:skewX(-28deg) rotate(45deg)}
.ui-micro .ui-micro-b .ui-micro-bal::after{right:auto;left:36px;transform:skewX(28deg) rotate(45deg)}
.ui-micro .ui-micro-bal p{margin:0;font:800 clamp(18px,2.1vw,23px)/1.2 Barlow,sans-serif}
.ui-micro .ui-micro-bal p::before{content:"“";display:block;height:20px;margin:-8px 0 2px;font:400 44px/1 Shrikhand,serif;color:#b8173a}
.ui-micro .ui-micro-win .ui-micro-bal{box-shadow:7px 9px 0 rgba(0,0,0,.4),0 0 0 4px #ffcf4a,0 0 26px rgba(255,207,74,.55);animation:ui-micro-glow 2.4s 1.2s cubic-bezier(.45,0,.55,1) infinite}
.ui-micro .ui-micro-tag{position:absolute;left:18px;bottom:-14px;padding:5px 14px 4px 12px;background:var(--c);color:#14060a;font:400 20px/1 "Bebas Neue",sans-serif;letter-spacing:.08em;border-radius:4px;transform:rotate(-4deg);box-shadow:3px 4px 0 rgba(0,0,0,.45);clip-path:polygon(0 0,100% 0,100% 100%,0 100%,6px 50%)}
.ui-micro .ui-micro-b .ui-micro-tag{left:auto;right:18px;transform:rotate(3deg)}
.ui-micro .ui-micro-votes{position:absolute;top:-17px;right:18px;display:flex;flex-direction:row;gap:5px;align-items:center;z-index:2}
.ui-micro .ui-micro-votes span{display:inline-flex;align-items:center;gap:6px;padding:5px 11px 5px 6px;border-radius:999px;background:#1d0a10;border:2px solid var(--c);font:800 13px/1 Barlow,sans-serif;color:#fff6e6;box-shadow:0 4px 0 rgba(0,0,0,.4);animation:ui-micro-vote .4s cubic-bezier(.175,.885,.32,1.275) .5s both}
.ui-micro .ui-micro-votes span::before{content:"";width:14px;height:14px;border-radius:50%;background:var(--c)}
.ui-micro .ui-micro-votes span:nth-child(2){animation-delay:.62s;transform:rotate(4deg)}
.ui-micro .ui-micro-votes span:nth-child(1){transform:rotate(-3deg)}
.ui-micro .ui-micro-stamp{position:absolute;left:-14px;top:-20px;padding:2px 12px;border:3px double #e8253f;border-radius:8px;color:#e8253f;background:rgba(255,247,232,.85);font:400 24px/1.1 Shrikhand,serif;transform:rotate(-13deg);animation:ui-micro-stamp .38s cubic-bezier(.175,.885,.32,1.275) .42s both;box-shadow:0 0 0 2px rgba(232,37,63,.2)}
.ui-micro .ui-micro-meter{display:grid;justify-items:center;gap:2px;text-align:center}
.ui-micro .ui-micro-meter svg{width:130px;height:auto;overflow:visible}
.ui-micro .ui-micro-needle{transform-box:view-box;transform-origin:60px 62px;animation:ui-micro-needle .7s cubic-bezier(.175,.885,.32,1.275) .2s both}
.ui-micro .ui-micro-meter b{font:400 15px/1 "Bebas Neue",sans-serif;letter-spacing:.14em;color:#ffcf4a}
.ui-micro .ui-micro-meter span{font:800 20px/1 Barlow,sans-serif}
.ui-micro .ui-micro-meter em{font-style:normal;color:var(--c)}
.ui-micro .ui-micro-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:6px 16px;padding-top:12px;font-weight:600;font-size:13px;color:#d9b48a;border-top:1px dashed rgba(255,207,74,.25)}
@keyframes ui-micro-blink{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes ui-micro-sweep{from{stroke-dashoffset:0}to{stroke-dashoffset:169.6}}
@keyframes ui-micro-tick{0%{transform:scale(1.12)}40%,100%{transform:none}}
@keyframes ui-micro-hang{0%,100%{transform:rotate(-1.2deg)}50%{transform:rotate(-.4deg)}}
@keyframes ui-micro-dealA{0%{opacity:0;transform:translate(-60px,24px) rotate(-14deg)}100%{opacity:1;transform:none}}
@keyframes ui-micro-dealB{0%{opacity:0;transform:translate(60px,24px) rotate(14deg)}100%{opacity:1;transform:none}}
@keyframes ui-micro-vote{0%{opacity:0;translate:0 -40px}70%{opacity:1;translate:0 3px}100%{opacity:1;translate:0 0}}
@keyframes ui-micro-stamp{0%{opacity:0;transform:rotate(-13deg) scale(2.6)}60%{opacity:1;transform:rotate(-13deg) scale(.9)}100%{opacity:1;transform:rotate(-13deg) scale(1)}}
@keyframes ui-micro-needle{0%{transform:rotate(-72deg)}20%{transform:rotate(-80deg)}100%{transform:rotate(58deg)}}
@keyframes ui-micro-glow{0%,100%{box-shadow:7px 9px 0 rgba(0,0,0,.4),0 0 0 4px #ffcf4a,0 0 18px rgba(255,207,74,.4)}50%{box-shadow:7px 9px 0 rgba(0,0,0,.4),0 0 0 4px #ffe08a,0 0 34px rgba(255,207,74,.7)}}
@container (max-width:720px){
.ui-micro .ui-micro-wrap{padding:18px 16px}
.ui-micro .ui-micro-top{grid-template-columns:1fr auto}
.ui-micro .ui-micro-pic{grid-column:1 / -1;grid-row:2}
.ui-micro .ui-micro-clock{width:76px;height:76px}
.ui-micro .ui-micro-clock b{font-size:28px}
.ui-micro .ui-micro-clock small{bottom:14px}
.ui-micro .ui-micro-duel{grid-template-columns:1fr;gap:54px;padding-top:30px}
.ui-micro .ui-micro-meter{order:3}
}
@media (prefers-reduced-motion: reduce){.ui-micro *,.ui-micro *::after{animation:none !important}}
`;

export const micro: Persona = {
  id: 'micro',
  name: 'Monsieur Micro',
  svg: SVG,
  css: CSS,
  variants: [
    { famille: 'cravate', nom: 'Cravate', choix: [['noeud', 'Nœud papillon'], ['fine', 'Cravate fine']] },
    { famille: 'coiffure', nom: 'Coiffure', choix: [['banane', 'Banane'], ['plaquee', 'Plaquée en arrière']] },
    { famille: 'moustache', nom: 'Moustache', choix: [['fine', 'Fine moustache'], ['rase', 'Rasé']] },
  ],
  moodLabels: { repos: 'Au micro', louche: 'Hmm… louche', rire: 'Mort de rire', victoire: 'Et c\'est gagné !', decu: 'Le bide…', surprise: 'Larsen !' },
  react: 'rire',
  moments: [
    ['Nouveau duel', 'victoire'],
    ['Blague qui gagne', 'rire', [{ type: 'confetti', n: 60, colors: ['#ffcf4a', '#ff4d6d', '#ffffff'] }]],
    ['Blague qui perd', 'decu'],
    ["Personne n'a écrit", 'surprise'],
  ],
  ambient: [{ type: 'dust', box: [190, 20, 250, 300], density: 1.4, color: '255,232,190' }],
  bursts: {
    rire: [{ type: 'stars', at: [444, 80], n: 12, delay: 200, color: '255,190,200' }],
    victoire: [{ type: 'flash' }, { type: 'shake' }, { type: 'confetti', n: 140, colors: ['#ffcf4a', '#ff4d6d', '#ffffff', '#b8173a', '#ffe08a'] },
      { type: 'lines', at: [322, 150], n: 18, color: '255,230,170', delay: 60 }, { type: 'stars', at: [330, 146], n: 14, delay: 520 }],
    surprise: [{ type: 'lines', at: [322, 100], n: 24 }, { type: 'sparks', at: [262, 158], n: 22, power: .55, color: '180,225,255' }],
  },
  moodMs: 3200,
  worldCss: UI_CSS,
};
