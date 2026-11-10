import {
  GAME_ENTRIES_PER_PLAYER,
  GAME_MIN_ENTRIES,
  GAME_MIN_PLAYERS,
  MAX_GAME_BOTS,
  fileKindOf,
  isBotId,
  type Game,
  type GameEntry,
  type GameFile,
  type GameKind,
  type GamePhase,
  type SceneLayer,
  type TextPlace,
} from "@livechatsbcb/protocol";

// What a player sent at the start of a game: pictures, or a LiveChat.
export type StoredEntry = {
  id: string;
  ownerId: string;
  files: GameFile[];
  caption: string;
  scene?: SceneLayer[] | null;
  textPlace?: TextPlace | null;
};

export type Bot = { id: string; name: string };

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
  // Whoever runs the lobby: the opener, then the first one left.
  chefId: string;
  // Who clicked « Prêt » in the lobby.
  ready: string[];
  // Who joined while it was running: they play from the next round.
  waiting: string[];
  // When the lobby first had enough players, and when everyone was ready.
  enoughSince: number | null;
  readySince: number | null;
  bots: Bot[];
  // The vote waits for its first one, then lasts 30 s.
  voteStarted: boolean;
  // Undercover: who still has to write, in order, and whose turn it is.
  turnOrder: string[];
  turn: string | null;
  // The jokes: who clicked « Valider », which pictures each one writes on, and what they wrote on each.
  finished: string[];
  tasks: Record<string, string[]>;
  jokes: Record<string, Record<string, string>>;
  // When the bots play their part of this step, and which step that was.
  botDueAt: number | null;
  botStep: string;
};

// A finished game still shows its ranking for a while.
export const GAME_KEPT_MS = 60_000;
// A vote waits at most this long for its first one, then lasts 30 s.
export const VOTE_WAIT_MS = 120_000;
export const VOTE_AFTER_FIRST_MS = 30_000;
// Undercover: each player has this long to write their word.
export const WORD_TURN_MS = 20_000;

const SECONDS: Record<"collect" | "write" | "reveal", Record<GameKind, number>> = {
  collect: { joke: 90, question: 90, who: 60, undercover: 45 },
  write: { joke: 90, question: 0, who: 0, undercover: 0 },
  // Plus a moment per answer, shown one after the other.
  reveal: { joke: 5, question: 4, who: 6, undercover: 5 },
};
const REVEAL_EACH_S = 1.5;

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

// Put in for whoever wrote nothing, as if they had: nobody is told.
export const HOUSE_JOKES = [
  "Moi quand on me dit « pose-toi deux minutes ».",
  "Le lundi matin, en vrai.",
  "Quand le prof dit « c’est facile ».",
  "Ma tête quand le Wi-Fi revient.",
  "POV : tu as dit « je fais une partie et je dors ».",
  "Le stagiaire le premier jour.",
  "Quand tu entends ton nom dans une autre pièce.",
  "Moi en train d’expliquer que c’était pas ma faute.",
  "Quand la pizza arrive enfin.",
  "Le groupe de travail le soir avant le rendu.",
  "Ma motivation à 8 h vs à 2 h du matin.",
  "Quand ta mère dit « on a à manger à la maison ».",
  "Le chat quand tu rentres de vacances.",
  "Moi qui fais semblant de comprendre.",
  "La dernière frite du paquet.",
  "Quand tu as raté le bus de 3 secondes.",
  "Mon compte en banque le 15 du mois.",
  "Quand tu lances la partie et que ton pote est AFK.",
  "Le mec qui dit « tkt je gère ».",
  "Moi au réveil, en HD.",
  "Quand le jeu dit « sauvegarde automatique » et que c’est faux.",
  "La tête du livreur quand c’est le 6e étage sans ascenseur.",
  "Moi quand quelqu’un mange mon reste dans le frigo.",
  "Le plan du week-end vs le week-end.",
  "Quand tu dis « dernière game » pour la 5e fois.",
  "Ce que voit mon chien quand je dis « promenade ».",
  "Quand ton pote dit « j’arrive dans 5 min ».",
  "Le boss final de la flemme.",
  "Moi qui range ma chambre : niveau 1.",
  "Quand tu trouves 10 € dans une vieille veste.",
  "Ma dignité après le karaoké.",
  "Le sandwich de la cantine, vu de près.",
  "Quand la musique de pub est plus forte que le film.",
  "Le stade final du « je regarde juste un épisode ».",
  "Quand tu réponds « toi aussi » au serveur qui dit bon appétit.",
  "Mon cerveau pendant un contrôle surprise.",
  "Le WiFi de mes grands-parents.",
  "Quand quelqu’un dit « on fait un tour de table ».",
  "Moi qui attends que l’autre raccroche en premier.",
  "Le cousin qui « s’y connaît en ordi ».",
];

export const BOT_NAMES = ["Bot Gaston", "Bot Josiane", "Bot Kevin", "Bot Mamie Lulu", "Bot Fernand", "Bot Jessica"];

const BOT_WORDS = ["Bizarre", "Flou", "Drôle", "Bleu", "Dehors", "Animal", "Rapide", "Bruyant", "Vieux", "Chaud", "Brillant", "Mignon"];
const BOT_ANSWERS = [
  "Parce que les pigeons ont voté.",
  "Une chaussette, mais en colère.",
  "Mon oncle, probablement.",
  "42, évidemment.",
  "Un raton laveur en costard.",
  "Le Wi-Fi de la mairie.",
  "Personne ne sait, et c’est mieux.",
  "Trois croissants et un rêve.",
];

const shuffle = <Item>(items: Item[]): Item[] => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
};

const pickOne = <Item>(items: Item[]): Item => items[Math.floor(Math.random() * items.length)]!;

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

// Lobby: starts by itself a minute after there are enough players, or 5 s after everyone is ready.
export const LOBBY_AUTO_MS = 60_000;
export const LOBBY_READY_MS = 5_000;
// A lobby nobody joins closes by itself.
export const LOBBY_IDLE_MS = 10 * 60_000;

export const openLobby = (
  kind: GameKind,
  chefId: string,
  chefName: string,
  now: number,
  scale: number,
): StoredGame => {
  const game: StoredGame = {
    ...createGame(kind, chefName, [chefId], now, scale),
    phase: "lobby",
    chefId,
  };
  armLobby(game, now, scale);
  return game;
};

// When the lobby starts by itself, from who is in and who is ready.
export const armLobby = (game: StoredGame, now: number, scale: number): void => {
  // Clicking takes human time, even when tests speed the game up.
  scale = Math.max(scale, 0.5);
  const enough = game.players.length >= GAME_MIN_PLAYERS[game.kind];
  if (!enough) {
    game.enoughSince = null;
    game.readySince = null;
    game.endsAt = now + LOBBY_IDLE_MS;
    return;
  }
  game.enoughSince ??= now;
  const allReady = game.players.every((id) => game.ready.includes(id));
  game.readySince = allReady ? (game.readySince ?? now) : null;
  const auto = game.enoughSince + LOBBY_AUTO_MS * scale;
  game.endsAt =
    game.readySince === null
      ? auto
      : Math.min(auto, game.readySince + LOBBY_READY_MS * scale);
};

export const join = (
  game: StoredGame,
  memberId: string,
  now: number,
  scale: number,
): boolean => {
  if (game.players.includes(memberId) || game.waiting.includes(memberId))
    return false;
  if (game.phase === "done") return false;
  if (game.phase !== "lobby") {
    game.waiting.push(memberId);
    return true;
  }
  game.players.push(memberId);
  game.scores[memberId] = 0;
  armLobby(game, now, scale);
  return true;
};

// Anyone in the lobby adds one. It is ready at once and never holds anything up.
export const addBot = (game: StoredGame, memberId: string, now: number, scale: number): boolean => {
  if (game.phase !== "lobby" || !game.players.includes(memberId) || game.bots.length >= MAX_GAME_BOTS) return false;
  const taken = new Set(game.bots.map(({ name }) => name));
  const name = BOT_NAMES.find((candidate) => !taken.has(candidate))!;
  const id = `bot:${BOT_NAMES.indexOf(name) + 1}`;
  game.bots.push({ id, name });
  game.players.push(id);
  game.ready.push(id);
  game.scores[id] = 0;
  armLobby(game, now, scale);
  return true;
};

export const removeBot = (game: StoredGame, memberId: string, botId: string, now: number, scale: number): boolean => {
  if (game.phase !== "lobby" || !game.players.includes(memberId) || !game.bots.some(({ id }) => id === botId)) return false;
  game.bots = game.bots.filter(({ id }) => id !== botId);
  game.players = game.players.filter((id) => id !== botId);
  game.ready = game.ready.filter((id) => id !== botId);
  delete game.scores[botId];
  armLobby(game, now, scale);
  return true;
};

export const setReady = (
  game: StoredGame,
  memberId: string,
  ready: boolean,
  now: number,
  scale: number,
): boolean => {
  if (game.phase !== "lobby" || !game.players.includes(memberId)) return false;
  game.ready = game.ready.filter((id) => id !== memberId);
  if (ready) game.ready.push(memberId);
  armLobby(game, now, scale);
  return true;
};

// Returns false when nobody is left, so the lobby can close.
export const leave = (
  game: StoredGame,
  memberId: string,
  now: number,
  scale: number,
): boolean => {
  game.waiting = game.waiting.filter((id) => id !== memberId);
  if (!game.players.includes(memberId)) return true;
  game.players = game.players.filter((id) => id !== memberId);
  game.ready = game.ready.filter((id) => id !== memberId);
  delete game.scores[memberId];
  const humans = game.players.filter((id) => !isBotId(id));
  if (game.chefId === memberId) game.chefId = humans[0] ?? "";
  if (game.phase === "lobby") {
    if (humans.length === 0) return false;
    armLobby(game, now, scale);
    return true;
  }
  if (game.phase !== "done" && (game.players.length < 2 || humans.length === 0)) {
    finish(game, now, "stopped");
    return true;
  }
  // Their turn to write goes to the next one at once.
  if (game.turn === memberId) nextTurn(game, now, scale);
  game.turnOrder = game.turnOrder.filter((id) => id !== memberId);
  return true;
};

// The lobby becomes the game, with whoever is in it.
export const launch = (game: StoredGame, now: number, scale: number, history: StoredEntry[]): void => {
  const fresh = createGame(game.kind, game.starterName, game.players, now, scale);
  Object.assign(game, { ...fresh, id: game.id, chefId: game.chefId, bots: game.bots });
  startCollect(game, now, scale, history);
};

// Same lobby again: everyone who played, plus whoever was waiting, bots included.
export const rematch = (
  game: StoredGame,
  memberId: string,
  online: Set<string>,
  now: number,
  scale: number,
): StoredGame => {
  const players = [
    ...new Set([...game.players, ...game.waiting, memberId]),
  ].filter((id) => online.has(id) || isBotId(id));
  const chefId = players.includes(game.chefId) ? game.chefId : memberId;
  const bots = game.bots.filter(({ id }) => players.includes(id));
  const next: StoredGame = {
    ...createGame(game.kind, game.starterName, players, now, scale),
    phase: "lobby",
    chefId,
    bots,
    ready: [memberId, ...bots.map(({ id }) => id)],
  };
  armLobby(next, now, scale);
  return next;
};

// Late arrivals come in at the start of a round.
const admit = (game: StoredGame): void => {
  for (const id of game.waiting) {
    if (game.players.includes(id)) continue;
    game.players.push(id);
    game.scores[id] = 0;
  }
  game.waiting = [];
};

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
    chefId: "",
    ready: [],
    waiting: [],
    enoughSince: null,
    readySince: null,
    bots: [],
    voteStarted: false,
    turnOrder: [],
    turn: null,
    finished: [],
    tasks: {},
    jokes: {},
    botDueAt: null,
    botStep: "",
  };
};

const botIds = (game: StoredGame): string[] => game.bots.map(({ id }) => id).filter((id) => game.players.includes(id));

// What the bots send comes at once: pictures of the day for the picture games, a silly answer for the question.
// Undercover skips sending altogether when the day already played enough pictures.
const startCollect = (game: StoredGame, now: number, scale: number, history: StoredEntry[]): void => {
  if (game.kind === "undercover" && history.length >= 3) {
    game.pool = shuffle(history);
    return startUndercoverRound(game, now, scale);
  }
  if (game.kind === "undercover") game.pool = [...history];
  for (const bot of botIds(game)) {
    if (game.kind === "joke") {
      for (const picture of shuffle(history).slice(0, GAME_MIN_ENTRIES.joke))
        game.pool.push({ ...picture, id: `${picture.id}:${bot}`, ownerId: bot });
      game.finished.push(bot);
    }
    if (game.kind === "question") game.pool.push({ id: `${bot}:${game.round}`, ownerId: bot, files: [], caption: pickOne(BOT_ANSWERS) });
  }
};

// Whether this is something the game still waits for from this player.
export const acceptsEntry = (
  game: StoredGame,
  memberId: string,
  files: { contentType: GameFile["contentType"] }[],
  caption: string,
  scene: SceneLayer[] | null = null,
): boolean => {
  if (game.phase !== "collect" || !game.players.includes(memberId))
    return false;
  if (sentBy(game, memberId).length >= GAME_ENTRIES_PER_PLAYER[game.kind])
    return false;
  if (game.finished.includes(memberId)) return false;
  // Only the question takes a LiveChat made in the advanced mode.
  if (scene !== null && game.kind !== "question") return false;
  if (isPictureGame(game.kind))
    return files.length === 1 && fileKindOf(files[0]!.contentType) === "image";
  return files.length > 0 || caption.length > 0;
};

export const addEntry = (game: StoredGame, entry: StoredEntry): boolean => {
  if (!acceptsEntry(game, entry.ownerId, entry.files, entry.caption, entry.scene ?? null))
    return false;
  game.pool.push(entry);
  return true;
};

// The jokes: « Valider » once enough pictures are in.
export const markDone = (game: StoredGame, memberId: string): boolean => {
  if (game.phase !== "collect" || !game.players.includes(memberId) || game.finished.includes(memberId)) return false;
  if (sentBy(game, memberId).length < GAME_MIN_ENTRIES[game.kind]) return false;
  game.finished.push(memberId);
  return true;
};

export const say = (
  game: StoredGame,
  memberId: string,
  text: string,
  now: number,
  scale: number,
  entryId?: string,
): boolean => {
  if (game.phase !== "write") return false;
  if (game.kind === "joke") {
    if (!entryId || !game.tasks[memberId]?.includes(entryId)) return false;
    game.jokes[entryId] = { ...game.jokes[entryId], [memberId]: text };
    return true;
  }
  if (game.kind === "undercover") {
    if (game.turn !== memberId) return false;
    game.said[memberId] = text;
    nextTurn(game, now, scale);
    return true;
  }
  if (!game.assign[memberId]) return false;
  game.said[memberId] = text;
  return true;
};

const ownerOf = (game: StoredGame, entryId: string): string | undefined =>
  game.pool.find(({ id }) => id === entryId)?.ownerId;

// The two who wrote on the picture of the duel.
const authorsOf = (game: StoredGame, entryId: string | undefined): string[] =>
  entryId ? Object.keys(game.jokes[entryId] ?? {}) : [];

// Who has nothing to choose: whoever sent what is shown, or wrote in the duel.
const sitsOut = (game: StoredGame, memberId: string): boolean => {
  if (game.kind === "who" || game.kind === "question")
    return game.current.some((id) => ownerOf(game, id) === memberId);
  if (game.kind === "joke") return authorsOf(game, game.current[0]).includes(memberId);
  return false;
};

const choices = (game: StoredGame, memberId: string): string[] => {
  if (game.kind === "joke") return authorsOf(game, game.current[0]);
  if (game.kind === "question") return game.current;
  return game.players.filter((id) => id !== memberId);
};

export const vote = (
  game: StoredGame,
  memberId: string,
  choice: string,
  now: number,
  scale: number,
): boolean => {
  if (
    game.phase !== "vote" ||
    !game.players.includes(memberId) ||
    sitsOut(game, memberId) ||
    choice === memberId ||
    !choices(game, memberId).includes(choice)
  )
    return false;
  game.votes[memberId] = choice;
  if (!game.voteStarted) {
    game.voteStarted = true;
    game.endsAt = Math.min(game.endsAt, now + VOTE_AFTER_FIRST_MS * scale);
  }
  return true;
};

const jokeTasksDone = (game: StoredGame, id: string): boolean =>
  (game.tasks[id] ?? []).every((entryId) => id in (game.jokes[entryId] ?? {}));

export const acted = (game: StoredGame): string[] => {
  switch (game.phase) {
    case "collect":
      return game.players.filter(
        (id) =>
          isBotId(id) ||
          game.finished.includes(id) ||
          sentBy(game, id).length >= GAME_ENTRIES_PER_PLAYER[game.kind],
      );
    case "write":
      if (game.kind === "joke") return game.players.filter((id) => jokeTasksDone(game, id));
      if (game.kind === "undercover") return game.players.filter((id) => !game.turnOrder.includes(id) && game.turn !== id);
      return game.players.filter((id) => !game.assign[id] || id in game.said);
    case "vote":
      return game.players.filter((id) => id in game.votes || sitsOut(game, id));
    default:
      return [];
  }
};

// What the reveal shows, one after the other.
const revealCount = (game: StoredGame): number => {
  if (game.kind === "undercover") return Object.keys(game.said).length;
  if (game.kind === "joke") return 2;
  return Math.max(1, game.current.length);
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
  if (phase === "lobby") return;
  if (phase === "vote") {
    game.votes = {};
    game.voteStarted = false;
    game.endsAt = now + VOTE_WAIT_MS * scale;
    return;
  }
  if (phase === "reveal") {
    game.endsAt = now + (SECONDS.reveal[game.kind] + REVEAL_EACH_S * revealCount(game)) * 1_000 * scale;
    return;
  }
  game.endsAt = now + SECONDS[phase][game.kind] * 1_000 * scale;
  if (phase === "write") game.said = {};
};

const finish = (
  game: StoredGame,
  now: number,
  reason: StoredGame["reason"] = null,
): void => {
  game.reason = reason;
  game.current = [];
  game.turn = null;
  enter(game, "done", now, 1);
};

// Each picture goes to two players, and each player writes on two: duels, everyone in two of them.
const startJokeRound = (game: StoredGame, now: number, scale: number): void => {
  const free = shuffle(game.pool.filter(({ id }) => !game.used.includes(id)));
  const players = shuffle(game.players);
  const pictures = free.slice(0, players.length);
  if (pictures.length < 1 || players.length < 2) return finish(game, now);
  // Nobody on their own picture when a turn of the table avoids it.
  for (let tries = 0; tries < players.length; tries += 1) {
    const clash = pictures.some((picture, index) =>
      [players[index], players[(index + 1) % players.length]].includes(picture.ownerId),
    );
    if (!clash) break;
    players.push(players.shift()!);
  }
  game.tasks = Object.fromEntries(players.map((id) => [id, []]));
  game.jokes = {};
  pictures.forEach((picture, index) => {
    for (const author of [players[index]!, players[(index + 1) % players.length]!]) game.tasks[author]!.push(picture.id);
  });
  game.order = pictures.map(({ id }) => id);
  game.used.push(...game.order);
  game.current = [];
  enter(game, "write", now, scale);
};

// Whoever wrote nothing gets a ready-made joke, without anyone being told.
const fillJokes = (game: StoredGame): void => {
  for (const [author, entryIds] of Object.entries(game.tasks)) {
    if (!game.players.includes(author)) continue;
    for (const entryId of entryIds) {
      game.jokes[entryId] ??= {};
      game.jokes[entryId][author] ??= pickOne(HOUSE_JOKES);
    }
  }
};

// The next duel of the round, or the next round.
const nextDuel = (game: StoredGame, now: number, scale: number): void => {
  const next = game.order.shift();
  if (next) {
    game.current = [next];
    return enter(game, "vote", now, scale);
  }
  const left = game.pool.filter(({ id }) => !game.used.includes(id)).length;
  if (game.round >= game.rounds || left < 1) return finish(game, now);
  game.round += 1;
  admit(game);
  return startJokeRound(game, now, scale);
};

// The next one to write their word, or the vote once everybody has.
const nextTurn = (game: StoredGame, now: number, scale: number): void => {
  game.turn = game.turnOrder.shift() ?? null;
  if (game.turn === null) return enter(game, "vote", now, scale);
  game.endsAt = now + WORD_TURN_MS * scale;
};

// Everyone has the same picture, except the impostor who has none.
const startUndercoverRound = (
  game: StoredGame,
  now: number,
  scale: number,
): void => {
  const fresh = shuffle(game.pool.filter(({ id }) => !game.used.includes(id)));
  const shared = fresh[0] ?? shuffle(game.pool)[0];
  if (!shared) return finish(game, now, "few");
  const impostor = shuffle(game.players)[0]!;
  game.used.push(shared.id);
  game.current = [shared.id];
  game.answer = impostor;
  game.assign = Object.fromEntries(game.players.filter((id) => id !== impostor).map((id) => [id, shared.id]));
  enter(game, "write", now, scale);
  game.turnOrder = shuffle(game.players);
  nextTurn(game, now, scale);
};

// Two at a time, or three when one would be left alone.
const startDuel = (game: StoredGame, now: number, scale: number, history: StoredEntry[]): void => {
  if (game.order.length >= 2) {
    game.current = game.order.splice(0, game.order.length === 3 ? 3 : 2);
    return enter(game, "vote", now, scale);
  }
  game.order = [];
  if (game.round >= game.rounds) return finish(game, now);
  game.round += 1;
  admit(game);
  game.prompt = pickQuestion(game.asked);
  game.asked.push(game.prompt);
  game.pool = [];
  game.current = [];
  enter(game, "collect", now, scale);
  startCollect(game, now, scale, history);
};

const score = (game: StoredGame): void => {
  const add = (id: string, points: number) => {
    game.scores[id] = (game.scores[id] ?? 0) + points;
  };
  const counts = tally(game.votes);
  switch (game.kind) {
    case "joke": {
      // A point per vote, and one more for whoever wins the duel.
      for (const [id, total] of counts) add(id, total);
      const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
      if (first && (!second || first[1] > second[1])) add(first[0], 1);
      break;
    }
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
export const advance = (game: StoredGame, now: number, scale: number, history: StoredEntry[] = []): void => {
  switch (game.phase) {
    case "collect":
      if (game.kind === "joke") {
        if (game.pool.length < 2) return finish(game, now, "few");
        game.rounds = Math.max(1, Math.min(3, Math.floor(game.pool.length / game.players.length)));
        return startJokeRound(game, now, scale);
      }
      if (game.kind === "undercover") {
        if (game.pool.length < 1) return finish(game, now, "few");
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
      return startDuel(game, now, scale, history);
    case "write":
      // Undercover: time ran out on this turn, the next one writes.
      if (game.kind === "undercover") return nextTurn(game, now, scale);
      if (game.kind === "joke") {
        fillJokes(game);
        return nextDuel(game, now, scale);
      }
      return enter(game, "vote", now, scale);
    case "vote":
      score(game);
      return enter(game, "reveal", now, scale);
    case "reveal":
      if (game.kind === "question") return startDuel(game, now, scale, history);
      if (game.kind === "joke") return nextDuel(game, now, scale);
      if (game.kind === "who") {
        if (game.order.length === 0) return finish(game, now);
        game.current = [game.order.shift()!];
        game.answer = null;
        return enter(game, "vote", now, scale);
      }
      if (game.round >= game.rounds) return finish(game, now);
      game.round += 1;
      admit(game);
      return startUndercoverRound(game, now, scale);
    case "done":
    case "lobby":
      return;
  }
};

export const stop = (game: StoredGame, now: number): void =>
  finish(game, now, "stopped");

// Which step the bots answer to: a new one gets them to play again, a moment later.
const botStepOf = (game: StoredGame): string => `${game.phase}:${game.round}:${game.current.join(",")}:${game.turn ?? ""}`;

// Sets when the bots play, once something new asks them to.
export const planBots = (game: StoredGame, now: number, scale: number): void => {
  const step = botStepOf(game);
  if (step === game.botStep) return;
  game.botStep = step;
  const wanted =
    botIds(game).length > 0 &&
    ((game.phase === "write" && (game.kind !== "undercover" || isBotId(game.turn ?? ""))) || game.phase === "vote");
  game.botDueAt = wanted ? now + (1_500 + Math.random() * 3_500) * scale : null;
};

// The bots write silly things and vote at random.
export const botsPlay = (game: StoredGame, now: number, scale: number): void => {
  game.botDueAt = null;
  for (const bot of botIds(game)) {
    if (game.phase === "write" && game.kind === "joke")
      for (const entryId of game.tasks[bot] ?? []) say(game, bot, pickOne(HOUSE_JOKES), now, scale, entryId);
    if (game.phase === "write" && game.kind === "undercover" && game.turn === bot) say(game, bot, pickOne(BOT_WORDS), now, scale);
    if (game.phase === "vote" && !sitsOut(game, bot) && !(bot in game.votes)) {
      const options = choices(game, bot);
      if (options.length > 0) vote(game, bot, pickOne(options), now, scale);
    }
  }
};

// Each player sees only what is theirs to see: nothing tells who sent what before the reveal.
export const gameView = (game: StoredGame, memberId: string): Game => {
  const byId = new Map(game.pool.map((entry) => [entry.id, entry]));
  const shown = game.phase === "reveal";
  const counts = tally(game.votes);
  const picture = (entryId: string | undefined): GameFile[] =>
    entryId ? (byId.get(entryId)?.files ?? []) : [];
  const plain = { scene: null, textPlace: null };
  let entries: GameEntry[] = [];
  let myPicture: GameFile[] = [];

  if (game.phase === "collect") {
    entries = sentBy(game, memberId).map(({ id, files, caption, scene, textPlace }) => ({
      id,
      ownerId: memberId,
      files,
      caption,
      scene: scene ?? null,
      textPlace: textPlace ?? null,
      votes: null,
      mine: true,
    }));
  } else if (game.phase !== "done" && game.phase !== "lobby") {
    if (game.kind === "undercover") myPicture = picture(game.assign[memberId]);
    if (game.kind === "joke" && game.phase === "write") {
      // The pictures this player writes on, with what they wrote so far.
      entries = (game.tasks[memberId] ?? []).map((entryId) => ({
        id: entryId,
        ownerId: memberId,
        files: picture(entryId),
        caption: game.jokes[entryId]?.[memberId] ?? "",
        ...plain,
        votes: null,
        mine: true,
      }));
    }
    if (game.kind === "joke" && game.phase !== "write") {
      // The duel: the two jokes on the same picture.
      const entryId = game.current[0];
      entries = Object.entries(game.jokes[entryId ?? ""] ?? {}).map(([id, caption]) => ({
        id,
        ownerId: shown ? id : null,
        files: picture(entryId),
        caption,
        ...plain,
        votes: shown ? (counts.get(id) ?? 0) : null,
        mine: id === memberId,
      }));
    }
    if (game.kind === "undercover") {
      // Each word as it comes, with who wrote it.
      entries = Object.entries(game.said).map(([id, caption]) => ({
        id,
        ownerId: id,
        files: [],
        caption,
        ...plain,
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
            scene: entry.scene ?? null,
            textPlace: entry.textPlace ?? null,
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
    chefId: game.chefId,
    ready: game.ready,
    waiting: game.waiting,
    bots: game.bots,
    voteStarted: game.voteStarted,
    turn: game.turn,
    iAmImpostor: game.kind === "undercover" && (game.phase === "write" || game.phase === "vote") && game.answer === memberId,
    iAmDone: game.finished.includes(memberId),
  };
};
