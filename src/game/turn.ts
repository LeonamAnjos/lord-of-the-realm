import { aiTurn, shuffle } from './ai';
import { checkElim } from './combat';
import { economyTick, marketDrift, rollEvent, seasonStart } from './economy';
import type { Rng } from './rng';
import { logEv, season, year } from './state';
import { SEASONS } from './data';
import type { BattleReport, GameState } from './types';

const sgn = (v: number): string => { v = Math.round(v); return (v >= 0 ? '+' : '') + v; };

export interface SeasonResult {
  /** attacks made against you by rivals this turn, for the UI to show */
  battles: BattleReport[];
  /** farmers moved to crafts by the new season's farm limit */
  moved: number;
}

/** End the season: rival AI turns, economy tick, market drift, random event, turn counter, then season start. */
export function endSeason(s: GameState, rng: Rng): SeasonResult | null {
  if (s.over) return null;
  const battles: BattleReport[] = [];
  const before = { ...s.lords[0]!.stock };
  for (const l of shuffle(rng, [1, 2, 3])) {
    if (s.lords[l]!.alive && !s.over) aiTurn(s, rng, l, battles);
  }
  economyTick(s);
  marketDrift(s, rng);
  rollEvent(s, rng);
  s.turn++;
  checkElim(s);
  const after = s.lords[0]!.stock;
  logEv(s, `${SEASONS[season(s)]} ${year(s)} begins. Gold ${sgn(after.gold - before.gold)}, grain ${sgn(after.grain - before.grain)}.`);
  const moved = seasonStart(s);
  return { battles, moved };
}
