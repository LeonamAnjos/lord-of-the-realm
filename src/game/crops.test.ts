import { describe, expect, it } from 'vitest';
import { economyTick, farmLimit, fieldWorkers, harvestForecast, prod, realmFed, seasonStart, sownAfter } from './economy';
import { newGame } from './state';
import { createRng } from './rng';
import { endSeason } from './turn';
import { parseSave, serialize } from './save';
import { battle } from './combat';
import { setWork } from './actions';
import { RULES } from './data';

const SPRING = 0, SUMMER = 1, AUTUMN = 2, WINTER = 3;

function crops(over: { pop?: number; farm?: number; mood?: number } = {}) {
  const rng = createRng(7);
  const s = newGame(rng, 7, { crops: true });
  const c = s.C[4]!; // Ashdown, soil 1.1
  c.pop = over.pop ?? 100; c.mood = over.mood ?? 100;
  c.work = { farm: over.farm ?? 50, wood: 20, mine: 10 };
  return { s, rng, c };
}
const CAP = RULES.crops.workersBase + RULES.crops.workersPerSoil * 1.1; // 76

describe('crop year', () => {
  it('is off in a classic game: seasons yield as before', () => {
    const s = newGame(createRng(1), 1);
    expect(s.crops).toBeUndefined();
    expect(prod(s.C[4]!, SPRING).grain).toBeGreaterThan(0);
  });

  it('starts with more grain and says so in the chronicle', () => {
    const { s } = crops();
    expect(s.lords.every((l) => l.stock.grain === RULES.crops.startGrain)).toBe(true);
    expect(s.log.some((e) => e.txt.startsWith('The crop year'))).toBe(true);
  });

  it('gives no grain in spring, summer or winter; only the autumn harvest', () => {
    const { c } = crops();
    c.sown = 50;
    for (const se of [SPRING, SUMMER, WINTER]) expect(prod(c, se, true).grain).toBe(0);
    expect(prod(c, AUTUMN, true).grain).toBeCloseTo(50 * 1.3 * 1.1 * RULES.crops.harvestMult, 6);
  });

  it('a small population plants less than the land holds, even if everyone farms', () => {
    const { c } = crops({ pop: 40, farm: 100 });
    expect(sownAfter(c, SPRING)).toBe(40);
    expect(farmLimit(c, SPRING, true)).toBe(100);
  });

  it('a big population cannot plant past what the land holds; the rest are idle', () => {
    const { c } = crops({ pop: 200, farm: 60 }); // 120 farmers, land holds 76
    expect(sownAfter(c, SPRING)).toBeCloseTo(CAP, 6);
    expect(farmLimit(c, SPRING, true)).toBe(Math.floor((100 * CAP) / 200 / 5) * 5); // 35
    expect(farmLimit(c, WINTER, true)).toBe(0);
  });

  it('better soil holds more workers', () => {
    const { s } = crops();
    expect(fieldWorkers(s.C[7]!)).toBeGreaterThan(fieldWorkers(s.C[5]!)); // Fenwick 1.3 vs Ironby 0.7
  });

  it('setWork refuses farmers beyond the land', () => {
    const { s, c } = crops({ pop: 200, farm: 30 });
    c.work = { farm: 30, wood: 0, mine: 0 };
    expect(setWork(s, c, 'farm', 5)).toBe(true);   // 35
    expect(setWork(s, c, 'farm', 5)).toBe(false);  // 40 > 35
  });

  it('sowing in the economy tick records the crop; summer keeps only what is tended; autumn reaps it and empties the fields', () => {
    const { s, c } = crops({ pop: 100, farm: 50 });
    s.turn = 0; economyTick(s);
    expect(c.sown).toBeCloseTo(50, 6);
    const pop = c.pop;
    c.work.farm = 30; s.turn = 1; economyTick(s);
    expect(c.sown).toBeCloseTo(pop * 0.3, 6); // only the tended part survives
    const kept = c.sown!;
    c.work.farm = 80; s.turn = 2;
    const before = s.lords[0]!.stock.grain;
    economyTick(s);
    expect(c.sown).toBe(0);
    expect(s.lords[0]!.stock.grain).toBeGreaterThan(before - 1000); // sanity
    expect(harvestForecast(c, SPRING)).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it('too few hands in autumn lets the crop rot: harvest is capped by the farmers', () => {
    const { c } = crops({ pop: 100, farm: 10 });
    c.sown = 50;
    expect(prod(c, AUTUMN, true).grain).toBeCloseTo(10 * 1.3 * 1.1 * RULES.crops.harvestMult, 6);
  });

  it('the forecast sees the coming harvest from spring', () => {
    const { c } = crops({ pop: 100, farm: 50 });
    expect(harvestForecast(c, SPRING)).toBeCloseTo(50 * 1.3 * 1.1 * RULES.crops.harvestMult, 6);
    expect(harvestForecast(c, WINTER)).toBe(0);
  });

  it('realmFed in spring counts only the store', () => {
    const { s } = crops();
    s.lords[0]!.stock.grain = 0;
    expect(realmFed(s, 0)).toBe(false);
  });

  it('a county taken in war keeps half its sown crop', () => {
    const { s, rng } = crops();
    const to = s.C[5]!; // Ironby, a rival's
    to.sown = 40;
    const from = s.C[4]!;
    from.g = { spear: 0, archer: 0, knight: 200 }; from.arr = { spear: 0, archer: 0, knight: 0 };
    battle(s, rng, from, to, from.g);
    expect(to.owner).toBe(0);
    expect(to.sown).toBe(20);
  });

  it('survives a save and a load, and a whole game year runs', () => {
    const { s, rng } = crops();
    for (let i = 0; i < 8; i++) endSeason(s, rng);
    const back = parseSave(serialize(s, rng, { sel: 4, tab: 'county', help: false }));
    expect(back?.state.crops).toBe(true);
    expect(back?.state.C[4]!.sown).toBe(s.C[4]!.sown);
    seasonStart(back!.state);
  });
});
