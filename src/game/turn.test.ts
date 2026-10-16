import { describe, expect, it, vi } from 'vitest';
import { endSeason } from './turn';
import { botOrders, playGame, DEFAULT_BOT } from './bot';
import { parseSave, serialize } from './save';
import { constant, freshGame } from './fixtures';
import { counties } from './state';
import type { GameState, Units } from './types';

const units = (spear = 0, archer = 0, knight = 0): Units => ({ spear, archer, knight });

describe('ending a season', () => {
  it('advances the turn, rolls the year after winter, and logs the new season', () => {
    const { s, rng } = freshGame();
    for (let i = 0; i < 4; i++) endSeason(s, rng);
    expect(s.turn).toBe(4);
    expect(s.log.some((l) => /Spring 1101 begins/.test(l.txt))).toBe(true);
    expect(s.log.some((l) => /Winter 1100 begins/.test(l.txt))).toBe(true);
  });

  it('does nothing once the game is decided', () => {
    const { s, rng } = freshGame();
    s.over = 'won';
    const before = JSON.stringify(s);
    expect(endSeason(s, rng)).toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });

  it('plays rival turns before the economy, so a county you just lost does not pay you', () => {
    const { s } = freshGame();
    s.turn = 4;
    s.lords[1]!.stock.gold = 0;
    s.C[0]!.g = units(0, 60, 60); // Baron Hugh's stack next to Ashdown
    s.C[4]!.g = units(1, 0, 0);
    const res = endSeason(s, constant(0.99))!;
    expect(s.C[4]!.owner).toBe(1);
    expect(res.battles).toHaveLength(1);
    expect(res.battles[0]).toMatchObject({ att: 1, dfn: 0, won: true, to: 'Ashdown' });
  });

  it('reports farmers moved to crafts when winter arrives', () => {
    const { s } = freshGame();
    s.turn = 2; // autumn; the next season is winter
    const res = endSeason(s, constant(0.99))!;
    expect(s.turn).toBe(3);
    expect(res.moved).toBeGreaterThan(0);
    for (const c of counties(s, 0)) expect(c.work.farm).toBe(0);
  });

  it('a lord with no counties left is retired and skipped', () => {
    const { s, rng } = freshGame();
    for (const c of s.C) if (c.owner === 3) c.owner = 2;
    endSeason(s, rng);
    expect(s.lords[3]!.alive).toBe(false);
    expect(() => endSeason(s, rng)).not.toThrow();
  });
});

const snapshot = (s: GameState) => JSON.stringify(s);

describe('replay', () => {
  it('the same seed plays out the same game, turn by turn', () => {
    const run = () => {
      const { s, rng } = freshGame(2024);
      const trail: string[] = [];
      for (let i = 0; i < 60 && !s.over; i++) {
        botOrders(s, rng);
        if (s.over) break;
        endSeason(s, rng);
        trail.push(snapshot(s));
      }
      return trail;
    };
    const a = run(), b = run();
    expect(a.length).toBeGreaterThan(5);
    expect(b).toEqual(a);
  });

  it('a different seed plays out differently', () => {
    const a = playGame(1, DEFAULT_BOT, 40), b = playGame(2, DEFAULT_BOT, 40);
    expect(snapshot(a.state)).not.toBe(snapshot(b.state));
  });

  it('a whole bot game repeats exactly and never touches Math.random', () => {
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random was called'); });
    try {
      const a = playGame(77), b = playGame(77);
      expect(snapshot(b.state)).toBe(snapshot(a.state));
      expect(b.turns).toBe(a.turns);
    } finally { spy.mockRestore(); }
  });

  it('saving and loading mid-game does not change what happens next', () => {
    const play = (resume: boolean) => {
      let { s, rng } = freshGame(99);
      for (let i = 0; i < 30; i++) {
        botOrders(s, rng);
        if (s.over) break;
        endSeason(s, rng);
        if (resume && i === 14) { const l = parseSave(serialize(s, rng))!; s = l.state; rng = l.rng; }
      }
      return snapshot(s);
    };
    expect(play(true)).toBe(play(false));
  });

  it('every game ends in a win, a loss, or is still going: no crashes over many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const r = playGame(seed, DEFAULT_BOT, 120);
      expect([null, 'won', 'lost']).toContain(r.over);
      for (const c of r.state.C) {
        expect(c.pop).toBeGreaterThanOrEqual(20);
        expect(c.mood).toBeGreaterThanOrEqual(0);
        expect(c.mood).toBeLessThanOrEqual(100);
        for (const k of ['spear', 'archer', 'knight'] as const) expect(c.g[k]).toBeGreaterThanOrEqual(0);
      }
      for (const l of r.state.lords) for (const v of Object.values(l.stock)) expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});
