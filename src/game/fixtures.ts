// Helpers shared by the tests. Not part of the game.
import { createRng, type Rng } from './rng';
import { newGame } from './state';
import type { GameState } from './types';

/** A fresh game from a seed, plus the generator that continues from it. */
export function freshGame(seed = 1): { s: GameState; rng: Rng } {
  const rng = createRng(seed);
  return { s: newGame(rng, seed), rng };
}

/** A "random" source that returns the given values in order, then `after` forever. Handy to force a battle roll or an event. */
export function scripted(values: number[], after = 0.5): Rng {
  let i = 0;
  const r = (() => (i < values.length ? values[i++]! : after)) as Rng;
  r.getState = () => i;
  return r;
}

/** Always returns the same value; 0.5 makes every `range(0.9, 1.1)` roll exactly 1.0. */
export const constant = (v = 0.5): Rng => scripted([], v);
