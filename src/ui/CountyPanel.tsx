import {
  FORT, KINDS, NEUTRAL, RATION, SEASONS, TAX, U, atkOf, bordersYou, canAfford, capOf, craft, defence, eat, estDef, farmLimit, fortMult, idlePct, prod, season, counties,
  type County, type GameState, type Work,
} from '../game';
import { MoodNote, ownerCol, PopNote, moodCol, moodWord, pips } from './format';
import { CountyScene } from './scene';
import { Order, orderRows } from './Orders';
import { adjustWork, fort, game, muster, ration, rationAll, setCtab, stepCounty, tax, taxAll, undo, type CTab } from './store';

const LABELS: Record<keyof Work, string> = { farm: 'Farmland', wood: 'Woodcutters', mine: 'Miners' };

export function OwnCounty({ s, c }: { s: GameState; c: County }) {
  const se = season(s), p = prod(c, se), st = s.lords[0]!.stock, lim = farmLimit(c, se);
  const fortNext = FORT[c.fort];
  const rows = orderRows(s, c);
  const taxT = TAX[c.tax]!, ratT = RATION[c.ration]!;
  const ctab = game.ui.ctab, many = counties(s, 0).length > 1;
  return (
    <>
      <div class="phead">
        <div class="ch">
          <span class="dotc" style={{ background: 'var(--o0)' }} /><h2>{c.name}</h2>
          {many ? (
            <span class="stepc">
              <button class="btn sm" aria-label="Previous county of yours" onClick={() => stepCounty(-1)}>‹</button>
              <button class="btn sm" aria-label="Next county of yours" onClick={() => stepCounty(1)}>›</button>
            </span>
          ) : <span class="tag">Your county</span>}
        </div>
        <div class="stats">
          <div class="stat"><label>People</label><b>{c.pop}</b><small>of {Math.round(capOf(c))}</small><PopNote s={s} c={c} /></div>
          <div class="stat">
            <label>Mood</label><b>{moodWord(c.mood)}</b>
            <div class="bar"><i style={{ width: c.mood + '%', background: moodCol(c.mood) }} /></div>
            <MoodNote s={s} c={c} />
          </div>
          <div class="stat"><label>Defence</label><b>{Math.round(defence(c))}</b><small>attack {atkOf(c.g)}</small></div>
        </div>
        <SubTabs tab={ctab} orders={rows.length} />
      </div>
      <div class="pbody" key={ctab}>
        {ctab === 'work' && (
          <>
            {game.ui.full && <CountyScene s={s} c={c} />}
            <p class="note jobkey">
              Jobs % on your map tiles: <b style={{ color: 'var(--grain)' }}>farm</b> <b style={{ color: 'var(--wood)' }}>wood</b> <b style={{ color: 'var(--iron)' }}>mine</b> <b style={{ color: 'var(--gold)' }}>crafts</b>
            </p>
            <div class="chips">
              <span class="chip">Soil<b>{pips(c.f)}</b></span>
              <span class="chip">Timber<b>{pips(c.w)}</b></span>
              <span class="chip">Ore<b>{pips(c.i)}</b></span>
            </div>
      <div>
        <h3>Workers</h3>
        <div class="rows">
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
                  <button class="btn" disabled={c.work[k] < 5} aria-label={'Fewer ' + LABELS[k]} onClick={() => adjustWork(k, -5)}>−</button>
                  <output>{c.work[k]}%</output>
                  <button class="btn" disabled={plusOff} aria-label={'More ' + LABELS[k]} onClick={() => adjustWork(k, 5)}>+</button>
                </div>
              </div>
            );
          })}
          <div class="row"><div class="grow"><b>Townsfolk and crafts</b><small>{idlePct(c)}% · +{craft(c).toFixed(1)} gold</small></div></div>
          <p class="note">
            The fields can only use so many people in a season ({SEASONS[se]}: up to {lim}% here, more on good soil). When a new season starts with more farmers than that, the extra people move to the crafts and earn gold. Your farming choice returns when the limit allows.
          </p>
        </div>
      </div>
          </>
        )}
        {ctab === 'policy' && (
          <>
      <div>
        <h3>Tax</h3>
        <div class="seg">{TAX.map((t, i) => <button key={i} class={'btn ' + (c.tax === i ? 'on' : '')} onClick={() => tax(i)}>{t.n}</button>)}</div>
        {many && <button class="btn sm all" onClick={() => taxAll(c.tax)}>Use {taxT.n.toLowerCase()} tax in all {counties(s, 0).length} counties</button>}
        <p class="note" style={{ marginTop: '8px' }}>
          {taxT.n} tax: about {Math.round(c.pop * taxT.g)} gold a season, mood {taxT.m >= 0 ? '+' : ''}{taxT.m} a season (well-fed people recover 2 more).
        </p>
      </div>
      <div>
        <h3>Rations</h3>
        <div class="seg" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {RATION.map((r, i) => <button key={i} class={'btn ' + (c.ration === i ? 'on' : '')} onClick={() => ration(i)}>{r.n}</button>)}
        </div>
        {many && <button class="btn sm all" onClick={() => rationAll(c.ration)}>Use {ratT.n.toLowerCase()} rations in all {counties(s, 0).length} counties</button>}
        <p class="note" style={{ marginTop: '8px' }}>
          {ratT.n} rations: this county eats {Math.round(eat(c))} grain a season (people and soldiers), mood {ratT.m >= 0 ? '+' : ''}{ratT.m} a season while the realm is fed. Scant rations save grain but sour the mood.
        </p>
      </div>
          </>
        )}
        {ctab === 'troops' && (
          <>
      <div>
        <h3>Garrison</h3>
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
                <button class="btn sm" disabled={!(canAfford(s, 0, k, 1) && c.pop > 30)} onClick={() => muster(k, 1)}>+1</button>
                <button class="btn sm" disabled={!(canAfford(s, 0, k, 5) && c.pop > 35)} onClick={() => muster(k, 5)}>+5</button>
                <button class="btn sm" aria-label={'Undo one ' + u.one} style={{ opacity: c.mus && c.mus[k] > 0 ? undefined : 0.38 }} onClick={() => undo(k, 1)}>−1</button>
              </div>
            );
          })}
          {fortNext ? (
            <div class="row">
              <div class="grow"><b>Fortifications {c.fort}/3</b><small>Defence ×{fortMult(c).toFixed(2)}. Next: {fortNext.w} wood, {fortNext.i} iron, {fortNext.g} gold</small></div>
              <button class="btn sm" disabled={!(st.wood >= fortNext.w && st.iron >= fortNext.i && st.gold >= fortNext.g)} onClick={fort}>Build</button>
            </div>
          ) : (
            <div class="row"><div class="grow"><b>Fortifications 3/3</b><small>Defence ×{fortMult(c).toFixed(2)}. Fully walled</small></div></div>
          )}
        </div>
      </div>
          </>
        )}
        {ctab === 'orders' && (
          <>
      <div>
        <h3>Orders</h3>
        <div class="rows">
          {rows.map(([f, t]) => <Order key={f.id + '-' + t.id} s={s} from={f} to={t} />)}
          <p class="note">Strike force sends archers and knights and leaves the spearmen at home. Button numbers are the attack you would bring. Colour shows how it compares with the scouts’ estimate of the defence.</p>
        </div>
      </div>
          </>
        )}
      </div>
    </>
  );
}

const SUBTABS: [CTab, string][] = [['work', 'Work'], ['policy', 'Policy'], ['troops', 'Troops'], ['orders', 'Orders']];

function SubTabs({ tab, orders }: { tab: CTab; orders: number }) {
  return (
    <nav class="subtabs" role="tablist" aria-label="County">
      {SUBTABS.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={id === tab} onClick={() => setCtab(id)}>
          {label}{id === 'orders' && orders > 0 ? <i>{orders}</i> : null}
        </button>
      ))}
    </nav>
  );
}

export function FoeCounty({ s, c }: { s: GameState; c: County }) {
  const lord = c.owner === NEUTRAL ? 'No lord' : s.lords[c.owner]!.name, rows = orderRows(s, c), near = bordersYou(s, c);
  return (
    <>
      <div class="phead">
      <div class="ch"><span class="dotc" style={{ background: `var(--${ownerCol(c.owner)})` }} /><h2>{c.name}</h2><span class="tag">{lord}</span></div>
      <div class="stats">
        <div class="stat"><label>People</label><b>{c.pop}</b></div>
        <div class="stat"><label>Defence</label><b>{near ? '~' + estDef(s, c) : '?'}</b><small>{near ? 'scouted' : 'unknown'}</small></div>
        <div class="stat"><label>Fort</label><b>{c.fort}</b><small>of 3</small></div>
      </div>
      </div>
      <div class="pbody">
      <div class="chips">
        <span class="chip">Soil<b>{pips(c.f)}</b></span>
        <span class="chip">Timber<b>{pips(c.w)}</b></span>
        <span class="chip">Ore<b>{pips(c.i)}</b></span>
      </div>
      <div>
        <h3>Orders</h3>
        <div class="rows">
          {rows.length
            ? rows.map(([f, t]) => <Order key={f.id + '-' + t.id} s={s} from={f} to={t} />)
            : <p class="note">None of your counties border {c.name}. Take a neighbouring county first.</p>}
        </div>
      </div>
      </div>
    </>
  );
}
