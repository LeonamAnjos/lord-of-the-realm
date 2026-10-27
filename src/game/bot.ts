// A simple, deterministic stand-in for a human player, used by the replay tests and the balance simulation.
// It never calls the RNG itself, so the game's random sequence depends only on the orders it gives.
import { frontierStep, enemyNb } from './ai';
import { recruit, playerSend, setWork } from './actions';
import { atkOf, counties, defence, movable, total } from './state';
import { buy, forecast } from './economy';
import { pick } from './combat';
import { U } from './data';
import { endSeason } from './turn';
import { createRng, type Rng } from './rng';
import { newGame, type NewGameOptions } from './state';
import type { GameState, Kind } from './types';

export interface BotOptions {
  /** attack when sent attack / defence is above this */
  attackRatio: number;
  /** gold the bot keeps in hand instead of spending on troops */
  reserveGold: number;
  /** most troops it will keep per county before it stops recruiting there */
  garrisonCap: number;
}
const UNIT_GOLD: Record<Kind, number> = { spear: U.spear.gold, archer: U.archer.gold, knight: U.knight.gold };
export const DEFAULT_BOT: BotOptions = { attackRatio: 1.5, reserveGold: 60, garrisonCap: 40 };

/** Give one season's worth of orders as the player (lord 0). */
export function botOrders(s: GameState, rng: Rng, o: BotOptions = DEFAULT_BOT): void {
  const st = s.lords[0]!.stock;
  // keep people fed: buy grain in lots of 10 if the season would end short
  for (let guard = 0; guard < 20 && st.grain + forecast(s, 0).grain < 0 && buy(s, 'grain'); guard++);
  // winter has no harvest: farmers are moved to crafts by the game, nothing to do here
  for (const c of counties(s, 0)) {
    if (c.i > 0 && c.work.mine < 10) setWork(s, c, 'mine', 5);
    const frontier = enemyNb(s, c).length > 0;
    if (!frontier || total(c.g) >= o.garrisonCap) continue;
    const order: Kind[] = ['knight', 'archer', 'spear'];
    // spend everything above the reserve on this front-line county, up to the garrison cap
    for (let n = total(c.g); n < o.garrisonCap; n++) {
      const bought = order.some((k) => st.gold - UNIT_GOLD[k] >= o.reserveGold && recruit(s, c, k, 1));
      if (!bought) break;
    }
  }
  for (const c of counties(s, 0)) {
    const m = movable(c);
    if (!total(m)) continue;
    const foes = enemyNb(s, c);
    if (foes.length) {
      let best = null as (typeof foes)[number] | null, bs = 0;
      for (const f of foes) {
        const ratio = atkOf(pick(m, 'all')) / defence(f);
        if (ratio > o.attackRatio && ratio > bs) { best = f; bs = ratio; }
      }
      if (best) playerSend(s, rng, c.id, best.id, 'all');
    } else {
      const step = frontierStep(s, c, 0);
      if (step !== null) playerSend(s, rng, c.id, step, 'all');
    }
    if (s.over) return;
  }
}

export interface GameResult {
  seed: number;
  /** 'won', 'lost', or null when the turn limit was reached */
  over: GameState['over'];
  turns: number;
  owned: number;
  state: GameState;
}

/** Play a whole seeded game with the bot as the player. */
export function playGame(seed: number, opts: BotOptions = DEFAULT_BOT, maxTurns = 200, game: NewGameOptions = {}): GameResult {
  const rng = createRng(seed);
  const s = newGame(rng, seed, game);
  while (!s.over && s.turn < maxTurns) {
    botOrders(s, rng, opts);
    if (s.over) break;
    endSeason(s, rng);
  }
  return { seed, over: s.over, turns: s.turn, owned: counties(s, 0).length, state: s };
}

