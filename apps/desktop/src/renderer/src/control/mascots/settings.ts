import type { PersonaId } from './persona';

export type PieceSetting = { dx: number; dy: number; echX: number; echY: number };

export type PersonaSettings = {
  /** Chosen variant per `famille` (the variant id, not its label). */
  vars: Record<string, string>;
  /** Offsets (scene units, 640x400) and scales, keyed by the piece's `data-nom`. */
  pieces: Record<string, PieceSetting>;
  /** Crop of the scene (viewBox units) framing face and shoulders, for cards and the invite. */
  head: { x: number; y: number; w: number; h: number };
};

const p = (dx: number, dy: number, echX = 1, echY = 1): PieceSetting => ({ dx, dy, echX, echY });

/** The owner's settings, from docs/persos/REGLAGES.md (2026-11-10): the defaults of each mascot. */
export const PIECE_SETTINGS: Record<PersonaId, PersonaSettings> = {
  insp: {
    vars: { chapeau: 'feutre', moustache: 'moustache', main: 'cafe' },
    pieces: {
      'Tube néon': p(5, 5, 1.44, 1.44),
      'Oreilles': p(0, 0, 0.98, 0.98),
      'Chapeau': p(0, 0, 1.14, 1.14),
      'Lampe de bureau': p(14, 5),
      'Téléphone': p(-5, 4),
    },
    head: { x: 208, y: 24, w: 224, h: 168 },
  },
  micro: {
    vars: { cravate: 'noeud', coiffure: 'plaquee', moustache: 'fine' },
    pieces: {
      'Nœud ou cravate': p(1, -3, 1.68, 1.68),
      'Bras droit': p(4, 5),
      'Moustache': p(2, 0, 1.68, 1.68),
      'Bras gauche': p(-3, 7),
      'Main droite': p(4, 7),
      'Main gauche': p(-2, 4),
      'Criquet': p(0, 0, 1.38, 1.38),
    },
    head: { x: 208, y: 22, w: 224, h: 168 },
  },
  boum: {
    vars: { lunettes: 'yeux', binocles: 'sans', gants: 'jaunes' },
    pieces: {
      'Cheveux': p(-1, -13, 0.78, 0.78),
      'Mèches': p(0, 2, 1.3, 1.3),
    },
    head: { x: 192, y: 8, w: 256, h: 192 },
  },
  boule: {
    vars: { coiffe: 'foulard', boucles: 'pendants', chale: 'brode' },
    pieces: {
      'Ouverture et lune': p(0, 0, 1.02, 1.02),
      'Lanterne gauche': p(0, 0, 1.16, 1.16),
      'Lanterne droite': p(26, 3, 1.16, 1.16),
      'Tête': p(0, 3, 0.88, 0.88),
      'Table et velours': p(1, 8, 1.16, 1.16),
      'Cartes de tarot': p(1, 6, 0.9, 0.9),
      'Bougies': p(4, -9, 1.16, 1.16),
      'Encens': p(-89, 1),
    },
    head: { x: 192, y: 10, w: 256, h: 192 },
  },
  chrono: {
    vars: { tenue: 'maillot', tete: 'bandeau', barbe: 'trois' },
    pieces: {
      'Tête': p(0, 3),
      'Barbe': p(-1, 2, 1.02, 1.02),
      'Casquette ou bandeau': p(0, 0, 0.92, 0.92),
      'Sifflet et cordon': p(0, 5, 1.36, 0.92),
      'Bras droit': p(1, 9),
      'Sablier': p(-3, -1),
      'Main droite': p(0, 9),
      'Planchette et cartons': p(-3, 5),
      'Bras gauche': p(0, 8),
      'Main gauche': p(0, 8),
    },
    head: { x: 208, y: 30, w: 224, h: 168 },
  },
};
