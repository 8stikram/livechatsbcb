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
  type DuelView,
  type InterviewView,
  type RivalView,
  type Tone,
  PROJECTS,
  SALES,
  salesQuote,
  ROLES,
  ROLE_IDS,
  FORM,
  roleSlots,
  TOURS,
  projectCost,
  tourQuote,
  type ProjectKind,
  type ProjectView,
  type TourView,
  TROPHY_NAMES,
  type SeasonResult,
  ROLE_NAMES,
  type StaffRole,
  type StaffView,
  type DynamicsView,
  type AuctionView,
  type LendingView,
  SKILL_PLUS,
} from '@livechatsbcb/melody';
import type { MelodyRoute } from '../../../../shared/ipc';
import { LibraryPicker, type Shelf } from '../LibraryPicker';
import { useClipboardShelf } from '../ClipboardShelf';
import { errorMessage } from '../messages';
import { Avatar, AvatarGenres, hueOf, moodOf } from './Avatar';
import '@fontsource-variable/archivo/wdth.css';
import './melody.css';

type MelodyState = { view: MelodyView; nextTickAt: number };
type Answer<T> = { ok: true; data: T } | { ok: false; message: string };
type Levels = { theme: 1 | 2 | 3 | 4; beat: 1 | 2 | 3 | 4; producer: 1 | 2 | 3 | 4 | 5; studio: 1 | 2 | 3 | 4 };
type Tab = 'home' | 'squad' | 'dynamics' | 'studio' | 'releases' | 'academy' | 'staff' | 'market' | 'labels' | 'charts' | 'bank';

const TABS: Array<{ id: Tab; name: string }> = [
  { id: 'home', name: 'Accueil' },
  { id: 'squad', name: 'Effectif' },
  { id: 'dynamics', name: 'Dynamique' },
  { id: 'studio', name: 'Studio' },
  { id: 'releases', name: 'Sorties' },
  { id: 'academy', name: 'Recrutement' },
  { id: 'staff', name: 'Staff' },
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
}) => {
  const form = 'form' in artist ? (artist as RosterView).form : 0;
  return (
  <button type="button" className={`mt-card${form > 0 ? ' is-hot' : ''}`} aria-pressed={pressed ?? false} onClick={onClick}>
    <Avatar id={artist.id} genre={artist.genre} mood={'morale' in artist ? moodOf(artist as RosterView) : null} />
    <span className="mt-note">
      {artist.gen}
      <small>{genreName(artist.genre)}</small>
    </span>
    <span className="mt-card-foot">
      {artist.real && <span className="mt-real">Vrai artiste</span>}
      <span className="mt-nm">{artist.name}</span>
      {artist.skills?.length > 0 && <span className="mt-card-skills">{artist.skills.join(' · ')}</span>}
      {form > 0 && <span className="mt-hot">En pleine forme · {form} sem.</span>}
      {energy !== undefined && <Meter value={energy} />}
      {children}
    </span>
  </button>
  );
};

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

/* ---------------------------------- Festival du Serveur ---------------------------------- */

const FEST_STAGES: Record<'head' | 'main' | 'discovery', string> = { head: 'Tête d’affiche', main: 'Scène principale', discovery: 'Scène découverte' };
const SEEN_FEST = 'mt-fest-seen';
const festSeen = (): number => {
  try {
    return Number(localStorage.getItem(SEEN_FEST) ?? 0) || 0;
  } catch {
    return 0;
  }
};

// The festival poster on the home screen: the coming line-up, or the results revealed one by one.
const FestivalPoster = ({ view, onGo }: { view: MelodyView; onGo: (tab: Tab) => void }) => {
  const fest = view.festival;
  const last = fest.last;
  const [shown, setShown] = useState(() => (last && festSeen() >= last.number ? last.acts.length : 0));
  useEffect(() => {
    if (!last) return undefined;
    if (festSeen() >= last.number) {
      setShown(last.acts.length);
      return undefined;
    }
    setShown(0);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= last.acts.length) {
        window.clearInterval(timer);
        try {
          localStorage.setItem(SEEN_FEST, String(last.number));
        } catch {
          // Not remembered: the reveal plays again next time.
        }
      }
    }, 650);
    return () => window.clearInterval(timer);
  }, [last?.number]);
  if (last) {
    const best = last.prize ? last.acts.find((a) => a.artistId === last.prize!.artistId) : undefined;
    const replay = () => {
      try {
        localStorage.setItem(SEEN_FEST, String(last.number - 1));
      } catch {
        // Nothing to do.
      }
      setShown(0);
      let i = 0;
      const timer = window.setInterval(() => {
        i += 1;
        setShown(i);
        if (i >= last.acts.length) {
          window.clearInterval(timer);
          try {
            localStorage.setItem(SEEN_FEST, String(last.number));
          } catch {
            // Nothing to do.
          }
        }
      }, 650);
    };
    return (
      <section className="mt-fest mt-in" aria-label="Résultats du festival">
        <div className="mt-fest-head">
          <Label>Festival du Serveur n°{last.number} · résultats</Label>
          <span className="mt-sub">{fmt(last.crowd)} spectateurs</span>
        </div>
        <ol className="mt-fest-acts">
          {last.acts.map((act, i) => (
            <li key={act.artistId} className={`mt-fest-act is-${act.stage}${i < shown ? ' is-on' : ''}${act.player ? ' is-player' : ''}${last.prize?.artistId === act.artistId && shown >= last.acts.length ? ' is-prize' : ''}`}>
              <span className="mt-fest-stage">{FEST_STAGES[act.stage]}</span>
              <b>{act.artistName}</b>
              <span className="mt-sub">{act.labelName}</span>
              <span className={`mt-fest-note${act.cancelled ? ' is-off' : act.note < 40 ? ' is-bad' : ''}`}>{i < shown ? (act.cancelled ? 'Annulé' : `${act.note}/100`) : '…'}</span>
            </li>
          ))}
        </ol>
        {shown >= last.acts.length ? (
          <div className="mt-fest-foot">
            {best && (
              <span className="mt-fest-prize">
                Prix du public{best.player ? " des joueurs" : ""} : <b>{best.artistName}</b> ({best.labelName}), {best.note}/100
              </span>
            )}
            <button type="button" className="mt-ghost" onClick={replay}>
              Revoir
            </button>
          </div>
        ) : (
          <span className="mt-sub">Les notes tombent…</span>
        )}
      </section>
    );
  }
  if (!fest.open) {
    return (
      <button type="button" className="mt-fest mt-fest-soon" onClick={() => onGo('labels')}>
        <Label>Festival du Serveur n°{fest.number}</Label>
        <span className="mt-sub">Dans {fest.weeksLeft} semaine{fest.weeksLeft > 1 ? 's' : ''}. Inscriptions {fest.weeksLeft - 4 <= 1 ? 'la semaine prochaine' : `dans ${fest.weeksLeft - 4} semaines`}.</span>
      </button>
    );
  }
  const by = (stage: 'head' | 'main' | 'discovery') => fest.entries.filter((e) => e.stage === stage);
  return (
    <button type="button" className="mt-fest mt-fest-poster mt-in" onClick={() => onGo('labels')}>
      <span className="mt-fest-title">Festival du Serveur</span>
      <span className="mt-sub">n°{fest.number} · {fest.weeksLeft <= 1 ? 'la semaine prochaine' : `dans ${fest.weeksLeft} semaines`} · inscriptions ouvertes</span>
      <span className="mt-fest-top">{fest.head ? fest.head.artistName : 'Tête d’affiche à prendre'}</span>
      {fest.head && <span className="mt-sub">{fest.head.labelName} · {money(fest.head.amount)}</span>}
      <span className="mt-fest-mid">{by('main').map((e) => e.artistName).join(' · ') || 'Scène principale : 4 places'}</span>
      <span className="mt-fest-low">{by('discovery').map((e) => e.artistName).join(' · ') || 'Scène découverte : 8 places'}</span>
      <span className="mt-go">S’inscrire</span>
    </button>
  );
};

// Registration in the Label tab: main stage, discovery stage, and the headliner auction.
const FestivalPanel = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const fest = view.festival;
  const [headArtist, setHeadArtist] = useState('');
  const [amount, setAmount] = useState(0);
  if (!view.label) return null;
  const cash = view.label.cash;
  const mine = fest.entries.filter((e) => e.mine);
  const full = fest.myCount >= fest.perLabel;
  const bid = Math.max(amount, fest.nextHeadBid);
  return (
    <section className="mt-section mt-festpanel">
      <Label>Festival du Serveur n°{fest.number} · toutes les 7 semaines</Label>
      {!fest.open ? (
        <span className="mt-sub">Prochain festival dans {fest.weeksLeft} semaine{fest.weeksLeft > 1 ? 's' : ''}. Les inscriptions ouvrent 4 semaines avant.</span>
      ) : (
        <>
          <span className="mt-sub">
            Le jour J dans {fest.weeksLeft} semaine{fest.weeksLeft > 1 ? 's' : ''}. {fest.perLabel} artistes au plus par label. Note = scène, buzz, énergie et un peu de chance. Grève ou fatigue (moins de 20 d’énergie) le jour J : annulé, inscription perdue, réputation −1.
          </span>
          <div className="mt-deal mt-fest-bid">
            <div className="mt-deal-text">
              <b>Tête d’affiche (1 place, aux enchères)</b>
              <span className="mt-sub">
                {fest.head ? `Meilleure offre : ${money(fest.head.amount)} pour ${fest.head.artistName} (${fest.head.labelName})${fest.head.mine ? ', c’est toi' : ''}.` : `Départ à ${money(fest.headStart)}.`} Ton argent est bloqué tant que tu mènes, rendu si on te dépasse. Cachet : 30 % de la billetterie.
              </span>
            </div>
            {!fest.head?.mine && (
              <div className="mt-acts mt-deal-acts">
                <select className="mt-select" aria-label="Artiste en tête d’affiche" value={headArtist} onChange={(e) => setHeadArtist(e.target.value)}>
                  <option value="">Choisis un artiste</option>
                  {fest.candidates.filter((c) => !c.strike).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {fmt(c.fans)} fans
                    </option>
                  ))}
                </select>
                <MoneyInput value={bid} onChange={setAmount} label="Offre" />
                <button type="button" className="mt-go" disabled={busy || !headArtist || (full && !mine.some((m) => m.stage === 'head')) || cash < bid} onClick={() => onAct({ type: 'festival_bid', artistId: headArtist, amount: bid })}>
                  Enchérir
                </button>
              </div>
            )}
          </div>
          {mine.filter((e) => e.stage !== 'head').map((e) => (
            <div key={e.artistId} className="mt-deal mt-rel-row">
              <div className="mt-deal-text">
                <b>{e.artistName}</b>
                <span className="mt-sub">Inscrit : {FEST_STAGES[e.stage]}</span>
              </div>
              <div className="mt-acts mt-deal-acts">
                <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'festival_withdraw', artistId: e.artistId })}>
                  Retirer
                </button>
              </div>
            </div>
          ))}
          {!full && fest.candidates.map((c) => (
            <div key={c.id} className="mt-deal mt-rel-row">
              <div className="mt-deal-text">
                <b>{c.name}</b>
                <span className="mt-sub">
                  {fmt(c.fans)} fans · scène {c.scene} · énergie {c.energy}
                  {c.strike ? ' · en grève' : c.tired ? ' · trop fatigué pour l’instant' : ''}
                </span>
              </div>
              <div className="mt-acts mt-deal-acts">
                <button type="button" className="mt-go" disabled={busy || cash < fest.mainFee} title="Les 4 plus gros inscrits jouent. Sinon, inscription rendue." onClick={() => onAct({ type: 'festival_register', artistId: c.id, stage: 'main' })}>
                  Principale · {money(fest.mainFee)}
                </button>
                {c.discovery && (
                  <button type="button" className="mt-ghost" disabled={busy || cash < fest.discoveryFee} title="Moins de 100 000 fans. Tirage si plus de 8 inscrits." onClick={() => onAct({ type: 'festival_register', artistId: c.id, stage: 'discovery' })}>
                    Découverte · {money(fest.discoveryFee)}
                  </button>
                )}
              </div>
            </div>
          ))}
          {full && <span className="mt-sub">Tu as inscrit {fest.perLabel} artistes : c’est le maximum.</span>}
        </>
      )}
    </section>
  );
};

/* ---------------------------------- Home ---------------------------------- */

const Home = ({ view, onGo, onAct, busy }: { view: MelodyView; onGo: (tab: Tab) => void; onAct: (action: MelodyAction) => void; busy: boolean }) => {
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
      <ServerNews view={view} />
      <FestivalPoster view={view} onGo={onGo} />
      <LabelCards view={view} onAct={onAct} busy={busy} />
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
      <SeasonGoals key={view.seasonInfo.number} view={view} onAct={onAct} busy={busy} />
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

/* ---------------------------------- Evolution ---------------------------------- */

const pct = (x: number): number => Math.round(x * 100);
const lossText = ([a, b]: [number, number]): string => (b === 0 ? 'aucun fan perdu' : a === b ? `−${pct(a)} % de fans` : `−${pct(a)} à ${pct(b)} % de fans`);

// His rating over the last weeks, as a small line, with how much it moved.
const RatingCurve = ({ values }: { values: number[] }) => {
  if (values.length < 2) return <span className="mt-sub">La courbe de sa note se dessine semaine après semaine.</span>;
  const w = 240;
  const h = 56;
  const low = Math.min(...values) - 1;
  const high = Math.max(...values) + 1;
  const x = (i: number): number => (i / (values.length - 1)) * w;
  const y = (v: number): number => h - ((v - low) / (high - low)) * h;
  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const delta = last - first;
  return (
    <div className="mt-curve">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Sa note sur ${values.length} semaines : de ${first} à ${last}`}>
        <defs>
          <linearGradient id="mt-curve-g" x1="0" x2="1">
            <stop offset="0" style={{ stopColor: 'var(--mt-a1)' }} />
            <stop offset="1" style={{ stopColor: 'var(--mt-a2)' }} />
          </linearGradient>
        </defs>
        <polyline points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} />
        <circle cx={x(values.length - 1)} cy={y(last)} r="3.5" />
      </svg>
      <span className={`mt-curve-delta${delta > 0 ? ' is-up' : delta < 0 ? ' is-down' : ''}`}>
        <b>
          {delta > 0 ? '+' : delta < 0 ? '−' : ''}
          {Math.abs(delta)}
        </b>
        <small>en {values.length} sem.</small>
      </span>
    </div>
  );
};

// How he grows: his hidden profile, his signature skills, his rating curve, and changing genre.
const EvolutionBlock = ({ artist, cash, onAct, busy }: { artist: RosterView; cash: number; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [picking, setPicking] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const evo = artist.evolution;
  if (!evo) return null;
  const toPlus = Math.max(1, SKILL_PLUS.releases - evo.releases);
  const wish = evo.wish;
  const wished = wish ? evo.genres.options.find((o) => o.genre === wish.genre) : undefined;
  const options = [...evo.genres.options].sort((a, b) => Number(b.wished) - Number(a.wished) || a.loss[1] - b.loss[1] || a.name.localeCompare(b.name));
  const close = (): void => {
    setPicking(false);
    setSure(null);
  };
  return (
    <div className="mt-evo">
      <div className="mt-evo-head">
        <Label>Évolution</Label>
        <span className={`mt-pill${evo.profile ? ' mt-pill-on' : ''}`}>{evo.profile ? evo.profile.name : 'Profil inconnu'}</span>
      </div>
      <span className="mt-sub">
        {evo.profile
          ? evo.profile.text
          : `On saura comment il progresse dans ${evo.profileIn} semaine${evo.profileIn > 1 ? 's' : ''}. Un coach 3 étoiles le voit tout de suite.`}
      </span>
      <RatingCurve values={evo.history} />
      <div className="mt-streak">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < evo.streak ? 'is-on' : ''} />
        ))}
        <span className="mt-sub">
          {evo.streak}/3 très bons sons d’affilée : à 3, son plafond monte.
        </span>
      </div>
      {evo.skills.length > 0 ? (
        <ul className="mt-skills">
          {evo.skills.map((s) => (
            <li key={s.id} className={s.plus ? 'is-plus' : ''}>
              <b>
                {s.name}
                {s.plus && <em>+</em>}
              </b>
              <span>{s.text}</span>
              {s.next && (
                <small>
                  Niveau + dans {toPlus} sortie{toPlus > 1 ? 's' : ''} (ou à 80 de note) : {s.next}
                </small>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <span className="mt-sub">Pas de talent spécial.</span>
      )}
      {evo.shift && (
        <div className="mt-evo-note is-shift">
          En transition depuis le {evo.shift.from} : un peu moins fort au studio encore {evo.shift.weeksLeft} sem.
        </div>
      )}
      {evo.audienceWeeks > 0 && (
        <div className="mt-evo-note">
          Nouveau public : ses sons de {genreName(artist.genre)} touchent plus de nouveaux auditeurs encore {evo.audienceWeeks} sem.
        </div>
      )}
      {wish && (
        <div className="mt-deal is-turn">
          <Avatar id={artist.id} genre={artist.genre} className="mt-deal-art" />
          <div className="mt-deal-text">
            <Label>Il a une envie</Label>
            <b>Passer au {wish.name}</b>
            <span className="mt-sub">
              À moitié prix{wished ? ` : ${money(wished.cost)}` : ''}. Oui : moral +10. Non, ou pas de réponse dans {wish.weeksLeft} sem. : moral −5.
              {evo.genres.blocked && ` ${evo.genres.blocked}`}
            </span>
          </div>
          <div className="mt-acts mt-deal-acts">
            <button
              type="button"
              className="mt-go"
              disabled={busy || !!evo.genres.blocked || !!artist.loan || (wished?.cost ?? 0) > cash}
              onClick={() => onAct({ type: 'genre_change', artistId: artist.id, genre: wish.genre })}
            >
              Oui
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'genre_wish_refuse', artistId: artist.id })}>
              Non
            </button>
          </div>
        </div>
      )}
      {picking && !evo.genres.blocked ? (
        <div className="mt-genres">
          <div className="mt-evo-head">
            <Label>Changer de genre</Label>
            <button type="button" className="mt-ghost" onClick={close}>
              Fermer
            </button>
          </div>
          <span className="mt-sub">
            Une fois par saison. Il est moins fort quelques semaines et garde son ancien genre en second. Si ce n’est pas son idée, son moral baisse de 10.
          </span>
          <div className="mt-genre-list">
            {options.map((o) => (
              <button
                key={o.genre}
                type="button"
                className={`mt-genre-opt${sure === o.genre ? ' is-sure' : ''}${o.wished ? ' is-wished' : ''}`}
                disabled={busy || o.cost > cash}
                onBlur={() => setSure((s) => (s === o.genre ? null : s))}
                onClick={() => {
                  if (sure !== o.genre) return setSure(o.genre);
                  onAct({ type: 'genre_change', artistId: artist.id, genre: o.genre });
                  close();
                }}
              >
                <b>
                  {sure === o.genre ? `Sûr ? ${o.name}` : o.name}
                  {o.wished && ' · son envie'}
                </b>
                <span>
                  {money(o.cost)} · {o.weeks} sem. · {lossText(o.loss)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-acts">
          <button type="button" className="mt-ghost" disabled={busy || !!evo.genres.blocked || !!artist.loan} onClick={() => setPicking(true)}>
            Changer de genre
          </button>
          {(evo.genres.blocked ?? (artist.loan ? 'Il est prêté : son label décide de son genre.' : null)) && (
            <span className="mt-sub">{evo.genres.blocked ?? 'Il est prêté : son label décide de son genre.'}</span>
          )}
        </div>
      )}
    </div>
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
              <span className="mt-pill">{artist.rankName}</span>
              {artist.morale < (view.dynamics?.thresholds.strike ?? 15) ? (
                <span className="mt-pill mt-pill-warn">En grève</span>
              ) : (
                artist.wantsOut && <span className="mt-pill mt-pill-warn">Veut partir</span>
              )}
              {artist.real && <span className="mt-pill">Vrai artiste</span>}
              {artist.loan && (
                <span className="mt-pill mt-pill-warn">
                  Prêté par {artist.loan.lenderName} · retour dans {artist.loan.weeksLeft} sem.
                </span>
              )}
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
              {!artist.loan && !artist.onAuction && (
                <SellButton key={artist.id} name={artist.name} price={artist.salePrice} busy={busy} onSell={() => onAct({ type: 'sell', artistId: artist.id })} />
              )}
              {!artist.loan && <ClauseControl key={`c${artist.id}`} artistId={artist.id} clause={artist.clause} onAct={onAct} busy={busy} />}
            </div>
            <MarketControl key={`m${artist.id}`} artist={artist} onAct={onAct} onGo={onGo} busy={busy} />
            {artist.gigsBooked > 0 && (
              <span className="mt-sub">
                {artist.gigsBooked} concert{artist.gigsBooked > 1 ? 's' : ''} prévu{artist.gigsBooked > 1 ? 's' : ''} cette semaine.
              </span>
            )}
            <TourBlock key={`t${artist.id}`} view={view} artist={artist} onAct={onAct} busy={busy} />
            <EvolutionBlock key={`e${artist.id}`} artist={artist} cash={view.label?.cash ?? 0} onAct={onAct} busy={busy} />
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

// What happens on the whole server this week (platforms, trends, money).
const ServerNews = ({ view }: { view: MelodyView }) => {
  const server = view.events?.server ?? [];
  if (server.length === 0) return null;
  return (
    <div className="mt-srv" role="note">
      <Label>Sur tout le serveur cette semaine</Label>
      {server.map((e) => (
        <div key={e.title} className="mt-srv-line">
          <b>{e.title}</b>
          <span>{e.text}</span>
          {e.weeksLeft > 1 && <span className="mt-sub">Encore {e.weeksLeft} sem.</span>}
        </div>
      ))}
    </div>
  );
};

// Label cards: small stories and offers, with 2 to 4 answers. Unanswered for 4 weeks, "ignore" applies.
const LabelCards = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const events = view.events;
  const [showLog, setShowLog] = useState(false);
  if (!events || (events.cards.length === 0 && events.log.length === 0)) return null;
  const cash = view.label?.cash ?? 0;
  return (
    <div className="mt-cards">
      {events.cards.map((card) => (
        <div key={card.id} className={`mt-ecard mt-in${card.kind === 'chance' ? ' is-chance' : ''}`}>
          <div className="mt-ecard-top">
            <Label>{card.kind === 'chance' ? 'Opportunité' : 'Vie du label'}{card.artist ? ` · ${card.artist}` : ''}</Label>
            <span className={`mt-sub${card.weeksLeft <= 1 ? ' mt-ecard-late' : ''}`}>
              {card.weeksLeft <= 1 ? 'Dernière semaine pour répondre' : `${card.weeksLeft} sem. pour répondre`}
            </span>
          </div>
          <b className="mt-ecard-title">{card.title}</b>
          <p className="mt-ecard-text">{card.text}</p>
          <div className="mt-ecard-choices">
            {card.choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="mt-ecard-choice"
                disabled={busy || choice.cost > cash}
                title={choice.cost > cash ? 'Pas assez de cash' : undefined}
                onClick={() => onAct({ type: 'card', cardId: card.id, choiceId: choice.id })}
              >
                <b>{choice.text}</b>
                {choice.odds === null ? (
                  <span className="mt-sub">{choice.effect}</span>
                ) : (
                  <span className="mt-sub">
                    Gagné : {choice.win} · Raté : {choice.lose}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
      {events.log.length > 0 && (
        <button type="button" className="mt-ghost mt-cards-log" onClick={() => setShowLog((v) => !v)}>
          {showLog ? 'Cacher les dernières réponses' : 'Voir les dernières réponses'}
        </button>
      )}
      {showLog && (
        <ul className="mt-cards-past">
          {events.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

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

/* ---------------------------------- Saisons ---------------------------------- */

const nth = (place: number): string => (place === 1 ? '1er' : `${place}e`);

// The goals of the season on the home page: three offered, two to pick, then their progress.
const SeasonGoals = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const info = view.seasonInfo;
  const [picked, setPicked] = useState<string[]>([]);
  if (info.goals.length === 0) return null;
  const toggle = (id: string) => setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < info.picks ? [...list, id] : list));
  const shown = info.picked ? info.goals.filter((g) => g.chosen) : info.goals;
  return (
    <section className="mt-section mt-season" aria-label="Objectifs de saison">
      <div className="mt-bar">
        <Label>
          Saison {info.number} · semaine {info.week} sur {CFG.ticksPerSeason}
        </Label>
        <span className="mt-sub">
          Classement final dans {info.weeksLeft} semaine{info.weeksLeft > 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-seasonbar" role="img" aria-label={`Semaine ${info.week} sur ${CFG.ticksPerSeason}`}>
        <i style={{ width: `${(info.week / CFG.ticksPerSeason) * 100}%` }} />
      </div>
      {!info.picked && (
        <span className="mt-sub">
          Choisis {info.picks} objectifs sur {info.goals.length}. Réussi : de la réputation et du cash à la fin de la saison. Raté : rien ne se passe.
          {info.pickWeeksLeft > 0 ? ` Encore ${info.pickWeeksLeft} semaine${info.pickWeeksLeft > 1 ? 's' : ''} pour choisir, sinon le jeu prend les deux premiers.` : ''}
        </span>
      )}
      <div className="mt-goals">
        {shown.map((g) => {
          const body = (
            <>
              <b>{g.text}</b>
              <span className="mt-sub">
                +{g.reputation} réputation · +{money(g.cash)}
              </span>
              {info.picked && <span className={`mt-goal-state${g.done ? ' is-done' : ''}`}>{g.done ? '✓ Atteint' : g.atEnd ? `Jugé le dernier jour · ${g.progress ?? ''}` : (g.progress ?? 'En cours')}</span>}
            </>
          );
          return info.picked ? (
            <div key={g.id} className={`mt-goal${g.done ? ' is-done' : ''}`}>
              {body}
            </div>
          ) : (
            <button key={g.id} type="button" className="mt-goal" aria-pressed={picked.includes(g.id)} onClick={() => toggle(g.id)}>
              {body}
            </button>
          );
        })}
      </div>
      {!info.picked && (
        <div className="mt-acts">
          <button type="button" className="mt-go" disabled={busy || picked.length !== info.picks} onClick={() => onAct({ type: 'season_goals', goals: picked })}>
            Valider mes {info.picks} objectifs
          </button>
        </div>
      )}
    </section>
  );
};

const Cup = () => (
  <svg className="mt-cup" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M7 3h10v5a5 5 0 0 1-10 0z" />
    <path d="M7 5H4a3 3 0 0 0 3 4M17 5h3a3 3 0 0 1-3 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M11 13h2v4h-2zM8 17h8v3H8z" />
  </svg>
);

// Always the same rain of confetti: no random, so the screen does not jump when it is drawn again.
const CONFETTI = Array.from({ length: 36 }, (_, i) => ({ left: (i * 37) % 100, delay: ((i * 53) % 30) / 10, hue: (i * 47) % 360, turn: i % 2 === 0 ? 1 : -1 }));

// End of season: the podium, then the trophies, then what the label takes home.
const Ceremony = ({ result, labelId, onClose, busy }: { result: SeasonResult; labelId: string; onClose: () => void; busy: boolean }) => {
  const [step, setStep] = useState(0);
  const mine = result.labels[labelId];
  const pages = ['podium', ...(result.trophies.length > 0 ? ['trophies'] : []), ...(mine ? ['mine'] : [])];
  const page = pages[Math.min(step, pages.length - 1)];
  const last = step >= pages.length - 1;
  const [first, second, third] = result.ranking;
  const podium = [second, first, third].filter((line): line is NonNullable<typeof line> => !!line);
  return createPortal(
    <div className="mt mt-hit mt-cer" role="dialog" aria-label={`Fin de la saison ${result.number}`}>
      <div className="mt-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: `hsl(${c.hue} 90% 60%)`, '--turn': c.turn } as CSSProperties} />
        ))}
      </div>
      <div className="mt-cer-card">
        <Label>Fin de la saison {result.number}</Label>
        <div key={page} className="mt-cer-body">
          {page === 'podium' && (
            <>
              <span className="mt-h">
                Le classement <span className="mt-gt">final</span>
              </span>
              <div className="mt-cer-podium">
                {podium.map((line) => (
                  <div key={line.labelId} className={`mt-cer-step is-${line.place}${line.labelId === labelId ? ' is-me' : ''}`}>
                    <span className="mt-cer-name">{line.name}</span>
                    <span className="mt-sub">{line.score} points</span>
                    <span className="mt-cer-bar">
                      <b>{line.place}</b>
                    </span>
                  </div>
                ))}
              </div>
              {result.ranking.length > 3 && (
                <ul className="mt-cer-rest">
                  {result.ranking.slice(3).map((line) => (
                    <li key={line.labelId} className={line.labelId === labelId ? 'is-me' : ''}>
                      {nth(line.place)} · {line.name} · {line.score} points
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {page === 'trophies' && (
            <>
              <span className="mt-h">
                Les <span className="mt-gt">trophées</span>
              </span>
              <div className="mt-cer-trophies">
                {result.trophies.map((t, i) => (
                  <div key={t.kind} className={`mt-trophy${t.labelId === labelId ? ' is-me' : ''}`} style={{ animationDelay: `${i * 0.25}s` }}>
                    <Cup />
                    <Label>{TROPHY_NAMES[t.kind]}</Label>
                    <b>{t.winner}</b>
                    <span className="mt-sub">{t.kind === 'label' ? t.detail : `${t.labelName} · ${t.detail}`}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {page === 'mine' && mine && (
            <>
              <span className="mt-h">
                Tu finis <span className="mt-gt">{nth(mine.place)}</span> sur {result.ranking.length}
              </span>
              {mine.goals.length === 0 ? (
                <span className="mt-sub">Pas d’objectif choisi cette saison.</span>
              ) : (
                <ul className="mt-cer-goals">
                  {mine.goals.map((g) => (
                    <li key={g.id} className={g.done ? 'is-done' : 'is-missed'}>
                      <span aria-hidden="true">{g.done ? '✓' : '✗'}</span>
                      <span>
                        <b>{g.text}</b>
                        <span className="mt-sub">{g.done ? `+${g.reputation} réputation · +${money(g.cash)}` : 'Raté, sans conséquence'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-pills">
                <span className="mt-pill">+{mine.reputation} réputation</span>
                {mine.cash > 0 && <span className="mt-pill">+{money(mine.cash)}</span>}
              </div>
              <span className="mt-sub">On garde tout : label, artistes, cash. De nouveaux objectifs t’attendent à l’accueil.</span>
            </>
          )}
        </div>
        <div className="mt-acts">
          <button type="button" className="mt-go" disabled={busy} onClick={() => (last ? onClose() : setStep(step + 1))}>
            {last ? `Lancer la saison ${result.number + 1}` : 'Suite'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/* ---------------------------------- Studio ---------------------------------- */

const LEVELS: Array<{ key: keyof Levels; name: string; options: Array<{ name: string; price: (cfg: typeof CFG.quality, scale: number) => string; note: string; minTier?: number }> }> = [
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
      { name: 'Légende', price: (q, s) => money(s * q.producerPrice[4]!), note: 'Le meilleur son du jeu', minTier: CFG.tiers.legendTier },
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
    {event.text && <span className="mt-mute">{event.text}</span>}
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
                artist={{ id: g.id, name: g.name, real: g.real, genre: g.genre as ArtistView['genre'], gen: g.gen, potentialMin: 0, potentialMax: 0, fans: g.fans, hype: 0, value: 0, skills: [] }}
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
                const level = index + 1;
                const locked = (option.minTier ?? 1) > (view.label?.tier ?? 1);
                return (
                  <button
                    key={option.name}
                    type="button"
                    className={`mt-opt mt-opt-level${option.minTier ? ' is-legend' : ''}`}
                    aria-pressed={levels[row.key] === level}
                    disabled={locked}
                    onClick={() => setLevels({ ...levels, [row.key]: level } as Levels)}
                  >
                    <span className="mt-lv">
                      {row.options.map((_, i) => (
                        <i key={i} className={i < level ? 'f' : ''} />
                      ))}
                    </span>
                    <b>{option.name}</b>
                    <span className="mt-price">{option.price(CFG.quality, priceScale(view.label?.tier))}</span>
                    <span className="mt-sub">{locked ? `Dès le palier ${CFG.tiers.names[(option.minTier ?? 1) - 1]}` : option.note}</span>
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
  const [signing, setSigning] = useState(false);
  const songs = candidates(artistId);
  const rules = PROJECTS[kind];
  const who = view.roster.find((a) => a.id === artistId);
  const chosen = songs.filter((s) => picked.includes(s.id));
  // Songs still in the vault have a note range: the sales estimate is a range too.
  const noteOf = (edge: (s: (typeof chosen)[number]) => number): number =>
    chosen.length > 0 ? chosen.reduce((sum, s) => sum + (s.quality ?? edge(s)), 0) / chosen.length : (who?.expectedNote ?? 50);
  const quoteAt = (quality: number) => (who ? salesQuote({ fans: who.fans, hype: who.hype, kind, quality, cover: cover !== null, signing, boost: who.salesBoost }) : null);
  const saleLow = quoteAt(noteOf((s) => s.qualityMin));
  const saleHigh = quoteAt(noteOf((s) => s.qualityMax));
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
      <Label>CD et vinyles</Label>
      <label className="mt-check">
        <input type="checkbox" checked={signing} onChange={(event) => setSigning(event.target.checked)} />
        Séance de dédicace la semaine de sortie : +{Math.round((SALES.signing - 1) * 100)} % de ventes, énergie −{SALES.signingEnergy}
      </label>
      {saleLow && saleHigh && (
        <span className="mt-sub">
          {saleLow.money === saleHigh.money
            ? `Ventes estimées : environ ${money(saleLow.money)} (${saleLow.units.toLocaleString('fr-FR')} CD et vinyles)`
            : `Ventes estimées : entre ${money(saleLow.money)} et ${money(saleHigh.money)} (${saleLow.units.toLocaleString('fr-FR')} à ${saleHigh.units.toLocaleString('fr-FR')} CD et vinyles)`}
          , selon la note des sons. Plus de buzz à la sortie, plus de ventes.
        </span>
      )}
      <span className="mt-sub">Mix, master et pressage : {money(cost)}.</span>
      {problem && <span className="mt-sub mt-warn">{problem}</span>}
      <div className="mt-acts">
        <button
          type="button"
          className="mt-go"
          disabled={busy || problem !== null}
          onClick={() => {
            onAct({ type: 'project', artistId, kind, title: title.trim(), songIds: picked, inWeeks: weeks, cover: cover ?? undefined, signing });
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
          ? `Sort dans ${project.weeksLeft} semaine${project.weeksLeft > 1 ? 's' : ''} · ${project.tracks.length} sons${project.signing ? ' · séance de dédicace prévue' : ''}`
          : `${project.tracks.length} sons · note ${project.quality} · ${compact(project.streamsTotal)} streams${project.sales !== null ? ` · ${project.sales.toLocaleString('fr-FR')} CD et vinyles (${money(project.salesMoney ?? 0)})` : ''}`}
      </span>
      {project.cert && <span className={`mt-cert is-${project.cert}`}>{project.cert === 'platinum' ? 'Disque de platine' : 'Disque d’or'}</span>}
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
  const quote = tourQuote(artist.fans, artist.hype, dates, merch, partner?.fans ?? 0, view.tourGuests.some((g) => g.id === partnerId), artist.crowd, view.label?.tier ?? 1);
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
    <Avatar id={tour.artistId} className="mt-deal-art" />
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
    (other ? { id: other.id, name: other.name, real: other.real, genre: other.genre, gen: other.gen, potentialMin: 0, potentialMax: 0, fans: other.fans, hype: 0, value: other.value, skills: other.skills } : undefined);
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
      <Avatar id={deal.guestId} className="mt-deal-art" />
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
      <Avatar id={deal.artistId} className="mt-deal-art" />
      <div className="mt-deal-text">
        <Label>{sent ? 'Offre envoyée' : 'Offre reçue'}</Label>
        <b>{who}</b>
        <span className="mt-sub">{line}</span>
        {deal.swap && (
          <span className="mt-sub">
            En échange : {deal.swap.name} ({deal.swap.gen}) {sent ? 'part chez eux' : 'arrive chez toi'}
          </span>
        )}
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
              disabled={busy || (fee < 1 && !deal.swap) || fee === deal.fee}
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
  const [swapId, setSwapId] = useState('');
  const cash = view.label?.cash ?? 0;
  const tradable = view.roster.filter((a) => !a.loan && !a.onAuction && !a.lendListed);
  if (view.others.length === 0) return <span className="mt-sub">Aucun autre joueur n’a encore de label sur ce serveur.</span>;
  return (
    <div className="mt-deck">
      {view.others.map((artist) => (
        <div key={artist.id} className="mt-offer">
          <ArtistCard
            artist={{ id: artist.id, name: artist.name, real: artist.real, genre: artist.genre, gen: artist.gen, potentialMin: 0, potentialMax: 0, fans: artist.fans, hype: 0, value: 0, skills: artist.skills }}
          >
            <span className="mt-card-sub">
              {artist.labelName} · {compact(artist.fans)} fans
              {artist.clause !== null && <> · clause {money(artist.clause)}</>}
            </span>
          </ArtistCard>
          {buying?.id === artist.id ? (
            <div className="mt-ask">
              <MoneyInput value={price} onChange={setPrice} label="Prix du transfert" />
              <select className="mt-select" aria-label="Un de tes artistes en échange" value={swapId} onChange={(event) => setSwapId(event.target.value)}>
                <option value="">Sans échange</option>
                {tradable.map((a) => (
                  <option key={a.id} value={a.id}>
                    + {a.name} ({a.gen})
                  </option>
                ))}
              </select>
              <span className="mt-sub">
                {artist.clause !== null && price >= artist.clause
                  ? 'Prix de la clause : son label ne peut pas refuser.'
                  : swapId
                    ? 'Ton artiste part chez eux s’ils acceptent. L’argent peut être à 0.'
                    : 'Prix libre. Il devra ensuite signer chez toi.'}
              </span>
              <button
                type="button"
                className="mt-go"
                disabled={busy || (price < 1 && !swapId) || price > cash}
                onClick={() => {
                  onAct({ type: 'transfer_ask', artistId: artist.id, fee: price, swapId: swapId || null });
                  setBuying(null);
                  setSwapId('');
                }}
              >
                Envoyer · {money(price)}
                {swapId ? ' + échange' : ''}
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
    <Avatar id={youth.id} genre={youth.genre} className="mt-youth-art" />
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

/* ---------------------------------- Dynamique ---------------------------------- */

// Morale colour: red under the strike line, orange when he refuses the studio, plain when fine, gold when happy.
const moraleTone = (morale: number, t: DynamicsView['thresholds']): string =>
  morale < t.strike ? 'is-strike' : morale < t.refuse ? 'is-low' : morale < t.trouble ? 'is-meh' : morale >= t.happy ? 'is-happy' : '';

const DynamicsRow = ({ artist, view, onAct, busy }: { artist: DynamicsView['artists'][number]; view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const dyn = view.dynamics!;
  const cash = view.label?.cash ?? 0;
  const tone = moraleTone(artist.morale, dyn.thresholds);
  return (
    <li className={`mt-dyn-row ${tone}`}>
      <Avatar id={artist.id} genre={artist.genre} className="mt-deal-art" mood={artist.morale < 35 ? 'angry' : null} />
      <div className="mt-dyn-who">
        <b>{artist.name}</b>
        <span className="mt-chips">
          <span className={`mt-rank is-${artist.rank}`}>{artist.rankName}</span>
          {artist.leader && <span className="mt-rank is-leader">Leader</span>}
        </span>
        <span className="mt-sub">
          {money(artist.pay)} / sem. garantis ·{' '}
          {artist.expects === null ? 'n’attend pas de sortie' : `attend un son toutes les ${artist.expects} sem.`}
          {artist.sinceRelease !== null ? ` · dernier son il y a ${artist.sinceRelease} sem.` : ' · pas encore de son chez toi'}
        </span>
      </div>
      <div className="mt-dyn-mood">
        <span className="mt-dyn-num">
          <b>{artist.morale}</b>
          <small>moral</small>
        </span>
        <span className="mt-dyn-bar" role="img" aria-label={`Moral ${artist.morale} sur 100`}>
          <i style={{ width: `${artist.morale}%` }} />
          {[dyn.thresholds.strike, dyn.thresholds.refuse, dyn.thresholds.trouble, dyn.thresholds.happy].map((t) => (
            <s key={t} style={{ left: `${t}%` }} />
          ))}
        </span>
      </div>
      <ul className="mt-dyn-worries">
        {artist.worries.length === 0 ? (
          <li className="is-ok">{artist.morale >= dyn.thresholds.happy ? 'Aux anges : ses sons sont meilleurs.' : 'Rien ne le dérange.'}</li>
        ) : (
          artist.worries.map((w) => (
            <li key={w.kind} className={w.kind === 'tired' ? 'is-warn' : ''}>
              {w.text}
            </li>
          ))
        )}
      </ul>
      <div className="mt-acts">
        {artist.raise !== null && (
          <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'raise', artistId: artist.id })}>
            Augmenter · +{money(artist.raise)} / sem.
          </button>
        )}
        <button
          type="button"
          className="mt-ghost"
          disabled={busy || artist.bonusIn > 0 || dyn.cheers.bonus.cost > cash}
          onClick={() => onAct({ type: 'cheer', kind: 'bonus', artistId: artist.id })}
        >
          {artist.bonusIn > 0 ? `Prime dans ${artist.bonusIn} sem.` : `Prime · ${money(dyn.cheers.bonus.cost)}`}
        </button>
        <button
          type="button"
          className="mt-ghost"
          disabled={busy || artist.tripIn > 0 || dyn.cheers.trip.cost > cash}
          onClick={() => onAct({ type: 'cheer', kind: 'trip', artistId: artist.id })}
        >
          {artist.tripIn > 0 ? `Voyage dans ${artist.tripIn} sem.` : `Voyage d’inspiration · ${money(dyn.cheers.trip.cost)}`}
        </button>
      </div>
    </li>
  );
};

// The label's roles: each artist gets one. A role gives a bonus and takes nothing from the others.
const RolesPanel = ({ dyn, tier, onAct, busy }: { dyn: DynamicsView; tier: number; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const slots = roleSlots(tier);
  const used = (role: string): number => dyn.artists.filter((a) => a.role === role).length;
  return (
    <section className="mt-section mt-roles">
      <Label>Rôles dans le label</Label>
      <span className="mt-sub">
        Chaque rôle donne un bonus, sans rien enlever aux autres. {slots} place{slots > 1 ? 's' : ''} par rôle à ton palier, une de plus à chaque palier. Un changement par
        artiste et par semaine. Après un n°1 ou un disque d’or, un artiste est en pleine forme {FORM.weeks} semaines : sa carte brille, note +{FORM.quality}, promo et ventes +
        {Math.round((FORM.boost - 1) * 100)} %.
      </span>
      <ul className="mt-role-help">
        {ROLE_IDS.map((id) => (
          <li key={id}>
            <b>
              {ROLES[id].name}
              {id !== 'free' ? ` · ${used(id)}/${slots}` : ''}
            </b>
            <span className="mt-sub">{ROLES[id].about}</span>
          </li>
        ))}
      </ul>
      <ul className="mt-role-list">
        {dyn.artists.map((a) => (
          <li key={a.id} className={a.form > 0 ? 'is-hot' : ''}>
            <span className="mt-support-who">
              <b>{a.name}</b>
              <span className={`mt-rank is-${a.rank}`}>{a.rankName}</span>
              {a.form > 0 && <span className="mt-hot">En pleine forme · {a.form} sem.</span>}
            </span>
            <div className="mt-chips">
              {ROLE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="mt-chipbtn"
                  aria-pressed={a.role === id}
                  disabled={busy || a.role === id || a.roleLocked || (id !== 'free' && used(id) >= slots)}
                  onClick={() => onAct({ type: 'role', artistId: a.id, role: id })}
                >
                  {ROLES[id].name}
                </button>
              ))}
            </div>
            {a.roleLocked && <span className="mt-sub">Rôle changé cette semaine.</span>}
          </li>
        ))}
      </ul>
    </section>
  );
};

const DynamicsTab = ({ view, onAct, busy, onGo }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean; onGo: (tab: Tab) => void }) => {
  const dyn = view.dynamics;
  if (!dyn) return null;
  if (dyn.artists.length === 0)
    return (
      <div className="mt-view mt-in">
        <button type="button" className="mt-empty" onClick={() => onGo('academy')}>
          Pas encore d’artiste. <b>Va au centre de formation</b>
        </button>
      </div>
    );
  const t = dyn.thresholds;
  return (
    <div className="mt-view mt-in">
      <section className="mt-section mt-dyn-head">
        <div className={`mt-dyn-label ${moraleTone(dyn.labelMorale, t)}`}>
          <Label>Moral du label</Label>
          <b className="mt-gt">{dyn.labelMorale}</b>
          <span className="mt-sub">Les têtes d’affiche comptent plus.</span>
        </div>
        <div className="mt-dyn-help">
          <span className="mt-sub">
            Quand rien ne le dérange, le moral revient doucement vers {dyn.calm}
            {dyn.leaders.length > 0 ? ` (au lieu de 60, grâce à ${dyn.leaders.join(' et ')}, leader${dyn.leaders.length > 1 ? 's' : ''})` : ''}.
          </span>
          <span className="mt-sub">
            Sous {t.trouble} : plus d’embrouilles en studio. Sous {t.refuse} : refuse parfois le studio et demande à partir. Sous {t.strike} : grève. Dès {t.happy} : de meilleurs sons.
          </span>
          <button
            type="button"
            className="mt-go"
            disabled={busy || dyn.partyIn > 0 || dyn.cheers.party.cost > (view.label?.cash ?? 0)}
            onClick={() => onAct({ type: 'cheer', kind: 'party', artistId: null })}
          >
            {dyn.partyIn > 0 ? `Prochaine soirée dans ${dyn.partyIn} sem.` : `Soirée du label · ${money(dyn.cheers.party.cost)} · +${dyn.cheers.party.morale} pour tous`}
          </button>
        </div>
      </section>
      <RolesPanel dyn={dyn} tier={view.label?.tier ?? 1} onAct={onAct} busy={busy} />
      <section className="mt-section">
        <Label>Tes artistes, par rang</Label>
        <ul className="mt-dyn">
          {dyn.artists.map((artist) => (
            <DynamicsRow key={artist.id} artist={artist} view={view} onAct={onAct} busy={busy} />
          ))}
        </ul>
        <span className="mt-sub">
          Le rang se calcule chaque semaine avec la note et les fans. Prime : +{dyn.cheers.bonus.morale}, une fois toutes les {dyn.cheers.bonus.every} semaines. Voyage : +
          {dyn.cheers.trip.morale} et fin de la page blanche, une fois toutes les {dyn.cheers.trip.every} semaines. Augmenter : ajouté à son allocation chaque semaine.
        </span>
      </section>
    </div>
  );
};

/* ---------------------------------- Staff ---------------------------------- */

const STAFF_RAISE = (raise: number): string => `+${Math.round(raise * 100)} %`;

// One job of the label: who holds it, what he brings, the coach's artist, and the door.
const StaffJob = ({ job, view, onAct, busy }: { job: StaffView['jobs'][number]; view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const [sure, setSure] = useState(false);
  const member = job.member;
  if (!member)
    return (
      <div className="mt-staff-job is-empty">
        <Label>{job.name}</Label>
        <b>Poste libre</b>
        <span className="mt-sub">{job.about}</span>
      </div>
    );
  const fee = member.wage * (view.staff?.fireWeeks ?? 2);
  return (
    <div className="mt-staff-job">
      <div className="mt-staff-head">
        <Avatar id={`staff:${member.name}`} className="mt-deal-art" />
        <span className="mt-deal-text">
          <Label>{job.name}</Label>
          <b>{member.name}</b>
          <span className="mt-scout-stars" aria-label={`${member.stars} étoiles sur 5`}>
            {SCOUT_STARS(member.stars)}
          </span>
        </span>
      </div>
      <span className="mt-sub">« {member.rank} » · {money(member.wage)} / semaine</span>
      <span className="mt-staff-effect">{member.effect}</span>
      <span className="mt-sub">{member.nextStarIn === null ? 'Au sommet : 5 étoiles.' : `Prochaine étoile dans ${member.nextStarIn} semaine${member.nextStarIn > 1 ? 's' : ''}.`}</span>
      {job.role === 'coach' && (
        <select
          className="mt-select"
          aria-label="Artiste suivi par le coach"
          value={member.focusId ?? ''}
          disabled={busy}
          onChange={(event) => onAct({ type: 'staff_focus', artistId: event.target.value || null })}
        >
          <option value="">Suit tout le monde pareil</option>
          {view.roster.map((artist) => (
            <option key={artist.id} value={artist.id}>
              Suit de près : {artist.name}
            </option>
          ))}
        </select>
      )}
      <div className="mt-acts">
        {sure ? (
          <>
            <button type="button" className="mt-danger" disabled={busy || fee > (view.label?.cash ?? 0)} onClick={() => onAct({ type: 'staff_fire', role: job.role })}>
              Oui, licencier · {money(fee)}
            </button>
            <button type="button" className="mt-ghost" onClick={() => setSure(false)}>
              Non
            </button>
          </>
        ) : (
          <button type="button" className="mt-ghost" disabled={busy} onClick={() => setSure(true)}>
            Licencier
          </button>
        )}
      </div>
    </div>
  );
};

const StaffTab = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const staff = view.staff;
  if (!staff) return null;
  const cash = view.label?.cash ?? 0;
  const holder = (role: StaffRole) => staff.jobs.find((j) => j.role === role)?.member ?? null;
  return (
    <div className="mt-view mt-in">
      {staff.offersIn.map((offer) => (
        <section key={offer.id} className="mt-section mt-staff-offer" aria-label="Offre de débauchage">
          <Label>Tentative de débauchage</Label>
          <span>
            <b>{offer.fromName}</b> veut te prendre <b>{offer.name}</b>, ton {ROLE_NAMES[offer.role].toLowerCase()}, pour {money(offer.wage)} / semaine.
          </span>
          <span className="mt-sub">
            Aligne-toi pour le garder, ou laisse-le partir. Sans réponse dans {offer.weeksLeft} semaine{offer.weeksLeft > 1 ? 's' : ''}, il part.
          </span>
          <div className="mt-acts">
            <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'staff_poach_answer', offerId: offer.id, match: true })}>
              Je m’aligne · {money(offer.wage)} / sem.
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'staff_poach_answer', offerId: offer.id, match: false })}>
              Le laisser partir
            </button>
          </div>
        </section>
      ))}
      <section className="mt-section">
        <div className="mt-bar">
          <Label>Ton staff</Label>
          <span className="mt-sub">{staff.wages > 0 ? `Salaires : ${money(staff.wages)} / semaine` : 'Personne pour l’instant'}</span>
        </div>
        <div className="mt-staff-jobs">
          {staff.jobs.map((job) => (
            <StaffJob key={`${job.role}:${job.member?.name ?? ''}`} job={job} view={view} onAct={onAct} busy={busy} />
          ))}
        </div>
        <span className="mt-sub">Chacun gagne une étoile après une saison chez toi. Licencier coûte {staff.fireWeeks} semaines de salaire.</span>
      </section>
      <section className="mt-section">
        <Label>Candidats de la semaine</Label>
        {staff.candidates.length === 0 ? (
          <span className="mt-sub">Plus personne cette semaine. Nouvelle liste la semaine prochaine.</span>
        ) : (
          <div className="mt-scouts">
            {staff.candidates.map((c) => {
              const current = holder(c.role);
              const fee = current ? current.wage * staff.fireWeeks : 0;
              return (
                <div key={c.id} className="mt-scout mt-staff-cand">
                  <Avatar id={`staff:${c.name}`} className="mt-deal-art" />
                  <Label>{c.roleName}</Label>
                  <span className="mt-scout-stars" aria-label={`${c.stars} étoiles sur 5`}>
                    {SCOUT_STARS(c.stars)}
                  </span>
                  <b>{c.name}</b>
                  <span className="mt-sub">« {c.rank} »</span>
                  <span className="mt-staff-effect">{c.effect}</span>
                  <span className="mt-sub">{money(c.wage)} / semaine</span>
                  <button
                    type="button"
                    className="mt-ghost"
                    disabled={busy || fee + c.wage > cash}
                    title={current ? `${current.name} part : ${money(fee)}` : undefined}
                    onClick={() => onAct({ type: 'staff_hire', candidateId: c.id })}
                  >
                    {current ? `Remplacer ${current.name.split(' ')[0]} · ${money(fee)}` : 'Engager'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <span className="mt-sub">La liste change chaque semaine.</span>
      </section>
      <section className="mt-section">
        <Label>Débauchage entre amis</Label>
        {staff.offersOut.length > 0 && (
          <ul className="mt-rows">
            {staff.offersOut.map((offer) => (
              <li key={offer.id} className="mt-staff-out">
                <span>
                  Offre à <b>{offer.name}</b> ({offer.toName}) · {money(offer.wage)} / sem. · réponse sous {offer.weeksLeft} sem.
                </span>
                <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'staff_poach_cancel', offerId: offer.id })}>
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        {staff.rivals.length === 0 ? (
          <span className="mt-sub">Tes potes n’ont pas encore de staff à débaucher.</span>
        ) : (
          <div className="mt-scouts">
            {staff.rivals.map((r) => (
              <div key={`${r.labelId}:${r.role}`} className="mt-scout">
                <Label>
                  {r.roleName} · {r.labelName}
                </Label>
                <span className="mt-scout-stars" aria-label={`${r.stars} étoiles sur 5`}>
                  {SCOUT_STARS(r.stars)}
                </span>
                <b>{r.name}</b>
                <span className="mt-sub">Payé {money(r.wage)} / semaine chez eux</span>
                {r.blocked ? (
                  <span className="mt-sub">{r.blocked}</span>
                ) : (
                  <div className="mt-chips">
                    {r.raises.map((option) => (
                      <button
                        key={option.raise}
                        type="button"
                        className="mt-chipbtn"
                        disabled={busy || option.wage > cash}
                        title={`Il te coûterait ${money(option.wage)} / semaine`}
                        onClick={() => onAct({ type: 'staff_poach', labelId: r.labelId, role: r.role, raise: option.raise })}
                      >
                        {STAFF_RAISE(option.raise)} · {money(option.wage)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <span className="mt-sub">Propose une augmentation : son label a 2 semaines pour s’aligner, sinon il vient chez toi et remplace celui qui tenait le poste.</span>
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

/* ---------------------------------- Enchères et prêts ---------------------------------- */

const AUCTION_STATUS: Record<AuctionView['status'], string> = {
  open: 'En cours',
  signing: 'Le gagnant négocie',
  sold: 'Vendu',
  unsold: 'Pas vendu',
  cancelled: 'Arrêtée',
};

// One auction: the best offer, the time left, and a bid box for the friends.
const AuctionRow = ({ a, view, onAct, onTalk, busy }: { a: AuctionView; view: MelodyView; onAct: (action: MelodyAction) => void; onTalk: (artistId: string) => void; busy: boolean }) => {
  const [amount, setAmount] = useState(a.nextBid);
  // Someone bid in the meantime: the box follows the new minimum.
  useEffect(() => setAmount((v) => Math.max(v, a.nextBid)), [a.nextBid]);
  const cash = view.label?.cash ?? 0;
  const myTalk = view.transfers.find((t) => t.fromAuction && t.status === 'agreed' && t.direction === 'sent' && t.artistId === a.artistId);
  const best = a.best ? `${money(a.best.amount)} (${a.best.mine ? 'toi' : a.best.labelName})` : 'aucune';
  const reserve =
    a.reserve !== null
      ? ` · Réserve secrète ${money(a.reserve)} : ${a.reserveMet ? 'atteinte' : 'pas atteinte'}`
      : a.reserveMet === false
        ? ' · Prix de réserve pas atteint'
        : '';
  return (
    <div className={`mt-deal${a.outbid || myTalk ? ' is-turn' : ''}${a.status === 'sold' ? ' is-accepted' : a.status !== 'open' && a.status !== 'signing' ? ' is-expired' : ''}`}>
      <Avatar id={a.artistId} genre={a.genre} className="mt-deal-art" />
      <div className="mt-deal-text">
        <Label>{a.mine ? 'Ton enchère' : `Enchère · ${a.sellerName}`}</Label>
        <b>
          {a.artistName} · {a.gen}
        </b>
        <span className="mt-sub">
          {a.status === 'open'
            ? `Meilleure offre : ${best} · fin dans ${a.weeksLeft} sem.${reserve}`
            : myTalk
              ? `Tu l’as remporté à ${money(myTalk.fee)} : négocie son contrat sous ${myTalk.weeksLeft} sem.`
              : `${AUCTION_STATUS[a.status]}${a.best ? ` · ${best}` : ''}`}
        </span>
        {a.outbid && <span className="mt-sub mt-warn">Quelqu’un a mis plus que toi.</span>}
        {a.skills.length > 0 && <span className="mt-card-skills">{a.skills.join(' · ')}</span>}
      </div>
      <div className="mt-acts mt-deal-acts">
        {a.status === 'open' && !a.mine && !a.best?.mine && (
          <>
            <MoneyInput value={amount} onChange={setAmount} label={`Ton offre pour ${a.artistName}`} />
            <button
              type="button"
              className="mt-go"
              disabled={busy || amount < a.nextBid || amount > cash}
              onClick={() => onAct({ type: 'auction_bid', auctionId: a.id, amount })}
            >
              Enchérir
            </button>
          </>
        )}
        {a.status === 'open' && a.best?.mine && !a.mine && <span className="mt-dealtag">Tu mènes</span>}
        {a.status === 'open' && a.mine && !a.locked && (
          <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'auction_cancel', auctionId: a.id })}>
            Arrêter
          </button>
        )}
        {myTalk && (
          <button type="button" className="mt-go" disabled={busy} onClick={() => onTalk(a.artistId)}>
            Négocier son contrat
          </button>
        )}
      </div>
    </div>
  );
};

// One loan: a friend's listing to take, my listing, or a loan running.
const LoanRow = ({ l, onAct, busy }: { l: LendingView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const line =
    l.side === 'offer'
      ? `${l.weeks} semaines · frais ${money(l.fee)}. Tu gardes 70 % de ce qu’il rapporte et les sons faits chez toi.`
      : l.status === 'listed'
        ? `Ton annonce : ${l.weeks} semaines, frais ${money(l.fee)}. Retirée dans ${l.weeksLeft} sem. si personne ne le prend.`
        : l.status === 'running'
          ? l.side === 'lent'
            ? `Prêté à ${l.borrowerName} · retour dans ${l.weeksLeft} sem. · ta part : ${money(l.earned)}`
            : `Emprunté à ${l.lenderName} · retour dans ${l.weeksLeft} sem. 30 % de ce qu’il rapporte part chez eux.`
          : l.status === 'done'
            ? `Prêt fini · ta part : ${money(l.earned)}`
            : 'Annonce retirée';
  return (
    <div className={`mt-deal${l.side === 'offer' && !l.blocked ? ' is-turn' : ''}${l.status === 'done' || l.status === 'cancelled' || l.status === 'expired' ? ' is-expired' : ''}`}>
      <Avatar id={l.artistId} genre={l.genre} className="mt-deal-art" />
      <div className="mt-deal-text">
        <Label>{l.side === 'offer' ? `À prêter · ${l.lenderName}` : l.side === 'lent' ? 'Ton artiste prêté' : 'Artiste emprunté'}</Label>
        <b>
          {l.artistName} · {l.gen}
        </b>
        <span className="mt-sub">{line}</span>
        {l.side === 'offer' && l.blocked && <span className="mt-sub mt-warn">{l.blocked}</span>}
      </div>
      <div className="mt-acts mt-deal-acts">
        {l.side === 'offer' && (
          <button type="button" className="mt-go" disabled={busy || !!l.blocked} onClick={() => onAct({ type: 'borrow', lendingId: l.id })}>
            Emprunter · {money(l.fee)}
          </button>
        )}
        {l.side === 'lent' && l.status === 'listed' && (
          <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'lend_cancel', lendingId: l.id })}>
            Retirer
          </button>
        )}
      </div>
    </div>
  );
};

// The auctions of the server and the loans, at the top of the market.
const AuctionsAndLoans = ({ view, onAct, onTalk, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; onTalk: (artistId: string) => void; busy: boolean }) => (
  <section className="mt-section mt-bourse" aria-label="Enchères et prêts">
    <Label>Enchères et prêts</Label>
    {view.auctions.length === 0 && view.lendings.length === 0 ? (
      <span className="mt-sub">Rien en ce moment. Pour vendre aux enchères ou prêter un de tes artistes, va dans sa fiche (Effectif).</span>
    ) : (
      <>
        {view.auctions.map((a) => (
          <AuctionRow key={a.id} a={a} view={view} onAct={onAct} onTalk={onTalk} busy={busy} />
        ))}
        {view.lendings.map((l) => (
          <LoanRow key={l.id} l={l} onAct={onAct} busy={busy} />
        ))}
      </>
    )}
  </section>
);

// In the artist sheet: put him up for auction or for a loan, or see where he is.
const MarketControl = ({ artist, onAct, onGo, busy }: { artist: RosterView; onAct: (action: MelodyAction) => void; onGo: (tab: Tab) => void; busy: boolean }) => {
  const [mode, setMode] = useState<'none' | 'auction' | 'loan'>('none');
  const [start, setStart] = useState(Math.max(100, Math.round((artist.value * 0.6) / 100) * 100));
  const [weeks, setWeeks] = useState(2);
  const [reserve, setReserve] = useState(0);
  const [loanWeeks, setLoanWeeks] = useState(8);
  const [fee, setFee] = useState(artist.fairFee);
  if (artist.loan) return null;
  if (artist.onAuction || artist.lendListed) {
    return (
      <div className="mt-acts">
        <span className="mt-pill mt-pill-on">{artist.onAuction ? 'Aux enchères' : 'Proposé en prêt'}</span>
        <button type="button" className="mt-ghost" onClick={() => onGo('market')}>
          Voir le Marché
        </button>
      </div>
    );
  }
  if (mode === 'auction') {
    return (
      <div className="mt-sellform">
        <Label>Mettre aux enchères</Label>
        <span className="mt-sub">Valeur estimée : {money(artist.value)}. Les amis enchérissent, et un label du jeu aussi. Le gagnant doit ensuite le faire signer.</span>
        <div className="mt-acts">
          <Label>Départ</Label>
          <MoneyInput value={start} onChange={setStart} label="Prix de départ" />
          <div className="mt-chips" role="group" aria-label="Durée">
            {[1, 2, 3].map((w) => (
              <button key={w} type="button" className="mt-chipbtn" aria-pressed={weeks === w} onClick={() => setWeeks(w)}>
                {w} sem.
              </button>
            ))}
          </div>
        </div>
        <div className="mt-acts">
          <Label>Réserve secrète</Label>
          <MoneyInput value={reserve} onChange={setReserve} label="Prix de réserve secret (facultatif)" />
          <span className="mt-sub">{reserve > 0 ? 'Réserve secrète : en dessous, il ne part pas.' : 'Pas de réserve : la meilleure offre gagne.'}</span>
        </div>
        <div className="mt-acts">
          <button
            type="button"
            className="mt-go"
            disabled={busy || start < 1 || (reserve > 0 && reserve < start)}
            onClick={() => {
              onAct({ type: 'auction_start', artistId: artist.id, start, weeks, reserve: reserve > 0 ? reserve : null });
              setMode('none');
            }}
          >
            Lancer l’enchère
          </button>
          <button type="button" className="mt-ghost" onClick={() => setMode('none')}>
            Retour
          </button>
        </div>
      </div>
    );
  }
  if (mode === 'loan') {
    const fair = Math.round((artist.fairFee * loanWeeks) / 8 / 100) * 100;
    return (
      <div className="mt-sellform">
        <Label>Prêter</Label>
        <span className="mt-sub">L’emprunteur paie les frais, garde 70 % de ce qu’il rapporte et les sons faits chez lui. Toi, tu touches 30 %. Il revient à la fin.</span>
        <div className="mt-acts">
          <label className="mt-money">
            <select className="mt-select" aria-label="Durée du prêt" value={loanWeeks} onChange={(event) => setLoanWeeks(Number(event.target.value))}>
              {Array.from({ length: 11 }, (_, i) => i + 4).map((w) => (
                <option key={w} value={w}>
                  {w} semaines
                </option>
              ))}
            </select>
          </label>
          <Label>Frais</Label>
          <MoneyInput value={fee} onChange={setFee} label="Frais de prêt" />
          <span className="mt-sub">Prix juste ≈ {money(fair)}</span>
        </div>
        <div className="mt-acts">
          <button
            type="button"
            className="mt-go"
            disabled={busy}
            onClick={() => {
              onAct({ type: 'lend', artistId: artist.id, weeks: loanWeeks, fee });
              setMode('none');
            }}
          >
            Proposer en prêt
          </button>
          <button type="button" className="mt-ghost" onClick={() => setMode('none')}>
            Retour
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-acts">
      <button type="button" className="mt-ghost" disabled={busy} onClick={() => setMode('auction')}>
        Mettre aux enchères
      </button>
      <button
        type="button"
        className="mt-ghost"
        disabled={busy}
        onClick={() => {
          setFee(artist.fairFee);
          setMode('loan');
        }}
      >
        Prêter
      </button>
    </div>
  );
};

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
      <AuctionsAndLoans view={view} onAct={onAct} onTalk={onTalk} busy={busy} />
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


// Press conference: free, once a week. One of your artists, or you, runs down an artist of another player.
const PressPanel = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const press = view.press;
  const [targetId, setTargetId] = useState('');
  const [speaker, setSpeaker] = useState('boss');
  const [replyWith, setReplyWith] = useState('boss');
  if (!press || (press.targets.length === 0 && press.toAnswer.length === 0 && press.recent.length === 0)) return null;
  const target = press.targets.find((t) => t.id === targetId);
  const asId = (v: string): string | null => (v === 'boss' ? null : v);
  return (
    <section className="mt-section mt-press">
      <Label>Conférence de presse {press.used ? '· déjà faite cette semaine' : '· gratuite, 1 par semaine'}</Label>
      {press.toAnswer.map((c) => (
        <div key={c.id} className="mt-deal is-turn">
          <div className="mt-deal-text">
            <Label>{c.from} t’attaque</Label>
            <b>
              {c.speaker} s’en prend à {c.target}
            </b>
            <span className="mt-sub">{c.success ? `Ça a marché : ${c.target} a perdu du buzz. Riposte gratuite cette semaine pour tout annuler.` : 'C’est raté pour eux. Tu peux quand même riposter pour gagner du buzz.'}</span>
          </div>
          <div className="mt-acts mt-deal-acts">
            <select className="mt-select" aria-label="Qui répond" value={replyWith} onChange={(e) => setReplyWith(e.target.value)}>
              <option value="boss">Toi (le patron)</option>
              {view.roster.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'press_reply', confId: c.id, speakerId: asId(replyWith) })}>
              Riposter
            </button>
          </div>
        </div>
      ))}
      {press.targets.length > 0 && (
        <div className="mt-acts">
          <select className="mt-select" aria-label="Artiste visé" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Qui tu descends ?</option>
            {press.targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · {t.label} · buzz {t.hype}
              </option>
            ))}
          </select>
          <select className="mt-select" aria-label="Qui parle" value={speaker} onChange={(e) => setSpeaker(e.target.value)} disabled={!target}>
            {(target?.odds ?? [{ speakerId: null, name: 'Toi (le patron)', odds: 0 }]).map((o) => (
              <option key={o.speakerId ?? 'boss'} value={o.speakerId ?? 'boss'}>
                {o.name}
                {target ? ` · ${pct(o.odds)} % de chances` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="mt-go" disabled={busy || press.used || !target} onClick={() => onAct({ type: 'press', speakerId: asId(speaker), targetId })}>
            Lancer la conférence
          </button>
        </div>
      )}
      <span className="mt-sub">Réussi : la cible perd 8 de buzz, ton artiste en gagne 4. Raté : ton label perd 2 de réputation. Plus ton artiste a de buzz face à la cible, plus ça marche.</span>
      {press.recent.length > 0 && (
        <ul className="mt-cards-past">
          {press.recent.map((r, i) => (
            <li key={i}>{r.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
};

const DUEL_STATUS: Record<DuelView['status'], string> = { asked: 'Défi envoyé', accepted: 'Duel accepté', done: 'Terminé', fled: 'Duel fui', void: 'Match nul' };

const duelLine = (d: DuelView): string => {
  if (d.status === 'asked')
    return d.mine === 'received'
      ? `${d.fromLabel} te défie avec ${d.fromArtist}, semaine ${d.week}. Tu as ${d.answerLeft} sem. pour répondre, sinon c’est la honte.`
      : `${d.toLabel} a ${d.answerLeft} sem. pour répondre. Semaine ${d.week}.`;
  if (d.status === 'accepted') return `${d.fromArtist} contre ${d.toArtist ?? '?'}, semaine ${d.week}${d.weeksLeft > 0 ? ` (dans ${d.weeksLeft} sem.)` : ''}. Sortez un son de cet artiste cette semaine-là.`;
  if (d.status === 'fled') return `${d.toLabel} n’a pas relevé le défi.`;
  if (d.status === 'void') return 'Personne n’a sorti de son.';
  const [best, worst] = d.winner === d.fromLabel ? [d.fromStreams ?? 0, d.toStreams ?? 0] : [d.toStreams ?? 0, d.fromStreams ?? 0];
  return `${d.winner} gagne : ${best.toLocaleString('fr-FR')} contre ${worst.toLocaleString('fr-FR')} streams${d.stolenFans > 0 ? ` · ${d.stolenFans.toLocaleString('fr-FR')} fans pris` : ''}.`;
};

// One duel: the two sides and the score.
const DuelRow = ({ duel, view, onAct, busy }: { duel: DuelView; view?: MelodyView; onAct?: (action: MelodyAction) => void; busy?: boolean }) => {
  const [artistId, setArtistId] = useState(view?.roster[0]?.id ?? '');
  const won = duel.status === 'done' && duel.mine ? (duel.winner === (duel.mine === 'sent' ? duel.fromLabel : duel.toLabel)) : null;
  const total = Math.max(1, (duel.fromStreams ?? 0) + (duel.toStreams ?? 0));
  return (
    <div className={`mt-deal mt-duel is-${duel.status}${won === true ? ' is-win' : won === false ? ' is-lose' : ''}`}>
      <div className="mt-deal-text">
        <Label>
          Guerre de charts · {duel.fromLabel} contre {duel.toLabel}
        </Label>
        <b>{DUEL_STATUS[duel.status]}</b>
        {duel.status === 'done' && (
          <div className="mt-duel-bar" aria-hidden="true">
            <span style={{ width: `${((duel.fromStreams ?? 0) / total) * 100}%` }}>{duel.fromSong ?? '—'}</span>
            <span>{duel.toSong ?? '—'}</span>
          </div>
        )}
        <span className="mt-sub">{duelLine(duel)}</span>
      </div>
      {view && onAct && duel.mine === 'received' && duel.status === 'asked' && (
        <div className="mt-acts mt-deal-acts">
          <ArtistSelect view={view} value={artistId} onChange={setArtistId} />
          <button type="button" className="mt-go" disabled={busy || !artistId} onClick={() => onAct({ type: 'duel_answer', duelId: duel.id, accept: true, artistId })}>
            Accepter le duel
          </button>
          <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'duel_answer', duelId: duel.id, accept: false, artistId: null })}>
            Refuser
          </button>
        </div>
      )}
    </div>
  );
};

// Challenge another player to a chart duel, and your duels.
const DuelPanel = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const players = view.rivals.filter((r) => r.player);
  const [target, setTarget] = useState('');
  const [artistId, setArtistId] = useState(view.roster[0]?.id ?? '');
  const [wait, setWait] = useState(3);
  const mine = view.duels.filter((d) => d.mine);
  if (view.roster.length === 0 || (players.length === 0 && mine.length === 0)) return null;
  return (
    <section className="mt-section mt-duels">
      <Label>Guerre de charts</Label>
      {mine.map((d) => (
        <DuelRow key={`${d.id}:${d.status}`} duel={d} view={view} onAct={onAct} busy={busy} />
      ))}
      {players.length > 0 && (
        <div className="mt-acts">
          <select className="mt-select" aria-label="Label défié" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Qui tu défies ?</option>
            {players.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.topArtist}
              </option>
            ))}
          </select>
          <ArtistSelect view={view} value={artistId} onChange={setArtistId} />
          <select className="mt-select" aria-label="Semaine du duel" value={wait} onChange={(e) => setWait(Number(e.target.value))}>
            {[3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                Dans {n} semaines (semaine {view.tick + n + 1})
              </option>
            ))}
          </select>
          <button type="button" className="mt-go" disabled={busy || !target || !artistId} onClick={() => onAct({ type: 'duel', targetLabelId: target, artistId, week: view.tick + wait })}>
            Lancer le défi
          </button>
        </div>
      )}
      <span className="mt-sub">Chacun sort un son de son artiste la semaine choisie. Le plus de streams la 1re semaine gagne : buzz +8, réputation +1 et 10 % des nouveaux fans du perdant. L’autre a 2 semaines pour répondre ; refuser, c’est la honte.</span>
    </section>
  );
};

// Allies and enemies (2 of each), and helping a player who sinks: a gift or a loan.
const RelationsPanel = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const rel = view.relations;
  const [who, setWho] = useState('');
  const [helpTo, setHelpTo] = useState('');
  const [amount, setAmount] = useState(5_000);
  const [rate, setRate] = useState(0);
  const [weeks, setWeeks] = useState(8);
  if (!rel || rel.players.length === 0) return null;
  const taken = new Set([...rel.allies.map((a) => a.id), ...rel.enemies.map((e) => e.id)]);
  const free = rel.players.filter((p) => !taken.has(p.id));
  const cash = view.label?.cash ?? 0;
  const loansIn = rel.loans.filter((l) => l.mine === 'borrowed' && l.status === 'offered');
  return (
    <section className="mt-section mt-rel">
      <Label>Alliés et ennemis · 2 de chaque au plus</Label>
      {rel.offersIn.map((o) => (
        <div key={o.id} className="mt-deal mt-rel-row is-turn">
          <div className="mt-deal-text">
            <b>{o.from} te propose une alliance</b>
            <span className="mt-sub">Pas d’attaque entre vous, des featurings meilleurs, pas de honte sur un retard de prêt, et une alerte s’il coule.</span>
          </div>
          <div className="mt-acts mt-deal-acts">
            <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'ally_answer', offerId: o.id, accept: true })}>
              Accepter
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'ally_answer', offerId: o.id, accept: false })}>
              Refuser
            </button>
          </div>
        </div>
      ))}
      <div className="mt-rel-cols">
        <div className="mt-rel-col is-ally">
          <Label>Alliés</Label>
          {rel.allies.length === 0 && <span className="mt-sub">Aucun allié.</span>}
          {rel.allies.map((a) => (
            <div key={a.id} className="mt-rel-name">
              <b>{a.name}</b>
              {a.danger && <span className="mt-rel-danger">en danger</span>}
              <button type="button" className="mt-ghost" disabled={busy || !rel.canChange} title={rel.canChange ? undefined : 'Une fois par saison'} onClick={() => onAct({ type: 'ally_break', labelId: a.id })}>
                Lâcher
              </button>
            </div>
          ))}
          {rel.offersOut.map((o) => (
            <span key={o.id} className="mt-sub">
              Proposition envoyée à {o.to}…
            </span>
          ))}
        </div>
        <div className="mt-rel-col is-enemy">
          <Label>Ennemis</Label>
          {rel.enemies.length === 0 && <span className="mt-sub">Aucun ennemi. Entre joueurs, tu n’attaques que tes ennemis.</span>}
          {rel.enemies.map((e) => (
            <div key={e.id} className="mt-rel-name">
              <b>{e.name}</b>
              <button type="button" className="mt-ghost" disabled={busy || !rel.canChange} title={rel.canChange ? undefined : 'Une fois par saison'} onClick={() => onAct({ type: 'enemy_remove', labelId: e.id })}>
                Faire la paix
              </button>
            </div>
          ))}
          {rel.enemyOf.length > 0 && <span className="mt-sub">T’ont déclaré la guerre : {rel.enemyOf.map((e) => e.name).join(', ')}</span>}
        </div>
      </div>
      {free.length > 0 && (
        <div className="mt-acts">
          <select className="mt-select" aria-label="Label" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Choisis un joueur</option>
            {free.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="mt-go" disabled={busy || !who || rel.allies.length >= 2} onClick={() => onAct({ type: 'ally_ask', targetLabelId: who })}>
            Proposer une alliance
          </button>
          <button type="button" className="mt-ghost mt-rel-war" disabled={busy || !who || rel.enemies.length >= 2} onClick={() => onAct({ type: 'enemy_add', labelId: who })}>
            Déclarer ennemi
          </button>
        </div>
      )}
      <span className="mt-sub">
        Une alliance se fait à deux ; un ennemi se déclare seul, avec 25 % d’effet en plus sur tes attaques contre lui. Lâcher un allié ou faire la paix : une fois par saison{rel.canChange ? '' : ' (déjà fait cette saison)'}.
      </span>

      <Label>Aider un joueur</Label>
      {loansIn.map((l) => (
        <div key={l.id} className="mt-deal mt-rel-row is-turn">
          <div className="mt-deal-text">
            <b>
              {l.other} te prête {l.amount.toLocaleString('fr-FR')} €
            </b>
            <span className="mt-sub">
              Taux {l.rate} % · tu rends {l.perWeek.toLocaleString('fr-FR')} € par semaine pendant {l.weeks} semaines.
            </span>
          </div>
          <div className="mt-acts mt-deal-acts">
            <button type="button" className="mt-go" disabled={busy} onClick={() => onAct({ type: 'friend_loan_answer', loanId: l.id, accept: true })}>
              Accepter
            </button>
            <button type="button" className="mt-ghost" disabled={busy} onClick={() => onAct({ type: 'friend_loan_answer', loanId: l.id, accept: false })}>
              Refuser
            </button>
          </div>
        </div>
      ))}
      <div className="mt-acts">
        <select className="mt-select" aria-label="Joueur aidé" value={helpTo} onChange={(e) => setHelpTo(e.target.value)}>
          <option value="">Qui tu aides ?</option>
          {rel.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.danger ? ` · en danger (${p.cash.toLocaleString('fr-FR')} €)` : ''}
            </option>
          ))}
        </select>
        <MoneyInput value={amount} onChange={setAmount} label="Somme" />
        <button type="button" className="mt-go" disabled={busy || !helpTo || amount < 100 || amount > cash} onClick={() => onAct({ type: 'gift', targetLabelId: helpTo, amount })}>
          Donner
        </button>
      </div>
      <div className="mt-acts">
        <select className="mt-select" aria-label="Taux" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
          {rel.rates.map((r) => (
            <option key={r} value={r}>
              Taux {r} %
            </option>
          ))}
        </select>
        <select className="mt-select" aria-label="Durée" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
          {rel.weeks.map((w) => (
            <option key={w} value={w}>
              Sur {w} semaines
            </option>
          ))}
        </select>
        <button type="button" className="mt-ghost" disabled={busy || !helpTo || amount < 100 || amount > cash} onClick={() => onAct({ type: 'friend_loan', targetLabelId: helpTo, amount, rate, weeks })}>
          Proposer un prêt
        </button>
      </div>
      <span className="mt-sub">Un prêt se rend un peu chaque semaine. S’il ne peut pas payer, c’est reporté et il perd 1 de réputation (pas entre alliés).</span>
      {rel.loans.filter((l) => l.status !== 'offered' || l.mine === 'lent').length > 0 && (
        <ul className="mt-cards-past">
          {rel.loans
            .filter((l) => l.status !== 'offered' || l.mine === 'lent')
            .map((l) => (
              <li key={l.id}>
                {l.mine === 'lent' ? `Prêt à ${l.other}` : `Prêt de ${l.other}`} · {l.amount.toLocaleString('fr-FR')} € ·{' '}
                {l.status === 'offered' ? 'en attente de réponse' : l.status === 'running' ? `reste ${l.remaining.toLocaleString('fr-FR')} €` : 'remboursé'}
              </li>
            ))}
        </ul>
      )}
    </section>
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
      {card.allies.length > 0 && <span className="mt-pill mt-pill-ally">Alliés : {card.allies.join(', ')}</span>}
      {card.enemies.length > 0 && <span className="mt-pill mt-pill-enemy">Ennemis : {card.enemies.join(', ')}</span>}
      {card.festivalPrizes > 0 && <span className="mt-pill mt-pill-ally">Prix du public : {card.festivalPrizes}</span>}
      <span className="mt-pill">
        Duels : {card.duelWins} gagné{card.duelWins > 1 ? 's' : ''} · {card.duelLosses} perdu{card.duelLosses > 1 ? 's' : ''}
        {card.duelFled > 0 ? ` · ${card.duelFled} fui${card.duelFled > 1 ? 's' : ''}` : ''}
      </span>
      <span className="mt-pill">
        Clashs : {card.clashWins} gagné{card.clashWins > 1 ? 's' : ''} · {card.clashLosses} perdu{card.clashLosses > 1 ? 's' : ''}
      </span>
    </div>
    {card.honours.length > 0 && (
      <>
        <Label>Palmarès</Label>
        <ul className="mt-rows mt-honours">
          {[...card.honours].reverse().map((h) => (
            <li key={h.season}>
              <span className={`mt-medal is-${Math.min(h.place, 4)}`}>{nth(h.place)}</span>
              <b>Saison {h.season}</b>
              <span className="mt-sub">{h.trophies.length > 0 ? h.trophies.map((t) => TROPHY_NAMES[t]).join(' · ') : 'Pas de trophée'}</span>
            </li>
          ))}
        </ul>
      </>
    )}
    <Label>Artistes</Label>
    <ul className="mt-rows">
      {card.artists.map((a) => (
        <li key={a.id}>
          <Avatar id={a.id} genre={a.genre} className="mt-row-art" />
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

const LabelsTab = ({
  view,
  onAct,
  onTalk,
  onCeremony,
  busy,
}: {
  view: MelodyView;
  onAct: (action: MelodyAction) => void;
  onTalk: (artistId: string) => void;
  onCeremony: () => void;
  busy: boolean;
}) => {
  const [opened, setOpened] = useState<string | null>(null);
  const mine = view.label?.id;
  const card = view.labels.find((l) => l.id === opened);
  if (card) return <LabelPage card={card} onClose={() => setOpened(null)} />;
  const podium = view.ranking.slice(0, 5);
  return (
    <div className="mt-view mt-in">
      <TierPanel view={view} />
      <section className="mt-section">
        <div className="mt-bar">
          <Label>
            Classement du serveur · saison {view.season} · semaine {view.seasonInfo.week} sur {CFG.ticksPerSeason}
          </Label>
          {view.seasonInfo.last && (
            <button type="button" className="mt-ghost" onClick={onCeremony}>
              Revoir la fin de la saison {view.seasonInfo.last.number}
            </button>
          )}
        </div>
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
      <RelationsPanel view={view} onAct={onAct} busy={busy} />
      <Beef view={view} onAct={onAct} busy={busy} />
      <PressPanel view={view} onAct={onAct} busy={busy} />
      <DuelPanel view={view} onAct={onAct} busy={busy} />
      <FestivalPanel view={view} onAct={onAct} busy={busy} />
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
  const duels = view.duels.filter((d) => d.status === 'accepted' || d.status === 'done');
  return (
    <div className="mt-view mt-in">
      {duels.length > 0 && (
        <section className="mt-deals" aria-label="Guerres de charts">
          <Label>Guerres de charts en direct</Label>
          {duels.map((d) => (
            <DuelRow key={`${d.id}:${d.status}`} duel={d} />
          ))}
        </section>
      )}
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

const LOAN_NAMES: Record<'classic' | 'asset' | 'emergency', string> = { classic: 'Prêt classique', asset: 'Prêt sur patrimoine', emergency: 'Prêt d’urgence' };

const Bank = ({ view, onAct, busy }: { view: MelodyView; onAct: (action: MelodyAction) => void; busy: boolean }) => {
  const label = view.label!;
  const estate = view.estate;
  const room = Math.max(0, label.loanCap - label.debt);
  const [amount, setAmount] = useState(Math.min(5_000, room));
  const [weeks, setWeeks] = useState<8 | 16 | 24>(16);
  const cap = estate?.assetCap ?? 0;
  const [asset, setAsset] = useState(Math.min(cap, 50_000));
  const [assetWeeks, setAssetWeeks] = useState(26);
  const assetAmount = Math.max(1_000, Math.min(asset, cap));
  const kinds = (['classic', 'asset', 'emergency'] as const)
    .map((kind) => {
      const loans = label.loans.filter((l) => l.kind === kind);
      return { kind, count: loans.length, total: Math.ceil(loans.reduce((sum, l) => sum + l.remaining, 0)), weeks: Math.max(0, ...loans.map((l) => l.ticksLeft)), rate: loans[0]?.ratePerTick ?? 0 };
    })
    .filter((k) => k.count > 0);
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
            {estate && (
              <>
                <span className="mt-mute">Patrimoine</span>
                <b>{money(estate.assetBase)}</b>
              </>
            )}
          </div>
          {kinds.length > 0 && (
            <ul className="mt-loans">
              {kinds.map((k) => (
                <li key={k.kind}>
                  <span>
                    <b>{LOAN_NAMES[k.kind]}</b>
                    {k.count > 1 ? ` × ${k.count}` : ''} · {money(k.total)}
                  </span>
                  <span className="mt-sub">
                    encore {k.weeks} semaine{k.weeks > 1 ? 's' : ''} · {(k.rate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % par semaine
                  </span>
                  <button type="button" className="mt-ghost" disabled={busy || k.total > label.cash} onClick={() => onAct({ type: 'repay', kind: k.kind })}>
                    Tout rembourser · {money(k.total)}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {kinds.length > 0 && <span className="mt-sub">Rembourser en avance ne coûte rien de plus.</span>}
          {estate?.seizeIn !== null && estate?.seizeIn !== undefined && (
            <span className="mt-toast mt-warn">
              Alerte de la banque : {estate.seizeIn > 0 ? `dans ${estate.seizeIn} semaine${estate.seizeIn > 1 ? 's' : ''}` : 'cette semaine'}, elle saisit tes sons qui rapportent le plus.
              Repasse au-dessus de zéro et rembourse tes prêts d’urgence pour l’éviter.
            </span>
          )}
          {label.distress > 0 && <span className="mt-toast mt-warn">Attention : ton label est dans le rouge. Rembourse vite.</span>}
        </div>
        <div className="mt-panel">
          <Label>Prêt classique</Label>
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
        {estate && (
          <div className="mt-panel">
            <Label>Prêt sur patrimoine</Label>
            {label.tier < (CFG.tiers.names as readonly string[]).indexOf(estate.assetMinTier) + 1 ? (
              <span className="mt-sub">Arrive au palier {estate.assetMinTier}. La banque prête alors 40 % de ton patrimoine, à petit taux.</span>
            ) : label.loans.some((l) => l.kind === 'asset') ? (
              <span className="mt-sub">Tu as déjà un prêt sur patrimoine. Rembourse-le pour en prendre un autre.</span>
            ) : cap < 1_000 ? (
              <span className="mt-sub">Ton patrimoine est encore trop petit : sors des sons qui marchent et signe des artistes.</span>
            ) : (
              <>
                <div className="mt-big">{money(assetAmount)}</div>
                <input
                  type="range"
                  min={1_000}
                  max={cap}
                  step={1_000}
                  value={assetAmount}
                  aria-label="Somme à emprunter sur ton patrimoine"
                  onChange={(event) => setAsset(Number(event.target.value))}
                />
                <div className="mt-chips">
                  {estate.assetWeeks.map((w) => (
                    <button key={w} type="button" className="mt-chipbtn" aria-pressed={assetWeeks === w} onClick={() => setAssetWeeks(w)}>
                      {w} semaines
                    </button>
                  ))}
                </div>
                <span className="mt-sub">
                  Jusqu’à {money(cap)} : 40 % de ton patrimoine (tes sons + la moitié de la valeur de tes artistes). {(estate.assetRate * 100).toLocaleString('fr-FR')} %
                  d’intérêts par semaine. Si tu ne peux plus payer, la banque te prévient, puis 2 semaines après elle saisit tes sons qui rapportent le plus.
                </span>
                <button type="button" className="mt-go mt-go-big" disabled={busy} onClick={() => onAct({ type: 'asset_loan', amount: assetAmount, weeks: assetWeeks })}>
                  Emprunter sur mon patrimoine
                </button>
              </>
            )}
          </div>
        )}
        {estate && estate.seized.length > 0 && (
          <div className="mt-panel">
            <Label>Sons saisis par la banque</Label>
            <span className="mt-sub">Ils ne te rapportent plus rien. Tu peux les racheter, plus cher que ce qu’ils valent.</span>
            <ul className="mt-loans">
              {estate.seized.map((s) => (
                <li key={s.id}>
                  <span>
                    <b>« {s.title} »</b> · {s.artist}
                  </span>
                  <button type="button" className="mt-ghost" disabled={busy || s.price > label.cash} onClick={() => onAct({ type: 'buyback', songId: s.id })}>
                    Racheter · {money(s.price)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

/* ---------------------------------- Tiers ---------------------------------- */

const TierPanel = ({ view }: { view: MelodyView }) => {
  const [open, setOpen] = useState(false);
  const estate = view.estate;
  if (!estate || !view.label) return null;
  const count = (n: number): string => (n >= 10_000 ? compact(n) : n.toLocaleString('fr-FR'));
  return (
    <section className="mt-section mt-tier">
      <div className="mt-bar">
        <Label>Ton palier · {view.label.tierName}</Label>
        <button type="button" className="mt-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Cacher les paliers' : 'Voir les 6 paliers'}
        </button>
      </div>
      {estate.next ? (
        <>
          <span className="mt-sub">Pour devenir {estate.next.name}, il te faut :</span>
          <ul className="mt-tier-goals">
            {estate.next.conditions.map((c) => (
              <li key={c.text} className={c.have >= c.need ? 'is-done' : ''}>
                <span>{c.text}</span>
                <b>
                  {count(Math.min(c.have, c.need))} / {count(c.need)}
                </b>
                <Meter value={Math.min(100, (c.have / Math.max(1, c.need)) * 100)} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <span className="mt-sub">Tu es tout en haut.</span>
      )}
      {open && (
        <ol className="mt-tier-table">
          {estate.table.map((row) => (
            <li key={row.tier} className={row.tier === view.label!.tier ? 'is-me' : row.tier < view.label!.tier ? 'is-done' : ''}>
              <b>
                {row.tier}. {row.name}
              </b>
              <span className="mt-sub">
                {row.maxArtists} artistes · {row.needs}
              </span>
              <span>{row.unlocks}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

const TierParty = ({ view, onClose, busy }: { view: MelodyView; onClose: () => void; busy: boolean }) => {
  const party = view.estate?.party;
  if (!party) return null;
  const row = view.estate?.table.find((r) => r.tier === party.tier);
  return createPortal(
    <div className="mt mt-hit mt-cer" role="dialog" aria-label={`Nouveau palier : ${party.name}`}>
      <div className="mt-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i key={i} style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, background: `hsl(${c.hue} 90% 60%)`, '--turn': c.turn } as CSSProperties} />
        ))}
      </div>
      <div className="mt-cer-card">
        <Label>Nouveau palier</Label>
        <div className="mt-cer-body">
          <span className="mt-h">
            Ton label devient <span className="mt-gt">{party.name}</span>
          </span>
          <span className="mt-sub">Toute la party est au courant. Moral +5 pour tous tes artistes.</span>
          {row && (
            <div className="mt-pills">
              <span className="mt-pill">Jusqu’à {row.maxArtists} artistes</span>
              <span className="mt-pill">{row.unlocks}</span>
            </div>
          )}
        </div>
        <div className="mt-acts">
          <button type="button" className="mt-go" disabled={busy} onClick={onClose}>
            On fête ça
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  const [replay, setReplay] = useState(false);
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
      if (action.type === 'staff_hire') say('Bienvenue dans le staff !');
      if (action.type === 'staff_fire') say('Il a vidé son bureau.');
      if (action.type === 'staff_focus') say(action.artistId ? 'Le coach a un nouveau chouchou.' : 'Le coach suit tout le monde pareil.');
      if (action.type === 'staff_poach') say('Offre envoyée. Ils ont 2 semaines pour s’aligner.');
      if (action.type === 'staff_poach_answer') say(action.match ? 'Tu t’alignes : il reste chez toi.' : 'Il fait ses cartons.');
      if (action.type === 'staff_poach_cancel') say('Offre retirée.');
      if (action.type === 'cheer') say(action.kind === 'bonus' ? 'Prime versée. Il a le sourire.' : action.kind === 'trip' ? 'Bon voyage ! Il revient plein d’idées.' : 'Quelle soirée ! Tout le label est de bonne humeur.');
      if (action.type === 'raise') say('Augmentation signée.');
      if (action.type === 'asset_loan') say('Prêt sur patrimoine accordé.');
      if (action.type === 'repay') say('Prêt remboursé.');
      if (action.type === 'buyback') say('Son racheté : il te rapporte de nouveau.');
      if (action.type === 'press') say(answer.data.view.press?.recent[0]?.text ?? 'Conférence faite.');
      if (action.type === 'press_reply') say(answer.data.view.press?.recent[0]?.text ?? 'Riposte envoyée.');
      if (action.type === 'duel') say('Défi lancé. L’autre label a 2 semaines pour répondre.');
      if (action.type === 'duel_answer') say(action.accept ? 'Duel accepté. Sors un son la bonne semaine !' : 'Duel refusé.');
      if (action.type === 'ally_ask') say('Proposition d’alliance envoyée. Il a 2 semaines pour répondre.');
      if (action.type === 'ally_answer') say(action.accept ? 'Alliance conclue !' : 'Alliance refusée.');
      if (action.type === 'ally_break') say('Alliance rompue.');
      if (action.type === 'enemy_add') say('Guerre déclarée !');
      if (action.type === 'enemy_remove') say('La paix est faite.');
      if (action.type === 'gift') say('Argent envoyé.');
      if (action.type === 'festival_register') say('Inscrit au festival !');
      if (action.type === 'festival_withdraw') say('Inscription retirée : argent rendu.');
      if (action.type === 'festival_bid') say('Tu mènes les enchères pour la tête d’affiche !');
      if (action.type === 'friend_loan') say('Prêt proposé. Il a 2 semaines pour accepter.');
      if (action.type === 'friend_loan_answer') say(action.accept ? 'Prêt accepté : l’argent est sur ton compte.' : 'Prêt refusé.');
      if (action.type === 'card') say(answer.data.view.events?.log[0] ?? 'Réponse envoyée.');
      if (action.type === 'role') say(`Nouveau rôle : ${ROLES[action.role].name}.`);
      if (action.type === 'genre_change') say('Changement de genre lancé. Laisse-lui le temps de trouver son son.');
      if (action.type === 'genre_wish_refuse') say('Tu as dit non. Il fait un peu la tête.');
      if (action.type === 'auction_start') say('Enchère lancée. Les offres arrivent dans le Marché.');
      if (action.type === 'auction_bid') say('Offre posée.');
      if (action.type === 'auction_cancel') say('Enchère arrêtée.');
      if (action.type === 'lend') say('Annonce de prêt publiée dans le Marché.');
      if (action.type === 'lend_cancel') say('Annonce retirée.');
      if (action.type === 'borrow') say('Il arrive chez toi pour le prêt !');
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
      if (action.type === 'season_goals') say('Objectifs verrouillés. Bonne saison !');
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
  // Genres of the artists the catalogue does not know (the youths), for their avatars.
  const avatarGenres = useMemo(() => {
    const genres = new Map<string, string>();
    if (!view) return genres;
    for (const a of view.roster) genres.set(a.id, a.genre);
    for (const a of view.others) genres.set(a.id, a.genre);
    for (const y of view.academy?.youths ?? []) genres.set(y.id, y.genre);
    for (const l of view.labels) for (const a of l.artists) genres.set(a.id, a.genre);
    return genres;
  }, [view]);
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
    <AvatarGenres.Provider value={avatarGenres}>
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
                {t.id === 'staff' && (view.staff?.offersIn.length ?? 0) > 0 && <i className="mt-navdot" aria-label="On veut débaucher ton staff" />}
                {t.id === 'squad' && view.roster.some((a) => a.evolution?.wish) && <i className="mt-navdot" aria-label="Un artiste veut changer de genre" />}
                {t.id === 'market' && view.auctions.some((a) => a.outbid) && <i className="mt-navdot" aria-label="Quelqu’un a mis plus que toi" />}
                {t.id === 'dynamics' && view.dynamics?.artists.some((a) => a.worries.some((w) => w.kind === 'strike' || w.kind === 'out')) && (
                  <i className="mt-navdot" aria-label="Un artiste va très mal" />
                )}
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
          {!talkWith && tab === 'home' && <Home view={view} onGo={go} onAct={run} busy={busy} />}
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
          {!talkWith && tab === 'staff' && <StaffTab view={view} onAct={run} busy={busy} />}
          {!talkWith && tab === 'dynamics' && <DynamicsTab view={view} onAct={run} busy={busy} onGo={go} />}
          {!talkWith && tab === 'market' && <TransferMarket view={view} onTalk={(id) => void openTalk(id)} onAct={run} busy={busy} />}
          {!talkWith && tab === 'labels' && <LabelsTab view={view} onAct={run} onTalk={(id) => void openTalk(id)} onCeremony={() => setReplay(true)} busy={busy} />}
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
      {view.label && active && !view.tutorial && view.estate?.party && !(view.seasonInfo.last && (view.seasonInfo.unseen || replay)) && (
        <TierParty view={view} busy={busy} onClose={() => run({ type: 'tier_seen' })} />
      )}
      {view.label && active && !view.tutorial && view.seasonInfo.last && (view.seasonInfo.unseen || replay) && (
        <Ceremony
          key={view.seasonInfo.last.number}
          result={view.seasonInfo.last}
          labelId={view.label.id}
          busy={busy}
          onClose={() => {
            setReplay(false);
            if (view.seasonInfo.unseen) run({ type: 'season_seen' });
          }}
        />
      )}
    </section>
    </AvatarGenres.Provider>
    </CoversContext.Provider>
  );
};
