// Melody Tycoon, Nuit Néon look: few numbers, big buttons, cards. The world lives on the server,
// one per Discord server; this screen only shows it and sends the player's choices.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BEATS,
  CFG,
  GENRES,
  featChance,
  MARKETING,
  THEMES,
  hitWord,
  qualityWord,
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
        <button type="button" className="mt-tile mt-t-create" data-tuto="hub-studio" onClick={() => onGo('studio')}>
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
              <span className={`mt-pill${artist.weeksLeft <= 8 ? ' mt-pill-warn' : ''}`}>Contrat : {artist.weeksLeft} sem.</span>
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
              {artist.renewBlocked === null && (
                <button type="button" className="mt-go" disabled={busy} onClick={() => onTalk(artist.id)}>
                  Renouveler le contrat
                </button>
              )}
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

const STEPS = ['Artiste', 'Thème', 'Beat', 'Équipe', 'Cabine', 'Featuring', 'Titre', 'Note'];
const STAGE_NAMES: Record<string, string> = { theme: 'Après l’écriture', beat: 'Après le beat', producer: 'Avec le producteur', studio: 'Au studio', feat: 'Avec l’invité' };

const settled = (session: SessionView): boolean => session.events.every((e) => e.kind === 'fluid' || e.reaction !== null);

// One event card: a smooth session to enjoy, or an embrouille to answer.
const EventCard = ({ event, busy, onReact, onNext }: { event: SessionEventView; busy: boolean; onReact: (id: string) => void; onNext: () => void }) => (
  <div className={`mt-evt${event.kind === 'fluid' ? ' is-good' : ''}`}>
    <Label>{event.kind === 'fluid' ? `${STAGE_NAMES[event.stage]} · ça roule` : `Embrouille · ${STAGE_NAMES[event.stage]?.toLowerCase()}`}</Label>
    <h3>{event.title}</h3>
    {event.kind === 'clash' && <span className="mt-mute">{event.text}</span>}
    {event.kind === 'clash' && event.reaction === null ? (
      <div className="mt-react">
        {event.reactions.map((reaction) => (
          <button key={reaction.id} type="button" disabled={busy} onClick={() => onReact(reaction.id)}>
            <span>{reaction.text}</span>
            <b>{reaction.hint}</b>
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
    const next = await onAct({ type: 'song', title: title.trim() });
    const song = next?.songs.find((s) => !before.has(s.id));
    if (song) {
      setMade(song);
      setStep(7);
    }
  };

  const cash = view.label?.cash ?? 0;
  const cap = Math.min(cash, view.label?.songBudgetCap ?? 0);
  const theme = THEMES.find((t) => t.id === (session?.themeId ?? themeId));
  const beat = BEATS.find((b) => b.id === (session?.beatId ?? beatId));
  const hot = (value: number | undefined) => (value ?? 50) >= 65;

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
        <span className="mt-sub">Moins tu paies, plus il y a d’embrouilles en studio.</span>
        <button
          type="button"
          className="mt-go mt-go-big"
          disabled={busy || !preview || preview.cost > cap || (artist?.energy ?? 0) < (preview?.energy ?? 0)}
          onClick={() => void enter()}
        >
          Entrer en cabine · {preview ? money(preview.cost) : '…'}
        </button>
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
        <Label>Étape 7 · le titre</Label>
        <label className="mt-field">
          <Label>Titre du son</Label>
          <input value={title} maxLength={40} placeholder="Rue Glacée" autoFocus onChange={(event) => setTitle(event.target.value)} />
        </label>
        <p className="mt-sub">
          {session.artistName}
          {session.feat ? ` feat. ${session.feat.name}` : ''} · {theme?.name} · {beat?.name}. Une fois enregistrée, la note est figée.
        </p>
        <div className="mt-acts">
          <button type="button" className="mt-go mt-go-big" disabled={busy || title.trim().length === 0} onClick={() => void record()}>
            Enregistrer · {money(session.baseCost + session.extraCost)}
          </button>
        </div>
      </>
    );
  } else if (step === 7 && made) {
    stage = (
      <div className="mt-reveal">
        <Label>Note finale · le son est figé</Label>
        <div className="mt-reveal-n mt-gt">
          <CountUp to={made.quality} ms={1400} />
        </div>
        <div className="mt-reveal-w">{qualityWord(made.quality)}</div>
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
            <div className="mt-big mt-gt">{made && step === 7 ? made.quality : showRange ? `${low} – ${high}` : '—'}</div>
            <div className="mt-range">
              {showRange && step !== 7 && <i style={{ left: `${low}%`, width: `${Math.max(2, high - low)}%` }} />}
              {made && step === 7 && <u style={{ left: `${made.quality}%` }} />}
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
          data-tuto="release-go"
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
          <div className="mt-songs" data-tuto="vault">
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
  const artist: ArtistView | undefined = view.market.find((a) => a.id === artistId) ?? view.roster.find((a) => a.id === artistId);
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
              À payer tout de suite : <b>{money(offer.advance)}</b>
              {offer.weeklyAllowance > 0 && <> · puis {money(offer.weeklyAllowance)} chaque semaine</>}
              {offer.advance > cash && <b className="mt-badtext"> · pas assez de cash</b>}
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
        { text: 'Les charts : ta place face aux autres labels du serveur. On commence ?', target: 'nav-charts', next: 'C’est parti' },
      ][Math.min(tour, 2)]!;
    case 'sign':
      if (talking && talk?.counter) return { text: 'Son agent fait une contre-offre : « Il veut… » sous chaque ligne. Accepte-la, ou tente mieux.', target: 'accept' };
      if (talking && talk) return { text: 'Règle l’avance, les royalties et la durée, puis fais ton offre. Son agent va répondre.', target: 'offer' };
      if (talking) return { text: 'Bien joué ! Passons au studio.', target: 'talk-done' };
      if (tab === 'market') return { text: 'Choisis un artiste qui te plaît et clique sur Négocier.', target: 'sign' };
      return { text: 'Un label, c’est une équipe. Signe un deuxième artiste dans Recrutement.', target: 'nav-market' };
    case 'song':
      if (tab !== 'studio') return { text: 'Crée ton premier son. Direction le Studio !', target: 'nav-studio' };
      return {
        text: 'Choisis un artiste, un thème, un beat puis ton équipe. Une embrouille va arriver : pas de panique. Au featuring, la roue dira oui au deuxième essai.',
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

// The artists of the other players, each with a "Proposer un featuring" button and its price.
const OtherPlayers = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [asking, setAsking] = useState<OtherArtistView | null>(null);
  const [fee, setFee] = useState(0);
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
            </span>
          </ArtistCard>
          {asking?.id === artist.id ? (
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
            <button
              type="button"
              className="mt-go"
              disabled={busy || artist.asked}
              onClick={() => {
                setAsking(artist);
                setFee(Math.max(100, Math.round(artist.demand / 100) * 100));
              }}
            >
              {artist.asked ? 'Demande en cours' : 'Proposer un featuring'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

/* ---------------------------------- Market ---------------------------------- */

const Market = ({
  view,
  onTalk,
  onAct,
  busy,
}: {
  view: MelodyView;
  onTalk: (artistId: string) => void;
  onAct: (action: MelodyAction) => void;
  busy: boolean;
}) => {
  const [list, setList] = useState<'free' | 'players'>('free');
  const full = view.roster.length >= (view.label?.maxArtists ?? 0);
  const [only, setOnly] = useState(true);
  const shown = view.market.filter((a) => !only || a.blocked === null).slice(0, 24);
  const talking = new Set(view.talks.map((t) => t.artistId));
  return (
    <div className="mt-view mt-in">
      {view.featDeals.length > 0 && (
        <section className="mt-deals" aria-label="Featurings avec les autres joueurs">
          <Label>Featurings entre joueurs</Label>
          {view.featDeals.map((deal) => (
            <DealRow key={`${deal.id}:${deal.fee}:${deal.status}`} deal={deal} onAct={onAct} busy={busy} />
          ))}
        </section>
      )}
      <div className="mt-switch" role="group" aria-label="Liste d’artistes">
        <button type="button" className="mt-chipbtn" aria-pressed={list === 'free'} onClick={() => setList('free')}>
          Artistes libres
        </button>
        <button type="button" className="mt-chipbtn" aria-pressed={list === 'players'} onClick={() => setList('players')}>
          Chez les autres joueurs
        </button>
      </div>
      {list === 'players' ? (
        <OtherPlayers view={view} onAct={onAct} busy={busy} />
      ) : (
      <>
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
            <button
              type="button"
              className="mt-go"
              data-tuto={artist.blocked === null ? 'sign' : undefined}
              disabled={busy || full || artist.blocked !== null}
              onClick={() => onTalk(artist.id)}
            >
              {artist.blocked ?? (talking.has(artist.id) ? 'Reprendre la discussion' : `Négocier · ~${money(artist.advance)}`)}
            </button>
          </div>
        ))}
        {shown.length === 0 && <span className="mt-sub">Personne n’est signable pour l’instant. Reviens la semaine prochaine.</span>}
      </div>
      </>
      )}
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
          {!talkWith && tab === 'market' && <Market view={view} onTalk={(id) => void openTalk(id)} onAct={run} busy={busy} />}
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
    </section>
  );
};
