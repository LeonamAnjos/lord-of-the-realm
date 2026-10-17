import { moodDelta, popRate, realmFed, capOf, type County, type GameState } from '../game';

export const moodWord = (m: number): string => (m >= 75 ? 'Loyal' : m >= 50 ? 'Content' : m >= 30 ? 'Uneasy' : m >= 15 ? 'Restless' : 'Rebellious');
export const moodCol = (m: number): string => (m >= 50 ? 'var(--good)' : m >= 30 ? 'var(--warn)' : 'var(--bad)');
export const pips = (v: number): string => { const n = Math.round(v * 3); return n <= 0 ? '–' : '●'.repeat(Math.min(4, n)); };
export const oddsCls = (a: number, d: number): string => { const r = a / d; return r >= 1.35 ? 'good' : r >= 1.05 ? 'fair' : 'risky'; };
export const signed = (v: number): string => (v >= 0 ? '+' : '') + v;
export const LORD_COL = ['o0', 'o1', 'o2', 'o3'];

const note = (color: string, margin = '4px 0 0') => ({ display: 'block', margin, color });

/** Forecast of this county's mood change next season. */
export function MoodNote({ s, c, flush }: { s: GameState; c: County; flush?: boolean }) {
  const d = Math.round(moodDelta(s, c)), fed = realmFed(s);
  let t = signed(d) + ' a season';
  if (!fed) t += ', famine';
  else if (c.mood + d < 20 && d < 0) t += ', unrest soon';
  return <small style={note(d > 0 ? 'var(--good)' : d < 0 ? 'var(--bad)' : 'var(--muted)', flush ? '0' : undefined)}>{t}</small>;
}

/** Forecast of this county's population change next season. */
export function PopNote({ s, c }: { s: GameState; c: County }) {
  let t: string, col = 'var(--muted)';
  if (!realmFed(s)) { t = 'famine'; col = 'var(--bad)'; }
  else {
    const d = popRate(c, c.mood + moodDelta(s, c), true);
    if (c.pop >= capOf(c) && d > -0.05) t = 'at the cap';
    else if (d >= 0.5) { t = '+' + Math.round(d) + ' a season'; col = 'var(--good)'; }
    else if (d <= -0.5) { t = '−' + Math.round(-d) + ' a season'; col = 'var(--bad)'; }
    else if (d > 0.05) { t = 'growing slowly'; col = 'var(--good)'; }
    else if (d < -0.05) { t = 'shrinking slowly'; col = 'var(--bad)'; }
    else t = 'steady';
  }
  return <small style={note(col)}>{t}</small>;
}
