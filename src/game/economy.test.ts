import { describe, expect, it } from 'vitest';
import { applyFarmLimit, buyCost, buy, craft, eat, economyTick, farmLimit, forecast, marketDrift, moodDelta, popRate, prod, realmFed, rollEvent, sell, sellGain, seasonStart, taxGold } from './economy';
import { setWork } from './actions';
import { counties } from './state';
import { constant, freshGame, scripted } from './fixtures';
import { createRng } from './rng';

const SPRING = 0, SUMMER = 1, AUTUMN = 2, WINTER = 3;

/** Ashdown (id 4: soil 1.1, timber 1, ore 0.8) set up with round numbers. */
function ashdown(over: Partial<{ pop: number; mood: number; farm: number; wood: number; mine: number }> = {}) {
  const { s, rng } = freshGame();
  const c = s.C[4]!;
  c.pop = over.pop ?? 100;
  c.mood = over.mood ?? 100;
  c.work = { farm: over.farm ?? 50, wood: over.wood ?? 20, mine: over.mine ?? 10 };
  return { s, rng, c };
}

describe('production', () => {
  it('grain = pop * farm% * 1.3 * soil * season * mood factor', () => {
    const { c } = ashdown();
    expect(prod(c, AUTUMN).grain).toBeCloseTo(100 * 0.5 * 1.3 * 1.1 * 2.2, 6); // 157.3
    expect(prod(c, SPRING).grain).toBeCloseTo(100 * 0.5 * 1.3 * 1.1 * 0.8, 6);
    expect(prod(c, SUMMER).grain).toBeCloseTo(100 * 0.5 * 1.3 * 1.1 * 1.1, 6);
    expect(prod(c, WINTER).grain).toBe(0);
  });

  it('mood factor is 0.6 + 0.4 * mood / 100', () => {
    const full = ashdown({ mood: 100 }).c, half = ashdown({ mood: 50 }).c, zero = ashdown({ mood: 0 }).c;
    expect(prod(half, AUTUMN).grain).toBeCloseTo(prod(full, AUTUMN).grain * 0.8, 6);
    expect(prod(zero, AUTUMN).grain).toBeCloseTo(prod(full, AUTUMN).grain * 0.6, 6);
  });

  it('wood = pop * wood% * timber * season, with 0.6 in winter', () => {
    const { c } = ashdown();
    expect(prod(c, SPRING).wood).toBeCloseTo(100 * 0.2 * 1, 6);
    expect(prod(c, WINTER).wood).toBeCloseTo(100 * 0.2 * 1 * 0.6, 6);
  });

  it('iron = pop * mine% * 0.7 * ore, and nothing without ore', () => {
    const { c, s } = ashdown();
    expect(prod(c, SPRING).iron).toBeCloseTo(100 * 0.1 * 0.7 * 0.8, 6); // 5.6
    const larkholt = s.C[2]!; // no ore
    larkholt.work = { farm: 0, wood: 0, mine: 50 };
    expect(prod(larkholt, SPRING).iron).toBe(0);
  });

  it('crafts gold = pop * idle% * 0.15; tax gold = pop * rate', () => {
    const { c } = ashdown({ farm: 45, wood: 15, mine: 5 }); // 35% idle
    expect(craft(c)).toBeCloseTo(100 * 0.35 * 0.15, 6); // 5.25
    c.tax = 0; expect(taxGold(c)).toBe(0);
    c.tax = 1; expect(taxGold(c)).toBeCloseTo(20, 6);
    c.tax = 2; expect(taxGold(c)).toBeCloseTo(40, 6);
    c.tax = 3; expect(taxGold(c)).toBeCloseTo(70, 6);
  });

  it('everyone, soldiers included, eats by ration', () => {
    const { c } = ashdown(); // 100 people + 8 soldiers
    c.ration = 1; expect(eat(c)).toBeCloseTo(108 * 0.5, 6);
    c.ration = 0; expect(eat(c)).toBeCloseTo(108 * 0.3, 6);
    c.ration = 2; expect(eat(c)).toBeCloseTo(108 * 0.7, 6);
  });

  it('forecast adds tax + crafts - upkeep per county', () => {
    const { s } = freshGame();
    for (const c of counties(s, 0)) { c.pop = 100; c.mood = 100; c.work = { farm: 45, wood: 15, mine: 5 }; }
    // each county: tax 40 + crafts 5.25 - upkeep (6 spear * 0.2 + 2 archer * 0.3 = 1.8)
    expect(forecast(s, 0).gold).toBeCloseTo(3 * (40 + 5.25 - 1.8), 6);
  });
});

describe('farm limit', () => {
  const soil = (f: number) => ({ f }) as never;
  it('base [70, 60, 80, 0] times (0.6 + 0.4 * soil), floored to 5', () => {
    expect([SPRING, SUMMER, AUTUMN, WINTER].map((s) => farmLimit(soil(1), s))).toEqual([70, 60, 80, 0]);
    expect([SPRING, SUMMER, AUTUMN, WINTER].map((s) => farmLimit(soil(0.7), s))).toEqual([60, 50, 70, 0]);
    expect([SPRING, SUMMER, AUTUMN, WINTER].map((s) => farmLimit(soil(1.3), s))).toEqual([75, 65, 85, 0]);
  });

  it('farmers above the limit move to crafts; the chosen % is restored when allowed', () => {
    const { s } = freshGame();
    const c = s.C[4]!; // soil 1.1
    c.pop = 100; c.work = { farm: 45, wood: 15, mine: 5 }; c.farmPref = 45;
    s.turn = WINTER;
    expect(applyFarmLimit(s, c)).toBe(45); // 45% of 100 people
    expect(c.work.farm).toBe(0);
    expect(c.farmPref).toBe(45);
    s.turn = 4; // spring again
    expect(applyFarmLimit(s, c)).toBe(0);
    expect(c.work.farm).toBe(45);
  });

  it('seasonStart only holds the player\'s counties and logs the move', () => {
    const { s } = freshGame();
    s.turn = WINTER;
    const moved = seasonStart(s);
    expect(moved).toBeGreaterThan(0);
    for (const c of counties(s, 0)) expect(c.work.farm).toBe(0);
    for (const c of counties(s, 1)) expect(c.work.farm).toBe(45); // rivals are untouched here
    expect(s.log.at(-1)!.txt).toMatch(/farmers in 3 counties/);
  });

  it('the slider cannot go past the limit, past 100%, or raise mining without ore; lowering ore-less mining works', () => {
    const { s } = freshGame();
    const c = s.C[4]!;
    c.work = { farm: 65, wood: 15, mine: 5 }; c.farmPref = 65;
    s.turn = SPRING; // limit for soil 1.1 is 70
    expect(setWork(s, c, 'farm', 5)).toBe(true);
    expect(c.work.farm).toBe(70);
    expect(setWork(s, c, 'farm', 5)).toBe(false); // over the limit
    c.work = { farm: 40, wood: 30, mine: 30 };
    expect(setWork(s, c, 'wood', 5)).toBe(false); // nobody idle
    const lark = s.C[2]!; // no ore
    lark.work = { farm: 45, wood: 15, mine: 0 };
    expect(setWork(s, lark, 'mine', 5)).toBe(false);
    lark.work.mine = 5; // a stuck legacy value
    expect(setWork(s, lark, 'mine', -5)).toBe(true);
    expect(lark.work.mine).toBe(0);
  });
});

describe('food', () => {
  it('fed is stock + harvest >= meals, equal counts as fed', () => {
    const { s } = freshGame();
    for (const c of counties(s, 0)) { c.pop = 100; c.g = { spear: 0, archer: 0, knight: 0 }; c.work = { farm: 0, wood: 0, mine: 0 }; c.ration = 1; }
    s.lords[0]!.stock.grain = 150; // 3 counties * 50
    expect(realmFed(s)).toBe(true);
    s.lords[0]!.stock.grain = 149;
    expect(realmFed(s)).toBe(false);
  });
});

describe('mood', () => {
  const setup = (tax: number, ration: number, mood: number) => {
    const { s } = freshGame();
    s.lords[0]!.stock.grain = 5000;
    const c = s.C[4]!;
    c.tax = tax; c.ration = ration; c.mood = mood; c.pop = 100;
    return { s, c };
  };

  it('moves each season by tax mood + 2 + ration mood when fed', () => {
    const cases: [number, number, number][] = [
      [0, 1, 7], [1, 1, 3], [2, 1, -1], [3, 1, -7], // tax None..High at Normal rations
      [2, 0, -9], [2, 2, 5], [3, 2, -1],             // rations Scant / Generous
    ];
    for (const [tax, ration, delta] of cases) {
      const { s, c } = setup(tax, ration, 60);
      expect(moodDelta(s, c)).toBe(delta);
      economyTick(s);
      expect(c.mood).toBe(60 + delta);
    }
  });

  it('is -15 plus tax mood when the realm goes hungry', () => {
    const { s, c } = setup(2, 1, 60);
    s.lords[0]!.stock.grain = 0;
    for (const x of counties(s, 0)) x.work.farm = 0;
    expect(moodDelta(s, c)).toBe(-18);
    economyTick(s);
    expect(c.mood).toBe(42);
  });

  it('is clamped to 0..100', () => {
    const hi = setup(0, 2, 98); // +13 would overshoot
    expect(moodDelta(hi.s, hi.c)).toBe(2);
    economyTick(hi.s);
    expect(hi.c.mood).toBe(100);
    const lo = setup(3, 0, 3);
    economyTick(lo.s);
    expect(lo.c.mood).toBe(0);
  });
});

describe('population', () => {
  const c0 = () => ashdown({ pop: 100 }).c; // soil 1.1, cap 177
  it('growth = pop * 0.12 * clamp((mood-40)/30, 0, 1.5) * (1 - pop/cap) when fed and under the cap', () => {
    const c = c0();
    expect(popRate(c, 70, true)).toBeCloseTo(100 * 0.12 * 1 * (1 - 100 / 177), 6); // 5.2203
    expect(popRate(c, 100, true)).toBeCloseTo(100 * 0.12 * 1.5 * (1 - 100 / 177), 6); // factor caps at 1.5
    expect(popRate(c, 55, true)).toBeCloseTo(100 * 0.12 * 0.5 * (1 - 100 / 177), 6);
    expect(popRate(c, 40, true)).toBe(0);
  });

  it('no growth when hungry or at the cap', () => {
    const c = c0();
    expect(popRate(c, 70, false)).toBe(0);
    c.pop = 177;
    expect(popRate(c, 100, true)).toBe(0);
  });

  it('people leave below mood 40, and 3% more below 20', () => {
    const c = c0();
    expect(popRate(c, 30, true)).toBeCloseTo(-(100 * 10 * 0.00075), 6); // -0.75
    expect(popRate(c, 10, true)).toBeCloseTo(-(100 * 30 * 0.00075) - 3, 6); // -5.25
  });

  it('carries the fraction between seasons', () => {
    const { s } = freshGame();
    s.lords[0]!.stock.grain = 5000;
    const c = s.C[4]!;
    c.pop = 100; c.tax = 1; c.ration = 1; c.pf = 0.3;
    c.mood = 67; // +1 tax, +2 fed = 70
    economyTick(s);
    expect(c.pop).toBe(105);
    expect(c.pf).toBeCloseTo(0.3 + 5.2203 - 5, 3);
  });

  it('losses below a whole person wait until they add up', () => {
    const { s } = freshGame();
    s.lords[0]!.stock.grain = 5000;
    const c = s.C[4]!;
    c.pop = 100; c.tax = 2; c.pf = 0;
    c.mood = 31; economyTick(s); // 31 - 3 + 2 = 30, rate -0.75
    expect(c.pop).toBe(100);
    expect(c.pf).toBeCloseTo(-0.75, 6);
    c.mood = 31; economyTick(s);
    expect(c.pop).toBe(99);
    expect(c.pf).toBeCloseTo(-0.5, 6);
  });

  it('unrest (below 20) costs people, but never below 20 in a county', () => {
    const { s } = freshGame();
    s.lords[0]!.stock.grain = 5000;
    const c = s.C[4]!;
    c.pop = 100; c.tax = 2; c.mood = 11; economyTick(s); // 10 after the tick
    expect(c.pop).toBe(95); // -5.25 rounds toward zero to -5
    c.pop = 20; c.mood = 1; c.pf = 0; economyTick(s);
    expect(c.pop).toBe(20);
  });

  it('a famine cuts people by 2% plus up to 12% of the shortfall, and soldiers by up to 10%', () => {
    const { s } = freshGame();
    const c = s.C[4]!;
    s.lords[0]!.stock.grain = 0;
    for (const x of counties(s, 0)) x.work.farm = 0;
    c.pop = 100;
    economyTick(s); // nothing to eat at all: ratio 0
    expect(c.pop).toBe(86); // round(100 * (1 - 0.12 - 0.02))
    expect(c.g.spear).toBe(5); // 6 - round(0.6)
    expect(c.g.archer).toBe(2); // 2 - round(0.2)
    expect(s.lords[0]!.stock.grain).toBe(0);
  });

  it('half-fed lands in between', () => {
    const { s } = freshGame();
    for (const x of counties(s, 0)) { x.pop = 100; x.work.farm = 0; x.g = { spear: 0, archer: 0, knight: 0 }; }
    s.lords[0]!.stock.grain = 75; // need 150, so ratio 0.5
    economyTick(s);
    expect(s.C[4]!.pop).toBe(Math.round(100 * (1 - 0.12 * 0.5 - 0.02))); // 92
  });
});

describe('upkeep and desertion', () => {
  it('unpaid upkeep: treasury is zeroed and 20% of every troop type deserts', () => {
    const { s } = freshGame();
    s.lords[0]!.stock.grain = 100000;
    s.lords[0]!.stock.gold = 0;
    for (const c of counties(s, 0)) { c.tax = 0; c.work = { farm: 0, wood: 0, mine: 0 }; c.pop = 20; c.g = { spear: 0, archer: 0, knight: 0 }; }
    const c = s.C[4]!;
    c.g = { spear: 100, archer: 0, knight: 0 }; // upkeep 20, crafts 0
    economyTick(s);
    expect(s.lords[0]!.stock.gold).toBe(0);
    expect(c.g.spear).toBe(80);
  });

  it('paid upkeep leaves the troops alone and clears the arrival and muster marks', () => {
    const { s } = freshGame();
    s.lords[0]!.stock.grain = 5000;
    const c = s.C[4]!;
    c.arr = { spear: 2, archer: 0, knight: 0 }; c.mus = { spear: 2, archer: 0, knight: 0 };
    economyTick(s);
    expect(c.g).toEqual({ spear: 6, archer: 2, knight: 0 });
    expect(c.arr).toEqual({ spear: 0, archer: 0, knight: 0 });
    expect(c.mus).toEqual({ spear: 0, archer: 0, knight: 0 });
  });
});

describe('market', () => {
  it('buys at 1.15x and sells at 0.85x in lots of 10 (winter grain is dearest)', () => {
    const { s } = freshGame();
    s.turn = WINTER;
    expect(buyCost(s, 'grain')).toBe(35); // 2 * 1.5 = 3 each, 34.5 rounded up
    expect(sellGain(s, 'grain')).toBe(25); // 25.5 rounded down
    expect(buyCost(s, 'iron')).toBe(81); // 80.5
    expect(sellGain(s, 'iron')).toBe(59); // 59.5
    expect(buyCost(s, 'wood')).toBe(35);
    expect(sellGain(s, 'wood')).toBe(25);
    s.turn = AUTUMN; // 0.6x grain after harvest
    expect(buyCost(s, 'grain')).toBe(14); // 1.2 each => 13.8
    s.market.iron = 1.6;
    expect(buyCost(s, 'iron')).toBe(129); // 11.2 each => 128.8
  });

  it('buy and sell move one lot and refuse when you cannot pay', () => {
    const { s } = freshGame();
    s.turn = WINTER;
    const st = s.lords[0]!.stock;
    const gold = st.gold, grain = st.grain;
    expect(buy(s, 'grain')).toBe(true);
    expect([st.gold, st.grain]).toEqual([gold - 35, grain + 10]);
    expect(sell(s, 'grain')).toBe(true);
    expect([st.gold, st.grain]).toEqual([gold - 35 + 25, grain]);
    st.gold = 34;
    expect(buy(s, 'grain')).toBe(false);
    st.wood = 9;
    expect(sell(s, 'wood')).toBe(false);
  });

  it('drift stays within 0.6 to 1.6 and moves with the generator', () => {
    const { s } = freshGame();
    const rng = createRng(3);
    for (let i = 0; i < 2000; i++) {
      marketDrift(s, rng);
      for (const k of ['grain', 'wood', 'iron'] as const) { expect(s.market[k]).toBeGreaterThanOrEqual(0.6); expect(s.market[k]).toBeLessThanOrEqual(1.6); }
    }
    const a = freshGame().s, b = freshGame().s;
    marketDrift(a, constant(1)); marketDrift(b, constant(0));
    expect(a.market.grain).toBeGreaterThan(1);
    expect(b.market.grain).toBeLessThan(1);
  });
});

describe('events', () => {
  // rollEvent draws: trigger roll, county pick, kind roll, (amount roll)
  it('nothing happens above 25%', () => {
    const { s } = freshGame();
    const before = JSON.stringify(s);
    rollEvent(s, scripted([0.26]));
    expect(JSON.stringify(s)).toBe(before);
  });

  it('plague kills 12% of a county over 60 people', () => {
    const { s } = freshGame();
    const c = counties(s, 0)[0]!;
    c.pop = 100;
    rollEvent(s, scripted([0.1, 0, 0.1]));
    expect(c.pop).toBe(88);
    expect(s.log.at(-1)!.txt).toMatch(/Plague/);
  });

  it('a small county (60 or fewer) turns the plague roll into a bumper yield', () => {
    const { s } = freshGame();
    const c = counties(s, 0)[0]!;
    c.pop = 60;
    const grain = s.lords[0]!.stock.grain;
    rollEvent(s, scripted([0.1, 0, 0.1, 0]));
    expect(c.pop).toBe(60);
    expect(s.lords[0]!.stock.grain).toBe(grain + 30);
  });

  it('bumper yield gives 30 to 70 grain', () => {
    const { s } = freshGame();
    const grain = s.lords[0]!.stock.grain;
    rollEvent(s, scripted([0.1, 0, 0.3, 0.5]));
    expect(s.lords[0]!.stock.grain).toBe(grain + 50);
  });

  it('bandits take 12% of your gold, at most 60', () => {
    const a = freshGame().s; // 150 gold
    rollEvent(a, scripted([0.1, 0, 0.6]));
    expect(a.lords[0]!.stock.gold).toBe(132);
    const b = freshGame().s;
    b.lords[0]!.stock.gold = 1000;
    rollEvent(b, scripted([0.1, 0, 0.6]));
    expect(b.lords[0]!.stock.gold).toBe(940);
  });

  it('a merchant caravan pays 25 to 55 gold', () => {
    const { s } = freshGame();
    rollEvent(s, scripted([0.1, 0, 0.9, 0.5]));
    expect(s.lords[0]!.stock.gold).toBe(150 + 40);
  });

  it('happens about a quarter of the time', () => {
    const rng = createRng(11);
    let hits = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const { s } = freshGame();
      const before = s.log.length;
      rollEvent(s, rng);
      if (s.log.length > before) hits++;
    }
    expect(hits / n).toBeGreaterThan(0.21);
    expect(hits / n).toBeLessThan(0.29);
  });
});
