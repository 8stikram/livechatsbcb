import type { GameKind } from "@livechatsbcb/protocol";

// A drawing for each game's card, moving gently on its own and livelier when the card is hovered.
export const GameArt = ({ kind }: { kind: GameKind }) => (
  <svg className={`game-art is-${kind}`} viewBox="0 0 160 160" aria-hidden="true">
    {kind === "joke" && (
      <>
        <g className="art-bob">
          <circle cx="80" cy="88" r="44" className="art-fill" />
          <path d="M58 78 q6 -8 12 0" className="art-line" />
          <path d="M90 78 q6 -8 12 0" className="art-line" />
          <path d="M56 96 q24 30 48 0 z" className="art-mouth" />
          <circle cx="54" cy="100" r="6" className="art-cheek" />
          <circle cx="106" cy="100" r="6" className="art-cheek" />
        </g>
        <text x="18" y="40" className="art-word art-pop">HA</text>
        <text x="112" y="30" className="art-word art-pop is-late">HA</text>
        <text x="122" y="64" className="art-word art-pop is-later">!</text>
      </>
    )}
    {kind === "question" && (
      <>
        <text x="80" y="120" textAnchor="middle" className="art-big art-wobble">?</text>
        <text x="30" y="56" textAnchor="middle" className="art-small art-float">?</text>
        <text x="132" y="48" textAnchor="middle" className="art-small art-float is-late">?</text>
        <text x="128" y="136" textAnchor="middle" className="art-small art-float is-later">?</text>
      </>
    )}
    {kind === "who" && (
      <>
        <g className="art-dim">
          <circle cx="80" cy="66" r="22" className="art-fill" />
          <path d="M40 132 q40 -56 80 0 z" className="art-fill" />
        </g>
        <g className="art-sweep">
          <circle cx="66" cy="70" r="26" className="art-lens" />
          <line x1="85" y1="89" x2="112" y2="116" className="art-handle" />
        </g>
      </>
    )}
    {kind === "undercover" && (
      <g className="art-bob">
        <path d="M44 62 h72 l-8 -26 q-28 -10 -56 0 z" className="art-hat" />
        <rect x="32" y="60" width="96" height="8" rx="4" className="art-hat" />
        <circle cx="80" cy="96" r="36" className="art-fill" />
        <g className="art-glance">
          <rect x="52" y="84" width="24" height="14" rx="5" className="art-glasses" />
          <rect x="84" y="84" width="24" height="14" rx="5" className="art-glasses" />
          <line x1="76" y1="90" x2="84" y2="90" className="art-handle" />
        </g>
        <path d="M68 116 q12 6 24 0" className="art-line" />
      </g>
    )}
    {kind === "guess" && (
      <>
        <g className="art-bob">
          <rect x="70" y="26" width="20" height="14" rx="4" className="art-hat" />
          <circle cx="80" cy="92" r="46" className="art-fill" />
          <circle cx="80" cy="92" r="36" className="art-lens" />
          <line x1="80" y1="92" x2="80" y2="64" className="art-handle art-tick" />
          <circle cx="80" cy="92" r="5" className="art-hat" />
        </g>
        <text x="16" y="48" className="art-word art-pop">?</text>
        <text x="130" y="40" className="art-word art-pop is-late">!</text>
      </>
    )}
  </svg>
);
