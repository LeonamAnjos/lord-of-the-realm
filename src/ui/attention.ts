import { SEASONS_TO_HARVEST, eat, fieldWorkers, NB, inLeague, leagueAt, oldLord, pendingTitle, remembers, revoltChance, atkMult, atkOf, counties, estDef, farmLimit, forecast, idlePct, lordName, moodDelta, movable, season, threats, troops, type County, type GameState } from '../game';

export interface Warn {
  key: string;
  text: string;
  /** county to jump to */
  sel?: number;
  /** a nudge rather than a danger: shown in the dock list, not as a chip in the top bar */
  soft?: boolean;
  /** lord the item is about, for a colour dot that matches the map */
  owner?: number;
}

/** Gold you hold above this is "unspent" in the dock list. */
export const IDLE_GOLD = 100;

/** Things that need you before the season ends: hunger, an empty treasury, unrest, rival armies at the border, gold lying idle. */
export function attention(s: GameState): Warn[] {
  const st = s.lords[0]!.stock, f = forecast(s, 0), w: Warn[] = [];
  if (s.pending) w.push({ key: 'choice', text: `Decision waiting: ${pendingTitle(s, s.pending)}` });
  if (st.grain + f.grain < 0) w.push({ key: 'grain', text: 'Grain runs out: buy grain or farm more' });
  if (s.crops) {
    const n = SEASONS_TO_HARVEST[season(s)], meals = counties(s, 0).reduce((a, c) => a + eat(c), 0);
    if (n > 1 && st.grain < meals * n) w.push({ key: 'harvest', text: `Grain will not last to the harvest: ${Math.floor(st.grain)} in store, about ${Math.round(meals * n)} needed. Buy grain or set scant rations` });
  }
  if (st.gold + f.gold < 0) w.push({ key: 'gold', text: 'Treasury runs dry: soldiers will desert' });
  for (const c of counties(s, 0)) if (c.mood < 20) w.push({ key: 'u' + c.id, text: `Unrest in ${c.name}`, sel: c.id });
  for (const c of counties(s, 0)) {
    const p = revoltChance(s, c);
    if (p > 0) w.push({ key: 'r' + c.id, text: `${c.name} may revolt (${Math.round(p * 100)}% this season): raise its mood above 30`, sel: c.id });
  }
  if (inLeague(s)) w.push({ key: 'league', text: `The rivals are allied against you while you hold ${leagueAt()} or more counties` });
  for (const t of threats(s).slice(0, 3)) {
    w.push({ key: 't' + t.to.id, text: `${lordName(s, t.from.owner)} (${t.from.name}) threatens ${t.to.name}`, sel: t.to.id, owner: t.from.owner });
  }
  if (st.gold >= IDLE_GOLD) w.push({ key: 'idle', text: `${Math.floor(st.gold)} gold unspent: muster troops or raise walls`, soft: true });
  return w;
}

export type Tone = 'bad' | 'warn' | 'good' | 'info';
export interface Flag { tone: Tone; text: string }

/** Short tags on a county card, worst first. Red and amber ones put the county in the Warnings view and mark it on the map. */
export function countyFlags(s: GameState, c: County): Flag[] {
  const f: Flag[] = [], near = NB[c.id]!.map((n) => s.C[n]!);
  const canBreak = (from: County, to: County) => atkOf(movable(from)) * atkMult(s) >= estDef(s, to) * 1.35;
  if (c.owner !== 0) {
    const mine = near.filter((n) => n.owner === 0);
    if (mine.some((n) => canBreak(n, c))) f.push({ tone: 'good', text: 'Can take' });
    else if (mine.length) f.push({ tone: 'info', text: 'Borders you' });
    return f;
  }
  if (remembers(s, c)) {
    const p = revoltChance(s, c);
    f.push(p > 0 ? { tone: 'bad', text: `Revolt ${Math.round(p * 100)}%` } : { tone: 'info', text: `Remembers ${oldLord(s, c)}` });
  }
  const foes = near.filter((n) => n.owner !== 0), se = season(s), d = moodDelta(s, c);
  if (threats(s).some((t) => t.to.id === c.id)) f.push({ tone: 'bad', text: 'Threatened' });
  if (c.mood < 20) f.push({ tone: 'bad', text: 'Unrest' });
  else if (d < 0 && c.mood + d < 30) f.push({ tone: 'warn', text: 'Mood falling' });
  if (foes.some((n) => n.owner > 0) && troops(c) === 0) f.push({ tone: 'warn', text: 'No garrison' });
  if (!foes.length && troops(c) >= 20) f.push({ tone: 'info', text: 'Army far from border' });
  if (foes.some((n) => canBreak(c, n))) f.push({ tone: 'good', text: 'Can attack' });
  if (s.crops && se === 0 && c.pop * c.work.farm / 100 < fieldWorkers(c) && c.work.farm + 5 <= farmLimit(c, se, true) && idlePct(c) >= 5) f.push({ tone: 'info', text: 'Fields left empty' });
  else if (s.crops && se === 1 && (c.sown ?? 0) > c.pop * c.work.farm / 100 + 0.5) f.push({ tone: 'warn', text: 'Crop poorly tended' });
  else if (!s.crops && c.work.farm + 5 <= farmLimit(c, se) && idlePct(c) >= 5) f.push({ tone: 'info', text: 'Fields not full' });
  return f;
}
