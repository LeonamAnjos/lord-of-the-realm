// The one place that owns the running game. Rules live in ../game; this file holds the state, the generator,
// the screen state (selected county, tab, open sheets), saving, and every action a button can trigger.
import { useEffect, useState } from 'preact/hooks';
import {
  SAVE_KEY, buildFort, decide, buy, exportText, importText, clamp, createRng, endSeason, fmtUnits, newGame, parseSave, playerSend, recruit, sell, serialize,
  setRation, setTax, setWork, unmuster, KINDS, NB, movable, total, SEASONS, year, season,
  type GameState, type Kind, type Level, type Loaded, type Mode, type Rng, type Units, type Work,
} from '../game';
import { attention, countyFlags } from './attention';
import { attentionSheet, battleSheet, choiceSheet, helpSheet, overSheet, type Sheet } from './sheets';

export type Tab = 'county' | 'realm' | 'chronicle';
export type CTab = 'work' | 'policy' | 'troops' | 'orders';
/** Which counties the list shows: yours, yours with a warning, yours at a border, or everyone else's. */
export type View = 'mine' | 'warn' | 'border' | 'rivals';
export type Sort = 'map' | 'name' | 'mood' | 'army' | 'pop';

export interface Ui {
  sel: number;
  tab: Tab;
  /** the how-to-play sheet has been shown */
  help: boolean;
  /** "start over?" question is open */
  confirm: boolean;
  /** which part of a rival county the ?inspect view shows */
  ctab: CTab;
  /** county cards that are open in the list, and the part each one shows */
  open: number[];
  ctabs: Record<number, CTab>;
  view: View;
  sort: Sort;
  /** county under the pointer in the list, outlined on the map without selecting it */
  hover: number | null;
  /** scroll the list to this county's card once */
  scrollTo: number | null;
  /** chronicle lines written while the last season ended, shown above the list until closed */
  recap: { t: number; lines: { k: string; txt: string }[] } | null;
  /** ?inspect: the rival county shown in place of the list */
  inspect: number | null;
  /** the quick attack popup on the map: from your county to a neighbour */
  quick: { from: number; to: number } | null;
  /** the panel is pulled up over the map */
  full: boolean;
  /** counties that start with no lord in the next reign */
  wild: number;
  /** the next reign starts with one random county for every lord */
  oneEach: boolean;
  /** the next reign uses the living realm rules */
  rich: boolean;
  /** events in the next reign ask what to do */
  decide: boolean;
  /** conquered counties in the next reign may revolt, and rivals ally against a leader */
  unrest: boolean;
  crops: boolean;
  /** how hard the rivals play in the next reign */
  level: Level;
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
  ui: { sel: 4, tab: 'county', help: false, confirm: false, wild: 0, oneEach: false, rich: false, decide: false, unrest: false, crops: false, level: 'normal', ctab: 'work', open: [], ctabs: {}, view: 'mine', sort: 'map', hover: null, scrollTo: null, recap: null, inspect: null, full: false, quick: null, split: {}, saveBox: { mode: 'closed', text: '', error: null, pending: null } } as Ui,
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
  game.s = newGame(game.rng, seed, { unclaimed: game.ui.wild, oneEach: game.ui.oneEach, rich: game.ui.rich, decide: game.ui.decide, unrest: game.ui.unrest, crops: game.ui.crops, level: game.ui.level });
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
    game.ui.rich = !!loaded.state.rich; game.ui.decide = !!loaded.state.decide; game.ui.unrest = !!loaded.state.unrest; game.ui.crops = !!loaded.state.crops; game.ui.level = loaded.state.level ?? 'normal';
  } else {
    begin(randomSeed());
  }
  game.ui.open = [game.ui.sel]; game.ui.scrollTo = game.ui.sel;
  if (!game.ui.help) { game.ui.help = true; pushSheet(helpSheet()); }
  if (game.s.over) pushSheet(overSheet(game.s, startNewGame));
  else queueChoice();
  persist();
}

/** Show the waiting event's choices, once. */
function queueChoice(): void {
  const p = game.s.pending;
  if (p && !game.sheets.some((x) => x.key === 'choice')) pushSheet(choiceSheet(game.s, p, choose));
}
/** Answer the waiting event. */
export const choose = (id: string): void => act(() => {
  if (!decide(game.s, game.rng, id)) { toast('That cannot be chosen now.'); return; }
  game.sheets = game.sheets.filter((x) => x.key !== 'choice');
  const e = game.s.log[game.s.log.length - 1];
  if (e) toast(e.txt);
});
export const showChoice = (): void => act(queueChoice);

/* ---------- actions ---------- */
/** Which counties a list view holds. */
export function inView(s: GameState, v: View, id: number): boolean {
  const c = s.C[id]!;
  if (v === 'rivals') return c.owner !== 0;
  if (c.owner !== 0) return false;
  if (v === 'border') return NB[id]!.some((n) => s.C[n]!.owner !== 0);
  if (v === 'warn') return countyFlags(s, c).some((f) => f.tone === 'bad' || f.tone === 'warn');
  return true;
}
/** Make a county the selected one: open its card, show it in the list and scroll to it. */
function focus(id: number): void {
  const u = game.ui;
  u.sel = id; u.tab = 'county'; u.quick = null; u.inspect = null;
  if (!u.open.includes(id)) u.open.push(id);
  if (!inView(game.s, u.view, id)) u.view = game.s.C[id]!.owner === 0 ? 'mine' : 'rivals';
  u.scrollTo = id;
}
export const select = (id: number): void => act(() => focus(id));
/** Tap a card's heading: open it and make it the selected county, or fold it away. */
export const toggleCard = (id: number): void => act(() => {
  const u = game.ui, i = u.open.indexOf(id);
  if (i >= 0) u.open.splice(i, 1);
  else { u.open.push(id); u.sel = id; u.quick = null; }
});
export const openAll = (ids: number[]): void => act(() => { game.ui.open = [...new Set([...game.ui.open, ...ids])]; });
export const closeAll = (): void => act(() => { game.ui.open = []; });
export const setView = (v: View): void => act(() => { game.ui.view = v; });
export const setSort = (v: Sort): void => act(() => { game.ui.sort = v; });
export const setCardTab = (id: number, t: CTab): void => act(() => { game.ui.ctabs[id] = t; game.ui.sel = id; });
/** Hovering is not saved and changes nothing in the game, so it only redraws. */
export const setHover = (id: number | null): void => { if (game.ui.hover !== id) { game.ui.hover = id; emit(); } };
export const scrolled = (): void => { game.ui.scrollTo = null; };
export const closeRecap = (): void => act(() => { game.ui.recap = null; });
export const inspect = (id: number | null): void => act(() => { game.ui.inspect = id; });
/** Tap a county on the map: a neighbour you could march on opens the quick attack popup, anything else is selected. */
export const tapCounty = (id: number): void => {
  const from = game.s.C[game.ui.sel], to = game.s.C[id];
  if (from && to && from.owner === 0 && to.owner !== 0 && NB[from.id]!.includes(id) && total(movable(from)) > 0 && !game.s.over) act(() => { game.ui.quick = { from: from.id, to: id }; });
  else act(() => focus(id));
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
const at = (id: number) => game.s.C[id]!;

export const adjustWork = (id: number, k: keyof Work, d: number): void => act(() => { setWork(game.s, at(id), k, d); });
export const muster = (id: number, k: Kind, n: number): void => act(() => {
  if (!recruit(game.s, at(id), k, n)) toast('Cannot muster: check gold, wood, iron and the people left.');
});
export const undo = (id: number, k: Kind, n: number): void => act(() => {
  if (!unmuster(game.s, at(id), k, n)) toast('Nothing to undo. Only troops you mustered in this county this season can be taken back.');
});
export const fort = (id: number): void => act(() => { buildFort(game.s, at(id)); });
export const tax = (id: number, v: number): void => act(() => { setTax(at(id), v); });
export const ration = (id: number, v: number): void => act(() => { setRation(at(id), v); });
/** Set one tax rate or ration in several of your counties at once. */
export const taxSome = (ids: number[], v: number): void => act(() => { for (const id of ids) if (at(id).owner === 0) setTax(at(id), v); });
export const rationSome = (ids: number[], v: number): void => act(() => { for (const id of ids) if (at(id).owner === 0) setRation(at(id), v); });
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
  const before = game.s.log.length, t = game.s.turn;
  const res = endSeason(game.s, game.rng);
  if (!res) return;
  const lines = game.s.log.slice(before).map((e) => ({ k: e.k, txt: e.txt }));
  game.ui.recap = lines.length ? { t, lines } : null;
  for (const b of res.battles) pushSheet(battleSheet(game.s, b));
  if (game.s.over) pushSheet(overSheet(game.s, startNewGame));
  else queueChoice();
  if (!game.s.over && !res.battles.length) {
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
export const setRich = (v: boolean): void => act(() => { game.ui.rich = v; });
/** Turn the living realm, events you choose, unrest and the crop year on or off together. */
export const setFullRealm = (v: boolean): void => act(() => { game.ui.rich = v; game.ui.decide = v; game.ui.unrest = v; game.ui.crops = v; });
export const setCrops = (v: boolean): void => act(() => { game.ui.crops = v; });
export const setUnrest = (v: boolean): void => act(() => { game.ui.unrest = v; });
export const setDecide = (v: boolean): void => act(() => { game.ui.decide = v; });
export const setLevel = (v: Level): void => act(() => { game.ui.level = v; });
export const setWild = (n: number): void => act(() => { game.ui.wild = n; });
export const cancelNew = (): void => act(() => { game.ui.confirm = false; });
export function startNewGame(): void {
  act(() => {
    begin(randomSeed());
    game.ui.sel = game.s.C.find((c) => c.owner === 0)!.id; game.ui.tab = 'county'; game.ui.confirm = false; game.ui.split = {}; game.ui.help = true;
    game.ui.open = [game.ui.sel]; game.ui.view = 'mine'; game.ui.recap = null; game.ui.scrollTo = game.ui.sel;
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
  game.ui.open = [game.ui.sel]; game.ui.view = 'mine'; game.ui.recap = null; game.ui.scrollTo = game.ui.sel;
  game.sheets = [];
  game.ui.saveBox = { mode: 'closed', text: '', error: null, pending: null };
  game.ui.decide = !!game.s.decide; game.ui.unrest = !!game.s.unrest; game.ui.crops = !!game.s.crops;
  if (game.s.over) pushSheet(overSheet(game.s, startNewGame));
  else queueChoice();
  toast('Save loaded.');
});
/** Copy the exported text; on browsers that refuse, the box is already selectable. */
export async function copyExport(): Promise<void> {
  try { await navigator.clipboard.writeText(box().text); toast('Save copied.'); }
  catch { toast('Could not copy. Press and hold the text to select it.'); }
}
