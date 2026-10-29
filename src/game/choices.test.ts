import { describe, expect, it } from 'vitest';
import { choiceOptions, decide, defaultChoice } from './choices';
import { rollEvent } from './economy';
import { constant, freshGame, scripted } from './fixtures';
import { createRng } from './rng';
import { parseSave, serialize } from './save';
import { newGame } from './state';
import { endSeason } from './turn';
import type { GameState, Pending } from './types';

const game = (seed = 1) => { const rng = createRng(seed); return { s: newGame(rng, seed, { decide: true }), rng }; };
const ask = (s: GameState, p: Omit<Pending, 't'>) => { s.pending = { t: s.turn, ...p }; return s.pending; };

describe('classic game', () => {
  it('events happen at once and nothing waits', () => {
    const { s } = freshGame();
    expect(s.decide).toBeUndefined();
    rollEvent(s, scripted([0, 0, 0.3, 0.5]));
    expect(s.pending).toBeUndefined();
  });
});

describe('choices', () => {
  it('an event waits for an answer with the same roll a classic game makes', () => {
    const { s } = game();
    const grain = s.lords[0]!.stock.grain;
    rollEvent(s, scripted([0, 0, 0.3, 0.5])); // event, first county, bumper, middle of 30..70
    expect(s.pending).toMatchObject({ kind: 'bumper', n: 50 });
    expect(s.lords[0]!.stock.grain).toBe(grain);
  });

  it('a feast keeps half the grain and cheers the realm', () => {
    const { s, rng } = game();
    const c = s.C[4]!, other = s.C[8]!, m = c.mood, mo = other.mood, g = s.lords[0]!.stock.grain;
    ask(s, { kind: 'bumper', c: 4, n: 50 });
    expect(decide(s, rng, 'feast')).toBe(true);
    expect(s.lords[0]!.stock.grain).toBe(g + 25);
    expect(c.mood).toBe(m + 8);
    expect(other.mood).toBe(mo + 3);
    expect(s.pending).toBeUndefined();
  });

  it('a plague left alone spreads to big neighbours of yours; sealed, it does not', () => {
    const a = game();
    a.s.C[8]!.pop = 100; a.s.C[9]!.pop = 100;
    ask(a.s, { kind: 'plague', c: 8, n: 12 });
    decide(a.s, a.rng, 'run');
    expect(a.s.C[8]!.pop).toBe(88);
    expect(a.s.C[9]!.pop).toBe(94);
    const b = game();
    b.s.C[8]!.pop = 100; b.s.C[9]!.pop = 100;
    ask(b.s, { kind: 'plague', c: 8, n: 12 });
    decide(b.s, b.rng, 'seal');
    expect(b.s.C[9]!.pop).toBe(100);
  });

  it('healers need the gold', () => {
    const { s, rng } = game();
    s.lords[0]!.stock.gold = 10;
    const p = ask(s, { kind: 'plague', c: 4, n: 10 });
    expect(choiceOptions(s, p).find((o) => o.id === 'heal')!.no).toBeTruthy();
    expect(decide(s, rng, 'heal')).toBe(false);
    expect(s.pending).toBeDefined();
  });

  it('hunting bandits: a win brings loot and costs some troops, a loss costs gold and troops', () => {
    const win = game();
    const c = win.s.C[4]!;
    c.g = { spear: 0, archer: 10, knight: 0 }; c.arr = { spear: 0, archer: 10, knight: 0 }; c.mus = { spear: 0, archer: 10, knight: 0 };
    const gold = win.s.lords[0]!.stock.gold;
    ask(win.s, { kind: 'bandits', c: 4, n: 20, band: 10 });
    decide(win.s, constant(), 'hunt');
    expect(win.s.lords[0]!.stock.gold).toBe(gold + 10);
    expect(c.g.archer).toBe(9); // 0.3 * 10 / 40 = 7.5% of 10, rounded to 1 lost
    expect(c.arr.archer).toBe(9);
    const lose = game();
    const d = lose.s.C[4]!;
    d.g = { spear: 10, archer: 0, knight: 0 };
    const g2 = lose.s.lords[0]!.stock.gold;
    ask(lose.s, { kind: 'bandits', c: 4, n: 20, band: 30 });
    decide(lose.s, constant(), 'hunt');
    expect(lose.s.lords[0]!.stock.gold).toBe(g2 - 20);
    expect(d.g.spear).toBe(8);
  });

  it('ending the season without an answer takes the default', () => {
    const { s, rng } = game();
    const p = ask(s, { kind: 'caravan', c: 4, n: 40 });
    expect(defaultChoice(s, p)).toBe('tolls');
    endSeason(s, rng);
    expect(s.log.some((e) => /No answer was given\. A merchant caravan pays 40 gold/.test(e.txt))).toBe(true);
  });

  it('a waiting event survives a save', () => {
    const { s, rng } = game();
    ask(s, { kind: 'bandits', c: 4, n: 20, band: 12 });
    const back = parseSave(serialize(s, rng))!.state;
    expect(back.decide).toBe(true);
    expect(back.pending).toEqual(s.pending);
  });

  it('a whole game with choices runs to the end', () => {
    const { s, rng } = game(7);
    for (let i = 0; i < 120 && !s.over; i++) endSeason(s, rng);
    expect(s.C.every((c) => c.pop >= 0)).toBe(true);
  });
});
