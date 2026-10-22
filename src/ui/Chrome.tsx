import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { NC, SEASONS, counties, season, type GameState } from '../game';
import { closeSheet, endTurn, game, setFull, setTab, stepCounty, type Tab } from './store';

const TABS: [Tab, string][] = [['county', 'County'], ['realm', 'Realm'], ['chronicle', 'Chronicle']];

export function Tabs({ tab }: { tab: Tab }) {
  return (
    <nav class="tabs" role="tablist" aria-label="Ledger">
      {TABS.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={id === tab} onClick={() => setTab(id)}>{label}</button>
      ))}
    </nav>
  );
}

/** The lower part of the screen: a handle to pull it over the map, the tabs, then the content, which scrolls on its own. */
export function Panel({ children }: { children: ComponentChildren }) {
  const full = game.ui.full, y0 = useRef<number | null>(null), body = useRef<HTMLDivElement>(null);
  const { sel, tab, ctab } = game.ui;
  useEffect(() => { body.current?.querySelector('.pbody, .card')?.scrollTo?.(0, 0); }, [sel, tab, ctab, full]);
  const t0 = useRef<[number, number] | null>(null);
  const touchStart = (e: TouchEvent) => {
    const t = e.touches[0]!;
    t0.current = (e.target as HTMLElement).closest('.grab, .tabs, .subtabs, .warns, input') ? null : [t.clientX, t.clientY];
  };
  // a clear sideways swipe in the county panel goes to your next or previous county
  const touchEnd = (e: TouchEvent) => {
    const s0 = t0.current; t0.current = null;
    if (!s0 || game.ui.tab !== 'county') return;
    const t = e.changedTouches[0]!, dx = t.clientX - s0[0], dy = t.clientY - s0[1];
    if (Math.abs(dx) > 70 && Math.abs(dx) > 2 * Math.abs(dy)) stepCounty(dx < 0 ? 1 : -1);
  };
  const down = (e: PointerEvent) => { y0.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const up = (e: PointerEvent) => {
    if (y0.current === null) return;
    const dy = e.clientY - y0.current;
    y0.current = null;
    if (dy < -24) setFull(true);
    else if (dy > 24) setFull(false);
    else setFull(!full);
  };
  return (
    <section class={'panel' + (full ? ' full' : '')} ref={body} onTouchStart={touchStart} onTouchEnd={touchEnd}>
      <button class="grab" aria-label={full ? 'Show the map' : 'Show more'} aria-expanded={full} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { y0.current = null; }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setFull(!full); } }}>
        <i />
      </button>
      <Tabs tab={game.ui.tab} />
      {children}
    </section>
  );
}

export function Dock({ s }: { s: GameState }) {
  const n = counties(s, 0).length, se = season(s);
  return (
    <div class="dock">
      <div class="dock-in">
        <div class="info"><b>{n} of {NC} counties</b>{s.over ? 'The reign is over' : 'Next: ' + SEASONS[(se + 1) % 4]}</div>
        <button class="btn primary" disabled={!!s.over} onClick={endTurn}>End {SEASONS[se]!.toLowerCase()}</button>
      </div>
    </div>
  );
}

/** The first queued sheet, shown over everything. */
export function SheetView() {
  const sh = game.sheets[0];
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => { ok.current?.focus(); }, [sh]);
  if (!sh) return null;
  return (
    <div class="sheet-bg">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <h2 id="sheetTitle">{sh.title}</h2>
        {sh.body}
        <button class="btn primary" ref={ok} onClick={closeSheet}>{sh.btn}</button>
      </div>
    </div>
  );
}

export function Toast() {
  return game.toast ? <div class="toast" role="status" aria-live="polite">{game.toast}</div> : null;
}
