import type { ComponentChildren } from 'preact';
import { game, toggleFold } from './store';

/** A titled block of the panel that folds away. The choice is remembered on this device. `closed` is how it starts before you choose. */
export function Section({ id, title, closed, children }: { id: string; title: string; closed?: boolean; children: ComponentChildren }) {
  const shut = game.fold[id] ?? !!closed;
  return (
    <div class="sec">
      <button class="sec-h" aria-expanded={!shut} onClick={() => toggleFold(id, !shut)}>
        <h3>{title}</h3><i aria-hidden="true">{shut ? '+' : '–'}</i>
      </button>
      {!shut && children}
    </div>
  );
}
