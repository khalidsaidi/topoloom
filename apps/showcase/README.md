# TopoLoom Showcase

`apps/showcase` is a Vite + React Router + Tailwind v4 + Radix UI SPA for TopoLoom demos and the Real-World Graph Gallery.

## Commands
- Dev: `pnpm -C apps/showcase dev`
- Build: `pnpm -C apps/showcase build`
- Preview: `pnpm -C apps/showcase preview`
- Tests: `pnpm -C apps/showcase test`

From repo root:
- Regenerate curated gallery datasets: `pnpm datasets:build`

## Manual smoke checklist
- Landing hero renders the split-view before/after instantly.
- Landing CTAs are:
  - `Try Real Data Gallery` -> `/gallery`
  - `Explore demos` -> `/demo/planarity`
  - `API` -> `/api`
- Gallery index loads all curated datasets and “Why it’s hard” bullets.
- Dataset viewer runs worker compute without freezing UI.
- Worker progress appears during runs and report card updates after completion.
- Compare mode shows multi-panel outputs and sync pan/zoom works.
- Copy share link reproduces the current state from URL params.
- PNG export downloads and includes legend.
- SVG export downloads and opens as a standalone SVG.
- `/api` route still works.
- `apps/showcase/index.html` still includes:
  - `<meta name="topoloom-smoke" content="1" />`

## Attribution note
OpenStreetMap attribution string used in the UI:
- `© OpenStreetMap contributors, ODbL 1.0`
