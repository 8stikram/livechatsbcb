// Press reviews and tweets on each release, shown on the song page. Invented media and accounts only, funny and
// varied; what they say follows the song's quality and its first week. Drawn from the world's seed: nothing is
// stored, the same song always gets the same reactions.
import { rngFor, type Rng } from './rng.ts';
import type { Song, World } from './types.ts';

export const MEDIA = ['Rapstronaute', 'Pitchfourche', 'Les Écouteurs', 'Mélomag', 'Le Bon Son', 'Oreille Cassée', 'Tympan Hebdo', 'Le Mouv’ment'] as const;

const HANDLES = [
  '@kevdu93', '@lea_sans_filtre', '@beatmaker2000', '@tata_jocelyne', '@punchline_police', '@mehdi.fm', '@jul1e_ecoute', '@leboss_du_skip',
  '@sardine_officiel', '@maman_de_lucas', '@critique_de_canap', '@nina.vibes', '@toto_streaming', '@dj_kebab', '@ines_hydratee', '@le_vrai_fan',
];

type Band = 'top' | 'good' | 'mid' | 'bad';

const REVIEWS: Record<Band, readonly string[]> = {
  top: [
    'Un classique instantané. On l’écoute en boucle depuis lundi et on n’a toujours pas de regrets.',
    '{a} met tout le monde d’accord. Même notre stagiaire qui n’aime rien.',
    'La prod respire, le refrain frappe, le couplet découpe. Rien à jeter.',
  ],
  good: [
    'Solide. {a} sait ce qu’il fait, et ça s’entend.',
    'Pas révolutionnaire, mais très efficace. Le refrain va traîner dans les têtes.',
    'Un bon son de plus pour {a}. On en redemande.',
  ],
  mid: [
    'Correct, sans plus. On attendait un peu mieux de {a}.',
    'La prod est propre, le texte un peu paresseux. Ça s’écoute en faisant la vaisselle.',
    'Ni bon ni mauvais. Le genre de son qu’on oublie en enlevant ses écouteurs.',
  ],
  bad: [
    'On a cherché le refrain. On le cherche encore.',
    '{a} a dû l’enregistrer entre deux réunions. Ça s’entend.',
    'Ce son existe. C’est à peu près tout ce qu’on peut en dire.',
  ],
};

const TWEETS: Record<Band, readonly string[]> = {
  top: [
    'J’ai mis « {t} » en réveil. Je me lève de bonne humeur maintenant. Merci {a}.',
    '« {t} » c’est le son de l’année et l’année vient de commencer pour moi',
    'Ma mère m’a demandé c’est quoi ce son. Elle l’a mis en sonnerie.',
    'Trois heures que « {t} » tourne. Les voisins tapent au mur EN RYTHME.',
  ],
  good: [
    '« {t} » propre. {a} régale.',
    'Bon son. Pas le meilleur de {a} mais ça passe crème.',
    'J’avoue « {t} » je l’ai mis dans ma playlist muscu',
    'Le refrain de « {t} » est rentré dans ma tête et il paie pas de loyer',
  ],
  mid: [
    'Mouais. « {t} » c’est un son pour attendre le bus.',
    '{a} peut mieux faire, je dis ça avec amour.',
    'J’ai écouté « {t} ». Je sais plus ce que j’ai écouté.',
    'C’est pas mauvais hein. C’est juste… là.',
  ],
  bad: [
    'Qui a laissé {a} sortir « {t} » ? Je veux juste parler.',
    'J’ai skip « {t} » tellement vite que mon téléphone a chauffé',
    '« {t} » m’a fait regretter le silence',
    'Même mon chat est sorti de la pièce. Il aime tout pourtant.',
  ],
};

const HYPE_TWEETS = [
  'Les chiffres de « {t} » sont MALADES, {a} est partout',
  '« {t} » est sur toutes les stories, on peut plus y échapper',
];

const pick = <T,>(rng: Rng, items: readonly T[], taken: Set<T>): T => {
  const free = items.filter((x) => !taken.has(x));
  const choice = rng.pick(free.length ? free : items);
  taken.add(choice);
  return choice;
};

const bandOf = (score: number): Band => (score >= 80 ? 'top' : score >= 62 ? 'good' : score >= 45 ? 'mid' : 'bad');

export interface Reactions {
  reviews: Array<{ media: string; score: number; text: string }>;
  tweets: Array<{ handle: string; text: string; likes: number }>;
}

/** The press and the networks on a released song. */
export const reactionsOf = (world: World, song: Song): Reactions | null => {
  if (song.state !== 'released') return null;
  const rng = rngFor(world.seed, song.releaseTick ?? 0, `press:${song.id}`);
  const artist = world.artists[song.artistId]?.name ?? 'l’artiste';
  const fill = (text: string): string => text.replaceAll('{a}', artist).replaceAll('{t}', song.title);
  // The press listens to the music; the networks follow the success too.
  const press = song.quality;
  const crowd = song.quality * 0.6 + song.hitScore * 0.4;
  const usedMedia = new Set<string>();
  const usedText = new Set<string>();
  const reviews = [0, 1].map(() => {
    const score = Math.max(1, Math.min(10, Math.round((press + rng.range(-10, 10)) / 10)));
    return { media: pick(rng, MEDIA, usedMedia), score, text: fill(pick(rng, REVIEWS[bandOf(score * 10)], usedText)) };
  });
  const usedHandles = new Set<string>();
  const tweets = [0, 1, 2, 3].map((i) => {
    // One voice against the crowd, for fun.
    const mood = i === 3 ? (crowd >= 62 ? crowd - 40 : crowd + 30) : crowd + rng.range(-12, 12);
    const pool = i === 0 && song.hitScore >= 75 ? HYPE_TWEETS : TWEETS[bandOf(mood)];
    const reach = (world.artists[song.artistId]?.fans ?? 1_000) * 0.002 * (0.5 + song.hitScore / 100);
    return { handle: pick(rng, HANDLES, usedHandles), text: fill(pick(rng, pool, usedText)), likes: Math.max(1, Math.round(reach * rng.range(0.2, 2))) };
  });
  return { reviews, tweets };
};
