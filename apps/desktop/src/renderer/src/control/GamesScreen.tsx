import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  GAME_ENTRIES_PER_PLAYER,
  GAME_MIN_PLAYERS,
  MAX_CAPTION_LENGTH,
  MAX_GAME_TEXT_LENGTH,
  type GameKind,
} from "@livechatsbcb/protocol";
import type {
  AppState,
  GameFileView,
  GameSendResult,
  GameView,
  PartyView,
} from "../../../shared/ipc";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "./ConfirmButton";
import { errorMessage } from "./messages";

const GAMES: Array<{ kind: GameKind; title: string; rule: string }> = [
  {
    kind: "joke",
    title: "Meilleure blague",
    rule: "Chacun envoie 5 images de son PC. Tu reçois celle d’un autre et tu fais la meilleure blague dessus. Tout le monde vote.",
  },
  {
    kind: "question",
    title: "Question débile",
    rule: "Une question débile, tu réponds avec un LiveChat. Les réponses s’affrontent en duel, la party vote.",
  },
  {
    kind: "who",
    title: "Qui l’a envoyé ?",
    rule: "Chacun envoie un meme en secret. La party devine qui l’a envoyé. Des points si on ne te devine pas.",
  },
  {
    kind: "undercover",
    title: "Undercover",
    rule: "Tout le monde a la même image, sauf l’imposteur. Chacun donne un mot, puis on vote pour le démasquer.",
  },
];

const titleOf = (kind: GameKind): string =>
  GAMES.find((game) => game.kind === kind)!.title;

const useNow = (running: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [running]);
  return now;
};

const sendError = (result: GameSendResult): string | null => {
  if (result.ok || result.error === "cancelled") return null;
  if (result.error === "unsupported")
    return "Ce fichier ne marche pas pour ce jeu.";
  if (result.error === "empty") return "Ce fichier est vide.";
  if (result.error === "too_large") return "Ce fichier est trop lourd.";
  if (result.error === "queue_full") return "Le jeu n’attend plus rien de toi.";
  return errorMessage(result.error);
};

const GameMedia = ({
  files,
  caption,
  big = false,
}: {
  files: GameFileView[];
  caption?: string;
  big?: boolean;
}) => (
  <div className={big ? "game-media is-big" : "game-media"}>
    {files.map((file) =>
      !file.url ? (
        <div
          key={file.id}
          className="game-file is-loading"
          aria-label="Chargement"
        >
          <span className="spinner" />
        </div>
      ) : file.kind === "image" ? (
        <img
          key={file.id}
          className="game-file"
          src={file.url}
          alt={file.name}
        />
      ) : file.kind === "video" ? (
        <video
          key={file.id}
          className="game-file"
          src={file.url}
          controls
          autoPlay
          loop
          playsInline
        />
      ) : (
        <audio
          key={file.id}
          className="game-audio"
          src={file.url}
          controls
          autoPlay
        />
      ),
    )}
    {caption ? (
      <p
        className={files.length > 0 ? "game-caption" : "game-caption is-alone"}
      >
        {caption}
      </p>
    ) : null}
  </div>
);

const Picker = ({ party }: { party: PartyView }) => {
  const online = party.members.filter((member) => member.online).length;
  return (
    <section className="glass panel game-picker" aria-labelledby="games-title">
      <h2 id="games-title" className="panel-title">
        Jeux de party
        <span className="count">
          <span className="mono">{online}</span> en ligne
        </span>
      </h2>
      <div className="game-cards">
        {GAMES.map(({ kind, title, rule }) => {
          const missing = GAME_MIN_PLAYERS[kind] - online;
          return (
            <article
              key={kind}
              className="game-card"
              data-testid={`game-card-${kind}`}
            >
              <h3>{title}</h3>
              <p className="hint">{rule}</p>
              <footer>
                <span className="count">
                  {GAME_MIN_PLAYERS[kind]} joueurs ou plus
                </span>
                <button
                  type="button"
                  className="pill primary small"
                  disabled={missing > 0}
                  title={
                    missing > 0
                      ? `Il manque ${missing} joueur${missing > 1 ? "s" : ""}`
                      : undefined
                  }
                  onClick={() => void window.liveChat.startGame(kind)}
                >
                  Lancer
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
};

const Scores = ({ game, party }: { game: GameView; party: PartyView }) => {
  const nameOf = (id: string) =>
    party.members.find((member) => member.id === id);
  const ranked = [...game.players].sort(
    (a, b) => (game.scores[b] ?? 0) - (game.scores[a] ?? 0),
  );
  return (
    <ul className="game-scores" data-testid="game-scores">
      {ranked.map((id) => {
        const member = nameOf(id);
        const done = game.acted.includes(id);
        return (
          <li key={id} className={done ? "is-done" : undefined}>
            <Avatar
              className="avatar"
              name={member?.name ?? "?"}
              url={member?.avatarUrl ?? null}
            />
            <span className="game-score-name">
              {member?.name ?? "Parti"}
              {id === party.memberId && <span className="row-you"> (toi)</span>}
            </span>
            {done && (
              <span className="game-done" title="A fini">
                ✓
              </span>
            )}
            <span className="mono game-points">{game.scores[id] ?? 0}</span>
          </li>
        );
      })}
    </ul>
  );
};

const TextForm = ({
  label,
  placeholder,
  maxLength,
  onSend,
}: {
  label: string;
  placeholder: string;
  maxLength: number;
  onSend: (text: string) => void;
}) => {
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <form className="game-form" onSubmit={submit}>
      <input
        className="input"
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        autoFocus
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="pill primary" disabled={!text.trim()}>
        Envoyer
      </button>
    </form>
  );
};

const Collect = ({ game }: { game: GameView }) => {
  const [error, setError] = useState<string | null>(null);
  const wanted = GAME_ENTRIES_PER_PLAYER[game.kind];
  const pictures = game.kind === "joke" || game.kind === "undercover";
  const left = wanted - game.mySent - game.sending;
  const run = async (send: () => Promise<GameSendResult>) => {
    setError(null);
    setError(sendError(await send()));
  };

  return (
    <div className="game-step">
      {game.kind === "question" && (
        <p className="game-prompt" data-testid="game-prompt">
          {game.prompt}
        </p>
      )}
      <p className="game-ask">
        {game.kind === "joke" &&
          `Envoie ${wanted} images de ton PC. Les autres feront des blagues dessus.`}
        {game.kind === "undercover" &&
          "Envoie une image de ton PC. Elle servira à l’un des tours."}
        {game.kind === "question" &&
          "Réponds avec un LiveChat : une image, une vidéo, un son, ou du texte."}
        {game.kind === "who" &&
          "Envoie un meme. Personne ne saura que c’est toi."}
      </p>
      <p className="hint mono" data-testid="game-sent">
        {game.mySent} / {wanted} envoyé{wanted > 1 ? "s" : ""}
        {game.sending > 0 && ` · ${game.sending} en route`}
      </p>
      {left > 0 && (
        <div className="game-actions">
          <button
            type="button"
            className="pill primary"
            onClick={() =>
              void run(() => window.liveChat.sendGameFiles(game.id))
            }
          >
            {pictures
              ? left > 1
                ? "Choisir des images"
                : "Choisir une image"
              : "Choisir un fichier"}
          </button>
        </div>
      )}
      {left > 0 && !pictures && (
        <TextForm
          label="Réponse en texte"
          placeholder="Ou écris-la ici"
          maxLength={MAX_CAPTION_LENGTH}
          onSend={(text) =>
            void run(() => window.liveChat.sendGameText(game.id, text))
          }
        />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {game.entries.length > 0 && (
        <div className="game-mine">
          {game.entries.map((entry) => (
            <GameMedia
              key={entry.id}
              files={entry.files}
              caption={entry.caption}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const Write = ({ game, me }: { game: GameView; me: string }) => {
  const done = game.acted.includes(me);
  if (game.myPicture.length === 0)
    return (
      <p className="game-ask">
        Pas d’image pour toi ce tour-ci, regarde les autres.
      </p>
    );
  return (
    <div className="game-step">
      <p className="game-ask">
        {game.kind === "joke"
          ? "Fais la meilleure blague sur cette image."
          : "Donne un mot en lien avec ton image. Attention : l’imposteur a une autre image, et toi aussi peut-être."}
      </p>
      <GameMedia files={game.myPicture} big />
      {done ? (
        <p className="hint">C’est noté. On attend les autres.</p>
      ) : (
        <TextForm
          label={game.kind === "joke" ? "Ta blague" : "Ton mot"}
          placeholder={game.kind === "joke" ? "Ta blague" : "Un mot"}
          maxLength={MAX_GAME_TEXT_LENGTH}
          onSend={(text) => void window.liveChat.gameSay(game.id, text)}
        />
      )}
    </div>
  );
};

const Vote = ({ game, party }: { game: GameView; party: PartyView }) => {
  const me = party.memberId;
  const shown = game.phase === "reveal";
  const nameOf = (id: string | null) =>
    party.members.find((member) => member.id === id)?.name ?? "Quelqu’un";
  const vote = (choice: string) =>
    void window.liveChat.gameVote(game.id, choice);
  const others = game.players.filter((id) => id !== me);

  if (game.kind === "who") {
    const entry = game.entries[0];
    const mine = entry?.mine ?? false;
    return (
      <div className="game-step">
        <p className="game-ask">
          {shown
            ? `C’était ${nameOf(game.answer)} !`
            : mine
              ? "C’est le tien. Chut."
              : "Qui l’a envoyé ?"}
        </p>
        {entry && <GameMedia files={entry.files} caption={entry.caption} big />}
        {shown && entry && <p className="hint">{entry.votes} l’ont trouvé.</p>}
        {!mine && (
          <div className="game-choices">
            {others.map((id) => (
              <button
                key={id}
                type="button"
                className={[
                  "game-choice",
                  game.myChoice === id ? "is-mine" : "",
                  shown && game.answer === id ? "is-winner" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={shown}
                aria-pressed={game.myChoice === id}
                onClick={() => vote(id)}
              >
                {nameOf(id)}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (game.kind === "undercover") {
    return (
      <div className="game-step">
        <p className="game-ask">
          {shown
            ? `L’imposteur était ${nameOf(game.answer)} !`
            : "Qui est l’imposteur ?"}
        </p>
        <GameMedia files={game.myPicture} />
        <div className="game-choices">
          {game.players.map((id) => {
            const word = game.entries.find((entry) => entry.id === id);
            return (
              <button
                key={id}
                type="button"
                className={[
                  "game-choice",
                  game.myChoice === id ? "is-mine" : "",
                  shown && game.answer === id ? "is-winner" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={shown || id === me}
                aria-pressed={game.myChoice === id}
                onClick={() => vote(id)}
              >
                <strong>{nameOf(id)}</strong>
                <span>{word?.caption ?? "…"}</span>
                {shown && (
                  <span className="mono game-votes">{word?.votes ?? 0}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // The jokes, and the duels of the question game.
  const sitting =
    game.kind === "question" && game.entries.some((entry) => entry.mine);
  const best = Math.max(0, ...game.entries.map((entry) => entry.votes ?? 0));
  return (
    <div className="game-step">
      {game.kind === "question" && <p className="game-prompt">{game.prompt}</p>}
      <p className="game-ask">
        {shown
          ? "Résultat"
          : sitting
            ? "Ton LiveChat est en duel : tu ne votes pas."
            : "Vote pour ta préférée."}
      </p>
      <div className={game.kind === "question" ? "game-duel" : "game-grid"}>
        {game.entries.map((entry, index) => (
          <div key={entry.id} className="game-duel-side">
            {game.kind === "question" && index > 0 && (
              <span className="game-vs" aria-hidden="true">
                VS
              </span>
            )}
            <button
              type="button"
              className={[
                "game-entry",
                game.myChoice === entry.id ? "is-mine" : "",
                shown && entry.votes === best && best > 0 ? "is-winner" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={shown || entry.mine || sitting}
              aria-pressed={game.myChoice === entry.id}
              data-testid="game-entry"
              onClick={() => vote(entry.id)}
            >
              <GameMedia files={entry.files} caption={entry.caption} />
              {shown && (
                <span className="game-entry-foot">
                  {nameOf(entry.ownerId)} ·{" "}
                  <span className="mono">{entry.votes}</span> vote
                  {(entry.votes ?? 0) > 1 ? "s" : ""}
                </span>
              )}
              {!shown && entry.mine && (
                <span className="game-entry-foot">La tienne</span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const Ranking = ({ game, party }: { game: GameView; party: PartyView }) => {
  const ranked = [...game.players].sort(
    (a, b) => (game.scores[b] ?? 0) - (game.scores[a] ?? 0),
  );
  const nameOf = (id: string) =>
    party.members.find((member) => member.id === id);
  return (
    <div className="game-step">
      <p className="game-ask">
        {game.reason === "few"
          ? "Pas assez d’envois pour jouer."
          : game.reason === "stopped"
            ? "Partie arrêtée."
            : "Classement"}
      </p>
      <ol className="game-ranking" data-testid="game-ranking">
        {ranked.map((id, index) => {
          // Equal points, equal place.
          const place = ranked.filter(
            (other) => (game.scores[other] ?? 0) > (game.scores[id] ?? 0),
          ).length;
          return (
            <li key={id} style={{ "--rank": index } as CSSProperties}>
              <span className="game-medal">
                {["🥇", "🥈", "🥉"][place] ?? `${place + 1}`}
              </span>
              <Avatar
                className="avatar"
                name={nameOf(id)?.name ?? "?"}
                url={nameOf(id)?.avatarUrl ?? null}
              />
              <span className="game-score-name">
                {nameOf(id)?.name ?? "Parti"}
              </span>
              <span className="mono game-points">{game.scores[id] ?? 0}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

const PHASE_LABEL: Record<GameView["phase"], string> = {
  collect: "Envois",
  write: "À toi d’écrire",
  vote: "Vote",
  reveal: "Révélation",
  done: "Fin",
};

const Board = ({
  game,
  party,
  now,
  onClose,
}: {
  game: GameView;
  party: PartyView;
  now: number;
  onClose: () => void;
}) => {
  const secondsLeft = Math.max(0, Math.ceil((game.endsAt - now) / 1_000));
  const playing = game.players.includes(party.memberId);
  return (
    <div className="game-board">
      <section
        className="glass panel game-main"
        aria-labelledby="game-title"
        data-testid="game"
        data-phase={game.phase}
      >
        <h2 id="game-title" className="panel-title">
          <span>
            {titleOf(game.kind)}
            <span className="count">
              {" "}
              · lancé par {game.starterName}
              {game.rounds > 1 &&
                game.phase !== "done" &&
                ` · manche ${game.round} / ${game.rounds}`}
            </span>
          </span>
          {game.phase === "done" ? (
            <button
              type="button"
              className="pill secondary small"
              onClick={onClose}
            >
              Autre jeu
            </button>
          ) : (
            <span className="game-timer">
              <span className="count">{PHASE_LABEL[game.phase]}</span>
              <span className="mono" data-testid="game-timer">
                {secondsLeft} s
              </span>
            </span>
          )}
        </h2>
        <div
          key={`${game.phase}-${game.round}-${game.entries.map((entry) => entry.id).join()}`}
          className="game-body scroll"
        >
          {!playing && game.phase !== "done" ? (
            <p className="game-ask">
              Une partie est en cours. Tu joueras à la prochaine.
            </p>
          ) : game.phase === "collect" ? (
            <Collect game={game} />
          ) : game.phase === "write" ? (
            <Write game={game} me={party.memberId} />
          ) : game.phase === "done" ? (
            <Ranking game={game} party={party} />
          ) : (
            <Vote game={game} party={party} />
          )}
        </div>
        {game.phase !== "done" && playing && (
          <footer className="panel-actions">
            <span />
            <ConfirmButton
              label="Arrêter la partie"
              confirmLabel="Arrêter pour tous ?"
              onConfirm={() => void window.liveChat.stopGame(game.id)}
            />
          </footer>
        )}
      </section>
      <aside className="glass panel game-side">
        <h2 className="panel-title">Points</h2>
        <Scores game={game} party={party} />
      </aside>
    </div>
  );
};

export const GamesScreen = ({
  state,
  party,
  active,
}: {
  state: AppState;
  party: PartyView;
  active: boolean;
}) => {
  const game = state.game;
  const now = useNow(active && game !== null && game.phase !== "done");
  // A finished game stays until someone looks elsewhere.
  const [closed, setClosed] = useState<string | null>(null);
  const shown =
    game && !(game.phase === "done" && closed === game.id) ? game : null;
  return shown ? (
    <Board
      game={shown}
      party={party}
      now={now}
      onClose={() => setClosed(shown.id)}
    />
  ) : (
    <Picker party={party} />
  );
};

export const gameIsLive = (state: AppState): boolean =>
  state.game !== null && state.game.phase !== "done";
