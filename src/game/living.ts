// Living realm extras: rumours about rival armies and goals with rewards. Only used when `s.rich` is set.
import { NB, RULES, U } from './data';
import { atkOf, counties, logEv } from './state';
import type { GameState } from './types';

/** One rumour per rival: its strongest army next to one of your counties, named by its main striking unit, without numbers. */
export function spreadRumours(s: GameState): void {
  if (!s.rich) return;
  for (let l = 1; l < 4; l++) {
    let best: { atk: number; target: string; kind: 'archer' | 'knight' } | null = null;
    for (const c of counties(s, l)) {
      const atk = atkOf(c.g);
      const target = NB[c.id]!.map((i) => s.C[i]!).find((n) => n.owner === 0);
      if (!target || atk < RULES.living.rumourMinAttack || (best && best.atk >= atk)) continue;
      best = { atk, target: target.name, kind: c.g.knight * U.knight.atk >= c.g.archer * U.archer.atk ? 'knight' : 'archer' };
    }
    if (!best) continue;
    const txt = `Rumour: ${s.lords[l]!.short} is massing ${best.kind === 'knight' ? 'knights' : 'archers'} near ${best.target}.`;
    if (!s.log.slice(-6).some((e) => e.txt === txt)) logEv(s, txt, 'bad');
  }
}

export type GoalState = 'done' | 'missed' | 'open';
export interface GoalRow { id: string; text: string; byTurn: number; reward: number; state: GoalState; at: number }

export function goalRows(s: GameState): GoalRow[] {
  return RULES.goals.map((g) => {
    const at = s.goals?.[g.id];
    return { id: g.id, text: g.text, byTurn: g.byTurn, reward: g.reward, at: at ?? -1, state: at === undefined ? 'open' : at < 0 ? 'missed' : 'done' };
  });
}

/** Reached goals pay their reward in gold; goals whose time ran out are marked missed. */
export function checkGoals(s: GameState): void {
  if (!s.rich || !s.goals) return;
  const held = counties(s, 0).length;
  for (const g of RULES.goals) {
    if (s.goals[g.id] !== undefined) continue;
    if (held >= g.counties && s.turn <= g.byTurn) {
      s.goals[g.id] = s.turn;
      s.lords[0]!.stock.gold += g.reward;
      logEv(s, `Goal reached: ${g.text}. The treasury gains ${g.reward} gold.`, 'good');
    } else if (s.turn > g.byTurn) {
      s.goals[g.id] = -1;
      logEv(s, `Goal missed: ${g.text} by year ${RULES.map.startYear + Math.floor(g.byTurn / 4)}.`, 'bad');
    }
  }
}
