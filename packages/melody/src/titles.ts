// Song titles for the releases of the artists the game runs: in the artist's language and style,
// mostly serious, sometimes absurd. The same draw always gives the same title.
import type { Rng } from './rng.ts';
import type { GenreId } from './types.ts';

export type Lang = 'fr' | 'en' | 'es';

const FRENCH = new Set(['FR', 'BE', 'CH', 'MC', 'LU', 'CI', 'SN', 'CM', 'CD', 'CG', 'ML', 'GN', 'BF', 'GA', 'HT', 'MA', 'DZ', 'TN', 'RE', 'GP', 'MQ']);
const SPANISH = new Set(['ES', 'PR', 'CO', 'MX', 'AR', 'DO', 'CL', 'PE', 'VE', 'CU', 'UY', 'PA']);

export const langOf = (country: string | null | undefined, genre?: GenreId): Lang => {
  if (country && FRENCH.has(country)) return 'fr';
  if ((country && SPANISH.has(country)) || genre === 'latin') return 'es';
  if (!country && (genre === 'rap_fr' || genre === 'variete')) return 'fr';
  return 'en';
};

interface Bank {
  serious: string[];
  absurd: string[];
  /** "{a} {b}" built from two lists. */
  first: string[];
  second: string[];
}

const BANKS: Record<Lang, Bank> = {
  fr: {
    serious: [
      'Nuit blanche', 'Sous la pluie', 'Cœur en béton', 'Dernier métro', 'Rien à perdre', 'Ma ville', 'Plus jamais', 'Tout pour la mif',
      'Loin d’ici', 'Encore une fois', 'Pas le choix', 'Ciel gris', 'Lumière bleue', 'Bitume', 'La vie qu’on mène', 'Mauvaise graine',
      'Sans retour', 'Jusqu’au bout', 'Mes frères', 'Fumée noire', 'Prière', 'Avant l’aube', 'Vague à l’âme', 'Hors d’atteinte',
    ],
    absurd: [
      'Ma grand-mère fait de la drill', 'Raclette à Ibiza', 'Le pigeon m’a volé mon kebab', 'Trottinette en feu', 'J’ai perdu mon Wi-Fi',
      'Croissant tactique', 'Mon chat est en garde à vue', 'Pas de réseau à la campagne', 'Tonton est en DM', 'Fondue sur la plage',
      'Sans gluten sans pitié', 'Belote à 3 h', 'Le micro-ondes pleure', 'Ma daronne a TikTok', 'Escargot turbo', 'Chaussettes en soie',
    ],
    first: ['Cœur', 'Nuit', 'Larmes', 'Ombre', 'Rêve', 'Feu', 'Lune', 'Vitesse', 'Silence', 'Diamant', 'Fièvre', 'Ruelle'],
    second: ['de pierre', 'de folie', 'de verre', 'de banlieue', 'de minuit', 'de cristal', 'de papier', 'de chrome', 'de glace', 'd’or', 'de feu', 'd’hiver'],
  },
  en: {
    serious: [
      'Midnight Drive', 'No Love Lost', 'Golden Hours', 'Cold Summer', 'Ghosts', 'Run It Back', 'Paper Hearts', 'Last Call', 'Neon Tears',
      'Better Days', 'Highway Dreams', 'Fade Away', 'Too Far Gone', 'Heavy Crown', 'Say My Name', 'Low Lights', 'Stay', 'Afterglow',
      'Rain on Me', 'Real Ones', 'Echoes', 'Blue Hour', 'Wildfire', 'Hold On',
    ],
    absurd: [
      'My Lawyer Says No', 'Microwave Love', 'Taxes in Atlantis', 'Lost My AirPods', 'Pizza at 4 AM', 'Dinosaur Drip', 'Uber to Mars',
      'My Ex Is a Pigeon', 'Wi-Fi Password', 'Sock Thief', 'Grandma Got Bars', 'Spicy Lasagna', 'Emotional Damage at Costco', 'Goose Season',
      'Haunted Fridge', 'Crocs in the Club',
    ],
    first: ['Neon', 'Broken', 'Velvet', 'Electric', 'Silent', 'Wild', 'Golden', 'Frozen', 'Midnight', 'Faded', 'Burning', 'Paper'],
    second: ['Hearts', 'Nights', 'Roses', 'Lights', 'Skies', 'Waves', 'Dreams', 'Ghosts', 'Promises', 'Streets', 'Tears', 'Crowns'],
  },
  es: {
    serious: [
      'Noche loca', 'Bailando solo', 'Mi reina', 'Fuego lento', 'Sin ti', 'Bebé dime', 'Calor', 'Otra vez', 'Corazón frío', 'La última',
      'Hasta el final', 'Luna llena', 'Mentiras', 'Te extraño', 'Perreo triste', 'Medellín',
    ],
    absurd: ['Mi abuela perrea', 'Tacos a las 3', 'Perreo en la luna', 'El gato DJ', 'Wi-Fi del vecino', 'Chancla voladora', 'Arepa de oro', 'Llama en la disco'],
    first: ['Fuego', 'Noche', 'Corazón', 'Luna', 'Calle', 'Sueño', 'Playa', 'Lágrimas'],
    second: ['de oro', 'de cristal', 'sin fin', 'de verano', 'de neón', 'salvaje', 'de amor', 'prohibida'],
  },
};

// A little colour per scene, whatever the language.
const BY_GENRE: Partial<Record<GenreId, string[]>> = {
  metal: ['Ashes of Kings', 'Iron Requiem', 'Blood Moon Rising', 'Cathedral of Bones', 'Storm of Steel', 'Black Winter', 'Throne of Ruin', 'The Last Crusade'],
  reggae: ['Jah Guide', 'Roots and Culture', 'Sunshine Riddim', 'Babylon Fall', 'One Love Again', 'Island Breeze', 'Rise Up Dread'],
  jazz: ['Blue in Green Again', 'Smoke Rings', 'Night in Montmartre', 'Velvet Swing', 'Opus 7', 'Sonata for Rain', 'Lullaby in E'],
  electro: ['Pulse', 'Warehouse 303', 'Strobe', 'Afterhours', 'Kinetic', 'Night Shift', 'Bassline Therapy'],
};

/** A made-up title for a release of an artist the game runs. */
export const inventTitle = (rng: Rng, lang: Lang, genre: GenreId): string => {
  const bank = BANKS[lang];
  const roll = rng.next();
  const scene = BY_GENRE[genre];
  if (scene && roll < 0.3) return rng.pick(scene);
  if (roll < 0.55) return rng.pick(bank.serious);
  if (roll < 0.78) return `${rng.pick(bank.first)} ${rng.pick(bank.second)}`;
  return rng.pick(bank.absurd);
};
