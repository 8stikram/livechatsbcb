// Inspecteur Loupe — mascot of Undercover. Rainy-night police office, painted noir.
// Key light: the green banker's lamp (warm, from the right). Rim light: the cold window (left).
(() => {
const S = [];
// A character piece: data-el (moved by the engine) > body rig > breathing > [head rig > look lean]
const P = (k, n, inner, head) => `<g data-el="${k}" data-nom="${n}"><g class="insp-b"><g class="insp-br">${head ? `<g class="insp-h"><g class="insp-hl"><g transform="translate(320 100) scale(1.12) translate(-320 -100)">${inner}</g></g></g>` : inner}</g></g></g>`;
const D = (k, n, inner) => `<g data-el="${k}" data-nom="${n}">${inner}</g>`;
const rep = (n, f) => Array.from({ length: n }, (_, i) => f(i)).join('');
const SK = 'url(#insp-skin)';

S.push(`<defs>
<linearGradient id="insp-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#11293a"/><stop offset=".55" stop-color="#0b1d29"/><stop offset="1" stop-color="#050f16"/></linearGradient>
<radialGradient id="insp-vig" cx=".5" cy=".42" r=".78"><stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>
<linearGradient id="insp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c2134"/><stop offset=".55" stop-color="#1d4161"/><stop offset="1" stop-color="#44193a"/></linearGradient>
<radialGradient id="insp-gR"><stop offset="0" stop-color="#ff3550" stop-opacity=".95"/><stop offset="1" stop-color="#ff3550" stop-opacity="0"/></radialGradient>
<radialGradient id="insp-gC"><stop offset="0" stop-color="#62d6ff" stop-opacity=".8"/><stop offset="1" stop-color="#62d6ff" stop-opacity="0"/></radialGradient>
<radialGradient id="insp-gA"><stop offset="0" stop-color="#ffbc66" stop-opacity=".9"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
<linearGradient id="insp-slat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c3d2"/><stop offset=".4" stop-color="#55707f"/><stop offset="1" stop-color="#1a2832"/></linearGradient>
<linearGradient id="insp-skin" x1="1" y1="0" x2="0" y2=".35"><stop offset="0" stop-color="#eeb084"/><stop offset=".5" stop-color="#c27f5b"/><stop offset="1" stop-color="#6b4335"/></linearGradient>
<linearGradient id="insp-coat" x1="1" y1="0" x2="0" y2=".25"><stop offset="0" stop-color="#d0ae6d"/><stop offset=".5" stop-color="#9c7d48"/><stop offset="1" stop-color="#4b3c25"/></linearGradient>
<linearGradient id="insp-coatL" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2c486"/><stop offset="1" stop-color="#8e7040"/></linearGradient>
<linearGradient id="insp-coatD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a2e1c"/><stop offset="1" stop-color="#6e5733"/></linearGradient>
<linearGradient id="insp-shirt" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f2ebda"/><stop offset=".6" stop-color="#c4c3ba"/><stop offset="1" stop-color="#7b8a92"/></linearGradient>
<linearGradient id="insp-tie" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1c0a0e"/><stop offset=".6" stop-color="#4c1a23"/><stop offset="1" stop-color="#6f2a32"/></linearGradient>
<linearGradient id="insp-hat" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#76604a"/><stop offset=".45" stop-color="#433427"/><stop offset="1" stop-color="#1c1611"/></linearGradient>
<linearGradient id="insp-hair" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8b1a8"/><stop offset=".5" stop-color="#76706a"/><stop offset="1" stop-color="#2e2a28"/></linearGradient>
<linearGradient id="insp-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe6a6"/><stop offset=".4" stop-color="#c9932f"/><stop offset="1" stop-color="#583a0f"/></linearGradient>
<linearGradient id="insp-leather" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#170b06"/><stop offset=".6" stop-color="#4f2c18"/><stop offset="1" stop-color="#26150b"/></linearGradient>
<radialGradient id="insp-glass" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#d8f2ff" stop-opacity=".1"/><stop offset="1" stop-color="#86bcd8" stop-opacity=".42"/></radialGradient>
<linearGradient id="insp-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e2417"/><stop offset="1" stop-color="#1f1009"/></linearGradient>
<radialGradient id="insp-pool"><stop offset="0" stop-color="#ffc471" stop-opacity=".6"/><stop offset="1" stop-color="#ff9a3a" stop-opacity="0"/></radialGradient>
<linearGradient id="insp-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd896" stop-opacity=".5"/><stop offset="1" stop-color="#ffb35a" stop-opacity="0"/></linearGradient>
<linearGradient id="insp-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6ad89a"/><stop offset=".45" stop-color="#18733f"/><stop offset="1" stop-color="#073620"/></linearGradient>
<linearGradient id="insp-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f5edda"/><stop offset="1" stop-color="#b4a88e"/></linearGradient>
<linearGradient id="insp-manila" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6c682"/><stop offset="1" stop-color="#a1803c"/></linearGradient>
<linearGradient id="insp-cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a857b"/><stop offset=".55" stop-color="#ebe5d8"/><stop offset="1" stop-color="#fff7e8"/></linearGradient>
<linearGradient id="insp-phone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b4c52"/><stop offset=".5" stop-color="#18191c"/><stop offset="1" stop-color="#050506"/></linearGradient>
<pattern id="insp-corkp" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#7b5b37"/><circle cx="1.5" cy="2" r=".8" fill="#5a4026"/><circle cx="5" cy="5.4" r=".7" fill="#9b7849"/><circle cx="4.6" cy="1.3" r=".45" fill="#4b3520"/><circle cx="2" cy="5.6" r=".4" fill="#a8855a"/></pattern>
<pattern id="insp-stubp" width="2.6" height="2.6" patternUnits="userSpaceOnUse"><circle cx=".7" cy=".8" r=".36" fill="#1f1a20"/><circle cx="2" cy="2" r=".33" fill="#1f1a20"/></pattern>
<filter id="insp-b1" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2"/></filter>
<filter id="insp-b2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"/></filter>
<filter id="insp-b4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4.5"/></filter>
<filter id="insp-b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
<filter id="insp-b16" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
<clipPath id="insp-winclip"><rect x="34" y="46" width="180" height="194"/></clipPath>
<clipPath id="insp-eyeLc"><path d="M294.5 103 C299 96.5 309 95.8 314.5 101.5 C309 106.2 300 107.2 294.5 103 Z"/></clipPath>
<clipPath id="insp-eyeRc"><path d="M345.5 103 C341 96.5 331 95.8 325.5 101.5 C331 106.2 340 107.2 345.5 103 Z"/></clipPath>
<clipPath id="insp-lensc"><circle cx="0" cy="-58" r="19.6"/></clipPath>
<g id="insp-maghandle">
 <rect x="-4.3" y="-31" width="8.6" height="58" rx="4.2" fill="url(#insp-leather)"/>
 <path d="M1.6 -27 L1.6 22" stroke="#8a5632" stroke-width="1.1" opacity=".55" stroke-linecap="round"/>
 <g stroke="#0e0604" stroke-width=".7" opacity=".55"><path d="M-4 -18 L4 -18"/><path d="M-4 -6 L4 -6"/><path d="M-4 6 L4 6"/></g>
 <rect x="-4.8" y="23" width="9.6" height="6.5" rx="3" fill="url(#insp-brass)"/>
 <rect x="-5" y="-36.5" width="10" height="6.5" rx="1.6" fill="url(#insp-brass)"/>
 <path d="M-2.6 -36.5 L-2.2 -39.6 L2.2 -39.6 L2.6 -36.5 Z" fill="#9a6d27"/>
</g>
<g id="insp-magrim">
 <circle cx="0" cy="-58" r="21.2" fill="none" stroke="url(#insp-brass)" stroke-width="4.2"/>
 <circle cx="0" cy="-58" r="23.3" fill="none" stroke="#3a250a" stroke-width=".9" opacity=".85"/>
 <circle cx="0" cy="-58" r="19.1" fill="none" stroke="#3a250a" stroke-width=".8" opacity=".75"/>
 <path d="M-17.5 -64 A21 21 0 0 1 -5 -78.5" stroke="#fff4cf" stroke-width="1.3" fill="none" opacity=".85" stroke-linecap="round"/>
 <path d="M-12.5 -66 A14 14 0 0 1 -1.5 -72.5" stroke="#fff" stroke-width="2.6" fill="none" opacity=".5" stroke-linecap="round"/>
 <path d="M11.5 -48 A14 14 0 0 1 6 -45" stroke="#fff" stroke-width="1.6" fill="none" opacity=".35" stroke-linecap="round"/>
</g>
<g id="insp-fistback">
 <path d="M-2 -14 C-11 -16 -20 -10 -21 -1 C-22 8 -17 16 -7 17 L4 16 L4 -14 Z" fill="url(#insp-skin)"/>
</g>
<g id="insp-fist">
 <path d="M-10.5 -12.8 C-17 -11 -21 -4 -20.6 3 C-20.2 10 -15.5 16 -8.5 16.2 L-10.5 3 Z" fill="#b8775a"/>
 <path d="M-10.5 -12.8 C-3 -14.4 6 -14 9.6 -10.8 C11.8 -8.6 11.2 -5 8.6 -4.5 C3 -4 -4 -4.4 -10.5 -4.4 Z" fill="url(#insp-skin)"/>
 <path d="M-11 -4.4 C-3 -5.4 7 -5 10.2 -2 C12.2 0 11.4 3.1 8.8 3.6 C3 4.1 -4 3.6 -11 3.6 Z" fill="url(#insp-skin)"/>
 <path d="M-10.6 3.6 C-3 2.6 6.2 3 9.2 5.6 C11 7.6 10.2 10.3 7.9 10.7 C2 11.1 -4 10.7 -10 10.6 Z" fill="url(#insp-skin)"/>
 <path d="M-9 10.6 C-3 9.9 4.2 10.1 7 12.1 C8.4 13.7 7.7 15.7 5.8 16.1 C1 16.5 -3.6 16.1 -8.4 15.7 Z" fill="url(#insp-skin)"/>
 <g stroke="#5a2e20" stroke-width=".95" fill="none" opacity=".75" stroke-linecap="round"><path d="M-9.5 -4.4 C-2 -4 4 -4 8.6 -4.5"/><path d="M-10 3.6 C-3 4 3 4 8.8 3.6"/><path d="M-9 10.6 C-3 11 2 11 7.9 10.7"/></g>
 <g fill="#ffd8b8" opacity=".4"><ellipse cx="-6.5" cy="-9" rx="2.4" ry="1.3"/><ellipse cx="-7" cy="-.6" rx="2.4" ry="1.3"/><ellipse cx="-6.6" cy="6.8" rx="2.2" ry="1.2"/></g>
 <path d="M4 -11 C8 -10.4 10.5 -8.6 10.4 -6.4" stroke="#fff" stroke-width=".8" fill="none" opacity=".3"/>
 <path d="M-15.5 -8 C-10 -15.5 -1 -17.6 5.2 -16 C8.2 -15.1 8.4 -12.4 6 -11.8 C0 -11 -7 -8.8 -12.4 -4 Z" fill="url(#insp-skin)"/>
 <path d="M2 -16.2 C5 -16.3 7.8 -15 7.6 -12.9 C6 -12.7 3.6 -12.9 2.2 -13.4 Z" fill="#efc2a6" opacity=".9"/>
 <path d="M-15.5 -8 C-12 -6 -9 -5 -6 -6" stroke="#5a2e20" stroke-width=".8" fill="none" opacity=".6"/>
 <path d="M-20.6 3 C-20.2 10 -15.5 16 -8.5 16.2 C-3 16.6 2 16.4 5.8 16.1 C-2 14 -12 10 -20.6 3 Z" fill="#000" opacity=".2"/>
</g>
</defs>`);
// ---------- back wall ----------
const rnd = (() => { let s = 7; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
S.push(`<rect width="640" height="400" fill="url(#insp-wall)"/>
<ellipse cx="120" cy="150" rx="190" ry="150" fill="url(#insp-gC)" opacity=".16"/>
<ellipse cx="516" cy="250" rx="150" ry="120" fill="url(#insp-gA)" opacity=".3"/>
<rect x="0" y="236" width="640" height="90" fill="#06121a" opacity=".75"/>
<rect x="0" y="234" width="640" height="3" fill="#1e3a4a" opacity=".8"/>
<rect x="0" y="237" width="640" height="2" fill="#000" opacity=".5"/>
<g stroke="#000" stroke-width="1.2" opacity=".35">${rep(9, (i) => `<path d="M${30 + i * 76} 246 L${30 + i * 76} 320"/>`)}</g>
<g stroke="#2a4a5c" stroke-width=".8" opacity=".35">${rep(9, (i) => `<path d="M${31.5 + i * 76} 246 L${31.5 + i * 76} 320"/>`)}</g>`);

S.push(D('fenetre', 'Fenêtre et pluie', `
<rect x="20" y="32" width="208" height="222" rx="2" fill="#0a1218"/>
<rect x="24" y="36" width="200" height="214" fill="#16252e"/>
<g clip-path="url(#insp-winclip)">
 <rect x="34" y="46" width="180" height="194" fill="url(#insp-sky)"/>
 <path d="M34 150 L52 150 L52 120 L70 120 L70 140 L84 140 L84 96 L104 96 L104 132 L118 132 L118 112 L140 112 L140 150 L156 150 L156 84 L176 84 L176 126 L192 126 L192 104 L214 104 L214 240 L34 240 Z" fill="#0b1824"/>
 <g fill="#ffd27a">${rep(26, () => { const x = 36 + Math.floor(rnd() * 170), y = 100 + Math.floor(rnd() * 120); return `<rect x="${x}" y="${y}" width="3" height="4" opacity="${(.25 + rnd() * .5).toFixed(2)}"/>`; })}</g>
 <g fill="#7fe0ff">${rep(10, () => `<rect x="${40 + Math.floor(rnd() * 160)}" y="${110 + Math.floor(rnd() * 100)}" width="3" height="4" opacity=".45"/>`)}</g>
 <ellipse cx="70" cy="214" rx="70" ry="40" fill="url(#insp-gR)" opacity=".75"/>
 <rect x="46" y="200" width="44" height="7" rx="3.5" fill="#ff5a6e" class="insp-neon"/>
 <ellipse cx="176" cy="96" rx="52" ry="38" fill="url(#insp-gC)" opacity=".5"/>
 <g class="insp-rain1" stroke="#bfe3ff" stroke-width=".8" opacity=".45" stroke-linecap="round">${rep(5, (r) => rep(14, (i) => { const x = 36 + ((i * 53 + r * 0) % 180), y = -60 + r * 60 + ((i * 37) % 60); return `<path d="M${x} ${y} l-3 13"/>`; }))}</g>
 <g class="insp-rain2" stroke="#9fd0f2" stroke-width=".55" opacity=".35" stroke-linecap="round">${rep(5, (r) => rep(18, (i) => { const x = 38 + ((i * 41) % 176), y = -60 + r * 60 + ((i * 23) % 60); return `<path d="M${x} ${y} l-2 9"/>`; }))}</g>
 ${rep(6, (i) => `<g class="insp-drop insp-drop${i}"><path d="M${48 + i * 29} ${40 + (i * 17) % 50} c0 6 -1.5 12 -.5 16" stroke="#cfeaff" stroke-width=".7" fill="none" opacity=".35"/><circle cx="${47.5 + i * 29}" cy="${57 + (i * 17) % 50}" r="1.5" fill="#e6f6ff" opacity=".7"/></g>`)}
</g>
<g>${rep(19, (i) => {
  const y = 46 + i * 10.4, bend = i === 9 || i === 10;
  const slat = bend
    ? `<path d="M30 ${y} L218 ${y + 3.4} L218 ${y + 9.4} L30 ${y + 6.2} Z" fill="url(#insp-slat)"/>`
    : `<rect x="30" y="${y}" width="188" height="6.2" rx="1" fill="url(#insp-slat)"/>`;
  return slat + `<rect x="30" y="${y + 6}" width="188" height=".9" fill="#000" opacity=".45"/>`;
})}</g>
<rect x="30" y="46" width="188" height="200" fill="url(#insp-gR)" opacity=".22" style="mix-blend-mode:screen"/>
<g stroke="#c8d8e0" stroke-width=".7" opacity=".5"><path d="M74 40 L74 244"/><path d="M174 40 L174 244"/></g>
<path d="M212 40 L212 196" stroke="#cbd7dd" stroke-width=".9" opacity=".6"/>
<path d="M210 196 L214 196 L215 208 L209 208 Z" fill="#a9b7be"/>
<rect x="26" y="36" width="196" height="9" fill="#26343d"/>
<rect x="26" y="36" width="196" height="2" fill="#5d7684" opacity=".7"/>
<rect x="16" y="248" width="216" height="8" rx="1.5" fill="#22323b"/>
<rect x="16" y="248" width="216" height="1.6" fill="#8fb4c6" opacity=".6"/>
<rect x="20" y="32" width="2" height="216" fill="#88c4e6" opacity=".25"/>`));

S.push(D('tableau', 'Tableau de l’enquête', `
<rect x="436" y="46" width="194" height="172" rx="2" fill="#2e1d11"/>
<rect x="436" y="46" width="194" height="2" fill="#7a5638" opacity=".7"/>
<rect x="443" y="53" width="180" height="158" fill="url(#insp-corkp)"/>
<rect x="443" y="53" width="180" height="158" fill="none" stroke="#000" stroke-width="5" opacity=".35" filter="url(#insp-b2)"/>
<g transform="rotate(-7 470 86)"><rect x="451" y="62" width="39" height="47" fill="#ece5d4"/><rect x="454" y="65" width="33" height="33" fill="#2c3946"/><circle cx="470.5" cy="77" r="6" fill="#121820"/><path d="M459 98 C460 88 466 85 470.5 85 C475 85 481 88 482 98 Z" fill="#121820"/><path d="M462 72 C464 66 477 66 479 72 L483 73 L458 73 Z" fill="#121820"/><path d="M456 104 C462 102 468 105 476 103" stroke="#3a3a6a" stroke-width=".9" fill="none"/></g>
<g transform="rotate(5 541 88)"><rect x="522" y="64" width="39" height="47" fill="#efe8d6"/><rect x="525" y="67" width="33" height="33" fill="#34404c"/><path d="M527 92 L531 84 L551 84 L556 92 Z" fill="#141a20"/><circle cx="533" cy="93" r="3" fill="#0a0d10"/><circle cx="550" cy="93" r="3" fill="#0a0d10"/><ellipse cx="541" cy="86" rx="13" ry="9" fill="none" stroke="#d32a36" stroke-width="1.3"/><path d="M528 106 C534 104 540 107 550 105" stroke="#3a3a6a" stroke-width=".9" fill="none"/></g>
<g transform="rotate(3 598 80)"><rect x="579" y="58" width="38" height="46" fill="#d9d1bd"/><rect x="582" y="62" width="32" height="5" fill="#2b2620"/>${rep(8, (i) => `<rect x="582" y="${71 + i * 4}" width="${i % 3 === 2 ? 20 : 32}" height="1.6" fill="#6a6152"/>`)}</g>
<g transform="rotate(-4 596 140)"><rect x="577" y="116" width="38" height="46" fill="#ece5d4"/><rect x="580" y="119" width="32" height="32" fill="#283340"/><path d="M584 151 C585 140 591 137 596 137 C601 137 607 140 608 151 Z" fill="#11171d"/><circle cx="596" cy="131" r="5.5" fill="#11171d"/><path d="M586 127 C589 121 603 121 606 127 L610 128 L582 128 Z" fill="#11171d"/><text x="604" y="128" font-family="Permanent Marker" font-size="14" fill="#e3303d">?</text></g>
<g transform="rotate(4 474 148)"><rect x="456" y="130" width="34" height="32" fill="#e8d26a"/><rect x="456" y="130" width="34" height="5" fill="#d8bf55"/><path d="M460 142 C466 140 474 143 484 141 M460 149 C467 147 476 150 482 148 M460 156 C465 154 470 156 474 155" stroke="#4a3a2a" stroke-width=".9" fill="none"/></g>
<g transform="rotate(-3 532 160)"><rect x="505" y="142" width="56" height="35" fill="#f2ede0"/><rect x="505" y="149" width="56" height=".9" fill="#d24a4a"/>${rep(5, (i) => `<rect x="509" y="${154 + i * 4.4}" width="${46 - (i % 2) * 14}" height="1.4" fill="#444"/>`)}</g>
<g transform="rotate(2 478 188)"><rect x="456" y="172" width="46" height="32" fill="#cdc6a2"/><path d="M458 180 L500 192 M470 172 L476 204 M458 196 L500 178" stroke="#8a8466" stroke-width="1.2"/><path d="M484 184 l6 6 M490 184 l-6 6" stroke="#d32a36" stroke-width="1.6"/></g>
<g fill="none" stroke="#c4202e" stroke-width="1.15" opacity=".95"><path d="M470 64 Q505 72 541 66"/><path d="M541 66 Q574 90 596 118"/><path d="M596 118 Q560 136 532 143"/><path d="M532 143 Q500 150 477 131"/><path d="M477 131 Q470 100 470 64"/><path d="M532 143 Q520 168 482 174"/></g>
${[[470, 64], [541, 66], [596, 118], [532, 143], [477, 131], [482, 174], [598, 59]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#d2232f"/><circle cx="${x - .8}" cy="${y - .8}" r=".9" fill="#ffb3b8"/>`).join('')}`));

S.push(`<g fill="#a6dcff" filter="url(#insp-b2)" class="insp-stripes">${rep(8, (i) => `<path d="M228 ${60 + i * 22} L228 ${68 + i * 22} L640 ${150 + i * 34} L640 ${136 + i * 34} Z" opacity="${i > 5 ? .05 : .075}"/>`)}</g>
<g fill="#ff4d62" filter="url(#insp-b2)" opacity=".07"><path d="M228 216 L228 226 L640 340 L640 322 Z"/></g>`);

S.push(D('ventilo', 'Ombre du ventilateur', `<g opacity=".3" filter="url(#insp-b8)"><g class="insp-fan" fill="#000">${rep(4, (i) => `<ellipse cx="470" cy="-80" rx="20" ry="80" transform="rotate(${i * 90} 470 0)"/>`)}<circle cx="470" cy="0" r="16"/></g></g>`));

S.push(D('neon', 'Tube néon', `
<g class="insp-tube"><ellipse cx="320" cy="16" rx="130" ry="30" fill="#cfefff" opacity=".22" filter="url(#insp-b8)"/><rect x="240" y="11" width="160" height="5.5" rx="2.7" fill="#e9fbff"/></g>
<rect x="232" y="0" width="176" height="12" rx="1.5" fill="#1a242b"/><rect x="232" y="10" width="176" height="2" fill="#56707e"/>
<rect x="238" y="11" width="5" height="6" fill="#39464f"/><rect x="397" y="11" width="5" height="6" fill="#39464f"/>`));
/*@@BG@@*/
// ---------- the inspector: torso ----------
S.push(P('torse', 'Torse et imper', `
<defs><pattern id="insp-tiep" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="2" fill="#a4505a"/></pattern></defs>
<path d="M274 192 C276 170 280 148 286 130 C300 141 340 141 354 130 C360 148 364 170 366 192 Z" fill="#3e311d"/>
<path d="M303 136 C303 152 302 166 299 186 L341 186 C338 166 337 152 337 136 Z" fill="${SK}"/>
<path d="M303 136 C303 152 302 166 299 186 L310 186 C310 168 311 152 313 140 Z" fill="#000" opacity=".22"/>
<ellipse cx="320" cy="152" rx="21" ry="10" fill="#000" opacity=".45" filter="url(#insp-b2)"/>
<path d="M276 186 C262 187 248 189 240 195 C234 200 232 210 232 224 L234 334 L406 334 L408 224 C408 210 406 200 400 195 C392 189 378 187 364 186 Z" fill="url(#insp-coat)"/>
<path d="M300 168 L340 168 L355 334 L285 334 Z" fill="url(#insp-shirt)"/>
<path d="M300 168 L305 168 L292 334 L285 334 Z" fill="#000" opacity=".35" filter="url(#insp-b1)"/>
<path d="M340 168 L335 168 L348 334 L355 334 Z" fill="#000" opacity=".25" filter="url(#insp-b1)"/>
<g fill="#d9d2c2" opacity=".9"><circle cx="320.5" cy="232" r="1.3"/><circle cx="321" cy="262" r="1.3"/><circle cx="321.5" cy="292" r="1.3"/></g>
<path d="M306 166 L334 166 L320 184 Z" fill="${SK}"/>
<path d="M306 166 L320 184 L313 166 Z" fill="#000" opacity=".2"/>
<g class="insp-tie">
 <path d="M314.8 188 L323.2 188 L328.5 288 L319.5 298 L310.5 288 Z" fill="url(#insp-tie)"/>
 <path d="M314.8 188 L323.2 188 L328.5 288 L319.5 298 L310.5 288 Z" fill="url(#insp-tiep)" opacity=".28"/>
 <path d="M321 192 L325.5 286" stroke="#ff9aa0" stroke-width=".8" opacity=".25"/>
 <path d="M314.8 188 L317.2 188 L313.5 288 L310.5 288 Z" fill="#000" opacity=".3"/>
</g>
<path d="M312.5 177.5 L327 178.5 L324 189.5 L315 189.5 Z" fill="url(#insp-tie)"/>
<path d="M319 179 L320 188.5" stroke="#000" stroke-width=".9" opacity=".4"/>
<path d="M306 157 C302 164 299 172 296.5 180 L314 191 L317.5 178 Z" fill="url(#insp-shirt)"/>
<path d="M334 157 C338 164 341 172 343.5 180 L326 191 L322.5 178 Z" fill="#efe8d8"/>
<path d="M306 157 C302 164 299 172 296.5 180 L302 184 C303 176 305 167 307.5 159 Z" fill="#000" opacity=".25"/>
<path d="M240 198 C254 200 268 204 281 210 L277 241 C264 239 252 237 239 235 Z" fill="#87693c"/>
<path d="M243 232 L276 237" stroke="#000" stroke-width="2" opacity=".25" filter="url(#insp-b1)"/>
<path d="M244 201 L279 212 M277 214 L274 238" stroke="#3a2c18" stroke-width=".6" stroke-dasharray="2 1.6" fill="none" opacity=".7"/>
<circle cx="271" cy="229" r="2.6" fill="#24180e"/><circle cx="270.4" cy="228.4" r=".9" fill="#a88a5c"/>
<path d="M240 195 C234 200 232 210 232 224 L234 334 L263 334 C258 292 256 250 258 216 C252 206 246 199 240 195 Z" fill="#000" opacity=".22"/>
<ellipse cx="390" cy="222" rx="16" ry="30" fill="#ffd59a" opacity=".2" filter="url(#insp-b4)"/>
<path d="M302 179 L290 266 C287 254 282 244 276 236" stroke="#000" stroke-width="5" fill="none" opacity=".3" filter="url(#insp-b2)"/>
<path d="M338 179 L350 266 C353 254 358 244 364 236" stroke="#000" stroke-width="5" fill="none" opacity=".22" filter="url(#insp-b2)"/>
<path d="M302 179 L290 266 C282 246 270 228 259 217 L267 206 L274 192 Z" fill="#7b6038"/>
<path d="M302 179 L290 266 C288 250 288 230 293 208 Z" fill="#000" opacity=".15"/>
<path d="M302 179 L290 266" stroke="#c9ab72" stroke-width="1.1" opacity=".55"/>
<path d="M338 179 L350 266 C358 246 370 228 381 217 L373 206 L366 192 Z" fill="url(#insp-coatL)"/>
<path d="M338 179 L350 266" stroke="#f6dca2" stroke-width="1.2" opacity=".7"/>
<path d="M270 196 C268 172 274 150 284 128 C292 146 298 164 302 179 C294 188 283 193 270 196 Z" fill="#6c5430"/>
<path d="M370 196 C372 172 366 150 356 128 C348 146 342 164 338 179 C346 188 357 193 370 196 Z" fill="url(#insp-coatL)"/>
<path d="M284 128 C277 150 272 172 272 194 M356 128 C363 150 368 172 368 194" stroke="#2a2012" stroke-width=".6" stroke-dasharray="2 1.6" fill="none" opacity=".6"/>
<path d="M284 128 C292 146 298 164 302 179" stroke="#a6d6f0" stroke-width=".9" opacity=".35" fill="none"/>
<path d="M356 128 C348 146 342 164 338 179" stroke="#fff0c8" stroke-width=".9" opacity=".55" fill="none"/>
<path d="M268 205 L273 198 L276 206 Z M372 205 L367 198 L364 206 Z" fill="#1d150c" opacity=".8"/>
<path d="M236 198 L278 190 L279.5 198 L238 206 Z" fill="#7f6439"/><path d="M236 198 L278 190" stroke="#b39463" stroke-width=".8" opacity=".6"/>
<path d="M404 198 L362 190 L360.5 198 L402 206 Z" fill="#c2a265"/><path d="M404 198 L362 190" stroke="#ffe6b0" stroke-width=".8" opacity=".6"/>
<circle cx="273" cy="194.5" r="2.4" fill="#24180e"/><circle cx="367" cy="194.5" r="2.4" fill="#2c1e12"/><circle cx="366.4" cy="193.9" r=".8" fill="#e6c48a"/>
${[[267, 252], [269, 284], [373, 252], [371, 284]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.7" fill="#2a1c10"/><circle cx="${x}" cy="${y}" r="2.4" fill="none" stroke="#5a4028" stroke-width=".7"/><circle cx="${x - 1}" cy="${y - 1}" r=".9" fill="${x > 320 ? '#f2d39a' : '#9a8060'}"/>`).join('')}
<path d="M233 294 L289 297 L288.5 309.5 L233 307.5 Z" fill="#6a5130"/><path d="M233 294 L289 297" stroke="#a88a58" stroke-width=".8" opacity=".6"/>
<rect x="251" y="293" width="12" height="17" rx="1.5" fill="none" stroke="url(#insp-brass)" stroke-width="2.2"/>
<path d="M251 299 L240 300 L238 304 L251 305 Z" fill="#5a4428"/>
<path d="M407 294 L351 297 L351.5 309.5 L407 307.5 Z" fill="#b39258"/><path d="M407 294 L351 297" stroke="#f2d79e" stroke-width=".8" opacity=".6"/>
<rect x="384" y="292" width="5" height="19" rx="1" fill="#9a7c48"/>
<g stroke="#000" fill="none" opacity=".28" filter="url(#insp-b1)" stroke-width="2.2"><path d="M250 311 C251 318 252 326 251 334"/><path d="M278 312 C276 320 276 328 277 334"/><path d="M366 312 C368 320 369 328 368 334"/><path d="M394 312 C396 320 396 328 397 334"/><path d="M262 248 C266 262 266 276 262 292"/><path d="M380 246 C376 262 376 276 380 292"/></g>
<path d="M402 200 C407 208 408 218 408 230" stroke="#ffc27a" stroke-width="1.4" fill="none" opacity=".55"/>`));

// ---------- head ----------
S.push(P('oreilles', 'Oreilles', `
<path d="M287 98 C281 94 276 98 277 106 C278 114 281 120 288 122 Z" fill="#9a6047"/>
<path d="M284 101 C281 101 280 105 281 110 C282 114 284 116 286 117" stroke="#4a2519" stroke-width="1.2" fill="none" opacity=".8"/>
<path d="M287 98 C281 94 276 98 277 106" stroke="#9ad8ff" stroke-width="1" fill="none" opacity=".5"/>
<path d="M353 98 C359 94 364 98 363 106 C362 114 359 120 352 122 Z" fill="${SK}"/>
<path d="M353 98 C359 94 364 98 363 106 C362 114 359 120 352 122 Z" fill="#ff7a52" opacity=".22"/>
<path d="M356 101 C359 101 360 105 359 110 C358 114 356 116 354 117" stroke="#6a3324" stroke-width="1.2" fill="none" opacity=".75"/>`, true));

S.push(P('tete', 'Tête', `
<path d="M320 58 C342 58 355 72 356 92 C357 102 355 110 353 117 C352 126 351 133 348 139 C344 147 337 152 330 154 C326 156 323 156 320 156 C317 156 314 156 310 154 C303 152 296 147 292 139 C289 133 288 126 287 117 C285 110 283 102 284 92 C285 72 298 58 320 58 Z" fill="${SK}"/>
<path d="M284 92 C283 102 285 110 287 117 C288 126 289 133 292 139 C296 147 303 152 310 154 C314 156 317 156 320 156 C312 150 304 140 300 128 C297 118 296 106 297 94 C298 84 300 76 304 70 C294 74 285 82 284 92 Z" fill="#000" opacity=".17"/>
<path d="M291 115 C294 126 299 134 306 141 C297 139 291 130 289 120 Z" fill="#000" opacity=".28" filter="url(#insp-b2)"/>
<path d="M349 115 C346 126 341 134 334 141 C343 139 349 130 351 120 Z" fill="#000" opacity=".16" filter="url(#insp-b2)"/>
<ellipse cx="305" cy="100" rx="12" ry="6.5" fill="#3a1a12" opacity=".28" filter="url(#insp-b2)"/>
<ellipse cx="335" cy="100" rx="12" ry="6.5" fill="#3a1a12" opacity=".2" filter="url(#insp-b2)"/>
<path d="M289 124 C291 136 297 147 307 153 C313 156 327 156 333 153 C343 147 349 136 351 124 C346 130 340 134 334 136 C330 129 326 127 320 127 C314 127 310 129 306 136 C300 134 294 130 289 124 Z" fill="#34303c" opacity=".26"/>
<path d="M289 124 C291 136 297 147 307 153 C313 156 327 156 333 153 C343 147 349 136 351 124 C346 130 340 134 334 136 C330 129 326 127 320 127 C314 127 310 129 306 136 C300 134 294 130 289 124 Z" fill="url(#insp-stubp)" opacity=".5"/>
<ellipse cx="343" cy="112" rx="8" ry="13" fill="#ffd2a4" opacity=".3" filter="url(#insp-b2)"/>
<ellipse cx="330" cy="76" rx="14" ry="6" fill="#ffd2a4" opacity=".22" filter="url(#insp-b2)"/>
<ellipse cx="323" cy="149" rx="6" ry="2.6" fill="#ffd0a4" opacity=".22" filter="url(#insp-b1)"/>
<g stroke="#6e3f2e" stroke-width=".9" fill="none" opacity=".45" stroke-linecap="round">
 <path d="M306 79 C313 77 327 77 334 79"/><path d="M309 84 C315 82.6 325 82.6 331 84"/>
 <path d="M292 101 l-3.4 -1.6 M292 104 l-3.6 .4 M293 106.5 l-2.8 2.2"/><path d="M348 101 l3.4 -1.6 M348 104 l3.6 .4 M347 106.5 l2.8 2.2"/>
 <path d="M311.5 120 C307 126 306 132 308 139"/><path d="M328.5 120 C333 126 334 132 332 139"/>
 <path d="M320 148.5 L320 153"/>
</g>
<path d="M285 88 C283 100 285 110 287 117 C288 126 289 133 292 139 C296 147 303 152 310 154" stroke="#9ad8ff" stroke-width="1.4" fill="none" opacity=".5"/>
<path d="M355 100 C356 110 353 120 351 130 C350 136 347 143 340 149" stroke="#ffc27a" stroke-width="1" fill="none" opacity=".45"/>`, true));

S.push(P('cheveux', 'Cheveux poivre et sel', `
<path d="M283 96 C281 76 290 58 316 54 C342 51 359 66 358 94 C355 83 350 77 344 74 C334 69.5 322 70.5 312 71.5 C302 72.5 293 77 288 86 C286 90 284.5 93 283 96 Z" fill="url(#insp-hair)"/>
<path d="M284 98 C283 90 285 82 290 75 L295 73 C291 80 289 88 289.5 98 C289 101 288 104 286.5 106 Z" fill="#6f6964"/>
<path d="M356 98 C357 90 355 82 350 75 L345 73 C349 80 351 88 350.5 98 C351 101 352 104 353.5 106 Z" fill="#a8a199"/>
<path d="M304 56 C301.5 62 299.5 67 298.5 72" stroke="#2a2624" stroke-width="1.2" fill="none" opacity=".7"/>
<g stroke="#e3ddd4" stroke-width="1" fill="none" opacity=".55" stroke-linecap="round"><path d="M318 58 C330 57 342 62 350 72"/><path d="M322 63 C333 63 343 67 351 78"/><path d="M308 60 C312 58 316 57.5 320 57.5"/><path d="M352 84 C353 88 353.5 92 353.5 96"/></g>
<g stroke="#2a2624" stroke-width="1" fill="none" opacity=".5" stroke-linecap="round"><path d="M296 62 C292 66 289 72 287 80"/><path d="M300 64 C296 69 293 75 291 82"/><path d="M286 86 C285.5 90 285.6 94 286 98"/></g>
<g fill="#d8d2ca" opacity=".55">${rep(14, (i) => `<rect x="${290 + (i * 37) % 62}" y="${58 + (i * 13) % 26}" width="2.4" height=".7" rx=".35" transform="rotate(${(i * 29) % 50 - 25} ${291 + (i * 37) % 62} ${58 + (i * 13) % 26})"/>`)}</g>
<path d="M283 96 C281 76 290 58 316 54" stroke="#9ad8ff" stroke-width="1" fill="none" opacity=".4"/>`, true));
// eyes: almond whites clipped, iris follows --look, lids scale per mood
const eye = (s) => {
  const c = s === 'L' ? 305 : 335, f = s === 'L' ? 1 : -1, X = (d) => c + f * d;
  const lid = s === 'L' ? '#9d6249' : '#c98a64';
  return `<g class="insp-eye insp-eye${s}">
 <path d="M${X(-10.5)} 103 C${X(-6)} 96.5 ${X(4)} 95.8 ${X(9.5)} 101.5 C${X(4)} 106.2 ${X(-5)} 107.2 ${X(-10.5)} 103 Z" fill="#e6ddd0"/>
 <g clip-path="url(#insp-eye${s}c)">
  <rect x="${c - 12}" y="95" width="24" height="5" fill="#5a3a30" opacity=".35" filter="url(#insp-b1)"/>
  <g class="insp-look"><g class="insp-dart insp-dart${s}"><g class="insp-iris">
   <circle cx="${c}" cy="101.6" r="4" fill="#5d7f8c"/><circle cx="${c}" cy="101.6" r="4" fill="none" stroke="#1f323a" stroke-width=".9"/>
   <circle cx="${c}" cy="101.6" r="1.9" fill="#0a0e11"/><circle cx="${c + 1.4}" cy="100.2" r="1.05" fill="#fff"/><circle cx="${c - 1.5}" cy="103" r=".5" fill="#fff" opacity=".6"/>
  </g></g></g>
  <g class="insp-lid insp-lid${s}"><path d="M${X(-13)} 88 L${X(12)} 88 L${X(12)} 100 C${X(5)} 99 ${X(-5)} 99 ${X(-13)} 102.8 Z" fill="${lid}"/>
   <path d="M${X(-11.5)} 102.6 C${X(-5)} 99.2 ${X(5)} 99.1 ${X(11)} 100.8" stroke="#22120c" stroke-width="1.7" fill="none" stroke-linecap="round"/></g>
  <g class="insp-lidlo insp-lidlo${s}"><path d="M${X(-13)} 113 L${X(12)} 113 L${X(12)} 104 C${X(5)} 106.5 ${X(-5)} 107 ${X(-13)} 104 Z" fill="${lid}"/></g>
 </g>
 <path d="M${X(-9.5)} 103.6 C${X(-5)} 106.4 ${X(4)} 106.3 ${X(9)} 102.2" stroke="#5c3326" stroke-width=".7" fill="none" opacity=".6"/>
</g>
<path d="M${X(-10)} 96.6 C${X(-5)} 93.4 ${X(5)} 93.4 ${X(10)} 96.8" stroke="#5c3326" stroke-width=".8" fill="none" opacity=".5"/>
<path d="M${X(-9)} 107.5 C${X(-4)} 110.6 ${X(4)} 110.6 ${X(8.5)} 107.5" stroke="#5c3326" stroke-width=".9" fill="none" opacity=".5"/>
<path d="M${X(-7)} 111 C${X(-2)} 113 ${X(3)} 113 ${X(7)} 111" stroke="#5c3326" stroke-width=".7" fill="none" opacity=".3"/>`;
};
S.push(P('yeux', 'Yeux', `${eye('L')}${eye('R')}
<g class="insp-eyes-rire" stroke="#22120c" stroke-width="2" fill="none" stroke-linecap="round"><path d="M295 104 C299 99.5 309 99 314.5 102.5"/><path d="M345 104 C341 99.5 331 99 325.5 102.5"/>
<path d="M297 108 C302 110 308 110 312 108 M343 108 C338 110 332 110 328 108" stroke="#5c3326" stroke-width=".9" opacity=".6"/></g>`, true));

S.push(P('sourcils', 'Sourcils', `
<g class="insp-browL"><path d="M289.5 95.5 C296 90 306 88.4 316 90.2 L316.4 94.4 C307 92.8 298 93.8 289.5 95.5 Z" fill="#4c4642"/>
<g stroke="#b3aba1" stroke-width=".6" opacity=".7" stroke-linecap="round"><path d="M298 92.4 l4 -1.4 M304 91.4 l4 -.9 M309 91.2 l4 -.6 M293 94 l3 -1.4"/></g></g>
<g class="insp-browR"><path d="M350.5 95.5 C344 90 334 88.4 324 90.2 L323.6 94.4 C333 92.8 342 93.8 350.5 95.5 Z" fill="#5a534e"/>
<g stroke="#cfc7bc" stroke-width=".6" opacity=".7" stroke-linecap="round"><path d="M342 92.4 l-4 -1.4 M336 91.4 l-4 -.9 M331 91.2 l-4 -.6 M347 94 l-3 -1.4"/></g></g>
<g class="insp-frown" stroke="#5c3326" stroke-width=".9" fill="none" opacity=".6"><path d="M317.5 93 C318 95.5 318 97 317.6 99"/><path d="M322.5 93 C322 95.5 322 97 322.4 99"/></g>`, true));

S.push(P('nez', 'Nez', `
<path d="M316.5 95 C315.5 106 313 115 310.5 121 C312.5 124.5 315.5 125.5 317.5 125 C316.5 116 317 106 318.5 95 Z" fill="#000" opacity=".2"/>
<path d="M321.5 98 C322 106 322.5 112 322.6 116" stroke="#ffd2aa" stroke-width="1.4" fill="none" opacity=".35" stroke-linecap="round"/>
<path d="M313.6 118.5 C310.5 119 309 121.5 310 123.8 C311 125.5 313.6 126 315.8 125" stroke="#5e3226" stroke-width="1" fill="none"/>
<path d="M326.4 118.5 C329.5 119 331 121.5 330 123.8 C329 125.5 326.4 126 324.2 125" stroke="#5e3226" stroke-width="1" fill="none" opacity=".8"/>
<ellipse cx="316.2" cy="124.5" rx="1.9" ry="1" fill="#3b1a12" opacity=".85" transform="rotate(15 316.2 124.5)"/>
<ellipse cx="323.8" cy="124.5" rx="1.9" ry="1" fill="#3b1a12" opacity=".85" transform="rotate(-15 323.8 124.5)"/>
<ellipse cx="322" cy="119.6" rx="2.6" ry="1.9" fill="#ffd8b4" opacity=".55"/>
<ellipse cx="320" cy="127.6" rx="6.5" ry="1.7" fill="#000" opacity=".22" filter="url(#insp-b1)"/>`, true));

S.push(P('bouche', 'Bouche', `<g class="insp-m">
<g class="insp-m-repos"><path d="M310 134.6 C315 133 325 133 330 135" stroke="#6a3a2c" stroke-width="1" fill="none" opacity=".4"/><path d="M309.5 136.4 C314 135.3 326 135.1 330.5 137" stroke="#3b1610" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M313 138.8 C317 140.6 323 140.6 327 139" stroke="#a3604a" stroke-width="1.4" fill="none" opacity=".7"/><path d="M308.5 137.6 l-1.2 1.4 M331.5 138 l1.2 1.4" stroke="#5c3326" stroke-width=".8" opacity=".6"/></g>
<g class="insp-m-louche"><path d="M310.5 137.4 C315 137.4 322 136.4 331.5 132.4" stroke="#3b1610" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M315 139.8 C320 140.6 326 139 329.5 136" stroke="#a3604a" stroke-width="1.4" fill="none" opacity=".7"/><path d="M332.6 131 C334 132.4 334.4 134 333.6 135.6" stroke="#5c3326" stroke-width=".9" fill="none" opacity=".7"/></g>
<g class="insp-m-rire"><path d="M307 132.8 C314 130.8 326 130.8 333 132.8 C331 142.5 323 146.5 320 146.5 C317 146.5 309 142.5 307 132.8 Z" fill="#2a0c08"/><path d="M309 133.2 C315 131.8 325 131.8 331 133.2 L330.2 136.4 C324 135.4 316 135.4 309.8 136.4 Z" fill="#efe6d6"/><path d="M313.5 142.4 C316 139.8 324 139.8 326.5 142.4 C324 145.4 316 145.4 313.5 142.4 Z" fill="#9c403a"/><path d="M311 143.6 C315 148.2 325 148.2 329 143.6 C327 149.2 313 149.2 311 143.6 Z" fill="#a0604a"/></g>
<g class="insp-m-victoire"><path d="M304.5 131.2 C312 134 328 134 335.5 130.8 C333.5 140.5 326 144 320 144 C314 144 306.5 140.5 304.5 131.2 Z" fill="#2a0c08"/><path d="M306 132 C313 134.6 327 134.6 334 131.6 L333 135.6 C326 137.6 314 137.6 307.2 135.8 Z" fill="#f2ead9"/><g stroke="#b9ae98" stroke-width=".6"><path d="M313 134 l0 3 M317.5 134.6 l0 3 M322.5 134.6 l0 3 M327 134 l0 3"/></g><path d="M310 140.4 C315 142 325 142 330 140 L329 142 C324 143.4 316 143.4 311 142.2 Z" fill="#d9cfbd"/><path d="M310 143 C315 147 325 147 330 143" stroke="#a0604a" stroke-width="1.5" fill="none"/></g>
<g class="insp-m-decu"><path d="M308.5 140 C312 136.2 316 135.2 320 135.4 C324 135.2 328 136.2 331.5 140" stroke="#3b1610" stroke-width="1.7" fill="none" stroke-linecap="round"/><ellipse cx="320" cy="137.2" rx="3.2" ry="1.5" fill="#2a0c08"/><path d="M314 141.6 C318 142.8 322 142.8 326 141.6" stroke="#a3604a" stroke-width="1.3" fill="none" opacity=".7"/></g>
<g class="insp-m-surprise"><ellipse cx="320" cy="139.5" rx="5.4" ry="7" fill="#2a0c08"/><ellipse cx="320" cy="143.4" rx="3.2" ry="2.2" fill="#8a3a34"/><ellipse cx="320" cy="139.5" rx="5.6" ry="7.2" fill="none" stroke="#a0604a" stroke-width="1.4"/></g>
</g>`, true));

S.push(P('moustache', 'Moustache', `
<g data-var="moustache" data-variante="moustache"><g class="insp-mous">
 <path d="M320 127.4 C326.5 125.2 333.5 126.8 337 133.4 C334.4 132.6 330.4 132.4 326.8 133.2 C324.4 133.6 322 134 320 133.2 C318 134 315.6 133.6 313.2 133.2 C309.6 132.4 305.6 132.6 303 133.4 C306.5 126.8 313.5 125.2 320 127.4 Z" fill="url(#insp-hair)"/>
 <path d="M303 133.4 C311 132.2 329 132.2 337 133.4" stroke="#1b1614" stroke-width="1" fill="none" opacity=".8"/>
 <g stroke="#ddd6cc" stroke-width=".55" opacity=".6" stroke-linecap="round"><path d="M324 128.4 l3 3 M328 128.6 l3 3 M332 130 l2 2.4 M316 128.4 l-3 3 M312 128.6 l-3 3"/></g>
 <path d="M320 127.4 C313.5 125.2 306.5 126.8 303 133.4" stroke="#9ad8ff" stroke-width=".7" fill="none" opacity=".35"/>
</g></g>
<g data-var="moustache" data-variante="rase"><path d="M306 131 C312 128.6 328 128.6 334 131" stroke="#2a2430" stroke-width="3" fill="none" opacity=".12" filter="url(#insp-b1)"/></g>`, true));

S.push(P('chapeau', 'Chapeau', `
<g data-var="chapeau" data-variante="feutre">
<g class="insp-hatshadow"><path d="M285 80 C300 88 340 88 355 80 L355 95 C340 100 300 100 285 95 Z" fill="#000" opacity=".38" filter="url(#insp-b2)"/></g>
<g class="insp-hat"><g transform="rotate(-4 320 72)">
 <path d="M263 77.5 C276 69 300 66 320 66 C340 66 364 69 377 77.5 C362 74 340 72 320 72 C300 72 278 74 263 77.5 Z" fill="#1d1612"/>
 <path d="M291 73 C289 61 291 49 299 44 C307 40 313 42.5 320 44.5 C327 42.5 333 40 341 44 C349 49 351 61 349 73 Z" fill="url(#insp-hat)"/>
 <path d="M307 45 C313 50.5 327 50.5 333 45 C327 47.4 313 47.4 307 45 Z" fill="#000" opacity=".4"/>
 <path d="M298 50 C299.5 56 300 62 300 68 M342 50 C340.5 56 340 62 340 68" stroke="#000" stroke-width="2.4" fill="none" opacity=".22" filter="url(#insp-b1)"/>
 <path d="M339 46 C346.5 50 348.5 60 347.6 70" stroke="#b39878" stroke-width="1.6" fill="none" opacity=".5"/>
 <path d="M291 73 C289 61 291 49 299 44" stroke="#9ad8ff" stroke-width="1" fill="none" opacity=".45"/>
 <path d="M290.4 62.4 C303 66 337 66 349.6 62.4 L349.8 72.6 C337 75.2 303 75.2 290.2 72.6 Z" fill="#140f0c"/>
 <path d="M290.4 62.4 C303 66 337 66 349.6 62.4" stroke="#5a4636" stroke-width=".8" fill="none"/>
 <path d="M293 64 L299 66.5 L299 71.5 L293 72 Z" fill="#241a14"/>
 <path d="M262 78 C270 74 290 71.5 320 71.5 C350 71.5 370 74 378 78 C373 82.6 360 82.8 350 81.2 C340 85 331 88 320 88 C309 88 300 85 290 81.2 C280 82.8 267 82.6 262 78 Z" fill="url(#insp-hat)"/>
 <path d="M262 78 C267 82.6 280 82.8 290 81.2 C300 85 309 88 320 88 C331 88 340 85 350 81.2 C360 82.8 373 82.6 378 78" stroke="#120d0a" stroke-width="1.6" fill="none"/>
 <path d="M336 74 C352 74.6 366 76 375 78.4" stroke="#c4a888" stroke-width="1" fill="none" opacity=".55"/>
 <path d="M264 78.6 C270 75 282 73.2 296 72.6" stroke="#9ad8ff" stroke-width=".9" fill="none" opacity=".45"/>
</g></g></g>
<g data-var="chapeau" data-variante="tete-nue"></g>`, true));
// ---------- desk (cuts him at the waist) ----------
S.push(D('bureau', 'Bureau', `
<path d="M-10 312 L650 312 L650 377 L-10 377 Z" fill="url(#insp-desk)"/>
<g stroke="#5a3624" stroke-width=".8" fill="none" opacity=".45">${rep(7, (i) => `<path d="M-10 ${318 + i * 8.5} C150 ${316 + i * 8.5} 300 ${321 + i * 8.5} 650 ${317 + i * 8.5}"/>`)}</g>
<ellipse cx="320" cy="318" rx="120" ry="9" fill="#000" opacity=".5" filter="url(#insp-b4)"/>
<path d="M230 321 L410 321 L416 366 L224 366 Z" fill="#163126"/>
<path d="M230 321 L410 321 L416 366 L224 366 Z" fill="none" stroke="#0a1a12" stroke-width="2"/>
<path d="M232 323 L408 323" stroke="#3f6b55" stroke-width=".8" opacity=".6"/>
<g fill="#a6dcff" opacity=".05">${rep(4, (i) => `<path d="M0 ${330 + i * 11} L170 ${336 + i * 11} L170 ${341 + i * 11} L0 ${335 + i * 11} Z"/>`)}</g>
<ellipse cx="515" cy="346" rx="135" ry="30" fill="url(#insp-pool)" style="mix-blend-mode:screen"/>
<rect x="-10" y="377" width="660" height="9" fill="#5b3420"/>
<rect x="-10" y="377" width="660" height="1.6" fill="#d39a64" opacity=".55"/>
<rect x="380" y="377" width="270" height="9" fill="#ffb460" opacity=".14"/>
<rect x="-10" y="386" width="660" height="14" fill="#140905"/>`));

// ---------- right arm (his right = viewer's left): rest / raised to the eye / jabbed at us ----------
const T_REST = 'translate(279 326) rotate(22)', T_RAISE = 'translate(294 159) rotate(10)', T_JAB = 'translate(258 264) scale(1.5) rotate(-6)';
S.push(P('brasD', 'Bras droit', `
<g class="insp-pR insp-pR-rest"><g class="insp-armRest">
 <ellipse cx="232" cy="347" rx="34" ry="4.5" fill="#000" opacity=".5" filter="url(#insp-b2)"/>
 <path d="M244 192 C226 196 214 212 210 236 C206 262 204 292 204 316 C204 332 212 342 224 344 L256 346 L259 317 C250 316 242 312 238 306 C240 286 244 262 252 242 C256 228 258 210 254 198 Z" fill="#6e5632"/>
 <path d="M244 192 C226 196 214 212 210 236 C206 262 204 292 204 316 C204 326 207 334 212 339 C214 300 218 250 232 214 Z" fill="#000" opacity=".25"/>
 <path d="M238 306 C232 300 228 292 226 282" stroke="#000" stroke-width="2.4" fill="none" opacity=".35" filter="url(#insp-b1)"/>
 <path d="M246 248 C240 262 236 276 236 290" stroke="#000" stroke-width="2" fill="none" opacity=".22" filter="url(#insp-b1)"/>
 <path d="M244 192 C226 196 214 212 210 236 C206 262 204 292 204 316" stroke="#9ad8ff" stroke-width="1.5" fill="none" opacity=".5"/>
 <path d="M243 318 L251 317.5 L252 346 L244 346 Z" fill="#4e3c22"/><circle cx="247.5" cy="331" r="2.2" fill="#1f160c"/>
 <path d="M256 318 L264 319 L263 345 L255 345 Z" fill="url(#insp-shirt)"/>
 <g transform="${T_REST}"><use href="#insp-fistback"/></g>
</g></g>
<g class="insp-pR insp-pR-raise"><g class="insp-hl2"><g class="insp-armRaise">
 <path d="M244 192 C228 198 220 214 222 236 C224 258 236 280 252 292 C262 298 274 294 278 286 C282 262 286 214 291 180 L268 170 C266 200 264 230 262 252 C258 238 258 220 258 204 Z" fill="#6e5632"/>
 <path d="M244 192 C228 198 220 214 222 236 C224 258 236 280 252 292 C246 270 240 240 240 214 Z" fill="#000" opacity=".25"/>
 <path d="M262 252 C266 262 270 272 276 284" stroke="#000" stroke-width="2.6" fill="none" opacity=".35" filter="url(#insp-b1)"/>
 <path d="M284 196 C282 226 280 256 278 284" stroke="#e8c88a" stroke-width="1.2" fill="none" opacity=".45"/>
 <path d="M244 192 C228 198 220 214 222 236 C224 258 236 280 252 292" stroke="#9ad8ff" stroke-width="1.4" fill="none" opacity=".5"/>
 <path d="M267 169 L292 178.5 L290.5 187 L265.6 177.5 Z" fill="#4e3c22"/>
 <path d="M269 161 L292 170 L292.6 178.6 L267.4 169.2 Z" fill="url(#insp-shirt)"/>
 <g transform="${T_RAISE}"><use href="#insp-fistback"/></g>
</g></g></g>
<g class="insp-pR insp-pR-jab"><g class="insp-armJab">
 <path d="M244 192 C226 198 214 214 214 238 C214 262 222 282 240 294 L284 298 C292 280 292 256 284 236 C276 218 266 204 256 196 Z" fill="#6e5632"/>
 <path d="M244 192 C226 198 214 214 214 238 C214 262 222 282 240 294 C234 268 232 236 238 212 Z" fill="#000" opacity=".25"/>
 <ellipse cx="259" cy="273" rx="33" ry="30" fill="#5a4526"/><ellipse cx="259" cy="272" rx="31" ry="28" fill="#8a6d40"/><ellipse cx="259" cy="273" rx="25" ry="22" fill="#1d150c"/><path d="M230 262 A31 28 0 0 1 276 248" stroke="#e8c88a" stroke-width="1.4" fill="none" opacity=".55"/>
 <path d="M244 192 C226 198 214 214 214 238 C214 262 222 282 240 294" stroke="#9ad8ff" stroke-width="1.5" fill="none" opacity=".5"/>
 <g transform="${T_JAB}"><use href="#insp-fistback"/></g>
</g></g>`));

// the brass magnifier; in the raised pose its glass shows a giant eye
const giantEye = `<g clip-path="url(#insp-lensc)"><g transform="rotate(-10 0 -58)">
 <circle cx="0" cy="-58" r="21" fill="#c4825e"/>
 <path d="M-21 -40 C-12 -46 10 -46 21 -40 L21 -36 L-21 -36 Z" fill="#000" opacity=".15"/>
 <g class="insp-gbrow"><path d="M-22 -73 C-12 -83 6 -85 22 -79 L22 -73 C8 -78 -10 -77 -22 -67 Z" fill="#4c4642"/>
 <g stroke="#b3aba1" stroke-width=".8" opacity=".7"><path d="M-12 -76 l6 -3 M-4 -79 l7 -1.5 M5 -80 l7 0"/></g></g>
 <path d="M-19 -56 C-10 -69 10 -70 19 -58 C10 -46 -9 -45 -19 -56 Z" fill="#e8dfd2"/>
 <g class="insp-look2"><circle cx="0" cy="-57.5" r="8.4" fill="#5d7f8c"/><circle cx="0" cy="-57.5" r="8.4" fill="none" stroke="#1f323a" stroke-width="1.4"/>
 <g stroke="#88aab6" stroke-width=".6" opacity=".6">${rep(10, (i) => { const a = i * Math.PI / 5; return `<path d="M${(Math.cos(a) * 4.6).toFixed(1)} ${(-57.5 + Math.sin(a) * 4.6).toFixed(1)} L${(Math.cos(a) * 7.6).toFixed(1)} ${(-57.5 + Math.sin(a) * 7.6).toFixed(1)}"/>`; })}</g>
 <circle cx="0" cy="-57.5" r="4.1" fill="#080b0d"/><circle cx="2.8" cy="-60.6" r="2.1" fill="#fff"/><circle cx="-2.6" cy="-54.6" r=".9" fill="#fff" opacity=".7"/></g>
 <g class="insp-glid"><path d="M-22 -82 L22 -82 L22 -60 C10 -71 -10 -71 -22 -58 Z" fill="#b5795a"/>
 <path d="M-20 -57 C-10 -70 10 -71 20 -59" stroke="#22120c" stroke-width="2.8" fill="none" stroke-linecap="round"/></g>
 <path d="M-18 -51.5 C-9 -44.5 9 -44.5 18 -53" stroke="#5c3326" stroke-width="1.2" fill="none" opacity=".7"/>
 <path d="M-15 -46 C-6 -41 6 -41 14 -46" stroke="#5c3326" stroke-width="1" fill="none" opacity=".45"/>
 <path d="M-21 -60 l-4 -2 M-21 -55 l-4 1" stroke="#5c3326" stroke-width="1" opacity=".5"/>
</g></g>`;
S.push(P('loupe', 'Loupe', `
<g class="insp-pR insp-pR-rest"><g class="insp-armRest"><g class="insp-tap"><g transform="${T_REST}">
 <use href="#insp-maghandle"/><circle cx="0" cy="-58" r="19.6" fill="url(#insp-glass)"/>
 <circle cx="0" cy="-58" r="19.6" fill="#ffe0a8" opacity=".08"/><use href="#insp-magrim"/>
</g></g></g></g>
<g class="insp-pR insp-pR-raise"><g class="insp-hl2"><g class="insp-armRaise"><g transform="${T_RAISE}">
 <use href="#insp-maghandle"/>${giantEye}<circle cx="0" cy="-58" r="19.6" fill="url(#insp-glass)" opacity=".7"/><use href="#insp-magrim"/>
</g></g></g></g>
<g class="insp-pR insp-pR-jab"><g class="insp-armJab"><g transform="${T_JAB}">
 <rect x="-3.5" y="-22" width="7" height="12" fill="url(#insp-leather)"/>
 <g transform="translate(0 22)"><circle cx="0" cy="-58" r="19.6" fill="url(#insp-glass)"/><circle cx="0" cy="-58" r="19.6" fill="#bfe8ff" opacity=".12"/><use href="#insp-magrim"/>
 <path d="M-8 -66 l3 -8 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 Z" fill="#fff" opacity=".85" class="insp-glint"/></g>
</g></g></g>`));

S.push(P('mainD', 'Main droite', `
<g class="insp-pR insp-pR-rest"><g class="insp-armRest"><g class="insp-tap"><g transform="${T_REST}"><use href="#insp-fist"/></g></g></g></g>
<g class="insp-pR insp-pR-raise"><g class="insp-hl2"><g class="insp-armRaise"><g transform="${T_RAISE}"><use href="#insp-fist"/></g></g></g></g>
<g class="insp-pR insp-pR-jab"><g class="insp-armJab"><g transform="${T_JAB}"><use href="#insp-fist"/></g></g></g>`));
// ---------- left arm (viewer's right), lit by the lamp ----------
S.push(P('brasG', 'Bras gauche', `<g class="insp-armL">
 <ellipse cx="408" cy="347" rx="34" ry="4.5" fill="#000" opacity=".5" filter="url(#insp-b2)"/>
 <path d="M396 192 C414 196 426 212 430 236 C434 262 436 292 436 316 C436 332 428 342 416 344 L384 346 L381 317 C390 316 398 312 402 306 C400 286 396 262 388 242 C384 228 382 210 386 198 Z" fill="url(#insp-coat)"/>
 <path d="M388 242 C384 228 382 210 386 198 C392 220 396 250 398 300 L402 306 C400 286 396 262 388 242 Z" fill="#000" opacity=".25"/>
 <path d="M402 306 C408 300 412 292 414 282" stroke="#000" stroke-width="2.4" fill="none" opacity=".3" filter="url(#insp-b1)"/>
 <path d="M396 192 C414 196 426 212 430 236 C434 262 436 292 436 316 C436 330 430 340 420 343" stroke="#ffc27a" stroke-width="1.6" fill="none" opacity=".6"/>
 <path d="M397 318 L389 317.5 L388 346 L396 346 Z" fill="#8c6f40"/><circle cx="392.5" cy="331" r="2.2" fill="#2c1e12"/>
 <path d="M384 318 L376 319 L377 345 L385 345 Z" fill="#efe8d8"/>
</g>`));

S.push(P('dossier', 'Dossier', `<g data-var="main" data-variante="dossier"><g class="insp-armL"><g class="insp-folder">
 <path d="M326 364 L338 321 L430 321 L440 364 Z" fill="#000" opacity=".45" filter="url(#insp-b2)"/>
 <path d="M428 323 L434 323 L443 359 L437 362 Z" fill="#efe7d4"/>
 <path d="M342 319 L346 312.5 L372 312.5 L375 319 Z" fill="#c9a865"/>
 <path d="M324 362 L337 319 L428 319 L438 362 Z" fill="url(#insp-manila)"/>
 <path d="M324 362 L337 319" stroke="#fff2c8" stroke-width=".8" opacity=".5"/>
 <path d="M324 362 L438 362" stroke="#6a4f22" stroke-width="1.4"/>
 <g transform="matrix(1 0 -.3 1 100 0)"><text x="250" y="338" font-family="Special Elite" font-size="7.5" fill="#3b2a14">AFFAIRE N° 7</text>
 <rect x="250" y="342" width="40" height="1.3" fill="#6b5430"/><rect x="250" y="346" width="28" height="1.3" fill="#6b5430"/>
 <g transform="rotate(-8 300 350)"><rect x="286" y="343" width="54" height="11" fill="none" stroke="#c0262d" stroke-width="1.3" opacity=".85"/><text x="289" y="351.5" font-family="Special Elite" font-size="7" fill="#c0262d" opacity=".9">CONFIDENTIEL</text></g></g>
 <path d="M400 316 L400 327 C400 330 405 330 405 327 L405 318" stroke="#c8ccd0" stroke-width="1.1" fill="none"/>
</g></g></g>`));

const cup = (cls) => `<g class="${cls}">
 <path d="M339 284 L342.5 334 C346 336.6 358 336.6 361.5 334 L365 284 Z" fill="url(#insp-cup)"/>
 <path d="M340.1 298 L363.9 298 L362.4 321 L341.6 321 Z" fill="#8c5a30"/>
 <path d="M340.1 298 L344 298 L345 321 L341.6 321 Z" fill="#000" opacity=".25"/><path d="M354 298 L357 298 L356.6 321 L353.6 321 Z" fill="#c48a52" opacity=".6"/>
 <path d="M340 309.5 L364 309.5" stroke="#5e3a1c" stroke-width=".7" stroke-dasharray="1.4 1.2"/>
 <path d="M362 286 L360 333" stroke="#fff" stroke-width="1.2" opacity=".35"/>
 <ellipse cx="352" cy="284" rx="13.2" ry="3.7" fill="#f5f0e6"/><ellipse cx="352" cy="284.5" rx="11.2" ry="2.7" fill="#3a1c0c"/>
 <ellipse cx="355" cy="284" rx="3" ry=".8" fill="#c08454" opacity=".7"/>
 <g class="insp-splash"><path d="M342 284 C343.5 277 345.5 275.5 346.5 270 C348 276 350 277.5 352 271 C354 277.5 356 276 357.5 270 C358.5 275.5 360.5 277 362 284 Z" fill="#5a2e14"/>
 <circle class="insp-sp insp-sp1" cx="345" cy="272" r="1.9" fill="#5a2e14"/><circle class="insp-sp insp-sp2" cx="352" cy="268" r="2.3" fill="#6a3818"/><circle class="insp-sp insp-sp3" cx="359" cy="272" r="1.7" fill="#5a2e14"/><circle class="insp-sp insp-sp4" cx="355" cy="266" r="1.3" fill="#7a4420"/></g>
</g>`;
S.push(P('cafe', 'Café', `
<ellipse cx="352" cy="336" rx="14" ry="2.6" fill="#000" opacity=".5" filter="url(#insp-b1)"/>
<g data-var="main" data-variante="cafe"><g class="insp-armL"><g class="insp-cupHold">${cup('insp-cupH')}</g></g></g>
<g data-var="main" data-variante="dossier"><g class="insp-cupJump">${cup('insp-cupS')}</g></g>`));

S.push(P('mainG', 'Main gauche', `
<g data-var="main" data-variante="cafe"><g class="insp-armL"><g class="insp-cupHold">
 <path d="M385 317 C378 312 370 300 366 296 C362 298 361 306 362 316 C362 326 364 334 370 340 C376 344 382 346 385 345 Z" fill="${SK}"/>
 <path d="M362 316 C362 326 364 334 370 340 C376 344 382 346 385 345 L385 336 C378 336 370 330 366 318 Z" fill="#000" opacity=".18"/>
 <path d="M370 298 C364 299 356 302 349 305 C346 306.4 346.2 309.6 349 310 C356 309.4 364 307.6 371 306 Z" fill="${SK}"/>
 <path d="M347.4 305.6 C346.4 306.6 346.6 309.2 348.6 309.8 L351.6 309.4 C350.6 308.2 350.4 306.6 351 305 Z" fill="#f2c8ac" opacity=".9"/>
 <path d="M349 310 C356 309.4 364 307.6 371 306" stroke="#5a2e20" stroke-width=".8" fill="none" opacity=".7"/>
 <g fill="${SK}"><path d="M341 304 C337.6 304.4 337.4 309.6 340.4 310.4 Z"/><path d="M341.6 311.6 C338 312 337.8 317.6 340.8 318.4 Z"/><path d="M342 319.6 C338.8 320 338.6 325 341.4 325.8 Z"/></g>
 <path d="M368 316 C372 318 377 318 381 316 M367 324 C371 326 376 326 380 324" stroke="#5a2e20" stroke-width=".8" fill="none" opacity=".45"/>
 <path d="M385 317 C378 312 370 300 366 296" stroke="#ffd2a0" stroke-width="1" fill="none" opacity=".5"/>
</g></g></g>
<g data-var="main" data-variante="dossier"><g class="insp-armL"><g class="insp-folder">
 <path d="M386 318 C376 320 366 324 358 328 C352 331 347 334 346 337 C345.4 339.6 348 340.6 351 339.6 L358 337.4 C354 340 352 343 353.6 345 C355.4 346.8 359 345.6 362 343.6 L366 341 C364.4 344 365 346.6 367.6 347 C370 347.4 373 345 375 343 L386 346 Z" fill="${SK}"/>
 <path d="M386 318 C376 320 366 324 358 328 C352 331 347 334 346 337" stroke="#ffd2a0" stroke-width="1" fill="none" opacity=".5"/>
 <path d="M351 339.6 L358 337.4 M362 343.6 L366 341 M358 330 C364 332 370 333 376 332" stroke="#5a2e20" stroke-width=".8" fill="none" opacity=".6"/>
 <path d="M378 336 C372 340 368 346 362 350 C359 352 356 351 357 348.6 C360 345 366 340 372 334 Z" fill="${SK}"/>
 <path d="M362 350 C359 352 356 351 357 348.6" stroke="#5a2e20" stroke-width=".8" fill="none" opacity=".6"/>
 <g fill="#ffd8b8" opacity=".35"><ellipse cx="362" cy="331" rx="2.4" ry="1.2"/><ellipse cx="368" cy="335" rx="2.2" ry="1.1"/><ellipse cx="373" cy="338" rx="2" ry="1"/></g>
</g></g></g>`));
/*@@CHAR@@*/
// ---------- foreground props ----------
S.push(D('lampe', 'Lampe de bureau', `
<ellipse cx="516" cy="250" rx="70" ry="24" fill="url(#insp-gA)" opacity=".55" filter="url(#insp-b4)"/>
<g class="insp-cone"><path d="M468 252 L564 252 L622 352 L408 352 Z" fill="url(#insp-cone)" style="mix-blend-mode:screen"/></g>
<ellipse cx="516" cy="320" rx="30" ry="5" fill="#000" opacity=".55" filter="url(#insp-b2)"/>
<path d="M492 320 C493 309 539 309 540 320 Z" fill="url(#insp-brass)"/>
<ellipse cx="516" cy="320" rx="25" ry="3.4" fill="#7a5418"/>
<rect x="513" y="250" width="6" height="62" fill="url(#insp-brass)"/>
<path d="M513 250 L513 312" stroke="#ffe9b8" stroke-width=".9" opacity=".7"/>
<rect x="509" y="296" width="14" height="4" rx="1.5" fill="url(#insp-brass)"/>
<path d="M466 251 C466 236 486 226 516 226 C546 226 566 236 566 251 Z" fill="url(#insp-shade)"/>
<path d="M478 240 C492 231 518 229 542 231" stroke="#c4ffdc" stroke-width="1.6" fill="none" opacity=".55" stroke-linecap="round"/>
<path d="M466 251 C466 240 474 232 486 229" stroke="#9ad8ff" stroke-width="1" fill="none" opacity=".4"/>
<path d="M463 251 L569 251" stroke="url(#insp-brass)" stroke-width="3" stroke-linecap="round"/>
<ellipse cx="516" cy="253.6" rx="46" ry="2.6" fill="#fff3cf"/>
<path d="M546 253 L546 274" stroke="#d9b36a" stroke-width=".9" stroke-dasharray="1.2 1"/><circle cx="546" cy="276" r="1.8" fill="url(#insp-brass)"/>`));

S.push(D('telephone', 'Téléphone', `
<ellipse cx="598" cy="355" rx="40" ry="5" fill="#000" opacity=".55" filter="url(#insp-b2)"/>
<path d="M566 354 C566 337 576 327 598 327 C620 327 630 337 630 354 Z" fill="url(#insp-phone)"/>
<path d="M568 350 C569 338 578 330 594 328" stroke="#ffcf8a" stroke-width="1.3" fill="none" opacity=".55"/>
<circle cx="598" cy="342" r="11.5" fill="#d8d0bf"/><circle cx="598" cy="342" r="11.5" fill="none" stroke="#000" stroke-width=".8" opacity=".5"/>
${rep(10, (i) => { const a = -Math.PI * .1 + i * Math.PI * .155; return `<circle cx="${(598 + Math.cos(a) * 8).toFixed(1)}" cy="${(342 + Math.sin(a) * 8).toFixed(1)}" r="1.9" fill="#1b1b1e"/>`; })}
<circle cx="598" cy="342" r="4" fill="#eee6d6"/><circle cx="598" cy="342" r="4" fill="none" stroke="#7a7266" stroke-width=".6"/>
<path d="M558 324 C559 313 571 311 576 318 L620 318 C625 311 637 313 638 324 C634 329 627 329 623 325 L573 325 C569 329 562 329 558 324 Z" fill="url(#insp-phone)"/>
<path d="M576 318.6 L620 318.6" stroke="#8a8a92" stroke-width=".9" opacity=".6"/>
<path d="M566 340 C556 342 552 350 556 356 C560 362 548 366 540 362" stroke="#141416" stroke-width="2" fill="none"/>`));

S.push(D('dossiers', 'Pile de dossiers', `
<ellipse cx="112" cy="356" rx="80" ry="7" fill="#000" opacity=".5" filter="url(#insp-b2)"/>
<path d="M36 356 L48 324 L168 322 L182 354 Z" fill="#8c6c34"/>
<path d="M36 356 L182 354 L182 360 L36 362 Z" fill="#5e461f"/>
<path d="M44 348 L56 316 L170 318 L180 348 Z" fill="#b8954e"/>
<path d="M44 348 L180 348 L180 353 L44 353.5 Z" fill="#7a5c2a"/>
<path d="M58 316 L62 309 L92 309 L96 316 Z" fill="#c9a865"/>
<path d="M150 316 L170 312 L176 342 L166 344 Z" fill="#efe7d4"/><path d="M150 316 L170 312" stroke="#bbb" stroke-width=".6"/>
<path d="M40 340 L54 306 L160 304 L176 338 Z" fill="url(#insp-manila)"/>
<path d="M40 340 L176 338 L176 343 L40 345 Z" fill="#8c6c34"/>
<path d="M40 340 L54 306" stroke="#fff2c8" stroke-width=".8" opacity=".45"/>
<path d="M58 306 L62 299 L96 299 L99 306 Z" fill="#d8b874"/>
<path d="M104 305 L106 340 M100 305 L102 340" stroke="#7a2a2a" stroke-width="1.4" opacity=".75"/>
<g transform="rotate(-6 132 322)"><rect x="112" y="316" width="44" height="13" fill="none" stroke="#c0262d" stroke-width="1.3" opacity=".8"/><text x="115" y="326" font-family="Special Elite" font-size="8.5" fill="#c0262d" opacity=".85">CLASSÉ</text></g>
<g fill="#4a3a20" opacity=".7"><rect x="64" y="318" width="26" height="1.4"/><rect x="62" y="323" width="20" height="1.4"/></g>
<ellipse cx="76" cy="331" rx="9" ry="3" fill="none" stroke="#6a4520" stroke-width="1.1" opacity=".4"/>
<g transform="rotate(8 196 362)"><rect x="182" y="350" width="30" height="24" fill="#ece5d4"/><rect x="185" y="353" width="24" height="15" fill="#2a3440"/><circle cx="197" cy="359" r="3" fill="#10161c"/><path d="M190 368 C191 363 194 362 197 362 C200 362 203 363 204 368 Z" fill="#10161c"/></g>
<path d="M420 368 L470 360" stroke="#1a1a1a" stroke-width="3.2" stroke-linecap="round"/><path d="M466 360.6 L471 359.8" stroke="url(#insp-brass)" stroke-width="3.2" stroke-linecap="round"/>`));

// ---------- effects drawn in SVG (behind nothing: on top of everything) ----------
S.push(`<g class="insp-heh" font-family="Special Elite" font-size="13" fill="#ffe2b0" stroke="#1a0f08" stroke-width="2.4" paint-order="stroke" font-weight="700">
<text class="insp-heh1" x="368" y="76">heh</text><text class="insp-heh2" x="384" y="58">heh…</text></g>
<g class="insp-zip"><path d="M286 22 L276 8 M320 16 L320 0 M354 22 L364 8" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".8"/></g>
<rect class="insp-wash" width="640" height="400" fill="#d6f2ff" opacity="0" pointer-events="none"/>
<rect width="640" height="400" fill="url(#insp-vig)" pointer-events="none"/>`);
/*@@FRONT@@*/
// ---------- motion ----------
// Personality: weary noir, adult cartoon. Signature curve: OUT (decelerate); landings use BACK (overshoot).
// Layers per mood: primary (arm / head / hat), secondary (brows, lids, mouth, cup, tie), ambient (rain, tube, fan, lamp, breath).
const OUT = 'cubic-bezier(.2,0,0,1)', BACK = 'cubic-bezier(.175,.885,.32,1.275)', INOUT = 'cubic-bezier(.45,0,.55,1)', IN = 'cubic-bezier(.55,0,.9,.55)';
const CSS1 = `
.p-insp [class*="insp-"] { transform-box: view-box; }
.p-insp .insp-b, .p-insp .insp-br { transform-origin: 320px 336px; }
.p-insp .insp-h, .p-insp .insp-hl, .p-insp .insp-hl2 { transform-origin: 320px 165px; }
.p-insp .insp-hat, .p-insp .insp-hatshadow { transform-origin: 320px 74px; }
.p-insp .insp-tie { transform-origin: 319px 188px; animation: insp-tie 3.8s ${INOUT} -.7s infinite; }
.p-insp .insp-tap { transform-origin: 279px 326px; }
.p-insp .insp-armRest { transform-origin: 214px 330px; }
.p-insp .insp-armRaise { transform-origin: 244px 196px; }
.p-insp .insp-armJab { transform-origin: 248px 262px; }
.p-insp .insp-armL { transform-origin: 420px 335px; }
.p-insp .insp-cupHold { transform-origin: 372px 330px; }
.p-insp .insp-cupJump { transform-origin: 352px 335px; }
.p-insp .insp-splash { transform-origin: 352px 284px; opacity: 0; }
.p-insp .insp-eyeL { transform-origin: 305px 102px; } .p-insp .insp-eyeR { transform-origin: 335px 102px; }
.p-insp .insp-eyeL .insp-iris { transform-origin: 305px 101.6px; } .p-insp .insp-eyeR .insp-iris { transform-origin: 335px 101.6px; }
.p-insp .insp-lidL { transform-origin: 305px 88px; } .p-insp .insp-lidR { transform-origin: 335px 88px; }
.p-insp .insp-lidloL { transform-origin: 305px 113px; } .p-insp .insp-lidloR { transform-origin: 335px 113px; }
.p-insp .insp-browL { transform-origin: 303px 92px; } .p-insp .insp-browR { transform-origin: 337px 92px; }
.p-insp .insp-mous { transform-origin: 320px 131px; }
.p-insp .insp-m > g { transform-origin: 320px 136px; display: none; }
.p-insp .insp-glid { transform-origin: 0px -82px; } .p-insp .insp-gbrow { transform-origin: 0px -76px; }
.p-insp .insp-glint { transform-origin: -5px -63px; }
.p-insp .insp-heh1 { transform-origin: 380px 72px; } .p-insp .insp-heh2 { transform-origin: 402px 54px; }
.p-insp .insp-fan { transform-origin: 470px 0px; animation: insp-spin 13s linear infinite; }

/* ambient scene life, all moods */
.p-insp .insp-rain1 { animation: insp-rain .42s linear infinite; }
.p-insp .insp-rain2 { animation: insp-rain .61s linear -.2s infinite; }
.p-insp .insp-drop { animation: insp-drip 6.2s ${IN} infinite; opacity: 0; }
.p-insp .insp-drop1 { animation-duration: 7.9s; animation-delay: -2s; } .p-insp .insp-drop2 { animation-duration: 5.3s; animation-delay: -4s; }
.p-insp .insp-drop3 { animation-duration: 8.6s; animation-delay: -1s; } .p-insp .insp-drop4 { animation-duration: 6.9s; animation-delay: -5.5s; }
.p-insp .insp-drop5 { animation-duration: 9.4s; animation-delay: -3.2s; }
.p-insp .insp-neon { animation: insp-neon 4.7s steps(1) infinite; }
.p-insp .insp-tube { animation: insp-tube 7.3s steps(1) infinite; }
.p-insp .insp-wash { animation: insp-wash 7.3s steps(1) infinite; }
.p-insp .insp-cone { animation: insp-cone 5.1s ${INOUT} infinite; }
.p-insp .insp-stripes { animation: insp-bolt 11.3s ${OUT} infinite; }
.p-insp .insp-br { animation: insp-breath 3.8s ${INOUT} infinite; }
.p-insp .insp-look { transform: translateX(calc(var(--look, 0) * 2.8px)); }
.p-insp .insp-look2 { transform: translateX(calc(var(--look, 0) * 5.5px)); }
.p-insp .insp-hl { transform: translateX(calc(var(--look, 0) * 2.5px)) rotate(calc(var(--look, 0) * 2.5deg)); }
.p-insp .insp-lid, .p-insp .insp-lidlo, .p-insp .insp-iris { transition: transform .22s ${OUT}; }
.p-insp .insp-browL, .p-insp .insp-browR, .p-insp .insp-mous { transition: transform .3s ${BACK}; }
.p-insp .insp-frown { opacity: 0; transition: opacity .3s; }
.p-insp .insp-eyes-rire, .p-insp .insp-heh, .p-insp .insp-zip { display: none; }

/* which arm pose */
.p-insp .insp-pR { display: none; }
.p-insp:not(.mood-louche):not(.mood-victoire) .insp-pR-rest, .p-insp.mood-louche .insp-pR-raise, .p-insp.mood-victoire .insp-pR-jab { display: inline; }
.p-insp:not(.mood-louche):not(.mood-rire):not(.mood-victoire):not(.mood-decu):not(.mood-surprise) .insp-m-repos,
.p-insp.mood-louche .insp-m-louche, .p-insp.mood-rire .insp-m-rire, .p-insp.mood-victoire .insp-m-victoire,
.p-insp.mood-decu .insp-m-decu, .p-insp.mood-surprise .insp-m-surprise { display: inline; animation: insp-mpop .28s ${BACK} both; }

/* REPOS: breathing, weight shift, head drift, eye darts, blinks, tapping the lens, lifting the cup (all different periods) */
.p-insp.mood-repos .insp-b { animation: insp-shift 7.4s ${INOUT} infinite; }
.p-insp.mood-repos .insp-h { animation: insp-drift 5.3s ${INOUT} -1.2s infinite; }
.p-insp.mood-repos .insp-dart { animation: insp-dart 6.1s ${OUT} infinite; }
.p-insp.mood-repos .insp-lid { animation: insp-blink 4.3s ${OUT} infinite; }
.p-insp.mood-repos .insp-tap { animation: insp-tap 3.1s ${INOUT} infinite; }
.p-insp.mood-repos .insp-cupHold { animation: insp-sip 6.7s ${INOUT} -2s infinite; }
.p-insp.mood-repos .insp-hat { animation: insp-hatdrift 5.3s ${INOUT} -1.4s infinite; }
`;
const CSS2 = `
/* LOUCHE: wind-up sink, the lens swings up on an arc to his eye, giant eye; the other eye squints, he leans toward --look */
.p-insp.mood-louche .insp-b { animation: insp-lean .9s ${OUT} both; }
.p-insp.mood-louche .insp-hl, .p-insp.mood-louche .insp-hl2 { transform: translate(calc(var(--look, 0) * 9px), 1px) rotate(calc(var(--look, 0) * 5deg)); }
.p-insp.mood-louche .insp-armRaise { animation: insp-raise .62s ${OUT} both; }
.p-insp.mood-louche .insp-gbrow { animation: insp-gbrow .5s ${BACK} .28s both; }
.p-insp.mood-louche .insp-glid { animation: insp-gblink 2.6s ${OUT} .9s infinite; }
.p-insp.mood-louche .insp-lidR { transform: scaleY(1.42); } .p-insp.mood-louche .insp-lidloR { transform: scaleY(1.5); }
.p-insp.mood-louche .insp-browR { transform: translateY(2.4px) rotate(-9deg); }
.p-insp.mood-louche .insp-browL { transform: translateY(-6px) rotate(-5deg); }
.p-insp.mood-louche .insp-frown, .p-insp.mood-victoire .insp-frown { opacity: .65; }
.p-insp.mood-louche .insp-mous { transform: translate(1.2px, -.8px) rotate(-5deg); }
.p-insp.mood-louche .insp-hat { animation: insp-hatlag .9s ${OUT} .08s both; }
.p-insp.mood-louche .insp-cupHold { animation: insp-cupdip .8s ${OUT} .15s both; }

/* RIRE: head goes back (anticipation forward first), shoulders shake fast, hat tips back, "heh" */
.p-insp.mood-rire .insp-b { animation: insp-chuckle .3s ${INOUT} .25s infinite; }
.p-insp.mood-rire .insp-h { animation: insp-headback .55s ${OUT} both; }
.p-insp.mood-rire .insp-hl { animation: insp-nod .3s ${INOUT} .4s infinite; }
.p-insp.mood-rire .insp-hat { animation: insp-tip .7s ${BACK} .05s both; }
.p-insp.mood-rire .insp-eye { display: none; } .p-insp.mood-rire .insp-eyes-rire { display: inline; }
.p-insp.mood-rire .insp-browL { transform: translateY(-2.5px) rotate(-6deg); } .p-insp.mood-rire .insp-browR { transform: translateY(-2.5px) rotate(6deg); }
.p-insp.mood-rire .insp-m-rire { animation: insp-mpop .28s ${BACK} both, insp-haha .3s ${INOUT} .3s infinite; }
.p-insp.mood-rire .insp-mous { transform: translateY(-1.6px) scale(1.06, 1); }
.p-insp.mood-rire .insp-heh { display: inline; }
.p-insp.mood-rire .insp-heh1 { animation: insp-heh 1.3s ${OUT} .3s infinite both; }
.p-insp.mood-rire .insp-heh2 { animation: insp-heh 1.3s ${OUT} .95s infinite both; }
.p-insp.mood-rire .insp-cupHold { animation: insp-jiggle .3s ${INOUT} .3s infinite; }

/* VICTOIRE: crouch, then the lens is jabbed at us (overshoot), then the left fist slams, hat hops on the slam */
.p-insp.mood-victoire .insp-b { animation: insp-lunge .8s ${OUT} both; }
.p-insp.mood-victoire .insp-h { animation: insp-chin .8s ${OUT} both; }
.p-insp.mood-victoire .insp-armJab { animation: insp-jab .6s ${OUT} both; }
.p-insp.mood-victoire .insp-glint { animation: insp-glint .6s ${BACK} .3s both; }
.p-insp.mood-victoire .insp-armL { animation: insp-slam .62s ${OUT} .42s both; }
.p-insp.mood-victoire .insp-cupJump { animation: insp-cupjump .7s ${OUT} .5s both; }
.p-insp.mood-victoire .insp-splash, .p-insp.mood-surprise .insp-splash { animation: insp-splash .8s ${OUT} .52s both; }
.p-insp.mood-victoire .insp-hat { animation: insp-hop .9s ${OUT} .5s both; }
.p-insp.mood-victoire .insp-lid { transform: scaleY(1.22); } .p-insp.mood-victoire .insp-lidlo { transform: scaleY(1.3); }
.p-insp.mood-victoire .insp-browL { transform: translateY(1.5px) rotate(10deg); } .p-insp.mood-victoire .insp-browR { transform: translateY(1.5px) rotate(-10deg); }
.p-insp.mood-victoire .insp-mous { transform: translateY(-1.6px) scale(1.07, 1); }

/* DECU: inhale, then a long sigh: he slumps, head drops, the hat brim slides down over his eyes */
.p-insp.mood-decu .insp-b { animation: insp-slump 1.5s ${INOUT} both; }
.p-insp.mood-decu .insp-h { animation: insp-drop 1.5s ${INOUT} both; }
.p-insp.mood-decu .insp-hat, .p-insp.mood-decu .insp-hatshadow { animation: insp-brim 1.4s ${INOUT} .25s both; }
.p-insp.mood-decu .insp-tap { animation: insp-droop 1.2s ${INOUT} .45s both; }
.p-insp.mood-decu .insp-cupHold { animation: insp-cupdown 1.2s ${INOUT} .4s both; }
.p-insp.mood-decu .insp-lid { transform: scaleY(1.32); } .p-insp.mood-decu .insp-iris { transform: translateY(1.3px); }
.p-insp.mood-decu .insp-browL { transform: translateY(-1px) rotate(-11deg); } .p-insp.mood-decu .insp-browR { transform: translateY(-1px) rotate(11deg); }
.p-insp.mood-decu .insp-mous { transform: translateY(1px) scale(.95, 1.06); }

/* SURPRISE: squash, then eyes pop, the hat flies off on an arc and drops back on (squash on landing), coffee splashes */
.p-insp.mood-surprise .insp-b { animation: insp-jolt .9s ${OUT} both; }
.p-insp.mood-surprise .insp-h { animation: insp-jerk .8s ${OUT} both; }
.p-insp.mood-surprise .insp-eye { animation: insp-pop .7s ${BACK} both; }
.p-insp.mood-surprise .insp-lid { transform: scaleY(.76); } .p-insp.mood-surprise .insp-lidlo { transform: scaleY(.7); }
.p-insp.mood-surprise .insp-iris { transform: scale(.72); }
.p-insp.mood-surprise .insp-browL { transform: translateY(-8px) rotate(-5deg); } .p-insp.mood-surprise .insp-browR { transform: translateY(-8px) rotate(5deg); }
.p-insp.mood-surprise .insp-mous { transform: translateY(-2.2px) scale(.94, 1.04); }
.p-insp.mood-surprise .insp-hat { animation: insp-fly 1.35s linear both; }
.p-insp.mood-surprise .insp-hatshadow { animation: insp-noshadow 1.35s ${OUT} both; }
.p-insp.mood-surprise .insp-zip { display: inline; animation: insp-zip .6s ${OUT} .1s both; }
.p-insp.mood-surprise .insp-tap { animation: insp-flinch .7s ${OUT} both; }
.p-insp.mood-surprise .insp-cupHold, .p-insp.mood-surprise .insp-cupJump { animation: insp-cupjolt .7s ${OUT} both; }
.p-insp.mood-surprise .insp-splash { animation-delay: .04s; }
`;
const CSS3 = `
@keyframes insp-rain { from { transform: translateY(0); } to { transform: translateY(60px); } }
@keyframes insp-drip { 0% { transform: translateY(0); opacity: 0; } 8% { opacity: .9; } 80% { opacity: .8; } 100% { transform: translateY(190px); opacity: 0; } }
@keyframes insp-spin { to { transform: rotate(360deg); } }
@keyframes insp-neon { 0%, 61%, 64%, 66% { opacity: 1; } 62%, 65% { opacity: .25; } 90% { opacity: .85; } }
@keyframes insp-tube { 0%, 38%, 41%, 44%, 79%, 100% { opacity: 1; } 39%, 42.5% { opacity: .2; } 40% { opacity: .7; } 80%, 81.5% { opacity: .35; } }
@keyframes insp-wash { 0%, 38%, 44%, 79%, 100% { opacity: .035; } 39%, 42.5% { opacity: 0; } 40% { opacity: .05; } 80% { opacity: 0; } }
@keyframes insp-cone { 0%, 100% { opacity: .92; } 50% { opacity: 1; } }
@keyframes insp-bolt { 0%, 86%, 100% { opacity: .75; } 87% { opacity: 1; } 88% { opacity: .7; } 89.5% { opacity: 1; } 92% { opacity: .75; } }
@keyframes insp-breath { 0%, 100% { transform: scale(1, 1); } 45% { transform: scale(1.006, 1.013); } }
@keyframes insp-tie { 0%, 100% { transform: rotate(-1.2deg); } 50% { transform: rotate(1.2deg); } }
@keyframes insp-shift { 0%, 100% { transform: translate(-1.6px, 0) rotate(-.45deg); } 50% { transform: translate(1.6px, .6px) rotate(.45deg); } }
@keyframes insp-drift { 0%, 100% { transform: rotate(-1.2deg); } 40% { transform: rotate(1.4deg) translateY(.6px); } 70% { transform: rotate(.4deg) translateY(-.3px); } }
@keyframes insp-hatdrift { 0%, 100% { transform: rotate(.4deg); } 45% { transform: rotate(-.8deg) translateY(.3px); } }
@keyframes insp-dart { 0%, 28% { transform: translate(0, 0); } 31%, 50% { transform: translate(-1.8px, .3px); } 53%, 69% { transform: translate(1.6px, -.2px); } 72%, 100% { transform: translate(0, 0); } }
@keyframes insp-blink { 0%, 90%, 100% { transform: scaleY(1); } 93.5% { transform: scaleY(1.74); } 96% { transform: scaleY(1.05); } }
@keyframes insp-tap { 0%, 52%, 100% { transform: rotate(0); } 60% { transform: rotate(-5deg); } 66% { transform: rotate(1.5deg); } 72% { transform: rotate(-4deg); } 80% { transform: rotate(.8deg); } 88% { transform: rotate(0); } }
@keyframes insp-sip { 0%, 55%, 100% { transform: translate(0, 0) rotate(0); } 66% { transform: translate(-1px, -4px) rotate(-3deg); } 84% { transform: translate(-1px, -3.4px) rotate(-2.4deg); } 94% { transform: translate(0, .4px) rotate(.4deg); } }
@keyframes insp-mpop { 0% { transform: scale(.7, .5); } 100% { transform: scale(1); } }
@keyframes insp-lean { 0% { transform: none; } 14% { transform: translateY(2.5px) scale(.993); animation-timing-function: ${BACK}; } 55% { transform: translateY(-3.5px) scale(1.038); } 78% { transform: translateY(-2px) scale(1.024); } 100% { transform: translateY(-2.6px) scale(1.03); } }
@keyframes insp-raise { 0% { transform: translate(-16px, 96px) rotate(-22deg); opacity: 0; } 12% { transform: translate(-18px, 100px) rotate(-24deg); opacity: 1; animation-timing-function: ${OUT}; } 58% { transform: translate(2px, -6px) rotate(2.5deg); animation-timing-function: ${INOUT}; } 80% { transform: translate(-.5px, 1.5px) rotate(-.6deg); } 100% { transform: none; } }
@keyframes insp-gbrow { 0% { transform: none; } 100% { transform: translateY(-4px) rotate(-5deg); } }
@keyframes insp-gblink { 0%, 80%, 100% { transform: scaleY(1); } 86% { transform: scaleY(1.9); } 92% { transform: scaleY(1); } }
@keyframes insp-hatlag { 0% { transform: none; } 30% { transform: rotate(-3deg) translateY(-1px); } 62% { transform: rotate(1.4deg); } 100% { transform: rotate(-.6deg); } }
@keyframes insp-cupdip { 0% { transform: none; } 100% { transform: translate(2px, 2px) rotate(2deg); } }
@keyframes insp-chuckle { 0%, 100% { transform: translateY(0) scale(1, 1); } 50% { transform: translateY(-2.6px) scale(1.004, 1.008); } }
@keyframes insp-headback { 0% { transform: none; } 22% { transform: rotate(2.4deg) translateY(1.4px); animation-timing-function: ${BACK}; } 70% { transform: rotate(-8.5deg) translateY(-3.5px); } 100% { transform: rotate(-6.5deg) translateY(-2.5px); } }
@keyframes insp-nod { 0%, 100% { transform: rotate(-1.4deg); } 50% { transform: rotate(1deg) translateY(.8px); } }
@keyframes insp-tip { 0% { transform: none; } 20% { transform: translateY(1.5px); } 100% { transform: translate(-2px, -7px) rotate(-14deg); } }
@keyframes insp-haha { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, .78); } }
@keyframes insp-heh { 0% { opacity: 0; transform: translateY(8px) scale(.5); } 16% { opacity: 1; transform: translateY(0) scale(1.15); } 30% { transform: scale(1); } 70% { opacity: 1; transform: translateY(-6px); } 100% { opacity: 0; transform: translateY(-13px); } }
@keyframes insp-jiggle { 0%, 100% { transform: rotate(-1.2deg); } 50% { transform: rotate(1.4deg) translateY(-.8px); } }
@keyframes insp-lunge { 0% { transform: none; } 16% { transform: translateY(3.5px) scale(.988); animation-timing-function: ${BACK}; } 46% { transform: translateY(-6px) scale(1.05); } 70% { transform: translateY(-3.5px) scale(1.032); } 100% { transform: translateY(-4.2px) scale(1.038); } }
@keyframes insp-chin { 0% { transform: none; } 16% { transform: rotate(2.4deg) translateY(1px); animation-timing-function: ${BACK}; } 50% { transform: rotate(-4.5deg) translateY(-1.5px); } 100% { transform: rotate(-3deg) translateY(-1px); } }
@keyframes insp-jab { 0% { transform: translate(-6px, 34px) scale(.62) rotate(10deg); opacity: 0; } 10% { opacity: 1; } 22% { transform: translate(-12px, 40px) scale(.58) rotate(14deg); animation-timing-function: ${OUT}; } 55% { transform: translate(5px, -8px) scale(1.14) rotate(-3deg); animation-timing-function: ${INOUT}; } 78% { transform: translate(-1px, 2px) scale(.97) rotate(.6deg); } 100% { transform: none; } }
@keyframes insp-glint { 0% { transform: scale(0) rotate(0); opacity: 0; } 50% { transform: scale(1.5) rotate(40deg); opacity: 1; } 100% { transform: scale(1) rotate(45deg); opacity: .9; } }
@keyframes insp-slam { 0% { transform: none; } 34% { transform: translateY(-24px) rotate(-3deg); animation-timing-function: ${IN}; } 52% { transform: translateY(2.5px) scale(1.03, .96); animation-timing-function: ${OUT}; } 66% { transform: translateY(-3px); } 100% { transform: none; } }
@keyframes insp-cupjump { 0%, 30% { transform: none; animation-timing-function: ${OUT}; } 52% { transform: translateY(-16px) rotate(-9deg); animation-timing-function: ${IN}; } 70% { transform: translateY(1px) rotate(3deg) scale(1.04, .95); } 82% { transform: translateY(-3px) rotate(-1deg); } 100% { transform: none; } }
@keyframes insp-splash { 0% { opacity: 0; transform: scale(.2, .1); } 14% { opacity: 1; transform: scale(1.1, 1.2); } 40% { opacity: 1; transform: scale(1, 1); } 70% { opacity: 0; } 100% { opacity: 0; } }
@keyframes insp-hop { 0% { transform: none; } 12% { transform: translateY(2px) scale(1.05, .93); animation-timing-function: ${OUT}; } 40% { transform: translateY(-24px) rotate(7deg); animation-timing-function: ${IN}; } 62% { transform: translateY(1px) rotate(-2deg) scale(1.06, .92); animation-timing-function: ${OUT}; } 74% { transform: translateY(-5px) rotate(1deg); animation-timing-function: ${IN}; } 86% { transform: none; } 100% { transform: none; } }
@keyframes insp-slump { 0% { transform: none; } 22% { transform: translateY(-3.5px) scale(1.012); } 72% { transform: translateY(9.5px) scale(.972); } 100% { transform: translateY(8.5px) scale(.978); } }
@keyframes insp-drop { 0% { transform: none; } 22% { transform: rotate(-2deg) translateY(-2px); } 78% { transform: rotate(4.5deg) translateY(6.5px); } 100% { transform: rotate(3.8deg) translateY(5.5px); } }
@keyframes insp-brim { 0%, 30% { transform: none; } 80% { transform: translateY(8.5px) rotate(2.5deg); } 90% { transform: translateY(7.4px) rotate(1.6deg); } 100% { transform: translateY(8px) rotate(2deg); } }
@keyframes insp-droop { 0% { transform: none; } 100% { transform: rotate(16deg) translateY(2px); } }
@keyframes insp-cupdown { 0% { transform: none; } 100% { transform: translate(1px, 2px) rotate(3deg); } }
@keyframes insp-jolt { 0% { transform: none; } 9% { transform: translateY(2.5px) scale(1.01, .982); animation-timing-function: ${OUT}; } 22% { transform: translateY(-8px) scale(.99, 1.03); animation-timing-function: ${INOUT}; } 42% { transform: translateY(-1.5px); } 62% { transform: translateY(-3.5px); } 100% { transform: translateY(-2.5px); } }
@keyframes insp-jerk { 0% { transform: none; } 9% { transform: rotate(1.2deg) translateY(1px); } 24% { transform: rotate(-3.5deg) translateY(-4.5px); } 46% { transform: rotate(1deg) translateY(-1.5px); } 100% { transform: rotate(-.8deg) translateY(-2.2px); } }
@keyframes insp-pop { 0% { transform: scale(1); } 10% { transform: scale(.82, .7); } 34% { transform: scale(1.4); } 52% { transform: scale(1.22); } 70% { transform: scale(1.31); } 100% { transform: scale(1.27); } }
@keyframes insp-fly {
 0% { transform: none; animation-timing-function: ${OUT}; }
 7% { transform: translateY(3px) scale(1.06, .9); animation-timing-function: ${OUT}; }
 30% { transform: translate(7px, -24px) rotate(-20deg); animation-timing-function: cubic-bezier(.3, 0, .7, 1); }
 46% { transform: translate(11px, -28px) rotate(-30deg); animation-timing-function: ${IN}; }
 72% { transform: translate(1px, -2px) rotate(-6deg); animation-timing-function: ${OUT}; }
 78% { transform: translateY(1.5px) rotate(-1deg) scale(1.08, .9); animation-timing-function: ${OUT}; }
 86% { transform: translateY(-6px) rotate(2.5deg); animation-timing-function: ${IN}; }
 93% { transform: translateY(0) rotate(-.8deg); animation-timing-function: ${OUT}; }
 100% { transform: none; } }
@keyframes insp-noshadow { 0%, 6% { opacity: 1; } 16%, 66% { opacity: 0; } 78%, 100% { opacity: 1; } }
@keyframes insp-zip { 0% { opacity: 0; transform: translateY(10px); } 30% { opacity: .9; } 100% { opacity: 0; transform: translateY(-8px); } }
@keyframes insp-flinch { 0% { transform: none; } 12% { transform: rotate(-14deg); } 36% { transform: rotate(5deg); } 58% { transform: rotate(-2deg); } 100% { transform: none; } }
@keyframes insp-cupjolt { 0% { transform: none; } 10% { transform: translateY(-8px) rotate(-7deg); animation-timing-function: ${IN}; } 26% { transform: translateY(1px) rotate(2deg) scale(1.03, .96); } 40% { transform: translateY(-1.5px); } 60%, 100% { transform: none; } }
.p-insp .insp-sp { opacity: 0; }
.p-insp.mood-victoire .insp-sp, .p-insp.mood-surprise .insp-sp { animation: insp-drop1 .8s ${OUT} .52s both; }
.p-insp.mood-surprise .insp-sp { animation-delay: .04s; }
.p-insp.mood-victoire .insp-sp2, .p-insp.mood-surprise .insp-sp2 { animation-name: insp-drop2; }
.p-insp.mood-victoire .insp-sp3, .p-insp.mood-surprise .insp-sp3 { animation-name: insp-drop3; }
.p-insp.mood-victoire .insp-sp4, .p-insp.mood-surprise .insp-sp4 { animation-name: insp-drop4; }
@keyframes insp-drop1 { 0% { opacity: 1; transform: translate(0, 0); } 40% { transform: translate(-9px, -16px); animation-timing-function: ${IN}; } 100% { opacity: 0; transform: translate(-15px, 18px); } }
@keyframes insp-drop2 { 0% { opacity: 1; transform: translate(0, 0); } 40% { transform: translate(1px, -24px); animation-timing-function: ${IN}; } 100% { opacity: 0; transform: translate(3px, 10px); } }
@keyframes insp-drop3 { 0% { opacity: 1; transform: translate(0, 0); } 40% { transform: translate(10px, -14px); animation-timing-function: ${IN}; } 100% { opacity: 0; transform: translate(17px, 20px); } }
@keyframes insp-drop4 { 0% { opacity: 1; transform: translate(0, 0); } 40% { transform: translate(6px, -28px); animation-timing-function: ${IN}; } 100% { opacity: 0; transform: translate(9px, 4px); } }
`;
/*@@CSS@@*/
// ---------- game screen sample: a case file ----------
const SUSPECTS = [
  ['Toi', '#ff5fa2', '01', 0, '', '<path d="M22 40 C22 24 30 16 40 16 C50 16 58 24 58 40 C58 46 56 50 54 52 L26 52 C24 50 22 46 22 40 Z" fill="#000" opacity=".35"/>'],
  ['Léo', '#4cc9f0', '02', 2, 'Toi, Inès', '<path d="M24 30 C26 18 54 18 56 30 L62 32 L22 32 Z" fill="#000" opacity=".45"/>'],
  ['Inès', '#ffd23f', '03', 0, '', '<path d="M24 46 C20 30 26 16 40 15 C54 16 60 30 56 46 C54 38 52 30 48 26 C42 30 34 30 28 26 C26 32 25 38 24 46 Z" fill="#000" opacity=".4"/><circle cx="40" cy="12" r="6" fill="#000" opacity=".4"/>'],
  ['Max', '#8ee6b4', '04', 1, 'Léo', '<g fill="none" stroke="#111" stroke-width="2.2" opacity=".7"><circle cx="33" cy="37" r="5"/><circle cx="47" cy="37" r="5"/><path d="M38 37 L42 37"/></g>'],
];
const mug = ([n, c, num, votes, by, extra], i) => `<figure class="ui-insp-mug" style="--c:${c};--i:${i}">
 <span class="ui-insp-pin"></span>
 <div class="ui-insp-shot"><svg viewBox="0 0 80 84" aria-hidden="true"><path d="M8 84 C10 66 22 58 40 58 C58 58 70 66 72 84 Z" fill="${c}"/><path d="M8 84 C10 66 22 58 40 58 L40 84 Z" fill="#000" opacity=".22"/>
 <rect x="33" y="46" width="14" height="14" fill="${c}"/><ellipse cx="40" cy="36" rx="16" ry="19" fill="${c}"/><ellipse cx="34" cy="36" rx="10" ry="18" fill="#000" opacity=".18"/>${extra}</svg>
 <span class="ui-insp-plate"><b>${n.toUpperCase()}</b><i>N° ${num}</i></span></div>
 <div class="ui-insp-tally" aria-label="${votes} vote${votes > 1 ? 's' : ''}">${rep(votes, () => '<i></i>')}${votes ? '' : '<em>—</em>'}</div>
 <small>${by ? `voté par ${by}` : 'aucun vote'}</small>
</figure>`;
const WORDS = [['Toi', 'Lumière', 'done'], ['Léo', 'Nuit', 'done'], ['Inès', '', 'now'], ['Max', '', 'wait']];
const UI_HTML = `<div class="ui-insp-folder">
<header class="ui-insp-head"><span class="ui-insp-tab">Dossier n° 07</span>
 <h3>Undercover <small>Manche 2 / 5</small></h3>
 <p>Même image pour tous… sauf un. Un mot chacun, puis on démasque l'imposteur.</p></header>
<div class="ui-insp-top">
 <div class="ui-insp-evid">
  <figure class="ui-insp-pola"><span class="ui-insp-clip" aria-hidden="true"></span>
   <svg viewBox="0 0 160 120" role="img" aria-label="Image secrète : un phare sous la pluie">
    <defs><linearGradient id="ui-insp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c2232"/><stop offset="1" stop-color="#28485a"/></linearGradient>
    <linearGradient id="ui-insp-beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></linearGradient></defs>
    <rect width="160" height="120" fill="url(#ui-insp-sky)"/>
    <g class="ui-insp-beam"><path d="M98 38 L160 22 L160 54 Z" fill="url(#ui-insp-beam)"/><path d="M98 38 L36 22 L36 54 Z" fill="url(#ui-insp-beam2)" opacity=".5"/></g>
    <defs><linearGradient id="ui-insp-beam2" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".85"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></linearGradient></defs>
    <path d="M0 92 C20 88 40 94 60 90 C80 86 100 92 120 89 C140 86 150 90 160 88 L160 120 L0 120 Z" fill="#0a1820"/>
    <path d="M70 120 L78 96 L90 92 L104 94 L116 120 Z" fill="#141c22"/>
    <path d="M92 94 L94 46 L102 46 L104 94 Z" fill="#e9e2d2"/><path d="M93 74 L103 74 L103.6 84 L92.6 84 Z M93.7 56 L102.3 56 L102.7 64 L93.3 64 Z" fill="#c0262d"/>
    <rect x="91" y="34" width="14" height="12" fill="#ffd77a"/><path d="M89 34 L98 26 L107 34 Z" fill="#20282e"/><rect x="90" y="45" width="16" height="2.4" fill="#20282e"/>
    <g stroke="#bfe3ff" stroke-width=".7" opacity=".5">${rep(16, (i) => `<path d="M${(i * 37) % 160} ${(i * 23) % 90} l-3 9"/>`)}</g>
    <path d="M0 100 C14 98 22 102 36 100 M46 106 C60 104 70 108 84 105 M118 104 C130 102 142 106 156 103" stroke="#3d6578" stroke-width="1" fill="none"/>
   </svg>
   <figcaption>L'image secrète</figcaption></figure>
  <div class="ui-insp-imp"><p>Ce que voit l'imposteur</p><div class="ui-insp-blank">?</div><span class="ui-insp-stamp">Tu es l'imposteur</span></div>
 </div>
 <div class="ui-insp-words"><h4>Dépositions <span>un mot chacun, à tour de rôle</span></h4>
  <ol>${WORDS.map(([n, w, s], i) => `<li class="ui-insp-card is-${s}" style="--i:${i};--r:${[-1.6, 1.2, -.6, 1.8][i]}deg">
   <b>${n}</b>${s === 'done' ? `<span class="ui-insp-typed" style="--n:${w.length + 2}">« ${w} »</span>` : s === 'now' ? `<span class="ui-insp-nowtxt">À ${n} d'écrire<i class="ui-insp-caret"></i></span>` : '<span class="ui-insp-wait">en attente…</span>'}</li>`).join('')}</ol>
 </div>
</div>
<section class="ui-insp-vote"><h4>Le vote <span>qui est l'imposteur ?</span></h4>
 <div class="ui-insp-row">
  <div class="ui-insp-lineup"><svg class="ui-insp-string" viewBox="0 0 400 30" preserveAspectRatio="none" aria-hidden="true"><path d="M50 8 Q100 26 150 8 Q200 26 250 8 Q300 26 350 8"/></svg>
   ${SUSPECTS.map(mug).join('')}</div>
  <aside class="ui-insp-watch"><svg viewBox="0 0 100 112" aria-label="Chrono 30 secondes">
   <rect x="43" y="2" width="14" height="9" rx="2.5" fill="#b9863a"/><rect x="47" y="10" width="6" height="7" fill="#7a5520"/>
   <circle cx="50" cy="64" r="44" fill="#1b1d20"/><circle cx="50" cy="64" r="44" fill="none" stroke="#c99a46" stroke-width="4"/>
   <circle cx="50" cy="64" r="37" fill="#f2ead6"/>
   <g stroke="#2b2117" stroke-width="1.6">${rep(12, (i) => `<path d="M50 30 L50 ${i % 3 ? 33 : 36}" transform="rotate(${i * 30} 50 64)"/>`)}</g>
   <text x="50" y="76" text-anchor="middle" font-family="Bebas Neue" font-size="34" fill="#2b2117">30</text>
   <g class="ui-insp-hand"><path d="M50 64 L50 33" stroke="#c0262d" stroke-width="2" stroke-linecap="round"/><circle cx="50" cy="64" r="3.2" fill="#c0262d"/></g>
  </svg><p><b>30 s pour voter</b>le chrono démarre au premier vote</p></aside>
 </div>
</section>
</div>`;
const UI_CSS = `
.ui-insp { background: radial-gradient(120% 90% at 70% 0%, #2a1a10, #120a06 70%); padding: 16px; color: #2b2117; font-family: "Courier Prime", monospace; }
.ui-insp *, .ui-insp *::before, .ui-insp *::after { box-sizing: border-box; }
.ui-insp h3, .ui-insp h4, .ui-insp p, .ui-insp ol, .ui-insp figure { margin: 0; padding: 0; }
.ui-insp .ui-insp-folder { position: relative; background: radial-gradient(80% 60% at 20% 10%, #ecd294, transparent 60%), radial-gradient(70% 80% at 90% 100%, #b58f4c, transparent 70%), #d9b673;
  border-radius: 4px 10px 10px 10px; padding: 18px 18px 16px; box-shadow: 0 14px 30px rgba(0,0,0,.55), inset 0 0 0 1px rgba(90,60,20,.35); margin-top: 18px;
  animation: ui-insp-open .5s ${OUT} both; }
.ui-insp .ui-insp-tab { position: absolute; left: 0; top: -20px; background: #d9b673; border-radius: 8px 8px 0 0; padding: 3px 16px 2px; font: 700 12px/1.4 "Special Elite", monospace; letter-spacing: .12em; text-transform: uppercase; box-shadow: inset 0 1px 0 #f0d79e; }
.ui-insp .ui-insp-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 14px; border-bottom: 2px dashed rgba(70,45,15,.35); padding-bottom: 10px; margin-bottom: 14px; }
.ui-insp h3 { font: 400 34px/1 "Bebas Neue", sans-serif; letter-spacing: .06em; color: #2b1d10; }
.ui-insp h3 small { font: 700 13px "Special Elite", monospace; letter-spacing: .08em; color: #8a2a20; margin-left: 8px; }
.ui-insp .ui-insp-head p { font-size: 13.5px; color: #4b3a26; flex: 1 1 260px; }
.ui-insp h4 { font: 400 22px/1 "Bebas Neue", sans-serif; letter-spacing: .08em; color: #2b1d10; margin-bottom: 10px; }
.ui-insp h4 span { font: 400 13px "Special Elite", monospace; letter-spacing: 0; color: #6a5236; margin-left: 8px; text-transform: none; }
.ui-insp .ui-insp-top { display: grid; grid-template-columns: minmax(0, 330px) minmax(0, 1fr); gap: 18px; align-items: start; }
.ui-insp .ui-insp-evid { display: flex; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.ui-insp .ui-insp-pola { position: relative; background: #f6f1e4; padding: 8px 8px 26px; width: 188px; transform: rotate(-3deg); box-shadow: 0 6px 14px rgba(40,20,0,.45); animation: ui-insp-drop .6s ${BACK} .1s both; }
.ui-insp .ui-insp-pola svg { display: block; width: 100%; height: auto; }
.ui-insp .ui-insp-pola figcaption { position: absolute; left: 8px; right: 8px; bottom: 5px; font: 15px/1 "Permanent Marker", cursive; color: #26355e; text-align: center; }
.ui-insp .ui-insp-clip { position: absolute; top: -12px; left: 22px; width: 14px; height: 38px; border: 2.5px solid #9aa3aa; border-radius: 8px; border-bottom-color: transparent; z-index: 2; }
.ui-insp .ui-insp-beam { transform-origin: 98px 40px; animation: ui-insp-sweep 4s cubic-bezier(.45,0,.55,1) infinite alternate; }
.ui-insp .ui-insp-imp { position: relative; width: 118px; background: #f2ede0; padding: 8px 8px 10px; transform: rotate(2.5deg); box-shadow: 0 4px 10px rgba(40,20,0,.4); margin-top: 18px; animation: ui-insp-drop .6s ${BACK} .3s both; }
.ui-insp .ui-insp-imp p { font: 11px/1.25 "Special Elite", monospace; color: #4b3a26; margin-bottom: 6px; }
.ui-insp .ui-insp-blank { height: 74px; background: repeating-linear-gradient(45deg, #2a2f35 0 6px, #23272c 6px 12px); display: grid; place-items: center; font: 40px/1 "Permanent Marker", cursive; color: #5a6670; }
.ui-insp .ui-insp-stamp { position: absolute; left: -10px; right: -10px; top: 46px; text-align: center; font: 400 17px/1.05 "Bebas Neue", sans-serif; letter-spacing: .06em; color: #c0262d; border: 3px double #c0262d; padding: 4px 3px 2px; background: rgba(242,237,224,.86); transform: rotate(-12deg); animation: ui-insp-stamp .4s ${BACK} .35s both; }
.ui-insp .ui-insp-words ol { list-style: none; display: grid; gap: 9px; }
.ui-insp .ui-insp-card { display: flex; align-items: baseline; gap: 12px; background: repeating-linear-gradient(#fbf8ef 0 21px, #b9cfe0 21px 22px); background-position: 0 6px; border-top: 3px solid #d0565b; padding: 9px 14px 8px; box-shadow: 0 3px 8px rgba(40,20,0,.35); transform: rotate(var(--r)); animation: ui-insp-deal .45s ${BACK} calc(.25s + var(--i) * .12s) both; }
.ui-insp .ui-insp-card b { font: 400 13px "Special Elite", monospace; color: #6a5236; min-width: 44px; }
.ui-insp .ui-insp-typed { font: 400 22px/1.1 "Special Elite", monospace; color: #1d1712; clip-path: inset(0 100% 0 0); animation: ui-insp-type .4s steps(var(--n)) calc(.2s + var(--i) * .16s) forwards; }
.ui-insp .ui-insp-card.is-now { border-top-color: #e0a422; box-shadow: 0 0 0 2px #e8b83a, 0 6px 16px rgba(232,184,58,.45); animation: ui-insp-deal .45s ${BACK} .49s both, ui-insp-glow 2.4s ${INOUT} 1.2s infinite; }
.ui-insp .ui-insp-nowtxt { font: 400 19px/1.1 "Special Elite", monospace; color: #8a2a20; background: linear-gradient(transparent 60%, rgba(255,214,80,.6) 60%); }
.ui-insp .ui-insp-caret { display: inline-block; width: 2px; height: 1em; background: #8a2a20; margin-left: 4px; vertical-align: -2px; animation: ui-insp-blink 1s steps(1) infinite; }
.ui-insp .ui-insp-wait { font: italic 15px "Courier Prime", monospace; color: #9a8a74; }
.ui-insp .ui-insp-vote { margin-top: 16px; border-top: 2px dashed rgba(70,45,15,.35); padding-top: 12px; }
.ui-insp .ui-insp-row { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 16px; align-items: center; }
.ui-insp .ui-insp-lineup { position: relative; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 14px 12px 10px; background: repeating-linear-gradient(to bottom, rgba(255,255,255,.16) 0 1px, transparent 1px 14px), #2c3136; border-radius: 4px; box-shadow: inset 0 0 22px rgba(0,0,0,.6); }
.ui-insp .ui-insp-string { position: absolute; left: 12px; right: 12px; top: 4px; width: calc(100% - 24px); height: 30px; z-index: 3; pointer-events: none; overflow: visible; }
.ui-insp .ui-insp-string path { fill: none; stroke: #d22a33; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-dasharray: 600; stroke-dashoffset: 600; animation: ui-insp-string .5s ${OUT} .5s forwards; }
.ui-insp .ui-insp-mug { position: relative; display: grid; justify-items: center; gap: 6px; animation: ui-insp-deal .45s ${BACK} calc(.25s + var(--i) * .07s) both; }
.ui-insp .ui-insp-pin { position: absolute; top: -9px; width: 10px; height: 10px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #ff9aa0, #c0262d 60%); z-index: 4; box-shadow: 0 2px 2px rgba(0,0,0,.5); }
.ui-insp .ui-insp-shot { position: relative; width: 100%; max-width: 120px; background: #3a4148; border: 3px solid #e9e4d8; box-shadow: 0 4px 10px rgba(0,0,0,.5); }
.ui-insp .ui-insp-shot svg { display: block; width: 100%; height: auto; }
.ui-insp .ui-insp-plate { position: absolute; left: 10%; right: 10%; bottom: 6%; background: #15171a; color: #f2ede0; text-align: center; padding: 2px 2px 3px; border: 1px solid #555; }
.ui-insp .ui-insp-plate b { display: block; font: 400 15px/1 "Bebas Neue", sans-serif; letter-spacing: .1em; }
.ui-insp .ui-insp-plate i { display: block; font: normal 9px/1 "Courier Prime", monospace; opacity: .75; }
.ui-insp .ui-insp-tally { display: flex; gap: 5px; height: 26px; align-items: center; }
.ui-insp .ui-insp-tally i { width: 4px; height: 24px; background: #e23a3f; border-radius: 2px; transform: rotate(8deg) scaleY(0); transform-origin: bottom; animation: ui-insp-mark .35s ${BACK} forwards; }
.ui-insp .ui-insp-tally i:nth-child(1) { animation-delay: .6s; } .ui-insp .ui-insp-tally i:nth-child(2) { animation-delay: .72s; }
.ui-insp .ui-insp-tally em { color: #7f8890; font-style: normal; }
.ui-insp .ui-insp-mug small { font: 11px/1.2 "Special Elite", monospace; color: #c9c2b4; text-align: center; }
.ui-insp .ui-insp-watch { display: grid; justify-items: center; gap: 6px; text-align: center; }
.ui-insp .ui-insp-watch svg { width: 104px; height: auto; filter: drop-shadow(0 6px 8px rgba(40,20,0,.5)); animation: ui-insp-tick 1s ${OUT} infinite; transform-origin: 50% 57%; }
.ui-insp .ui-insp-hand { transform-origin: 50px 64px; animation: ui-insp-hand 30s steps(30) infinite; }
.ui-insp .ui-insp-watch p { font: 12px/1.3 "Special Elite", monospace; color: #3b2a18; }
.ui-insp .ui-insp-watch p b { display: block; font: 400 18px/1.1 "Bebas Neue", sans-serif; letter-spacing: .06em; color: #8a2a20; }
@keyframes ui-insp-open { from { transform: translateY(14px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes ui-insp-drop { from { transform: translateY(-22px) rotate(-12deg); opacity: 0; } }
@keyframes ui-insp-deal { from { transform: translate(28px, -10px) rotate(8deg); opacity: 0; } }
@keyframes ui-insp-type { to { clip-path: inset(0 0 0 0); } }
@keyframes ui-insp-stamp { 0% { transform: scale(2.6) rotate(-4deg); opacity: 0; } 60% { transform: scale(.94) rotate(-13deg); opacity: 1; } 100% { transform: scale(1) rotate(-12deg); opacity: 1; } }
@keyframes ui-insp-glow { 0%, 100% { box-shadow: 0 0 0 2px #e8b83a, 0 6px 16px rgba(232,184,58,.35); } 50% { box-shadow: 0 0 0 2px #f6cf4e, 0 6px 22px rgba(246,207,78,.7); } }
@keyframes ui-insp-blink { 50% { opacity: 0; } }
@keyframes ui-insp-string { to { stroke-dashoffset: 0; } }
@keyframes ui-insp-mark { to { transform: rotate(8deg) scaleY(1); } }
@keyframes ui-insp-sweep { from { transform: rotate(-14deg); } to { transform: rotate(14deg); } }
@keyframes ui-insp-hand { to { transform: rotate(360deg); } }
@keyframes ui-insp-tick { 0%, 100% { transform: none; } 6% { transform: rotate(1.5deg); } 14% { transform: rotate(-1deg); } 22% { transform: none; } }
@media (max-width: 760px) { .ui-insp .ui-insp-top { grid-template-columns: 1fr; } .ui-insp .ui-insp-row { grid-template-columns: 1fr; } .ui-insp .ui-insp-watch { grid-template-columns: auto 1fr; text-align: left; justify-items: start; align-items: center; } }
@media (max-width: 520px) { .ui-insp { padding: 10px; } .ui-insp .ui-insp-folder { padding: 14px 10px 12px; } .ui-insp .ui-insp-lineup { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 18px; } .ui-insp .ui-insp-string { display: none; } .ui-insp .ui-insp-pola { width: 160px; } .ui-insp .ui-insp-card { flex-wrap: wrap; gap: 2px 10px; } }
@media (prefers-reduced-motion: reduce) { .ui-insp * { animation-duration: .01ms !important; animation-delay: 0s !important; animation-iteration-count: 1 !important; } }
`;
/*@@UI@@*/
PERSOS.register({
  id: 'insp',
  name: 'Inspecteur Loupe',
  game: 'Undercover',
  blurb: 'Vieux flic fatigué de la brigade de nuit : il passe chaque mot à la loupe, flaire l’imposteur et le démasque au moment du vote.',
  svg: S.join('\n'),
  css: CSS1 + CSS2 + CSS3,
  variants: [
    { famille: 'chapeau', nom: 'Chapeau', choix: [['feutre', 'Feutre'], ['tete-nue', 'Tête nue']] },
    { famille: 'moustache', nom: 'Moustache', choix: [['moustache', 'Moustache'], ['rase', 'Rasé']] },
    { famille: 'main', nom: 'Main gauche', choix: [['cafe', 'Café'], ['dossier', 'Dossier']] },
  ],
  moodLabels: { repos: 'Il cogite', louche: 'Hmm… louche', rire: 'Petit rire sec', victoire: 'Démasqué !', decu: 'Long soupir', surprise: 'Quoi ?!' },
  react: 'louche',
  moments: [
    ['Un mot arrive', 'louche'],
    ['Tout le monde vote', 'surprise'],
    ['Imposteur démasqué', 'victoire', [
      { type: 'confetti', n: 90, colors: ['#e6c682', '#f5edda', '#c0262d', '#a1803c', '#ffffff'], delay: 250 },
      { type: 'stars', at: [258, 208], n: 26, delay: 200 },
      { type: 'sparks', at: [400, 330], n: 26, power: .8, color: '255,214,150', delay: 640 },
    ]],
    ["L'imposteur s'en sort", 'decu'],
  ],
  ambient: [
    { type: 'dust', box: [430, 252, 170, 96], density: 1.6, color: '255,216,160' },
    { type: 'dust', box: [40, 60, 200, 200], density: .5, color: '170,215,255' },
    { type: 'smoke', from: [352, 280], density: .9, size: .42, speed: .55, alpha: .14, color: '236,236,240' },
  ],
  bursts: {
    louche: [{ type: 'stars', at: [304, 102], n: 8, delay: 300, color: '255,236,190' }],
    rire: [],
    victoire: [{ type: 'lines', at: [258, 208], n: 26, delay: 140 }, { type: 'flash', delay: 180 }, { type: 'shake', delay: 180 }, { type: 'sparks', at: [258, 208], n: 34, power: 1.1, color: '255,226,160', delay: 180 }],
    decu: [{ type: 'smoke', at: [322, 158], n: 5, alpha: .13, color: '205,215,225', delay: 520 }],
    surprise: [{ type: 'lines', at: [320, 100], n: 22, delay: 60 }, { type: 'smoke', at: [352, 284], n: 4, alpha: .18, delay: 60 }],
  },
  moodMs: 3200,
  ui: { html: UI_HTML, css: UI_CSS },
});
})();
