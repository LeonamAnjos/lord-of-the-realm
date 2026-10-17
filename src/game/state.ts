import { DEF, NORMAL_RATION, NORMAL_TAX, OWN, SEASONS, START_YEAR, U, KINDS } from './data';
import type { County, GameState, Units } from './types';
import { index, type Rng } from './rng';

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const zero = (): Units => ({ spear: 0, archer: 0, knight: 0 });

export function defaultWork(i: number) {
  return { farm: 45, wood: 15, mine: i >= 0.6 ? 20 : i === 0 ? 0 : 5 };
}

/** A fresh game. Starting populations are the only random part; `seed` is recorded so the game can be replayed. */
export function newGame(rng: Rng, seed: number): GameState {
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
  return {
    v: 2, seed, turn: 0, lords, C, market: { grain: 1, wood: 1, iron: 1 }, over: null,
    log: [{ t: 0, k: '', txt: 'You hold Ashdown, Brackenmoor and Dunmere. Eleven more counties, three rival lords. Take them all and the crown is yours.' }],
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

export const lordName = (s: GameState, l: number): string => (l === 0 ? 'You' : s.lords[l]!.short);
export const stamp = (t: number): string => SEASONS[t % 4]!.slice(0, 3) + ' ' + (START_YEAR + Math.floor(t / 4));

export function logEv(s: GameState, txt: string, k = ''): void {
  s.log.push({ t: s.turn, k, txt });
  if (s.log.length > 80) s.log.shift();
}

export const pickOne = <T>(rng: Rng, a: T[]): T => a[index(rng, a.length)]!;
