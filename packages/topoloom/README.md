<div align="center">

# TopoLoom

**Planar graph algorithms and orthogonal layout for JavaScript/TypeScript.**

**Live Showcase:** https://topoloom.web.app/ • **API Docs (TypeDoc):** https://topoloom.web.app/api/ • **GitHub:** https://github.com/khalidsaidi/topoloom

<img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.7/docs/screenshots/npm/hero.png" alt="TopoLoom showcase" width="100%" />

</div>

TopoLoom is a **planar graph** drawing kernel: it tests planarity and returns a *witness* (an actual K5/K3,3 subdivision when the answer is no), computes planar embeddings (rotation systems + half-edge navigation), builds BC/SPQR decomposition trees, and produces **orthogonal layout** coordinates via the topology–shape–metrics pipeline (planarize → embed → route → compact). To our knowledge it is the only maintained JavaScript implementation of planarity-with-witness, planar embeddings, SPQR trees, and topology-shape-metrics orthogonal layout in one package. Zero renderer lock-in — you get plain coordinates to feed into SVG, Canvas, WebGL, React Flow, or D3.

---

## Install

```bash
npm i @khalidsaidi/topoloom
```

## Quickstart: graph in, SVG out

Layout positions are keyed by TopoLoom's internal numeric `VertexId` — map back to your labels with `g.label(v)`:

```js
import { graph, layout } from '@khalidsaidi/topoloom';

const g = graph.fromEdgeList([
  ['app', 'db'], ['app', 'cache'], ['db', 'cache'],
  ['app', 'queue'], ['queue', 'db'],
]);

const { layout: drawing } = layout.planarizationLayout(g, { mode: 'orthogonal' });

const svg = [...drawing.positions]
  .map(([v, p]) => `<circle cx="${p.x}" cy="${p.y}" r="5"><title>${g.label(v)}</title></circle>`)
  .join('\n');
```

`drawing.edges` holds the matching orthogonal edge paths (polyline `points` in the same coordinate space), and `drawing.stats` reports bends / area / crossings. Nonplanar input is handled automatically: edges that can't be embedded are routed through the dual graph and crossings become dummy vertices (ids ≥ `g.vertexCount()`, `g.label(v) === null`).

## Use with React Flow

TopoLoom ships a zero-dependency adapter that converts a layout result straight into React Flow's `nodes` / `edges` arrays (numeric `VertexId`s are mapped back to your labels automatically):

```jsx
import { ReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { graph, layout } from '@khalidsaidi/topoloom';
import { toReactFlow } from '@khalidsaidi/topoloom/react-flow';

const g = graph.fromEdgeList([
  ['app', 'db'], ['app', 'cache'], ['db', 'cache'],
  ['app', 'queue'], ['queue', 'db'], ['cache', 'queue'],
]);

const result = layout.planarizationLayout(g, { mode: 'orthogonal' });
const { nodes, edges } = toReactFlow(result, g, {
  scale: 7,            // stretch the compact grid to on-screen pixels
  nodeWidth: 104,      // your node size — positions get centered on the
  nodeHeight: 36,      // layout point (React Flow anchors at top-left)
});

export default () => <ReactFlow nodes={nodes} edges={edges} fitView />;
```

Edges with orthogonal bends default to React Flow's `smoothstep` type (closest built-in look, zero extra code); the exact routed polyline is preserved on `edge.data.points` / `edge.data.bendPoints` if you want a custom edge component that draws the true right-angle route. Dummy crossing vertices from planarization are never emitted as nodes — they surface only as bend points.

**Try it live (no account needed):** https://stackblitz.com/github/khalidsaidi/topoloom/tree/main/examples/react-flow — or browse [`examples/react-flow`](https://github.com/khalidsaidi/topoloom/tree/main/examples/react-flow).

## Which entry point do I want?

| I want… | Use |
| --- | --- |
| A diagram layout (coordinates for any graph) | `layout.planarizationLayout(g, { mode: 'orthogonal' \| 'straight' })` |
| React Flow `nodes` / `edges` from a layout | `toReactFlow(result, g, opts)` from `@khalidsaidi/topoloom/react-flow` |
| Is this graph planar? (+ K5/K3,3 witness or embedding) | `planarity.testPlanarity(g)` |
| A planar straight-line drawing from an embedding | `layout.planarStraightLine(mesh)` |
| An orthogonal drawing from an embedding | `layout.orthogonalLayout(mesh)` |
| SPQR decomposition (triconnected components) | `decomp.spqrDecomposeSafe(g)` (or `spqrDecompose` / `spqrDecomposeAll`) |
| Half-edge mesh / faces from a rotation system | `embedding.*` |
| Dual graph + shortest routes for edge insertion | `dual.*` |
| st-numbering / bipolar orientation | `order.*` |
| Min-cost flow (bend minimization primitives) | `flow.*` |

Every namespace is also a subpath export (`@khalidsaidi/topoloom/planarity`, `/layout`, `/decomp`, …) for minimal bundles.

## How it compares

| Library | Approach |
| --- | --- |
| dagre, ELK | Layered (Sugiyama) layout — great for DAGs/flowcharts |
| d3-force | Force-directed — organic clouds, no topology guarantees |
| **TopoLoom** | **Planar / orthogonal / SPQR** — topology-first: embeddings, witnesses, decompositions, and orthogonal (circuit-diagram-style) coordinates |

## Core capabilities

- **Planarity with witness** — `planar: true` ⇒ a rotation-system embedding; `planar: false` ⇒ a concrete K5 or K3,3 subdivision (vertices + edges)
- **Planar embeddings** — rotation systems + operational half-edge navigation (faces, twins, next/prev)
- **BC / SPQR decomposition** — block-cut trees and SPQR trees for structure + embedding decisions
- **Topology–shape–metrics orthogonal layout** — planarize, embed, route in the dual, minimize bends via min-cost flow, compact
- **st-numbering + bipolar orientation** building blocks
- **Deterministic and unit-tested** — pure functions over immutable graph snapshots

## What you can expect (visual)

<p>
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.7/docs/screenshots/npm/planarity.png" alt="Planarity + embedding" width="49%" />
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.7/docs/screenshots/npm/dual.png" alt="Dual routing" width="49%" />
</p>
<p>
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.7/docs/screenshots/npm/orthogonal.png" alt="Orthogonal layout" width="49%" />
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.7/docs/screenshots/npm/planarization.png" alt="Planarization pipeline" width="49%" />
</p>

## Links

- Live showcase (interactive demos): https://topoloom.web.app/
- API docs (TypeDoc): https://topoloom.web.app/api/
- Issues: https://github.com/khalidsaidi/topoloom/issues

## Status

TopoLoom is **0.x** (fast iteration). Some pipelines have constraints (e.g., undirected planar inputs for the fixed-embedding layouts). The live showcase is the source of truth for what's currently supported.

## License

MIT
