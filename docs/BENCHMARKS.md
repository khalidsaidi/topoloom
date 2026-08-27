# TopoLoom Benchmarks

Real measured timings for the two hot paths users care about: `planarity.testPlanarity`
(WASM backend vs pure-TypeScript backend) and `layout.planarizationLayout` (maximal planar
subgraph + dual-routing edge insertion + drawing).

All numbers below were produced by running `apps/showcase/scripts/run-benchmarks.mjs`
against the datasets bundled with the showcase (`apps/showcase/public/datasets/`) — BU4P
graph-drawing benchmark graphs, BFS samples of the California road network, the US power
grid, downtown San Francisco OSM streets, and SuiteSparse circuit matrices. Each dataset
file embeds its source URL and license metadata.

The live version of this table is published at <https://topoloom.web.app/benchmarks>.

## Environment

- CPU: AMD Ryzen 7 3800X 8-Core Processor
- Node v20.20.0, Linux 6.6.87.2 under **WSL2** (virtualized — absolute numbers vary by
  machine; treat the relative shape, not the absolutes, as the signal)
- Method: planarity times are the **median of 7 runs after 2 warmups** per backend;
  planarization is a **single timed run after 1 warmup** (the algorithm is deterministic)
- Backends: `wasm` = Edge-Addition Planarity Suite (John M. Boyer) compiled to WASM;
  `ts` = pure-TypeScript left-right planarity test

## Results (2026-08-27)

| Dataset | n | m | Planar | testPlanarity WASM | testPlanarity TS | planarizationLayout | Edges rerouted |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| hero-graph | 90 | 122 | yes | 0.07 ms | 0.11 ms | 34 ms | 0 |
| bu4p-g00100-01 | 100 | 140 | yes | 0.29 ms | 0.92 ms | 55 ms | 0 |
| bu4p-g00200-01 | 200 | 266 | yes | 0.23 ms | 0.72 ms | 106 ms | 0 |
| downtown-sf-bfs-220-s3 | 220 | 274 | yes | 0.17 ms | 0.27 ms | 128 ms | 0 |
| powergrid-bfs-250-s1 | 250 | 297 | no | 0.29 ms | 39.49 ms | 505 ms | 11 |
| roadnet-ca-bfs-250-s11 | 250 | 336 | yes | 0.22 ms | 0.36 ms | 161 ms | 0 |
| powergrid-bfs-320-s7 | 320 | 399 | no | 0.32 ms | 94.19 ms | 337 ms | 18 |
| downtown-sf-bfs-320-s17 | 320 | 423 | yes | 0.50 ms | 0.43 ms | 257 ms | 0 |
| roadnet-ca-bfs-340-s23 | 340 | 455 | yes | 0.36 ms | 0.54 ms | 341 ms | 0 |
| bu4p-g00300-01 | 300 | 492 | yes | 1.18 ms | 196.04 ms | 267 ms | 0 |
| hamm-add32 | 300 | 623 | yes | 0.43 ms | 0.53 ms | 299 ms | 0 |
| hamm-add20 | 186 | 800 | no | 0.48 ms | 66.98 ms | *fails* | — |

> **Note:** the `planarizationLayout` column measures the default `mode: 'straight'`;
> `mode: 'orthogonal'` adds bend-minimization (min-cost flow) and compaction on top, so it
> costs more — and on some inputs (e.g. disconnected graphs) its flow step can be
> infeasible and throws an actionable error unless you pass `onInfeasible: 'fallback'`.
> See [Known limits](#known-limits-honestly) and the package README's known-limitations
> section.

## What the numbers mean

**Planarity testing is effectively free at this scale.** The WASM backend stays at or
under ~1 ms on every graph above. Use it (or the default `backend: 'auto'`) unless you
have a reason not to.

**The TS fallback has pathological cases.** It matches WASM on most planar inputs but
spikes whenever it must extract a K5/K3,3 witness (39–94 ms on the non-planar power-grid
samples, 67 ms on hamm-add20) and showed a 196 ms outlier on bu4p-g00300-01 even though
that graph is planar — the left-right implementation has structure-dependent slow paths
the WASM backend does not. Note `backend: 'auto'` uses the TS backend for graphs up to
250 vertices (`maxTsVertices`), so a small-but-nasty graph can still hit these paths;
pass `backend: 'wasm'` explicitly if planarity checks are on your hot path.

**`planarizationLayout` grows quadratic-ish, with a big constant.** The
maximal-planar-subgraph phase rebuilds the graph and re-runs a full planarity test once
per edge, so cost is roughly O(m) planarity tests each of size O(n + m); going from 122
to 492 edges (4.0×) took time from 34 ms to 267 ms (7.9×). Every crossing found adds
dual-routing plus re-embedding work on top (powergrid-bfs-250: 505 ms with 11 rerouted
edges vs roadnet-ca-bfs-250: 161 ms with 0, at similar size).

**One-line guidance: planarization layout is interactive-fine below roughly 500 edges
(under ~350 ms on this machine); beyond that, measure on your own graphs before putting
it on an interactive path — or run it in a worker.**

## Known limits (honestly)

- `planarizationLayout` **fails on hamm-add20** (n=186, m=800, dense circuit sample)
  with `Planarization graph should remain planar during insertion.` — the edge
  re-insertion loop trips an internal invariant on this input. Planarity testing on the
  same graph is fine. This is a real, currently-open limitation of the planarization
  pipeline on dense non-planar graphs.
- All measurements were taken under WSL2 on a single machine. Browser numbers (where the
  showcase actually runs) will differ, typically by a small constant factor.
- `mode: 'orthogonal'` (not measured above) handles bridges/trees correctly since 0.3.x;
  for embeddings where its bend flow is still infeasible (e.g. disconnected inputs) it
  throws `OrthogonalInfeasibleError` with next steps, or downgrades to straight mode —
  recorded as `stats.mode === 'straight-fallback'` — when called with
  `onInfeasible: 'fallback'`. It never downgrades silently.

## Reproducing

```bash
pnpm install
pnpm --filter @khalidsaidi/topoloom build
cd apps/showcase
node scripts/run-benchmarks.mjs   # rewrites src/data/benchmarks.json
```

The `/benchmarks` page of the showcase renders `apps/showcase/src/data/benchmarks.json`
directly, so re-running the script and rebuilding updates the published table.
