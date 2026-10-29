import { RULES, SEASONS, goalRows, personality, NEUTRAL, bordersYou, buyCost, counties, eat, prod, sellGain, season, year, type GameState } from '../game';
import { LORD_COL } from './format';
import { Section } from './Section';
import {
  applyImport, askNew, buyLot, cancelNew, setLevel, setOneEach, setRich, setDecide, setWild, checkImport, closeSaveBox, copyExport, game, openExport, openImport, sellLot, showHelp, startNewGame, typeImport,
} from './store';

export function RealmPanel({ s }: { s: GameState }) {
  const L = s.lords[0]!;
  return (
    <article class="card">
      <Food s={s} />

      <Section id="market" title="Market">
        <div class="rows">
          {(['grain', 'wood', 'iron'] as const).map((k) => {
            const buy = buyCost(s, k), sell = sellGain(s, k);
            return (
              <div class="row" key={k}>
                <div class="grow"><b style={{ textTransform: 'capitalize' }}>{k}</b><small>{Math.floor(L.stock[k])} in store · 10 units</small></div>
                <button class="btn sm" disabled={!(L.stock.gold >= buy)} onClick={() => buyLot(k)}>Buy {buy}g</button>
                <button class="btn sm" disabled={!(L.stock[k] >= 10)} onClick={() => sellLot(k)}>Sell {sell}g</button>
              </div>
            );
          })}
          <p class="note">Grain is dearest in winter and cheapest at harvest. Merchants keep a margin on every trade.</p>
        </div>
      </Section>

      {s.rich && <Goals s={s} />}

      <Section id="rivals" title="Rival lords">
        <div class="rows">
          {[1, 2, 3].map((i) => {
            const R2 = s.lords[i]!, n = counties(s, i).length, b = counties(s, i).filter((c) => bordersYou(s, c)).length;
            return (
              <div class="row" key={i}>
                <span class="dotc" style={{ background: `var(--${LORD_COL[i]})` }} />
                <div class="grow"><b>{R2.name}{personality(s, i) ? ` · ${personality(s, i)!.trait}` : ''}</b><small>{R2.alive ? `${n} ${n === 1 ? 'county' : 'counties'}${b ? ` · ${b} at your border` : ''}` : 'Defeated'}{personality(s, i) ? ` · ${personality(s, i)!.blurb}` : ''}</small></div>
              </div>
            );
          })}
          {counties(s, NEUTRAL).length > 0 && (
            <div class="row">
              <span class="dotc" style={{ background: 'var(--o-1)' }} />
              <div class="grow"><b>No lord</b><small>{counties(s, NEUTRAL).length} counties anyone can claim{counties(s, NEUTRAL).some((c) => bordersYou(s, c)) ? ' · borders you' : ''}</small></div>
            </div>
          )}
        </div>
      </Section>

      <SaveBox s={s} />

      <div>
        {game.ui.confirm ? (
          <>
            <p class="note" style={{ marginBottom: '8px' }}>Abandon this reign and start again?</p>
            <p class="note" style={{ marginBottom: '4px' }}>How the reign starts:</p>
            <div class="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '8px' }}>
              <button class={'btn' + (!game.ui.oneEach ? ' on' : '')} aria-pressed={!game.ui.oneEach} onClick={() => setOneEach(false)}>Three counties</button>
              <button class={'btn' + (game.ui.oneEach ? ' on' : '')} aria-pressed={game.ui.oneEach} onClick={() => setOneEach(true)}>One each, random</button>
            </div>
            {!game.ui.oneEach && (
              <>
                <p class="note" style={{ marginBottom: '4px' }}>Counties that start with no lord (any lord may claim them):</p>
                <div class="seg" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '8px' }}>
                  {[0, 2, 4, 6].map((n) => (
                    <button key={n} class={'btn' + (game.ui.wild === n ? ' on' : '')} aria-pressed={game.ui.wild === n} onClick={() => setWild(n)}>{n === 0 ? 'None' : n}</button>
                  ))}
                </div>
              </>
            )}
            <p class="note" style={{ marginBottom: '4px' }}>Living realm: rivals with their own ways, armies that join forces against you, weaker winter marches, rumours and goals with gold rewards:</p>
            <div class="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '8px' }}>
              <button class={'btn' + (!game.ui.rich ? ' on' : '')} aria-pressed={!game.ui.rich} onClick={() => setRich(false)}>Classic</button>
              <button class={'btn' + (game.ui.rich ? ' on' : '')} aria-pressed={game.ui.rich} onClick={() => setRich(true)}>Living realm</button>
            </div>
            <p class="note" style={{ marginBottom: '4px' }}>Events (plague, bandits, a good harvest, merchants):</p>
            <div class="seg" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: '8px' }}>
              <button class={'btn' + (!game.ui.decide ? ' on' : '')} aria-pressed={!game.ui.decide} onClick={() => setDecide(false)}>Just happen</button>
              <button class={'btn' + (game.ui.decide ? ' on' : '')} aria-pressed={game.ui.decide} onClick={() => setDecide(true)}>You choose</button>
            </div>
            <p class="note" style={{ marginBottom: '4px' }}>How hard the rivals play:</p>
            <div class="seg" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '8px' }}>
              {(['easy', 'normal', 'hard'] as const).map((lv) => (
                <button key={lv} class={'btn' + (game.ui.level === lv ? ' on' : '')} aria-pressed={game.ui.level === lv} onClick={() => setLevel(lv)}>{RULES.difficulty[lv].name}</button>
              ))}
            </div>
            <div class="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button class="btn" onClick={startNewGame}>Start over</button>
              <button class="btn" onClick={cancelNew}>Keep playing</button>
            </div>
          </>
        ) : (
          <>
            <button class="btn" onClick={askNew}>Begin a new reign</button>{' '}
            <button class="btn" onClick={showHelp}>How to play</button>
          </>
        )}
      </div>
    </article>
  );
}

/** Will everyone eat this season, and how long the store lasts. Grain is the one stock shared by every county. */
function Food({ s }: { s: GameState }) {
  const se = season(s), st = Math.floor(s.lords[0]!.stock.grain), mine = counties(s, 0);
  const harvest = Math.round(mine.reduce((a, c) => a + prod(c, se).grain, 0)), meals = Math.round(mine.reduce((a, c) => a + eat(c), 0));
  const left = st + harvest - meals, fed = left >= 0, lasts = meals > 0 ? Math.floor(st / meals) : 0;
  return (
    <Section id="food" title="Food">
      <div class="rows">
        <div class="row">
          <div class="grow">
            <b style={{ color: fed ? 'var(--good)' : 'var(--bad)' }}>{fed ? 'Everyone eats this season' : 'Not enough grain this season'}</b>
            <small>{st} in store + {harvest} harvest − {meals} eaten = {left} left</small>
          </div>
        </div>
        <p class="note">
          {fed ? `Without a harvest, the store alone feeds your people and soldiers for about ${lasts} ${lasts === 1 ? 'season' : 'seasons'}.`
            : 'When the realm goes hungry every county loses mood, people leave and troops desert. Buy grain at the market, farm more or set scant rations.'}
          {se !== 3 && fed && ` Winter grows nothing, so keep about ${meals} grain for it.`}
        </p>
      </div>
    </Section>
  );
}

/** Living realm goals: hold so many counties by a year and the treasury is paid. */
function Goals({ s }: { s: GameState }) {
  return (
    <Section id="goals" title="Goals">
      <div class="rows">
        {goalRows(s).map((g) => (
          <div class="row" key={g.id}>
            <div class="grow">
              <b>{g.text}</b>
              <small>
                {g.state === 'done' ? `Reached in ${SEASONS[g.at % 4]} ${1100 + Math.floor(g.at / 4)}`
                  : g.state === 'missed' ? 'Missed'
                  : `By ${SEASONS[g.byTurn % 4]} ${1100 + Math.floor(g.byTurn / 4)}`} · {g.reward} gold
              </small>
            </div>
          </div>
        ))}
        <p class="note">You hold {counties(s, 0).length} counties now. Each goal pays its gold once, the season you first reach it in time.</p>
      </div>
    </Section>
  );
}

/** Move a reign between devices, or keep a backup, as one block of text. */
function SaveBox({ s }: { s: GameState }) {
  const b = game.ui.saveBox;
  return (
    <Section id="save" title="Save and restore" closed>
      <p class="note" style={{ marginBottom: '8px' }}>
        The game saves itself on this device after every move. To back it up or play on another device, export the save as text, then paste it there with Import.
      </p>
      {b.mode === 'closed' && (
        <div class="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button class="btn" onClick={openExport}>Export save</button>
          <button class="btn" onClick={openImport}>Import save</button>
        </div>
      )}
      {b.mode === 'export' && (
        <div class="rows">
          <textarea class="savetext" readOnly rows={5} value={b.text} aria-label="Exported save" onFocus={(e) => (e.currentTarget as HTMLTextAreaElement).select()} />
          <p class="note">{Math.round(b.text.length / 1024 * 10) / 10} KB. Keep it somewhere safe. Import it on any device to carry on from {SEASONS[season(s)]} {year(s)}.</p>
          <div class="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button class="btn primary" onClick={copyExport}>Copy</button>
            <button class="btn" onClick={closeSaveBox}>Done</button>
          </div>
        </div>
      )}
      {b.mode === 'import' && (
        <div class="rows">
          <textarea class="savetext" rows={5} value={b.text} placeholder="Paste an exported save here" aria-label="Save to import" onInput={(e) => typeImport((e.currentTarget as HTMLTextAreaElement).value)} />
          {b.error && <p class="note" style={{ color: 'var(--bad)' }} role="alert">{b.error}</p>}
          {b.pending ? (
            <>
              <p class="note">
                This save is from {SEASONS[b.pending.state.turn % 4]} {1100 + Math.floor(b.pending.state.turn / 4)}, with {b.pending.state.C.filter((c) => c.owner === 0).length} of 12 counties.
                Loading it replaces your current reign ({SEASONS[season(s)]} {year(s)}, {counties(s, 0).length} of 12 counties).
              </p>
              <div class="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button class="btn primary" onClick={applyImport}>Replace my reign</button>
                <button class="btn" onClick={closeSaveBox}>Cancel</button>
              </div>
            </>
          ) : (
            <div class="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button class="btn primary" disabled={!b.text.trim()} onClick={checkImport}>Check save</button>
              <button class="btn" onClick={closeSaveBox}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
