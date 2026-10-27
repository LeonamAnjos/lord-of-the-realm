# Fief & Crown

A medieval strategy browser game inspired by Lords of the Realm II. Single-player: take all 12 counties from three AI lords. It is now a Vite + Preact + TypeScript PWA, deployed to GitHub Pages. The original single file (`legacy/fief-and-crown.html`, plain JS) is kept untouched as the reference for the rules.

## Status of the migration
All six steps are done: scaffold, pure rules module, tests and simulation, UI, versioned saves with export/import, PWA and Pages deploy. The legacy code is the truth for behaviour. If this file and the code disagree, the code wins and this file should be fixed. `npm run diff-legacy` proves the port still matches the legacy game move for move.

## Layout
- `src/game/` pure rules, no DOM and no `Math.random` (a seeded RNG is always passed in): `rules.json` every tunable number (map, seasons, units, economy, battle, market, events, AI), `data.ts` exposes it under the names the code uses, `state.ts` new game and accessors, `economy.ts` production/food/mood/population/market/events, `combat.ts` battles/orders/scouting, `actions.ts` player actions, `ai.ts` rivals, `turn.ts` `endSeason`, `save.ts` saves, `bot.ts` a simple player used by tests and simulation.
- `src/desktop/` the wide-screen layout (window at least 1100x620, or `?ui=desktop`): `DesktopApp.tsx` floating top bar, ledger and season bar; `GlMap.tsx` + `scene3d.ts` a three.js board (lazy-loaded) that reads the same state and calls `tapCounty`. Falls back to the SVG map without WebGL. Reuses the `src/ui/` panels, sheets and store, so rules and saves are shared.
- `src/ui/` Preact components and `store.ts` (the running game, saving, every button action). CSS in `app.css` carries the legacy look. Tabs: Counties (`CountyList.tsx`, every county as a card: folded summary with mood, people, garrison, jobs, policy and gold/grain/wood/iron per season; open, its Work/Policy/Troops/Orders controls; filters Yours/Warnings/Border/Rivals, sort, set tax or rations for the counties shown), Realm (food check, market, goals, rival lords, saves) and Chronicle. `attention.ts` `countyFlags` makes the card tags; `marks.ts` tells both maps what the list points at (hover, filter dimming, red warnings, odds on march targets).
- `scripts/` `simulate.ts` (balance runs), `diff-legacy.ts` + `legacy-harness.ts` (legacy vs port), `make-icons.ts`.
- `BALANCE_NOTES.md` balance ideas and the spec-vs-legacy differences. **Do not change gameplay numbers while porting or refactoring**; write ideas there.

## Commands
`npm run dev` (serves at `/lord-of-the-realm/`), `npm test`, `npm run typecheck`, `npm run build` (PWA for Pages), `npm run build:single` (one-file preview), `npm run simulate -- --games 2000 [--sweep]`, `npm run diff-legacy`. See `README.md` for deploying.

## Conventions
- Game functions take the state and, when they need chance, an `rng`. Never call `Math.random` in `src/game`. The RNG position is saved, so a loaded game continues the same sequence.
- Saves: `v: 2` (adds `seed` and `rng`). `v: 1` legacy saves load and are migrated. Storage key stays `fief-and-crown-v1`. Export format is `FIEFCROWN2.` + base64 of the save JSON; import also takes raw JSON.
- Keep every number on screen labelled or forecast. The player is on a phone.
- Game state field names (`f`, `w`, `i`, `g`, `arr`, `mus`, `pf`, `farmPref`) are the legacy save shape. Do not rename them.

## How the user works
Plays on a phone. Asks "what does X mean" questions that reveal unclear UI, so every number needs a label or a forecast. Wants control per county (tax, rations, jobs). Prefers short explanations. Timezone Australia/Sydney.

## Rules as they exist now
Seasons: Spring, Summer, Autumn, Winter, 4 turns a year. Turn 0 is Spring 1100. A turn ends with: rival AI turns, economy tick, market drift, random event, turn counter up, then season start (farm limits).

Counties: 12 in a 4x3 pointy-top hex grid, odd rows shifted right. Fixed per county: soil `f`, timber `w`, ore `i`. Larkholt and Fenwick have no ore. Start owners: you hold Ashdown (4), Brackenmoor (8), Dunmere (9).

Jobs per county (percent of people): farm, wood, mine, and the rest are townsfolk and crafts. Sliders move in steps of 5. Mining cannot be raised where `i` is 0. Production uses mood factor `0.6 + 0.4*mood/100`.
- Grain = pop * farm% * 1.3 * soil * seasonMult * moodFactor. Season mult: 0.8, 1.1, 2.2, 0.
- Wood = pop * wood% * timber * (1, 1, 1, 0.6) * moodFactor.
- Iron = pop * mine% * 0.7 * ore * moodFactor.
- Crafts gold = pop * idle% * 0.15.
- Farm limit by season: base [70, 60, 80, 0] times (0.6 + 0.4*soil), floored to 5. When a season starts above the limit, the extra farmers move to crafts (your counties only; rivals reset their farm % every turn within the limit). The player's chosen farm % is stored in `farmPref` and restored when the limit allows.

Food: everyone, soldiers included, eats `0.5` grain a season by default. Rations per county: Scant 0.3 (mood -8), Normal 0.5, Generous 0.7 (mood +6). Fed is a per-lord check (each rival has its own): stock + harvest >= total eaten. If not fed: every county of that lord loses mood 15, and pop becomes `pop * (1 - 0.12*(1-ratio) - 0.02)` and each troop type loses `10% * (1-ratio)`, where ratio = (stock + harvest) / meals.

Tax per county: None (0 gold, mood +5), Low (0.2, +1), Normal (0.4, -3), High (0.7, -9), per person per season.

Mood change per season: tax mood + (fed ? 2 + ration mood : -15). Clamped 0 to 100.

Population (carry the fraction between seasons): if fed and below cap, growth = pop * 0.12 * clamp((mood-40)/30, 0, 1.5) * (1 - pop/cap). If mood < 40, lose pop * (40-mood) * 0.00075. If mood < 20, also lose 3%. Cap = 100 + 70*soil. Minimum pop 20.

Troops (cost per unit; each also takes 1 person): spearman atk 1 def 3, 6 gold 1 wood, upkeep 0.2. Archer atk 4 def 1, 8 gold 2 wood, upkeep 0.3. Knight atk 9 def 6, 24 gold 3 iron, upkeep 0.8. Recruiting leaves at least 30 people in the county. Recruits and moved troops cannot march until next season (`arr`). Undo of this season's recruits via `mus`. Unpaid upkeep: 20% desertion.

Defence of a county = (sum of troop def + pop/10) * (1.15 + 0.2 * fort level). Fort levels 0 to 3 cost [12w 4i 40g], [20w 8i 70g], [30w 12i 100g].

Battle: attack = sum atk * rand(0.9, 1.1) against defence * rand(0.9, 1.1). Win: attacker loses `clamp(0.8*def/atk, 0.1, 0.8)` of sent troops (at least one soldier always survives); county changes hands, pop *0.85 (minimum 30), mood 25, fort -1, tax Normal, rations Normal, jobs reset. Loss: defender loses `clamp(0.8*atk/def, 0.1, 0.8)`; attacker keeps 10% of sent troops. Scout estimate of enemy defence is off by up to 15%, rounded to 5. Enemy troop counts are exact for own counties, approximate (~) at borders, "?" elsewhere.

Unclaimed counties (owner `NEUTRAL`, -1): optional, chosen in the new-reign box (None, 2, 4, 6) and never in a default game, so balance and `diff-legacy` are unchanged. They are drawn from rival counties (never yours, and every rival keeps at least one), defended by 4 spearmen, and sit still: no harvest, growth, tax or upkeep. Anyone can attack ("Claim") them with the normal battle rules; rivals treat them as foes. Winning still means holding all 12.
"One each, random" start (`oneEach`): every lord, you included, gets one random county and the other eight have no lord. Also only on request.

Living realm (optional, `s.rich`; chosen in the new-reign box, never in a default game): rival personalities (Hugh turtle with forts, Isolde raider, Godfrey trader buying iron), combined attacks by neighbouring rival counties on one of yours, winter attacks at 80% (`atkMult`), rumours in the chronicle, goals that pay gold, and a reign summary. Difficulty easy/normal/hard (`s.level`) shifts the AI attack bar, gold reserve and rival starting gold. All numbers in `rules.json`; see `BALANCE_NOTES.md`. `npm run simulate -- --rich --level hard` plays it.

Orders: All, Half, Strike (archers and knights), reinforce the same options, and Split (10% to 100% per troop type, rounded up, one tap to send).

AI lords: per county set farm 55/45/35 by grain security (capped by the farm limit), wood 18, mine by ore, tax by mood. Recruit with gold above 35, preferring frontier counties. Attack from turn 4 on (skipping 20% of the time), when attack/defence beats 1.55 to 1.9, otherwise reinforce toward the frontier. Rivals also buy grain with gold (3 gold each, up to half their gold) when grain is under 1.2 seasons of meals. They set nothing else (no forts, no rations).

Market: grain 2, wood 3, iron 7 base, each season a random +/-15% step with a 10% pull back to 1.0, kept within 0.6 to 1.6. Grain is dearest in winter. Buy at 1.15x, sell at 0.85x, in lots of 10.

Events (25% a season, on one of your counties): plague (12% of the people, only if over 60, otherwise the roll becomes a bumper yield), bumper yield (30 to 70 grain), bandits (12% of your gold, at most 60), merchant caravan (25 to 55 gold).

## UI conventions
- Dark theme, single look. Map tile shows name, pop, troops, and (own counties) job percentages in four colours: farm, wood, mine, crafts.
- Every forecast is visible: resources per season in the top bar, mood and population per county, grain shortage alert.
- Sheets for battle results and help. The end-season button is pinned at the bottom, beside the latest chronicle entry (tap it for the Chronicle). After a season ends, "What happened" sits above the county list until closed.
- The selected county is the card opened or touched last; tapping a county on the map opens and scrolls to its card.

## Things already fixed, keep fixed
- Ore-less counties could not lower the mining slider.
- Troops added before the undo feature were untracked. Saves are migrated on load.
- Tax moved from per realm to per county. Saves are migrated on load.

## Known balance notes
A simple bot (`src/game/bot.ts`) wins about 44% of seeded games and attacking earlier wins more (see `BALANCE_NOTES.md`).
A naive bot that over-recruits and starves usually loses to the AI. Population growth was made faster (0.12) because 0.05 was too slow. Keep an eye on gold in winter now that farmers move to crafts.
