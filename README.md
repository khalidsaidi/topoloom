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

## Philosophy
**Topology first, geometry second.** Layout pipelines should not recompute planarity or embeddings if the kernel already provides them.

## Complexity & limitations
- Planarity testing uses a native core (WASM) and expects undirected graphs without self-loops.
- SPQR decomposition expects biconnected, loopless, undirected graphs and returns virtual-edge skeletons.
  The current implementation uses a split‑pair based decomposition with deterministic ordering. It is
  correct for tested inputs but is not yet optimized to linear time.
- Orthogonal layout assumes planar inputs; degree > 4 is handled via local expansion.

## Contributing
- Use pnpm >= 9 and Node >= 20.
- Run: `pnpm -r typecheck`, `pnpm -r lint`, `pnpm -r test`, `pnpm -r build`.
- Keep outputs deterministic and serializable.

## License
MIT
