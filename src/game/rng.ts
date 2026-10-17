/** A seeded random source. Calling it returns a float in [0, 1). `getState` lets a save resume the exact sequence. */
export interface Rng {
  (): number;
  getState(): number;
}

/** Mulberry32: small, fast, seedable. Pass `state` to resume a saved sequence. */
export function createRng(seed: number, state?: number): Rng {
  let a = (state ?? seed) >>> 0;
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.getState = () => a;
  return next;
}

/** Uniform float in [a, b). Same shape as the legacy `rr`. */
export const range = (rng: Rng, a: number, b: number): number => a + rng() * (b - a);

/** Uniform integer in [0, n). */
export const index = (rng: Rng, n: number): number => Math.floor(rng() * n);
