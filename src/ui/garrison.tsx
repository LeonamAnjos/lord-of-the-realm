import { seenTroops, type County, type GameState } from '../game';

/** One figure per this many troops, up to MAX_FIGURES, so a glance shows who is strong. */
const PER_FIGURE = 10;
const MAX_FIGURES = 4;

export function GarrisonDefs() {
  return <symbol id="tsol" viewBox="0 0 6 10"><circle cx="2.4" cy="2" r="1.7" /><path d="M0 10c0-4 1-6 2.4-6S4.8 6 4.8 10z" /><rect x="5" y="0" width=".9" height="10" /></symbol>;
}

/** Soldier figures flank the keep. They follow what you can see: exact for yours, approximate at the border, none elsewhere. */
export function Figures({ s, c, x, y }: { s: GameState; c: County; x: number; y: number }) {
  const seen = seenTroops(s, c);
  const n = seen === '?' ? 0 : Math.min(MAX_FIGURES, Math.ceil(Number(seen.replace('~', '')) / PER_FIGURE));
  return (
    <g class="sol" aria-hidden="true">
      {Array.from({ length: n }, (_, j) => {
        const side = j % 2 ? 1 : -1, step = Math.floor(j / 2);
        return <use key={j} href="#tsol" x={x + side * (17 + step * 6) - 3} y={y - 25} width="6" height="10" />;
      })}
    </g>
  );
}

/** Walls grow with the fort level (yours only): 1 wall, 2 towers, 3 a larger keep. */
export function Fort({ level, x, y }: { level: number; x: number; y: number }) {
  if (level <= 0) return null;
  return (
    <g class="wall" aria-hidden="true">
      <rect x={x - 9 - level} y={y - 14.5} width={18 + 2 * level} height="1.8" rx=".9" />
      {level >= 2 && (
        <>
          <rect x={x - 14} y={y - 24} width="3.4" height="9.5" /><rect x={x + 10.6} y={y - 24} width="3.4" height="9.5" />
          <rect x={x - 14.6} y={y - 25.6} width="4.6" height="1.8" /><rect x={x + 10} y={y - 25.6} width="4.6" height="1.8" />
        </>
      )}
      {level >= 3 && <rect x={x - 3} y={y - 31} width="6" height="1.8" />}
    </g>
  );
}
