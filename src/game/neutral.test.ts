import { describe, expect, it } from 'vitest';
import { NEUTRAL, NC } from './data';
import { aiTurn } from './ai';
import { battleLog, doSend } from './combat';
import { economyTick } from './economy';
import { freshGame, constant } from './fixtures';
import { createRng } from './rng';
import { endSeason } from './turn';
import { newGame, counties, defence } from './state';
import { parseSave, serialize } from './save';

const wild = (n: number, seed = 3) => { const rng = createRng(seed); return { s: newGame(rng, seed, { unclaimed: n }), rng }; };

describe('counties with no lord', () => {
  it('a default game has none, and asking for none uses no random numbers', () => {
    const a = freshGame(7), b = wild(0, 7);
    expect(a.s.C.some((c) => c.owner === NEUTRAL)).toBe(false);
    expect(b.s.C.map((c) => c.pop)).toEqual(a.s.C.map((c) => c.pop));
    expect(b.rng.getState()).toBe(a.rng.getState());
  });

  it('starts the requested number unclaimed, never yours, and no rival is wiped out', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { s } = wild(6, seed);
      expect(counties(s, NEUTRAL).length).toBe(6);
      expect(counties(s, 0).map((c) => c.name)).toEqual(['Ashdown', 'Brackenmoor', 'Dunmere']);
      for (const l of [1, 2, 3]) expect(counties(s, l).length).toBeGreaterThan(0);
    }
  });

  it('are defended by a small militia and can be claimed', () => {
    const { s, rng } = wild(4);
    const target = counties(s, NEUTRAL)[0]!;
    expect(target.g.spear).toBeGreaterThan(0);
    const from = s.C.find((c) => c.owner === 0)!;
    Object.assign(target, { pop: 90 });
    from.g = { spear: 0, archer: 30, knight: 0 }; from.arr = { spear: 0, archer: 0, knight: 0 };
    const res = doSend(s, constant(), from, target, 'all');
    expect(res?.kind).toBe('battle');
    if (res?.kind === 'battle') {
      expect(res.report.dfn).toBe(NEUTRAL);
      expect(res.report.won).toBe(true);
      expect(battleLog(s, res.report)).toBe(`You claimed ${target.name}, which had no lord.`);
    }
    expect(target.owner).toBe(0);
    expect(rng).toBeTruthy();
  });

  it('stay as they are through a season: no harvest, growth or upkeep', () => {
    const { s } = wild(4);
    const c = counties(s, NEUTRAL)[0]!;
    const before = JSON.stringify(c);
    economyTick(s);
    expect(JSON.stringify(c)).toBe(before);
  });

  it('rivals march on them, and a long game never breaks', () => {
    const { s, rng } = wild(6, 11);
    for (let t = 0; t < 60 && !s.over; t++) {
      for (const l of [1, 2, 3]) if (s.lords[l]!.alive) aiTurn(s, rng, l);
      expect(() => endSeason(s, rng)).not.toThrow();
    }
    expect(counties(s, NEUTRAL).length).toBeLessThan(6);
    expect(defence(s.C[0]!)).toBeGreaterThan(0);
  });

  it('survive a save and load', () => {
    const { s, rng } = wild(5);
    const back = parseSave(serialize(s, rng))!;
    expect(back.state.C.filter((c) => c.owner === NEUTRAL).length).toBe(5);
    expect(back.state.C.length).toBe(NC);
  });
});

describe('one county each', () => {
  it('gives every lord exactly one county, in different places for different seeds', () => {
    const homes = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) {
      const rng = createRng(seed), s = newGame(rng, seed, { oneEach: true });
      for (const l of [0, 1, 2, 3]) expect(counties(s, l).length).toBe(1);
      expect(counties(s, NEUTRAL).length).toBe(8);
      homes.add(counties(s, 0)[0]!.id);
    }
    expect(homes.size).toBeGreaterThan(5);
  });

  it('plays on without errors', () => {
    const rng = createRng(5), s = newGame(rng, 5, { oneEach: true });
    for (let t = 0; t < 80 && !s.over; t++) expect(() => endSeason(s, rng)).not.toThrow();
  });
});
