const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_HOUR_PARIS = 6;

// The next time it is 06:00 in Paris, whatever the season's clock change.
export const nextParisTick = (now: number): number => {
  const hourInParis = (at: number): number =>
    Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new Date(at)));
  const startOfHour = now - (now % 3_600_000);
  for (let step = 1; step <= 49; step += 1) {
    const at = startOfHour + step * 3_600_000;
    if (hourInParis(at) === TICK_HOUR_PARIS) return at;
  }
  return now + DAY_MS;
};
