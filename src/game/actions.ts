import { FORT, RULES, U } from './data';
import { doSend } from './combat';
import { farmLimit } from './economy';
import type { Rng } from './rng';
import { idlePct, logEv, zero } from './state';
import type { BattleReport, County, GameState, Kind, Mode, SendResult, Work } from './types';

/** Is this lord able to pay for `n` of unit `k`? */
export function canAfford(s: GameState, l: number, k: Kind, n: number): boolean {
  const st = s.lords[l]!.stock, u = U[k];
  return st.gold >= u.gold * n && st.wood >= u.wood * n && st.iron >= u.iron * n;
}

/** Muster `n` of unit `k` in a county. Each takes one person; at least 30 people must remain. */
export function recruit(s: GameState, c: County, k: Kind, n: number): boolean {
  if (!canAfford(s, c.owner, k, n) || c.pop - n < RULES.recruitMinPeopleLeft) return false;
  const st = s.lords[c.owner]!.stock, u = U[k];
  st.gold -= u.gold * n; st.wood -= u.wood * n; st.iron -= u.iron * n;
  c.pop -= n; c.g[k] += n; c.arr[k] += n;
  c.mus = c.mus || zero();
  c.mus[k] += n;
  return true;
}

/** Take back troops mustered in this county this season, for a full refund. */
export function unmuster(s: GameState, c: County, k: Kind, n: number): boolean {
  const m = c.mus ? c.mus[k] : 0;
  n = Math.min(n, m, c.g[k], c.arr[k]);
  if (n <= 0) return false;
  const st = s.lords[c.owner]!.stock, u = U[k];
  st.gold += u.gold * n; st.wood += u.wood * n; st.iron += u.iron * n;
  c.pop += n; c.g[k] -= n; c.arr[k] -= n; c.mus[k] -= n;
  return true;
}

/** Move a job slider by `dl` points (the UI uses steps of 5). Returns false when the move is not allowed. */
export function setWork(s: GameState, c: County, k: keyof Work, dl: number): boolean {
  const nx = c.work[k] + dl;
  if (nx < 0 || (dl > 0 && idlePct(c) < dl) || (dl > 0 && k === 'mine' && c.i === 0)) return false;
  if (k === 'farm' && dl > 0 && nx > farmLimit(c, s.turn % 4)) return false;
  c.work[k] = nx;
  if (k === 'farm') c.farmPref = nx;
  return true;
}

/** Raise the next fort level, paid by you. */
export function buildFort(s: GameState, c: County): boolean {
  const f = FORT[c.fort], st = s.lords[0]!.stock;
  if (!f) return false;
  if (st.wood < f.w || st.iron < f.i || st.gold < f.g) return false;
  st.wood -= f.w; st.iron -= f.i; st.gold -= f.g;
  c.fort++;
  logEv(s, `Walls raised at ${c.name}.`);
  return true;
}

export const setTax = (c: County, v: number): void => { c.tax = v; };
export const setRation = (c: County, v: number): void => { c.ration = v; };
export function setRationAll(s: GameState, v: number): void { for (const c of s.C) if (c.owner === 0) c.ration = v; }
export function setTaxAll(s: GameState, v: number): void { for (const c of s.C) if (c.owner === 0) c.tax = v; }

/** A player order. Only your own counties can send, and nothing moves once the game is over. */
export function playerSend(s: GameState, rng: Rng, fromId: number, toId: number, mode: Mode, pending?: BattleReport[]): SendResult | null {
  const from = s.C[fromId]!, to = s.C[toId]!;
  if (from.owner !== 0 || s.over) return null;
  return doSend(s, rng, from, to, mode, pending);
}
