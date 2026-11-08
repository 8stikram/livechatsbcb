import { useEffect, useRef, useState } from 'react';
import { POLL_MS } from '@livechatsbcb/protocol';
import type { PollView } from '../../../shared/ipc';

// How long the winner stays on screen once the poll ends.
const RESULT_MS = 7_000;
const CONFETTI = 36;
const COLORS = ['#f4f4f5', '#c99cff', '#a066e6', '#e7a6ff', '#d9d9df'];

// A few notes made here, so there is no file to ship. Only on this PC.
const playNotes = (notes: Array<[frequency: number, at: number]>, volume: number, length = 0.18): void => {
  if (volume <= 0) return;
  const audio = new AudioContext();
  for (const [frequency, at] of notes) {
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type = 'triangle';
    tone.frequency.value = frequency;
    const start = audio.currentTime + at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12 * volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    tone.connect(gain).connect(audio.destination);
    tone.start(start);
    tone.stop(start + length);
  }
  const last = Math.max(...notes.map(([, at]) => at)) + length;
  window.setTimeout(() => void audio.close(), (last + 0.2) * 1_000);
};

export const winnerOf = (poll: PollView): { label: string; votes: number } | null => {
  const best = Math.max(0, ...poll.counts);
  if (best === 0) return null;
  const winners = poll.options.filter((_, index) => poll.counts[index] === best);
  return { label: winners.length > 1 ? `Égalité : ${winners.join(' et ')}` : winners[0]!, votes: best };
};

const Confetti = () => (
  <div className="poll-confetti" aria-hidden="true">
    {Array.from({ length: CONFETTI }, (_, index) => (
      <i
        key={index}
        style={{
          left: `${(index * 97) % 100}%`,
          background: COLORS[index % COLORS.length],
          animationDelay: `${(index % 9) * 70}ms`,
          animationDuration: `${1_800 + ((index * 53) % 900)}ms`,
          ['--drift' as string]: `${((index * 37) % 80) - 40}px`,
          ['--spin' as string]: `${(index * 71) % 720}deg`,
        }}
      />
    ))}
  </div>
);

// Everyone sees a poll start at the top of their screen, even in game, and the winner when it ends.
export const PollOverlay = ({ poll, volume }: { poll: PollView | null; volume: number }) => {
  const [now, setNow] = useState(Date.now());
  // Only a poll seen running here is celebrated: one already over when this PC came in is not.
  const announced = useRef<string | null>(null);
  const celebrated = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [poll]);

  const running = poll !== null && !poll.done && now < poll.endsAt;

  useEffect(() => {
    if (!poll) return;
    if (!poll.done && announced.current !== poll.id) {
      announced.current = poll.id;
      playNotes([[660, 0], [880, 0.12]], volume, 0.14);
    }
    if (poll.done && announced.current === poll.id && celebrated.current?.id !== poll.id) {
      celebrated.current = { id: poll.id, at: Date.now() };
      setNow(Date.now());
      if (winnerOf(poll)) playNotes([[523, 0], [659, 0.12], [784, 0.24], [1047, 0.38]], volume, 0.3);
    }
  }, [poll, volume]);

  // Counted from when the end reached this PC, so a late message still gets its full time.
  const showingResult = poll !== null && poll.done && celebrated.current?.id === poll.id && now < celebrated.current.at + RESULT_MS;
  if (!poll || (!running && !showingResult)) return null;

  if (running) {
    const left = Math.max(0, poll.endsAt - now);
    return (
      <div className="poll-banner" data-testid="poll-banner" key={poll.id}>
        <span className="poll-banner-tag">Sondage sur LiveChat</span>
        <strong className="poll-banner-question">{poll.question}</strong>
        <span className="poll-banner-from">
          par {poll.starterName} · vote dans l’app · {Math.ceil(left / 1_000)} s
        </span>
        <span className="poll-banner-time" style={{ transform: `scaleX(${Math.min(1, left / POLL_MS)})` }} />
      </div>
    );
  }

  const winner = winnerOf(poll);
  return (
    <div className="poll-result" data-testid="poll-result" key={`${poll.id}-result`}>
      {winner && <Confetti />}
      <span className="poll-banner-tag">{poll.question}</span>
      <strong className="poll-result-winner">{winner ? winner.label : 'Personne n’a voté'}</strong>
      {winner && (
        <span className="poll-banner-from">
          {winner.votes} vote{winner.votes > 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
};
