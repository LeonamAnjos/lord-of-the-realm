import type { ComponentChildren } from 'preact';
import { BattleArt } from './battle';
import type { Warn } from './attention';
import { choiceOptions, fmtUnits, goalRows, lordName, pendingText, pendingTitle, type BattleReport, type GameState, type Pending } from '../game';

export interface Sheet { title: string; body: ComponentChildren; btn: string; cb?: () => void; key?: string }

/** An event that waits for your answer: each option says what it costs and gives. */
export function choiceSheet(s: GameState, p: Pending, pick: (id: string) => void): Sheet {
  const opts = choiceOptions(s, p), dflt = opts.find((o) => o.dflt)!;
  return {
    title: pendingTitle(s, p), btn: 'Decide later', key: 'choice',
    body: (
      <>
        <p>{pendingText(s, p)}</p>
        <div class="rows">
          {opts.map((o) => (
            <button key={o.id} class="btn choice" disabled={!!o.no} onClick={() => pick(o.id)}>
              <b>{o.label}{o.no ? ` · ${o.no}` : ''}</b>
              <span>{o.text}</span>
            </button>
          ))}
        </div>
        <p class="note">If the season ends before you choose: {dflt.label.toLowerCase()}.</p>
      </>
    ),
  };
}

export function battleSheet(s: GameState, rep: BattleReport): Sheet {
  const you = rep.att === 0;
  const title = you ? (rep.won ? 'Victory at ' + rep.to : 'Repulsed at ' + rep.to) : rep.won ? rep.to + ' has fallen' : rep.to + ' held';
  const outcome = rep.won
    ? you ? rep.to + ' is yours. Its people are uneasy and the garrison has just arrived.' : rep.to + ' now flies another banner.'
    : you ? 'The survivors limp home.' : 'The attackers fall back.';
  return {
    title, btn: 'Continue',
    body: (
      <>
        <BattleArt rep={rep} />
        <p class="big">Attack {rep.atk} against defence {rep.def}</p>
        <p>{you ? 'You sent' : lordName(s, rep.att) + ' sent'} {fmtUnits(rep.sent)} from {rep.from}.</p>
        <ul>
          <li>{you ? 'Your losses' : 'Attacker losses'}: {fmtUnits(rep.lostA)}</li>
          <li>{you ? 'Enemy losses' : 'Your losses'}: {fmtUnits(rep.lostD)}</li>
        </ul>
        <p>{outcome}</p>
      </>
    ),
  };
}

/** Living realm: what the reign came to. */
function Recap({ s }: { s: GameState }) {
  if (!s.rich || !s.stats) return null;
  const goals = goalRows(s), done = goals.filter((g) => g.state === 'done').length;
  return (
    <ul>
      <li>Counties taken: {s.stats.taken}. Lost to rivals: {s.stats.lost}.</li>
      <li>Goals reached: {done} of {goals.length}.</li>
    </ul>
  );
}

export function overSheet(s: GameState, onNew: () => void): Sheet {
  if (s.over === 'won') {
    return {
      title: 'The crown is yours', btn: 'Begin a new reign', cb: onNew,
      body: (
        <>
          <p class="big">All twelve counties kneel to House Thorne.</p>
          <p>You took the realm in {s.turn} seasons, {Math.floor(s.turn / 4)} years and {s.turn % 4} seasons.</p>
          <Recap s={s} />
        </>
      ),
    };
  }
  return {
    title: 'The house has fallen', btn: 'Begin a new reign', cb: onNew,
    body: (
      <>
        <p class="big">You hold no county.</p>
        <p>The realm will remember House Thorne, though not kindly.</p>
        <Recap s={s} />
      </>
    ),
  };
}

/** Everything that needs a look before the season ends; tapping one with a county goes there. */
export function attentionSheet(items: Warn[], go: (id: number) => void): Sheet {
  return {
    title: 'Before you end the season', btn: 'Close',
    body: (
      <div class="rows">
        {items.map((w) => (w.sel === undefined
          ? <p key={w.key}>{w.text}</p>
          : <button key={w.key} class="btn" style={{ textAlign: 'left', height: 'auto', padding: '8px 12px' }} onClick={() => go(w.sel!)}>{w.owner !== undefined && <i class="wdot" style={{ background: `var(--o${w.owner})` }} />}{w.text}</button>))}
      </div>
    ),
  };
}

export function helpSheet(): Sheet {
  return {
    title: 'Taking the crown', btn: 'Begin',
    body: (
      <ul>
        <li>Tap a county. Set how many people farm, cut wood or mine. Farms pay off at harvest in autumn and give nothing in winter, so stockpile grain.</li>
        <li>Tax brings gold but unhappy people work less and leave. Watch the mood bar.</li>
        <li>Muster troops in a county's card (Counties tab, Troops). Spearmen defend, archers and knights attack. Troops that were mustered or moved this season march next season.</li>
        <li>Send troops from the Orders list. Tap Split to choose 10% to 100% of each troop type, then send them in one tap. Win battles to take counties. Hold all twelve to be crowned.</li>
        <li>With the Crop year rule, farmers sow in spring, tend the crop in summer and reap it in autumn. Spring and summer bring no grain, so the store must last. The soil sets how many people the fields can use: a small county cannot fill good land, and a big one has idle hands.</li>
        <li>The fields can only use so many farmers in each season. Extra farmers move to the crafts and earn gold. The numbers on your tiles are the share of people farming, cutting wood, mining and in crafts.</li>
      </ul>
    ),
  };
}
