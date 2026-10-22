import { DEF, NEUTRAL, NORMAL_RATION, NORMAL_TAX, OWN, SEASONS, START_YEAR, U, KINDS } from './data';
import type { County, GameState, Units } from './types';
import { index, type Rng } from './rng';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const zero = (): Units => ({ spear: 0, archer: 0, knight: 0 });

export function defaultWork(i: number) {
  return { farm: 45, wood: 15, mine: i >= 0.6 ? 20 : i === 0 ? 0 : 5 };
}

export interface NewGameOptions {
  /** how many rival counties start with no lord (0 to 6); they hold a small militia and anyone can take them */
  unclaimed?: number;
  /** every lord, you included, starts with one county in a random place; the other eight have no lord */
  oneEach?: boolean;
}

/** Militia that defends a county with no lord. */
const MILITIA = (): Units => ({ spear: 4, archer: 0, knight: 0 });

/**
 * A fresh game. Starting populations are the only random part (plus the choice of unclaimed counties, which
 * draws from `rng` only when asked for); `seed` is recorded so the game can be replayed.
 * Unclaimed counties are never yours, and every rival keeps at least one county.
 */
export function newGame(rng: Rng, seed: number, opts: NewGameOptions = {}): GameState {
  const stock = () => ({ gold: 150, grain: 210, wood: 40, iron: 12 });
  const lords = [
    { name: 'House Thorne', short: 'You', tax: 2, alive: true, stock: stock() },
    { name: 'Baron Hugh Marlow', short: 'Baron Hugh', tax: 2, alive: true, stock: stock() },
    { name: 'Lady Isolde Vance', short: 'Lady Isolde', tax: 2, alive: true, stock: stock() },
    { name: 'Earl Godfrey Ashby', short: 'Earl Godfrey', tax: 2, alive: true, stock: stock() },
  ];
  const C: County[] = DEF.map((d, i) => ({
    id: i, name: d[0], f: d[1], w: d[2], i: d[3], owner: OWN[i]!,
    pop: Math.round(88 + rng() * 24), mood: 65,
    work: defaultWork(d[3]), g: { spear: 6, archer: 2, knight: 0 }, arr: zero(), mus: zero(),
    fort: 0, tax: NORMAL_TAX, ration: NORMAL_RATION, farmPref: 45, pf: 0,
  }));
  let free = 0;
  const want = clamp(Math.floor(opts.unclaimed ?? 0), 0, 6);
  if (opts.oneEach) {
    const order = C.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = index(rng, i + 1);
      const t = order[i]!; order[i] = order[j]!; order[j] = t;
    }
    order.forEach((c, n) => {
      if (n < 4) c.owner = n;
      else { c.owner = NEUTRAL; c.g = MILITIA(); free++; }
    });
  } else if (want > 0) {
    const left = [0, 0, 0, 0];
    for (const c of C) left[c.owner]!++;
    const order = C.filter((c) => c.owner !== 0);
    for (let i = order.length - 1; i > 0; i--) {
      const j = index(rng, i + 1);
      const t = order[i]!; order[i] = order[j]!; order[j] = t;
    }
    for (const c of order) {
      if (free >= want) break;
      if (left[c.owner]! <= 1) continue;
      left[c.owner]!--; free++;
      c.owner = NEUTRAL; c.g = MILITIA();
    }
  }
  const home = C.find((c) => c.owner === 0)!.name;
  const intro = opts.oneEach
    ? `You hold only ${home}. Three rival lords each hold one county too, and ${free} more have no lord. Claim them and take the crown.`
    : free
    ? `You hold Ashdown, Brackenmoor and Dunmere. ${free} counties have no lord and anyone may claim them; ${11 - free} more belong to three rival lords. Take them all and the crown is yours.`
    : 'You hold Ashdown, Brackenmoor and Dunmere. Eleven more counties, three rival lords. Take them all and the crown is yours.';
  return {
    v: 2, seed, turn: 0, lords, C, market: { grain: 1, wood: 1, iron: 1 }, over: null,
    log: [{ t: 0, k: '', txt: intro }],
  };
}

export const season = (s: GameState): number => s.turn % 4;
export const year = (s: GameState): number => START_YEAR + Math.floor(s.turn / 4);
export const counties = (s: GameState, owner: number): County[] => s.C.filter((c) => c.owner === owner);
export const total = (g: Units): number => g.spear + g.archer + g.knight;
export const troops = (c: County): number => total(c.g);
export const atkOf = (g: Units): number => g.spear * U.spear.atk + g.archer * U.archer.atk + g.knight * U.knight.atk;
export const defOf = (g: Units): number => g.spear * U.spear.def + g.archer * U.archer.def + g.knight * U.knight.def;
export const fortMult = (c: County): number => 1.15 + 0.2 * c.fort;
export const defence = (c: County): number => (defOf(c.g) + c.pop / 10) * fortMult(c);
export const capOf = (c: County): number => 100 + 70 * c.f;
export const movable = (c: County): Units => {
  const m = zero();
  for (const k of KINDS) m[k] = Math.max(0, c.g[k] - c.arr[k]);
  return m;
};
export const idlePct = (c: County): number => 100 - c.work.farm - c.work.wood - c.work.mine;
export const upkeep = (c: County): number => KINDS.reduce((a, k) => a + U[k].up * c.g[k], 0);

export const lordName = (s: GameState, l: number): string => (l === NEUTRAL ? 'No lord' : l === 0 ? 'You' : s.lords[l]!.short);
export const stamp = (t: number): string => SEASONS[t % 4]!.slice(0, 3) + ' ' + (START_YEAR + Math.floor(t / 4));

export function logEv(s: GameState, txt: string, k = ''): void {
  s.log.push({ t: s.turn, k, txt });
  if (s.log.length > 80) s.log.shift();
}

export const pickOne = <T>(rng: Rng, a: T[]): T => a[index(rng, a.length)]!;
