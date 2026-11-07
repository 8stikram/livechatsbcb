import {
  GAME_ENTRIES_PER_PLAYER,
  fileKindOf,
  type Game,
  type GameEntry,
  type GameFile,
  type GameKind,
  type GamePhase,
} from "@livechatsbcb/protocol";

// What a player sent at the start of a game: pictures, or a LiveChat.
export type StoredEntry = {
  id: string;
  ownerId: string;
  files: GameFile[];
  caption: string;
};

export type StoredGame = {
  id: string;
  kind: GameKind;
  starterName: string;
  players: string[];
  scores: Record<string, number>;
  phase: GamePhase;
  round: number;
  rounds: number;
  endsAt: number;
  prompt: string;
  asked: string[];
  pool: StoredEntry[];
  // Pictures already given out, so that a round brings new ones.
  used: string[];
  // What is still to be shown, one after the other.
  order: string[];
  // What is shown now.
  current: string[];
  // Which picture each player got.
  assign: Record<string, string>;
  // What each player wrote: a joke, or a word.
  said: Record<string, string>;
  votes: Record<string, string>;
  answer: string | null;
  reason: "few" | "stopped" | null;
};

// A finished game still shows its ranking for a while.
export const GAME_KEPT_MS = 60_000;

const SECONDS: Record<Exclude<GamePhase, "done">, Record<GameKind, number>> = {
  collect: { joke: 90, question: 60, who: 60, undercover: 45 },
  write: { joke: 60, question: 0, who: 0, undercover: 40 },
  vote: { joke: 30, question: 15, who: 20, undercover: 30 },
  reveal: { joke: 7, question: 6, who: 6, undercover: 8 },
};

export const QUESTIONS = [
  "Le pire cadeau d’anniversaire possible ?",
  "Ce que ton chat pense vraiment de toi ?",
  "La tête du prof quand tu rends une copie blanche ?",
  "Le prochain sport olympique ?",
  "Ce qu’il y a vraiment dans les nuggets ?",
  "Ta réaction quand le Wi-Fi coupe en pleine partie ?",
  "Le pire nom pour un bateau ?",
  "La vraie raison de la disparition des dinosaures ?",
  "Ton plat signature à 3 h du matin ?",
  "Le pire moment pour éternuer ?",
  "Ce que dit ton frigo quand tu l’ouvres pour la dixième fois ?",
  "Le slogan d’une marque de chaussettes ?",
  "La pire excuse pour arriver en retard ?",
  "Ton super-pouvoir complètement inutile ?",
  "Ce que les pigeons préparent en secret ?",
  "La tête de ta mère quand elle voit ta chambre ?",
  "L’emoji qui manque à tout le monde ?",
  "Le pire titre de film d’action ?",
  "Ce que tu cries en sautant en parachute ?",
  "Le métier de tes rêves à 5 ans ?",
  "Ce qui se passe vraiment dans le Triangle des Bermudes ?",
  "Le pire mot de passe possible ?",
  "Ton entrée sur scène au concours de talents ?",
  "Ce que tu fais quand personne ne regarde ?",
];

const shuffle = <Item>(items: Item[]): Item[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
};

const pickQuestion = (asked: string[]): string => {
  const left = QUESTIONS.filter((question) => !asked.includes(question));
  return shuffle(left.length > 0 ? left : QUESTIONS)[0]!;
};

const tally = (votes: Record<string, string>): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const choice of Object.values(votes))
    counts.set(choice, (counts.get(choice) ?? 0) + 1);
  return counts;
};

const sentBy = (game: StoredGame, memberId: string): StoredEntry[] =>
  game.pool.filter(({ ownerId }) => ownerId === memberId);

const isPictureGame = (kind: GameKind): boolean =>
  kind === "joke" || kind === "undercover";

export const createGame = (
  kind: GameKind,
  starterName: string,
  players: string[],
  now: number,
  scale: number,
): StoredGame => {
  const prompt = kind === "question" ? pickQuestion([]) : "";
  return {
    id: crypto.randomUUID(),
    kind,
    starterName,
    players,
    scores: Object.fromEntries(players.map((id) => [id, 0])),
    phase: "collect",
    round: 1,
    rounds: kind === "joke" || kind === "who" ? 1 : 3,
    endsAt: now + SECONDS.collect[kind] * 1_000 * scale,
    prompt,
    asked: prompt ? [prompt] : [],
    pool: [],
    used: [],
    order: [],
    current: [],
    assign: {},
    said: {},
    votes: {},
    answer: null,
    reason: null,
  };
};

// Whether this is something the game still waits for from this player.
export const acceptsEntry = (
  game: StoredGame,
  memberId: string,
  files: { contentType: GameFile["contentType"] }[],
  caption: string,
): boolean => {
  if (game.phase !== "collect" || !game.players.includes(memberId))
    return false;
  if (sentBy(game, memberId).length >= GAME_ENTRIES_PER_PLAYER[game.kind])
    return false;
  if (isPictureGame(game.kind))
    return files.length === 1 && fileKindOf(files[0]!.contentType) === "image";
  return files.length > 0 || caption.length > 0;
};

export const addEntry = (game: StoredGame, entry: StoredEntry): boolean => {
  if (!acceptsEntry(game, entry.ownerId, entry.files, entry.caption))
    return false;
  game.pool.push(entry);
  return true;
};

export const say = (
  game: StoredGame,
  memberId: string,
  text: string,
): boolean => {
  if (game.phase !== "write" || !game.assign[memberId]) return false;
  game.said[memberId] = text;
  return true;
};

const ownerOf = (game: StoredGame, entryId: string): string | undefined =>
  game.pool.find(({ id }) => id === entryId)?.ownerId;

// Who has nothing to choose: whoever sent what is shown.
const sitsOut = (game: StoredGame, memberId: string): boolean => {
  if (game.kind === "who" || game.kind === "question")
    return game.current.some((id) => ownerOf(game, id) === memberId);
  if (game.kind === "joke")
    return Object.keys(game.said).every((id) => id === memberId);
  return false;
};

export const vote = (
  game: StoredGame,
  memberId: string,
  choice: string,
): boolean => {
  if (
    game.phase !== "vote" ||
    !game.players.includes(memberId) ||
    sitsOut(game, memberId) ||
    choice === memberId
  )
    return false;
  const valid =
    game.kind === "joke"
      ? choice in game.said
      : game.kind === "question"
        ? game.current.includes(choice)
        : game.players.includes(choice);
  if (!valid) return false;
  game.votes[memberId] = choice;
  return true;
};

export const acted = (game: StoredGame): string[] => {
  switch (game.phase) {
    case "collect":
      return game.players.filter(
        (id) => sentBy(game, id).length >= GAME_ENTRIES_PER_PLAYER[game.kind],
      );
    case "write":
      return game.players.filter((id) => !game.assign[id] || id in game.said);
    case "vote":
      return game.players.filter((id) => id in game.votes || sitsOut(game, id));
    default:
      return [];
  }
};

const enter = (
  game: StoredGame,
  phase: GamePhase,
  now: number,
  scale: number,
): void => {
  game.phase = phase;
  if (phase === "done") {
    game.endsAt = now + GAME_KEPT_MS;
    return;
  }
  game.endsAt = now + SECONDS[phase][game.kind] * 1_000 * scale;
  if (phase === "vote") game.votes = {};
  if (phase === "write") game.said = {};
};

const finish = (
  game: StoredGame,
  now: number,
  reason: StoredGame["reason"] = null,
): void => {
  game.reason = reason;
  game.current = [];
  enter(game, "done", now, 1);
};

// Each player gets a picture someone else sent, when there is one.
const startJokeRound = (game: StoredGame, now: number, scale: number): void => {
  const free = shuffle(game.pool.filter(({ id }) => !game.used.includes(id)));
  game.assign = {};
  for (const player of shuffle(game.players)) {
    const index = free.findIndex(({ ownerId }) => ownerId !== player);
    const [picked] = free.splice(index >= 0 ? index : 0, 1);
    if (picked) game.assign[player] = picked.id;
  }
  if (Object.keys(game.assign).length === 0) return finish(game, now);
  game.used.push(...Object.values(game.assign));
  enter(game, "write", now, scale);
};

// Everyone has the same picture, except the impostor.
const startUndercoverRound = (
  game: StoredGame,
  now: number,
  scale: number,
): void => {
  const fresh = shuffle(game.pool.filter(({ id }) => !game.used.includes(id)));
  const [shared, other] = fresh.length >= 2 ? fresh : shuffle(game.pool);
  const impostor = shuffle(game.players)[0]!;
  game.used.push(shared!.id, other!.id);
  game.current = [shared!.id, other!.id];
  game.answer = impostor;
  game.assign = Object.fromEntries(
    game.players.map((id) => [id, id === impostor ? other!.id : shared!.id]),
  );
  enter(game, "write", now, scale);
};

// Two at a time, or three when one would be left alone.
const startDuel = (game: StoredGame, now: number, scale: number): void => {
  if (game.order.length >= 2) {
    game.current = game.order.splice(0, game.order.length === 3 ? 3 : 2);
    return enter(game, "vote", now, scale);
  }
  game.order = [];
  if (game.round >= game.rounds) return finish(game, now);
  game.round += 1;
  game.prompt = pickQuestion(game.asked);
  game.asked.push(game.prompt);
  game.pool = [];
  game.current = [];
  enter(game, "collect", now, scale);
};

const score = (game: StoredGame): void => {
  const add = (id: string, points: number) => {
    game.scores[id] = (game.scores[id] ?? 0) + points;
  };
  const counts = tally(game.votes);
  switch (game.kind) {
    case "joke":
      for (const [id, total] of counts) add(id, total);
      break;
    case "question":
      for (const [id, total] of counts) {
        const owner = ownerOf(game, id);
        if (owner) add(owner, total);
      }
      break;
    case "who": {
      const owner = ownerOf(game, game.current[0]!) ?? null;
      game.answer = owner;
      for (const [voter, choice] of Object.entries(game.votes)) {
        if (choice === owner) add(voter, 1);
        else if (owner) add(owner, 1);
      }
      break;
    }
    case "undercover": {
      const top = Math.max(0, ...counts.values());
      const leaders = [...counts]
        .filter(([, total]) => total === top)
        .map(([id]) => id);
      const caught =
        top > 0 && leaders.length === 1 && leaders[0] === game.answer;
      if (caught) {
        for (const [voter, choice] of Object.entries(game.votes))
          if (choice === game.answer) add(voter, 1);
      } else if (game.answer) add(game.answer, 2);
      break;
    }
  }
};

// One step forward, once time is up or everyone has done their part.
export const advance = (game: StoredGame, now: number, scale: number): void => {
  switch (game.phase) {
    case "collect":
      if (game.kind === "joke") {
        if (game.pool.length < 2) return finish(game, now, "few");
        game.rounds = Math.max(
          1,
          Math.min(3, Math.floor(game.pool.length / game.players.length)),
        );
        return startJokeRound(game, now, scale);
      }
      if (game.kind === "undercover") {
        if (game.pool.length < 2) return finish(game, now, "few");
        return startUndercoverRound(game, now, scale);
      }
      if (game.kind === "who") {
        if (game.pool.length === 0) return finish(game, now, "few");
        game.order = shuffle(game.pool.map(({ id }) => id));
        game.current = [game.order.shift()!];
        return enter(game, "vote", now, scale);
      }
      if (game.pool.length < 2 && game.round === 1 && game.rounds === 1)
        return finish(game, now, "few");
      game.order = shuffle(game.pool.map(({ id }) => id));
      return startDuel(game, now, scale);
    case "write":
      if (Object.keys(game.said).length === 0) {
        if (game.kind === "joke" && game.round < game.rounds) {
          game.round += 1;
          return startJokeRound(game, now, scale);
        }
        if (game.kind === "joke") return finish(game, now);
      }
      return enter(game, "vote", now, scale);
    case "vote":
      score(game);
      return enter(game, "reveal", now, scale);
    case "reveal":
      if (game.kind === "question") return startDuel(game, now, scale);
      if (game.kind === "who") {
        if (game.order.length === 0) return finish(game, now);
        game.current = [game.order.shift()!];
        game.answer = null;
        return enter(game, "vote", now, scale);
      }
      if (game.round >= game.rounds) return finish(game, now);
      game.round += 1;
      return game.kind === "joke"
        ? startJokeRound(game, now, scale)
        : startUndercoverRound(game, now, scale);
    case "done":
      return;
  }
};

export const stop = (game: StoredGame, now: number): void =>
  finish(game, now, "stopped");

// Each player sees only what is theirs to see: nothing tells who sent what before the reveal.
export const gameView = (game: StoredGame, memberId: string): Game => {
  const byId = new Map(game.pool.map((entry) => [entry.id, entry]));
  const shown = game.phase === "reveal";
  const counts = tally(game.votes);
  const picture = (entryId: string | undefined): GameFile[] =>
    entryId ? (byId.get(entryId)?.files ?? []) : [];
  let entries: GameEntry[] = [];
  let myPicture: GameFile[] = [];

  if (game.phase === "collect") {
    entries = sentBy(game, memberId).map(({ id, files, caption }) => ({
      id,
      ownerId: memberId,
      files,
      caption,
      votes: null,
      mine: true,
    }));
  } else if (game.phase !== "done") {
    if (isPictureGame(game.kind)) myPicture = picture(game.assign[memberId]);
    if (game.kind === "joke" && game.phase !== "write") {
      entries = Object.entries(game.said).map(([id, caption]) => ({
        id,
        ownerId: shown ? id : null,
        files: picture(game.assign[id]),
        caption,
        votes: shown ? (counts.get(id) ?? 0) : null,
        mine: id === memberId,
      }));
    }
    if (game.kind === "undercover" && game.phase !== "write") {
      entries = Object.entries(game.said).map(([id, caption]) => ({
        id,
        ownerId: id,
        files: [],
        caption,
        votes: shown ? (counts.get(id) ?? 0) : null,
        mine: id === memberId,
      }));
    }
    if (game.kind === "question" || game.kind === "who") {
      entries = game.current.flatMap((id) => {
        const entry = byId.get(id);
        if (!entry) return [];
        const right = Object.values(game.votes).filter(
          (choice) => choice === entry.ownerId,
        ).length;
        return [
          {
            id,
            ownerId: shown ? entry.ownerId : null,
            files: entry.files,
            caption: entry.caption,
            votes: shown
              ? game.kind === "who"
                ? right
                : (counts.get(id) ?? 0)
              : null,
            mine: entry.ownerId === memberId,
          },
        ];
      });
    }
  }

  return {
    id: game.id,
    kind: game.kind,
    starterName: game.starterName,
    players: game.players,
    scores: game.scores,
    phase: game.phase,
    round: game.round,
    rounds: game.rounds,
    endsAt: game.endsAt,
    prompt: game.prompt,
    entries,
    myPicture,
    mySent: sentBy(game, memberId).length,
    acted: acted(game),
    myChoice: game.votes[memberId] ?? null,
    answer: shown ? game.answer : null,
    reason: game.reason,
  };
};
