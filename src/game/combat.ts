import { KINDS, NB, NC, NEUTRAL, NORMAL_RATION, NORMAL_TAX, RULES, U } from './data';
import { applyFarmLimit } from './economy';
import { range, type Rng } from './rng';
import { atkMult, atkOf, clamp, counties, defaultWork, defence, logEv, lordName, movable, total, troops, zero } from './state';
import type { BattleReport, County, GameState, Mode, SendResult, Units } from './types';

const B = RULES.battle;

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

export function applyLoss(g: Units, cf: number, lost: Units): Units {
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
  const atk = atkOf(m) * atkMult(s) * range(rng, B.rollLow, B.rollHigh);
  const def = defence(to) * range(rng, B.rollLow, B.rollHigh);
  const rep: BattleReport = {
    from: from.name, to: to.name, att: from.owner, dfn: to.owner,
    atk: Math.round(atk), def: Math.round(def), won: atk > def,
    sent: m, lostA: zero(), lostD: zero(), turn: s.turn,
  };
  if (atk > def) {
    const surv = applyLoss(m, clamp((B.lossFactor * def) / atk, B.lossMin, B.lossMax), rep.lostA);
    if (total(surv) === 0) {
      const big = KINDS.slice().sort((a, b) => m[b] - m[a])[0]!;
      surv[big] = 1;
      rep.lostA[big] = Math.max(0, rep.lostA[big] - 1);
    }
    for (const k of KINDS) rep.lostD[k] = to.g[k];
    to.mus = zero(); to.tax = NORMAL_TAX; to.ration = NORMAL_RATION; to.owner = from.owner;
    if (s.unrest && to.owner === 0) { to.was = rep.dfn; to.since = s.turn; } else { delete to.was; delete to.since; }
    to.g = surv; to.arr = { spear: surv.spear, archer: surv.archer, knight: surv.knight };
    to.pop = Math.max(B.conqueredPopMin, Math.round(to.pop * B.conqueredPopKeeps)); to.mood = B.conqueredMood; to.fort = Math.max(0, to.fort - B.conqueredFortLoss);
    to.work = defaultWork(to.i);
    to.farmPref = RULES.start.work.farm;
    applyFarmLimit(s, to);
  } else {
    to.g = applyLoss(to.g, clamp((B.lossFactor * atk) / def, B.lossMin, B.lossMax), rep.lostD);
    for (const k of KINDS) {
      const back = Math.floor(m[k] * B.loserKeeps);
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
  return { kind: 'battle', report: settle(s, battle(s, rng, from, to, m), pending) };
}

/** Log a finished battle, update the tallies and retire beaten lords. */
function settle(s: GameState, report: BattleReport, pending?: BattleReport[]): BattleReport {
  logEv(s, battleLog(s, report), report.att === 0 ? (report.won ? 'good' : 'bad') : report.dfn === 0 ? (report.won ? 'bad' : 'good') : '');
  if (s.stats && report.won) {
    if (report.att === 0) s.stats.taken++;
    if (report.dfn === 0) s.stats.lost++;
  }
  checkElim(s);
  if (report.dfn === 0 && report.att !== 0 && pending) pending.push(report);
  return report;
}

/** Several of one lord's counties strike the same target as one army. The first county leads: survivors of a failed attack walk back to it. */
export function doSendMany(s: GameState, rng: Rng, from: County[], to: County, mode: Mode, pending?: BattleReport[]): BattleReport | null {
  const m = zero();
  for (const c of from) {
    const part = pick(movable(c), mode);
    for (const k of KINDS) { c.g[k] -= part[k]; m[k] += part[k]; }
  }
  if (!total(m)) return null;
  return settle(s, battle(s, rng, from[0]!, to, m), pending);
}

/* ---------- Scouting (deterministic, no RNG) ---------- */

export const estNoise = (s: GameState, c: County): number => (((s.turn * 7 + c.id * 13) % 31) - 15) / 100;
export const round5 = (v: number): number => Math.max(5, Math.round(v / 5) * 5);
export const estDef = (s: GameState, c: County): number => round5(defence(c) * (1 + estNoise(s, c)));
export const bordersYou = (s: GameState, c: County): boolean => NB[c.id]!.some((n) => s.C[n]!.owner === 0);

/** A rival army that looks strong enough to take one of your counties. `ratio` is its scouted attack over that county's defence. */
export interface Threat { from: County; to: County; ratio: number }

/** Rival counties touching yours whose scouted army (off by up to 15%, as with scouting) could break the county it borders, strongest first. */
export function threats(s: GameState, min = 1.2): Threat[] {
  const best = new Map<number, Threat>();
  for (const to of counties(s, 0)) {
    const def = defence(to);
    for (const n of NB[to.id]!) {
      const from = s.C[n]!;
      if (from.owner <= 0) continue;
      const ratio = (atkOf(from.g) * atkMult(s) * (1 + estNoise(s, from))) / def;
      if (ratio >= min && ratio > (best.get(to.id)?.ratio ?? 0)) best.set(to.id, { from, to, ratio });
    }
  }
  return [...best.values()].sort((a, b) => b.ratio - a.ratio);
}

/** What you can see of a county's garrison: exact if yours, approximate (~) at the border, "?" elsewhere. */
export function seenTroops(s: GameState, c: County): string {
  if (c.owner === 0) return String(troops(c));
  if (bordersYou(s, c)) return '~' + round5(troops(c) * (1 + estNoise(s, c)));
  return '?';
}
