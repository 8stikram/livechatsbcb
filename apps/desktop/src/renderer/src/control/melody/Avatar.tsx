// An artist's avatar: a black silhouette in front of a coloured sun. No face is drawn. The look (hair, hat,
// glasses, beard, guitar, band) comes from the rules package, so it is the same for everybody on the server.
import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { lookOf, type Hair, type Hat, type Look } from '@livechatsbcb/melody';

export const hueOf = (id: string): number => {
  // Mixed well, so two ids that differ by one letter get two different colours.
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 15), 2246822519);
  hash ^= hash >>> 13;
  return (hash >>> 0) % 360;
};

/** Genres of the artists on screen, by id: a youth drawn without his genre still gets the same look. */
export const AvatarGenres = createContext<Map<string, string>>(new Map());

export type AvatarMood = 'angry' | 'tired';

/** What the avatar shows of an artist of the label: angry when the morale is low, tired when the energy is. */
export const moodOf = (artist: { morale: number; energy: number }): AvatarMood | null =>
  artist.morale < 35 ? 'angry' : artist.energy < 25 ? 'tired' : null;

const INK = '#0b0a10';
const LIGHT = '#fff';

// Hanging strands: x, y, height.
const strands = (list: Array<[number, number, number]>, width: number): ReactNode =>
  list.map(([x, y, h]) => <rect key={`${x}:${y}`} x={x} y={y} width={width} height={h} rx={width / 2} />);

const CROWN = <path d="M19 23Q18 8 32 8Q46 8 45 23Z" />;
const SHORT = <path d="M20 26Q19 11 32 11Q45 11 44 26Q38 18 32 18Q26 18 20 26Z" />;
const PUFFS = (
  <>
    <circle cx="18.5" cy="28" r="6" />
    <circle cx="45.5" cy="28" r="6" />
  </>
);
const TAIL = <path d="M40 12Q54 12 52 32Q51 40 47 43Q49 30 45 22Q43 18 39 17Z" />;

const HAIR: Record<Hair, ReactNode> = {
  none: null,
  short: SHORT,
  afro: <circle cx="32" cy="20" r="16" />,
  curly: (
    <>
      <circle cx="22" cy="19" r="8" />
      <circle cx="32" cy="14.5" r="9" />
      <circle cx="42" cy="19" r="8" />
      <circle cx="18.5" cy="28" r="6" />
      <circle cx="45.5" cy="28" r="6" />
    </>
  ),
  locks: (
    <>
      {CROWN}
      {strands([[12.5, 22, 27], [16.5, 16, 34], [44.3, 16, 34], [48.3, 22, 27]], 3.2)}
    </>
  ),
  twists: (
    <>
      {SHORT}
      <circle cx="21" cy="19.5" r="3.1" />
      <circle cx="23.5" cy="14.5" r="3.3" />
      <circle cx="27.5" cy="11" r="3.4" />
      <circle cx="32" cy="9.8" r="3.5" />
      <circle cx="36.5" cy="11" r="3.4" />
      <circle cx="40.5" cy="14.5" r="3.3" />
      <circle cx="43" cy="19.5" r="3.1" />
    </>
  ),
  long: <path d="M19 28Q17 8 32 8Q47 8 45 28L51 57H13Z" />,
  braids: (
    <>
      {CROWN}
      {strands([[11.6, 25, 25], [14.8, 20, 32], [18, 16, 38], [43.8, 16, 38], [47, 20, 32], [50.2, 25, 25]], 2.2)}
    </>
  ),
  bun: (
    <>
      {SHORT}
      <circle cx="32" cy="7.5" r="5.5" />
    </>
  ),
  ponytail: (
    <>
      {SHORT}
      <circle cx="37" cy="10" r="4.5" />
      {TAIL}
    </>
  ),
  bob: <path d="M18 41Q14 8 32 8Q50 8 46 41Z" />,
  mohawk: <path d="M27 18L28 4L31 9L33 2L35 9L37 5L37 18Z" />,
  spiky: <path d="M19 24L17 12L23 15L24 6L29 12L32 3L35 12L40 6L41 15L47 12L45 24Z" />,
  wig: (
    <>
      {CROWN}
      <circle cx="19" cy="24" r="5" />
      <circle cx="18" cy="32.5" r="5" />
      <circle cx="19" cy="41" r="5" />
      <circle cx="45" cy="24" r="5" />
      <circle cx="46" cy="32.5" r="5" />
      <circle cx="45" cy="41" r="5" />
    </>
  ),
  twintails: (
    <>
      {SHORT}
      <circle cx="19.5" cy="17" r="3.2" />
      <circle cx="44.5" cy="17" r="3.2" />
      <path d="M19 16Q5 18 8 44Q10 52 14 55Q13 40 20 26Z" />
      <path d="M45 16Q59 18 56 44Q54 52 50 55Q51 40 44 26Z" />
    </>
  ),
};

// Under a hat that covers the top of the head, big hair only shows on the sides.
const COVERING: Hat[] = ['cap', 'capback', 'beanie', 'durag', 'bucket', 'cowboy', 'fedora'];
const UNDER_HAT: Partial<Record<Hair, ReactNode>> = {
  afro: PUFFS,
  curly: PUFFS,
  twists: SHORT,
  bun: SHORT,
  mohawk: null,
  spiky: SHORT,
  ponytail: TAIL,
  wig: PUFFS,
};
// These hide the whole head.
const FULL: Hat[] = ['helmet', 'cagoule', 'hood'];

const DOME = <path d="M19 23Q19 9 32 9Q45 9 45 23Z" />;

const HAT: Record<Hat, ReactNode> = {
  cap: (
    <>
      {DOME}
      <path d="M44 19L58 22V25L44 23Z" />
    </>
  ),
  capback: (
    <>
      {DOME}
      <path d="M20 19L7 23V25.5L20 23Z" />
    </>
  ),
  beanie: <path d="M19 24Q19 5 32 5Q45 5 45 24Z" />,
  durag: (
    <>
      <path d="M20 24Q20 11 32 11Q44 11 44 24Z" />
      <path d="M41 19Q53 25 51 45L46.5 45Q48 30 39 24Z" />
    </>
  ),
  bucket: <path d="M22 20Q22 8 32 8Q42 8 42 20L51 27H13Z" />,
  hood: <path d="M12 54Q8 4 32 3Q56 4 52 54Z" />,
  cowboy: (
    <>
      <path d="M23 20Q21 5 32 9Q43 5 41 20Z" />
      <path d="M5 17Q32 29 59 17L57 21.5Q32 31 7 21.5Z" />
    </>
  ),
  fedora: (
    <>
      <path d="M22 20L24 8Q32 5 40 8L42 20Z" />
      <ellipse cx="32" cy="20" rx="17" ry="3.2" />
    </>
  ),
  helmet: <rect x="18" y="8" width="28" height="37" rx="12" />,
  bandana: (
    <>
      <path d="M20 16.5H44V23H20Z" />
      <path d="M43 18L53 14L50.5 20L54 25L43 22Z" />
    </>
  ),
  headphones: (
    <>
      <path d="M17 30Q15 5 32 5Q49 5 47 30L43.5 30Q45 9 32 9Q19 9 20.5 30Z" />
      <rect x="14.5" y="23" width="6.5" height="13" rx="2.6" />
      <rect x="43" y="23" width="6.5" height="13" rx="2.6" />
    </>
  ),
  cagoule: <path d="M18 47Q16 9 32 9Q48 9 46 47Z" />,
  mask: null,
};

// The parts drawn in light over the silhouette.
const hatLight = (hat: Hat | null, shade: string): ReactNode => {
  if (hat === 'helmet') return <rect x="22" y="21" width="20" height="10" rx="4.5" fill={LIGHT} opacity="0.9" />;
  if (hat === 'cagoule') return <rect x="24" y="24.5" width="16" height="5" rx="2.5" fill={LIGHT} opacity="0.9" />;
  if (hat === 'hood') return <ellipse cx="32" cy="30" rx="9" ry="12.5" fill={shade} />;
  if (hat === 'headphones')
    return (
      <g fill={LIGHT} opacity="0.9">
        <rect x="15.7" y="26.5" width="1.6" height="6" rx="0.8" />
        <rect x="46.7" y="26.5" width="1.6" height="6" rx="0.8" />
      </g>
    );
  if (hat === 'mask')
    return (
      <>
        <path d="M23.5 20H40.5V33Q32 42 23.5 33Z" fill={LIGHT} opacity="0.9" />
        <rect x="26" y="25" width="4.5" height="2.6" rx="1" fill={INK} />
        <rect x="33.5" y="25" width="4.5" height="2.6" rx="1" fill={INK} />
      </>
    );
  return null;
};

const Figure = ({ look, hue }: { look: Look; hue: number }) => {
  const shade = `hsl(${hue} 45% 15%)`;
  const full = look.hat !== null && FULL.includes(look.hat);
  const covered = look.hat !== null && COVERING.includes(look.hat);
  const hair = full ? null : covered && look.hair in UNDER_HAT ? UNDER_HAT[look.hair] : HAIR[look.hair];
  return (
    <>
      <circle cx="32" cy="28" r="23" fill={`hsl(${(hue + 40) % 360} 90% 68%)`} />
      {look.group && (
        <g fill={shade}>
          <ellipse cx="13" cy="35" rx="7.5" ry="10" />
          <path d="M-2 64Q-1 51 9 49L17 49Q27 51 28 64Z" />
          <ellipse cx="51" cy="35" rx="7.5" ry="10" />
          <path d="M36 64Q37 51 47 49L55 49Q65 51 66 64Z" />
        </g>
      )}
      <g fill={INK}>
        {look.guitar && (
          <>
            <path d="M46.5 53L57 17L60.2 18L50 54Z" />
            <path d="M55.5 10.5L63 12.8L61 20L54.5 18Z" />
          </>
        )}
        {hair}
        {look.wide ? <path d="M3 64Q4 47 24 45L40 45Q60 47 61 64Z" /> : <path d="M8 64Q9 49 25 46L39 46Q55 49 56 64Z" />}
        <rect x={look.wide ? 26 : 27} y="38" width={look.wide ? 12 : 10} height="10" />
        <ellipse cx="32" cy="28" rx={look.wide ? 12 : 10.5} ry="14" />
        {look.beard && <path d="M21.5 31Q20.5 48.5 32 49.5Q43.5 48.5 42.5 31Z" />}
        {look.hat && HAT[look.hat]}
      </g>
      {hatLight(look.hat, shade)}
      {look.face === 'shades' && <path d="M24 27H31M33 27H40" fill="none" stroke={LIGHT} strokeWidth="2.6" strokeLinecap="round" />}
      {look.face === 'glasses' && (
        <g fill="none" stroke={LIGHT} strokeWidth="1.3">
          <circle cx="27.3" cy="27.5" r="3.3" />
          <circle cx="36.7" cy="27.5" r="3.3" />
          <path d="M30.6 27.5H33.4" />
        </g>
      )}
      {look.chain && <path d="M25 49Q32 60 39 49" fill="none" stroke={LIGHT} strokeWidth="1.5" strokeLinecap="round" />}
    </>
  );
};

const MOOD: Record<AvatarMood, ReactNode> = {
  // The cross of anger, like in a comic.
  angry: <path d="M50 5V9.5H45.5M54.5 5V9.5H59M50 19V14.5H45.5M54.5 19V14.5H59" fill="none" stroke="#ff2d45" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />,
  // Two Z of sleep.
  tired: <path d="M45 11H52L45 19H52M54.5 3.5H59.5L54.5 9H59.5" fill="none" stroke={LIGHT} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />,
};
const MOOD_NAME: Record<AvatarMood, string> = { angry: 'Énervé', tired: 'Fatigué' };

export const Avatar = ({ id, genre, className = '', mood = null }: { id: string; genre?: string; className?: string; mood?: AvatarMood | null }) => {
  const hue = hueOf(id);
  const genres = useContext(AvatarGenres);
  return (
    <span className={`mt-art mt-av${className ? ` ${className}` : ''}`} style={{ '--hue': hue } as CSSProperties} title={mood ? MOOD_NAME[mood] : undefined} aria-hidden={mood ? undefined : true}>
      <svg viewBox="0 0 64 64" preserveAspectRatio="xMidYMid meet" role={mood ? 'img' : undefined} aria-label={mood ? MOOD_NAME[mood] : undefined}>
        <Figure look={lookOf(id, genre ?? genres.get(id))} hue={hue} />
        {mood && MOOD[mood]}
      </svg>
    </span>
  );
};
