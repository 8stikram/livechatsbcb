// Melody Tycoon rules engine. No network, no storage: the server and the app both build on it.
export * from './types.ts';
export { CFG } from './config.ts';
export { GENRES, GENRE_IDS, BEATS, THEMES, beatById, coherence } from './data/content.ts';
export { CATALOG_ARTISTS, CATALOG_LABELS } from './data/catalog.gen.ts';
export { artistFromCatalog, artisticSkill, generalRating, genreAffinity, energyRegen } from './artists.ts';
export {
  estimateQuality, rollQuality, qualityWord, songCost, priceScale, songDelay, songEnergy, producerOfLevel, featDemand, featChance,
  type SongPlan, type QualityEstimate,
} from './quality.ts';
export { MARKETING, marketingById, publicFit, firstWeek, hitWord, buzzOf, promoViews, releaseWeek, type FirstWeek, type FirstWeekInput } from './release.ts';
export {
  CRAFT, choiceScore, riskOf, isPerfect, isSecret, secretCombos, themeFits, beatFits, experienceBonus, studioOffers, trendOf, trendBoost,
  notebookOf, noteCombo, rollSurprise, countryOf, type StudioOffers, type Offered, type Trend, type NotebookEntry, type Surprise,
} from './craft.ts';
export { inventTitle, langOf, type Lang } from './titles.ts';
export {
  artistValue, catalogueValue, contractOf, rosterOf, debtOf, fansOf, netWorth, playGig, canTierUp, ranking,
  type RankingLine, type GigResult,
} from './economy.ts';
export {
  GameError, createWorld, addPlayerLabel, freeAgents, expectedOffer, signArtist, createSong, scheduleRelease, releaseBlocked, bookGig, takeLoan,
  type Offer, type SongRequest,
} from './world.ts';
export {
  MAX_PLAYER_LABELS, starterChoices, foundLabel, producerFor, applyAction, buildView, previewSong,
  type MelodyAction, type MelodyView, type ArtistView, type RosterView, type SongView, type MarketView, type SongPreview, type LabelCard,
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
export {
  TRANSFERS, askTransfer, answerTransfer, cancelTransfer, completeTransfer, setClause, clauseOf, agreedTransfer, transfersView, tickTransfers,
  type Transfer, type TransferStatus, type TransferView,
} from './transfers.ts';
export { swapBlocked, dropAgreed } from './transfers.ts';
export {
  AUCTIONS, auctionOf, auctionsView, bid, cancelAuction, nextBid, startAuction, tickAuctions,
  type Auction, type AuctionStatus, type AuctionView, type Bid,
} from './auctions.ts';
export {
  LENDING, borrow, cancelListing, fairFee, lendingsView, listLoan, loanOf, returnLoans, shareLoan, tickLending,
  type Lending, type LendingStatus, type LendingView,
} from './lending.ts';
export { LETDOWN, usualNote, isLetdown, judgeRelease } from './letdown.ts';
export { studioCardsFor, STUDIO_CONTENT } from './studio.ts';
export { CARD_IDS, EVENTS, EVENT_CONTENT, SERVER_CONTENT, SERVER_IDS, answerCard, applyStreamEvents, describeEffect, eventsView, streamMult, tickCards, tickServerEvents, type Card, type CardChoice, type CardEffect, type CardView, type EventsView, type ServerEvent } from './events.ts';
export { ESTATE, TIER_TABLE, assetBase, assetLoanCap, buyBack, buybackPrice, estateView, repayLoans, takeAssetLoan, tickAssetLoan, tierProgress, type EstateView, type TierRow, type TierCondition } from './estate.ts';
export { FORM, ROLES, ROLE_IDS, ROLE_RULES, formWeeks, inForm, lightUp, roleCounts, roleOf, roleSlots, setRole, supportBoost, type RoleDef, type SupportKind } from './support.ts';
export {
  CLASH, startClash, answerClash, refuseClash, throwShade, answerInterview, interviewView, shadeView, clashesView, rivalsView, rivalsOf, tickClashes,
  type Clash, type ClashStatus, type Tone, type ClashView, type RivalView, type InterviewView, type ShadeView,
} from './clash.ts';
export {
  PROJECTS, SALES, salesQuote, projectCost, createProject, addDeluxe, projectsView, tickProjects,
  type Project, type ProjectKind, type ProjectView, type SalesInput,
} from './projects.ts';
export {
  TOURS, tourQuote, announceTour, answerTourInvite, cancelTour, tourOf, onTour, toursView, tourGuests, tickTours,
  type Tour, type TourState, type TourView, type TourQuote,
} from './tours.ts';
export {
  SEASONS, TROPHY_NAMES, seasonNumber, seasonsOf, enterSeason, pickGoals, watchCeremony, tickSeason, seasonView, honoursOf,
  type GoalId, type GoalView, type SeasonView, type SeasonResult, type SeasonState, type Seasons, type TrophyKind, type Honour,
} from './seasons.ts';
export {
  STAFF, ROLE_NAMES, staffOf, staffWage, staffCandidates, hireStaff, fireStaff, focusCoach, poachStaff, answerPoach, cancelPoach, tickStaff, staffView,
  coachBoost, producerShare, houseProducer, viewsBoost, crowdBoost, gigEnergy,
  type StaffRole, type StaffMember, type StaffOffer, type StaffView, type StaffMemberView,
} from './staff.ts';
export {
  MORALE, RANKS, RANK_NAMES, ranksOf, payOf, isLeader, worriesOf, moraleBlock, cheerUp, raisePay, tickMorale, dynamicsView,
  type Rank, type CheerKind, type WorryKind, type Worry, type DynamicsView, type DynamicsArtist,
} from './morale.ts';
export {
  SKILLS, SKILL_IDS, SKILL_PLUS, skillsOf, skillLevel, skillPlus, stageBoost, tirelessFactor, type SkillId,
} from './skills.ts';
export {
  PROFILES, EVOLUTION, GENRE_CHANGE, profileOf, profileKnown, profileGrowth, afterRelease, genreOptions, changeGenre, refuseWish, ratingsBefore, tickEvolution, evolutionView,
  type GrowthProfile, type GenreOption, type EvolutionView,
} from './evolution.ts';
export { runTick, type TickReport, type ReleaseReport, type LabelReport } from './tick.ts';
export { simulate, STRATEGIES, type Strategy, type Snapshot } from './sim.ts';
export { HAIRS, HATS, FACES, lookOf, parseLook, type Look, type Hair, type Hat, type Face } from './avatar.ts';
export { LOOKS } from './data/looks.ts';
export { createRng, rngFor, type Rng } from './rng.ts';
export {
  ACADEMY, academyOf, academyView, hiringList, sendScout, hireScout, takeYouth, dropYouth, renameYouth, promoteYouth, tickAcademy, zoneById,
  type Academy, type Youth, type Scout, type Mission, type ZoneId, type YouthView, type AcademyView,
} from './academy.ts';
export { ageOf, salePrice } from './play.ts';
