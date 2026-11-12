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
export {
  startSession, reactToEvent, cancelSession, offerFeat, useDeal, skipFeat, finishSession, sessionOf, sessionView, guestDemand, guestBonus, guestChoices,
  type SessionView, type SessionEventView, type GuestView,
} from './studio.ts';
export {
  CONTRACT_MONTHS, TALK, openTalk, makeOffer, leaveTalk, offerScore, talkOf, talkBlocked, talkView, talksOfLabel, talkNews, cleanTalks,
  type Talk, type TalkMemory, type TalkView, type TalkNews, type Clause, type Mood,
} from './negotiation.ts';
export {
  TUTORIAL_GIFT_CAP, tutorialOf, tutorialStep, tutorialView, startTutorial, skipTutorial,
  type Tutorial, type TutorialStep, type TutorialView,
} from './tutorial.ts';
export {
  DEALS, askFeat, answerDeal, cancelDeal, usableDeals, dealsView, otherArtists, tickDeals,
  type FeatDeal, type DealStatus, type FeatDealView, type OtherArtistView,
} from './featdeals.ts';
export { runTick, type TickReport, type ReleaseReport, type LabelReport } from './tick.ts';
export { simulate, STRATEGIES, type Strategy, type Snapshot } from './sim.ts';
export { createRng, rngFor, type Rng } from './rng.ts';
