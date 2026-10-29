// The Counties tab: every county as a card. Folded, a card sums up mood, people, garrison, jobs, policy and what it adds each season.
// Open, it holds the county's controls (work, policy, troops, orders), so you can run the realm without stepping from county to county.
import { useEffect, useState } from 'preact/hooks';
import {
  FORT, KINDS, NB, NEUTRAL, garrisonHold, oldLord, pendingTitle, rebels, remembers, revoltChance, sinceStamp, UNREST_BELOW, RATION, SEASONS, TAX, U, atkMult, atkOf, canAfford, capOf, craft, defence, eat, estDef, farmLimit, fortMult, idlePct, prod, season, seenTroops, START_YEAR, taxGold, upkeep,
  type County, type GameState, type Work,
} from '../game';
import { countyFlags } from './attention';
import { MoodNote, PopNote, moodCol, moodWord, ownerCol, pips, signed } from './format';
import { InspectCounty, INSPECT } from './Inspect';
import { Order, orderRows } from './Orders';
import { CountyScene } from './scene';
import {
  adjustWork, showChoice, closeAll, closeRecap, fort, game, inView, inspect, muster, openAll, ration, rationSome, scrolled, setCardTab, setHover, setSort, setTab, setView, tax, taxSome, toggleCard, undo,
  type CTab, type Sort, type View,
} from './store';

const VIEWS: [View, string][] = [['mine', 'Yours'], ['warn', 'Warnings'], ['border', 'Border'], ['rivals', 'Rivals']];
const SORTS: [Sort, string][] = [['map', 'Map order'], ['name', 'Name'], ['mood', 'Mood, worst first'], ['army', 'Army, largest first'], ['pop', 'People, most first']];
const SORT_BY: Record<Sort, (a: County, b: County) => number> = {
  map: (a, b) => a.id - b.id,
  name: (a, b) => a.name.localeCompare(b.name),
  mood: (a, b) => a.mood - b.mood || a.id - b.id,
  army: (a, b) => atkOf(b.g) + defence(b) - atkOf(a.g) - defence(a),
  pop: (a, b) => b.pop - a.pop,
};
const CTABS: [CTab, string][] = [['work', 'Work'], ['policy', 'Policy'], ['troops', 'Troops'], ['orders', 'Orders']];
const LABELS: Record<keyof Work, string> = { farm: 'Farmland', wood: 'Woodcutters', mine: 'Miners' };
const mouse = (e: PointerEvent) => e.pointerType === 'mouse';

export function CountyList({ s }: { s: GameState }) {
  const ui = game.ui;
  useEffect(() => {
    const id = ui.scrollTo;
    if (id === null) return;
    scrolled();
    const el = document.getElementById('cty-' + id);
    if (!el) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  });
  if (INSPECT && ui.inspect !== null && s.C[ui.inspect]!.owner > 0) {
    return (
      <>
        <div class="insp-back"><button class="btn sm" onClick={() => inspect(null)}>‹ Back to the list</button></div>
        <InspectCounty s={s} c={s.C[ui.inspect]!} />
      </>
    );
  }
  const list = s.C.filter((c) => inView(s, ui.view, c.id)).sort(SORT_BY[ui.sort]);
  const own = list.filter((c) => c.owner === 0).map((c) => c.id);
  return (
    <div class="pbody clist" onPointerLeave={(e) => mouse(e) && setHover(null)}>
      <Toolbar s={s} own={own} ids={list.map((c) => c.id)} />
      {s.pending && (
        <div class="cdecide">
          <b>{pendingTitle(s, s.pending)}</b>
          <button class="btn" onClick={showChoice}>Decide</button>
        </div>
      )}
      <Recap />
      {list.length ? list.map((c) => <Card key={c.id} s={s} c={c} />)
        : <p class="cempty">{ui.view === 'warn' ? 'No county of yours has a warning this season.' : ui.view === 'rivals' ? 'Every county is yours.' : 'None of your counties is shown here.'}</p>}
    </div>
  );
}

function Toolbar({ s, own, ids }: { s: GameState; own: number[]; ids: number[] }) {
  const ui = game.ui, count = (v: View) => s.C.filter((c) => inView(s, v, c.id)).length;
  const anyOpen = ids.some((id) => ui.open.includes(id)), [bulk, setBulk] = useState(false);
  return (
    <div class="ctools">
      <div class="cviews" role="group" aria-label="Show">
        {VIEWS.map(([v, label]) => (
          <button key={v} aria-pressed={ui.view === v} onClick={() => setView(v)}>{label}<i>{count(v)}</i></button>
        ))}
      </div>
      <div class="crow">
        <label class="csort">Sort
          <select value={ui.sort} onChange={(e) => setSort((e.currentTarget as HTMLSelectElement).value as Sort)}>
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {own.length > 1 && <button class="cghost" aria-expanded={bulk} onClick={() => setBulk(!bulk)}>Set for all {own.length}</button>}
        <button class="cghost" onClick={() => (anyOpen ? closeAll() : openAll(ids))}>{anyOpen ? 'Close all' : 'Open all'}</button>
      </div>
      {own.length > 1 && bulk && (
        <div class="cbulk">
          <p class="note">Tax or rations for the {own.length} counties of yours shown above:</p>
          <div class="cbulk-in">
            <span class="clbl">Tax</span>
            <div class="seg">{TAX.map((t, i) => <button key={i} class="btn sm" onClick={() => taxSome(own, i)}>{t.n}</button>)}</div>
            <span class="clbl">Rations</span>
            <div class="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>{RATION.map((r, i) => <button key={i} class="btn sm" onClick={() => rationSome(own, i)}>{r.n}</button>)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/** What happened while the last season ended, until you close it. */
function Recap() {
  const r = game.ui.recap;
  if (!r) return null;
  const shown = r.lines.slice(-4);
  return (
    <section class="crecap" aria-label="What happened">
      <div class="crecap-h">
        <b>What happened in {SEASONS[r.t % 4]} {START_YEAR + Math.floor(r.t / 4)}</b>
        <button class="qx" aria-label="Close" onClick={closeRecap}>×</button>
      </div>
      {shown.map((l, i) => <p key={i} class={l.k}>{l.txt}</p>)}
      <button class="cghost" onClick={() => setTab('chronicle')}>{r.lines.length > shown.length ? `All ${r.lines.length} entries in the Chronicle` : 'Open the Chronicle'}</button>
    </section>
  );
}

function Card({ s, c }: { s: GameState; c: County }) {
  const ui = game.ui, open = ui.open.includes(c.id), sel = ui.sel === c.id, flags = countyFlags(s, c);
  const lord = c.owner === NEUTRAL ? 'No lord' : s.lords[c.owner]!.name;
  return (
    <article id={'cty-' + c.id} class={`cty o${c.owner}${open ? ' open' : ''}${sel ? ' sel' : ''}`} onPointerEnter={(e) => mouse(e) && setHover(c.id)}>
      <button class="cty-h" aria-expanded={open} aria-controls={'ctyb-' + c.id} onClick={() => toggleCard(c.id)}>
        <span class="cty-t">
          <span class="dotc" style={{ background: `var(--${ownerCol(c.owner)})` }} />
          <span class="cty-n">{c.name}</span>
          {c.owner !== 0 && <span class="cty-l">{lord}</span>}
          <span class="cflags">{flags.map((f) => <span key={f.text} class={'cflag ' + f.tone}>{f.text}</span>)}</span>
          <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6" /></svg>
        </span>
        {c.owner === 0 ? <OwnSummary s={s} c={c} /> : <FoeSummary s={s} c={c} />}
      </button>
      {open && (
        <div class="cty-b" id={'ctyb-' + c.id}>
          {c.owner === 0 ? <OwnBody s={s} c={c} /> : <FoeBody s={s} c={c} />}
        </div>
      )}
    </article>
  );
}

function OwnSummary({ s, c }: { s: GameState; c: County }) {
  const se = season(s), p = prod(c, se), id = idlePct(c);
  const net: [string, number][] = [
    ['gold', taxGold(c) + craft(c) - upkeep(c)],
    ['grain', p.grain - eat(c)],
    ['wood', p.wood],
    ['iron', p.iron],
  ];
  return (
    <>
      <span class="cty-s">
        <span><label>Mood</label><b style={{ color: moodCol(c.mood) }}>{moodWord(c.mood)} <em>{Math.round(c.mood)}</em></b><MoodNote s={s} c={c} flush /></span>
        <span><label>People</label><b>{c.pop}<em> of {Math.round(capOf(c))}</em></b><PopNote s={s} c={c} flush /></span>
        <span><label>Garrison</label><b>{fmtShort(c.g)}</b><small>defence {Math.round(defence(c))} · attack {atkOf(c.g)}</small></span>
      </span>
      <span class="cjobs">
        <span class="cjobbar" aria-hidden="true">
          <i style={{ width: c.work.farm + '%', background: 'var(--grain)' }} /><i style={{ width: c.work.wood + '%', background: 'var(--wood)' }} />
          <i style={{ width: c.work.mine + '%', background: 'var(--iron)' }} /><i style={{ width: id + '%', background: 'var(--gold)' }} />
        </span>
        <span class="cjoblab">
          <span><b style={{ color: 'var(--grain)' }}>{c.work.farm}%</b> farm</span><span><b style={{ color: 'var(--wood)' }}>{c.work.wood}%</b> wood</span>
          <span><b style={{ color: 'var(--iron)' }}>{c.work.mine}%</b> mine</span><span><b style={{ color: 'var(--gold)' }}>{id}%</b> crafts</span>
        </span>
      </span>
      <span class="cchips">
        <span class="cchip"><b>{TAX[c.tax]!.n}</b> tax</span>
        <span class="cchip"><b>{RATION[c.ration]!.n}</b> rations</span>
        {c.fort > 0 && <span class="cchip">Fort <b>{c.fort}</b>/3</span>}
      </span>
      {remembers(s, c) && (
        <span class="cunrest">
          Remembers {oldLord(s, c)} until {sinceStamp(c)}. Revolt chance this season: <b>{Math.round(revoltChance(s, c) * 100)}%</b> (only while mood is under {UNREST_BELOW}). About {rebels(c)} rebels against garrison defence {Math.round(garrisonHold(c))}.
        </span>
      )}
      <span class="cnet" aria-label="Change each season">
        {net.map(([k, v]) => {
          const r = Math.abs(v) < 10 && Math.round(v * 10) % 10 !== 0 ? Math.round(v * 10) / 10 : Math.round(v);
          return <span key={k}><b class={r > 0 ? 'up' : r < 0 ? 'dn' : ''}>{signed(r)}</b> <span style={{ color: `var(--${k})` }}>{k}</span></span>;
        })}
        <small>a season</small>
      </span>
    </>
  );
}

function FoeSummary({ s, c }: { s: GameState; c: County }) {
  const near = NB[c.id]!.some((n) => s.C[n]!.owner === 0);
  return (
    <span class="cty-s">
      <span><label>People</label><b>{c.pop}</b><small>mood unknown</small></span>
      <span><label>Defence</label><b>{near ? '~' + estDef(s, c) : '?'}</b><small>{near ? 'scouted' : 'too far to scout'}</small></span>
      <span><label>Garrison</label><b>{seenTroops(s, c)} troops</b><small>fort {c.fort} of 3</small></span>
    </span>
  );
}

/** "36 kn · 10 ar" for a folded card; the full names are in the Troops tab. */
function fmtShort(g: County['g']): string {
  const short = { spear: 'sp', archer: 'ar', knight: 'kn' } as const;
  const parts = KINDS.filter((k) => g[k] > 0).map((k) => `${g[k]} ${short[k]}`);
  return parts.length ? parts.join(' · ') : 'none';
}

function OwnBody({ s, c }: { s: GameState; c: County }) {
  const tab = game.ui.ctabs[c.id] ?? 'work', foes = orderRows(s, c).filter(([, t]) => t.owner !== 0).length;
  return (
    <>
      <nav class="subtabs" role="tablist" aria-label={c.name}>
        {CTABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={id === tab} onClick={() => setCardTab(c.id, id)}>
            {label}{id === 'orders' && foes > 0 ? <i>{foes}</i> : null}
          </button>
        ))}
      </nav>
      <div class="cpane">
        {tab === 'work' && <WorkPane s={s} c={c} />}
        {tab === 'policy' && <PolicyPane c={c} />}
        {tab === 'troops' && <TroopsPane s={s} c={c} />}
        {tab === 'orders' && <OrdersPane s={s} c={c} />}
      </div>
    </>
  );
}

function WorkPane({ s, c }: { s: GameState; c: County }) {
  const se = season(s), p = prod(c, se), lim = farmLimit(c, se);
  return (
    <div class="rows">
      {game.ui.full && <CountyScene s={s} c={c} />}
      <div class="chips">
        <span class="chip">Soil<b>{pips(c.f)}</b></span>
        <span class="chip">Timber<b>{pips(c.w)}</b></span>
        <span class="chip">Ore<b>{pips(c.i)}</b></span>
      </div>
      {(['farm', 'wood', 'mine'] as const).map((k) => {
        const n = Math.round((c.pop * c.work[k]) / 100);
        const out =
          k === 'farm' ? `${se === 3 ? 'Nothing grows in winter' : '+' + Math.round(p.grain) + ' grain'} · limit ${lim}%`
          : k === 'wood' ? `+${Math.round(p.wood)} wood`
          : c.i === 0 ? 'No ore here' : `+${p.iron.toFixed(1)} iron`;
        const plusOff = idlePct(c) < 5 || (k === 'mine' && c.i === 0) || (k === 'farm' && c.work.farm + 5 > lim);
        return (
          <div class="row" key={k}>
            <div class="grow"><b>{LABELS[k]}</b><small>{n} people · {out}</small></div>
            <div class="stepper">
              <button class="btn" disabled={c.work[k] < 5} aria-label={`Fewer ${LABELS[k]} in ${c.name}`} onClick={() => adjustWork(c.id, k, -5)}>−</button>
              <output>{c.work[k]}%</output>
              <button class="btn" disabled={plusOff} aria-label={`More ${LABELS[k]} in ${c.name}`} onClick={() => adjustWork(c.id, k, 5)}>+</button>
            </div>
          </div>
        );
      })}
      <div class="row"><div class="grow"><b>Townsfolk and crafts</b><small>{idlePct(c)}% · +{craft(c).toFixed(1)} gold</small></div></div>
      <p class="note">
        The fields can only use so many people in a season ({SEASONS[se]}: up to {lim}% here, more on good soil). When a new season starts with more farmers than that, the extra people move to the crafts and earn gold. Your farming choice returns when the limit allows.
      </p>
    </div>
  );
}

function PolicyPane({ c }: { c: County }) {
  const t = TAX[c.tax]!, r = RATION[c.ration]!;
  return (
    <div class="rows">
      <h3>Tax</h3>
      <div class="seg">{TAX.map((x, i) => <button key={i} class={'btn sm' + (c.tax === i ? ' on' : '')} aria-pressed={c.tax === i} onClick={() => tax(c.id, i)}>{x.n}</button>)}</div>
      <p class="note">{t.n} tax: about {Math.round(taxGold(c))} gold a season, mood {signed(t.m)} a season (well-fed people recover 2 more).</p>
      <h3>Rations</h3>
      <div class="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {RATION.map((x, i) => <button key={i} class={'btn sm' + (c.ration === i ? ' on' : '')} aria-pressed={c.ration === i} onClick={() => ration(c.id, i)}>{x.n}</button>)}
      </div>
      <p class="note">{r.n} rations: this county eats {Math.round(eat(c))} grain a season (people and soldiers), mood {signed(r.m)} a season while the realm is fed. Scant rations save grain but sour the mood.</p>
    </div>
  );
}

function TroopsPane({ s, c }: { s: GameState; c: County }) {
  const st = s.lords[0]!.stock, next = FORT[c.fort];
  return (
    <div class="rows">
      {KINDS.map((k) => {
        const u = U[k];
        const cost = u.gold + 'g' + (u.wood ? ` ${u.wood}w` : '') + (u.iron ? ` ${u.iron}i` : '');
        return (
          <div class="row" key={k}>
            <div class="grow">
              <b>{u.n} {c.g[k]}<span style={{ color: 'var(--muted)', fontWeight: 400 }}>{c.arr[k] > 0 ? ` (${c.arr[k]} new)` : ''}</span></b>
              <small>Atk {u.atk} · Def {u.def} · {cost} · {u.d}</small>
            </div>
            <button class="btn sm" disabled={!(canAfford(s, 0, k, 1) && c.pop > 30)} onClick={() => muster(c.id, k, 1)}>+1</button>
            <button class="btn sm" disabled={!(canAfford(s, 0, k, 5) && c.pop > 35)} onClick={() => muster(c.id, k, 5)}>+5</button>
            <button class="btn sm" aria-label={`Undo one ${u.one} in ${c.name}`} disabled={!(c.mus && c.mus[k] > 0)} onClick={() => undo(c.id, k, 1)}>−1</button>
          </div>
        );
      })}
      {next ? (
        <div class="row">
          <div class="grow"><b>Fortifications {c.fort}/3</b><small>Defence ×{fortMult(c).toFixed(2)}. Next: {next.w} wood, {next.i} iron, {next.g} gold</small></div>
          <button class="btn sm" disabled={!(st.wood >= next.w && st.iron >= next.i && st.gold >= next.g)} onClick={() => fort(c.id)}>Build</button>
        </div>
      ) : (
        <div class="row"><div class="grow"><b>Fortifications 3/3</b><small>Defence ×{fortMult(c).toFixed(2)}. Fully walled</small></div></div>
      )}
      <p class="note">Each soldier is one person from this county. Recruits and troops that arrived this season march next season. At least 30 people stay home.</p>
    </div>
  );
}

function OrdersPane({ s, c }: { s: GameState; c: County }) {
  return (
    <div class="rows">
      {orderRows(s, c).map(([f, t]) => <Order key={f.id + '-' + t.id} s={s} from={f} to={t} back={c.id} />)}
      <p class="note">Strike force sends archers and knights and leaves the spearmen at home. Button numbers are the attack you would bring. Colour shows how it compares with the scouts’ estimate of the defence.{atkMult(s) < 1 && ` It is winter: marches go out at ${Math.round(atkMult(s) * 100)}% strength, and these numbers already count that.`}</p>
    </div>
  );
}

function FoeBody({ s, c }: { s: GameState; c: County }) {
  const rows = orderRows(s, c);
  return (
    <div class="cpane rows">
      <div class="chips">
        <span class="chip">Soil<b>{pips(c.f)}</b></span>
        <span class="chip">Timber<b>{pips(c.w)}</b></span>
        <span class="chip">Ore<b>{pips(c.i)}</b></span>
      </div>
      {rows.length
        ? rows.map(([f, t]) => <Order key={f.id + '-' + t.id} s={s} from={f} to={t} back={c.id} />)
        : <p class="note">None of your counties border {c.name}. Take a neighbouring county first.</p>}
      {INSPECT && c.owner > 0 && <button class="btn sm" onClick={() => inspect(c.id)}>Inspect the AI here</button>}
    </div>
  );
}
