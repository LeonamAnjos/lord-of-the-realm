// The one place that owns the running game. Rules live in ../game; this file holds the state, the generator,
// the screen state (selected county, tab, open sheets), saving, and every action a button can trigger.
import { useEffect, useState } from 'preact/hooks';
import {
  SAVE_KEY, buildFort, buy, exportText, importText, clamp, createRng, endSeason, fmtUnits, newGame, parseSave, playerSend, recruit, sell, serialize,
  setRation, setRationAll, setTax, setTaxAll, setWork, unmuster, KINDS, NB, movable, total, SEASONS, year, season,
  type GameState, type Kind, type Loaded, type Mode, type Rng, type Units, type Work,
} from '../game';
import { attention } from './attention';
import { attentionSheet, battleSheet, helpSheet, overSheet, type Sheet } from './sheets';

export type Tab = 'county' | 'realm' | 'chronicle';
export type CTab = 'work' | 'policy' | 'troops' | 'orders';

export interface Ui {
  sel: number;
  tab: Tab;
  /** the how-to-play sheet has been shown */
  help: boolean;
  /** "start over?" question is open */
  confirm: boolean;
  /** which part of your county the panel shows */
  ctab: CTab;
  /** the quick attack popup on the map: from your county to a neighbour */
  quick: { from: number; to: number } | null;
  /** the panel is pulled up over the map */
  full: boolean;
  /** counties that start with no lord in the next reign */
  wild: number;
  /** the next reign starts with one random county for every lord */
  oneEach: boolean;
  /** open split dialogs, by "from-to" */
  split: Record<string, Units>;
  /** the save box in the Realm tab */
  saveBox: { mode: 'closed' | 'export' | 'import'; text: string; error: string | null; pending: Loaded | null };
}

const FOLD_KEY = 'fief-and-crown-folds';
/** Which panel sections the player folded (true) or opened (false), kept apart from the save so a new reign keeps your layout. */
function loadFolds(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

export const game = {
  fold: loadFolds(),
  s: undefined as unknown as GameState,
  rng: undefined as unknown as Rng,
  ui: { sel: 4, tab: 'county', help: false, confirm: false, wild: 0, oneEach: false, ctab: 'work', full: false, quick: null, split: {}, saveBox: { mode: 'closed', text: '', error: null, pending: null } } as Ui,
  sheets: [] as Sheet[],
  toast: null as string | null,
  /** the board fades out while a season ends, then back in with the new one */
  fade: null as 'out' | 'in' | null,
};

/* ---------- change notification ---------- */
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
/** Re-render the component whenever the game changes. */
export function useGame(): typeof game {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((v) => v + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return game;
}

/* ---------- saving ---------- */
function persist(): void {
  try { localStorage.setItem(SAVE_KEY, serialize(game.s, game.rng, { sel: game.ui.sel, tab: game.ui.tab, help: game.ui.help })); } catch { /* storage full or blocked: play on */ }
}
/** Run a change, then save and redraw. */
function act(fn: () => void): void { fn(); persist(); emit(); }

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;

function begin(seed: number): void {
  game.rng = createRng(seed);
  game.s = newGame(game.rng, seed, { unclaimed: game.ui.wild, oneEach: game.ui.oneEach });
  game.ui.quick = null;
}

/* ---------- sheets and toast ---------- */
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(t: string): void {
  game.toast = t;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { game.toast = null; emit(); }, 3200);
  emit();
}
const pushSheet = (sh: Sheet): void => { game.sheets.push(sh); };
export function closeSheet(): void {
  const cur = game.sheets.shift();
  emit();
  cur?.cb?.();
}

/* ---------- boot ---------- */
export function boot(): void {
  let loaded: ReturnType<typeof parseSave> = null;
  try { loaded = parseSave(localStorage.getItem(SAVE_KEY)); } catch { /* no storage */ }
  if (loaded) {
    game.s = loaded.state; game.rng = loaded.rng; game.ui.quick = null;
    const u = loaded.ui;
    game.ui.sel = typeof u.sel === 'number' ? u.sel : 4;
    game.ui.tab = u.tab === 'realm' || u.tab === 'chronicle' ? u.tab : 'county';
    game.ui.help = !!u.help;
  } else {
    begin(randomSeed());
  }
  if (!game.ui.help) { game.ui.help = true; pushSheet(helpSheet()); }
  if (game.s.over) pushSheet(overSheet(game.s, startNewGame));
  persist();
}

/* ---------- actions ---------- */
export const select = (id: number): void => act(() => { game.ui.sel = id; game.ui.tab = 'county'; game.ui.quick = null; });
/** Tap a county on the map: a neighbour you could march on opens the quick attack popup, anything else is selected. */
export const tapCounty = (id: number): void => {
  const from = game.s.C[game.ui.sel], to = game.s.C[id];
  if (from && to && from.owner === 0 && to.owner !== 0 && NB[from.id]!.includes(id) && total(movable(from)) > 0 && !game.s.over) act(() => { game.ui.quick = { from: from.id, to: id }; });
  else select(id);
};
export const closeQuick = (): void => act(() => { game.ui.quick = null; });
export const toggleFold = (id: string, shut: boolean): void => {
  game.fold[id] = shut;
  try { localStorage.setItem(FOLD_KEY, JSON.stringify(game.fold)); } catch { /* play on */ }
  emit();
};
export const setCtab = (t: CTab): void => act(() => { game.ui.ctab = t; });
export const setFull = (v: boolean): void => act(() => { game.ui.full = v; });
export const setTab = (tab: Tab): void => act(() => { game.ui.tab = tab; game.ui.confirm = false; });
const sel = () => game.s.C[game.ui.sel]!;

export const adjustWork = (k: keyof Work, d: number): void => act(() => { setWork(game.s, sel(), k, d); });
export const muster = (k: Kind, n: number): void => act(() => {
  if (!recruit(game.s, sel(), k, n)) toast('Cannot muster: check gold, wood, iron and the people left.');
});
export const undo = (k: Kind, n: number): void => act(() => {
  if (!unmuster(game.s, sel(), k, n)) toast('Nothing to undo. Only troops you mustered in this county this season can be taken back.');
});
export const fort = (): void => act(() => { buildFort(game.s, sel()); });
export const tax = (v: number): void => act(() => { setTax(sel(), v); });
export const ration = (v: number): void => act(() => { setRation(sel(), v); });
export const rationAll = (v: number): void => act(() => { setRationAll(game.s, v); });
/** Go to your next (1) or previous (-1) county, wrapping round. Does nothing unless a county of yours is selected. */
export const stepCounty = (dir: 1 | -1): void => act(() => {
  const mine = game.s.C.filter((c) => c.owner === 0);
  const i = mine.findIndex((c) => c.id === game.ui.sel);
  if (i < 0 || mine.length < 2) return;
  game.ui.sel = mine[(i + dir + mine.length) % mine.length]!.id;
  game.ui.tab = 'county'; game.ui.quick = null;
});
export const taxAll = (v: number): void => act(() => { setTaxAll(game.s, v); });
export const buyLot = (k: 'grain' | 'wood' | 'iron'): void => act(() => { buy(game.s, k); });
export const sellLot = (k: 'grain' | 'wood' | 'iron'): void => act(() => { sell(game.s, k); });

function send(fromId: number, toId: number, mode: Mode): boolean {
  const res = playerSend(game.s, game.rng, fromId, toId, mode);
  if (!res) return false;
  if (res.kind === 'move') toast(`Marched ${fmtUnits(res.m)} to ${game.s.C[toId]!.name}.`);
  else {
    pushSheet(battleSheet(game.s, res.report));
    if (game.s.over) pushSheet(overSheet(game.s, startNewGame));
  }
  return true;
}
export const sendOrder = (fromId: number, toId: number, mode: 'all' | 'half' | 'strike'): void => act(() => { game.ui.quick = null; send(fromId, toId, mode); });

export const splitKey = (f: number, t: number): string => f + '-' + t;
export const splitOpen = (key: string): void => act(() => { game.ui.split[key] = { spear: 50, archer: 50, knight: 50 }; });
export const splitClose = (key: string): void => act(() => { delete game.ui.split[key]; });
export const splitPct = (key: string, k: Kind, d: number): void => act(() => {
  const sp = game.ui.split[key];
  if (sp) sp[k] = clamp(sp[k] + d, 0, 100);
});
export const splitAll = (key: string, v: number): void => act(() => {
  const sp = game.ui.split[key];
  if (sp) for (const k of KINDS) sp[k] = v;
});
export const sendSplit = (key: string, fromId: number, toId: number): void => act(() => {
  const sp = game.ui.split[key];
  if (!sp) return;
  if (send(fromId, toId, { ...sp })) delete game.ui.split[key];
});

function runEndTurn(): void {
  game.ui.quick = null;
  const res = endSeason(game.s, game.rng);
  if (!res) return;
  for (const b of res.battles) pushSheet(battleSheet(game.s, b));
  if (game.s.over) pushSheet(overSheet(game.s, startNewGame));
  else if (!res.battles.length) {
    toast(`${SEASONS[season(game.s)]} ${year(game.s)} begins.${res.moved ? ` ${res.moved} farmers moved to the crafts.` : ''}`);
  }
}

const FADE_OUT_MS = 280, FADE_IN_MS = 450;
/** End the season: fade the board out, turn the season over while it is dark, fade it back in. */
export const endTurn = (): void => {
  if (game.fade) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { act(runEndTurn); return; }
  game.fade = 'out';
  emit();
  setTimeout(() => {
    act(() => { runEndTurn(); game.fade = 'in'; });
    setTimeout(() => { game.fade = null; emit(); }, FADE_IN_MS);
  }, FADE_OUT_MS);
};

export const askNew = (): void => act(() => { game.ui.confirm = true; });
export const setOneEach = (v: boolean): void => act(() => { game.ui.oneEach = v; });
export const setWild = (n: number): void => act(() => { game.ui.wild = n; });
export const cancelNew = (): void => act(() => { game.ui.confirm = false; });
export function startNewGame(): void {
  act(() => {
    begin(randomSeed());
    game.ui.sel = game.s.C.find((c) => c.owner === 0)!.id; game.ui.tab = 'county'; game.ui.confirm = false; game.ui.split = {}; game.ui.help = true;
    game.sheets = [];
    pushSheet(helpSheet());
  });
}
export const showAttention = (): void => act(() => {
  const items = attention(game.s);
  if (items.length) pushSheet(attentionSheet(items, (id) => { closeSheet(); select(id); }));
});
export const showHelp = (): void => act(() => { pushSheet(helpSheet()); });

/* ---------- save export and import ---------- */
const box = () => game.ui.saveBox;
export const closeSaveBox = (): void => act(() => { game.ui.saveBox = { mode: 'closed', text: '', error: null, pending: null }; });
export const openExport = (): void => act(() => {
  game.ui.saveBox = { mode: 'export', text: exportText(game.s, game.rng, { sel: game.ui.sel, tab: game.ui.tab, help: game.ui.help }), error: null, pending: null };
});
export const openImport = (): void => act(() => { game.ui.saveBox = { mode: 'import', text: '', error: null, pending: null }; });
export const typeImport = (text: string): void => { box().text = text; box().error = null; box().pending = null; emit(); };
/** Check the pasted text; if it is a save, ask before replacing the current reign. */
export const checkImport = (): void => act(() => {
  const loaded = importText(box().text);
  if (!loaded) { box().error = 'That does not look like a Fief & Crown save. Paste the whole text you exported, with nothing cut off.'; box().pending = null; }
  else { box().error = null; box().pending = loaded; }
});
export const applyImport = (): void => act(() => {
  const loaded = box().pending;
  if (!loaded) return;
  game.s = loaded.state; game.rng = loaded.rng;
  const u = loaded.ui;
  game.ui.sel = typeof u.sel === 'number' ? u.sel : 4;
  game.ui.tab = 'county'; game.ui.confirm = false; game.ui.split = {}; game.ui.help = true;
  game.sheets = [];
  game.ui.saveBox = { mode: 'closed', text: '', error: null, pending: null };
  if (game.s.over) pushSheet(overSheet(game.s, startNewGame));
  toast('Save loaded.');
});
/** Copy the exported text; on browsers that refuse, the box is already selectable. */
export async function copyExport(): Promise<void> {
  try { await navigator.clipboard.writeText(box().text); toast('Save copied.'); }
  catch { toast('Could not copy. Press and hold the text to select it.'); }
}
