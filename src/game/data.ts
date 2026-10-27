import type { Kind } from './types';
import rules from './rules.json';

/** Every tunable number lives in rules.json; this file exposes it under the names the rest of the game uses. */
export const RULES = rules;

export const SEASONS = RULES.seasons.map((x) => x.name) as unknown as readonly ['Spring', 'Summer', 'Autumn', 'Winter'];
export const FARM_MULT = RULES.seasons.map((x) => x.farmMult);
export const WOOD_MULT = RULES.seasons.map((x) => x.woodMult);
export const SEASON_NOTE = RULES.seasons.map((x) => x.note);
export const GRAIN_SEASON = RULES.seasons.map((x) => x.grainPrice);
export const BASE = RULES.market.base;
export const KINDS: Kind[] = ['spear', 'archer', 'knight'];

export interface UnitDef { n: string; one: string; atk: number; def: number; gold: number; wood: number; iron: number; up: number; d: string }
const unit = (k: Kind): UnitDef => {
  const u = RULES.units[k];
  return { n: u.name, one: u.one, atk: u.atk, def: u.def, gold: u.gold, wood: u.wood, iron: u.iron, up: u.upkeep, d: u.blurb };
};
export const U: Record<Kind, UnitDef> = { spear: unit('spear'), archer: unit('archer'), knight: unit('knight') };

/** g = gold per person per season, m = mood change per season */
export const TAX = RULES.tax.levels.map((t) => ({ n: t.name, g: t.gold, m: t.mood }));
export const NORMAL_TAX = RULES.tax.normal;

export const RATION = RULES.rations.levels.map((r) => ({ n: r.name, a: r.grainEaten, m: r.mood }));
export const NORMAL_RATION = RULES.rations.normal;

export const FORT = RULES.forts.map((f) => ({ w: f.wood, i: f.iron, g: f.gold }));
export const FARM_LIMIT = RULES.seasons.map((x) => x.farmLimit);

/** name, soil, timber, ore */
export const DEF: [string, number, number, number][] = RULES.map.counties.map((c) => [c.name, c.soil, c.timber, c.ore]);
export const OWN: number[] = RULES.map.counties.map((c) => c.owner);
/** `owner` of a county that belongs to no lord. */
export const NEUTRAL = -1;
export const COLS = RULES.map.cols;
export const ROWS = RULES.map.rows;
export const NC = RULES.map.counties.length;

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

export const START_YEAR = RULES.map.startYear;
