// @ts-nocheck - the drawing is built by untyped helper code ported unchanged from docs/persos; only the exported object is typed (Persona).
import type { Persona } from '../persona';
// Coach Chrono : la mascotte du jeu de mots en 30 secondes (LiveChatSBCB).
// Arène de nuit, table de marque au premier plan, arbitre-coach avec sablier et planchette.
const f = (n) => Math.round(n * 10) / 10;
const pt = (p) => `${f(p[0])} ${f(p[1])}`;
// Membre effilé de A vers B (largeurs wa et wb), avec un léger galbe musculaire.
// ra / rb : bout arrondi (1) ou coupé net (0), pour les ourlets de manche et les poignets.
function limb(ax, ay, wa, bx, by, wb, bulge = 0, ra = 1, rb = 1) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const a1 = [ax + nx * wa / 2, ay + ny * wa / 2], a2 = [ax - nx * wa / 2, ay - ny * wa / 2];
  const b1 = [bx + nx * wb / 2, by + ny * wb / 2], b2 = [bx - nx * wb / 2, by - ny * wb / 2];
  const mx = (ax + bx) / 2, my = (ay + by) / 2, mw = (wa + wb) / 4 + bulge;
  const c1 = [mx + nx * mw, my + ny * mw], c2 = [mx - nx * mw, my - ny * mw];
  const eb = rb ? `A${f(wb / 2)} ${f(wb / 2)} 0 0 0 ${pt(b2)}` : `Q${pt([bx + ux * 2.5, by + uy * 2.5])} ${pt(b2)}`;
  const ea = ra ? `A${f(wa / 2)} ${f(wa / 2)} 0 0 0 ${pt(a1)}` : `Q${pt([ax - ux * 2.5, ay - uy * 2.5])} ${pt(a1)}`;
  return `M${pt(a1)}Q${pt(c1)} ${pt(b1)}${eb}Q${pt(c2)} ${pt(a2)}${ea}Z`;
}
// Ligne parallèle à A→B, décalée sur la normale (pour les bandes de manche).
function along(ax, ay, bx, by, oa, ob) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  return `M${pt([ax + nx * oa, ay + ny * oa])}L${pt([bx + nx * ob, by + ny * ob])}`;
}
const lerp = (a, b, t) => a + (b - a) * t;
const circ = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
const wrap = (inner, cls) => cls.reduceRight((acc, c) => `<g class="${c}">${acc}</g>`, inner);
const piece = (k, nom, cls, inner) => `<g data-el="${k}" data-nom="${nom}">${wrap(inner, cls)}</g>`;
const V = (fam, v, inner) => `<g data-var="${fam}" data-variante="${v}">${inner}</g>`;
const BODY = ['c-body', 'c-bob'];
const HEAD = [...BODY, 'c-head', 'c-turn'];
const FEAT = [...HEAD, 'c-feat'];
let seed = 20261109;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const EYE_L = 'M296 108C298.5 103.5 304 102 309 102.6C311.5 103 313.5 104.6 314.5 106.8C311 110.6 305 112 300 111C298 110.4 296.8 109.4 296 108Z';
const EYE_R = 'M344 108C341.5 103.5 336 102 331 102.6C328.5 103 326.5 104.6 325.5 106.8C329 110.6 335 112 340 111C342 110.4 343.2 109.4 344 108Z';
const HEAD_D = 'M320 59C341 59 356 72 358 92C359 101 358 108 357 114C356 122 355 129 352 135C348 142 340 148 332 152C328 154 312 154 308 152C300 148 292 142 288 135C285 129 284 122 283 114C282 108 281 101 282 92C284 72 299 59 320 59Z';
const BULB_T = 'M254 192.5C253 207 257 219 265 229.5L266.6 234L269.4 234L271 229.5C279 219 283 207 282 192.5Z';
const BULB_B = 'M254 275.5C253 261 257 249 265 238.5L266.6 234L269.4 234L271 238.5C279 249 283 261 282 275.5Z';

const lg = (id, x2, y2, stops, extra = '') => `<linearGradient id="chrono-${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"${extra}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`;
const rg = (id, cx, cy, r, stops) => `<radialGradient id="chrono-${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`;
const blur = (id, s, m = 50) => `<filter id="chrono-${id}" x="-${m}%" y="-${m}%" width="${100 + 2 * m}%" height="${100 + 2 * m}%"><feGaussianBlur stdDeviation="${s}"/></filter>`;

const DEFS = `<defs>
${lg('skin', 0, 0, [[0, '#f4c9a3'], [.5, '#d69771'], [1, '#9a5c3c']], ' gradientUnits="userSpaceOnUse" x1="286" y1="72" x2="358" y2="150"').replace('x1="0" y1="0" x2="0" y2="0" ', '')}
${lg('skinA', 1, .25, [[0, '#efbe97'], [.55, '#cf8f68'], [1, '#93573a']])}
${lg('skinH', 1, 1, [[0, '#f1c29c'], [.6, '#d19069'], [1, '#9c5e3e']])}
${lg('finger', 0, 1, [[0, '#f5caa6'], [.55, '#d89772'], [1, '#a5674a']])}
${lg('neck', 1, 0, [[0, '#d2926b'], [.6, '#b8784f'], [1, '#7c4a2f']])}
${rg('puffG', .38, .34, .72, [[0, '#f8cfab'], [.6, '#da9670'], [1, '#a5603f']])}
${lg('limbS', 1, 0, [[0, '#fff', .14], [.45, '#fff', 0], [.6, '#000', 0], [1, '#000', .34]])}
${lg('hairG', 1, 1, [[0, '#4b3a30'], [.55, '#2a201a'], [1, '#16100c']])}
${lg('torsoS', 1, 0, [[0, '#fff', .1], [.35, '#fff', 0], [.62, '#000', .05], [1, '#000', .45]])}
<linearGradient id="chrono-torsoV" gradientUnits="userSpaceOnUse" x1="0" y1="168" x2="0" y2="345"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>
<linearGradient id="chrono-jacket" gradientUnits="userSpaceOnUse" x1="232" y1="150" x2="410" y2="334"><stop offset="0" stop-color="#2f4a92"/><stop offset=".55" stop-color="#1d2c60"/><stop offset="1" stop-color="#0f1739"/></linearGradient>
<linearGradient id="chrono-torsoSU" gradientUnits="userSpaceOnUse" x1="231" y1="0" x2="409" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".62" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
${lg('chrome', 0, 1, [[0, '#fff'], [.35, '#cfd7e0'], [.7, '#6f7a88'], [1, '#dfe6ee']])}
${rg('chromeR', .35, .3, .75, [[0, '#fff'], [.4, '#c3ccd6'], [.8, '#5d6876'], [1, '#9aa5b2']])}
${lg('wood', 1, 0, [[0, '#c58a52'], [.4, '#8e5528'], [1, '#4a2a12']])}
${lg('woodV', 0, 1, [[0, '#c48a50'], [.5, '#8a5226'], [1, '#4f2c12']])}
${lg('glassG', 1, 0, [[0, '#e6f6ff', .45], [.5, '#cfefff', .07], [1, '#e6f6ff', .3]])}
${lg('sand', 0, 1, [[0, '#f6cf7a'], [1, '#c88a36']])}
${lg('board', 1, 1, [[0, '#8f5e34'], [1, '#4c2e16']])}
${lg('ycard', 1, 1, [[0, '#fff06a'], [.55, '#ffcc1c'], [1, '#d99a00']])}
${lg('rcard', 1, 1, [[0, '#ff6a58'], [.55, '#e3202e'], [1, '#9c0d18']])}
${lg('arena', 0, 1, [[0, '#05060d'], [.45, '#111230'], [1, '#1d1936']])}
${lg('floor', 0, 1, [[0, '#6a3f1e'], [.3, '#b67a40'], [1, '#7a4923']])}
${lg('beamG', 0, 1, [[0, '#fff2d0', .36], [1, '#fff2d0', 0]])}
${lg('beamB', 0, 1, [[0, '#d6e6ff', .26], [1, '#d6e6ff', 0]])}
${rg('lampG', .5, .5, .5, [[0, '#fff'], [.45, '#fff6d8'], [1, '#ffd27a', 0]])}
${lg('ttop', 0, 1, [[0, '#353a57'], [1, '#191c2b']])}
${lg('tfront', 0, 1, [[0, '#171a2a'], [1, '#06070c']])}
${rg('red', .4, .3, .7, [[0, '#ff8a7a'], [.5, '#e5232f'], [1, '#7a0a12']])}
${rg('iris', .45, .4, .6, [[0, '#9a7444'], [.6, '#5e3f20'], [1, '#2a1a0c']])}
${lg('capG', 1, 1, [[0, '#454b62'], [.45, '#1d2030'], [1, '#0b0c12']])}
${lg('band', 0, 1, [[0, '#ffffff'], [1, '#c9c6bd']])}
${lg('rib', 1, 0, [[0, '#2be3ff', .0], [.5, '#2be3ff', .55], [1, '#ff8a3c', .0]])}
<pattern id="chrono-buzz" width="2.6" height="2.6" patternUnits="userSpaceOnUse"><circle cx=".7" cy=".7" r=".55" fill="#0b0705" opacity=".55"/><circle cx="2" cy="1.9" r=".45" fill="#a88d78" opacity=".3"/></pattern>
<pattern id="chrono-stub" width="2.3" height="2.1" patternUnits="userSpaceOnUse"><circle cx=".6" cy=".6" r=".3" fill="#23140d"/><circle cx="1.75" cy="1.6" r=".28" fill="#23140d"/><circle cx="1.7" cy=".4" r=".22" fill="#23140d"/></pattern>
<pattern id="chrono-terry" width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".6" fill="#000" opacity=".12"/></pattern>
<pattern id="chrono-stripe" width="22" height="10" patternUnits="userSpaceOnUse" x="1"><rect width="22" height="10" fill="#efeee8"/><rect width="11" height="10" fill="#18181d"/></pattern>
<pattern id="chrono-led" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><path d="M0 0H2.4V.8H0ZM0 0H.8V2.4H0Z" fill="#04050a"/></pattern>
${blur('b1', 1.1, 30)}${blur('b2', 2, 40)}${blur('b3', 3)}${blur('b8', 8, 100)}
<filter id="chrono-glow" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="chrono-cEyeL"><path d="${EYE_L}"/></clipPath>
<clipPath id="chrono-cEyeR"><path d="${EYE_R}"/></clipPath>
<clipPath id="chrono-cBulbT"><path d="${BULB_T}"/></clipPath>
<clipPath id="chrono-cBulbB"><path d="${BULB_B}"/></clipPath>
<clipPath id="chrono-cStream"><rect x="265" y="233" width="6" height="30"/></clipPath>
<clipPath id="chrono-cLed"><rect x="141" y="317" width="358" height="36" rx="2"/></clipPath>
<clipPath id="chrono-cCard"><rect x="-22" y="-90" width="44" height="92"/></clipPath>
<clipPath id="chrono-cFace"><path d="${HEAD_D}"/></clipPath>
</defs>`;

// ---------------- Décor : arène de nuit ----------------
function crowd() {
  let out = '', tw = '', cam = '';
  const rows = [116, 134, 152, 170, 188, 206, 224];
  const shirts = ['#191b2e', '#1e2036', '#171829', '#222440'];
  const tints = ['#4a2733', '#22404a', '#4a3f24', '#2e2a4c', '#3c2230'];
  rows.forEach((y, r) => {
    const hr = 3.1 + r * .55, step = hr * 2.75;
    let heads = '', bodies = '', rims = '', tinted = '';
    for (let x = -6 + rnd() * step; x < 652; x += step * (.82 + rnd() * .4)) {
      if (rnd() < .07) continue;
      const hy = y - rnd() * 2.2, hx = x;
      const body = `M${f(hx - hr * 1.9)} ${f(hy + hr * 3.6)}C${f(hx - hr * 2)} ${f(hy + hr * 1.3)} ${f(hx + hr * 2)} ${f(hy + hr * 1.3)} ${f(hx + hr * 1.9)} ${f(hy + hr * 3.6)}Z`;
      if (rnd() < .22) tinted += `<path d="${body}" fill="${tints[Math.floor(rnd() * tints.length)]}" opacity=".75"/>`; else bodies += body;
      heads += circ(hx, hy, hr);
      rims += `M${f(hx - hr * .95)} ${f(hy + hr * .1)}A${f(hr)} ${f(hr)} 0 0 1 ${f(hx + hr * .1)} ${f(hy - hr * .98)}`;
      if (rnd() < .05) tw += `<circle class="c-tw" cx="${f(hx + hr * .9)}" cy="${f(hy + hr * 1.5)}" r="${f(.7 + r * .1)}" fill="#dff4ff" style="animation-delay:-${f(rnd() * 3)}s"/>`;
      if (rnd() < .06) cam += `<path class="c-cam" d="M${f(hx)} ${f(hy - 6)}L${f(hx + 1.3)} ${f(hy - 1.3)}L${f(hx + 6)} ${f(hy)}L${f(hx + 1.3)} ${f(hy + 1.3)}L${f(hx)} ${f(hy + 6)}L${f(hx - 1.3)} ${f(hy + 1.3)}L${f(hx - 6)} ${f(hy)}L${f(hx - 1.3)} ${f(hy - 1.3)}Z" fill="#fff" style="animation-delay:-${f(rnd() * .7)}s"/>`;
    }
    out += `<g class="c-crowd c-row${r % 3}"><rect x="0" y="${f(y + hr * 2.6)}" width="640" height="${f(hr * 1.4)}" fill="#10111d"/>`
      + `<path d="${bodies}" fill="${shirts[r % 4]}"/>${tinted}<path d="${heads}" fill="#131427"/>`
      + `<path d="${rims}" stroke="#ffd9a6" stroke-width=".8" opacity="${f(.22 + r * .03)}" fill="none"/></g>`;
  });
  return { out, tw, cam };
}
const CROWD = crowd();

let truss = '';
for (let x = 0; x <= 640; x += 32) truss += `M${x} 6L${x + 16} 30L${x + 32} 6`;
const TRIBUNES = piece('tribunes', 'Tribunes et public', [], `
<rect width="640" height="400" fill="#07080f"/>
<rect width="640" height="250" fill="url(#chrono-arena)"/>
<g stroke="#2b2e4a" stroke-width="1.2" fill="none" opacity=".7"><path d="M0 6H640M0 30H640"/><path d="${truss}" opacity=".6"/></g>
<g fill="#ffe7b8" opacity=".55">${[90, 230, 410, 560].map((x) => `<circle cx="${x}" cy="31" r="1.6"/>`).join('')}</g>
<rect x="0" y="96" width="640" height="16" fill="#0c0d1c"/>
<rect x="0" y="100" width="640" height="7" fill="url(#chrono-rib)" opacity=".7"/>
<rect class="c-sweep" x="0" y="100" width="70" height="7" fill="#fff" opacity=".18"/>
${CROWD.out}
<g>${CROWD.tw}</g><g>${CROWD.cam}</g>
<path d="M0 112H640V236H0Z" fill="url(#chrono-torsoS)" opacity=".5"/>
<ellipse cx="90" cy="160" rx="140" ry="70" fill="#ffd9a0" opacity=".07" filter="url(#chrono-b8)"/>
<rect x="0" y="232" width="640" height="3" fill="#3a3f5c"/>
<rect x="0" y="235" width="640" height="11" fill="#090a12"/>
<rect x="0" y="237" width="640" height="7" fill="url(#chrono-rib)" opacity=".85"/>
<g fill="#06070c">${Array.from({ length: 16 }, (_, i) => `<rect x="${i * 40 + 18}" y="236" width="2" height="10"/>`).join('')}</g>`);

let planks = '';
for (let k = -16; k <= 16; k++) { const xb = 320 + k * 44; planks += `M${f(320 + (xb - 320) * .245)} 246L${f(xb)} 400`; }
const PARQUET = piece('parquet', 'Parquet', [], `
<rect x="0" y="246" width="640" height="154" fill="url(#chrono-floor)"/>
<path d="${planks}" stroke="#3a1f0c" stroke-width=".7" opacity=".38"/>
<g fill="#1d5c66" opacity=".6"><path d="M0 268H124L104 400H0Z"/><path d="M516 268H640V400H536Z"/></g>
<g fill="none" stroke="#f3eee4" stroke-width="2.2" opacity=".78"><path d="M0 268H124L104 400M640 268H516L536 400"/><path d="M0 256H640"/><ellipse cx="320" cy="336" rx="252" ry="46"/></g>
<rect x="0" y="246" width="640" height="10" fill="url(#chrono-rib)" opacity=".35" filter="url(#chrono-b2)"/>
<rect x="66" y="252" width="40" height="150" fill="#fff6dc" opacity=".16" filter="url(#chrono-b8)"/>
<rect x="540" y="252" width="34" height="150" fill="#dce9ff" opacity=".13" filter="url(#chrono-b8)"/>
<rect x="448" y="250" width="36" height="120" fill="#ff8a4a" opacity=".16" filter="url(#chrono-b8)"/>
<path d="M0 330H640V400H0Z" fill="url(#chrono-torsoV)" opacity=".8"/>`);

const TABLEAU = piece('tableau', "Tableau d'affichage", [], `
<path d="M408 0V24M524 0V24" stroke="#2b2e42" stroke-width="1.6"/>
<ellipse cx="466" cy="66" rx="96" ry="54" fill="#ff5a24" opacity=".13" filter="url(#chrono-b8)"/>
<rect x="388" y="22" width="156" height="86" rx="5" fill="#141623" stroke="#3d4260" stroke-width="1.6"/>
<rect x="394" y="28" width="144" height="74" rx="2" fill="#050609"/>
<text x="466" y="39.5" text-anchor="middle" font-family="'Bebas Neue',Impact,sans-serif" font-size="9.5" letter-spacing="1.4" fill="#ffb347">MANCHE 1 · DÉCRIS</text>
<g class="c-digits" filter="url(#chrono-glow)"><text x="466" y="81" text-anchor="middle" font-family="'Bebas Neue',Impact,sans-serif" font-size="44" fill="#ff4d2e">0<tspan class="c-colon">:</tspan>30</text></g>
<g font-family="'Bebas Neue',Impact,sans-serif" text-anchor="middle"><text x="411" y="55" font-size="9" fill="#8fd8ff">TOI</text><text x="411" y="78" font-size="21" fill="#ffc23a">12</text>
<text x="521" y="55" font-size="9" fill="#8fd8ff">LÉO</text><text x="521" y="78" font-size="21" fill="#ffc23a">09</text></g>
<rect x="432" y="88" width="68" height="4" fill="#2a0d07"/><rect class="c-clockbar" x="432" y="88" width="68" height="4" fill="#ff7a2e"/>
<rect x="394" y="28" width="144" height="74" fill="url(#chrono-led)" opacity=".8"/>
<path d="M394 28H476L446 102H394Z" fill="#fff" opacity=".045"/>
<g fill="#5a6080">${[[392, 26], [540, 26], [392, 104], [540, 104]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.3"/>`).join('')}</g>`);

const banner = (x, col, n, cls) => `<g class="${cls}">
<path d="M${x - 3} 4H${x + 35}" stroke="#4a4f6a" stroke-width="2"/><path d="M${x + 2} 0V4M${x + 30} 0V4" stroke="#2b2e42"/>
<path d="M${x} 5H${x + 32}V82L${x + 16} 94L${x} 82Z" fill="${col}"/>
<path d="M${x + 7} 5h4v83l-4-3ZM${x + 22} 5h3v84l-3 2Z" fill="#000" opacity=".22" filter="url(#chrono-b1)"/>
<path d="M${x} 5H${x + 32}V82L${x + 16} 94L${x} 82Z" fill="none" stroke="#d9a441" stroke-width="1.4" opacity=".85"/>
<path d="M${x + 16} 16l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8Z" fill="#e9c46a"/>
<text x="${x + 16}" y="66" text-anchor="middle" font-family="'Bebas Neue',Impact,sans-serif" font-size="27" fill="#f3e6c8">${n}</text>
<path d="M${x + 5} 74H${x + 27}" stroke="#d9a441" stroke-width="1"/></g>`;
const BANDEROLES = piece('banderoles', 'Banderoles', [], banner(150, '#7a1e2c', 1, 'c-ban1') + banner(188, '#1d3566', 2, 'c-ban2') + banner(226, '#16524f', 3, 'c-ban3'));

const lampBank = (x, y, rot) => `<g transform="rotate(${rot} ${x + 48} ${y + 14})">
<rect x="${x}" y="${y}" width="96" height="28" rx="3" fill="#1b1d2b" stroke="#3c4058"/>
${[0, 1].map((r) => [0, 1, 2, 3, 4].map((c) => `<circle cx="${x + 12 + c * 18}" cy="${y + 8 + r * 12}" r="5" fill="url(#chrono-lampG)"/>`).join('')).join('')}</g>`;
const PROJOS = piece('projos', 'Projecteurs', [], `
<path class="c-beamL" d="M44 36L124 30L340 330L92 372Z" fill="url(#chrono-beamG)"/>
<path class="c-beamR" d="M516 30L596 36L560 372L330 330Z" fill="url(#chrono-beamB)"/>
<circle cx="78" cy="24" r="46" fill="#fff4d6" opacity=".28" filter="url(#chrono-b8)"/>
<circle cx="562" cy="24" r="40" fill="#dce9ff" opacity=".22" filter="url(#chrono-b8)"/>
${lampBank(30, 10, 9)}${lampBank(514, 10, -9)}`);

// La planchette posée sur la table (quand il a besoin de sa main gauche).
const BOARD_DOWN = `<g class="c-Bp c-Bp-down"><g transform="translate(440 295)">
<path d="M-38 5L32 5L37 -4L-31 -4Z" fill="#3a2410"/><path d="M-38 5L32 5L32.5 7L-38 7Z" fill="#24160a"/>
<path d="M-33 3.6L27 3.6L31 -2.8L-26 -2.8Z" fill="#efeadf"/>
<path d="M-28 1.6H24M-25 -.6H26" stroke="#9bb3c9" stroke-width=".6"/>
<path d="M-12 -4.5L-7 -11L4 -11L1 -4.5Z" fill="url(#chrono-ycard)"/>
<path d="M-6 -5h12l1 -2h-12z" fill="url(#chrono-chrome)"/></g></g>`;

const TABLE = piece('table', 'Table de marque', [], `
<ellipse cx="320" cy="289" rx="150" ry="5" fill="#000" opacity=".5" filter="url(#chrono-b3)"/>
<path d="M140 288H500L514 303H126Z" fill="url(#chrono-ttop)"/>
<path d="M210 289.5H430L436 297H204Z" fill="#9fd8ff" opacity=".06"/>
${BOARD_DOWN}
<g transform="translate(176 292)"><path d="M-22 2L16 2L20 -3L-18 -3Z" fill="#d9d2c2"/><path d="M-22 0L16 0L20 -5L-18 -5Z" fill="#ece6d8"/>
<path d="M-14 -4L10 -4L6 -24L-10 -24Z" fill="#f6f1e4"/><path d="M-10 -24L6 -24L4 -26L-8 -26Z" fill="#cfc7b6"/>
<text x="-2" y="-8" text-anchor="middle" font-family="'Archivo Black',Impact,sans-serif" font-size="13" fill="#d8452f">?</text></g>
<g transform="translate(478 291)"><ellipse cx="0" cy="1" rx="16" ry="4.5" fill="#000" opacity=".5"/><path d="M-14 1V-4C-14 -7 14 -7 14 -4V1C14 3 -14 3 -14 1Z" fill="#2a2c3a"/>
<path d="M-10 -5C-10 -16 10 -16 10 -5Z" fill="url(#chrono-red)"/><ellipse cx="-3.5" cy="-11" rx="3" ry="1.6" fill="#fff" opacity=".55"/></g>
<path d="M126 303H514" stroke="#7a83ab" stroke-width="1.4"/>
<rect x="126" y="304" width="388" height="96" fill="url(#chrono-tfront)"/>
<rect x="140" y="316" width="360" height="38" rx="3" fill="#030407" stroke="#22c7d8" stroke-opacity=".45"/>
<g clip-path="url(#chrono-cLed)"><g class="c-ledscroll" font-family="'Bebas Neue',Impact,sans-serif" font-size="25" letter-spacing="2">
${[0, 1, 2].map((r) => ['TROUVÉ !', 'PASSER', '30 SECONDES', 'MANCHE 1'].map((w, i) => `<text x="${150 + r * 680 + i * 170}" y="344" fill="${['#3dff8c', '#ff5a4a', '#ffb020', '#5fe3ff'][i]}">${w}</text>`).join('')).join('')}
</g><rect x="140" y="316" width="360" height="38" fill="url(#chrono-led)"/></g>
<rect x="140" y="316" width="360" height="38" rx="3" fill="#22c7d8" opacity=".05"/>
<text x="320" y="374" text-anchor="middle" font-family="Barlow,'Segoe UI',sans-serif" font-weight="800" font-size="8" letter-spacing="4" fill="#59608a">TABLE DE MARQUE</text>
<path d="M126 304V400M514 304V400" stroke="#2c3048" stroke-width="2"/>`);

const FLARE = `<g class="c-flare" pointer-events="none" style="mix-blend-mode:screen">
<ellipse cx="78" cy="24" rx="130" ry="1.8" fill="#fff4d8" opacity=".55" filter="url(#chrono-b1)"/>
<ellipse cx="78" cy="24" rx="2" ry="40" fill="#fff4d8" opacity=".35" filter="url(#chrono-b1)"/>
<circle cx="167" cy="87" r="9" fill="#ffd9a0" opacity=".1"/><circle cx="214" cy="122" r="4" fill="#9fe0ff" opacity=".14"/>
<path d="M452 284l14 -8 14 8v16l-14 8 -14 -8Z" fill="#9fd0ff" opacity=".06"/><circle cx="560" cy="360" r="26" fill="#ffcf8a" opacity=".05"/></g>`;

// ---------------- La tête ----------------
const OREILLES = piece('oreilles', 'Oreilles', HEAD, `
<path d="M286 99C279 94.5 274 99 274.2 107.5C274.4 116 278 122.5 285 125.5L287 112Z" fill="url(#chrono-skin)"/>
<path d="M283.5 103C279.6 101.4 277.8 104.2 278 108.6C278.2 113.2 280.6 117.6 283.8 119.2" stroke="#8a4b30" stroke-width="1.3" fill="none" opacity=".7"/>
<ellipse cx="281.6" cy="111" rx="2" ry="4.2" fill="#5a2c18" opacity=".28"/>
<path d="M354 99C361 94.5 366 99 365.8 107.5C365.6 116 362 122.5 355 125.5L353 112Z" fill="#a9694a"/>
<path d="M356.5 103C360.4 101.4 362.2 104.2 362 108.6C361.8 113.2 359.4 117.6 356.2 119.2" stroke="#6e3a22" stroke-width="1.3" fill="none" opacity=".7"/>
<path d="M360 98.5C364.5 100 366.2 105 365.6 110.5C365 116 362.5 121 357 124.5" stroke="#a6e9ff" stroke-width="1.1" fill="none" opacity=".55"/>`);

const TETE = piece('tete', 'Tête', HEAD, `
<path d="${HEAD_D}" fill="url(#chrono-skin)"/>
<path d="M342 66C352 72 357 82 358 92C359 101 358 108 357 113L349 113C350 102 349 90 345 80C343 74 341 70 338 66Z" fill="#000" opacity=".15"/>
<ellipse cx="306" cy="76" rx="15" ry="7" fill="#fff" opacity=".13" filter="url(#chrono-b2)"/>
<ellipse cx="295" cy="111" rx="6" ry="3.5" fill="#fff" opacity=".14" filter="url(#chrono-b1)"/>
<g fill="#3a1608" opacity=".2" filter="url(#chrono-b2)"><ellipse cx="305" cy="102.5" rx="10" ry="4"/><ellipse cx="335" cy="102.5" rx="10" ry="4"/></g>
<path d="M307 85C315 83.6 325 83.6 333 85" stroke="#8a5236" stroke-width=".9" fill="none" opacity=".3"/>
<g stroke="#7a432a" stroke-width="1" fill="none" opacity=".32"><path d="M294.5 106.5l-2.8 -1.2M294.6 108.8l-3 .2M345.5 106.5l2.8 -1.2M345.4 108.8l3 .2"/></g>
<path d="M356 82C358.5 92 358.5 104 357 113" stroke="#a6e9ff" stroke-width="1.3" fill="none" opacity=".6"/>
<g class="c-jaw">
<path d="M283 112C283.5 120 285 129 288 135C292 142 300 148 308 152C312 154 328 154 332 152C340 148 348 142 352 135C355 129 356.5 120 357 112Z" fill="url(#chrono-skin)"/>
<path d="M357 112C356.5 120 355 129 352 135C348 142 340 148 332 152C328 154 322 154 318 153.5C330 148 341 138 346 126C348 120 349 116 349 112Z" fill="#000" opacity=".16"/>
<g fill="#3a1608" opacity=".2" filter="url(#chrono-b2)"><path d="M289 120C292 130 297 138 303 143C297 141 291 133 288 124Z"/><path d="M351 120C348 130 343 138 337 143C343 141 349 133 352 124Z"/></g>
<ellipse class="c-mus" cx="347" cy="128" rx="4" ry="6.5" fill="#3a1608" opacity="0" filter="url(#chrono-b1)"/>
<g stroke="#7a432a" stroke-width="1.1" fill="none" opacity=".34"><path d="M311.5 125.5C307 129 305 134 306 140"/><path d="M328.5 125.5C333 129 335 134 334 140"/></g>
<ellipse cx="316" cy="147.5" rx="6" ry="2.2" fill="#fff" opacity=".12"/>
<path d="M320 149v2.6" stroke="#6e3a22" stroke-width=".8" opacity=".3"/>
<path d="M357 113C356.5 121 355 129 352 135C349 140 345 144 340 147.5" stroke="#a6e9ff" stroke-width="1.3" fill="none" opacity=".55"/>
</g>`);

const BARBE = piece('barbe', 'Barbe', [...HEAD, 'c-jaw'], V('barbe', 'trois', `
<g clip-path="url(#chrono-cFace)">
<path d="M285 116C287 127 292 137 300 145C307 151.5 314 154.5 320 154.5C326 154.5 333 151.5 340 145C348 137 353 127 355 116C350 123 344 127 337 129C333 134 327 136.5 320 136.5C313 136.5 307 134 303 129C296 127 290 123 285 116Z" fill="#3a2418" opacity=".2" filter="url(#chrono-b1)"/>
<path d="M285 116C287 127 292 137 300 145C307 151.5 314 154.5 320 154.5C326 154.5 333 151.5 340 145C348 137 353 127 355 116C350 123 344 127 337 129C333 134 327 136.5 320 136.5C313 136.5 307 134 303 129C296 127 290 123 285 116Z" fill="url(#chrono-stub)" opacity=".5"/>
<path d="M307.5 131C313 129 327 129 332.5 131L333.5 136.2C327 135.2 313 135.2 306.5 136.2Z" fill="#3a2418" opacity=".22"/>
<path d="M307.5 131C313 129 327 129 332.5 131L333.5 136.2C327 135.2 313 135.2 306.5 136.2Z" fill="url(#chrono-stub)" opacity=".55"/>
</g>`) + V('barbe', 'rase', `<path d="M287 120C290 132 298 144 310 151C316 154 324 154 330 151C342 144 350 132 353 120C346 128 334 132 320 132C306 132 294 128 287 120Z" fill="#4a4a6a" opacity=".07" filter="url(#chrono-b1)"/>`));

const CHEVEUX = piece('cheveux', 'Cheveux', HEAD, `
<path d="M282 98C280 74 297 56 320 56C343 56 360 74 358 98C356 93 354 89 352 86C351 80 347 76 341 75C333 73.6 327 74.6 320 74.6C313 74.6 307 73.6 299 75C293 76 289 80 288 86C286 89 284 93 282 98Z" fill="url(#chrono-hairG)"/>
<path d="M282 98C280 74 297 56 320 56C343 56 360 74 358 98C356 93 354 89 352 86C351 80 347 76 341 75C333 73.6 327 74.6 320 74.6C313 74.6 307 73.6 299 75C293 76 289 80 288 86C286 89 284 93 282 98Z" fill="url(#chrono-buzz)"/>
<path d="M290 74C297 62 310 57.5 324 58C311 61 300 67 293 77Z" fill="#9a806c" opacity=".45" filter="url(#chrono-b1)"/>
<path d="M282 96L282.6 111L285.6 111.5L286.8 92Z" fill="#2a201a" opacity=".7"/><path d="M358 96L357.4 111L354.4 111.5L353.2 92Z" fill="#2a201a" opacity=".7"/>
<path d="M299 75.5C307 74 313 75 320 75C327 75 333 74 341 75.5" stroke="#2a1d16" stroke-width="2" fill="none" opacity=".35" filter="url(#chrono-b1)"/>
<path d="M352 70C356 77 358 86 358 96" stroke="#a6e9ff" stroke-width="1.2" fill="none" opacity=".5"/>`);

// Sourcils : un dessin, et des transformations par humeur.
const SOURCILS = piece('sourcils', 'Sourcils', FEAT, `
<g class="c-browL"><path d="M292 100.5C296 96.5 303 95 314.5 96.2L315 100.2C306 98.8 299 99.2 293 102.2Z" fill="#2b1e17"/>
<path d="M298 98.4l3.5 -.6M304 97.4l4 -.3M309 97.2l3.5 .2" stroke="#6b5040" stroke-width=".6" opacity=".6"/></g>
<g class="c-browR"><path d="M348 100.5C344 96.5 337 95 325.5 96.2L325 100.2C334 98.8 341 99.2 347 102.2Z" fill="#2b1e17"/>
<path d="M342 98.4l-3.5 -.6M336 97.4l-4 -.3M331 97.2l-3.5 .2" stroke="#6b5040" stroke-width=".6" opacity=".5"/></g>`);

const eye = (side) => {
  const L = side === 'L', cx = L ? 305.5 : 334.5, d = L ? EYE_L : EYE_R;
  const lid = L ? 'M293 99H316V107.6C311 111.2 299 111.2 293 107.6Z' : 'M324 99H347V107.6C341 111.2 329 111.2 324 107.6Z';
  const lash = L ? 'M293 107.6C299 111.2 311 111.2 316 107.6' : 'M324 107.6C329 111.2 341 111.2 347 107.6';
  const upper = L ? 'M294.6 107.8C298.5 103 304 101.5 309 102.1C311.8 102.5 313.8 104.1 315 106.6' : 'M345.4 107.8C341.5 103 336 101.5 331 102.1C328.2 102.5 326.2 104.1 325 106.6';
  const lower = L ? 'M298 110.2C303 112.2 309 111.6 314 107.4' : 'M342 110.2C337 112.2 331 111.6 326 107.4';
  const crease = L ? 'M297 104C300 100.4 307 99.2 313 100.8' : 'M343 104C340 100.4 333 99.2 327 100.8';
  return `<g class="c-eye${side}"><path d="${d}" fill="#efe6dc"/>
<g clip-path="url(#chrono-cEye${side})"><rect x="${cx - 12}" y="101" width="24" height="3.6" fill="#5a2c18" opacity=".25"/>
<g class="c-look"><g class="c-dart"><g class="c-iris"><circle cx="${cx}" cy="107" r="3.8" fill="url(#chrono-iris)" stroke="#1d120a" stroke-width=".6"/>
<circle cx="${cx}" cy="107" r="1.85" fill="#0d0806"/><circle cx="${cx + 1.2}" cy="105.7" r="1" fill="#fff"/><circle cx="${cx - 1.1}" cy="108.3" r=".4" fill="#fff" opacity=".7"/></g></g></g>
<g class="c-lid c-lid${side}"><path d="${lid}" fill="#c98a63"/><path d="${lash}" stroke="#2a1610" stroke-width="1.5" fill="none"/></g></g>
<path d="${upper}" stroke="#2a1610" stroke-width="1.7" fill="none" stroke-linecap="round"/>
<path d="${lower}" stroke="#6b3a26" stroke-width=".7" fill="none" opacity=".6"/>
<path d="${crease}" stroke="#7a4630" stroke-width=".8" fill="none" opacity=".45"/></g>`;
};
const YEUX = piece('yeux', 'Yeux', FEAT, `<g class="c-Eo">${eye('L')}${eye('R')}</g>
<g class="c-Es" stroke="#2a1610" stroke-width="1.9" fill="none" stroke-linecap="round">
<path d="M296 109C300 103.5 309 103.2 314.5 108.2"/><path d="M344 109C340 103.5 331 103.2 325.5 108.2"/>
<path d="M298.5 111.5C303 113.2 309 112.8 313 110.6M341.5 111.5C337 113.2 331 112.8 327 110.6" stroke-width=".8" opacity=".5"/>
<path d="M293.5 108l-3 -1.6M293.6 110.4l-3.2 .6M346.5 108l3 -1.6M346.4 110.4l3.2 .6" stroke-width=".9" opacity=".6"/></g>`);

const NEZ = piece('nez', 'Nez', FEAT, `
<path d="M323 101C324 109 326.5 117 329.5 123.5C327 126 323.5 127 320.5 126.8C322.5 118 323 110 323 101Z" fill="#000" opacity=".17"/>
<path d="M317.4 100C317.4 108 316.8 114 316.3 119" stroke="#fff" stroke-width="1.5" fill="none" opacity=".2"/>
<ellipse cx="319" cy="123.4" rx="4.8" ry="3.6" fill="#e9ad86" opacity=".55"/><circle cx="317.4" cy="122" r="1.4" fill="#fff" opacity=".45"/>
<path d="M312.6 127C310 125.4 310.5 121.4 314 121M327.4 127C330 125.4 329.5 121.4 326 121" stroke="#8a4b30" stroke-width="1.1" fill="none" opacity=".6"/>
<ellipse cx="315.6" cy="127.4" rx="2.1" ry="1.05" transform="rotate(-12 315.6 127.4)" fill="#4a2416" opacity=".85"/>
<ellipse cx="324.4" cy="127.4" rx="2.1" ry="1.05" transform="rotate(12 324.4 127.4)" fill="#4a2416" opacity=".85"/>
<ellipse cx="320" cy="130.4" rx="7" ry="2" fill="#3a1608" opacity=".2" filter="url(#chrono-b1)"/>
<path d="M318 130.5l.4 3.6M322 130.5l-.4 3.6" stroke="#7a432a" stroke-width=".8" opacity=".2"/>`);

// Le sifflet, version « dans la bouche » (victoire) : il suit la tête.
const WHISTLE = `<circle cx="0" cy="0" r="2.5" fill="none" stroke="#c9d2dc" stroke-width="1.2"/>
<path d="M4.5 3.8L18 -1.8C19.8 -2.4 21.4 .2 20.2 1.9L8.6 10.6Z" fill="url(#chrono-chrome)" stroke="#5d6672" stroke-width=".6"/>
<ellipse cx="19.4" cy="0" rx="1.3" ry="2" transform="rotate(-25 19.4 0)" fill="#2a2f38"/>
<circle cx="1" cy="9.2" r="7.2" fill="url(#chrono-chromeR)" stroke="#5d6672" stroke-width=".6"/>
<path d="M-2.4 3.4L3.6 2.6L4.2 4.6L-1.6 5.6Z" fill="#1a1d24"/>
<ellipse cx="-1.6" cy="6.6" rx="2.2" ry="1.3" fill="#fff" opacity=".8"/>
<path d="M7.4 7.6C8.4 10.6 7.4 13.6 4.4 15.4" stroke="#a6e9ff" stroke-width=".8" fill="none" opacity=".7"/>`;

const BOUCHE = piece('bouche', 'Bouche', FEAT, `
<g class="c-M c-M-repos"><g class="c-chew">
<path d="M308 137.2C311 135.2 315 134.6 318 135.2C319 135.5 321 135.5 322 135.2C325 134.6 329 135.2 332.5 136.4C327 137.8 313 138.3 308 137.2Z" fill="#a8604a"/>
<path d="M307.5 137.3C313 138.6 326 138.4 333 136.2l1.6 -1" stroke="#4a1f16" stroke-width="1.3" fill="none" stroke-linecap="round"/>
<path d="M310 138.4C314 142.6 326 142.6 331 138C325 139.6 315 139.8 310 138.4Z" fill="#b8735a"/>
<ellipse cx="318" cy="140.2" rx="4" ry=".9" fill="#fff" opacity=".25"/></g>
<ellipse cx="320" cy="144.6" rx="6" ry="1.6" fill="#3a1608" opacity=".18" filter="url(#chrono-b1)"/></g>
<g class="c-M c-M-louche">
<path d="M309.5 137.8C314 136.6 324 136 330 134.2" stroke="#4a1f16" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<path d="M310 137.6C314 136 323 135 330 134C324 134.4 315 135.4 310 137.6Z" fill="#a8604a"/>
<path d="M312 138.6C317 141.6 325 140.8 329.4 136.6C323 138.6 316 139.2 312 138.6Z" fill="#b8735a"/>
<path d="M307.6 138.8l-1.6 .8" stroke="#6e3a22" stroke-width="1" opacity=".5"/></g>
<g class="c-M c-M-rire">
<path d="M303 133.5C311 131.6 329 131.6 338 132.6C330 134.6 311 135.4 303 133.5Z" fill="#a8604a"/>
<path d="M304 134C311 136.5 329 136.5 337 133C336 145 329 153.5 320 153.5C311 153.5 305 145 304 134Z" fill="#3a0f0c"/>
<path d="M310 150C313 144.8 327 144.8 330 150C326 153.4 314 153.4 310 150Z" fill="#c25a54"/>
<path d="M306.5 135C313 137.6 327 137.6 334.5 134.2L333.6 139.4C326.5 141.6 313.5 141.6 307.2 139.8Z" fill="#f5efe6"/>
<path d="M313.5 137.4v3.4M320 137.8v3.6M326.5 137.4v3.4" stroke="#b9ae9e" stroke-width=".6"/>
<path d="M305 136C305 147 311 156 320 156C329 156 336 147 337 134C337.6 147 330 158.6 320 158.6C310 158.6 303.4 148 305 136Z" fill="#b8735a"/>
<g stroke="#7a432a" stroke-width="1.1" fill="none" opacity=".45"><path d="M300.5 127C298 132 298.5 137 301.5 141"/><path d="M339.5 127C342 132 341.5 137 338.5 141"/></g></g>
<g class="c-M c-M-victoire">
<g class="c-vic c-puffL"><path d="M312 116C297 106 271 112 270 131C269 151 293 157 312 149C316 138 316 126 312 116Z" fill="url(#chrono-puffG)"/>
<path d="M288 109C276 114 270 122 270 131C269 151 293 157 312 149" stroke="#8a4e33" stroke-width=".9" fill="none" opacity=".7"/>
<path d="M273 140C278 151 296 155 310 149C300 150 284 148 275 136Z" fill="#6a2e18" opacity=".25" filter="url(#chrono-b1)"/>
<ellipse cx="284" cy="121" rx="7" ry="4.4" transform="rotate(-25 284 121)" fill="#fff" opacity=".55"/><circle cx="295" cy="117" r="1.5" fill="#fff" opacity=".7"/></g>
<g class="c-vic c-puffR"><path d="M328 116C343 106 369 112 370 131C371 151 347 157 328 149C324 138 324 126 328 116Z" fill="url(#chrono-puffG)"/>
<path d="M328 116C343 106 369 112 370 131C371 151 347 157 328 149C324 138 324 126 328 116Z" fill="#3a1608" opacity=".13"/>
<path d="M352 109C364 114 370 122 370 131C371 151 347 157 328 149" stroke="#7a4229" stroke-width=".9" fill="none" opacity=".7"/>
<ellipse cx="345" cy="119" rx="5.6" ry="3.4" transform="rotate(-20 345 119)" fill="#fff" opacity=".42"/>
<path d="M368.5 122C371 131 368 145 358 151" stroke="#a6e9ff" stroke-width="1.3" fill="none" opacity=".75"/></g>
<ellipse cx="322" cy="139.6" rx="5.8" ry="4.4" fill="#b0664f"/><ellipse cx="322" cy="139.8" rx="2.6" ry="2" fill="#3a0f0c"/>
<ellipse cx="320.4" cy="137" rx="2.6" ry=".9" fill="#fff" opacity=".3"/>
<g class="c-vic c-wm"><path d="M341 151C348 160 346 168 336 170" stroke="#121214" stroke-width="1.8" fill="none"/>
<g transform="translate(341 151) rotate(-152) scale(1.12)">${WHISTLE}</g></g>
<g stroke="#fff6d0" stroke-width="2.4" fill="none" stroke-linecap="round">
<path class="c-vic c-snd c-snd1" d="M362 134C367 139 367 149 362 154"/>
<path class="c-vic c-snd c-snd2" d="M370 129C377 137 377 151 370 159"/>
<path class="c-vic c-snd c-snd3" d="M378 124C387 134 387 154 378 164"/></g></g>
<g class="c-M c-M-decu">
<path d="M309 139.6C313 136.2 327 136.2 331 139.6C326 138 314 138 309 139.6Z" fill="#a8604a"/>
<path d="M308 140.6C313 137.6 327 137.6 332 140.6" stroke="#4a1f16" stroke-width="1.4" fill="none" stroke-linecap="round"/>
<path d="M311 141.4C316 143.8 324 143.8 329 141.4C325 142.4 315 142.6 311 141.4Z" fill="#b8735a"/>
<path d="M315.5 148.5l1.2 1.4M324.5 148.5l-1.2 1.4M320 149.6v1.6" stroke="#6e3a22" stroke-width=".8" opacity=".35"/></g>
<g class="c-M c-M-surprise">
<ellipse cx="320" cy="145" rx="7.6" ry="10" fill="#3a0f0c"/>
<path d="M314.5 138.2C317 136.6 323 136.6 325.5 138.2L325 140.4C322 139.4 318 139.4 315 140.4Z" fill="#f5efe6"/>
<ellipse cx="320" cy="151.5" rx="4.6" ry="2.6" fill="#c25a54"/>
<ellipse cx="320" cy="145" rx="7.6" ry="10" fill="none" stroke="#b0664f" stroke-width="2.6"/>
<ellipse cx="317" cy="135.6" rx="2.4" ry=".8" fill="#fff" opacity=".3"/></g>`);

// Couvre-chef : casquette bien droite, bandeau éponge, ou rien (les cheveux se dressent à la surprise).
const CHAPEAU = piece('chapeau', 'Casquette ou bandeau', [...HEAD, 'c-hat'],
  V('tete', 'casquette', `
<ellipse cx="320" cy="94" rx="34" ry="5" fill="#2a0e04" opacity=".38" filter="url(#chrono-b2)"/>
<path d="M280 84C279 60 297 44 320 44C343 44 361 60 360 84C346 80.5 334 79.6 320 79.6C306 79.6 294 80.5 280 84Z" fill="url(#chrono-capG)"/>
<path d="M320 44.5C314 56 311 68 310.5 80M320 44.5C326 56 329 68 329.5 80" stroke="#000" stroke-width=".8" opacity=".5" fill="none"/>
<path d="M320 44.5C303 50 290 62 286 82" stroke="#000" stroke-width=".7" opacity=".4" fill="none"/>
<path d="M310.6 80C311 68 314 56 320 45C326 56 329 68 329.4 80C323 79.4 317 79.4 310.6 80Z" fill="#fff" opacity=".06"/>
<path d="M293 56C300 49 309 46 318 45.5C308 49 300 54 295 61Z" fill="#fff" opacity=".18"/>
<ellipse cx="320" cy="44.6" rx="4" ry="1.8" fill="#2c3040"/>
<path d="M281 83C296 79.4 344 79.4 359 83" stroke="#e9e7e0" stroke-width="1.6" fill="none"/>
<path d="M276 87C292 80.4 348 80.4 364 87C360 94.6 342 98 320 98C298 98 280 94.6 276 87Z" fill="#191b26"/>
<path d="M277.5 88.6C294 94 346 94 362.5 88.6C358 95.4 342 98 320 98C298 98 282 95.4 277.5 88.6Z" fill="#2d3b36"/>
<path d="M276 87C292 80.4 348 80.4 364 87" stroke="#4a5068" stroke-width="1" fill="none"/>
<path d="M357.6 64C359.2 70 359.8 77 359.2 82.6" stroke="#a6e9ff" stroke-width="1.2" fill="none" opacity=".55"/>`)
+ V('tete', 'bandeau', `
<path d="M281 78C298 72.6 342 72.6 359 78L359.6 90C342 85 298 85 280.4 90Z" fill="url(#chrono-band)"/>
<path d="M281 78C298 72.6 342 72.6 359 78L359.6 90C342 85 298 85 280.4 90Z" fill="url(#chrono-terry)"/>
<path d="M280.8 82.6C298 77.6 342 77.6 359.2 82.6L359.3 85.4C342 80.6 298 80.6 280.7 85.4Z" fill="#e0582f"/>
<path d="M342 75C350 76 355 77 359 78L359.6 90C354 88 348 86.6 342 86Z" fill="#000" opacity=".16"/>
<path d="M282 90.6C298 86 342 86 358 90.6" stroke="#3a1608" stroke-width="2" opacity=".2" fill="none" filter="url(#chrono-b1)"/>`)
+ V('tete', 'rien', `<path class="c-spike" d="M287 80L289 62L295 73L298 52L304 69L309 47L314 66L319 44L323 65L329 46L333 67L339 51L342 71L349 58L351 76L354 70L355 84C340 76 300 76 287 80Z" fill="url(#chrono-hairG)"/>`));

// ---------------- Le corps ----------------
const TORSO_M = 'M302 160C292 166 272 171 254 174C241 177 233 185 231 197L235 250C237 272 240 296 243 334L397 334C400 296 403 272 405 250L409 197C407 185 399 177 386 174C368 171 348 166 338 160L320 186Z';
const TORSO_J = 'M303 151C292 162 272 170 254 174C241 177 233 185 231 197L235 250C237 272 240 296 243 334L397 334C400 296 403 272 405 250L409 197C407 185 399 177 386 174C368 170 348 162 337 151C330 155 310 155 303 151Z';
const CEL = '<path d="M386 174C399 177 407 185 409 197L405 250C403 272 400 296 397 334L374 334C378 300 380 262 378 230C376 204 370 186 362 172Z" fill="#000" opacity=".2"/>';
const FOLDS = `<g fill="#000" opacity=".24" filter="url(#chrono-b2)">
<path d="M242 212C254 220 264 232 270 248C259 240 249 231 239 226Z"/><path d="M398 212C386 220 376 232 370 248C381 240 391 231 401 226Z"/>
<path d="M266 290C286 282 302 284 318 292C302 290 284 289 266 294Z"/><path d="M326 290C346 280 364 282 382 290C366 288 346 289 326 294Z"/>
<path d="M298 200C304 214 308 232 310 252C305 236 300 220 294 206Z"/></g>
<ellipse cx="272" cy="205" rx="28" ry="18" fill="#fff" opacity=".1" filter="url(#chrono-b8)"/>
<path d="M388 175C400 178 407 186 409 198L405 250C403 272 401 290 399 310" stroke="#a6e9ff" stroke-width="1.4" fill="none" opacity=".5"/>`;
const TORSE = piece('torse', 'Torse', [...BODY, 'c-chest'], `
${V('tenue', 'maillot', '<path d="M295 157C301 150 339 150 345 157L342 161C335 156 305 156 298 161Z" fill="#141418"/>')}
<path d="M302 136L301 168C309 173 331 173 339 168L338 136Z" fill="url(#chrono-neck)"/>
<path d="M331 138L338 138L339 168L331 170Z" fill="#000" opacity=".16"/>
<g stroke="#8a4b30" stroke-width="1" fill="none" opacity=".28"><path d="M306 146C310 154 314 160 318 167"/><path d="M334 146C330 154 326 160 322 167"/></g>
<ellipse cx="320" cy="153" rx="22" ry="8" fill="#2a120a" opacity=".5" filter="url(#chrono-b2)"/>
<path d="M338.4 142C339 152 339 160 339 167" stroke="#a6e9ff" stroke-width="1" opacity=".45" fill="none"/>
${V('tenue', 'maillot', `
<path d="M299 156L341 156L320.5 194Z" fill="url(#chrono-neck)"/><path d="M299 156L341 156L320.5 194Z" fill="#2a120a" opacity=".22"/>
<path d="${TORSO_M}" fill="url(#chrono-stripe)"/><path d="${TORSO_M}" fill="url(#chrono-torsoSU)"/><path d="${TORSO_M}" fill="url(#chrono-torsoV)"/>
${CEL}${FOLDS}
<path d="M298.5 158L320 189.5L341.5 158L337.5 158L320 183.5L302.5 158Z" fill="#141418"/>
`)}
${V('tenue', 'veste', `
<path d="${TORSO_J}" fill="url(#chrono-jacket)"/><path d="${TORSO_J}" fill="url(#chrono-torsoSU)"/><path d="${TORSO_J}" fill="url(#chrono-torsoV)"/>
${CEL}${FOLDS}
<g stroke="#f2f2f2" stroke-width="2" fill="none"><path d="M298 158C278 167 258 172 240 183M300 163C281 171 262 176 245 187"/><path d="M342 158C362 167 382 172 400 183M340 163C359 171 378 176 395 187"/></g>
<path d="M320 160V334" stroke="#0b1029" stroke-width="3"/><path d="M320 160V334" stroke="#c4cad6" stroke-width="1.3" stroke-dasharray="1 1"/>
<path d="M300 143C308 138.6 332 138.6 340 143L341 148C332 144.6 308 144.6 299 148Z" fill="#101a3c"/>
<path d="M299 144C303 152 311 158 320 160L320 170C309 168 300 162 294.6 153Z" fill="#26397a"/>
<path d="M341 144C337 152 329 158 320 160L320 170C331 168 340 162 345.4 153Z" fill="#1a2a5c"/>
<path d="M294.6 153C300 162 309 168 320 170C331 168 340 162 345.4 153" stroke="#f2f2f2" stroke-width="1" fill="none" opacity=".7"/>
<rect x="317.8" y="162" width="4.4" height="9" rx="1.2" fill="#ff8a2a"/><circle cx="320" cy="163.4" r=".9" fill="#7a3a0a"/>`)}`);

// Bras : peau, puis la manche courte (maillot) ou longue (veste) en variantes.
function arm(S, E, W, o = {}) {
  const [sx, sy] = S, [ex, ey] = E, [wx, wy] = W;
  const wu = o.wu || 40, we = o.we || 27, ww = o.ww || 22, side = o.side || 1;
  const up = limb(sx, sy, wu, ex, ey, we, 4), fo = limb(ex, ey, we - 1, wx, wy, ww, 2);
  const at = (k) => [lerp(sx, ex, k), lerp(sy, ey, k)], wk = (k) => [lerp(ex, wx, k), lerp(ey, wy, k)];
  const m = at(.47), c0 = at(.42), c1 = at(.48), w0 = wk(.78), w1 = wk(.88);
  const sh = (d) => `<path d="${d}" fill="url(#chrono-limbS)"/>`;
  const r0 = at(.36);
  const rim = o.rim ? `<path d="${along(r0[0], r0[1], ex, ey, o.rim * (wu / 2 - 2.5), o.rim * (we / 2 - .6))}" stroke="#a6e9ff" stroke-width="1.2" opacity=".45" fill="none" stroke-linecap="round"/>` : '';
  const shU = (d) => `<path d="${d}" fill="url(#chrono-torsoSU)"/><path d="${d}" fill="url(#chrono-torsoV)"/>`;
  const fsh = `<path d="${fo}" fill="#2a1208" opacity=".32" transform="translate(2 3)" filter="url(#chrono-b2)"/>`;
  const sl = limb(sx, sy, wu + 7, m[0], m[1], we + 11, 2, 1, 0), cuff = limb(c0[0], c0[1], we + 12, c1[0], c1[1], we + 11.6, 0, 0, 0);
  const ju = limb(sx, sy, wu + 5, ex, ey, we + 5, 4), jf = limb(ex, ey, we + 4, w1[0], w1[1], ww + 5, 2, 1, 0);
  const jc = limb(w0[0], w0[1], ww + 5.5, w1[0], w1[1], ww + 5, 0, 0, 0), jw = limb(w0[0], w0[1], ww, wx, wy, ww);
  const st = `<path d="${along(sx, sy, ex, ey, side * (wu / 2 - 2), side * (we / 2))}${along(sx, sy, ex, ey, side * (wu / 2 - 6.5), side * (we / 2 - 3.5))}" stroke="#f2f2f2" stroke-width="2" fill="none"/>`;
  return {
    mu: `<path d="${up}" fill="url(#chrono-skinA)"/>${sh(up)}<path d="${sl}" fill="url(#chrono-stripe)"/>${shU(sl)}<path d="${cuff}" fill="#141418"/>${rim}`,
    mf: `${fsh}<path d="${fo}" fill="url(#chrono-skinA)" stroke="#7a432a" stroke-width=".9" stroke-opacity=".55"/>${sh(fo)}`,
    ju: `<path d="${ju}" fill="url(#chrono-jacket)"/>${shU(ju)}${st}${rim}`,
    jf: `${fsh}<path d="${jw}" fill="url(#chrono-skinA)"/><path d="${jf}" fill="url(#chrono-jacket)"/>${shU(jf)}${sh(jf)}<path d="${jc}" fill="#141d42"/>`,
  };
}
const armBoth = (a) => V('tenue', 'maillot', a.mu + a.mf) + V('tenue', 'veste', a.ju + a.jf);

const AR = arm([238, 196], [206, 268], [229, 250], { side: 1 });
const BRAS_D = piece('brasD', 'Bras droit', [...BODY, 'c-armR'],
  V('tenue', 'maillot', AR.mu + `<g class="c-foreR">${AR.mf}</g>`) + V('tenue', 'veste', AR.ju + `<g class="c-foreR">${AR.jf}</g>`));

const L_REST = arm([402, 196], [432, 266], [368, 262], { side: -1, rim: -1 });
const L_CARD = arm([402, 196], [438, 272], [410, 217], { side: -1, rim: -1 });
const L_POINT = arm([402, 198], [452, 171], [490, 134], { side: -1, rim: -1, wu: 38, we: 25, ww: 20 });
const L_PALM = arm([402, 196], [376, 228], [352, 140], { side: -1, rim: -1, we: 28 });
const L_KNEE = arm([402, 196], [432, 292], [442, 346], { side: -1, rim: -1 });
const BRAS_G = piece('brasG', 'Bras gauche', [...BODY, 'c-armL'], `
<g class="c-Lp c-Lp-rest">${armBoth(L_REST)}</g><g class="c-Lp c-Lp-card">${armBoth(L_CARD)}</g>
<g class="c-Lp c-Lp-point">${armBoth(L_POINT)}</g><g class="c-Lp c-Lp-palm">${armBoth(L_PALM)}</g><g class="c-Lp c-Lp-knee">${armBoth(L_KNEE)}</g>`);

// Mains. Poing serré sur un montant vertical (x = 0) : le montant passe derrière les doigts.
const FIN = 'fill="url(#chrono-finger)" stroke="#8a4f33" stroke-width=".6"';
const NAIL = (cx, cy, rx, ry, r = 0) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${r ? ` transform="rotate(${r} ${cx} ${cy})"` : ''} fill="#f3d2bd" stroke="#b07a60" stroke-width=".4"/>`;
const FIST_BODY = 'M-21 -12C-20 -19 -10 -21 -1 -20L8 -18C13 -16 13 14 8 16L-4 18C-12 19.5 -19 18 -22 12C-23.5 4 -23 -4 -21 -12Z';
const FIST = `<path d="${FIST_BODY}" fill="url(#chrono-skinH)"/><path d="${FIST_BODY}" fill="url(#chrono-limbS)"/>
<g ${FIN}><rect x="-9" y="-15.5" width="21.5" height="7.6" rx="3.8"/><rect x="-9" y="-8" width="22.5" height="7.6" rx="3.8"/>
<rect x="-9" y="-.5" width="21.5" height="7.4" rx="3.7"/><rect x="-8" y="6.8" width="19" height="6.8" rx="3.4"/></g>
<path d="M4 -14.6v5.4M5 -7.2v5.6M4.4 .4v5.6M3.6 7.6v5" stroke="#7a4128" stroke-width=".7" opacity=".45"/>
<g fill="#fff" opacity=".24"><ellipse cx="-4" cy="-13.4" rx="3" ry="1.1"/><ellipse cx="-4" cy="-5.9" rx="3" ry="1.1"/><ellipse cx="-4" cy="1.5" rx="3" ry="1.1"/><ellipse cx="-3.5" cy="8.6" rx="2.6" ry="1"/></g>
<path d="M-20 -6C-17 -7 -13 -7 -10 -6M-20 1C-17 0 -13 0 -10 1" stroke="#8a4f33" stroke-width=".7" opacity=".3" fill="none"/>
<path d="${limb(-18, -14.5, 9.4, 5, -16.6, 7.8, 1)}" ${FIN}/>${NAIL(3.2, -16.6, 2.9, 2.3)}
<path d="M12 -14C13.5 -8 13.5 4 11 13" stroke="#a6e9ff" stroke-width=".9" fill="none" opacity=".45"/>`;
const GRIP_BODY = 'M3 -10.5C-5 -12.5 -14 -12.5 -20 -10.2C-24.5 -8 -25.5 6.5 -21 10.5C-14 12.6 -4 12.6 3 10.5Z';
const GRIP = `<path d="${GRIP_BODY}" fill="url(#chrono-skinH)"/><path d="${GRIP_BODY}" fill="url(#chrono-limbS)"/>
<g ${FIN}><path d="${limb(-19.5, -7.4, 6.2, -26.5, -5.4, 5.6)}"/><path d="${limb(-20.5, -2.4, 6.2, -28, -.4, 5.8)}"/>
<path d="${limb(-20.5, 2.6, 6, -27.4, 4.8, 5.6)}"/><path d="${limb(-19.5, 7.4, 5.4, -25.4, 9.4, 5)}"/></g>
<g fill="#fff" opacity=".22"><ellipse cx="-19.5" cy="-7.8" rx="2" ry="1.5"/><ellipse cx="-20.5" cy="-2.8" rx="2" ry="1.5"/><ellipse cx="-20.5" cy="2.2" rx="2" ry="1.5"/></g>
<path d="M-2 -5.5L-16 -6.5M-2 0L-17 -1.5M-2 5L-16 3.8" stroke="#8a4f33" stroke-width=".7" opacity=".28"/>
<path d="${limb(-5, -9.5, 7.8, -21, -14.4, 6.2, 1)}" ${FIN}/>${NAIL(-19.4, -14.6, 2.5, 2, -17)}`;
const POINT = `<path d="M-1 -9C5 -11.5 14 -11.5 19 -9.5C23 -7 23.5 7 19.5 10C13 12.5 4 12 -1 9.5Z" fill="url(#chrono-skinH)"/>
<g ${FIN}><rect x="12" y="-3.6" width="13" height="6" rx="3"/><rect x="11.5" y="2.2" width="12.5" height="5.6" rx="2.8"/><rect x="10.5" y="7.6" width="11.5" height="5" rx="2.5"/></g>
<path d="${limb(16, -6.4, 6.8, 42, -8.2, 5.8, .5)}" ${FIN}/>${NAIL(39.2, -10, 2.7, 1.4, -4)}
<path d="M27 -9.8v3.4M33 -10.2v3.2" stroke="#7a4128" stroke-width=".6" opacity=".4"/>
<path d="${limb(4, -9.5, 7.8, 17, -13.4, 6.4, 1)}" ${FIN}/>${NAIL(15.4, -14.4, 2.4, 1.7, -17)}`;
const PALM_BODY = 'M-13 0C-15.5 -9 -16.5 -21 -15 -31L14.5 -32.5C16.5 -21 15.5 -9 13 0Z';
const PALM = `<path d="${limb(-11, -9, 8.4, -23, -27, 6.8, 1)}" ${FIN}/>${NAIL(-22, -26, 2.4, 2, -34)}
<path d="${PALM_BODY}" fill="url(#chrono-skinH)"/><path d="${PALM_BODY}" fill="url(#chrono-limbS)"/>
<g ${FIN}><path d="${limb(-11, -29, 7.2, -14.5, -57, 6.2, .5)}"/><path d="${limb(-3.5, -31, 7.6, -4.5, -63, 6.6, .5)}"/>
<path d="${limb(4, -31, 7.2, 5.6, -59.5, 6.2, .5)}"/><path d="${limb(11.5, -29, 6.2, 15, -49.5, 5.4, .5)}"/></g>
${NAIL(-14.2, -54.4, 2.2, 2.8)}${NAIL(-4.5, -60.4, 2.4, 3)}${NAIL(5.5, -57, 2.2, 2.8)}${NAIL(14.8, -47.2, 1.9, 2.4)}
<g fill="#fff" opacity=".22"><ellipse cx="-10.5" cy="-31" rx="3" ry="2"/><ellipse cx="-3" cy="-32.5" rx="3" ry="2"/><ellipse cx="4.6" cy="-32.5" rx="3" ry="2"/><ellipse cx="11.6" cy="-30.4" rx="2.6" ry="1.8"/></g>
<path d="M-6 -4L-10 -28M0 -4L-3 -29M5 -4L5 -29M9 -4L11 -27" stroke="#8a4f33" stroke-width=".7" opacity=".25"/>
<path d="M-12.6 -42.5h4M-4.8 -46h4M3.4 -44.5h4M11.8 -38.5h3.5" stroke="#7a4128" stroke-width=".6" opacity=".4"/>`;

const MAIN_D = piece('mainD', 'Main droite', [...BODY, 'c-armR', 'c-foreR'], `<g transform="translate(246 236)">
<rect x="-2.5" y="-24" width="5" height="4" fill="#000" opacity=".35" filter="url(#chrono-b1)"/><rect x="-2.5" y="17" width="5" height="4" fill="#000" opacity=".35" filter="url(#chrono-b1)"/>
${FIST}</g>`);
const MAIN_G = piece('mainG', 'Main gauche', [...BODY, 'c-armL'], `
<g class="c-Lp c-Lp-rest"><g transform="translate(368 262)">${GRIP}</g></g>
<g class="c-Lp c-Lp-card"><g transform="translate(394 200) rotate(8) scale(-1 1)">
<g clip-path="url(#chrono-cCard)"><g class="c-cardup"><rect x="-11.5" y="-58" width="23" height="64" rx="2.5" fill="url(#chrono-ycard)" stroke="#a87400" stroke-width=".6"/>
<path d="M-8 -54h6" stroke="#fff" stroke-width="1.6" opacity=".6" stroke-linecap="round"/></g></g>${FIST}</g></g>
<g class="c-Lp c-Lp-point"><g transform="translate(490 134) rotate(-43)">${POINT}</g></g>
<g class="c-Lp c-Lp-palm"><g transform="translate(352 140) rotate(-16)">${PALM}</g></g>`);

// Sablier : montants en bois tourné, deux bulbes, sable qui coule.
let grains = '';
for (let y = 226; y < 272; y += 6) grains += `<rect x="267.3" y="${y}" width="1.5" height="2.2" rx=".7"/>`;
const SABLIER = piece('sablier', 'Sablier', [...BODY, 'c-armR', 'c-foreR', 'c-glass'], `
<ellipse cx="286" cy="242" rx="26" ry="48" fill="#000" opacity=".24" filter="url(#chrono-b3)"/>
<rect x="266.5" y="192" width="3" height="83" fill="#4a2a14"/>
<path d="${BULB_T}" fill="url(#chrono-glassG)"/><path d="${BULB_B}" fill="url(#chrono-glassG)"/>
<g clip-path="url(#chrono-cBulbT)"><g class="c-sandT"><path d="M250 213C260 213 264 217 268 219.5C272 217 276 213 286 213L286 236L250 236Z" fill="url(#chrono-sand)"/></g></g>
<rect x="267.4" y="233" width="1.2" height="40" fill="#f2c46a" opacity=".8"/>
<g clip-path="url(#chrono-cStream)"><g class="c-grains" fill="#fff0c2">${grains}</g></g>
<g clip-path="url(#chrono-cBulbB)"><g class="c-sandB"><path d="M250 276C255 268 262 262 268 260C274 262 281 268 286 276Z" fill="url(#chrono-sand)"/></g></g>
<path d="${BULB_T}" fill="none" stroke="#e6f6ff" stroke-opacity=".6" stroke-width=".8"/><path d="${BULB_B}" fill="none" stroke="#e6f6ff" stroke-opacity=".6" stroke-width=".8"/>
<path d="M258 197C257.4 206 259 214 262.6 221M258 271C257.4 262 259 254 262.6 247" stroke="#fff" stroke-width="1.6" fill="none" opacity=".6" stroke-linecap="round"/>
<path d="M279.6 198C280 208 277 218 272.4 226M279.6 270C280 260 277 250 272.4 242" stroke="#a6e9ff" stroke-width=".9" fill="none" opacity=".6"/>
<rect x="236" y="182" width="64" height="10" rx="3" fill="url(#chrono-woodV)"/><rect x="238" y="182.4" width="60" height="2.4" rx="1.2" fill="#f0c28e" opacity=".5"/>
<rect x="236" y="275" width="64" height="10" rx="3" fill="url(#chrono-woodV)"/><rect x="238" y="275.4" width="60" height="2.2" rx="1.1" fill="#f0c28e" opacity=".4"/>
<rect x="240" y="192" width="56" height="3" fill="#000" opacity=".3"/>
<g fill="url(#chrono-wood)"><rect x="243.5" y="192" width="5" height="83"/><rect x="287.5" y="192" width="5" height="83"/>
<ellipse cx="246" cy="196" rx="3.7" ry="2"/><ellipse cx="246" cy="271" rx="3.7" ry="2"/><ellipse cx="290" cy="196" rx="3.7" ry="2"/><ellipse cx="290" cy="271" rx="3.7" ry="2"/><ellipse cx="290" cy="233.5" rx="3.4" ry="1.8"/></g>
<path d="M292.3 194V273" stroke="#a6e9ff" stroke-width=".8" opacity=".5"/>
<path d="M298.6 184.5V190M298.6 277.5V283" stroke="#a6e9ff" stroke-width=".8" opacity=".5"/>`);

const BOARD = (yellow) => `<rect x="-26" y="-36" width="58" height="82" rx="4" fill="#000" opacity=".32" filter="url(#chrono-b3)"/>
<rect x="-29" y="-40" width="58" height="80" rx="4" fill="url(#chrono-board)" stroke="#2e1b0b" stroke-width=".8"/>
<path d="M-27 -38.6H27" stroke="#c9935e" stroke-width=".8" opacity=".6"/>
<rect x="-24" y="-31" width="48" height="66" rx="1.5" fill="#f4f0e6"/><rect x="-24" y="-31" width="48" height="66" rx="1.5" fill="url(#chrono-limbS)" opacity=".6"/>
<text x="0" y="-19.5" text-anchor="middle" font-family="'Permanent Marker','Comic Sans MS',cursive" font-size="6.6" fill="#1d2a44">Manche 1</text>
<path d="M-21 -14H21M-21 -5H21M-21 4H21M-21 13H21M-21 22H21M-21 31H21" stroke="#9bb3c9" stroke-width=".5"/>
<g font-family="Barlow,'Segoe UI',sans-serif" font-weight="700" font-size="5.6" fill="#33405a"><text x="-21" y="-7">Toi</text><text x="-21" y="2">Léo</text><text x="-21" y="11">Inès</text><text x="-21" y="20">Max</text></g>
<path d="M0 -12v5M2.4 -12v5M4.8 -12v5M7.2 -12v5M-1 -8.6l10 -2.6M0 -3v5M2.4 -3v5M4.8 -3v5M0 6v5M2.4 6v5M0 15v5M2.4 15v5M4.8 15v5" stroke="#2a3a5a" stroke-width=".8" stroke-linecap="round"/>
${yellow ? '<rect x="-13" y="-48" width="12" height="16" rx="1.2" transform="rotate(-9 -7 -40)" fill="url(#chrono-ycard)"/>' : ''}
<rect x="-1" y="-49" width="12" height="16" rx="1.2" transform="rotate(7 5 -41)" fill="url(#chrono-rcard)"/>
<path d="M-13 -44H13V-34C13 -32 11 -30 9 -30H-9C-11 -30 -13 -32 -13 -34Z" fill="url(#chrono-chrome)" stroke="#5d6672" stroke-width=".6"/>
<path d="M-6 -44C-6 -49 6 -49 6 -44" stroke="#9aa5b2" stroke-width="1.6" fill="none"/>
<circle cx="-8" cy="-35" r="1" fill="#5d6672"/><circle cx="8" cy="-35" r="1" fill="#5d6672"/>`;
const PLANCHETTE = piece('planchette', 'Planchette et cartons', [...BODY, 'c-armL'], `
<g class="c-Bp c-Bp-rest"><g class="c-tap"><g transform="translate(369 228) rotate(-4)">${BOARD(true)}</g></g></g>`);

// Sifflet sur son cordon noir. Repos : il pend sur la poitrine. Surprise : il jaillit de la bouche et revient.
const NECK_CORD = '<path d="M305 160C303.5 154 303 149 304 145M335 160C336.5 154 337 149 336 145" stroke="#121214" stroke-width="1.8" fill="none"/>';
const SIFFLET = piece('sifflet', 'Sifflet et cordon', BODY, `${NECK_CORD}
<g class="c-Wr"><g class="c-wswing"><g class="c-wcord"><path d="M305 160L318 213M335 160L318.8 213" stroke="#121214" stroke-width="1.8" stroke-linecap="round"/>
<path d="M305.6 162L317.4 210" stroke="#55556a" stroke-width=".5"/></g>
<g class="c-whop"><ellipse cx="322" cy="228" rx="9" ry="5" fill="#000" opacity=".3" filter="url(#chrono-b1)"/><g transform="translate(318 214)">${WHISTLE}</g></g></g></g>
<g class="c-Wf"><line class="c-wstrL" x1="305" y1="160" x2="318" y2="214" stroke="#121214" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
<line class="c-wstrR" x1="335" y1="160" x2="318" y2="214" stroke="#121214" stroke-width="1.8" vector-effect="non-scaling-stroke"/>
<g class="c-wfly"><g transform="translate(318 214)">${WHISTLE}</g></g></g>`);

// ---------------- Animation ----------------
// Vol du sifflet (surprise) : on échantillonne la trajectoire de l'anneau et on en déduit,
// à chaque image clé, la position du sifflet et l'angle et la longueur des deux brins du cordon.
function flyKeys() {
  const R0 = [318, 214], ANC = [[305, 160], [335, 160]];
  const K = [[0, 334, 152, -137, .9], [8, 356, 110, -100, 1.5], [18, 386, 72, -70, 2.25], [27, 390, 76, -62, 2.2], [36, 382, 96, -40, 2],
    [46, 352, 176, 0, 1.45], [55, 320, 236, 22, 1.06], [64, 314, 205, -16, .97], [73, 320, 219, 8, 1], [83, 317.5, 212, -3, 1], [92, 318.4, 215, 1, 1], [100, 318, 214, 0, 1]];
  // easing of the segment that starts at each key: o = decelerate, i = accelerate, s = smooth
  const E = ['o', 'o', 's', 's', 'i', 'o', 's', 's', 's', 's', 's'];
  const ease = { o: (u) => 1 - (1 - u) * (1 - u), i: (u) => u * u, s: (u) => u * u * (3 - 2 * u) };
  const cr = (p0, p1, p2, p3, u) => .5 * (2 * p1 + (p2 - p0) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (3 * p1 - p0 - 3 * p2 + p3) * u * u * u);
  let w = '', s = ['', ''];
  const prev = [null, null];
  for (let t = 0; t <= 100; t += 2) {
    let i = 0; while (i < K.length - 2 && K[i + 1][0] < t) i++;
    const a = K[i], b = K[i + 1], u0 = (t - a[0]) / (b[0] - a[0] || 1), u = ease[E[i]](Math.min(1, Math.max(0, u0)));
    const k0 = K[Math.max(0, i - 1)], k3 = K[Math.min(K.length - 1, i + 2)];
    const x = cr(k0[1], a[1], b[1], k3[1], u), y = cr(k0[2], a[2], b[2], k3[2], u), r = lerp(a[3], b[3], u), sc = lerp(a[4], b[4], u);
    w += `${t}%{transform:translate(${f(x - R0[0])}px,${f(y - R0[1])}px) rotate(${f(r)}deg) scale(${f(sc * 100) / 100})}`;
    ANC.forEach(([ax, ay], j) => {
      const a0 = Math.atan2(R0[1] - ay, R0[0] - ax), l0 = Math.hypot(R0[0] - ax, R0[1] - ay);
      let th = (Math.atan2(y - ay, x - ax) - a0) * 180 / Math.PI;
      if (prev[j] !== null) { while (th - prev[j] > 180) th -= 360; while (th - prev[j] < -180) th += 360; }
      prev[j] = th;
      s[j] += `${t}%{transform:rotate(${f(th)}deg) scale(${f(Math.hypot(x - ax, y - ay) / l0 * 100) / 100})}`;
    });
  }
  return `@keyframes chrono-wfly{${w}}@keyframes chrono-wstrL{${s[0]}}@keyframes chrono-wstrR{${s[1]}}`;
}
const P = '.p-chrono';
const m = (moods, sel) => moods.split(' ').map((k) => `${P}.mood-${k} ${sel}`).join(',');
const OVER = 'cubic-bezier(.175,.885,.32,1.275)';
const CSS = `
${P} *{transform-box:view-box}
${P} .c-body,${P} .c-bob{transform-origin:320px 334px}
${P} .c-body{transition:transform .35s ease-out}
${P} .c-bob{animation:chrono-bob 1.9s ease-in-out infinite}
${P} .c-chest{transform-origin:320px 300px;animation:chrono-breathe 3.7s ease-in-out infinite}
${P} .c-head{transform-origin:320px 164px;transition:transform .3s ease-out}
${P} .c-turn{transform:translateX(calc(var(--look,0) * 1.8px))}
${P} .c-feat{transform:translateX(calc(var(--look,0) * 1.6px))}
${P} .c-look{transform:translateX(calc(var(--look,0) * 2.6px))}
${P} .c-jaw{transform-origin:320px 112px;transition:transform .18s ${OVER}}
${P} .c-lid{transform-origin:320px 99px;transform:scaleY(.08);transition:transform .15s ease-out}
${P} .c-eyeL{transform-origin:305px 107px}${P} .c-eyeR{transform-origin:335px 107px}
${P} .c-eyeL,${P} .c-eyeR{transition:transform .22s ${OVER}}
${P} .c-iris{transform-box:fill-box;transform-origin:center;transition:transform .2s}
${P} .c-browL{transform-origin:304px 98px}${P} .c-browR{transform-origin:336px 98px}
${P} .c-browL,${P} .c-browR{transition:transform .24s ${OVER}}
${P} .c-chew{transform-origin:320px 138px}
${P} .c-armR{transform-origin:238px 196px}${P} .c-foreR{transform-origin:208px 280px}${P} .c-glass{transform-origin:246px 236px}
${P} .c-armL,${P} .c-Lp{transform-origin:402px 196px}${P} .c-Bp{transform-origin:400px 250px}
${P} .c-hat{transform-origin:320px 68px}
${P} .c-wswing,${P} .c-wcord{transform-origin:320px 160px}
${P} .c-tap{transform-origin:346px 262px}
${P} .c-sandB{transform-origin:268px 276px}
${P} .c-spike{transform-origin:320px 80px;opacity:0}
${P} .c-puffL{transform-origin:308px 134px}${P} .c-puffR{transform-origin:332px 134px}
${P} .c-wm{transform-origin:330px 146px}${P} .c-snd{transform-origin:354px 145px}
${P} .c-Bp-down{transform-origin:440px 296px}

${P} .c-Lp,${P} .c-Bp,${P} .c-Wf,${P} .c-M,${P} .c-Es,${P} .c-vic{display:none}
${m('repos surprise', '.c-Lp-rest')},${m('louche', '.c-Lp-card')},${m('victoire', '.c-Lp-point')},${m('decu', '.c-Lp-palm')},${m('rire', '.c-Lp-knee')},
${m('repos surprise', '.c-Bp-rest')},${m('louche victoire decu rire', '.c-Bp-down')},
${m('surprise', '.c-Wf')},${m('victoire', '.c-vic')},${m('rire', '.c-Es')},
${['repos', 'louche', 'rire', 'victoire', 'decu', 'surprise'].map((k) => `${P}.mood-${k} .c-M-${k}`).join(',')}{display:inline}
${m('victoire surprise', '.c-Wr')},${m('rire', '.c-Eo')}{display:none}

/* repos : rebond sur les talons, regarde son sablier, mâche son chewing-gum */
${m('repos', '.c-body')}{animation:chrono-sway 8.6s ease-in-out infinite}
${m('repos', '.c-head')}{animation:chrono-check 7.3s ease-in-out infinite}
${m('repos', '.c-foreR')}{animation:chrono-lift 7.3s ease-in-out infinite}
${m('repos', '.c-glass')}{animation:chrono-tilt 7.3s ease-in-out infinite}
${m('repos', '.c-dart')}{animation:chrono-dart 7.3s ease-in-out infinite}
${m('repos', '.c-chew')}{animation:chrono-chew 1.3s ease-in-out infinite}
${m('repos', '.c-mus')}{animation:chrono-mus 1.3s ease-in-out infinite}
${m('repos', '.c-lid')}{animation:chrono-blink 4.7s linear infinite}
${m('repos', '.c-wswing')}{animation:chrono-wswing 1.9s ease-in-out .16s infinite}
${m('repos', '.c-tap')}{animation:chrono-tap 5.3s ease-in-out infinite}

/* louche */
${m('louche', '.c-body')}{transform:translateX(calc(var(--look,0) * 5px)) rotate(calc(var(--look,0) * 1.4deg))}
${m('louche', '.c-head')}{transform:rotate(calc(var(--look,0) * 5deg)) translateY(1.5px)}
${m('louche', '.c-look')}{transform:translateX(calc(var(--look,0) * 4.4px))}
${m('louche', '.c-lidL')}{transform:scaleY(.58)}${m('louche', '.c-lidR')}{transform:scaleY(.68)}
${m('louche', '.c-browL')}{transform:translateY(2.6px) rotate(8deg)}${m('louche', '.c-browR')}{transform:translateY(-3.4px) rotate(-6deg)}
${m('louche', '.c-Lp-card')}{animation:chrono-raise .5s ${OVER} both}
${m('louche', '.c-cardup')}{animation:chrono-cardup .55s .18s ${OVER} both}
${m('louche', '.c-foreR')}{animation:chrono-holdR .5s ease-out both}
${m('louche', '.c-bob')}{animation:chrono-sus 2.6s ease-in-out infinite}
${m('louche victoire', '.c-hat')}{animation:chrono-hatlag .7s .09s ease-out both}
${m('rire', '.c-hat')}{animation:chrono-hatbob .3s .06s ease-in-out infinite}
${m('decu', '.c-hat')}{animation:chrono-hatdroop .9s .2s ease-in-out both}

/* rire : la main sur le genou, le sifflet rebondit */
${m('rire', '.c-body')}{animation:chrono-lean .32s ${OVER} both}
${m('rire', '.c-bob')}{animation:chrono-shake .3s ease-in-out infinite}
${m('rire', '.c-head')}{animation:chrono-hhead .3s ease-in-out infinite}
${m('rire', '.c-jaw')}{transform:scaleY(1.1)}
${m('rire', '.c-browL')}{transform:translateY(-3px) rotate(-5deg)}${m('rire', '.c-browR')}{transform:translateY(-3px) rotate(5deg)}
${m('rire', '.c-wswing')}{animation:chrono-wbounce .6s ease-in-out infinite}
${m('rire', '.c-wcord')}{animation:chrono-wcord .3s ease-in-out infinite alternate}
${m('rire', '.c-whop')}{animation:chrono-whop .3s ease-in-out infinite alternate}
${m('rire', '.c-foreR')}{animation:chrono-jig .3s ease-in-out infinite}
${m('rire', '.c-Lp-knee')}{animation:chrono-knee .35s ${OVER} both}

/* victoire : coup de sifflet, joues en ballons, bras tendu */
${m('victoire', '.c-body')}{animation:chrono-vic 1s cubic-bezier(.3,.7,.4,1) both}
${m('victoire', '.c-bob')}{animation:chrono-tremble .08s .45s linear infinite alternate}
${m('victoire', '.c-head')}{animation:chrono-vhead .9s ease-out both}
${m('victoire', '.c-eyeL')},${m('victoire', '.c-eyeR')}{transform:scale(1.24)}
${m('victoire', '.c-iris')}{transform:scale(.7)}
${m('victoire', '.c-lid')}{transform:scaleY(0)}
${m('victoire', '.c-browL')}{transform:translateY(-6px) rotate(-7deg)}${m('victoire', '.c-browR')}{transform:translateY(-6px) rotate(7deg)}
${m('victoire', '.c-puffL')},${m('victoire', '.c-puffR')}{animation:chrono-puff 2.6s .12s ease-in-out both}
${m('victoire', '.c-wm')}{animation:chrono-wmin .3s ${OVER} both}
${m('victoire', '.c-snd')}{animation:chrono-snd .5s ease-out infinite}
${m('victoire', '.c-snd2')}{animation-delay:.16s}${m('victoire', '.c-snd3')}{animation-delay:.32s}
${m('victoire', '.c-Lp-point')}{animation:chrono-pointin .5s .06s ${OVER} both}
${m('victoire', '.c-armR')}{animation:chrono-raiseR .6s ${OVER} both}
${m('victoire', '.c-crowd')}{animation:chrono-cheer .3s ease-in-out infinite alternate}
${m('victoire', '.c-cam')}{animation:chrono-cam .7s steps(1) infinite}
${m('louche victoire decu rire', '.c-Bp-down')}{animation:chrono-drop .6s .05s both}

/* déçu : facepalm, le sablier pendouille */
${m('decu', '.c-body')}{animation:chrono-slump .8s ease-out both}
${m('decu', '.c-bob')}{animation:chrono-sigh 2.6s ease-in-out infinite}
${m('decu', '.c-head')}{animation:chrono-hang .7s .1s ease-out both}
${m('decu', '.c-lid')}{transform:scaleY(.86)}
${m('decu', '.c-look')}{transform:translate(-1px,1.5px)}
${m('decu', '.c-browL')}{transform:translateY(-1px) rotate(-10deg)}${m('decu', '.c-browR')}{transform:translateY(-1px) rotate(10deg)}
${m('decu', '.c-foreR')}{animation:chrono-droop 1.1s ease-in-out both}
${m('decu', '.c-glass')}{animation:chrono-flop 1.3s .2s cubic-bezier(.34,1.5,.64,1) both}
${m('decu', '.c-Lp-palm')}{animation:chrono-slap .34s .05s cubic-bezier(.2,.9,.3,1.3) both}

/* surprise : le sifflet jaillit de la bouche, la casquette fait un salto */
${m('surprise', '.c-body')}{animation:chrono-jolt 1s both}
${m('surprise', '.c-bob')}{animation:none}
${m('surprise', '.c-head')}{animation:chrono-headback 1s both}
${m('surprise', '.c-jaw')}{transform:scaleY(1.12)}
${m('surprise', '.c-eyeL')},${m('surprise', '.c-eyeR')}{transform:scale(1.3)}
${m('surprise', '.c-iris')}{transform:scale(.6)}
${m('surprise', '.c-lid')}{transform:scaleY(0)}
${m('surprise', '.c-browL')},${m('surprise', '.c-browR')}{transform:translateY(-8px)}
${m('surprise', '.c-hat')}{animation:chrono-flip 1.2s both}
${m('surprise', '.c-spike')}{animation:chrono-spike 1.2s both}
${m('surprise', '.c-foreR')}{animation:chrono-jerk .9s both}
${m('surprise', '.c-armL')}{animation:chrono-jerkL .9s both}
${m('surprise', '.c-wfly')}{transform-origin:318px 214px;animation:chrono-wfly 1.4s linear both}
${m('surprise', '.c-wstrL')}{transform-origin:305px 160px;animation:chrono-wstrL 1.4s linear both}
${m('surprise', '.c-wstrR')}{transform-origin:335px 160px;animation:chrono-wstrR 1.4s linear both}

/* vie du décor */
${P} .c-sandT{animation:chrono-sandT 14s linear infinite}
${P} .c-sandB{animation:chrono-sandB 14s linear infinite}
${P} .c-grains{animation:chrono-grains .32s cubic-bezier(.5,0,1,1) infinite}
${P} .c-colon{animation:chrono-colon 1s steps(1) infinite}
${P} .c-digits{animation:chrono-led 5.3s linear infinite}
${P} .c-clockbar{transform-origin:432px 90px;animation:chrono-bar 30s linear infinite}
${P} .c-ban1{transform-origin:166px 4px;animation:chrono-ban 5.8s ease-in-out infinite}
${P} .c-ban2{transform-origin:204px 4px;animation:chrono-ban 6.7s ease-in-out -2s infinite}
${P} .c-ban3{transform-origin:242px 4px;animation:chrono-ban 5.1s ease-in-out -1s infinite}
${P} .c-beamL,${P} .c-flare{animation:chrono-beam 6.3s linear infinite}
${P} .c-beamR{animation:chrono-beam 8.9s linear -3s infinite}
${P} .c-row0{animation:chrono-crowd 2.7s ease-in-out infinite}
${P} .c-row1{animation:chrono-crowd 3.3s ease-in-out -1s infinite}
${P} .c-row2{animation:chrono-crowd 3.9s ease-in-out -2s infinite}
${P} .c-tw{animation:chrono-tw 2.4s ease-in-out infinite}
${P} .c-cam{opacity:0}
${P} .c-ledscroll{animation:chrono-scroll 18s steps(340) infinite}
${P} .c-sweep{animation:chrono-sweep 6.5s cubic-bezier(.4,0,.2,1) infinite}

@keyframes chrono-bob{0%,100%{transform:translateY(0)}28%{transform:translateY(-2.6px)}55%{transform:translateY(.4px)}70%{transform:translateY(0)}}
@keyframes chrono-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.008,1.016)}}
@keyframes chrono-sway{0%,100%{transform:translateX(0) rotate(0)}30%{transform:translateX(1.6px) rotate(.5deg)}65%{transform:translateX(-1.2px) rotate(-.5deg)}}
@keyframes chrono-check{0%,52%,90%,100%{transform:none}60%,80%{transform:rotate(-4.5deg) translate(-2px,1.5px)}}
@keyframes chrono-lift{0%,52%,90%,100%{transform:none}60%,80%{transform:rotate(-12deg)}}
@keyframes chrono-tilt{0%,54%,90%,100%{transform:none}62%,80%{transform:rotate(-6deg)}}
@keyframes chrono-dart{0%,14%,24%,52%,90%,100%{transform:translate(0,0)}17%,21%{transform:translate(2.2px,-.4px)}60%,80%{transform:translate(-3px,2.4px)}}
@keyframes chrono-chew{0%,56%,100%{transform:none}14%{transform:scale(1,.78) translateX(.8px)}28%{transform:none}42%{transform:scale(1,.8) translateX(-.7px)}}
@keyframes chrono-mus{0%,28%,56%,100%{opacity:0}14%,42%{opacity:.3}}
@keyframes chrono-blink{0%,90%,94%,96%,100%{transform:scaleY(.08)}92%,95%{transform:scaleY(1)}}
@keyframes chrono-wswing{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2.4deg)}}
@keyframes chrono-tap{0%,78%,93%,100%{transform:none}82%{transform:rotate(-3deg)}86%{transform:rotate(.5deg)}89%{transform:rotate(-2deg)}}
@keyframes chrono-raise{0%{transform:rotate(22deg) translateY(26px)}22%{transform:rotate(27deg) translateY(31px)}100%{transform:none}}
@keyframes chrono-sus{0%,100%{transform:none}50%{transform:translateY(1.2px) rotate(-.4deg)}}
@keyframes chrono-hatlag{0%{transform:none}25%{transform:rotate(-4deg) translateY(-2px)}55%{transform:rotate(2deg)}80%,100%{transform:none}}
@keyframes chrono-hatbob{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-1.6px) rotate(-1.5deg)}}
@keyframes chrono-hatdroop{0%{transform:none}60%{transform:translateY(2.4px) rotate(3deg)}100%{transform:translateY(1.6px) rotate(2deg)}}
@keyframes chrono-cardup{from{transform:translateY(34px)}to{transform:none}}
@keyframes chrono-holdR{to{transform:rotate(-4deg)}}
@keyframes chrono-lean{0%{transform:none}30%{transform:translate(-2px,-3px) rotate(-1.5deg)}100%{transform:translate(6px,9px) rotate(4deg)}}
@keyframes chrono-shake{0%,100%{transform:translateY(0)}50%{transform:translateY(3.2px) rotate(.8deg)}}
@keyframes chrono-hhead{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(1.5deg) translateY(1.5px)}}
@keyframes chrono-wbounce{0%,100%{transform:rotate(-11deg)}50%{transform:rotate(13deg)}}
@keyframes chrono-wcord{from{transform:scaleY(1)}to{transform:scaleY(.8)}}
@keyframes chrono-whop{from{transform:translateY(0)}to{transform:translateY(-10.8px)}}
@keyframes chrono-jig{0%,100%{transform:none}50%{transform:rotate(-4deg)}}
@keyframes chrono-knee{from{transform:rotate(-14deg) translateY(-10px)}to{transform:none}}
@keyframes chrono-vic{0%{transform:none}12%{transform:translateY(5px) scale(1.02,.97)}28%{transform:translateY(-10px) scale(.98,1.03)}40%{transform:translateY(-4px)}100%{transform:translateY(-6px)}}
@keyframes chrono-tremble{from{transform:translateX(-.7px)}to{transform:translateX(.7px)}}
@keyframes chrono-vhead{0%{transform:none}14%{transform:rotate(3deg) translateY(2px)}30%{transform:rotate(-4deg) translateY(-3px)}100%{transform:rotate(-3deg) translateY(-2px)}}
@keyframes chrono-puff{0%{transform:scale(.15);opacity:0}6%{opacity:1}18%{transform:scale(1.2)}26%{transform:scale(.94)}36%{transform:scale(1.12)}46%{transform:scale(.98)}58%{transform:scale(1.14)}68%{transform:scale(1)}80%{transform:scale(1.1)}100%{transform:scale(1.04);opacity:1}}
@keyframes chrono-wmin{from{transform:translate(-6px,60px) scale(.6) rotate(30deg)}to{transform:none}}
@keyframes chrono-snd{0%{opacity:0;transform:scale(.5)}25%{opacity:1}100%{opacity:0;transform:scale(1.4)}}
@keyframes chrono-pointin{0%{transform:rotate(40deg) scale(.92)}25%{transform:rotate(47deg) scale(.9)}100%{transform:none}}
@keyframes chrono-raiseR{to{transform:rotate(-6deg)}}
@keyframes chrono-cheer{from{transform:translateY(0)}to{transform:translateY(-3.5px)}}
@keyframes chrono-cam{0%{opacity:1}14%,100%{opacity:0}}
@keyframes chrono-drop{0%{transform:translate(-30px,-90px) rotate(-30deg);opacity:0}12%{opacity:1}55%{transform:none}68%{transform:translateY(-5px) rotate(1.5deg)}82%,100%{transform:none;opacity:1}}
@keyframes chrono-slump{to{transform:translateY(6px) scale(1,.985)}}
@keyframes chrono-sigh{0%,100%{transform:none}50%{transform:translateY(1.6px)}}
@keyframes chrono-hang{to{transform:rotate(6deg) translate(1px,3px)}}
@keyframes chrono-droop{0%{transform:none}25%{transform:rotate(-7deg)}100%{transform:rotate(18deg)}}
@keyframes chrono-flop{from{transform:none}to{transform:rotate(22deg)}}
@keyframes chrono-slap{from{transform:translate(24px,80px) rotate(14deg)}to{transform:none}}
@keyframes chrono-jolt{0%{transform:none}8%{transform:translateY(4px) scale(1.02,.97)}18%{transform:translateY(-13px) scale(.97,1.04)}32%{transform:translateY(-3px)}46%{transform:translateY(2px)}60%,100%{transform:none}}
@keyframes chrono-headback{0%{transform:none}18%{transform:rotate(-4deg) translateY(-5px)}55%,100%{transform:rotate(-1.5deg) translateY(-1px)}}
@keyframes chrono-flip{0%{transform:none}10%{transform:translateY(-22px) rotate(-30deg)}24%{transform:translateY(-54px) rotate(-190deg)}38%{transform:translateY(-40px) rotate(-300deg)}52%{transform:translateY(3px) rotate(-362deg)}62%{transform:translateY(-4px) rotate(-358deg)}72%,100%{transform:rotate(-360deg)}}
@keyframes chrono-spike{0%{opacity:0;transform:scaleY(.2)}10%{opacity:1;transform:scaleY(1.25)}30%{transform:scaleY(.92)}45%,100%{opacity:1;transform:scaleY(1)}}
@keyframes chrono-jerk{0%{transform:none}14%{transform:rotate(-18deg)}38%{transform:rotate(4deg)}55%,100%{transform:none}}
@keyframes chrono-jerkL{0%{transform:none}14%{transform:translateY(-14px) rotate(-5deg)}38%{transform:translateY(2px)}55%,100%{transform:none}}
@keyframes chrono-sandT{from{transform:translateY(0)}to{transform:translateY(15px)}}
@keyframes chrono-sandB{from{transform:scaleY(.45)}to{transform:scaleY(1.12)}}
@keyframes chrono-grains{from{transform:translateY(-6px)}to{transform:translateY(0)}}
@keyframes chrono-colon{0%{opacity:1}50%{opacity:.12}}
@keyframes chrono-led{0%,60%,62%,64%,100%{opacity:1}61%,63%{opacity:.5}}
@keyframes chrono-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes chrono-ban{0%,100%{transform:rotate(-1.4deg)}50%{transform:rotate(1.4deg)}}
@keyframes chrono-beam{0%,38%,41%,44%,100%{opacity:1}39%{opacity:.62}42.5%{opacity:.8}}
@keyframes chrono-crowd{0%,100%{transform:translateY(0)}50%{transform:translateY(-1px)}}
@keyframes chrono-tw{0%,100%{opacity:.15}50%{opacity:1}}
@keyframes chrono-scroll{from{transform:translateX(0)}to{transform:translateX(-680px)}}
@keyframes chrono-sweep{0%{transform:translateX(-120px)}38%,100%{transform:translateX(760px)}}
${flyKeys()}`;

const U = '.ui-chrono';
const UI_CSS = `
${U}{background:radial-gradient(120% 90% at 50% 0%,#1d2550 0%,#0c1026 55%,#070914 100%);color:#eef2ff;font-family:Barlow,system-ui,sans-serif}
${U} .ui-chrono-in{position:relative;padding:16px;display:grid;gap:14px;container-type:inline-size;overflow:hidden}
${U} .ui-chrono-in::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.022) 0 1px,transparent 1px 4px);pointer-events:none}
${U} .ui-chrono-top{display:flex;flex-wrap:wrap;gap:10px 16px;justify-content:space-between;align-items:center}
${U} .ui-chrono-rounds{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
${U} .ui-chrono-rounds li{font:600 13px/1 Barlow,sans-serif;letter-spacing:.03em;padding:9px 16px;background:#141a38;color:#8f9bc8;clip-path:polygon(9px 0,100% 0,calc(100% - 9px) 100%,0 100%)}
${U} .ui-chrono-rounds b{font-weight:800;text-transform:uppercase}
${U} .ui-chrono-rounds .on{background:linear-gradient(#ffd451,#f5a623);color:#1a1300}
${U} .ui-chrono-turn{margin:0;display:flex;align-items:center;gap:8px;font-size:14px;color:#c9d2f2}
${U} .ui-chrono-turn i{width:10px;height:10px;border-radius:50%;background:#ff3b3b;box-shadow:0 0 10px #ff3b3b;animation:chrono-ui-live 1.2s ease-in-out infinite}
${U} .ui-chrono-turn b{color:#ff8cc0}
${U} .ui-chrono-main{display:grid;grid-template-columns:200px minmax(0,1fr) 240px;gap:18px;align-items:center}
${U} .ui-chrono-clock{background:linear-gradient(#22263a,#121420);border:2px solid #353a55;border-radius:10px;padding:10px 12px 12px;display:grid;justify-items:center;gap:6px;box-shadow:0 10px 24px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)}
${U} .ui-chrono-lbl,${U} .ui-chrono-sec{font:400 14px/1 "Bebas Neue",sans-serif;letter-spacing:.2em;color:#8fd8ff}
${U} .ui-chrono-led{position:relative;width:100%;height:96px;background:#040509;border-radius:6px;overflow:hidden;font:400 96px/96px "Bebas Neue",sans-serif;text-align:center;color:#ffb020;text-shadow:0 0 14px rgba(255,140,30,.75);animation:chrono-ui-hot 31s linear infinite}
${U} .ui-chrono-led::after{content:"";position:absolute;inset:0;background:radial-gradient(circle,transparent 45%,#040509 58%) 0 0/4px 4px;pointer-events:none}
${U} .ui-chrono-reel{animation:chrono-ui-reel 31s steps(31,end) infinite}
${U} .ui-chrono-reel span{display:block;height:96px}
${U} .ui-chrono-bar{width:100%;height:6px;background:#2a1208;border-radius:3px;overflow:hidden}
${U} .ui-chrono-bar i{display:block;height:100%;background:linear-gradient(90deg,#ff3b2f,#ffb020);transform-origin:left;animation:chrono-ui-bar 31s linear infinite}
${U} .ui-chrono-cardzone{display:grid;place-items:center;min-width:0}
${U} .ui-chrono-card{position:relative;width:min(100%,330px);background:#f6f1e4;color:#1d2a44;border-radius:12px;padding:22px 18px 18px;text-align:center;box-shadow:0 14px 30px rgba(0,0,0,.5),inset 0 0 0 2px #e2d9c3,inset 0 0 0 7px #f6f1e4,inset 0 0 0 8.5px #d8452f;transform:rotate(-2.5deg);animation:chrono-ui-deal .7s cubic-bezier(.175,.885,.32,1.275) both,chrono-ui-float 5s 1s ease-in-out infinite}
${U} .ui-chrono-tape{position:absolute;top:-9px;left:50%;width:84px;height:20px;margin-left:-42px;background:rgba(255,226,140,.75);transform:rotate(3deg);box-shadow:0 1px 2px rgba(0,0,0,.2)}
${U} .ui-chrono-secret{display:inline-flex;align-items:center;gap:6px;margin:0;padding:4px 10px;border-radius:999px;background:#1d2a44;color:#ffd451;font:800 11px/1 Barlow,sans-serif;letter-spacing:.1em;text-transform:uppercase}
${U} .ui-chrono-secret svg{width:16px;height:11px}
${U} .ui-chrono-art{display:block;width:44px;height:62px;margin:10px auto 2px}
${U} .ui-chrono-word{margin:0;font:400 clamp(34px,7cqi,52px)/1.05 "Archivo Black",sans-serif;letter-spacing:-.01em;color:#1d2a44}
${U} .ui-chrono-rule{margin:8px 0 0;font:600 13px/1.3 Barlow,sans-serif;color:#6b6250}
${U} .ui-chrono-btns{display:grid;gap:10px}
${U} .ui-chrono-btns button{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;border:0;border-radius:12px;padding:16px 14px 18px;font:400 26px/1 "Archivo Black",sans-serif;letter-spacing:.02em;color:#fff;cursor:pointer;text-shadow:0 2px 0 rgba(0,0,0,.25);transition:transform .08s ease,box-shadow .08s ease}
${U} .ui-chrono-btns svg{width:26px;height:26px;flex:none}
${U} .ui-chrono-ok{background:linear-gradient(#3ee27e,#14a24f);box-shadow:0 6px 0 #0b6b33,0 12px 20px rgba(20,162,79,.35);animation:chrono-ui-press 5s 1.4s ease-in-out infinite}
${U} .ui-chrono-pass{background:linear-gradient(#ff6b5e,#d0202f);box-shadow:0 6px 0 #861220,0 12px 20px rgba(208,32,47,.3)}
${U} .ui-chrono-btns button:hover{filter:brightness(1.08)}
${U} .ui-chrono-btns button:active{transform:translateY(5px);box-shadow:0 1px 0 rgba(0,0,0,.4)}
${U} .ui-chrono-plus{position:absolute;right:14px;top:-6px;font:400 20px/1 "Archivo Black",sans-serif;color:#b6ffd0;opacity:0;animation:chrono-ui-plus 5s 1.4s ease-out infinite}
${U} .ui-chrono-done{margin:0;text-align:center;font-size:14px;color:#aab4dc}
${U} .ui-chrono-done b{color:#fff}
${U} .ui-chrono-ticker{display:flex;align-items:stretch;background:#0b0e1f;border:1px solid #2a3360;border-radius:8px;overflow:hidden;min-width:0}
${U} .ui-chrono-tag{flex:none;display:flex;align-items:center;padding:0 14px;background:#ffd451;color:#1a1300;font:400 18px/1 "Bebas Neue",sans-serif;letter-spacing:.14em}
${U} .ui-chrono-track{flex:1;min-width:0;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)}
${U} .ui-chrono-roll{display:flex;align-items:center;width:max-content;padding:8px 0;animation:chrono-ui-roll 16s infinite}
${U} .ui-chrono-p{display:inline-flex;align-items:center;gap:8px;padding:0 6px;white-space:nowrap}
${U} .ui-chrono-p svg{width:26px;height:26px}
${U} .ui-chrono-p b{font:800 15px/1 Barlow,sans-serif}
${U} .ui-chrono-p em{font:400 20px/1 "Bebas Neue",sans-serif;font-style:normal;color:#ffd451;letter-spacing:.04em}
${U} .ui-chrono-p small{font-size:12px;color:#8f9bc8}
${U} .ui-chrono-sep{display:inline-block;width:6px;height:6px;margin:0 16px;background:#3b4680;transform:rotate(45deg)}
@container (max-width: 760px){
  ${U} .ui-chrono-main{grid-template-columns:1fr 1fr}
  ${U} .ui-chrono-cardzone{grid-column:1 / -1;grid-row:1}
}
@container (max-width: 480px){
  ${U} .ui-chrono-main{grid-template-columns:1fr}
  ${U} .ui-chrono-led{height:72px;font-size:72px;line-height:72px}
  ${U} .ui-chrono-reel span{height:72px}
  ${U} .ui-chrono-btns button{font-size:22px;padding:13px 12px 15px}
  ${U} .ui-chrono-rounds li{padding:8px 11px;font-size:12px}
}
@keyframes chrono-ui-reel{from{transform:translateY(0)}to{transform:translateY(-100%)}}
@keyframes chrono-ui-bar{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@keyframes chrono-ui-hot{0%,83%{color:#ffb020}84%,100%{color:#ff3b2f}}
@keyframes chrono-ui-deal{from{opacity:0;transform:translateY(-40px) rotate(-14deg) scale(.9)}to{opacity:1;transform:rotate(-2.5deg)}}
@keyframes chrono-ui-float{0%,100%{transform:rotate(-2.5deg) translateY(0)}50%{transform:rotate(-1.8deg) translateY(-4px)}}
@keyframes chrono-ui-press{0%,8%,100%{transform:none}3%{transform:translateY(5px);box-shadow:0 1px 0 #0b6b33}}
@keyframes chrono-ui-plus{0%,2%{opacity:0;transform:translateY(0)}6%{opacity:1}22%{opacity:0;transform:translateY(-30px)}100%{opacity:0}}
@keyframes chrono-ui-roll{0%,18%{transform:translateX(0);animation-timing-function:cubic-bezier(.65,0,.35,1)}25%,43%{transform:translateX(-12.5%);animation-timing-function:cubic-bezier(.65,0,.35,1)}50%,68%{transform:translateX(-25%);animation-timing-function:cubic-bezier(.65,0,.35,1)}75%,93%{transform:translateX(-37.5%);animation-timing-function:cubic-bezier(.65,0,.35,1)}100%{transform:translateX(-50%)}}
@keyframes chrono-ui-live{0%,100%{opacity:1}50%{opacity:.35}}`;

export const chrono: Persona = {
  id: 'chrono',
  name: 'Coach Chrono',
  svg: DEFS + TRIBUNES + PARQUET + TABLEAU + BANDEROLES + PROJOS
    + TORSE + OREILLES + TETE + BARBE + CHEVEUX + SOURCILS + YEUX + NEZ + BOUCHE + CHAPEAU + SIFFLET
    + BRAS_D + SABLIER + MAIN_D + PLANCHETTE + BRAS_G + MAIN_G + TABLE + FLARE,
  css: CSS,
  variants: [
    { famille: 'tenue', nom: 'Tenue', choix: [['maillot', "Maillot d'arbitre rayé"], ['veste', "Veste de survêtement d'équipe"]] },
    { famille: 'tete', nom: 'Sur la tête', choix: [['casquette', 'Casquette bien droite'], ['bandeau', 'Bandeau éponge'], ['rien', 'Rien']] },
    { famille: 'barbe', nom: 'Barbe', choix: [['trois', 'Barbe de trois jours'], ['rase', 'Rasé']] },
  ],
  moodLabels: { repos: 'Mâche son chewing-gum', louche: 'Carton jaune ?', rire: 'Mort de rire', victoire: 'Coup de sifflet !', decu: 'Facepalm', surprise: 'Le sifflet s’envole' },
  react: 'victoire',
  moments: [
    ['Ton tour', 'victoire'],
    ['Trouvé !', 'rire'],
    ['Passer', 'decu'],
    ['Temps écoulé', 'surprise', [{ type: 'flash' }, { type: 'shake' }, { type: 'sparks', at: [466, 66], n: 46, power: 1.1, color: '255,140,60' }, { type: 'lines', at: [466, 66], n: 22, color: '255,170,110', delay: 80 }]],
  ],
  ambient: [
    { type: 'dust', box: [50, 40, 230, 250], density: 1.7, color: '255,240,210' },
    { type: 'dust', box: [400, 40, 200, 240], density: 1.1, color: '210,228,255' },
  ],
  bursts: {
    rire: [{ type: 'stars', at: [326, 88], n: 8, color: '255,236,170' }],
    victoire: [{ type: 'lines', at: [356, 146], n: 26, color: '255,250,225', delay: 180 }, { type: 'flash', delay: 200 }, { type: 'shake', delay: 200 },
      { type: 'confetti', n: 150, colors: ['#ffd451', '#ffffff', '#ff4d6d', '#3ee27e', '#4cc9f0'], delay: 260 }],
    decu: [{ type: 'smoke', at: [338, 146], n: 7, alpha: .18, color: '220,215,230', delay: 380 }],
    surprise: [{ type: 'lines', at: [326, 140], n: 20, delay: 100 }, { type: 'stars', at: [320, 50], n: 12, delay: 260 }],
  },
  moodMs: 3200,
  worldCss: UI_CSS,
};
