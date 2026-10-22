import { idlePct, season, troops, type County, type GameState } from '../game';

/** One figure stands for this many people, up to MAX_FIG per trade. */
const PER_FIG = 10;
const MAX_FIG = 6;
const figs = (n: number, max = MAX_FIG) => Math.min(max, Math.ceil(n / PER_FIG));

function Person({ x, y, cls }: { x: number; y: number; cls: string }) {
  return (
    <g class={'fig ' + cls}>
      <circle cx={x} cy={y - 8} r="2.3" />
      <path d={`M${x - 2.6} ${y}c0-4 .8-6 2.6-6s2.6 2 2.6 6z`} />
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g class="s-tree">
      <rect x={x - 1} y={y - 3 * s} width="2" height={3 * s} class="trunk" />
      <path d={`M${x} ${y - 16 * s}l${6 * s} ${9 * s}h${-3 * s}l${4 * s} ${6 * s}h${-14 * s}l${4 * s}-${6 * s}h${-3 * s}z`} />
    </g>
  );
}

function House({ x, y }: { x: number; y: number }) {
  return (
    <g class="s-house">
      <rect x={x} y={y - 9} width="12" height="9" />
      <path d={`M${x - 2} ${y - 9}l8-6 8 6z`} class="roof" />
      <rect x={x + 4.5} y={y - 5} width="3" height="5" class="door" />
    </g>
  );
}

/** A picture of the county: farms, forest, mine, village and keep, drawn from its jobs, population, season and fort. */
export function CountyScene({ s, c }: { s: GameState; c: County }) {
  const se = season(s);
  const pct = { farm: c.work.farm, wood: c.work.wood, mine: c.work.mine, craft: idlePct(c) };
  const n = (k: keyof typeof pct) => Math.round((c.pop * pct[k]) / 100);
  const fields = pct.farm > 0 ? Math.min(4, 1 + Math.floor(pct.farm / 20)) : 0;
  const trees = pct.wood > 0 ? Math.min(8, 2 + Math.floor(pct.wood / 6)) : 0;
  const houses = Math.min(4, Math.ceil(c.pop / 50));
  const soldiers = KINDS_ORDER.flatMap((k) => Array.from({ length: Math.min(3, Math.ceil(c.g[k] / PER_FIG)) }, () => k));
  const L = c.fort;
  return (
    <div class="scene-wrap">
      <svg class={'scene se' + se} viewBox="0 0 400 140" role="img"
        aria-label={`${c.name}: ${n('farm')} farmers, ${n('wood')} woodcutters, ${n('mine')} miners, ${pct.craft}% townsfolk and crafts, ${troops(c)} soldiers`}>
        <rect class="sky" width="400" height="72" />
        <rect class="ground" y="70" width="400" height="70" />
        <path class="far" d="M0 70L40 52 85 66 140 46 200 64 260 48 320 62 360 50 400 66V70z" />

        {/* keep and walls on the horizon */}
        <g class="s-keep">
          <rect x="186" y="44" width="28" height="26" />
          <path d="M186 44v-4h4v2h4v-2h4v2h4v-2h4v2h4v-2h4v4z" />
          <rect x="196" y="58" width="8" height="12" class="door" />
          {L >= 1 && <rect x="150" y="62" width="100" height="8" class="wallb" />}
          {L >= 2 && <><rect x="146" y="50" width="12" height="20" /><rect x="242" y="50" width="12" height="20" />
            <rect x="145" y="47" width="14" height="3" /><rect x="241" y="47" width="14" height="3" /></>}
          {L >= 3 && <rect x="193" y="30" width="14" height="10" />}
        </g>

        {/* mine on the left */}
        <path class={c.i > 0 ? 'hill rock' : 'hill'} d="M0 74L30 36 48 52 66 28 108 74z" />
        {c.i > 0 && pct.mine > 0 && <path class="mine-door" d="M54 74v-9a7 7 0 0 1 14 0v9z" />}
        {c.i === 0 && <text class="scene-note" x="8" y="64">no ore</text>}

        {/* fields */}
        {Array.from({ length: fields }, (_, j) => (
          <rect key={j} class="field" x={112 + j * 3} y={84 + j * 11} width={90 - j * 3} height="7" rx="2" />
        ))}
        {/* village */}
        {Array.from({ length: houses }, (_, j) => <House key={j} x={216 + j * 19} y={96} />)}
        {pct.craft > 0 && (
          <g class="smithy">
            <rect x="262" y="100" width="22" height="10" />
            <rect x="277" y="92" width="4" height="9" class="chim" />
            <circle class="smoke" cx="279" cy="88" r="3" />
          </g>
        )}
        {/* forest */}
        {Array.from({ length: trees }, (_, j) => <Tree key={j} x={304 + (j % 4) * 24 + (j > 3 ? 12 : 0)} y={96 + (j > 3 ? 18 : 0)} s={1 + (j % 3) * 0.12} />)}

        {/* people at work, one figure per 10 */}
        {Array.from({ length: figs(n('mine')) }, (_, j) => <Person key={'m' + j} x={22 + j * 9} y={96} cls="fm" />)}
        {Array.from({ length: figs(n('farm')) }, (_, j) => <Person key={'f' + j} x={114 + j * 14} y={(j % 2) ? 126 : 112} cls="ff" />)}
        {Array.from({ length: figs(n('craft')) }, (_, j) => <Person key={'c' + j} x={218 + j * 9} y={118} cls="fc" />)}
        {Array.from({ length: figs(n('wood')) }, (_, j) => <Person key={'w' + j} x={304 + j * 13} y={134} cls="fw" />)}
        {soldiers.map((k, j) => (
          <g key={'s' + j} class={'sold ' + k}>
            <Person x={222 + j * 9} y={130 + (j % 2)} cls="fs" />
            <rect x={225 + j * 9} y={116 + (j % 2)} width=".9" height={k === 'knight' ? 15 : 12} />
          </g>
        ))}
      </svg>
      <p class="note scene-cap">
        Each figure is about {PER_FIG} people. <b class="ff">{n('farm')} farming</b> · <b class="fw">{n('wood')} cutting wood</b> · <b class="fm">{n('mine')} mining</b> · <b class="fc">{n('craft')} townsfolk and crafts</b> · <b class="fs">{troops(c)} soldiers</b>
      </p>
    </div>
  );
}

const KINDS_ORDER = ['spear', 'archer', 'knight'] as const;
