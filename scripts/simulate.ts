// Headless balance simulation: plays many seeded games with a simple bot as the player and prints the outcome mix.
// Run: npm run simulate -- [--games 500] [--turns 200] [--seed 1] [--attack 1.5] [--reserve 60] [--garrison 40] [--sweep] [--rich] [--decide] [--unrest] [--level easy|normal|hard] [--json out.json]
//   --sweep   compare several bot settings side by side instead of one
// Every game is replayable: the same --seed gives the same results.
import { writeFileSync } from 'node:fs';
import { DEFAULT_BOT, playGame, type BotOptions, type GameResult, type Level, type NewGameOptions } from '../src/game';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const num = (name: string, d: number): number => { const v = flag(name); return v === undefined ? d : Number(v); };

const games = num('games', 500), maxTurns = num('turns', 200), firstSeed = num('seed', 1);
const base: BotOptions = { attackRatio: num('attack', DEFAULT_BOT.attackRatio), reserveGold: num('reserve', DEFAULT_BOT.reserveGold), garrisonCap: num('garrison', DEFAULT_BOT.garrisonCap) };

const gameOpts: NewGameOptions = { rich: args.includes('--rich'), decide: args.includes('--decide'), unrest: args.includes('--unrest'), level: (flag('level') ?? 'normal') as Level };

const median = (a: number[]): number => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]!; };
const mean = (a: number[]): number => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const pct = (n: number): string => (100 * n).toFixed(1) + '%';
const f1 = (n: number): string => (Number.isNaN(n) ? '-' : n.toFixed(1));

interface Summary {
  label: string; options: BotOptions; games: number;
  won: number; lost: number; timeout: number;
  turnsWon: { mean: number; median: number }; turnsLost: { mean: number; median: number };
  ownedAtEnd: number; lordsAliveAtEnd: number; playerGold: number; playerGrain: number;
  famineSeasons: number;
}

function run(label: string, options: BotOptions): Summary {
  const results: GameResult[] = [];
  for (let i = 0; i < games; i++) results.push(playGame(firstSeed + i, options, maxTurns, gameOpts));
  const by = (o: GameResult['over']) => results.filter((r) => r.over === o);
  const won = by('won'), lost = by('lost'), timeout = by(null);
  return {
    label, options, games,
    won: won.length / games, lost: lost.length / games, timeout: timeout.length / games,
    turnsWon: { mean: mean(won.map((r) => r.turns)), median: median(won.map((r) => r.turns)) },
    turnsLost: { mean: mean(lost.map((r) => r.turns)), median: median(lost.map((r) => r.turns)) },
    ownedAtEnd: mean(results.map((r) => r.owned)),
    lordsAliveAtEnd: mean(results.map((r) => r.state.lords.filter((l, i) => i > 0 && l.alive).length)),
    playerGold: mean(results.map((r) => r.state.lords[0]!.stock.gold)),
    playerGrain: mean(results.map((r) => r.state.lords[0]!.stock.grain)),
    famineSeasons: mean(results.map((r) => r.state.log.filter((l) => /Famine/.test(l.txt)).length)),
  };
}

const configs: [string, BotOptions][] = args.includes('--sweep')
  ? [
      ['cautious (attack at 2.0x)', { ...base, attackRatio: 2.0 }],
      ['default (attack at 1.5x)', { ...base, attackRatio: 1.5 }],
      ['bold (attack at 1.2x)', { ...base, attackRatio: 1.2 }],
      ['bold + big garrisons', { ...base, attackRatio: 1.2, garrisonCap: 80 }],
      ['bold + low reserve', { ...base, attackRatio: 1.2, reserveGold: 20 }],
    ]
  : [['bot', base]];

const t0 = Date.now();
const summaries = configs.map(([label, o]) => run(label, o));

console.log(`\n${games} games per setting, seeds ${firstSeed}..${firstSeed + games - 1}, up to ${maxTurns} turns (${(maxTurns / 4).toFixed(0)} years)\n`);
const rows = summaries.map((s) => [
  s.label, pct(s.won), pct(s.lost), pct(s.timeout), f1(s.turnsWon.median), f1(s.turnsLost.median), f1(s.ownedAtEnd), f1(s.lordsAliveAtEnd), f1(s.famineSeasons),
]);
const head = ['setting', 'win', 'loss', 'timeout', 'win turns (median)', 'loss turns (median)', 'counties at end', 'rivals alive', 'famines'];
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
const line = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ');
console.log(line(head));
console.log(widths.map((w) => '-'.repeat(w)).join('  '));
for (const r of rows) console.log(line(r));
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)  A turn is one season. The bot is a deliberately simple player, so read these as relative numbers when you tune.`);

const out = flag('json');
if (out) { writeFileSync(out, JSON.stringify(summaries, null, 2)); console.log('wrote ' + out); }
