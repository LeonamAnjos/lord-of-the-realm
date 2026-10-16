import { BASE, FARM_LIMIT, FARM_MULT, GRAIN_SEASON, KINDS, RATION, SEASONS, TAX, WOOD_MULT } from './data';
import { type Rng, index, range } from './rng';
import { capOf, clamp, counties, idlePct, logEv, season, troops, upkeep, zero } from './state';
import type { County, GameState, Stock } from './types';

/** Per-season production of one county in season `s`. */
export function prod(c: County, s: number) {
  const f = 0.6 + (0.4 * c.mood) / 100;
  return {
    grain: ((c.pop * c.work.farm) / 100) * 1.3 * c.f * FARM_MULT[s]! * f,
    wood: ((c.pop * c.work.wood) / 100) * c.w * WOOD_MULT[s]! * f,
    iron: ((c.pop * c.work.mine) / 100) * 0.7 * c.i * f,
  };
}

/** Grain eaten in a season, soldiers included. */
export const eat = (c: County): number => (c.pop + troops(c)) * RATION[c.ration]!.a;
export const craft = (c: County): number => ((c.pop * idlePct(c)) / 100) * 0.15;
export const taxGold = (c: County): number => c.pop * TAX[c.tax]!.g;

/** Will this lord's stock plus this season's harvest cover everyone's meals? */
export function realmFed(s: GameState, lord = 0): boolean {
  const se = season(s);
  let g = s.lords[lord]!.stock.grain;
  for (const c of counties(s, lord)) g += prod(c, se).grain - eat(c);
  return g >= 0;
}

/** Mood change this season (after the 0 to 100 clamp), assuming the lord's fed check as it stands now. */
export function moodDelta(s: GameState, c: County): number {
  const d = TAX[c.tax]!.m + (realmFed(s, 0) ? 2 + RATION[c.ration]!.m : -15);
  return clamp(c.mood + d, 0, 100) - c.mood;
}

/** Expected change in people this season at a given mood (a real number; the game carries the fraction forward). */
export function popRate(c: County, mood: number, fed: boolean): number {
  mood = clamp(mood, 0, 100);
  const cap = capOf(c);
  let d = 0;
  if (fed && c.pop < cap) d += c.pop * 0.12 * clamp((mood - 40) / 30, 0, 1.5) * (1 - c.pop / cap);
  if (mood < 40) d -= c.pop * (40 - mood) * 0.00075;
  if (mood < 20) d -= c.pop * 0.03;
  return d;
}

/** Most people the fields can use in a season. Better soil supports more. */
export function farmLimit(c: County, s: number): number {
  return Math.min(100, Math.floor((FARM_LIMIT[s]! * (0.6 + 0.4 * c.f)) / 5) * 5);
}

/** Clamp farming to the limit (restoring the chosen `farmPref` when allowed). Returns how many people moved to crafts. */
export function applyFarmLimit(s: GameState, c: County): number {
  const want = c.farmPref === undefined ? c.work.farm : c.farmPref;
  const free = 100 - c.work.wood - c.work.mine;
  const nf = Math.max(0, Math.min(want, farmLimit(c, season(s)), free));
  const old = c.work.farm;
  c.work.farm = nf;
  return old > nf ? Math.round((c.pop * (old - nf)) / 100) : 0;
}

/** Start of a season: the player's farms are held to the season's limit. */
export function seasonStart(s: GameState): number {
  let moved = 0, n = 0;
  for (const c of counties(s, 0)) {
    const m = applyFarmLimit(s, c);
    if (m > 0) { moved += m; n++; }
  }
  if (moved > 0) {
    logEv(s, `${SEASONS[season(s)]}: ${moved} farmers in ${n}${n === 1 ? ' county have' : ' counties have'} no fields to work and now earn gold at the crafts.`);
  }
  return moved;
}

/** Net change per resource over one season for a lord, at current settings. */
export function forecast(s: GameState, lord: number): Stock {
  const se = season(s);
  const o: Stock = { gold: 0, grain: 0, wood: 0, iron: 0 };
  for (const c of counties(s, lord)) {
    const p = prod(c, se);
    o.grain += p.grain - eat(c);
    o.wood += p.wood;
    o.iron += p.iron;
    o.gold += taxGold(c) + craft(c) - upkeep(c);
  }
  return o;
}

/** Production, meals, tax, upkeep, mood, population and desertion for all lords. */
export function economyTick(s: GameState): void {
  const se = season(s);
  for (let l = 0; l < 4; l++) {
    const L = s.lords[l]!;
    if (!L.alive) continue;
    const cs = counties(s, l);
    let gr = 0, wd = 0, ir = 0, need = 0, gold = 0;
    for (const c of cs) {
      const p = prod(c, se);
      gr += p.grain; wd += p.wood; ir += p.iron;
      need += eat(c);
      gold += taxGold(c) + craft(c) - upkeep(c);
    }
    const avail = L.stock.grain + gr;
    const fed = avail >= need;
    const ratio = need > 0 ? Math.min(1, avail / need) : 1;
    L.stock.grain = fed ? avail - need : 0;
    L.stock.wood += wd; L.stock.iron += ir; L.stock.gold += gold;
    let unpaid = false;
    if (L.stock.gold < 0) { L.stock.gold = 0; unpaid = true; }
    for (const c of cs) {
      c.mood += TAX[c.tax]!.m + (fed ? 2 + RATION[c.ration]!.m : -15);
      if (!fed) {
        c.pop = Math.max(20, Math.round(c.pop * (1 - 0.12 * (1 - ratio) - 0.02)));
        for (const k of KINDS) c.g[k] -= Math.round(c.g[k] * 0.1 * (1 - ratio));
      }
      /* Mood sets the pace: growth rises from nothing at 40 to full speed at 70 and 1.5x at 100; below 40 people drift away. */
      c.pf = (c.pf || 0) + popRate(c, c.mood, fed);
      const whole = c.pf >= 0 ? Math.floor(c.pf) : Math.ceil(c.pf);
      c.pf -= whole;
      c.pop = Math.max(20, c.pop + whole);
      if (c.mood < 20 && l === 0) logEv(s, `Unrest in ${c.name}: people are leaving.`, 'bad');
      if (unpaid) for (const k of KINDS) c.g[k] -= Math.round(c.g[k] * 0.2);
      c.mood = clamp(c.mood, 0, 100);
      c.arr = zero();
      c.mus = zero();
    }
    if (l === 0) {
      if (!fed) logEv(s, 'Famine. The granaries are empty and the people go hungry.', 'bad');
      if (unpaid) logEv(s, 'The treasury is empty. Unpaid soldiers desert.', 'bad');
    }
  }
}

/* ---------- Market ---------- */

export function marketDrift(s: GameState, rng: Rng): void {
  for (const k of ['grain', 'wood', 'iron'] as const) {
    const m = s.market[k] * (1 + (rng() - 0.5) * 0.3);
    s.market[k] = clamp(m + (1 - m) * 0.1, 0.6, 1.6);
  }
}

/** Mid price per unit (before the 1.15x buy / 0.85x sell spread). Grain is dearest in winter. */
export function marketPrice(s: GameState, k: 'grain' | 'wood' | 'iron'): number {
  return BASE[k] * s.market[k] * (k === 'grain' ? GRAIN_SEASON[season(s)]! : 1);
}
export const buyCost = (s: GameState, k: 'grain' | 'wood' | 'iron'): number => Math.ceil(marketPrice(s, k) * 1.15 * 10);
export const sellGain = (s: GameState, k: 'grain' | 'wood' | 'iron'): number => Math.floor(marketPrice(s, k) * 0.85 * 10);

/** Buy a lot of 10. */
export function buy(s: GameState, k: 'grain' | 'wood' | 'iron'): boolean {
  const st = s.lords[0]!.stock, cost = buyCost(s, k);
  if (st.gold < cost) return false;
  st.gold -= cost; st[k] += 10;
  return true;
}
/** Sell a lot of 10. */
export function sell(s: GameState, k: 'grain' | 'wood' | 'iron'): boolean {
  const st = s.lords[0]!.stock, gain = sellGain(s, k);
  if (st[k] < 10) return false;
  st[k] -= 10; st.gold += gain;
  return true;
}

/* ---------- Events ---------- */

/** 25% a season, on one of your counties: plague, bumper yield, bandits or a merchant caravan. */
export function rollEvent(s: GameState, rng: Rng): void {
  if (rng() > 0.25) return;
  const mine = counties(s, 0);
  if (!mine.length) return;
  const c = mine[index(rng, mine.length)]!;
  const st = s.lords[0]!.stock;
  const r = rng();
  if (r < 0.25 && c.pop > 60) {
    const loss = Math.round(c.pop * 0.12);
    c.pop -= loss;
    logEv(s, `Plague in ${c.name}: ${loss} villagers died.`, 'bad');
  } else if (r < 0.5) {
    const g = Math.round(range(rng, 30, 70));
    st.grain += g;
    logEv(s, `A bountiful yield in ${c.name}: +${g} grain.`, 'good');
  } else if (r < 0.75) {
    const m = Math.min(Math.round(st.gold * 0.12), 60);
    st.gold -= m;
    logEv(s, `Bandits raid ${c.name} and carry off ${m} gold.`, 'bad');
  } else {
    const t = Math.round(range(rng, 25, 55));
    st.gold += t;
    logEv(s, `A merchant caravan pays ${t} gold in tolls at ${c.name}.`, 'good');
  }
}

