// npm run sim -w @livechatsbcb/melody -- [seasons] [seed]
import { CFG } from './config.ts';
import { simulate } from './sim.ts';

const seasons = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 1);
const started = performance.now();
const { snapshots, world } = simulate(seed, seasons * CFG.ticksPerSeason, undefined, 14);
const elapsed = Math.round(performance.now() - started);

const money = (value: number): string => `${Math.round(value).toLocaleString('fr-FR')} €`;
const count = (value: number): string => Math.round(value).toLocaleString('fr-FR');

let lastTick = -1;
for (const s of snapshots) {
  if (s.tick !== lastTick) {
    console.log(`\n— Semaine ${s.tick} (saison ${Math.ceil(s.tick / CFG.ticksPerSeason)}) —`);
    lastTick = s.tick;
  }
  console.log(
    [
      s.name.padEnd(12),
      CFG.tiers.names[s.tier - 1]?.padEnd(18),
      `cash ${money(s.cash)}`.padEnd(22),
      `dette ${money(s.debt)}`.padEnd(18),
      `fans ${count(s.fans)}`.padEnd(20),
      `rép ${s.reputation}`.padEnd(10),
      `${s.artists} art.`,
      `${s.songs} sons`,
      `meilleure note ${s.bestQuality}`,
      `meilleure place ${s.bestPeak ?? '—'}`,
      `score ${s.score}`,
      s.bankrupt ? 'FAILLITE' : '',
    ].join('  '),
  );
}
console.log(`\nN°1 global : ${world.charts.global[0]?.artistName ?? '—'} (${count(world.charts.global[0]?.streams ?? 0)} streams)`);
console.log(`${seasons} saison(s) simulée(s) en ${elapsed} ms, graine ${seed}.`);
