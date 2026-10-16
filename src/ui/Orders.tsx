import { KINDS, NB, U, atkOf, estDef, movable, pick, splitUnits, total, type County, type GameState } from '../game';
import { oddsCls } from './format';
import { game, select, sendOrder, sendSplit, splitAll, splitClose, splitKey, splitOpen, splitPct } from './store';

/** Pairs (from, to) of neighbouring counties you can send troops along, for the selected county. */
export function orderRows(s: GameState, c: County): [County, County][] {
  const rows: [County, County][] = [];
  if (c.owner === 0) for (const n of NB[c.id]!) rows.push([c, s.C[n]!]);
  else for (const n of NB[c.id]!) if (s.C[n]!.owner === 0) rows.push([s.C[n]!, c]);
  return rows;
}

export function Order({ s, from, to }: { s: GameState; from: County; to: County }) {
  const m = movable(from), mine = to.owner === from.owner, tot = total(m);
  const key = splitKey(from.id, to.id), open = !!game.ui.split[key];
  const modes: ['all' | 'half' | 'strike', string][] = mine
    ? [['all', 'All'], ['half', 'Half'], ['strike', 'Archers & knights']]
    : [['all', 'All'], ['half', 'Half'], ['strike', 'Strike force']];
  return (
    <div class="order">
      {mine ? (
        <div class="t"><b>Reinforce <button class="linkbtn" onClick={() => select(to.id)}>{to.name}</button></b><span>{from.name} → {to.name}</span></div>
      ) : (
        <div class="t"><b>Attack <button class="linkbtn" onClick={() => select(to.id)}>{to.name}</button></b><span>{s.lords[to.owner]!.short} · defence about {estDef(s, to)}</span></div>
      )}
      <div class="go">
        {modes.map(([mode, label]) => {
          const sent = pick(m, mode), a = atkOf(sent), n = total(sent);
          const cls = mine ? '' : n ? oddsCls(a, estDef(s, to)) : '';
          return (
            <button key={mode} class={'btn sm ' + cls} disabled={!n} onClick={() => sendOrder(from.id, to.id, mode)}>
              {mine ? `${label} (${n})` : `${label} · ${a}`}
            </button>
          );
        })}
        <button class={'btn sm' + (open ? ' on' : '')} disabled={!tot} onClick={() => (open ? splitClose(key) : splitOpen(key))}>
          {open ? 'Close split' : 'Split…'}
        </button>
      </div>
      {open && <Split s={s} from={from} to={to} />}
    </div>
  );
}

function Split({ s, from, to }: { s: GameState; from: County; to: County }) {
  const key = splitKey(from.id, to.id), sp = game.ui.split[key]!;
  const m = movable(from), mine = to.owner === from.owner;
  const sent = splitUnits(m, sp), n = total(sent), a = atkOf(sent);
  const cls = mine ? 'primary' : n ? oddsCls(a, estDef(s, to)) : '';
  const label = n ? (mine ? `Send ${n} to ${to.name}` : `Attack ${to.name} with ${n} · attack ${a}`) : 'Choose troops to send';
  return (
    <div class="split">
      <div class="chipset">
        <span class="note">All types:</span>
        {[10, 25, 50, 75, 100].map((v) => <button key={v} class="btn sm" onClick={() => splitAll(key, v)}>{v}%</button>)}
      </div>
      {KINDS.filter((k) => m[k] > 0).map((k) => (
        <div class="row" key={k}>
          <div class="grow"><b>{U[k].n}</b><small>{m[k]} free · sending {sent[k]}</small></div>
          <div class="stepper">
            <button class="btn" disabled={sp[k] <= 0} aria-label={`Send 10% fewer ${U[k].n.toLowerCase()}`} onClick={() => splitPct(key, k, -10)}>−</button>
            <output>{sp[k]}%</output>
            <button class="btn" disabled={sp[k] >= 100} aria-label={`Send 10% more ${U[k].n.toLowerCase()}`} onClick={() => splitPct(key, k, 10)}>+</button>
          </div>
        </div>
      ))}
      <button class={'btn ' + cls} disabled={!n} onClick={() => sendSplit(key, from.id, to.id)}>{label}</button>
    </div>
  );
}
