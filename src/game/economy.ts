import { BASE, FARM_LIMIT, RULES, FARM_MULT, GRAIN_SEASON, KINDS, RATION, SEASONS, TAX, WOOD_MULT } from './data';
import { type Rng, index, range } from './rng';
import { capOf, clamp, counties, idlePct, logEv, season, troops, upkeep, zero } from './state';
import type { County, GameState, Stock } from './types';
import { banditStrength, pendingTitle } from './choices';

const CR = RULES.crops, P = RULES.production, M = RULES.mood, POP = RULES.population, FAM = RULES.famine, MK = RULES.market, EV = RULES.events;

/** Crop year rules: how many people the fields of a county can use. Better soil has more fields. */
export const fieldWorkers = (c: County): number => CR.workersBase + CR.workersPerSoil * c.f;
const farmers = (c: County): number => (c.pop * c.work.farm) / 100;

/**
 * Crop year rules: the crop standing in the fields (in people-worth) once season `se` has run.
 * Spring: whoever farms sows, up to what the land holds. Summer: only the sown crop that gets tended survives.
 * Autumn: the harvest takes it. Winter: the fields lie empty.
 */
export function sownAfter(c: County, se: number): number {
  if (se === 0) return Math.min(farmers(c), fieldWorkers(c));
  if (se === 1) return Math.min(c.sown ?? 0, farmers(c));
  return se === 2 ? (c.sown ?? 0) : 0;
}

/** Crop year rules: seasons the store must feed everyone alone before grain comes in, by current season. */
export const SEASONS_TO_HARVEST = [2, 1, 0, 3] as const;

/** Crop year rules: grain the autumn harvest would bring at today's jobs and mood, as seen from season `se`. */
export function harvestForecast(c: County, se: number): number {
  if (se === 3) return 0;
  const crop = se === 2 ? Math.min(farmers(c), c.sown ?? 0) : sownAfter(c, se);
  return crop * P.grainPerFarmer * c.f * CR.harvestMult * (P.moodFloor + (P.moodRange * c.mood) / 100);
}

/** Per-season production of one county in season `s`. With the crop year rules all grain comes in autumn, from what was sown. */
export function prod(c: County, s: number, crops = false) {
  const f = P.moodFloor + (P.moodRange * c.mood) / 100;
  return {
    grain: crops ? (s === 2 ? harvestForecast(c, 2) : 0) : farmers(c) * P.grainPerFarmer * c.f * FARM_MULT[s]! * f,
    wood: ((c.pop * c.work.wood) / 100) * c.w * WOOD_MULT[s]! * f,
    iron: ((c.pop * c.work.mine) / 100) * P.ironPerMiner * c.i * f,
  };
}

/** Grain eaten in a season, soldiers included. */
export const eat = (c: County): number => (c.pop + troops(c)) * RATION[c.ration]!.a;
export const craft = (c: County): number => ((c.pop * idlePct(c)) / 100) * P.craftGoldPerPerson;
export const taxGold = (c: County): number => c.pop * TAX[c.tax]!.g;

/** Will this lord's stock plus this season's harvest cover everyone's meals? */
export function realmFed(s: GameState, lord = 0): boolean {
  const se = season(s);
  let g = s.lords[lord]!.stock.grain;
  for (const c of counties(s, lord)) g += prod(c, se, s.crops).grain - eat(c);
  return g >= 0;
}

/** Mood change this season (after the 0 to 100 clamp), assuming the lord's fed check as it stands now. */
export function moodDelta(s: GameState, c: County): number {
  const d = TAX[c.tax]!.m + (realmFed(s, 0) ? M.fed + RATION[c.ration]!.m : M.famine);
  return clamp(c.mood + d, M.min, M.max) - c.mood;
}

/** Expected change in people this season at a given mood (a real number; the game carries the fraction forward). */
export function popRate(c: County, mood: number, fed: boolean): number {
  mood = clamp(mood, M.min, M.max);
  const cap = capOf(c);
  let d = 0;
  if (fed && c.pop < cap) d += c.pop * POP.growthRate * clamp((mood - POP.growthStartsAtMood) / POP.growthFullSpeedSpan, 0, POP.growthMaxMultiplier) * (1 - c.pop / cap);
  if (mood < POP.unhappyBelowMood) d -= c.pop * (POP.unhappyBelowMood - mood) * POP.unhappyLossPerPoint;
  if (mood < POP.rebelBelowMood) d -= c.pop * POP.rebelLoss;
  return d;
}

/** Most people the fields can use in a season. Better soil supports more. */
export function farmLimit(c: County, s: number, crops = false): number {
  if (crops) return s === 3 ? 0 : Math.min(100, Math.floor((100 * fieldWorkers(c)) / c.pop / P.farmLimitStep) * P.farmLimitStep);
  return Math.min(100, Math.floor((FARM_LIMIT[s]! * (P.farmLimitSoilFloor + P.farmLimitSoilRange * c.f)) / P.farmLimitStep) * P.farmLimitStep);
}

/** Clamp farming to the limit (restoring the chosen `farmPref` when allowed). Returns how many people moved to crafts. */
export function applyFarmLimit(s: GameState, c: County): number {
  const want = c.farmPref === undefined ? c.work.farm : c.farmPref;
  const free = 100 - c.work.wood - c.work.mine;
  const nf = Math.max(0, Math.min(want, farmLimit(c, season(s), !!s.crops), free));
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
    const p = prod(c, se, s.crops);
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
    let gr = 0, wd = 0, ir = 0, need = 0, gold = 0, rotted = 0;
    for (const c of cs) {
      const p = prod(c, se, s.crops);
      if (s.crops && l === 0 && se === 2) rotted += Math.max(0, (c.sown ?? 0) - farmers(c));
      if (s.crops) c.sown = sownAfter(c, se) * (se === 2 ? 0 : 1);
      gr += p.grain; wd += p.wood; ir += p.iron;
      need += eat(c);
      gold += taxGold(c) + craft(c) - upkeep(c);
    }
    if (rotted >= 1) logEv(s, `Too few hands at harvest: about ${Math.round(rotted * P.grainPerFarmer * CR.harvestMult)} grain of crop was left to rot.`, 'warn');
    const avail = L.stock.grain + gr;
    const fed = avail >= need;
    const ratio = need > 0 ? Math.min(1, avail / need) : 1;
    L.stock.grain = fed ? avail - need : 0;
    L.stock.wood += wd; L.stock.iron += ir; L.stock.gold += gold;
    let unpaid = false;
    if (L.stock.gold < 0) { L.stock.gold = 0; unpaid = true; }
    for (const c of cs) {
      c.mood += TAX[c.tax]!.m + (fed ? M.fed + RATION[c.ration]!.m : M.famine);
      if (!fed) {
        c.pop = Math.max(POP.min, Math.round(c.pop * (1 - FAM.popLossPerShortfall * (1 - ratio) - FAM.popLossFlat)));
        for (const k of KINDS) c.g[k] -= Math.round(c.g[k] * FAM.troopLossPerShortfall * (1 - ratio));
      }
      /* Mood sets the pace: growth rises from nothing at 40 to full speed at 70 and 1.5x at 100; below 40 people drift away. */
      c.pf = (c.pf || 0) + popRate(c, c.mood, fed);
      const whole = c.pf >= 0 ? Math.floor(c.pf) : Math.ceil(c.pf);
      c.pf -= whole;
      c.pop = Math.max(POP.min, c.pop + whole);
      if (c.mood < POP.rebelBelowMood && l === 0) logEv(s, `Unrest in ${c.name}: people are leaving.`, 'bad');
      if (unpaid) for (const k of KINDS) c.g[k] -= Math.round(c.g[k] * FAM.unpaidDesertion);
      c.mood = clamp(c.mood, M.min, M.max);
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
    const m = s.market[k] * (1 + (rng() - 0.5) * MK.driftSize);
    s.market[k] = clamp(m + (1 - m) * MK.pullBack, MK.min, MK.max);
  }
}

/** Mid price per unit (before the 1.15x buy / 0.85x sell spread). Grain is dearest in winter. */
export function marketPrice(s: GameState, k: 'grain' | 'wood' | 'iron'): number {
  return BASE[k] * s.market[k] * (k === 'grain' ? GRAIN_SEASON[season(s)]! : 1);
}
export const buyCost = (s: GameState, k: 'grain' | 'wood' | 'iron'): number => Math.ceil(marketPrice(s, k) * MK.buyMultiplier * MK.lot);
export const sellGain = (s: GameState, k: 'grain' | 'wood' | 'iron'): number => Math.floor(marketPrice(s, k) * MK.sellMultiplier * MK.lot);

/** Buy one lot (10 by default). */
export function buy(s: GameState, k: 'grain' | 'wood' | 'iron'): boolean {
  const st = s.lords[0]!.stock, cost = buyCost(s, k);
  if (st.gold < cost) return false;
  st.gold -= cost; st[k] += MK.lot;
  return true;
}
/** Sell one lot (10 by default). */
export function sell(s: GameState, k: 'grain' | 'wood' | 'iron'): boolean {
  const st = s.lords[0]!.stock, gain = sellGain(s, k);
  if (st[k] < MK.lot) return false;
  st[k] -= MK.lot; st.gold += gain;
  return true;
}

/* ---------- Events ---------- */

/** 25% a season, on one of your counties: plague, bumper yield, bandits or a merchant caravan. */
export function rollEvent(s: GameState, rng: Rng): void {
  if (rng() > EV.chance) return;
  const mine = counties(s, 0);
  if (!mine.length) return;
  const c = mine[index(rng, mine.length)]!;
  const st = s.lords[0]!.stock;
  const r = rng();
  if (s.decide) {
    // Same rolls as a classic game; the outcome waits for your answer (see choices.ts).
    const t = s.turn + 1;
    if (r < 0.25 && c.pop > EV.plague.onlyAbovePeople) s.pending = { kind: 'plague', c: c.id, n: Math.round(c.pop * EV.plague.share), t };
    else if (r < 0.5) s.pending = { kind: 'bumper', c: c.id, n: Math.round(range(rng, EV.bumper.min, EV.bumper.max)), t };
    else if (r < 0.75) s.pending = { kind: 'bandits', c: c.id, n: Math.min(Math.round(st.gold * EV.bandits.share), EV.bandits.max), t, band: banditStrength(s, rng) };
    else s.pending = { kind: 'caravan', c: c.id, n: Math.round(range(rng, EV.caravan.min, EV.caravan.max)), t };
    logEv(s, `${pendingTitle(s, s.pending)}: your decision is needed.`);
    return;
  }
  if (r < 0.25 && c.pop > EV.plague.onlyAbovePeople) {
    const loss = Math.round(c.pop * EV.plague.share);
    c.pop -= loss;
    logEv(s, `Plague in ${c.name}: ${loss} villagers died.`, 'bad');
  } else if (r < 0.5) {
    const g = Math.round(range(rng, EV.bumper.min, EV.bumper.max));
    st.grain += g;
    logEv(s, `A bountiful yield in ${c.name}: +${g} grain.`, 'good');
  } else if (r < 0.75) {
    const m = Math.min(Math.round(st.gold * EV.bandits.share), EV.bandits.max);
    st.gold -= m;
    logEv(s, `Bandits raid ${c.name} and carry off ${m} gold.`, 'bad');
  } else {
    const t = Math.round(range(rng, EV.caravan.min, EV.caravan.max));
    st.gold += t;
    logEv(s, `A merchant caravan pays ${t} gold in tolls at ${c.name}.`, 'good');
  }
}

