# Balance notes

Ideas only. Nothing here is implemented; the port keeps the legacy numbers exactly.

## Spec (CLAUDE.md) versus legacy code
The legacy code is the truth. Where CLAUDE.md differs, the port follows the code:

- **Famine is per lord and scales with the shortfall.** Each lord has its own fed check (stock + harvest vs meals). When short, population becomes `pop * (1 - 0.12*(1-ratio) - 0.02)` and each troop type loses `10% * (1-ratio)`, where `ratio = (stock+harvest)/meals`. Mood is -15 as written. CLAUDE.md says "every county loses mood 15, pop and troops" and "realm-wide".
- **Rivals buy grain.** When a rival's grain is under 1.2 seasons of meals and it has over 30 gold, it spends up to half its gold at 3 gold per grain. CLAUDE.md says "Rivals adjust nothing else".
- **Rival attacks** also skip 20% of the time, and the rival can attack from turn 4 (turn 4 itself counts).
- **Recruiting** leaves at least 30 people in the county. Rivals only recruit in counties with 45 or more people. Not in CLAUDE.md.
- **Conquest**: pop `max(30, round(pop*0.85))`; the attacker keeps at least one soldier when it wins; the conquest reapplies the season's farm limit with `farmPref` 45.
- **Farm limit at season start** is only applied to your counties. Rivals reset their farm % every turn, capped by the limit of the season being ended.
- **Plague** only happens when the county has more than 60 people. Otherwise the roll falls through to the bumper-yield branch, so small counties get good news slightly more often.
- **Bandits** take 12% of your gold, at most 60.
- **Market drift** is a random +/-15% step followed by a 10% pull back toward 1.0, clamped to 0.6 to 1.6.

## Ideas to try later (not applied)
- Rivals never build forts and never change rations. A late-game rival with gold piling up could spend it.
- Winter gold: farmers moved to crafts pay 0.15 each, but your harvest is 0 in winter. Check whether a sim shows winter gold dips (see CLAUDE.md note).
- The AI attack threshold (1.55 to 1.9 times defence) and the 20% skip chance are the main difficulty dials.

## First simulation readings
`npm run simulate -- --games 2000` with the built-in bot (attack at 1.5x odds, keeps 60 gold, garrisons up to 40 per front county): about 44% wins, 56% losses, under 1% unfinished, median win around turn 27 (just under 7 years).

`npm run simulate -- --sweep` compares attack thresholds. The bolder the bot, the more it wins (2.0x: about 31%, 1.2x: about 52%), so rivals are beatable by early aggression. The bot is crude and always attacks with everything. A human who plays carefully is probably much stronger, so treat these as relative numbers.

## Living realm (opt-in, `rich` on the game state)
Off by default, so classic play, `diff-legacy` and the numbers above are unchanged. Chosen in the new-reign box. Every number is in `src/game/rules.json` (`living`, `personalities`, `difficulty`, `goals`).
- **Personalities**: Baron Hugh is a Turtle (attacks from turn 5 at 1.7x, raises forts up to level 2 when it has 60 spare gold). Lady Isolde is a Raider (from turn 3, 10% skip, 1.4x bar, more archers). Earl Godfrey is a Trader (buys a lot of 10 iron when under 9, favours knights).
- **Combined attacks**: if no county can win alone against one of *yours*, its neighbours may join with archers and knights only, when together they beat the bar plus 0.25.
- **Winter war**: every attack, yours included, counts at 80% in winter. Order buttons and the Inspect view already show the reduced numbers.
- **Rumours** in the Chronicle (lord, striking unit, county, no numbers). **Goals** pay 60/100/150 gold for holding 5/8/10 counties by 1104/1108/1111. **Difficulty** moves the rivals' attack bar, gold reserve and starting gold (also works in classic, with a small effect).
- Bot win rates (600 seeded games): classic 42%; living realm easy 53%, normal 42%, hard 33%. Tuning lessons: every softer rival (late attacks, archers only, fort spending) raised the bot's wins by 10 to 25 points, and combined attacks aimed at other rivals made rivals wreck each other (about +14 points), so they target you only. Goal gold is worth about 5 points.
- Not done yet: trading between your own counties or county roles, fort upkeep, choice events (tribute, traitors), a post-game timeline.
