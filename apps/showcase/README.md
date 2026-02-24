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
- Landing hero is full-screen with interactive A/B reveal slider (Naive vs TopoLoom) and required headline/copy.
- Landing A/B slider uses styled primitives (no browser-default controls).
- Landing CTAs are:
  - `Try Real Data Gallery` -> `/gallery`
  - `Explore demos` -> `/demo/planarity`
  - `API` -> `/api`
- Gallery index loads all curated datasets and “Why it’s hard” bullets.
- Dataset viewer opens in cinema/fullscreen mode with WebGL2 rendering by default.
- Graph area is full-bleed (no boxed viewport) and remains high-contrast/legible.
- Worker progress + stage theater appear during runs (Sampling, Planarity, Embedding, Layout, Report).
- Every run shows deterministic scramble -> untangle motion before final deterministic settle.
- Status logic is consistent:
  - planar mode => `Planar • crossings 0`
  - planarization mode => `Planarized • crossings N`
  - nonplanar w/o planarization => `Nonplanar • witness shown`
- Compare mode shows multi-panel outputs and sync pan/zoom works.
- Large precomputed sample loads instantly and is labeled honestly as precomputed.
- Copy share link reproduces the current state from URL params.
- PNG export downloads and includes legend (dataset/mode/seed/version/metrics).
- SVG export downloads and opens as a standalone SVG with current camera transform baked in.
- `/api` route still works.
- `apps/showcase/index.html` still includes:
  - `<meta name="topoloom-smoke" content="1" />`

## Attribution note
OpenStreetMap attribution string used in the UI:
- `© OpenStreetMap contributors, ODbL 1.0`
