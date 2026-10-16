import { describe, expect, it } from 'vitest';
import { EXPORT_PREFIX, exportText, importText, parseSave, serialize, SAVE_KEY } from './save';
import { endSeason } from './turn';
import { botOrders } from './bot';
import { counties } from './state';
import { createRng } from './rng';
import { freshGame } from './fixtures';
import { loadLegacy } from '../../scripts/legacy-harness';

/** What the legacy game wrote: no seed, no rng, no mus on old counties, tax on the lord, UI fields in the save. */
function legacySave(turn = 3) {
  const { s } = freshGame(7);
  s.turn = turn;
  const o: any = JSON.parse(JSON.stringify(s));
  o.v = 1;
  delete o.seed;
  o.sel = 9; o.tab = 'realm'; o.help = true;
  o.lords[0].tax = 1;
  for (const c of o.C) { delete c.mus; delete c.tax; delete c.farmPref; delete c.pf; delete c.ration; }
  o.C[2].work.mine = 5; // Larkholt: the old bug left mining stuck above zero without ore
  return o;
}

describe('save migration from the legacy format', () => {
  it('loads a v1 save and brings it up to date', () => {
    const text = JSON.stringify(legacySave(0));
    const { state, ui } = parseSave(text)!;
    expect(state.v).toBe(2);
    expect(typeof state.seed).toBe('number');
    expect(ui).toEqual({ sel: 9, tab: 'realm', help: true });
    expect(state.C[2]!.work.mine).toBe(0); // no ore, no mining
    expect(state.C[7]!.work.mine).toBe(0); // Fenwick too
    for (const c of state.C) {
      expect(c.tax).toBe(c.owner === 0 ? 1 : 2); // each county takes its lord's old realm-wide tax
      expect(c.mus).toEqual(c.arr);
      expect(c.ration).toBe(1);
      expect(c.pf).toBe(0);
      expect(c.farmPref).toBe(45);
    }
  });

  it('holds your farms to the season limit on load, but keeps your chosen % for later', () => {
    const { state } = parseSave(JSON.stringify(legacySave(3)))!; // winter
    for (const c of counties(state, 0)) { expect(c.work.farm).toBe(0); expect(c.farmPref).toBe(45); }
    for (const c of counties(state, 1)) expect(c.work.farm).toBe(45);
  });

  it('gives troops with no muster record one, from what arrived this season', () => {
    const o = legacySave(0);
    o.C[4].arr = { spear: 2, archer: 1, knight: 0 };
    const { state } = parseSave(JSON.stringify(o))!;
    expect(state.C[4]!.mus).toEqual({ spear: 2, archer: 1, knight: 0 });
  });

  it('migrates old per-realm tax to each county', () => {
    const o = legacySave(0);
    o.lords[1].tax = 3;
    const { state } = parseSave(JSON.stringify(o))!;
    for (const c of counties(state, 1)) expect(c.tax).toBe(3);
    for (const c of counties(state, 0)) expect(c.tax).toBe(1);
  });

  it('a save without a seed always gets the same one, so loading is repeatable', () => {
    const text = JSON.stringify(legacySave(2));
    const a = parseSave(text)!, b = parseSave(text)!;
    expect(a.state.seed).toBe(b.state.seed);
    const ra = a.rng(), rb = b.rng();
    expect(ra).toBe(rb);
  });

  it('turns away things that are not saves', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('')).toBeNull();
    expect(parseSave('not json')).toBeNull();
    expect(parseSave('{}')).toBeNull();
    expect(parseSave(JSON.stringify({ ...legacySave(), v: 3 }))).toBeNull();
    expect(parseSave(JSON.stringify({ ...legacySave(), C: legacySave().C.slice(1) }))).toBeNull();
  });

  it('reads a save written by the real legacy game and ends up with the same state it loads', () => {
    const rng = createRng(42);
    const legacy = loadLegacy(rng);
    for (let i = 0; i < 9; i++) legacy.endSeason(); // a few seasons of real legacy play
    const text = JSON.stringify(legacy.state);
    const again = loadLegacy(createRng(1), text); // the legacy game's own loader
    const { state } = parseSave(text)!;
    const pick = (x: any) => JSON.parse(JSON.stringify({ turn: x.turn, lords: x.lords, C: x.C, market: x.market, over: x.over, log: x.log }));
    const norm = (x: any) => { x.C.forEach((c: any) => { c.pf = c.pf || 0; c.mus = c.mus ?? { spear: 0, archer: 0, knight: 0 }; }); return JSON.stringify(sort(x)); };
    const sort = (v: any): any => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])])) : v;
    expect(norm(pick(state))).toBe(norm(pick(again.state)));
  });

  it('uses the same storage key as the legacy game', () => {
    expect(SAVE_KEY).toBe('fief-and-crown-v1');
  });
});

describe('v2 saves', () => {
  it('round-trips the state exactly and continues the same random sequence', () => {
    const { s, rng } = freshGame(5);
    for (let i = 0; i < 15; i++) { botOrders(s, rng); if (!s.over) endSeason(s, rng); }
    const text = serialize(s, rng, { sel: 4, tab: 'county', help: true });
    const loaded = parseSave(text)!;
    expect(loaded.state).toEqual(s);
    expect(loaded.ui).toEqual({ sel: 4, tab: 'county', help: true });
    const a = [rng(), rng(), rng()], b = [loaded.rng(), loaded.rng(), loaded.rng()];
    expect(b).toEqual(a);
  });
});

describe('export and import as text', () => {
  const played = () => {
    const { s, rng } = freshGame(12);
    for (let i = 0; i < 12; i++) { botOrders(s, rng); if (s.over) break; endSeason(s, rng); }
    return { s, rng };
  };

  it('an exported save imports back to the same game and the same random sequence', () => {
    const { s, rng } = played();
    const text = exportText(s, rng, { sel: 6, tab: 'realm', help: true });
    expect(text.startsWith(EXPORT_PREFIX)).toBe(true);
    expect(text).toMatch(/^[A-Za-z0-9.+/=]+$/); // plain, paste-safe characters
    const back = importText(text)!;
    expect(back.state).toEqual(s);
    expect(back.ui).toEqual({ sel: 6, tab: 'realm', help: true });
    expect([back.rng(), back.rng()]).toEqual([rng(), rng()]);
  });

  it('keeps non-ASCII text in the chronicle intact', () => {
    const { s, rng } = freshGame(3);
    s.log.push({ t: 0, k: '', txt: 'Rain — “heavy” in Brackenmoor ✓' });
    expect(importText(exportText(s, rng))!.state.log.at(-1)!.txt).toBe('Rain — “heavy” in Brackenmoor ✓');
  });

  it('survives line wrapping, stray spaces and quotes added by a messaging app', () => {
    const { s, rng } = played();
    const text = exportText(s, rng);
    const wrapped = '“' + text.replace(/(.{60})/g, '$1\n') + ' ”';
    expect(importText('  \n' + wrapped + '\n ')!.state).toEqual(s);
  });

  it('also takes a raw save: a v2 save as stored, and a legacy v1 save', () => {
    const { s, rng } = played();
    expect(importText(serialize(s, rng))!.state).toEqual(s);
    const v1 = importText(JSON.stringify(legacySave(2)))!;
    expect(v1.state.v).toBe(2);
    expect(v1.state.turn).toBe(2);
  });

  it('refuses a cut-off, altered or unrelated paste', () => {
    const { s, rng } = played();
    const text = exportText(s, rng);
    expect(importText(text.slice(0, text.length - 40))).toBeNull(); // truncated
    expect(importText(text.slice(0, 200) + '!!!' + text.slice(200))).toBeNull(); // corrupted
    expect(importText(EXPORT_PREFIX)).toBeNull();
    expect(importText('')).toBeNull();
    expect(importText('hello world')).toBeNull();
    expect(importText('https://example.com/save')).toBeNull();
  });
});
