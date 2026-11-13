// The asset loan and the tiers (docs/melody-tycoon/05-contrats-marche-labels.md 5.5 and 5.6, owner's choices
// 2026-11-13). From the Respecté tier the bank lends 40 % of the label's assets (songs + half its artists) at 0.6 %
// a week, over 13, 26 or 52 weeks. When the label cannot pay, a warning, and 2 weeks later the bank seizes the songs
// that earn the most until the debt is covered; they earn nothing for the label, which can buy them back later,
// dearer. Any loan can be repaid early without fees. The tiers: what each needs and unlocks, the progress to the
// next one, and a party when the label goes up.
import { CFG } from './config.ts';
import { artistValue, catalogueValue, contractOf, fansOf, rosterOf, songValue, TIER_RULES } from './economy.ts';
import type { Label, Loan, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export const ESTATE = {
  share: 0.4,
  rate: 0.006,
  weeks: [13, 26, 52] as const,
  minTier: 3,
  warnWeeks: 2,
  buyback: 1.25,
  buybackMin: 1_000,
  /** Morale of every artist of the label when it goes up a tier. */
  tierMorale: 5,
} as const;

export type AssetWeeks = (typeof ESTATE.weeks)[number];

/** What the bank counts: the songs, and half the value of the artists under contract. */
export const assetBase = (world: World, label: Label): number =>
  catalogueValue(world, label.id) + 0.5 * rosterOf(world, label.id).reduce((sum, a) => sum + artistValue(a), 0);

const assetLoanOf = (world: World, labelId: string): Loan | undefined => world.loans.find((l) => l.labelId === labelId && l.kind === 'asset');

/** Most the bank lends on the label's assets, rounded down to 1 000 € (0 under the Respecté tier or with one running). */
export const assetLoanCap = (world: World, label: Label): number =>
  label.tier < ESTATE.minTier || assetLoanOf(world, label.id) ? 0 : Math.floor((ESTATE.share * assetBase(world, label)) / 1_000) * 1_000;

export const takeAssetLoan = (world: World, label: Label, amount: number, weeks: number): void => {
  if (label.tier < ESTATE.minTier) fail(`Le prêt sur patrimoine arrive au palier ${CFG.tiers.names[ESTATE.minTier - 1]}.`);
  if (assetLoanOf(world, label.id)) fail('Tu as déjà un prêt sur patrimoine en cours.');
  if (!(ESTATE.weeks as readonly number[]).includes(weeks)) fail('Choisis 13, 26 ou 52 semaines.');
  const cap = assetLoanCap(world, label);
  if (!Number.isInteger(amount) || amount < 1_000) fail('La banque prête au moins 1 000 €.');
  if (amount > cap) fail(`Sur ton patrimoine, la banque prête au plus ${cap.toLocaleString('fr-FR')} €.`);
  label.cash += amount;
  world.loans.push({ labelId: label.id, kind: 'asset', remaining: amount, ratePerTick: ESTATE.rate, ticksLeft: weeks });
};

/** Pays back every loan of this kind at once, without fees. */
export const repayLoans = (world: World, label: Label, kind: Loan['kind']): void => {
  const loans = world.loans.filter((l) => l.labelId === label.id && l.kind === kind);
  if (loans.length === 0) fail('Pas de prêt de ce type à rembourser.');
  const total = Math.ceil(loans.reduce((sum, l) => sum + l.remaining, 0));
  if (total > label.cash) fail(`Il te faut ${total.toLocaleString('fr-FR')} € pour tout rembourser.`);
  label.cash -= total;
  world.loans = world.loans.filter((l) => !loans.includes(l));
};

/** What the label pays to get a seized song back. */
export const buybackPrice = (world: World, songId: string): number => {
  const song = world.songs.find((s) => s.id === songId);
  if (!song) return 0;
  // What it would be worth if the label still had it.
  const worth = songValue({ ...song, seized: undefined }, contractOf(world, song.artistId));
  return Math.max(ESTATE.buybackMin, Math.round(worth * ESTATE.buyback));
};

export const buyBack = (world: World, label: Label, songId: string): void => {
  const song = world.songs.find((s) => s.id === songId && s.labelId === label.id && s.seized);
  if (!song) return fail('Ce son n’est pas saisi par la banque.');
  const price = buybackPrice(world, song.id);
  if (price > label.cash) fail(`Il te faut ${price.toLocaleString('fr-FR')} € pour racheter « ${song.title} ».`);
  label.cash -= price;
  delete song.seized;
};

/**
 * Each week, before the emergency loans: a label with an asset loan that is in the red (or still owes an emergency
 * loan) is warned, then 2 weeks later the bank seizes songs. Back in the green, the warning is lifted.
 */
export const tickAssetLoan = (world: World, label: Label, tell: (text: string) => void): void => {
  const loan = assetLoanOf(world, label.id);
  if (!loan) return;
  const short = label.cash < 0 || world.loans.some((l) => l.labelId === label.id && l.kind === 'emergency');
  if (!short) {
    if (loan.warnTick !== undefined) tell('La banque lève son alerte : ton prêt sur patrimoine est de nouveau payé.');
    delete loan.warnTick;
    return;
  }
  if (loan.warnTick === undefined) {
    loan.warnTick = world.tick;
    tell(
      `Alerte de la banque : tu ne peux plus payer ton prêt sur patrimoine. Dans ${ESTATE.warnWeeks} semaines, elle saisit tes sons qui rapportent le plus, sauf si ton cash repasse au-dessus de zéro sans prêt d’urgence (Banque : rembourser).`,
    );
    return;
  }
  if (world.tick < loan.warnTick + ESTATE.warnWeeks) return;
  const songs = world.songs
    .filter((s) => s.labelId === label.id && s.state === 'released' && !s.seized)
    .map((s) => ({ song: s, value: songValue(s, contractOf(world, s.artistId)) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
  const taken: string[] = [];
  let covered = 0;
  for (const { song, value } of songs) {
    if (covered >= loan.remaining) break;
    song.seized = { tick: world.tick };
    covered += value;
    taken.push(`« ${song.title} »`);
  }
  loan.remaining -= covered;
  delete loan.warnTick;
  if (loan.remaining <= 0.5) world.loans = world.loans.filter((l) => l !== loan);
  if (taken.length > 0)
    tell(
      `La banque saisit ${taken.length} son${taken.length > 1 ? 's' : ''} : ${taken.join(', ')}. ${taken.length > 1 ? 'Ils ne te rapportent plus rien. Tu peux les racheter' : 'Il ne te rapporte plus rien. Tu peux le racheter'} plus tard à la Banque.${loan.remaining > 0.5 ? ' Il reste une dette sur ce prêt.' : ' Ton prêt sur patrimoine est soldé.'}`,
    );
};

/* ---------------------------------- Tiers ---------------------------------- */

export interface TierRow {
  tier: number;
  name: string;
  maxArtists: number;
  needs: string;
  unlocks: string;
}

const euros = (n: number): string =>
  n >= 1_000_000_000 ? `${n / 1_000_000_000} Md€` : n >= 1_000_000 ? `${n / 1_000_000} M€` : `${n.toLocaleString('fr-FR')} €`;
const people = (n: number): string => (n >= 1_000_000 ? `${n / 1_000_000} M` : n.toLocaleString('fr-FR'));

/** Only what really changes with the tier. */
const EXTRAS = ['', '', 'stars (note 80 et plus), prêt sur patrimoine', 'producteurs légende au studio', 'stades (60 000 places), stars 25 % moins chères', 'le titre suprême du serveur (plus tard)'];
const unlocksOf = (i: number): string => {
  const fame = CFG.fameFans[i] ?? Number.POSITIVE_INFINITY;
  const budget = CFG.tiers.songBudgetCap[i] ?? Number.POSITIVE_INFINITY;
  const parts = [
    Number.isFinite(fame) ? `artistes jusqu’à ${people(fame)} fans` : 'tous les artistes',
    Number.isFinite(budget) ? `${euros(budget)} par son` : 'budget sans limite par son',
    `prêt classique jusqu’à ${euros(CFG.tiers.loanCap[i] ?? 0)}`,
    EXTRAS[i] ?? '',
  ].filter(Boolean);
  const text = parts.join(', ');
  return text[0]!.toUpperCase() + text.slice(1) + '.';
};

/** The 6 tiers: what each needs and what it unlocks. */
export const TIER_TABLE: TierRow[] = CFG.tiers.names.map((name, i) => {
  const rule = TIER_RULES[i - 1];
  return {
    tier: i + 1,
    name,
    maxArtists: CFG.tiers.maxArtists[i] ?? 0,
    needs: rule
      ? `Réputation ${rule.reputation}, ${people(rule.fans)} fans${rule.revenue > 0 ? `, ${euros(rule.revenue)} gagnés` : ''}, ${rule.hit.need} ${rule.hit.text}`
      : 'Au départ',
    unlocks: unlocksOf(i),
  };
});

export interface TierCondition {
  text: string;
  have: number;
  need: number;
}

/** What the label still needs for the next tier, one line per condition (null at the top). */
export const tierProgress = (world: World, label: Label): { name: string; conditions: TierCondition[] } | null => {
  const rule = TIER_RULES[label.tier - 1];
  const name = CFG.tiers.names[label.tier];
  if (!rule || !name) return null;
  const conditions: TierCondition[] = [
    { text: 'Réputation', have: Math.floor(label.reputation), need: rule.reputation },
    { text: 'Fans', have: fansOf(world, label.id), need: rule.fans },
  ];
  if (rule.revenue > 0) conditions.push({ text: 'Argent gagné en tout', have: Math.round(label.stats.revenueTotal), need: rule.revenue });
  conditions.push({ text: rule.hit.text[0]!.toUpperCase() + rule.hit.text.slice(1), have: label.stats[rule.hit.key], need: rule.hit.need });
  return { name, conditions };
};

/* ---------------------------------- View ---------------------------------- */

export interface EstateView {
  assetBase: number;
  assetCap: number;
  assetMinTier: string;
  assetWeeks: readonly number[];
  assetRate: number;
  /** Weeks before the bank seizes songs, or null without a warning. */
  seizeIn: number | null;
  seized: Array<{ id: string; title: string; artist: string; price: number }>;
  next: { name: string; conditions: TierCondition[] } | null;
  table: TierRow[];
  /** The tier the label just reached, until the player closes the party. */
  party: { tier: number; name: string } | null;
}

export const estateView = (world: World, label: Label): EstateView => {
  const loan = assetLoanOf(world, label.id);
  return {
    assetBase: Math.round(assetBase(world, label)),
    assetCap: assetLoanCap(world, label),
    assetMinTier: CFG.tiers.names[ESTATE.minTier - 1] ?? '',
    assetWeeks: ESTATE.weeks,
    assetRate: ESTATE.rate,
    seizeIn: loan?.warnTick !== undefined ? Math.max(0, loan.warnTick + ESTATE.warnWeeks - world.tick) : null,
    seized: world.songs
      .filter((s) => s.labelId === label.id && s.seized)
      .map((s) => ({ id: s.id, title: s.title, artist: world.artists[s.artistId]?.name ?? '?', price: buybackPrice(world, s.id) })),
    next: tierProgress(world, label),
    table: TIER_TABLE,
    party: label.tierParty ? { tier: label.tierParty, name: CFG.tiers.names[label.tierParty - 1] ?? '' } : null,
  };
};
