import { SEASONS, SEASON_NOTE, forecast, season, year, type GameState } from '../game';
import { attention } from './attention';
import { signed } from './format';
import { select } from './store';

export function Hud({ s }: { s: GameState }) {
  const se = season(s), st = s.lords[0]!.stock, f = forecast(s, 0), warn = attention(s).filter((x) => !x.soft);
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
