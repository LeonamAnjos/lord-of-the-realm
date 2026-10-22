import type { BattleReport } from '../game';

const MAX_FIG = 8;

function Soldier({ x, face, cls }: { x: number; face: 1 | -1; cls: string }) {
  return (
    <g class={'b-sol ' + cls}>
      <circle cx={x} cy="72" r="3" />
      <path d={`M${x - 3.5} 92c0-6 1-10 3.5-10s3.5 4 3.5 10z`} />
      <rect x={x + face * 5} y="68" width="1.2" height="24" />
      <path class="shield" d={`M${x - face * 6} 78h${face * 4}v5q${-face * 2} 3 ${-face * 4} 0z`} />
    </g>
  );
}

/** Armies meet outside the county; the loser's figures fall and the winner's banner rises. Sizes follow attack versus defence. */
export function BattleArt({ rep }: { rep: BattleReport }) {
  const total = rep.atk + rep.def || 1;
  const na = Math.max(2, Math.min(MAX_FIG, Math.round((rep.atk / total) * 10)));
  const nd = Math.max(2, Math.min(MAX_FIG, Math.round((rep.def / total) * 10)));
  // the same loss rules the game uses, shown as how many figures fall
  const lossA = Math.min(0.8, Math.max(0.1, (0.8 * rep.def) / (rep.atk || 1)));
  const lossD = Math.min(0.8, Math.max(0.1, (0.8 * rep.atk) / (rep.def || 1)));
  const fallA = rep.won ? Math.round(na * lossA) : na - 1;
  const fallD = rep.won ? nd : Math.round(nd * lossD);
  const flagUp = rep.won ? rep.att : rep.dfn;
  return (
    <div class={'battle-art ' + (rep.won ? 'won' : 'held')}>
      <svg viewBox="0 0 400 110" role="img" aria-label={rep.won ? `${rep.to} falls to the attackers` : `${rep.to} holds against the attackers`}>
        <rect class="b-sky" width="400" height="110" />
        <rect class="b-gnd" y="90" width="400" height="20" />
        <g class="b-keep">
          <rect x="330" y="46" width="44" height="44" />
          <path d="M330 46v-6h6v3h6v-3h6v3h6v-3h6v3h6v-3h6v6z" />
          <rect x="346" y="68" width="12" height="22" class="door" />
          <rect class="pole" x="351" y="20" width="1.6" height="22" />
          <path class="flag old" style={{ fill: `var(--o${rep.dfn})` }} d="M352.6 21h16l-4 5 4 5h-16z" />
          <path class="flag new" style={{ fill: `var(--o${flagUp})` }} d="M352.6 21h16l-4 5 4 5h-16z" />
        </g>
        <g class="army a" style={{ fill: `var(--o${rep.att})` }}>
          {Array.from({ length: na }, (_, j) => (
            <Soldier key={j} x={120 + (j % 4) * 16 + Math.floor(j / 4) * 8} face={1} cls={j < fallA ? 'fall' : ''} />
          ))}
        </g>
        <g class="army d" style={{ fill: `var(--o${rep.dfn})` }}>
          {Array.from({ length: nd }, (_, j) => (
            <Soldier key={j} x={290 - (j % 4) * 16 - Math.floor(j / 4) * 8} face={-1} cls={j < fallD ? 'fall' : ''} />
          ))}
        </g>
        <path class="spark" d="M198 62l4 8 8-4-5 8 8 4-9 1 2 9-7-6-6 6 1-9-9-1 8-4-5-8 8 4z" />
      </svg>
    </div>
  );
}
