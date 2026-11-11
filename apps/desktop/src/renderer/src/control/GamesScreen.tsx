import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import {
  GAME_ENTRIES_PER_PLAYER,
  GAME_MIN_ENTRIES,
  GAME_REACTIONS,
  GAME_MIN_PLAYERS,
  MAX_GAME_BOTS,
  isBotId,
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
import { createPortal } from "react-dom";
import { Avatar } from "../Avatar";
import { useClipboardShelf } from "./ClipboardShelf";
import { LibraryPicker, type Shelf } from "./LibraryPicker";
import { layerLook, layerPlace } from "../scene";
import { ConfirmButton } from "./ConfirmButton";
import { GameArt } from "./game-art";
import { errorMessage } from "./messages";
import { Mascot } from "./mascots/Mascot";
import { personaOf } from "./mascots/persona";
import { useGameMood } from "./mascots/use-game-mood";
import "./mascots/worlds";

const GAMES: Array<{ kind: GameKind; title: string; rule: string }> = [
  {
    kind: "joke",
    title: "Meilleure blague",
    rule: "Chacun envoie jusqu’à 5 images. Deux joueurs font une blague sur la même image, et la party vote pour la meilleure du duel.",
  },
  {
    kind: "question",
    title: "Question débile",
    rule: "Une question débile, tu réponds avec un LiveChat avancé. Les réponses s’affrontent en duel, la party vote.",
  },
  {
    kind: "who",
    title: "Qui l’a envoyé ?",
    rule: "Chacun envoie un meme en secret. La party devine qui l’a envoyé. Des points si on ne te devine pas.",
  },
  {
    kind: "undercover",
    title: "Undercover",
    rule: "Tout le monde a la même image, sauf l’imposteur qui n’en a pas. Chacun son tour donne un mot, puis on vote pour le démasquer.",
  },
  {
    kind: "guess",
    title: "Devine Vite",
    rule: "Chacun écrit 3 mots. À ton tour, 30 s pour en faire deviner un max : en parlant, puis avec un seul mot, puis avec une image ou un son.",
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

const SOFT_VOLUME = 0.3;

// Starts only when pressed, with the sound low and a slider to change it.
const PressVideo = ({ url }: { url: string }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(SOFT_VOLUME);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (video.current) video.current.volume = volume;
  }, [volume]);
  const toggle = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };
  return (
    <div className="game-press-video" data-testid="game-press-video">
      <video
        ref={video}
        className="game-file"
        src={url}
        loop
        playsInline
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onClick={toggle}
      />
      {!playing && (
        <button type="button" className="toy-button small game-play" onClick={toggle}>
          ▶ Lancer la vidéo
        </button>
      )}
      <label className="game-volume">
        <span>Son</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label="Volume de la vidéo"
          onChange={(event) => setVolume(Number(event.target.value))}
        />
      </label>
    </div>
  );
};

const GameMedia = ({
  files,
  caption,
  big = false,
  press = false,
}: {
  files: GameFileView[];
  caption?: string;
  big?: boolean;
  press?: boolean;
}) => (
  <div className={big ? "game-media is-big" : "game-media"}>
    {files.map((file) =>
      press && file.kind === "video" && file.url ? (
        <PressVideo key={file.id} url={file.url} />
      ) : !file.url ? (
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

type Entry = GameView["entries"][number];

const GameScene = ({ entry }: { entry: Entry }) => {
  const place = entry.textPlace;
  return (
    <div className="game-scene" data-testid="game-scene">
      {(entry.scene ?? []).map((layer, index) => {
        const file = entry.files[layer.file];
        if (layer.link || !file?.url) return null;
        return (
          <div key={index} className="game-scene-layer" style={layerPlace(layer)}>
            {file.kind === "video" ? (
              <video src={file.url} style={layerLook(layer)} autoPlay loop muted playsInline />
            ) : (
              <img src={file.url} alt="" style={layerLook(layer)} />
            )}
          </div>
        );
      })}
      {entry.caption && (
        <p
          className="game-scene-text"
          style={place ? { left: `${place.x}%`, top: `${place.y}%`, width: `${place.width}%` } : undefined}
        >
          {entry.caption}
        </p>
      )}
    </div>
  );
};

const EntryMedia = ({ entry }: { entry: Entry }) =>
  entry.scene ? <GameScene entry={entry} /> : <GameMedia files={entry.files} caption={entry.caption} />;

// One after the other, a moment apart, at the reveal.
const REVEAL_STEP_MS = 700;
const useReveal = (count: number, on: boolean): number => {
  const [shown, setShown] = useState(on ? 0 : count);
  useEffect(() => {
    if (!on) {
      setShown(count);
      return;
    }
    setShown(0);
    const timer = window.setInterval(
      () => setShown((done) => Math.min(count, done + 1)),
      REVEAL_STEP_MS,
    );
    return () => window.clearInterval(timer);
  }, [on, count]);
  return shown;
};

const COLORS: Record<GameKind, string> = {
  joke: "#ffb547",
  question: "#ff5fa2",
  who: "#4cc9f0",
  undercover: "#9b6bff",
  guess: "#ffd23f",
};

const accentOf = (kind: GameKind): CSSProperties =>
  ({ "--accent": COLORS[kind] }) as CSSProperties;

type Who = { name: string; avatarUrl: string | null };
const whoOf = (party: PartyView, game: GameView, id: string | null): Who | undefined =>
  game.bots.find((bot) => bot.id === id) !== undefined
    ? { name: game.bots.find((bot) => bot.id === id)!.name, avatarUrl: null }
    : party.members.find((member) => member.id === id);
const nameOf = (party: PartyView, game: GameView, id: string | null): string =>
  whoOf(party, game, id)?.name ?? "Quelqu’un";

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
  onRemove,
}: {
  member: Who | undefined;
  me: boolean;
  badge?: "chef" | "ready" | "done" | null;
  delay?: number;
  points?: number;
  onRemove?: () => void;
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
    {onRemove && (
      <button
        type="button"
        className="toy-face-remove"
        aria-label={`Retirer ${member?.name ?? "le bot"}`}
        title="Retirer"
        onClick={onRemove}
      >
        ×
      </button>
    )}
    {points !== undefined && (
      <span className="toy-face-points mono">{points}</span>
    )}
  </li>
);

// Shrinks what a game step shows until it fits its box: nothing to scroll for.
const FIT_FLOOR = 0.55;
const Fit = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const inner = ref.current;
    const box = inner?.parentElement;
    if (!inner || !box) return;
    const fit = () => {
      const style = getComputedStyle(box);
      const room = box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (room < 40) return;
      const fits = (zoom: number) => {
        inner.style.zoom = String(zoom);
        return inner.getBoundingClientRect().height <= room + 1;
      };
      if (fits(1)) return;
      // The biggest size that fits: a smaller one can also change how lines wrap.
      let low = FIT_FLOOR;
      let high = 1;
      for (let pass = 0; pass < 6; pass++) {
        const mid = (low + high) / 2;
        if (fits(mid)) low = mid;
        else high = mid;
      }
      inner.style.zoom = String(low);
    };
    fit();
    const sizes = new ResizeObserver(fit);
    sizes.observe(box);
    sizes.observe(inner);
    // Pictures change the height when they load.
    const loaded = () => fit();
    inner.addEventListener("load", loaded, true);
    return () => {
      sizes.disconnect();
      inner.removeEventListener("load", loaded, true);
    };
  }, []);
  return (
    <div ref={ref} className="game-fit">
      {children}
    </div>
  );
};

// The owner's "Effets dans les jeux" setting, for every mascot of the screen.
const MascotEffects = createContext(true);

// The persona of the game, reacting to what happens in it.
const GameMascot = ({
  game,
  me,
  frame,
  reactions,
}: {
  game: GameView;
  me: string;
  frame: "scene" | "banner";
  reactions?: GameReactionView[];
}) => {
  const effects = useContext(MascotEffects);
  const { mood, pulse, look, burst } = useGameMood(game, me, reactions);
  return (
    <Mascot
      persona={personaOf(game.kind).id}
      mood={mood}
      pulse={pulse}
      look={look}
      burst={burst}
      effects={effects}
      frame={frame}
    />
  );
};

// At the podium: held on its victory (or its disappointment), with the victory moment's bursts.
const PodiumMascot = ({ game }: { game: GameView }) => {
  const effects = useContext(MascotEffects);
  const persona = personaOf(game.kind);
  const target = game.reason === "few" || game.reason === "stopped" ? "decu" : "victoire";
  const burst = persona.moments.find(([, mood]) => mood === "victoire")?.[2];
  // Starts calm so that the change to the final mood draws its bursts.
  const [shown, setShown] = useState<{ mood: "repos" | "victoire" | "decu"; pulse: number }>({ mood: "repos", pulse: 0 });
  useEffect(() => setShown({ mood: target, pulse: 1 }), [target]);
  return (
    <div className="podium-mascot">
      <Mascot
        persona={persona.id}
        mood={shown.mood}
        pulse={shown.pulse}
        look={0}
        burst={target === "victoire" ? burst : undefined}
        effects={effects}
        frame="scene"
        hold
      />
    </div>
  );
};

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
      className={`glass panel game-lobby world-${personaOf(game.kind).id}`}
      style={accentOf(game.kind)}
      data-testid="game-lobby"
    >
      <div className="lobby-head">
        <div className="lobby-stage">
          <GameMascot game={game} me={me} frame="scene" />
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
            member={whoOf(party, game, id)}
            me={id === me}
            delay={index * 60}
            badge={
              id === game.chefId
                ? "chef"
                : game.ready.includes(id)
                  ? "ready"
                  : null
            }
            onRemove={
              joined && isBotId(id)
                ? () => void window.liveChat.removeGameBot(game.id, id)
                : undefined
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
              data-testid="game-add-bot"
              title="Un joueur pour essayer : il écrit des bêtises et vote au hasard"
              disabled={game.bots.length >= MAX_GAME_BOTS}
              onClick={() => act("bot-add")}
            >
              + Bot
            </button>
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
        member={whoOf(party, game, id)}
        me={id === party.memberId}
        badge={game.acted.includes(id) ? "done" : null}
        points={game.scores[id] ?? 0}
      />
    ))}
  </ul>
);

const AUTO_SEND_BEFORE_MS = 1_200;

const TextForm = ({
  label,
  placeholder,
  maxLength,
  onSend,
  endsAt,
  now,
  autoFocus = true,
}: {
  label: string;
  placeholder: string;
  maxLength: number;
  onSend: (text: string) => void;
  // When time is about to run out, what was typed is sent anyway.
  endsAt?: number;
  now?: number;
  autoFocus?: boolean;
}) => {
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  const late = endsAt !== undefined && now !== undefined && endsAt - now <= AUTO_SEND_BEFORE_MS;
  useEffect(() => {
    if (!late || !text.trim()) return;
    onSend(text.trim());
    setText("");
    // Only once time runs out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [late]);
  return (
    <form className="game-form" onSubmit={submit}>
      <input
        className="input"
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={label}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
      />
      <button type="submit" className="pill primary" disabled={!text.trim()}>
        Envoyer
      </button>
    </form>
  );
};

// Devine Vite: each one writes the words the others will have to find.
const GuessWords = ({ game, now }: { game: GameView; now: number }) => {
  const wanted = GAME_ENTRIES_PER_PLAYER.guess;
  return (
    <div className="game-step">
      <p className="game-ask">
        Écris {wanted} mots ou noms à faire deviner : un objet, une star, un film, un pote…
      </p>
      <p className="hint mono" data-testid="game-sent">
        {game.mySent} / {wanted} mots
      </p>
      {game.mySent < wanted ? (
        <TextForm
          label="Un mot à faire deviner"
          placeholder="Ex : Tour Eiffel"
          maxLength={40}
          endsAt={game.endsAt}
          now={now}
          onSend={(text) => void window.liveChat.gameSay(game.id, text)}
        />
      ) : (
        <p className="hint">C’est noté. On attend les autres.</p>
      )}
      {game.entries.length > 0 && (
        <ul className="game-words">
          {game.entries.map((entry) => (
            <li key={entry.id}>
              <span>{entry.caption}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const GUESS_ROUNDS = [
  "Décris le mot comme tu veux.",
  "Un seul mot pour le faire deviner.",
  "Une image, un GIF ou un son. Sans écrire.",
];

// Round 3: what whoever speaks shows, from the library, what was copied, the PC, or Ctrl+V.
const GuessShow = ({ game }: { game: GameView }) => {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [error, setError] = useState<string | null>(null);
  const clips = useClipboardShelf();
  const run = async (send: () => Promise<GameSendResult>) => {
    setError(null);
    setError(sendError(await send()));
  };
  return (
    <div className="guess-show">
      <div className="game-actions">
        <button type="button" className="pill primary" onClick={() => setShelf("image")}>
          Ma bibliothèque
        </button>
        <button
          type="button"
          className="pill quiet"
          onClick={() => void run(() => window.liveChat.sendGameFiles(game.id))}
        >
          Depuis le PC
        </button>
      </div>
      {clips.items.length > 0 && (
        <ul className="guess-clips" aria-label="Images copiées">
          {clips.items.slice(0, 8).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                title="Montrer cette image"
                onClick={() => void run(() => window.liveChat.sendGameKept(game.id, "clipboard", item.id))}
              >
                <img src={item.url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Ou colle une image avec Ctrl+V.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {shelf &&
        createPortal(
          <LibraryPicker
            shelf={shelf}
            onShelf={setShelf}
            onClose={() => setShelf(null)}
            onPick={(file) => {
              setShelf(null);
              void run(() => window.liveChat.sendGameKept(game.id, "library", file.id));
            }}
          />,
          document.body,
        )}
    </div>
  );
};

const GuessTurn = ({ game, party }: { game: GameView; party: PartyView }) => {
  const me = party.memberId;
  const speaking = game.turn === me;
  const [choosing, setChoosing] = useState(false);
  useEffect(() => setChoosing(false), [game.secret]);
  const shown = game.entries[0];
  return (
    <div className="game-step">
      <p className="toy-tag" data-testid="guess-round">
        Manche {game.round} · {GUESS_ROUNDS[game.round - 1]}
      </p>
      {speaking ? (
        <>
          <p className="game-ask">À toi de faire deviner !</p>
          <div className="guess-card" key={game.secret ?? ""} data-testid="guess-secret">
            {game.secret}
          </div>
          {game.round === 3 && <GuessShow game={game} />}
          {shown && <GameMedia files={shown.files} />}
          {choosing ? (
            <div className="guess-finders">
              <p className="game-ask">Qui a trouvé ?</p>
              <div className="game-choices">
                {game.players
                  .filter((id) => id !== me)
                  .map((id) => (
                    <button
                      key={id}
                      type="button"
                      className="game-choice"
                      data-testid="guess-finder"
                      onClick={() => void window.liveChat.gameFound(game.id, id)}
                    >
                      {nameOf(party, game, id)}
                    </button>
                  ))}
              </div>
              <button type="button" className="pill quiet small" onClick={() => setChoosing(false)}>
                Retour
              </button>
            </div>
          ) : (
            <div className="game-actions">
              <button
                type="button"
                className="toy-button ghost"
                data-testid="guess-pass"
                onClick={() => void window.liveChat.gameAction(game.id, "pass")}
              >
                Passer
              </button>
              <button
                type="button"
                className="toy-button big"
                data-testid="guess-found"
                onClick={() => setChoosing(true)}
              >
                Trouvé !
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="game-ask" data-testid="game-turn">
            {nameOf(party, game, game.turn)} fait deviner…
          </p>
          {game.round !== 3 ? (
            <p className="hint">Écoute sur Discord et crie ta réponse !</p>
          ) : shown ? (
            <GameMedia files={shown.files} big />
          ) : (
            <p className="hint">On attend son image, son GIF ou son son.</p>
          )}
        </>
      )}
    </div>
  );
};

// Between two rounds: the same words come back, harder.
const GuessBreak = ({ game }: { game: GameView }) => (
  <div className="game-step">
    <p className="toy-title">Manche {game.round} finie !</p>
    {game.round < game.rounds && (
      <p className="game-ask">
        Les mêmes mots reviennent. Manche {game.round + 1} : {GUESS_ROUNDS[game.round]}
      </p>
    )}
  </div>
);

const Collect = ({
  game,
  onAnswer,
}: {
  game: GameView;
  onAnswer: (game: GameView) => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const wanted = GAME_ENTRIES_PER_PLAYER[game.kind];
  const pictures = game.kind === "joke" || game.kind === "undercover";
  const left = game.iAmDone ? 0 : wanted - game.mySent - game.sending;
  const enough = game.mySent >= GAME_MIN_ENTRIES[game.kind];
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
          (game.iAmDone
            ? "C’est validé. On attend les autres."
            : `Envoie de 2 à ${wanted} images (ou colle-les avec Ctrl+V). Les autres feront des blagues dessus.`)}
        {game.kind === "undercover" &&
          "Envoie une image de ton PC (ou colle-la avec Ctrl+V). Elle servira à l’un des tours."}
        {game.kind === "question" &&
          "Réponds avec un LiveChat avancé : la question est déjà écrite dessus."}
        {game.kind === "who" &&
          "Envoie un meme. Personne ne saura que c’est toi."}
      </p>
      <p className="hint mono" data-testid="game-sent">
        {game.mySent} / {wanted} envoyé{wanted > 1 ? "s" : ""}
        {game.sending > 0 && ` · ${game.sending} en route`}
      </p>
      {left > 0 && game.kind === "question" && (
        <div className="game-actions">
          <button
            type="button"
            className="toy-button big"
            data-testid="game-answer"
            onClick={() => onAnswer(game)}
          >
            Répondre en LiveChat avancé
          </button>
        </div>
      )}
      {left > 0 && (
        <div className="game-actions">
          <button
            type="button"
            className={game.kind === "question" ? "pill quiet" : "pill primary"}
            onClick={() =>
              void run(() => window.liveChat.sendGameFiles(game.id))
            }
          >
            {pictures
              ? left > 1
                ? "Choisir des images"
                : "Choisir une image"
              : "Ou juste un fichier"}
          </button>
          {game.kind === "joke" && (
            <button
              type="button"
              className="pill primary"
              data-testid="game-done"
              disabled={!enough || game.sending > 0}
              title={enough ? undefined : "Au moins 2 images"}
              onClick={() => void window.liveChat.gameAction(game.id, "done")}
            >
              Valider
            </button>
          )}
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

// The words given so far, in the order of the turns.
const Words = ({ game, party }: { game: GameView; party: PartyView }) =>
  game.entries.length === 0 ? null : (
    <ol className="game-words" data-testid="game-words">
      {game.entries.map((entry) => (
        <li key={entry.id}>
          <strong>{entry.mine ? "Toi" : nameOf(party, game, entry.id)}</strong>
          <span>{entry.caption}</span>
        </li>
      ))}
    </ol>
  );

const Write = ({ game, party, now }: { game: GameView; party: PartyView; now: number }) => {
  const me = party.memberId;
  if (game.kind === "guess") return <GuessTurn game={game} party={party} />;
  if (game.kind === "joke")
    return (
      <div className="game-step">
        <p className="game-ask">
          Une blague sur chaque image. Quelqu’un d’autre écrit sur la même : la party choisira.
        </p>
        <div className="game-tasks">
          {game.entries.map((entry, index) => (
            <div key={entry.id} className="game-task" data-testid="game-task">
              <GameMedia files={entry.files} />
              {entry.caption ? (
                <p className="hint">« {entry.caption} » ✓</p>
              ) : (
                <TextForm
                  label="Ta blague"
                  placeholder="Ta blague"
                  maxLength={MAX_GAME_TEXT_LENGTH}
                  endsAt={game.endsAt}
                  now={now}
                  autoFocus={index === 0}
                  onSend={(text) => void window.liveChat.gameSay(game.id, text, entry.id)}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    );

  const myTurn = game.turn === me;
  return (
    <div className="game-step">
      {game.iAmImpostor ? (
        <div className="game-impostor" data-testid="game-impostor">
          <p>Tu es l’imposteur</p>
          <span>Tu n’as pas d’image. Écoute les mots des autres et fais semblant.</span>
        </div>
      ) : (
        <GameMedia files={game.myPicture} big press />
      )}
      <Words game={game} party={party} />
      {myTurn ? (
        <>
          <p className="game-ask">À toi ! Donne un mot.</p>
          <TextForm
            label="Ton mot"
            placeholder="Un mot"
            maxLength={MAX_GAME_TEXT_LENGTH}
            endsAt={game.endsAt}
            now={now}
            onSend={(text) => void window.liveChat.gameSay(game.id, text)}
          />
        </>
      ) : (
        <p className="game-ask" data-testid="game-turn">
          {game.turn ? `À ${nameOf(party, game, game.turn)} d’écrire…` : "Tout le monde a parlé."}
        </p>
      )}
    </div>
  );
};

const Vote = ({ game, party }: { game: GameView; party: PartyView }) => {
  const me = party.memberId;
  const shown = game.phase === "reveal";
  const name = (id: string | null) => nameOf(party, game, id);
  const revealed = useReveal(
    game.kind === "undercover" ? game.players.length : game.entries.length,
    shown,
  );
  const allShown = revealed >= (game.kind === "undercover" ? game.players.length : game.entries.length);
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
            ? `C’était ${name(game.answer)} !`
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
                {name(id)}
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
            ? allShown
              ? `L’imposteur était ${name(game.answer)} !`
              : "Et l’imposteur était…"
            : "Qui est l’imposteur ?"}
        </p>
        {game.iAmImpostor ? (
          <p className="hint">Tu étais l’imposteur : ne te fais pas prendre.</p>
        ) : (
          <GameMedia files={game.myPicture} press />
        )}
        <div className="game-choices">
          {game.players.map((id, index) => {
            const word = game.entries.find((entry) => entry.id === id);
            return (
              <button
                key={id}
                type="button"
                className={[
                  "game-choice",
                  game.myChoice === id ? "is-mine" : "",
                  shown && allShown && game.answer === id ? "is-winner" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={shown || id === me}
                aria-pressed={game.myChoice === id}
                onClick={() => vote(id)}
              >
                <strong>{name(id)}</strong>
                <span>{word?.caption ?? "…"}</span>
                {shown && index < revealed && (
                  <span className="mono game-votes">{word?.votes ?? 0}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (game.kind === "joke") {
    const author = game.entries.some((entry) => entry.mine);
    const best = Math.max(0, ...game.entries.map((entry) => entry.votes ?? 0));
    return (
      <div className="game-step">
        <p className="game-ask">
          {shown
            ? "Résultat du duel"
            : author
              ? "Tu ne votes pas sur ton duel."
              : "Quelle blague est la meilleure ?"}
        </p>
        {game.entries[0] && <GameMedia files={game.entries[0].files} big />}
        <div className="game-duel">
          {game.entries.map((entry, index) => (
            <div key={entry.id} className="game-duel-side">
              {index > 0 && (
                <span className="game-vs" aria-hidden="true">
                  VS
                </span>
              )}
              <button
                type="button"
                className={[
                  "game-entry game-joke",
                  game.myChoice === entry.id ? "is-mine" : "",
                  shown && allShown && entry.votes === best && best > 0 ? "is-winner" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={shown || author}
                aria-pressed={game.myChoice === entry.id}
                data-testid="game-entry"
                onClick={() => vote(entry.id)}
              >
                <p className="game-caption is-alone">{entry.caption}</p>
                {shown && index < revealed && (
                  <span className="game-entry-foot">
                    {name(entry.ownerId)} · <span className="mono">{entry.votes}</span> vote
                    {(entry.votes ?? 0) > 1 ? "s" : ""}
                  </span>
                )}
                {!shown && entry.mine && <span className="game-entry-foot">La tienne</span>}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // The duels of the question game.
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
                shown && allShown && entry.votes === best && best > 0 ? "is-winner" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={shown || entry.mine || sitting}
              aria-pressed={game.myChoice === entry.id}
              data-testid="game-entry"
              onClick={() => vote(entry.id)}
            >
              <EntryMedia entry={entry} />
              {shown && index < revealed && (
                <span className="game-entry-foot">
                  {name(entry.ownerId)} ·{" "}
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
      <PodiumMascot game={game} />
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
                  name={whoOf(party, game, id)?.name ?? "?"}
                  url={whoOf(party, game, id)?.avatarUrl ?? null}
                />
                <span className="podium-name">
                  {id === party.memberId
                    ? "Toi"
                    : (whoOf(party, game, id)?.name ?? "Parti")}
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
                {whoOf(party, game, id)?.name ?? "Parti"}
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
              {whoOf(party, game, memberId)?.name ?? ""}
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
  onAnswer,
}: {
  game: GameView;
  party: PartyView;
  now: number;
  reactions: GameReactionView[];
  onClose: () => void;
  onAnswer: (game: GameView) => void;
}) => {
  const waitingVote = game.phase === "vote" && !game.voteStarted;
  const secondsLeft = Math.max(0, Math.ceil((game.endsAt - now) / 1_000));
  const playing = game.players.includes(party.memberId);
  const waiting = game.waiting.includes(party.memberId);
  return (
    <section
      className={`glass panel game-main world-${personaOf(game.kind).id}${game.phase !== "done" ? " has-host" : ""}`}
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
            <span className="count" data-testid="game-phase">
              {waitingVote
                ? "En attente du premier vote"
                : game.kind === "guess" && game.phase === "write"
                  ? "Chrono"
                  : game.kind === "guess" && game.phase === "reveal"
                    ? "Pause"
                    : PHASE_LABEL[game.phase]}
            </span>
            <span className="game-clock mono" data-testid="game-timer">
              {secondsLeft}
            </span>
          </span>
        )}
      </header>
      {game.phase !== "done" && (
        <div className="game-host" aria-hidden="true">
          <GameMascot game={game} me={party.memberId} frame="scene" reactions={reactions} />
        </div>
      )}
      {game.phase !== "done" && <Faces game={game} party={party} />}
      <div
        key={`${game.phase}-${game.round}-${game.entries.map((entry) => entry.id).join()}`}
        className="game-body scroll"
      >
        <Fit>
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
        ) : game.phase === "collect" && game.kind === "guess" ? (
          <GuessWords game={game} now={now} />
        ) : game.phase === "reveal" && game.kind === "guess" ? (
          <GuessBreak game={game} />
        ) : game.phase === "collect" ? (
          <Collect game={game} onAnswer={onAnswer} />
        ) : game.phase === "write" ? (
          <Write game={game} party={party} now={now} />
        ) : game.phase === "done" ? (
          <Podium game={game} party={party} />
        ) : (
          <Vote game={game} party={party} />
        )}
        </Fit>
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
  onAnswer,
}: {
  state: AppState;
  party: PartyView;
  active: boolean;
  // Opens LiveChat avancé, with the question as its text.
  onAnswer: (game: GameView) => void;
}) => {
  const game = state.game;
  const now = useNow(active && game !== null && game.phase !== "done");
  // A finished game stays until someone looks elsewhere.
  const [closed, setClosed] = useState<string | null>(null);
  const shown =
    game && !(game.phase === "done" && closed === game.id) ? game : null;
  if (!shown) return <Picker party={party} />;
  return (
    <MascotEffects.Provider value={state.settings.gameEffects}>
      {shown.phase === "lobby" ? (
        <Lobby game={shown} party={party} now={now} />
      ) : (
        <Board
          game={shown}
          party={party}
          now={now}
          reactions={state.gameReactions}
          onClose={() => setClosed(shown.id)}
          onAnswer={onAnswer}
        />
      )}
    </MascotEffects.Provider>
  );
};

export const gameIsLive = (state: AppState): boolean =>
  state.game !== null && state.game.phase !== "done";
