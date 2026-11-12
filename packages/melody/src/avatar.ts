// Avatars: every artist is drawn as a silhouette in front of a coloured sun. No face, so no likeness of a real
// person: only what one sees from far away. Real artists get the look written in data/looks.ts; everyone else
// gets one drawn from the id and the genre, always the same for the same artist.
import { CATALOG_ARTISTS } from './data/catalog.gen.ts';
import { LOOKS } from './data/looks.ts';
import { createRng, hashString } from './rng.ts';

export const HAIRS = ['none', 'short', 'afro', 'curly', 'locks', 'twists', 'long', 'braids', 'bun', 'ponytail', 'bob', 'mohawk', 'spiky', 'wig', 'twintails'] as const;
export const HATS = ['cap', 'capback', 'beanie', 'durag', 'bucket', 'hood', 'cowboy', 'fedora', 'helmet', 'bandana', 'headphones', 'cagoule', 'mask'] as const;
export const FACES = ['shades', 'glasses'] as const;

export type Hair = (typeof HAIRS)[number];
export type Hat = (typeof HATS)[number];
export type Face = (typeof FACES)[number];

export interface Look {
  hair: Hair;
  hat: Hat | null;
  face: Face | null;
  beard: boolean;
  chain: boolean;
  /** Broad shoulders. */
  wide: boolean;
  /** A band: two more people behind. */
  group: boolean;
  guitar: boolean;
}

const isOneOf = <T extends string>(list: readonly T[], word: string): word is T => (list as readonly string[]).includes(word);

/** Reads a line of data/looks.ts. Throws on a word it does not know, so a typo cannot hide. */
export const parseLook = (text: string): Look => {
  const look: Look = { hair: 'short', hat: null, face: null, beard: false, chain: false, wide: false, group: false, guitar: false };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (isOneOf(HAIRS, word)) look.hair = word;
    else if (isOneOf(HATS, word)) look.hat = word;
    else if (isOneOf(FACES, word)) look.face = word;
    else if (word === 'beard' || word === 'chain' || word === 'wide' || word === 'group' || word === 'guitar') look[word] = true;
    else throw new Error(`Unknown look word: ${word}`);
  }
  return look;
};

interface Style {
  hair: Hair[];
  hats: Hat[];
  /** Chances of a hat, shades, glasses, a beard, a chain, a guitar. */
  hat: number;
  shades: number;
  glasses: number;
  beard: number;
  chain: number;
  guitar: number;
}

const RAP: Style = {
  hair: ['short', 'short', 'short', 'twists', 'twists', 'locks', 'locks', 'braids', 'braids', 'afro', 'none'],
  hats: ['cap', 'cap', 'cap', 'hood', 'hood', 'beanie', 'beanie', 'durag', 'bucket', 'capback', 'bandana'],
  hat: 0.45, shades: 0.2, glasses: 0.04, beard: 0.3, chain: 0.5, guitar: 0,
};
const POP: Style = {
  hair: ['short', 'short', 'long', 'long', 'long', 'curly', 'curly', 'bob', 'bun', 'ponytail', 'afro', 'braids'],
  hats: ['cap', 'beanie', 'fedora', 'bucket'],
  hat: 0.15, shades: 0.12, glasses: 0.06, beard: 0.15, chain: 0.2, guitar: 0.12,
};

const STYLES: Record<string, Style> = {
  rap_fr: RAP,
  rap_us: RAP,
  trap: RAP,
  drill: { ...RAP, hats: ['cagoule', 'cagoule', 'hood', 'hood', 'cap', 'beanie', 'durag'], hat: 0.6 },
  rnb: POP,
  pop: POP,
  variete: { ...POP, guitar: 0.3 },
  afro: {
    hair: ['twists', 'twists', 'short', 'short', 'locks', 'braids', 'braids', 'afro'],
    hats: ['bucket', 'cap', 'beanie', 'durag'],
    hat: 0.25, shades: 0.25, glasses: 0.03, beard: 0.25, chain: 0.4, guitar: 0,
  },
  latin: {
    hair: ['short', 'short', 'short', 'long', 'long', 'curly', 'bun'],
    hats: ['cap', 'cap', 'bucket', 'bandana'],
    hat: 0.3, shades: 0.3, glasses: 0.03, beard: 0.35, chain: 0.45, guitar: 0.08,
  },
  hyperpop: {
    hair: ['spiky', 'spiky', 'twintails', 'bob', 'long', 'long', 'mohawk', 'short'],
    hats: ['beanie', 'cap', 'headphones', 'hood'],
    hat: 0.25, shades: 0.1, glasses: 0.2, beard: 0.03, chain: 0.2, guitar: 0,
  },
  electro: {
    hair: ['short', 'short', 'short', 'long', 'long', 'bob', 'none', 'bun'],
    hats: ['headphones', 'headphones', 'headphones', 'headphones', 'cap', 'capback'],
    hat: 0.5, shades: 0.15, glasses: 0.15, beard: 0.25, chain: 0.05, guitar: 0,
  },
  rock: {
    hair: ['long', 'long', 'long', 'short', 'short', 'spiky', 'curly', 'mohawk', 'bob'],
    hats: ['cap', 'beanie', 'cowboy', 'fedora'],
    hat: 0.12, shades: 0.12, glasses: 0.05, beard: 0.25, chain: 0.05, guitar: 0.45,
  },
  metal: {
    hair: ['long', 'long', 'long', 'long', 'long', 'none', 'short', 'mohawk', 'locks'],
    hats: ['bandana', 'beanie'],
    hat: 0.08, shades: 0.08, glasses: 0.02, beard: 0.5, chain: 0.1, guitar: 0.45,
  },
  reggae: {
    hair: ['locks', 'locks', 'locks', 'locks', 'locks', 'twists', 'short', 'afro'],
    hats: ['beanie', 'beanie', 'cap', 'bucket'],
    hat: 0.3, shades: 0.15, glasses: 0.03, beard: 0.45, chain: 0.1, guitar: 0.15,
  },
  jazz: {
    hair: ['short', 'short', 'short', 'none', 'afro', 'curly', 'bun'],
    hats: ['fedora', 'fedora', 'fedora', 'beanie', 'cap'],
    hat: 0.35, shades: 0.15, glasses: 0.25, beard: 0.3, chain: 0, guitar: 0,
  },
};

const known = new Map<string, Look>();
let catalogGenres: Map<string, string> | null = null;
// The genre of an artist of the catalogue, so his look is the same wherever he is drawn.
const catalogGenre = (id: string): string | undefined => (catalogGenres ??= new Map(CATALOG_ARTISTS.map((a) => [a.id, a.genre]))).get(id);

/** The look of an artist: the one written for him, or one drawn from his id and his genre. */
export const lookOf = (id: string, genre?: string): Look => {
  const written = LOOKS[id];
  if (written !== undefined) {
    const cached = known.get(id);
    if (cached) return cached;
    const look = parseLook(written);
    known.set(id, look);
    return look;
  }
  const style = STYLES[catalogGenre(id) ?? genre ?? ''] ?? POP;
  const rng = createRng(hashString(`look:${id}`));
  const hair = rng.pick(style.hair);
  const hat = rng.chance(style.hat) ? rng.pick(style.hats) : null;
  // A face fully hidden needs no glasses.
  const hidden = hat === 'cagoule' || hat === 'helmet' || hat === 'mask';
  const face: Face | null = hidden ? null : rng.chance(style.shades) ? 'shades' : rng.chance(style.glasses) ? 'glasses' : null;
  return {
    hair,
    hat,
    face,
    beard: !hidden && rng.chance(style.beard),
    chain: rng.chance(style.chain),
    wide: rng.chance(0.3),
    group: false,
    guitar: rng.chance(style.guitar),
  };
};
