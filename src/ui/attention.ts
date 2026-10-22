import { counties, forecast, lordName, threats, type GameState } from '../game';

export interface Warn {
  key: string;
  text: string;
  /** county to jump to */
  sel?: number;
  /** a nudge rather than a danger: shown in the dock list, not as a chip in the top bar */
  soft?: boolean;
}

/** Gold you hold above this is "unspent" in the dock list. */
export const IDLE_GOLD = 100;

/** Things that need you before the season ends: hunger, an empty treasury, unrest, rival armies at the border, gold lying idle. */
export function attention(s: GameState): Warn[] {
  const st = s.lords[0]!.stock, f = forecast(s, 0), w: Warn[] = [];
  if (st.grain + f.grain < 0) w.push({ key: 'grain', text: 'Grain runs out: buy grain or farm more' });
  if (st.gold + f.gold < 0) w.push({ key: 'gold', text: 'Treasury runs dry: soldiers will desert' });
  for (const c of counties(s, 0)) if (c.mood < 20) w.push({ key: 'u' + c.id, text: `Unrest in ${c.name}`, sel: c.id });
  for (const t of threats(s).slice(0, 3)) {
    w.push({ key: 't' + t.to.id, text: `${lordName(s, t.from.owner)} threatens ${t.to.name}`, sel: t.to.id });
  }
  if (st.gold >= IDLE_GOLD) w.push({ key: 'idle', text: `${Math.floor(st.gold)} gold unspent: muster troops or raise walls`, soft: true });
  return w;
}
