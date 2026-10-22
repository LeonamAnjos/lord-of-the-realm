import { COLS, NC } from '../game';

/** Hex geometry: pointy-top, odd rows shifted right. The map is drawn in a 400 x 262 box. */
export const R = 50;
export const HW = Math.sqrt(3) * R;
const OX = (400 - HW * 4.5) / 2;
const OY = 6;

export function center(i: number): { x: number; y: number } {
  const r = Math.floor(i / COLS), c = i % COLS;
  return { x: OX + HW * (c + 0.5 + (r % 2 ? 0.5 : 0)), y: OY + R + 1.5 * R * r };
}

export function hexPts(x: number, y: number, rad: number): string {
  const p: string[] = [];
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 30) * Math.PI) / 180;
    p.push((x + rad * Math.cos(a)).toFixed(1) + ',' + (y + rad * Math.sin(a)).toFixed(1));
  }
  return p.join(' ');
}

/**
 * Continent shapes. The hex grid still decides who touches whom; here each county's outline is
 * bent so the realm reads as land: shared corners and edges are nudged once, so neighbours still
 * fit, and the outer edges are bent more to make a coast.
 */
type Pt = [number, number];
const f = (p: Pt) => p[0].toFixed(1) + ' ' + p[1].toFixed(1);
const cornerKey = (p: Pt) => Math.round(p[0] * 4) + ',' + Math.round(p[1] * 4);

/** Stable pseudo-random number in [-1, 1] from a key. */
function noise(key: string, salt: number): number {
  let a = salt * 7919;
  for (let i = 0; i < key.length; i++) a = Math.imul(a ^ key.charCodeAt(i), 2654435761);
  a ^= a >>> 15;
  return ((a >>> 0) % 2001) / 1000 - 1;
}

const baseCorner = (i: number, k: number): Pt => {
  const c = center(i), a = ((60 * k - 30) * Math.PI) / 180;
  return [c.x + R * Math.cos(a), c.y + R * Math.sin(a)];
};
const edgeKey = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);

const edgeCount = new Map<string, number>();
const coastCorner = new Set<string>();
for (let i = 0; i < NC; i++) {
  for (let k = 0; k < 6; k++) {
    const e = edgeKey(cornerKey(baseCorner(i, k)), cornerKey(baseCorner(i, (k + 1) % 6)));
    edgeCount.set(e, (edgeCount.get(e) ?? 0) + 1);
  }
}
for (let i = 0; i < NC; i++) {
  for (let k = 0; k < 6; k++) {
    const a = cornerKey(baseCorner(i, k)), b = cornerKey(baseCorner(i, (k + 1) % 6));
    if (edgeCount.get(edgeKey(a, b)) === 1) { coastCorner.add(a); coastCorner.add(b); }
  }
}

function corner(i: number, k: number): Pt {
  const p = baseCorner(i, k), key = cornerKey(p), amp = coastCorner.has(key) ? 6 : 4;
  return [p[0] + noise(key, 1) * amp, p[1] + noise(key, 2) * amp];
}

/** The outline of county i as points: corners plus bent points along each edge. */
function outline(i: number): Pt[] {
  const out: Pt[] = [];
  for (let k = 0; k < 6; k++) {
    const a = corner(i, k), b = corner(i, (k + 1) % 6);
    const ka = cornerKey(baseCorner(i, k)), kb = cornerKey(baseCorner(i, (k + 1) % 6));
    const coast = edgeCount.get(edgeKey(ka, kb)) === 1;
    const steps = coast ? 3 : 1, amp = coast ? 7 : 3.5;
    // walk the edge in a fixed direction so both neighbours place the same points
    const [from, to] = ka < kb ? [a, b] : [b, a];
    const dx = to[0] - from[0], dy = to[1] - from[1], len = Math.hypot(dx, dy) || 1;
    const mids: Pt[] = [];
    for (let j = 1; j <= steps; j++) {
      const t = j / (steps + 1), off = noise(edgeKey(ka, kb), 10 + j) * amp;
      mids.push([from[0] + dx * t - (dy / len) * off, from[1] + dy * t + (dx / len) * off]);
    }
    out.push(a, ...(ka < kb ? mids : mids.reverse()));
  }
  return out;
}

/** Closed smooth curve through the midpoints of a polygon, so edges flow instead of zig-zagging. */
function smooth(pts: Pt[]): string {
  const n = pts.length, mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let d = 'M' + f(mid(pts[0]!, pts[1]!));
  for (let i = 1; i <= n; i++) d += 'Q' + f(pts[i % n]!) + ' ' + f(mid(pts[i % n]!, pts[(i + 1) % n]!));
  return d + 'Z';
}

const GAP = 1.5;
export const COUNTY_PATH: string[] = [];
export const LAND_PATH: string[] = [];
for (let i = 0; i < NC; i++) {
  const o = outline(i), c = center(i), k = (R - GAP) / R;
  LAND_PATH.push(smooth(o));
  COUNTY_PATH.push(smooth(o.map((p): Pt => [c.x + (p[0] - c.x) * k, c.y + (p[1] - c.y) * k])));
}

/** Small islands and wave marks in the sea, placed once. */
export const ISLANDS: { x: number; y: number; rx: number; ry: number }[] = [
  { x: 22, y: 131, rx: 8, ry: 6 }, { x: 376, y: 56, rx: 7, ry: 5 }, { x: 374, y: 206, rx: 8, ry: 6 }, { x: 52, y: 274, rx: 6, ry: 4 },
];
export const WAVES: string[] = Array.from({ length: 26 }, (_, i) => {
  const x = -10 + (noise('w', i + 1) + 1) * 210, y = -6 + (noise('v', i + 1) + 1) * 138;
  return `M${x.toFixed(0)} ${y.toFixed(0)}q3-3 6 0t6 0`;
});
