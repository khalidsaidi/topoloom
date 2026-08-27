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

Save as `quickstart.mjs` and run `node quickstart.mjs` — it writes a viewable `./layout.svg` with orthogonal edges and labeled nodes:

```js
import { writeFileSync } from 'node:fs';
import { graph, layout } from '@khalidsaidi/topoloom';

const g = graph.fromEdgeList([
  ['app', 'db'], ['app', 'cache'], ['db', 'cache'], ['app', 'queue'], ['queue', 'db'],
]);
const { layout: d } = layout.planarizationLayout(g, { mode: 'orthogonal' });
const S = 4, X = (p) => p.x * S + 30, Y = (p) => p.y * S + 30;
const edges = d.edges.map((e) =>
  `<polyline points="${e.points.map((p) => `${X(p)},${Y(p)}`).join(' ')}" fill="none" stroke="#64748b" stroke-width="2"/>`);
const nodes = [...d.positions].filter(([v]) => g.label(v) !== null).map(([v, p]) =>
  `<circle cx="${X(p)}" cy="${Y(p)}" r="6" fill="#0ea5e9"/><text x="${X(p) + 9}" y="${Y(p) - 8}" font-size="12">${g.label(v)}</text>`);
const pts = [...d.edges.flatMap((e) => e.points), ...d.positions.values()];
const [w, h] = [Math.max(...pts.map(X)) + 80, Math.max(...pts.map(Y)) + 30];
writeFileSync('layout.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${edges.join('')}${nodes.join('')}</svg>`);
console.log(`wrote ./layout.svg — bends=${d.stats.bends} area=${d.stats.area} crossings=${d.stats.crossings} mode=${d.stats.mode}`);
```

Layout positions are keyed by TopoLoom's internal numeric `VertexId` — map back to your labels with `g.label(v)`. `d.edges` holds the matching orthogonal edge paths (polyline `points` in the same coordinate space), and `d.stats` reports bends / area / crossings plus the `mode` that actually produced the drawing. Nonplanar input is handled automatically: edges that can't be embedded are routed through the dual graph and crossings become dummy vertices (ids ≥ `g.vertexCount()`, `g.label(v) === null`).

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

## Packaging

TopoLoom is **ESM-only** (`"type": "module"` with subpath exports). Node ≥ 20 can `require('@khalidsaidi/topoloom')` thanks to `require(esm)`; legacy CommonJS resolution and `node10`/legacy-CJS TypeScript module resolution are not supported.

## Known limitations

- **Orthogonal infeasibility**: if `mode: 'orthogonal'` hits an embedding whose bend min-cost flow cannot balance (e.g. disconnected inputs), `planarizationLayout` throws an `OrthogonalInfeasibleError` telling you what to do. Pass `onInfeasible: 'fallback'` to downgrade honestly to the straight-line pipeline — the result then reports `stats.mode === 'straight-fallback'` (never a silent downgrade). Graphs with bridges/trees are fully supported (fixed in 0.3.x).
- **Collinear edge overlap**: the orthogonal router greedily picks bend corners to reduce collinear overlap between edge paths, but it does not perform full track assignment, so partial overlaps can still occur on dense graphs (typically several edges leaving one vertex in the same direction). The topology (bend counts, ports) is still correct.
- **Dense circuit graphs**: one showcase sample (`suitesparse hamm/add20`) currently trips the planarization edge-insertion step in both modes; tracked as a known defect.

## Status

TopoLoom is **0.x** (fast iteration). Some pipelines have constraints (e.g., undirected planar inputs for the fixed-embedding layouts). The live showcase is the source of truth for what's currently supported.

## License

MIT
