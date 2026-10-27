// Read-only view of a rival's county, switched on with ?inspect in the address. Shows what the rival AI is actually working with.
import {
  FORT, KINDS, RULES, aiFarmPct, aiParams, atkMult, personality, forecast, NB, RATION, SEASONS, TAX, U, aiPlan, atkOf, capOf, craft, defence, eat, farmLimit, fortMult, idlePct, movable, prod, season, troops,
  type County, type GameState,
} from '../game';
import { MoodNote, PopNote, moodCol, moodWord, ownerCol, pips, signed } from './format';
import { Section } from './Section';
import { game, select, setCtab, type CTab } from './store';

export const INSPECT = new URLSearchParams(location.search).has('inspect');

const TABS: [CTab, string][] = [['work', 'Work'], ['policy', 'Policy'], ['troops', 'Troops'], ['orders', 'Orders']];
const AI = RULES.ai;

export function InspectCounty({ s, c }: { s: GameState; c: County }) {
  const L = s.lords[c.owner]!, tab = game.ui.ctab, f = forecast(s, c.owner);
  return (
    <>
      <div class="phead">
        <div class="ch">
          <span class="dotc" style={{ background: `var(--${ownerCol(c.owner)})` }} /><h2>{c.name}</h2><span class="tag">{L.name}{personality(s, c.owner) ? ` · ${personality(s, c.owner)!.trait}` : ''} · inspecting</span>
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
        <div class="chips" aria-label={L.name + "'s stores"}>
          {(['gold', 'grain', 'wood', 'iron'] as const).map((k) => {
            const d = Math.round(f[k]);
            return <span class="chip" key={k} style={{ color: `var(--${k})` }}>{k}<b style={{ letterSpacing: 0 }}>{Math.floor(L.stock[k])} <small style={{ color: d >= 0 ? 'var(--good)' : 'var(--bad)' }}>{signed(d)}</small></b></span>;
          })}
        </div>
        <nav class="subtabs" role="tablist" aria-label="County">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={id === tab} onClick={() => setCtab(id)}>{label}</button>)}
        </nav>
      </div>
      <div class="pbody" key={tab}>
        {tab === 'work' && <Work s={s} c={c} />}
        {tab === 'policy' && <Policy c={c} />}
        {tab === 'troops' && <Troops c={c} />}
        {tab === 'orders' && <Orders s={s} c={c} />}
      </div>
    </>
  );
}

function Work({ s, c }: { s: GameState; c: County }) {
  const se = season(s), p = prod(c, se), lim = farmLimit(c, se);
  const L = s.lords[c.owner]!, need = s.C.filter((x) => x.owner === c.owner).reduce((a, x) => a + eat(x), 0), secure = L.stock.grain / Math.max(1, need);
  const nextFarm = aiFarmPct(secure, c, se);
  const rows: [string, number, string][] = [
    ['Farmland', c.work.farm, `+${Math.round(p.grain)} grain · limit ${lim}%`],
    ['Woodcutters', c.work.wood, `+${Math.round(p.wood)} wood`],
    ['Miners', c.work.mine, c.i === 0 ? 'No ore here' : `+${p.iron.toFixed(1)} iron`],
  ];
  return (
    <>
      <div class="chips">
        <span class="chip">Soil<b>{pips(c.f)}</b></span>
        <span class="chip">Timber<b>{pips(c.w)}</b></span>
        <span class="chip">Ore<b>{pips(c.i)}</b></span>
      </div>
      <Section id="workers" title="Workers">
        <div class="rows">
          {rows.map(([n, pct, out]) => (
            <div class="row" key={n}>
              <div class="grow"><b>{n}</b><small>{Math.round((c.pop * pct) / 100)} people · {out}</small>{n === 'Farmland' && nextFarm !== pct && <small>Will be set to {nextFarm}% on its turn, before the season's harvest</small>}</div>
              <output>{pct}%</output>
            </div>
          ))}
          <div class="row"><div class="grow"><b>Townsfolk and crafts</b><small>{idlePct(c)}% · +{craft(c).toFixed(1)} gold</small></div></div>
          <p class="note">
            The rival resets jobs every turn. Farm target {AI.farm.tight}% when its grain covers under {AI.farm.tightBelowSecurity} seasons of meals, {AI.farm.safe}% over {AI.farm.safeAboveSecurity}, else {AI.farm.normal}% (now {secure.toFixed(1)}), held to the {SEASONS[se]} limit of {lim}%.
            Wood always {AI.wood}%. Mining {c.i >= AI.mine.richOre ? AI.mine.rich : c.i >= AI.mine.someOre ? AI.mine.some : 0}% from ore {c.i}.
          </p>
        </div>
      </Section>
    </>
  );
}

function Policy({ c }: { c: County }) {
  const t = TAX[c.tax]!, r = RATION[c.ration]!;
  return (
    <>
      <Section id="tax" title="Tax">
        <div class="seg">{TAX.map((x, i) => <button key={i} class={'btn ' + (c.tax === i ? 'on' : '')} disabled>{x.n}</button>)}</div>
        <p class="note" style={{ marginTop: '8px' }}>
          {t.n} tax: about {Math.round(c.pop * t.g)} gold a season, mood {t.m >= 0 ? '+' : ''}{t.m} a season. The rival picks it from mood: under 25 none, under 42 low, over 75 high, else normal.
        </p>
      </Section>
      <Section id="rations" title="Rations">
        <div class="seg" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {RATION.map((x, i) => <button key={i} class={'btn ' + (c.ration === i ? 'on' : '')} disabled>{x.n}</button>)}
        </div>
        <p class="note" style={{ marginTop: '8px' }}>
          {r.n} rations: eats {Math.round(eat(c))} grain a season. Rivals never change rations.
        </p>
      </Section>
    </>
  );
}

function Troops({ c }: { c: County }) {
  const m = movable(c), next = FORT[c.fort];
  return (
    <Section id="garrison" title="Garrison">
      <div class="rows">
        {KINDS.map((k) => (
          <div class="row" key={k}>
            <div class="grow">
              <b>{U[k].n} {c.g[k]}<span style={{ color: 'var(--muted)', fontWeight: 400 }}>{c.arr[k] > 0 ? ` (${c.arr[k]} new)` : ''}</span></b>
              <small>Atk {U[k].atk} · Def {U[k].def} · {m[k]} free to march</small>
            </div>
          </div>
        ))}
        <div class="row"><div class="grow"><b>Fortifications {c.fort}/3</b><small>Defence ×{fortMult(c).toFixed(2)}{next ? '' : ' · fully walled'}</small></div></div>
        <p class="note">{troops(c)} soldiers. Rivals recruit with gold above 35, preferring frontier counties, and never build forts.</p>
      </div>
    </Section>
  );
}

function Orders({ s, c }: { s: GameState; c: County }) {
  const plan = aiPlan(s, c), A = aiParams(s, c.owner).attack, lo = A.needBase, hi = A.needBase + A.needSpread, p = personality(s, c.owner);
  return (
    <div>
      <h3>Orders</h3>
      <div class="rows">
        {plan.free === 0 ? <p class="note">No troops free to march, so no orders this turn.</p> : plan.foes.length ? (
          <>
            {plan.foes.map((f) => {
              const best = Math.max(f.strike, f.all), go = best > lo;
              return (
                <div class="order" key={f.to.id}>
                  <div class="t"><b>{f.to.owner === 0 ? 'Attack' : f.to.owner < 0 ? 'Claim' : 'Attack'} <button class="linkbtn" onClick={() => select(f.to.id)}>{f.to.name}</button></b><span>{f.to.owner === 0 ? 'You' : f.to.owner < 0 ? 'No lord' : s.lords[f.to.owner]!.short}</span></div>
                  <p class="note">Strike {f.strike.toFixed(2)}× · all {f.all.toFixed(2)}× the true defence of {Math.round(defence(f.to))}. {go ? (best > hi ? 'Over the bar: would attack.' : 'Might attack, depending on its roll.') : 'Under the bar: holds.'}</p>
                </div>
              );
            })}
            <p class="note">
              A frontier county attacks when strength over defence beats a bar rolled each turn between {lo.toFixed(2)} and {hi.toFixed(2)}, taking the best target (strike force first). Nothing happens before turn {A.fromTurn} (now {s.turn}) and {Math.round(A.skipChance * 100)}% of the time it sits still.{p ? ` ${p.trait}: ${p.blurb}.` : ''}{atkMult(s) < 1 ? ` Winter: attacks count at ${Math.round(atkMult(s) * 100)}%.` : ''}{s.rich && RULES.living.combinedAttacks ? ` If no county can win alone, neighbouring counties may attack one of yours together (archers and knights only, bar +${RULES.living.combinedBarAdd}).` : ''}
            </p>
          </>
        ) : (
          <p class="note">
            {plan.step ? <>No foe next door: marches everything to <button class="linkbtn" onClick={() => select(plan.step!.id)}>{plan.step.name}</button>, the next step towards the frontier.</> : 'No foe next door and no path to the frontier: stays put.'}
          </p>
        )}
        <p class="note">Rivals see neighbours: {NB[c.id]!.map((n) => s.C[n]!.name).join(', ')}.</p>
      </div>
    </div>
  );
}
