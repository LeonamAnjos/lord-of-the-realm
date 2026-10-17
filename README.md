# Fief & Crown

A medieval strategy game for the phone, inspired by Lords of the Realm II. Take all twelve counties from three rival lords.

Vite + Preact + TypeScript. The rules are a pure module in `src/game/` (no DOM, seeded random numbers), the screens are in `src/ui/`. The original single-file game is kept in `legacy/`.

## Commands
| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at `/lord-of-the-realm/` |
| `npm test` | Rules tests |
| `npm run typecheck` | TypeScript, strict |
| `npm run build` | Installable, offline web app in `dist/` (for GitHub Pages) |
| `npm run build:single` | One self-contained `dist-single/index.html` for previewing anywhere |
| `npm run simulate -- --games 2000 [--sweep]` | Headless balance simulation |
| `npm run diff-legacy` | Replays the legacy game and the port side by side and compares them |

## Deploying to GitHub Pages
1. In the repository settings, open **Pages** and set the source to **GitHub Actions**.
2. Push to `main`. `.github/workflows/deploy.yml` checks types, runs the tests, builds and publishes.
3. The site is served from `https://<user>.github.io/<repo-name>/`. The workflow sets the base path from the repository name, so a rename needs no code change. For a local build under another name, set `BASE_PATH=/name/`.

## Saves
The game saves itself in the browser after every move (`localStorage`, key `fief-and-crown-v1`). The Realm tab can export a save as text and import it on another device. Old `v: 1` saves are migrated when loaded.
