import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import {
  GAME_ENTRIES_PER_PLAYER,
  GAME_REACTIONS,
  GAME_MIN_PLAYERS,
  MAX_CAPTION_LENGTH,
  MAX_GAME_TEXT_LENGTH,
  type GameKind,
} from "@livechatsbcb/protocol";
import type {
  AppState,
  GameAction,
  GameFileView,
  GameReactionView,
  GameSendResult,
  GameView,
  PartyView,
} from "../../../shared/ipc";
import { Avatar } from "../Avatar";
import { ConfirmButton } from "./ConfirmButton";
import { GameArt } from "./game-art";
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

const COLORS: Record<GameKind, string> = {
  joke: "#ffb547",
  question: "#ff5fa2",
  who: "#4cc9f0",
  undercover: "#9b6bff",
};

const accentOf = (kind: GameKind): CSSProperties =>
  ({ "--accent": COLORS[kind] }) as CSSProperties;

type Member = PartyView["members"][number];
const memberOf = (party: PartyView, id: string): Member | undefined =>
  party.members.find((member) => member.id === id);

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
        {GAMES.map(({ kind, title, rule }) => (
          <article
            key={kind}
            className="game-card"
            data-testid={`game-card-${kind}`}
          >
            <div className="game-card-art">
              <GameArt kind={kind} />
            </div>
            <h3>{title}</h3>
            <p className="game-card-rule">{rule}</p>
            <footer>
              <span className="count">
                {GAME_MIN_PLAYERS[kind]} joueurs ou plus
              </span>
              <button
                type="button"
                className="toy-button small"
                onClick={() => void window.liveChat.startGame(kind)}
              >
                Ouvrir
              </button>
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
};

// A round face, with a little badge: the crown of whoever runs the lobby, a check once done.
const Face = ({
  member,
  me,
  badge,
  delay = 0,
  points,
}: {
  member: Member | undefined;
  me: boolean;
  badge?: "chef" | "ready" | "done" | null;
  delay?: number;
  points?: number;
}) => (
  <li
    className={["toy-face", badge ? `has-${badge}` : "", me ? "is-me" : ""]
      .filter(Boolean)
      .join(" ")}
    style={{ "--delay": `${delay}ms` } as CSSProperties}
  >
    <span className="toy-face-ring">
      <Avatar
        className="avatar"
        name={member?.name ?? "?"}
        url={member?.avatarUrl ?? null}
      />
      {badge === "chef" && (
        <span className="toy-badge is-chef" title="Lance la partie">
          👑
        </span>
      )}
      {(badge === "ready" || badge === "done") && (
        <span
          className="toy-badge is-check"
          title={badge === "ready" ? "Prêt" : "A joué"}
        >
          ✓
        </span>
      )}
    </span>
    <span className="toy-face-name">
      {me ? "Toi" : (member?.name ?? "Parti")}
    </span>
    {points !== undefined && (
      <span className="toy-face-points mono">{points}</span>
    )}
  </li>
);

const Lobby = ({
  game,
  party,
  now,
}: {
  game: GameView;
  party: PartyView;
  now: number;
}) => {
  const me = party.memberId;
  const joined = game.players.includes(me);
  const chef = game.chefId === me;
  const ready = game.ready.includes(me);
  const min = GAME_MIN_PLAYERS[game.kind];
  const missing = Math.max(0, min - game.players.length);
  const secondsLeft = Math.max(0, Math.ceil((game.endsAt - now) / 1_000));
  const act = (action: GameAction) =>
    void window.liveChat.gameAction(game.id, action);
  const rule = GAMES.find(({ kind }) => kind === game.kind)!.rule;
  const allReady = game.players.every((id) => game.ready.includes(id));

  return (
    <section
      className="glass panel game-lobby"
      style={accentOf(game.kind)}
      data-testid="game-lobby"
    >
      <div className="lobby-head">
        <div className="lobby-art">
          <GameArt kind={game.kind} />
        </div>
        <div className="lobby-title">
          <span className="toy-tag">Salon</span>
          <h2>{titleOf(game.kind)}</h2>
          <p>{rule}</p>
        </div>
      </div>

      <ul className="lobby-faces" aria-label="Joueurs">
        {game.players.map((id, index) => (
          <Face
            key={id}
            member={memberOf(party, id)}
            me={id === me}
            delay={index * 60}
            badge={
              id === game.chefId
                ? "chef"
                : game.ready.includes(id)
                  ? "ready"
                  : null
            }
          />
        ))}
        {Array.from({ length: missing }, (_, index) => (
          <li key={`empty-${index}`} className="toy-face is-empty">
            <span className="toy-face-ring">?</span>
            <span className="toy-face-name">…</span>
          </li>
        ))}
      </ul>

      <p className="lobby-status" data-testid="lobby-status">
        {missing > 0
          ? `Il manque ${missing} joueur${missing > 1 ? "s" : ""}`
          : allReady
            ? `Tout le monde est prêt ! ${secondsLeft} s`
            : `Ça démarre tout seul dans ${secondsLeft} s`}
      </p>

      <div className="lobby-actions">
        {!joined ? (
          <button
            type="button"
            className="toy-button big"
            onClick={() => act("join")}
          >
            Rejoindre
          </button>
        ) : (
          <>
            {chef ? (
              <button
                type="button"
                className="toy-button big"
                disabled={missing > 0}
                onClick={() => act("launch")}
              >
                Lancer
              </button>
            ) : (
              <button
                type="button"
                className={ready ? "toy-button big is-on" : "toy-button big"}
                aria-pressed={ready}
                onClick={() => act(ready ? "unready" : "ready")}
              >
                {ready ? "Prêt ✓" : "Prêt ?"}
              </button>
            )}
            <button
              type="button"
              className="toy-button ghost"
              onClick={() => act("leave")}
            >
              Quitter
            </button>
          </>
        )}
      </div>
    </section>
  );
};

// The players across the top, with a check once they have done their part.
const Faces = ({ game, party }: { game: GameView; party: PartyView }) => (
  <ul className="game-faces" data-testid="game-scores">
    {game.players.map((id) => (
      <Face
        key={id}
        member={memberOf(party, id)}
        me={id === party.memberId}
        badge={game.acted.includes(id) ? "done" : null}
        points={game.scores[id] ?? 0}
      />
    ))}
  </ul>
);

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

const CONFETTI_COLORS = ["#ffb547", "#ff5fa2", "#4cc9f0", "#9b6bff", "#8ee6b4", "#ffffff"];

const Confetti = () => (
  <div className="toy-confetti" aria-hidden="true">
    {Array.from({ length: 40 }, (_, index) => (
      <i
        key={index}
        style={
          {
            left: `${(index * 97) % 100}%`,
            background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
            animationDelay: `${(index % 10) * 80}ms`,
            animationDuration: `${2_000 + ((index * 53) % 1_000)}ms`,
            "--drift": `${((index * 37) % 90) - 45}px`,
            "--spin": `${(index * 71) % 720}deg`,
          } as CSSProperties
        }
      />
    ))}
  </div>
);

// The three best on steps, the rest below, and a rematch in the same lobby.
const Podium = ({ game, party }: { game: GameView; party: PartyView }) => {
  const ranked = [...game.players].sort(
    (a, b) => (game.scores[b] ?? 0) - (game.scores[a] ?? 0),
  );
  // Equal points, equal place.
  const placeOf = (id: string) =>
    ranked.filter((other) => (game.scores[other] ?? 0) > (game.scores[id] ?? 0))
      .length;
  const top = ranked.slice(0, 3);
  // Second on the left, first in the middle, third on the right.
  const steps = [top[1], top[0], top[2]];
  const rest = ranked.slice(3);
  const played = game.reason !== "few";
  const mine =
    game.players.includes(party.memberId) ||
    game.waiting.includes(party.memberId);

  return (
    <div className="game-step podium-step">
      {played && <Confetti />}
      <p className="toy-title">
        {game.reason === "few"
          ? "Pas assez d’envois pour jouer."
          : game.reason === "stopped"
            ? "Partie arrêtée"
            : "Podium !"}
      </p>
      {played && (
        <ol className="podium" data-testid="game-ranking">
          {steps.map((id, index) =>
            id ? (
              <li
                key={id}
                className={`podium-step-${placeOf(id) + 1}`}
                style={{ "--order": [1, 0, 2][index] } as CSSProperties}
              >
                <Avatar
                  className="avatar"
                  name={memberOf(party, id)?.name ?? "?"}
                  url={memberOf(party, id)?.avatarUrl ?? null}
                />
                <span className="podium-name">
                  {id === party.memberId
                    ? "Toi"
                    : (memberOf(party, id)?.name ?? "Parti")}
                </span>
                <span className="podium-block">
                  <span className="podium-medal">
                    {["🥇", "🥈", "🥉"][placeOf(id)] ?? placeOf(id) + 1}
                  </span>
                  <span className="mono">{game.scores[id] ?? 0} pts</span>
                </span>
              </li>
            ) : (
              <li key={`none-${index}`} className="podium-empty" />
            ),
          )}
        </ol>
      )}
      {played && rest.length > 0 && (
        <ol className="podium-rest">
          {rest.map((id) => (
            <li key={id}>
              <span className="mono">{placeOf(id) + 1}</span>
              <span className="game-score-name">
                {memberOf(party, id)?.name ?? "Parti"}
              </span>
              <span className="mono">{game.scores[id] ?? 0}</span>
            </li>
          ))}
        </ol>
      )}
      {mine && (
        <button
          type="button"
          className="toy-button big"
          onClick={() => void window.liveChat.gameAction(game.id, "rematch")}
        >
          Revanche
        </button>
      )}
    </div>
  );
};

const PHASE_LABEL: Record<GameView["phase"], string> = {
  lobby: "Salon",
  collect: "Envois",
  write: "À toi d’écrire",
  vote: "Vote",
  reveal: "Révélation",
  done: "Fin",
};

// « C’est parti ! », then « Manche 2 ! »: big, for a moment, when a round starts.
const ROUND_SHOWN_MS = 1_600;
const RoundBanner = ({ game }: { game: GameView }) => {
  const [shown, setShown] = useState<string | null>(null);
  const key = `${game.id}-${game.round}`;
  useEffect(() => {
    if (game.phase === "done" || game.phase === "lobby") return;
    setShown(key);
    const timer = window.setTimeout(() => setShown(null), ROUND_SHOWN_MS);
    return () => window.clearTimeout(timer);
    // Only a new round brings it back, not each phase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (shown !== key) return null;
  return (
    <div className="round-banner" aria-live="polite" data-testid="round-banner">
      <span>
        {game.round === 1
          ? "C’est parti !"
          : game.round === game.rounds && game.rounds > 1
            ? "Dernière manche !"
            : `Manche ${game.round} !`}
      </span>
    </div>
  );
};

// Emojis sent by the players float up across the game.
const Reactions = ({
  game,
  party,
  reactions,
}: {
  game: GameView;
  party: PartyView;
  reactions: GameReactionView[];
}) => {
  const mine =
    game.players.includes(party.memberId) ||
    game.waiting.includes(party.memberId);
  return (
    <>
      <div className="reaction-sky" aria-hidden="true">
        {reactions.map(({ id, memberId, emoji }) => (
          <span
            key={id}
            className="reaction-float"
            style={{ left: `${10 + ((id * 37) % 80)}%` } as CSSProperties}
          >
            <span className="reaction-emoji">{emoji}</span>
            <span className="reaction-who">
              {memberOf(party, memberId)?.name ?? ""}
            </span>
          </span>
        ))}
      </div>
      {mine && game.phase !== "done" && (
        <div className="reaction-bar" aria-label="Réactions">
          {GAME_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="reaction-button"
              onClick={() => void window.liveChat.gameReact(game.id, emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
};

const Board = ({
  game,
  party,
  now,
  reactions,
  onClose,
}: {
  game: GameView;
  party: PartyView;
  now: number;
  reactions: GameReactionView[];
  onClose: () => void;
}) => {
  const secondsLeft = Math.max(0, Math.ceil((game.endsAt - now) / 1_000));
  const playing = game.players.includes(party.memberId);
  const waiting = game.waiting.includes(party.memberId);
  return (
    <section
      className="glass panel game-main"
      style={accentOf(game.kind)}
      aria-labelledby="game-title"
      data-testid="game"
      data-phase={game.phase}
    >
      <header className="game-top">
        <div className="game-top-art">
          <GameArt kind={game.kind} />
        </div>
        <h2 id="game-title" className="game-top-title">
          {titleOf(game.kind)}
          {game.rounds > 1 && game.phase !== "done" && (
            <span className="toy-tag">
              Manche {game.round} / {game.rounds}
            </span>
          )}
        </h2>
        {game.phase === "done" ? (
          <button type="button" className="toy-button ghost small" onClick={onClose}>
            Autre jeu
          </button>
        ) : (
          <span className="game-timer">
            <span className="count">{PHASE_LABEL[game.phase]}</span>
            <span className="game-clock mono" data-testid="game-timer">
              {secondsLeft}
            </span>
          </span>
        )}
      </header>
      {game.phase !== "done" && <Faces game={game} party={party} />}
      <div
        key={`${game.phase}-${game.round}-${game.entries.map((entry) => entry.id).join()}`}
        className="game-body scroll"
      >
        {!playing && game.phase !== "done" ? (
          <div className="game-step">
            <p className="game-ask">
              {waiting
                ? "Tu es dans la partie : tu joues dès la prochaine manche."
                : "Une partie est en cours."}
            </p>
            {!waiting && (
              <button
                type="button"
                className="toy-button big"
                onClick={() => void window.liveChat.gameAction(game.id, "join")}
              >
                Rejoindre aussi
              </button>
            )}
          </div>
        ) : game.phase === "collect" ? (
          <Collect game={game} />
        ) : game.phase === "write" ? (
          <Write game={game} me={party.memberId} />
        ) : game.phase === "done" ? (
          <Podium game={game} party={party} />
        ) : (
          <Vote game={game} party={party} />
        )}
      </div>
      <RoundBanner game={game} />
      <Reactions game={game} party={party} reactions={reactions} />
      {game.phase !== "done" && (playing || waiting) && (
        <footer className="panel-actions game-foot">
          <button
            type="button"
            className="toy-button ghost small"
            onClick={() => void window.liveChat.gameAction(game.id, "leave")}
          >
            Quitter
          </button>
          {playing && (
            <ConfirmButton
              label="Arrêter la partie"
              confirmLabel="Arrêter pour tous ?"
              onConfirm={() => void window.liveChat.stopGame(game.id)}
            />
          )}
        </footer>
      )}
    </section>
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
  if (!shown) return <Picker party={party} />;
  if (shown.phase === "lobby")
    return <Lobby game={shown} party={party} now={now} />;
  return (
    <Board
      game={shown}
      party={party}
      now={now}
      reactions={state.gameReactions}
      onClose={() => setClosed(shown.id)}
    />
  );
};

export const gameIsLive = (state: AppState): boolean =>
  state.game !== null && state.game.phase !== "done";
