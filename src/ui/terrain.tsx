import type { County } from '../game';

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
    </>
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
