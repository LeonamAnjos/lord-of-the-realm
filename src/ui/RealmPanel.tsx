import { RATION, SEASONS, TAX, atkOf, NEUTRAL, bordersYou, buyCost, counties, defence, fmtUnits, sellGain, season, taxGold, year, type GameState } from '../game';
import { LORD_COL, MoodNote, moodWord } from './format';
import {
  applyImport, askNew, buyLot, cancelNew, setOneEach, setWild, checkImport, closeSaveBox, copyExport, game, openExport, openImport, select, sellLot, showHelp, startNewGame, taxAll, typeImport,
} from './store';

export function RealmPanel({ s }: { s: GameState }) {
  const L = s.lords[0]!, mine = counties(s, 0);
  const income = mine.reduce((a, c) => a + taxGold(c), 0);
  return (
    <article class="card">
      <div>
        <h3>Armies</h3>
        <div class="rows">
          {mine.map((c) => (
            <div class="row" key={c.id}>
              <div class="grow">
                <b><button class="linkbtn" onClick={() => select(c.id)}>{c.name}</button></b>
                <small>{fmtUnits(c.g)} · attack {atkOf(c.g)}, defence {Math.round(defence(c))}</small>
              </div>
            </div>
          ))}
          <p class="note">There is no single army. Each county keeps its own garrison, and you send troops between neighbouring counties from the Orders list.</p>
        </div>
      </div>

      <div>
        <h3>Taxes</h3>
        <p class="note" style={{ marginBottom: '8px' }}>Tax is set in each county. Your counties bring in about {Math.round(income)} gold a season in all. To set the same rate everywhere:</p>
        <div class="seg">{TAX.map((t, i) => <button key={i} class="btn" onClick={() => taxAll(i)}>{t.n}</button>)}</div>
      </div>

      <div>
        <h3>Market</h3>
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
      </div>

      <div>
        <h3>Mood</h3>
        <div class="rows">
          {mine.map((c) => (
            <div class="row" key={c.id}>
              <div class="grow">
                <b><button class="linkbtn" onClick={() => select(c.id)}>{c.name}</button></b>
                <small>{moodWord(c.mood)} ({Math.round(c.mood)}) · {TAX[c.tax]!.n} tax, {RATION[c.ration]!.n.toLowerCase()} rations</small>
              </div>
              <div style={{ textAlign: 'right' }}><MoodNote s={s} c={c} flush /></div>
            </div>
          ))}
          <p class="note">Population follows mood. Growth starts above 40, reaches full speed at 70 and is 1.5 times faster at 100. Below 40 people slowly leave, and below 20 they leave quickly.</p>
        </div>
      </div>

      <div>
        <h3>Rival lords</h3>
        <div class="rows">
          {[1, 2, 3].map((i) => {
            const R2 = s.lords[i]!, n = counties(s, i).length, b = counties(s, i).some((c) => bordersYou(s, c));
            return (
              <div class="row" key={i}>
                <span class="dotc" style={{ background: `var(--${LORD_COL[i]})` }} />
                <div class="grow"><b>{R2.name}</b><small>{R2.alive ? `${n} counties${b ? ' · borders you' : ''}` : 'Defeated'}</small></div>
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
      </div>

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

/** Move a reign between devices, or keep a backup, as one block of text. */
function SaveBox({ s }: { s: GameState }) {
  const b = game.ui.saveBox;
  return (
    <div>
      <h3>Save and restore</h3>
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
    </div>
  );
}
