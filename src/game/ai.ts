import { NB, U } from './data';
import { recruit } from './actions';
import { doSend, pick } from './combat';
import { eat, farmLimit } from './economy';
import { index, type Rng } from './rng';
import { atkOf, counties, defence, movable, season, total } from './state';
import type { BattleReport, County, GameState, Kind } from './types';

export function shuffle<T>(rng: Rng, a: T[]): T[] {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

export const enemyNb = (s: GameState, c: County): County[] => NB[c.id]!.map((i) => s.C[i]!).filter((n) => n.owner !== c.owner);

/** First step on the shortest path (through own counties) to a county that touches a foe. */
export function frontierStep(s: GameState, c: County, l: number): number | null {
  const seen = new Set<number>([c.id]);
  const q: [number, number | null][] = [[c.id, null]];
  while (q.length) {
    const it = q.shift()!;
    for (const n of NB[it[0]]!) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (s.C[n]!.owner !== l) continue;
      const f = it[1] === null ? n : it[1];
      if (NB[n]!.some((z) => s.C[z]!.owner !== l)) return f;
      q.push([n, f]);
    }
  }
  return null;
}

function aiRecruit(s: GameState, rng: Rng, l: number): void {
  const L = s.lords[l]!, cs = counties(s, l);
  const front = cs.filter((c) => enemyNb(s, c).length > 0);
  const pool = front.length ? front : cs;
  let budget = L.stock.gold - 35, guard = 0;
  while (budget >= 6 && guard++ < 40) {
    const c = pool[index(rng, pool.length)]!;
    if (c.pop < 45) continue;
    const r = rng();
    const order: Kind[] = r < 0.4 ? ['knight', 'archer', 'spear'] : r < 0.7 ? ['archer', 'spear', 'knight'] : ['spear', 'archer', 'knight'];
    let done = false;
    for (const k of order) {
      if (U[k].gold <= budget && recruit(s, c, k, 1)) { budget -= U[k].gold; done = true; break; }
    }
    if (!done) break;
  }
}

function aiMove(s: GameState, rng: Rng, l: number, pending?: BattleReport[]): void {
  for (const c of shuffle(rng, counties(s, l))) {
    if (c.owner !== l) continue;
    const m = movable(c);
    if (!total(m)) continue;
    const foes = enemyNb(s, c);
    if (foes.length) {
      if (s.turn < 4 || rng() < 0.2) continue;
      const need = 1.55 + rng() * 0.35;
      let best: County | null = null, mode: 'strike' | 'all' | null = null, bs = 0;
      for (const n of foes) {
        const D = defence(n);
        const s1 = atkOf(pick(m, 'strike')) / D, s2 = atkOf(pick(m, 'all')) / D;
        if (s1 > need && s1 > bs) { bs = s1; best = n; mode = 'strike'; }
        else if (s2 > need && s2 > bs) { bs = s2; best = n; mode = 'all'; }
      }
      if (best && mode) doSend(s, rng, c, best, mode, pending);
    } else {
      const step = frontierStep(s, c, l);
      if (step !== null) doSend(s, rng, c, s.C[step]!, 'all', pending);
    }
  }
}

/** One rival lord's turn: set jobs and tax, maybe buy grain, recruit, then move. */
export function aiTurn(s: GameState, rng: Rng, l: number, pending?: BattleReport[]): void {
  const L = s.lords[l]!, cs = counties(s, l);
  if (!cs.length) return;
  const need = cs.reduce((a, c) => a + eat(c), 0);
  const secure = L.stock.grain / Math.max(1, need);
  const se = season(s);
  for (const c of cs) {
    c.work.farm = Math.min(secure < 1.6 ? 55 : secure > 3.2 ? 35 : 45, farmLimit(c, se));
    c.work.wood = 18;
    c.work.mine = c.i >= 0.6 ? 25 : c.i >= 0.3 ? 8 : 0;
  }
  for (const c of cs) c.tax = c.mood < 25 ? 0 : c.mood < 42 ? 1 : c.mood > 75 ? 3 : 2;
  if (secure < 1.2 && L.stock.gold > 30) {
    const buy = Math.min(Math.floor((L.stock.gold * 0.5) / 3), Math.ceil(need * 1.5 - L.stock.grain));
    if (buy > 0) { L.stock.gold -= buy * 3; L.stock.grain += buy; }
  }
  aiRecruit(s, rng, l);
  aiMove(s, rng, l, pending);
}

