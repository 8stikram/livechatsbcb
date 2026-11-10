// @ts-nocheck - the drawing is built by untyped helper code ported unchanged from docs/persos; only the exported object is typed (Persona).
import type { Persona } from '../persona';
// Professeur Boum, mascotte de « Question débile ».
// Labo souterrain : voûte en briques, bobine Tesla, tubes qui bouillonnent, tableau noir.
// Lumière principale verte (tubes + fiole) à gauche, contre-jour violet (bobine) à droite.
  const f = (n) => Math.round(n * 10) / 10;
  const P = (k, n, s) => `<g data-el="${k}" data-nom="${n}">${s}</g>`;
  const N = (cls, s) => cls.trim().split(/\s+/).reduceRight((a, c) => `<g class="${c}">${a}</g>`, s);
  const lerp = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];

  // ---------- painted locks: a tapered ribbon along a curved spine (root M, tip T, two bends, root width) ----------
  const bz = (S, t) => { const u = 1 - t; return [0, 1].map((i) => u * u * u * S[0][i] + 3 * u * u * t * S[1][i] + 3 * u * t * t * S[2][i] + t * t * t * S[3][i]); };
  const spineOf = (M, T, b1, b2) => {
    const dx = T[0] - M[0], dy = T[1] - M[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    return [M, [M[0] + dx / 3 + nx * b1, M[1] + dy / 3 + ny * b1], [M[0] + dx * 2 / 3 + nx * b2, M[1] + dy * 2 / 3 + ny * b2], T];
  };
  const qpath = (pts, close) => {
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) { const m = lerp(pts[i], pts[i + 1], .5); d += `Q${f(pts[i][0])},${f(pts[i][1])} ${f(m[0])},${f(m[1])}`; }
    const l = pts[pts.length - 1];
    return d + `L${f(l[0])},${f(l[1])}` + (close ? 'Z' : '');
  };
  const frame = (S, t) => {
    const p = bz(S, t), q = bz(S, Math.min(1, t + .02)), r = bz(S, Math.max(0, t - .02));
    const l = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1;
    return [p, -(q[1] - r[1]) / l, (q[0] - r[0]) / l];
  };
  const wOf = (w, t) => w * Math.pow(1 - t, .55) * (1 + 1.3 * t);
  const band = (S, w, off = 0, k = 1, n = 9) => {
    const A = [], B = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, [p, nx, ny] = frame(S, t), ww = wOf(w, t), h = ww * k / 2;
      const c = [p[0] + nx * off * ww, p[1] + ny * off * ww];
      A.push([c[0] + nx * h, c[1] + ny * h]); B.push([c[0] - nx * h, c[1] - ny * h]);
    }
    return qpath(A.concat(B.reverse().slice(1)), true);
  };
  const strandD = (S, w, off, t1 = .9) => {
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = .05 + (t1 - .05) * i / 6, [p, nx, ny] = frame(S, t), ww = wOf(w, t); pts.push([p[0] + nx * off * ww, p[1] + ny * off * ww]); }
    return qpath(pts, false);
  };
  const KEY = [-.55, -.83];
  const lock = ([M, T, b1, b2, w], o = {}) => {
    const bk = o.bk ?? 1.6, S = spineOf(M, T, b1 * bk, b2 * bk), [, nx, ny] = frame(S, .3);
    const s = nx * KEY[0] + ny * KEY[1] > 0 ? 1 : -1;
    return `<path d="${band(S, w)}" fill="${o.fill || 'url(#boum-hair)'}"/>`
      + `<path d="${band(S, w, -s * .28, .46, 7)}" fill="${o.shade || '#66738a'}" opacity="${o.so ?? .6}"/>`
      + `<path d="${band(S, w, s * .33, .22, 7)}" fill="${o.hl || '#fff'}" opacity="${o.hi ?? .85}"/>`
      + `<path d="${strandD(S, w, -s * .05)}" fill="none" stroke="${o.line || '#7d8a9c'}" stroke-width=".6" opacity=".7"/>`
      + (w > 9 ? `<path d="${strandD(S, w, s * .12, .75)}" fill="none" stroke="#fff" stroke-width=".5" opacity=".55"/>` : '');
  };
  const locks = (list, o) => list.map((L) => lock(L, o)).join('');
  const sootL = (list, c = '#2b2624', bk = 1.6) => list.map(([M, T, b1, b2, w]) => `<path d="${band(spineOf(M, T, b1 * bk, b2 * bk), w)}" fill="${c}"/>`).join('');
  // soft volume behind the locks: short fat locks, shade only
  const mass = (list, c) => list.map(([M, T, b1, b2, w]) => `<path d="${band(spineOf(M, lerp(M, T, .72), b1, b2), w * 1.7)}" fill="${c}"/>`).join('');

  // ---------- hair data [root, tip, bend1, bend2, root width] ----------
  const HB_L = [
    [[296, 80], [244, 28], 9, -7, 20], [[288, 96], [226, 72], 11, -9, 22], [[285, 116], [224, 124], -7, 10, 22],
    [[289, 136], [240, 168], -7, 9, 18], [[297, 152], [268, 184], -4, 6, 13],
  ];
  const HB_R = [
    [[344, 80], [398, 22], -9, 7, 20], [[352, 96], [416, 76], -11, 9, 22], [[355, 116], [418, 126], 7, -10, 22],
    [[351, 136], [398, 170], 7, -9, 18], [[343, 152], [372, 184], 4, -6, 13],
  ];
  const HF_L = [
    [[300, 74], [262, 36], 6, -8, 14], [[291, 90], [244, 60], 8, -10, 15], [[287, 106], [236, 98], 7, -9, 15],
    [[287, 122], [238, 140], -7, 8, 14], [[291, 138], [252, 162], -6, 7, 12], [[296, 150], [278, 176], -3, 4, 9],
    [[294, 88], [238, 82], 6, -8, 5], [[288, 114], [230, 112], -4, 6, 5], [[290, 130], [244, 154], -5, 6, 5],
  ];
  const HF_R = [
    [[340, 74], [380, 32], -6, 8, 14], [[349, 90], [398, 56], -8, 10, 15], [[353, 106], [406, 100], -7, 9, 15],
    [[353, 122], [402, 142], 7, -8, 14], [[349, 138], [388, 162], 6, -7, 12], [[344, 150], [362, 176], 3, -4, 9],
    [[346, 88], [402, 80], -6, 8, 5], [[352, 114], [410, 112], 4, -6, 5], [[350, 130], [396, 154], 5, -6, 5],
  ];
  const HW = [[[311, 69], [290, 30], 6, -6, 6], [[320, 67], [328, 20], -5, 6, 6], [[328, 68], [356, 34], -6, 5, 5.5], [[316, 68], [306, 40], -3, 3, 3.5]];
  const HT_L = [[[295, 84], [266, 60], 5, -5, 10], [[290, 100], [258, 92], 4, -5, 9], [[289, 116], [262, 122], -3, 4, 7]];
  const HT_R = [[[345, 84], [374, 60], -5, 5, 10], [[350, 100], [382, 92], -4, 5, 9], [[351, 116], [378, 122], 3, -4, 7]];
  const SPK = [];
  [[287, 100], [290, 87], [296, 77], [304, 70], [313, 66.5], [322, 66], [331, 67.5], [339, 71], [346, 78], [351, 88], [354, 100]]
    .forEach(([x, y], i) => {
      const d = x - 320;
      SPK.push([[x, y + 4], [x + d * .45 + (i % 2 ? 2 : -2), 8 + Math.abs(d) * .28 + (i % 3) * 4], i % 2 ? 2.5 : -2.5, i % 2 ? -2 : 2, 11]);
    });
  SPK.push([[285, 118], [240, 40], 5, -4, 14], [[355, 118], [400, 36], -5, 4, 14]);
  const BROW_L = [[[315, 103.5], [289, 99.5], -3, 1, 6.6], [[309, 101], [289, 93], 2, -2, 4.6], [[312, 104.6], [294, 105.8], -1, 1, 3.6], [[315.5, 103], [318, 95.6], 1, -1, 3]];
  const BROW_R = [[[325, 103.5], [351, 99.5], 3, -1, 6.6], [[331, 101], [352, 92.5], -2, 2, 4.6], [[328, 104.6], [346, 105.8], 1, -1, 3.6], [[324.5, 103], [322, 95.6], -1, 1, 3]];

  // ---------- gloved fist (local frame: bar on x=0, wrist on the left, gauntlet toward angle ga) ----------
  const GL = {
    y: { m: 'url(#boum-gy)', s: '#8a5a05', h: '#fff6cf', l: '#5f3c03' },
    k: { m: 'url(#boum-gk)', s: '#000', h: '#c9cde0', l: '#000' },
  };
  const fist = (g, h, ga, W = [-23, 1.5]) => {
    const a = ga * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    const xe = h + 2.2;
    const p = (t, s) => `${f(W[0] + ux * t + px * s)},${f(W[1] + uy * t + py * s)}`;
    const gaunt = `M${p(-3, -11.5)}L${p(25, -15.5)}Q${p(28, 0)} ${p(25, 15.5)}L${p(-3, 11.5)}Z`;
    const rim = `M${p(21, -15)}L${p(26, -15.8)}Q${p(29, 0)} ${p(26, 15.8)}L${p(21, 15)}Q${p(24, 0)} ${p(21, -15)}Z`;
    const crease = `M${p(4, -12)}Q${p(6, 0)} ${p(4, 12)}M${p(11, -13)}Q${p(13, 0)} ${p(11, 13)}`;
    let fingers = '';
    [[-13, -6.2], [-6.6, .4], [0, 7], [6.6, 12.6]].forEach(([y0, y1], i) => {
      const ym = f((y0 + y1) / 2), e = f(xe - (i === 3 ? 1.6 : 0));
      fingers += `<path d="M-16 ${y0}C-9 ${f(y0 - 1)} ${f(e - 5)} ${f(y0 - .9)} ${f(e - 2)} ${y0}Q${f(e + 2.2)} ${ym} ${f(e - 2)} ${y1}C${f(e - 5)} ${f(y1 + .9)} -9 ${f(y1 + 1)} -16 ${y1}C-18.6 ${f(y1 - 1.6)} -18.6 ${f(y0 + 1.6)} -16 ${y0}Z" fill="${g.m}"/>`
        + `<path d="M${f(e - 2.4)} ${f(y0 + .6)}Q${f(e + 1.4)} ${ym} ${f(e - 2.4)} ${f(y1 - .6)}Q${f(e - .4)} ${ym} ${f(e - 2.4)} ${f(y0 + .6)}Z" fill="${g.s}" opacity=".5"/>`
        + `<path d="M-15 ${f(y1 - .1)}C-6 ${f(y1 + .5)} 0 ${f(y1 + .4)} ${f(e - 2)} ${f(y1 - .1)}" stroke="${g.l}" stroke-width=".8" fill="none" opacity=".7"/>`
        + `<path d="M-12.5 ${f(y0 + 1.4)}C-7 ${f(y0 + .6)} -2 ${f(y0 + .6)} ${f(e - 3.4)} ${f(y0 + 1.2)}" stroke="${g.h}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".55"/>`
        + `<path d="M-4.6 ${f(y0 + 1)}Q-3 ${ym} -4.6 ${f(y1 - 1)}" stroke="${g.l}" stroke-width=".6" fill="none" opacity=".45"/>`
        + `<ellipse cx="-15" cy="${f(ym - .5)}" rx="1.8" ry="1.2" fill="${g.h}" opacity=".5"/>`;
    });
    return `<path d="${gaunt}" fill="${g.m}"/><path d="${crease}" stroke="${g.l}" stroke-width=".7" fill="none" opacity=".45"/>`
      + `<path d="${rim}" fill="${g.s}" opacity=".5"/>`
      + `<path d="M-28.5 -8C-25.5 -15 -17 -16.6 -11 -15L-9 13C-15 16 -23.5 15.4 -28.5 10C-30.5 4 -30.5 -2 -28.5 -8Z" fill="${g.m}"/>`
      + `<path d="M-29.5 2C-25 8 -17 12 -9 13C-15 16 -23.5 15.4 -28.5 10Z" fill="${g.s}" opacity=".35"/>`
      + fingers
      + `<path d="M-27 -8C-24 -16.5 -14 -20.4 -5 -19.4C.4 -19 2.8 -16.8 1.6 -13.9C-.6 -12 -7.6 -12.2 -13.6 -11.2C-18.6 -10.4 -23 -7.6 -27 -8Z" fill="${g.m}"/>`
      + `<path d="M-25.5 -7.8C-19 -9.6 -12 -11.4 -4 -12.6" stroke="${g.l}" stroke-width=".7" fill="none" opacity=".6"/>`
      + `<path d="M-22 -12.8C-16 -17 -7 -18.4 -1 -17.8" stroke="${g.h}" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".65"/>`;
  };
  const gloves = (h, ga, tr, extra = '', W) => ['y', 'k'].map((c) =>
    `<g data-var="gants" data-variante="${c === 'y' ? 'jaunes' : 'noirs'}"><g transform="${tr}">${extra}${fist(GL[c], h, ga, W)}</g></g>`).join('');

  // ---------- eyes ----------
  const EYES = { L: [305, 114, -1, '#e8bea2', '#d8a98e'], R: [335, 114, 1, '#cf9c84', '#bb876f'] };
  const almond = (cx, cy, s) => {
    const X = (d) => f(cx + d * s);
    return `M${X(-9)} ${cy}C${X(-5)} ${f(cy - 6)} ${X(5)} ${f(cy - 6.6)} ${X(9.6)} ${f(cy - 1)}C${X(5)} ${f(cy + 4.6)} ${X(-5)} ${f(cy + 4.8)} ${X(-9)} ${cy}Z`;
  };
  const eye = (k) => {
    const [cx, cy, s, skin, skin2] = EYES[k], X = (d) => f(cx + d * s), y = (d) => f(cy + d);
    const lid = `M${X(-10.6)} ${y(-.4)}C${X(-5)} ${y(-8.6)} ${X(5)} ${y(-9.2)} ${X(11.2)} ${y(-2)}L${X(11.2)} ${y(.8)}C${X(5)} ${y(5.9)} ${X(-5)} ${y(6)} ${X(-10.6)} ${y(1)}Z`;
    const low = `M${X(-10.6)} ${y(7.5)}L${X(-10.6)} ${y(1)}C${X(-5)} ${y(-2.6)} ${X(5)} ${y(-2.8)} ${X(11.2)} ${y(-.2)}L${X(11.2)} ${y(7.5)}Z`;
    return `<g class="boum-eye${k}"><g class="boum-mag${k}">`
      + `<path d="${almond(cx, cy, s)}" fill="#f1ecdc"/>`
      + `<g clip-path="url(#boum-clip${k})">`
      + `<g class="boum-plook"><g class="boum-dart">`
      + `<circle cx="${cx}" cy="${y(-.4)}" r="4.4" fill="url(#boum-iris)"/><circle cx="${cx}" cy="${y(-.4)}" r="4.4" fill="none" stroke="#163243" stroke-width=".9"/>`
      + `<g class="boum-psz${k}"><circle cx="${cx}" cy="${y(-.4)}" r="2.1" fill="#070b0e"/></g>`
      + `<circle cx="${f(cx - 1.6)}" cy="${y(-2.2)}" r="1.15" fill="#fff"/><circle cx="${f(cx + 1.5)}" cy="${y(.9)}" r=".55" fill="#fff" opacity=".8"/>`
      + `</g></g>`
      + `<path d="M${X(-10)} ${y(-3)}C${X(-4)} ${y(-8)} ${X(5)} ${y(-8)} ${X(11)} ${y(-2.5)}L${X(10)} ${y(-.4)}C${X(4)} ${y(-4.6)} ${X(-4)} ${y(-4.4)} ${X(-9)} ${y(-.5)}Z" fill="#6b4434" opacity=".38" filter="url(#boum-soft1)"/>`
      + `</g>`
      + `<path d="M${X(-9.6)} ${y(.4)}C${X(-5)} ${y(-6.5)} ${X(5)} ${y(-7.1)} ${X(10.8)} ${y(-1.8)}" stroke="#241210" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
      + `<path d="M${X(-8.4)} ${y(1.4)}C${X(-4)} ${y(5.4)} ${X(4)} ${y(5.4)} ${X(9.2)} ${y(.4)}" stroke="#8c5547" stroke-width=".8" fill="none" opacity=".75"/>`
      + `<g class="boum-low${k}"><path d="${low}" fill="${skin2}"/><path d="M${X(-10)} ${y(1.2)}C${X(-5)} ${y(-2.2)} ${X(5)} ${y(-2.4)} ${X(10.8)} ${y(.1)}" stroke="#7d4a3e" stroke-width=".9" fill="none"/><g class="boum-soot"><path d="${low}" fill="#211b19"/></g></g>`
      + `<g class="boum-lid${k}"><path d="${lid}" fill="${skin}"/><path d="M${X(-10.4)} ${y(.9)}C${X(-5)} ${y(5.7)} ${X(5)} ${y(5.6)} ${X(11.4)} ${y(.4)}" stroke="#241210" stroke-width="1.6" fill="none" stroke-linecap="round"/><g class="boum-soot"><path d="${lid}" fill="#211b19"/></g></g>`
      + `<path d="M${X(-7)} ${y(-6.4)}C${X(-2)} ${y(-10.4)} ${X(5)} ${y(-10.4)} ${X(9.4)} ${y(-5.6)}" stroke="#8f5a4c" stroke-width=".8" fill="none" opacity=".7"/>`
      + `<path d="M${X(-6)} ${y(6.6)}C${X(-2)} ${y(9.4)} ${X(4)} ${y(9.4)} ${X(8.6)} ${y(5.2)}M${X(-3)} ${y(10)}C${X(1)} ${y(11.6)} ${X(5)} ${y(11)} ${X(8)} ${y(8.4)}" stroke="#8a5446" stroke-width=".8" fill="none" opacity=".6"/>`
      + `<path d="M${X(11.6)} ${y(-2.6)}L${X(15.4)} ${y(-4.6)}M${X(12)} ${y(.2)}L${X(16)} ${y(.4)}M${X(11.4)} ${y(2.8)}L${X(15)} ${y(5)}" stroke="#8a5446" stroke-width=".7" fill="none" opacity=".6" stroke-linecap="round"/>`
      + `</g></g>`;
  };

  // ---------- gauges, vault, small things ----------
  const gauge = (cx, cy, r, cls) => {
    let ticks = '';
    for (let i = 0; i <= 8; i++) {
      const a = (-220 + i * 32.5) * Math.PI / 180;
      ticks += `M${f(cx + Math.cos(a) * r * .62)} ${f(cy + Math.sin(a) * r * .62)}L${f(cx + Math.cos(a) * r * .8)} ${f(cy + Math.sin(a) * r * .8)}`;
    }
    const a1 = 20 * Math.PI / 180, a0 = -20 * Math.PI / 180;
    return `<circle cx="${cx}" cy="${cy}" r="${r + 2.5}" fill="url(#boum-brass)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#e9e1c6"/>`
      + `<path d="M${f(cx + Math.cos(a0) * r * .72)} ${f(cy + Math.sin(a0) * r * .72)}A${f(r * .72)} ${f(r * .72)} 0 0 1 ${f(cx + Math.cos(a1) * r * .72)} ${f(cy + Math.sin(a1) * r * .72)}" stroke="#c4372b" stroke-width="${f(r * .16)}" fill="none"/>`
      + `<path d="${ticks}" stroke="#3a3326" stroke-width=".8"/>`
      + `<g class="${cls}" style="transform-origin:${cx}px ${cy}px"><path d="M${cx} ${f(cy + r * .15)}L${f(cx - r * .7)} ${f(cy - r * .3)}L${cx} ${f(cy - r * .1)}Z" fill="#1b1714"/></g>`
      + `<circle cx="${cx}" cy="${cy}" r="${f(r * .14)}" fill="#3a2f22"/>`
      + `<path d="M${f(cx - r * .7)} ${f(cy - r * .4)}A${r} ${r} 0 0 1 ${f(cx + r * .2)} ${f(cy - r * .82)}" stroke="#fff" stroke-width="1.2" fill="none" opacity=".55"/>`;
  };
  const ell = (cx, cy, rx, ry) => `M${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}Z`;
  let vous = '';
  for (let d = 186; d <= 354; d += 6.5) {
    const a = d * Math.PI / 180;
    vous += `M${f(320 + Math.cos(a) * 350)} ${f(300 + Math.sin(a) * 286)}L${f(320 + Math.cos(a) * 378)} ${f(300 + Math.sin(a) * 314)}`;
  }
  const bub = (cx, cy, r, d, dur) => `<circle class="boum-bub" cx="${cx}" cy="${cy}" r="${r}" style="animation-duration:${dur}s;animation-delay:-${d}s"/>`;

  // ---------- faces ----------
  const FACE = 'M320 66C341 66 355 80 356 100C357 109 356.5 115 355.5 121C354 133 349.5 143 346.5 151C343 160 337 167 331 170.5C327 172.6 313 172.6 309 170.5C303 167 297 160 293.5 151C290.5 143 286 133 284.5 121C283.5 115 283 109 284 100C285 80 299 66 320 66Z';
  const FACE_O = 'M320 66C341 66 355 80 356 100C357 109 356.5 115 355.5 121C354 135 350.5 148 347.5 158C344 169 338 176 332 179.5C327.5 182 312.5 182 308 179.5C302 176 296 169 292.5 158C289.5 148 286 135 284.5 121C283.5 115 283 109 284 100C285 80 299 66 320 66Z';
  const faceShade = (o) => {
    const c = o ? 182 : 172.6;
    return `
    <path d="${o ? FACE_O : FACE}" fill="url(#boum-skin)"/>
    <path d="${o ? FACE_O : FACE}" fill="url(#boum-keyG)"/>
    <path d="${o ? 'M338 70C350 76 356 88 356 100C357 109 356.5 115 355.5 121C354 135 350.5 148 347.5 158C344 169 338 176 332 179.5C327.5 182 322 182.2 320 182.2C331 172 339 158 342 140C346 124 347 107 345 94C344 84 342 76 338 70Z' : 'M338 70C350 76 356 88 356 100C357 109 356.5 115 355.5 121C354 133 349.5 143 346.5 151C343 160 337 167 331 170.5C327 172.6 322 172.8 320 172.8C330 164 338 152 342 138C346 123 347 107 345 94C344 84 342 76 338 70Z'}" fill="#3a1414" opacity=".2"/>
    <g filter="url(#boum-soft3)" fill="#4a1d1b">
      <path d="M288 120C291 134 297 147 305 ${c - 14}C297 ${c - 17} 290 140 286 128Z" opacity=".42"/>
      <path d="M352 120C349 134 343 147 335 ${c - 14}C343 ${c - 17} 350 140 354 128Z" opacity=".5"/>
      <ellipse cx="297.5" cy="136" rx="4.6" ry="10" opacity=".34" transform="rotate(-14 297.5 136)"/>
      <ellipse cx="342.5" cy="136" rx="4.6" ry="10" opacity=".42" transform="rotate(14 342.5 136)"/>
      <ellipse cx="305" cy="112" rx="12" ry="8" opacity=".32"/><ellipse cx="335" cy="112" rx="12" ry="8" opacity=".4"/>
      <ellipse cx="288" cy="100" rx="4" ry="9" opacity=".25"/><ellipse cx="352" cy="100" rx="4" ry="9" opacity=".3"/>
      <ellipse cx="320" cy="${c - 3}" rx="10" ry="3" opacity=".28"/>
    </g>
    <ellipse cx="295.5" cy="124" rx="6" ry="2.6" fill="#fff" opacity=".28" filter="url(#boum-soft1)" transform="rotate(-20 295.5 124)"/>
    <ellipse cx="345" cy="124" rx="4.6" ry="2" fill="#e2d6ff" opacity=".22" filter="url(#boum-soft1)" transform="rotate(20 345 124)"/>
    <ellipse cx="317" cy="${c - 6.6}" rx="5.4" ry="2.4" fill="#fff" opacity=".3" filter="url(#boum-soft1)"/>
    <path d="M320.2 ${c - 5.6}C320.8 ${c - 3.8} 320.8 ${c - 2.4} 320.2 ${c - 1}" stroke="#8a4c40" stroke-width=".8" fill="none" opacity=".45" stroke-linecap="round"/>
    <path d="${o ? 'M345 76C352 84 355.5 94 355.5 104C356 113 355 121 352 135C350 148 347 157 343 165C340 171 337 175 333 178' : 'M345 76C352 84 355.5 94 355.5 104C356 113 355 121 352 133C350 141 347.5 147 345 153C342 159 338.6 164 334 168'}" stroke="#c9b6ff" stroke-width="1.6" fill="none" opacity=".75" stroke-linecap="round"/>
    <path d="M296 77C291 84 288 92 287.5 100" stroke="#d9ffe9" stroke-width="1.2" fill="none" opacity=".45" stroke-linecap="round"/>`;
  };

  // ---------- the SVG ----------
  const svg = `
<defs>
  <linearGradient id="boum-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070d0c"/><stop offset=".5" stop-color="#132320"/><stop offset="1" stop-color="#0a100f"/></linearGradient>
  <pattern id="boum-brick" width="120" height="28" patternUnits="userSpaceOnUse">
    <rect width="120" height="28" fill="#0f0b0a"/>
    <rect x="1" y="1" width="37" height="12" rx="1.5" fill="#3a2923"/><rect x="41" y="1" width="37" height="12" rx="1.5" fill="#30221d"/><rect x="81" y="1" width="37" height="12" rx="1.5" fill="#3d2b24"/>
    <rect x="-19" y="15" width="37" height="12" rx="1.5" fill="#2d201b"/><rect x="21" y="15" width="37" height="12" rx="1.5" fill="#382822"/><rect x="61" y="15" width="37" height="12" rx="1.5" fill="#33241f"/><rect x="101" y="15" width="37" height="12" rx="1.5" fill="#2d201b"/>
    <path d="M2 2H37M42 2H77M82 2H117M22 16H57M62 16H97M102 16H120M0 16H17" stroke="#56423a" stroke-width="1" opacity=".55"/>
    <path d="M2 12.5H37M42 12.5H77M82 12.5H117M22 26.5H57M62 26.5H97M102 26.5H120M0 26.5H17" stroke="#000" stroke-width="1" opacity=".45"/>
  </pattern>
  <pattern id="boum-wind" width="6" height="2.2" patternUnits="userSpaceOnUse"><rect width="6" height="1.2" fill="#ffd2a6" opacity=".35"/><rect y="1.2" width="6" height="1" fill="#3a1606" opacity=".55"/></pattern>
  <radialGradient id="boum-gGreen"><stop offset="0" stop-color="#5dffa8" stop-opacity=".36"/><stop offset=".45" stop-color="#1fc77a" stop-opacity=".2"/><stop offset="1" stop-color="#0a5b3a" stop-opacity="0"/></radialGradient>
  <radialGradient id="boum-gViolet"><stop offset="0" stop-color="#b79bff" stop-opacity=".55"/><stop offset=".5" stop-color="#6d4fd6" stop-opacity=".18"/><stop offset="1" stop-color="#3b1f8a" stop-opacity="0"/></radialGradient>
  <radialGradient id="boum-gWarm"><stop offset="0" stop-color="#fff1c4" stop-opacity=".95"/><stop offset=".25" stop-color="#ffc768" stop-opacity=".5"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
  <radialGradient id="boum-gBack" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#3f6b60" stop-opacity=".55"/><stop offset="1" stop-color="#0e1a17" stop-opacity="0"/></radialGradient>
  <radialGradient id="boum-vig" cx=".5" cy=".48" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></radialGradient>
  <linearGradient id="boum-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".28"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></linearGradient>
  <linearGradient id="boum-arch" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#26443a"/><stop offset=".5" stop-color="#2b201c"/><stop offset="1" stop-color="#3a2c4c"/></linearGradient>
  <linearGradient id="boum-skin" x1="0" y1="0" x2="1" y2=".25"><stop offset="0" stop-color="#f7dcbf"/><stop offset=".5" stop-color="#e2b193"/><stop offset="1" stop-color="#9a6657"/></linearGradient>
  <radialGradient id="boum-keyG" cx=".15" cy=".45" r=".6"><stop offset="0" stop-color="#b8ffd6" stop-opacity=".3"/><stop offset="1" stop-color="#b8ffd6" stop-opacity="0"/></radialGradient>
  <linearGradient id="boum-neck" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e3b598"/><stop offset=".6" stop-color="#b98169"/><stop offset="1" stop-color="#7c4f45"/></linearGradient>
  <linearGradient id="boum-coat" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f2fbf6"/><stop offset=".45" stop-color="#d3e0dc"/><stop offset="1" stop-color="#7f8a99"/></linearGradient>
  <linearGradient id="boum-coatD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9d6d4"/><stop offset="1" stop-color="#6c7686"/></linearGradient>
  <linearGradient id="boum-shirt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9e6ee"/><stop offset="1" stop-color="#8a9bb0"/></linearGradient>
  <linearGradient id="boum-bow" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d23a52"/><stop offset="1" stop-color="#6a1222"/></linearGradient>
  <linearGradient id="boum-hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e2e9ef"/><stop offset="1" stop-color="#a7b3c2"/></linearGradient>
  <linearGradient id="boum-hairD" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#cfd8e2"/><stop offset="1" stop-color="#76839a"/></linearGradient>
  <linearGradient id="boum-gy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe78a"/><stop offset=".5" stop-color="#f5bb28"/><stop offset="1" stop-color="#b47506"/></linearGradient>
  <linearGradient id="boum-gk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7080"/><stop offset=".5" stop-color="#2d2d37"/><stop offset="1" stop-color="#101015"/></linearGradient>
  <radialGradient id="boum-iris" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#d7f6ff"/><stop offset=".45" stop-color="#6fb0d2"/><stop offset="1" stop-color="#244f68"/></radialGradient>
  <linearGradient id="boum-liq" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ffe9"/><stop offset=".25" stop-color="#6dffad"/><stop offset="1" stop-color="#0d9a5c"/></linearGradient>
  <linearGradient id="boum-murk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a876a"/><stop offset="1" stop-color="#3f3b2c"/></linearGradient>
  <linearGradient id="boum-steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7f8c94"/><stop offset=".5" stop-color="#46525a"/><stop offset="1" stop-color="#1f262b"/></linearGradient>
  <linearGradient id="boum-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7ff"/><stop offset=".45" stop-color="#9aa3b8"/><stop offset=".55" stop-color="#4a5266"/><stop offset="1" stop-color="#b9b2e6"/></linearGradient>
  <linearGradient id="boum-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7dc95"/><stop offset=".5" stop-color="#b98a3a"/><stop offset="1" stop-color="#5e3f14"/></linearGradient>
  <linearGradient id="boum-copper" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f2ad74"/><stop offset=".45" stop-color="#b8622f"/><stop offset="1" stop-color="#4a210e"/></linearGradient>
  <linearGradient id="boum-pipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9db3a3"/><stop offset=".45" stop-color="#4e6356"/><stop offset="1" stop-color="#1b2621"/></linearGradient>
  <linearGradient id="boum-pipeV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f5348"/><stop offset=".35" stop-color="#8ea292"/><stop offset="1" stop-color="#1b2621"/></linearGradient>
  <linearGradient id="boum-wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3824"/><stop offset="1" stop-color="#26160d"/></linearGradient>
  <linearGradient id="boum-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b1a"/><stop offset="1" stop-color="#34403e"/></linearGradient>
  <linearGradient id="boum-slate" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#26362f"/><stop offset="1" stop-color="#16201c"/></linearGradient>
  <linearGradient id="boum-flame" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#3f7dff"/><stop offset=".6" stop-color="#7fd6ff" stop-opacity=".85"/><stop offset="1" stop-color="#d9f5ff" stop-opacity="0"/></linearGradient>
  <filter id="boum-soft1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1"/></filter>
  <filter id="boum-soft3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="boum-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="boum-chalk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="1.8"/></filter>
  <clipPath id="boum-clipL"><path d="${almond(305, 114, -1)}"/></clipPath>
  <clipPath id="boum-clipR"><path d="${almond(335, 114, 1)}"/></clipPath>
  <clipPath id="boum-clipF"><path d="M207.8 238.5L186.2 284.2Q183.6 292.6 192 293.2L234 293.2Q242.4 292.6 239.8 284.2L218.2 238.5Z"/></clipPath>
  <clipPath id="boum-clipTA"><rect x="28" y="170" width="16" height="125" rx="8"/></clipPath>
  <clipPath id="boum-clipTB"><rect x="60" y="148" width="16" height="147" rx="8"/></clipPath>
  <clipPath id="boum-clipTC"><rect x="92" y="198" width="16" height="97" rx="8"/></clipPath>
  <clipPath id="boum-clipBk"><path d="M281 258H301L300.5 273Q300 275 297 275H285Q282 275 281.5 273Z"/></clipPath>
</defs>

<!-- ===== back wall: bricks, vault, light ===== -->
<rect width="640" height="400" fill="url(#boum-wall)"/>
<rect width="640" height="400" fill="url(#boum-brick)" opacity=".8"/>
<rect width="640" height="400" fill="url(#boum-gBack)"/>
<ellipse cx="70" cy="230" rx="260" ry="220" fill="url(#boum-gGreen)" class="boum-gpulse"/>
<ellipse cx="560" cy="130" rx="200" ry="170" fill="url(#boum-gViolet)" class="boum-vpulse"/>
<path d="M-20 -20H660V420H-20Z${ell(320, 300, 378, 314)}" fill="#090605" fill-rule="evenodd"/>
<path d="${ell(320, 300, 378, 314)}${ell(320, 300, 350, 286)}" fill="url(#boum-arch)" fill-rule="evenodd"/>
<path d="${vous}" stroke="#0b0706" stroke-width="2"/>
<path d="${ell(320, 300, 351, 287)}" fill="none" stroke="#000" stroke-width="4" opacity=".45"/>
<path d="M40 214C30 160 40 110 66 70" stroke="#7dffbc" stroke-width="2" fill="none" opacity=".25"/>
<path d="M610 196C622 150 612 104 588 70" stroke="#c7b4ff" stroke-width="2" fill="none" opacity=".3"/>

${P('tubes', 'Tubes à bulles', `
  <rect x="8" y="290" width="138" height="9" rx="2" fill="#4b2f1e"/><rect x="8" y="290" width="138" height="2" fill="#7a5236"/>
  <rect x="14" y="118" width="4" height="174" fill="url(#boum-pipeV)"/><rect x="132" y="96" width="4" height="196" fill="url(#boum-pipeV)"/>
  <ellipse cx="72" cy="230" rx="70" ry="90" fill="#46ffa0" opacity=".05" filter="url(#boum-glow)" class="boum-gpulse"/>
  <rect x="26" y="128" width="20" height="168" rx="10" fill="#c8ffe6" opacity=".08" stroke="#cfffe9" stroke-opacity=".45" stroke-width="1.2"/>
  <rect x="28" y="170" width="16" height="125" rx="8" fill="url(#boum-liq)" opacity=".9"/>
  <g clip-path="url(#boum-clipTA)" class="boum-bubs">${bub(33, 290, 2, 0, 2.6)}${bub(39, 285, 1.4, 1.1, 2.1)}${bub(36, 292, 2.4, 1.9, 3)}${bub(41, 288, 1.2, .5, 1.8)}</g>
  <rect x="58" y="106" width="20" height="190" rx="10" fill="#c8f5ff" opacity=".08" stroke="#d6f6ff" stroke-opacity=".45" stroke-width="1.2"/>
  <rect x="60" y="148" width="16" height="147" rx="8" fill="#38e6e0" opacity=".75"/>
  <rect x="60" y="148" width="5" height="147" rx="2.5" fill="#d8fffd" opacity=".35"/>
  <g clip-path="url(#boum-clipTB)" class="boum-bubs">${bub(65, 292, 1.8, .3, 2.4)}${bub(71, 288, 2.4, 1.5, 3.2)}${bub(68, 290, 1.3, 2.2, 2)}</g>
  <rect x="90" y="140" width="20" height="156" rx="10" fill="#fff0c8" opacity=".08" stroke="#ffeec2" stroke-opacity=".45" stroke-width="1.2"/>
  <rect x="92" y="198" width="16" height="97" rx="8" fill="#ffb03a" opacity=".8"/>
  <g clip-path="url(#boum-clipTC)" class="boum-bubs">${bub(97, 292, 1.6, .7, 2.2)}${bub(103, 290, 2.2, 1.6, 2.9)}</g>
  <path d="M29 140V286M61 118V286M93 152V286" stroke="#fff" stroke-width="1.6" opacity=".35" stroke-linecap="round"/>
  <path d="M36 128C36 104 52 92 68 106M100 140C100 118 116 102 128 88" stroke="#d6fff0" stroke-opacity=".55" stroke-width="3" fill="none"/>
  <path d="M36 128C36 104 52 92 68 106M100 140C100 118 116 102 128 88" stroke="#06140f" stroke-opacity=".5" stroke-width="1" fill="none"/>
  <g fill="none" stroke="#d6fff0" stroke-opacity=".6" stroke-width="2.2">${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="128" cy="${92 + i * 8}" rx="11" ry="3.4"/>`).join('')}</g>
  <g fill="none" stroke="#5dffa8" stroke-opacity=".7" stroke-width="1.2" class="boum-gpulse">${[1, 3, 4].map((i) => `<ellipse cx="128" cy="${92 + i * 8}" rx="11" ry="3.4"/>`).join('')}</g>
  <path d="M12 166H50M12 210H50M54 166H82M86 230H114" stroke="#1d2a24" stroke-width="3"/>
`)}

${P('tableau', 'Tableau noir', `
  <path d="M146 176L190 64L262 64" stroke="url(#boum-cone)" stroke-width="0" fill="none"/>
  <path d="M190 78L206 78L262 186L134 186Z" fill="url(#boum-cone)" opacity=".75"/>
  <g transform="rotate(-2.2 198 112)">
    <rect x="126" y="56" width="142" height="110" rx="3" fill="#5a3b22"/>
    <rect x="131" y="61" width="132" height="100" rx="1.5" fill="url(#boum-slate)"/>
    <rect x="131" y="61" width="132" height="100" fill="#000" opacity=".15"/>
    <ellipse cx="236" cy="90" rx="26" ry="10" fill="#dfe8e2" opacity=".07" filter="url(#boum-soft3)"/>
    <ellipse cx="160" cy="140" rx="22" ry="8" fill="#dfe8e2" opacity=".06" filter="url(#boum-soft3)"/>
    <g fill="#eef4ec" font-family="Permanent Marker, cursive" filter="url(#boum-chalk)" opacity=".92">
      <text x="140" y="83" font-size="14">? + ? =</text>
      <text x="144" y="107" font-size="21">BOUM</text>
      <text x="150" y="134" font-size="12.5">débile²</text>
      <text x="138" y="153" font-size="7.6">∫ bêtise · dx = ∞</text>
    </g>
    <g fill="none" stroke="#eef4ec" stroke-width="1.3" stroke-linecap="round" filter="url(#boum-chalk)" opacity=".8">
      <ellipse cx="177" cy="130" rx="33" ry="10.5"/>
      <path d="M144 111C162 113 186 109 204 112"/>
      <path d="M210 100L204 92M214 96L218 88M212 104L222 104" opacity=".8"/>
      <path d="M226 134L232 120H240L246 134Z M226 134H246"/>
      <path d="M236 118V112M232 110L228 104M240 110L244 104M236 108V102"/>
    </g>
    <rect x="128" y="160" width="138" height="6" rx="1.5" fill="#6b4a2c"/>
    <rect x="150" y="157" width="12" height="3.4" rx="1.5" fill="#f2f2ea"/><rect x="170" y="157.6" width="7" height="2.8" rx="1.2" fill="#ffd2e1"/>
    <rect x="226" y="154" width="22" height="6" rx="1.5" fill="#3a3a44"/><rect x="226" y="154" width="22" height="2.5" rx="1" fill="#7a6a58"/>
  </g>
`)}

${P('tuyaux', 'Tuyaux et manomètres', `
  <rect x="-10" y="20" width="660" height="11" fill="url(#boum-pipe)"/>
  <path d="M-10 21.5H650" stroke="#d8ead9" stroke-width="1" opacity=".35"/>
  ${[98, 228, 408, 558].map((x) => `<rect x="${x}" y="17.5" width="8" height="16" rx="1" fill="#33443b"/><rect x="${x}" y="17.5" width="2" height="16" fill="#a8bfae" opacity=".45"/>`).join('')}
  <rect x="103" y="30" width="9" height="34" fill="url(#boum-pipeV)"/>
  ${gauge(107.5, 77, 12, 'boum-needle1')}
  <rect x="600" y="30" width="11" height="290" fill="url(#boum-pipeV)"/>
  <path d="M600 20H611V31H600Z" fill="#3c4e44"/>
  <rect x="597" y="114" width="17" height="7" rx="1.5" fill="#33443b"/>
  ${gauge(605.5, 178, 15, 'boum-needle2')}
  <g class="boum-valve" style="transform-origin:605.5px 236px"><circle cx="605.5" cy="236" r="10" fill="none" stroke="#a13b2c" stroke-width="2.6"/><path d="M595.5 236H615.5M605.5 226V246" stroke="#a13b2c" stroke-width="2"/></g>
  <circle cx="605.5" cy="236" r="2.6" fill="#5a1d14"/>
`)}

${P('ampoules', 'Ampoules', `
  ${[[196, 56, 'boum-bulb1'], [450, 70, 'boum-bulb2']].map(([x, y, c]) => `
    <path d="M${x} 31V${y}" stroke="#151515" stroke-width="1.2"/>
    <circle class="${c}" cx="${x}" cy="${y + 15}" r="36" fill="url(#boum-gWarm)" opacity=".55"/>
    <rect x="${x - 4.5}" y="${y}" width="9" height="8" rx="1" fill="url(#boum-brass)"/>
    <path d="M${x - 4} ${y + 8}C${x - 9} ${y + 12} ${x - 8} ${y + 21} ${x} ${y + 23}C${x + 8} ${y + 21} ${x + 9} ${y + 12} ${x + 4} ${y + 8}Z" fill="#fff4d2" opacity=".9" class="${c}"/>
    <path d="M${x - 2.5} ${y + 10}L${x - 1} ${y + 17}L${x + 1} ${y + 13}L${x + 2.5} ${y + 17}" stroke="#ff9d2e" stroke-width=".9" fill="none"/>
    <path d="M${x - 5} ${y + 12}C${x - 6} ${y + 16} ${x - 4} ${y + 19} ${x - 2} ${y + 20}" stroke="#fff" stroke-width="1" fill="none" opacity=".8"/>`).join('')}
`)}

${P('tesla', 'Bobine Tesla', `
  <circle class="boum-tglow" cx="562" cy="124" r="56" fill="url(#boum-gViolet)"/>
  <rect x="530" y="262" width="64" height="58" rx="3" fill="#2a1d24"/>
  <rect x="530" y="262" width="64" height="4" fill="#5b4560"/>
  <rect x="536" y="276" width="52" height="10" fill="#e5c22e"/>
  <path d="M538 276L544 286M548 276L554 286M558 276L564 286M568 276L574 286M578 276L584 286" stroke="#191512" stroke-width="3.4"/>
  <path d="M558 292L554 302H560L556 312L566 299H560L564 292Z" fill="#e5c22e"/>
  <ellipse cx="562" cy="260" rx="28" ry="5" fill="none" stroke="url(#boum-copper)" stroke-width="2.4"/>
  <ellipse cx="562" cy="260" rx="20" ry="3.6" fill="none" stroke="#c87a44" stroke-width="1.6"/>
  <rect x="548" y="130" width="28" height="130" fill="url(#boum-copper)"/>
  <rect x="548" y="130" width="28" height="130" fill="url(#boum-wind)"/>
  <rect x="551" y="130" width="4" height="130" fill="#ffe0c0" opacity=".35"/>
  <rect x="568" y="130" width="8" height="130" fill="#1c0b05" opacity=".35"/>
  <rect x="573" y="130" width="3" height="130" fill="#c9b6ff" opacity=".45"/>
  <ellipse cx="562" cy="128" rx="35" ry="11" fill="#1d1b2b"/>
  <ellipse cx="562" cy="124" rx="35" ry="11" fill="url(#boum-chrome)"/>
  <ellipse cx="555" cy="120" rx="18" ry="3.2" fill="#fff" opacity=".6"/>
  <circle cx="562" cy="111" r="5" fill="url(#boum-chrome)"/>
  <g class="boum-tsp" fill="none" stroke="#e6dcff" stroke-width="1.1" stroke-linecap="round">
    <path d="M528 120L520 116L515 121L508 117"/><path d="M596 118L603 112L606 118L613 113"/><path d="M570 110L574 100L570 96L575 88"/>
  </g>
`)}

${P('machine', 'Machine', `
  <path d="M532 296C548 300 552 310 548 322M532 306C540 310 542 316 540 324" stroke="#111" stroke-width="3.4" fill="none"/>
  <rect x="434" y="242" width="98" height="80" rx="4" fill="url(#boum-steel)"/>
  <rect x="434" y="242" width="98" height="5" rx="2" fill="#a8b5bd" opacity=".7"/>
  <rect x="434" y="242" width="2.5" height="80" fill="#8dffc4" opacity=".35"/>
  <rect x="529.5" y="242" width="2.5" height="80" fill="#c9b6ff" opacity=".45"/>
  <g fill="#c7d1d8" opacity=".75">${[440, 466, 492, 526].map((x) => `<circle cx="${x}" cy="250" r="1.2"/><circle cx="${x}" cy="314" r="1.2"/>`).join('')}</g>
  <rect x="514.5" y="204" width="7" height="40" fill="url(#boum-steel)"/>
  ${[0, 1, 2].map((i) => `<ellipse cx="518" cy="${238 - i * 6}" rx="7" ry="2.6" fill="#ece6d8"/><ellipse cx="518" cy="${237 - i * 6}" rx="5" ry="1.4" fill="#fff" opacity=".6"/>`).join('')}
  <circle cx="518" cy="197" r="6.5" fill="url(#boum-chrome)"/><circle cx="516" cy="195" r="1.8" fill="#fff" opacity=".85"/>
  ${gauge(511, 290, 12, 'boum-needle3')}
  <circle class="boum-lamp1" cx="526" cy="256" r="2.6" fill="#55ff9a"/><circle class="boum-lamp2" cx="526" cy="265" r="2.6" fill="#ff4a4a"/>
  <rect x="466" y="246" width="50" height="11.5" rx="1.5" fill="#e5c22e"/><rect x="466" y="246" width="50" height="11.5" rx="1.5" fill="none" stroke="#191512" stroke-width="1"/>
  <text x="491" y="254.6" font-size="6" text-anchor="middle" font-family="Archivo Black, sans-serif" fill="#191512" letter-spacing=".2">NE PAS TIRER</text>
  <circle cx="468.6" cy="251.8" r=".8" fill="#191512"/><circle cx="513.4" cy="251.8" r=".8" fill="#191512"/>
  <rect x="458" y="266" width="29" height="43" rx="2" fill="#8a5f34"/>
  <rect x="460.5" y="272" width="24" height="34" fill="#efe8d6"/>
  <rect x="466.5" y="263.5" width="12" height="6" rx="1.2" fill="url(#boum-chrome)"/>
  <path d="M463 277H481M463 281H477M463 300H480M463 303H474" stroke="#9aa3a8" stroke-width=".5"/>
  <text x="463" y="280" font-size="3.8" font-family="Courier Prime, monospace" fill="#2d3a8a">? + ? = ?</text>
  <g stroke="#1d1d1d" stroke-width=".8" fill="none" stroke-linecap="round">
    <path class="boum-sc1" d="M463 286C465 283 467 288 469 284C470 282 472 287 474 284L478 286"/>
    <path class="boum-sc2" d="M463 291C466 288 468 293 471 289L476 292L480 289"/>
    <path class="boum-sc3" d="M464 296L476 296M474.5 294L478 296L474.5 298"/>
  </g>
`)}

${P('cheveux', 'Cheveux', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par0', `
  <g class="boum-hairN">
    <g class="boum-hairL"><g class="boum-hjit">${mass(HB_L, '#8f9bb0')}${locks(HB_L, { fill: 'url(#boum-hairD)', shade: '#4f5b70', hi: .45, hl: '#e6fff1' })}${locks(HF_L, { hl: '#f2fff7' })}</g></g>
    <g class="boum-hairR"><g class="boum-hjit">${mass(HB_R, '#7d7aa0')}${locks(HB_R, { fill: 'url(#boum-hairD)', shade: '#463d66', hi: .3, hl: '#e2d8ff' })}${locks(HF_R, { shade: '#5b5285', hi: .5, hl: '#efe9ff' })}
      ${HF_R.slice(0, 4).map(([M, T, b1, b2, w]) => `<path d="${band(spineOf(M, T, b1, b2), w, .32, .3, 7)}" fill="#c9b6ff" opacity=".5"/>`).join('')}</g></g>
    <g class="boum-soot"><g opacity=".82">${sootL(HB_L)}${sootL(HF_L, '#45403d')}${sootL(HB_R)}${sootL(HF_R, '#45403d')}</g></g>
  </g>
  <g class="boum-hairS"><g class="boum-spk">
    <g filter="url(#boum-glow)" opacity=".8">${sootL(SPK, '#7fe8ff')}</g>
    ${locks(SPK, { shade: '#7aa7c8', hi: .9, line: '#9fd8ff' })}
    <g class="boum-zap" fill="none" stroke="#e8fbff" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M268 30L276 38L272 44L282 50"/><path d="M372 32L364 40L370 45L358 52"/><path d="M314 14L318 22L313 26L320 34"/>
    </g>
  </g></g>
`))}

${P('oreilles', 'Oreilles', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par0', `
  <path d="M289 108C282 101 273 103 273 114C273 124 277 133 284 137C288 139 291 136 291 131Z" fill="url(#boum-skin)"/>
  <path d="M286 110C281 108 277 111 278 117C279 123 282 129 286 131" stroke="#8e5243" stroke-width="1.3" fill="none" opacity=".75"/>
  <path d="M287 115C284 116 284 121 287 123" stroke="#7a4035" stroke-width="1.1" fill="none" opacity=".7"/>
  <ellipse cx="284" cy="133" rx="3" ry="3.4" fill="#e08f80" opacity=".45"/>
  <path d="M286 117L281 113M286 118L280 117M286 119L282 121" stroke="#f4f6f8" stroke-width=".7" opacity=".9"/>
  <path d="M351 108C358 101 367 103 367 114C367 124 363 133 356 137C352 139 349 136 349 131Z" fill="#b57a68"/>
  <path d="M354 110C359 108 363 111 362 117C361 123 358 129 354 131" stroke="#6c3a30" stroke-width="1.3" fill="none" opacity=".75"/>
  <path d="M353 115C356 116 356 121 353 123" stroke="#5d2e26" stroke-width="1.1" fill="none" opacity=".7"/>
  <path d="M364 106C368 110 368 122 364 130" stroke="#c9b6ff" stroke-width="1.3" fill="none" opacity=".7" stroke-linecap="round"/>
  <path d="M354 117L359 113M354 118L360 117M354 119L358 121" stroke="#e6e8f0" stroke-width=".7" opacity=".85"/>
  <g class="boum-soot"><path d="M289 108C282 101 273 103 273 114C273 124 277 133 284 137C288 139 291 136 291 131ZM351 108C358 101 367 103 367 114C367 124 363 133 356 137C352 139 349 136 349 131Z" fill="#241e1c"/></g>
`))}

${P('torse', 'Torse', N('boum-rig boum-breath', `
  <path d="M308 138L307 176C305 186 300 192 294 197H346C340 192 335 186 333 176L332 138Z" fill="url(#boum-neck)"/>
  <ellipse cx="322" cy="177" rx="15" ry="6" fill="#3a1714" opacity=".5" filter="url(#boum-soft3)"/>
  <path d="M311 156C313 168 316 180 318 192M330 156C328 168 325 180 322 192" stroke="#8a5446" stroke-width="1" fill="none" opacity=".5"/>
  <path d="M318 172C320 169 323 170 323 174C323 178 320 180 318 177Z" fill="#f2c9ad" opacity=".55"/>
  <path d="M332 144L333 176C335 184 339 190 343 194" stroke="#c9b6ff" stroke-width="1.2" fill="none" opacity=".55"/>
  <g class="boum-soot"><path d="M308 138L307 176C305 186 300 192 294 197H346C340 192 335 186 333 176L332 138Z" fill="#241e1c" opacity=".85"/></g>
  <path d="M300 190C286 194 271 199 263 208C255 217 250 233 249 252L247 345H393L391 252C390 233 385 217 377 208C369 199 354 194 340 190Z" fill="url(#boum-coat)"/>
  <path d="M300 186L305 181H335L340 186L337 196H303Z" fill="#b8c6c4"/>
  <path d="M305 191L335 191L321 266Z" fill="url(#boum-shirt)"/>
  <path d="M314 191L321 266L326 191" stroke="#7d8ea3" stroke-width=".8" fill="none" opacity=".7"/>
  <circle cx="320.6" cy="226" r="1.3" fill="#eef4f8"/><circle cx="320.9" cy="244" r="1.3" fill="#eef4f8"/>
  <path d="M305 187L299 203L316 199Z" fill="#eef4f6"/><path d="M335 187L341 203L325 199Z" fill="#b7c4cf"/>
  <path d="M305 205C310 214 316 226 320 240" stroke="#000" stroke-width="5" opacity=".08" fill="none" filter="url(#boum-soft1)"/>
  <path d="M320 201L301 193C298 198 298 206 301 211Z" fill="url(#boum-bow)"/>
  <path d="M320 201L339 193C342 198 342 206 339 211Z" fill="#7a1628"/>
  <path d="M303 196L311 199M303 207L311 203M337 196L329 199M337 207L329 203" stroke="#3a0812" stroke-width=".9" opacity=".6"/>
  <g fill="#ffd8de" opacity=".7"><circle cx="305" cy="200" r=".9"/><circle cx="309" cy="204.5" r=".9"/><circle cx="306" cy="207.5" r=".8"/><circle cx="334" cy="200" r=".9"/><circle cx="331" cy="204.5" r=".9"/></g>
  <rect x="316" y="197" width="8.5" height="8.5" rx="2.4" fill="#a62038"/><path d="M317.5 199H323" stroke="#ff8fa0" stroke-width=".8" opacity=".7"/>
  <path d="M303 186C296 196 288 206 281 214L291 217L286 225C297 240 309 255 319 268L321 266L313 214L306 194Z" fill="#f4fcf8"/>
  <path d="M281 214L291 217L286 225" stroke="#9fb0ae" stroke-width=".8" fill="none"/>
  <path d="M286 225C297 240 309 255 319 268" stroke="#000" stroke-width="2.4" opacity=".12" fill="none" filter="url(#boum-soft1)"/>
  <path d="M337 186C344 196 352 206 359 214L349 217L354 225C343 240 331 255 322 269L320 266L327 214L334 194Z" fill="#b2bfc2"/>
  <path d="M359 214L349 217L354 225" stroke="#6e7a86" stroke-width=".8" fill="none"/>
  <path d="M322 269V345" stroke="#7c8896" stroke-width="1.2"/>
  <path d="M322 269C324 290 326 318 326 345" stroke="#000" stroke-width="3" opacity=".1" fill="none"/>
  <circle cx="324" cy="280" r="2.4" fill="#e9eef0" stroke="#8a95a2" stroke-width=".7"/><circle cx="325.2" cy="308" r="2.4" fill="#d9e0e4" stroke="#8a95a2" stroke-width=".7"/>
  <path d="M322 186L326 345H393L391 252C390 233 385 217 377 208C369 199 354 194 340 190Z" fill="#26303f" opacity=".16"/>
  <path d="M262 214C268 240 270 270 268 300M378 214C372 240 370 270 372 300" stroke="#000" stroke-width="5" opacity=".1" fill="none" filter="url(#boum-soft1)"/>
  <path d="M291 284C300 288 312 289 318 288M332 290C344 292 356 290 364 286" stroke="#5f6b78" stroke-width="1.1" fill="none" opacity=".45"/>
  <path d="M390 236C392 260 393 300 393 340" stroke="#c9b6ff" stroke-width="1.6" fill="none" opacity=".6"/>
  <g class="boum-pen1"><rect x="348" y="223" width="4.2" height="20" rx="1.6" fill="#c0392b"/><rect x="348" y="223" width="4.2" height="4" rx="1.6" fill="#7a1d14"/></g>
  <g class="boum-pen2"><rect x="354.5" y="220" width="4.2" height="22" rx="1.6" fill="#2c5fa8"/><rect x="354.5" y="220" width="4.2" height="4" rx="1.6" fill="#173866"/></g>
  <g class="boum-pen3"><rect x="361" y="224" width="4.2" height="19" rx="1.6" fill="#1c1c22"/><rect x="361.6" y="224.6" width="1.2" height="17" fill="#6a6a78"/></g>
  <path d="M344 234L372 235L371 259C362 261 352 260 345 258Z" fill="#c1cccd"/>
  <path d="M344 234L372 235L372 238.5L344 237.5Z" fill="#9aa6ab"/>
  <path d="M345 258C352 260 362 261 371 259" stroke="#6f7a86" stroke-width=".8" fill="none"/>
  <path d="M350 232V243M356.6 232V243M363 232V243" stroke="#d6dde2" stroke-width="1.1" stroke-linecap="round"/>
  <g>
    <path d="M262 296C270 290 282 292 290 300C296 306 294 318 288 324C278 328 266 324 260 316C256 308 258 300 262 296Z" fill="#8a5a35" opacity=".45"/>
    <path d="M266 300C272 296 282 298 286 304C290 310 287 318 281 320C273 322 266 318 263 312C261 307 262 303 266 300Z" fill="#3a2416" opacity=".85"/>
    <ellipse cx="275" cy="308" rx="3.2" ry="2.2" fill="#0d0805"/><ellipse cx="283" cy="314" rx="1.6" ry="1.2" fill="#0d0805"/>
    <path d="M350 196C355 194 360 196 362 200C360 204 354 204 351 201Z" fill="#4a2e1c" opacity=".55"/>
  </g>
  <g class="boum-soot"><g fill="#231d1b" opacity=".75"><path d="M300 192C294 202 290 214 296 222C306 216 312 204 312 194Z"/><path d="M338 194C346 202 352 212 348 222C340 218 334 206 334 196Z"/><ellipse cx="318" cy="236" rx="10" ry="6"/><ellipse cx="356" cy="268" rx="9" ry="5"/></g></g>
`))}

${P('levier', 'Levier', N('boum-rig boum-lever', `
  <path d="M440 296L461.8 204.6" stroke="#1d2328" stroke-width="7.4" stroke-linecap="round"/>
  <path d="M440 296L461.8 204.6" stroke="#6d7880" stroke-width="5.4" stroke-linecap="round"/>
  <path d="M438.2 294L459.6 204.4" stroke="#d3dce2" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
  <path d="M452.5 243.5L458.5 218.3" stroke="#141414" stroke-width="10" stroke-linecap="round"/>
  <path d="M451 242.6L456.6 219" stroke="#3a3a40" stroke-width="2" stroke-linecap="round" opacity=".8"/>
  <circle cx="461.8" cy="204.6" r="6.6" fill="#c4271f"/><circle cx="459.6" cy="202.4" r="2.1" fill="#ffb3a8" opacity=".85"/>
  <circle cx="440" cy="296" r="10" fill="url(#boum-steel)"/><circle cx="440" cy="296" r="10" fill="none" stroke="#11171b" stroke-width="1"/>
  <circle cx="440" cy="296" r="3.2" fill="#c7d1d8"/><circle cx="440" cy="296" r="1.3" fill="#1d2328"/>
`))}

${P('brasG', 'Bras gauche', N('boum-rig boum-uaL', `
  <path d="M362 208C372 204 382 207 388 215C398 233 410 254 420 276C424 287 418 296 409 296C401 296 397 290 393 282C385 266 373 248 364 234Z" fill="url(#boum-coatD)"/>
  <path d="M388 215C398 233 410 254 420 276" stroke="#c9b6ff" stroke-width="1.5" fill="none" opacity=".6"/>
  <path d="M372 232C380 242 386 252 392 262M398 276C402 282 406 286 412 288" stroke="#4f5a68" stroke-width="1.2" fill="none" opacity=".5"/>
  ${N('boum-faL', `
    <path d="M402 292C406 280 414 268 423 258L427 254C433 251 440 254 441 260L437 267C431 277 425 287 419 296C412 300 403 299 402 292Z" fill="url(#boum-coatD)"/>
    <path d="M405 284C411 280 418 280 424 284" stroke="#55606e" stroke-width="1.1" fill="none" opacity=".55"/>
    <path d="M421 256C426 252 435 252 441 258L437 264C433 260 428 259 423 261Z" fill="#9aa6b2"/>
    <path d="M412 296C404 296 402 290 404 286" stroke="#2f3846" stroke-width="2" fill="none" opacity=".4"/>
  `)}
`))}

${P('mainG', 'Main gauche', N('boum-rig boum-uaL boum-faL boum-hdL', `
  <g class="boum-hgrip">${gloves(5, 117.6, 'translate(456 229) rotate(13.4)', '', [-7.7, 13.5])}</g>
  <g class="boum-hpen"><g class="boum-scrib">${gloves(2.2, 148, 'translate(456 229) rotate(16.7)', '<rect x="-2.2" y="-26" width="4.4" height="44" rx="1.8" fill="#1c1c22"/><path d="M-2.2 18L0 25L2.2 18Z" fill="#c9cfd6"/><rect x="-1.2" y="-25" width="1" height="14" fill="#6a6a78"/>')}</g></g>
`))}

${P('brasD', 'Bras droit', N('boum-rig boum-breath boum-uaR', `
  <path d="M266 204C255 210 247 224 244 244C241 262 239 280 241 292C245 300 257 302 263 296C267 282 271 262 277 244C281 232 285 222 285 214Z" fill="url(#boum-coat)"/>
  <path d="M249 230C246 250 244 270 244 288" stroke="#fff" stroke-width="1.6" fill="none" opacity=".55"/>
  <path d="M266 238C262 252 259 268 258 282" stroke="#5b6778" stroke-width="1.2" fill="none" opacity=".45"/>
  ${N('boum-faR', `
    <path d="M241 294C236 284 231 270 227 262L225 258C229 251 240 249 246 253L250 261C254 271 259 282 263 294C257 301 245 301 241 294Z" fill="url(#boum-coat)"/>
    <path d="M226 259C231 252 241 251 246 255L248 260C243 257 234 258 229 263Z" fill="#a9b6b6"/>
    <path d="M247 270C250 276 254 282 258 286" stroke="#5f6b78" stroke-width="1.1" fill="none" opacity=".5"/>
    <path d="M244 296C250 300 258 299 262 294" stroke="#2f3846" stroke-width="2" fill="none" opacity=".35"/>
    <path d="M236 274C240 270 246 272 247 278C244 282 238 281 236 274Z" fill="#3a2416" opacity=".75"/>
    <path d="M233 276C238 266 247 268 250 278C246 286 236 285 233 276Z" fill="#8a5a35" opacity=".35"/>
  `)}
`))}

${P('fiole', 'Fiole', N('boum-rig boum-breath boum-uaR boum-faR boum-hdR', `
  <circle class="boum-fglow" cx="213" cy="268" r="44" fill="url(#boum-gGreen)"/>
  <g clip-path="url(#boum-clipF)">
    <g class="boum-fl">
      <rect x="170" y="256" width="86" height="60" fill="url(#boum-liq)"/>
      <ellipse cx="213" cy="256.5" rx="30" ry="2.6" fill="#effff4" opacity=".9"/>
      <g class="boum-fmurk"><rect x="170" y="256" width="86" height="60" fill="url(#boum-murk)"/><ellipse cx="213" cy="256.5" rx="30" ry="2.6" fill="#a29e7c"/></g>
    </g>
    <g class="boum-fbub">${bub(200, 290, 1.6, 0, 1.6)}${bub(214, 291, 2.2, .6, 2)}${bub(226, 289, 1.4, 1.1, 1.5)}${bub(207, 288, 1.1, .9, 1.3)}${bub(220, 292, 1.8, 1.4, 1.9)}</g>
  </g>
  <path d="M207 188L207 238L185 284Q182 293.5 192 294.2L234 294.2Q244 293.5 241 284L219 238L219 188Z" fill="#d8fff0" opacity=".1" stroke="#dcfff1" stroke-opacity=".75" stroke-width="1.2"/>
  <ellipse cx="213" cy="187.5" rx="8" ry="2.4" fill="none" stroke="#e8fff6" stroke-width="1.6" opacity=".85"/>
  <path d="M210 194V234M201 252L188.5 282" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
  <path d="M232 262H236M234.5 270H239M236.5 278H241" stroke="#dcfff1" stroke-width=".8" opacity=".7"/>
  <g class="boum-fout">${[[213, 184, 1.8, 0], [210, 184, 1.2, .5], [216, 184, 1.4, .9], [212, 184, 1, 1.3]].map(([x, y, r, d]) => `<circle class="boum-fo" cx="${x}" cy="${y}" r="${r}" style="animation-delay:-${d}s"/>`).join('')}</g>
  <g class="boum-puff"><circle cx="213" cy="178" r="7" fill="#9a9a90" filter="url(#boum-soft1)"/><circle cx="208" cy="172" r="5" fill="#a8a89e" filter="url(#boum-soft1)"/><circle cx="218" cy="170" r="4.5" fill="#8f8f86" filter="url(#boum-soft1)"/></g>
`))}

${P('mainD', 'Main droite', N('boum-rig boum-breath boum-uaR boum-faR boum-hdR', gloves(6.4, 120.4, 'translate(213 223) scale(-1 1)')))}

${P('tete', 'Tête', N('boum-rig boum-breath boum-head boum-hidle boum-hlook', `
  <g class="boum-jawC">${faceShade(false)}<g class="boum-soot"><path d="${FACE}" fill="#221c1a"/><ellipse cx="300" cy="95" rx="9" ry="4" fill="#4a4340" opacity=".6"/><ellipse cx="341" cy="128" rx="6" ry="3" fill="#4a4340" opacity=".5"/></g></g>
  <g class="boum-jawO">${faceShade(true)}</g>
  <ellipse cx="308" cy="76" rx="11" ry="5" fill="#fff" opacity=".38" filter="url(#boum-soft1)" transform="rotate(-18 308 76)"/>
  <g class="boum-par1">
    <path d="M302 85C310 82 318 83.5 324 82.5C330 81.5 334 83 339 84.5M300 91C308 88 316 90 322 88.6C329 87.4 334 89 340 90.6M303 97C310 95 316 96.5 321 95.6C327 94.6 332 96 337 97" stroke="#a46b58" stroke-width="1" fill="none" opacity=".6"/>
    <path d="M302 86.4C310 83.4 318 85 324 84M300 92.4C308 89.4 316 91.4 322 90" stroke="#fff3e6" stroke-width=".8" fill="none" opacity=".35"/>
    <ellipse cx="297" cy="80" rx="2.2" ry="1.6" fill="#9a5f45" opacity=".35"/><ellipse cx="344" cy="92" rx="1.8" ry="1.3" fill="#7a4535" opacity=".35"/>
    <path d="M316 107C318 104.5 322 104.5 324 107" stroke="#9a6150" stroke-width=".8" fill="none" opacity=".5"/>
  </g>
`))}

${P('nez', 'Nez', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par3', `
  <path d="M321 106C324 114 327.5 124 329.5 133C330.5 137 329 140.5 326 141.5C324 138 323.5 128 321 106Z" fill="#3a1414" opacity=".22"/>
  <path d="M321 106C322.6 112 324.6 118 326.4 124C327.6 128 328 131 327.6 133" stroke="#8a4c40" stroke-width=".9" fill="none" opacity=".4"/>
  <path d="M317.4 110C316.6 119 316 126 316.4 131" stroke="#fff" stroke-width="1.6" fill="none" opacity=".35" stroke-linecap="round"/>
  <path d="M314.6 136C315 131.5 318 129.6 321.4 129.8C325.4 130 328 132.6 328 136.4C328 140.6 325 143.6 321.4 143.8C317.6 144 314.4 140.6 314.6 136Z" fill="#dea089"/>
  <ellipse cx="324.2" cy="138" rx="3.8" ry="4.4" fill="#b8705f" opacity=".45"/>
  <path d="M315.4 137.4C312 137.6 310.6 140.4 312.2 142.4C313.6 143.6 315.6 143.2 316.6 142" fill="#d39883" stroke="#8a4c40" stroke-width="1"/>
  <path d="M327.2 137.4C330.6 137.6 332 140.4 330.4 142.4C329 143.6 327 143.2 326 142" fill="#ae7462" stroke="#6e3a30" stroke-width="1"/>
  <ellipse cx="316.6" cy="141.8" rx="1.9" ry="1" fill="#3e1a16"/><ellipse cx="326.2" cy="141.8" rx="1.9" ry="1" fill="#3e1a16"/>
  <ellipse cx="319" cy="133.4" rx="1.8" ry="1.2" fill="#fff" opacity=".6"/>
  <ellipse cx="321" cy="146.6" rx="7.5" ry="2.2" fill="#3a1414" opacity=".32" filter="url(#boum-soft1)"/>
  <g class="boum-soot"><path d="M314.6 136C315 131.5 318 129.6 321.4 129.8C325.4 130 328 132.6 328 136.4C328 140.6 325 143.6 321.4 143.8C317.6 144 314.4 140.6 314.6 136Z" fill="#221c1a"/><path d="M315.4 137.4C312 137.6 310.6 140.4 312.2 142.4C313.6 143.6 315.6 143.2 316.6 142ZM327.2 137.4C330.6 137.6 332 140.4 330.4 142.4C329 143.6 327 143.2 326 142Z" fill="#221c1a"/><ellipse cx="319" cy="133.4" rx="1.6" ry="1" fill="#6a6260"/></g>
`))}

${P('yeux', 'Yeux', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par2', eye('L') + eye('R')))}

${P('sourcils', 'Sourcils', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par2', `
  <g class="boum-browL">${locks(BROW_L, { shade: '#4c5566', so: .75, hi: .7, bk: 1 })}</g>
  <g class="boum-browR"><g class="boum-btw">${locks(BROW_R, { shade: '#463d66', so: .8, hi: .55, hl: '#efe9ff', bk: 1 })}</g></g>
  <g class="boum-soot"><g opacity=".7">${sootL(BROW_L.slice(0, 2), '#5b5550', 1)}${sootL(BROW_R.slice(0, 2), '#5b5550', 1)}</g></g>
`))}

${P('bouche', 'Bouche', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par2', `
  <g class="boum-m boum-m-repos">
    <path d="M312 139C305 143.6 301.6 149 302.2 155.4M330 139C337 143 340.6 148 340.2 153.6" stroke="#7a4036" stroke-width="1.4" fill="none" opacity=".7" stroke-linecap="round"/>
    <path d="M302.4 150.4C309 155 331 155.2 339.6 148.6C338 157.8 329 163.6 320.4 163.6C311.4 163.6 304.4 158.4 302.4 150.4Z" fill="#2a0c0c"/>
    <path d="M304.4 151.4C311 155.4 329 155.6 337.4 150L336.4 154.6C328.6 158 312 158 305.8 155Z" fill="#f1e9cf"/>
    <path d="M310.5 154.6V157.4M315.5 155.4V158.2M320.5 155.6V158.4M325.5 155.4V158.2M330.5 154.4V157" stroke="#a89a78" stroke-width=".7"/>
    <path d="M310 160.4C315 161.8 325 161.8 331 158.8L330.2 157.4C324 159.8 315 159.8 310.6 158.6Z" fill="#ded3b5"/>
    <path d="M304.6 156C310 164 330 164.4 337.4 154C335.4 162.6 328 167.6 320 167.6C312 167.6 306.6 162 304.6 156Z" fill="#b06c69"/>
    <path d="M312 164C317 165.4 323 165.4 328 163.8" stroke="#ffd9d0" stroke-width=".9" fill="none" opacity=".55"/>
    <path d="M302.4 149.6C301.4 148.4 300.6 148 299.8 148.6M339.6 147.8C340.6 146.4 341.6 146.2 342.4 146.8" stroke="#7a4036" stroke-width="1" fill="none" stroke-linecap="round"/>
  </g>
  <g class="boum-m boum-m-louche"><g transform="translate(0 4)">
    <path d="M311 137C306 141 304 145 305 150M330 136C336 140 339 143 340 147" stroke="#7a4036" stroke-width="1.2" fill="none" opacity=".6"/>
    <path d="M307 149C314 150.6 324 149.6 333.6 145.6" stroke="#4a1a17" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    <path d="M309 151C315 155.6 325 155 332 148.6C330 155.6 324 158.4 318 158C313 157.6 310 155 309 151Z" fill="#a86663"/>
    <ellipse cx="334.6" cy="147.4" rx="3.3" ry="2.5" fill="#d6646a"/><path d="M334.6 146V148.6" stroke="#9a3a40" stroke-width=".6"/>
  </g></g>
  <g class="boum-m boum-m-rire"><g transform="translate(0 5)">
    <path d="M309 136C302 141 299 147 300 154M331 136C338 141 341 147 340 154" stroke="#7a4036" stroke-width="1.5" fill="none" opacity=".75" stroke-linecap="round"/>
    <path d="M300.5 142C310 147.6 330 147.6 340 141.6C339.6 156 331 167.6 320 167.6C309 167.6 301 156 300.5 142Z" fill="#2a0909"/>
    <path d="M303 143.4C311 148.4 329 148.4 337.6 143L336.6 148C328.6 152.2 311.6 152.2 304 148.4Z" fill="#f1e9cf"/>
    <path d="M309 147.4V150.6M314.6 148.6V151.6M320 149V152M325.4 148.6V151.6M331 147.2V150.4" stroke="#a89a78" stroke-width=".7"/>
    <path d="M307.4 161.4C312 154.4 328 154.4 332.6 161C327.6 166.4 312.4 166.4 307.4 161.4Z" fill="#c4535a"/>
    <path d="M303 156C309 170 331 170 337.4 155C336 167.6 328.6 172.6 320 172.6C311.4 172.6 304.4 167.6 303 156Z" fill="#b06c69"/>
  </g></g>
  <g class="boum-m boum-m-vic"><g transform="translate(0 4)">
    <g class="boum-vA">
      <path d="M304 147C311 151 329 151 337 146.4C335 152.6 327 155.4 320 155.4C312 155.4 306 152.4 304 147Z" fill="#2a0c0c"/>
      <path d="M305.6 148C312 151.4 329 151.4 335.6 147.4L334.8 152.4C328 154.6 312.6 154.6 306.6 152.4Z" fill="#f1e9cf"/>
      <path d="M306.4 150.6H334.6" stroke="#a89a78" stroke-width=".7"/>
      <path d="M305 152.4C311 158.6 330 158.6 336 151.6C333 158.6 327 160.6 320 160.6C313 160.6 307 158.4 305 152.4Z" fill="#9c5d5a"/>
    </g>
    <g class="boum-vB"><ellipse cx="320" cy="151" rx="4.6" ry="4" fill="#160606"/><path d="M315 154.6C318 156.6 322 156.6 325 154.6" stroke="#8a4a46" stroke-width="1.4" fill="none"/></g>
    <g class="boum-vC">
      <path d="M299 144C309 150 331 150 341 143.6C339.6 154.6 330.6 160.6 320 160.6C309.4 160.6 300.4 154.6 299 144Z" fill="#160606"/>
      <path d="M301.4 145.4C310 150.6 330 150.6 338.6 145L337.6 151.2C329 154.8 311 154.8 302.6 151.2Z" fill="#fffbea"/>
      <path d="M307.4 149.6V153.4M313.6 150.8V154.4M326.6 150.8V154.4M332.8 149.4V153" stroke="#b7ad92" stroke-width=".7"/>
      <rect x="318.4" y="150.6" width="3.6" height="4.4" fill="#160606"/>
      <path d="M306 157.2C312 158.8 328 158.8 334 156.6L333.4 155.2C327 157.2 313 157.2 306.8 155.8Z" fill="#efe8d2"/>
    </g>
  </g></g>
  <g class="boum-m boum-m-decu"><g transform="translate(0 4)">
    <path d="M311 137C306 142 304 148 305 154M330 137C335 142 337 148 336 154" stroke="#7a4036" stroke-width="1.2" fill="none" opacity=".55"/>
    <path d="M306 153C312 146.8 328 146.6 335 153" stroke="#4a1a17" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M309.4 153.4C314 150.8 326 150.6 331.4 153.6C329 160 312 160.4 309.4 153.4Z" fill="#a66462"/>
    <path d="M313 155.4C317 154.4 323 154.4 327.4 155.4" stroke="#ffd9d0" stroke-width=".7" fill="none" opacity=".5"/>
    <path d="M315 160.6C318 162 322 162 325 160.6M317 158.6L316 160.6M323 158.6L324 160.6" stroke="#8a5446" stroke-width=".8" fill="none" opacity=".6"/>
  </g></g>
  <g class="boum-m boum-m-surp"><g transform="translate(0 6)">
    <path d="M311 137C305 142 302 148 302 156M329 137C335 142 338 148 338 156" stroke="#7a4036" stroke-width="1.3" fill="none" opacity=".6"/>
    <ellipse cx="320" cy="156" rx="8.4" ry="12" fill="#1d0606"/>
    <path d="M313 148C316 145.4 324 145.4 327 148L326 150.6C323 149 317 149 314 150.6Z" fill="#f1e9cf"/>
    <path d="M314.4 164C317 161 323 161 325.6 164C323 166.4 317 166.4 314.4 164Z" fill="#c4535a"/>
    <path d="M311.6 158C312 167.6 316 170 320 170C324 170 328 167.6 328.4 158C329 168 325.6 172 320 172C314.4 172 311 168 311.6 158Z" fill="#b06c69"/>
  </g></g>
`))}

${P('meches', 'Mèches', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par1', `
  <g class="boum-hairN">
    <g class="boum-hairT"><g class="boum-hjit">${locks(HW, { hi: .9 })}</g></g>
    <g class="boum-hairL"><g class="boum-hjit">${locks(HT_L, { hl: '#f2fff7' })}</g></g>
    <g class="boum-hairR"><g class="boum-hjit">${locks(HT_R, { shade: '#5b5285', hi: .55 })}</g></g>
    <g class="boum-soot"><g opacity=".8">${sootL(HW, '#45403d')}${sootL(HT_L, '#45403d')}${sootL(HT_R, '#45403d')}</g></g>
    <g class="boum-hsm" fill="#8d8a86">
      ${[[296, 64, 0], [322, 58, .7], [348, 66, 1.3], [310, 60, 1.9]].map(([x, y, d]) => `<circle class="boum-sm" cx="${x}" cy="${y}" r="6" filter="url(#boum-soft3)" style="animation-delay:-${d}s"/>`).join('')}
    </g>
  </g>
`))}

${P('binocles', 'Lunettes', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par2', `
  <g data-var="binocles" data-variante="rondes">
    <path d="M296.6 113L285.6 110.4M343.4 113L354.4 110.4" stroke="#b49a62" stroke-width="1.1"/>
    <path d="M313 113.6C315.4 110.2 324.6 110.2 327 113.6" stroke="#d8bf86" stroke-width="1.3" fill="none"/>
    <circle cx="305" cy="115" r="8.3" fill="#e6f6ff" fill-opacity=".07" stroke="#d8bf86" stroke-width="1.3"/>
    <path d="M299.6 111C301 109 303.4 108.2 305.6 108.4" stroke="#fff" stroke-width="1.1" fill="none" opacity=".75"/>
    <g class="boum-magR">
      <circle cx="335" cy="115" r="8.3" fill="#e6f6ff" fill-opacity=".07" stroke="#c7ad74" stroke-width="1.3"/>
      <path d="M329.6 111C331 109 333.4 108.2 335.6 108.4" stroke="#fff" stroke-width="1.1" fill="none" opacity=".75"/>
      <path d="M342.6 114C342.6 118 340.4 121.4 337 122.6" stroke="#c9b6ff" stroke-width=".9" fill="none" opacity=".6"/>
    </g>
  </g>
`))}

${P('lunettes', 'Lunettes de protection', N('boum-rig boum-breath boum-head boum-hidle boum-hlook boum-par2', `
  <g data-var="lunettes" data-variante="front"><g class="boum-gogF">${[84].map((y) => `
    <path d="M284.6 ${y - 3}C296 ${y - 6} 344 ${y - 6} 355.4 ${y - 3}L355.8 ${y + 5}C344 ${y + 2} 296 ${y + 2} 284.2 ${y + 5}Z" fill="#3b302a"/>
    <path d="M285 ${y - 2}C296 ${y - 4.6} 344 ${y - 4.6} 355 ${y - 2}" stroke="#7a6658" stroke-width=".9" fill="none"/>
    <path d="M316 ${y - 1}C318 ${y - 3.4} 322 ${y - 3.4} 324 ${y - 1}" stroke="url(#boum-brass)" stroke-width="3" fill="none"/>
    ${[305, 335].map((x) => `<circle cx="${x}" cy="${y}" r="11.5" fill="#1b2a24"/><circle cx="${x}" cy="${y}" r="9" fill="#5dffa8" fill-opacity=".38"/><circle cx="${x}" cy="${y}" r="10.4" fill="none" stroke="url(#boum-brass)" stroke-width="3"/>
      <path d="M${x - 5.5} ${y - 3.6}C${x - 4} ${y - 6.4} ${x - 1} ${y - 7.4} ${x + 2} ${y - 7}" stroke="#fff" stroke-width="1.6" fill="none" opacity=".85" stroke-linecap="round"/><circle cx="${x + 4.4}" cy="${y + 4}" r="1.1" fill="#fff" opacity=".6"/>`).join('')}`).join('')}</g></g>
  <g data-var="lunettes" data-variante="yeux"><g class="boum-gogE">${[114].map((y) => `
    <path d="M283.6 ${y - 3}C290 ${y - 4} 294 ${y - 4} 296 ${y - 3.6}L296 ${y + 3.6}C294 ${y + 4} 290 ${y + 4} 283.6 ${y + 5}ZM344 ${y - 3.6}C346 ${y - 4} 350 ${y - 4} 356.4 ${y - 3}L356.4 ${y + 5}C350 ${y + 4} 346 ${y + 4} 344 ${y + 3.6}Z" fill="#3b302a"/>
    <path d="M316 ${y - 1}C318 ${y - 3.4} 322 ${y - 3.4} 324 ${y - 1}" stroke="url(#boum-brass)" stroke-width="3" fill="none"/>
    ${[305, 335].map((x) => `<circle cx="${x}" cy="${y}" r="9" fill="#5dffa8" fill-opacity=".2"/><circle cx="${x}" cy="${y}" r="10.4" fill="none" stroke="url(#boum-brass)" stroke-width="3"/><circle cx="${x}" cy="${y}" r="12" fill="none" stroke="#1b2a24" stroke-width="1.2"/>
      <path d="M${x - 5.5} ${y - 3.6}C${x - 4} ${y - 6.4} ${x - 1} ${y - 7.4} ${x + 2} ${y - 7}" stroke="#fff" stroke-width="1.6" fill="none" opacity=".8" stroke-linecap="round"/>`).join('')}`).join('')}</g></g>
`))}

${P('paillasse', 'Paillasse', `
  <rect x="-10" y="310" width="660" height="8" fill="#000" opacity=".35" filter="url(#boum-soft1)"/>
  <path d="M-10 312H650V334H-10Z" fill="url(#boum-top)"/>
  <ellipse cx="200" cy="324" rx="120" ry="7" fill="#5dffa8" opacity=".14" filter="url(#boum-soft3)"/>
  <ellipse cx="520" cy="324" rx="90" ry="6" fill="#b79bff" opacity=".14" filter="url(#boum-soft3)"/>
  <path d="M-10 333.4H650" stroke="#8fb3a6" stroke-width="1.2" opacity=".55"/>
  <rect x="-10" y="334" width="660" height="66" fill="url(#boum-wood)"/>
  <rect x="-10" y="334" width="660" height="5" fill="#000" opacity=".35"/>
  <g fill="none" stroke="#1a0e07" stroke-width="1.6"><rect x="40" y="346" width="170" height="44" rx="2"/><rect x="236" y="346" width="168" height="44" rx="2"/><rect x="430" y="346" width="170" height="44" rx="2"/></g>
  <g fill="none" stroke="#7a5236" stroke-width=".8" opacity=".6"><path d="M41 347H209M237 347H403M431 347H599"/></g>
  ${[125, 320, 515].map((x) => `<rect x="${x - 14}" y="364" width="28" height="6" rx="3" fill="url(#boum-brass)"/>`).join('')}
  <path d="M60 330C70 326 84 327 92 331" stroke="#000" stroke-width="3" opacity=".4" fill="none"/>
`)}

${P('bechers', 'Béchers et brûleur', `
  <ellipse cx="160" cy="331" rx="26" ry="3.4" fill="#000" opacity=".4"/>
  <rect x="140" y="252" width="12" height="78" rx="2" fill="#d8fff0" opacity=".1" stroke="#dcfff1" stroke-opacity=".6"/>
  <rect x="141.5" y="276" width="9" height="53" fill="#9b6bff" opacity=".8"/>
  <path d="M152 262H149M152 272H149M152 282H149M152 292H149M152 302H149" stroke="#e8e8ff" stroke-width=".6" opacity=".7"/>
  <path d="M137.5 330H154.5" stroke="#aab" stroke-width="2"/>
  <circle cx="171" cy="312" r="14" fill="#ff7a3d" opacity=".75"/><path d="M157.4 312A14 14 0 0 0 184.6 312Z" fill="#ff5e2a" opacity=".6"/>
  <circle cx="171" cy="312" r="14" fill="#fff" fill-opacity=".08" stroke="#ffe0d0" stroke-opacity=".7" stroke-width="1.1"/>
  <rect x="166.5" y="284" width="9" height="16" fill="#fff" fill-opacity=".08" stroke="#ffe0d0" stroke-opacity=".7" stroke-width="1.1"/>
  <path d="M164 306C166 302 170 300 174 300" stroke="#fff" stroke-width="1.6" fill="none" opacity=".7"/>
  <ellipse cx="171" cy="327.5" rx="12" ry="3" fill="#a0784a"/>
  <ellipse cx="291" cy="333" rx="22" ry="3" fill="#000" opacity=".4"/>
  <path d="M276 276L270 332M306 276L312 332M291 278V334" stroke="#2f3a40" stroke-width="2.2"/>
  <ellipse cx="291" cy="275.5" rx="17" ry="3.4" fill="none" stroke="#56626a" stroke-width="2"/>
  <path d="M275 274H307" stroke="#8a9aa2" stroke-width="1.6"/>
  <g class="boum-flame"><path d="M291 296C284 289 285 282 291 274C297 282 298 289 291 296Z" fill="url(#boum-flame)"/><path d="M291 294C288 290 288.5 286 291 281C293.5 286 294 290 291 294Z" fill="#c6f3ff" opacity=".9"/></g>
  <rect x="288" y="296" width="6" height="34" rx="1" fill="url(#boum-steel)"/><rect x="287" y="306" width="8" height="4" rx="1" fill="#2f3a40"/>
  <ellipse cx="291" cy="331" rx="11" ry="3.2" fill="#2a3237"/><ellipse cx="291" cy="330" rx="11" ry="2.4" fill="#56626a"/>
  <path d="M280.6 248H301.4L301 272Q300.6 275 297.6 275H284.4Q281.4 275 281 272Z" fill="#fff" fill-opacity=".08" stroke="#e8fff4" stroke-opacity=".75" stroke-width="1.1"/>
  <g clip-path="url(#boum-clipBk)"><rect x="281" y="258" width="20" height="18" fill="#ff9c36" opacity=".85"/><ellipse cx="291" cy="258.4" rx="10" ry="1.4" fill="#ffe0a0"/>
    <g class="boum-bubs">${bub(285, 274, 1.1, 0, 1)}${bub(291, 274, 1.5, .4, 1.2)}${bub(296, 274, 1, .8, .9)}</g></g>
  <path d="M283.4 252V270" stroke="#fff" stroke-width="1.3" opacity=".6"/>
  <path d="M280.6 248L278.6 246" stroke="#e8fff4" stroke-opacity=".75" stroke-width="1.1"/>
  <ellipse cx="550" cy="333" rx="34" ry="3" fill="#000" opacity=".4"/>
  <rect x="518" y="302" width="64" height="7" rx="1.5" fill="#6b4529"/><rect x="518" y="322" width="64" height="9" rx="1.5" fill="#5a3a22"/>
  ${[[528, '#ff4d6d'], [542, '#5dffa8'], [556, '#4cc9f0'], [570, '#ffd23f']].map(([x, c]) => `<rect x="${x - 3.6}" y="290" width="7.2" height="36" rx="3.6" fill="#fff" fill-opacity=".1" stroke="#eef" stroke-opacity=".6"/><rect x="${x - 2.6}" y="308" width="5.2" height="17" rx="2.6" fill="${c}" opacity=".85"/>`).join('')}
  <rect x="518" y="302" width="64" height="2" fill="#a0744d"/>
  <path d="M352 318L400 314L404 330L356 333Z" fill="#e8e2d0"/><path d="M358 321L394 318M359 325L384 323M360 329L396 326" stroke="#7a86a0" stroke-width=".6"/>
  <circle cx="414" cy="327" r="5" fill="#ddd6c2"/><path d="M411 325L415 328L413 330M416 324L417 327" stroke="#9a937f" stroke-width=".6" fill="none"/>
`)}
`;

  // ---------- CSS: stage ----------
  const css = `
.p-boum [class*="boum-"] { transform-box: view-box; }
.p-boum { --lidL: .1; --lidR: .1; --lowL: 0; --lowR: 0; }
.p-boum.mood-louche { --lidL: .6; --lowL: .5; --lidR: .02; }
.p-boum.mood-rire { --lidL: 0; --lidR: 0; }
.p-boum.mood-decu { --lidL: .56; --lidR: .58; --lowL: .15; --lowR: .15; }
.p-boum.mood-surprise { --lidL: 0; --lidR: 0; }
.p-boum.mood-victoire { --lidL: .04; --lidR: .04; --lowL: .2; --lowR: .2; }

.p-boum .boum-rig { transform-origin: 320px 330px; transition: transform .5s cubic-bezier(.2,.8,.3,1); }
.p-boum .boum-breath { transform-origin: 320px 330px; animation: boum-breath 3.6s ease-in-out infinite; }
.p-boum .boum-head, .p-boum .boum-hidle, .p-boum .boum-hlook { transform-origin: 320px 172px; }
.p-boum .boum-head { transition: transform .45s cubic-bezier(.175,.885,.32,1.275); }
.p-boum .boum-hlook { transform: translateX(calc(var(--look) * 2px)) rotate(calc(var(--look) * 2.5deg)); }
.p-boum .boum-par0 { transform: translateX(calc(var(--look) * -1.6px)); }
.p-boum .boum-par1 { transform: translateX(calc(var(--look) * 1.2px)); }
.p-boum .boum-par2 { transform: translateX(calc(var(--look) * 2.6px)); }
.p-boum .boum-par3 { transform: translateX(calc(var(--look) * 4px)); }
.p-boum .boum-uaR { transform-origin: 270px 214px; transition: transform .7s cubic-bezier(.2,.8,.3,1); }
.p-boum .boum-faR { transform-origin: 250px 286px; transition: transform .7s cubic-bezier(.2,.8,.3,1); }
.p-boum .boum-hdR { transform-origin: 213px 223px; transition: transform .6s ease; }
.p-boum .boum-uaL { transform-origin: 372px 214px; }
.p-boum .boum-faL { transform-origin: 412px 280px; }
.p-boum .boum-hdL { transform-origin: 456px 229px; }
.p-boum .boum-scrib { transform-origin: 456px 229px; }
.p-boum .boum-lever { transform-origin: 440px 296px; }
.p-boum .boum-hairL { transform-origin: 292px 106px; transition: transform .8s cubic-bezier(.2,.8,.3,1); }
.p-boum .boum-hairR { transform-origin: 348px 106px; transition: transform .8s cubic-bezier(.2,.8,.3,1); }
.p-boum .boum-hairT { transform-origin: 320px 68px; transition: transform .8s cubic-bezier(.2,.8,.3,1); }
.p-boum .boum-hairL .boum-hjit { transform-origin: 292px 106px; }
.p-boum .boum-hairR .boum-hjit { transform-origin: 348px 106px; }
.p-boum .boum-hairT .boum-hjit { transform-origin: 320px 68px; }
.p-boum .boum-browL { transform-origin: 303px 102px; transition: transform .3s cubic-bezier(.175,.885,.32,1.275); }
.p-boum .boum-browR, .p-boum .boum-btw { transform-origin: 337px 102px; transition: transform .3s cubic-bezier(.175,.885,.32,1.275); }
.p-boum .boum-eyeL, .p-boum .boum-pszL { transform-origin: 305px 113.6px; transition: transform .25s cubic-bezier(.175,.885,.32,1.275); }
.p-boum .boum-eyeR, .p-boum .boum-pszR, .p-boum .boum-magR { transform-origin: 335px 113.6px; transition: transform .3s cubic-bezier(.175,.885,.32,1.275); }
.p-boum .boum-lidL { transform-origin: 305px 105.5px; --lo: var(--lidL); animation: boum-blink 4.3s infinite; }
.p-boum .boum-lidR { transform-origin: 335px 105.5px; --lo: var(--lidR); animation: boum-blink 4.3s infinite; }
.p-boum .boum-lowL { transform-origin: 305px 121.5px; transform: scaleY(var(--lowL)); transition: transform .3s ease; }
.p-boum .boum-lowR { transform-origin: 335px 121.5px; transform: scaleY(var(--lowR)); transition: transform .3s ease; }
.p-boum .boum-plook { transform: translate(calc(var(--look) * 3px), 0); }
.p-boum .boum-dart { transition: transform .3s ease; }
.p-boum .boum-gogF, .p-boum .boum-gogE { transform-origin: 320px 84px; }
.p-boum .boum-spk { transform-origin: 320px 96px; }
.p-boum .boum-fl { transform-origin: 213px 257px; }

/* mouths and jaws per mood */
.p-boum .boum-m, .p-boum .boum-jawO { display: none; }
.p-boum.mood-repos .boum-m-repos, .p-boum.mood-louche .boum-m-louche, .p-boum.mood-rire .boum-m-rire,
.p-boum.mood-victoire .boum-m-vic, .p-boum.mood-decu .boum-m-decu, .p-boum.mood-surprise .boum-m-surp { display: inline; }
.p-boum.mood-rire .boum-jawO, .p-boum.mood-surprise .boum-jawO { display: inline; }
.p-boum.mood-rire .boum-jawC, .p-boum.mood-surprise .boum-jawC { display: none; }

/* hidden bits */
.p-boum .boum-soot, .p-boum .boum-hairS, .p-boum .boum-hpen, .p-boum .boum-fmurk, .p-boum .boum-puff, .p-boum .boum-hsm,
.p-boum .boum-sc1, .p-boum .boum-sc2, .p-boum .boum-sc3 { opacity: 0; }

/* ambient scene life */
.p-boum .boum-bub { fill: #fff; fill-opacity: .2; stroke: #fff; stroke-opacity: .75; stroke-width: .6; animation: boum-rise 2.4s cubic-bezier(.4,0,.8,.7) infinite; }
.p-boum .boum-gpulse { animation: boum-gpulse 2.8s ease-in-out infinite; }
.p-boum .boum-vpulse, .p-boum .boum-tglow { animation: boum-vpulse 1.9s ease-in-out infinite; }
.p-boum .boum-bulb1 { animation: boum-flick 5.3s steps(1) infinite; }
.p-boum .boum-bulb2 { animation: boum-flick 3.7s steps(1) -1.6s infinite; }
.p-boum .boum-tsp { animation: boum-crackle .9s steps(1) infinite; }
.p-boum .boum-needle1 { animation: boum-needle 2.3s ease-in-out infinite; }
.p-boum .boum-needle2 { animation: boum-needle 1.7s ease-in-out -.8s infinite; }
.p-boum .boum-needle3 { animation: boum-needle 1.1s ease-in-out -.3s infinite; }
.p-boum .boum-lamp2 { animation: boum-lamp 1.2s steps(1) infinite; }
.p-boum .boum-flame { transform-origin: 291px 296px; animation: boum-flame .35s ease-in-out infinite alternate; }
.p-boum .boum-fglow { transform-origin: 213px 268px; animation: boum-gpulse 1.6s ease-in-out infinite; transition: opacity 1s; }
.p-boum .boum-fo { fill: none; stroke: #b8ffd2; stroke-width: .7; animation: boum-fout 1.7s ease-out infinite; }
.p-boum .boum-sm { animation: boum-smoke 2.2s ease-out infinite; transform-origin: 320px 60px; }

/* ===== repos: twitchy, never still ===== */
.p-boum.mood-repos .boum-rig { animation: boum-sway 7.4s ease-in-out infinite; }
.p-boum.mood-repos .boum-hidle { animation: boum-hidle 6.3s ease-in-out infinite; }
.p-boum.mood-repos .boum-dart { animation: boum-dart 5.1s ease-in-out infinite; }
.p-boum.mood-repos .boum-btw { animation: boum-btw 5.7s ease-out infinite; }
.p-boum.mood-repos .boum-browR { transform: translateY(-2px) rotate(-4deg); }
.p-boum.mood-repos .boum-faR { animation: boum-swirl 2.6s ease-in-out infinite; }
.p-boum.mood-repos .boum-hdR { animation: boum-swirlH 2.6s ease-in-out -.65s infinite; }
.p-boum.mood-repos .boum-fl { animation: boum-slosh 2.6s ease-in-out -.75s infinite; }
.p-boum.mood-repos .boum-hairL .boum-hjit { animation: boum-hsL 4.1s ease-in-out infinite; }
.p-boum.mood-repos .boum-hairR .boum-hjit { animation: boum-hsR 5.3s ease-in-out infinite; }
.p-boum.mood-repos .boum-hairT .boum-hjit { animation: boum-hsR 3.3s ease-in-out -1s infinite; }

/* ===== louche: peers through the glasses, scribbles a note ===== */
.p-boum.mood-louche .boum-rig { transform: translate(calc(var(--look) * 5px), 2px); }
.p-boum.mood-louche .boum-head { transform: translate(calc(var(--look) * 4px), 3px) rotate(calc(var(--look) * 4deg + 5deg)); }
.p-boum.mood-louche .boum-magR, .p-boum.mood-louche .boum-eyeR { transform: scale(1.3); }
.p-boum.mood-louche .boum-browL { transform: translateY(2.6px) rotate(9deg); }
.p-boum.mood-louche .boum-browR { transform: translateY(-5px) rotate(-6deg); }
.p-boum.mood-louche .boum-uaL { animation: boum-uaLw .6s cubic-bezier(.3,.7,.3,1.1) forwards; }
.p-boum.mood-louche .boum-faL { animation: boum-faLw .6s cubic-bezier(.3,.7,.3,1.1) forwards; }
.p-boum.mood-louche .boum-hdL { animation: boum-hdLw .6s cubic-bezier(.3,.7,.3,1.1) forwards; }
.p-boum.mood-louche .boum-hgrip { animation: boum-off .6s forwards; }
.p-boum.mood-louche .boum-hpen { animation: boum-on .6s forwards; }
.p-boum.mood-louche .boum-pen3 { animation: boum-off .6s forwards; }
.p-boum.mood-louche .boum-scrib { animation: boum-scrib .26s .6s ease-in-out infinite; }
.p-boum.mood-louche .boum-sc1 { animation: boum-on .1s .9s forwards; }
.p-boum.mood-louche .boum-sc2 { animation: boum-on .1s 1.5s forwards; }
.p-boum.mood-louche .boum-sc3 { animation: boum-on .1s 2.1s forwards; }
.p-boum.mood-louche .boum-uaR { transform: rotate(-5deg); }
.p-boum.mood-louche .boum-hidle { animation: boum-peer 3.4s ease-in-out .5s infinite; }
.p-boum.mood-louche .boum-hairL .boum-hjit { animation: boum-lagL .8s cubic-bezier(.3,0,.3,1) .06s, boum-hsL 4.7s ease-in-out .9s infinite; }
.p-boum.mood-louche .boum-hairR .boum-hjit { animation: boum-lagR .8s cubic-bezier(.3,0,.3,1) .1s, boum-hsR 5.9s ease-in-out .9s infinite; }
.p-boum.mood-louche .boum-hairT .boum-hjit { animation: boum-lagL .8s cubic-bezier(.3,0,.3,1) .14s; }
.p-boum.mood-louche .boum-fl { animation: boum-slosh 3.8s ease-in-out infinite; }
.p-boum.mood-louche .boum-faR { transform: rotate(6deg); }

/* ===== rire: head back, maniac cackle ===== */
.p-boum.mood-rire .boum-rig { animation: boum-laugh .3s ease-in-out infinite; }
.p-boum.mood-rire .boum-head { animation: boum-throw .5s cubic-bezier(.175,.885,.32,1.275) forwards; }
.p-boum.mood-rire .boum-hidle { animation: boum-cackle .17s ease-in-out infinite; }
.p-boum.mood-rire .boum-pszL, .p-boum.mood-rire .boum-pszR { transform: scale(.5); }
.p-boum.mood-rire .boum-eyeL, .p-boum.mood-rire .boum-eyeR { transform: scale(1.08); }
.p-boum.mood-rire .boum-browL { transform: translateY(-6px) rotate(5deg); }
.p-boum.mood-rire .boum-browR { transform: translateY(-6px) rotate(-5deg); }
.p-boum.mood-rire .boum-hairL { transform: rotate(16deg) scale(1.1); }
.p-boum.mood-rire .boum-hairR { transform: rotate(-16deg) scale(1.1); }
.p-boum.mood-rire .boum-hairT { transform: scale(1.1, 1.35); }
.p-boum.mood-rire .boum-hjit { animation: boum-jit .13s ease-in-out infinite; }
.p-boum.mood-rire .boum-uaR { animation: boum-uaRup .5s cubic-bezier(.175,.885,.32,1.275) forwards; }
.p-boum.mood-rire .boum-faR { animation: boum-faRup .5s cubic-bezier(.175,.885,.32,1.275) forwards; }
.p-boum.mood-rire .boum-hdR { animation: boum-shake .28s ease-in-out .4s infinite; }
.p-boum.mood-rire .boum-fl { animation: boum-slosh .28s ease-in-out .4s infinite; }
.p-boum.mood-rire .boum-tsp { animation-duration: .3s; }

/* ===== victoire: pulls the lever, BOUM, soot face, proud grin ===== */
.p-boum.mood-victoire .boum-hidle { animation: boum-proud 2.9s ease-in-out 1.4s infinite; }
.p-boum.mood-victoire .boum-hjit { animation: boum-hsL 1.7s ease-in-out 1s infinite; }
.p-boum.mood-victoire .boum-rig { animation: boum-vRig 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-head { animation: boum-vHead 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-lever { animation: boum-pull 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-uaL { animation: boum-uaLp 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-faL { animation: boum-faLp 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-needle3 { animation: boum-slam 3.2s cubic-bezier(.45,0,.55,1) forwards; }
.p-boum.mood-victoire .boum-lamp2 { animation: boum-lamp .22s steps(1) infinite; }
.p-boum.mood-victoire .boum-soot { animation: boum-soot 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-hsm { animation: boum-soot 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-hairL { animation: boum-frizzL 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-hairR { animation: boum-frizzR 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-hairT { animation: boum-frizzT 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-vA { animation: boum-vA 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-vB { animation: boum-vB 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-vC { animation: boum-vC 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-lidL, .p-boum.mood-victoire .boum-lidR { animation: boum-vBlink 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-pszL, .p-boum.mood-victoire .boum-pszR { animation: boum-vPup 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-browL { animation: boum-vBrowL 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-browR { animation: boum-vBrowR 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-uaR { animation: boum-vUaR 3.2s cubic-bezier(.3,0,.3,1) forwards; }
.p-boum.mood-victoire .boum-faR { animation: boum-vFaR 3.2s cubic-bezier(.3,0,.3,1) forwards; }

/* ===== decu: the flask fizzles, everything droops ===== */
.p-boum.mood-decu .boum-rig { animation: boum-dRig 1.2s cubic-bezier(.65,0,.35,1) forwards; }
.p-boum.mood-decu .boum-head { animation: boum-dHead 1.2s cubic-bezier(.65,0,.35,1) .08s both; }
.p-boum.mood-decu .boum-hidle { animation: boum-sigh 4.6s ease-in-out 1.4s infinite; }
.p-boum.mood-decu .boum-hjit { animation: boum-hsL 6.1s ease-in-out 1.5s infinite; }
.p-boum.mood-decu .boum-dart { transform: translate(-.6px, 1.8px); }
.p-boum.mood-decu .boum-browL { transform: translateY(-1px) rotate(-12deg); }
.p-boum.mood-decu .boum-browR { transform: translateY(-1px) rotate(12deg); }
.p-boum.mood-decu .boum-hairL { transform: rotate(-17deg) scale(1, .9); transition: transform 1.1s cubic-bezier(.65,0,.35,1) .18s; }
.p-boum.mood-decu .boum-hairR { transform: rotate(17deg) scale(1, .9); transition: transform 1.1s cubic-bezier(.65,0,.35,1) .24s; }
.p-boum.mood-decu .boum-hairT { transform: rotate(18deg) scale(.9, .7); transition: transform 1.2s cubic-bezier(.65,0,.35,1) .3s; }
.p-boum.mood-decu .boum-uaR { transform: rotate(-7deg); transition: transform 1s cubic-bezier(.65,0,.35,1) .1s; }
.p-boum.mood-decu .boum-faR { transform: rotate(16deg); transition: transform 1s cubic-bezier(.65,0,.35,1) .16s; }
.p-boum.mood-decu .boum-hdR { transform: rotate(-12deg); transition: transform 1s cubic-bezier(.65,0,.35,1) .22s; }
.p-boum.mood-decu .boum-fl { transform: rotate(12deg); transition: transform .6s ease; }
.p-boum.mood-decu .boum-fglow { opacity: .08; animation: none; }
.p-boum.mood-decu .boum-fmurk { opacity: 1; transition: opacity 1.2s .2s; }
.p-boum.mood-decu .boum-fbub, .p-boum.mood-decu .boum-fout { opacity: 0; transition: opacity .6s; }
.p-boum.mood-decu .boum-puff { animation: boum-puff 1.6s .45s ease-out forwards; }

/* ===== surprise: electrified hair, goggles snap down ===== */
.p-boum.mood-surprise .boum-rig { animation: boum-jolt .8s cubic-bezier(.16,1,.3,1) forwards; }
.p-boum.mood-surprise .boum-head { animation: boum-hJolt .8s cubic-bezier(.16,1,.3,1) forwards; }
.p-boum.mood-surprise .boum-hairN { animation: boum-off .8s cubic-bezier(.16,1,.3,1) forwards; }
.p-boum.mood-surprise .boum-hairS { animation: boum-spkIn .8s cubic-bezier(.16,1,.3,1) forwards; }
.p-boum.mood-surprise .boum-spk { animation: boum-spkJit .09s steps(2) infinite; }
.p-boum.mood-surprise .boum-zap { animation: boum-crackle .25s steps(1) infinite; }
.p-boum.mood-surprise .boum-gogF { animation: boum-gogDown .8s cubic-bezier(.16,1,.3,1) forwards; }
.p-boum.mood-surprise .boum-gogE { animation: boum-gogHop .8s cubic-bezier(.16,1,.3,1) forwards; }
.p-boum.mood-surprise .boum-eyeL, .p-boum.mood-surprise .boum-eyeR { transform: scale(1.16); }
.p-boum.mood-surprise .boum-pszL, .p-boum.mood-surprise .boum-pszR { transform: scale(.45); }
.p-boum.mood-surprise .boum-browL { transform: translateY(-9px) rotate(-3deg) scale(1.05); }
.p-boum.mood-surprise .boum-browR { transform: translateY(-9px) rotate(3deg) scale(1.05); }
.p-boum.mood-surprise .boum-faR { animation: boum-jerk .8s cubic-bezier(.16,1,.3,1) forwards; }
.p-boum.mood-surprise .boum-fl { transform: rotate(-14deg); transition: transform .2s; }

/* ===== keyframes ===== */
@keyframes boum-breath { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(-1.4px); } }
@keyframes boum-sway { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(1.8px); } }
@keyframes boum-hidle { 0%, 56%, 100% { transform: rotate(0) translateY(0); } 58% { transform: rotate(-3.5deg) translateY(-1px); } 60% { transform: rotate(2deg); } 62.5% { transform: rotate(-.6deg); } 65% { transform: rotate(0); } 80% { transform: rotate(1.2deg) translateY(.6px); } }
@keyframes boum-dart { 0%, 20% { transform: translate(0, 0); } 22%, 38% { transform: translate(-2.6px, .4px); } 40%, 46% { transform: translate(2.4px, -.6px); } 48%, 68% { transform: translate(1px, 0); } 70%, 100% { transform: translate(0, 0); } }
@keyframes boum-blink { 0%, 90%, 100% { transform: scaleY(var(--lo)); } 93.5% { transform: scaleY(1); } 97% { transform: scaleY(var(--lo)); } }
@keyframes boum-btw { 0%, 68%, 100% { transform: translateY(0); } 70% { transform: translateY(-3.6px) rotate(-5deg); } 75% { transform: translateY(-3px) rotate(-4deg); } 78% { transform: translateY(0); } }
@keyframes boum-swirl { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-2.6deg); } 50% { transform: rotate(.6deg); } 75% { transform: rotate(2.6deg); } }
@keyframes boum-swirlH { 0%, 100% { transform: rotate(0) translate(0, 0); } 25% { transform: rotate(5deg) translate(-1px, 0); } 50% { transform: rotate(0) translate(0, 1px); } 75% { transform: rotate(-5deg) translate(1px, 0); } }
@keyframes boum-slosh { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-7deg); } 50% { transform: rotate(0); } 75% { transform: rotate(7deg); } }
@keyframes boum-hsL { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(2.4deg); } }
@keyframes boum-hsR { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-2.8deg); } }
@keyframes boum-rise { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateY(-140px); opacity: 0; } }
@keyframes boum-gpulse { 0%, 100% { opacity: 1; } 50% { opacity: .72; } }
@keyframes boum-vpulse { 0%, 100% { opacity: .85; } 40% { opacity: 1; } 45% { opacity: .6; } 50% { opacity: 1; } }
@keyframes boum-flick { 0%, 100% { opacity: .95; } 31% { opacity: .35; } 33% { opacity: .9; } 35% { opacity: .45; } 37% { opacity: .95; } 78% { opacity: .7; } 80% { opacity: .95; } }
@keyframes boum-crackle { 0% { opacity: 1; } 18% { opacity: 0; } 46% { opacity: .8; } 52% { opacity: 0; } 80% { opacity: 1; } }
@keyframes boum-needle { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(14deg); } 34% { transform: rotate(9deg); } 60% { transform: rotate(22deg); } 64% { transform: rotate(16deg); } }
@keyframes boum-lamp { 0% { opacity: 1; } 50% { opacity: .2; } }
@keyframes boum-flame { 0% { transform: scale(1, 1); } 100% { transform: scale(.88, 1.12); } }
@keyframes boum-fout { 0% { transform: translate(0, 0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translate(-6px, -34px); opacity: 0; } }
@keyframes boum-smoke { 0% { transform: translate(0, 6px) scale(.6); opacity: 0; } 25% { opacity: .75; } 100% { transform: translate(4px, -26px) scale(1.6); opacity: 0; } }
@keyframes boum-on { 0% { opacity: 0; } 35% { opacity: 0; } 45%, 100% { opacity: 1; } }
@keyframes boum-off { 0%, 35% { opacity: 1; } 45%, 100% { opacity: 0; } }
@keyframes boum-uaLw { 0% { transform: rotate(0); } 22% { transform: rotate(-3deg); } 100% { transform: rotate(2.3deg); } }
@keyframes boum-faLw { 0% { transform: rotate(0); } 22% { transform: rotate(-5deg); } 100% { transform: rotate(38.8deg); } }
@keyframes boum-hdLw { 0% { transform: rotate(0); } 22% { transform: rotate(8deg); } 100% { transform: rotate(-41.1deg); } }
@keyframes boum-scrib { 0% { transform: translate(0, 0); } 25% { transform: translate(2.2px, -1.2px); } 50% { transform: translate(-1.4px, .8px); } 75% { transform: translate(1.6px, .6px); } 100% { transform: translate(0, 0); } }
@keyframes boum-laugh { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.6px); } }
@keyframes boum-throw { 0% { transform: none; } 22% { transform: translateY(2px); } 100% { transform: translateY(-6px) rotate(-5deg) scaleY(.97); } }
@keyframes boum-cackle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(1.6deg) translateY(-.6px); } 75% { transform: rotate(-1.4deg); } }
@keyframes boum-jit { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(1.6deg); } }
@keyframes boum-uaRup { 0% { transform: rotate(0); } 25% { transform: rotate(-4deg); } 100% { transform: rotate(38deg); } }
@keyframes boum-faRup { 0% { transform: rotate(0); } 25% { transform: rotate(4deg); } 100% { transform: rotate(-30deg); } }
@keyframes boum-shake { 0%, 100% { transform: rotate(-9deg); } 50% { transform: rotate(9deg); } }
@keyframes boum-vRig { 0% { transform: none; } 3.75% { transform: translateY(2px); } 11.9% { transform: translateY(1px); animation-timing-function: cubic-bezier(.16,1,.3,1); } 13.1% { transform: translate(5px, -7px) rotate(2deg); } 17% { transform: translate(-1px, 1px) rotate(-.6deg); } 22% { transform: translate(0, 0); } 32% { transform: translateY(1px); } 38%, 100% { transform: translateY(-3px); } }
@keyframes boum-vHead { 0% { transform: none; } 3.75% { transform: translateY(1px) rotate(-2deg); } 11.9% { transform: translateY(2px) rotate(3deg); animation-timing-function: cubic-bezier(.16,1,.3,1); } 14% { transform: translate(3px, -5px) rotate(6deg); } 18% { transform: rotate(-3deg); } 24% { transform: rotate(1deg); } 31% { transform: rotate(0); } 37%, 100% { transform: translateY(-2px) rotate(-4deg); } }
@keyframes boum-pull { 0% { transform: rotate(0); animation-timing-function: cubic-bezier(.2,.7,.3,1); } 3.75% { transform: rotate(-4deg); animation-timing-function: cubic-bezier(.55,0,.9,.6); } 8.6% { transform: rotate(20deg); animation-timing-function: cubic-bezier(.4,.35,.7,.85); } 10.3% { transform: rotate(30deg); animation-timing-function: cubic-bezier(.4,.35,.7,.85); } 11.9% { transform: rotate(40deg); animation-timing-function: cubic-bezier(.2,.7,.3,1); } 13% { transform: rotate(44deg); animation-timing-function: cubic-bezier(.45,0,.55,1); } 14.8% { transform: rotate(38deg); animation-timing-function: cubic-bezier(.45,0,.55,1); } 16.5%, 100% { transform: rotate(40deg); } }
@keyframes boum-uaLp { 0% { transform: rotate(0); animation-timing-function: cubic-bezier(.2,.7,.3,1); } 3.75% { transform: rotate(1.8deg); animation-timing-function: cubic-bezier(.55,0,.9,.6); } 8.6% { transform: rotate(-7.9deg); animation-timing-function: cubic-bezier(.4,.35,.7,.85); } 10.3% { transform: rotate(-11.8deg); animation-timing-function: cubic-bezier(.4,.35,.7,.85); } 11.9% { transform: rotate(-16.3deg); animation-timing-function: cubic-bezier(.2,.7,.3,1); } 13% { transform: rotate(-18.5deg); animation-timing-function: cubic-bezier(.45,0,.55,1); } 14.8% { transform: rotate(-15.3deg); animation-timing-function: cubic-bezier(.45,0,.55,1); } 16.5%, 100% { transform: rotate(-16.3deg); } }
@keyframes boum-faLp { 0% { transform: rotate(0); animation-timing-function: cubic-bezier(.2,.7,.3,1); } 3.75% { transform: rotate(-4.7deg); animation-timing-function: cubic-bezier(.55,0,.9,.6); } 8.6% { transform: rotate(25.4deg); animation-timing-function: cubic-bezier(.4,.35,.7,.85); } 10.3% { transform: rotate(39.7deg); animation-timing-function: cubic-bezier(.4,.35,.7,.85); } 11.9% { transform: rotate(55.9deg); animation-timing-function: cubic-bezier(.2,.7,.3,1); } 13% { transform: rotate(63.5deg); animation-timing-function: cubic-bezier(.45,0,.55,1); } 14.8% { transform: rotate(52.4deg); animation-timing-function: cubic-bezier(.45,0,.55,1); } 16.5%, 100% { transform: rotate(55.9deg); } }
@keyframes boum-slam { 0%, 11% { transform: rotate(0); animation-timing-function: cubic-bezier(.16,1,.3,1); } 13.5% { transform: rotate(112deg); } 16% { transform: rotate(96deg); } 19% { transform: rotate(108deg); } 23% { transform: rotate(101deg); } 30% { transform: rotate(104deg); } 60% { transform: rotate(98deg); } 100% { transform: rotate(103deg); } }
@keyframes boum-soot { 0%, 13% { opacity: 0; } 13.2%, 100% { opacity: 1; } }
@keyframes boum-frizzL { 0%, 13.4% { transform: none; animation-timing-function: cubic-bezier(.16,1,.3,1); } 16% { transform: rotate(14deg) scale(1.22); } 21% { transform: rotate(5deg) scale(1.06); } 100% { transform: rotate(7deg) scale(1.1); } }
@keyframes boum-frizzR { 0%, 13.4% { transform: none; animation-timing-function: cubic-bezier(.16,1,.3,1); } 16.4% { transform: rotate(-14deg) scale(1.22); } 21.5% { transform: rotate(-5deg) scale(1.06); } 100% { transform: rotate(-7deg) scale(1.1); } }
@keyframes boum-frizzT { 0%, 13.4% { transform: none; animation-timing-function: cubic-bezier(.16,1,.3,1); } 16.8% { transform: scale(1.2, 1.5); } 22% { transform: scale(1, 1.1); } 100% { transform: scale(1.06, 1.2); } }
@keyframes boum-vA { 0%, 12.9% { opacity: 1; } 13%, 100% { opacity: 0; } }
@keyframes boum-vB { 0%, 12.9% { opacity: 0; } 13%, 30.9% { opacity: 1; } 31%, 100% { opacity: 0; } }
@keyframes boum-vC { 0%, 30.9% { opacity: 0; } 31%, 100% { opacity: 1; } }
@keyframes boum-vBlink { 0%, 17% { transform: scaleY(var(--lo)); } 19% { transform: scaleY(1); } 21%, 24% { transform: scaleY(var(--lo)); } 26% { transform: scaleY(1); } 28%, 100% { transform: scaleY(var(--lo)); } }
@keyframes boum-vPup { 0%, 13% { transform: scale(1); } 13.5%, 29% { transform: scale(.4); } 34%, 100% { transform: scale(1); } }
@keyframes boum-vBrowL { 0% { transform: none; } 4%, 12% { transform: translateY(2.4px) rotate(9deg); } 13.5%, 29% { transform: translateY(-7px); } 35%, 100% { transform: translateY(-3.5px) rotate(-5deg); } }
@keyframes boum-vBrowR { 0% { transform: none; } 4%, 12% { transform: translateY(2.4px) rotate(-9deg); } 13.5%, 29% { transform: translateY(-7px); } 35%, 100% { transform: translateY(-3.5px) rotate(5deg); } }
@keyframes boum-vUaR { 0%, 31% { transform: rotate(0); } 38% { transform: rotate(30deg); } 42%, 100% { transform: rotate(26deg); } }
@keyframes boum-vFaR { 0%, 31% { transform: rotate(0); } 38% { transform: rotate(-30deg); } 42%, 100% { transform: rotate(-26deg); } }
@keyframes boum-proud { 0%, 100% { transform: rotate(0) translateY(0); } 50% { transform: rotate(-1.2deg) translateY(-.8px); } }
@keyframes boum-peer { 0%, 100% { transform: translateX(0) rotate(0); } 35% { transform: translateX(1.4px) rotate(1.3deg); } 70% { transform: translateX(-.8px) rotate(-.7deg); } }
@keyframes boum-lagL { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-4deg); } 62% { transform: rotate(1.6deg); } 82% { transform: rotate(-.5deg); } }
@keyframes boum-lagR { 0%, 100% { transform: rotate(0); } 30% { transform: rotate(-3.2deg); } 62% { transform: rotate(1.3deg); } 82% { transform: rotate(-.4deg); } }
@keyframes boum-dRig { 0% { transform: none; animation-timing-function: cubic-bezier(.2,.7,.3,1); } 14% { transform: translateY(-2.2px); } 100% { transform: translateY(5px); } }
@keyframes boum-dHead { 0% { transform: none; animation-timing-function: cubic-bezier(.2,.7,.3,1); } 14% { transform: translateY(-1.4px) rotate(-1.6deg); } 100% { transform: translateY(4px) rotate(5deg); } }
@keyframes boum-sigh { 0%, 100% { transform: translateY(0) rotate(0); } 40% { transform: translateY(-1.3px) rotate(-.8deg); } 62% { transform: translateY(.9px) rotate(.7deg); } }
@keyframes boum-puff { 0% { transform: translate(0, 4px) scale(.4); opacity: 0; } 20% { opacity: .9; } 100% { transform: translate(-6px, -26px) scale(1.7); opacity: 0; } }
@keyframes boum-jolt { 0% { transform: none; } 10% { transform: translateY(3px) scale(1, .985); } 20% { transform: translateY(-10px) scale(1, 1.015); } 30% { transform: translateY(-5px); } 42% { transform: translateY(-7px); } 100% { transform: translateY(-6px); } }
@keyframes boum-hJolt { 0% { transform: none; } 10% { transform: translateY(2px); } 20% { transform: translateY(-6px) rotate(-2deg); } 40% { transform: translateY(-4px); } 100% { transform: translateY(-4px) rotate(-1deg); } }
@keyframes boum-spkIn { 0%, 11% { opacity: 0; transform: scale(.4, .25); } 20% { opacity: 1; transform: scale(1.08, 1.28); } 30% { transform: scale(1, .92); } 42% { transform: scale(1, 1.05); } 100% { opacity: 1; transform: scale(1, 1); } }
@keyframes boum-spkJit { 0% { transform: translate(-.6px, 0) rotate(-.5deg); } 100% { transform: translate(.6px, -.4px) rotate(.5deg); } }
@keyframes boum-gogDown { 0%, 10% { transform: translateY(0); } 16% { transform: translateY(-4px); animation-timing-function: cubic-bezier(.6,0,.9,.5); } 26% { transform: translateY(33px); } 34% { transform: translateY(28px); } 42% { transform: translateY(31px); } 52%, 100% { transform: translateY(30px); } }
@keyframes boum-gogHop { 0%, 10% { transform: translateY(0); } 22% { transform: translateY(-8px); } 34% { transform: translateY(1.5px); } 44%, 100% { transform: translateY(0); } }
@keyframes boum-jerk { 0%, 10% { transform: rotate(0); } 22% { transform: rotate(-18deg); } 40% { transform: rotate(-6deg); } 55% { transform: rotate(-11deg); } 100% { transform: rotate(-9deg); } }
`;

  const worldCss = `
.ui-boum { container-type: inline-size; background: radial-gradient(120% 90% at 50% 0%, #19332c 0%, #0c1513 58%, #070c0b 100%); color: #eaf6ef; font: 500 15px/1.35 Barlow, system-ui, sans-serif; padding: 16px; }
.ui-boum .ui-boum-scr { display: grid; gap: 14px; position: relative; }
.ui-boum .ui-boum-scr::before { content: ""; position: absolute; inset: -16px; pointer-events: none; opacity: .5;
  background-image: linear-gradient(rgba(93,255,168,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(93,255,168,.05) 1px, transparent 1px); background-size: 22px 22px; }
.ui-boum .ui-boum-top { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 14px; position: relative; }
.ui-boum .ui-boum-board { position: relative; background: radial-gradient(60% 80% at 80% 30%, rgba(255,255,255,.06), transparent 70%), linear-gradient(135deg, #26362f, #17211d); border: 8px solid #6b4a2b; border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.4), 0 8px 22px rgba(0,0,0,.45); padding: 10px 16px 14px; overflow: hidden; }
.ui-boum .ui-boum-meta { display: flex; justify-content: space-between; gap: 10px; font: 400 15px/1 'Bebas Neue', sans-serif; letter-spacing: .08em; color: #9fe7c2; }
.ui-boum .ui-boum-q { margin: 6px 0 0; font: 400 clamp(19px, 2.6vw, 27px)/1.25 'Permanent Marker', cursive; color: #f1f6ee; text-shadow: 0 0 1px #fff, 0 0 8px rgba(255,255,255,.18); animation: boum-ui-chalk .9s ease-out both; }
.ui-boum .ui-boum-doodle { position: absolute; right: 12px; bottom: 6px; font: 400 13px/1 'Permanent Marker', cursive; color: rgba(241,246,238,.38); transform: rotate(-6deg); }
.ui-boum .ui-boum-timer { display: grid; justify-items: center; align-content: center; background: linear-gradient(160deg, #2a3530, #141c19); border: 3px solid #b98a3a; border-radius: 18px; padding: 8px; box-shadow: 0 8px 22px rgba(0,0,0,.45), inset 0 0 18px rgba(93,255,168,.12); }
.ui-boum .ui-boum-timer svg { width: 110px; height: auto; display: block; }
.ui-boum .ui-boum-timer b { font: 400 30px/1 'Bebas Neue', sans-serif; letter-spacing: .04em; color: #ffd23f; margin-top: -4px; }
.ui-boum .ui-boum-timer span { font: 700 11px/1 Barlow, sans-serif; text-transform: uppercase; letter-spacing: .16em; color: #9fe7c2; }
.ui-boum .ui-boum-needle { transform-box: view-box; transform-origin: 60px 70px; animation: boum-ui-tick 12s steps(24) infinite; }
.ui-boum .ui-boum-duel { display: grid; grid-template-columns: minmax(0, 1fr) 70px minmax(0, 1fr); gap: 12px; align-items: start; position: relative; }
.ui-boum .ui-boum-col { display: grid; gap: 8px; justify-items: center; position: relative; }
.ui-boum .ui-boum-colA { animation: boum-ui-in .7s .1s cubic-bezier(.175,.885,.32,1.275) both; --tilt: -2.5deg; }
.ui-boum .ui-boum-colB { animation: boum-ui-in .7s .28s cubic-bezier(.175,.885,.32,1.275) both; --tilt: 2deg; }
.ui-boum .ui-boum-face { position: absolute; top: -8px; right: 10%; width: 34px; height: 34px; z-index: 3; filter: drop-shadow(0 3px 4px rgba(0,0,0,.5)); animation: boum-ui-bob 2.4s ease-in-out infinite; }
.ui-boum .ui-boum-colB .ui-boum-face { animation-delay: -1.2s; }
.ui-boum .ui-boum-jar { margin: 0; width: min(100%, 330px); position: relative; transform: rotate(var(--tilt)); }
.ui-boum .ui-boum-lid { width: 62%; height: 20px; margin: 0 auto -3px; position: relative; z-index: 2; border-radius: 5px 5px 2px 2px; background: repeating-linear-gradient(90deg, rgba(0,0,0,.18) 0 3px, transparent 3px 7px), linear-gradient(#f2d48a, #9a6d26); box-shadow: 0 2px 0 #5e3f14; display: grid; place-items: center; }
.ui-boum .ui-boum-lid span { font: 400 11px/1 'Archivo Black', sans-serif; letter-spacing: .14em; text-transform: uppercase; color: #2b1d07; }
.ui-boum .ui-boum-glass { position: relative; min-height: 150px; border-radius: 16px 16px 30px 30px; padding: 14px 14px 22px; display: grid; place-items: center; overflow: hidden;
  background: linear-gradient(90deg, rgba(255,255,255,.2), rgba(255,255,255,.04) 22%, rgba(255,255,255,.02) 72%, rgba(255,255,255,.14)), linear-gradient(180deg, rgba(93,255,168,0) 62%, rgba(93,255,168,.38) 63%, rgba(20,150,92,.55));
  border: 2px solid rgba(200,255,230,.4); box-shadow: inset 0 0 22px rgba(93,255,168,.15), 0 10px 24px rgba(0,0,0,.45); }
.ui-boum .ui-boum-pic { width: 100%; max-width: 220px; height: auto; border-radius: 6px; transform: rotate(-3deg); box-shadow: 0 4px 10px rgba(0,0,0,.35); position: relative; z-index: 1; }
.ui-boum .ui-boum-ans { margin: 0; position: relative; z-index: 1; background: #fdf8ea; color: #22302a; padding: 14px 16px; border-radius: 4px; transform: rotate(2.5deg); box-shadow: 0 4px 10px rgba(0,0,0,.35); font: 400 clamp(17px, 2.2vw, 22px)/1.25 'Permanent Marker', cursive; text-align: center; max-width: 250px; }
.ui-boum .ui-boum-glass i { position: absolute; bottom: 12px; width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid rgba(220,255,235,.8); animation: boum-ui-bub 2.2s linear infinite; }
.ui-boum .ui-boum-b1 { left: 22%; } .ui-boum .ui-boum-b2 { left: 70%; animation-delay: -1.1s !important; }
.ui-boum figcaption { margin: -12px auto 0; position: relative; z-index: 2; width: max-content; max-width: 90%; background: #f4ecd2; color: #2a2316; border: 1px solid #c9b98a; padding: 4px 12px 5px; transform: rotate(calc(var(--tilt) * -1.5)); box-shadow: 0 3px 6px rgba(0,0,0,.35); font: 400 13px/1.2 'Special Elite', monospace; display: flex; gap: 8px; align-items: baseline; }
.ui-boum figcaption b { font: 400 12px/1 'Archivo Black', sans-serif; text-transform: uppercase; letter-spacing: .06em; }
.ui-boum .ui-boum-stamp { position: absolute; right: -6px; top: 26px; z-index: 12; font: 400 30px/1 'Archivo Black', sans-serif; letter-spacing: .04em; color: #ff4a3a; border: 4px solid #ff4a3a; border-radius: 8px; padding: 6px 10px 4px; background: rgba(40,8,6,.25); transform: rotate(-12deg); animation: boum-ui-slam .55s .65s cubic-bezier(.175,.885,.32,1.275) both; text-shadow: 0 0 10px rgba(255,74,58,.6); }
.ui-boum .ui-boum-thermo { width: min(100%, 300px); display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.ui-boum .ui-boum-tube { position: relative; height: 16px; border-radius: 99px; background: rgba(255,255,255,.08); border: 2px solid rgba(220,255,235,.45); overflow: hidden; }
.ui-boum .ui-boum-tube::before { content: ""; position: absolute; left: -2px; top: 50%; width: 22px; height: 22px; margin-top: -11px; border-radius: 50%; background: #ff5a4a; }
.ui-boum .ui-boum-tube i { position: absolute; inset: 0; transform-origin: left center; transform: scaleX(var(--v)); background: linear-gradient(90deg, #ff5a4a, #ffb03a 70%, #ffe27a); animation: boum-ui-fill 1.1s .3s cubic-bezier(.2,.8,.3,1) both; }
.ui-boum .ui-boum-thermo span { font: 400 15px/1 'Bebas Neue', sans-serif; letter-spacing: .06em; color: #cfe9dc; }
.ui-boum .ui-boum-thermo b { font-size: 24px; color: #fff; margin-right: 2px; }
.ui-boum .ui-boum-hot b { color: #ffd23f; }
.ui-boum .ui-boum-vs { display: grid; justify-items: center; gap: 2px; padding-top: 70px; }
.ui-boum .ui-boum-vs svg { width: 34px; height: auto; animation: boum-ui-zap 1.6s steps(1) infinite; filter: drop-shadow(0 0 8px rgba(255,210,63,.6)); }
.ui-boum .ui-boum-vs span { font: 400 26px/1 'Bebas Neue', sans-serif; letter-spacing: .08em; color: #ffd23f; }
.ui-boum .ui-boum-foot { display: flex; flex-wrap: wrap; gap: 12px 16px; align-items: center; justify-content: space-between; position: relative; }
.ui-boum .ui-boum-players { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.ui-boum .ui-boum-players li { position: relative; display: flex; align-items: center; gap: 7px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 99px; padding: 4px 12px 4px 4px; font: 700 13px/1 Barlow, sans-serif; margin-top: 14px; }
.ui-boum .ui-boum-players li i { width: 26px; height: 26px; border-radius: 50%; background: var(--c); color: #0c1513; display: grid; place-items: center; font: 400 12px/1 'Archivo Black', sans-serif; font-style: normal; box-shadow: inset 0 -3px 0 rgba(0,0,0,.25); }
.ui-boum .ui-boum-players li em { position: absolute; left: 50%; top: -15px; transform: translateX(-50%) rotate(-4deg); font: 400 11px/1 'Permanent Marker', cursive; font-style: normal; color: #0c1513; background: var(--c); padding: 3px 6px; border-radius: 8px; white-space: nowrap; }
.ui-boum .ui-boum-note { background: #ffe27a; color: #2a2316; padding: 8px 12px; transform: rotate(2.5deg); box-shadow: 0 4px 10px rgba(0,0,0,.4); font: 400 13px/1.3 'Special Elite', monospace; position: relative; }
.ui-boum .ui-boum-note::before { content: ""; position: absolute; top: -7px; left: 50%; width: 46px; height: 12px; margin-left: -23px; background: rgba(255,255,255,.45); transform: rotate(-4deg); }
.ui-boum .ui-boum-note b { font-family: 'Archivo Black', sans-serif; font-weight: 400; }
.ui-boum .ui-boum-btn { font: 400 15px/1 'Archivo Black', sans-serif; text-transform: uppercase; letter-spacing: .06em; color: #0c1513; background: linear-gradient(#7dffbc, #2fd487); border: 0; border-radius: 12px; padding: 13px 18px; box-shadow: 0 5px 0 #127a4b, 0 10px 20px rgba(0,0,0,.4); cursor: pointer; }
.ui-boum .ui-boum-btn:active { transform: translateY(3px); box-shadow: 0 2px 0 #127a4b; }
@container (max-width: 640px) {
  .ui-boum .ui-boum-q { font-size: 19px; overflow-wrap: anywhere; }
  .ui-boum .ui-boum-meta { font-size: 13px; }
  .ui-boum .ui-boum-jar { width: 100%; justify-self: center; }
  .ui-boum .ui-boum-thermo { width: 100%; }
  .ui-boum .ui-boum-top { grid-template-columns: 1fr; }
  .ui-boum .ui-boum-timer { grid-template-columns: auto auto auto; justify-content: center; align-items: center; gap: 10px; padding: 6px 12px; }
  .ui-boum .ui-boum-timer svg { width: 70px; }
  .ui-boum .ui-boum-duel { grid-template-columns: 1fr; }
  .ui-boum .ui-boum-vs { padding-top: 0; grid-auto-flow: column; align-items: center; gap: 8px; }
  .ui-boum .ui-boum-vs svg { width: 18px; }
  .ui-boum .ui-boum-stamp { font-size: 24px; right: 0; }
}
@keyframes boum-ui-in { 0% { opacity: 0; transform: translateY(-40px) rotate(-6deg) scale(.9); } 100% { opacity: 1; transform: none; } }
@keyframes boum-ui-slam { 0% { opacity: 0; transform: rotate(-30deg) scale(3); } 60% { opacity: 1; transform: rotate(-10deg) scale(.92); } 100% { opacity: 1; transform: rotate(-12deg) scale(1); } }
@keyframes boum-ui-tick { 0% { transform: rotate(-80deg); } 100% { transform: rotate(80deg); } }
@keyframes boum-ui-fill { 0% { transform: scaleX(0); } 100% { transform: scaleX(var(--v)); } }
@keyframes boum-ui-bub { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-60px); opacity: 0; } }
@keyframes boum-ui-zap { 0%, 100% { opacity: 1; } 47% { opacity: .3; } 50% { opacity: 1; } 53% { opacity: .5; } }
@keyframes boum-ui-bob { 0%, 100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-4px) rotate(4deg); } }
@keyframes boum-ui-chalk { 0% { opacity: 0; filter: blur(2px); } 100% { opacity: 1; filter: none; } }
`;

  export const boum: Persona = {
    id: 'boum',
    name: 'Professeur Boum',
    svg,
    css,
    variants: [
      { famille: 'lunettes', nom: 'Lunettes de protection', choix: [['front', 'Sur le front'], ['yeux', 'Sur les yeux'], ['aucune', 'Aucune']] },
      { famille: 'binocles', nom: 'Binocles', choix: [['rondes', 'Petites lunettes rondes'], ['sans', 'Sans']] },
      { famille: 'gants', nom: 'Gants', choix: [['jaunes', 'Jaunes'], ['noirs', 'Noirs']] },
    ],
    moodLabels: { repos: 'Il trépigne', louche: 'Il prend des notes', rire: 'Rire de savant fou', victoire: 'BOUM !', decu: 'Pschitt…', surprise: 'Électrocuté !' },
    react: 'surprise',
    moments: [
      ['La question tombe', 'surprise'],
      ['On prépare', 'louche'],
      ['Révélation', 'victoire', [{ type: 'confetti', n: 90, colors: ['#5dffa8', '#ffd23f', '#b79bff', '#4cc9f0', '#ffffff'], delay: 600 }, { type: 'stars', at: [320, 120], n: 22, delay: 1000 }]],
      ['Égalité', 'decu'],
    ],
    ambient: [
      { type: 'arc', from: [530, 125], to: [519, 191], every: 1700, color: '196,176,255' },
      { type: 'arc', from: [596, 120], to: [606, 160], every: 2900, color: '196,176,255' },
      { type: 'bubbles', from: [291, 256], density: .6, color: '255,220,160' },
      { type: 'smoke', from: [291, 246], density: .55, size: .7, speed: .8, alpha: .14, color: '220,240,230' },
      { type: 'smoke', from: [598, 117], density: .35, size: .6, alpha: .12, color: '210,220,215' },
      { type: 'dust', box: [150, 80, 100, 110], density: .5, color: '255,236,190' },
    ],
    bursts: {
      louche: [{ type: 'stars', at: [446, 286], n: 6, color: '255,240,200', delay: 900 }],
      rire: [
        { type: 'arc', from: [530, 122], to: [398, 46], life: .45 },
        { type: 'sparks', at: [398, 48], n: 16, power: .6, color: '210,195,255' },
        { type: 'arc', from: [528, 126], to: [519, 191], life: .4, delay: 450 },
        { type: 'arc', from: [530, 120], to: [404, 82], life: .45, delay: 900 },
        { type: 'sparks', at: [404, 82], n: 14, power: .6, color: '210,195,255', delay: 900 },
        { type: 'arc', from: [596, 118], to: [606, 160], life: .4, delay: 1300 },
        { type: 'arc', from: [530, 122], to: [398, 46], life: .45, delay: 1800 },
        { type: 'arc', from: [528, 126], to: [519, 191], life: .4, delay: 2300 },
      ],
      victoire: [
        { type: 'sparks', at: [496, 252], n: 26, power: .7, color: '255,230,140', delay: 300 },
        { type: 'flash', delay: 420 },
        { type: 'shake', delay: 420 },
        { type: 'smoke', at: [470, 240], n: 26, alpha: .55, color: '70,66,62', delay: 420 },
        { type: 'smoke', at: [330, 120], n: 18, alpha: .5, color: '60,56,52', delay: 430 },
        { type: 'sparks', at: [470, 240], n: 60, power: 1.2, color: '255,190,90', delay: 420 },
        { type: 'arc', from: [530, 122], to: [470, 236], life: .5, delay: 400 },
        { type: 'smoke', at: [320, 52], n: 8, alpha: .3, color: '120,116,110', delay: 900 },
        { type: 'lines', at: [320, 130], n: 24, color: '255,240,200', delay: 1000 },
      ],
      decu: [{ type: 'smoke', at: [210, 200], n: 6, alpha: .3, color: '150,150,140', delay: 500 }],
      surprise: [
        { type: 'lines', at: [320, 110], n: 26, delay: 100 },
        { type: 'sparks', at: [320, 40], n: 30, power: .8, color: '170,235,255', delay: 120 },
        { type: 'arc', from: [276, 34], to: [318, 14], life: .35, color: '170,235,255', delay: 160 },
        { type: 'arc', from: [330, 14], to: [372, 34], life: .35, color: '170,235,255', delay: 420 },
        { type: 'bubbles', at: [213, 186], n: 12, delay: 200 },
        { type: 'arc', from: [262, 54], to: [300, 22], life: .3, color: '170,235,255', delay: 700 },
      ],
    },
    moodMs: 3200,
    worldCss,
  };
