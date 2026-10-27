import { describe, expect, it } from 'vitest';
import { aiTurn } from './ai';
import { doSend } from './combat';
import { constant, freshGame } from './fixtures';
import { checkGoals, goalRows, spreadRumours } from './living';
import { createRng } from './rng';
import { parseSave, serialize } from './save';
import { atkMult, counties, newGame } from './state';
import type { GameState, Units } from './types';

const units = (spear: number, archer: number, knight: number): Units => ({ spear, archer, knight });
const rich = (seed = 1, level?: 'easy' | 'hard') => { const rng = createRng(seed); return { s: newGame(rng, seed, { rich: true, level }), rng }; };

describe('classic game', () => {
  it('carries no living realm state and has no winter penalty', () => {
    const { s } = freshGame();
    expect(s.rich).toBeUndefined();
    expect(s.level).toBeUndefined();
    s.turn = 3;
    expect(atkMult(s)).toBe(1);
  });
});

describe('living realm', () => {
  it('names the rivals ways and weakens winter marches', () => {
    const { s } = rich();
    expect(s.log.some((e) => /Turtle|turtle/.test(e.txt))).toBe(true);
    s.turn = 3;
    expect(atkMult(s)).toBe(0.8);
    s.turn = 2;
    expect(atkMult(s)).toBe(1);
  });

  it('an attack in winter counts at 80%', () => {
    const { s } = rich();
    s.turn = 3;
    const from = s.C[4]!, to = s.C[0]!;
    from.g = units(0, 20, 0); from.arr = units(0, 0, 0);
    const res = doSend(s, constant(), from, to, 'all');
    expect(res?.kind === 'battle' && res.report.atk).toBe(64); // 20 archers x 4 x 0.8
  });

  it('hard gives rivals a head start in gold, easy does not', () => {
    const base = rich(1).s.lords[1]!.stock.gold;
    expect(rich(1, 'hard').s.lords[1]!.stock.gold).toBeGreaterThan(base);
    expect(rich(1, 'hard').s.lords[0]!.stock.gold).toBe(rich(1).s.lords[0]!.stock.gold);
    expect(rich(1, 'easy').s.lords[1]!.stock.gold).toBe(base);
  });

  it('the turtle raises a fort on its frontier, the trader tops up iron', () => {
    const { s } = rich();
    s.turn = 8;
    Object.assign(s.lords[1]!.stock, { gold: 500, wood: 200, iron: 60 });
    aiTurn(s, constant(0.99), 1);
    expect(Math.max(...counties(s, 1).map((c) => c.fort))).toBeGreaterThan(0);

    const t = rich().s;
    Object.assign(t.lords[3]!.stock, { gold: 120, wood: 0, iron: 0 }); // 81 gold buys a lot of 10 iron and leaves 39, below the recruit reserve
    aiTurn(t, constant(0.99), 3);
    expect(t.lords[3]!.stock.iron).toBe(10);
    expect(t.lords[3]!.stock.gold).toBe(39);
  });

  it('counties around yours join forces when none can win alone, and only in a living realm', () => {
    for (const living of [false, true]) {
      const { s } = living ? rich() : freshGame();
      s.turn = 8;
      s.lords[1]!.stock.gold = 0;
      // Greywater (0) and Harrowdale (1) both touch Ashdown (4)
      for (const i of [0, 1]) { s.C[i]!.g = units(0, 20, 0); s.C[i]!.arr = units(0, 0, 0); }
      s.C[4]!.g = units(12, 0, 0);
      aiTurn(s, constant(0.5), 1);
      expect(s.C[4]!.owner).toBe(living ? 1 : 0);
    }
  });
});

describe('rumours', () => {
  it('name the lord, the main striking unit and the county, once', () => {
    const { s } = rich();
    s.C[0]!.g = units(0, 10, 0);
    spreadRumours(s); spreadRumours(s);
    const lines = s.log.filter((e) => e.txt.startsWith('Rumour:'));
    expect(lines.length).toBe(1);
    expect(lines[0]!.txt).toMatch(/Baron Hugh is massing archers near (Ashdown|Ironby)/);
  });

  it('say nothing in a classic game', () => {
    const { s } = freshGame();
    s.C[0]!.g = units(0, 10, 0);
    spreadRumours(s);
    expect(s.log.some((e) => e.txt.startsWith('Rumour:'))).toBe(false);
  });
});

describe('goals', () => {
  const give = (s: GameState, n: number) => { s.C.forEach((c, i) => { c.owner = i < n ? 0 : 1; }); };

  it('pay their gold once when reached in time', () => {
    const { s } = rich();
    give(s, 5);
    const gold = s.lords[0]!.stock.gold;
    checkGoals(s); checkGoals(s);
    expect(s.lords[0]!.stock.gold).toBe(gold + 60);
    expect(goalRows(s).find((g) => g.id === 'hold5')!.state).toBe('done');
  });

  it('are marked missed once their time has run out', () => {
    const { s } = rich();
    give(s, 3);
    s.turn = 17;
    checkGoals(s);
    expect(goalRows(s).find((g) => g.id === 'hold5')!.state).toBe('missed');
    expect(goalRows(s).find((g) => g.id === 'hold10')!.state).toBe('open');
  });
});

describe('saves', () => {
  it('keep the living realm settings', () => {
    const { s, rng } = rich(4, 'hard');
    s.goals!['hold5'] = 12; s.stats!.taken = 3;
    const back = parseSave(serialize(s, rng))!.state;
    expect(back.rich).toBe(true);
    expect(back.level).toBe('hard');
    expect(back.goals).toEqual({ hold5: 12 });
    expect(back.stats).toEqual({ taken: 3, lost: 0 });
  });

  it('a classic save stays classic', () => {
    const { s, rng } = freshGame(4);
    const back = parseSave(serialize(s, rng))!.state;
    expect(back.rich).toBeUndefined();
    expect(back.level).toBeUndefined();
  });
});
