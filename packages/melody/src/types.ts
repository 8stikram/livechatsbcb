// Shared shapes of the Melody Tycoon rules engine. Everything here is plain data
// so a world can be stored as JSON by the server.

export type GenreId =
  | 'rap_fr' | 'rap_us' | 'drill' | 'trap' | 'rnb' | 'pop'
  | 'afro' | 'latin' | 'variete' | 'hyperpop' | 'electro' | 'rock'
  | 'metal' | 'reggae' | 'jazz';

export type GenreFamily = 'rap' | 'chant' | 'machines' | 'groupe';

export type EnergyProfile = 'normal' | 'bourreau' | 'lazy' | 'par_a_coups' | 'oiseau_de_nuit';

export interface CatalogArtist {
  id: string;
  name: string;
  country: string;
  city: string | null;
  genre: string;
  secondary: string[];
  tags: string[];
  gen: number;
  potMin: number;
  potMax: number;
  fans: number;
  hype: number;
  labelId: string | null;
  real: boolean;
  energyProfile: string;
  sync: number;
  merch: number;
}

export interface CatalogLabel {
  id: string;
  name: string;
  country: string;
  real: boolean;
  size: string;
  tier: number;
  genres: string[];
  reputation: number;
  style: string;
}

export interface Beat {
  id: string;
  name: string;
  genres: GenreId[];
  themes: string[];
}

export interface Theme {
  id: string;
  name: string;
}

export interface Attributes {
  voix: number;
  ecriture: number;
  instrument: number;
  production: number;
  scene: number;
  creativite: number;
  discipline: number;
  resilience: number;
  charisme: number;
  professionnalisme: number;
  medias: number;
  endurance: number;
}

export interface Artist {
  id: string;
  name: string;
  real: boolean;
  genre: GenreId;
  secondary: GenreId[];
  attrs: Attributes;
  /** Hidden ceiling of the general rating. */
  potential: number;
  fans: number;
  hype: number;
  superfanRate: number;
  energy: number;
  creativeFatigue: number;
  morale: number;
  energyProfile: EnergyProfile;
  /** Fractional progress toward the next +1 on an attribute. */
  growth: number;
  lastActiveTick: number;
  lastReleaseTick: number;
  /** Last time the label gave him a bonus or a trip. */
  cheers?: { bonus?: number; trip?: number };
  /** Very low morale: he asked to leave. On strike: nothing at all. */
  wantsOut?: boolean;
  onStrike?: boolean;
  /** Another artist of the label got a much bigger promo. */
  jealous?: { name: string; tick: number };
  /** The lower rank he knows is better paid (told once). */
  grudge?: string;
}

export interface Contract {
  artistId: string;
  labelId: string;
  startTick: number;
  endTick: number;
  advance: number;
  /** Part of the advance still to be recovered from the artist's royalties. */
  unrecouped: number;
  weeklyAllowance: number;
  royaltyRate: number;
  /** Price at which another player can buy him without asking (transfers between players). */
  releaseClause?: number;
}

export type LabelKind = 'player' | 'npc';

export interface LabelStats {
  revenueTotal: number;
  numberOnes: number;
  top10Global: number;
  top100Global: number;
  top50Genre: number;
  clashWins?: number;
  clashLosses?: number;
}

export interface Label {
  id: string;
  name: string;
  kind: LabelKind;
  ownerId: string | null;
  /** 1 Maison, 2 Underground, 3 Respecté, 4 Mainstream, 5 Empire, 6 Divin. */
  tier: number;
  cash: number;
  reputation: number;
  distress: number;
  bankrupt: boolean;
  stats: LabelStats;
  /** Last party of the label (morale). */
  partyTick?: number;
}

/** Level 1 (free, capped) to 4 for each paid choice of a song. */
export interface SongLevels {
  theme: 1 | 2 | 3 | 4;
  beat: 1 | 2 | 3 | 4;
  producer: 1 | 2 | 3 | 4;
  studio: 1 | 2 | 3 | 4;
}

export interface Producer {
  level: number;
  /** 1 = beat in his A list, .85 B, .7 C, .55 none. */
  affinity: number;
  price: number;
}

export interface Song {
  id: string;
  labelId: string;
  artistId: string;
  featArtistId: string | null;
  title: string;
  themeId: string;
  beatId: string;
  levels: SongLevels;
  quality: number;
  cost: number;
  state: 'vault' | 'scheduled' | 'released';
  createdTick: number;
  availableTick: number;
  releaseTick: number | null;
  marketingReach: number;
  marketingCost: number;
  streamsLast: number;
  streamsTotal: number;
  decay: number;
  hitScore: number;
  peakGlobal: number | null;
  peakGenre: number | null;
  weeksOut: number;
  /** The range the studio announced; the true quality shows at release. Missing on songs made before. */
  qualityMin?: number;
  qualityMax?: number;
  /** The song blew up or flopped against what the studio expected. */
  surprise?: 'boom' | 'flop' | null;
  /** A combo found with this song, written in the notebook at release. */
  combo?: 'secret' | 'perfect' | null;
  /** The player gave it a cover (kept apart by the server). */
  cover?: boolean;
  /** Promo picked at scheduling; the views are known after the release. */
  marketingIds?: string[];
  promo?: PromoResult[];
  /** Streams week by week since the release (at most 12). */
  history?: number[];
  /** A disstrack: the label it goes after. */
  diss?: string;
  /** The EP or album it belongs to. */
  projectId?: string;
  /** First-week boost of a project track, spent at the release. */
  boost?: number;
}

export interface PromoResult {
  id: string;
  views: number;
  viral: boolean;
}

export interface Loan {
  labelId: string;
  kind: 'classic' | 'emergency';
  remaining: number;
  ratePerTick: number;
  ticksLeft: number;
}

export interface Gig {
  labelId: string;
  artistId: string;
  tick: number;
}

/** A release by a label run by the game. Kept only while it still charts. */
export interface NpcSong {
  /** Invented in the artist's language and style. Missing on releases made before. */
  title?: string;
  artistId: string;
  artistName: string;
  labelId: string;
  genre: GenreId;
  streams: number;
  decay: number;
  weeks: number;
}

export interface ChartEntry {
  rank: number;
  title: string;
  artistName: string;
  labelId: string;
  streams: number;
  songId: string | null;
  /** Song of a player's label (for "seulement les joueurs"). */
  player?: boolean;
  /** The player gave the song a cover. */
  cover?: boolean;
}

export interface Trends {
  beats: Record<string, number>;
  themes: Record<string, number>;
}

export interface World {
  seed: number;
  tick: number;
  nextId: number;
  labels: Record<string, Label>;
  artists: Record<string, Artist>;
  contracts: Contract[];
  songs: Song[];
  loans: Loan[];
  gigs: Gig[];
  npcSongs: NpcSong[];
  trends: Trends;
  charts: { global: ChartEntry[]; genres: Record<string, ChartEntry[]> };
  /** The song each label is recording right now (studio events, featuring). Missing in worlds saved before. */
  sessions?: Record<string, StudioSession>;
  /** Featuring talks per label and guest: tries this week, and how long he refuses after an insult. */
  featMemory?: Record<string, { tick: number; tries: number; closedUntil: number }>;
  /** Contract talks open this week, per label and artist. */
  talks?: Record<string, import('./negotiation.ts').Talk>;
  /** How each artist remembers a label's talks: closed until, grudge, last words. */
  talkMemory?: Record<string, import('./negotiation.ts').TalkMemory>;
  /** The guided first week of each new label. */
  tutorials?: Record<string, import('./tutorial.ts').Tutorial>;
  /** Featuring requests between players. */
  featDeals?: import('./featdeals.ts').FeatDeal[];
  transfers?: import('./transfers.ts').Transfer[];
  clashes?: import('./clash.ts').Clash[];
  projects?: import('./projects.ts').Project[];
  tours?: import('./tours.ts').Tour[];
  /** The staff of each label, and the offers players make to each other's staff. */
  staff?: Record<string, import('./staff.ts').StaffMember[]>;
  staffOffers?: import('./staff.ts').StaffOffer[];
  /** The season being played, its goals, and the past seasons. */
  seasons?: import('./seasons.ts').Seasons;
  /** Tick of the last shade of each label (one a week). */
  shades?: Record<string, number>;
  /** This week's interview answers of each label. */
  interviews?: Record<string, { tick: number; answers: Partial<Record<number, import('./clash.ts').Tone>> }>;
  /** The centre de formation of each label: youths, scout, mission. */
  academies?: Record<string, import('./academy.ts').Academy>;
  /** Artists each label keeps an eye on in the market. */
  favourites?: Record<string, string[]>;
  /** What happened on the market lately, for everyone's Monday summary. */
  marketNews?: Array<{ tick: number; text: string }>;
  /** Combos each label found by playing. */
  notebooks?: Record<string, import('./craft.ts').NotebookEntry[]>;
}

export type StudioStage = 'theme' | 'beat' | 'producer' | 'studio' | 'feat';

export interface SessionEvent {
  stage: StudioStage;
  kind: 'fluid' | 'clash';
  cardId: string;
  /** Chosen reaction of a clash, null while the player has not answered. */
  reaction: string | null;
  /** What happened, once known. */
  result: string | null;
}

export interface StudioSession {
  artistId: string;
  themeId: string;
  beatId: string;
  levels: SongLevels;
  tick: number;
  /** How many songs the label had recorded this week when the session started: keeps the draws fixed. */
  index: number;
  events: SessionEvent[];
  quality: number;
  cost: number;
  delay: number;
  morale: number;
  energy: number;
  /** dealId when the guest comes from a deal with another player (already paid). */
  feat: { guestId: string; fee: number; dealId?: string } | null;
  featDone: boolean;
  /** Gambles taken during the session: each one makes a surprise more likely. */
  risk?: number;
  lastOffer: { guestId: string; offer: number; chance: number; roll: number | null; outcome: 'accepted' | 'refused' | 'vexed' } | null;
}
