import { describe, expect, it } from 'vitest';
import { canAfford, recruit, unmuster, playerSend, buildFort } from './actions';
import { battle, bordersYou, checkElim, doSend, estDef, pick, seenTroops, splitUnits } from './combat';
import { defence, defOf, atkOf, movable, counties } from './state';
import { economyTick } from './economy';
import { constant, freshGame, scripted } from './fixtures';
import { NC } from './data';
import type { GameState, Units } from './types';

const units = (spear = 0, archer = 0, knight = 0): Units => ({ spear, archer, knight });

/** Ashdown (4, yours) attacking Ironby (5, Baron Hugh's), which touches it. */
function duel(s: GameState) {
  return { from: s.C[4]!, to: s.C[5]! };
}

describe('defence and attack values', () => {
  it('defence = (troop def + pop/10) * (1.15 + 0.2 * fort)', () => {
    const { s } = freshGame();
    const c = s.C[5]!;
    c.pop = 100; c.g = units(10, 0, 0); c.fort = 0;
    expect(defence(c)).toBeCloseTo((30 + 10) * 1.15, 6);
    c.fort = 2;
    expect(defence(c)).toBeCloseTo((30 + 10) * 1.55, 6);
    c.g = units(2, 3, 1); // def 6 + 3 + 6
    expect(defOf(c.g)).toBe(15);
    expect(atkOf(c.g)).toBe(2 + 12 + 9);
  });

  it('forts cost [12w 4i 40g], [20w 8i 70g], [30w 12i 100g] and stop at level 3', () => {
    const { s } = freshGame();
    const c = s.C[4]!, st = s.lords[0]!.stock;
    st.gold = 1000; st.wood = 1000; st.iron = 1000;
    expect(buildFort(s, c)).toBe(true);
    expect([st.gold, st.wood, st.iron]).toEqual([960, 988, 996]);
    expect(buildFort(s, c)).toBe(true);
    expect([st.gold, st.wood, st.iron]).toEqual([890, 968, 988]);
    expect(buildFort(s, c)).toBe(true);
    expect([st.gold, st.wood, st.iron]).toEqual([790, 938, 976]);
    expect(c.fort).toBe(3);
    expect(buildFort(s, c)).toBe(false);
    c.fort = 0; st.iron = 3;
    expect(buildFort(s, c)).toBe(false); // short of iron
  });
});

describe('mustering', () => {
  it('costs gold, wood and iron, takes a person, and cannot march until next season', () => {
    const { s } = freshGame();
    const c = s.C[4]!, st = s.lords[0]!.stock;
    const pop = c.pop;
    expect(recruit(s, c, 'knight', 2)).toBe(true);
    expect([st.gold, st.iron, st.wood]).toEqual([150 - 48, 12 - 6, 40]);
    expect(c.pop).toBe(pop - 2);
    expect(c.g.knight).toBe(2);
    expect(movable(c).knight).toBe(0);
    expect(recruit(s, c, 'archer', 3)).toBe(true);
    expect([st.gold, st.wood]).toEqual([150 - 48 - 24, 40 - 6]);
  });

  it('refuses when short of money or when fewer than 30 people would remain', () => {
    const { s } = freshGame();
    const c = s.C[4]!, st = s.lords[0]!.stock;
    st.iron = 2;
    expect(canAfford(s, 0, 'knight', 1)).toBe(false);
    expect(recruit(s, c, 'knight', 1)).toBe(false);
    st.gold = 1000; st.wood = 1000;
    c.pop = 30;
    expect(recruit(s, c, 'spear', 1)).toBe(false);
    c.pop = 31;
    expect(recruit(s, c, 'spear', 1)).toBe(true);
  });

  it('can be undone for a full refund within the season, but not once it has been paid for a turn', () => {
    const { s } = freshGame();
    const c = s.C[4]!, st = s.lords[0]!.stock;
    const before = { ...st }, pop = c.pop;
    recruit(s, c, 'spear', 4);
    expect(unmuster(s, c, 'spear', 10)).toBe(true); // only 4 were mustered
    expect(c.g.spear).toBe(6);
    expect(st).toEqual(before);
    expect(c.pop).toBe(pop);
    expect(unmuster(s, c, 'spear', 1)).toBe(false); // the original six cannot be un-mustered
    recruit(s, c, 'spear', 2);
    st.grain = 5000;
    economyTick(s);
    expect(unmuster(s, c, 'spear', 1)).toBe(false);
  });
});

describe('orders', () => {
  const m = units(7, 5, 3);
  it('split takes a percentage of each type, rounded up, and never more than you have', () => {
    expect(splitUnits(m, units(10, 50, 100))).toEqual(units(1, 3, 3));
    expect(splitUnits(m, units(0, 0, 0))).toEqual(units(0, 0, 0));
    expect(splitUnits(m, units(100, 100, 100))).toEqual(m);
    expect(splitUnits(units(1, 1, 1), units(10, 10, 10))).toEqual(units(1, 1, 1)); // 0.1 rounds up to 1
    expect(splitUnits(units(0, 0, 0), units(100, 100, 100))).toEqual(units(0, 0, 0));
  });

  it('All, Half (rounded up) and Strike (archers and knights only)', () => {
    expect(pick(m, 'all')).toEqual(m);
    expect(pick(m, 'half')).toEqual(units(4, 3, 2));
    expect(pick(m, 'strike')).toEqual(units(0, 5, 3));
    expect(pick(m, units(50, 50, 50))).toEqual(units(4, 3, 2));
  });

  it('a split sent to your own county reinforces it, and the troops have to wait a season', () => {
    const { s, rng } = freshGame();
    const a = s.C[4]!, b = s.C[9]!;
    a.g = units(10, 4, 2);
    const res = playerSend(s, rng, 4, 9, units(30, 100, 50))!;
    expect(res.kind).toBe('move');
    expect(res.kind === 'move' && res.m).toEqual(units(3, 4, 1));
    expect(a.g).toEqual(units(7, 0, 1));
    expect(b.g).toEqual(units(6 + 3, 2 + 4, 0 + 1));
    expect(b.arr).toEqual(units(3, 4, 1));
    expect(movable(b)).toEqual(units(6, 2, 0));
    expect(s.log.at(-1)!.txt).toMatch(/Marched 3 spearmen, 4 archers, 1 knight from Ashdown to Dunmere/);
  });

  it('fresh recruits stay home when you send All', () => {
    const { s, rng } = freshGame();
    const a = s.C[4]!;
    recruit(s, a, 'spear', 5);
    playerSend(s, rng, 4, 9, 'all');
    expect(a.g.spear).toBe(5);
    expect(s.C[9]!.g.spear).toBe(6 + 6);
  });

  it('does nothing with no troops to send, from a county you do not own, or after the game ends', () => {
    const { s, rng } = freshGame();
    s.C[4]!.g = units(0, 0, 0);
    expect(playerSend(s, rng, 4, 9, 'all')).toBeNull();
    expect(playerSend(s, rng, 5, 4, 'all')).toBeNull();
    s.over = 'lost';
    expect(playerSend(s, rng, 8, 9, 'all')).toBeNull();
  });
});

describe('battle', () => {
  it('a win: the defender loses everything, the attacker loses 0.8*def/atk of what it sent, and the county changes hands', () => {
    const { s } = freshGame();
    const { from, to } = duel(s);
    to.pop = 100; to.g = units(0, 0, 0); to.fort = 2; to.tax = 3; to.ration = 2; to.mood = 90; to.owner = 1;
    from.g = units(0, 0, 0);
    const sent = units(0, 10, 0);
    const rep = battle(s, constant(0.5), from, to, sent);
    // atk 40, def (0 + 10) * 1.55 = 15.5 (reported as 15: 1.55 is 1.5499... in floating point), so loss = clamp(0.8 * 15.5 / 40, 0.1, 0.8) = 0.31 => 3 archers
    expect(rep.won).toBe(true);
    expect([rep.atk, rep.def]).toEqual([40, 15]);
    expect(rep.lostA).toEqual(units(0, 3, 0));
    expect(to.owner).toBe(0);
    expect(to.g).toEqual(units(0, 7, 0));
    expect(to.arr).toEqual(units(0, 7, 0));
    expect(to.pop).toBe(85);
    expect(to.mood).toBe(25);
    expect(to.fort).toBe(1);
    expect(to.tax).toBe(2);
    expect(to.ration).toBe(1);
    expect(to.work.mine).toBe(20); // Ironby has ore 1.4: default jobs
    expect(to.farmPref).toBe(45);
  });

  it('the stronger the defence relative to the attack, the more a winner loses', () => {
    const { s } = freshGame();
    const { from, to } = duel(s);
    to.pop = 200; to.fort = 0; to.g = units(0, 0, 0); to.owner = 1; from.g = units(0, 0, 0);
    // atk 40 vs def 20 * 1.15 = 23: loss 0.8 * 23 / 40 = 0.46, so 4.6 => 5 of 10 archers
    expect(battle(s, constant(0.5), from, to, units(0, 10, 0)).lostA.archer).toBe(5);
    // atk 400 vs def 23: loss floors at 10%
    const { s: s2 } = freshGame();
    const d2 = duel(s2);
    d2.to.pop = 200; d2.to.fort = 0; d2.to.g = units(0, 0, 0); d2.to.owner = 1; d2.from.g = units(0, 0, 0);
    expect(battle(s2, constant(0.5), d2.from, d2.to, units(0, 100, 0)).lostA.archer).toBe(10);
  });

  it('a loss: the defender loses 0.8*atk/def of its troops (at least 10%), the attacker keeps 10% of what it sent', () => {
    const { s } = freshGame();
    const { from, to } = duel(s);
    to.pop = 100; to.fort = 0; to.g = units(20, 0, 0);
    from.g = units(0, 0, 0); from.arr = units(0, 0, 0);
    const rep = battle(s, constant(0.5), from, to, units(10, 0, 0));
    // atk 10 vs def (60 + 10) * 1.15 = 80.5
    expect(rep.won).toBe(false);
    expect(to.owner).toBe(1);
    expect(to.g.spear).toBe(18); // 20 * 0.1 = 2 lost (floor of 10% applies)
    expect(rep.lostD.spear).toBe(2);
    expect(from.g.spear).toBe(1); // floor(10 * 0.1) walk home
    expect(from.arr.spear).toBe(1);
    expect(rep.lostA.spear).toBe(9);
  });

  it('a feeble attack still costs the defender 10% of its troops', () => {
    const { s } = freshGame();
    const { from, to } = duel(s);
    to.pop = 100; to.fort = 0; to.g = units(100, 0, 0);
    from.g = units(0, 0, 0);
    const rep = battle(s, constant(0.5), from, to, units(0, 0, 0));
    expect(rep.won).toBe(false);
    expect(rep.lostD.spear).toBe(10); // 0.8 * 0 / def is clamped up to 0.1
  });

  it('a near miss costs the defender up to 80%', () => {
    const { s } = freshGame();
    const { from, to } = duel(s);
    to.pop = 100; to.fort = 0; to.g = units(100, 0, 0); // def (300 + 10) * 1.15 = 356.5
    from.g = units(0, 0, 0);
    const rep = battle(s, constant(0.5), from, to, units(0, 0, 39)); // atk 351
    expect(rep.won).toBe(false);
    expect(rep.lostD.spear).toBe(79); // round(100 * 0.8 * 351 / 356.5)
  });

  it('a lone winner is never wiped out: at least one soldier holds the county', () => {
    const { s } = freshGame();
    const { from, to } = duel(s);
    to.pop = 50; to.g = units(0, 0, 0); to.fort = 0; to.owner = 1;
    from.g = units(0, 0, 0);
    // atk 9, def 5 * 1.15 = 5.75, loss = 0.8 * 5.75 / 9 = 0.51 => round(0.51) = 1 knight lost => 0 left, so 1 is kept
    const rep = battle(s, constant(0.5), from, to, units(0, 0, 1));
    expect(rep.won).toBe(true);
    expect(to.g).toEqual(units(0, 0, 1));
    expect(rep.lostA.knight).toBe(0);
  });

  it('the dice matter: each side rolls 0.9 to 1.1 of its strength', () => {
    const run = (a: number, d: number) => {
      const { s } = freshGame();
      const { from, to } = duel(s);
      to.pop = 100; to.fort = 0; to.g = units(0, 0, 0); to.owner = 1; // def 11.5
      from.g = units(0, 0, 0);
      return battle(s, scripted([a, d]), from, to, units(0, 3, 0)).won; // atk 12
    };
    expect(run(0.5, 0.5)).toBe(true);   // 12 vs 11.5
    expect(run(0, 1)).toBe(false);      // 10.8 vs 12.65
    expect(run(1, 0)).toBe(true);       // 13.2 vs 10.35
    expect(run(0, 0)).toBe(true);       // 10.8 vs 10.35
  });

  it('an attack on you is queued for the battle sheet', () => {
    const { s, rng } = freshGame();
    const pending: import('./types').BattleReport[] = [];
    const foe = s.C[5]!; // Ironby, Baron Hugh's
    foe.g = units(0, 0, 40);
    s.C[4]!.g = units(1, 0, 0);
    const res = doSend(s, rng, foe, s.C[4]!, 'all', pending);
    expect(res!.kind).toBe('battle');
    expect(pending).toHaveLength(1);
    expect(pending[0]!.dfn).toBe(0);
  });
});

describe('end of the game', () => {
  it('you win by holding all twelve counties and lose with none; beaten lords are retired', () => {
    const { s } = freshGame();
    for (const c of s.C) if (c.owner === 2) c.owner = 0;
    checkElim(s);
    expect(s.lords[2]!.alive).toBe(false);
    expect(s.over).toBeNull();
    for (const c of s.C) c.owner = 0;
    checkElim(s);
    expect(counties(s, 0)).toHaveLength(NC);
    expect(s.over).toBe('won');
    const t = freshGame().s;
    for (const c of t.C) c.owner = 1;
    checkElim(t);
    expect(t.over).toBe('lost');
  });

  it('taking the last county of a rival retires them in the same attack', () => {
    const { s, rng } = freshGame();
    for (const c of s.C) if (c.owner === 3) c.owner = 0;
    s.C[6]!.owner = 3; s.C[6]!.g = units(0, 0, 0); s.C[6]!.pop = 30; // Caldbeck, Earl Godfrey's last county, next to Ironby
    s.C[5]!.owner = 0; s.C[5]!.g = units(0, 20, 0);
    const res = playerSend(s, rng, 5, 6, 'all');
    expect(res!.kind).toBe('battle');
    expect(s.lords[3]!.alive).toBe(false);
  });
});

describe('scouting', () => {
  it('estimates are off by at most 15% and rounded to 5, and shift with the turn', () => {
    const { s } = freshGame();
    const c = s.C[5]!;
    const real = defence(c);
    const seen = new Set<number>();
    for (let t = 0; t < 31; t++) {
      s.turn = t;
      const e = estDef(s, c);
      seen.add(e);
      expect(e % 5).toBe(0);
      expect(e).toBeGreaterThanOrEqual(Math.max(5, Math.round((real * 0.85) / 5) * 5));
      expect(e).toBeLessThanOrEqual(Math.round((real * 1.15) / 5) * 5);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('troop counts are exact at home, ~approximate at the border, and ? beyond', () => {
    const { s } = freshGame();
    expect(seenTroops(s, s.C[4]!)).toBe('8');
    expect(bordersYou(s, s.C[5]!)).toBe(true);
    expect(seenTroops(s, s.C[5]!)).toMatch(/^~\d+$/);
    const far = s.C[2]!; // Larkholt, two steps from your land
    expect(bordersYou(s, far)).toBe(false);
    expect(seenTroops(s, far)).toBe('?');
  });
});
