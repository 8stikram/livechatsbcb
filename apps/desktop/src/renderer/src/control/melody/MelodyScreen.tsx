// Melody Tycoon, Nuit Néon look: few numbers, big buttons, cards. The world lives on the server,
// one per Discord server; this screen only shows it and sends the player's choices.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BEATS,
  CFG,
  GENRES,
  MARKETING,
  THEMES,
  hitWord,
  qualityWord,
  type ArtistView,
  type MarketView,
  type MelodyAction,
  type MelodyView,
  type RosterView,
  type SongPreview,
  type SongView,
} from '@livechatsbcb/melody';
import type { MelodyRoute } from '../../../../shared/ipc';
import { errorMessage } from '../messages';
import '@fontsource-variable/archivo/wdth.css';
import './melody.css';

type MelodyState = { view: MelodyView; nextTickAt: number };
type Answer<T> = { ok: true; data: T } | { ok: false; message: string };
type Levels = { theme: 1 | 2 | 3 | 4; beat: 1 | 2 | 3 | 4; producer: 1 | 2 | 3 | 4; studio: 1 | 2 | 3 | 4 };
type Tab = 'home' | 'squad' | 'studio' | 'releases' | 'market' | 'charts' | 'bank';

const TABS: Array<{ id: Tab; name: string }> = [
  { id: 'home', name: 'Accueil' },
  { id: 'squad', name: 'Effectif' },
  { id: 'studio', name: 'Studio' },
  { id: 'releases', name: 'Sorties' },
  { id: 'market', name: 'Recrutement' },
  { id: 'charts', name: 'Charts' },
  { id: 'bank', name: 'Banque' },
];

const number = new Intl.NumberFormat('fr-FR');
const fmt = (value: number): string => number.format(Math.round(value));
const money = (value: number): string => `${fmt(value)} €`;
const compact = (value: number): string =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace('.', ',')} M` : value >= 10_000 ? `${Math.round(value / 1_000)} k` : fmt(value);

const ask = async <T,>(guildId: string, route: MelodyRoute, body?: unknown): Promise<Answer<T>> => {
  const result = await window.liveChat.melody(guildId, route, body);
  if (!result.ok) {
    if (result.error === 'storage_full') return { ok: false, message: 'Melody Tycoon est complet pour le moment. Réessaie plus tard.' };
    return { ok: false, message: errorMessage(result.error) };
  }
  const data = result.data as ({ ok?: boolean; message?: string } & T) | null;
  if (data && data.ok === false) return { ok: false, message: data.message ?? 'Action refusée.' };
  return { ok: true, data: data as T };
};

const hueOf = (id: string): number => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
};

const initials = (name: string): string =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

const useNow = (every: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
};

const countdown = (ms: number): string => {
  const left = Math.max(0, Math.floor(ms / 1000));
  const parts = [Math.floor(left / 3600), Math.floor((left % 3600) / 60), left % 60];
  return parts.map((part) => String(part).padStart(2, '0')).join(':');
};

// A number that climbs to its value, once, when it first shows.
const CountUp = ({ to, ms = 1300 }: { to: number; ms?: number }) => {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (document.documentElement.classList.contains('calm')) {
      setShown(to);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (at: number) => {
      const k = Math.min(1, (at - start) / ms);
      setShown(to * (1 - (1 - k) ** 3));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [to, ms]);
  return <>{fmt(shown)}</>;
};

const Stars = ({ score }: { score: number }) => {
  const lit = Math.max(0, Math.min(5, Math.round(score / 20)));
  return (
    <span className="mt-stars" role="img" aria-label={`${lit} étoiles sur 5`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} className={i < lit ? 'lit' : ''} style={{ '--d': `${400 + i * 200}ms` } as CSSProperties} />
      ))}
    </span>
  );
};

const Label = ({ children }: { children: ReactNode }) => <span className="mt-lbl">{children}</span>;

const Meter = ({ value }: { value: number }) => (
  <span className="mt-meter">
    <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
  </span>
);

const genreName = (genre: string): string => GENRES[genre as keyof typeof GENRES]?.name ?? genre;

// A collectible card for an artist: big rating, genre, name, energy when known.
const ArtistCard = ({
  artist,
  energy,
  pressed,
  onClick,
  children,
}: {
  artist: ArtistView;
  energy?: number;
  pressed?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}) => (
  <button type="button" className="mt-card" aria-pressed={pressed ?? false} onClick={onClick}>
    <span className="mt-art" data-i={initials(artist.name)} style={{ '--hue': hueOf(artist.id) } as CSSProperties} />
    <span className="mt-note">
      {artist.gen}
      <small>{genreName(artist.genre)}</small>
    </span>
    <span className="mt-card-foot">
      {artist.real && <span className="mt-real">Vrai artiste</span>}
      <span className="mt-nm">{artist.name}</span>
      {energy !== undefined && <Meter value={energy} />}
      {children}
    </span>
  </button>
);

/* ---------------------------------- Found ---------------------------------- */

const FoundLabel = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [name, setName] = useState('');
  const [starter, setStarter] = useState<string | null>(null);
  const ready = name.trim().length >= 2 && starter !== null && !busy;
  return (
    <div className="mt-found mt-in">
      <div className="mt-found-head">
        <Label>Saison {view.season} · semaine {view.weekOfSeason}</Label>
        <h2 className="mt-h">
          Fonde <span className="mt-gt">ton label</span>
        </h2>
        <p className="mt-sub">Tu commences avec un petit budget et un artiste débutant. Choisis-le bien : c’est ta première pépite.</p>
      </div>
      <label className="mt-field">
        <Label>Nom du label</Label>
        <input value={name} maxLength={28} placeholder="Chimchar Records" onChange={(event) => setName(event.target.value)} />
      </label>
      <Label>Ton premier artiste</Label>
      <div className="mt-deck mt-deck-3">
        {view.starters.map((artist) => (
          <ArtistCard key={artist.id} artist={artist} pressed={starter === artist.id} onClick={() => setStarter(artist.id)}>
            <span className="mt-card-sub">Potentiel {artist.potentialMin} – {artist.potentialMax}</span>
          </ArtistCard>
        ))}
      </div>
      <button
        type="button"
        className="mt-go mt-go-big"
        disabled={!ready}
        onClick={() => starter && onAct({ type: 'found', name: name.trim(), starterId: starter })}
      >
        Créer le label
      </button>
    </div>
  );
};

/* ---------------------------------- Home ---------------------------------- */

const Home = ({ view, onGo }: { view: MelodyView; onGo: (tab: Tab) => void }) => {
  const rested = view.roster.filter((artist) => artist.energy >= 30).length;
  const next = view.songs.filter((song) => song.state === 'scheduled').sort((a, b) => (a.releaseInWeeks ?? 0) - (b.releaseInWeeks ?? 0))[0];
  const last = view.songs.filter((song) => song.state === 'released').sort((a, b) => a.weeksOut - b.weeksOut)[0];
  const vault = view.songs.filter((song) => song.state === 'vault').length;
  const place = view.ranking.findIndex((line) => line.labelId === view.label?.id) + 1;
  const ahead = place > 1 ? view.ranking[place - 2] : undefined;
  const signable = view.market.filter((artist) => artist.blocked === null).length;
  const tape = next ? `Prochaine sortie ▪▪ dans ${next.releaseInWeeks} semaine${next.releaseInWeeks === 1 ? '' : 's'} ▪▪ ` : 'Rien de programmé ▪▪ ';
  return (
    <div className="mt-view mt-in">
      <div className="mt-hub">
        <button type="button" className="mt-tile mt-t-create" onClick={() => onGo('studio')}>
          <span className="mt-vinyl" aria-hidden="true" />
          <Label>{rested === 0 ? 'Tes artistes sont fatigués' : `${rested} artiste${rested > 1 ? 's ont' : ' a'} de l’énergie`}</Label>
          <span className="mt-h">
            Créer <span className="mt-gt">un son</span>
          </span>
          <span className="mt-go">Entrer au studio</span>
        </button>
        <button type="button" className="mt-tile mt-t-next" onClick={() => onGo('releases')}>
          <span className="mt-cover" aria-hidden="true" />
          <span className="mt-tape" aria-hidden="true">
            {tape.repeat(8)}
          </span>
          <Label>{next ? `Prochaine sortie · note ${next.quality}` : vault > 0 ? `${vault} son${vault > 1 ? 's' : ''} au coffre` : 'Prochaine sortie'}</Label>
          <span className="mt-h mt-h-xl">{next ? next.title : vault > 0 ? 'À sortir' : 'Rien en vue'}</span>
          <span className="mt-sub">{next ? next.artistName : 'Programme une sortie pour faire parler de toi'}</span>
        </button>
        <div className="mt-tile mt-t-night">
          <Label>{last ? `Cette semaine · « ${last.title} »` : 'Cette semaine'}</Label>
          {last ? (
            <>
              <div>
                <div className="mt-count mt-gt">
                  <CountUp to={last.streamsLast} />
                </div>
                <span className="mt-sub">
                  streams{last.peakGlobal ? ` · meilleur rang ${last.peakGlobal}e` : last.peakGenre ? ` · ${last.peakGenre}e de son genre` : ''}
                </span>
              </div>
              <Stars score={last.hitScore} />
              <span className="mt-sub">{hitWord(last.hitScore)}</span>
            </>
          ) : (
            <span className="mt-sub">Tes sons sortis apparaîtront ici, avec leurs streams de la semaine.</span>
          )}
        </div>
      </div>
      <div className="mt-row4">
        <button type="button" className="mt-tile" onClick={() => onGo('charts')}>
          <span className="mt-ico">{place || '–'}</span>
          <span>
            <Label>Classement du serveur</Label>
            <b>{place ? `${place}${place === 1 ? 'er' : 'e'} sur ${view.ranking.length}` : 'Pas encore classé'}</b>
            <span className="mt-sub">{ahead ? `${ahead.name} est devant` : place === 1 ? 'Tu mènes la danse' : ''}</span>
          </span>
        </button>
        <button type="button" className="mt-tile" onClick={() => onGo('squad')}>
          <span className="mt-ico">{view.roster.length}</span>
          <span>
            <Label>Effectif</Label>
            <b>
              {view.roster.length} / {view.label?.maxArtists ?? 0} artistes
            </b>
            <span className="mt-sub">Concerts, énergie, contrats</span>
          </span>
        </button>
        <button type="button" className="mt-tile" onClick={() => onGo('releases')}>
          <span className={`mt-ico${vault > 0 ? ' mt-alert' : ''}`} data-n={vault}>
            ♪
          </span>
          <span>
            <Label>Coffre</Label>
            <b>{vault > 0 ? `${vault} son${vault > 1 ? 's' : ''} à sortir` : 'Coffre vide'}</b>
            <span className="mt-sub">Choisis la date et la promo</span>
          </span>
        </button>
        <button type="button" className="mt-tile" onClick={() => onGo('market')}>
          <span className="mt-ico">+</span>
          <span>
            <Label>Recrutement</Label>
            <b>{signable > 0 ? `${signable} artiste${signable > 1 ? 's' : ''} signable${signable > 1 ? 's' : ''}` : 'Personne pour l’instant'}</b>
            <span className="mt-sub">Trouve ta prochaine star</span>
          </span>
        </button>
      </div>
    </div>
  );
};

/* ---------------------------------- Squad ---------------------------------- */

const RADAR: Array<{ key: keyof RosterView['attrs']; name: string }> = [
  { key: 'voix', name: 'Voix' },
  { key: 'ecriture', name: 'Écriture' },
  { key: 'scene', name: 'Scène' },
  { key: 'creativite', name: 'Créativité' },
  { key: 'discipline', name: 'Discipline' },
  { key: 'charisme', name: 'Charisme' },
];

const Radar = ({ attrs }: { attrs: RosterView['attrs'] }) => {
  const point = (i: number, r: number) => {
    const angle = ((-90 + i * 60) * Math.PI) / 180;
    return `${(100 + r * Math.cos(angle)).toFixed(1)},${(100 + r * Math.sin(angle)).toFixed(1)}`;
  };
  const ring = (r: number) => RADAR.map((_, i) => point(i, r)).join(' ');
  const places: Array<[number, number, 'middle' | 'start' | 'end']> = [
    [100, 8, 'middle'],
    [176, 58, 'start'],
    [176, 148, 'start'],
    [100, 198, 'middle'],
    [24, 148, 'end'],
    [24, 58, 'end'],
  ];
  return (
    <svg className="mt-radar" viewBox="-75 -8 350 216" role="img" aria-label="Forces de l’artiste">
      <defs>
        <linearGradient id="mt-rg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#8b5cff" />
          <stop offset="1" stopColor="#ff4fa3" />
        </linearGradient>
      </defs>
      <polygon points={ring(80)} fill="none" stroke="#2d2939" />
      <polygon points={ring(40)} fill="none" stroke="#2d2939" />
      <polygon
        className="mt-rpoly"
        points={RADAR.map((attr, i) => point(i, (attrs[attr.key] / 100) * 80)).join(' ')}
        fill="url(#mt-rg)"
        fillOpacity=".4"
        stroke="url(#mt-rg)"
        strokeWidth="2"
      />
      {RADAR.map((attr, i) => {
        const [x, y, anchor] = places[i]!;
        return (
          <text key={attr.key} x={x} y={y} textAnchor={anchor}>
            {attr.name} <tspan className="mt-v">{attrs[attr.key]}</tspan>
          </text>
        );
      })}
    </svg>
  );
};

const Squad = ({
  view,
  picked,
  onPick,
  onAct,
  onStudio,
  onGo,
  busy,
}: {
  view: MelodyView;
  picked: string | null;
  onPick: (id: string) => void;
  onAct: (action: MelodyAction) => void;
  onStudio: (artistId: string) => void;
  onGo: (tab: Tab) => void;
  busy: boolean;
}) => {
  const artist = view.roster.find((a) => a.id === picked) ?? view.roster[0];
  const free = (view.label?.maxArtists ?? 0) - view.roster.length;
  return (
    <div className="mt-view mt-in">
      <div className="mt-squad">
        <div className="mt-deck">
          {view.roster.map((a) => (
            <ArtistCard key={a.id} artist={a} energy={a.energy} pressed={a.id === artist?.id} onClick={() => onPick(a.id)} />
          ))}
          {free > 0 && (
            <button type="button" className="mt-card mt-card-add" onClick={() => onGo('market')}>
              <b>+</b>
              {free} place{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''}
            </button>
          )}
        </div>
        {artist && (
          <div className="mt-panel" key={artist.id}>
            <div className="mt-ptop">
              <div>
                <Label>Note</Label>
                <div className="mt-gen mt-gt">{artist.gen}</div>
              </div>
              <div>
                <Label>{genreName(artist.genre)}</Label>
                <h2 className="mt-h">{artist.name}</h2>
              </div>
            </div>
            <div className="mt-pills">
              <span className="mt-pill">
                Potentiel {artist.potentialMin} – {artist.potentialMax}
              </span>
              <span className="mt-pill">{compact(artist.fans)} fans</span>
              <span className={`mt-pill${artist.weeksLeft <= 4 ? ' mt-pill-warn' : ''}`}>Contrat : {artist.weeksLeft} sem.</span>
              {artist.real && <span className="mt-pill">Vrai artiste</span>}
            </div>
            <Radar attrs={artist.attrs} />
            <div className="mt-bars">
              <div>
                <Label>Énergie</Label>
                <b>{artist.energy}</b>
                <Meter value={artist.energy} />
              </div>
              <div>
                <Label>Moral</Label>
                <b>{artist.morale}</b>
                <Meter value={artist.morale} />
              </div>
              <div>
                <Label>Hype</Label>
                <b>{artist.hype}</b>
                <Meter value={artist.hype} />
              </div>
            </div>
            <div className="mt-acts">
              <button type="button" className="mt-go" onClick={() => onStudio(artist.id)}>
                Créer un son
              </button>
              <button
                type="button"
                className="mt-ghost"
                disabled={busy || artist.gigsBooked >= 3}
                onClick={() => onAct({ type: 'gig', artistId: artist.id })}
                title={`${artist.nextGig.venue} · ${fmt(artist.nextGig.audience)} personnes`}
              >
                {artist.gigsBooked >= 3
                  ? '3 concerts cette semaine'
                  : `Concert · ${artist.nextGig.profit >= 0 ? '+' : ''}${money(artist.nextGig.profit)}`}
              </button>
            </div>
            {artist.gigsBooked > 0 && (
              <span className="mt-sub">
                {artist.gigsBooked} concert{artist.gigsBooked > 1 ? 's' : ''} prévu{artist.gigsBooked > 1 ? 's' : ''} cette semaine.
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------- Studio ---------------------------------- */

const LEVELS: Array<{ key: keyof Levels; name: string; options: Array<{ name: string; price: (cfg: typeof CFG.quality) => string; note: string }> }> = [
  {
    key: 'theme',
    name: 'Écriture',
    options: [
      { name: 'Écrit seul', price: () => 'Gratuit', note: 'Fait maison' },
      { name: 'Parolier', price: (q) => money(q.themePrice[1]!), note: 'Texte propre' },
      { name: 'Plume reconnue', price: (q) => money(q.themePrice[2]!), note: 'Des punchlines' },
      { name: 'Plume star', price: (q) => money(q.themePrice[3]!), note: 'Le meilleur texte' },
    ],
  },
  {
    key: 'beat',
    name: 'Beat',
    options: [
      { name: 'Type beat gratuit', price: () => 'Gratuit', note: 'Déjà entendu' },
      { name: 'Beat acheté', price: (q) => money(q.beatPrice[1]!), note: 'Correct' },
      { name: 'Beat exclusif', price: (q) => money(q.beatPrice[2]!), note: 'Rien que pour toi' },
      { name: 'Sur mesure', price: () => '½ producteur', note: 'Fait par ton producteur' },
    ],
  },
  {
    key: 'producer',
    name: 'Producteur',
    options: [
      { name: 'Toi-même', price: () => 'Gratuit', note: 'Ça dépanne' },
      { name: 'Producteur local', price: (q) => money(q.producerPrice[1]!), note: 'Solide' },
      { name: 'Producteur reconnu', price: (q) => money(q.producerPrice[2]!), note: 'Un vrai son' },
      { name: 'Star de la prod', price: (q) => money(q.producerPrice[3]!), note: 'Signature en or' },
    ],
  },
  {
    key: 'studio',
    name: 'Studio',
    options: [
      { name: 'Home studio', price: () => 'Gratuit', note: 'Dans la chambre' },
      { name: 'Studio de quartier', price: (q) => money(q.studioPrice[1]!), note: 'Pas de délai' },
      { name: 'Studio pro', price: (q) => money(q.studioPrice[2]!), note: '+1 semaine de mixage' },
      { name: 'Studio prestige', price: (q) => money(q.studioPrice[3]!), note: '+1 semaine de mixage' },
    ],
  },
];

// Where the words of the quality scale fall, in points out of 100.
const SCALE: Array<[number, string]> = [
  [55, 'Correct'],
  [65, 'Bon'],
  [85, 'Tube'],
];

const STEPS =['Artiste', 'Thème', 'Beat', 'Équipe', 'Titre', 'Note'];

const Studio = ({
  guildId,
  view,
  artistId,
  onArtist,
  onAct,
  onGo,
  busy,
}: {
  guildId: string;
  view: MelodyView;
  artistId: string | null;
  onArtist: (id: string | null) => void;
  onAct: (action: MelodyAction) => Promise<MelodyView | null>;
  onGo: (tab: Tab) => void;
  busy: boolean;
}) => {
  const [step, setStep] = useState(artistId ? 1 : 0);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [beatId, setBeatId] = useState<string | null>(null);
  const [levels, setLevels] = useState<Levels>({ theme: 1, beat: 1, producer: 1, studio: 1 });
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<SongPreview | null>(null);
  const [made, setMade] = useState<SongView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const artist = view.roster.find((a) => a.id === artistId) ?? null;

  useEffect(() => {
    if (artistId && step === 0) setStep(1);
  }, [artistId, step]);

  useEffect(() => {
    if (!artistId || !themeId || !beatId || step < 3 || step > 4) return;
    let live = true;
    const timer = setTimeout(() => {
      void ask<{ preview: SongPreview }>(guildId, 'preview', { artistId, themeId, beatId, levels }).then((answer) => {
        if (!live) return;
        if (answer.ok) {
          setPreview(answer.data.preview);
          setProblem(null);
        } else setProblem(answer.message);
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [guildId, artistId, themeId, beatId, levels, step]);

  const restart = () => {
    onArtist(null);
    setStep(0);
    setThemeId(null);
    setBeatId(null);
    setLevels({ theme: 1, beat: 1, producer: 1, studio: 1 });
    setTitle('');
    setPreview(null);
    setMade(null);
    setProblem(null);
  };

  const record = async () => {
    if (!artistId || !themeId || !beatId) return;
    const before = new Set(view.songs.map((song) => song.id));
    const next = await onAct({ type: 'song', artistId, title: title.trim(), themeId, beatId, levels });
    const song = next?.songs.find((s) => !before.has(s.id));
    if (song) {
      setMade(song);
      setStep(5);
    }
  };

  const cash = view.label?.cash ?? 0;
  const cap = Math.min(cash, view.label?.songBudgetCap ?? 0);
  const theme = THEMES.find((t) => t.id === themeId);
  const beat = BEATS.find((b) => b.id === beatId);
  const hot = (value: number | undefined) => (value ?? 50) >= 65;

  let stage: ReactNode;
  if (step === 0) {
    stage = (
      <>
        <Label>Étape 1 · qui entre en cabine ?</Label>
        <div className="mt-deck">
          {view.roster.map((a) => (
            <ArtistCard
              key={a.id}
              artist={a}
              energy={a.energy}
              onClick={() => {
                onArtist(a.id);
                setStep(1);
              }}
            >
              {a.energy < 20 && <span className="mt-card-sub">Épuisé</span>}
            </ArtistCard>
          ))}
        </div>
      </>
    );
  } else if (step === 1) {
    stage = (
      <>
        <Label>Étape 2 · de quoi parle le son ?</Label>
        <div className="mt-opts">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="mt-opt mt-opt-small"
              aria-pressed={themeId === t.id}
              onClick={() => {
                setThemeId(t.id);
                setStep(2);
              }}
            >
              {hot(view.trends.themes[t.id]) && <span className="mt-hot">En vogue</span>}
              <b>{t.name}</b>
            </button>
          ))}
        </div>
      </>
    );
  } else if (step === 2) {
    const fits = (b: (typeof BEATS)[number]) => artist !== null && b.genres.includes(artist.genre);
    const sorted = [...BEATS].sort((a, b) => Number(fits(b)) - Number(fits(a)));
    stage = (
      <>
        <Label>Étape 3 · sur quelle prod ?</Label>
        <div className="mt-opts">
          {sorted.map((b) => (
            <button
              key={b.id}
              type="button"
              className="mt-opt mt-opt-small"
              aria-pressed={beatId === b.id}
              onClick={() => {
                setBeatId(b.id);
                setStep(3);
              }}
            >
              <span className="mt-tags">
                {fits(b) && <span className="mt-hot mt-hot-ok">Son style</span>}
                {themeId && b.themes.includes(themeId) && <span className="mt-hot mt-hot-ok">Va avec le thème</span>}
                {hot(view.trends.beats[b.id]) && <span className="mt-hot">En vogue</span>}
              </span>
              <b>{b.name}</b>
              <span className="mt-sub">{b.genres.map(genreName).join(' · ')}</span>
            </button>
          ))}
        </div>
      </>
    );
  } else if (step === 3) {
    stage = (
      <>
        <Label>Étape 4 · ton équipe</Label>
        {LEVELS.map((row) => (
          <div key={row.key} className="mt-level-row">
            <span className="mt-level-name">{row.name}</span>
            <div className="mt-levels">
              {row.options.map((option, index) => {
                const level = (index + 1) as 1 | 2 | 3 | 4;
                return (
                  <button
                    key={option.name}
                    type="button"
                    className="mt-opt mt-opt-level"
                    aria-pressed={levels[row.key] === level}
                    onClick={() => setLevels({ ...levels, [row.key]: level })}
                  >
                    <span className="mt-lv">
                      {[1, 2, 3, 4].map((i) => (
                        <i key={i} className={i <= level ? 'f' : ''} />
                      ))}
                    </span>
                    <b>{option.name}</b>
                    <span className="mt-price">{option.price(CFG.quality)}</span>
                    <span className="mt-sub">{option.note}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <button type="button" className="mt-go mt-go-big" disabled={!preview || preview.cost > cap} onClick={() => setStep(4)}>
          Valider l’équipe
        </button>
      </>
    );
  } else if (step === 4) {
    stage = (
      <>
        <Label>Étape 5 · le titre</Label>
        <label className="mt-field">
          <Label>Titre du son</Label>
          <input value={title} maxLength={40} placeholder="Rue Glacée" autoFocus onChange={(event) => setTitle(event.target.value)} />
        </label>
        <p className="mt-sub">
          {artist?.name} · {theme?.name} · {beat?.name}. Une fois enregistrée, la note est figée.
        </p>
        <div className="mt-acts">
          <button
            type="button"
            className="mt-go mt-go-big"
            disabled={busy || title.trim().length === 0 || !preview || preview.cost > cap || (artist?.energy ?? 0) < (preview?.energy ?? 0)}
            onClick={() => void record()}
          >
            Enregistrer · {preview ? money(preview.cost) : '…'}
          </button>
          <button type="button" className="mt-ghost" onClick={() => setStep(3)}>
            Changer l’équipe
          </button>
        </div>
      </>
    );
  } else if (made) {
    stage = (
      <div className="mt-reveal">
        <Label>Note finale · le son est figé</Label>
        <div className="mt-reveal-n mt-gt">
          <CountUp to={made.quality} ms={1400} />
        </div>
        <div className="mt-reveal-w">{qualityWord(made.quality)}</div>
        <span className="mt-sub">« {made.title} » part au coffre{made.readyInWeeks > 0 ? `, prêt dans ${made.readyInWeeks} semaine` : ''}.</span>
        <div className="mt-acts mt-acts-center">
          <button type="button" className="mt-go" onClick={() => onGo('releases')}>
            Programmer la sortie
          </button>
          <button type="button" className="mt-ghost" onClick={restart}>
            Créer un autre son
          </button>
        </div>
      </div>
    );
  }

  const low = preview?.qualityMin ?? 0;
  const high = preview?.qualityMax ?? 0;
  return (
    <div className="mt-view mt-in">
      <div className="mt-steps">
        {STEPS.map((name, i) => (
          <button
            key={name}
            type="button"
            className={i < step ? 'done' : i === step ? 'now' : ''}
            disabled={i >= step || step === 5 || (i > 0 && !artistId)}
            onClick={() => (i === 0 ? restart() : setStep(i))}
          >
            {name}
            {i < step ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <div className="mt-studio">
        <div className="mt-col mt-stagebox" key={step}>
          {view.roster.length === 0 ? <span className="mt-sub">Signe un artiste pour entrer au studio.</span> : stage}
        </div>
        <div className="mt-col">
          <div className="mt-band">
            <Label>Qualité estimée</Label>
            <div className="mt-big mt-gt">{made ? made.quality : preview && step >= 3 ? `${low} – ${high}` : '—'}</div>
            <div className="mt-range">
              {preview && step >= 3 && <i style={{ left: `${low}%`, width: `${Math.max(2, high - low)}%` }} />}
              {made && <u style={{ left: `${made.quality}%` }} />}
            </div>
            <div className="mt-scale">
              {SCALE.map(([at, word]) => (
                <span key={word} style={{ left: `${at}%` }}>
                  {word}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-band">
            <Label>Budget du son</Label>
            <div className="mt-big">
              {preview && step >= 3 ? money(preview.cost) : '0 €'} <span className="mt-mute">/ {money(cap)}</span>
            </div>
            <Meter value={preview && cap > 0 ? (preview.cost / cap) * 100 : 0} />
            <div className="mt-kv">
              <span className="mt-mute">Artiste</span>
              <b>{artist?.name ?? '—'}</b>
              <span className="mt-mute">Thème</span>
              <b>{theme?.name ?? '—'}</b>
              <span className="mt-mute">Beat</span>
              <b>{beat?.name ?? '—'}</b>
              <span className="mt-mute">Énergie</span>
              <b>
                {preview && step >= 3 ? `−${preview.energy} sur ${artist?.energy ?? 0}` : artist ? `${artist.energy} dispo` : '—'}
              </b>
              <span className="mt-mute">Délai</span>
              <b>{preview && step >= 3 && preview.delayWeeks > 0 ? `+${preview.delayWeeks} semaine` : 'aucun'}</b>
            </div>
          </div>
          <p className="mt-toast" role="status">
            {problem ??
              (preview && step >= 3 && preview.cost > cap
                ? cap < cash
                  ? 'Trop cher pour ton palier de label.'
                  : 'Pas assez de cash pour cette équipe.'
                : preview && artist && step >= 3 && artist.energy < preview.energy
                  ? `${artist.name} est trop fatigué pour cette session.`
                  : '')}
          </p>
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------- Releases ---------------------------------- */

const ReleasePlanner = ({ song, cash, onAct, onClose, busy }: { song: SongView; cash: number; onAct: (action: MelodyAction) => void; onClose: () => void; busy: boolean }) => {
  const soonest = Math.max(1, song.readyInWeeks);
  const [weeks, setWeeks] = useState(soonest);
  const [promo, setPromo] = useState<string[]>(['posts']);
  const total = promo.reduce((sum, id) => sum + (MARKETING.find((m) => m.id === id)?.cost ?? 0), 0);
  const toggle = (id: string) => setPromo(promo.includes(id) ? promo.filter((p) => p !== id) : [...promo, id]);
  return (
    <div className="mt-panel mt-in">
      <div className="mt-ptop">
        <div>
          <Label>Note</Label>
          <div className="mt-gen mt-gt">{song.quality}</div>
        </div>
        <div>
          <Label>{song.artistName}</Label>
          <h2 className="mt-h">{song.title}</h2>
        </div>
      </div>
      <Label>Sortie dans</Label>
      <div className="mt-chips">
        {[1, 2, 3, 4, 6, 8]
          .filter((w) => w >= soonest)
          .map((w) => (
            <button key={w} type="button" className="mt-chipbtn" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
              {w} sem.
            </button>
          ))}
      </div>
      <Label>Promo</Label>
      <div className="mt-promo">
        {MARKETING.map((m) => (
          <button key={m.id} type="button" className="mt-opt mt-opt-promo" aria-pressed={promo.includes(m.id)} onClick={() => toggle(m.id)}>
            <b>{m.name.replace('Réseaux sociaux — ', 'Réseaux · ')}</b>
            <span className="mt-price">{m.cost ? money(m.cost) : 'Gratuit'}</span>
            <span className="mt-sub">touche ~{compact(m.reach)} personnes</span>
          </button>
        ))}
      </div>
      <div className="mt-acts">
        <button
          type="button"
          className="mt-go mt-go-big"
          disabled={busy || total > cash}
          onClick={() => onAct({ type: 'release', songId: song.id, inWeeks: weeks, marketing: promo })}
        >
          Programmer · {money(total)}
        </button>
        <button type="button" className="mt-ghost" onClick={onClose}>
          Retour
        </button>
      </div>
      {total > cash && <span className="mt-toast">Pas assez de cash pour cette promo.</span>}
    </div>
  );
};

const SongTile = ({ song, onClick }: { song: SongView; onClick?: () => void }) => (
  <button type="button" className="mt-song" onClick={onClick} disabled={!onClick}>
    <span className="mt-song-art" style={{ '--hue': hueOf(song.id) } as CSSProperties} />
    <span className="mt-song-q">{song.quality}</span>
    <span className="mt-song-body">
      <b>{song.title}</b>
      <span className="mt-sub">{song.artistName}</span>
      {song.state === 'vault' && <span className="mt-sub">{song.readyInWeeks > 0 ? `Mixage : ${song.readyInWeeks} sem.` : 'Prêt à sortir'}</span>}
      {song.state === 'scheduled' && <span className="mt-sub">Sort dans {song.releaseInWeeks} sem.</span>}
      {song.state === 'released' && (
        <>
          <span className="mt-sub">
            {compact(song.streamsLast)} streams cette semaine · {hitWord(song.hitScore)}
          </span>
          <Stars score={song.hitScore} />
        </>
      )}
    </span>
  </button>
);

const Releases = ({ view, onAct, busy, onGo }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean; onGo: (tab: Tab) => void }) => {
  const [planning, setPlanning] = useState<string | null>(null);
  const song = view.songs.find((s) => s.id === planning && s.state === 'vault');
  const vault = view.songs.filter((s) => s.state === 'vault');
  const scheduled = view.songs.filter((s) => s.state === 'scheduled').sort((a, b) => (a.releaseInWeeks ?? 0) - (b.releaseInWeeks ?? 0));
  const released = view.songs.filter((s) => s.state === 'released').sort((a, b) => a.weeksOut - b.weeksOut);
  if (song) return <ReleasePlanner song={song} cash={view.label?.cash ?? 0} onAct={onAct} onClose={() => setPlanning(null)} busy={busy} />;
  return (
    <div className="mt-view mt-in">
      <section className="mt-section">
        <Label>Au coffre · choisis un son à sortir</Label>
        {vault.length === 0 ? (
          <button type="button" className="mt-empty" onClick={() => onGo('studio')}>
            Coffre vide. <b>Crée un son</b>
          </button>
        ) : (
          <div className="mt-songs">
            {vault.map((s) => (
              <SongTile key={s.id} song={s} onClick={() => setPlanning(s.id)} />
            ))}
          </div>
        )}
      </section>
      {scheduled.length > 0 && (
        <section className="mt-section">
          <Label>Programmées</Label>
          <div className="mt-songs">
            {scheduled.map((s) => (
              <SongTile key={s.id} song={s} />
            ))}
          </div>
        </section>
      )}
      {released.length > 0 && (
        <section className="mt-section">
          <Label>Sortis</Label>
          <div className="mt-songs">
            {released.map((s) => (
              <SongTile key={s.id} song={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

/* ---------------------------------- Market ---------------------------------- */

const Market = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const full = view.roster.length >= (view.label?.maxArtists ?? 0);
  const [only, setOnly] = useState(true);
  const shown = view.market.filter((a) => !only || a.blocked === null).slice(0, 24);
  const sign = (artist: MarketView) => onAct({ type: 'sign', artistId: artist.id, advance: artist.advance, royaltyRate: artist.royaltyRate });
  return (
    <div className="mt-view mt-in">
      <div className="mt-bar">
        <Label>{full ? 'Effectif complet : monte de palier pour signer plus' : `${(view.label?.maxArtists ?? 0) - view.roster.length} place(s) libre(s)`}</Label>
        <button type="button" className="mt-chipbtn" aria-pressed={only} onClick={() => setOnly(!only)}>
          Seulement les signables
        </button>
      </div>
      <div className="mt-deck">
        {shown.map((artist) => (
          <div key={artist.id} className="mt-offer">
            <ArtistCard artist={artist}>
              <span className="mt-card-sub">
                Pot. {artist.potentialMin}–{artist.potentialMax} · {compact(artist.fans)} fans
              </span>
            </ArtistCard>
            <button type="button" className="mt-go" disabled={busy || full || artist.blocked !== null} onClick={() => sign(artist)}>
              {artist.blocked ?? `Signer · ${money(artist.advance)}`}
            </button>
          </div>
        ))}
        {shown.length === 0 && <span className="mt-sub">Personne n’est signable pour l’instant. Reviens la semaine prochaine.</span>}
      </div>
    </div>
  );
};

/* ---------------------------------- Charts ---------------------------------- */

const Charts = ({ view }: { view: MelodyView }) => {
  const [chart, setChart] = useState<string>('global');
  const entries = (chart === 'global' ? view.charts.global : (view.charts.genres[chart] ?? [])).slice(0, 20);
  const mine = view.label?.id;
  const podium = view.ranking.slice(0, 5);
  return (
    <div className="mt-view mt-in">
      <section className="mt-section">
        <Label>Classement du serveur · saison {view.season}</Label>
        <div className="mt-podium">
          {podium.map((line, i) => (
            <div key={line.labelId} className={`mt-step${line.labelId === mine ? ' is-me' : ''}`} style={{ '--h': `${100 - i * 16}%` } as CSSProperties}>
              <span className="mt-step-name">{line.name}</span>
              <span className="mt-step-bar">
                <b>{i + 1}</b>
              </span>
            </div>
          ))}
        </div>
      </section>
      <section className="mt-section">
        <div className="mt-chips">
          <button type="button" className="mt-chipbtn" aria-pressed={chart === 'global'} onClick={() => setChart('global')}>
            Top global
          </button>
          {Object.keys(view.charts.genres)
            .filter((genre) => (view.charts.genres[genre]?.length ?? 0) > 0)
            .map((genre) => (
              <button key={genre} type="button" className="mt-chipbtn" aria-pressed={chart === genre} onClick={() => setChart(genre)}>
                {genreName(genre)}
              </button>
            ))}
        </div>
        <ol className="mt-chart">
          {entries.map((entry) => (
            <li key={`${entry.rank}-${entry.title}`} className={entry.labelId === mine ? 'is-me' : ''}>
              <span className="mt-rank">{entry.rank}</span>
              <span className="mt-chart-title">
                <b>{entry.title}</b>
                <span className="mt-sub">{entry.artistName}</span>
              </span>
              <span className="mt-mute">{compact(entry.streams)}</span>
            </li>
          ))}
          {entries.length === 0 && <li className="mt-sub">Le chart se remplit après la première semaine.</li>}
        </ol>
      </section>
    </div>
  );
};

/* ---------------------------------- Bank ---------------------------------- */

const Bank = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const label = view.label!;
  const room = Math.max(0, label.loanCap - label.debt);
  const [amount, setAmount] = useState(Math.min(5_000, room));
  const [weeks, setWeeks] = useState<8 | 16 | 24>(16);
  return (
    <div className="mt-view mt-in">
      <div className="mt-squad">
        <div className="mt-panel">
          <Label>Coffre-fort</Label>
          <div className="mt-gen mt-gt">{compact(label.cash)} €</div>
          <div className="mt-kv">
            <span className="mt-mute">Dettes</span>
            <b>{money(label.debt)}</b>
            <span className="mt-mute">Valeur du catalogue</span>
            <b>{money(label.catalogue)}</b>
          </div>
          {label.loans.length > 0 && (
            <ul className="mt-loans">
              {label.loans.map((loan, i) => (
                <li key={i}>
                  <b>{money(loan.remaining)}</b>
                  <span className="mt-sub">encore {loan.ticksLeft} semaines</span>
                </li>
              ))}
            </ul>
          )}
          {label.distress > 0 && <span className="mt-toast mt-warn">Attention : ton label est dans le rouge. Rembourse vite.</span>}
        </div>
        <div className="mt-panel">
          <Label>Emprunter</Label>
          {room < 1_000 ? (
            <span className="mt-sub">La banque ne te prête plus pour l’instant.</span>
          ) : (
            <>
              <div className="mt-big">{money(amount)}</div>
              <input
                type="range"
                min={1_000}
                max={room}
                step={1_000}
                value={amount}
                aria-label="Somme à emprunter"
                onChange={(event) => setAmount(Number(event.target.value))}
              />
              <div className="mt-chips">
                {([8, 16, 24] as const).map((w) => (
                  <button key={w} type="button" className="mt-chipbtn" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
                    {w} semaines
                  </button>
                ))}
              </div>
              <span className="mt-sub">Remboursé chaque semaine, avec des intérêts.</span>
              <button type="button" className="mt-go mt-go-big" disabled={busy} onClick={() => onAct({ type: 'loan', amount, weeks })}>
                Emprunter
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------------------------- Screen ---------------------------------- */

const Coin = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="none" stroke="#ff4fa3" strokeWidth="2" />
    <path d="M10.5 5.2A3.4 3.4 0 1 0 10.5 10.8M4 7h4.5M4 9h4.5" fill="none" stroke="#ff4fa3" strokeWidth="1.5" />
  </svg>
);
const Heart = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 14 2.2 8.4a3.4 3.4 0 0 1 5-4.6L8 4.6l.8-.8a3.4 3.4 0 0 1 5 4.6z" fill="#8b5cff" />
  </svg>
);
const Star = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1l2 4.6 5 .5-3.8 3.3 1.2 4.9L8 11.7 3.6 14.3l1.2-4.9L1 6.1l5-.5z" fill="#f2a630" />
  </svg>
);

export const MelodyScreen = ({ guildId, active }: { guildId: string; active: boolean }) => {
  const [state, setState] = useState<MelodyState | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [picked, setPicked] = useState<string | null>(null);
  const [studioArtist, setStudioArtist] = useState<string | null>(null);
  const [studioKey, setStudioKey] = useState(0);
  const now = useNow(1000);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const say = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4_000);
  }, []);

  const load = useCallback(async () => {
    const answer = await ask<MelodyState>(guildId, 'view');
    if (answer.ok) {
      setState(answer.data);
      setFailure(null);
    } else setFailure(answer.message);
  }, [guildId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // A new week has started on the server: fetch it a few seconds later.
  const nextTickAt = state?.nextTickAt ?? 0;
  useEffect(() => {
    if (!active || !nextTickAt) return;
    const timer = setTimeout(() => void load(), Math.max(3_000, nextTickAt - Date.now() + 3_000));
    return () => clearTimeout(timer);
  }, [active, nextTickAt, load]);

  const act = useCallback(
    async (action: MelodyAction): Promise<MelodyView | null> => {
      setBusy(true);
      const answer = await ask<MelodyState>(guildId, 'act', action);
      setBusy(false);
      if (!answer.ok) {
        say(answer.message, true);
        return null;
      }
      setState(answer.data);
      if (action.type === 'found') say('Ton label est né. Au boulot !');
      if (action.type === 'sign') say('Contrat signé. Bienvenue dans l’équipe !');
      if (action.type === 'release') say('Sortie programmée.');
      if (action.type === 'gig') say('Concert réservé : il se joue à la fin de la semaine.');
      if (action.type === 'loan') say('Prêt accordé.');
      return answer.data.view;
    },
    [guildId, say],
  );
  const run = (action: MelodyAction) => void act(action);

  const go = (next: Tab) => {
    if (next === 'studio' && tab !== 'studio') {
      setStudioArtist(null);
      setStudioKey((k) => k + 1);
    }
    setTab(next);
  };

  const view = state?.view;
  const top = useMemo(() => {
    if (!view?.label) return null;
    const label = view.label;
    return (
      <header className="mt-top">
        <div className="mt-crest" aria-hidden="true">
          {label.name[0]?.toUpperCase()}
        </div>
        <div className="mt-id">
          <b>{label.name}</b>
          <span className="mt-xp">
            {label.tierName}
            <i>
              <i style={{ width: `${Math.min(100, label.reputation)}%` }} />
            </i>
          </span>
        </div>
        <div className="mt-chip">
          <Coin />
          <div>
            <b>{money(label.cash)}</b>
            <small>Cash</small>
          </div>
        </div>
        <div className="mt-chip">
          <Heart />
          <div>
            <b>{compact(label.fans)}</b>
            <small>Fans</small>
          </div>
        </div>
        <div className="mt-chip">
          <Star />
          <div>
            <b>{Math.round(label.reputation)}</b>
            <small>Réputation</small>
          </div>
        </div>
      </header>
    );
  }, [view?.label]);

  if (!view) {
    return (
      <section className="mt mt-loading">
        {failure ? (
          <>
            <p>{failure}</p>
            <button type="button" className="mt-go" onClick={() => void load()}>
              Réessayer
            </button>
          </>
        ) : (
          <span className="mt-vinyl mt-vinyl-small" aria-label="Chargement" />
        )}
      </section>
    );
  }

  return (
    <section className="mt" aria-label="Melody Tycoon">
      {top}
      <div className="mt-clockbar">
        <span>
          Saison {view.season} · semaine {view.weekOfSeason}
        </span>
        <span>
          Semaine suivante dans <b>{countdown(nextTickAt - now)}</b>
        </span>
      </div>
      {!view.label ? (
        <FoundLabel view={view} onAct={run} busy={busy} />
      ) : (
        <>
          <nav className="mt-nav" aria-label="Onglets de Melody Tycoon">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.name}
              </button>
            ))}
          </nav>
          {tab === 'home' && <Home view={view} onGo={go} />}
          {tab === 'squad' && (
            <Squad
              view={view}
              picked={picked}
              onPick={setPicked}
              onAct={run}
              busy={busy}
              onGo={go}
              onStudio={(id) => {
                setStudioArtist(id);
                setStudioKey((k) => k + 1);
                setTab('studio');
              }}
            />
          )}
          {tab === 'studio' && (
            <Studio key={studioKey} guildId={guildId} view={view} artistId={studioArtist} onArtist={setStudioArtist} onAct={act} onGo={go} busy={busy} />
          )}
          {tab === 'releases' && <Releases view={view} onAct={run} busy={busy} onGo={go} />}
          {tab === 'market' && <Market view={view} onAct={run} busy={busy} />}
          {tab === 'charts' && <Charts view={view} />}
          {tab === 'bank' && <Bank view={view} onAct={run} busy={busy} />}
        </>
      )}
      {toast && (
        <div className={`mt-snack${toast.bad ? ' is-bad' : ''}`} role="status">
          {toast.text}
        </div>
      )}
    </section>
  );
};
