import { describe, expect, it } from 'vitest';
import { aiTurn } from './ai';
import { DEFAULT_BOT, playGame } from './bot';
import { doSend } from './combat';
import { NEUTRAL, NB } from './data';
import { constant, freshGame, scripted } from './fixtures';
import { createRng } from './rng';
import { parseSave, serialize } from './save';
import { counties, newGame } from './state';
import { chanceAt, inLeague, revoltChance, rollRevolts } from './unrest';
import type { GameState, Units } from './types';

const units = (spear: number, archer: number, knight: number): Units => ({ spear, archer, knight });
const game = (seed = 1) => { const rng = createRng(seed); return { s: newGame(rng, seed, { unrest: true }), rng }; };
/** Take county 0 from its rival with a big army from Ashdown. */
const conquer = (s: GameState) => {
  const from = s.C[4]!, to = s.C[0]!, old = to.owner;
  from.g = units(0, 40, 0); from.arr = units(0, 0, 0);
  doSend(s, constant(), from, to, 'all');
  return { to, old };
};

describe('classic game', () => {
  it('conquered counties remember nothing', () => {
    const { s } = freshGame();
    const { to } = conquer(s);
    expect(to.owner).toBe(0);
    expect(to.was).toBeUndefined();
    expect(revoltChance(s, to)).toBe(0);
  });
});

describe('unrest', () => {
  it('a conquered county remembers its old lord and when it was taken', () => {
    const { s } = game();
    const { to, old } = conquer(s);
    expect(to.was).toBe(old);
    expect(to.since).toBe(0);
  });

  it('revolt chance rises as mood falls under 30', () => {
    expect(chanceAt(30)).toBe(0);
    expect(chanceAt(25)).toBeCloseTo(0.09);
    expect(chanceAt(0)).toBeCloseTo(0.39);
  });

  it('a strong garrison crushes a revolt', () => {
    const { s } = game();
    const { to } = conquer(s);
    to.g = units(20, 0, 0); to.mood = 10;
    rollRevolts(s, scripted([0, 0.5, 0.5]));
    expect(to.owner).toBe(0);
    expect(s.log.at(-1)!.txt).toMatch(/garrison holds/);
  });

  it('an empty county breaks free back to its old lord', () => {
    const { s } = game();
    const { to, old } = conquer(s);
    to.g = units(0, 0, 0); to.mood = 10;
    rollRevolts(s, scripted([0, 0.5, 0.5]));
    expect(to.owner).toBe(old);
    expect(to.g.spear).toBeGreaterThan(0);
    expect(to.was).toBeUndefined();
  });

  it('goes to no lord when the old house has fallen', () => {
    const { s } = game();
    const { to, old } = conquer(s);
    s.lords[old]!.alive = false;
    to.g = units(0, 0, 0); to.mood = 10;
    rollRevolts(s, scripted([0, 0.5, 0.5]));
    expect(to.owner).toBe(NEUTRAL);
  });

  it('a happy county never revolts, and after three years it accepts your rule', () => {
    const { s } = game();
    const { to } = conquer(s);
    to.mood = 60;
    rollRevolts(s, scripted([0]));
    expect(to.owner).toBe(0);
    s.turn = 11;
    rollRevolts(s, scripted([0]));
    expect(to.was).toBeUndefined();
    expect(revoltChance(s, to)).toBe(0);
  });

  it('rivals ally once you hold seven counties, and then attack only you', () => {
    const { s } = game();
    const mine = [0, 1, 2, 3].map((i) => s.C[i]!);
    for (const c of mine) c.owner = 0;
    expect(inLeague(s)).toBe(true);
    rollRevolts(s, constant());
    expect(s.league).toBe(true);
    expect(s.log.at(-1)!.txt).toMatch(/pact against you/);
    // a rival army next to another rival and to none of yours stays put
    s.turn = 10;
    const lord = s.C[11]!.owner, army = s.C[11]!;
    army.g = units(0, 60, 0); army.arr = units(0, 0, 0);
    const before = counties(s, lord).length;
    const touchesYou = NB[11]!.some((n) => s.C[n]!.owner === 0);
    aiTurn(s, constant(0.99), lord);
    if (!touchesYou) expect(counties(s, lord).length).toBe(before);
  });

  it('the memory survives a save', () => {
    const { s, rng } = game();
    const { to } = conquer(s);
    const back = parseSave(serialize(s, rng))!.state;
    expect(back.unrest).toBe(true);
    expect(back.C[to.id]!.was).toBe(to.was);
    expect(back.C[to.id]!.since).toBe(0);
  });

  it('bot games with unrest run to the end', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = playGame(seed, DEFAULT_BOT, 200, { unrest: true });
      expect(['won', 'lost', null]).toContain(r.over);
    }
  });
});
