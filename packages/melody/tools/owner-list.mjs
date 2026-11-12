// Turns the owner's list of 1000 artists (docs/melody-tycoon/artistes-liste-proprio.md) into
// docs/melody-tycoon/artistes-liste.csv, same columns as artistes-echantillon.csv.
// Only the names and genres of the list are used: fans and level are our own estimates
// (the tiers below), so stars stay stars and small names stay small.
// Run by hand: npm run owner-list -w @livechatsbcb/melody, then npm run data.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const docs = join(here, '../../../docs/melody-tycoon');

/* ------------------------------ Our estimates ------------------------------ */

// S: world stars. A: big names. B: known names. Everyone else is C, or D in the underground scenes.
const TIERS = {
  S: `Taylor Swift|Beyoncé|Rihanna|Adele|Bruno Mars|Justin Bieber|Lady Gaga|Katy Perry|Eminem|Kanye West|BTS|The Beatles|Coldplay|Queen|
    Harry Styles|One Direction|Olivia Rodrigo|Sabrina Carpenter|Miley Cyrus|Lana Del Rey|Arctic Monkeys|Juice WRLD|XXXTentacion|Bob Marley|
    David Guetta|Calvin Harris|Avicii|Daft Punk|Linkin Park|Metallica|Nirvana|AC/DC|Guns N' Roses|Pink Floyd|The Rolling Stones|Led Zeppelin|
    Red Hot Chili Peppers|Snoop Dogg|50 Cent|Lil Wayne|Tupac|Chris Brown|Justin Timberlake|Britney Spears|Selena Gomez|Shawn Mendes|
    Bad Bunny|Shakira|Frank Sinatra|Michael Jackson|Stray Kids|Green Day|Hans Zimmer|Burna Boy|Jay-Z|Dr. Dre|Notorious BIG|Imagine Dragons`,
  A: `Joji|Camila Cabello|Zayn|Niall Horan|The Killers|The Strokes|Christina Aguilera|Usher|Ne-Yo|Pink|Kelly Clarkson|Backstreet Boys|
    Jonas Brothers|5SOS|Avril Lavigne|Tame Impala|Slipknot|Korn|System of a Down|Rage Against the Machine|Bring Me The Horizon|Iron Maiden|
    Black Sabbath|Rammstein|Ghost|Avenged Sevenfold|Disturbed|Five Finger Death Punch|Megadeth|Tyler, The Creator|Young Thug|Lil Peep|
    Outkast|Ice Cube|Mac Miller|Logic|Pop Smoke|Lil Durk|Polo G|Roddy Ricch|DaBaby|Gucci Mane|Migos|Rick Ross|Meek Mill|Nelly|Ludacris|
    Jack Harlow|Kehlani|H.E.R.|Giveon|Steve Lacy|Rex Orange County|Clairo|Conan Gray|Lauv|Machine Gun Kelly|YUNGBLUD|$uicideboy$|
    Kodak Black|Lil Pump|Chief Keef|Sexyy Red|GloRilla|Latto|Coi Leray|Kim Petras|Manu Chao|Peggy Gou|Charlotte de Witte|Tiësto|
    Armin van Buuren|Diplo|Steve Aoki|Martin Garrix|Dolly Parton|Johnny Cash|Aretha Franklin|Marvin Gaye|Stevie Wonder|Muse|Foo Fighters|
    Oasis|Blink-182|Pearl Jam|Aerosmith|Davido|CKay|NewJeans|aespa|IVE|Le Sserafim|Twice|Squeezie|Soprano|IAM|MC Solaar|Gradur|
    Rohff|La Fouine|MHD|Kalash|Hatsune Miku|Miles Davis|Beethoven|Mozart|Bach|Chopin|John Williams|Louis Armstrong|Nina Simone|
    Phoenix|Wiz Khalifa|Karol G|J Balvin|Daddy Yankee|Ozuna|Anuel AA|Rauw Alejandro|Peso Pluma|Feid|Maluma|Nicky Jam|Bizarrap|Quevedo|
    Rosalía|Myke Towers|Becky G|Wisin & Yandel|Dimitri Vegas & Like Mike|Hardwell|Fireboy DML|Omah Lay|Itzy|Red Velvet|Wu-Tang Clan|Nas|
    Denzel Curry|Mister V|Diam's|Jacques Dutronc|Serge Gainsbourg|Renaud|Francis Cabrel|Téléphone|Louise Attaque|Indochine|Ennio Morricone|
    Danny Elfman|Willie Nelson|Gojira`,
  B: `Louis Tomlinson|MGMT|Flaming Lips|Animal Collective|Vampire Weekend|Interpol|Yeah Yeah Yeahs|Franz Ferdinand|The Libertines|Bloc Party|
    Kaiser Chiefs|Editors|Foals|Two Door Cinema Club|Bombay Bicycle Club|Passion Pit|M83|Air|Gesaffelstein|Cassius|Modjo|SebastiAn|
    Hilary Duff|Mandy Moore|Trey Songz|Omarion|Bow Wow|Mario|JLS|The Wanted|Hanson|NSYNC|Boyz II Men|98 Degrees|Jodeci|Tool|Mastodon|
    Opeth|Dream Theater|Nightwish|Epica|Sabaton|Parkway Drive|Architects|Bullet For My Valentine|Asking Alexandria|Pierce The Veil|
    Sleeping With Sirens|A Day To Remember|Trivium|Lamb of God|Killswitch Engage|Pantera|Slayer|Judas Priest|Motorhead|In Flames|
    Amon Amarth|Arch Enemy|Dimmu Borgir|Helloween|DragonForce|Alestorm|Ski Mask The Slump God|JID|A Tribe Called Quest|The Roots|
    De La Soul|Run DMC|Public Enemy|NWA|Eazy-E|Earl Sweatshirt|Vince Staples|Joey Bada$$|Action Bronson|Freddie Gibbs|MF DOOM|Madvillain|
    Danny Brown|JPEGMAFIA|Death Grips|Fivio Foreign|King Von|Moneybagg Yo|Yo Gotti|Offset|Takeoff|2 Chainz|Wale|Fabolous|Jadakiss|DMX|
    Ja Rule|Chingy|T.I.|Young Jeezy|Birdman|City Girls|Flo Milli|Rico Nasty|Saucy Santana|24kGoldn|Cordae|Saba|Smino|Ab-Soul|Jay Rock|
    Isaiah Rashad|6LACK|Tory Lanez|Majid Jordan|DVSN|Snoh Aalegra|Omar Apollo|Dominic Fike|beabadoobee|men i trust|boy pablo|cuco|
    Still Woozy|Wallows|Jeremy Zucker|blackbear|Smokepurpp|G Herbo|Rich The Kid|Lil Skies|YNW Melly|City Morgue|Ghostemane|Scarlxrd|
    Pi'erre Bourne|Southside|Zaytoven|Wheezy|Nick Mira|London on da Track|Kerchak|Niro|Kery James|Médine|Youssoupha|Akhenaton|NTM|
    Lunatic|Mafia K'1 Fry|113|Sniper|Sinik|Keny Arkana|Oxmo Puccino|Doc Gynéco|Lino|Bramsito|Hornet La Frappe|Lorenzo|Columbine|
    L'Entourage|1995|Jazzy Bazz|Roméo Elvis|Caballero & JeanJass|Lous and the Yakuza|Naza|KeBlack|Dinos|Jok'Air|Mister You|Sefyu|
    Zebda|Tryo|Sinsemilia|Dionysos|Matmatah|Kyo|Superbus|BB Brunes|Camille|Olivia Ruiz|Keren Ann|Alain Bashung|Françoise Hardy|
    France Gall|Michel Berger|Véronique Sanson|Michel Polnareff|Julien Clerc|Trust|Magma|Peter Tosh|Jimmy Cliff|Alpha Blondy|
    Tiken Jah Fakoly|Dub Inc|Danakil|Biga Ranx|Lee Scratch Perry|Carl Cox|Sven Väth|Richie Hawtin|Jeff Mills|Amelie Lens|Nina Kraviz|
    Solomun|Tale of Us|CamelPhat|Artbat|Paul Kalkbrenner|Adriatique|Norman|Cyprien|Inoxtag|Mcfly et Carlito|Natoo|Joeboy|John Coltrane|
    Charlie Parker|Duke Ellington|Thelonious Monk|Bill Evans|Ella Fitzgerald|Billie Holiday|Etta James|Otis Redding|Tchaikovsky|Vivaldi|
    Debussy|Howard Shore|Alan Silvestri|James Horner|Thomas Newman|Hank Williams|Patsy Cline|Blur|Slayyyter|Oklou|Dorian Electra|
    brakence|midwxst|a. g. cook|Tini|Sech|Young Miko|Arcángel|Kalash Criminel|Tagada Jones|Les Wampas|Bérurier Noir|Mass Hysteria|Alcest|
    Deafheaven|Fianso|Soso Maness|Guy2Bezbar|Rk|Luv Resval|Youv Dee|Kpri|Marlo|13 Organisé|Watcha|Arno|Christophe|Maxime Le Forestier|
    Miossec|Dominique A|Mickey 3D|Eiffel|Cocoon|Nouvelle Vague|Manudigital|Brain Damage|High Tone|Admiral T|Krys|Saël|Naza`,
};

// Scenes where most names are small: unknown names there are D instead of C.
const UNDERGROUND = new Set(['Plug', 'Rage', 'Cloud', 'Emo-Rap', 'Noise-Rap', 'Punk', 'Prog-Rock', 'Dub', 'Insta-Artist', 'Hyperpop', 'Post-Metal', 'Blackgaze', 'Mathcore', 'Black-Metal', 'Grindcore']);

const STATS = {
  S: { fans: [20e6, 90e6], gen: [86, 95], pot: [1, 3], hype: [55, 85] },
  A: { fans: [3e6, 20e6], gen: [78, 89], pot: [1, 4], hype: [40, 75] },
  B: { fans: [5e5, 3e6], gen: [70, 81], pot: [2, 6], hype: [25, 60] },
  C: { fans: [5e4, 5e5], gen: [62, 74], pot: [3, 10], hype: [15, 45] },
  D: { fans: [5e3, 5e4], gen: [52, 66], pot: [6, 18], hype: [10, 35] },
};

// The owner's genres, folded into the game's genres.
const GENRE = {
  Pop: 'pop', 'Alt-Pop': 'pop', 'Dance-Pop': 'pop', 'Indie-Pop': 'pop', 'Lo-Fi-Pop': 'pop', 'Insta-Artist': 'pop', 'K-Pop': 'pop', 'J-Rock': 'rock',
  'R&B': 'rnb', Soul: 'rnb', 'Rap-FR': 'rap_fr', Rap: 'rap_us', 'Emo-Rap': 'rap_us', 'Noise-Rap': 'rap_us', Cloud: 'rap_us', Crunk: 'rap_us',
  Trap: 'trap', Rage: 'trap', Plug: 'trap', Drill: 'drill', Grime: 'drill', Hyperpop: 'hyperpop',
  Techno: 'electro', 'Dark-Techno': 'electro', EDM: 'electro', Electronic: 'electro', 'French-Touch': 'electro', 'New-Rave': 'electro',
  Reggae: 'reggae', Dub: 'reggae', Dancehall: 'afro', Afrobeat: 'afro', 'Afro-Trap': 'afro',
  Jazz: 'jazz', Classique: 'jazz', OST: 'jazz', 'Bossa-Nova': 'jazz', Chanson: 'variete', YouTuber: 'variete',
  Rock: 'rock', 'Indie-Rock': 'rock', 'Prog-Rock': 'rock', Punk: 'rock', 'Alt-Rock': 'rock', 'Pop-Punk': 'rock', 'Pop-Rock': 'rock',
  Psychedelic: 'rock', Indie: 'rock', 'Post-Hardcore': 'rock', 'Post-Punk': 'rock', Country: 'rock', Folk: 'rock', Experimental: 'rock',
};
const genreOf = (raw) => GENRE[raw] ?? (/metal|core|grind/i.test(raw) ? 'metal' : 'pop');

// The tags the game knows, to shape the attributes a little.
const TAGS = { Hyperpop: ['viral'], 'Insta-Artist': ['viral'], YouTuber: ['viral', 'charisme'], 'Prog-Rock': ['concept'], 'Prog-Metal': ['concept'], Jazz: ['voix'], Soul: ['voix'], Classique: ['concept'], OST: ['concept'] };

// French-speaking names outside the Rap FR part of the list (the language of their invented titles).
const FRENCH = new Set(`Phoenix|M83|Air|Daft Punk|SebastiAn|Gesaffelstein|Cassius|Etienne de Crécy|Alex Gopher|Modjo|Demon|Le Knight Club|Bérurier Noir|
  Gojira|Alcest|Taïro|Alpha Blondy|Tiken Jah Fakoly|Manu Chao|Dub Inc|Raggasonic|Pierpoljak|Tonton David|Nuttea|Krys|Admiral T|Yaniss Odua|
  Saël|Natty Jean|Rida|Danakil|Biga Ranx|Brain Damage|High Tone|Ez3kiel|Improvisators Dub|Zenzile|Kaly Live Dub|Manudigital|Stand High Patrol|
  Pupajim|snorunt|miaooss!!|8stikram|TKKF|55asky|243red|Sekkin Nedim|Oklou|Gemroz|0ne0|Holy Priest`.split('|').map((s) => s.trim()));
const BELGIAN = new Set(['Roméo Elvis', 'Caballero & JeanJass', 'Lous and the Yakuza', 'Veence Hanao', 'Le Motel', 'Arno', 'Hamza', 'Damso']);
const COUNTRY_BY_GENRE = { 'Rap-FR': 'FR', Chanson: 'FR', 'French-Touch': 'FR', YouTuber: 'FR', 'Insta-Artist': 'FR', 'K-Pop': 'KR', Afrobeat: 'NG', 'Afro-Trap': 'FR', Dancehall: 'FR' };
const KNOWN_COUNTRY = { 'Bob Marley': 'JM', 'Peter Tosh': 'JM', 'Bunny Wailer': 'JM', 'Burning Spear': 'JM', 'Jimmy Cliff': 'JM', 'Toots and the Maytals': 'JM', 'Desmond Dekker': 'JM', 'Lee Scratch Perry': 'JM', 'King Tubby': 'JM', 'Augustus Pablo': 'JM', 'Prince Buster': 'JM', Beethoven: 'DE', Mozart: 'AT', Bach: 'DE', Chopin: 'PL', Tchaikovsky: 'RU', Vivaldi: 'IT', 'Ennio Morricone': 'IT', Davido: 'NG', 'Burna Boy': 'NG',Pharaoh: 'RU', Bedoes: 'PL', 'One Ok Rock': 'JP', 'Little Big': 'RU', 'Hatsune Miku': 'JP', Avicii: 'SE', 'Martin Garrix': 'NL', Tiësto: 'NL', 'Armin van Buuren': 'NL', Hardwell: 'NL', 'Dimitri Vegas & Like Mike': 'BE', Rammstein: 'DE', Nightwish: 'FI', Sabaton: 'SE', 'Amelie Lens': 'BE', 'Charlotte de Witte': 'BE' };

// Index ranges of the list that are French scenes (rap, punk, rock, chanson, prog, reggae, dub).
const FRENCH_RANGES = [[451, 448 + 172], [617, 720], [733, 754], [869, 901]];

/* ------------------------------ Extra latino names ------------------------------ */

const LATIN = `J Balvin|Daddy Yankee|Ozuna|Anuel AA|Rauw Alejandro|Feid|Myke Towers|Shakira|Maluma|Becky G|Nicky Jam|Sech|Quevedo|Bizarrap|
  Young Miko|Tini|Arcángel|Wisin & Yandel|Manuel Turizo|Bad Gyal|Natti Natasha|Farruko`.split('|').map((s) => s.trim());
const LATIN_COUNTRY = { Shakira: 'CO', Maluma: 'CO', 'J Balvin': 'CO', Feid: 'CO', 'Karol G': 'CO', 'Manuel Turizo': 'CO', Quevedo: 'ES', 'Bad Gyal': 'ES', Bizarrap: 'AR', Tini: 'AR', 'Becky G': 'US', 'Natti Natasha': 'DO' };

/* ------------------------------ Build ------------------------------ */

const hash = (text) => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};
const rngOf = (seed) => {
  let s = seed || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), ((s ^= s >>> 16) >>> 0) / 4294967296);
};
const between = (rng, [lo, hi], log = false) => (log ? Math.round(Math.exp(Math.log(lo) + rng() * (Math.log(hi) - Math.log(lo)))) : Math.round(lo + rng() * (hi - lo)));
const slug = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || `a${hash(name)}`;

const tierOf = new Map();
for (const [tier, names] of Object.entries(TIERS)) for (const n of names.split('|')) tierOf.set(n.trim().toLowerCase(), tier);

const parseList = () => {
  const lines = readFileSync(join(docs, 'artistes-liste-proprio.md'), 'utf8').split(/\r?\n/);
  let section = 'Pop';
  const out = [];
  for (const line of lines) {
    if (line.startsWith('## ')) section = /RAP FR/.test(line) ? 'Rap-FR' : /RAP US/.test(line) ? 'Rap' : /MÉTAL|METAL/.test(line) ? 'Metal' : 'Pop';
    const m = line.match(/^(\d+)\. (.+)$/);
    if (!m) continue;
    const index = Number(m[1]);
    const parts = m[2].split(' | ');
    let name = parts[0].trim();
    const replaced = name.match(/\(duplicate removed, replaced with (.+)\)$/i);
    if (replaced) name = replaced[1].trim();
    const raw = (parts.find((p) => p.startsWith('Genre: ')) ?? `Genre: ${section}`).replace('Genre: ', '').trim();
    out.push({ index, name, raw });
  }
  return out;
};

const cellsOf = (line) => {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
};
const labels = readFileSync(join(docs, 'labels.csv'), 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((line) => {
  const cells = cellsOf(line);
  return { id: cells[0], country: cells[2], tier: Number(cells[5]), genres: cells[6].split(',') };
}).filter((l) => l.id !== 'inde');

const labelFor = (rng, genre, tier, country) => {
  // Stars and big names are signed (padlock in the game); some known names too; small names are free.
  const signed = tier === 'S' || tier === 'A' || (tier === 'B' && rng() < 0.6) || (tier === 'C' && rng() < 0.15);
  if (!signed) return '';
  const minTier = tier === 'S' ? 4 : tier === 'A' ? 3 : 1;
  let pool = labels.filter((l) => l.genres.includes(genre) && l.tier >= minTier);
  const local = pool.filter((l) => l.country === country);
  if (local.length > 0 && rng() < 0.7) pool = local;
  if (pool.length === 0) pool = labels.filter((l) => l.genres.includes(genre));
  if (pool.length === 0) pool = labels.filter((l) => l.tier >= minTier);
  return pool[Math.floor(rng() * pool.length)].id;
};

const sample = readFileSync(join(docs, 'artistes-echantillon.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(cellsOf);
const existing = new Set(sample.map((c) => (c[1] ?? '').trim().toLowerCase()));
const ids = new Set(sample.map((c) => c[0]));

const rows = [];
const seen = new Set();
const add = ({ name, raw, country, index }) => {
  const key = name.toLowerCase();
  if (existing.has(key) || seen.has(key)) return;
  seen.add(key);
  const rng = rngOf(hash(name));
  const tier = tierOf.get(key) ?? (UNDERGROUND.has(raw) ? 'D' : 'C');
  const st = STATS[tier];
  const genre = genreOf(raw);
  const gen = between(rng, st.gen);
  const potMin = Math.min(99, gen + Math.round(st.pot[0] + rng() * 2));
  const potMax = Math.min(99, potMin + between(rng, [1, st.pot[1]]));
  let id = slug(name);
  while (ids.has(id)) id += '_2';
  ids.add(id);
  const tags = TAGS[raw] ?? [];
  rows.push([
    id, name, country, '', genre, '', tags.join(';'), gen, potMin, Math.max(potMin, potMax), between(rng, st.fans, true), between(rng, st.hype),
    labelFor(rng, genre, tier, country), 'oui', ['normal', 'normal', 'bourreau', 'lazy', 'par_a_coups', 'oiseau_de_nuit'][Math.floor(rng() * 6)],
    between(rng, [30, 85]), between(rng, [30, 85]), `liste:${index}`,
  ]);
};

for (const item of parseList()) {
  const french = FRENCH_RANGES.some(([a, b]) => item.index >= a && item.index <= b) || FRENCH.has(item.name);
  const country = BELGIAN.has(item.name) ? 'BE' : KNOWN_COUNTRY[item.name] ?? (french ? 'FR' : COUNTRY_BY_GENRE[item.raw] ?? 'US');
  add({ ...item, country });
}
LATIN.forEach((name, i) => add({ name, raw: 'Latin', country: LATIN_COUNTRY[name] ?? 'PR', index: 1001 + i }));
// Latin is its own genre in the game.
for (const row of rows) if (row[17].startsWith('liste:10') && Number(row[17].slice(6)) > 1000) row[4] = 'latin';

const cell = (v) => (typeof v === 'string' && /[,"]/.test(v) ? `"${v.replace(/"/g, '')}"` : String(v));
const head = 'id,nom,pays,ville,genre,genres_secondaires,tags,gen,pot_min,pot_max,fans,hype,label_id,reel,profil_energie,sync,merch,a_verifier';
writeFileSync(join(docs, 'artistes-liste.csv'), `${head}\n${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`);
const count = (t) => rows.filter((r) => (tierOf.get(r[1].toLowerCase()) ?? 'C') === t).length;
console.log(`${rows.length} artists (S ${count('S')}, A ${count('A')}, B ${count('B')})`);
