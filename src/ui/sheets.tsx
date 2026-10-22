import type { ComponentChildren } from 'preact';
import { BattleArt } from './battle';
import type { Warn } from './attention';
import { fmtUnits, lordName, type BattleReport, type GameState } from '../game';

export interface Sheet { title: string; body: ComponentChildren; btn: string; cb?: () => void }

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

export function overSheet(s: GameState, onNew: () => void): Sheet {
  if (s.over === 'won') {
    return {
      title: 'The crown is yours', btn: 'Begin a new reign', cb: onNew,
      body: (
        <>
          <p class="big">All twelve counties kneel to House Thorne.</p>
          <p>You took the realm in {s.turn} seasons, {Math.floor(s.turn / 4)} years and {s.turn % 4} seasons.</p>
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
          : <button key={w.key} class="btn" style={{ textAlign: 'left', height: 'auto', padding: '8px 12px' }} onClick={() => go(w.sel!)}>{w.text}</button>))}
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
        <li>Muster troops in the county panel. Spearmen defend, archers and knights attack. Troops that were mustered or moved this season march next season.</li>
        <li>Send troops from the Orders list. Tap Split to choose 10% to 100% of each troop type, then send them in one tap. Win battles to take counties. Hold all twelve to be crowned.</li>
        <li>The fields can only use so many farmers in each season. Extra farmers move to the crafts and earn gold. The numbers on your tiles are the share of people farming, cutting wood, mining and in crafts.</li>
      </ul>
    ),
  };
}
