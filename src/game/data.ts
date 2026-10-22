import type { Kind } from './types';

export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;
export const FARM_MULT = [0.8, 1.1, 2.2, 0];
export const WOOD_MULT = [1, 1, 1, 0.6];
export const SEASON_NOTE = ['Sowing: farms yield little', 'Farms yield well', 'Harvest: farms yield double', 'Winter: farms yield nothing'];
export const GRAIN_SEASON = [1, 0.9, 0.6, 1.5];
export const BASE = { grain: 2, wood: 3, iron: 7 };
export const KINDS: Kind[] = ['spear', 'archer', 'knight'];

export interface UnitDef { n: string; one: string; atk: number; def: number; gold: number; wood: number; iron: number; up: number; d: string }
export const U: Record<Kind, UnitDef> = {
  spear: { n: 'Spearmen', one: 'spearman', atk: 1, def: 3, gold: 6, wood: 1, iron: 0, up: 0.2, d: 'Cheap, hold the line' },
  archer: { n: 'Archers', one: 'archer', atk: 4, def: 1, gold: 8, wood: 2, iron: 0, up: 0.3, d: 'Cheap strikers, weak when pressed' },
  knight: { n: 'Knights', one: 'knight', atk: 9, def: 6, gold: 24, wood: 0, iron: 3, up: 0.8, d: 'Decisive, but they need iron' },
};

/** g = gold per person per season, m = mood change per season */
export const TAX = [
  { n: 'None', g: 0, m: 5 },
  { n: 'Low', g: 0.2, m: 1 },
  { n: 'Normal', g: 0.4, m: -3 },
  { n: 'High', g: 0.7, m: -9 },
];
export const NORMAL_TAX = 2;

export const RATION = [
  { n: 'Scant', a: 0.3, m: -8 },
  { n: 'Normal', a: 0.5, m: 0 },
  { n: 'Generous', a: 0.7, m: 6 },
];
export const NORMAL_RATION = 1;

export const FORT = [
  { w: 12, i: 4, g: 40 },
  { w: 20, i: 8, g: 70 },
  { w: 30, i: 12, g: 100 },
];
export const FARM_LIMIT = [70, 60, 80, 0];

/** name, soil, timber, ore */
export const DEF: [string, number, number, number][] = [
  ['Greywater', 0.9, 0.8, 0.4], ['Harrowdale', 1.1, 0.7, 0.2], ['Larkholt', 1.2, 0.8, 0], ['Eastholme', 1, 1.1, 0.3],
  ['Ashdown', 1.1, 1, 0.8], ['Ironby', 0.7, 0.7, 1.4], ['Caldbeck', 1, 0.9, 0.6], ['Fenwick', 1.3, 0.6, 0],
  ['Brackenmoor', 1, 1.2, 0.3], ['Dunmere', 1.2, 0.8, 0.4], ['Kestrelmoor', 0.8, 1, 0.9], ['Marrowmere', 1.1, 0.9, 0.5],
];
export const OWN = [1, 1, 2, 2, 0, 1, 3, 2, 0, 0, 3, 3];
/** `owner` of a county that belongs to no lord. */
export const NEUTRAL = -1;
export const COLS = 4;
export const ROWS = 3;
export const NC = 12;

/** Neighbours on a pointy-top hex grid, odd rows shifted right. */
export const NB: number[][] = (() => {
  const out: number[][] = [];
  for (let i = 0; i < NC; i++) {
    const r = Math.floor(i / COLS), c = i % COLS, odd = r % 2 === 1;
    const d = odd
      ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
      : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    const list: number[] = [];
    for (const [dr, dc] of d) {
      const nr = r + dr!, nc = c + dc!;
      if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) list.push(nr * COLS + nc);
    }
    out.push(list);
  }
  return out;
})();

export const START_YEAR = 1100;
