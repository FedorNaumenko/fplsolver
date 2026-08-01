# FPL Solver

Fantasy Premier League Transfer Advisor — a Next.js web app that helps FPL managers make smarter transfer decisions based on form, fixture difficulty, and expected points modelling.

## Features

- **Pitch view** — visualise your squad in a GK → DEF → MID → FWD layout with real FPL player photos and position-coloured cards
- **Points toggle** — switch between season total, current GW actual points, or projected points for any of the next 3 upcoming gameweeks
- **Projected points** — estimates per player using blended form/PPG × fixture difficulty × minutes multiplier
- **Drag & drop substitutions** — drag any player card onto another to swap; formation rules enforced (GK↔GK only for keepers, valid 3-4-3/4-3-3/etc. for outfield)
- **Transfer suggestions** — single and multi-transfer plans (1, 2, 3, wildcard) ranked by expected points gain, recalculated per projected GW
- **Apply transfers** — preview your squad after a suggested transfer with live budget and 3-per-club constraint validation
- **Wildcard planner** — greedy optimiser for up to 8 improvements with no points hit

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000/fplsolver](http://localhost:3000/fplsolver) (the `basePath`
matches the GitHub Pages path) and enter your **FPL Manager ID** — found in the URL of
your FPL team page:

```
fantasy.premierleague.com/entry/1234567/event/...
                                 ^^^^^^^
```

## How Transfer Suggestions Work

Each player is scored over the selected upcoming gameweek window:

```
xPts = (form × 0.6 + PPG × 0.4) × difficulty_multiplier × minutes_multiplier
```

| Factor | Detail |
|---|---|
| `form` | FPL rolling 4-game average |
| `PPG` | Season points-per-game (fallback when form = 0) |
| `difficulty_multiplier` | `max(0.2, (6 − FDR) / 3)` |
| `minutes_multiplier` | 1.0 ≥60 min/GW · 0.8 ≥45 · 0.5 ≥30 · 0.25 ≥15 · 0 otherwise |

The planner finds the best replacement for each squad player within your available budget, filtered to same position and available status.

## Deploying to GitHub Pages

Pages is static-only, so the app is built with `output: "export"` and all FPL calls
run in the browser. The FPL API sends no `access-control-allow-origin` header, so
those browser calls need a proxy — hence the three steps below.

**1. Deploy the CORS proxy** (once). Open [workers.cloudflare.com](https://workers.cloudflare.com)
→ Create Worker → paste [`worker/fpl-proxy.js`](worker/fpl-proxy.js) → Deploy. Copy the
`https://….workers.dev` URL.

**2. Set the repo variable.** Settings → Secrets and variables → Actions → Variables →
New variable, name `FPL_PROXY`, value the worker URL **without** a trailing slash.
The build fails with a clear error if this is missing.

**3. Set the Pages source.** Settings → Pages → Build and deployment → Source =
**GitHub Actions** (not "Deploy from a branch").

Pushing to `main` then builds and publishes to
`https://fedornaumenko.github.io/fplsolver/` via `.github/workflows/deploy.yml`.

`npm run dev` needs no proxy — `next.config.ts` rewrites `/fpl/*` to the FPL API
server-side, where CORS does not apply.

## Tech Stack

- **Next.js 16** (App Router, static export)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- FPL official API (`fantasy.premierleague.com/api`) via a Cloudflare Worker CORS proxy
