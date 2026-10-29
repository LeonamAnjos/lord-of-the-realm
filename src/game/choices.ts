// "Choices" rules: a season's event waits for you to pick what to do. Only used when `s.decide` is set.
import { KINDS, NB, RULES } from './data';
import { applyLoss } from './combat';
import { marketPrice } from './economy';
import { range, type Rng } from './rng';
import { atkOf, clamp, counties, logEv, zero } from './state';
import type { County, GameState, Pending } from './types';

const CH = RULES.choices, EV = RULES.events, B = RULES.battle;

export interface ChoiceOption {
  id: string;
  label: string;
  /** what happens, with every number */
  text: string;
  /** what you get if the season ends without an answer */
  dflt?: boolean;
  /** why it cannot be chosen now */
  no?: string;
}

const pct = (v: number): string => Math.round(v * 100) + '%';
const plural = (n: number, one: string, many = one + 's'): string => `${n} ${n === 1 ? one : many}`;

/** Your counties next to the plague that it would reach if left alone. */
const spreadTo = (s: GameState, c: County): County[] =>
  NB[c.id]!.map((i) => s.C[i]!).filter((n) => n.owner === 0 && n.pop > EV.plague.onlyAbovePeople);

export const ironCost = (s: GameState): number => Math.round(CH.caravan.iron * marketPrice(s, 'iron') * CH.caravan.ironPriceShare);

/** Share of the garrison that falls in a won bandit hunt: lighter than a battle. */
const huntLoss = (atk: number, band: number): number => {
  const L = CH.bandits.winLoss;
  return clamp((L.factor * band) / Math.max(1, atk), L.min, L.max);
};

/** How the county's garrison would fare against the bandits, in words. */
export function huntOdds(atk: number, band: number): string {
  const r = band > 0 ? atk / band : 9;
  return r >= 1.23 ? 'a sure win' : r >= 1.05 ? 'likely to win' : r >= 0.95 ? 'a coin toss' : r >= 0.82 ? 'likely to lose' : 'no chance';
}

/** The headline of a waiting event. */
export function pendingTitle(s: GameState, p: Pending): string {
  const c = s.C[p.c]!.name;
  return p.kind === 'plague' ? `Plague in ${c}` : p.kind === 'bumper' ? `A bountiful yield in ${c}` : p.kind === 'bandits' ? `Bandits near ${c}` : `A merchant caravan at ${c}`;
}

export function pendingText(s: GameState, p: Pending): string {
  const c = s.C[p.c]!;
  if (p.kind === 'plague') return `Sickness has reached ${c.name} (${Math.round(c.pop)} people). Left alone it would kill ${p.n} of them.`;
  if (p.kind === 'bumper') return `The fields of ${c.name} gave ${p.n} grain more than expected.`;
  if (p.kind === 'bandits') return `A band of about ${p.band} armed men demands ${p.n} gold, or they will rob ${c.name}.`;
  return `Traders on the road through ${c.name} offer ${p.n} gold in tolls, iron for sale, or some families who want to stay.`;
}

export function choiceOptions(s: GameState, p: Pending): ChoiceOption[] {
  const c = s.C[p.c]!, gold = s.lords[0]!.stock.gold;
  if (p.kind === 'plague') {
    const heal = Math.round(c.pop * CH.plague.healersShare), near = spreadTo(s, c);
    const spread = near.map((n) => `${n.name} ${Math.round(n.pop * CH.plague.spreadShare)}`).join(', ');
    return [
      { id: 'heal', label: 'Pay healers', text: `${CH.plague.healersGold} gold. Only ${heal} die (${pct(CH.plague.healersShare)}).`, no: gold < CH.plague.healersGold ? `Needs ${CH.plague.healersGold} gold` : undefined },
      { id: 'seal', label: 'Seal the roads', text: `${p.n} die. Mood ${CH.plague.sealMood} in ${c.name}. It spreads no further.` },
      { id: 'run', label: 'Let it run', dflt: true, text: near.length ? `${p.n} die, and it spreads: ${spread} more die (${pct(CH.plague.spreadShare)} of each).` : `${p.n} die. No county of yours next to it is big enough to catch it.` },
    ];
  }
  if (p.kind === 'bumper') {
    const keep = Math.round(p.n * CH.bumper.feastShare);
    return [
      { id: 'store', label: 'Store it', dflt: true, text: `+${p.n} grain.` },
      { id: 'feast', label: 'Hold a feast', text: `+${keep} grain. Mood +${CH.bumper.feastMoodHere} in ${c.name}, +${CH.bumper.feastMoodElsewhere} in your other counties.` },
    ];
  }
  if (p.kind === 'bandits') {
    const atk = atkOf(c.g), band = p.band ?? 0, win = Math.round(huntLoss(atk, band) * 100);
    return [
      { id: 'pay', label: 'Pay them', dflt: true, text: `-${p.n} gold.` },
      {
        id: 'hunt', label: 'Send the garrison',
        text: `Attack ${atk} against about ${band}: ${huntOdds(atk, band)}. Win: about ${win}% of the garrison falls, +${Math.round(p.n * CH.bandits.bounty)} gold from their loot. Lose: -${p.n} gold and ${pct(CH.bandits.loseTroops)} of the garrison.`,
        no: atk <= 0 ? 'No troops in ' + c.name : undefined,
      },
      { id: 'hide', label: 'Hide the treasury', text: `-${Math.round(p.n * CH.bandits.hideShare)} gold. They rob the villagers instead: mood ${CH.bandits.hideMood} in ${c.name}.` },
    ];
  }
  const cost = ironCost(s), market = Math.ceil(CH.caravan.iron * marketPrice(s, 'iron') * RULES.market.buyMultiplier);
  return [
    { id: 'tolls', label: 'Take the tolls', dflt: true, text: `+${p.n} gold.` },
    { id: 'iron', label: 'Buy their iron', text: `+${CH.caravan.iron} iron for ${cost} gold (the market asks about ${market}). No tolls.`, no: gold < cost ? `Needs ${cost} gold` : undefined },
    { id: 'settle', label: 'Let families settle', text: `+${CH.caravan.settlers} people in ${c.name}. No tolls.` },
  ];
}

/** The option taken when the season ends without an answer. */
export const defaultChoice = (s: GameState, p: Pending): string => choiceOptions(s, p).find((o) => o.dflt)!.id;

/** Lose a share of a garrison, keeping the "arrived" and "mustered" counts within what is left. */
function bleed(c: County, share: number): void {
  const lost = zero();
  c.g = applyLoss(c.g, share, lost);
  for (const k of KINDS) { c.arr[k] = Math.min(c.arr[k], c.g[k]); c.mus[k] = Math.min(c.mus[k], c.g[k]); }
}

const mood = (c: County, d: number): void => { c.mood = clamp(c.mood + d, 0, 100); };

/** Act on a waiting event. Returns false (and changes nothing) if there is none or the option cannot be chosen. */
export function decide(s: GameState, rng: Rng, id: string, late = false): boolean {
  const p = s.pending;
  if (!p) return false;
  const c = s.C[p.c]!;
  if (c.owner !== 0) { delete s.pending; return false; }
  const o = choiceOptions(s, p).find((x) => x.id === id);
  if (!o || o.no) return false;
  const st = s.lords[0]!.stock, pre = late ? 'No answer was given. ' : '';
  delete s.pending;
  switch (id) {
    case 'heal': {
      const k = Math.round(c.pop * CH.plague.healersShare);
      st.gold -= CH.plague.healersGold; c.pop -= k;
      logEv(s, `${pre}Healers tend ${c.name}: ${k} villagers died.`, 'bad'); break;
    }
    case 'seal':
      c.pop -= p.n; mood(c, CH.plague.sealMood);
      logEv(s, `${pre}The roads to ${c.name} are sealed: ${p.n} villagers died there and nowhere else.`, 'bad'); break;
    case 'run': {
      c.pop -= p.n;
      const near = spreadTo(s, c).map((n) => { const k = Math.round(n.pop * CH.plague.spreadShare); n.pop -= k; return `${n.name} ${k}`; });
      logEv(s, `${pre}Plague in ${c.name}: ${p.n} villagers died.${near.length ? ` It spread: ${near.join(', ')} more.` : ''}`, 'bad'); break;
    }
    case 'store':
      st.grain += p.n;
      logEv(s, `${pre}A bountiful yield in ${c.name}: +${p.n} grain.`, 'good'); break;
    case 'feast': {
      const keep = Math.round(p.n * CH.bumper.feastShare);
      st.grain += keep; mood(c, CH.bumper.feastMoodHere);
      for (const o2 of counties(s, 0)) if (o2 !== c) mood(o2, CH.bumper.feastMoodElsewhere);
      logEv(s, `A harvest feast in ${c.name}: +${keep} grain and the realm is merrier.`, 'good'); break;
    }
    case 'pay':
      st.gold -= p.n;
      logEv(s, `${pre}Bandits near ${c.name} are paid off with ${p.n} gold.`, 'bad'); break;
    case 'hunt': {
      const atk = atkOf(c.g) * range(rng, B.rollLow, B.rollHigh), band = (p.band ?? 0) * range(rng, B.rollLow, B.rollHigh);
      if (atk > band) {
        const loot = Math.round(p.n * CH.bandits.bounty);
        bleed(c, huntLoss(atk, band)); st.gold += loot;
        logEv(s, `The garrison of ${c.name} routs the bandits and takes ${loot} gold from their camp.`, 'good');
      } else {
        bleed(c, CH.bandits.loseTroops); st.gold -= p.n;
        logEv(s, `The garrison of ${c.name} is beaten by bandits, who carry off ${p.n} gold.`, 'bad');
      }
      break;
    }
    case 'hide': {
      const m = Math.round(p.n * CH.bandits.hideShare);
      st.gold -= m; mood(c, CH.bandits.hideMood);
      logEv(s, `The treasury is hidden. Bandits rob the villages of ${c.name} and find only ${m} gold.`, 'bad'); break;
    }
    case 'tolls':
      st.gold += p.n;
      logEv(s, `${pre}A merchant caravan pays ${p.n} gold in tolls at ${c.name}.`, 'good'); break;
    case 'iron': {
      const cost = ironCost(s);
      st.gold -= cost; st.iron += CH.caravan.iron;
      logEv(s, `The caravan at ${c.name} sells ${CH.caravan.iron} iron for ${cost} gold.`, 'good'); break;
    }
    case 'settle':
      c.pop += CH.caravan.settlers;
      logEv(s, `${plural(CH.caravan.settlers, 'traveller')} from the caravan settle in ${c.name}.`, 'good'); break;
  }
  st.gold = Math.max(0, st.gold);
  return true;
}

/** Bandit strength grows a little each year. Draws from `rng`, so only called in a game with choices. */
export const banditStrength = (s: GameState, rng: Rng): number =>
  Math.round(range(rng, CH.bandits.strengthMin, CH.bandits.strengthMax) + CH.bandits.strengthPerYear * Math.floor(s.turn / 4));
