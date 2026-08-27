# Changelog

## Unreleased
- Layout (fix): orthogonal mode no longer fails on planar graphs containing bridges/trees. Root cause: vertex angles in the Tamassia bend flow were assigned per distinct incident face instead of per corner, so a face appearing on both sides of a bridge broke the 360° angle sum and unbalanced the flow demands. Degree > 4 vertices now get Kandinsky-style 0° relaxation instead of silently zeroing all bends.
- Layout: infeasible orthogonal representations now throw `OrthogonalInfeasibleError` with actionable guidance; new `planarizationLayout` option `onInfeasible: 'throw' | 'fallback'` — `'fallback'` downgrades to straight mode and records it as `stats.mode === 'straight-fallback'` (never silent). `stats.mode` now reports the pipeline that produced every layout result.
- Layout: greedy bend-corner selection reduces collinear edge overlap in planarized orthogonal routes (full track assignment remains a known limitation).
- API ergonomics: `planarizationLayout`, `testPlanarity`, `buildHalfEdgeMesh`, and `toReactFlow` now throw a friendly `TypeError` ("expected a Graph — build one with fromEdgeList(...)") on non-Graph input instead of an internal error.
- Docs: executable quickstart that writes a viewable `layout.svg`; ESM-only packaging note; known-limitations section; benchmark pages now state that the planarizationLayout column measures straight mode.

## v0.3.0 — 2026-08-27
- Decomp: add `spqrDecomposeSafe`, `spqrDecomposeAll`, and `SPQRForest` for whole-graph SPQR decomposition across biconnected blocks.
- Planarity: add pure-TypeScript backend and a `backend` option for choosing between the wasm (Edge Addition Planarity Suite) and TS implementations.
- Layout: reduce ring bias via an outer-face heuristic and elliptical boundary; compact orthogonal grid options; relax input strictness (directed edges and self-loops handled by default).
- Packaging: ship the Edge Addition Planarity Suite BSD-3-Clause notice (`third_party/eaps/`) in the npm tarball; add `default` export conditions so Node >= 20.19 `require()` of the package works.
- CI: publish releases from `v*` tags via npm trusted publishing (OIDC) — no long-lived npm tokens.

## v0.2.7 — 2026-02-03
- Remove directed-input rejection in orthogonal demo (treated as undirected for geometry).
- Auto-repair SPQR and dual routing demos by selecting biconnected blocks / planar backbones.
- Add recompute banners + viewport reset button and increase kernel test coverage.

## v0.2.6 — 2026-02-03
- Make demo outputs screenshot-ready via embed/autorun query params and capture framing markers.
- Prioritize graph visibility: output-first layout, no expectation overlap, and clearer SPQR inspector flow.
- Add deterministic npm screenshot capture script and refresh package README imagery.

## v0.2.2 — 2026-02-02
- Fix Firebase Hosting header precedence so assets are truly immutable-cached and build-info is short-cached.
- Align library version with repo tag.
- Strengthen live smoke test (content + headers + api docs) so UI reachability is provable in CI.


## v0.2.0 (2026-02-02)
- Planarity: enforce undirected input, preserve multiedge support, and surface clearer errors for self-loops.
- SPQR: add split-pair detection + SPQR tree validation helpers, expand invariants tests, and expose helpers for demos.
- Planarity WASM: runtime-safe base64 decoding for browser/node usage.
- Docs: refreshed Typedoc output and expanded kernel concept references.
- CI: add a no-stubs gate and enforce coverage thresholds for lines/statements/branches/functions.
