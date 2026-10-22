import { SEASONS, SEASON_NOTE, counties, forecast, lordName, season, threats, year, type GameState } from '../game';
import { signed } from './format';
import { select } from './store';

interface Warn { key: string; text: string; sel?: number }

/** Things that need you before the season ends: hunger, an empty treasury, unrest, rival armies at the border. */
function warnings(s: GameState): Warn[] {
  const st = s.lords[0]!.stock, f = forecast(s, 0), w: Warn[] = [];
  if (st.grain + f.grain < 0) w.push({ key: 'grain', text: 'Grain runs out: buy grain or farm more' });
  if (st.gold + f.gold < 0) w.push({ key: 'gold', text: 'Treasury runs dry: soldiers will desert' });
  for (const c of counties(s, 0)) if (c.mood < 20) w.push({ key: 'u' + c.id, text: `Unrest in ${c.name}`, sel: c.id });
  for (const t of threats(s).slice(0, 3)) {
    w.push({ key: 't' + t.to.id, text: `${lordName(s, t.from.owner)} threatens ${t.to.name}`, sel: t.to.id });
  }
  return w;
}

export function Hud({ s }: { s: GameState }) {
  const se = season(s), st = s.lords[0]!.stock, f = forecast(s, 0), warn = warnings(s);
  return (
    <header class="hud">
      <div class="hud-top">
        <h1>Fief &amp; Crown</h1>
        <div class="season">
          <b>{SEASONS[se]}</b><span class="yr">{year(s)}</span>
          <small>{SEASON_NOTE[se]}</small>
          <div class="pips">{[0, 1, 2, 3].map((i) => <i key={i} class={i <= se ? 'on' : ''} />)}</div>
        </div>
      </div>
      <div class="res">
        {(['gold', 'grain', 'wood', 'iron'] as const).map((k) => {
          const d = Math.round(f[k]);
          return (
            <div key={k} class={'r r-' + k}>
              <span class="lab">{k}</span>
              <b>{Math.floor(st[k])}</b>
              <i class={d >= 0 ? 'up' : 'dn'}>{signed(d)}</i>
            </div>
          );
        })}
      </div>
      {warn.length > 0 && (
        <div class="warns" role="status">
          {warn.map((x) => (x.sel === undefined
            ? <span key={x.key} class="warn">{x.text}</span>
            : <button key={x.key} class="warn" onClick={() => select(x.sel!)}>{x.text}</button>))}
        </div>
      )}
    </header>
  );
}
