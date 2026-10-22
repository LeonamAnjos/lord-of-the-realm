import { NB, counties, idlePct, seenTroops, type GameState } from '../game';
import { LORD_COL } from './format';
import { R, center, hexPts } from './hex';
import { select } from './store';
import { Buildings, RoadStub, Terrain, TerrainDefs } from './terrain';

export function MapView({ s, sel }: { s: GameState; sel: number }) {
  const selected = s.C[sel];
  const targets = new Set<number>();
  if (selected && selected.owner === 0) for (const n of NB[selected.id]!) if (s.C[n]!.owner !== 0) targets.add(n);
  // draw the selected county last so its outline is on top
  const order = s.C.slice().sort((a, b) => Number(a.id === sel) - Number(b.id === sel));
  return (
    <section class="map-wrap">
      <svg id="map" viewBox="0 0 400 262" role="group" aria-label="Map of twelve counties">
        <defs>
          <symbol id="keep" viewBox="0 4 16 10"><path fill-rule="evenodd" d="M1 14V5h3v2h2V5h4v2h2V5h3v9zM7 14v-3a1 1 0 0 1 2 0v3z" /></symbol>
          <symbol id="ipop" viewBox="0 0 10 10"><circle cx="5" cy="3" r="2.2" /><path d="M1 10c0-3 2-4.5 4-4.5s4 1.5 4 4.5z" /></symbol>
          <symbol id="ishield" viewBox="0 0 10 10"><path d="M5 .5l4 1.3v3.2c0 2.3-1.6 3.9-4 4.8-2.4-.9-4-2.5-4-4.8V1.8z" /></symbol>
          <TerrainDefs />
        </defs>
        {order.map((c) => {
          const p = center(c.id);
          const cls = 'hex o' + c.owner + (c.id === sel ? ' sel' : '') + (targets.has(c.id) ? ' tgt' : '');
          return (
            <g
              key={c.id} class={cls} tabIndex={0} role="button" aria-label={`${c.name}, ${s.lords[c.owner]!.name}`}
              onClick={() => select(c.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(c.id); } }}
            >
              <polygon points={hexPts(p.x, p.y, R - 2.5)} />
              {c.owner === 0 ? <Buildings c={c} x={p.x} y={p.y} /> : <Terrain c={c} x={p.x} y={p.y} />}
              <use class="keep" href="#keep" x={p.x - 8} y={p.y - 26} width="16" height="10" />
              <text x={p.x} y={p.y + 3}>{c.name}</text>
              <use class="ico" href="#ipop" x={p.x - 29} y={p.y + 10} width="9" height="9" />
              <text class="n" x={p.x - 18} y={p.y + 18}>{c.pop}</text>
              <use class="ico" href="#ishield" x={p.x + 3} y={p.y + 10} width="9" height="9" />
              <text class="n" x={p.x + 14} y={p.y + 18}>{seenTroops(s, c)}</text>
              {c.owner === 0 && (
                <text class="jobs" x={p.x} y={p.y + 29}>
                  <tspan class="jf">{c.work.farm}</tspan>
                  <tspan class="jw" dx="4">{c.work.wood}</tspan>
                  <tspan class="ji" dx="4">{c.work.mine}</tspan>
                  <tspan class="jc" dx="4">{idlePct(c)}</tspan>
                </text>
              )}
            </g>
          );
        })}
        <g class="roads" aria-hidden="true">
          {s.C.flatMap((c) => NB[c.id]!.filter((n) => n > c.id).map((n) => {
            const a = center(c.id), b = center(n);
            return <RoadStub key={c.id + '-' + n} ax={a.x} ay={a.y} bx={b.x} by={b.y} mine={c.owner === 0 && s.C[n]!.owner === 0} />;
          }))}
        </g>
      </svg>
      <div class="legend">
        {s.lords.map((L, i) => (
          <span key={i} style={L.alive ? undefined : { opacity: 0.4 }}>
            <i style={{ background: `var(--${LORD_COL[i]})` }} />{L.short} {counties(s, i).length}
          </span>
        ))}
        <span class="jobkey">
          Jobs % on your tiles: <b style={{ color: 'var(--grain)' }}>farm</b> <b style={{ color: 'var(--wood)' }}>wood</b> <b style={{ color: 'var(--iron)' }}>mine</b> <b style={{ color: 'var(--gold)' }}>crafts</b>
        </span>
      </div>
    </section>
  );
}

