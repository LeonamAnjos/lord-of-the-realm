import { describe, expect, it } from 'vitest';
import { aiTurn, frontierStep, shuffle } from './ai';
import { farmLimit } from './economy';
import { counties, troops } from './state';
import { constant, freshGame } from './fixtures';
import { createRng } from './rng';
import type { Units } from './types';

const units = (spear = 0, archer = 0, knight = 0): Units => ({ spear, archer, knight });

describe('rival AI', () => {
  it('sets jobs by grain security, wood 18, mining by ore (capped by the farm limit)', () => {
    const { s, rng } = freshGame();
    const L = s.lords[1]!;
    L.stock.gold = 0; // nothing to recruit
    const need = counties(s, 1).reduce((a, c) => a + (c.pop + troops(c)) * 0.5, 0);
    L.stock.grain = need * 1.0; // tight: 55 farm
    aiTurn(s, rng, 1);
    for (const c of counties(s, 1)) {
      expect(c.work.farm).toBe(Math.min(55, farmLimit(c, 0)));
      expect(c.work.wood).toBe(18);
      expect(c.work.mine).toBe(c.i >= 0.6 ? 25 : c.i >= 0.3 ? 8 : 0);
    }
    L.stock.grain = need * 2.5; // comfortable: 45
    aiTurn(s, rng, 1);
    expect(counties(s, 1)[0]!.work.farm).toBe(Math.min(45, farmLimit(counties(s, 1)[0]!, 0)));
    L.stock.grain = need * 5; // plenty: 35
    aiTurn(s, rng, 1);
    expect(counties(s, 1)[0]!.work.farm).toBe(Math.min(35, farmLimit(counties(s, 1)[0]!, 0)));
  });

  it('farms nothing in winter', () => {
    const { s, rng } = freshGame();
    s.turn = 3;
    s.lords[1]!.stock.gold = 0;
    aiTurn(s, rng, 1);
    for (const c of counties(s, 1)) expect(c.work.farm).toBe(0);
  });

  it('sets tax by mood: none under 25, low under 42, high over 75, else normal', () => {
    const run = (moods: number[]) => {
      const { s, rng } = freshGame();
      s.lords[1]!.stock.gold = 0;
      counties(s, 1).forEach((c, i) => { c.mood = moods[i]!; });
      aiTurn(s, rng, 1);
      return counties(s, 1).map((c) => c.tax);
    };
    expect(run([24, 41, 76])).toEqual([0, 1, 3]);
    expect(run([25, 42, 75])).toEqual([1, 2, 2]);
  });

  it('buys grain with gold when short on food', () => {
    const { s, rng } = freshGame();
    const L = s.lords[2]!;
    L.stock.grain = 10; L.stock.gold = 100;
    aiTurn(s, rng, 2);
    expect(L.stock.grain).toBeGreaterThan(10);
    expect(L.stock.gold).toBeLessThan(100);
  });

  it('recruits only with gold above 35 and never spends the reserve', () => {
    const { s, rng } = freshGame();
    const L = s.lords[1]!;
    const before = counties(s, 1).reduce((a, c) => a + troops(c), 0);
    L.stock.gold = 36;
    aiTurn(s, createRng(5), 1);
    expect(counties(s, 1).reduce((a, c) => a + troops(c), 0)).toBe(before); // only 1 gold to spend
    L.stock.gold = 200; L.stock.wood = 200; L.stock.iron = 50;
    aiTurn(s, rng, 1);
    expect(counties(s, 1).reduce((a, c) => a + troops(c), 0)).toBeGreaterThan(before);
    expect(L.stock.gold).toBeGreaterThanOrEqual(35); // the 35 gold reserve is never spent
  });

  it('does not attack before turn 4, then attacks a weak neighbour it outguns', () => {
    for (const [turn, attacks] of [[3, false], [4, true]] as const) {
      const { s } = freshGame();
      s.turn = turn;
      s.lords[1]!.stock.gold = 0;
      const strong = s.C[0]!; // Greywater (Baron Hugh) touches Ashdown
      strong.g = units(0, 50, 50);
      s.C[4]!.g = units(1, 0, 0);
      aiTurn(s, constant(0.99), 1); // 0.99 never trips the 20% hold-back
      expect(s.C[4]!.owner).toBe(attacks ? 1 : 0);
    }
  });

  it('holds back when the odds are not good enough', () => {
    const { s } = freshGame();
    s.turn = 8;
    s.lords[1]!.stock.gold = 0;
    s.C[0]!.g = units(0, 3, 0);
    aiTurn(s, constant(0.99), 1);
    expect(s.C[4]!.owner).toBe(0);
  });

  it('a county with no enemy neighbour marches everything toward the front', () => {
    const { s } = freshGame();
    for (const c of s.C) c.owner = 1;
    s.C[11]!.owner = 0; // the only front is around Marrowmere (neighbours 6, 7, 10)
    s.lords[1]!.stock.gold = 0;
    const step = frontierStep(s, s.C[0]!, 1)!;
    expect([1, 4]).toContain(step); // Greywater's only neighbours
    s.C[0]!.g = units(5, 0, 0);
    s.C[1]!.g = units(0, 0, 0); s.C[4]!.g = units(0, 0, 0);
    aiTurn(s, constant(0.99), 1);
    expect(troops(s.C[0]!)).toBe(0);
    expect(troops(s.C[step]!)).toBe(5);
    expect(s.C[step]!.arr.spear).toBe(5); // they have to wait a season before marching on
  });

  it('a shuffle keeps every item and is repeatable from a seed', () => {
    const a = shuffle(createRng(9), [1, 2, 3, 4, 5, 6]);
    const b = shuffle(createRng(9), [1, 2, 3, 4, 5, 6]);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
