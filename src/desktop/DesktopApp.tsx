import './desktop.css';
import { NC, SEASONS, SEASON_NOTE, counties, forecast, season, year, NEUTRAL, type GameState } from '../game';
import { attention } from '../ui/attention';
import { SheetView, Tabs, Toast } from '../ui/Chrome';
import { Chronicle } from '../ui/Chronicle';
import { FoeCounty, OwnCounty } from '../ui/CountyPanel';
import { LORD_COL, ownerCol, signed } from '../ui/format';
import { Quick } from '../ui/Quick';
import { RealmPanel } from '../ui/RealmPanel';
import { endTurn, select, showAttention, showHelp, useGame } from '../ui/store';
import { GlMap } from './GlMap';

const RES = ['gold', 'grain', 'wood', 'iron'] as const;

function Top({ s }: { s: GameState }) {
  const se = season(s), st = s.lords[0]!.stock, f = forecast(s, 0);
  return (
    <header class="dt-top">
      <div class="dt-brand"><h1>Fief &amp; Crown</h1></div>
      <div class="dt-season">
        <b>{SEASONS[se]}</b><span>{year(s)}</span>
        <small>{SEASON_NOTE[se]}</small>
        <div class="pips">{[0, 1, 2, 3].map((i) => <i key={i} class={i <= se ? 'on' : ''} />)}</div>
      </div>
      <div class="dt-res">
        {RES.map((k) => {
          const d = Math.round(f[k]);
          return (
            <div key={k} class={'r r-' + k}>
              <span class="lab">{k}</span>
              <b>{Math.floor(st[k])}</b>
              <i class={d >= 0 ? 'up' : 'dn'}>{signed(d)}<small> / season</small></i>
            </div>
          );
        })}
      </div>
      <button class="dt-help" onClick={showHelp} aria-label="How to play">?</button>
    </header>
  );
}

function Warns({ s }: { s: GameState }) {
  const warn = attention(s).filter((x) => !x.soft);
  if (!warn.length) return null;
  return (
    <div class="dt-warns" role="status">
      {warn.map((x) => (x.sel === undefined
        ? <span key={x.key} class="warn">{x.text}</span>
        : (
          <button key={x.key} class="warn" onClick={() => select(x.sel!)}>
            {x.owner !== undefined && <i class="wdot" style={{ background: `var(--${ownerCol(x.owner)})` }} />}{x.text}
          </button>
        )))}
    </div>
  );
}

function Bar({ s }: { s: GameState }) {
  const n = counties(s, 0).length, se = season(s), todo = s.over ? [] : attention(s), danger = todo.some((w) => !w.soft);
  return (
    <div class="dt-bar">
      <div class="dt-realm">
        <div class="dt-count"><b>{n}</b> of {NC} counties</div>
        <div class="dt-legend">
          {s.lords.map((L, i) => (
            <span key={i} style={L.alive ? undefined : { opacity: 0.4 }}><i style={{ background: `var(--${LORD_COL[i]})` }} />{L.short} {counties(s, i).length}</span>
          ))}
          {counties(s, NEUTRAL).length > 0 && <span><i style={{ background: 'var(--o-1)' }} />No lord {counties(s, NEUTRAL).length}</span>}
        </div>
      </div>
      {todo.length > 0 && <button class={'todo' + (danger ? ' danger' : '')} onClick={showAttention}>{todo.length} to check</button>}
      <button class="btn primary dt-end" disabled={!!s.over} onClick={endTurn}>
        {s.over ? 'The reign is over' : <>End {SEASONS[se]!.toLowerCase()}<small>then {SEASONS[(se + 1) % 4]}</small></>}
      </button>
    </div>
  );
}

/** The wide-screen layout: the board fills the window, the ledger floats at the right, the season controls sit at the bottom. */
export function DesktopApp() {
  const g = useGame();
  const { s, ui } = g;
  const c = s.C[ui.sel]!;
  return (
    <div class={'dt' + (g.fade ? ' fade-' + g.fade : '')}>
      <GlMap s={s} sel={ui.sel} />
      <div class="dt-vignette" aria-hidden="true" />
      <div class="dt-head"><Top s={s} /><Warns s={s} /></div>
      <aside class="dt-side">
        <section class="panel dt-panel">
          <Tabs tab={ui.tab} />
          {ui.tab === 'realm' ? <div class="pbody"><RealmPanel s={s} /></div>
            : ui.tab === 'chronicle' ? <div class="pbody"><Chronicle s={s} /></div>
              : c.owner === 0 ? <OwnCounty s={s} c={c} /> : <FoeCounty s={s} c={c} />}
        </section>
      </aside>
      <div class="dt-quick"><Quick s={s} /></div>
      <Bar s={s} />
      <SheetView />
      <Toast />
    </div>
  );
}
