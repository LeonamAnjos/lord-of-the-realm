// Differential check: play the legacy game and the TypeScript port with the same random numbers and the same
// player orders, and compare the whole game state after every action.
// Run: npx tsx scripts/diff-legacy.ts [games] [turns]
import { loadLegacy } from './legacy-harness';
import {
  createRng, newGame, endSeason, recruit, playerSend, atkOf, defence, movable, pick, counties, KINDS, NB, setTaxAll, parseSave,
  type GameState,
} from '../src/game';

const sortKeys = (v: any): any => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
const norm = (s: any) => {
  const o = JSON.parse(JSON.stringify(s));
  for (const k of ['sel', 'tab', 'help', 'confirm', 'split', 'seed', 'v']) delete o[k];
  for (const c of o.C) { c.pf = c.pf || 0; c.mus = c.mus ?? { spear: 0, archer: 0, knight: 0 }; }
  return sortKeys(o);
};

function compare(tag: string, legacy: any, port: GameState): void {
  const a = JSON.stringify(norm(legacy)), b = JSON.stringify(norm(port));
  if (a !== b) {
    const A = norm(legacy), B = norm(port);
    const walk = (x: any, y: any, path: string): void => {
      if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path + '.' + k); }
      else if (x !== y) console.log('  differs at', path, 'legacy =', x, 'port =', y);
    };
    walk(A, B, '');
    throw new Error('MISMATCH at ' + tag);
  }
}

const games = Number(process.argv[2] ?? 20), turns = Number(process.argv[3] ?? 80);
let checks = 0;
for (let g = 1; g <= games; g++) {
  // two generators from one seed, so both sides see exactly the same numbers
  const rngPort = createRng(g * 7919);
  const rngLeg = createRng(g * 7919);
  const legacy = loadLegacy(rngLeg);
  const port = newGame(rngPort, g * 7919);
  compare(`game ${g} start`, legacy.state, port);
  for (let t = 0; t < turns && !port.over; t++) {
    // a simple, repeatable player: tax by turn, recruit a few troops, attack when the odds look good, else reinforce
    const ctl = rngPort; // decisions come from port state only; they must not consume rng, so use a separate stream
    void ctl;
    const policy = createRng(g * 31 + t);
    if (t % 3 === 0) { setTaxAll(port, t % 6 === 0 ? 1 : 2); for (const c of legacy.state.C) if (c.owner === 0) c.tax = t % 6 === 0 ? 1 : 2; }
    for (const c of counties(port, 0)) {
      const k = KINDS[Math.floor(policy() * 3)]!;
      const n = 1 + Math.floor(policy() * 3);
      const okP = recruit(port, c, k, n), okL = legacy.recruit(legacy.state.C[c.id], k, n);
      if (okP !== okL) throw new Error(`recruit result differs g${g} t${t}`);
    }
    compare(`game ${g} turn ${t} after recruit`, legacy.state, port);
    for (const c of counties(port, 0)) {
      if (port.over) break; // the app refuses orders once the game is decided
      const m = movable(c);
      const foes = NB[c.id]!.map((i) => port.C[i]!).filter((n) => n.owner !== 0);
      let sent = false;
      for (const f of foes) {
        if (atkOf(pick(m, 'all')) > defence(f) * 1.3) {
          playerSend(port, rngPort, c.id, f.id, 'all');
          legacy.doSend(legacy.state.C[c.id], legacy.state.C[f.id], 'all');
          sent = true; break;
        }
      }
      if (!sent && foes.length === 0) {
        const mode = { spear: 40, archer: 100, knight: 60 };
        const to = NB[c.id]!.map((i) => port.C[i]!).find((n) => n.owner === 0);
        if (to && policy() < 0.5) {
          playerSend(port, rngPort, c.id, to.id, mode);
          legacy.doSend(legacy.state.C[c.id], legacy.state.C[to.id], mode);
        }
      }
    }
    compare(`game ${g} turn ${t} after orders`, legacy.state, port);
    legacy.endSeason();
    endSeason(port, rngPort);
    compare(`game ${g} turn ${t} after endSeason`, legacy.state, port);
    checks += 3;
  }
}
// legacy v1 save loads identically
const rnd = createRng(5);
const lg = loadLegacy(rnd);
for (let i = 0; i < 6; i++) lg.endSeason();
const saved = JSON.stringify(lg.state);
const lg2 = loadLegacy(createRng(99), saved);
const loaded = parseSave(saved)!;
compare('legacy save load', lg2.state, loaded.state);
console.log(`OK: ${games} games, ${checks} comparisons, legacy save load matches`);
