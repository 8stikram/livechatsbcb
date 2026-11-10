// @ts-nocheck - the drawing is built by untyped helper code ported unchanged from docs/persos; only the exported object is typed (Persona).
import type { Persona } from '../persona';
// Madame Boule, voyante de « Qui est l'image ? ». Scène : l'intérieur de sa tente.
  const R = (n) => Math.round(n * 10) / 10;
  const P = (x, y) => `${R(x)} ${R(y)}`;
  // Mirror a path around x = 320 (only absolute coordinate pairs, no arcs).
  const mx = (d) => { let i = 0; return d.replace(/-?\d*\.?\d+/g, (n) => (i++ % 2 === 0 ? String(R(640 - Number(n))) : n)); };
  const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
  const rnd = (i) => { const s = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return s - Math.floor(s); };
  const bez = (t, a, b, c, d) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
  const MIR = 'transform="matrix(-1 0 0 1 640 0)"';

  // ---------- fingers and hands (drawn in a local frame: wrist at 0,0, fingers along +x, thumb on -y) ----------
  function finger(x, y, a, len, w, bend = 0) {
    const r = a * Math.PI / 180, dx = Math.cos(r), dy = Math.sin(r), nx = -dy, ny = dx;
    const bw = w / 2, tw = w * 0.4, mw = ((bw + tw) / 2 + 0.35) * 1.1;
    const tx = x + dx * len + nx * bend, ty = y + dy * len + ny * bend;
    const cx = x + dx * len * 0.5 + nx * bend * 1.25, cy = y + dy * len * 0.5 + ny * bend * 1.25;
    return {
      d: `M${P(x + nx * bw, y + ny * bw)} Q${P(cx + nx * mw, cy + ny * mw)} ${P(tx + nx * tw, ty + ny * tw)} A${R(tw)} ${R(tw)} 0 0 0 ${P(tx - nx * tw, ty - ny * tw)} Q${P(cx - nx * mw, cy - ny * mw)} ${P(x - nx * bw, y - ny * bw)} Z`,
      tx, ty, dx, dy, nx, ny,
    };
  }
  const SK = 'fill="url(#boule-skinH)" stroke="#6b3626" stroke-width=".6"';
  function fingerSvg([x, y, a, len, w, bend], ring) {
    const f = finger(x, y, a, len, w, bend);
    const nb = finger(f.tx - f.dx * 4.4, f.ty - f.dy * 4.4, a, 4.4, w * 0.62, 0);
    const kx = x + f.dx * len * 0.58 + f.nx * bend * 1.1, ky = y + f.dy * len * 0.58 + f.ny * bend * 1.1;
    let s = `<path d="${f.d}" ${SK}/>`;
    s += `<path d="M${P(kx + f.nx * w * 0.28, ky + f.ny * w * 0.28)} L${P(kx - f.nx * w * 0.28, ky - f.ny * w * 0.28)}" stroke="#7a3f2c" stroke-width=".55" opacity=".5"/>`;
    s += `<path d="M${P(x + f.nx * w * 0.3, y + f.ny * w * 0.3)} L${P(kx + f.nx * w * 0.2, ky + f.ny * w * 0.2)}" stroke="#ffe0c8" stroke-width=".8" opacity=".28"/>`;
    s += `<path d="${nb.d}" fill="#5c1838" stroke="#2c0818" stroke-width=".35"/>`;
    if (ring) {
      const t = 0.36, rx = x + f.dx * len * t + f.nx * bend * t, ry = y + f.dy * len * t + f.ny * bend * t, h = w / 2 + 0.5;
      s += `<path d="M${P(rx + f.nx * h, ry + f.ny * h)} L${P(rx - f.nx * h, ry - f.ny * h)}" stroke="#e2b04c" stroke-width="2.1" stroke-linecap="round"/>`;
      s += `<circle cx="${R(rx - f.nx * 0.4)}" cy="${R(ry - f.ny * 0.4)}" r="1.6" fill="${ring}" stroke="#ffe7a0" stroke-width=".45"/>`;
    }
    return s;
  }
  const HAND_F = [[20.5, 7.4, 17, 14.5, 4.3, 1], [22, 2.6, 6, 19, 4.9, 0.5], [22.5, -2.6, -3, 21, 5.2, -0.4], [21, -7.6, -12, 18.5, 5, -1]];
  const PALM = 'M-1.5 -7.4 C6 -10 15 -11.4 23 -10.2 C26.2 -6 26.4 3.6 24 10 C16 11.8 7 10.8 -1.5 7.6 Z';
  function handOpen(rings) {
    let s = fingerSvg([4, -7, -44, 14.5, 6.2, -1.6], null);
    s += HAND_F.map((f, i) => fingerSvg(f, rings[i])).join('');
    s += `<path d="${PALM}" ${SK}/>`;
    s += '<path d="M-1.5 4.2 C8 7.4 16 8.4 24.2 6.6 L24 10 C16 11.8 7 10.8 -1.5 7.6 Z" fill="#000" opacity=".16"/>';
    s += '<g stroke="#ffe2c8" stroke-width=".8" opacity=".3" fill="none"><path d="M3 -4 C10 -5 16 -6.6 21.5 -7.6"/><path d="M3 -1 C10 -1.6 16 -2.2 22 -2.6"/><path d="M3 2 C10 2.2 15 2.4 21.5 2.6"/></g>';
    s += `<g fill="#ffdcc0" opacity=".38">${HAND_F.map(([x, y]) => `<ellipse cx="${x + 0.8}" cy="${y}" rx="1.8" ry="1.3"/>`).join('')}</g>`;
    return s;
  }
  function handPoint() {
    let s = [[24.6, 0.6], [24, 5.2], [22.2, 9.2]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="2.5" ${SK}/><path d="M${x - 1} ${y - 1.4} Q${x + 2.6} ${y - 1} ${x + 3.4} ${y + 0.6}" stroke="#ffe0c8" stroke-width=".6" fill="none" opacity=".4"/>`).join('');
    s += fingerSvg([7, -8, -22, 13.5, 5.8, -0.8], null);
    s += `<path d="M-1.5 -7.4 C6 -10 14 -10.8 20 -9.6 C25.4 -8.4 27.2 -4 26.6 0.6 C26 6 22.6 10.6 16 11 C9 11.2 4 10 -1.5 7.6 Z" ${SK}/>`;
    s += '<path d="M-1.5 4.4 C8 7.6 16 8.6 23.4 7 C21 10 18.6 10.8 16 11 C9 11.2 4 10 -1.5 7.6 Z" fill="#000" opacity=".16"/>';
    s += '<g stroke="#ffe2c8" stroke-width=".8" opacity=".3" fill="none"><path d="M3 -4 C10 -5 16 -6 21 -6.4"/><path d="M3 -0.6 C10 -1 16 -0.8 22 -0.2"/></g>';
    s += '<g fill="#ffdcc0" opacity=".38"><ellipse cx="22.4" cy="-1" rx="1.8" ry="1.3"/><ellipse cx="22" cy="3.6" rx="1.7" ry="1.2"/></g>';
    s += fingerSvg([20.5, -5.8, -3, 25, 5.4, -0.6], '#8a52ff');
    return s;
  }
  // A forearm from the elbow E to the wrist W: skin, a fitted sleeve to mid-forearm, a gold cuff, bangles.
  function forearm(E, W, wE, wW, side) {
    const ux = W[0] - E[0], uy = W[1] - E[1], L = Math.hypot(ux, uy), n = [-uy / L, ux / L];
    const at = (t, w) => P(E[0] + ux * t + n[0] * w, E[1] + uy * t + n[1] * w);
    const wd = (t) => wE + (wW - wE) * t;
    let s = `<path d="M${at(0, -wE)} C${at(0.35, -wE * 0.98)} ${at(0.7, -wW * 1.12)} ${at(1.02, -wW)} L${at(1.02, wW)} C${at(0.7, wW * 1.2)} ${at(0.35, wE * 1.04)} ${at(0, wE)} Z" ${SK}/>`;
    s += `<path d="M${at(0.55, side * wd(0.55) * 0.6)} C${at(0.75, side * wW * 0.9)} ${at(0.9, side * wW * 0.9)} ${at(1.02, side * wW * 0.85)} L${at(1.02, side * wW)} C${at(0.8, side * wW * 1.18)} ${at(0.62, side * wd(0.6) * 1.05)} ${at(0.55, side * wd(0.55))} Z" fill="#000" opacity=".15"/>`;
    s += `<path d="M${at(-0.06, -wE - 1.6)} L${at(0.5, -wd(0.5) - 1.2)} Q${at(0.6, 0)} ${at(0.5, wd(0.5) + 1.2)} L${at(-0.06, wE + 1.6)} C${at(-0.3, wE + 1.2)} ${at(-0.3, -wE - 1.2)} ${at(-0.06, -wE - 1.6)} Z" fill="url(#boule-dress)" stroke="#1d0830" stroke-width=".8"/>`;
    s += `<path d="M${at(0.05, side * (wE - 1))} L${at(0.47, side * (wd(0.47) - 0.5))}" stroke="#000" stroke-width="3" opacity=".22"/>`;
    s += `<path d="M${at(0.5, -wd(0.5) - 1.2)} Q${at(0.6, 0)} ${at(0.5, wd(0.5) + 1.2)}" stroke="#e2b04c" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    s += `<path d="M${at(0.54, -wd(0.54) - 0.8)} Q${at(0.64, 0)} ${at(0.54, wd(0.54) + 0.8)}" stroke="#f6e3ff" stroke-width="1.6" fill="none" stroke-dasharray="1.6 1.2" opacity=".55"/>`;
    [0.79, 0.85, 0.91].forEach((t, i) => {
      const w = wd(t) + 0.7;
      s += `<path d="M${at(t, -w)} Q${at(t + 0.06, 0)} ${at(t, w)}" stroke="${i === 1 ? '#8a52ff' : '#e2b04c'}" stroke-width="${i === 1 ? 1.8 : 2}" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M${at(t - 0.012, -w * 0.7)} Q${at(t + 0.035, -w * 0.1)} ${at(t + 0.02, w * 0.25)}" stroke="#fff6c8" stroke-width=".6" fill="none" opacity=".75"/>`;
    });
    return s;
  }

  // ---------- defs ----------
  const EYE_L = 'M295.5 108.6 C299.5 103 309 102 315 109.4 C311 114 304.4 115.6 300.2 113.6 C297.6 112.4 296.2 110.6 295.5 108.6 Z';
  const OPENING = 'M548 56 C530 92 506 150 498 212 C494 252 492 300 492 345 L606 345 C606 300 604 252 600 212 C592 150 566 92 548 56 Z';
  const lg = (id, stops, attrs = 'x1="0" y1="0" x2="1" y2="1"') => `<linearGradient id="boule-${id}" ${attrs}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
  const rg = (id, stops, attrs = '') => `<radialGradient id="boule-${id}" ${attrs}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
  const blur = (id, sd) => `<filter id="boule-${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
  const DEFS = `<defs>
${lg('skin', [[0, '#ecb68f'], [0.5, '#c98761'], [1, '#8a4e39']], 'x1="0" y1="0" x2="1" y2=".55"')}
${lg('skinH', [[0, '#eeb991'], [0.55, '#cb8961'], [1, '#93573f']], 'x1="0" y1="0" x2="0" y2="1"')}
${lg('lid', [[0, '#c98a68'], [0.55, '#8e4c5c'], [1, '#55244a']], 'x1="0" y1="0" x2="0" y2="1"')}
${rg('iris', [[0, '#f0bf58'], [0.55, '#a8691f'], [1, '#3a1e08']], 'cx=".45" cy=".4" r=".6"')}
${lg('hair', [[0, '#3c2440'], [0.5, '#211222'], [1, '#110810']], 'x1="0" y1="0" x2=".6" y2="1"')}
${lg('dress', [[0, '#7c3c9e'], [0.45, '#4c1d6a'], [1, '#220a3a']])}
${lg('gold', [[0, '#fff1b0'], [0.35, '#e2b04c'], [0.7, '#9c6a1e'], [1, '#5c3a0c']])}
${rg('coin', [[0, '#fff6c8'], [0.5, '#ddaa40'], [1, '#7a5214']], 'cx=".35" cy=".35" r=".7"')}
${lg('silk', [[0, '#d2427a'], [0.5, '#901c4a'], [1, '#4a0824']])}
${lg('teal', [[0, '#3a9a92'], [0.5, '#1b5a58'], [1, '#0a2a2c']])}
${lg('shawl', [[0, '#4a2246'], [0.5, '#28112c'], [1, '#12060f']])}
${lg('velvet', [[0, '#34489a'], [0.5, '#18225a'], [1, '#080c26']])}
${rg('ball', [[0, '#d6c6ff'], [0.3, '#7d5ce2'], [0.7, '#2c1a7a'], [0.92, '#3c3aa0'], [1, '#9ab2ff']], 'cx=".42" cy=".38" r=".62"')}
${rg('halo', [[0, '#c9abff', 0.6], [0.45, '#8a62f0', 0.22], [1, '#5a3ad0', 0]])}
${rg('warm', [[0, '#ffd27e', 0.6], [0.4, '#ff9a3c', 0.2], [1, '#ff7a20', 0]])}
${lg('brass', [[0, '#ffe7a4'], [0.35, '#c48c2e'], [0.75, '#6e4510'], [1, '#3a2206']], 'x1="0" y1="0" x2="1" y2="0"')}
${lg('cloth', [[0, '#7e2249'], [0.5, '#4e0f2c'], [1, '#22040f']], 'x1="0" y1="0" x2="0" y2="1"')}
${rg('clothTop', [[0, '#a73a68'], [0.55, '#62173a'], [1, '#2a0616']], 'cx=".5" cy=".2" r=".75"')}
${lg('wax', [[0, '#fff5dc'], [0.5, '#ecd3a4'], [1, '#a98250']], 'x1="0" y1="0" x2="1" y2="0"')}
${rg('flame', [[0, '#fffbe8'], [0.4, '#ffd76e'], [0.8, '#ff8a1e'], [1, '#e0400a']], 'cx=".5" cy=".72" r=".62"')}
${lg('wall', [[0, '#1e0a2c'], [0.55, '#3a1550'], [1, '#1a0726']], 'x1="0" y1="0" x2="0" y2="1"')}
${lg('curtain', [[0, '#5a2478'], [0.6, '#2e0e42'], [1, '#14051e']], 'x1="1" y1="0" x2="0" y2="0"')}
${lg('sky', [[0, '#070e2a'], [0.7, '#172a5c'], [1, '#2e3c72']], 'x1="0" y1="0" x2="0" y2="1"')}
${rg('moonGlow', [[0, '#e8eeff', 0.55], [0.5, '#9fb4ff', 0.15], [1, '#9fb4ff', 0]])}
${rg('vign', [[0.58, '#05020a', 0], [1, '#05020a', 0.78]], 'cx=".5" cy=".46" r=".78"')}
${rg('gem', [[0, '#e9d6ff'], [0.4, '#9a5cf0'], [1, '#3a1470']], 'cx=".35" cy=".3" r=".75"')}
${rg('ruby', [[0, '#ffc0cc'], [0.4, '#d0204a'], [1, '#5a0418']], 'cx=".35" cy=".3" r=".75"')}
<clipPath id="boule-ballClip"><circle cx="320" cy="284" r="35.6"/></clipPath>
<clipPath id="boule-eyeL"><path d="${EYE_L}"/></clipPath>
<clipPath id="boule-eyeR"><path d="${mx(EYE_L)}"/></clipPath>
<clipPath id="boule-skyClip"><path d="${OPENING}"/></clipPath>
${blur('b1', 1)}${blur('b2', 2)}${blur('b3', 3.2)}${blur('b6', 6)}${blur('b12', 12)}
</defs>`;

  // ---------- decor: tent walls ----------
  const swag = (x0) => `<path d="M${x0} -2 L${x0 + 84} -2 L${x0 + 84} 20 Q${x0 + 42} 72 ${x0} 20 Z" fill="url(#boule-curtain)"/>
<path d="M${x0 + 6} 24 Q${x0 + 42} 58 ${x0 + 78} 24" stroke="#12051a" stroke-width="3" fill="none" opacity=".45"/>
<path d="M${x0 + 10} 16 Q${x0 + 42} 42 ${x0 + 74} 16" stroke="#a46cc8" stroke-width="2" fill="none" opacity=".25"/>
<path d="M${x0} 20 Q${x0 + 42} 72 ${x0 + 84} 20" stroke="#e2b04c" stroke-width="2.2" fill="none"/>
<path d="M${x0 + 2} 24 Q${x0 + 42} 75 ${x0 + 82} 24" stroke="#e2b04c" stroke-width="1.2" fill="none" stroke-dasharray=".1 3.2" stroke-linecap="round"/>`;
  const tassel = (x) => `<circle cx="${x}" cy="21" r="3.4" fill="url(#boule-gold)"/><path d="M${x - 3} 24 L${x + 3} 24 L${x + 5} 44 Q${x} 47 ${x - 5} 44 Z" fill="url(#boule-gold)"/><path d="M${x - 1.5} 27 L${x - 2.2} 43 M${x + 1.5} 27 L${x + 2.2} 43" stroke="#6e4510" stroke-width=".6"/>`;
  const TENTURE = `<g data-el="tenture" data-nom="Tenture">
<rect x="-10" y="-10" width="660" height="360" fill="url(#boule-wall)"/>
<ellipse cx="320" cy="250" rx="280" ry="190" fill="url(#boule-warm)" opacity=".5"/>
${rep(22, (i) => { const x = R(-12 + i * 31 + rnd(i) * 7); return `<path d="M${x} 20 C${x + 6} 120 ${x - 4} 230 ${x + 3} 345 L${x + 13} 345 C${x + 6} 230 ${x + 16} 120 ${x + 10} 20 Z" fill="#0a0212" opacity=".6" filter="url(#boule-b3)"/><path d="M${x + 16} 20 C${x + 21} 120 ${x + 12} 230 ${x + 18} 345 L${x + 22} 345 C${x + 16} 230 ${x + 25} 120 ${x + 20} 20 Z" fill="#a868d0" opacity="${R(0.14 + rnd(i + 9) * 0.12)}" filter="url(#boule-b3)"/>`; })}
<rect x="-10" y="210" width="660" height="135" fill="#ff9a3c" opacity=".06"/>
<path d="M-4 0 L118 0 C104 60 84 120 74 180 C70 204 72 222 80 236 C70 262 64 300 66 345 L-4 345 Z" fill="url(#boule-curtain)"/>
<path d="M30 0 C26 80 22 160 26 230 C22 270 20 310 22 345" stroke="#0a0212" stroke-width="7" fill="none" opacity=".5" filter="url(#boule-b3)"/>
<path d="M62 0 C56 70 46 140 46 210 C44 260 40 300 42 345" stroke="#0a0212" stroke-width="5" fill="none" opacity=".45" filter="url(#boule-b3)"/>
<path d="M46 0 C42 80 36 150 36 215" stroke="#b07ad6" stroke-width="3" fill="none" opacity=".2" filter="url(#boule-b2)"/>
<path d="M118 0 C104 60 84 120 74 180 C70 204 72 222 80 236 C70 262 64 300 66 345" stroke="#e2b04c" stroke-width="2" fill="none"/>
<path d="M114 0 C100 60 80 120 70 180" stroke="#ffd9a0" stroke-width="1.2" fill="none" opacity=".35"/>
<path d="M-4 222 C24 236 56 238 82 230" stroke="#3a2206" stroke-width="6" fill="none" opacity=".5" filter="url(#boule-b1)"/>
<path d="M-4 220 C24 233 56 235 82 227" stroke="#d9a640" stroke-width="4.4" fill="none"/>
<path d="M-4 220 C24 233 56 235 82 227" stroke="#fff1b0" stroke-width="4.4" fill="none" stroke-dasharray="2 3" opacity=".55"/>
<circle cx="83" cy="228" r="5" fill="url(#boule-gold)"/>
<path d="M81 232 L85 232 L86 238 L80 238 Z" fill="#b8862c"/>
<path d="M79.6 238 L86.4 238 L90 262 Q83 266 76 262 Z" fill="url(#boule-gold)"/>
<path d="M80 241 L78.6 261 M83 241 L83 263 M86 241 L87.4 261" stroke="#6e4510" stroke-width=".7"/>
${rep(9, (i) => swag(-20 + i * 84))}
${rep(9, (i) => tassel(-20 + i * 84))}
</g>`;

  // ---------- decor: the tent opening, moon and stars ----------
  const flap = `<path d="M548 56 C530 92 506 150 498 212 C494 252 492 300 492 345 L468 345 C472 300 478 262 484 228 C480 220 481 210 487 204 C499 150 523 96 548 56 Z" fill="url(#boule-curtain)"/>
<path d="M540 74 C524 110 506 160 494 206 M486 240 C482 280 478 310 476 345" stroke="#0a0212" stroke-width="3" fill="none" opacity=".5"/>
<path d="M548 56 C530 92 506 150 498 212 C494 252 492 300 492 345" stroke="#bcd0ff" stroke-width="1.4" fill="none" opacity=".45"/>
<path d="M546 58 C528 94 504 152 496 212 C492 252 490 300 490 345" stroke="#e2b04c" stroke-width="1.8" fill="none"/>
<path d="M468 215 C477 221 490 221 500 213" stroke="#3a2206" stroke-width="5" fill="none" opacity=".45"/><path d="M468 213 C477 219 490 219 500 211" stroke="#d9a640" stroke-width="3.6" fill="none"/><path d="M468 213 C477 219 490 219 500 211" stroke="#fff1b0" stroke-width="3.6" fill="none" stroke-dasharray="1.6 2.4" opacity=".5"/>
<circle cx="485" cy="218" r="3.4" fill="url(#boule-gold)"/><path d="M482.6 221 L487.4 221 L489.8 240 Q485 243 480.2 240 Z" fill="url(#boule-gold)"/><path d="M483.6 224 L482.6 239 M486.4 224 L487.4 239" stroke="#6e4510" stroke-width=".6"/>`;
  const OUVERTURE = `<g data-el="ouverture" data-nom="Ouverture et lune">
<g clip-path="url(#boule-skyClip)">
<rect x="480" y="50" width="140" height="300" fill="url(#boule-sky)"/>
<circle cx="562" cy="116" r="40" fill="url(#boule-moonGlow)"/>
<g class="boule-moon"><path d="M565 99 A17 17 0 1 0 572 132 A13 13 0 1 1 565 99 Z" fill="#f6eed6"/>
<circle cx="553" cy="118" r="2.2" fill="#d8ccb0" opacity=".6"/><circle cx="557" cy="127" r="1.4" fill="#d8ccb0" opacity=".6"/></g>
${rep(16, (i) => `<circle class="boule-star" style="animation-delay:-${R(rnd(i + 3) * 2.6)}s" cx="${R(500 + rnd(i) * 98)}" cy="${R(72 + rnd(i + 40) * 190)}" r="${R(0.5 + rnd(i + 7) * 0.9)}" fill="#fff8e0"/>`)}
<path d="M480 296 C506 286 536 290 562 282 C584 276 604 280 622 286 L622 350 L480 350 Z" fill="#141c44"/>
<path d="M512 288 L520 274 L528 288 Z M582 282 L592 266 L602 282 Z" fill="#0c1230"/>
<circle cx="520" cy="285" r="1.2" fill="#ffc46a"/><circle cx="592" cy="279" r="1.2" fill="#ffc46a"/><circle cx="597" cy="280" r=".9" fill="#ff8a5a"/>
<path d="M480 312 C510 302 548 306 576 300 C596 296 610 298 622 302 L622 350 L480 350 Z" fill="#0a0f2a"/>
</g>
${flap}<g transform="matrix(-1 0 0 1 1098 0)">${flap}</g>
</g>`;

  // ---------- decor: hanging lanterns ----------
  function lantern(x, y, s, key, nom, extra) {
    return `<g data-el="${key}" data-nom="${nom}"><g class="boule-lantern ${extra}">
<path d="M${x} -6 L${x} ${y + 2}" stroke="#b8862c" stroke-width="1.6" stroke-dasharray="3 1.6"/>
<g transform="translate(${x} ${y}) scale(${s})">
<circle class="boule-lglow" cx="0" cy="34" r="54" fill="url(#boule-warm)"/>
<circle cx="0" cy="2" r="2.6" stroke="#e2b04c" stroke-width="1.4" fill="none"/>
<path d="M-9 14 C-9 7 -5 4 0 4 C5 4 9 7 9 14 Z" fill="url(#boule-gold)"/>
<path d="M-12 13 L12 13 L12 16.5 L-12 16.5 Z" fill="#8a5a16"/>
<path d="M-11 16 L-5 16 L-6 52 L-11 52 L-15 34 Z" fill="#b8481c"/>
<path d="M-5 16 L5 16 L6 52 L-6 52 Z" fill="#ffc45a"/>
<path class="boule-lpane" d="M-5 16 L5 16 L6 52 L-6 52 Z" fill="#fff4c8"/>
<path d="M5 16 L11 16 L15 34 L11 52 L6 52 Z" fill="#8e2c48"/>
<g fill="#3a1606" opacity=".55">${rep(5, (i) => `<circle cx="-9.5" cy="${22 + i * 6}" r=".9"/><circle cx="9.5" cy="${22 + i * 6}" r=".9"/><circle cx="0" cy="${21 + i * 7}" r=".7"/>`)}</g>
<path d="M-11 16 L-15 34 L-11 52 M11 16 L15 34 L11 52 M-5 16 L-6 52 M5 16 L6 52 M-15 34 L15 34" stroke="#e2b04c" stroke-width="1.3" fill="none"/>
<path d="M-11 52 L11 52 L4 61 L-4 61 Z" fill="url(#boule-gold)"/>
<path d="M-2 61 L2 61 L0 70 Z" fill="#c48c2e"/>
<path d="M-13 16 L-15 34 L-13 50" stroke="#ffe7b0" stroke-width=".8" fill="none" opacity=".6"/>
</g></g></g>`;
  }
  const LANTERNS = lantern(126, 72, 1, 'lanterneG', 'Lanterne gauche', '') + lantern(458, 34, 0.74, 'lanterneD', 'Lanterne droite', 'boule-lantern2');

  // ---------- rig wrappers ----------
  const BODY = (s) => `<g class="boule-body">${s}</g>`;
  const HEAD = (s) => `<g class="boule-body"><g class="boule-head">${s}</g></g>`;
  const FACE = (s) => HEAD(`<g class="boule-face">${s}</g>`);

  // ---------- hair behind the body ----------
  const CHEVEUX = `<g data-el="cheveux" data-nom="Cheveux">${HEAD(`
<path d="M284 78 C262 88 256 108 262 126 C266 138 256 148 252 160 C246 176 254 188 250 200 C246 214 256 226 258 238 C262 248 272 252 282 250 L358 250 C368 252 378 248 382 238 C384 226 394 214 390 200 C386 188 394 176 388 160 C384 148 374 138 378 126 C384 108 378 88 356 78 Z" fill="url(#boule-hair)"/>
<g stroke="#6e4270" stroke-width="2.2" fill="none" opacity=".45" stroke-linecap="round">
<path d="M271 112 C266 132 262 152 257 170 C253 186 257 200 264 210"/><path d="M279 140 C274 156 268 170 266 186"/><path d="M262 132 C256 146 250 160 252 178 C254 192 250 204 254 220"/><path d="M380 136 C386 150 392 164 390 182 C388 196 392 210 386 224"/>
<path d="M370 112 C375 132 380 152 384 170 C387 186 383 200 377 210"/></g>
<path d="M372 120 C378 140 386 160 386 178" stroke="#a9b6ff" stroke-width="1.4" fill="none" opacity=".35"/>
<ellipse cx="320" cy="176" rx="34" ry="26" fill="#000" opacity=".5" filter="url(#boule-b6)"/>`)}</g>`;

  // ---------- dress and torso ----------
  const ROBE = `<g data-el="robe" data-nom="Robe">${BODY(`
<path d="M300 177 C288 180 272 182 262 187 C250 192 244 204 243 220 L241 350 L399 350 L397 220 C396 204 390 192 378 187 C368 182 352 180 340 177 Z" fill="url(#boule-dress)"/>
<path d="M297 179 C301 200 309 216 320 229 C331 216 339 200 343 179 Z" fill="url(#boule-skin)"/>
<path d="M320 229 C326 218 332 204 336 186 C340 186 342 182 343 179 C339 200 331 216 320 229 Z" fill="#000" opacity=".16"/>
<path d="M303 185 C308 187.5 313 188 318 186.6 M337 185 C332 187.5 327 188 322 186.6" stroke="#7a4232" stroke-width=".6" fill="none" opacity=".55"/>
<path d="M305 183.6 C309 185.6 313 186 317 185" stroke="#ffe2c8" stroke-width=".7" fill="none" opacity=".4"/>
<ellipse cx="320" cy="200" rx="5" ry="14" fill="#7a3a2c" opacity=".14" filter="url(#boule-b2)"/>
<path d="M297 179 C301 200 309 216 320 229 C331 216 339 200 343 179" stroke="#e2b04c" stroke-width="3" fill="none"/>
<path d="M293.6 180 C297.6 202 306.6 219 320 233.6 C333.4 219 342.4 202 346.4 180" stroke="#e2b04c" stroke-width="1.2" fill="none" stroke-dasharray=".1 3" stroke-linecap="round"/>
<path d="M262 236 C278 250 300 256 318 252 M322 252 C340 256 362 250 378 236" stroke="#14051f" stroke-width="3" fill="none" opacity=".45" filter="url(#boule-b1)"/>
<path d="M286 262 C290 286 292 306 290 330 M354 262 C350 286 348 306 350 330" stroke="#14051f" stroke-width="2.4" fill="none" opacity=".4" filter="url(#boule-b1)"/>
<path d="M372 190 C388 196 396 208 397 222 L399 350 L360 350 C368 300 372 240 372 190 Z" fill="#000" opacity=".22"/>
<path d="M246 300 C280 295 360 295 394 300 L394 318 C360 313 280 313 246 318 Z" fill="url(#boule-silk)"/>
<path d="M246 300 C280 295 360 295 394 300 M246 318 C280 313 360 313 394 318" stroke="#e2b04c" stroke-width="1.6" fill="none"/>
<path d="M248 309 C280 304.5 360 304.5 392 309" stroke="#ffd98a" stroke-width="1.4" fill="none" stroke-dasharray="3 3" opacity=".7"/>`)}</g>`;

  // ---------- arms (upper arms; the forearms live with the hands) ----------
  const UPPER_L = 'M264 186 C252 188 242 198 239 214 C236 232 234 252 235 268 C240 275 252 276 257 268 C259 250 263 230 270 212 Z';
  const upperArm = (d, shade) => `<path d="${d}" fill="url(#boule-dress)" stroke="#1a0628" stroke-width=".8"/><path d="${shade}" fill="#000" opacity=".25"/>`;
  const BRAS_G = `<g data-el="brasG" data-nom="Bras gauche">${BODY(`<g class="boule-armL">${upperArm(UPPER_L, 'M262 196 C258 220 256 246 257 268 C252 276 244 274 240 270 C246 250 252 222 262 196 Z')}</g>`)}</g>`;
  const BRAS_D = `<g data-el="brasD" data-nom="Bras droit">${BODY(`<g class="boule-armR boule-armR-down">${upperArm(mx(UPPER_L), mx('M262 196 C258 220 256 246 257 268 C252 276 244 274 240 270 C246 250 252 222 262 196 Z'))}</g>
<g class="boule-armR-up"><g class="boule-raise"><path d="M372 182 C390 174 410 167 431 169 C438 174 439 187 433 192 C414 196 397 202 385 207 Z" fill="url(#boule-dress)" stroke="#1a0628" stroke-width=".8"/>
<path d="M386 200 C402 194 418 190 433 191 C428 196 412 198 386 206 Z" fill="#000" opacity=".25"/></g></g>`)}</g>`;

  // ---------- shawl (two variants) ----------
  const SHAWL_L = 'M305 176 C290 176 272 179 258 186 C244 193 236 208 234 228 C232 244 232 256 234 267 C248 274 266 284 280 296 C286 301 290 306 293 314 L299 314 C297 282 298 232 303 192 Z';
  const fringePts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; fringePts.push([bez(t, 234, 248, 266, 280), bez(t, 267, 274, 284, 296)]); }
  for (let i = 1; i <= 4; i++) { const t = i / 4; fringePts.push([bez(t, 280, 286, 290, 293), bez(t, 296, 301, 306, 314)]); }
  const fringe = (col, bead) => fringePts.map(([x, y], i) => `<path d="M${R(x)} ${R(y)} L${R(x + 0.8 - rnd(i) * 1.6)} ${R(y + 10 + rnd(i + 5) * 4)}" stroke="${col}" stroke-width="1"/><circle cx="${R(x)}" cy="${R(y + 1.2)}" r="1" fill="${bead}"/>`).join('');
  const paisley = (x, y, r, s) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><path d="M0 0 C3 -6 10 -7 12 -1 C13.5 4 8 9 2 8 C-1.5 7.4 -2.4 3 0 0 Z" fill="#e2b04c" fill-opacity=".22" stroke="#e8b850" stroke-width="1"/><path d="M3.5 2.5 C4.5 -0.5 8.5 -1 9.5 2 C10 4.5 7 6 5 4.5" stroke="#f3cf72" stroke-width=".8" fill="none"/><circle cx="6.6" cy="2.4" r="1.1" fill="#ffe6a0"/><path d="M12 -1 C15 -4 17 -3 17 -1" stroke="#e8b850" stroke-width=".8" fill="none"/></g>`;
  const star4 = (x, y, r) => `M${x} ${R(y - r)} L${R(x + r * 0.28)} ${R(y - r * 0.28)} L${R(x + r)} ${y} L${R(x + r * 0.28)} ${R(y + r * 0.28)} L${x} ${R(y + r)} L${R(x - r * 0.28)} ${R(y + r * 0.28)} L${R(x - r)} ${y} L${R(x - r * 0.28)} ${R(y - r * 0.28)} Z`;
  const BORDER = 'M235 261 C248 268 266 278 280 290 C286 295 290 300 293 308 M296 308 C294.5 280 295.5 232 300 194';
  const brodeHalf = `<path d="${BORDER}" stroke="#e2b04c" stroke-width="1.3" fill="none"/>
<path d="M236 254 C250 262 266 271 279 282" stroke="#e2b04c" stroke-width="1.4" fill="none" stroke-dasharray=".1 3" stroke-linecap="round"/>
${paisley(262, 202, 30, 1)}${paisley(246, 234, 72, 0.95)}${paisley(283, 236, 100, 0.85)}${paisley(268, 258, 20, 0.8)}${paisley(285, 196, -10, 0.6)}
<g fill="#f3cf72">${rep(7, (i) => `<circle cx="${R(250 + rnd(i + 20) * 40)}" cy="${R(214 + rnd(i + 30) * 40)}" r=".9"/>`)}</g>`;
  const veloursHalf = `<path d="${BORDER}" stroke="#c9d2f0" stroke-width="1.1" fill="none" stroke-dasharray="4 2"/>
<g fill="#dfe6ff">${rep(9, (i) => `<path d="${star4(R(244 + rnd(i + 50) * 48), R(200 + rnd(i + 60) * 62), R(1.6 + rnd(i + 70) * 2))}"/>`)}</g>
<path d="M254 206 C262 200 272 198 280 200" stroke="#9aa6d8" stroke-width=".8" fill="none" opacity=".6"/>`;
  const shawlFolds = 'M250 196 C244 214 242 236 244 262 C246 240 248 218 256 200 Z M291 202 C287 232 285 264 287 298 C291 268 293 234 297 206 Z M268 190 C262 204 258 216 256 232 C262 216 268 204 276 194 Z';
  const CHALE = `<g data-el="chale" data-nom="Châle">${BODY(`
<g data-var="chale" data-variante="brode">
<path d="${SHAWL_L}" fill="url(#boule-shawl)"/><path d="${mx(SHAWL_L)}" fill="url(#boule-shawl)"/>
${brodeHalf}<g ${MIR}>${brodeHalf}</g>
${fringe('#d9a640', '#f3cf72')}<g ${MIR}>${fringe('#d9a640', '#f3cf72')}</g></g>
<g data-var="chale" data-variante="velours">
<path d="${SHAWL_L}" fill="url(#boule-velvet)"/><path d="${mx(SHAWL_L)}" fill="url(#boule-velvet)"/>
${veloursHalf}<g ${MIR}>${veloursHalf}</g>
${fringe('#aab4d8', '#e6ecff')}<g ${MIR}>${fringe('#aab4d8', '#e6ecff')}</g></g>
<path d="${shawlFolds}" fill="#000" opacity=".32" filter="url(#boule-b1)"/>
<path d="${mx(shawlFolds)}" fill="#000" opacity=".32" filter="url(#boule-b1)"/>
<path d="${mx(SHAWL_L)}" fill="#000" opacity=".18"/>
<path d="M262 186 C276 180 292 177.5 304 177 C292 180 276 184 266 190 C254 196 246 208 242 222 C244 206 250 194 262 186 Z" fill="#ffe0b0" opacity=".2"/>
<path d="M382 187 C394 194 403 208 406 228 C407 244 407 256 406 266" stroke="#b6c4ff" stroke-width="1.6" fill="none" opacity=".5"/>`)}</g>`;

  // ---------- head: neck, ears, face ----------
  const FACE_D = 'M320 58 C346 58 357 78 357 100 C357 114 354 125 349 134 C344 144 336 153 328 159 C325 161 322 162 320 162 C318 162 315 161 312 159 C304 153 296 144 291 134 C286 125 283 114 283 100 C283 78 294 58 320 58 Z';
  const EAR_L = 'M286 103 C280 101 277 108 278 115 C279 122 282 128 287 129 Z';
  const TETE = `<g data-el="tete" data-nom="Tête">${HEAD(`
<path d="M304 146 C304 160 302 171 298 182 C312 187 328 187 342 182 C338 171 336 160 336 146 Z" fill="url(#boule-skin)"/>
<path d="M327 150 C329 162 332 172 336 183 C338 183 340 182.6 342 182 C338 171 336 160 336 148 Z" fill="#000" opacity=".2"/>
<ellipse cx="321" cy="163" rx="17" ry="8" fill="#3a1408" opacity=".45" filter="url(#boule-b3)"/>
<path d="${EAR_L}" fill="url(#boule-skin)"/><path d="M284 108 C281 112 281 118 284 123" stroke="#7a3f2c" stroke-width=".9" fill="none"/>
<path d="${mx(EAR_L)}" fill="#a96446"/><path d="${mx('M284 108 C281 112 281 118 284 123')}" stroke="#5a2a1c" stroke-width=".9" fill="none"/>
<path d="${FACE_D}" fill="url(#boule-skin)"/>
<path d="M357 100 C357 114 354 125 349 134 C344 144 336 153 328 159 C325 161 322 162 320 162 C330 150 340 132 344 112 C346 98 345 84 340 70 C351 78 357 88 357 100 Z" fill="#000" opacity=".15"/>
<path d="M290 124 C294 134 300 142 306 147 C298 146 291 138 288 128 Z" fill="#5a2414" opacity=".2" filter="url(#boule-b2)"/>
<path d="${mx('M290 124 C294 134 300 142 306 147 C298 146 291 138 288 128 Z')}" fill="#4a1c10" opacity=".26" filter="url(#boule-b2)"/>
<ellipse cx="298" cy="119" rx="8" ry="5" fill="#ffdcbc" opacity=".35" filter="url(#boule-b2)"/>
<ellipse cx="312" cy="76" rx="16" ry="6" fill="#ffdcbc" opacity=".22" filter="url(#boule-b3)"/>
<path d="M314 158.6 C317 157.4 321 157.4 324 158.4" stroke="#ffdcbc" stroke-width=".8" fill="none" opacity=".3"/>
<path d="M352 86 C356 96 357 110 354 124 C351 134 346 142 340 150" stroke="#c4b4ff" stroke-width="1.3" fill="none" opacity=".55"/>
`)}</g>`;

  // ---------- necklaces ----------
  const midCoins = rep(7, (i) => { const t = 0.2 + i * 0.1, x = bez(t, 301, 306, 334, 339), y = bez(t, 181, 198, 198, 181); return `<path d="M${R(x)} ${R(y)} L${R(x)} ${R(y + 2.2)}" stroke="#b8862c" stroke-width=".6"/><circle cx="${R(x)}" cy="${R(y + 4)}" r="2" fill="url(#boule-coin)" stroke="#6e4810" stroke-width=".35"/>`; });
  const COLLIERS = `<g data-el="colliers" data-nom="Colliers">${BODY(`<g class="boule-neck">
<path d="M303.4 166.6 C311 171 329 171 336.6 166.6" stroke="#d9a640" stroke-width="1.9" fill="none"/>
<circle cx="320" cy="174.6" r="2.6" fill="url(#boule-coin)" stroke="#6e4810" stroke-width=".4"/>
<path d="M301 181 C306 198 334 198 339 181" stroke="#e2b04c" stroke-width="1.1" fill="none"/>${midCoins}
<path d="M297 182 C298 222 342 222 343 182" stroke="#c99a3e" stroke-width="1" fill="none" stroke-dasharray="1.6 .8"/>
<path d="M322.5 211 A6.4 6.4 0 1 0 322.5 224 A4.9 4.9 0 1 1 322.5 211 Z" fill="url(#boule-gold)" stroke="#6e4810" stroke-width=".4"/>
<path d="M318 224.5 C320.6 226.6 321 229 318.6 231 C316.2 229 316.4 226.6 318 224.5 Z" fill="url(#boule-gem)"/>
<circle cx="316.2" cy="215.6" r=".8" fill="#fff8e0"/></g>`)}</g>`;

  // ---------- headpieces (three variants) and the hair framing the face ----------
  const LOCK_L = 'M287 86 C277 96 274 112 277 126 C279 138 276 150 270 160 C264 170 266 184 274 194 C270 182 273 172 281 166 C288 158 290 146 288 134 C286 122 285 108 289 92 Z';
  const lockSheen = 'M283 98 C279 110 279 124 281 136 C282 146 278 156 273 166';
  const LOCKS = `<path d="${LOCK_L}" fill="url(#boule-hair)"/><path d="${mx(LOCK_L)}" fill="url(#boule-hair)"/>
<path d="${lockSheen}" stroke="#7a4a78" stroke-width="1.6" fill="none" opacity=".55"/>
<path d="${mx(lockSheen)}" stroke="#aab6ff" stroke-width="1.2" fill="none" opacity=".35"/>
<path d="M285 95 C296 87 344 87 355 95 C346 91 334 89.6 320 89.6 C306 89.6 294 91 285 95 Z" fill="#1c0e1a"/>`;
  const HAIRCAP = '<path d="M280 104 C268 82 278 52 302 45 C314 41 330 41 342 46 C366 56 374 84 360 104 C356 94 348 86 338 82 C330 79 312 79 302 82 C292 85 284 94 280 104 Z" fill="url(#boule-hair)"/><path d="M324 43 C322 56 320 68 316 81" stroke="#0a0408" stroke-width="1.6" fill="none"/>';
  const bandY = (x) => 80.6 + ((x - 320) / 39) ** 2 * 14;
  const coinFringe = rep(13, (i) => {
    const x = 292 + i * (56 / 12), y = bandY(x);
    return `<g class="boule-coin" style="animation-delay:-${R(i * 0.17)}s"><path d="M${R(x)} ${R(y)} L${R(x)} ${R(y + 2)}" stroke="#b8862c" stroke-width=".7"/><circle cx="${R(x)}" cy="${R(y + 4.3)}" r="2.5" fill="url(#boule-coin)" stroke="#6e4810" stroke-width=".4"/><circle cx="${R(x)}" cy="${R(y + 4.3)}" r=".7" fill="#7a5214" opacity=".6"/></g>`;
  });
  const FOULARD = `<g class="boule-coiffe">
<path d="M362 86 C370 100 374 116 370 132 C366 122 362 110 356 100 Z" fill="#6e1238"/>
<path d="M368 88 C378 100 382 114 380 128 C376 118 372 106 364 96 Z" fill="url(#boule-silk)"/>
<path d="M280 97 C274 80 278 56 296 46 C310 38 332 38 346 46 C364 56 368 80 362 97 C356 90 350 86 343 84 C335 81.5 327 80.5 320 80.5 C313 80.5 305 81.5 297 84 C290 86 285 90 280 97 Z" fill="url(#boule-silk)"/>
<path d="M296 50 C306 60 312 70 314 81 C310 70 302 60 290 55 Z M346 50 C338 60 332 70 328 81 C334 70 342 60 352 56 Z M330 42 C334 54 334 66 331 80 C330 66 328 54 322 42 Z" fill="#2a0414" opacity=".35"/>
<path d="M285 72 C291 57 305 47 322 45 C309 50 297 59 291 74 Z" fill="#ffd0e0" opacity=".3"/>
<path d="M350 52 C358 60 362 70 362 82" stroke="#b9c6ff" stroke-width="1.3" fill="none" opacity=".45"/>
<path d="M355 84 C361 78 372 82 371 91 C370 99 361 101 356 97 Z" fill="url(#boule-silk)"/>
<path d="M358 86 C363 85 367 88 367 92" stroke="#2a0414" stroke-width="1.2" fill="none" opacity=".5"/>
<path d="M281 95 C286 89 296 84 306 82 C312 81 316 80.6 320 80.6 C324 80.6 328 81 334 82 C344 84 354 89 359 95" stroke="#e2b04c" stroke-width="2.4" fill="none"/>
<path d="M283 92 C292 85 304 80.6 320 79.8 C336 80.6 348 85 357 92" stroke="#ffe7a0" stroke-width=".7" fill="none" stroke-dasharray="1 1.4"/>
${coinFringe}</g>`;
  const TURBAN = `<g class="boule-coiffe">
<path d="M279 98 C270 76 276 44 300 33 C314 27 328 27 342 33 C366 44 372 76 361 98 C354 90 340 84 320 84 C300 84 286 90 279 98 Z" fill="url(#boule-teal)"/>
<path d="M282 90 C292 66 318 50 352 46 C326 54 302 70 290 94 Z M284 64 C300 46 326 38 348 40 C328 44 304 52 288 70 Z M330 86 C340 70 352 60 366 62 C352 66 342 76 338 88 Z" fill="#031414" opacity=".38"/>
<path d="M300 84 C312 62 334 46 360 56 C340 56 320 70 310 86 Z" fill="#9ae0d8" opacity=".18"/>
<path d="M286 60 C294 46 306 38 318 35" stroke="#c8fff4" stroke-width="1.6" fill="none" opacity=".3"/>
<path d="M281 96 C290 86 304 82 320 82 C336 82 350 86 359 96" stroke="#e2b04c" stroke-width="2.2" fill="none"/>
<path d="M318 68 C315 50 321 32 338 16 C334 32 328 50 324 68 Z" fill="#3b2a5a"/>
<path d="M320 64 C320 48 326 34 336 21" stroke="#9f86d8" stroke-width=".8" fill="none"/>
<g stroke="#5a4488" stroke-width=".6">${rep(6, (i) => `<path d="M${R(321 + i * 2)} ${R(58 - i * 7)} L${R(326 + i * 2.4)} ${R(54 - i * 7)}"/>`)}</g>
<ellipse cx="320" cy="72" rx="8" ry="10" fill="url(#boule-gold)" stroke="#5c3a0c" stroke-width=".6"/>
<path d="M320 64.6 C325 69 325.6 75 320 80.4 C314.4 75 315 69 320 64.6 Z" fill="url(#boule-ruby)"/>
<circle cx="318.2" cy="69.4" r="1.1" fill="#fff" opacity=".85"/>
${rep(8, (i) => { const a = i * Math.PI / 4; return `<circle cx="${R(320 + Math.cos(a) * 9.4)}" cy="${R(72 + Math.sin(a) * 11.4)}" r="1.1" fill="#fff6e6"/>`; })}
<path d="M320 82.4 L320 86" stroke="#e2b04c" stroke-width=".8"/><path d="M318.4 86 L321.6 86 L320 90.6 Z" fill="url(#boule-ruby)"/></g>`;
  const LIBRES_TOP = `<path d="M280 104 C268 82 278 52 302 45 C314 41 330 41 342 46 C366 56 374 84 360 104 C356 94 348 86 338 82 C330 79 312 79 302 82 C292 85 284 94 280 104 Z" fill="url(#boule-hair)"/>
<path d="M324 43 C322 56 320 68 316 81" stroke="#0a0408" stroke-width="1.6" fill="none"/>
<g stroke="#7a4a78" stroke-width="2" fill="none" opacity=".5" stroke-linecap="round"><path d="M290 64 C298 52 310 47 320 46"/><path d="M284 84 C287 72 296 62 306 58"/><path d="M332 50 C344 54 354 62 358 74"/></g>
<path d="M346 52 C358 60 366 74 364 92" stroke="#aab6ff" stroke-width="1.2" fill="none" opacity=".35"/>`;
  const LIBRES = `${LIBRES_TOP}<g class="boule-coiffe">
<path d="M282 96 C292 86 306 81 320 81 C334 81 348 86 358 96" stroke="url(#boule-gold)" stroke-width="2.8" fill="none"/>
<path d="M284 93.6 C294 84.6 306 80.2 320 80.2 C334 80.2 346 84.6 356 93.6" stroke="#fff4c0" stroke-width=".6" fill="none" opacity=".7"/>
<path d="M320 81.6 L320 84" stroke="#b8862c" stroke-width=".7"/>
<circle cx="320" cy="87.6" r="3.6" fill="url(#boule-coin)" stroke="#6e4810" stroke-width=".4"/>
<path d="M320 91 C321.8 93 321.8 95 320 96.6 C318.2 95 318.2 93 320 91 Z" fill="url(#boule-gem)"/></g>`;
  const COIFFE = `<g data-el="coiffe" data-nom="Coiffe">${HEAD(`${HAIRCAP}${LOCKS}
<g data-var="coiffe" data-variante="foulard">${FOULARD}</g>
<g data-var="coiffe" data-variante="turban">${TURBAN}</g>
<g data-var="coiffe" data-variante="libres">${LIBRES}</g>`)}</g>`;

  // ---------- brows ----------
  const BROW_L = 'M316 96.8 C309 94.4 301 93.6 295 96.5 C292.5 97.8 290.8 99.8 289.8 102.2 C292.6 100.2 295.6 98.6 299 98 C304.5 97.2 310.5 98.2 315.6 99.8 Z';
  const browHairs = 'M313 99 L311.6 96.2 M310.4 98.6 L309.4 95.6 M307.6 98.2 L307 95.2';
  const SOURCILS = `<g data-el="sourcils" data-nom="Sourcils">${FACE(`
<g class="boule-browL"><path d="${BROW_L}" fill="#1b0f17"/><path d="${browHairs}" stroke="#3a2432" stroke-width=".6"/><path d="M296 96.6 C302 94.6 308 94.8 313 96.4" stroke="#5a3a52" stroke-width=".7" fill="none" opacity=".7"/></g>
<g class="boule-browR"><path d="${mx(BROW_L)}" fill="#1b0f17"/><path d="${mx(browHairs)}" stroke="#3a2432" stroke-width=".6"/><path d="${mx('M296 96.6 C302 94.6 308 94.8 313 96.4')}" stroke="#7a6a9a" stroke-width=".7" fill="none" opacity=".6"/></g>`)}</g>`;

  // ---------- eyes ----------
  function eye(side) {
    const m = side === 'R' ? mx : (d) => d, X = (x) => (side === 'R' ? 640 - x : x), cx = X(306);
    return `<g class="boule-eye${side}">
<path d="${m('M292 104 C298 97.5 310 97 317 104 C310 100.8 298 101 292 104 Z')}" fill="#5a1e52" opacity=".55" filter="url(#boule-b1)"/>
<path d="${m('M294 103.4 C300 98.6 310 98.4 316 102.6')}" stroke="#6a3428" stroke-width=".6" fill="none" opacity=".5"/>
<path d="${m(EYE_L)}" fill="#f2e6da"/>
<g clip-path="url(#boule-eye${side})">
<ellipse cx="${X(305)}" cy="104" rx="11" ry="3.4" fill="#5a3030" opacity=".35" filter="url(#boule-b1)"/>
<g class="boule-pupils"><g class="boule-dart"><g class="boule-irisS">
<circle cx="${cx}" cy="109.4" r="4.5" fill="url(#boule-iris)" stroke="#2a1406" stroke-width=".7"/>
<circle cx="${cx}" cy="109.4" r="2.1" fill="#0e0606"/>
<circle cx="${cx - 1.6}" cy="107.7" r="1.15" fill="#fff"/><circle cx="${cx + 1.2}" cy="111.3" r=".7" fill="#c8b0ff" opacity=".8"/></g></g></g>
<g class="boule-lid"><path d="${m('M289 90 L322 90 L322 108.4 C313 102.6 299 102.6 290 107.2 L289 107 Z')}" fill="url(#boule-lid)"/>
<path d="${m('M290 107.2 C299 102.6 313 102.6 321 108.4')}" stroke="#170a12" stroke-width="2.2" fill="none"/></g>
<g class="boule-lowlid"><path d="${m('M289 123 L322 123 L322 113 C313 117 300 117.4 290 112 Z')}" fill="#c07a58"/>
<path d="${m('M290 112 C300 117.4 313 117 322 113')}" stroke="#7a3a30" stroke-width=".8" fill="none"/></g>
</g>
<path d="${m('M295.5 108.6 C299.5 103 309 102 315 109.4')}" stroke="#170a12" stroke-width="1.5" fill="none" stroke-linecap="round"/>
<path d="${m('M296.4 109 C293 108.4 290 106.6 287.4 103.8 C290.6 105.2 293.6 106 296.6 106.6 Z')}" fill="#170a12"/>
<path d="${m('M295.5 108.6 C296.2 110.6 297.6 112.4 300.2 113.6 C304.4 115.6 311 114 315 109.4')}" stroke="#2a1218" stroke-width=".85" fill="none" opacity=".8"/>
<circle cx="${X(314.2)}" cy="109.6" r=".9" fill="#d88a8a"/>
<g class="boule-lid"><path d="${m('M296.9 107 Q294.6 106.6 293.4 104.6 M299.3 105.4 Q297.2 104.4 296.6 101.8 M302.6 104.3 Q301 103 301 100.6 M305.6 104.1 Q305 102.6 305.4 100.6')}" stroke="#150a10" stroke-width=".9" fill="none" stroke-linecap="round"/></g>
</g>`;
  }
  const YEUX = `<g data-el="yeux" data-nom="Yeux">${FACE(eye('L') + eye('R'))}</g>`;

  // ---------- nose ----------
  const NEZ = `<g data-el="nez" data-nom="Nez">${FACE(`
<path d="M322 104 C323.6 113 325 121 327.4 128.6 C325.8 130.2 324 130.8 322.6 130.8 C323 122 322.8 113 322 104 Z" fill="#000" opacity=".14" filter="url(#boule-b1)"/>
<path d="M315 104 C316 112 316 120 314.6 126" stroke="#ffe0c4" stroke-width="1.2" opacity=".3" fill="none"/>
<path d="M312.6 129 C315.2 126.8 318 127.4 320 129.4 C322 127.4 324.8 126.8 327.4 129 C328 131.6 325.4 133.6 320 133.6 C314.6 133.6 312 131.6 312.6 129 Z" fill="#6a2c1c" opacity=".24"/>
<path d="M327.4 129 C328.6 127 328 124.8 326 123.8" stroke="#6a2c1c" stroke-width=".8" fill="none" opacity=".5"/>
<path d="M313.2 129.6 C312.4 127.6 313.2 125.6 315 124.8" stroke="#7a3a28" stroke-width=".7" fill="none" opacity=".4"/>
<ellipse cx="316.3" cy="131.4" rx="1.9" ry="1" fill="#4a1a10" opacity=".8" transform="rotate(12 316.3 131.4)"/>
<ellipse cx="323.7" cy="131.4" rx="1.9" ry="1" fill="#4a1a10" opacity=".8" transform="rotate(-12 323.7 131.4)"/>
<ellipse cx="318.4" cy="127.4" rx="2.2" ry="1.4" fill="#ffe4cc" opacity=".55"/>
<path d="M318.4 136 L317.8 141 M321.6 136 L322.2 141" stroke="#7a3a28" stroke-width=".5" opacity=".35"/>
<path d="M297 116.4 C302 119.4 310 119.4 315 116.4 M343 116.4 C338 119.4 330 119.4 325 116.4" stroke="#6a2c20" stroke-width="1.3" opacity=".22" fill="none" filter="url(#boule-b1)"/>
<path d="M312 133.4 C308.4 137 307.4 141 308.6 145.4 M328 133.4 C331.6 137 332.6 141 331.4 145.4" stroke="#7a3a28" stroke-width=".8" opacity=".18" fill="none"/>`)}</g>`;

  // ---------- mouth, one shape per mood ----------
  const UP = '#8b2c3e', LO = '#a63e4f', IN = '#2a0710';
  const laughLines = `<path d="M305.6 137 C303.4 141 303.8 145.6 306.4 149 M334.4 137 C336.6 141 336.2 145.6 333.6 149" stroke="#6e3528" stroke-width=".7" fill="none" opacity=".6"/>`;
  const BOUCHE = `<g data-el="bouche" data-nom="Bouche">${FACE(`<g class="boule-mouth">
<g class="boule-m-repos"><path d="M313 151.2 C317 152.8 323 152.8 327 151.2" stroke="#4a1a10" stroke-width="1.4" opacity=".25" fill="none" filter="url(#boule-b1)"/>
<path d="M308.5 144.6 C311.5 142.8 315.5 141.4 318.3 142.3 C319.4 142.7 320.6 142.7 321.7 142.3 C324.6 141.3 328.4 142 332 143.3 C327.8 145.3 324 145.9 320 145.6 C316 145.9 312.2 145.8 308.5 144.6 Z" fill="${UP}"/>
<path d="M310.4 145.2 C314.5 146.2 325.5 146 330.2 144.3 C328.2 148.6 324.3 150.4 320 150.4 C315.6 150.4 312.4 148.6 310.4 145.2 Z" fill="${LO}"/>
<path d="M308.5 144.6 C313.5 145.9 326 145.7 332 143.3" stroke="#3a0c17" stroke-width="1.1" fill="none" stroke-linecap="round"/>
<ellipse cx="318.4" cy="147.6" rx="3.4" ry="1" fill="#ffc4c4" opacity=".35"/>
<path d="M332 143.3 C333.2 142.6 333.8 141.7 333.9 140.8" stroke="#6e3528" stroke-width=".7" fill="none" opacity=".6"/></g>
<g class="boule-m-louche">
<path d="M310.5 145 C313 143.4 316.5 142.2 319 143 C320 143.3 321 143.2 322 142.8 C325 141.6 328.4 141 331.6 140.6 C328 143.6 324.5 145 320.5 145.4 C316.5 145.8 313.2 145.8 310.5 145 Z" fill="${UP}"/>
<path d="M312 145.5 C316 146.4 325.6 145.4 330.2 141.8 C328.6 146.4 324.8 149.4 320.2 149.6 C316.4 149.8 313.6 148.2 312 145.5 Z" fill="${LO}"/>
<path d="M310.5 145 C315.5 146 326 145 331.6 140.6" stroke="#3a0c17" stroke-width="1.1" fill="none" stroke-linecap="round"/>
<ellipse cx="319" cy="147.4" rx="3" ry=".9" fill="#ffc4c4" opacity=".35"/>
<path d="M331.6 140.6 C333 139.6 333.6 138.4 333.4 137.2" stroke="#6e3528" stroke-width=".8" fill="none" opacity=".7"/></g>
<g class="boule-m-rire">${laughLines}<g class="boule-jaw">
<path d="M307.5 141.8 C313 140.6 327 140.4 333.2 139.6 C332.2 150.2 326.8 157.6 320 157.6 C313.6 157.6 308.6 150.6 307.5 141.8 Z" fill="${IN}"/>
<path d="M312.5 152 C316 149.6 324.6 149.4 328 151.6 C326 155.6 322.6 157.2 320 157.2 C317 157.2 314.2 155.4 312.5 152 Z" fill="#b2475a"/>
<path d="M309.5 147.8 C311.6 154.6 316 159.4 320 159.4 C325 159.4 330 154 331.8 146.4 C330.2 153.6 325.4 158 320 158 C314.8 158 311.2 153.4 309.5 147.8 Z" fill="${LO}"/></g>
<path d="M310 141.9 C315 141.2 326 141 331.2 140.3 L330.6 144 C325 145 315.6 145.2 310.8 144.6 Z" fill="#f5ece4"/>
<path d="M306.6 141.9 C310.5 139.4 315.4 138.2 318.4 139.1 C319.4 139.4 320.6 139.4 321.6 139.1 C325 138 330 138.6 334.2 139.6 C328 141 313 141.6 306.6 141.9 Z" fill="${UP}"/></g>
<g class="boule-m-victoire">${laughLines}
<path d="M305.6 142 C312 142.4 328 142.4 334.4 140.6 C332.4 149.6 326.6 154.6 320 154.6 C313 154.6 307.4 149.6 305.6 142 Z" fill="${IN}"/>
<path d="M308 142.3 C314 142.8 326 142.8 332.2 141.2 L331.2 145 C325.4 146.4 314.4 146.6 308.8 145.6 Z" fill="#f5ece4"/>
<path d="M311.6 151.4 C315.8 150.2 324.4 150 328.6 151 C326.2 153.4 323.4 154.2 320 154.2 C316.6 154.2 313.6 153.2 311.6 151.4 Z" fill="#e8ddd4"/>
<path d="M304.6 142 C309 139.6 315 138.6 318.4 139.6 C319.4 139.9 320.6 139.9 321.6 139.6 C325.4 138.4 331 138.8 335.6 140.4 C329 142.6 312 142.8 304.6 142 Z" fill="${UP}"/>
<path d="M307.6 147.2 C310.6 153 315 156.6 320 156.6 C326 156.6 330.6 152.6 332.8 146 C331 152 326 155.4 320 155.4 C314.6 155.4 310.4 152.4 307.6 147.2 Z" fill="${LO}"/></g>
<g class="boule-m-decu">
<path d="M312 146.4 C316 145.4 324 145.4 328 146.6 C325.6 148.4 322.8 149 320 149 C317.2 149 314.4 148.4 312 146.4 Z" fill="${IN}"/>
<path d="M309 148 C312 145.2 316 143.6 318.6 144.3 C319.5 144.6 320.5 144.6 321.4 144.3 C324 143.6 328 145.2 331 148 C327.4 146.4 323.6 145.8 320 146 C316.4 145.8 312.6 146.4 309 148 Z" fill="${UP}"/>
<path d="M312.4 147.6 C316 149.4 324 149.4 327.6 147.6 C326.4 151 323.4 152.4 320 152.4 C316.6 152.4 313.6 151 312.4 147.6 Z" fill="${LO}"/>
<path d="M309 148 C308 149.4 307.6 150.8 307.8 152.2 M331 148 C332 149.4 332.4 150.8 332.2 152.2" stroke="#6e3528" stroke-width=".7" fill="none" opacity=".6"/></g>
<g class="boule-m-surprise">
<ellipse cx="320" cy="148" rx="7" ry="9.2" fill="${LO}"/>
<path d="M313.2 146 C314.4 140.8 317.6 139.4 320 139.6 C322.4 139.4 325.6 140.8 326.8 146 C324.8 143.2 322.4 142 320 142 C317.6 142 315.2 143.2 313.2 146 Z" fill="${UP}"/>
<ellipse cx="320" cy="148.4" rx="4.6" ry="6.6" fill="${IN}"/>
<ellipse cx="318" cy="155.2" rx="2.4" ry=".8" fill="#ffc4c4" opacity=".4"/></g>
</g>`)}</g>`;
  const GRAIN = `<g data-el="grain" data-nom="Grain de beauté">${FACE('<circle cx="308.6" cy="138.6" r="1.2" fill="#3a1610"/><circle cx="308.2" cy="138.2" r=".35" fill="#a87060"/>')}</g>`;

  // ---------- earrings (two variants) ----------
  const hoop = (x, cls) => `<g class="boule-ear ${cls}"><circle cx="${x}" cy="137.4" r="8.6" fill="none" stroke="url(#boule-gold)" stroke-width="2.3"/><path d="M${x - 5.8} 132 C${x - 6.8} 135 ${x - 6.6} 139 ${x - 4.4} 142" stroke="#fff4c0" stroke-width=".8" fill="none"/><circle cx="${x}" cy="146.4" r="1.7" fill="url(#boule-coin)"/></g>`;
  const drop = (x, cls) => `<g class="boule-ear ${cls}"><circle cx="${x}" cy="129.6" r="1.7" fill="url(#boule-gold)"/><path d="M${x} 131 L${x} 135.4" stroke="#e2b04c" stroke-width=".9"/><path d="M${x - 2.5} 135.4 L${x + 2.5} 135.4 L${x + 1.5} 137.4 L${x - 1.5} 137.4 Z" fill="#e2b04c"/><path d="M${x} 137 C${x + 4.4} 141.4 ${x + 4.8} 146.6 ${x} 151.6 C${x - 4.8} 146.6 ${x - 4.4} 141.4 ${x} 137 Z" fill="url(#boule-gem)" stroke="#2a0a50" stroke-width=".4"/><circle cx="${x}" cy="153.4" r="1.3" fill="#e2b04c"/><path d="M${x - 1.6} 140.4 C${x - 2.6} 142.4 ${x - 2.6} 144.6 ${x - 1.6} 146.6" stroke="#fff" stroke-width=".7" opacity=".7" fill="none"/></g>`;
  const BOUCLES = `<g data-el="boucles" data-nom="Boucles d'oreilles">${HEAD(`
<g data-var="boucles" data-variante="creoles">${hoop(285.5, '')}${hoop(354.5, 'boule-ear2')}</g>
<g data-var="boucles" data-variante="pendants">${drop(285.5, '')}${drop(354.5, 'boule-ear2')}</g>`)}</g>`;

  // ---------- foreground: round table with a velvet cloth ----------
  const TABLE = `<g data-el="table" data-nom="Table et velours">
<ellipse cx="320" cy="345" rx="232" ry="24" fill="url(#boule-clothTop)"/>
<ellipse cx="320" cy="331" rx="120" ry="9" fill="#12020a" opacity=".55" filter="url(#boule-b6)"/>
<path d="M88 345 C86 362 80 382 68 406 L572 406 C560 382 554 362 552 345 C520 362 420 369 320 369 C220 369 120 362 88 345 Z" fill="url(#boule-cloth)"/>
${rep(14, (i) => { const x = R(100 + i * 33 + rnd(i + 80) * 8); return `<path d="M${x} 368 C${x - 2} 380 ${x - 5} 392 ${x - 8} 406 L${x + 6} 406 C${x + 4} 392 ${x + 3} 380 ${x + 4} 368 Z" fill="#0e0108" opacity=".55" filter="url(#boule-b2)"/><path d="M${x + 12} 369 C${x + 11} 382 ${x + 10} 394 ${x + 9} 406" stroke="#c45a86" stroke-width="2" opacity="${R(0.12 + rnd(i) * 0.12)}" fill="none" filter="url(#boule-b1)"/>`; })}
<path d="M88 347 C120 364 220 371 320 371 C420 371 520 364 552 347" stroke="#e2b04c" stroke-width="2.2" fill="none"/>
<path d="M84 360 C120 377 220 384 320 384 C420 384 520 377 556 360" stroke="#e2b04c" stroke-width="1.4" fill="none"/>
<path d="M86 354 C120 371 220 378 320 378 C420 378 520 371 554 354" stroke="#ffd98a" stroke-width="2.4" fill="none" stroke-dasharray=".1 5" stroke-linecap="round" opacity=".85"/>
<path d="M100 350 C150 362 230 368 320 369" stroke="#ff9ac0" stroke-width="1.4" fill="none" opacity=".35"/>
<ellipse cx="172" cy="350" rx="56" ry="10" fill="url(#boule-warm)"/>
<ellipse cx="462" cy="348" rx="46" ry="9" fill="url(#boule-warm)"/>
<ellipse class="boule-pool" cx="320" cy="342" rx="70" ry="11" fill="#a888ff" opacity=".3" filter="url(#boule-b3)"/>
</g>`;

  // ---------- tarot cards fanned on the cloth ----------
  const cardBack = `<rect width="26" height="40" rx="2.4" fill="#3a1656" stroke="#e2b04c" stroke-width="1"/><rect x="3" y="3" width="20" height="34" rx="1.4" fill="none" stroke="#e2b04c" stroke-width=".6"/><circle cx="13" cy="20" r="8" fill="none" stroke="#e2b04c" stroke-width=".6"/><path d="${star4(13, 20, 6)}" fill="#e2b04c"/>`;
  const cardMoon = `<rect width="26" height="40" rx="2.4" fill="#f3e6c4" stroke="#b8862c" stroke-width=".8"/><rect x="2.6" y="2.6" width="20.8" height="34.8" rx="1" fill="#22306a"/><path d="M15 9 A7 7 0 1 0 15 23 A5.4 5.4 0 1 1 15 9 Z" fill="#f6e7b0"/><path d="M4 37 L4 27 L7 27 L7 25 L9 25 L9 37 Z M22 37 L22 28 L19 28 L19 26 L17 26 L17 37 Z" fill="#0c1230"/><path d="M5 34 C10 31 16 33 21 30" stroke="#6aa0e0" stroke-width=".8" fill="none"/>`;
  const fan = [[-48, cardBack], [-27, cardBack], [-7, cardBack], [13, cardBack], [33, cardMoon]];
  const CARTES = `<g data-el="cartes" data-nom="Cartes de tarot">
<ellipse cx="234" cy="358" rx="38" ry="6" fill="#0e0108" opacity=".5" filter="url(#boule-b2)"/>
${fan.map(([a, c], i) => `<g class="boule-card boule-card${i}"><g transform="translate(232 358) scale(1 .5) rotate(${a}) translate(-13 -40)">${c}</g></g>`).join('')}
</g>`;

  // ---------- candles ----------
  function candle(x, top, bot, w, i) {
    const h = w / 2;
    return `<circle class="boule-cglow" style="animation-delay:-${R(rnd(i) * 1.2)}s" cx="${x}" cy="${top - 10}" r="30" fill="url(#boule-warm)"/>
<path d="M${x - h} ${bot} L${x - h} ${top} C${x - h} ${top + 2.4} ${x + h} ${top + 2.4} ${x + h} ${top} L${x + h} ${bot} Z" fill="url(#boule-wax)"/>
<path d="M${R(x + h * 0.35)} ${top + 2} L${x + h} ${top} L${x + h} ${bot} L${R(x + h * 0.35)} ${bot} Z" fill="#5a3010" opacity=".18"/>
<ellipse cx="${x}" cy="${top}" rx="${h}" ry="2.2" fill="#fff6dc"/><ellipse cx="${x}" cy="${top + 0.3}" rx="${R(h - 1.3)}" ry="1.3" fill="#f0c880"/>
<path d="M${R(x - h + 0.8)} ${top + 1} L${R(x - h + 0.8)} ${top + 9} Q${R(x - h + 2.3)} ${top + 11.4} ${R(x - h + 3.8)} ${top + 9} L${R(x - h + 3.8)} ${top + 1.6} Z" fill="#fff8e4"/>
<path d="M${R(x + h - 3)} ${top + 1.6} L${R(x + h - 3)} ${top + 5.4} Q${R(x + h - 2)} ${top + 7} ${R(x + h - 1)} ${top + 5.4} L${R(x + h - 1)} ${top + 1.2} Z" fill="#f4e2bc"/>
<path d="M${x} ${top} L${x + 0.6} ${top - 3.6}" stroke="#2a1a10" stroke-width="1"/>
<g class="boule-flameW"><g class="boule-flame" style="animation-duration:${R(0.9 + rnd(i + 3) * 0.6)}s;animation-delay:-${R(rnd(i + 6))}s">
<path d="M${x} ${top - 1.5} C${x + 3.6} ${top - 6} ${x + 3} ${top - 12} ${x + 0.4} ${top - 19} C${x - 3} ${top - 12} ${x - 3.6} ${top - 6} ${x} ${top - 1.5} Z" fill="url(#boule-flame)"/>
<path d="M${x} ${top - 2.2} C${x + 1.6} ${top - 4.6} ${x + 1.4} ${top - 7.2} ${x} ${top - 9.8} C${x - 1.4} ${top - 7.2} ${x - 1.6} ${top - 4.6} ${x} ${top - 2.2} Z" fill="#fffef0" opacity=".9"/>
<ellipse cx="${x}" cy="${top - 2.6}" rx="1.2" ry="1.6" fill="#6a9cff" opacity=".55"/></g></g>`;
  }
  const dish = (x, y, rx) => `<ellipse cx="${x}" cy="${y + 2}" rx="${rx + 2}" ry="6" fill="#0e0108" opacity=".5" filter="url(#boule-b2)"/><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="5.6" fill="url(#boule-brass)"/><ellipse cx="${x}" cy="${y - 1.2}" rx="${rx - 3}" ry="3.6" fill="#5a3a10"/><path d="M${x - rx + 2} ${y + 1} C${x - rx / 2} ${y + 5} ${x + rx / 2} ${y + 5} ${x + rx - 2} ${y + 1}" stroke="#ffe7a4" stroke-width=".8" fill="none" opacity=".7"/>`;
  const BOUGIES = `<g data-el="bougies" data-nom="Bougies">
${dish(171, 352, 30)}${candle(152, 308, 351, 11, 1)}${candle(171, 282, 352, 13, 2)}${candle(190, 318, 352, 11, 3)}
${dish(462, 350, 25)}${candle(452, 298, 349, 12, 4)}${candle(471, 318, 350, 10.5, 5)}
</g>`;

  // ---------- incense burner ----------
  const ENCENS = `<g data-el="encens" data-nom="Encens">
<path d="M516 352 L512 359 M532 352 L536 359" stroke="#8a5a16" stroke-width="2.2" stroke-linecap="round"/>
<path d="M507 345 C508 355 540 355 541 345 Z" fill="url(#boule-brass)"/>
<ellipse cx="524" cy="345" rx="17" ry="3.2" fill="#3a2206"/>
<path d="M522 345 L529 312" stroke="#4a2010" stroke-width="1.6"/>
<circle class="boule-ember" cx="529.2" cy="311.4" r="4.4" fill="#ff9a3c" opacity=".5" filter="url(#boule-b1)"/>
<circle cx="529.2" cy="311.4" r="1.5" fill="#ffb060"/>
<path class="boule-wisp" d="M529 308 C524 300 534 292 528 282 C523 274 532 266 528 258" stroke="#d8c8f0" stroke-width="2.2" fill="none" opacity=".3" filter="url(#boule-b1)"/>
</g>`;

  // ---------- the crystal ball on its brass stand ----------
  const BOULE = `<g data-el="boule" data-nom="Boule de cristal"><g class="boule-ballrig">
<ellipse cx="320" cy="343" rx="38" ry="5" fill="#0e0108" opacity=".55" filter="url(#boule-b2)"/>
<circle class="boule-halo" cx="320" cy="284" r="84" fill="url(#boule-halo)"/>
<ellipse cx="320" cy="318" rx="20" ry="4.6" fill="#3a2206"/>
<circle cx="320" cy="284" r="36" fill="url(#boule-ball)"/>
<g clip-path="url(#boule-ballClip)">
<g class="boule-swirl"><path d="M320 284 C332 270 352 278 349 294 C346 310 322 316 308 302" stroke="#e6d8ff" stroke-width="6" fill="none" opacity=".38" filter="url(#boule-b3)"/>
<path d="M320 284 C308 298 288 290 291 274 C294 258 318 252 332 266" stroke="#9fd8ff" stroke-width="5" fill="none" opacity=".32" filter="url(#boule-b3)"/>
<path d="M322 280 C330 272 342 278 341 288 C340 298 328 302 320 296" stroke="#f4eeff" stroke-width="1.4" fill="none" opacity=".6"/>
<path d="M318 288 C310 296 298 290 299 280" stroke="#c8f0ff" stroke-width="1.1" fill="none" opacity=".5"/></g>
<g class="boule-swirl2"><path d="M300 298 C295 285 303 271 318 268" stroke="#c49cff" stroke-width="3" fill="none" opacity=".45" filter="url(#boule-b2)"/>
<path d="M342 272 C348 283 344 297 331 303" stroke="#8ad0ff" stroke-width="2.6" fill="none" opacity=".4" filter="url(#boule-b2)"/></g>
<circle class="boule-core" cx="320" cy="288" r="13" fill="#f0e8ff" filter="url(#boule-b6)"/>
<g class="boule-ghost"><ellipse cx="320" cy="288" rx="22" ry="26" fill="#e4f6ff" opacity=".4" filter="url(#boule-b6)"/><path d="M320 262 C334 262 341 274 339 288 C337 300 329 307 323 315 C319 309 307 301 303 289 C300 275 306 262 320 262 Z" fill="#eef9ff" opacity=".88" filter="url(#boule-b1)"/>
<ellipse cx="313" cy="281" rx="3.2" ry="4.4" fill="#22126a"/><ellipse cx="327" cy="281" rx="3.2" ry="4.4" fill="#22126a"/>
<ellipse cx="320" cy="295" rx="2.8" ry="3.8" fill="#22126a"/><circle cx="312" cy="279.6" r=".9" fill="#fff"/><circle cx="326" cy="279.6" r=".9" fill="#fff"/></g>
<g class="boule-fog"><circle cx="320" cy="284" r="36" fill="#a6a0b8"/><path d="M290 276 C302 268 318 274 330 268 C340 264 350 270 354 276 M288 294 C300 288 316 296 330 290 C342 286 350 292 354 296" stroke="#dcd8e8" stroke-width="5" fill="none" opacity=".7" filter="url(#boule-b2)"/></g>
<path class="boule-crack" d="M336 258 L331 268 L338 274 L332 284 L337 292 M331 268 L324 270 M338 274 L344 276" stroke="#f8f4ff" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
<path d="M284 284 C284 306 300 320 320 320 C340 320 356 306 356 284 C350 302 336 312 320 312 C304 312 290 302 284 284 Z" fill="#0e0630" opacity=".45"/>
<circle class="boule-bflash" cx="320" cy="284" r="36" fill="#fff"/>
</g>
<circle cx="303" cy="291" r="1.4" fill="#ffd27e" opacity=".8"/><circle cx="337" cy="294" r="1.1" fill="#ffd27e" opacity=".6"/>
<path d="M297 268 C303 257 315 251 328 252 C316 255 307 261 302 271 Z" fill="#fff" opacity=".72"/>
<circle cx="334" cy="256.6" r="1.6" fill="#fff" opacity=".75"/>
<circle cx="320" cy="284" r="35.4" fill="none" stroke="#b8c8ff" stroke-width="1.2" opacity=".55"/>
<path d="M302 317 C297 311 296 304 298.6 297.6 M338 317 C343 311 344 304 341.4 297.6" stroke="url(#boule-brass)" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path d="M303 320 C296 326 291 333 288 340 L295 341 C298 334 303 328 310 323 Z" fill="url(#boule-brass)"/>
<path d="${mx('M303 320 C296 326 291 333 288 340 L295 341 C298 334 303 328 310 323 Z')}" fill="#7a4c14"/>
<path d="M316.5 323 L315.6 342 L324.4 342 L323.5 323 Z" fill="url(#boule-brass)"/>
<ellipse cx="291.5" cy="341" rx="4" ry="2" fill="#c48c2e"/><ellipse cx="320" cy="342.6" rx="4.6" ry="2.2" fill="#c48c2e"/><ellipse cx="348.5" cy="341" rx="4" ry="2" fill="#6e4510"/>
<path d="M300 317 C304 323 336 323 340 317 L340 321.4 C336 328 304 328 300 321.4 Z" fill="url(#boule-brass)"/>
<path d="M302 320.6 C308 324.6 320 325 330 323.6" stroke="#fff4c4" stroke-width=".8" fill="none" opacity=".8"/>
</g></g>`;

  // ---------- forearms and hands ----------
  const MAIN_G = `<g data-el="mainG" data-nom="Main gauche">${BODY(`<g class="boule-armL">${forearm([240, 270], [254, 214], 9, 7, 1)}
<g class="boule-handL"><g transform="translate(254 214) rotate(40) scale(1.35)">${handOpen([null, '#8a52ff', null, '#d0204a'])}</g></g></g>`)}</g>`;
  const MAIN_D = `<g data-el="mainD" data-nom="Main droite">${BODY(`<g class="boule-armR boule-armR-down">${forearm([400, 270], [386, 214], 9, 7, 1)}
<g class="boule-handR"><g transform="translate(386 214) scale(-1 1) rotate(40) scale(1.35)">${handOpen([null, '#d0204a', '#3fc8b4', null])}</g></g></g>
<g class="boule-armR-up"><g class="boule-raise">${forearm([430, 182], [466, 148], 9, 7, 1)}
<g transform="translate(466 148) rotate(-43) scale(1.3)">${handPoint()}</g></g></g>`)}</g>`;

  // ---------- light overlays (not draggable) ----------
  const LUMIERES = `<g class="boule-fx" style="pointer-events:none">
<circle class="boule-fglow" cx="320" cy="284" r="72" fill="url(#boule-halo)"/>
<rect class="boule-dim" x="-10" y="-10" width="660" height="420" fill="#0a0418"/>
<circle class="boule-vflash" cx="320" cy="284" r="320" fill="url(#boule-halo)"/>
<rect x="-10" y="-10" width="660" height="420" fill="url(#boule-vign)"/>
</g>`;

  const SVG = [DEFS, TENTURE, OUVERTURE, LANTERNS, CHEVEUX, ROBE, BRAS_G, BRAS_D, CHALE, TETE, COLLIERS, COIFFE,
    SOURCILS, YEUX, NEZ, BOUCHE, GRAIN, BOUCLES, TABLE, CARTES, BOUGIES, ENCENS, BOULE, MAIN_G, MAIN_D, LUMIERES].join('\n');

  // ---------- motion ----------
  // Signature curves: S = sine in-out for every loop, O = decelerate for spatial moves,
  // B = overshoot on landings, G = gravity (accelerate) for falls. Linear only for the ball's rotation.
  const S = 'cubic-bezier(.37,0,.63,1)', O = 'cubic-bezier(.2,0,0,1)', B = 'cubic-bezier(.175,.885,.32,1.275)', G = 'cubic-bezier(.5,0,.75,0)';
  const p = '.p-boule';
  const fly = [[-58, 150, -200], [-26, 176, -120], [6, 192, 95], [40, 168, 165], [74, 142, 250]];
  const CSS = `
${p} .boule-body,${p} .boule-head,${p} .boule-armL,${p} .boule-armR,${p} .boule-handL,${p} .boule-handR,${p} .boule-raise,${p} .boule-eyeL,${p} .boule-eyeR,${p} .boule-browL,${p} .boule-browR,${p} .boule-jaw,${p} .boule-coiffe,${p} .boule-neck,${p} .boule-swirl,${p} .boule-swirl2,${p} .boule-ballrig,${p} .boule-ghost,${p} .boule-card,${p} .boule-halo,${p} .boule-fglow,${p} .boule-pool{transform-box:view-box}
${p} .boule-body{transform-origin:320px 335px;animation:boule-breathe 3.8s ${S} infinite}
${p} .boule-head{transform-origin:320px 172px;animation:boule-hidle 7.3s ${S} infinite}
${p} .boule-face{transform:translate(calc(var(--look, 0) * 1.4px),0)}
${p} .boule-pupils{transform:translate(calc(var(--look, 0) * 2.6px),0)}
${p} .boule-dart{animation:boule-dart 6.1s ${S} infinite}
${p} .boule-irisS{transform-box:fill-box;transform-origin:50% 50%}
${p} .boule-lid{transform:translateY(4.6px);animation:boule-blink 4.7s ${S} infinite}
${p} .boule-eyeL{transform-origin:305px 109px}${p} .boule-eyeR{transform-origin:335px 109px}
${p} .boule-browL{transform-origin:303px 98px}${p} .boule-browR{transform-origin:337px 98px}
${p} .boule-jaw{transform-origin:320px 141px}
${p} .boule-coiffe{transform-origin:320px 86px}
${p} .boule-neck{transform-origin:320px 178px}
${p} .boule-coin,${p} .boule-ear{transform-box:fill-box;transform-origin:50% 0}
${p} .boule-coin{animation:boule-coin 2.3s ${S} infinite}
${p} .boule-ear{animation:boule-ear 2.7s ${S} infinite}
${p} .boule-ear2{animation-duration:3.1s;animation-delay:-1.2s}
${p} .boule-armL{transform-origin:262px 190px;animation:boule-armL 4.6s ${S} infinite}
${p} .boule-armR{transform-origin:378px 190px;animation:boule-armR 5.3s ${S} -1.4s infinite}
${p} .boule-handL{transform-origin:254px 214px;animation:boule-hand 2.9s ${S} infinite}
${p} .boule-handR{transform-origin:386px 214px;animation:boule-handR 3.4s ${S} -.9s infinite}
${p} .boule-armR-up{display:none}
${p} .boule-raise{transform-origin:380px 192px}
${p} .boule-mouth>g{display:none}
${p}.mood-repos .boule-m-repos,${p}.mood-louche .boule-m-louche,${p}.mood-rire .boule-m-rire,${p}.mood-victoire .boule-m-victoire,${p}.mood-decu .boule-m-decu,${p}.mood-surprise .boule-m-surprise{display:inline}
${p} .boule-swirl{transform-origin:320px 284px;animation:boule-spin 11s linear infinite}
${p} .boule-swirl2{transform-origin:320px 284px;animation:boule-spin 7s linear infinite reverse}
${p} .boule-core{animation:boule-core 3.4s ${S} infinite}
${p} .boule-halo{transform-origin:320px 284px;animation:boule-halo 4.2s ${S} infinite}
${p} .boule-fglow{transform-origin:320px 284px;opacity:.45;animation:boule-fglow 4.2s ${S} infinite}
${p} .boule-pool{transform-origin:320px 342px;animation:boule-halo 4.2s ${S} infinite}
${p} .boule-ghost{transform-origin:320px 290px;opacity:0}
${p} .boule-fog,${p} .boule-bflash,${p} .boule-dim,${p} .boule-vflash{opacity:0}
${p} .boule-crack{opacity:0;stroke-dasharray:70;stroke-dashoffset:70}
${p} .boule-ballrig{transform-origin:320px 330px}
${p} .boule-card{transform-origin:232px 352px}
${p} .boule-flame,${p} .boule-flameW{transform-box:fill-box;transform-origin:50% 100%}
${p} .boule-flame{animation:boule-flick 1.1s ${S} infinite}
${p} .boule-cglow{animation:boule-glow 1.3s ${S} infinite}
${p} .boule-lantern{transform-box:fill-box;transform-origin:50% 0;animation:boule-lant 5.6s ${S} infinite}
${p} .boule-lantern2{animation-duration:6.5s;animation-delay:-2.2s}
${p} .boule-lpane{animation:boule-lpane 1.7s ${S} infinite}
${p} .boule-lglow{animation:boule-glow 2.1s ${S} infinite}
${p} .boule-star{animation:boule-tw 2.6s ${S} infinite}
${p} .boule-moon{animation:boule-moon 9s ${S} infinite}
${p} .boule-wisp{animation:boule-wisp 4.8s ${S} infinite}
${p} .boule-ember{animation:boule-glow 1.6s ${S} infinite}
@keyframes boule-breathe{0%,100%{transform:translate(0,0) scale(1,1)}50%{transform:translate(0,-1.4px) scale(1.006,1.014)}}
@keyframes boule-hidle{0%,100%{transform:rotate(-1.2deg)}38%{transform:rotate(1.1deg) translate(0,-.6px)}70%{transform:rotate(-.3deg) translate(.6px,.3px)}}
@keyframes boule-dart{0%,30%{transform:translate(0,0)}34%,54%{transform:translate(-1.5px,.3px)}58%,80%{transform:translate(1.2px,-.2px)}84%,100%{transform:translate(0,0)}}
@keyframes boule-blink{0%,87%,100%{transform:translateY(4.6px)}90.5%{transform:translateY(13px)}94%{transform:translateY(5px)}}
@keyframes boule-coin{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes boule-ear{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes boule-armL{0%,100%{transform:rotate(0)}50%{transform:rotate(-2.6deg)}}
@keyframes boule-armR{0%,100%{transform:rotate(0)}50%{transform:rotate(2.6deg)}}
@keyframes boule-hand{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(6deg)}}
@keyframes boule-handR{0%,100%{transform:rotate(5deg)}50%{transform:rotate(-6deg)}}
@keyframes boule-spin{to{transform:rotate(360deg)}}
@keyframes boule-core{0%,100%{opacity:.4}50%{opacity:.8}}
@keyframes boule-halo{0%,100%{opacity:.75;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}
@keyframes boule-fglow{0%,100%{opacity:.35}50%{opacity:.55}}
@keyframes boule-flick{0%,100%{transform:scale(1,1) skewX(0)}22%{transform:scale(.93,1.09) skewX(3deg)}47%{transform:scale(1.05,.93) skewX(-2deg)}72%{transform:scale(.97,1.05) skewX(2deg)}}
@keyframes boule-glow{0%,100%{opacity:.85}30%{opacity:1}55%{opacity:.68}80%{opacity:.95}}
@keyframes boule-lant{0%,100%{transform:rotate(-2.4deg)}50%{transform:rotate(2.4deg)}}
@keyframes boule-lpane{0%,100%{opacity:.15}40%{opacity:.45}70%{opacity:.25}}
@keyframes boule-tw{0%,100%{opacity:.2}50%{opacity:1}}
@keyframes boule-moon{0%,100%{opacity:.9}50%{opacity:1}}
@keyframes boule-wisp{0%{opacity:0;transform:translate(0,4px)}30%{opacity:.6}100%{opacity:0;transform:translate(3px,-14px)}}

/* louche: she leans over the ball, it answers with light */
${p}.mood-louche .boule-body{animation:boule-bLouche 1s ${O} forwards}
@keyframes boule-bLouche{0%{transform:none;animation-timing-function:${S}}12%{transform:translate(0,-2px) scale(1,1.008);animation-timing-function:${O}}100%{transform:translate(0,7px) scale(1.035)}}
${p}.mood-louche .boule-head{animation:boule-hLouche 1.1s ${B} .06s both}
@keyframes boule-hLouche{0%{transform:none}100%{transform:translate(calc(var(--look, 0) * 3px),2px) rotate(calc(3deg + var(--look, 0) * 3deg))}}
${p}.mood-louche .boule-pupils{transform:translate(calc(var(--look, 0) * 3.8px),.5px)}
${p}.mood-louche .boule-lid{animation:boule-lidTo 0.35s ${O} forwards;--lid:5.8px}
${p}.mood-louche .boule-lowlid{animation:boule-lowTo .35s ${O} forwards;--low:-1.8px}
@keyframes boule-lidTo{from{transform:translateY(4.6px)}to{transform:translateY(var(--lid))}}
@keyframes boule-lowTo{from{transform:none}to{transform:translateY(var(--low))}}
${p}.mood-louche .boule-browL{animation:boule-brLlouche .5s ${B} forwards}
${p}.mood-louche .boule-browR{animation:boule-brRlouche .5s ${B} .08s both}
@keyframes boule-brLlouche{to{transform:translate(0,1.6px) rotate(7deg)}}
@keyframes boule-brRlouche{to{transform:translate(0,-3.4px) rotate(-4deg)}}
${p}.mood-louche .boule-armL{animation:boule-armLlouche 1s ${O} forwards}
${p}.mood-louche .boule-armR{animation:boule-armRlouche 1s ${O} forwards}
@keyframes boule-armLlouche{0%{transform:none}15%{transform:rotate(2deg)}100%{transform:rotate(-5deg)}}
@keyframes boule-armRlouche{0%{transform:none}15%{transform:rotate(-2deg)}100%{transform:rotate(5deg)}}
${p}.mood-louche .boule-handL{animation:boule-hand 1.2s ${S} infinite}
${p}.mood-louche .boule-handR{animation:boule-handR 1.35s ${S} infinite}
${p}.mood-louche .boule-halo{animation:boule-haloUp 1.2s ${O} forwards}
${p}.mood-louche .boule-fglow{animation:boule-fglowUp 1.2s ${O} forwards}
${p}.mood-louche .boule-core{animation:boule-coreUp .9s ${S} infinite alternate}
${p}.mood-louche .boule-swirl{animation-duration:3.2s}
@keyframes boule-haloUp{0%{opacity:.8;transform:scale(1)}100%{opacity:1;transform:scale(1.25)}}
@keyframes boule-fglowUp{to{opacity:1}}
@keyframes boule-coreUp{from{opacity:.7}to{opacity:1}}

/* rire: throaty laugh, the jewellery jingles behind the body */
${p}.mood-rire .boule-body{animation:boule-bRireIn .22s ${O} both,boule-bRire .34s ${S} .22s infinite alternate}
${p}.mood-rire .boule-head{animation:boule-hRireIn .26s ${O} both,boule-hRire .34s ${S} .27s infinite alternate}
@keyframes boule-bRireIn{0%{transform:none}100%{transform:translate(0,1.5px) scale(1.01,.99)}}
@keyframes boule-bRire{from{transform:translate(0,1px) scale(1,1)}to{transform:translate(0,-3px) scale(1.008,.992)}}
@keyframes boule-hRireIn{0%{transform:none}100%{transform:rotate(-5deg) translate(0,-2px)}}
@keyframes boule-hRire{from{transform:rotate(-5deg) translate(0,-2px)}to{transform:rotate(-8deg) translate(0,-4px)}}
${p}.mood-rire .boule-lid{animation:boule-lidTo .2s ${O} forwards;--lid:9px}
${p}.mood-rire .boule-lowlid{animation:boule-lowTo .2s ${O} forwards;--low:-4.2px}
${p}.mood-rire .boule-browL,${p}.mood-rire .boule-browR{animation:boule-brUp .3s ${B} forwards}
@keyframes boule-brUp{to{transform:translateY(-3px)}}
${p}.mood-rire .boule-jaw{animation:boule-jaw .17s ${S} infinite alternate}
@keyframes boule-jaw{from{transform:scaleY(.82)}to{transform:scaleY(1.06)}}
${p}.mood-rire .boule-coin{animation:boule-jingle .2s ${S} infinite alternate}
@keyframes boule-jingle{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}
${p}.mood-rire .boule-ear{animation:boule-jingle2 .34s ${S} .08s infinite alternate}
@keyframes boule-jingle2{from{transform:rotate(-16deg)}to{transform:rotate(18deg)}}
${p}.mood-rire .boule-neck{animation:boule-neckB .34s ${S} .1s infinite alternate}
@keyframes boule-neckB{from{transform:translate(0,.6px)}to{transform:translate(0,-2.6px) rotate(1deg)}}
${p}.mood-rire .boule-coiffe{animation:boule-coifB .34s ${S} .07s infinite alternate}
@keyframes boule-coifB{from{transform:translate(0,0)}to{transform:translate(0,-1.8px) rotate(-1deg)}}
${p}.mood-rire .boule-armL{animation:boule-armRire .34s ${S} .04s infinite alternate}
${p}.mood-rire .boule-armR{animation:boule-armRireR .34s ${S} .04s infinite alternate}
@keyframes boule-armRire{from{transform:rotate(1deg)}to{transform:rotate(-3deg)}}
@keyframes boule-armRireR{from{transform:rotate(-1deg)}to{transform:rotate(3deg)}}
${p}.mood-rire .boule-handL{animation:boule-hand .5s ${S} infinite}
${p}.mood-rire .boule-handR{animation:boule-handR .56s ${S} infinite}

/* victoire: wind-up, the arm snaps up to point, the ball flashes and a face appears in it */
${p}.mood-victoire .boule-body{animation:boule-bVic 1.1s linear forwards}
@keyframes boule-bVic{0%{transform:none;animation-timing-function:${S}}12%{transform:translate(0,4px) scale(1.01,.985);animation-timing-function:${O}}38%{transform:translate(0,-9px) scale(.995,1.03);animation-timing-function:${S}}62%{transform:translate(0,-4px);animation-timing-function:${S}}100%{transform:translate(0,-5px) scale(1.01)}}
${p}.mood-victoire .boule-head{animation:boule-hVic 1.2s linear .06s both}
@keyframes boule-hVic{0%{transform:none;animation-timing-function:${S}}12%{transform:rotate(2deg) translate(0,2px);animation-timing-function:${O}}40%{transform:rotate(-6deg) translate(0,-3px);animation-timing-function:${S}}100%{transform:rotate(-3.5deg) translate(0,-2px)}}
${p}.mood-victoire .boule-armR-down{display:none}
${p}.mood-victoire .boule-armR-up{display:inline}
${p}.mood-victoire .boule-raise{animation:boule-raise 1s linear forwards}
@keyframes boule-raise{0%{transform:rotate(46deg);animation-timing-function:${S}}14%{transform:rotate(54deg);animation-timing-function:${O}}46%{transform:rotate(-8deg);animation-timing-function:${S}}66%{transform:rotate(3deg);animation-timing-function:${S}}100%{transform:rotate(0)}}
${p}.mood-victoire .boule-armL{animation:boule-armLvic 1s ${O} forwards}
@keyframes boule-armLvic{0%{transform:none}14%{transform:rotate(-1.5deg)}100%{transform:rotate(2deg)}}
${p}.mood-victoire .boule-handL{animation:boule-hand .6s ${S} infinite}
${p}.mood-victoire .boule-lid{animation:boule-lidTo .25s ${O} .1s both;--lid:-1px}
${p}.mood-victoire .boule-browL{animation:boule-brLvic .5s ${B} .1s both}
${p}.mood-victoire .boule-browR{animation:boule-brRvic .5s ${B} .14s both}
@keyframes boule-brLvic{to{transform:translate(0,-4px) rotate(4deg)}}
@keyframes boule-brRvic{to{transform:translate(0,-4px) rotate(-4deg)}}
${p}.mood-victoire .boule-ghost{animation:boule-ghost 1.6s linear forwards}
@keyframes boule-ghost{0%,22%{opacity:0;transform:scale(.4);animation-timing-function:${O}}46%{opacity:.95;transform:scale(1.08);animation-timing-function:${S}}62%{transform:scale(.97);animation-timing-function:${S}}100%{opacity:.8;transform:scale(1)}}
${p}.mood-victoire .boule-bflash{animation:boule-bflash 1s ${O} forwards}
@keyframes boule-bflash{0%,18%{opacity:0}24%{opacity:1}70%,100%{opacity:0}}
${p}.mood-victoire .boule-vflash{animation:boule-vflash 1.3s ${O} forwards}
@keyframes boule-vflash{0%,18%{opacity:0}27%{opacity:.85}100%{opacity:0}}
${p}.mood-victoire .boule-halo{animation:boule-haloVic 1.2s ${O} forwards}
@keyframes boule-haloVic{0%,18%{opacity:.8;transform:scale(1)}30%{opacity:1;transform:scale(1.5)}100%{opacity:1;transform:scale(1.25)}}
${p}.mood-victoire .boule-fglow{animation:boule-fglowUp .6s ${O} .2s both}
${p}.mood-victoire .boule-swirl{animation-duration:2.4s}
${p}.mood-victoire .boule-coin{animation:boule-coinDamp 1.4s ${S} forwards}
@keyframes boule-coinDamp{0%{transform:none}20%{transform:rotate(-22deg)}38%{transform:rotate(15deg)}56%{transform:rotate(-9deg)}74%{transform:rotate(5deg)}90%{transform:rotate(-2deg)}100%{transform:none}}
${p}.mood-victoire .boule-ear{animation:boule-earDamp 1.5s ${S} .1s both}
@keyframes boule-earDamp{0%{transform:none}18%{transform:rotate(24deg)}36%{transform:rotate(-17deg)}54%{transform:rotate(10deg)}72%{transform:rotate(-5deg)}88%{transform:rotate(2deg)}100%{transform:none}}
${p}.mood-victoire .boule-coiffe{animation:boule-coifVic .9s ${S} .12s both}
@keyframes boule-coifVic{0%{transform:none}30%{transform:translate(0,1.6px)}50%{transform:translate(0,-3px)}70%{transform:translate(0,.6px)}100%{transform:none}}
${p}.mood-victoire .boule-neck{animation:boule-neckJolt .9s ${S} .1s both}
@keyframes boule-neckJolt{0%{transform:none}30%{transform:translate(0,3px)}60%{transform:translate(0,-1.4px)}100%{transform:none}}

/* decu: inhale, long sigh; the ball fogs, cracks, heals; the candles bow down */
${p}.mood-decu .boule-body{animation:boule-bDecu 1.7s linear forwards}
@keyframes boule-bDecu{0%{transform:none;animation-timing-function:${S}}28%{transform:translate(0,-3px) scale(1.01,1.022);animation-timing-function:cubic-bezier(.45,0,.55,1)}62%{transform:translate(0,6px) scale(1,.97);animation-timing-function:${S}}100%{transform:translate(0,5px) scale(1,.975)}}
${p}.mood-decu .boule-head{animation:boule-hDecu 1.8s linear .08s both}
@keyframes boule-hDecu{0%{transform:none;animation-timing-function:${S}}28%{transform:rotate(-2deg) translate(0,-2px);animation-timing-function:cubic-bezier(.45,0,.55,1)}66%{transform:rotate(5deg) translate(1px,5px);animation-timing-function:${S}}100%{transform:rotate(4deg) translate(1px,4px)}}
${p}.mood-decu .boule-lid{animation:boule-lidDecu 1.8s ${S} forwards}
@keyframes boule-lidDecu{0%{transform:translateY(4.6px)}24%{transform:translateY(3.4px)}38%,64%{transform:translateY(13px)}100%{transform:translateY(8.2px)}}
${p}.mood-decu .boule-browL{animation:boule-brLdecu .7s ${S} forwards}
${p}.mood-decu .boule-browR{animation:boule-brRdecu .7s ${S} forwards}
@keyframes boule-brLdecu{to{transform:translate(0,-1.2px) rotate(-9deg)}}
@keyframes boule-brRdecu{to{transform:translate(0,-1.2px) rotate(9deg)}}
${p}.mood-decu .boule-armL{animation:boule-armLdecu 1.6s ${S} forwards}
${p}.mood-decu .boule-armR{animation:boule-armRdecu 1.6s ${S} forwards}
@keyframes boule-armLdecu{0%{transform:none}28%{transform:rotate(-1.5deg)}100%{transform:rotate(5deg)}}
@keyframes boule-armRdecu{0%{transform:none}28%{transform:rotate(1.5deg)}100%{transform:rotate(-5deg)}}
${p}.mood-decu .boule-handL{animation:boule-handLdecu 1.7s ${S} .1s both}
${p}.mood-decu .boule-handR{animation:boule-handRdecu 1.7s ${S} .14s both}
@keyframes boule-handLdecu{0%{transform:none}30%{transform:rotate(-6deg)}100%{transform:rotate(28deg)}}
@keyframes boule-handRdecu{0%{transform:none}30%{transform:rotate(6deg)}100%{transform:rotate(-28deg)}}
${p}.mood-decu .boule-ear{animation:boule-ear 4.2s ${S} infinite}
${p}.mood-decu .boule-neck{animation:boule-neckDecu 1.7s ${S} .12s both}
@keyframes boule-neckDecu{0%{transform:none}70%{transform:translate(0,1.4px)}100%{transform:translate(0,1px)}}
${p}.mood-decu .boule-fog{animation:boule-fog 2.6s ${S} forwards}
@keyframes boule-fog{0%{opacity:0}35%{opacity:.88}100%{opacity:.8}}
${p}.mood-decu .boule-crack{animation:boule-crack 2.8s linear forwards}
@keyframes boule-crack{0%,22%{opacity:0;stroke-dashoffset:70;animation-timing-function:${O}}26%{opacity:1}42%{stroke-dashoffset:0}66%{opacity:1;stroke-dashoffset:0;animation-timing-function:${S}}90%,100%{opacity:0;stroke-dashoffset:-70}}
${p}.mood-decu .boule-swirl{animation-duration:26s}
${p}.mood-decu .boule-core{animation:boule-dimTo 1.2s ${S} forwards;--to:.1}
${p}.mood-decu .boule-halo{animation:boule-dimTo 1.4s ${S} forwards;--to:.3}
${p}.mood-decu .boule-fglow{animation:boule-dimTo 1.4s ${S} forwards;--to:.08}
${p}.mood-decu .boule-dim{animation:boule-dimTo 1.6s ${S} .3s both;--to:.36}
${p}.mood-decu .boule-cglow,${p}.mood-decu .boule-lglow{animation:boule-dimTo 1.2s ${S} .4s forwards;--to:.3}
@keyframes boule-dimTo{to{opacity:var(--to)}}
${p}.mood-decu .boule-flameW{animation:boule-flameDim 1.4s ${S} .35s both}
@keyframes boule-flameDim{0%{transform:none;opacity:1}35%{transform:scale(1.15,.7) skewX(-10deg);opacity:.9}100%{transform:scale(.6);opacity:.55}}

/* surprise: jolt back, eyes pop, the headpiece hops off, the cards fly up */
${p}.mood-surprise .boule-body{animation:boule-bSur .8s linear forwards}
@keyframes boule-bSur{0%{transform:none;animation-timing-function:${S}}12%{transform:translate(0,2.4px) scale(1.01,.985);animation-timing-function:${O}}34%{transform:translate(0,-8px) scale(.985,1.03);animation-timing-function:${S}}62%{transform:translate(0,-3px);animation-timing-function:${S}}100%{transform:translate(0,-4px)}}
${p}.mood-surprise .boule-head{animation:boule-hSur .9s linear .04s both}
@keyframes boule-hSur{0%{transform:none;animation-timing-function:${S}}12%{transform:translate(0,2px);animation-timing-function:${O}}32%{transform:translate(0,-8px) rotate(-3deg);animation-timing-function:${S}}100%{transform:translate(0,-4px) rotate(-1.5deg)}}
${p}.mood-surprise .boule-eyeL,${p}.mood-surprise .boule-eyeR{animation:boule-eyePop .7s ${B} .1s both}
@keyframes boule-eyePop{0%{transform:scale(1)}35%{transform:scale(1.34)}100%{transform:scale(1.16)}}
${p}.mood-surprise .boule-lid{animation:boule-lidTo .12s ${O} .08s both;--lid:-1.6px}
${p}.mood-surprise .boule-lowlid{animation:boule-lowTo .12s ${O} .08s both;--low:1.6px}
${p}.mood-surprise .boule-irisS{animation:boule-iris .3s ${O} .1s both}
@keyframes boule-iris{to{transform:scale(.72)}}
${p}.mood-surprise .boule-browL{animation:boule-brSurL .5s ${B} .06s both}${p}.mood-surprise .boule-browR{animation:boule-brSurR .5s ${B} .1s both}
@keyframes boule-brSurL{to{transform:translateY(-4.5px) rotate(-7deg)}}@keyframes boule-brSurR{to{transform:translateY(-4.5px) rotate(7deg)}}
${p}.mood-surprise .boule-coiffe{animation:boule-hop 1.3s linear .1s both}
@keyframes boule-hop{0%{transform:none;animation-timing-function:${O}}20%{transform:translate(0,-26px) rotate(-7deg);animation-timing-function:${S}}34%{transform:translate(0,-29px) rotate(4deg);animation-timing-function:${G}}52%{transform:translate(0,0) scale(1.05,.9);animation-timing-function:${O}}64%{transform:translate(0,-5px) scale(.98,1.03);animation-timing-function:${S}}78%{transform:none}100%{transform:none}}
${p}.mood-surprise .boule-ear{animation:boule-swing 1.7s ${S} .08s both}
@keyframes boule-swing{0%{transform:none}12%{transform:rotate(40deg)}28%{transform:rotate(-32deg)}44%{transform:rotate(22deg)}60%{transform:rotate(-13deg)}76%{transform:rotate(7deg)}90%{transform:rotate(-3deg)}100%{transform:none}}
${p}.mood-surprise .boule-coin{animation:boule-coinDamp 1.3s ${S} .1s both}
${p}.mood-surprise .boule-neck{animation:boule-neckJolt .8s ${S} .1s both}
${p}.mood-surprise .boule-armL{animation:boule-armLsur .8s ${O} forwards}
${p}.mood-surprise .boule-armR{animation:boule-armRsur .8s ${O} forwards}
@keyframes boule-armLsur{0%{transform:none}12%{transform:rotate(-2deg)}34%{transform:rotate(7deg)}100%{transform:rotate(5deg)}}
@keyframes boule-armRsur{0%{transform:none}12%{transform:rotate(2deg)}34%{transform:rotate(-7deg)}100%{transform:rotate(-5deg)}}
${p}.mood-surprise .boule-handL{animation:boule-handLsur .7s ${B} .06s both}
${p}.mood-surprise .boule-handR{animation:boule-handRsur .7s ${B} .08s both}
@keyframes boule-handLsur{0%{transform:none}35%{transform:rotate(-26deg)}100%{transform:rotate(-18deg)}}
@keyframes boule-handRsur{0%{transform:none}35%{transform:rotate(26deg)}100%{transform:rotate(18deg)}}
${p}.mood-surprise .boule-ballrig{animation:boule-ballHop .9s linear .1s both}
@keyframes boule-ballHop{0%{transform:none;animation-timing-function:${O}}20%{transform:translate(0,-7px);animation-timing-function:${G}}40%{transform:none;animation-timing-function:${O}}52%{transform:translate(0,-2px);animation-timing-function:${G}}64%,100%{transform:none}}
${fly.map(([dx, dy, r], i) => `${p}.mood-surprise .boule-card${i}{animation:boule-fly${i} 1.6s linear ${R(0.06 + i * 0.05)}s both}
@keyframes boule-fly${i}{0%{transform:none;animation-timing-function:${O}}36%{transform:translate(${dx}px,-${dy}px) rotate(${r}deg) scale(1,1.8);animation-timing-function:${S}}52%{transform:translate(${R(dx * 1.25)}px,-${R(dy * 0.86)}px) rotate(${R(r * 1.4)}deg) scale(1,1.7);animation-timing-function:${G}}84%{transform:translate(0,0) rotate(${Math.round(r * 2 / 360) * 360}deg) scale(1,1);animation-timing-function:${O}}91%{transform:translate(0,-3px) rotate(${Math.round(r * 2 / 360) * 360}deg)}100%{transform:rotate(${Math.round(r * 2 / 360) * 360}deg)}}`).join('\n')}
`;

  const u = '.ui-boule';
  const UI_CSS = `
${u}{container-type:inline-size;background:radial-gradient(120% 90% at 50% 0%,#3a1a52 0%,#1a0b26 55%,#0e0616 100%);color:#f3e6c4;font-family:Barlow,system-ui,sans-serif}
${u} .ui-boule-root{position:relative;padding:18px 20px 20px;border:1px solid #6b4a1e;border-radius:10px;background-image:radial-gradient(1.2px 1.2px at 8% 18%,#fff9 50%,transparent 51%),radial-gradient(1px 1px at 22% 70%,#fff7 50%,transparent 51%),radial-gradient(1.4px 1.4px at 47% 9%,#ffe7a0 50%,transparent 51%),radial-gradient(1px 1px at 68% 88%,#fff7 50%,transparent 51%),radial-gradient(1.2px 1.2px at 91% 30%,#fff9 50%,transparent 51%)}
${u} .ui-boule-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}
${u} .ui-boule-ttl small{display:block;font:700 11px/1 Barlow,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#c9a0ff;margin-bottom:6px}
${u} .ui-boule-ttl b{font:900 clamp(22px,4cqi,32px)/1.05 'Cinzel Decorative',serif;color:#ffe3a0;text-shadow:0 2px 0 #5a3a0c,0 0 18px rgba(255,200,100,.35)}
${u} .ui-boule-timer{display:flex;align-items:flex-end;gap:10px;padding:6px 14px 6px 10px;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid #e2b04c55}
${u} .ui-boule-candle{position:relative;width:26px;height:66px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
${u} .ui-boule-wax{position:relative;display:block;width:15px;height:52px;border-radius:3px 3px 2px 2px;background:linear-gradient(90deg,#fff5dc,#e8cf9e 55%,#a98250);animation:ui-boule-burn 20s linear infinite}
${u} .ui-boule-wax::after{content:"";position:absolute;left:2px;top:0;width:4px;height:10px;border-radius:0 0 3px 3px;background:#fff8e6}
${u} .ui-boule-fl{position:absolute;left:50%;top:-17px;width:10px;height:16px;margin-left:-5px;border-radius:50% 50% 50% 50%/62% 62% 38% 38%;background:radial-gradient(circle at 50% 72%,#fffbe8,#ffd76e 38%,#ff8a1e 72%,rgba(255,120,20,0) 74%);transform-origin:50% 100%;animation:ui-boule-flick 1.05s cubic-bezier(.37,0,.63,1) infinite;filter:drop-shadow(0 0 6px #ffb347)}
${u} .ui-boule-holder{display:block;width:26px;height:7px;border-radius:50%;background:linear-gradient(#ffe7a4,#8a5a16)}
${u} .ui-boule-sec b{display:block;font:900 30px/1 'Cinzel Decorative',serif;color:#ffe3a0}
${u} .ui-boule-sec small{display:block;font:700 10.5px/1 Barlow,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#c9a0ff;margin-top:3px}
${u} .ui-boule-main{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:22px;align-items:start}
${u} .ui-boule-frame{position:relative;margin:0;padding:12px;border-radius:6px;background:linear-gradient(135deg,#6e4810,#f8e08e 18%,#b07a22 38%,#ffeaa8 55%,#8a5e16 78%,#e0b04a);box-shadow:inset 0 0 0 2px #4a2e06,inset 0 0 0 5px rgba(255,236,170,.35),0 14px 30px rgba(0,0,0,.55);animation:ui-boule-in .8s cubic-bezier(.2,0,0,1) both}
${u} .ui-boule-frame::before{content:"";position:absolute;inset:-7px;border-radius:10px;pointer-events:none;background:radial-gradient(circle at 9px 9px,#fff1b0 0 5px,#8a5e16 6px 8px,transparent 9px),radial-gradient(circle at calc(100% - 9px) 9px,#fff1b0 0 5px,#8a5e16 6px 8px,transparent 9px),radial-gradient(circle at 9px calc(100% - 9px),#fff1b0 0 5px,#8a5e16 6px 8px,transparent 9px),radial-gradient(circle at calc(100% - 9px) calc(100% - 9px),#fff1b0 0 5px,#8a5e16 6px 8px,transparent 9px)}
${u} .ui-boule-pic{position:relative;aspect-ratio:4/3;border:3px solid #3a2406;box-shadow:inset 0 0 22px rgba(0,0,0,.65);overflow:hidden;background:#20142a}
${u} .ui-boule-pic svg{display:block;width:100%;height:100%}
${u} .ui-boule-pic::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,240,200,.32) 50%,transparent 65%);transform:translateX(-120%);animation:ui-boule-gleam 6s cubic-bezier(.4,0,.2,1) 1.2s infinite}
${u} .ui-boule-frame figcaption{margin-top:9px;text-align:center;font:900 13px/1.2 'Cinzel Decorative',serif;color:#3a2406;letter-spacing:.03em}
${u} .ui-boule-hint{margin:0 0 10px;font:700 12px/1.3 Barlow,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#c9a0ff}
${u} .ui-boule-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;perspective:900px}
${u} .ui-boule-card{aspect-ratio:5/8;animation:ui-boule-deal .6s cubic-bezier(.2,0,0,1) var(--d) both}
${u} .ui-boule-inner{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .25s cubic-bezier(.2,0,0,1)}
${u} .ui-boule-card:not(.is-voted):hover .ui-boule-inner{transform:translateY(-5px) rotate(-1.5deg)}
${u} .ui-boule-card.is-voted .ui-boule-inner{animation:ui-boule-flip .75s cubic-bezier(.175,.885,.32,1.275) calc(var(--d) + .9s) both}
${u} .ui-boule-face,${u} .ui-boule-back{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:9px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:9px 6px 10px;text-align:center}
${u} .ui-boule-face{background:linear-gradient(#f8ecd0,#e8d3a4);color:#3a2406;box-shadow:inset 0 0 0 2px #b8862c,inset 0 0 0 5px #f8ecd0,inset 0 0 0 6px #b8862c,0 8px 18px rgba(0,0,0,.45)}
${u} .ui-boule-num{font:900 12px/1 'Cinzel Decorative',serif;color:#8a5e16}
${u} .ui-boule-face svg,${u} .ui-boule-rcard svg{width:76%;height:auto;display:block}
${u} .ui-boule-face b{font:900 clamp(14px,2.5cqi,19px)/1 'Cinzel Decorative',serif;color:#2a1604}
${u} .ui-boule-face small{font:700 9.5px/1 Barlow,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8a5e16}
${u} .ui-boule-back{transform:rotateY(180deg);background:radial-gradient(circle at 50% 40%,#5a2a80,#2a1040 70%);color:#ffe3a0;box-shadow:inset 0 0 0 2px #e2b04c,inset 0 0 0 6px #2a1040,inset 0 0 0 7px rgba(226,176,76,.55),0 8px 18px rgba(0,0,0,.45)}
${u} .ui-boule-vt{font:700 10px/1 Barlow,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#c9a0ff}
${u} .ui-boule-back ul{list-style:none;margin:0;padding:0 2px;display:grid;gap:5px;width:100%}
${u} .ui-boule-back li{display:flex;align-items:center;justify-content:center;gap:6px;font:800 12.5px/1 Barlow,sans-serif;color:#fff4dc;background:rgba(0,0,0,.3);border:1px solid rgba(226,176,76,.4);border-radius:99px;padding:4px 6px;animation:ui-boule-chip .35s cubic-bezier(.175,.885,.32,1.275) both;animation-delay:calc(var(--d, 0s) + 1.5s)}
${u} .ui-boule-back li::before{content:"";flex:0 0 9px;height:9px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--c)}
${u} .ui-boule-back b{font:900 15px/1 'Cinzel Decorative',serif}
${u} .ui-boule-reveal{position:relative;margin-top:16px;display:flex;align-items:center;gap:16px;padding:12px 16px;border-radius:12px;background:linear-gradient(90deg,rgba(255,215,120,.16),rgba(140,90,255,.12));border:1px solid rgba(226,176,76,.45);animation:ui-boule-rise .7s cubic-bezier(.2,0,0,1) 1.8s both}
${u} .ui-boule-rcard{position:relative;flex:0 0 70px;aspect-ratio:5/8;border-radius:8px;background:linear-gradient(#f8ecd0,#e8d3a4);box-shadow:inset 0 0 0 2px #b8862c,0 0 0 2px #ffe3a0,0 0 22px 4px rgba(255,210,120,.5);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:6px 4px 7px;color:#2a1604}
${u} .ui-boule-rcard::after{content:"";position:absolute;inset:-14px;border-radius:18px;z-index:-1;background:radial-gradient(closest-side,rgba(255,220,130,.75),rgba(150,100,255,.35) 60%,transparent);animation:ui-boule-pulse 2.6s cubic-bezier(.37,0,.63,1) infinite}
${u} .ui-boule-rcard b{font:900 14px/1 'Cinzel Decorative',serif}
${u} .ui-boule-rtxt b{display:block;font:900 clamp(20px,3.4cqi,28px)/1.1 'Cinzel Decorative',serif;color:#ffe3a0;text-shadow:0 0 16px rgba(255,200,100,.5)}
${u} .ui-boule-rtxt p{margin:5px 0 0;font-size:14px;line-height:1.35;color:#e6d6ff}
@container (max-width:700px){${u} .ui-boule-main{grid-template-columns:1fr}${u} .ui-boule-frame{max-width:420px;width:100%;justify-self:center}}
@container (max-width:470px){${u} .ui-boule-root{padding:14px 12px 16px}${u} .ui-boule-cards{grid-template-columns:repeat(2,minmax(0,1fr));max-width:250px;margin:0 auto}${u} .ui-boule-reveal{flex-wrap:wrap;justify-content:center;text-align:center}}
@keyframes ui-boule-burn{from{height:52px}to{height:12px}}
@keyframes ui-boule-flick{0%,100%{transform:scale(1,1) skewX(0)}25%{transform:scale(.9,1.1) skewX(4deg)}50%{transform:scale(1.06,.92) skewX(-3deg)}75%{transform:scale(.96,1.06) skewX(2deg)}}
@keyframes ui-boule-in{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
@keyframes ui-boule-gleam{0%{transform:translateX(-120%)}30%,100%{transform:translateX(120%)}}
@keyframes ui-boule-deal{0%{opacity:0;transform:translate(-46px,-34px) rotate(-14deg)}100%{opacity:1;transform:none}}
@keyframes ui-boule-flip{0%{transform:rotateY(0)}100%{transform:rotateY(180deg)}}
@keyframes ui-boule-chip{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes ui-boule-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes ui-boule-pulse{0%,100%{opacity:.55;transform:scale(.96)}50%{opacity:1;transform:scale(1.04)}}
@media (prefers-reduced-motion: reduce){${u} *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;

  export const boule: Persona = {
    id: 'boule',
    name: 'Madame Boule',
    svg: SVG,
    css: CSS,
    variants: [
      { famille: 'coiffe', nom: 'Coiffe', choix: [['foulard', 'Foulard à pièces'], ['turban', 'Turban à joyau'], ['libres', 'Cheveux libres avec bandeau']] },
      { famille: 'boucles', nom: "Boucles d'oreilles", choix: [['creoles', 'Grandes créoles'], ['pendants', 'Pendants']] },
      { famille: 'chale', nom: 'Châle', choix: [['brode', 'Brodé or'], ['velours', 'Velours nuit']] },
    ],
    moodLabels: { repos: 'Elle consulte la boule', louche: 'Je vois… je vois…', rire: 'Rire de gorge', victoire: 'Les esprits ont parlé !', decu: 'La boule se trouble', surprise: 'Par les astres !' },
    react: 'louche',
    moments: [
      ["L'image arrive", 'louche', [{ type: 'stars', at: [320, 284], n: 18, color: '215,195,255' }]],
      ['Tout le monde vote', 'surprise'],
      ['Bonne réponse', 'victoire', [{ type: 'confetti', n: 110, colors: ['#ffcf4a', '#b48cff', '#f3e6c4', '#7a5ae0', '#ffffff'], delay: 300 }, { type: 'stars', at: [470, 92], n: 30, delay: 450 }]],
      ["Personne n'a trouvé", 'decu'],
    ],
    ambient: [
      { type: 'smoke', from: [529, 309], density: 0.7, size: 0.7, speed: 0.55, alpha: 0.16, color: '215,200,235' },
      { type: 'stars', box: [505, 74, 92, 170] },
      { type: 'dust', box: [272, 236, 96, 92], density: 0.9, color: '215,195,255' },
      { type: 'dust', box: [92, 70, 80, 110], density: 0.4, color: '255,210,150' },
    ],
    bursts: {
      louche: [{ type: 'stars', at: [320, 272], n: 8, color: '210,190,255' }],
      rire: [{ type: 'sparks', at: [320, 86], n: 14, power: 0.45, color: '255,220,130' }],
      victoire: [{ type: 'flash', delay: 220 }, { type: 'shake', delay: 220 }, { type: 'lines', at: [320, 284], n: 26, color: '220,200,255', delay: 220 }, { type: 'stars', at: [320, 284], n: 40, color: '230,215,255', delay: 260 }, { type: 'sparks', at: [460, 100], n: 30, color: '255,215,120', delay: 420 }],
      decu: [{ type: 'smoke', at: [320, 284], n: 14, alpha: 0.35, color: '170,165,190', delay: 350 }],
      surprise: [{ type: 'lines', at: [320, 112], n: 20 }, { type: 'stars', at: [232, 330], n: 10, delay: 150 }],
    },
    moodMs: 3200,
    worldCss: UI_CSS,
  };
