// Melody Tycoon rules engine. No network, no storage: the server and the app both build on it.
export * from './types.ts';
export { CFG } from './config.ts';
export { GENRES, GENRE_IDS, BEATS, THEMES, beatById, coherence } from './data/content.ts';
export { CATALOG_ARTISTS, CATALOG_LABELS } from './data/catalog.gen.ts';
export { artistFromCatalog, artisticSkill, generalRating, genreAffinity, energyRegen } from './artists.ts';
export {
  estimateQuality, rollQuality, qualityWord, songCost, songDelay, songEnergy, producerOfLevel, featDemand, featChance,
  type SongPlan, type QualityEstimate,
} from './quality.ts';
export { MARKETING, marketingById, publicFit, firstWeek, hitWord, type FirstWeek, type FirstWeekInput } from './release.ts';
export {
  artistValue, catalogueValue, contractOf, rosterOf, debtOf, fansOf, netWorth, playGig, canTierUp, ranking,
  type RankingLine, type GigResult,
} from './economy.ts';
export {
  GameError, createWorld, addPlayerLabel, freeAgents, expectedOffer, signArtist, createSong, scheduleRelease, bookGig, takeLoan,
  type Offer, type SongRequest,
} from './world.ts';
export {
  MAX_PLAYER_LABELS, starterChoices, foundLabel, producerFor, applyAction, buildView, previewSong,
  type MelodyAction, type MelodyView, type ArtistView, type RosterView, type SongView, type MarketView, type SongPreview,
} from './play.ts';
export { runTick, type TickReport, type ReleaseReport, type LabelReport } from './tick.ts';
export { simulate, STRATEGIES, type Strategy, type Snapshot } from './sim.ts';
export { createRng, rngFor, type Rng } from './rng.ts';
