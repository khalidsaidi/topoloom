# TopoLoom

**TopoLoom** is a topology-first graph drawing kernel for JavaScript. It focuses on *planarity, embeddings, decompositions, dual routing, and flow-based constraints* — then hands those outputs to deterministic coordinate pipelines.

**Tagline:** Topology-first graph drawing kernel for JavaScript

## Why TopoLoom
- **Kernel, not renderer:** TopoLoom exposes explicit topology artifacts (rotation systems, half-edges, SPQR trees, dual graphs).
- **Determinism:** Stable iteration orders and reproducible outputs.
- **Composable pipelines:** Topology modules feed geometry modules without adapter glue.

## Quick start
```ts
import { graph, planarity, embedding, layout } from '@khalidsaidi/topoloom';

const g = graph.fromEdgeList([
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'a'],
]);

const result = planarity.testPlanarity(g);
if (result.planar) {
  const mesh = embedding.buildHalfEdgeMesh(g, result.embedding);
  const drawing = layout.planarStraightLine(mesh);
  console.log(drawing.positions);
}
```

## Module map
- `graph` — mutable builder + immutable snapshot, adapters, JSON I/O
- `dfs` — SCC, bridges, biconnected components, BC-tree
- `planarity` — deterministic planarity test + witness (K5/K3,3)
- `embedding` — rotation system → half-edge mesh + faces
- `dual` — dual graph + dual shortest paths
- `order` — st-numbering + bipolar orientation
- `flow` — min-cost flow solver
- `decomp` — SPQR decomposition (S/P/R/Q) with skeletons + embedding controls
- `layout` — planar straight-line, orthogonal, planarization pipeline

## Showcase
Live demo: https://topoloom.web.app

## Showcase site
- Run locally: `pnpm -C apps/showcase dev`
- Build: `pnpm -C apps/showcase build`
- Regenerate curated gallery datasets: `pnpm datasets:build`

The showcase is a Vite + React Router + Tailwind v4 + Radix SPA deployed to Firebase Hosting (`apps/showcase/dist`) with SPA rewrites enabled.

## Dataset attribution
- Power Grid Network
  - Source: https://datarepository.wolframcloud.com/resources/Power-Grid-Network
  - License/terms: https://www.wolfram.com/legal/terms/wolfram-cloud.html
- SNAP roadNet-CA
  - Source: https://snap.stanford.edu/data/roadNet-CA.html
  - Terms: https://snap.stanford.edu/data/roadNet-CA.html
- Graph Drawing BU4P benchmarks
  - Source + terms: https://graphdrawing.unipg.it/data.html
- SuiteSparse Hamm (add20, add32)
  - Source: https://sparse.tamu.edu/Hamm
  - Terms: https://sparse.tamu.edu/about
- OpenStreetMap downtown extract
  - Source: https://www.openstreetmap.org
  - License: https://opendatacommons.org/licenses/odbl/
  - Attribution string used in UI: `© OpenStreetMap contributors, ODbL 1.0`

## Philosophy
**Topology first, geometry second.** Layout pipelines should not recompute planarity or embeddings if the kernel already provides them.

## Behavior notes
- Planarity testing uses a native core (WASM) and by default **treats directed edges as undirected**
  while **ignoring self‑loops** (loops are re‑injected into the embedding).
- Biconnected components and st‑numbering treat directed edges as undirected by default; self‑loops
  are ignored or reported as singleton blocks depending on the module.
- SPQR decomposition is defined on biconnected graphs; `spqrDecomposeSafe` (largest block) and
  `spqrDecomposeAll` (forest) provide deterministic results for non‑biconnected inputs.
- Dual routing automatically uses a **maximal planar backbone** on nonplanar inputs.
- Orthogonal layout planarizes non‑planar graphs before routing and assigns ports for high‑degree
  vertices to preserve orthogonal geometry.

## Contributing
- Use pnpm >= 9 and Node >= 20.
- Run: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build`.
- Keep outputs deterministic and serializable.

## License
MIT
