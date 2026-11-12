// What a player can see and do: the actions sent by the app and the view sent back.
import { artistFromCatalog, generalRating } from './artists.ts';
import { CFG } from './config.ts';
import { GENRES } from './data/content.ts';
import { artistValue, catalogueValue, contractOf, debtOf, fansOf, netWorth, playGig, ranking, rosterOf, type RankingLine } from './economy.ts';
import { estimateQuality, producerOfLevel, songCost, songEnergy } from './quality.ts';
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

/** Creates the player's label with the beginner he picked, under a free "house" contract. */
export const foundLabel = (world: World, ownerId: string, name: string, starterId: string): Label => {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 28) throw new GameError('Le nom du label doit faire entre 2 et 28 caractères.');
  const players = Object.values(world.labels).filter((l) => l.kind === 'player' && !l.bankrupt);
  if (players.length >= MAX_PLAYER_LABELS) throw new GameError('Ce serveur a déjà le nombre maximum de labels.');
  if (players.some((l) => l.name.toLowerCase() === clean.toLowerCase())) throw new GameError('Un label porte déjà ce nom.');
  const starter = starterChoices(world, ownerId).find((a) => a.id === starterId);
  if (!starter) throw new GameError("Choisis un des trois artistes proposés.");
  const cash = startingCash(world);
  const comeback = Object.values(world.labels).some((l) => l.ownerId === ownerId && l.bankrupt);
  const label = addPlayerLabel(world, ownerId, clean);
  // A player back after a bankruptcy knows the game: no tutorial for him.
  if (!comeback) startTutorial(world, label.id);
  label.cash = cash;
  // A player who comes back after a bankruptcy gets a new beginner under a new id.
  const id = world.artists[starter.id] ? `${starter.id}_${world.nextId}` : starter.id;
  world.artists[id] = { ...starter, id };
  world.contracts.push({
    artistId: id,
    labelId: label.id,
    startTick: world.tick,
    endTick: world.tick + 72,
    advance: 0,
    unrecouped: 0,
    weeklyAllowance: 0,
    royaltyRate: 0.2,
  });
  return label;
};

/** The producer the studio finds for a level and a beat this month: how well he knows the beat varies. */
export const producerFor = (world: World, level: 1 | 2 | 3 | 4, beatId: string): Producer => {
  const month = Math.floor(world.tick / CFG.ticksPerMonth);
  const roll = createRng(world.seed ^ hashString(`producer:${month}:${level}:${beatId}`)).next();
  return producerOfLevel(level, roll < 0.3 ? 1 : roll < 0.75 ? 0.85 : 0.7);
};

export type MelodyAction =
  | { type: 'found'; name: string; starterId: string }
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
  | { type: 'song'; title: string }
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
    foundLabel(world, ownerId, action.name, action.starterId);
    return;
  }
  const label = labelOfOwner(world, ownerId);
  const guarded = isGuarded(world, label.id, action.type);
  const cash = label.cash;
  const roster = rosterOf(world, label.id).length;
  runAction(world, label, action);
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
        record: (artistId, title, themeId, beatId) => {
          const levels = { theme: 1, beat: 1, producer: 1, studio: 1 } as const;
          createSong(world, label.id, { artistId, title, themeId, beatId, levels, producer: producerFor(world, 1, beatId) });
        },
        release: (songId, releaseTick) => void scheduleRelease(world, label.id, songId, releaseTick, []),
      });
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
}

export interface SongView {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  quality: number;
  state: 'vault' | 'scheduled' | 'released';
  readyInWeeks: number;
  releaseInWeeks: number | null;
  streamsLast: number;
  streamsTotal: number;
  hitScore: number;
  peakGlobal: number | null;
  peakGenre: number | null;
  weeksOut: number;
}

export interface MarketView extends ArtistView {
  advance: number;
  royaltyRate: number;
  /** Why the label cannot sign him right now, or null. */
  blocked: string | null;
}

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
  /** Only when the player has no label yet. */
  starters: ArtistView[];
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

/** Everything one player may see. Hidden numbers (true potential, other labels' cash) never leave the server. */
export const buildView = (world: World, ownerId: string): MelodyView => {
  const label = Object.values(world.labels).find((l) => l.ownerId === ownerId && !l.bankrupt) ?? null;
  const viewer = label?.id ?? ownerId;
  const roster = label ? rosterOf(world, label.id) : [];
  const top = (entries: ChartEntry[], size: number): ChartEntry[] => entries.slice(0, size);

  const talking = new Set(label ? [...talksOfLabel(world, label.id), ...talkNews(world, label.id)].map((t) => t.artistId) : []);
  const market: MarketView[] = label
    ? freeAgents(world)
        .map((artist) => {
          const expected = expectedOffer(artist);
          const blocked = talkBlocked(world, label, artist) ?? (expected.advance * 0.8 > label.cash ? 'Avance trop chère' : null);
          return { ...artistView(artist, viewer, 20), advance: expected.advance, royaltyRate: expected.royaltyRate, blocked };
        })
        // Artists the label is talking with stay on top, then the ones it can sign.
        .sort((a, b) => Number(!talking.has(a.id)) - Number(!talking.has(b.id)) || Number(a.blocked !== null) - Number(b.blocked !== null) || b.value - a.value)
        .slice(0, 60)
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
    starters: label ? [] : starterChoices(world, ownerId).map((a) => artistView(a, viewer, 20)),
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
            quality: s.quality,
            state: s.state,
            readyInWeeks: Math.max(0, s.availableTick - world.tick),
            releaseInWeeks: s.releaseTick !== null && s.state === 'scheduled' ? s.releaseTick - world.tick : null,
            streamsLast: s.streamsLast,
            streamsTotal: s.streamsTotal,
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
  };
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
  const estimate = estimateQuality({ artist, themeId, beatId, levels, producer });
  return {
    cost: songCost(levels, producer),
    energy: songEnergy(levels, false, artist),
    qualityMin: estimate.min,
    qualityMax: estimate.max,
    delayWeeks: levels.studio >= 3 ? 1 : 0,
  };
};
