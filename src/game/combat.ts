import { KINDS, NB, NC, NEUTRAL, NORMAL_RATION, NORMAL_TAX, U } from './data';
import { applyFarmLimit } from './economy';
import { range, type Rng } from './rng';
import { atkOf, clamp, counties, defaultWork, defence, logEv, lordName, movable, total, troops, zero } from './state';
import type { BattleReport, County, GameState, Mode, SendResult, Units } from './types';

/** Take `p[k]` percent of each troop type from `m`, rounded up (never more than `m[k]`). */
export function splitUnits(m: Units, p: Units): Units {
  const r = zero();
  for (const k of KINDS) r[k] = Math.min(m[k], Math.ceil((m[k] * (p[k] || 0)) / 100));
  return r;
}

/** Which troops an order sends: All, Half, Strike (archers and knights) or a Split. */
export function pick(m: Units, mode: Mode): Units {
  const r = zero();
  if (mode && typeof mode === 'object') return splitUnits(m, mode);
  if (mode === 'all') for (const k of KINDS) r[k] = m[k];
  else if (mode === 'half') for (const k of KINDS) r[k] = Math.ceil(m[k] / 2);
  else { r.archer = m.archer; r.knight = m.knight; }
  return r;
}

function applyLoss(g: Units, cf: number, lost: Units): Units {
  const rem = zero();
  for (const k of KINDS) {
    const l = Math.round(g[k] * cf);
    lost[k] = l;
    rem[k] = g[k] - l;
  }
  return rem;
}

/** Resolve an attack of troops `m` from `from` against `to`. Mutates both counties. */
export function battle(s: GameState, rng: Rng, from: County, to: County, m: Units): BattleReport {
  const atk = atkOf(m) * range(rng, 0.9, 1.1);
  const def = defence(to) * range(rng, 0.9, 1.1);
  const rep: BattleReport = {
    from: from.name, to: to.name, att: from.owner, dfn: to.owner,
    atk: Math.round(atk), def: Math.round(def), won: atk > def,
    sent: m, lostA: zero(), lostD: zero(), turn: s.turn,
  };
  if (atk > def) {
    const surv = applyLoss(m, clamp((0.8 * def) / atk, 0.1, 0.8), rep.lostA);
    if (total(surv) === 0) {
      const big = KINDS.slice().sort((a, b) => m[b] - m[a])[0]!;
      surv[big] = 1;
      rep.lostA[big] = Math.max(0, rep.lostA[big] - 1);
    }
    for (const k of KINDS) rep.lostD[k] = to.g[k];
    to.mus = zero(); to.tax = NORMAL_TAX; to.ration = NORMAL_RATION; to.owner = from.owner;
    to.g = surv; to.arr = { spear: surv.spear, archer: surv.archer, knight: surv.knight };
    to.pop = Math.max(30, Math.round(to.pop * 0.85)); to.mood = 25; to.fort = Math.max(0, to.fort - 1);
    to.work = defaultWork(to.i);
    to.farmPref = 45;
    applyFarmLimit(s, to);
  } else {
    to.g = applyLoss(to.g, clamp((0.8 * atk) / def, 0.1, 0.8), rep.lostD);
    for (const k of KINDS) {
      const back = Math.floor(m[k] * 0.1);
      from.g[k] += back; from.arr[k] += back;
      rep.lostA[k] = m[k] - back;
    }
  }
  return rep;
}

export function battleLog(s: GameState, rep: BattleReport): string {
  const a = lordName(s, rep.att), d = lordName(s, rep.dfn);
  if (rep.dfn === NEUTRAL) {
    if (rep.att === 0) return rep.won ? `You claimed ${rep.to}, which had no lord.` : `Your attack on ${rep.to} failed.`;
    return rep.won ? `${a} claimed ${rep.to}, which had no lord.` : `${rep.to} held out against ${a}.`;
  }
  if (rep.att === 0) return rep.won ? `You took ${rep.to} from ${d}.` : `Your attack on ${rep.to} failed.`;
  if (rep.dfn === 0) return rep.won ? `${a} took ${rep.to} from you.` : `You held ${rep.to} against ${a}.`;
  return rep.won ? `${a} took ${rep.to} from ${d}.` : `${d} held ${rep.to} against ${a}.`;
}

/** Retire lords with no counties; set `over` when you hold all twelve or none. */
export function checkElim(s: GameState): void {
  for (let l = 1; l < 4; l++) {
    const L = s.lords[l]!;
    if (L.alive && counties(s, l).length === 0) {
      L.alive = false;
      logEv(s, `${L.name} has lost every county. Their house is no more.`, 'good');
    }
  }
  const mine = counties(s, 0).length;
  if (!s.over) {
    if (mine === 0) s.over = 'lost';
    else if (mine === NC) s.over = 'won';
  }
}

export function fmtUnits(g: Units): string {
  const parts: string[] = [];
  for (const k of KINDS) if (g[k] > 0) parts.push(`${g[k]} ${g[k] === 1 ? U[k].one : U[k].n.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'none';
}

/**
 * March troops from one county to another. Into your own county they reinforce (and cannot march again this season);
 * into another lord's county they attack. Battles against you are pushed onto `pending` if given.
 */
export function doSend(s: GameState, rng: Rng, from: County, to: County, mode: Mode, pending?: BattleReport[]): SendResult | null {
  const m = pick(movable(from), mode);
  if (!total(m)) return null;
  for (const k of KINDS) from.g[k] -= m[k];
  if (to.owner === from.owner) {
    for (const k of KINDS) { to.g[k] += m[k]; to.arr[k] += m[k]; }
    if (from.owner === 0) logEv(s, `Marched ${fmtUnits(m)} from ${from.name} to ${to.name}.`);
    return { kind: 'move', m };
  }
  const report = battle(s, rng, from, to, m);
  logEv(s, battleLog(s, report), report.att === 0 ? (report.won ? 'good' : 'bad') : report.dfn === 0 ? (report.won ? 'bad' : 'good') : '');
  checkElim(s);
  if (report.dfn === 0 && report.att !== 0 && pending) pending.push(report);
  return { kind: 'battle', report };
}

/* ---------- Scouting (deterministic, no RNG) ---------- */

export const estNoise = (s: GameState, c: County): number => (((s.turn * 7 + c.id * 13) % 31) - 15) / 100;
export const round5 = (v: number): number => Math.max(5, Math.round(v / 5) * 5);
export const estDef = (s: GameState, c: County): number => round5(defence(c) * (1 + estNoise(s, c)));
export const bordersYou = (s: GameState, c: County): boolean => NB[c.id]!.some((n) => s.C[n]!.owner === 0);

/** What you can see of a county's garrison: exact if yours, approximate (~) at the border, "?" elsewhere. */
export function seenTroops(s: GameState, c: County): string {
  if (c.owner === 0) return String(troops(c));
  if (bordersYou(s, c)) return '~' + round5(troops(c) * (1 + estNoise(s, c)));
  return '?';
}
