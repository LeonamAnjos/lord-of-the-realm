// "Unrest" rules: counties you conquer remember their old lord and may revolt while unhappy, and the rivals band
// together against you once you hold enough of the realm. Only used when `s.unrest` is set.
import { KINDS, NEUTRAL, NORMAL_RATION, NORMAL_TAX, RULES, U } from './data';
import { applyLoss, checkElim } from './combat';
import { applyFarmLimit, moodDelta } from './economy';
import { range, type Rng } from './rng';
import { clamp, counties, defaultWork, defOf, fortMult, logEv, lordName, stamp, zero } from './state';
import type { County, GameState } from './types';

const UN = RULES.unrest, B = RULES.battle;
/** Revolts only happen while mood is under this. */
export const UNREST_BELOW = UN.belowMood;

/** The county still remembers its old lord, so it may revolt when this season ends. */
export const remembers = (s: GameState, c: County): boolean =>
  !!s.unrest && c.owner === 0 && c.since !== undefined && s.turn + 1 - c.since < UN.memoryTurns;

/** The season the county accepts your rule. */
export const forgivenAt = (c: County): number => (c.since ?? 0) + UN.memoryTurns;

/** Chance of a revolt at a given mood: nothing at or above the bar, then more for every point below it. */
export const chanceAt = (mood: number): number =>
  mood >= UN.belowMood ? 0 : clamp(UN.chanceBase + (UN.belowMood - mood) * UN.chancePerMood, 0, UN.chanceMax);

/** Forecast for the end of this season: revolts are checked after the season's mood change. */
export const revoltChance = (s: GameState, c: County): number => (remembers(s, c) ? chanceAt(c.mood + moodDelta(s, c)) : 0);

/** How many people would take up arms, and how hard the garrison would hold. */
export const rebels = (c: County): number => Math.round(c.pop * UN.rebelShare);
export const garrisonHold = (c: County): number => defOf(c.g) * fortMult(c);

/** Where a county goes when it breaks free: back to its old lord if that house still stands, otherwise to no lord. */
export const revoltsTo = (s: GameState, c: County): number =>
  c.was !== undefined && c.was > 0 && s.lords[c.was]!.alive ? c.was : NEUTRAL;

function revolt(s: GameState, rng: Rng, c: County): void {
  const n = rebels(c);
  const atk = n * U.spear.atk * range(rng, B.rollLow, B.rollHigh), def = garrisonHold(c) * range(rng, B.rollLow, B.rollHigh);
  if (def > 0 && def >= atk) {
    const lost = zero();
    c.g = applyLoss(c.g, clamp((B.lossFactor * atk) / def, B.lossMin, B.lossMax), lost);
    for (const k of KINDS) { c.arr[k] = Math.min(c.arr[k], c.g[k]); c.mus[k] = Math.min(c.mus[k], c.g[k]); }
    const dead = Math.round(n * UN.crushedPeopleLoss);
    c.pop = Math.max(RULES.population.min, c.pop - dead);
    logEv(s, `Revolt in ${c.name}! The garrison holds (defence ${Math.round(def)} against ${Math.round(atk)}), ${dead} rebels die, ${KINDS.reduce((a, k) => a + lost[k], 0)} soldiers fall.`, 'bad');
    return;
  }
  const to = revoltsTo(s, c), keep = Math.round(n * UN.rebelsKeep);
  if (s.stats) s.stats.lost++;
  c.owner = to;
  c.g = { spear: keep, archer: 0, knight: 0 }; c.arr = zero(); c.mus = zero();
  c.pop = Math.max(RULES.population.min, c.pop - keep);
  c.mood = UN.freedMood; c.tax = NORMAL_TAX; c.ration = NORMAL_RATION; c.work = defaultWork(c.i); c.farmPref = RULES.start.work.farm;
  delete c.was; delete c.since;
  applyFarmLimit(s, c);
  logEv(s, `Revolt in ${c.name}! ${n} rebels overwhelm the garrison and ${to === NEUTRAL ? 'the county answers to no lord' : `hand it back to ${lordName(s, to)}`}.`, 'bad');
  checkElim(s);
}

/** The rivals stop fighting each other while you hold this many counties. */
export const leagueAt = (): number => UN.league.counties;
export const inLeague = (s: GameState): boolean => !!s.unrest && counties(s, 0).length >= UN.league.counties;

/** End of season: unhappy conquered counties may revolt, long-held ones accept your rule, and the rivals' pact forms or breaks. */
export function rollRevolts(s: GameState, rng: Rng): void {
  if (!s.unrest) return;
  for (const c of counties(s, 0)) {
    if (c.since === undefined) continue;
    if (s.turn + 1 - c.since >= UN.memoryTurns) {
      delete c.was; delete c.since;
      logEv(s, `${c.name} has accepted your rule and no longer remembers its old lord.`, 'good');
      continue;
    }
    const p = chanceAt(c.mood);
    if (p > 0 && rng() < p) revolt(s, rng, c);
    if (s.over) return;
  }
  const now = inLeague(s);
  if (now && !s.league) logEv(s, `The rival lords make a pact against you: while you hold ${UN.league.counties} or more counties they attack only you, and more readily.`, 'bad');
  if (!now && s.league) logEv(s, `The rivals' pact breaks apart. They are back at each other's throats.`, 'good');
  if (now) s.league = true; else delete s.league;
}

/** Who the county remembers, for labels. */
export const oldLord = (s: GameState, c: County): string => (c.was === undefined || c.was === NEUTRAL ? 'having no lord' : lordName(s, c.was));

export const sinceStamp = (c: County): string => stamp(forgivenAt(c));
