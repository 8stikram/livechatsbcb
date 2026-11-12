// Melody Tycoon, Nuit Néon look: few numbers, big buttons, cards. The world lives on the server,
// one per Discord server; this screen only shows it and sends the player's choices.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BEATS,
  CFG,
  GENRES,
  featChance,
  MARKETING,
  THEMES,
  hitWord,
  qualityWord,
  priceScale,
  type ArtistView,
  type FeatDealView,
  type OtherArtistView,
  type Clause,
  type Mood,
  type Offer,
  type GuestView,
  type MelodyAction,
  type MelodyView,
  type RosterView,
  type SessionEventView,
  type SessionView,
  type SongPreview,
  type SongView,
  type TutorialView,
  type NotebookEntry,
  type Trend,
  type YouthView,
  type MarketView,
  type LabelCard,
  type TransferView,
  type ClashView,
  type InterviewView,
  type RivalView,
  type Tone,
  PROJECTS,
  TOURS,
  projectCost,
  tourQuote,
  type ProjectKind,
  type ProjectView,
  type TourView,
} from '@livechatsbcb/melody';
import type { MelodyRoute } from '../../../../shared/ipc';
import { LibraryPicker, type Shelf } from '../LibraryPicker';
import { useClipboardShelf } from '../ClipboardShelf';
import { errorMessage } from '../messages';
import '@fontsource-variable/archivo/wdth.css';
import './melody.css';

type MelodyState = { view: MelodyView; nextTickAt: number };
type Answer<T> = { ok: true; data: T } | { ok: false; message: string };
type Levels = { theme: 1 | 2 | 3 | 4; beat: 1 | 2 | 3 | 4; producer: 1 | 2 | 3 | 4; studio: 1 | 2 | 3 | 4 };
type Tab = 'home' | 'squad' | 'studio' | 'releases' | 'academy' | 'market' | 'labels' | 'charts' | 'bank';

const TABS: Array<{ id: Tab; name: string }> = [
  { id: 'home', name: 'Accueil' },
  { id: 'squad', name: 'Effectif' },
  { id: 'studio', name: 'Studio' },
  { id: 'releases', name: 'Sorties' },
  { id: 'academy', name: 'Recrutement' },
  { id: 'market', name: 'Marché' },
  { id: 'labels', name: 'Label' },
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
  const ready = name.trim().length >= 2 && !busy;
  return (
    <div className="mt-found mt-in">
      <div className="mt-found-head">
        <Label>Saison {view.season} · semaine {view.weekOfSeason}</Label>
        <h2 className="mt-h">
          Fonde <span className="mt-gt">ton label</span>
        </h2>
        <p className="mt-sub">Juste un nom pour commencer. Ton premier artiste, tu iras le chercher dans ton centre de formation.</p>
      </div>
      <label className="mt-field">
        <Label>Nom du label</Label>
        <input
          value={name}
          maxLength={28}
          placeholder="Chimchar Records"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && ready) onAct({ type: 'found', name: name.trim() });
          }}
        />
      </label>
      <button type="button" className="mt-go mt-go-big" disabled={!ready} onClick={() => onAct({ type: 'found', name: name.trim() })}>
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
  const signable = view.market.filter((artist) => artist.blocked === null).length + (view.academy?.youths.length ?? 0);
  const tape = next ? `Prochaine sortie ▪▪ dans ${next.releaseInWeeks} semaine${next.releaseInWeeks === 1 ? '' : 's'} ▪▪ ` : 'Rien de programmé ▪▪ ';
  return (
    <div className="mt-view mt-in">
      <TrendBanner trend={view.trend} />
      <div className="mt-hub">
        <button type="button" className="mt-tile mt-t-create" data-tuto="hub-studio" onClick={() => onGo('studio')}>
          <span className="mt-vinyl" aria-hidden="true" />
          <Label>{view.roster.length === 0 ? 'Pas encore d’artiste' : rested === 0 ? 'Tes artistes sont fatigués' : `${rested} artiste${rested > 1 ? 's ont' : ' a'} de l’énergie`}</Label>
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
          <Label>{next ? `Prochaine sortie · attendu ${next.qualityMin} – ${next.qualityMax}` : vault > 0 ? `${vault} son${vault > 1 ? 's' : ''} au coffre` : 'Prochaine sortie'}</Label>
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

// Two clicks to sell: the first one says what it costs.
const SellButton = ({ name, price, busy, onSell }: { name: string; price: number; busy: boolean; onSell: () => void }) => {
  const [sure, setSure] = useState(false);
  return (
    <button type="button" className={`mt-ghost${sure ? ' mt-warn' : ''}`} disabled={busy} onBlur={() => setSure(false)} onClick={() => (sure ? onSell() : setSure(true))}>
      {sure ? `Sûr ? ${name} part pour ${money(price)}` : `Vendre · ${money(price)}`}
    </button>
  );
};

const Squad = ({
  view,
  picked,
  onPick,
  onAct,
  onStudio,
  onGo,
  onTalk,
  busy,
}: {
  view: MelodyView;
  picked: string | null;
  onPick: (id: string) => void;
  onAct: (action: MelodyAction) => void;
  onStudio: (artistId: string) => void;
  onGo: (tab: Tab) => void;
  onTalk: (artistId: string) => void;
  busy: boolean;
}) => {
  const artist = view.roster.find((a) => a.id === picked) ?? view.roster[0];
  const free = (view.label?.maxArtists ?? 0) - view.roster.length;
  // On the road this week: no studio, no single concert.
  const touring =
    !!artist &&
    view.tours.some(
      (t) =>
        (t.state === 'announced' || t.state === 'running') &&
        t.startsIn <= 1 &&
        (t.artistId === artist.id || t.openerId === artist.id || (t.partnerId === artist.id && t.partnerStatus !== 'refused')),
    );
  if (view.roster.length === 0) {
    return (
      <div className="mt-view mt-in">
        <button type="button" className="mt-empty" onClick={() => onGo('academy')}>
          Pas encore d’artiste. <b>Va au centre de formation</b>
        </button>
      </div>
    );
  }
  return (
    <div className="mt-view mt-in">
      <div className="mt-squad">
        <div className="mt-deck">
          {view.roster.map((a) => (
            <ArtistCard key={a.id} artist={a} energy={a.energy} pressed={a.id === artist?.id} onClick={() => onPick(a.id)} />
          ))}
          {free > 0 && (
            <button type="button" className="mt-card mt-card-add" onClick={() => onGo('academy')}>
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
              <span className="mt-pill" title="Avec des choix qui lui vont. Payer le studio enlève le risque de rater, pas plus.">
                Ses sons tournent autour de {artist.expectedNote}
              </span>
              <span className={`mt-pill${artist.weeksLeft <= 8 ? ' mt-pill-warn' : ''}`}>Contrat : {artist.weeksLeft} sem.</span>
              {artist.real && <span className="mt-pill">Vrai artiste</span>}
            </div>
            {artist.lastSong && (
              <div className="mt-lastsong">
                <Cover id={artist.lastSong.id} className="mt-lastsong-art" />
                <span>
                  <Label>Dernier son</Label>
                  <b>{artist.lastSong.title}</b>
                  <span className="mt-sub">
                    {artist.songsMade} son{artist.songsMade > 1 ? 's' : ''} avec le label
                  </span>
                </span>
              </div>
            )}
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
              <button type="button" className="mt-go" disabled={touring} onClick={() => onStudio(artist.id)}>
                {touring ? 'En tournée' : 'Créer un son'}
              </button>
              <button
                type="button"
                className="mt-ghost"
                disabled={busy || touring || artist.gigsBooked >= 3}
                onClick={() => onAct({ type: 'gig', artistId: artist.id })}
                title={`${artist.nextGig.venue} · ${fmt(artist.nextGig.audience)} personnes`}
              >
                {artist.gigsBooked >= 3
                  ? '3 concerts cette semaine'
                  : `Concert · ${artist.nextGig.profit >= 0 ? '+' : ''}${money(artist.nextGig.profit)}`}
              </button>
              {artist.renewBlocked === null && (
                <button type="button" className="mt-go" disabled={busy} onClick={() => onTalk(artist.id)}>
                  Renouveler le contrat
                </button>
              )}
              <SellButton key={artist.id} name={artist.name} price={artist.salePrice} busy={busy} onSell={() => onAct({ type: 'sell', artistId: artist.id })} />
              <ClauseControl key={`c${artist.id}`} artistId={artist.id} clause={artist.clause} onAct={onAct} busy={busy} />
            </div>
            {artist.gigsBooked > 0 && (
              <span className="mt-sub">
                {artist.gigsBooked} concert{artist.gigsBooked > 1 ? 's' : ''} prévu{artist.gigsBooked > 1 ? 's' : ''} cette semaine.
              </span>
            )}
            <TourBlock key={`t${artist.id}`} view={view} artist={artist} onAct={onAct} busy={busy} />
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------- Covers ---------------------------------- */

// Covers come from the server once, then stay here as pictures the page can show.
const coverUrls = new Map<string, string>();

const blobUrlOf = (data: string): string => {
  const [head = '', body = ''] = data.split(',');
  const type = head.slice(5, head.indexOf(';')) || 'image/jpeg';
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type }));
};

/** Keeps a cover the player just made, so it shows without asking the server. */
const rememberCover = (songId: string, data: string): void => {
  if (!coverUrls.has(songId)) coverUrls.set(songId, blobUrlOf(data));
};

const CoversContext = createContext<number>(0);

// Fetches the covers the screen needs, sixty at most per call; the number changes when new ones arrive.
const useCovers = (guildId: string, view: MelodyView | undefined): number => {
  const [version, setVersion] = useState(0);
  const asked = useRef(new Set<string>());
  const wanted = useMemo(() => {
    if (!view) return [];
    const ids = [
      ...view.songs.filter((s) => s.cover).map((s) => s.id),
      ...view.projects.filter((p) => p.cover).map((p) => p.id),
      ...view.roster.flatMap((a) => (a.lastSong?.cover ? [a.lastSong.id] : [])),
      ...view.charts.global.flatMap((e) => (e.cover && e.songId ? [e.songId] : [])),
      ...Object.values(view.charts.genres).flatMap((list) => list.flatMap((e) => (e.cover && e.songId ? [e.songId] : []))),
    ];
    return [...new Set(ids)].filter((id) => !coverUrls.has(id) && !asked.current.has(id)).slice(0, 60);
  }, [view]);
  useEffect(() => {
    if (wanted.length === 0) return;
    for (const id of wanted) asked.current.add(id);
    void ask<{ covers: Record<string, string> }>(guildId, 'covers', { ids: wanted }).then((answer) => {
      if (!answer.ok) return;
      for (const [id, data] of Object.entries(answer.data.covers)) rememberCover(id, data);
      setVersion((v) => v + 1);
    });
  }, [guildId, wanted]);
  return version;
};

// A song's cover, or a drawn one in the song's colours when there is none.
const Cover = ({ id, className = 'mt-song-art' }: { id: string; className?: string }) => {
  useContext(CoversContext);
  const url = coverUrls.get(id);
  return url ? <img className={`${className} mt-cover-img`} src={url} alt="" /> : <span className={className} style={{ '--hue': hueOf(id) } as CSSProperties} aria-hidden="true" />;
};

/** Crops any picture to a small square JPEG, light enough for the free server. */
const makeCover = (src: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 192;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas'));
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      let quality = 0.82;
      let out = canvas.toDataURL('image/jpeg', quality);
      while (out.length > 38_000 && quality > 0.4) {
        quality -= 0.1;
        out = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(out);
    };
    img.onerror = () => reject(new Error('image'));
    img.src = src;
  });

// Picks the cover like a LiveChat media: from the library, from the PC, a copied picture, or Ctrl+V.
const CoverPicker = ({ value, onChange }: { value: string | null; onChange: (data: string | null) => void }) => {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const clips = useClipboardShelf();
  const file = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (value ? blobUrlOf(value) : null), [value]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const take = useCallback(
    (src: string, revoke = false) => {
      setProblem(null);
      void makeCover(src)
        .then(onChange)
        .catch(() => setProblem('Cette image ne passe pas. Essaie une autre.'))
        .finally(() => revoke && URL.revokeObjectURL(src));
    },
    [onChange],
  );

  // Ctrl+V while the picker is open: the picture becomes the cover, not a LiveChat.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const image = [...(event.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!image) return;
      event.preventDefault();
      event.stopPropagation();
      take(URL.createObjectURL(image), true);
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [take]);

  return (
    <div className="mt-coverpick">
      <div className="mt-coverbox">{preview ? <img src={preview} alt="Cover du son" /> : <span className="mt-sub">Pas encore de cover</span>}</div>
      <div className="mt-col">
        <div className="mt-acts">
          <button type="button" className="mt-ghost" onClick={() => setShelf('image')}>
            Ma bibliothèque
          </button>
          <button type="button" className="mt-ghost" onClick={() => file.current?.click()}>
            Depuis le PC
          </button>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) take(URL.createObjectURL(picked), true);
              event.target.value = '';
            }}
          />
        </div>
        {clips.items.length > 0 && (
          <div className="mt-clips" aria-label="Images copiées">
            {clips.items.slice(0, 6).map((item) => (
              <button key={item.id} type="button" title="Prendre cette image" onClick={() => take(item.url)}>
                <img src={item.url} alt="" />
              </button>
            ))}
          </div>
        )}
        <span className="mt-sub">Ou colle une image avec Ctrl+V. Elle est recadrée en carré.</span>
        {problem && <span className="mt-toast">{problem}</span>}
      </div>
      {shelf &&
        createPortal(
          <LibraryPicker
            shelf={shelf}
            onShelf={(next) => setShelf(next === 'image' ? next : 'image')}
            onClose={() => setShelf(null)}
            onPick={(picked) => {
              setShelf(null);
              if (picked.kind === 'image') take(picked.url);
              else setProblem('Choisis une image.');
            }}
          />,
          document.body,
        )}
    </div>
  );
};

/* ---------------------------------- Trend and notebook ---------------------------------- */

const themeName = (id: string): string => THEMES.find((t) => t.id === id)?.name ?? id;
const beatName = (id: string): string => BEATS.find((b) => b.id === id)?.name ?? id;

// What the public wants this month, said like a rumour.
const TrendBanner = ({ trend }: { trend: Trend }) => (
  <div className="mt-trend" role="note">
    <span className="mt-trend-fire" aria-hidden="true" />
    <span>
      <b>Tendance du mois</b> · ça parle beaucoup de <b>{genreName(trend.genre)}</b> en ce moment. On entend partout des sons «&nbsp;{themeName(trend.themeId)}&nbsp;» et des prods{' '}
      {beatName(trend.beatId)}…
    </span>
    <span className="mt-sub">
      Encore {trend.weeksLeft} sem.
    </span>
  </div>
);

// The combos found by playing: secret ones only work during their season.
const Notebook = ({ entries, season, onClose }: { entries: NotebookEntry[]; season: number; onClose: () => void }) => (
  <div className="mt-panel mt-notebook mt-in">
    <div className="mt-ptop">
      <h2 className="mt-h">Carnet du label</h2>
      <button type="button" className="mt-ghost" onClick={onClose}>
        Fermer
      </button>
    </div>
    {entries.length === 0 ? (
      <span className="mt-sub">Vide pour l’instant. Quand un thème et un beat font des merveilles ensemble, la combo s’écrit ici à la sortie du son.</span>
    ) : (
      <ul className="mt-notes">
        {entries.map((entry) => (
          <li key={`${entry.kind}:${entry.themeId}:${entry.beatId}:${entry.season}`} className={entry.kind === 'secret' && entry.season !== season - 1 ? 'is-old' : ''}>
            <b>
              {themeName(entry.themeId)} + {beatName(entry.beatId)}
            </b>
            <span className="mt-sub">
              {entry.kind === 'secret' ? (entry.season === season - 1 ? 'Combo secret · cette saison' : `Combo secret · saison ${entry.season + 1}, finie`) : 'Combo parfait'} · trouvé avec «&nbsp;{entry.songTitle}&nbsp;»
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

/** True when this theme and beat are in the notebook and still work. */
const noted = (entries: NotebookEntry[], season: number, themeId: string | null, beatId: string): boolean =>
  themeId !== null && entries.some((e) => e.themeId === themeId && e.beatId === beatId && (e.kind === 'perfect' || e.season === season - 1));

/* ---------------------------------- Song page ---------------------------------- */

const SURPRISE_WORD = { boom: 'Bien mieux que prévu', flop: 'Moins bon que prévu' } as const;

// Everything about one song: cover, note, promo and its streams week by week.
const SongPage = ({ song, onClose }: { song: SongView; onClose: () => void }) => {
  const top = Math.max(1, ...song.history);
  return (
    <div className="mt-panel mt-songpage mt-in">
      <div className="mt-songhead">
        <Cover id={song.id} className="mt-songpage-art" />
        <div className="mt-col">
          <Label>
            {song.artistName}
            {song.featName ? ` feat. ${song.featName}` : ''}
          </Label>
          <h2 className="mt-h mt-h-xl">{song.title}</h2>
          <span className="mt-sub">
            {themeName(song.themeId)} · {beatName(song.beatId)}
          </span>
          <div className="mt-pills">
            {song.quality !== null ? (
              <span className="mt-pill">
                Note {song.quality} · {qualityWord(song.quality)}
              </span>
            ) : (
              <span className="mt-pill">
                Note attendue {song.qualityMin} – {song.qualityMax}
              </span>
            )}
            {song.surprise && <span className={`mt-pill${song.surprise === 'flop' ? ' mt-pill-warn' : ' mt-pill-hot'}`}>{SURPRISE_WORD[song.surprise]}</span>}
            {song.combo && <span className="mt-pill mt-pill-hot">{song.combo === 'secret' ? 'Combo secret' : 'Combo parfait'}</span>}
            {song.state === 'released' && <span className="mt-pill">{hitWord(song.hitScore)}</span>}
          </div>
        </div>
      </div>
      {song.state === 'released' && (
        <>
          <Label>Streams semaine par semaine</Label>
          <div className="mt-history" role="img" aria-label={`Streams : ${song.history.map(fmt).join(', ')}`}>
            {song.history.map((streams, i) => (
              <span key={i} style={{ height: `${Math.max(3, (streams / top) * 100)}%` } as CSSProperties} title={`Semaine ${i + 1} : ${fmt(streams)}`} />
            ))}
          </div>
          <div className="mt-kv">
            <span className="mt-mute">Total</span>
            <b>{fmt(song.streamsTotal)} streams</b>
            <span className="mt-mute">Cette semaine</span>
            <b>{fmt(song.streamsLast)} streams</b>
            <span className="mt-mute">Argent gagné</span>
            <b>{money(song.earned)}</b>
            <span className="mt-mute">Coût (studio + promo)</span>
            <b>{money(song.spent)}</b>
            <span className="mt-mute">Bénéfice</span>
            <b className={song.earned - song.spent < 0 ? 'mt-neg' : 'mt-pos'}>{money(song.earned - song.spent)}</b>
            <span className="mt-mute">Meilleur rang</span>
            <b>{song.peakGlobal ? `${song.peakGlobal}e au top global` : song.peakGenre ? `${song.peakGenre}e de son genre` : 'pas classé'}</b>
          </div>
        </>
      )}
      {song.promo.length > 0 && (
        <>
          <Label>Promo</Label>
          <ul className="mt-promo-out">
            {song.promo.map((p) => (
              <li key={p.name} className={p.viral ? 'is-viral' : ''}>
                <span>{p.name}</span>
                <b>
                  {fmt(p.views)} vues{p.viral ? ' · VIRAL !' : ''}
                </b>
              </li>
            ))}
          </ul>
        </>
      )}
      {song.state === 'scheduled' && song.promoNames.length > 0 && (
        <span className="mt-sub">Promo prévue : {song.promoNames.join(', ')}. Les vues dépendront du buzz de l’artiste le jour de la sortie.</span>
      )}
      <div className="mt-acts">
        <button type="button" className="mt-ghost" onClick={onClose}>
          Retour
        </button>
      </div>
    </div>
  );
};

/* ---------------------------------- Hit moment ---------------------------------- */

const SEEN_HITS = 'mt-hits-seen';
const seenHits = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_HITS) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

// A big moment when a song of the label blows up the week it comes out. Once per song.
const HitMoment = ({ view }: { view: MelodyView }) => {
  const [closed, setClosed] = useState<Set<string>>(seenHits);
  const hit = view.songs.find((s) => s.state === 'released' && s.weeksOut === 0 && (s.surprise === 'boom' || s.hitScore >= 70 || s.promo.some((p) => p.viral)) && !closed.has(s.id));
  if (!hit) return null;
  const close = () => {
    const next = new Set(closed).add(hit.id);
    setClosed(next);
    try {
      localStorage.setItem(SEEN_HITS, JSON.stringify([...next].slice(-100)));
    } catch {
      // Not remembered: it may show again next time.
    }
  };
  const viral = hit.promo.find((p) => p.viral);
  return createPortal(
    <div className="mt mt-hit" role="dialog" aria-label="Moment hit" onClick={close}>
      <div className="mt-hit-card">
        <div className="mt-hit-rays" aria-hidden="true" />
        <Cover id={hit.id} className="mt-hit-art" />
        <span className="mt-hit-word mt-gt">{hit.surprise === 'boom' ? 'ÇA A PÉTÉ !' : viral ? 'VIRAL !' : 'HIT !'}</span>
        <b className="mt-h">{hit.title}</b>
        <span className="mt-sub">
          {hit.artistName} · <CountUp to={hit.streamsLast} /> streams la première semaine
          {viral ? ` · ${viral.name} : ${compact(viral.views)} vues` : ''}
        </span>
        {hit.quality !== null && (
          <span className="mt-sub">
            Note {hit.quality}
            {hit.surprise === 'boom' ? ` (le studio annonçait ${hit.qualityMin} – ${hit.qualityMax})` : ''}
          </span>
        )}
        <button type="button" className="mt-go">
          Trop bien
        </button>
      </div>
    </div>,
    document.body,
  );
};

/* ---------------------------------- Studio ---------------------------------- */

const LEVELS: Array<{ key: keyof Levels; name: string; options: Array<{ name: string; price: (cfg: typeof CFG.quality, scale: number) => string; note: string }> }> = [
  {
    key: 'theme',
    name: 'Écriture',
    options: [
      { name: 'Écrit seul', price: () => 'Gratuit', note: 'Fait maison' },
      { name: 'Parolier', price: (q, s) => money(s * q.themePrice[1]!), note: 'Texte propre' },
      { name: 'Plume reconnue', price: (q, s) => money(s * q.themePrice[2]!), note: 'Des punchlines' },
      { name: 'Plume star', price: (q, s) => money(s * q.themePrice[3]!), note: 'Le meilleur texte' },
    ],
  },
  {
    key: 'beat',
    name: 'Beat',
    options: [
      { name: 'Type beat gratuit', price: () => 'Gratuit', note: 'Déjà entendu' },
      { name: 'Beat acheté', price: (q, s) => money(s * q.beatPrice[1]!), note: 'Correct' },
      { name: 'Beat exclusif', price: (q, s) => money(s * q.beatPrice[2]!), note: 'Rien que pour toi' },
      { name: 'Sur mesure', price: () => '½ producteur', note: 'Fait par ton producteur' },
    ],
  },
  {
    key: 'producer',
    name: 'Producteur',
    options: [
      { name: 'Toi-même', price: () => 'Gratuit', note: 'Ça dépanne' },
      { name: 'Producteur local', price: (q, s) => money(s * q.producerPrice[1]!), note: 'Solide' },
      { name: 'Producteur reconnu', price: (q, s) => money(s * q.producerPrice[2]!), note: 'Un vrai son' },
      { name: 'Star de la prod', price: (q, s) => money(s * q.producerPrice[3]!), note: 'Signature en or' },
    ],
  },
  {
    key: 'studio',
    name: 'Studio',
    options: [
      { name: 'Home studio', price: () => 'Gratuit', note: 'Dans la chambre' },
      { name: 'Studio de quartier', price: (q, s) => money(s * q.studioPrice[1]!), note: 'Pas de délai' },
      { name: 'Studio pro', price: (q, s) => money(s * q.studioPrice[2]!), note: '+1 semaine de mixage' },
      { name: 'Studio prestige', price: (q, s) => money(s * q.studioPrice[3]!), note: '+1 semaine de mixage' },
    ],
  },
];

// Where the words of the quality scale fall, in points out of 100.
const SCALE: Array<[number, string]> = [
  [55, 'Correct'],
  [65, 'Bon'],
  [85, 'Tube'],
];

const STEPS = ['Artiste', 'Thème', 'Beat', 'Équipe', 'Cabine', 'Featuring', 'Titre', 'Fini'];
const STAGE_NAMES: Record<string, string> = { theme: 'Après l’écriture', beat: 'Après le beat', producer: 'Avec le producteur', studio: 'Au studio', feat: 'Avec l’invité' };

const settled = (session: SessionView): boolean => session.events.every((e) => e.kind === 'fluid' || e.reaction !== null);

// One event card: a smooth session to enjoy, or an embrouille to answer.
const EventCard = ({ event, busy, onReact, onNext }: { event: SessionEventView; busy: boolean; onReact: (id: string) => void; onNext: () => void }) => (
  <div className={`mt-evt${event.kind === 'fluid' ? ' is-good' : ''}`}>
    <Label>{event.kind === 'fluid' ? `${STAGE_NAMES[event.stage]} · ça roule` : `Embrouille · ${STAGE_NAMES[event.stage]?.toLowerCase()}`}</Label>
    <h3>{event.title}</h3>
    {event.kind === 'clash' && <span className="mt-mute">{event.text}</span>}
    {event.kind === 'clash' && event.reaction === null && <span className="mt-sub">Tu ne sais pas ce que ça va donner : à toi de sentir le coup.</span>}
    {event.kind === 'clash' && event.reaction === null ? (
      <div className="mt-react">
        {event.reactions.map((reaction) => (
          <button key={reaction.id} type="button" disabled={busy} onClick={() => onReact(reaction.id)}>
            <span>{reaction.text}</span>
            {reaction.hint && <b>{reaction.hint}</b>}
          </button>
        ))}
      </div>
    ) : (
      <>
        <p className="mt-result">{event.result}</p>
        <button type="button" className="mt-go" onClick={onNext}>
          Continuer
        </button>
      </>
    )}
  </div>
);

// The featuring talks: pick a guest, set the offer, spin the wheel.
const Featuring = ({
  view,
  session,
  busy,
  onAct,
  onDone,
  onFreeze,
}: {
  view: MelodyView;
  session: SessionView;
  busy: boolean;
  onAct: (action: MelodyAction) => Promise<MelodyView | null>;
  onDone: () => void;
  // Holds the side panel as it was while the wheel turns, so it does not give the answer away.
  onFreeze: (shown: SessionView | null) => void;
}) => {
  const [picked, setPicked] = useState<GuestView | null>(null);
  const [won, setWon] = useState(false);
  const [share, setShare] = useState(100);
  const [angle, setAngle] = useState(180);
  const [spinning, setSpinning] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const guest = session.guests.find((g) => g.id === picked?.id) ?? picked;
  const offer = guest ? Math.round((guest.demand * share) / 100) : 0;
  const chance = guest ? featChance(offer, guest.demand, 0, view.label?.reputation ?? 0, guest.bonus) : null;
  const room = (view.label?.cash ?? 0) - session.baseCost - session.extraCost;
  const calm = () => document.documentElement.classList.contains('calm');

  const spin = async () => {
    if (!guest) return;
    setSaid(null);
    // Keeps the price he asks now: after a yes he leaves the list of guests.
    setPicked(guest);
    onFreeze(session);
    const next = await onAct({ type: 'feat', guestId: guest.id, offer });
    const last = next?.session?.lastOffer;
    if (!last) {
      onFreeze(null);
      return;
    }
    const tell = () => {
      if (last.outcome === 'accepted') {
        setSaid(`${last.guestName} accepte !`);
        setWon(true);
      }
      else if (last.outcome === 'vexed') setSaid(last.roll === null ? `${last.guestName} est vexé : il ne veut plus te parler pendant un mois.` : `Refusé, et ${last.guestName} est vexé.`);
      else setSaid('Refusé. Sa demande monte de 10 %.');
      setSpinning(false);
      onFreeze(null);
    };
    if (last.roll === null) {
      tell();
      return;
    }
    setSpinning(true);
    setAngle((current) => current - (current % 360) + 180 + 360 * 4 + last.roll! * 360);
    setTimeout(tell, calm() ? 0 : 2_600);
  };

  if (!guest) {
    return (
      <>
        <Label>Étape 6 · un invité sur le son ?</Label>
        {said && <p className="mt-result">{said}</p>}
        <div className="mt-deck">
          {session.guests.map((g) => (
            <div key={g.id} className="mt-offer">
              <ArtistCard
                artist={{ id: g.id, name: g.name, real: g.real, genre: g.genre as ArtistView['genre'], gen: g.gen, potentialMin: 0, potentialMax: 0, fans: g.fans, hype: 0, value: 0 }}
                onClick={() => {
                  if (g.blocked || busy) return;
                  if (g.dealId) {
                    void onAct({ type: 'feat_deal', dealId: g.dealId }).then((next) => next && onDone());
                    return;
                  }
                  setPicked(g);
                  setShare(100);
                  setSaid(null);
                }}
              >
                <span className={`mt-card-sub${g.dealId ? ' mt-dealtag' : ''}`}>
                  {g.blocked ?? (g.dealId ? `Accord avec ${g.labelName} · déjà payé · +2 qualité` : `Demande ${money(g.demand)}`)}
                </span>
              </ArtistCard>
            </div>
          ))}
          {session.guests.length === 0 && <span className="mt-sub">Personne n’est dans ton budget pour l’instant.</span>}
        </div>
        <button
          type="button"
          className="mt-ghost"
          disabled={busy}
          onClick={() => void onAct({ type: 'feat_skip' }).then((next) => next && onDone())}
        >
          Pas de featuring
        </button>
      </>
    );
  }

  const vexing = chance === null;
  const tooDear = !won && offer > room;
  return (
    <>
      <Label>Étape 6 · négociation</Label>
      <div className="mt-band mt-feat">
        <div className="mt-col">
          <h3 className="mt-h">
            {guest.name} <span className="mt-gt">demande {money(guest.demand)}</span>
          </h3>
          <span className="mt-mute">
            {genreName(guest.genre)} · {compact(guest.fans)} fans. Un bon invité monte la note et ramène ses fans.
          </span>
          {guest.gap >= 2 && (
            <span className="mt-sub">
              Cher parce qu’il est <b>{guest.gap} fois plus connu</b> que ton artiste. Plus ton artiste a de fans, plus le prix baisse.
            </span>
          )}
          <label className="mt-lbl" htmlFor="mt-offer">
            Ton offre
          </label>
          <input id="mt-offer" type="range" min={30} max={150} step={5} value={share} disabled={spinning || busy} onChange={(event) => setShare(Number(event.target.value))} />
          <div className="mt-kv">
            <span className="mt-mute">Tu proposes</span>
            <b>{money(offer)}</b>
            <span className="mt-mute">Chance qu’il accepte</span>
            <b>{vexing ? 'Il sera vexé' : `${Math.round(chance * 100)} %`}</b>
          </div>
          {won && !spinning ? (
            <button type="button" className="mt-go mt-go-big" onClick={onDone}>
              Continuer
            </button>
          ) : (
          <div className="mt-acts">
            <button type="button" className="mt-go" disabled={spinning || busy || tooDear} onClick={() => void spin()}>
              {vexing ? 'Proposer quand même' : 'Lancer la roue'}
            </button>
            <button
              type="button"
              className="mt-ghost"
              disabled={spinning || busy}
              onClick={() => {
                setPicked(null);
                setSaid(null);
              }}
            >
              Autre invité
            </button>
          </div>
          )}
          <p className="mt-toast" role="status">
            {said ?? (tooDear ? 'Pas assez de cash pour cette offre.' : vexing ? 'Moins de 40 % de sa demande : il le prendra très mal.' : '')}
          </p>
        </div>
        <div className="mt-wheel" style={{ background: `conic-gradient(var(--mt-ok) 0 ${Math.round((chance ?? 0) * 100)}%, var(--mt-panel2) 0 100%)` }}>
          <span className="mt-needle" style={{ rotate: `${angle}deg`, transition: spinning ? 'rotate 2.5s cubic-bezier(.15,.7,.1,1)' : 'none' }} />
          <span className="mt-pct">{vexing ? '✕' : `${Math.round((chance ?? 0) * 100)} %`}</span>
        </div>
      </div>
    </>
  );
};

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
  const session = view.session;
  // Coming back to a session: replay its cards from the start, unless everything is settled.
  const startStep = session ? (settled(session) && session.featDone ? 6 : 4) : artistId ? 1 : 0;
  const [step, setStep] = useState(startStep);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [beatId, setBeatId] = useState<string | null>(null);
  const [levels, setLevels] = useState<Levels>({ theme: 1, beat: 1, producer: 1, studio: 1 });
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState<string | null>(null);
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [preview, setPreview] = useState<SongPreview | null>(null);
  const [made, setMade] = useState<SongView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // How many events of the session the player has already gone through.
  const [seen, setSeen] = useState(0);
  const [featOpen, setFeatOpen] = useState(!session?.featDone);
  const [frozen, setFrozen] = useState<SessionView | null>(null);
  const chosenArtist = session?.artistId ?? artistId;
  const artist = view.roster.find((a) => a.id === chosenArtist) ?? null;

  useEffect(() => {
    if (artistId && step === 0) setStep(1);
  }, [artistId, step]);

  useEffect(() => {
    if (!artistId || !themeId || !beatId || step !== 3) return;
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
    setCover(null);
    setPreview(null);
    setMade(null);
    setProblem(null);
    setSeen(0);
  };

  const enter = async () => {
    if (!artistId || !themeId || !beatId) return;
    const next = await onAct({ type: 'studio', artistId, themeId, beatId, levels });
    if (next?.session) {
      setSeen(0);
      setFeatOpen(true);
      setStep(4);
    }
  };

  const leave = async () => {
    const next = await onAct({ type: 'studio_cancel' });
    if (next && !next.session) restart();
  };

  const record = async () => {
    const before = new Set(view.songs.map((song) => song.id));
    if (!cover) return;
    const next = await onAct({ type: 'song', title: title.trim(), cover });
    const song = next?.songs.find((s) => !before.has(s.id));
    if (song) {
      rememberCover(song.id, cover);
      setMade(song);
      setStep(7);
    }
  };

  const cash = view.label?.cash ?? 0;
  const cap = Math.min(cash, view.label?.songBudgetCap ?? 0);
  const theme = THEMES.find((t) => t.id === (session?.themeId ?? themeId));
  const beat = BEATS.find((b) => b.id === (session?.beatId ?? beatId));

  let stage: ReactNode = null;
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
        <span className="mt-sub">Cette semaine, le studio propose ces thèmes à {artist?.name ?? 'ton artiste'}. ★ = colle à son style.</span>
        <div className="mt-opts">
          {(artist?.offers.themes ?? []).map((offer) => (
            <button
              key={offer.id}
              type="button"
              className="mt-opt mt-opt-small"
              aria-pressed={themeId === offer.id}
              onClick={() => {
                setThemeId(offer.id);
                setStep(2);
              }}
            >
              {offer.star && <span className="mt-hot mt-hot-ok">★ Son style</span>}
              <b>{themeName(offer.id)}</b>
            </button>
          ))}
        </div>
      </>
    );
  } else if (step === 2) {
    stage = (
      <>
        <Label>Étape 3 · sur quelle prod ?</Label>
        <span className="mt-sub">Un beat loin de son style, c’est un pari : ça peut faire un flop… ou un tube.</span>
        <div className="mt-opts">
          {(artist?.offers.beats ?? []).map((offer) => {
            const b = BEATS.find((x) => x.id === offer.id);
            if (!b) return null;
            return (
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
                  {offer.star && <span className="mt-hot mt-hot-ok">★ Son style</span>}
                  {noted(view.notebook, view.season, themeId, b.id) && <span className="mt-hot">Carnet ✓</span>}
                </span>
                <b>{b.name}</b>
                <span className="mt-sub">{b.genres.map(genreName).join(' · ')}</span>
              </button>
            );
          })}
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
                    <span className="mt-price">{option.price(CFG.quality, priceScale(view.label?.tier))}</span>
                    <span className="mt-sub">{option.note}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {/* Always in sight at the bottom, with why it is grey when it is. */}
        <div className="mt-sticky-go">
          <button
            type="button"
            className="mt-go mt-go-big"
            disabled={busy || !preview || preview.cost > cap || (artist?.energy ?? 0) < (preview?.energy ?? 0)}
            onClick={() => void enter()}
          >
            Entrer en cabine · {preview ? money(preview.cost) : '…'}
          </button>
          <span className="mt-sub">
            {!preview
              ? 'Calcul du prix…'
              : preview.cost > cap
                ? 'Trop cher pour le budget de ton palier : baisse un choix.'
                : (artist?.energy ?? 0) < preview.energy
                  ? `${artist?.name ?? 'Ton artiste'} n’a pas assez d’énergie : prends des choix moins lourds ou attends la semaine prochaine.`
                  : 'Moins tu paies, plus il y a d’embrouilles en studio.'}
          </span>
        </div>
      </>
    );
  } else if (step === 4 && session) {
    const event = session.events[Math.min(seen, session.events.length - 1)];
    const done = seen >= session.events.length;
    stage = (
      <>
        <div className="mt-pips" aria-label={`Événement ${Math.min(seen + 1, session.events.length)} sur ${session.events.length}`}>
          {session.events.map((e, i) => (
            <i key={i} className={i < seen ? (e.kind === 'fluid' ? 'good' : 'bad') : i === seen ? 'now' : ''} />
          ))}
        </div>
        {!done && event ? (
          <EventCard
            key={seen}
            event={event}
            busy={busy}
            onReact={(reactionId) => void onAct({ type: 'react', reactionId })}
            onNext={() => {
              const next = seen + 1;
              setSeen(next);
              if (next >= session.events.length) setStep(5);
            }}
          />
        ) : null}
      </>
    );
  } else if (step === 5 && session) {
    // The guest may ask for more once in the booth: that embrouille comes after the wheel.
    const late = session.events[seen];
    stage = featOpen ? (
      <Featuring view={view} session={session} busy={busy} onAct={onAct} onDone={() => setFeatOpen(false)} onFreeze={setFrozen} />
    ) : late ? (
      <EventCard key={seen} event={late} busy={busy} onReact={(reactionId) => void onAct({ type: 'react', reactionId })} onNext={() => setSeen(seen + 1)} />
    ) : (
      <>
        <p className="mt-result">{session.feat ? `${session.feat.name} pose sur le son pour ${money(session.feat.fee)}.` : 'Pas de featuring sur ce son.'}</p>
        <button type="button" className="mt-go" onClick={() => setStep(6)}>
          Continuer
        </button>
      </>
    );
  } else if (step === 6 && session) {
    stage = (
      <>
        <Label>Étape 7 · le titre et la cover</Label>
        <label className="mt-field">
          <Label>Titre du son</Label>
          <input value={title} maxLength={40} placeholder="Rue Glacée" autoFocus onChange={(event) => setTitle(event.target.value)} />
        </label>
        <CoverPicker value={cover} onChange={setCover} />
        <p className="mt-sub">
          {session.artistName}
          {session.feat ? ` feat. ${session.feat.name}` : ''} · {theme?.name} · {beat?.name}. La vraie note tombera à la sortie du son.
        </p>
        <div className="mt-acts">
          <button type="button" className="mt-go mt-go-big" disabled={busy || title.trim().length === 0 || !cover} onClick={() => void record()}>
            Enregistrer · {money(session.baseCost + session.extraCost)}
          </button>
          {(title.trim().length === 0 || !cover) && <span className="mt-sub">{title.trim().length === 0 ? 'Donne un titre au son.' : 'Choisis une cover.'}</span>}
        </div>
      </>
    );
  } else if (step === 7 && made) {
    stage = (
      <div className="mt-reveal">
        <Cover id={made.id} className="mt-reveal-art" />
        <Label>Le studio annonce</Label>
        <div className="mt-reveal-n mt-gt">
          {made.qualityMin} – {made.qualityMax}
        </div>
        <div className="mt-reveal-w">
          {qualityWord(made.qualityMin)} à {qualityWord(made.qualityMax).toLowerCase()}
        </div>
        <span className="mt-sub">La vraie note tombera à la sortie : en général dans cette fourchette… mais parfois un son pète, ou déçoit.</span>
        <span className="mt-sub">« {made.title} » part au coffre{made.readyInWeeks > 0 ? `, prêt dans ${made.readyInWeeks} semaine${made.readyInWeeks > 1 ? 's' : ''}` : ''}.</span>
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

  const shown = frozen ?? session;
  const inBooth = shown !== null && step >= 4 && step <= 6;
  const low = inBooth ? shown.qualityMin : (preview?.qualityMin ?? 0);
  const high = inBooth ? shown.qualityMax : (preview?.qualityMax ?? 0);
  const showRange = inBooth || (preview !== null && step === 3);
  const spent = inBooth ? shown.baseCost + shown.extraCost : preview && step === 3 ? preview.cost : 0;
  const energy = inBooth ? shown.energy : (preview?.energy ?? 0);
  return (
    <div className="mt-view mt-in">
      {step <= 3 && (
        <div className="mt-studiobar">
          <TrendBanner trend={view.trend} />
          <button type="button" className="mt-ghost" onClick={() => setNotebookOpen(!notebookOpen)}>
            Carnet ({view.notebook.length})
          </button>
        </div>
      )}
      {notebookOpen && step <= 3 && <Notebook entries={view.notebook} season={view.season} onClose={() => setNotebookOpen(false)} />}
      <div className="mt-steps">
        {STEPS.map((name, i) => (
          <button
            key={name}
            type="button"
            className={i < step ? 'done' : i === step ? 'now' : ''}
            disabled={i >= step || step >= 4 || (i > 0 && !artistId)}
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
            <div className="mt-big mt-gt">{made && step === 7 ? `${made.qualityMin} – ${made.qualityMax}` : showRange ? `${low} – ${high}` : '—'}</div>
            <div className="mt-range">
              {showRange && step !== 7 && <i style={{ left: `${low}%`, width: `${Math.max(2, high - low)}%` }} />}
              {made && step === 7 && <i style={{ left: `${made.qualityMin}%`, width: `${Math.max(2, made.qualityMax - made.qualityMin)}%` }} />}
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
              {money(spent)} <span className="mt-mute">/ {money(cap)}</span>
            </div>
            <Meter value={cap > 0 ? (spent / cap) * 100 : 0} />
            <div className="mt-kv">
              <span className="mt-mute">Artiste</span>
              <b>{artist?.name ?? '—'}</b>
              <span className="mt-mute">Thème</span>
              <b>{theme?.name ?? '—'}</b>
              <span className="mt-mute">Beat</span>
              <b>{beat?.name ?? '—'}</b>
              {inBooth && (
                <>
                  <span className="mt-mute">Featuring</span>
                  <b>{shown.feat?.name ?? '—'}</b>
                </>
              )}
              <span className="mt-mute">Énergie</span>
              <b>{energy > 0 ? `−${energy} sur ${artist?.energy ?? 0}` : artist ? `${artist.energy} dispo` : '—'}</b>
              <span className="mt-mute">Délai</span>
              <b>
                {(() => {
                  const weeks = inBooth ? shown.delayWeeks : (preview?.delayWeeks ?? 0);
                  return weeks > 0 ? `+${weeks} semaine${weeks > 1 ? 's' : ''}` : 'aucun';
                })()}
              </b>
            </div>
          </div>
          {inBooth && (
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => void leave()}>
              Quitter la cabine
            </button>
          )}
          <p className="mt-toast" role="status">
            {problem ??
              (step === 3 && preview && preview.cost > cap
                ? cap < cash
                  ? 'Trop cher pour ton palier de label.'
                  : 'Pas assez de cash pour cette équipe.'
                : step === 3 && preview && artist && artist.energy < preview.energy
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
  const why = (w: number): string | null => song.blockedWeeks[w - 1] ?? null;
  const [weeks, setWeeks] = useState(() => [1, 2, 3, 4, 6, 8].find((w) => w >= soonest && !why(w)) ?? soonest);
  const [promo, setPromo] = useState<string[]>(['posts']);
  const total = promo.reduce((sum, id) => sum + (MARKETING.find((m) => m.id === id)?.cost ?? 0), 0);
  const toggle = (id: string) => setPromo(promo.includes(id) ? promo.filter((p) => p !== id) : [...promo, id]);
  return (
    <div className="mt-panel mt-in">
      <div className="mt-ptop">
        <Cover id={song.id} className="mt-planner-art" />
        <div>
          <Label>{song.artistName}</Label>
          <h2 className="mt-h">{song.title}</h2>
          <span className="mt-sub">
            Note attendue {song.qualityMin} – {song.qualityMax}
          </span>
        </div>
      </div>
      <Label>Sortie dans</Label>
      <div className="mt-chips">
        {[1, 2, 3, 4, 6, 8]
          .filter((w) => w >= soonest)
          .map((w) => (
            <button key={w} type="button" className="mt-chipbtn" aria-pressed={weeks === w} disabled={why(w) !== null} title={why(w) ?? undefined} onClick={() => setWeeks(w)}>
              {w} sem.
            </button>
          ))}
      </div>
      {why(weeks) && <span className="mt-toast">{why(weeks)}</span>}
      <span className="mt-sub">Un son par artiste et trois par label chaque semaine.</span>
      <Label>Promo</Label>
      <span className="mt-sub">Les vues dépendent du buzz de l’artiste (ses fans, sa hype). Tu les découvriras à la sortie. Parfois, une vidéo devient virale.</span>
      <div className="mt-promo">
        {MARKETING.map((m) => (
          <button key={m.id} type="button" className="mt-opt mt-opt-promo" aria-pressed={promo.includes(m.id)} onClick={() => toggle(m.id)}>
            <b>{m.name}</b>
            <span className="mt-price">{m.cost ? money(m.cost) : 'Gratuit'}</span>
            <span className="mt-sub">{m.note}</span>
          </button>
        ))}
      </div>
      <div className="mt-acts">
        <button
          type="button"
          className="mt-go mt-go-big"
          data-tuto="release-go"
          disabled={busy || total > cash || why(weeks) !== null}
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
    <Cover id={song.id} />
    <span className={`mt-song-q${song.quality === null ? ' is-hidden' : ''}`} title={song.quality === null ? `Attendu : ${song.qualityMin} – ${song.qualityMax}` : undefined}>
      {song.quality ?? '?'}
    </span>
    <span className="mt-song-body">
      <b>{song.title}</b>
      <span className="mt-sub">{song.artistName}</span>
      {song.state === 'vault' && <span className="mt-sub">{song.readyInWeeks > 0 ? `Mixage : ${song.readyInWeeks} sem.` : 'Prêt à sortir'}</span>}
      {song.state === 'scheduled' && <span className="mt-sub">Sort dans {song.releaseInWeeks} sem.</span>}
      {song.state === 'released' && (
        <>
          <span className="mt-sub">
            {compact(song.streamsTotal)} streams · {money(song.earned)}
          </span>
          <Stars score={song.hitScore} />
          {song.surprise && <span className={`mt-hot${song.surprise === 'boom' ? ' mt-hot-ok' : ''}`}>{SURPRISE_WORD[song.surprise]}</span>}
        </>
      )}
    </span>
  </button>
);

type SongSort = 'recent' | 'streams' | 'money';
const SONG_SORTS: Record<SongSort, { name: string; by: (a: SongView, b: SongView) => number }> = {
  recent: { name: 'Plus récents', by: (a, b) => (b.releasedTick ?? 0) - (a.releasedTick ?? 0) },
  streams: { name: 'Plus de streams', by: (a, b) => b.streamsTotal - a.streamsTotal },
  money: { name: 'Plus d’argent', by: (a, b) => b.earned - b.spent - (a.earned - a.spent) },
};
const PAY_PER_STREAM = CFG.release.payPerStream;

const Releases = ({ view, onAct, busy, onGo }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean; onGo: (tab: Tab) => void }) => {
  const [planning, setPlanning] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [sort, setSort] = useState<SongSort>('recent');
  const [only, setOnly] = useState('');
  const [making, setMaking] = useState(false);
  const [deluxeOf, setDeluxeOf] = useState<string | null>(null);
  const song = view.songs.find((s) => s.id === planning && s.state === 'vault');
  const page = view.songs.find((s) => s.id === opened);
  if (page) return <SongPage song={page} onClose={() => setOpened(null)} />;
  if (making) return <ProjectMaker view={view} onAct={onAct} onClose={() => setMaking(false)} busy={busy} />;
  const deluxe = view.projects.find((p) => p.id === deluxeOf);
  if (deluxe) return <DeluxeMaker view={view} project={deluxe} onAct={onAct} onClose={() => setDeluxeOf(null)} busy={busy} />;
  const vault = view.songs.filter((s) => s.state === 'vault');
  const scheduled = view.songs.filter((s) => s.state === 'scheduled').sort((a, b) => (a.releaseInWeeks ?? 0) - (b.releaseInWeeks ?? 0));
  const out = view.songs.filter((s) => s.state === 'released');
  const artists = [...new Map(out.map((s) => [s.artistId, s.artistName])).entries()];
  const released = out.filter((s) => !only || s.artistId === only).sort(SONG_SORTS[sort].by);
  const weekStreams = out.reduce((sum, s) => sum + s.streamsLast, 0);
  const best = out.reduce<SongView | null>((top, s) => (!top || s.streamsLast > top.streamsLast ? s : top), null);
  const peak = Math.max(1, ...view.labelWeeks);
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
          <div className="mt-songs" data-tuto="vault">
            {vault.map((s) => (
              <SongTile key={s.id} song={s} onClick={() => setPlanning(s.id)} />
            ))}
          </div>
        )}
      </section>
      <section className="mt-section">
        <div className="mt-bar">
          <Label>Projets · EP et albums</Label>
          <button type="button" className="mt-ghost" disabled={busy || view.roster.length === 0} onClick={() => setMaking(true)}>
            Monter un projet
          </button>
        </div>
        {view.projects.length === 0 ? (
          <span className="mt-sub">Rassemble 3 à 6 sons pour un EP, 8 à 16 pour un album. Ils sortent la même semaine, avec plus de streams.</span>
        ) : (
          <div className="mt-projects">
            {view.projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDeluxe={() => setDeluxeOf(p.id)} />
            ))}
          </div>
        )}
      </section>
      {scheduled.length > 0 && (
        <section className="mt-section">
          <Label>Programmées</Label>
          <div className="mt-songs">
            {scheduled.map((s) => (
              <SongTile key={s.id} song={s} onClick={() => setOpened(s.id)} />
            ))}
          </div>
        </section>
      )}
      {released.length > 0 && (
        <section className="mt-section">
          <Label>Bilan de la semaine</Label>
          <div className="mt-weekly">
            <div className="mt-weekly-nums">
              <span>
                <b>{compact(weekStreams)}</b>
                <span className="mt-mute">streams cette semaine</span>
              </span>
              <span>
                <b>{money(Math.round(weekStreams * PAY_PER_STREAM))}</b>
                <span className="mt-mute">gagnés cette semaine</span>
              </span>
              {best && (
                <span>
                  <b>{best.title}</b>
                  <span className="mt-mute">meilleur son · {compact(best.streamsLast)} streams</span>
                </span>
              )}
            </div>
            <div className="mt-history mt-weekly-curve" role="img" aria-label={`Streams du label sur douze semaines : ${view.labelWeeks.map(fmt).join(', ')}`}>
              {view.labelWeeks.map((streams, i) => (
                <span key={i} style={{ height: `${Math.max(3, (streams / peak) * 100)}%` } as CSSProperties} title={`${fmt(streams)} streams`} />
              ))}
            </div>
          </div>
          <Label>Sortis</Label>
          <div className="mt-chips">
            {(Object.keys(SONG_SORTS) as SongSort[]).map((key) => (
              <button key={key} type="button" className="mt-chipbtn" aria-pressed={sort === key} onClick={() => setSort(key)}>
                {SONG_SORTS[key].name}
              </button>
            ))}
            {artists.length > 1 && (
              <select className="mt-select" aria-label="Artiste" value={only} onChange={(event) => setOnly(event.target.value)}>
                <option value="">Tous les artistes</option>
                {artists.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="mt-songs">
            {released.map((s) => (
              <SongTile key={s.id} song={s} onClick={() => setOpened(s.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

/* ---------------------------------- Projets (EP, album, deluxe) ---------------------------------- */

const KIND_NAME: Record<ProjectKind, string> = { ep: 'EP', album: 'Album' };

// One song to tick in a project.
const TrackPick = ({ song, on, onToggle }: { song: SongView; on: boolean; onToggle: () => void }) => (
  <label className={`mt-track${on ? ' is-on' : ''}`}>
    <input type="checkbox" checked={on} onChange={onToggle} />
    <Cover id={song.id} className="mt-song-art mt-track-art" />
    <span>
      <b>{song.title}</b>
      <span className="mt-sub">
        {song.state === 'released' ? `Déjà sorti · ${compact(song.streamsTotal)} streams` : song.readyInWeeks > 0 ? `Prêt dans ${song.readyInWeeks} sem.` : 'Inédit, au coffre'}
      </span>
    </span>
  </label>
);

const ProjectMaker = ({ view, onAct, onClose, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; onClose: () => void; busy: boolean }) => {
  const candidates = (artistId: string) =>
    view.songs.filter((s) => s.artistId === artistId && s.projectId === null && !s.diss && (s.state === 'vault' || s.state === 'released'));
  const firstArtist = view.roster.find((a) => candidates(a.id).some((s) => s.state === 'vault'))?.id ?? view.roster[0]?.id ?? '';
  const [artistId, setArtistId] = useState(firstArtist);
  const [kind, setKind] = useState<ProjectKind>('ep');
  const [title, setTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [weeks, setWeeks] = useState(2);
  const [cover, setCover] = useState<string | null>(null);
  const songs = candidates(artistId);
  const rules = PROJECTS[kind];
  const singles = picked.filter((id) => songs.find((s) => s.id === id)?.state === 'released').length;
  const cost = projectCost(kind, view.label?.tier ?? 1);
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const problem =
    picked.length < rules.min || picked.length > rules.max
      ? `Un ${rules.name} a ${rules.min} à ${rules.max} sons (tu en as ${picked.length}).`
      : singles > PROJECTS.maxSingles
        ? `Au plus ${PROJECTS.maxSingles} sons déjà sortis.`
        : singles === picked.length
          ? 'Il faut au moins un son inédit.'
          : title.trim().length === 0
            ? 'Donne un titre.'
            : cost > (view.label?.cash ?? 0)
              ? 'Pas assez de cash.'
              : null;
  return (
    <div className="mt-panel mt-in mt-maker">
      <Label>Nouveau projet</Label>
      <div className="mt-acts">
        <select
          className="mt-select"
          aria-label="Artiste"
          value={artistId}
          onChange={(event) => {
            setArtistId(event.target.value);
            setPicked([]);
          }}
        >
          {view.roster.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {(['ep', 'album'] as const).map((k) => (
          <button key={k} type="button" className="mt-chipbtn" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {PROJECTS[k].name} · {PROJECTS[k].min} à {PROJECTS[k].max} sons · +{Math.round((PROJECTS[k].boost - 1) * 100)} % de streams
          </button>
        ))}
      </div>
      <input className="mt-input" placeholder="Titre du projet" maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} />
      <Label>
        Sons · {picked.length} choisi{picked.length > 1 ? 's' : ''}
      </Label>
      {songs.length === 0 ? (
        <span className="mt-sub">Pas de son libre pour cet artiste. Passe au studio.</span>
      ) : (
        <div className="mt-tracks">
          {songs.map((s) => (
            <TrackPick key={s.id} song={s} on={picked.includes(s.id)} onToggle={() => toggle(s.id)} />
          ))}
        </div>
      )}
      <span className="mt-sub">Jusqu’à {PROJECTS.maxSingles} sons déjà sortis peuvent servir de singles annonce.</span>
      <Label>Sortie</Label>
      <div className="mt-chips">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
          <button key={w} type="button" className="mt-chipbtn" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
            {w === 1 ? 'Semaine prochaine' : `Dans ${w} sem.`}
          </button>
        ))}
      </div>
      <Label>Pochette</Label>
      <CoverPicker value={cover} onChange={setCover} />
      <span className="mt-sub">Mix, master et pressage : {money(cost)}.</span>
      {problem && <span className="mt-sub mt-warn">{problem}</span>}
      <div className="mt-acts">
        <button
          type="button"
          className="mt-go"
          disabled={busy || problem !== null}
          onClick={() => {
            onAct({ type: 'project', artistId, kind, title: title.trim(), songIds: picked, inWeeks: weeks, cover: cover ?? undefined });
            onClose();
          }}
        >
          Programmer le {rules.name}
        </button>
        <button type="button" className="mt-ghost" onClick={onClose}>
          Retour
        </button>
      </div>
    </div>
  );
};

const DeluxeMaker = ({ view, project, onAct, onClose, busy }: { view: MelodyView; project: ProjectView; onAct: (action: MelodyAction) => void; onClose: () => void; busy: boolean }) => {
  const [picked, setPicked] = useState<string[]>([]);
  const songs = view.songs.filter((s) => s.artistId === project.artistId && s.state === 'vault' && s.projectId === null && !s.diss);
  const cost = projectCost('deluxe', view.label?.tier ?? 1);
  const ok = picked.length >= PROJECTS.deluxe.min && picked.length <= PROJECTS.deluxe.max && cost <= (view.label?.cash ?? 0);
  return (
    <div className="mt-panel mt-in mt-maker">
      <Label>Deluxe de « {project.title} »</Label>
      <span className="mt-sub">
        Ajoute {PROJECTS.deluxe.min} à {PROJECTS.deluxe.max} sons inédits. Ils sortent la semaine prochaine et l’album repart comme en deuxième semaine. Coût : {money(cost)}.
      </span>
      {songs.length === 0 ? (
        <span className="mt-sub">Pas de son inédit pour {project.artistName}. Passe au studio.</span>
      ) : (
        <div className="mt-tracks">
          {songs.map((s) => (
            <TrackPick key={s.id} song={s} on={picked.includes(s.id)} onToggle={() => setPicked((l) => (l.includes(s.id) ? l.filter((x) => x !== s.id) : [...l, s.id]))} />
          ))}
        </div>
      )}
      <div className="mt-acts">
        <button
          type="button"
          className="mt-go"
          disabled={busy || !ok}
          onClick={() => {
            onAct({ type: 'deluxe', projectId: project.id, songIds: picked });
            onClose();
          }}
        >
          Sortir la deluxe
        </button>
        <button type="button" className="mt-ghost" onClick={onClose}>
          Retour
        </button>
      </div>
    </div>
  );
};

const ProjectCard = ({ project, onDeluxe }: { project: ProjectView; onDeluxe: () => void }) => (
  <div className="mt-project">
    <Cover id={project.id} className="mt-song-art mt-project-art" />
    <div className="mt-project-text">
      <Label>
        {KIND_NAME[project.kind]} · {project.artistName}
      </Label>
      <b>{project.title}</b>
      <span className="mt-sub">
        {project.state === 'scheduled'
          ? `Sort dans ${project.weeksLeft} semaine${project.weeksLeft > 1 ? 's' : ''} · ${project.tracks.length} sons`
          : `${project.tracks.length} sons · note ${project.quality} · ${compact(project.streamsTotal)} streams`}
      </span>
      {project.canDeluxe && (
        <button type="button" className="mt-ghost" onClick={onDeluxe}>
          Ajouter une deluxe
        </button>
      )}
    </div>
  </div>
);

/* ---------------------------------- Tournées ---------------------------------- */

const MOOD_ICON: Record<'good' | 'bad' | 'fun', string> = { good: '▲', bad: '▼', fun: '◆' };

const TourCard = ({ tour, onAct, busy }: { tour: TourView; onAct: (action: MelodyAction) => void; busy: boolean }) => (
  <div className={`mt-tour is-${tour.state}`}>
    <div className="mt-bar">
      <Label>
        {tour.state === 'announced' ? `Tournée annoncée · départ dans ${tour.startsIn} sem.` : tour.state === 'running' ? `En tournée · ${tour.played} / ${tour.dates} dates` : tour.state === 'done' ? 'Tournée finie' : 'Tournée annulée'}
      </Label>
      {tour.mine && tour.state === 'announced' && (
        <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'tour_cancel', tourId: tour.id })}>
          Annuler
        </button>
      )}
    </div>
    <span className="mt-sub">
      {tour.partnerName && <>Avec {tour.partnerName}{tour.partnerStatus === 'pending' ? ' (en attente de réponse)' : tour.partnerStatus === 'refused' ? ' (a dit non)' : ''} · </>}
      {tour.openerName && <>Première partie : {tour.openerName} · </>}
      {tour.merch ? 'Merch en vente' : 'Sans merch'}
    </span>
    {tour.played > 0 && (
      <div className="mt-pills">
        <span className="mt-pill">{compact(tour.totals.audience)} personnes</span>
        <span className="mt-pill">+{compact(tour.totals.fans)} fans</span>
        <span className="mt-pill">{money(tour.totals.money)}</span>
        {tour.merch && <span className="mt-pill">merch {money(tour.totals.merch)}</span>}
      </div>
    )}
    <ul className="mt-tourlog">
      {[...tour.log].reverse().map((line, i) => (
        <li key={i} className={`is-${line.mood}`}>
          <span aria-hidden="true">{MOOD_ICON[line.mood]}</span> {line.text}
        </li>
      ))}
    </ul>
  </div>
);

const TourPlanner = ({ view, artist, onAct, onClose, busy }: { view: MelodyView; artist: RosterView; onAct: (action: MelodyAction) => void; onClose: () => void; busy: boolean }) => {
  const [dates, setDates] = useState(6);
  const [partnerId, setPartnerId] = useState('');
  const [openerId, setOpenerId] = useState('');
  const [merch, setMerch] = useState(true);
  const others = view.roster.filter((a) => a.id !== artist.id);
  const partner = others.find((a) => a.id === partnerId) ?? view.tourGuests.find((g) => g.id === partnerId);
  const quote = tourQuote(artist.fans, artist.hype, dates, merch, partner?.fans ?? 0, view.tourGuests.some((g) => g.id === partnerId));
  const cost = quote.setup + quote.merchCost;
  return (
    <div className="mt-tourplan">
      <Label>Tournée de {artist.name}</Label>
      <div className="mt-big">
        {dates} dates <span className="mt-mute">· {Math.ceil(dates / TOURS.datesPerWeek)} semaines</span>
      </div>
      <input type="range" min={TOURS.minDates} max={TOURS.maxDates} value={dates} aria-label="Nombre de dates" onChange={(event) => setDates(Number(event.target.value))} />
      <div className="mt-acts">
        <select className="mt-select" aria-label="Tournée commune" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
          <option value="">Seul en tête d’affiche</option>
          {others.length > 0 && (
            <optgroup label="Mes artistes">
              {others.map((a) => (
                <option key={a.id} value={a.id} disabled={a.id === openerId}>
                  Avec {a.name}
                </option>
              ))}
            </optgroup>
          )}
          {view.tourGuests.length > 0 && (
            <optgroup label="Artistes de mes amis (ils doivent accepter)">
              {view.tourGuests.map((g) => (
                <option key={g.id} value={g.id}>
                  Avec {g.name} · {g.labelName}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <select className="mt-select" aria-label="Première partie" value={openerId} onChange={(event) => setOpenerId(event.target.value)}>
          <option value="">Pas de première partie</option>
          {others.map((a) => (
            <option key={a.id} value={a.id} disabled={a.id === partnerId}>
              Première partie : {a.name}
            </option>
          ))}
        </select>
        <label className="mt-check">
          <input type="checkbox" checked={merch} onChange={(event) => setMerch(event.target.checked)} />
          Merch
        </label>
      </div>
      <span className="mt-sub">
        Salles : {quote.venue} · ~{fmt(quote.audiencePerDate)} personnes par date. Montage {money(quote.setup)}
        {merch ? ` + stock de merch ${money(quote.merchCost)}` : ''}. Gain estimé : {quote.expected >= 0 ? '+' : ''}
        {money(quote.expected)}, hors surprises.
      </span>
      <span className="mt-sub">Départ dans {TOURS.notice} semaines. Pendant la tournée : pas de studio ni de concert seul, mais du buzz chaque semaine.</span>
      <div className="mt-acts">
        <button
          type="button"
          className="mt-go"
          disabled={busy || cost > (view.label?.cash ?? 0) || artist.energy < TOURS.minEnergy}
          onClick={() => {
            onAct({ type: 'tour', artistId: artist.id, dates, partnerId: partnerId || null, openerId: openerId || null, merch });
            onClose();
          }}
        >
          Annoncer · {money(cost)}
        </button>
        <button type="button" className="mt-ghost" onClick={onClose}>
          Retour
        </button>
      </div>
      {artist.energy < TOURS.minEnergy && <span className="mt-sub mt-warn">Il lui faut au moins {TOURS.minEnergy} d’énergie.</span>}
    </div>
  );
};

// The tour block of one artist in the squad: his tour, or the button to plan one.
const TourBlock = ({ view, artist, onAct, busy }: { view: MelodyView; artist: RosterView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [planning, setPlanning] = useState(false);
  const tour = view.tours.find((t) => (t.state === 'announced' || t.state === 'running') && (t.artistId === artist.id || t.openerId === artist.id || (t.partnerId === artist.id && t.partnerStatus !== 'refused')));
  const last = view.tours.find((t) => t.artistId === artist.id && t.mine);
  if (tour) return <TourCard tour={tour} onAct={onAct} busy={busy} />;
  if (planning) return <TourPlanner view={view} artist={artist} onAct={onAct} onClose={() => setPlanning(false)} busy={busy} />;
  return (
    <>
      {last && <TourCard tour={last} onAct={onAct} busy={busy} />}
      <div className="mt-acts">
        <button type="button" className="mt-ghost" disabled={busy} onClick={() => setPlanning(true)}>
          Organiser une tournée
        </button>
      </div>
    </>
  );
};

// A friend invites one of my artists on his tour.
const TourInvite = ({ tour, onAct, busy }: { tour: TourView; onAct: (action: MelodyAction) => void; busy: boolean }) => (
  <div className="mt-deal is-turn">
    <span className="mt-art mt-deal-art" data-i={initials(tour.artistName)} style={{ '--hue': hueOf(tour.artistId) } as CSSProperties} aria-hidden="true" />
    <div className="mt-deal-text">
      <Label>Tournée commune</Label>
      <b>
        {tour.artistName} invite {tour.partnerName}
      </b>
      <span className="mt-sub">
        {tour.dates} dates, départ dans {tour.startsIn} sem. Ton label touche la moitié de l’argent. {tour.partnerName} ne pourra pas aller au studio pendant.
      </span>
    </div>
    <div className="mt-acts mt-deal-acts">
      <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'tour_answer', tourId: tour.id, accept: true })}>
        Accepter
      </button>
      <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'tour_answer', tourId: tour.id, accept: false })}>
        Refuser
      </button>
    </div>
  </div>
);

/* ---------------------------------- Talks ---------------------------------- */

const MONTHS = [6, 12, 18, 24, 36] as const;
const MOOD_LABEL: Record<Mood, string> = {
  deal: 'Marché conclu',
  counter: 'Contre-offre',
  dry: 'Pas content',
  cold: 'Vexé',
  lock: 'Point bloquant',
  vexed: 'Il s’en va',
  tired: 'Plus de patience',
};
const CLAUSE_NAME: Record<Clause, string> = { advance: 'Avance', royaltyRate: 'Royalties', months: 'Durée', weeklyAllowance: 'Salaire / sem.' };
const clauseText = (clause: Clause, value: number): string =>
  clause === 'advance' || clause === 'weeklyAllowance' ? money(value) : clause === 'royaltyRate' ? `${Math.round(value * 100)} %` : `${value} mois`;

// One clause of the contract: a big value and two buttons, with what the agent asked back.
const ClauseCard = ({
  clause,
  value,
  want,
  lock,
  onStep,
  children,
}: {
  clause: Clause;
  value: number;
  want: number | null;
  lock: number | null;
  onStep?: (dir: -1 | 1) => void;
  children?: ReactNode;
}) => (
  <div className={`mt-clause${lock !== null ? ' is-lock' : ''}`}>
    <Label>{CLAUSE_NAME[clause]}</Label>
    {onStep ? (
      <div className="mt-stepper">
        <button type="button" aria-label={`Baisser : ${CLAUSE_NAME[clause]}`} onClick={() => onStep(-1)}>
          −
        </button>
        <b>{clauseText(clause, value)}</b>
        <button type="button" aria-label={`Monter : ${CLAUSE_NAME[clause]}`} onClick={() => onStep(1)}>
          +
        </button>
      </div>
    ) : (
      children
    )}
    <span className="mt-clause-foot">
      {lock !== null && (
        <span className="mt-lockb">
          Bloquant : {clause === 'months' ? 'max' : 'min'} {clauseText(clause, lock)}
        </span>
      )}
      {want !== null && Math.abs(want - value) > 1e-9 && <span className="mt-want">Il veut {clauseText(clause, want)}</span>}
    </span>
  </div>
);

// The negotiation table: the agent's bubble and patience on the left, the four clauses on the right.
const Negotiation = ({
  view,
  artistId,
  onAct,
  onClose,
  busy,
}: {
  view: MelodyView;
  artistId: string;
  onAct: (action: MelodyAction) => Promise<MelodyView | null>;
  onClose: (signed: boolean) => void;
  busy: boolean;
}) => {
  const talk = view.talks.find((t) => t.artistId === artistId) ?? null;
  const news = talk ? null : (view.talkNews.find((n) => n.artistId === artistId) ?? null);
  // An artist bought from another player is in neither list until he signs.
  const other = view.others.find((a) => a.id === artistId);
  const artist: ArtistView | undefined =
    view.market.find((a) => a.id === artistId) ??
    view.roster.find((a) => a.id === artistId) ??
    (other ? { id: other.id, name: other.name, real: other.real, genre: other.genre, gen: other.gen, potentialMin: 0, potentialMax: 0, fans: other.fans, hype: 0, value: other.value } : undefined);
  const hint = talk?.hint ?? { advance: 0, royaltyRate: 0.2, months: 18, weeklyAllowance: 0 };
  const [offer, setOffer] = useState<Offer>(() => ({
    advance: Math.round((hint.advance * 0.9) / 100) * 100,
    royaltyRate: hint.royaltyRate,
    months: 18,
    weeklyAllowance: 0,
  }));
  const [answers, setAnswers] = useState(0);
  const step = Math.max(100, Math.round((hint.advance * 0.05) / 100) * 100);
  const cash = view.label?.cash ?? 0;
  const set = (patch: Partial<Offer>) => setOffer((o) => ({ ...o, ...patch }));

  const send = async (sent: Offer) => {
    const next = await onAct({ type: 'offer', artistId, offer: sent });
    if (next) {
      setOffer(sent);
      setAnswers((k) => k + 1);
    }
  };

  if (!artist) return null;
  const mood: Mood | null = talk?.last?.mood ?? news?.mood ?? null;
  const text =
    talk?.last?.text ?? news?.text ?? (talk?.renewal ? 'On écoute. Qu’est-ce que tu proposes pour la suite ?' : 'Mon artiste écoute. Fais ton offre.');
  const counter = talk?.counter ?? null;
  const lock = talk?.lock ?? null;
  const lockOf = (clause: Clause): number | null => (lock?.clause === clause ? lock.value : null);

  return (
    <div className="mt-view mt-in">
      <div className="mt-talk">
        <div className="mt-talk-side">
          <ArtistCard artist={artist} />
          <div className={`mt-bubble is-${mood ?? 'idle'}`} key={answers}>
            <Label>{mood ? MOOD_LABEL[mood] : 'Son agent'}</Label>
            <p>{text}</p>
          </div>
          {talk && (
            <div className="mt-patience">
              <Label>Patience</Label>
              <span className="mt-hearts" role="img" aria-label={`Patience ${Math.max(0, talk.patience)} sur ${talk.maxPatience}`}>
                {Array.from({ length: talk.maxPatience }, (_, i) => (
                  <i key={i} className={i < talk.patience ? 'lit' : ''} />
                ))}
              </span>
              <span className="mt-sub">
                Tour {talk.rounds + 1} sur {talk.maxRounds}
              </span>
            </div>
          )}
        </div>

        {talk ? (
          <div className="mt-panel mt-table">
            <div>
              <Label>{talk.renewal ? 'Renouvellement' : 'Contrat'}</Label>
              <h2 className="mt-h">{artist.name}</h2>
            </div>
            <span className="mt-sub">
              Prix affiché : {money(hint.advance)} d’avance · {Math.round(hint.royaltyRate * 100)} % de royalties. Son vrai prix est caché.
            </span>
            <div className="mt-clauses">
              <ClauseCard
                clause="advance"
                value={offer.advance}
                want={counter?.advance ?? null}
                lock={lockOf('advance')}
                onStep={(dir) => set({ advance: Math.max(0, offer.advance + dir * step) })}
              />
              <ClauseCard
                clause="royaltyRate"
                value={offer.royaltyRate}
                want={counter?.royaltyRate ?? null}
                lock={lockOf('royaltyRate')}
                onStep={(dir) => set({ royaltyRate: Math.min(0.5, Math.max(0.05, Math.round((offer.royaltyRate + dir * 0.01) * 100) / 100)) })}
              />
              <ClauseCard clause="months" value={offer.months} want={counter?.months ?? null} lock={lockOf('months')}>
                <div className="mt-monthpick" role="group" aria-label="Durée du contrat en mois">
                  {MONTHS.map((m) => (
                    <button key={m} type="button" aria-pressed={offer.months === m} onClick={() => set({ months: m })}>
                      {m}
                    </button>
                  ))}
                </div>
              </ClauseCard>
              <ClauseCard
                clause="weeklyAllowance"
                value={offer.weeklyAllowance}
                want={counter?.weeklyAllowance ?? null}
                lock={lockOf('weeklyAllowance')}
                onStep={(dir) => set({ weeklyAllowance: Math.max(0, offer.weeklyAllowance + dir * 50) })}
              />
            </div>
            <span className="mt-sub">
              À payer tout de suite : <b>{money(offer.advance + (talk?.transferFee ?? 0))}</b>
              {(talk?.transferFee ?? 0) > 0 && <> (dont {money(talk!.transferFee)} de transfert)</>}
              {offer.weeklyAllowance > 0 && <> · puis {money(offer.weeklyAllowance)} chaque semaine</>}
              {offer.advance + (talk?.transferFee ?? 0) > cash && <b className="mt-badtext"> · pas assez de cash</b>}
            </span>
            <div className="mt-acts">
              <button type="button" className="mt-go mt-go-big" data-tuto="offer" disabled={busy || offer.advance > cash} onClick={() => void send(offer)}>
                Faire l’offre
              </button>
              {counter && (
                <button type="button" className="mt-go" data-tuto="accept" disabled={busy || counter.advance > cash} onClick={() => void send(counter)}>
                  Accepter sa contre-offre
                </button>
              )}
              <button
                type="button"
                className="mt-ghost"
                disabled={busy}
                onClick={() => {
                  void onAct({ type: 'talk_leave', artistId });
                  onClose(false);
                }}
              >
                Quitter la table
              </button>
            </div>
          </div>
        ) : (
          <div className={`mt-panel mt-table mt-end is-${news?.mood ?? 'tired'}`}>
            <h2 className="mt-h">{news?.mood === 'deal' ? 'Signé !' : 'Fin de la discussion'}</h2>
            <p className="mt-result">
              {news?.mood === 'deal'
                ? `${artist.name} est dans ton label.`
                : news && news.closedFor > 0
                  ? `${artist.name} ne te parlera plus pendant ${news.closedFor} semaine${news.closedFor > 1 ? 's' : ''}.${view.roster.some((a) => a.id === artistId) ? ' Il partira à la fin de son contrat.' : ''}`
                  : 'La table est vide.'}
            </p>
            <button type="button" className="mt-go mt-go-big" data-tuto="talk-done" onClick={() => onClose(news?.mood === 'deal')}>
              {news?.mood === 'deal' ? 'Voir mon effectif' : 'Retour'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------- Tutorial ---------------------------------- */

type GuideLine = { text: ReactNode; target: string | null; next?: string };

// What the guide says, and which button it lights up, for the step and the screen the player is on.
const guideLine = (tutorial: TutorialView, tab: Tab, talk: MelodyView['talks'][number] | null, talking: boolean, tour: number): GuideLine => {
  switch (tutorial.step) {
    case 'home':
      return [
        { text: 'Bienvenue dans ton label ! Ici, ton cash. Pendant le tutoriel, tout ce que tu dépenses t’est rendu.', target: 'cash', next: 'Suivant' },
        { text: 'Le cœur du jeu : créer des sons avec tes artistes.', target: 'hub-studio', next: 'Suivant' },
        { text: 'L’onglet Label : les autres labels du serveur, le classement et les featurings. On commence ?', target: 'nav-labels', next: 'C’est parti' },
      ][Math.min(tour, 2)]!;
    case 'academy':
      if (tab === 'academy')
        return {
          text: 'Voici tes trois jeunes. Leur note est une fourchette : plus tu les gardes, mieux tu les connais. Tu peux en renommer un, puis clique sur « Faire signer » : il devient ton premier artiste.',
          target: 'promote',
        };
      return { text: 'Tu n’as pas encore d’artiste. Ton centre de formation a trois jeunes : va dans Recrutement.', target: 'nav-academy' };
    case 'song':
      if (tab !== 'studio') return { text: 'Crée ton premier son. Direction le Studio !', target: 'nav-studio' };
      return {
        text: 'Choisis un artiste, un thème et un beat (★ = colle à son style), puis ton équipe. Une embrouille va arriver : pas de panique. Au featuring, la roue dira oui au deuxième essai. À la fin : un titre et une cover.',
        target: null,
      };
    case 'release':
      if (tab !== 'releases') return { text: 'Ton son est au coffre. Va dans Sorties pour le programmer.', target: 'nav-releases' };
      return { text: 'Clique sur ton son, choisis la semaine et un peu de promo, puis Programmer.', target: 'release-go,vault' };
    case 'results': {
      const p = tutorial.preview;
      return {
        text: p ? (
          <>
            Aperçu : « {p.title} » de {p.artistName} sort dans {p.inWeeks} semaine{p.inWeeks > 1 ? 's' : ''}. Première semaine : environ{' '}
            <b>{fmt(p.streams)} streams</b>, <b>+{fmt(p.newFans)} fans</b> et <b>{money(p.money)}</b>. Le tutoriel t’a offert {money(tutorial.gift)}. À toi de jouer !
          </>
        ) : (
          'Ton label est lancé. À toi de jouer !'
        ),
        target: null,
        next: 'Terminer',
      };
    }
    default:
      return { text: '', target: null };
  }
};

// The guide: a ring around the button to press, the rest dimmed but still usable, and a bubble.
const Guide = ({
  tutorial,
  tab,
  talkWith,
  view,
  onAct,
  busy,
}: {
  tutorial: TutorialView;
  tab: Tab;
  talkWith: string | null;
  view: MelodyView;
  onAct: (action: MelodyAction) => Promise<MelodyView | null>;
  busy: boolean;
}) => {
  const [tour, setTour] = useState(0);
  const [ring, setRing] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const talk = talkWith ? (view.talks.find((t) => t.artistId === talkWith) ?? null) : null;
  const line = guideLine(tutorial, tab, talk, talkWith !== null, tour);
  const target = line.target;

  // Follows the target while the screen changes under it.
  useEffect(() => {
    const place = () => {
      // The first name found wins: "release-go,vault" lights the button once the planner is open.
      const node = target ? target.split(",").map((t) => document.querySelector(`.mt [data-tuto="${t}"]`)).find(Boolean) : null;
      const root = node?.closest('.mt');
      if (!node || !root) return setRing(null);
      const a = node.getBoundingClientRect();
      const b = root.getBoundingClientRect();
      setRing((old) => {
        const next = { x: a.left - b.left - 6, y: a.top - b.top - 6, w: a.width + 12, h: a.height + 12 };
        return old && old.x === next.x && old.y === next.y && old.w === next.w && old.h === next.h ? old : next;
      });
    };
    place();
    const timer = setInterval(place, 250);
    return () => clearInterval(timer);
  }, [target]);

  const next = () => {
    if (tutorial.step === 'home' && tour < 2) setTour(tour + 1);
    else void onAct({ type: 'tuto', move: 'next' });
  };

  return (
    <>
      {ring && <div className="mt-spot" style={{ left: ring.x, top: ring.y, width: ring.w, height: ring.h }} aria-hidden="true" />}
      <aside className="mt-guide" aria-live="polite" key={`${tutorial.step}:${tour}:${target ?? ''}`}>
        <Label>Tutoriel</Label>
        <p>{line.text}</p>
        <div className="mt-acts">
          {line.next && (
            <button type="button" className="mt-go" disabled={busy} onClick={next}>
              {line.next}
            </button>
          )}
          {tutorial.step !== 'results' && (
            <button type="button" className="mt-skip" disabled={busy} onClick={() => void onAct({ type: 'tuto', move: 'skip' })}>
              Passer le tutoriel
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

/* ---------------------------------- Featuring between players ---------------------------------- */

// A price with − / + buttons, steps of 10 % of where it started.
const FeeStepper = ({ value, start, onChange, label }: { value: number; start: number; onChange: (fee: number) => void; label: string }) => {
  const step = Math.max(50, Math.round((start * 0.1) / 50) * 50);
  return (
    <div className="mt-stepper mt-fee">
      <button type="button" aria-label={`Baisser : ${label}`} onClick={() => onChange(Math.max(step, value - step))}>
        −
      </button>
      <b>{money(value)}</b>
      <button type="button" aria-label={`Monter : ${label}`} onClick={() => onChange(value + step)}>
        +
      </button>
    </div>
  );
};

const DEAL_STATUS: Record<FeatDealView['status'], string> = {
  pending: 'En attente',
  accepted: 'Accepté',
  refused: 'Refusé',
  expired: 'Expiré',
  used: 'Utilisé',
  cancelled: 'Annulé',
};

// One request, sent or received, with the buttons of whoever must answer.
const DealRow = ({ deal, onAct, busy }: { deal: FeatDealView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [countering, setCountering] = useState(false);
  const [fee, setFee] = useState(deal.fee);
  const sent = deal.direction === 'sent';
  const who = sent ? `${deal.guestName} (${deal.otherLabel})` : `${deal.otherLabel} veut ${deal.guestName}`;
  const weeks = `${deal.weeksLeft} sem.`;
  const line =
    deal.status === 'pending'
      ? deal.myTurn
        ? sent
          ? `Contre-offre : ${money(deal.fee)}. Réponds sous ${weeks}`
          : `Propose ${money(deal.fee)}. Réponds sous ${weeks}`
        : `${money(deal.fee)} · en attente de réponse (${weeks})`
      : deal.status === 'accepted'
        ? sent
          ? `Accord à ${money(deal.fee)} : utilisable au studio pendant ${weeks}`
          : `Accepté : ${money(deal.fee)} encaissés`
        : `${DEAL_STATUS[deal.status]} · ${money(deal.fee)}`;
  return (
    <div className={`mt-deal is-${deal.status}${deal.myTurn ? ' is-turn' : ''}`}>
      <span className="mt-art mt-deal-art" data-i={initials(deal.guestName)} style={{ '--hue': hueOf(deal.guestId) } as CSSProperties} aria-hidden="true" />
      <div className="mt-deal-text">
        <Label>{sent ? 'Demande envoyée' : 'Demande reçue'}</Label>
        <b>{who}</b>
        <span className="mt-sub">{line}</span>
      </div>
      <div className="mt-acts mt-deal-acts">
        {deal.myTurn && !countering && (
          <>
            <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'feat_answer', dealId: deal.id, answer: 'accept' })}>
              {sent ? `Payer ${money(deal.fee)}` : 'Accepter'}
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => setCountering(true)}>
              Autre prix
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'feat_answer', dealId: deal.id, answer: 'refuse' })}>
              {sent ? 'Laisser tomber' : 'Refuser'}
            </button>
          </>
        )}
        {deal.myTurn && countering && (
          <>
            <FeeStepper value={fee} start={deal.fee} onChange={setFee} label="ton prix" />
            <button
              type="button"
              className="mt-go"
              disabled={busy || fee === deal.fee}
              onClick={() => {
                onAct({ type: 'feat_answer', dealId: deal.id, answer: 'counter', fee });
                setCountering(false);
              }}
            >
              Envoyer
            </button>
            <button type="button" className="mt-ghost" onClick={() => setCountering(false)}>
              Retour
            </button>
          </>
        )}
        {sent && deal.status === 'pending' && !deal.myTurn && (
          <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'feat_cancel', dealId: deal.id })}>
            Annuler
          </button>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------- Transfers between players ---------------------------------- */

// A typed amount in euros: transfers have a free price, even 1 €.
const MoneyInput = ({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) => (
  <label className="mt-money">
    <input
      className="mt-input"
      type="number"
      inputMode="numeric"
      min={1}
      step={100}
      value={value || ''}
      aria-label={label}
      onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))}
    />
    <span aria-hidden="true">€</span>
  </label>
);

const TRANSFER_STATUS: Record<TransferView['status'], string> = {
  pending: 'En attente',
  agreed: 'Accord des labels',
  done: 'Transfert fait',
  refused: 'Refusé',
  expired: 'Expiré',
  cancelled: 'Annulé',
};

// One transfer offer, sent or received, with the buttons of whoever must answer.
const TransferRow = ({ deal, onAct, onTalk, busy }: { deal: TransferView; onAct: (action: MelodyAction) => void; onTalk: (artistId: string) => void; busy: boolean }) => {
  const [countering, setCountering] = useState(false);
  const [fee, setFee] = useState(deal.fee);
  const sent = deal.direction === 'sent';
  const who = sent ? `${deal.artistName} (${deal.otherLabel})` : `${deal.otherLabel} veut ${deal.artistName}`;
  const weeks = `${deal.weeksLeft} sem.`;
  const line =
    deal.status === 'pending'
      ? deal.myTurn
        ? sent
          ? `Contre-offre : ${money(deal.fee)}. Réponds sous ${weeks}`
          : `Offre : ${money(deal.fee)}. Réponds sous ${weeks}`
        : `${money(deal.fee)} · en attente de réponse (${weeks})`
      : deal.status === 'agreed'
        ? sent
          ? `${deal.byClause ? 'Clause payée' : 'Accord'} à ${money(deal.fee)}. Signe-le sous ${weeks} : tu paies seulement s’il signe.`
          : `${deal.byClause ? 'Clause activée' : 'Accord'} à ${money(deal.fee)}. Il discute avec eux (${weeks}).`
        : `${TRANSFER_STATUS[deal.status]} · ${money(deal.fee)}`;
  return (
    <div className={`mt-deal is-${deal.status}${deal.myTurn ? ' is-turn' : ''}`}>
      <span className="mt-art mt-deal-art" data-i={initials(deal.artistName)} style={{ '--hue': hueOf(deal.artistId) } as CSSProperties} aria-hidden="true" />
      <div className="mt-deal-text">
        <Label>{sent ? 'Offre envoyée' : 'Offre reçue'}</Label>
        <b>{who}</b>
        <span className="mt-sub">{line}</span>
      </div>
      <div className="mt-acts mt-deal-acts">
        {deal.myTurn && !countering && (
          <>
            <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'transfer_answer', transferId: deal.id, answer: 'accept' })}>
              Accepter
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => setCountering(true)}>
              Autre prix
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'transfer_answer', transferId: deal.id, answer: 'refuse' })}>
              {sent ? 'Laisser tomber' : 'Refuser'}
            </button>
          </>
        )}
        {deal.myTurn && countering && (
          <>
            <MoneyInput value={fee} onChange={setFee} label="Ton prix" />
            <button
              type="button"
              className="mt-go"
              disabled={busy || fee < 1 || fee === deal.fee}
              onClick={() => {
                onAct({ type: 'transfer_answer', transferId: deal.id, answer: 'counter', fee });
                setCountering(false);
              }}
            >
              Envoyer
            </button>
            <button type="button" className="mt-ghost" onClick={() => setCountering(false)}>
              Retour
            </button>
          </>
        )}
        {sent && deal.status === 'agreed' && (
          <button type="button" className="mt-go" disabled={busy} onClick={() => onTalk(deal.artistId)}>
            Négocier son contrat
          </button>
        )}
        {sent && (deal.status === 'agreed' || (deal.status === 'pending' && !deal.myTurn)) && (
          <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'transfer_cancel', transferId: deal.id })}>
            Annuler
          </button>
        )}
      </div>
    </div>
  );
};

// The release clause of one of my artists: the price at which a friend can take him without asking.
const ClauseControl = ({ artistId, clause, onAct, busy }: { artistId: string; clause: number | null; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(clause ?? 0);
  if (!open) {
    return (
      <button type="button" className="mt-ghost" disabled={busy} title="Le prix auquel un autre joueur peut l’acheter sans te demander." onClick={() => setOpen(true)}>
        {clause ? `Clause · ${money(clause)}` : 'Mettre une clause'}
      </button>
    );
  }
  return (
    <div className="mt-acts mt-clause">
      <MoneyInput value={amount} onChange={setAmount} label="Clause de rachat" />
      <button
        type="button"
        className="mt-go"
        disabled={busy || amount < 1}
        onClick={() => {
          onAct({ type: 'clause', artistId, amount });
          setOpen(false);
        }}
      >
        OK
      </button>
      {clause !== null && (
        <button
          type="button"
          className="mt-ghost"
          disabled={busy}
          onClick={() => {
            onAct({ type: 'clause', artistId, amount: null });
            setOpen(false);
          }}
        >
          Retirer
        </button>
      )}
      <button type="button" className="mt-ghost" onClick={() => setOpen(false)}>
        Retour
      </button>
    </div>
  );
};

// The artists of the other players: ask a featuring, or make a transfer offer.
const OtherPlayers = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [asking, setAsking] = useState<OtherArtistView | null>(null);
  const [buying, setBuying] = useState<OtherArtistView | null>(null);
  const [fee, setFee] = useState(0);
  const [price, setPrice] = useState(0);
  const cash = view.label?.cash ?? 0;
  if (view.others.length === 0) return <span className="mt-sub">Aucun autre joueur n’a encore de label sur ce serveur.</span>;
  return (
    <div className="mt-deck">
      {view.others.map((artist) => (
        <div key={artist.id} className="mt-offer">
          <ArtistCard
            artist={{ id: artist.id, name: artist.name, real: artist.real, genre: artist.genre, gen: artist.gen, potentialMin: 0, potentialMax: 0, fans: artist.fans, hype: 0, value: 0 }}
          >
            <span className="mt-card-sub">
              {artist.labelName} · {compact(artist.fans)} fans
              {artist.clause !== null && <> · clause {money(artist.clause)}</>}
            </span>
          </ArtistCard>
          {buying?.id === artist.id ? (
            <div className="mt-ask">
              <MoneyInput value={price} onChange={setPrice} label="Prix du transfert" />
              <span className="mt-sub">
                {artist.clause !== null && price >= artist.clause ? 'Prix de la clause : son label ne peut pas refuser.' : 'Prix libre. Il devra ensuite signer chez toi.'}
              </span>
              <button
                type="button"
                className="mt-go"
                disabled={busy || price < 1 || price > cash}
                onClick={() => {
                  onAct({ type: 'transfer_ask', artistId: artist.id, fee: price });
                  setBuying(null);
                }}
              >
                Envoyer · {money(price)}
              </button>
              <button type="button" className="mt-ghost" onClick={() => setBuying(null)}>
                Annuler
              </button>
            </div>
          ) : asking?.id === artist.id ? (
            <div className="mt-ask">
              <FeeStepper value={fee} start={artist.demand} onChange={setFee} label="cachet proposé" />
              <button
                type="button"
                className="mt-go"
                disabled={busy || fee > (view.label?.cash ?? 0)}
                onClick={() => {
                  onAct({ type: 'feat_ask', guestId: artist.id, fee });
                  setAsking(null);
                }}
              >
                Envoyer · {money(fee)}
              </button>
              <button type="button" className="mt-ghost" onClick={() => setAsking(null)}>
                Annuler
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="mt-go"
                disabled={busy || artist.asked}
                onClick={() => {
                  setBuying(null);
                  setAsking(artist);
                  setFee(Math.max(100, Math.round(artist.demand / 100) * 100));
                }}
              >
                {artist.asked ? 'Demande en cours' : 'Proposer un featuring'}
              </button>
              <button
                type="button"
                className="mt-ghost"
                disabled={busy || artist.bidding}
                onClick={() => {
                  setAsking(null);
                  setBuying(artist);
                  setPrice(artist.clause ?? Math.max(100, Math.round(artist.value / 100) * 100));
                }}
              >
                {artist.bidding ? 'Offre en cours' : artist.clause !== null ? `Payer la clause · ${money(artist.clause)}` : 'Faire une offre de transfert'}
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

/* ---------------------------------- Centre de formation ---------------------------------- */

const SCOUT_STARS = (stars: number): string => '★'.repeat(stars) + '☆'.repeat(Math.max(0, 5 - stars));

// A youth of the centre: his level is a range until the label knows him well.
const YouthCard = ({ youth, children }: { youth: YouthView; children?: ReactNode }) => (
  <div className={`mt-youth${youth.gem ? ' is-gem' : ''}`}>
    <span className="mt-art mt-youth-art" data-i={initials(youth.name)} style={{ '--hue': hueOf(youth.id) } as CSSProperties} aria-hidden="true" />
    <div className="mt-youth-body">
      <span className="mt-youth-note" title="Sa note : plus tu le connais, plus la fourchette se resserre.">
        {youth.genMin === youth.genMax ? youth.genMin : `${youth.genMin}–${youth.genMax}`}
      </span>
      <b className="mt-youth-name">
        {youth.name} {youth.gem && <span className="mt-hot mt-hot-ok">Pépite</span>}
      </b>
      <span className="mt-sub">
        {genreName(youth.genre)} · {youth.age} ans · {youth.city}
      </span>
      <span className="mt-sub">
        Potentiel {youth.potentialMin === youth.potentialMax ? youth.potentialMin : `${youth.potentialMin} – ${youth.potentialMax}`}
      </span>
      <span className="mt-known">
        <Meter value={youth.known} />
        <small>Connu à {youth.known} %</small>
      </span>
      {children}
    </div>
  </div>
);

const YouthActions = ({ youth, full, onAct, busy, first }: { youth: YouthView; full: boolean; onAct: (action: MelodyAction) => void; busy: boolean; first: boolean }) => {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(youth.name);
  const [leaving, setLeaving] = useState(false);
  if (renaming) {
    return (
      <div className="mt-acts">
        <input className="mt-input" value={name} maxLength={24} aria-label="Nouveau nom" onChange={(event) => setName(event.target.value)} />
        <button
          type="button"
          className="mt-go"
          disabled={busy || name.trim().length < 2}
          onClick={() => {
            onAct({ type: 'youth_rename', youthId: youth.id, name: name.trim() });
            setRenaming(false);
          }}
        >
          OK
        </button>
        <button type="button" className="mt-ghost" onClick={() => setRenaming(false)}>
          Retour
        </button>
      </div>
    );
  }
  return (
    <div className="mt-acts">
      <button
        type="button"
        className="mt-go"
        data-tuto={first ? 'promote' : undefined}
        disabled={busy || full}
        title={full ? 'Ton effectif est complet' : 'Il rejoint ton effectif, contrat maison gratuit'}
        onClick={() => onAct({ type: 'youth_promote', youthId: youth.id })}
      >
        Faire signer
      </button>
      <button type="button" className="mt-ghost" disabled={busy} onClick={() => setRenaming(true)}>
        Renommer
      </button>
      <button
        type="button"
        className="mt-ghost"
        disabled={busy}
        onClick={() => (leaving ? onAct({ type: 'youth_drop', youthId: youth.id }) : setLeaving(true))}
        onBlur={() => setLeaving(false)}
      >
        {leaving ? 'Sûr ? Il part' : 'Libérer'}
      </button>
    </div>
  );
};

const Academy = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const academy = view.academy;
  const [zone, setZone] = useState<string>('fr');
  const [genre, setGenre] = useState<string>('');
  if (!academy) return null;
  const full = view.roster.length >= (view.label?.maxArtists ?? 0);
  const roomLeft = academy.places - academy.youths.length;
  const cost = academy.zones.find((z) => z.id === zone)?.cost ?? 0;
  return (
    <div className="mt-view mt-in">
      {academy.found.length > 0 && (
        <section className="mt-section mt-found-talents">
          <Label>{academy.scout.name} a trouvé</Label>
          <div className="mt-youths">
            {academy.found.map((youth) => (
              <YouthCard key={youth.id} youth={youth}>
                <span className="mt-sub">Répond sous {youth.answerIn} sem., sinon il part ailleurs.</span>
                <div className="mt-acts">
                  <button type="button" className="mt-go" disabled={busy || roomLeft <= 0} onClick={() => onAct({ type: 'youth_take', youthId: youth.id })}>
                    {roomLeft <= 0 ? 'Centre plein' : 'Prendre au centre'}
                  </button>
                  <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'youth_drop', youthId: youth.id })}>
                    Non merci
                  </button>
                </div>
              </YouthCard>
            ))}
          </div>
        </section>
      )}
      <section className="mt-section">
        <div className="mt-bar">
          <Label>
            Centre de formation · {academy.youths.length} / {academy.places} places
          </Label>
          <span className="mt-sub">{full ? 'Effectif complet : monte de palier pour en faire signer un.' : 'Ils progressent seuls, moins vite qu’en pro.'}</span>
        </div>
        {academy.youths.length === 0 ? (
          <span className="mt-sub">Le centre est vide. Envoie ton recruteur chercher des talents.</span>
        ) : (
          <div className="mt-youths">
            {academy.youths.map((youth, i) => (
              <YouthCard key={youth.id} youth={youth}>
                <YouthActions key={youth.name} youth={youth} full={full} onAct={onAct} busy={busy} first={i === 0} />
              </YouthCard>
            ))}
          </div>
        )}
      </section>
      <section className="mt-section">
        <Label>Ton recruteur</Label>
        <div className="mt-scout is-mine">
          <span className="mt-scout-stars" aria-label={`${academy.scout.stars} étoiles sur 5`}>
            {SCOUT_STARS(academy.scout.stars)}
          </span>
          <b>{academy.scout.name}</b>
          <span className="mt-sub">
            « {academy.scout.rank} » · {academy.scout.wage > 0 ? `${money(academy.scout.wage)} / sem.` : 'gratuit'}
          </span>
        </div>
        {academy.mission ? (
          <span className="mt-toast">
            En mission : {academy.mission.zoneName}
            {academy.mission.genre ? `, ${genreName(academy.mission.genre)}` : ''}. Retour dans {academy.mission.weeksLeft} semaine{academy.mission.weeksLeft > 1 ? 's' : ''}.
          </span>
        ) : (
          <div className="mt-mission">
            <Label>Où l’envoyer ?</Label>
            <div className="mt-chips">
              {academy.zones.map((z) => (
                <button key={z.id} type="button" className="mt-chipbtn" aria-pressed={zone === z.id} onClick={() => setZone(z.id)}>
                  {z.name} · {z.cost ? money(z.cost) : 'gratuit'}
                </button>
              ))}
            </div>
            <div className="mt-acts">
              <select className="mt-select" aria-label="Genre cherché" value={genre} onChange={(event) => setGenre(event.target.value)}>
                <option value="">Tous les genres</option>
                {Object.entries(GENRES).map(([id, g]) => (
                  <option key={id} value={id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="mt-go"
                disabled={busy || cost > (view.label?.cash ?? 0)}
                onClick={() => onAct({ type: 'scout_send', zone, genre: genre || null })}
              >
                Envoyer en mission · 2 semaines
              </button>
            </div>
            <span className="mt-sub">Plus il a d’étoiles, plus il ramène de talents, et des meilleurs. Les pépites sont rares.</span>
          </div>
        )}
      </section>
      <section className="mt-section">
        <Label>Recruteurs dispo cette semaine</Label>
        <div className="mt-scouts">
          {academy.hiring.map((scout) => (
            <div key={scout.id} className="mt-scout">
              <span className="mt-scout-stars" aria-label={`${scout.stars} étoiles sur 5`}>
                {SCOUT_STARS(scout.stars)}
              </span>
              <b>{scout.name}</b>
              <span className="mt-sub">« {scout.rank} »</span>
              <span className="mt-sub">{money(scout.wage)} / semaine</span>
              <button
                type="button"
                className="mt-ghost"
                disabled={busy || academy.mission !== null || scout.wage > (view.label?.cash ?? 0)}
                title={academy.mission ? 'Attends le retour de ton recruteur' : `Remplace ${academy.scout.name}`}
                onClick={() => onAct({ type: 'scout_hire', scoutId: scout.id })}
              >
                Engager
              </button>
            </div>
          ))}
        </div>
        <span className="mt-sub">La liste change chaque semaine.</span>
      </section>
    </div>
  );
};

/* ---------------------------------- Marché des transferts ---------------------------------- */

type MarketSort = 'gen' | 'fans' | 'age' | 'price';
const MARKET_SORTS: Record<MarketSort, { name: string; by: (a: MarketView, b: MarketView) => number }> = {
  gen: { name: 'Note', by: (a, b) => b.gen - a.gen },
  fans: { name: 'Fans', by: (a, b) => b.fans - a.fans },
  age: { name: 'Âge', by: (a, b) => a.age - b.age },
  price: { name: 'Prix', by: (a, b) => a.advance - b.advance },
};
// Free artists first: the ones under contract elsewhere come after, with their padlock.
const freeFirst = (a: MarketView, b: MarketView): number => (a.lockedBy ? 1 : 0) - (b.lockedBy ? 1 : 0);
const COUNTRIES: Record<string, string> = {
  FR: 'France', BE: 'Belgique', CH: 'Suisse', CA: 'Canada', US: 'États-Unis', UK: 'Royaume-Uni', DE: 'Allemagne', ES: 'Espagne', NL: 'Pays-Bas', SE: 'Suède',
  RU: 'Russie', KR: 'Corée du Sud', JM: 'Jamaïque', NG: 'Nigeria', DZ: 'Algérie', MA: 'Maroc', CI: 'Côte d’Ivoire', SN: 'Sénégal', CM: 'Cameroun', CD: 'RD Congo',
  MX: 'Mexique', CO: 'Colombie', PR: 'Porto Rico', BR: 'Brésil', AR: 'Argentine', IT: 'Italie', JP: 'Japon', GB: 'Royaume-Uni',
};
const countryName = (code: string): string => COUNTRIES[code] ?? code;
const MAX_PRICES = [0, 2_000, 10_000, 50_000, 250_000];
const PAGE = 36;

const TransferMarket = ({ view, onTalk, onAct, busy }: { view: MelodyView; onTalk: (artistId: string) => void; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [country, setCountry] = useState('');
  const [maxPrice, setMaxPrice] = useState(0);
  const [sort, setSort] = useState<MarketSort>('gen');
  const [favs, setFavs] = useState(false);
  const [locked, setLocked] = useState(true);
  const [page, setPage] = useState(1);
  const full = view.roster.length >= (view.label?.maxArtists ?? 0);
  const talking = new Set(view.talks.map((t) => t.artistId));
  const countries = useMemo(() => [...new Set(view.market.map((m) => m.country))].sort((a, b) => countryName(a).localeCompare(countryName(b), 'fr')), [view.market]);
  const needle = search.trim().toLowerCase();
  const list = view.market
    .filter((a) => !needle || a.name.toLowerCase().includes(needle))
    .filter((a) => !genre || a.genre === genre)
    .filter((a) => !country || a.country === country)
    .filter((a) => !maxPrice || (a.lockedBy === null && a.advance <= maxPrice))
    .filter((a) => !favs || a.fav)
    .filter((a) => locked || a.lockedBy === null)
    .sort((a, b) => freeFirst(a, b) || MARKET_SORTS[sort].by(a, b));
  return (
    <div className="mt-view mt-in">
      {view.news.length > 0 && (
        <section className="mt-news" aria-label="Nouvelles du marché">
          <Label>Nouvelles du marché</Label>
          <ul>
            {view.news.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}
      <div className="mt-filters">
        <input className="mt-input" type="search" placeholder="Chercher un artiste" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
        <select className="mt-select" aria-label="Genre" value={genre} onChange={(event) => { setGenre(event.target.value); setPage(1); }}>
          <option value="">Tous les genres</option>
          {Object.entries(GENRES).map(([id, g]) => (
            <option key={id} value={id}>
              {g.name}
            </option>
          ))}
        </select>
        <select className="mt-select" aria-label="Pays" value={country} onChange={(event) => { setCountry(event.target.value); setPage(1); }}>
          <option value="">Tous les pays</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {countryName(c)}
            </option>
          ))}
        </select>
        <select className="mt-select" aria-label="Prix maximum" value={maxPrice} onChange={(event) => { setMaxPrice(Number(event.target.value)); setPage(1); }}>
          {MAX_PRICES.map((p) => (
            <option key={p} value={p}>
              {p ? `Avance max ${money(p)}` : 'Tous les prix'}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-bar">
        <div className="mt-chips">
          {(Object.keys(MARKET_SORTS) as MarketSort[]).map((key) => (
            <button key={key} type="button" className="mt-chipbtn" aria-pressed={sort === key} onClick={() => setSort(key)}>
              {MARKET_SORTS[key].name}
            </button>
          ))}
          <button type="button" className="mt-chipbtn" aria-pressed={favs} onClick={() => setFavs(!favs)}>
            ★ Favoris
          </button>
          <button type="button" className="mt-chipbtn" aria-pressed={locked} onClick={() => setLocked(!locked)}>
            🔒 Sous contrat
          </button>
        </div>
        <Label>{full ? 'Effectif complet' : `${(view.label?.maxArtists ?? 0) - view.roster.length} place(s) libre(s)`}</Label>
      </div>
      <div className="mt-deck">
        {list.slice(0, page * PAGE).map((artist) => (
          <div key={artist.id} className={`mt-offer${artist.lockedBy ? ' is-locked' : ''}`}>
            <ArtistCard artist={artist}>
              <span className="mt-card-sub">
                {countryName(artist.country)} · {artist.age} ans · {compact(artist.fans)} fans
              </span>
            </ArtistCard>
            <button
              type="button"
              className={`mt-fav${artist.fav ? ' is-on' : ''}`}
              aria-pressed={artist.fav}
              aria-label={artist.fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
              disabled={busy}
              onClick={() => onAct({ type: 'fav', artistId: artist.id })}
            >
              ★
            </button>
            {artist.lockedBy ? (
              <span className="mt-lock">🔒 {artist.lockedBy}</span>
            ) : (
              <button type="button" className="mt-go" disabled={busy || full || artist.blocked !== null} onClick={() => onTalk(artist.id)}>
                {artist.blocked ?? (talking.has(artist.id) ? 'Reprendre la discussion' : `Négocier · ~${money(artist.advance)}`)}
              </button>
            )}
          </div>
        ))}
        {list.length === 0 && <span className="mt-sub">Personne ne correspond à ces filtres.</span>}
      </div>
      {list.length > page * PAGE && (
        <button type="button" className="mt-ghost" onClick={() => setPage(page + 1)}>
          Voir plus ({list.length - page * PAGE})
        </button>
      )}
    </div>
  );
};

/* ---------------------------------- Interview, piques et clashs ---------------------------------- */

const TONES: Record<Tone, string> = { humble: 'Humble', confident: 'Sûr de lui', provoc: 'Provoc' };

// The weekly interview, FIFA style: three questions, three tones.
const Interview = ({ interview, onAct, busy }: { interview: InterviewView; onAct: (action: MelodyAction) => void; busy: boolean }) => (
  <section className="mt-section mt-interview">
    <Label>Interview de la semaine · {interview.artistName}</Label>
    <span className="mt-sub">Humble : il est content. Sûr de lui : du buzz. Provoc : beaucoup de buzz, mais ta réputation en prend un coup.</span>
    {interview.questions.map((q, i) => (
      <div key={i} className="mt-question">
        <b>« {q.text} »</b>
        <div className="mt-answers">
          {q.answers.map((a) => (
            <button
              key={a.tone}
              type="button"
              className={`mt-answer is-${a.tone}${q.answered === a.tone ? ' is-picked' : ''}`}
              disabled={busy || q.answered !== null}
              aria-pressed={q.answered === a.tone}
              onClick={() => onAct({ type: 'interview', question: i, tone: a.tone })}
            >
              <small>{TONES[a.tone]}</small>
              {a.text}
            </button>
          ))}
        </div>
      </div>
    ))}
  </section>
);

const RivalSelect = ({ rivals, value, onChange }: { rivals: RivalView[]; value: string; onChange: (id: string) => void }) => (
  <select className="mt-select" aria-label="Label visé" value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Choisis un label</option>
    {rivals.some((r) => r.player) && (
      <optgroup label="Joueurs du serveur">
        {rivals
          .filter((r) => r.player)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.topArtist}
            </option>
          ))}
      </optgroup>
    )}
    <optgroup label="Labels du jeu">
      {rivals
        .filter((r) => !r.player)
        .map((r) => (
          <option key={r.id} value={r.id}>
            {r.name} · {r.topArtist}
          </option>
        ))}
    </optgroup>
  </select>
);

const ArtistSelect = ({ view, value, onChange }: { view: MelodyView; value: string; onChange: (id: string) => void }) => (
  <select className="mt-select" aria-label="Artiste" value={value} onChange={(event) => onChange(event.target.value)}>
    {view.roster.map((a) => (
      <option key={a.id} value={a.id} disabled={a.energy < 10}>
        {a.name} · énergie {Math.round(a.energy)}
      </option>
    ))}
  </select>
);

const CLASH_STATUS: Record<ClashView['status'], string> = { waiting: 'En attente', answered: 'Les disstracks tournent', won: 'Terminé', refused: 'Dégonflé' };

const ClashRow = ({ clash, view, onAct, busy }: { clash: ClashView; view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [artistId, setArtistId] = useState(view.roster[0]?.id ?? '');
  const sent = clash.direction === 'sent';
  const weeks = `${clash.weeksLeft} sem.`;
  const line =
    clash.status === 'waiting'
      ? sent
        ? `Disstrack de ${clash.myArtist}. ${clash.otherLabel} a ${weeks} pour répondre.`
        : `${clash.theirArtist} t’a clashé. Réponds sous ${weeks}, sinon tu passes pour un dégonflé.`
      : clash.status === 'answered'
        ? `${clash.myArtist} contre ${clash.theirArtist}. Résultat dans ${weeks}`
        : clash.won
          ? clash.status === 'refused'
            ? `${clash.otherLabel} s’est dégonflé. Victoire.`
            : `${clash.myArtist} a gagné contre ${clash.theirArtist} : fans et buzz en plus.`
          : clash.status === 'refused'
            ? 'Tu t’es dégonflé. Ta réputation baisse.'
            : `${clash.myArtist} a perdu contre ${clash.theirArtist}.`;
  return (
    <div className={`mt-deal is-${clash.status}${clash.won === true ? ' is-win' : clash.won === false ? ' is-lose' : ''}`}>
      <span className="mt-crest mt-clash-crest" aria-hidden="true">
        {clash.otherLabel[0]?.toUpperCase()}
      </span>
      <div className="mt-deal-text">
        <Label>{sent ? `Clash contre ${clash.otherLabel}` : `${clash.otherLabel} te clashe`}</Label>
        <b>{CLASH_STATUS[clash.status]}</b>
        <span className="mt-sub">{line}</span>
      </div>
      {!sent && clash.status === 'waiting' && (
        <div className="mt-acts mt-deal-acts">
          <ArtistSelect view={view} value={artistId} onChange={setArtistId} />
          <button type="button" className="mt-go" disabled={busy || !artistId} onClick={() => onAct({ type: 'clash_answer', clashId: clash.id, artistId })}>
            Répondre avec un disstrack
          </button>
          <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'clash_refuse', clashId: clash.id })}>
            Se dégonfler
          </button>
        </div>
      )}
    </div>
  );
};

// Going after another label: a pique once a week, or a disstrack.
const Beef = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [target, setTarget] = useState('');
  const [artistId, setArtistId] = useState(view.roster[0]?.id ?? '');
  if (view.roster.length === 0 || view.rivals.length === 0) return null;
  const shade = view.shade;
  return (
    <section className="mt-section mt-beef">
      <Label>Clasher un label</Label>
      <div className="mt-acts">
        <RivalSelect rivals={view.rivals} value={target} onChange={setTarget} />
      </div>
      {shade && (
        <div className="mt-shade">
          <Label>Pique de la semaine {shade.used ? '· déjà lancée' : ''}</Label>
          <div className="mt-answers">
            {shade.lines.map((l) => (
              <button
                key={l.id}
                type="button"
                className="mt-answer is-provoc"
                disabled={busy || shade.used || !target}
                title={target ? undefined : 'Choisis d’abord un label'}
                onClick={() => onAct({ type: 'shade', targetLabelId: target, line: l.id })}
              >
                {l.text.split('{t}').join(view.rivals.find((r) => r.id === target)?.name ?? '…')}
              </button>
            ))}
          </div>
          <span className="mt-sub">Une pique par semaine. Ton artiste gagne du buzz… sauf si ça se retourne contre toi.</span>
        </div>
      )}
      <div className="mt-diss">
        <Label>Disstrack</Label>
        <div className="mt-acts">
          <ArtistSelect view={view} value={artistId} onChange={setArtistId} />
          <button type="button" className="mt-go" disabled={busy || !target || !artistId} onClick={() => onAct({ type: 'clash', targetLabelId: target, artistId })}>
            Sortir un disstrack
          </button>
        </div>
        <span className="mt-sub">Gratuit, 10 d’énergie, il sort la semaine prochaine. L’autre label a 2 semaines pour répondre. Le gagnant prend des fans au perdant.</span>
      </div>
    </section>
  );
};

/* ---------------------------------- Label (the other players) ---------------------------------- */

const LabelPage = ({ card, onClose }: { card: LabelCard; onClose: () => void }) => (
  <div className="mt-panel mt-in">
    <div className="mt-ptop">
      <div className="mt-crest" aria-hidden="true">
        {card.name[0]?.toUpperCase()}
      </div>
      <div>
        <Label>{card.tierName}</Label>
        <h2 className="mt-h">{card.name}</h2>
      </div>
    </div>
    <div className="mt-pills">
      <span className="mt-pill">{compact(card.fans)} fans</span>
      <span className="mt-pill">Réputation {card.reputation}</span>
      <span className="mt-pill">
        {card.numberOnes} n°1 · {card.top10} top 10
      </span>
      <span className="mt-pill">
        Clashs : {card.clashWins} gagné{card.clashWins > 1 ? 's' : ''} · {card.clashLosses} perdu{card.clashLosses > 1 ? 's' : ''}
      </span>
    </div>
    <Label>Artistes</Label>
    <ul className="mt-rows">
      {card.artists.map((a) => (
        <li key={a.id}>
          <span className="mt-art mt-row-art" data-i={initials(a.name)} style={{ '--hue': hueOf(a.id) } as CSSProperties} aria-hidden="true" />
          <b>{a.name}</b>
          <span className="mt-sub">
            {genreName(a.genre)} · note {a.gen} · {compact(a.fans)} fans
          </span>
        </li>
      ))}
      {card.artists.length === 0 && <li className="mt-sub">Pas encore d’artiste.</li>}
    </ul>
    <Label>Meilleurs sons</Label>
    <ul className="mt-rows">
      {card.songs.map((s) => (
        <li key={s.id}>
          <Cover id={s.id} className="mt-row-art" />
          <b>{s.title}</b>
          <span className="mt-sub">
            {s.artistName} · {compact(s.streams)} streams
          </span>
        </li>
      ))}
      {card.songs.length === 0 && <li className="mt-sub">Aucun son sorti.</li>}
    </ul>
    <div className="mt-acts">
      <button type="button" className="mt-ghost" onClick={onClose}>
        Retour
      </button>
    </div>
  </div>
);

const LabelsTab = ({ view, onAct, onTalk, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; onTalk: (artistId: string) => void; busy: boolean }) => {
  const [opened, setOpened] = useState<string | null>(null);
  const mine = view.label?.id;
  const card = view.labels.find((l) => l.id === opened);
  if (card) return <LabelPage card={card} onClose={() => setOpened(null)} />;
  const podium = view.ranking.slice(0, 5);
  return (
    <div className="mt-view mt-in">
      <section className="mt-section">
        <Label>Classement du serveur · saison {view.season}</Label>
        <div className="mt-podium">
          {podium.map((line, i) => (
            <button
              key={line.labelId}
              type="button"
              className={`mt-step${line.labelId === mine ? ' is-me' : ''}`}
              style={{ '--h': `${100 - i * 16}%` } as CSSProperties}
              onClick={() => setOpened(line.labelId)}
            >
              <span className="mt-step-name">{line.name}</span>
              <span className="mt-step-bar">
                <b>{i + 1}</b>
              </span>
            </button>
          ))}
        </div>
      </section>
      {view.tours.some((t) => !t.mine && t.partnerStatus === 'pending') && (
        <section className="mt-deals" aria-label="Invitations en tournée">
          <Label>Invitations en tournée</Label>
          {view.tours
            .filter((t) => !t.mine && t.partnerStatus === 'pending')
            .map((t) => (
              <TourInvite key={t.id} tour={t} onAct={onAct} busy={busy} />
            ))}
        </section>
      )}
      {view.clashes.length > 0 && (
        <section className="mt-deals" aria-label="Clashs">
          <Label>Clashs</Label>
          {view.clashes.map((clash) => (
            <ClashRow key={`${clash.id}:${clash.status}`} clash={clash} view={view} onAct={onAct} busy={busy} />
          ))}
        </section>
      )}
      {view.interview && <Interview interview={view.interview} onAct={onAct} busy={busy} />}
      <Beef view={view} onAct={onAct} busy={busy} />
      <section className="mt-section">
        <Label>Labels du serveur</Label>
        <div className="mt-labels">
          {view.labels.map((l) => (
            <button key={l.id} type="button" className={`mt-labelcard${l.id === mine ? ' is-me' : ''}`} onClick={() => setOpened(l.id)}>
              <span className="mt-crest" aria-hidden="true">
                {l.name[0]?.toUpperCase()}
              </span>
              <b>{l.name}</b>
              <span className="mt-sub">
                {l.tierName} · {l.artists.length} artiste{l.artists.length > 1 ? 's' : ''} · {compact(l.fans)} fans
              </span>
            </button>
          ))}
        </div>
      </section>
      {view.transfers.length > 0 && (
        <section className="mt-deals" aria-label="Transferts avec les autres joueurs">
          <Label>Transferts entre joueurs</Label>
          {view.transfers.map((deal) => (
            <TransferRow key={`${deal.id}:${deal.fee}:${deal.status}`} deal={deal} onAct={onAct} onTalk={onTalk} busy={busy} />
          ))}
        </section>
      )}
      {view.featDeals.length > 0 && (
        <section className="mt-deals" aria-label="Featurings avec les autres joueurs">
          <Label>Featurings entre joueurs</Label>
          {view.featDeals.map((deal) => (
            <DealRow key={`${deal.id}:${deal.fee}:${deal.status}`} deal={deal} onAct={onAct} busy={busy} />
          ))}
        </section>
      )}
      <section className="mt-section">
        <Label>Artistes des autres joueurs</Label>
        <OtherPlayers view={view} onAct={onAct} busy={busy} />
      </section>
    </div>
  );
};


/* ---------------------------------- Charts ---------------------------------- */

const Charts = ({ view }: { view: MelodyView }) => {
  const [chart, setChart] = useState<string>('global');
  const [players, setPlayers] = useState(false);
  const entries = (chart === 'global' ? view.charts.global : (view.charts.genres[chart] ?? [])).filter((e) => !players || e.player).slice(0, 20);
  const mine = view.label?.id;
  return (
    <div className="mt-view mt-in">
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
        <label className="mt-check">
          <input type="checkbox" checked={players} onChange={(event) => setPlayers(event.target.checked)} />
          Seulement les joueurs du serveur
        </label>
        <ol className="mt-chart">
          {entries.map((entry) => (
            <li key={`${entry.rank}-${entry.title}`} className={entry.labelId === mine ? 'is-me' : ''}>
              <span className="mt-rank">{entry.rank}</span>
              {entry.songId ? <Cover id={entry.songId} className="mt-chart-art" /> : <span className="mt-chart-art" style={{ '--hue': hueOf(entry.artistName) } as CSSProperties} aria-hidden="true" />}
              <span className="mt-chart-title">
                <b>{entry.title}</b>
                <span className="mt-sub">{entry.artistName}</span>
              </span>
              <span className="mt-mute">{compact(entry.streams)}</span>
            </li>
          ))}
          {entries.length === 0 && <li className="mt-sub mt-chart-empty">{players ? 'Aucun son de joueur dans ce chart pour l’instant.' : 'Le chart se remplit après la première semaine.'}</li>}
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
  const [talkWith, setTalkWith] = useState<string | null>(null);
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
      if (action.type === 'release') say('Sortie programmée.');
      if (action.type === 'feat_ask') say('Demande envoyée. L’autre joueur a 2 semaines pour répondre.');
      if (action.type === 'feat_answer') say(action.answer === 'accept' ? 'Accord conclu. Le cachet est payé.' : action.answer === 'counter' ? 'Ton prix est envoyé.' : 'Demande refusée.');
      if (action.type === 'feat_deal') say('L’invité est sur le son !');
      if (action.type === 'tuto' && action.move === 'skip') say('Tutoriel passé. Ton premier son est programmé.');
      if (action.type === 'gig') say('Concert réservé : il se joue à la fin de la semaine.');
      if (action.type === 'loan') say('Prêt accordé.');
      if (action.type === 'youth_promote') say('Il signe ! Il est dans ton effectif.');
      if (action.type === 'scout_send') say('Ton recruteur part en mission. Retour dans 2 semaines.');
      if (action.type === 'scout_hire') say('Nouveau recruteur engagé.');
      if (action.type === 'sell') say('Artiste vendu.');
      if (action.type === 'transfer_ask') say('Offre envoyée.');
      if (action.type === 'transfer_answer' && action.answer === 'accept') say('Accord des labels. L’artiste doit encore signer.');
      if (action.type === 'clash') say('Disstrack enregistré. Il sort la semaine prochaine.');
      if (action.type === 'clash_answer') say('Réponse enregistrée. Que le meilleur gagne.');
      if (action.type === 'clash_refuse') say('Tu te dégonfles… ta réputation en prend un coup.');
      if (action.type === 'shade') say('Pique envoyée. Regarde les nouvelles du marché.');
      if (action.type === 'clause') say(action.amount === null ? 'Clause retirée.' : 'Clause enregistrée.');
      if (action.type === 'project') {
        say(`${PROJECTS[action.kind].name} programmé.`);
        const made = answer.data.view.projects.find((p) => p.title === action.title.trim() && p.artistId === action.artistId && p.state === 'scheduled');
        if (made && action.cover) rememberCover(made.id, action.cover);
      }
      if (action.type === 'deluxe') say('Deluxe programmée pour la semaine prochaine.');
      if (action.type === 'tour') say(action.partnerId ? 'Tournée annoncée. L’invité doit accepter.' : 'Tournée annoncée !');
      if (action.type === 'tour_answer') say(action.accept ? 'C’est parti pour la tournée commune.' : 'Invitation refusée.');
      if (action.type === 'tour_cancel') say('Tournée annulée.');
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
    setTalkWith(null);
    setTab(next);
  };
  const openTalk = async (artistId: string) => {
    if (await act({ type: 'talk', artistId })) setTalkWith(artistId);
  };

  const view = state?.view;
  const coversVersion = useCovers(guildId, view);
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
        <div className="mt-chip" data-tuto="cash">
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
    <CoversContext.Provider value={coversVersion}>
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
              <button key={t.id} type="button" data-tuto={`nav-${t.id}`} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
                {t.name}
              </button>
            ))}
          </nav>
          {talkWith && (
            <Negotiation
              key={talkWith}
              view={view}
              artistId={talkWith}
              onAct={act}
              busy={busy}
              onClose={(signed) => {
                if (signed) {
                  setPicked(talkWith);
                  setTab('squad');
                }
                setTalkWith(null);
              }}
            />
          )}
          {!talkWith && tab === 'home' && <Home view={view} onGo={go} />}
          {!talkWith && tab === 'squad' && (
            <Squad
              view={view}
              picked={picked}
              onPick={setPicked}
              onAct={run}
              busy={busy}
              onGo={go}
              onTalk={(id) => void openTalk(id)}
              onStudio={(id) => {
                setStudioArtist(id);
                setStudioKey((k) => k + 1);
                setTab('studio');
              }}
            />
          )}
          {!talkWith && tab === 'studio' && (
            <Studio key={studioKey} guildId={guildId} view={view} artistId={studioArtist} onArtist={setStudioArtist} onAct={act} onGo={go} busy={busy} />
          )}
          {!talkWith && tab === 'releases' && <Releases view={view} onAct={run} busy={busy} onGo={go} />}
          {!talkWith && tab === 'academy' && <Academy view={view} onAct={run} busy={busy} />}
          {!talkWith && tab === 'market' && <TransferMarket view={view} onTalk={(id) => void openTalk(id)} onAct={run} busy={busy} />}
          {!talkWith && tab === 'labels' && <LabelsTab view={view} onAct={run} onTalk={(id) => void openTalk(id)} busy={busy} />}
          {!talkWith && tab === 'charts' && <Charts view={view} />}
          {!talkWith && tab === 'bank' && <Bank view={view} onAct={run} busy={busy} />}
        </>
      )}
      {view.label && view.tutorial && <Guide tutorial={view.tutorial} tab={tab} talkWith={talkWith} view={view} onAct={act} busy={busy} />}
      {toast && (
        <div className={`mt-snack${toast.bad ? ' is-bad' : ''}`} role="status">
          {toast.text}
        </div>
      )}
      {view.label && active && !view.tutorial && <HitMoment view={view} />}
    </section>
    </CoversContext.Provider>
  );
};
