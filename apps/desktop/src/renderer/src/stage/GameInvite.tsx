import type { AppState, GameInviteView } from '../../../shared/ipc';
import { Mascot } from '../control/mascots/Mascot';
import { personaOf } from '../control/mascots/persona';

const TITLES: Record<GameInviteView['kind'], string> = {
  joke: 'Meilleure blague',
  question: 'Question débile',
  who: 'Qui l’a envoyé ?',
  undercover: 'Undercover',
  guess: 'Devine Vite',
};

const COLORS: Record<GameInviteView['kind'], string> = {
  joke: '#ffb547',
  question: '#ff5fa2',
  who: '#4cc9f0',
  undercover: '#9b6bff',
  guess: '#ffd23f',
};

// Someone opened a game: everyone sees it at the top of the screen for a moment, and joins in the app.
export const GameInvite = ({ invite }: { invite: GameInviteView | null }) =>
  invite ? (
    <div
      className="poll-banner game-invite"
      data-testid="game-invite"
      key={invite.gameId}
      style={{ ['--accent' as string]: COLORS[invite.kind] }}
    >
      <span className="game-invite-head">
        <Mascot persona={personaOf(invite.kind).id} mood="repos" pulse={0} look={0} effects={false} frame="head" still />
      </span>
      <span className="poll-banner-tag">🎮 Partie sur LiveChat</span>
      <strong className="poll-banner-question">{TITLES[invite.kind]}</strong>
      <span className="poll-banner-from">{invite.starterName} ouvre un salon · rejoins dans l’app, onglet Jeux</span>
    </div>
  ) : null;

// Your turn in Undercover or Devine Vite: at the top of the screen for a moment, even in game.
export const TurnNudge = ({ nudge }: { nudge: AppState['turnNudge'] }) =>
  nudge ? (
    <div
      className="poll-banner game-invite turn-banner"
      data-testid="turn-banner"
      key={nudge.gameId}
      style={{ ['--accent' as string]: COLORS[nudge.kind] }}
    >
      <span className="game-invite-head">
        <Mascot persona={personaOf(nudge.kind).id} mood="repos" pulse={0} look={0} effects={false} frame="head" still />
      </span>
      <span className="poll-banner-tag">🔔 C’est ton tour !</span>
      <strong className="poll-banner-question">{TITLES[nudge.kind]}</strong>
      <span className="poll-banner-from">Va dans l’app, onglet Jeux</span>
    </div>
  ) : null;
