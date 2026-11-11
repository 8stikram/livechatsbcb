// Seeded random numbers: the same seed always replays the same world.

export interface Rng {
  next(): number;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  normal(): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export const hashString = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const createRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const range = (min: number, max: number): number => min + next() * (max - min);
  return {
    next,
    range,
    int: (min, max) => Math.floor(range(min, max + 1)),
    normal: () => {
      const u = Math.max(next(), 1e-9);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
    },
    chance: (p) => next() < p,
    pick: (items) => {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('pick from an empty list');
      return item;
    },
  };
};

/** A generator tied to one world, one tick and one purpose. */
export const rngFor = (seed: number, tick: number, purpose: string): Rng =>
  createRng(seed ^ Math.imul(tick + 1, 2654435761) ^ hashString(purpose));

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
