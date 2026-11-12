// The centre de formation: young talents the label raises itself, and the scouts who find them.
// A youth is not an artist yet: he cannot record. Once promoted he joins the roster for free.
// Like a football academy, the label only sees a range around his level; time and a good scout tighten it.
import { artistFromCatalog } from './artists.ts';
import { CFG } from './config.ts';
import { GENRES } from './data/content.ts';
import { rosterOf } from './economy.ts';
import { clamp, createRng, hashString, rngFor, type Rng } from './rng.ts';
import type { Artist, CatalogArtist, GenreId, Label, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export const ACADEMY = {
  /** Places in the centre (the owner asked for 10 to 15). */
  places: 12,
  startYouths: 3,
  missionWeeks: 2,
  /** Weeks a found talent waits for an answer. */
  answerWeeks: 3,
  hireList: 4,
  /** Level gained per week at most: half of what a signed artist gains. */
  growth: 0.12,
  /** Weeks of the "house" contract of a promoted youth. */
  contractWeeks: 72,
} as const;

export type ZoneId = 'fr' | 'uk' | 'us' | 'latin' | 'afrique' | 'monde';

interface Zone {
  id: ZoneId;
  name: string;
  cost: number;
  places: Array<[country: string, city: string]>;
  firsts: string[];
  lasts: string[];
  genres: GenreId[];
}

const ZONES: Zone[] = [
  {
    id: 'fr',
    name: 'France, Belgique, Suisse',
    cost: 0,
    places: [['FR', 'Paris'], ['FR', 'Marseille'], ['FR', 'Lyon'], ['FR', 'Lille'], ['FR', 'Toulouse'], ['FR', 'Nantes'], ['BE', 'Bruxelles'], ['BE', 'Liège'], ['CH', 'Genève'], ['FR', 'Bordeaux']],
    firsts: ['Nova', 'Sixto', 'Liha', 'Kosmo', 'Mina', 'Tayo', 'Luna', 'Ambre', 'Noctis', 'Bambi', 'Zeph', 'Idris', 'Maë', 'Soan', 'Lyra', 'Nilo', 'Kaïs', 'Elio', 'Naya', 'Rémi', 'Tess', 'Yanis', 'Inès', 'Sacha', 'Malo'],
    lasts: ['Kalé', 'Vega', 'Minuit', 'Bleu', 'Orbit', 'Sol', 'Riot', 'Brume', 'Noir', 'Delta', 'Miel', 'Onyx', 'Prisme', 'Zéro', 'Lune', 'Fauve', 'Écho', 'Volt', 'Sable', 'Nord', 'Cendre', 'Lilas', 'Givre', 'Astre', 'Béton'],
    genres: ['rap_fr', 'trap', 'drill', 'rnb', 'pop', 'variete', 'hyperpop', 'afro', 'electro'],
  },
  {
    id: 'uk',
    name: 'Royaume-Uni',
    cost: 300,
    places: [['GB', 'Londres'], ['GB', 'Manchester'], ['GB', 'Birmingham'], ['GB', 'Bristol'], ['IE', 'Dublin']],
    firsts: ['Kofi', 'Tia', 'Reece', 'Jade', 'Callum', 'Zara', 'Dre', 'Skye', 'Ollie', 'Nia', 'Tariq', 'Mabel'],
    lasts: ['Hackney', 'Fox', 'Grey', 'Sterling', 'Mercer', 'Blake', 'Rain', 'Wolfe', 'Kent', 'Marsh', 'Frost', 'Vale'],
    genres: ['drill', 'rap_us', 'rnb', 'pop', 'electro', 'rock'],
  },
  {
    id: 'us',
    name: 'États-Unis, Canada',
    cost: 400,
    places: [['US', 'Atlanta'], ['US', 'Houston'], ['US', 'Chicago'], ['US', 'Los Angeles'], ['US', 'New York'], ['US', 'Miami'], ['CA', 'Toronto'], ['US', 'Memphis']],
    firsts: ['Jayce', 'Kwame', 'Yuna', 'Trey', 'Kayla', 'Dante', 'Rico', 'Mila', 'Zion', 'Imani', 'Cash', 'Nyla', 'Lil Ace', 'Baby Jo', 'Big Ty'],
    lasts: ['Reyes', 'Carter', 'Banks', 'Monroe', 'Stone', 'Rivers', 'Jetson', 'Lux', 'Savage', 'Cruz', 'West', 'Dior', 'Santana', 'Bleu'],
    genres: ['rap_us', 'trap', 'rnb', 'pop', 'hyperpop', 'rock', 'drill'],
  },
  {
    id: 'latin',
    name: 'Amérique latine, Espagne',
    cost: 300,
    places: [['PR', 'San Juan'], ['CO', 'Medellín'], ['MX', 'Mexico'], ['ES', 'Madrid'], ['AR', 'Buenos Aires'], ['DO', 'Saint-Domingue']],
    firsts: ['Nico', 'Luz', 'Mateo', 'Camila', 'Santi', 'Valen', 'Dani', 'Rauwel', 'Yandel', 'Paloma', 'Tito', 'Emi'],
    lasts: ['Fuego', 'Luna', 'Castillo', 'Rey', 'Montero', 'Vida', 'Cielo', 'Bravo', 'Dorado', 'Malo', 'Rosario', 'Sol'],
    genres: ['latin', 'pop', 'trap', 'rnb'],
  },
  {
    id: 'afrique',
    name: 'Afrique',
    cost: 300,
    places: [['NG', 'Lagos'], ['GH', 'Accra'], ['CI', 'Abidjan'], ['SN', 'Dakar'], ['ZA', 'Johannesburg'], ['CD', 'Kinshasa'], ['MA', 'Casablanca']],
    firsts: ['Ayo', 'Kojo', 'Amara', 'Tems', 'Seyi', 'Fatou', 'Bolu', 'Zuri', 'Kelechi', 'Awa', 'Sipho', 'Didi'],
    lasts: ['Lagos', 'Okoye', 'Diallo', 'Mensah', 'Bello', 'Koné', 'Soleil', 'Vibes', 'Banga', 'Zulu', 'Star', 'Wave'],
    genres: ['afro', 'rnb', 'pop', 'rap_fr', 'reggae'],
  },
  {
    id: 'monde',
    name: 'Partout (au hasard)',
    cost: 200,
    places: [['JM', 'Kingston'], ['DE', 'Berlin'], ['KR', 'Séoul'], ['JP', 'Tokyo'], ['IT', 'Milan'], ['SE', 'Stockholm'], ['BR', 'São Paulo'], ['NL', 'Amsterdam']],
    firsts: ['Aki', 'Mika', 'Lio', 'Suki', 'Enzo', 'Freya', 'Jin', 'Noa', 'Kaya', 'Rune', 'Yuki', 'Bruno'],
    lasts: ['Kyo', 'Nova', 'Berg', 'Mori', 'Rossi', 'Lind', 'Park', 'Silva', 'Vann', 'Sato', 'Marley', 'Klein'],
    genres: ['electro', 'pop', 'reggae', 'rock', 'metal', 'jazz', 'hyperpop', 'latin'],
  },
];

export const zoneById = (id: string): Zone => ZONES.find((z) => z.id === id) ?? fail('Zone inconnue.');

export interface Youth {
  id: string;
  name: string;
  genre: GenreId;
  secondary: GenreId[];
  country: string;
  city: string;
  age: number;
  /** True level and ceiling: they never leave the server. */
  gen: number;
  potential: number;
  /** 0 to 1: how well the label knows him. The shown ranges tighten with it. */
  knowledge: number;
  gem: boolean;
  joinedTick: number;
  /** For a talent a scout just found: the last week to answer. */
  untilTick?: number;
}

export interface Scout {
  id: string;
  name: string;
  rank: string;
  stars: number;
  /** Paid every week. */
  wage: number;
}

export interface Mission {
  zone: ZoneId;
  genre: GenreId | null;
  endTick: number;
}

export interface Academy {
  youths: Youth[];
  /** Talents the scout brought back, waiting for a yes or a no. */
  found: Youth[];
  scout: Scout;
  mission: Mission | null;
  nextId: number;
}

/* ---------------------------------- Scouts ---------------------------------- */

const SCOUT_FIRST = ['Michael', 'Jack', 'Bernard', 'Kevin', 'Jean-Mi', 'Sandrine', 'Tonton', 'Brenda', 'Gérard', 'Momo', 'Stéphane', 'Cindy', 'Patrick', 'Ludo', 'Josiane', 'Dylan', 'Régis', 'Nadine', 'Francky', 'Titouan', 'Mireille', 'Jordan', 'Corinne', 'Rachid', 'Yvette'];
const SCOUT_LAST = ['Boulangerie', 'Robotique', 'Parking', 'Tupperware', 'Clignotant', 'Barbecue', 'Wifi', 'Trottinette', 'Photocopie', 'Camping', 'Sandwich', 'Karaoké', 'Périphérique', 'Rond-Point', 'Chaussette', 'Micro-ondes', 'Formule-Midi', 'Cartable', 'Bluetooth', 'Pétanque', 'Déchetterie', 'Autoroute', 'Climatisation', 'Raclette', 'Agrafeuse'];
const RANKS: string[][] = [
  ['Ami de la voisine', 'Recruteur du dimanche', 'A vu un concert une fois', 'Cousin motivé', 'Stagiaire non payé'],
  ['Recruteur amateur', 'Habitué des open mics', 'Ancien DJ de mariage', 'Pilier de MJC', 'Animateur de kermesse'],
  ['Recruteur confirmé', 'Oreille du quartier', 'Ex-manager de province', 'Dénicheur régulier', 'Programmateur de salle'],
  ['Chasseur de talents', 'Ancien directeur artistique', 'Œil de lynx', 'Recruteur de major', 'Tête chercheuse'],
  ['Légende du milieu', 'Faiseur de stars', 'Oreille en or massif', 'Le Parrain du game', 'Celui qui les a tous trouvés'],
];
const WAGES = [50, 200, 500, 1_200, 3_000];

const makeScout = (rng: Rng, stars: number, id: string): Scout => ({
  id,
  name: `${rng.pick(SCOUT_FIRST)} ${rng.pick(SCOUT_LAST)}`,
  rank: rng.pick(RANKS[stars - 1] ?? RANKS[0]!),
  stars,
  wage: WAGES[stars - 1] ?? 50,
});

/** The four scouts looking for a job this week: always the same list for one label and one week. */
export const hiringList = (world: World, labelId: string): Scout[] => {
  const rng = rngFor(world.seed, world.tick, `scouts:${labelId}`);
  return Array.from({ length: ACADEMY.hireList }, (_, i) => {
    const roll = rng.next();
    const stars = roll < 0.3 ? 1 : roll < 0.6 ? 2 : roll < 0.82 ? 3 : roll < 0.95 ? 4 : 5;
    return makeScout(rng, stars, `s${world.tick}_${i}`);
  });
};

/* ---------------------------------- Youths ---------------------------------- */

const makeYouth = (world: World, rng: Rng, id: string, zone: Zone, genre: GenreId | null, stars: number, taken: Set<string>): Youth => {
  let name = `${rng.pick(zone.firsts)} ${rng.pick(zone.lasts)}`;
  for (let i = 0; i < 20 && taken.has(name.toLowerCase()); i += 1) name = `${rng.pick(zone.firsts)} ${rng.pick(zone.lasts)}`;
  taken.add(name.toLowerCase());
  const main = genre ?? rng.pick(zone.genres);
  const [country, city] = rng.pick(zone.places);
  const gem = rng.chance(0.02 + 0.012 * stars);
  const gen = Math.round(36 + stars * 2 + rng.range(0, 10));
  const potential = gem ? Math.round(rng.range(88, 97)) : Math.min(95, Math.round(gen + 12 + rng.range(0, 18 + stars * 3)));
  return {
    id,
    name,
    genre: main,
    secondary: [rng.pick(GENRES[main].neighbours)].filter((g) => g !== main),
    country,
    city,
    age: rng.int(15, 19),
    gen,
    potential,
    knowledge: clamp(0.1 + 0.1 * stars, 0, 1),
    gem,
    joinedTick: world.tick,
  };
};

const namesTaken = (world: World): Set<string> => {
  const taken = new Set(Object.values(world.artists).map((a) => a.name.toLowerCase()));
  for (const academy of Object.values(world.academies ?? {})) for (const y of [...academy.youths, ...academy.found]) taken.add(y.name.toLowerCase());
  return taken;
};

/** The centre of a label, opened with three youths the first time. */
export const academyOf = (world: World, labelId: string): Academy => {
  const existing = world.academies?.[labelId];
  if (existing) return existing;
  const rng = createRng(world.seed ^ hashString(`academy:${labelId}`));
  const taken = namesTaken(world);
  const zone = zoneById('fr');
  const genres = [...zone.genres].sort(() => rng.next() - 0.5);
  const academy: Academy = { youths: [], found: [], scout: makeScout(rng, 1, 'free'), mission: null, nextId: 1 };
  academy.scout.wage = 0;
  for (let i = 0; i < ACADEMY.startYouths; i += 1) {
    const youth = makeYouth(world, rng, `y${academy.nextId}`, zone, genres[i] ?? null, 2, taken);
    academy.nextId += 1;
    // The first three are known well enough to choose, and good enough to start a label with.
    youth.gen = rng.int(46, 54);
    youth.potential = youth.gem ? youth.potential : Math.min(95, youth.gen + rng.int(14, 34));
    youth.knowledge = 0.5;
    academy.youths.push(youth);
  }
  world.academies = { ...world.academies, [labelId]: academy };
  return academy;
};

const youthOf = (academy: Academy, youthId: string): Youth => academy.youths.find((y) => y.id === youthId) ?? fail('Jeune introuvable.');

/** Sends the scout to look for talents: he comes back in two weeks. */
export const sendScout = (world: World, label: Label, zoneId: string, genre: string | null): void => {
  const academy = academyOf(world, label.id);
  if (academy.mission) fail(`${academy.scout.name} est déjà en mission.`);
  const zone = zoneById(zoneId);
  if (genre !== null && !(genre in GENRES)) fail('Genre inconnu.');
  if (zone.cost > label.cash) fail('Pas assez de cash pour ce voyage.');
  label.cash -= zone.cost;
  academy.mission = { zone: zone.id, genre: genre as GenreId | null, endTick: world.tick + ACADEMY.missionWeeks };
};

export const hireScout = (world: World, label: Label, scoutId: string): void => {
  const academy = academyOf(world, label.id);
  if (academy.mission) fail('Attends le retour de ton recruteur avant d’en changer.');
  const scout = hiringList(world, label.id).find((s) => s.id === scoutId) ?? fail('Ce recruteur n’est plus disponible.');
  if (scout.wage > label.cash) fail('Pas assez de cash pour sa première semaine.');
  academy.scout = { ...scout };
};

/** Takes a talent the scout found into the centre. */
export const takeYouth = (world: World, label: Label, youthId: string): void => {
  const academy = academyOf(world, label.id);
  const youth = academy.found.find((y) => y.id === youthId) ?? fail('Ce talent n’attend plus.');
  if (academy.youths.length >= ACADEMY.places) fail('Le centre est plein : libère une place.');
  academy.found = academy.found.filter((y) => y.id !== youthId);
  delete youth.untilTick;
  youth.joinedTick = world.tick;
  academy.youths.push(youth);
};

/** Says no to a found talent, or lets a youth of the centre go. */
export const dropYouth = (world: World, label: Label, youthId: string): void => {
  const academy = academyOf(world, label.id);
  if (!academy.youths.some((y) => y.id === youthId) && !academy.found.some((y) => y.id === youthId)) fail('Jeune introuvable.');
  academy.youths = academy.youths.filter((y) => y.id !== youthId);
  academy.found = academy.found.filter((y) => y.id !== youthId);
};

export const renameYouth = (world: World, label: Label, youthId: string, name: string): void => {
  const youth = youthOf(academyOf(world, label.id), youthId);
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 2 || clean.length > 24) fail('Le nom doit faire entre 2 et 24 caractères.');
  if (clean.toLowerCase() !== youth.name.toLowerCase() && namesTaken(world).has(clean.toLowerCase())) fail('Ce nom est déjà pris.');
  youth.name = clean;
};

/** The youth becomes an artist of the label, under a free house contract. */
export const promoteYouth = (world: World, label: Label, youthId: string): Artist => {
  const academy = academyOf(world, label.id);
  const youth = youthOf(academy, youthId);
  const max = CFG.tiers.maxArtists[label.tier - 1] ?? 5;
  if (rosterOf(world, label.id).length >= max) fail('Ton effectif est complet pour ce palier.');
  const rng = createRng(world.seed ^ hashString(`promote:${label.id}:${youth.id}`));
  const gen = Math.round(youth.gen);
  const source: CatalogArtist = {
    id: `y_${label.id}_${youth.id}`,
    name: youth.name,
    country: youth.country,
    city: youth.city,
    genre: youth.genre,
    secondary: youth.secondary,
    tags: [],
    gen,
    potMin: Math.max(gen, youth.potential),
    potMax: Math.max(gen, youth.potential),
    fans: rng.int(1_200, 3_200),
    hype: rng.int(6, 16),
    labelId: null,
    real: false,
    energyProfile: rng.pick(['normal', 'normal', 'bourreau', 'par_a_coups', 'oiseau_de_nuit']),
    sync: rng.int(25, 60),
    merch: rng.int(30, 55),
  };
  const artist = artistFromCatalog(source, world.seed);
  world.artists[artist.id] = artist;
  world.contracts.push({ artistId: artist.id, labelId: label.id, startTick: world.tick, endTick: world.tick + ACADEMY.contractWeeks, advance: 0, unrecouped: 0, weeklyAllowance: 0, royaltyRate: 0.2 });
  academy.youths = academy.youths.filter((y) => y.id !== youthId);
  return artist;
};

/** One week in the centre: wages, progress, the scout's return. */
export const tickAcademy = (world: World, label: Label, pay: (amount: number) => void, note: (text: string) => void): void => {
  const academy = world.academies?.[label.id];
  if (!academy) return;
  if (academy.scout.wage > 0) pay(academy.scout.wage);
  for (const youth of academy.youths) {
    const margin = clamp((youth.potential - youth.gen) / 25, 0.2, 1);
    youth.gen = Math.min(youth.potential, youth.gen + ACADEMY.growth * margin + (youth.gem ? 0.05 : 0));
    youth.knowledge = clamp(youth.knowledge + 0.03 + 0.01 * academy.scout.stars, 0, 1);
    if ((world.tick - youth.joinedTick) % 52 === 0 && world.tick > youth.joinedTick) youth.age += 1;
  }
  const gone = academy.found.filter((y) => (y.untilTick ?? 0) < world.tick);
  if (gone.length > 0) {
    academy.found = academy.found.filter((y) => (y.untilTick ?? 0) >= world.tick);
    note(gone.length > 1 ? `${gone.length} talents sont partis ailleurs : tu n'as pas répondu.` : `${gone[0]!.name} est parti ailleurs : tu n'as pas répondu.`);
  }
  if (academy.mission && academy.mission.endTick <= world.tick) {
    const { zone: zoneId, genre } = academy.mission;
    const zone = zoneById(zoneId);
    const rng = rngFor(world.seed, world.tick, `mission:${label.id}`);
    const taken = namesTaken(world);
    const stars = academy.scout.stars;
    const count = 1 + Number(stars >= 3) + Number(stars >= 5) + Number(rng.chance(0.25));
    for (let i = 0; i < count; i += 1) {
      const youth = makeYouth(world, rng, `y${academy.nextId}`, zone, genre, stars, taken);
      academy.nextId += 1;
      youth.untilTick = world.tick + ACADEMY.answerWeeks;
      academy.found.push(youth);
    }
    academy.mission = null;
    note(`${academy.scout.name} est rentré avec ${count} talent${count > 1 ? 's' : ''} à voir.`);
  }
};

/* ---------------------------------- View ---------------------------------- */

export interface YouthView {
  id: string;
  name: string;
  genre: GenreId;
  secondary: GenreId[];
  country: string;
  city: string;
  age: number;
  /** A range around his level and his ceiling: tighter as the label gets to know him. */
  genMin: number;
  genMax: number;
  potentialMin: number;
  potentialMax: number;
  /** 0 to 100: how well the label knows him. */
  known: number;
  /** "Pépite" shows only once the label knows him well. */
  gem: boolean;
  weeksIn: number;
  /** For a found talent: weeks left to answer. */
  answerIn: number | null;
}

const range = (truth: number, spread: number, seed: string, floor = 1): [number, number] => {
  if (spread <= 0) return [Math.round(truth), Math.round(truth)];
  const shift = createRng(hashString(seed)).next();
  const min = Math.max(floor, Math.round(truth - spread * 2 * shift));
  return [min, Math.min(99, min + spread * 2)];
};

const youthView = (world: World, labelId: string, youth: Youth): YouthView => {
  const unknown = 1 - youth.knowledge;
  const [genMin, genMax] = range(youth.gen, Math.round(unknown * 6), `gen:${labelId}:${youth.id}`);
  const [potentialMin, potentialMax] = range(youth.potential, Math.round(unknown * 14), `pot:${labelId}:${youth.id}`, genMin);
  return {
    id: youth.id,
    name: youth.name,
    genre: youth.genre,
    secondary: youth.secondary,
    country: youth.country,
    city: youth.city,
    age: youth.age,
    genMin,
    genMax,
    potentialMin: Math.max(potentialMin, genMax),
    potentialMax: Math.max(potentialMax, genMax),
    known: Math.round(youth.knowledge * 100),
    gem: youth.gem && youth.knowledge >= 0.6,
    weeksIn: world.tick - youth.joinedTick,
    answerIn: youth.untilTick === undefined ? null : Math.max(0, youth.untilTick - world.tick),
  };
};

export interface AcademyView {
  places: number;
  youths: YouthView[];
  found: YouthView[];
  scout: Scout;
  mission: null | { zone: ZoneId; zoneName: string; genre: GenreId | null; weeksLeft: number };
  hiring: Scout[];
  zones: Array<{ id: ZoneId; name: string; cost: number }>;
}

export const academyView = (world: World, labelId: string): AcademyView => {
  const academy = academyOf(world, labelId);
  return {
    places: ACADEMY.places,
    youths: academy.youths.map((y) => youthView(world, labelId, y)),
    found: academy.found.map((y) => youthView(world, labelId, y)),
    scout: academy.scout,
    mission: academy.mission && {
      zone: academy.mission.zone,
      zoneName: zoneById(academy.mission.zone).name,
      genre: academy.mission.genre,
      weeksLeft: Math.max(0, academy.mission.endTick - world.tick),
    },
    hiring: hiringList(world, labelId),
    zones: ZONES.map((z) => ({ id: z.id, name: z.name, cost: z.cost })),
  };
};
