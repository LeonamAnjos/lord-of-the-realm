import { NEUTRAL, atkOf, estDef, movable, pick, total, type GameState } from '../game';
import { oddsCls } from './format';
import { closeQuick, game, select, sendOrder } from './store';

const MODES: ['all' | 'half' | 'strike', string][] = [['all', 'All'], ['half', 'Half'], ['strike', 'Strike']];

/** Tap one of your counties, then a neighbour you could march on: pick the force here instead of scrolling to Orders. */
export function Quick({ s }: { s: GameState }) {
  const q = game.ui.quick;
  const from = q && s.C[q.from], to = q && s.C[q.to];
  if (!q || !from || !to || from.owner !== 0 || to.owner === 0) return null;
  const m = movable(from), claim = to.owner === NEUTRAL, d = estDef(s, to);
  // keep the popup off the county it is about: the target's row decides top or bottom
  const where = Math.floor(to.id / 4) >= 1 ? 'top' : 'bottom';
  return (
    <div class={'quick ' + where} role="dialog" aria-label={`${claim ? 'Claim' : 'Attack'} ${to.name}`}>
      <div class="qt">
        <b>{claim ? 'Claim' : 'Attack'} {to.name}</b>
        <span>{claim ? 'No lord' : s.lords[to.owner]!.short} · defence about {d}</span>
        <button class="qx" aria-label="Close" onClick={closeQuick}>×</button>
      </div>
      <div class="go">
        {MODES.map(([mode, label]) => {
          const sent = pick(m, mode), a = atkOf(sent), n = total(sent);
          return (
            <button key={mode} class={'btn sm ' + (n ? oddsCls(a, d) : '')} disabled={!n} onClick={() => sendOrder(from.id, to.id, mode)}>{label} · {a}</button>
          );
        })}
        <button class="btn sm" onClick={() => select(to.id)}>Details</button>
      </div>
    </div>
  );
}
