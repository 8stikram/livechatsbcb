// What a player can see and do: the actions sent by the app and the view sent back.
import { artistFromCatalog, generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { GENRES } from './data/content.ts';
import { artistValue, catalogueValue, contractOf, debtOf, fansOf, netWorth, playGig, ranking, rosterOf, type RankingLine } from './economy.ts';
import { estimateQuality, producerOfLevel, songCost, songEnergy } from './quality.ts';
import { experienceBonus, notebookOf, studioOffers, trendOf, type NotebookEntry, type StudioOffers, type Trend } from './craft.ts';
import { MARKETING } from './release.ts';
import { academyOf, academyView, dropYouth, hireScout, promoteYouth, renameYouth, sendScout, takeYouth, type AcademyView } from './academy.ts';
import { countryOf } from './craft.ts';
import { releaseBlocked } from './world.ts';
import { createRng, hashString } from './rng.ts';
import type { Artist, CatalogArtist, ChartEntry, GenreId, Label, Loan, Producer, SongLevels, Trends, World } from './types.ts';
import { GameError, addPlayerLabel, bookGig, createSong, expectedOffer, freeAgents, scheduleRelease, takeLoan, type Offer } from './world.ts';
import { answerDeal, askFeat, cancelDeal, dealsView, otherArtists, type FeatDealView, type OtherArtistView } from './featdeals.ts';
import { afterAction, isGuarded, nextStep, refund, skipTutorial, startTutorial, tutorialView, type TutorialView } from './tutorial.ts';
import { leaveTalk, makeOffer, openTalk, talkBlocked, talkNews, talksOfLabel, type TalkNews, type TalkView } from './negotiation.ts';
import { cancelSession, finishSession, offerFeat, useDeal, reactToEvent, sessionOf, sessionView, skipFeat, startSession, type SessionView } from './studio.ts';

export const MAX_PLAYER_LABELS = 20;

const FIRST = ['Nova', 'Sixto', 'Liha', 'Kosmo', 'Mina', 'Tayo', 'Jayce', 'Luna', 'Ambre', 'Kwame', 'Noctis', 'Oslo', 'Bambi', 'Zeph', 'Idris', 'Maë', 'Soan', 'Lyra', 'Nilo', 'Yuna', 'Kaïs', 'Elio', 'Naya', 'Rémi', 'Tess'];
const LAST = ['Kalé', 'Vega', 'Minuit', 'Bleu', 'Orbit', 'Reyes', 'Sol', 'Riot', 'Brume', 'Noir', 'Delta', 'Miel', 'Onyx', 'Prisme', 'Zéro', 'Lune', 'Fauve', 'Écho', 'Volt', 'Sable', 'Nord', 'Cendre', 'Lilas', 'Givre', 'Astre'];
const STARTER_GENRES: GenreId[] = ['rap_fr', 'trap', 'rnb', 'drill', 'hyperpop', 'afro', 'pop', 'rap_us'];
const CITIES = ['Lille', 'Lyon', 'Marseille', 'Paris', 'Bruxelles', 'Genève', 'Toulouse', 'Nantes', 'Liège', 'Bordeaux'];

/** Three made-up beginners offered to a new label. Always the same three for one player in one world. */
export const starterChoices = (world: World, ownerId: string): Artist[] => {
  const rng = createRng(world.seed ^ hashString(`starter:${ownerId}`));
  const taken = new Set(Object.values(world.artists).map((a) => a.name));
  const genres = [...STARTER_GENRES].sort(() => rng.next() - 0.5).slice(0, 3);
  return genres.map((genre, index) => {
    let name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    while (taken.has(name)) name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    taken.add(name);
    const gen = rng.int(48, 56);
    const source: CatalogArtist = {
      id: `gen_${hashString(ownerId).toString(36)}_${index}`,
      name,
      country: 'FR',
      city: rng.pick(CITIES),
      genre,
      secondary: [rng.pick(GENRES[genre].neighbours)],
      tags: [],
      gen,
      potMin: gen + 14,
      potMax: gen + 34,
      fans: rng.int(1_500, 4_000),
      hype: rng.int(8, 20),
      labelId: null,
      real: false,
      energyProfile: rng.pick(['normal', 'normal', 'bourreau', 'par_a_coups', 'oiseau_de_nuit']),
      sync: rng.int(25, 60),
      merch: rng.int(30, 55),
    };
    return artistFromCatalog(source, world.seed);
  });
};

/** A label that arrives late starts with a little more, but always below the smallest label already playing. */
const startingCash = (world: World): number => {
  const worths = Object.values(world.labels)
    .filter((l) => l.kind === 'player' && !l.bankrupt)
    .map((l) => netWorth(world, l))
    .sort((a, b) => a - b);
  if (worths.length === 0) return CFG.start.cash;
  const median = worths[Math.floor(worths.length / 2)] ?? CFG.start.cash;
  const smallest = worths[0] ?? CFG.start.cash;
  return Math.round(Math.max(CFG.start.cash, Math.min(0.3 * median, 0.7 * smallest)));
};

/** Creates the player's label: a name, a little cash and a centre de formation with three youths. */
export const foundLabel = (world: World, ownerId: string, name: string): Label => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 28) throw new GameError('Le nom du label doit faire entre 2 et 28 caractères.');
  const players = Object.values(world.labels).filter((l) => l.kind === 'player' && !l.bankrupt);
  if (players.length >= MAX_PLAYER_LABELS) throw new GameError('Ce serveur a déjà le nombre maximum de labels.');
  if (players.some((l) => l.name.toLowerCase() === clean.toLowerCase())) throw new GameError('Un label porte déjà ce nom.');
  const cash = startingCash(world);
  const comeback = Object.values(world.labels).some((l) => l.ownerId === ownerId && l.bankrupt);
  const label = addPlayerLabel(world, ownerId, clean);
  // A player back after a bankruptcy knows the game: no tutorial for him.
  if (!comeback) startTutorial(world, label.id);
  label.cash = cash;
  // No artist yet: the first one comes out of the centre de formation, which opens with three youths.
  academyOf(world, label.id);
  return label;
};

/** The producer the studio finds for a level and a beat this month: how well he knows the beat varies. */
export const producerFor = (world: World, level: 1 | 2 | 3 | 4, beatId: string): Producer => {
  const month = Math.floor(world.tick / CFG.ticksPerMonth);
  const roll = createRng(world.seed ^ hashString(`producer:${month}:${level}:${beatId}`)).next();
  return producerOfLevel(level, roll < 0.3 ? 1 : roll < 0.75 ? 0.85 : 0.7);
};

export type MelodyAction =
  | { type: 'found'; name: string; starterId?: string }
  | { type: 'scout_send'; zone: string; genre: string | null }
  | { type: 'scout_hire'; scoutId: string }
  | { type: 'youth_take'; youthId: string }
  | { type: 'youth_drop'; youthId: string }
  | { type: 'youth_rename'; youthId: string; name: string }
  | { type: 'youth_promote'; youthId: string }
  | { type: 'fav'; artistId: string }
  | { type: 'sell'; artistId: string }
  | { type: 'talk'; artistId: string }
  | { type: 'offer'; artistId: string; offer: Offer }
  | { type: 'talk_leave'; artistId: string }
  | { type: 'tuto'; move: 'next' | 'skip' }
  | { type: 'feat_ask'; guestId: string; fee: number }
  | { type: 'feat_answer'; dealId: string; answer: 'accept' | 'refuse' | 'counter'; fee?: number }
  | { type: 'feat_cancel'; dealId: string }
  | { type: 'feat_deal'; dealId: string }
  | { type: 'studio'; artistId: string; themeId: string; beatId: string; levels: SongLevels }
  | { type: 'react'; reactionId: string }
  | { type: 'feat'; guestId: string; offer: number }
  | { type: 'feat_skip' }
  | { type: 'studio_cancel' }
  /** cover: the image itself is kept by the server; the rules only note that there is one. */
  | { type: 'song'; title: string; cover?: string }
  | { type: 'release'; songId: string; inWeeks: number; marketing: string[] }
  | { type: 'gig'; artistId: string }
  | { type: 'loan'; amount: number; weeks: 8 | 16 | 24 };

const labelOfOwner = (world: World, ownerId: string): Label => {
  const label = Object.values(world.labels).find((l) => l.ownerId === ownerId && !l.bankrupt);
  if (!label) throw new GameError("Tu n'as pas encore de label.");
  return label;
};

/** Runs one action of a player. Throws a GameError with a readable message when the rules say no. */
export const applyAction = (world: World, ownerId: string, action: MelodyAction): void => {
  if (action.type === 'found') {
    foundLabel(world, ownerId, action.name);
    return;
  }
  const label = labelOfOwner(world, ownerId);
  const guarded = isGuarded(world, label.id, action.type);
  const cash = label.cash;
  const roster = rosterOf(world, label.id).length;
  runAction(world, label, action);
  if (action.type === 'offer' && rosterOf(world, label.id).length > roster) {
    const signed = world.artists[action.artistId];
    if (signed) marketNews(world, `${signed.name} signe chez ${label.name}.`);
  }
  if (guarded) refund(world, label, cash);
  afterAction(world, label, action.type, roster);
};

const runAction = (world: World, label: Label, action: Exclude<MelodyAction, { type: 'found' }>): void => {
  switch (action.type) {
    case 'feat_ask':
      askFeat(world, label, action.guestId, action.fee);
      return;
    case 'feat_answer':
      answerDeal(world, label, action.dealId, action.answer, action.fee);
      return;
    case 'feat_cancel':
      cancelDeal(world, label, action.dealId);
      return;
    case 'feat_deal':
      useDeal(world, label, action.dealId);
      return;
    case 'tuto':
      if (action.move === 'next') nextStep(world, label);
      else skipTutorial(world, label, {
        promote: () => {
          const best = [...academyOf(world, label.id).youths].sort((a, b) => b.gen - a.gen)[0];
          if (best) promoteYouth(world, label, best.id);
        },
        record: (artistId, title, themeId, beatId) => {
          const levels = { theme: 1, beat: 1, producer: 1, studio: 1 } as const;
          createSong(world, label.id, { artistId, title, themeId, beatId, levels, producer: producerFor(world, 1, beatId) });
        },
        release: (songId, releaseTick) => void scheduleRelease(world, label.id, songId, releaseTick, []),
      });
      return;
    case 'scout_send':
      sendScout(world, label, action.zone, action.genre);
      return;
    case 'scout_hire':
      hireScout(world, label, action.scoutId);
      return;
    case 'youth_take':
      takeYouth(world, label, action.youthId);
      return;
    case 'youth_drop':
      dropYouth(world, label, action.youthId);
      return;
    case 'youth_rename':
      renameYouth(world, label, action.youthId, action.name);
      return;
    case 'youth_promote': {
      const artist = promoteYouth(world, label, action.youthId);
      marketNews(world, `${label.name} sort ${artist.name} de son centre de formation.`);
      return;
    }
    case 'fav':
      toggleFavourite(world, label, action.artistId);
      return;
    case 'sell':
      sellArtist(world, label, action.artistId);
      return;
    case 'talk':
      openTalk(world, label, action.artistId);
      return;
    case 'offer':
      makeOffer(world, label, action.artistId, action.offer);
      return;
    case 'talk_leave':
      leaveTalk(world, label, action.artistId);
      return;
    case 'studio':
      startSession(world, label, action);
      return;
    case 'react':
      reactToEvent(world, label, action.reactionId);
      return;
    case 'feat':
      offerFeat(world, label, action.guestId, action.offer);
      return;
    case 'feat_skip':
      skipFeat(world, label);
      return;
    case 'studio_cancel':
      cancelSession(world, label);
      return;
    case 'song': {
      const title = action.title.trim().replace(/\s+/g, ' ').slice(0, 40);
      if (title.length === 0) throw new GameError('Donne un titre à ce son.');
      const session = sessionOf(world, label.id);
      if (!session) throw new GameError("Tu n'es pas en studio.");
      finishSession(world, label, title, producerFor(world, session.levels.producer, session.beatId));
      const made = world.songs[world.songs.length - 1];
      if (made && made.labelId === label.id) made.cover = typeof action.cover === 'string' && action.cover.length > 0;
      return;
    }
    case 'release':
      scheduleRelease(world, label.id, action.songId, world.tick + Math.max(1, Math.round(action.inWeeks)), action.marketing);
      return;
    case 'gig':
      bookGig(world, label.id, action.artistId);
      return;
    case 'loan':
      takeLoan(world, label.id, action.amount, action.weeks);
      return;
  }
};

export interface ArtistView {
  id: string;
  name: string;
  real: boolean;
  genre: GenreId;
  gen: number;
  potentialMin: number;
  potentialMax: number;
  fans: number;
  hype: number;
  value: number;
}

export interface RosterView extends ArtistView {
  attrs: Artist['attrs'];
  energy: number;
  morale: number;
  creativeFatigue: number;
  weeksLeft: number;
  unrecouped: number;
  royaltyRate: number;
  weeklyAllowance: number;
  /** Why the contract cannot be renewed now, or null. */
  renewBlocked: string | null;
  gigsBooked: number;
  nextGig: { venue: string; audience: number; profit: number };
  /** The themes and beats the studio offers him this week. */
  offers: StudioOffers;
  /** His latest song, shown in his frame. */
  lastSong: { id: string; title: string; cover: boolean } | null;
  /** Songs he has made with the label. */
  songsMade: number;
  /** What the label gets if it sells him. */
  salePrice: number;
  /** The note his songs turn around, with choices that fit. */
  expectedNote: number;
}

export interface SongView {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  featName: string | null;
  themeId: string;
  beatId: string;
  /** Known only once the song is out; before, the range the studio announced. */
  quality: number | null;
  qualityMin: number;
  qualityMax: number;
  surprise: 'boom' | 'flop' | null;
  combo: 'secret' | 'perfect' | null;
  cover: boolean;
  promo: Array<{ name: string; views: number; viral: boolean }>;
  /** Promo picked, before the release. */
  promoNames: string[];
  history: number[];
  /** For a song in the vault: why it cannot come out in 1..8 weeks (index 0 = next week), or null. */
  blockedWeeks: Array<string | null>;
  state: 'vault' | 'scheduled' | 'released';
  readyInWeeks: number;
  releaseInWeeks: number | null;
  streamsLast: number;
  streamsTotal: number;
  /** What its streams have paid since the release, and what it cost to make and promote. */
  earned: number;
  spent: number;
  /** Week it came out (for sorting), null before. */
  releasedTick: number | null;
  hitScore: number;
  peakGlobal: number | null;
  peakGenre: number | null;
  weeksOut: number;
}

export interface MarketView extends ArtistView {
  country: string;
  age: number;
  /** Name of the game-run label that holds him: shown with a padlock, cannot be bought. */
  lockedBy: string | null;
  fav: boolean;
  advance: number;
  royaltyRate: number;
  /** Why the label cannot sign him right now, or null. */
  blocked: string | null;
}

export interface LabelCard {
  id: string;
  name: string;
  tierName: string;
  reputation: number;
  fans: number;
  numberOnes: number;
  top10: number;
  artists: Array<{ id: string; name: string; genre: GenreId; gen: number; fans: number }>;
  /** Their five best songs out, by streams. */
  songs: Array<{ id: string; title: string; artistName: string; streams: number; cover: boolean }>;
}

const labelCards = (world: World): LabelCard[] =>
  Object.values(world.labels)
    .filter((l) => l.kind === 'player' && !l.bankrupt)
    .map((l) => ({
      id: l.id,
      name: l.name,
      tierName: CFG.tiers.names[l.tier - 1] ?? '',
      reputation: Math.round(l.reputation),
      fans: fansOf(world, l.id),
      numberOnes: l.stats.numberOnes,
      top10: l.stats.top10Global,
      artists: rosterOf(world, l.id).map((a) => ({ id: a.id, name: a.name, genre: a.genre, gen: generalRating(a), fans: a.fans })),
      songs: world.songs
        .filter((s) => s.labelId === l.id && s.state === 'released')
        .sort((a, b) => b.streamsTotal - a.streamsTotal)
        .slice(0, 5)
        .map((s) => ({ id: s.id, title: s.title, artistName: world.artists[s.artistId]?.name ?? '?', streams: s.streamsTotal, cover: s.cover ?? false })),
    }));

export interface MelodyView {
  tick: number;
  season: number;
  weekOfSeason: number;
  trends: Trends;
  label: null | {
    id: string;
    name: string;
    tier: number;
    tierName: string;
    cash: number;
    debt: number;
    reputation: number;
    fans: number;
    catalogue: number;
    maxArtists: number;
    songBudgetCap: number;
    loanCap: number;
    distress: number;
    loans: Pick<Loan, 'kind' | 'remaining' | 'ticksLeft'>[];
  };
  /** The centre de formation: youths, scout, mission. Null without a label. */
  academy: AcademyView | null;
  /** What happened on the market these last weeks. */
  news: string[];
  /** The player labels of the server, for the Label tab. Cash stays hidden. */
  labels: LabelCard[];
  roster: RosterView[];
  songs: SongView[];
  market: MarketView[];
  ranking: RankingLine[];
  charts: { global: ChartEntry[]; genres: Record<string, ChartEntry[]> };
  /** The song being recorded, with its events and featuring talks. */
  session: SessionView | null;
  /** The guided first week, while it runs. */
  tutorial: TutorialView | null;
  /** Featuring requests with other players, sent and received. */
  featDeals: FeatDealView[];
  /** The artists of the other players of the server. */
  others: OtherArtistView[];
  /** Contract talks open this week. */
  talks: TalkView[];
  /** What the public wants this month (genre, theme, beat). */
  trend: Trend;
  /** Combos the label found by playing. */
  notebook: NotebookEntry[];
  /** Streams of the whole label, week by week (twelve weeks, oldest first). */
  labelWeeks: number[];
  /** Talks that ended this week, with the agent's last words. */
  talkNews: TalkNews[];
}

/** What a label knows of a potential: a range around the truth, always the same for one label and one artist. */
const potentialRange = (artist: Artist, viewer: string, width: number): [number, number] => {
  const shift = createRng(hashString(`${viewer}:${artist.id}`)).next();
  const min = Math.round(artist.potential - width * shift);
  return [Math.max(generalRating(artist), min), Math.min(99, min + width)];
};

const artistView = (artist: Artist, viewer: string, width: number): ArtistView => {
  const [potentialMin, potentialMax] = potentialRange(artist, viewer, width);
  return {
    id: artist.id,
    name: artist.name,
    real: artist.real,
    genre: artist.genre,
    gen: generalRating(artist),
    potentialMin,
    potentialMax,
    fans: artist.fans,
    hype: Math.round(artist.hype),
    value: artistValue(artist),
  };
};

/** How many free agents and locked stars the market shows (kept small: the whole view travels at each refresh). */
const MARKET_FREE = 300;
const MARKET_LOCKED = 120;

/** An age for the market's sort: not a real one, always the same for one artist. */
export const ageOf = (artist: Pick<Artist, 'id' | 'fans'>): number => {
  const rng = createRng(hashString(`age:${artist.id}`));
  return artist.id.startsWith('y_') ? rng.int(17, 20) : rng.int(19, 30) + Math.min(12, Math.round(Math.log10(Math.max(10, artist.fans)) - 3) * 2);
};

/** The biggest names held by the labels of the game: shown with a padlock. */
const lockedArtists = (world: World, viewer: string, favs: Set<string>): MarketView[] =>
  world.contracts
    .filter((c) => world.labels[c.labelId]?.kind === 'npc' && c.endTick > world.tick)
    .map((c) => ({ artist: world.artists[c.artistId], label: world.labels[c.labelId] }))
    .filter((x): x is { artist: Artist; label: Label } => !!x.artist && !!x.label)
    .sort((a, b) => b.artist.fans - a.artist.fans)
    .slice(0, MARKET_LOCKED)
    .map(({ artist, label }) => ({
      ...artistView(artist, viewer, 20),
      country: countryOf(artist),
      age: ageOf(artist),
      lockedBy: label.name,
      fav: favs.has(artist.id),
      advance: 0,
      royaltyRate: 0,
      blocked: `Sous contrat chez ${label.name}`,
    }));

const marketNews = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }].slice(-30);
};

const MAX_FAVOURITES = 40;
const toggleFavourite = (world: World, label: Label, artistId: string): void => {
  if (!world.artists[artistId]) throw new GameError('Artiste introuvable.');
  const mine = world.favourites?.[label.id] ?? [];
  const next = mine.includes(artistId) ? mine.filter((id) => id !== artistId) : [...mine, artistId];
  if (next.length > MAX_FAVOURITES) throw new GameError('Ta liste de favoris est pleine.');
  world.favourites = { ...world.favourites, [label.id]: next };
};

/** What the market pays for an artist the label lets go: half of his value. */
export const salePrice = (artist: Artist): number => Math.round(artistValue(artist) * 0.5);

/** Sells an artist: the contract ends, he is free again, the songs already made stay with the label. */
const sellArtist = (world: World, label: Label, artistId: string): void => {
  const artist = world.artists[artistId] ?? (() => { throw new GameError('Artiste introuvable.'); })();
  if (contractOf(world, artistId)?.labelId !== label.id) throw new GameError(`${artist.name} n'est pas dans ton label.`);
  if (sessionOf(world, label.id)?.artistId === artistId) throw new GameError('Il est en studio : finis ou quitte la session.');
  if (tutorialView(world, label.id)) throw new GameError('Finis le tutoriel avant de vendre un artiste.');
  const price = salePrice(artist);
  label.cash += price;
  world.contracts = world.contracts.filter((c) => c.artistId !== artistId);
  world.gigs = world.gigs.filter((g) => g.artistId !== artistId);
  marketNews(world, `${label.name} vend ${artist.name} : il est libre.`);
};

/** Everything one player may see. Hidden numbers (true potential, other labels' cash) never leave the server. */
export const buildView = (world: World, ownerId: string): MelodyView => {
  const label = Object.values(world.labels).find((l) => l.ownerId === ownerId && !l.bankrupt) ?? null;
  const viewer = label?.id ?? ownerId;
  const roster = label ? rosterOf(world, label.id) : [];
  const top = (entries: ChartEntry[], size: number): ChartEntry[] => entries.slice(0, size);

  const favs = new Set(label ? (world.favourites?.[label.id] ?? []) : []);
  const talking = new Set(label ? [...talksOfLabel(world, label.id), ...talkNews(world, label.id)].map((t) => t.artistId) : []);
  const market: MarketView[] = label
    ? freeAgents(world)
        .map((artist) => {
          const expected = expectedOffer(artist);
          const blocked = talkBlocked(world, label, artist) ?? (expected.advance * 0.8 > label.cash ? 'Avance trop chère' : null);
          return { ...artistView(artist, viewer, 20), country: countryOf(artist), age: ageOf(artist), lockedBy: null as string | null, fav: favs.has(artist.id), advance: expected.advance, royaltyRate: expected.royaltyRate, blocked };
        })
        // Artists the label is talking with stay on top, then the ones it can sign.
        .sort((a, b) => Number(!talking.has(a.id)) - Number(!talking.has(b.id)) || Number(a.blocked !== null) - Number(b.blocked !== null) || b.value - a.value)
        .slice(0, MARKET_FREE)
        .concat(lockedArtists(world, viewer, favs))
    : [];

  return {
    tick: world.tick,
    season: Math.floor(world.tick / CFG.ticksPerSeason) + 1,
    weekOfSeason: (world.tick % CFG.ticksPerSeason) + 1,
    trends: world.trends,
    label: label && {
      id: label.id,
      name: label.name,
      tier: label.tier,
      tierName: CFG.tiers.names[label.tier - 1] ?? '',
      cash: Math.round(label.cash),
      debt: Math.round(debtOf(world, label.id)),
      reputation: Math.round(label.reputation * 10) / 10,
      fans: fansOf(world, label.id),
      catalogue: catalogueValue(world, label.id),
      maxArtists: CFG.tiers.maxArtists[label.tier - 1] ?? 5,
      songBudgetCap: CFG.tiers.songBudgetCap[label.tier - 1] ?? 15_000,
      loanCap: CFG.tiers.loanCap[label.tier - 1] ?? 20_000,
      distress: label.distress,
      loans: world.loans.filter((l) => l.labelId === label.id).map((l) => ({ kind: l.kind, remaining: Math.round(l.remaining), ticksLeft: l.ticksLeft })),
    },
    academy: label ? academyView(world, label.id) : null,
    news: (world.marketNews ?? []).slice(-8).reverse().map((n) => n.text),
    labels: labelCards(world),
    roster: roster.map((artist) => {
      const contract = contractOf(world, artist.id);
      const gigsBooked = world.gigs.filter((g) => g.artistId === artist.id).length;
      const gig = playGig(artist, gigsBooked);
      return {
        ...artistView(artist, viewer, 12),
        attrs: artist.attrs,
        energy: Math.round(artist.energy),
        morale: Math.round(artist.morale),
        creativeFatigue: Math.round(artist.creativeFatigue),
        weeksLeft: (contract?.endTick ?? world.tick) - world.tick,
        unrecouped: Math.round(contract?.unrecouped ?? 0),
        royaltyRate: contract?.royaltyRate ?? 0,
        weeklyAllowance: contract?.weeklyAllowance ?? 0,
        renewBlocked: label ? talkBlocked(world, label, artist) : null,
        gigsBooked,
        nextGig: { venue: gig.venue, audience: gig.audience, profit: Math.round(gig.profit * (gig.profit > 0 ? CFG.live.labelShare : 1)) },
        offers: label ? studioOffers(world, label.id, artist) : { themes: [], beats: [] },
        lastSong: lastSongOf(world, artist.id),
        songsMade: world.songs.filter((s) => s.artistId === artist.id).length,
        salePrice: salePrice(artist),
        expectedNote: Math.round(generalRating(artist) + experienceBonus(world, artist)),
      };
    }),
    songs: label
      ? world.songs
          .filter((s) => s.labelId === label.id)
          .map((s) => ({
            id: s.id,
            title: s.title,
            artistId: s.artistId,
            artistName: world.artists[s.artistId]?.name ?? '?',
            featName: s.featArtistId ? (world.artists[s.featArtistId]?.name ?? null) : null,
            themeId: s.themeId,
            beatId: s.beatId,
            // The true quality and what it hides come out with the song.
            quality: s.state === 'released' ? s.quality : null,
            qualityMin: s.qualityMin ?? s.quality,
            qualityMax: s.qualityMax ?? s.quality,
            surprise: s.state === 'released' ? (s.surprise ?? null) : null,
            combo: s.state === 'released' ? (s.combo ?? null) : null,
            cover: s.cover ?? false,
            promo: (s.promo ?? []).map((p) => ({ name: MARKETING.find((m) => m.id === p.id)?.name ?? p.id, views: p.views, viral: p.viral })),
            promoNames: (s.marketingIds ?? []).map((id) => MARKETING.find((m) => m.id === id)?.name ?? id),
            history: s.history ?? [],
            blockedWeeks: s.state === 'vault' ? Array.from({ length: 8 }, (_, i) => releaseBlocked(world, label.id, s.artistId, world.tick + 1 + i)) : [],
            state: s.state,
            readyInWeeks: Math.max(0, s.availableTick - world.tick),
            releaseInWeeks: s.releaseTick !== null && s.state === 'scheduled' ? s.releaseTick - world.tick : null,
            streamsLast: s.streamsLast,
            streamsTotal: s.streamsTotal,
            earned: Math.round(s.streamsTotal * CFG.release.payPerStream),
            spent: Math.round(s.cost + s.marketingCost),
            releasedTick: s.state === 'released' ? s.releaseTick : null,
            hitScore: s.hitScore,
            peakGlobal: s.peakGlobal,
            peakGenre: s.peakGenre,
            weeksOut: s.weeksOut,
          }))
      : [],
    market,
    ranking: ranking(world),
    charts: {
      global: top(world.charts.global, 50),
      genres: Object.fromEntries(Object.entries(world.charts.genres).map(([genre, entries]) => [genre, top(entries, 20)])),
    },
    session: label ? sessionOfLabel(world, label) : null,
    talks: label ? talksOfLabel(world, label.id) : [],
    tutorial: label ? tutorialView(world, label.id) : null,
    featDeals: label ? dealsView(world, label.id) : [],
    others: label ? otherArtists(world, label.id) : [],
    talkNews: label ? talkNews(world, label.id) : [],
    trend: trendOf(world),
    notebook: label ? notebookOf(world, label.id) : [],
    labelWeeks: label ? labelWeeks(world, label.id) : [],
  };
};

/** Streams of all the label's songs over the last twelve weeks, oldest first. */
const labelWeeks = (world: World, labelId: string): number[] => {
  const weeks = Array.from({ length: 12 }, () => 0);
  for (const song of world.songs) {
    if (song.labelId !== labelId || song.state !== 'released' || !song.history) continue;
    song.history.forEach((streams, i) => {
      const at = weeks.length - (song.history!.length - i);
      if (at >= 0) weeks[at] = (weeks[at] ?? 0) + streams;
    });
  }
  return weeks;
};

const lastSongOf = (world: World, artistId: string): RosterView['lastSong'] => {
  const song = world.songs.filter((s) => s.artistId === artistId).at(-1);
  return song ? { id: song.id, title: song.title, cover: song.cover ?? false } : null;
};

const sessionOfLabel = (world: World, label: Label): SessionView | null => {
  const session = sessionOf(world, label.id);
  return session ? sessionView(world, label, producerFor(world, session.levels.producer, session.beatId)) : null;
};

export interface SongPreview {
  cost: number;
  energy: number;
  qualityMin: number;
  qualityMax: number;
  delayWeeks: number;
}

/** What the studio shows before the player confirms a song. Same numbers as the real creation, minus the draw. */
export const previewSong = (world: World, artistId: string, themeId: string, beatId: string, levels: SongLevels): SongPreview => {
  const artist = world.artists[artistId];
  if (!artist) throw new GameError('Artiste introuvable.');
  const producer = producerFor(world, levels.producer, beatId);
  const estimate = estimateQuality({ artist, themeId, beatId, levels, producer, experience: experienceBonus(world, artist) });
  return {
    cost: songCost(levels, producer),
    energy: songEnergy(levels, false, artist),
    qualityMin: estimate.min,
    qualityMax: estimate.max,
    delayWeeks: levels.studio >= 3 ? 1 : 0,
  };
};
