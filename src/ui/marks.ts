import { NB, atkMult, atkOf, estDef, movable, type GameState } from '../game';
import { countyFlags } from './attention';
import { oddsCls } from './format';
import { inView, type Ui } from './store';

/** What the map draws on top of owners' colours, shared by the SVG map and the 3D board. */
export interface Marks {
  /** the county under the pointer in the list */
  hover: number | null;
  /** your counties the list's filter leaves out */
  dim: ReadonlySet<number>;
  /** your counties with a red warning on their card */
  warn: ReadonlySet<number>;
  /** neighbours the selected county could march on, with how its whole free army compares with the scouts' estimate */
  odds: ReadonlyMap<number, string>;
}

export function mapMarks(s: GameState, ui: Ui): Marks {
  const dim = new Set<number>(), warn = new Set<number>(), odds = new Map<number, string>();
  const filtering = ui.tab === 'county' && (ui.view === 'warn' || ui.view === 'border');
  for (const c of s.C) {
    if (c.owner !== 0) continue;
    if (filtering && !inView(s, ui.view, c.id)) dim.add(c.id);
    if (countyFlags(s, c).some((f) => f.tone === 'bad')) warn.add(c.id);
  }
  const sel = s.C[ui.sel];
  if (sel && sel.owner === 0) {
    const a = atkOf(movable(sel)) * atkMult(s);
    for (const n of NB[sel.id]!) if (s.C[n]!.owner !== 0) odds.set(n, a > 0 ? oddsCls(a, estDef(s, s.C[n]!)) : '');
  }
  return { hover: ui.tab === 'county' ? ui.hover : null, dim, warn, odds };
}
