import { describe, expect, it } from 'vitest';
import { NEUTRAL } from './data';
import { threats } from './combat';
import { freshGame } from './fixtures';

describe('threats', () => {
  it('are empty at the start of a game', () => {
    expect(threats(freshGame(1).s)).toEqual([]);
  });

  it('flag a strong rival army next to your county, and only that', () => {
    const { s } = freshGame(1);
    const ironby = s.C[5]!; // touches Ashdown (4); owned by Baron Hugh
    ironby.g = { spear: 0, archer: 60, knight: 20 };
    const t = threats(s);
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x) => x.from.owner > 0 && x.to.owner === 0)).toBe(true);
    expect(t.some((x) => x.from.id === 5 && x.to.id === 4)).toBe(true);
  });

  it('ignore unclaimed counties', () => {
    const { s } = freshGame(1);
    const c = s.C[5]!;
    c.g = { spear: 0, archer: 60, knight: 20 };
    c.owner = NEUTRAL;
    expect(threats(s).some((x) => x.from.id === 5)).toBe(false);
  });
});
