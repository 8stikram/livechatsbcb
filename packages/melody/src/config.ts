// Every balance number of the game lives here (see docs/melody-tycoon).
// The simulator (src/sim.ts) exists to tune these values.

export const CFG = {
  ticksPerSeason: 28,
  ticksPerMonth: 4,

  start: { cash: 30_000, reputation: 10 },

  /** An artist with more fans than fameFans[tier - 1] does not sign with a label of that tier. */
  fameFans: [50_000, 500_000, 5_000_000, 25_000_000, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  advanceShare: 0.15,

  /** Indexed by tier - 1. */
  tiers: {
    names: ['Label Maison', 'Label Underground', 'Label Respecté', 'Label Mainstream', 'Empire', 'Label Divin'],
    maxArtists: [5, 10, 25, 50, 100, 670],
    fixedCosts: [200, 1_000, 5_000, 20_000, 80_000, 300_000],
    songBudgetCap: [15_000, 60_000, 250_000, 1_000_000, 5_000_000, Number.POSITIVE_INFINITY],
    loanCap: [20_000, 100_000, 500_000, 3_000_000, 20_000_000, 100_000_000],
  },

  energy: {
    regenBase: 25,
    songBase: 10,
    perCostlyChoice: 5,
    feat: 5,
    gig: 10,
    lowEnergyThreshold: 30,
    lowEnergyPenalty: 4,
  },

  fatigue: { perSong: 12, recovery: 8, threshold: 70, penalty: 3 },

  quality: {
    // Money helps a little and stops helping fast; the choices (fit, coherence) weigh the most.
    weights: { artist: 0.35, producer: 0.12, theme: 0.1, beat: 0.08, studio: 0.07, choices: 0.28 },
    baseWidth: 6,
    /** Quality ceiling by number of level-1 choices (0..4). */
    capByFreeChoices: [99, 99, 92, 86, 80],
    themeValue: [0, 58, 64, 68],
    themePrice: [0, 600, 3_500, 20_000],
    beatValue: [50, 58, 64, 0],
    beatPrice: [0, 400, 3_000, 0],
    studioValue: [50, 57, 62, 66],
    studioPrice: [0, 1_500, 8_000, 40_000],
    studioDelay: [0, 0, 1, 1],
    producerLevel: [48, 57, 63, 68],
    producerPrice: [0, 1_000, 5_500, 40_000],
  },

  release: {
    payPerStream: 0.004,
    fanStreams: 3,
    discoveryRate: 0.6,
    organicReach: 0.5,
    fanConversion: 0.02,
    /** Marketing reach above max(floor, fans x softReachFans) only counts for softReachRate. */
    softReachFloor: 100_000,
    softReachFans: 3,
    softReachRate: 0.25,
    /** Reach multiplier = 1 + hype / hypeReach. */
    hypeReach: 100,
    decayBase: 0.55,
    decayHit: 0.35,
    catalogFloor: 0.01,
    viralChance: 0.02,
    /** One release per artist per week, three per label. */
    singleCooldown: 1,
    perLabelWeek: 3,
  },

  hype: { decay: 0.92, top10Global: 4, top10Genre: 2, idleTicks: 6, idlePenalty: 3 },

  fans: { idleTicks: 8, idleLoss: 0.01, flopLoss: 0.005, gigGain: 0.02 },

  morale: { start: 60, hit: 6, flop: -5, lowEnergy: -3, gigFull: 3 },

  live: {
    demandFactor: 3,
    margin: 0.7,
    labelShare: 0.5,
    /** Each extra concert the same week draws this much less. */
    repeatPenalty: 0.25,
    venues: [
      { name: 'Bar', seats: 100, price: 10, fixed: 100 },
      { name: 'Club', seats: 500, price: 18, fixed: 1_500 },
      { name: 'Salle', seats: 2_000, price: 30, fixed: 8_000 },
      { name: 'Grande salle', seats: 6_000, price: 45, fixed: 40_000 },
      { name: 'Arène', seats: 15_000, price: 65, fixed: 150_000 },
      { name: 'Stade', seats: 60_000, price: 80, fixed: 800_000 },
    ],
  },

  bank: {
    classicBaseRate: 0.01,
    emergencyRate: 0.03,
    emergencyTicks: 4,
    maxEmergency: 2,
    bankruptcyTicks: 14,
  },

  npc: { releasesPerTick: 40, keepAboveStreams: 20_000 },

  /** Fewest streams in a week to appear in a chart (the catalogue is still small). */
  charts: { globalMin: 100_000, genreMin: 10_000 },

  ranking: { cash: 0.3, fans: 0.3, catalogue: 0.25, reputation: 0.15 },
} as const;
