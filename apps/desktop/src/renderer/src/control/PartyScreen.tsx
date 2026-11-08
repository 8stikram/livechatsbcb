import { useEffect, useState, type FormEvent } from 'react';
import {
  MAX_NOTE_LENGTH,
  MAX_ONLINE_MEMBERS,
  MAX_POLL_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION_LENGTH,
  MIN_POLL_OPTIONS,
  type Activity,
} from '@livechatsbcb/protocol';
import type { ActionResult, AppState, MemberView, PartyView, PollView, UpcomingView } from '../../../shared/ipc';
import { Avatar } from '../Avatar';
import { FitText } from '../scene';
import { ConfirmButton } from './ConfirmButton';
import { GlideList } from './glide';
import { KindIcon } from './icons';
import { errorMessage, minutesLeft } from './messages';
import { mediaTitle, NowCard } from './NowPlaying';

const ACTIVITY_LABEL: Record<Activity, string | null> = {
  here: null,
  playing: 'En jeu',
  away: 'Absent',
  panic: 'Panique',
};

// The result stays on screen this long after the end, then the panel is ready for the next one.
const POLL_RESULT_SHOWN_MS = 15_000;

const Upcoming = ({ upcoming, active }: { upcoming: UpcomingView[]; active: boolean }) => (
  <section className="glass panel is-short" aria-labelledby="upcoming-title">
    <h2 id="upcoming-title" className="panel-title">
      À suivre
      {active && upcoming.length > 0 && (
        <span className="count mono" data-testid="queue-waiting">
          {upcoming.length} en attente
        </span>
      )}
    </h2>
    {upcoming.length === 0 ? (
      <p className="hint">Personne n'attend.</p>
    ) : (
      <GlideList className="rows scroll">
        {upcoming.map((item) => (
          <li key={item.id} className="row">
            <span className="kind-tile is-small">
              <KindIcon kind={item.kind} size={16} />
            </span>
            <span className="row-text">
              <span className="row-title" title={mediaTitle(item)}>
                {mediaTitle(item)}
              </span>
              <FitText
                className="row-sub"
                text={`${item.replay ? `Relancé par ${item.senderName}` : item.senderName}${item.whisper ? ' · chuchoté' : ''}`}
              />
            </span>
          </li>
        ))}
      </GlideList>
    )}
  </section>
);

const useNow = (every: number, running: boolean): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every, running]);
  return now;
};

const PollStarter = () => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const filled = options.map((option) => option.trim()).filter(Boolean);
  const ready = question.trim() !== '' && filled.length >= MIN_POLL_OPTIONS;

  const start = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    void window.liveChat.startPoll(question.trim(), filled);
    setQuestion('');
    setOptions(['', '']);
  };

  return (
    <form className="poll-form" onSubmit={start} data-testid="poll-form">
      <input
        className="input"
        value={question}
        maxLength={MAX_POLL_QUESTION_LENGTH}
        placeholder="Ta question"
        aria-label="Question du sondage"
        data-testid="poll-question"
        onChange={(event) => setQuestion(event.target.value)}
      />
      {options.map((option, index) => (
        <input
          key={index}
          className="input is-small"
          value={option}
          maxLength={MAX_POLL_OPTION_LENGTH}
          placeholder={`Choix ${index + 1}`}
          aria-label={`Choix ${index + 1}`}
          data-testid="poll-option"
          onChange={(event) => setOptions(options.map((other, at) => (at === index ? event.target.value : other)))}
        />
      ))}
      <div className="field-line">
        {options.length < MAX_POLL_OPTIONS ? (
          <button type="button" className="pill quiet small" onClick={() => setOptions([...options, ''])}>
            Ajouter un choix
          </button>
        ) : (
          <span />
        )}
        <button type="submit" className="pill secondary small" disabled={!ready} data-testid="poll-start">
          Lancer, 30 s
        </button>
      </div>
    </form>
  );
};

const PollBoard = ({ poll, now }: { poll: PollView; now: number }) => {
  const total = poll.counts.reduce((sum, count) => sum + count, 0);
  const secondsLeft = Math.max(0, Math.ceil((poll.endsAt - now) / 1_000));
  const open = !poll.done && secondsLeft > 0;
  const best = Math.max(...poll.counts);

  return (
    <div className="poll" data-testid="poll">
      <p className="poll-question">{poll.question}</p>
      <p className="hint">
        {open ? (
          <>
            Par {poll.starterName} · <span className="mono">{secondsLeft} s</span> · votes anonymes
          </>
        ) : (
          `Terminé · ${total} vote${total > 1 ? 's' : ''}`
        )}
      </p>
      <ul className="poll-options">
        {poll.options.map((option, index) => {
          const count = poll.counts[index] ?? 0;
          const share = total === 0 ? 0 : Math.round((count / total) * 100);
          const winner = !open && total > 0 && count === best;
          return (
            <li key={index}>
              <button
                type="button"
                className={['poll-option', poll.myVote === index ? 'is-mine' : '', winner ? 'is-winner' : ''].filter(Boolean).join(' ')}
                disabled={!open}
                aria-pressed={poll.myVote === index}
                data-testid="poll-choice"
                onClick={() => void window.liveChat.votePoll(poll.id, index)}
              >
                <span className="poll-bar" style={{ width: `${share}%` }} aria-hidden="true" />
                <span className="poll-label">{option}</span>
                <span className="poll-count mono" data-testid="poll-count">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const Polls = ({ poll, active }: { poll: PollView | null; active: boolean }) => {
  const now = useNow(500, active && poll !== null);
  const shown = poll && (!poll.done || now < poll.endsAt + POLL_RESULT_SHOWN_MS) ? poll : null;
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (poll && !poll.done) setStarting(false);
  }, [poll?.id, poll?.done]);
  const open = shown !== null && !shown.done && now < shown.endsAt;

  return (
    <section className="glass panel is-short" aria-labelledby="poll-title">
      <h2 id="poll-title" className="panel-title">
        Sondage éclair
        {!open && !starting && (
          <button type="button" className="pill quiet small" data-testid="poll-new" onClick={() => setStarting(true)}>
            Nouveau
          </button>
        )}
      </h2>
      {starting && !open ? (
        <PollStarter />
      ) : shown ? (
        <PollBoard poll={shown} now={now} />
      ) : (
        <p className="hint">Une question, 2 à 4 choix, 30 secondes pour voter.</p>
      )}
    </section>
  );
};

const NoteField = ({ note }: { note: string }) => {
  const [text, setText] = useState(note);
  useEffect(() => setText(note), [note]);
  const save = () => {
    if (text.trim() !== note) void window.liveChat.setSettings({ note: text.trim() });
  };
  return (
    <input
      className="input is-small"
      value={text}
      maxLength={MAX_NOTE_LENGTH}
      placeholder="Ton statut, en quelques mots"
      aria-label="Ton statut"
      data-testid="note-field"
      onChange={(event) => setText(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
};

// "depuis 5 min", "depuis 1 h 20". Never less than a minute: the clocks of two PCs are never quite the same.
const playingFor = (since: number): string => {
  const minutes = Math.max(1, Math.floor((Date.now() - since) / 60_000));
  if (minutes < 60) return `depuis ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `depuis ${hours} h${rest > 0 ? ` ${String(rest).padStart(2, '0')}` : ''}`;
};

// "Joue à VALORANT depuis 1 h" rather than "En jeu", when they let it show.
const activityText = (member: MemberView): string | null => {
  if (!member.online) return null;
  if (member.activity === 'playing' && member.game) {
    return `Joue à ${member.game}${member.playingSince !== null ? ` ${playingFor(member.playingSince)}` : ''}`;
  }
  return ACTIVITY_LABEL[member.activity];
};

const statusLine = (member: MemberView): string => [activityText(member), member.note || null].filter(Boolean).join(' · ');

const Members = ({
  state,
  party,
  onOpenHistory,
  onWhisper,
}: {
  state: AppState;
  party: PartyView;
  onOpenHistory: (memberId: string) => void;
  onWhisper: (memberId: string) => void;
}) => {
  const [error, setError] = useState<string | null>(null);
  const online = party.members.filter((member) => member.online).length;
  const { current } = state.queue;
  const liveSender = current?.startAt != null && !current.hiddenForMe ? current.senderId : null;

  const run = async (action: () => Promise<ActionResult>) => {
    setError(null);
    const result = await action();
    if (!result.ok) setError(errorMessage(result.error));
  };

  return (
    <section className="glass panel is-fill" aria-labelledby="members-title">
      <h2 id="members-title" className="panel-title">
        Membres
        <span className="count" data-testid="online-count">
          <span className="mono">
            {online} / {MAX_ONLINE_MEMBERS}
          </span>{' '}
          en ligne
        </span>
      </h2>
      <GlideList className="rows scroll is-pop">
        {party.members.map((member) => {
          const status = statusLine(member);
          return (
            <li
              key={member.id}
              className={member.online ? 'row is-clickable' : 'row is-offline is-clickable'}
              data-testid="member"
              title="Voir ses LiveChats"
              onClick={() => onOpenHistory(member.id)}
              onContextMenu={() => {
                if (member.id === party.memberId) return;
                void window.liveChat.showMemberMenu(member.id).then((choice) => {
                  if (choice) void window.liveChat.ignoreMember(member.id, choice);
                });
              }}
            >
              <Avatar
                className={member.id === liveSender ? 'avatar is-large has-ring is-live' : 'avatar is-large'}
                name={member.name}
                url={member.avatarUrl}
                testId="member-avatar"
              />
              <span className="row-text">
                <FitText className="row-title" text={member.name}>
                  {member.name}
                  {member.id === party.memberId && <span className="row-you"> (toi)</span>}
                </FitText>
                {status && (
                  <span className={`row-sub is-${member.activity}`} data-testid="member-status">
                    {status}
                  </span>
                )}
                {member.online && member.id !== party.memberId && member.version !== state.version && (
                  <span className="row-sub" data-testid="member-version">
                    {member.version ? `Version ${member.version}` : 'Ancienne version'}
                  </span>
                )}
                {member.bannedUntil !== null && member.bannedUntil > Date.now() && (
                  <span className="row-sub is-banned" data-testid="member-banned">
                    Banni encore {minutesLeft(member.bannedUntil)} min
                  </span>
                )}
                {member.ignored && (
                  <span className="row-sub" data-testid="member-ignored">
                    Ignoré{member.ignored.until ? ` encore ${minutesLeft(member.ignored.until)} min` : ''}, clic droit pour changer
                  </span>
                )}
              </span>
              {member.online && member.id !== party.memberId && (
                <button
                  type="button"
                  className="pill quiet small whisper-button"
                  title={`Chuchoter un LiveChat à ${member.name}`}
                  data-testid="member-whisper"
                  onClick={(event) => {
                    event.stopPropagation();
                    onWhisper(member.id);
                  }}
                >
                  Chuchoter
                </button>
              )}
              {member.sentToday > 0 && (
                <span className="day-count" title="LiveChats envoyés aujourd'hui" data-testid="member-today">
                  <span className="mono">{member.sentToday}</span> aujourd’hui
                </span>
              )}
              <button
                type="button"
                className="pill quiet small"
                data-testid="member-history"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenHistory(member.id);
                }}
              >
                Ses LiveChats
              </button>
              {member.online && <span className="dot is-online" title="En ligne" />}
            </li>
          );
        })}
      </GlideList>

      <NoteField note={state.settings.note} />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!party.guild && (
        <footer className="panel-actions">
          <ConfirmButton
            label="Changer le code"
            confirmLabel="Confirmer le changement ?"
            onConfirm={() => void run(window.liveChat.rotateCode)}
          />
          <ConfirmButton
            label="Quitter la party"
            confirmLabel="Confirmer le départ ?"
            onConfirm={() => void run(window.liveChat.leaveParty)}
          />
        </footer>
      )}
    </section>
  );
};

// Nothing shows and nothing is heard on this PC until it is pressed again. The same as the clean key, in plain sight.
const StopBar = ({ stopped }: { stopped: boolean }) => (
  <section className={stopped ? 'glass stop-bar is-stopped' : 'glass stop-bar'} aria-label="Arrêter" data-testid="stop-bar">
    <div className="stop-text">
      <p className="stop-title">{stopped ? 'Arrêté chez toi' : 'Les LiveChats s’affichent chez toi'}</p>
      <p className="hint">{stopped ? 'Plus rien ne s’affiche ni ne s’entend sur ce PC. Les autres ne voient rien.' : 'Arrêter coupe tout sur ce PC seulement, jusqu’à Reprendre.'}</p>
    </div>
    <button
      type="button"
      className={stopped ? 'pill stop-button is-resume' : 'pill stop-button is-stop'}
      data-testid="stop-button"
      data-tour="stop"
      onClick={() => void window.liveChat.setClean(!stopped)}
    >
      {stopped ? 'Reprendre' : 'Arrêter'}
    </button>
  </section>
);

export const PartyScreen = ({
  state,
  party,
  active,
  onOpenHistory,
  onWhisper,
}: {
  state: AppState;
  party: PartyView;
  active: boolean;
  onOpenHistory: (memberId: string) => void;
  onWhisper: (memberId: string) => void;
}) => (
  <div className="party-grid">
    <div className="party-main">
      <StopBar stopped={state.settings.clean} />
      <Members state={state} party={party} onOpenHistory={onOpenHistory} onWhisper={onWhisper} />
    </div>
    <aside className="party-side scroll">
      <NowCard current={state.queue.current} settings={state.settings} active={active} />
      <Upcoming upcoming={state.queue.upcoming} active={active} />
      <Polls poll={state.poll} active={active} />
    </aside>
  </div>
);
