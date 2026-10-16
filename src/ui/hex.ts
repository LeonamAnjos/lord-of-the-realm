import { COLS } from '../game';

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
