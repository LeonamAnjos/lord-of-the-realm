import { SEASONS, SEASON_NOTE, forecast, season, year, type GameState } from '../game';
import { signed } from './format';

export function Hud({ s }: { s: GameState }) {
  const se = season(s), st = s.lords[0]!.stock, f = forecast(s, 0);
  const alert =
    st.grain + f.grain < 0 ? 'Grain will run out before the season ends. Buy grain or move workers to the farms.'
    : st.gold + f.gold < 0 ? 'The treasury will run dry and soldiers will desert.'
    : null;
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
      {alert && <div class="alert">{alert}</div>}
    </header>
  );
}
