import { FORT, NB, RULES, U } from './data';
import { recruit } from './actions';
import { doSend, doSendMany, pick } from './combat';
import { eat, farmLimit, marketPrice } from './economy';
import { index, type Rng } from './rng';
import { atkMult, atkOf, counties, defence, movable, season, total } from './state';
import type { BattleReport, County, GameState, Kind } from './types';

export function shuffle<T>(rng: Rng, a: T[]): T[] {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = a[i]!; a[i] = a[j]!; a[j] = t;
  }
  return a;
}

export const enemyNb = (s: GameState, c: County): County[] => NB[c.id]!.map((i) => s.C[i]!).filter((n) => n.owner !== c.owner);

/** First step on the shortest path (through own counties) to a county that touches a foe. */
export function frontierStep(s: GameState, c: County, l: number): number | null {
  const seen = new Set<number>([c.id]);
  const q: [number, number | null][] = [[c.id, null]];
  while (q.length) {
    const it = q.shift()!;
    for (const n of NB[it[0]]!) {
      if (seen.has(n)) continue;
      seen.add(n);
      if (s.C[n]!.owner !== l) continue;
      const f = it[1] === null ? n : it[1];
      if (NB[n]!.some((z) => s.C[z]!.owner !== l)) return f;
      q.push([n, f]);
    }
  }
  return null;
}

const AI = RULES.ai;

/** How a rival lord plays: the base numbers, a living-realm personality on top, and the difficulty setting. */
interface Personality {
  trait: string; blurb: string;
  attack?: Partial<typeof AI.attack>;
  recruit?: Partial<typeof AI.recruit>;
  forts?: { maxLevel: number };
  buyIron?: { below: number };
}
const PERSONALITIES = RULES.personalities as Record<string, Personality>;
export const personality = (s: GameState, l: number): Personality | undefined => (s.rich ? PERSONALITIES[String(l)] : undefined);

export function aiParams(s: GameState, l: number) {
  const p = personality(s, l), d = RULES.difficulty[s.level ?? 'normal'];
  const attack = { ...AI.attack, ...p?.attack }, recruit = { ...AI.recruit, ...p?.recruit };
  attack.needBase += d.needBaseAdd;
  recruit.keepGold += d.keepGoldAdd;
  return { attack, recruit, forts: p?.forts, buyIron: p?.buyIron };
}
type Params = ReturnType<typeof aiParams>;

/** Farm % a rival sets on a county: by how many seasons of meals its grain covers, held to the season's limit. */
export const aiFarmPct = (secure: number, c: County, se: number): number =>
  Math.min(secure < AI.farm.tightBelowSecurity ? AI.farm.tight : secure > AI.farm.safeAboveSecurity ? AI.farm.safe : AI.farm.normal, farmLimit(c, se));

/** A turtle raises one fort level a turn on a frontier county, keeping a little gold back. */
function aiFort(s: GameState, l: number, P: Params): void {
  if (!P.forts) return;
  const st = s.lords[l]!.stock;
  const c = counties(s, l).filter((x) => x.fort < P.forts!.maxLevel && enemyNb(s, x).length > 0).sort((a, b) => a.fort - b.fort)[0];
  const f = c && FORT[c.fort];
  if (!c || !f || st.wood < f.w || st.iron < f.i || st.gold < f.g + RULES.living.fortsKeepGold) return;
  st.wood -= f.w; st.iron -= f.i; st.gold -= f.g;
  c.fort++;
}

/** A trader tops iron up from the market when it runs short, without moving prices. */
function aiTrade(s: GameState, l: number, P: Params): void {
  if (!P.buyIron) return;
  const st = s.lords[l]!.stock, mk = RULES.market;
  const cost = Math.ceil(marketPrice(s, 'iron') * mk.buyMultiplier * mk.lot);
  if (st.iron < P.buyIron.below && st.gold >= cost + P.recruit.keepGold) { st.gold -= cost; st.iron += mk.lot; }
}

function aiRecruit(s: GameState, rng: Rng, l: number, P: Params): void {
  const L = s.lords[l]!, cs = counties(s, l);
  const front = cs.filter((c) => enemyNb(s, c).length > 0);
  const pool = front.length ? front : cs;
  let budget = L.stock.gold - P.recruit.keepGold, guard = 0;
  while (budget >= 6 && guard++ < 40) {
    const c = pool[index(rng, pool.length)]!;
    if (c.pop < P.recruit.minPeople) continue;
    const r = rng();
    const order: Kind[] = r < P.recruit.knightFirstBelow ? ['knight', 'archer', 'spear'] : r < P.recruit.archerFirstBelow ? ['archer', 'spear', 'knight'] : ['spear', 'archer', 'knight'];
    let done = false;
    for (const k of order) {
      if (U[k].gold <= budget && recruit(s, c, k, 1)) { budget -= U[k].gold; done = true; break; }
    }
    if (!done) break;
  }
}

/** Living realm: when no county can win alone, the counties around one of your counties may join in one army of archers and knights if together they beat the bar. Spearmen stay home. */
function aiCombined(s: GameState, rng: Rng, c: County, foes: County[], need: number, pending?: BattleReport[]): void {
  let best: { to: County; from: County[]; ratio: number } | null = null;
  for (const to of foes) {
    if (to.owner !== 0) continue;
    const from = [c, ...NB[to.id]!.map((i) => s.C[i]!).filter((x) => x.owner === c.owner && x.id !== c.id && total(movable(x)) > 0)];
    if (from.length < 2) continue;
    const ratio = (from.reduce((a, x) => a + atkOf(pick(movable(x), 'strike')), 0) * atkMult(s)) / defence(to);
    if (ratio > need + RULES.living.combinedBarAdd && (!best || ratio > best.ratio)) best = { to, from, ratio };
  }
  if (best) doSendMany(s, rng, best.from, best.to, 'strike', pending);
}

function aiMove(s: GameState, rng: Rng, l: number, P: Params, pending?: BattleReport[]): void {
  for (const c of shuffle(rng, counties(s, l))) {
    if (c.owner !== l) continue;
    const m = movable(c);
    if (!total(m)) continue;
    const foes = enemyNb(s, c);
    if (foes.length) {
      if (s.turn < P.attack.fromTurn || rng() < P.attack.skipChance) continue;
      const need = P.attack.needBase + rng() * P.attack.needSpread;
      let best: County | null = null, mode: 'strike' | 'all' | null = null, bs = 0;
      for (const n of foes) {
        const D = defence(n);
        const s1 = (atkOf(pick(m, 'strike')) * atkMult(s)) / D, s2 = (atkOf(pick(m, 'all')) * atkMult(s)) / D;
        if (s1 > need && s1 > bs) { bs = s1; best = n; mode = 'strike'; }
        else if (s2 > need && s2 > bs) { bs = s2; best = n; mode = 'all'; }
      }
      if (best && mode) doSend(s, rng, c, best, mode, pending);
      else if (s.rich && RULES.living.combinedAttacks) aiCombined(s, rng, c, foes, need, pending);
    } else {
      const step = frontierStep(s, c, l);
      if (step !== null) doSend(s, rng, c, s.C[step]!, 'all', pending);
    }
  }
}

/** What a rival would weigh for this county right now, without moving anything or touching the RNG (for the ?inspect view). */
export interface AiPlan {
  /** troops free to march (not new this season) */
  free: number;
  /** counties with a foe next door: attack strength over true defence, for each way of sending */
  foes: { to: County; strike: number; all: number }[];
  /** with no foe next door: where the troops would walk (towards the frontier), or null when already there */
  step: County | null;
}
export function aiPlan(s: GameState, c: County): AiPlan {
  const m = movable(c), foes = enemyNb(s, c);
  const step = foes.length ? null : frontierStep(s, c, c.owner);
  return {
    free: total(m),
    foes: foes.map((n) => ({ to: n, strike: (atkOf(pick(m, 'strike')) * atkMult(s)) / defence(n), all: (atkOf(pick(m, 'all')) * atkMult(s)) / defence(n) })),
    step: step === null ? null : s.C[step]!,
  };
}

/** One rival lord's turn: set jobs and tax, maybe buy grain, recruit, then move. */
export function aiTurn(s: GameState, rng: Rng, l: number, pending?: BattleReport[]): void {
  const L = s.lords[l]!, cs = counties(s, l);
  if (!cs.length) return;
  const need = cs.reduce((a, c) => a + eat(c), 0);
  const secure = L.stock.grain / Math.max(1, need);
  const se = season(s);
  for (const c of cs) {
    c.work.farm = aiFarmPct(secure, c, se);
    c.work.wood = AI.wood;
    c.work.mine = c.i >= AI.mine.richOre ? AI.mine.rich : c.i >= AI.mine.someOre ? AI.mine.some : 0;
  }
  for (const c of cs) c.tax = c.mood < AI.tax.noneBelowMood ? 0 : c.mood < AI.tax.lowBelowMood ? 1 : c.mood > AI.tax.highAboveMood ? 3 : 2;
  if (secure < AI.buyGrain.belowSecurity && L.stock.gold > AI.buyGrain.minGold) {
    const buy = Math.min(Math.floor((L.stock.gold * AI.buyGrain.goldShare) / AI.buyGrain.pricePerGrain), Math.ceil(need * AI.buyGrain.coverSeasons - L.stock.grain));
    if (buy > 0) { L.stock.gold -= buy * AI.buyGrain.pricePerGrain; L.stock.grain += buy; }
  }
  const P = aiParams(s, l);
  aiFort(s, l, P);
  aiTrade(s, l, P);
  aiRecruit(s, rng, l, P);
  aiMove(s, rng, l, P, pending);
}

