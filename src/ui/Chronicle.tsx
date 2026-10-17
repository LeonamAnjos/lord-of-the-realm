import { stamp, type GameState } from '../game';

export function Chronicle({ s }: { s: GameState }) {
  return (
    <article class="card">
      <div class="log">
        {s.log.slice().reverse().map((e, i) => (
          <div key={s.log.length - i}><time>{stamp(e.t)}</time><span class={e.k}>{e.txt}</span></div>
        ))}
      </div>
    </article>
  );
}
