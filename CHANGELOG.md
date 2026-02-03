# Changelog

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
