import { NC, NORMAL_TAX } from './data';
import { applyFarmLimit } from './economy';
import { createRng, type Rng } from './rng';
import { counties, zero } from './state';
import type { County, GameState, Over } from './types';

/** localStorage key used by the legacy game; kept so existing saves are found. */
export const SAVE_KEY = 'fief-and-crown-v1';

/** Fields the legacy game stored in the save but that belong to the screen, not the rules. */
export interface LegacyUi { sel?: number; tab?: string; help?: boolean }

export interface Loaded { state: GameState; rng: Rng; ui: LegacyUi }

/** Save as text. `rng` is the live generator, so a loaded game continues the same sequence. */
export function serialize(state: GameState, rng: Rng, ui: LegacyUi = {}): string {
  return JSON.stringify({ ...state, rng: rng.getState(), ui });
}

/** Deterministic seed for saves that have none (FNV-1a over the text). */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

type Raw = Record<string, any>;

/**
 * Read a save of format v1 (legacy) or v2. Returns null if it is not a usable save.
 * Migrations from the legacy loader: no ore means no mining; tax moves from the lord to each county;
 * troops without a muster record get one; farm preference defaults to the current farm %.
 * Then the player's farms are held to the season's limit, as the legacy game did on boot.
 */
export function parseSave(text: string | null): Loaded | null {
  if (!text) return null;
  let s: Raw;
  try { s = JSON.parse(text); } catch { return null; }
  if (!s || (s.v !== 1 && s.v !== 2) || !Array.isArray(s.C) || s.C.length !== NC || !Array.isArray(s.lords)) return null;

  const C: County[] = s.C.map((c: Raw): County => {
    const arr = c.arr ?? zero();
    return {
      ...c,
      work: { ...c.work, mine: c.i === 0 ? 0 : c.work.mine },
      g: c.g, arr,
      mus: c.mus ?? { spear: arr.spear, archer: arr.archer, knight: arr.knight },
      tax: c.tax ?? s.lords[c.owner]?.tax ?? NORMAL_TAX,
      ration: c.ration ?? 1,
      farmPref: c.farmPref ?? c.work.farm,
      pf: c.pf ?? 0,
    } as County;
  });

  const seed: number = typeof s.seed === 'number' ? s.seed : hashSeed(text);
  const state: GameState = {
    v: 2, seed, turn: s.turn, lords: s.lords, C, market: s.market,
    over: (s.over ?? null) as Over, log: s.log ?? [],
    ...(s.rich ? { rich: true, goals: s.goals ?? {}, stats: s.stats ?? { taken: 0, lost: 0 } } : {}),
    ...(s.level === 'easy' || s.level === 'hard' ? { level: s.level } : {}),
  };
  for (const c of counties(state, 0)) applyFarmLimit(state, c);

  const rng = createRng(seed, typeof s.rng === 'number' ? s.rng : seed);
  const ui: LegacyUi = s.ui ?? { sel: s.sel, tab: s.tab, help: s.help };
  return { state, rng, ui };
}

/* ---------- Export and import as text ---------- */

/** Exported saves start with this, so a pasted block is easy to recognise and a wrong paste is easy to refuse. */
export const EXPORT_PREFIX = 'FIEFCROWN2.';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** A save as one block of plain text that survives chat apps and email: a prefix, then base64 of the save. */
export function exportText(state: GameState, rng: Rng, ui: LegacyUi = {}): string {
  return EXPORT_PREFIX + toBase64(serialize(state, rng, ui));
}

/**
 * Read pasted text: an exported block, or a raw save (legacy `v: 1` or `v: 2` JSON, as stored in localStorage).
 * Spaces, line breaks and wrapping quotes around the text are ignored. Returns null if it is not a usable save.
 */
export function importText(text: string): Loaded | null {
  let t = text.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  if (t.startsWith(EXPORT_PREFIX)) {
    try { t = fromBase64(t.slice(EXPORT_PREFIX.length).replace(/\s+/g, '')); } catch { return null; }
  }
  return parseSave(t);
}
