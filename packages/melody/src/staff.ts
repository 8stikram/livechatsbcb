// Staff (docs/melody-tycoon/02-artistes-recrutement.md, 2.9): four jobs a label can fill, one person each.
// Hired like the scouts: candidates with stars and funny names, a new list every week, a wage every week.
// A member gains a star after a season at the label, and another player can try to poach him.
import { CFG } from './config.ts';
import { clamp, rngFor, type Rng } from './rng.ts';
import type { Label, Producer, World } from './types.ts';
import { GameError } from './world.ts';

const fail = (message: string): never => {
  throw new GameError(message);
};

export type StaffRole = 'coach' | 'producer' | 'community' | 'booker';

export const STAFF = {
  roles: ['coach', 'producer', 'community', 'booker'] as StaffRole[],
  /** Weekly wage by stars, for a Label Maison; multiplied by the tier. */
  wages: [50, 200, 500, 1_200, 3_000],
  hireList: 6,
  /** Letting someone go costs this many weeks of his wage. */
  fireWeeks: 2,
  /** Weeks at the label to gain a star. */
  starTicks: CFG.ticksPerSeason,
  /** Coach: artists progress this much faster per star; the one he follows, this much. */
  coachAll: 0.1,
  coachFocus: 0.3,
  /** House producer: this much off the producer's price per star (five stars: free). */
  producerCut: 0.2,
  /** Community manager: more views per star on every promo. */
  communityViews: 0.15,
  /** Booker: bigger crowds and less tiring concerts, per star. */
  bookerCrowd: 0.05,
  bookerEnergy: 0.05,
  /** Poaching: the raises one can offer, the weeks to answer, the weeks a member is left alone after a move. */
  poachRaises: [0.2, 0.5, 1],
  poachAnswerTicks: 2,
  shieldTicks: 4,
  maxOpenPerLabel: 3,
  maxOffersPerWorld: 100,
  /** Chance, each week, that someone of the staff says something. */
  quoteChance: 0.3,
} as const;

export const ROLE_NAMES: Record<StaffRole, string> = {
  coach: 'Coach',
  producer: 'Producteur maison',
  community: 'Community manager',
  booker: 'Booker',
};

export interface StaffMember {
  id: string;
  role: StaffRole;
  name: string;
  rank: string;
  stars: number;
  hiredTick: number;
  /** Tick of his last star (or of his arrival): the next one comes a season later. */
  starTick: number;
  /** Raise on top of the usual wage, won when someone tried to poach him. */
  premium: number;
  /** Coach only: the artist he follows closely. */
  focusId: string | null;
  /** Nobody can poach him before this tick. */
  shieldUntil: number;
  /** The candidate he was hired from: he leaves the list of the week. */
  source?: string;
}

export interface StaffOffer {
  id: string;
  fromLabelId: string;
  toLabelId: string;
  memberId: string;
  role: StaffRole;
  premium: number;
  answerBy: number;
}

const FIRST = ['Michael', 'Jack', 'Bernard', 'Kevin', 'Jean-Mi', 'Sandrine', 'Tonton', 'Brenda', 'Gérard', 'Momo', 'Stéphane', 'Cindy', 'Patrick', 'Ludo', 'Josiane', 'Dylan', 'Régis', 'Nadine', 'Francky', 'Titouan', 'Mireille', 'Jordan', 'Corinne', 'Rachid', 'Yvette'];
const LAST = ['Enceinte', 'Jack-Audio', 'Larsen', 'Playback', 'Autotune', 'Métronome', 'Sono', 'Vestiaire', 'Backstage', 'Flight-Case', 'Multiprise', 'Gaffer', 'Pupitre', 'Fumigène', 'Catering', 'Rappel', 'Guichet', 'Tourbus', 'Bracelet', 'Stroboscope', 'Table-de-Mix', 'Wifi-Public', 'Hashtag', 'Algorithme', 'Sandwich-Triangle'];

const RANKS: Record<StaffRole, string[][]> = {
  coach: [
    ['Prof de chant de MJC', 'Ancien choriste de mariage'],
    ['Coach du conservatoire du coin', 'Ex-candidat de télé-crochet'],
    ['Coach vocal confirmé', 'Metteur en scène de tournée'],
    ['Coach de stars', 'Ancien de la grande école du spectacle'],
    ['Légende des coulisses', 'Celui qui a fait chanter juste tout le monde'],
  ],
  producer: [
    ['Beatmaker de chambre', 'Cousin qui a le logiciel'],
    ['Beatmaker du quartier', 'Ingé son de MJC'],
    ['Producteur confirmé', 'Ingé son de studio'],
    ['Faiseur de tubes', 'Producteur de disques d’or'],
    ['Architecte sonore', 'La légende des machines'],
  ],
  community: [
    ['Neveu qui connaît les réseaux', 'Stagiaire réseaux'],
    ['Community manager débutant', 'Monteur de vidéos courtes'],
    ['Community manager confirmé', 'Stratège des réseaux'],
    ['Expert en buzz', 'Ancien d’une grosse agence'],
    ['Maître des algorithmes', 'Celui qui rend tout viral'],
  ],
  booker: [
    ['Pote du patron du bar', 'Colleur d’affiches'],
    ['Booker de petites salles', 'Organisateur de tremplins'],
    ['Booker confirmé', 'Programmateur régional'],
    ['Tourneur national', 'Booker de festivals'],
    ['Roi des tournées', 'Celui qui remplit des stades'],
  ],
};

const QUOTES: Record<StaffRole, string[]> = {
  coach: [
    'Il a enfin compris que respirer, ça aide à chanter.',
    'Trois heures de gammes. Il me déteste, mais il chante juste.',
    'J’ai confisqué son téléphone pendant la répète. Miracle.',
    'Il progresse. Lentement. Comme un lundi.',
    'Aujourd’hui on a travaillé la présence sur scène. Il a salué le mur. C’est un début.',
    'Je lui ai dit de chanter avec le ventre. Il a commandé un kebab.',
  ],
  producer: [
    'J’ai sorti un beat à 4 h du matin. Les voisins ont porté plainte, mais ça tape.',
    'Le kick est tellement lourd que l’enceinte a démissionné.',
    'J’ai encore nommé le fichier « final_v12_vraiment_final ».',
    'Ce sample, personne ne le reconnaîtra. Enfin j’espère.',
    'J’ai perdu la session. Non, c’est bon, elle était dans la corbeille.',
    'On m’a demandé « plus de basses ». Il n’y a plus que des basses.',
  ],
  community: [
    'J’ai répondu à 400 commentaires. Dont 380 de sa mère.',
    'Le post de 3 h du matin a mieux marché que la campagne. Je ne comprends plus rien.',
    'On a perdu 2 abonnés. J’enquête.',
    'J’ai mis un chat dans la story. Les chiffres explosent.',
    'Quelqu’un a écrit « premier » sous la vidéo. C’était moi.',
    'J’ai posté sans faute d’orthographe. Personne n’a réagi.',
  ],
  booker: [
    'La salle est réservée. Enfin, c’est une MJC, mais avec une vraie scène.',
    'J’ai négocié des loges. C’est un placard, mais il y a un miroir.',
    'Le patron du bar veut payer en pizzas. J’ai dit moitié-moitié.',
    'Complet ! Bon, c’était 80 places. Mais complet.',
    'J’ai eu le programmateur au téléphone. Il a dit « on se rappelle ». On progresse.',
    'La date est calée. Le même soir que la finale de foot, mais calée.',
  ],
};

const makeMember = (rng: Rng, role: StaffRole, stars: number, id: string, tick: number): StaffMember => ({
  id,
  role,
  name: `${rng.pick(FIRST)} ${rng.pick(LAST)}`,
  rank: rng.pick(RANKS[role][stars - 1] ?? RANKS[role][0]!),
  stars,
  hiredTick: tick,
  starTick: tick,
  premium: 0,
  focusId: null,
  shieldUntil: tick + STAFF.shieldTicks,
});

/** The staff of a label. Empty for a label that never hired. */
export const staffOf = (world: World, labelId: string): StaffMember[] => world.staff?.[labelId] ?? [];

const teamOf = (world: World, labelId: string): StaffMember[] => {
  world.staff ??= {};
  return (world.staff[labelId] ??= []);
};

const starsOf = (world: World, labelId: string, role: StaffRole): number => staffOf(world, labelId).find((m) => m.role === role)?.stars ?? 0;

/** What a member costs each week in a label of this tier. */
export const staffWage = (member: Pick<StaffMember, 'stars' | 'premium'>, tier: number): number =>
  Math.round((STAFF.wages[member.stars - 1] ?? 50) * tier * (1 + member.premium));

/* ---------------------------------- What the staff changes ---------------------------------- */

/** How much faster this artist progresses thanks to the coach (1 without one). */
export const coachBoost = (world: World, labelId: string, artistId: string): number => {
  const coach = staffOf(world, labelId).find((m) => m.role === 'coach');
  if (!coach) return 1;
  return 1 + coach.stars * (coach.focusId === artistId ? STAFF.coachFocus : STAFF.coachAll);
};

/** Share of the producer's price the label still pays (1 without a house producer, 0 with five stars). */
export const producerShare = (world: World, labelId: string): number => clamp(1 - STAFF.producerCut * starsOf(world, labelId, 'producer'), 0, 1);

/** The producer as this label pays him. */
export const houseProducer = (world: World, labelId: string, producer: Producer): Producer => ({ ...producer, price: Math.round(producer.price * producerShare(world, labelId)) });

/** Views of every promo, times this. */
export const viewsBoost = (world: World, labelId: string): number => 1 + STAFF.communityViews * starsOf(world, labelId, 'community');

/** Crowd of every concert and tour date, times this. */
export const crowdBoost = (world: World, labelId: string): number => 1 + STAFF.bookerCrowd * starsOf(world, labelId, 'booker');

/** Energy one concert costs an artist of this label. */
export const gigEnergy = (world: World, labelId: string): number => Math.round(CFG.energy.gig * (1 - STAFF.bookerEnergy * starsOf(world, labelId, 'booker')));

const effectText = (role: StaffRole, stars: number): string => {
  const pct = (value: number): number => Math.round(value * 100);
  if (role === 'coach') return `Tes artistes progressent ${pct(STAFF.coachAll * stars)} % plus vite, celui qu’il suit ${pct(STAFF.coachFocus * stars)} %.`;
  if (role === 'producer') return stars >= 5 ? 'Le producteur ne coûte plus rien au studio.' : `Le producteur coûte ${pct(STAFF.producerCut * stars)} % moins cher au studio.`;
  if (role === 'community') return `Tes promos font ${pct(STAFF.communityViews * stars)} % de vues en plus.`;
  return `Concerts et tournées : ${pct(STAFF.bookerCrowd * stars)} % de public en plus, ${pct(STAFF.bookerEnergy * stars)} % d’énergie en moins par concert.`;
};

/* ---------------------------------- Hiring ---------------------------------- */

/** The six candidates of the week: always the same list for one label and one week, at least one per job. */
export const staffCandidates = (world: World, labelId: string): StaffMember[] => {
  const rng = rngFor(world.seed, world.tick, `staff:${labelId}`);
  const hired = new Set(staffOf(world, labelId).map((m) => m.source));
  const list = Array.from({ length: STAFF.hireList }, (_, i) => {
    const role = STAFF.roles[i] ?? rng.pick(STAFF.roles);
    const roll = rng.next();
    const stars = roll < 0.3 ? 1 : roll < 0.6 ? 2 : roll < 0.82 ? 3 : roll < 0.95 ? 4 : 5;
    return makeMember(rng, role, stars, `c${world.tick}_${i}`, world.tick);
  });
  return list.filter((c) => !hired.has(c.id));
};

const dropOffersOn = (world: World, memberId: string): void => {
  if (world.staffOffers) world.staffOffers = world.staffOffers.filter((o) => o.memberId !== memberId);
};

/** Lets the member of a job go: two weeks of wage. */
export const fireStaff = (world: World, label: Label, role: StaffRole): void => {
  const team = teamOf(world, label.id);
  const member = team.find((m) => m.role === role) ?? fail('Personne à ce poste.');
  const fee = staffWage(member, label.tier) * STAFF.fireWeeks;
  if (fee > label.cash) fail(`Pas assez de cash : le licencier coûte ${fee.toLocaleString('fr-FR')} €.`);
  label.cash -= fee;
  team.splice(team.indexOf(member), 1);
  dropOffersOn(world, member.id);
};

/** Hires a candidate of the week. Whoever held the job is let go first (two weeks of wage). */
export const hireStaff = (world: World, label: Label, candidateId: string): void => {
  const candidate = staffCandidates(world, label.id).find((c) => c.id === candidateId) ?? fail('Ce candidat n’est plus disponible.');
  const team = teamOf(world, label.id);
  const current = team.find((m) => m.role === candidate.role);
  const fee = current ? staffWage(current, label.tier) * STAFF.fireWeeks : 0;
  const wage = staffWage(candidate, label.tier);
  if (fee + wage > label.cash) fail(current ? `Pas assez de cash : il faut ${(fee + wage).toLocaleString('fr-FR')} € (départ de ${current.name} + première semaine).` : 'Pas assez de cash pour sa première semaine.');
  if (current) fireStaff(world, label, candidate.role);
  team.push({ ...candidate, id: `st${world.nextId}`, focusId: null, source: candidate.id });
  world.nextId += 1;
};

/** Tells the coach which artist to follow closely (null: nobody in particular). */
export const focusCoach = (world: World, label: Label, artistId: string | null): void => {
  const coach = teamOf(world, label.id).find((m) => m.role === 'coach') ?? fail('Tu n’as pas de coach.');
  if (artistId !== null && !world.contracts.some((c) => c.artistId === artistId && c.labelId === label.id)) fail('Cet artiste n’est pas dans ton label.');
  coach.focusId = artistId;
};

/* ---------------------------------- Poaching between players ---------------------------------- */

const offersOf = (world: World): StaffOffer[] => (world.staffOffers ??= []);

const news = (world: World, text: string): void => {
  world.marketNews = [...(world.marketNews ?? []), { tick: world.tick, text }];
};

/** Offers a raise to the staff member of another player. His label has two weeks to match it, or he leaves. */
export const poachStaff = (world: World, label: Label, targetLabelId: string, role: StaffRole, raise: number): void => {
  const target = world.labels[targetLabelId];
  if (!target || target.kind !== 'player' || target.bankrupt || target.id === label.id) fail('Label introuvable.');
  const member = staffOf(world, targetLabelId).find((m) => m.role === role) ?? fail('Personne à ce poste chez eux.');
  if (!STAFF.poachRaises.some((r) => r === raise)) fail('Choisis une des augmentations proposées.');
  if (member.shieldUntil > world.tick) fail(`${member.name} vient d’arriver ou d’être augmenté : attends un peu.`);
  const premium = Math.round((member.premium + raise) * 100) / 100;
  const offers = offersOf(world);
  if (offers.some((o) => o.memberId === member.id)) fail(`Une offre est déjà en cours pour ${member.name}.`);
  if (offers.filter((o) => o.fromLabelId === label.id).length >= STAFF.maxOpenPerLabel) fail('Tu as déjà trop d’offres en cours.');
  if (offers.length >= STAFF.maxOffersPerWorld) fail('Trop d’offres en cours sur ce serveur.');
  const wage = staffWage({ stars: member.stars, premium }, label.tier);
  if (wage > label.cash) fail('Pas assez de cash pour sa première semaine.');
  offers.push({ id: `so${world.nextId}`, fromLabelId: label.id, toLabelId: target!.id, memberId: member.id, role, premium, answerBy: world.tick + STAFF.poachAnswerTicks });
  world.nextId += 1;
  news(world, `${label.name} veut débaucher ${member.name}, ${ROLE_NAMES[role].toLowerCase()} de ${target!.name}.`);
};

const move = (world: World, offer: StaffOffer, tell?: (labelId: string, text: string) => void): void => {
  const from = world.labels[offer.toLabelId];
  const to = world.labels[offer.fromLabelId];
  const team = teamOf(world, offer.toLabelId);
  const member = team.find((m) => m.id === offer.memberId);
  world.staffOffers = offersOf(world).filter((o) => o.id !== offer.id);
  if (!member || !from || !to || to.bankrupt) return;
  team.splice(team.indexOf(member), 1);
  const mine = teamOf(world, to.id);
  const replaced = mine.find((m) => m.role === member.role);
  if (replaced) {
    mine.splice(mine.indexOf(replaced), 1);
    dropOffersOn(world, replaced.id);
    tell?.(to.id, `${replaced.name} laisse sa place à ${member.name}.`);
  }
  mine.push({ ...member, premium: offer.premium, focusId: null, source: undefined, hiredTick: world.tick, starTick: world.tick, shieldUntil: world.tick + STAFF.shieldTicks });
  news(world, `Débauchage : ${member.name} quitte ${from.name} pour ${to.name}.`);
  tell?.(from.id, `${member.name} est parti chez ${to.name}.`);
  tell?.(to.id, `${member.name} rejoint ton staff.`);
};

/** The label whose member is courted answers: match the raise and keep him, or let him go. */
export const answerPoach = (world: World, label: Label, offerId: string, match: boolean): void => {
  const offer = offersOf(world).find((o) => o.id === offerId && o.toLabelId === label.id) ?? fail('Offre introuvable.');
  const member = staffOf(world, label.id).find((m) => m.id === offer.memberId);
  if (!match || !member) {
    move(world, offer);
    return;
  }
  member.premium = offer.premium;
  member.shieldUntil = world.tick + STAFF.shieldTicks;
  world.staffOffers = offersOf(world).filter((o) => o.id !== offer.id);
  news(world, `${label.name} s’aligne et garde ${member.name}.`);
};

/** The label that made an offer takes it back. */
export const cancelPoach = (world: World, label: Label, offerId: string): void => {
  const offers = offersOf(world);
  if (!offers.some((o) => o.id === offerId && o.fromLabelId === label.id)) fail('Offre introuvable.');
  world.staffOffers = offers.filter((o) => o.id !== offerId);
};

/* ---------------------------------- Weekly ---------------------------------- */

/** Weekly: wages, a star after a season, offers left unanswered, and sometimes a word from the staff. */
export const tickStaff = (world: World, pay: (labelId: string, amount: number) => void, tell: (labelId: string, text: string) => void): void => {
  for (const offer of [...(world.staffOffers ?? [])]) if (offer.answerBy <= world.tick) move(world, offer, tell);
  for (const [labelId, team] of Object.entries(world.staff ?? {})) {
    const label = world.labels[labelId];
    if (!label || label.bankrupt) {
      for (const member of team) dropOffersOn(world, member.id);
      delete world.staff![labelId];
      continue;
    }
    for (const member of team) {
      pay(labelId, -staffWage(member, label.tier));
      if (member.stars < 5 && world.tick - member.starTick >= STAFF.starTicks) {
        member.stars += 1;
        member.starTick = world.tick;
        member.rank = rngFor(world.seed, world.tick, `rank:${member.id}`).pick(RANKS[member.role][member.stars - 1] ?? [member.rank]);
        tell(labelId, `${member.name} a pris du galon après une saison chez toi : ${member.stars} étoiles (${member.rank}).`);
      }
      if (member.focusId && !world.contracts.some((c) => c.artistId === member.focusId && c.labelId === labelId)) member.focusId = null;
    }
    const rng = rngFor(world.seed, world.tick, `quote:${labelId}`);
    if (team.length > 0 && rng.chance(STAFF.quoteChance)) {
      const member = rng.pick(team);
      tell(labelId, `« ${rng.pick(QUOTES[member.role])} » — ${member.name}, ${ROLE_NAMES[member.role].toLowerCase()}.`);
    }
  }
};

/* ---------------------------------- View ---------------------------------- */

export interface StaffMemberView {
  id: string;
  role: StaffRole;
  roleName: string;
  name: string;
  rank: string;
  stars: number;
  wage: number;
  effect: string;
  /** Weeks before his next star, or null at five stars. */
  nextStarIn: number | null;
  focusId: string | null;
}

export interface StaffView {
  /** The four jobs, in order: who holds each, and what the job is for. */
  jobs: Array<{ role: StaffRole; name: string; about: string; member: StaffMemberView | null }>;
  candidates: Array<{ id: string; role: StaffRole; roleName: string; name: string; rank: string; stars: number; wage: number; effect: string }>;
  wages: number;
  /** Staff of the other players, to poach. */
  rivals: Array<{ labelId: string; labelName: string; role: StaffRole; roleName: string; name: string; stars: number; wage: number; raises: Array<{ raise: number; wage: number }>; blocked: string | null }>;
  /** Offers on my staff, and the ones I made. */
  offersIn: Array<{ id: string; role: StaffRole; name: string; fromName: string; wage: number; weeksLeft: number }>;
  offersOut: Array<{ id: string; name: string; toName: string; wage: number; weeksLeft: number }>;
  fireWeeks: number;
}

const ABOUT: Record<StaffRole, string> = {
  coach: 'Fait progresser tes artistes plus vite. Tu choisis celui qu’il suit de près.',
  producer: 'Fait baisser le prix du producteur au studio. À 5 étoiles, c’est gratuit.',
  community: 'Plus de vues sur toutes tes promos.',
  booker: 'Plus de public en concert et en tournée, et des concerts moins fatigants.',
};

/** What a label sees of its staff. */
export const staffView = (world: World, label: Label): StaffView => {
  const team = staffOf(world, label.id);
  const viewOf = (m: StaffMember, tier: number): StaffMemberView => ({
    id: m.id,
    role: m.role,
    roleName: ROLE_NAMES[m.role],
    name: m.name,
    rank: m.rank,
    stars: m.stars,
    wage: staffWage(m, tier),
    effect: effectText(m.role, m.stars),
    nextStarIn: m.stars >= 5 ? null : Math.max(1, STAFF.starTicks - (world.tick - m.starTick)),
    focusId: m.focusId,
  });
  const offers = world.staffOffers ?? [];
  const nameOf = (labelId: string): string => world.labels[labelId]?.name ?? '?';
  return {
    jobs: STAFF.roles.map((role) => {
      const member = team.find((m) => m.role === role);
      return { role, name: ROLE_NAMES[role], about: ABOUT[role], member: member ? viewOf(member, label.tier) : null };
    }),
    candidates: staffCandidates(world, label.id).map((c) => ({
      id: c.id,
      role: c.role,
      roleName: ROLE_NAMES[c.role],
      name: c.name,
      rank: c.rank,
      stars: c.stars,
      wage: staffWage(c, label.tier),
      effect: effectText(c.role, c.stars),
    })),
    wages: team.reduce((sum, m) => sum + staffWage(m, label.tier), 0),
    rivals: Object.values(world.labels)
      .filter((l) => l.kind === 'player' && !l.bankrupt && l.id !== label.id)
      .flatMap((l) =>
        staffOf(world, l.id).map((m) => ({
          labelId: l.id,
          labelName: l.name,
          role: m.role,
          roleName: ROLE_NAMES[m.role],
          name: m.name,
          stars: m.stars,
          wage: staffWage(m, l.tier),
          raises: STAFF.poachRaises.map((raise) => ({ raise, wage: staffWage({ stars: m.stars, premium: m.premium + raise }, label.tier) })),
          blocked: offers.some((o) => o.memberId === m.id) ? 'Une offre est déjà en cours' : m.shieldUntil > world.tick ? 'Intouchable pour l’instant' : null,
        })),
      )
      .slice(0, 40),
    offersIn: offers
      .filter((o) => o.toLabelId === label.id)
      .map((o) => {
        const member = team.find((m) => m.id === o.memberId);
        return { id: o.id, role: o.role, name: member?.name ?? '?', fromName: nameOf(o.fromLabelId), wage: staffWage({ stars: member?.stars ?? 1, premium: o.premium }, label.tier), weeksLeft: Math.max(0, o.answerBy - world.tick) };
      }),
    offersOut: offers
      .filter((o) => o.fromLabelId === label.id)
      .map((o) => {
        const member = staffOf(world, o.toLabelId).find((m) => m.id === o.memberId);
        return { id: o.id, name: member?.name ?? '?', toName: nameOf(o.toLabelId), wage: staffWage({ stars: member?.stars ?? 1, premium: o.premium }, label.tier), weeksLeft: Math.max(0, o.answerBy - world.tick) };
      }),
    fireWeeks: STAFF.fireWeeks,
  };
};
