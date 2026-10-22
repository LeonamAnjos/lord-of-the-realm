import { idlePct, type County } from '../game';

/** Decoration slots around the rim of a hex (offsets from its centre), clear of the text. */
const SLOTS: [number, number][] = [[-33, -17], [33, -17], [-35, 9], [35, 9]];

type Kind = 'wood' | 'hill' | 'field';

/** Stable pseudo-random order for a county's slots; the same county always looks the same. */
function slotOrder(id: number): number[] {
  return SLOTS.map((_, k) => k).sort((a, b) => hash(id, a) - hash(id, b));
}
function hash(id: number, k: number): number {
  return Math.imul((id + 1) * 31 + k * 17 + 7, 2654435761) >>> 0;
}

/** How big each cluster is, from the fixed county stats: timber, ore and soil. */
export function terrainKinds(c: County): { kind: Kind; n: number }[] {
  const out: { kind: Kind; n: number }[] = [
    { kind: 'wood', n: c.w < 0.75 ? 1 : c.w < 1.05 ? 2 : 3 },
    { kind: 'field', n: c.f < 0.95 ? 1 : c.f < 1.2 ? 2 : 3 },
  ];
  if (c.i > 0) out.push({ kind: 'hill', n: c.i < 0.5 ? 1 : c.i < 1 ? 2 : 3 });
  return out;
}

export function TerrainDefs() {
  return (
    <>
      <symbol id="tpine" viewBox="0 0 8 10"><path d="M4 0l3.6 6H5.1L7.8 9.6H.2L2.9 6H.4z" /><rect x="3.4" y="9" width="1.2" height="1" /></symbol>
      <symbol id="thill" viewBox="0 0 14 9"><path d="M0 9L5 1l3 4 2-2.5L14 9z" /></symbol>
      <symbol id="bfarm" viewBox="0 0 10 10"><path fill-rule="evenodd" d="M0 10V4l5-4 5 4v6zM3.5 10V6.5h3V10z" /></symbol>
      <symbol id="bwood" viewBox="0 0 10 10"><circle cx="2.5" cy="7.5" r="2.5" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="5" cy="2.8" r="2.5" /></symbol>
      <symbol id="bmine" viewBox="0 0 10 10"><path fill-rule="evenodd" d="M0 10C0 4 3 1 5 1s5 3 5 9zM3.5 10V7a1.5 1.5 0 0 1 3 0v3z" /></symbol>
      <symbol id="bcraft" viewBox="0 0 10 10"><path d="M0 1h10v3H7v3l1.5 1v2h-7V8L3 7V4H0z" /></symbol>
    </>
  );
}

const BUILDINGS: { key: 'farm' | 'wood' | 'mine' | 'craft'; sym: string; slot: [number, number] }[] = [
  { key: 'farm', sym: '#bfarm', slot: [-34, -17] },
  { key: 'wood', sym: '#bwood', slot: [34, -17] },
  { key: 'mine', sym: '#bmine', slot: [-37, 9] },
  { key: 'craft', sym: '#bcraft', slot: [37, 9] },
];

/** Your own counties show what the people do: one building per job, drawn bigger as its share grows. */
export function Buildings({ c, x, y }: { c: County; x: number; y: number }) {
  const pct = { farm: c.work.farm, wood: c.work.wood, mine: c.work.mine, craft: idlePct(c) };
  return (
    <g class="terrain" aria-hidden="true">
      {BUILDINGS.map(({ key, sym, slot }) => {
        if (pct[key] <= 0) return null;
        const size = 6 + Math.min(pct[key], 75) * 0.08;
        return <use key={key} class={'b-' + key} href={sym} x={x + slot[0] - size / 2} y={y + slot[1] - size / 2} width={size} height={size} />;
      })}
    </g>
  );
}

export function Terrain({ c, x, y }: { c: County; x: number; y: number }) {
  const order = slotOrder(c.id);
  return (
    <g class="terrain" aria-hidden="true">
      {terrainKinds(c).map(({ kind, n }, k) => {
        const [dx, dy] = SLOTS[order[k]!]!;
        const cx = x + dx, cy = y + dy;
        if (kind === 'wood') {
          return Array.from({ length: n }, (_, j) => (
            <use key={j} class="t-wood" href="#tpine" x={cx - (n * 6 - 1) / 2 + j * 6} y={cy - 5 + (j % 2)} width="7" height="9" />
          ));
        }
        if (kind === 'hill') {
          return Array.from({ length: n }, (_, j) => (
            <use key={j} class="t-hill" href="#thill" x={cx - 6 + (j - (n - 1) / 2) * 5} y={cy - 4 - (j === 1 ? 2 : 0)} width="12" height="8" />
          ));
        }
        return Array.from({ length: n }, (_, j) => (
          <rect key={j} class="t-field" x={cx - 6} y={cy - 5 + j * 3.4} width="12" height="2.4" rx="1" />
        ));
      })}
    </g>
  );
}

/** A short road stub across the shared edge, so owned neighbours read as connected. */
export function RoadStub({ ax, ay, bx, by, mine }: { ax: number; ay: number; bx: number; by: number; mine: boolean }) {
  const t0 = 0.36, t1 = 0.64;
  return (
    <line
      class={mine ? 'road mine' : 'road'}
      x1={ax + (bx - ax) * t0} y1={ay + (by - ay) * t0}
      x2={ax + (bx - ax) * t1} y2={ay + (by - ay) * t1}
    />
  );
}
