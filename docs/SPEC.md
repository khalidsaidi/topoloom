# TopoLoom SPEC (what “done” means)

## Product promise
TopoLoom is a **topology/embedding kernel** + **coordinate pipelines** for graph drawing:
- Explicit embeddings (rotation systems + half-edge) as first-class outputs
- BC + SPQR decompositions
- st-numberings + bipolar orientations
- Dual graph construction + shortest-path routing in the dual
- Min-cost flow abstraction + a built-in solver
- Pipelines that consume the above to output coordinates:
  - planar straight-line
  - orthogonal (min-bend + compaction)
  - planarization-based for nonplanar graphs

## Core rule
No “layout algorithm” is allowed to quietly redo planarity/embedding/dual if the kernel can provide it.
Topological steps must be explicitly represented and queriable.

## API design principles
- Deterministic: same input + same options => same outputs
- Serializable: every major output has `.toJSON()` and `fromJSON()`
- Composable: outputs of one module feed another without adapter glue
- Testable: each module has invariants with unit tests + property tests

## Modules + acceptance criteria

### graph
- Graph structure supports:
  - undirected and directed edges
  - multi-edges (EdgeId) and (optional) self-loops (either supported or rejected explicitly)
- Stable iteration order (insertion-order)
- Adapters:
  - from adjacency list / edge list
  - to adjacency list / edge list

### dfs
- SCC for directed graphs (Tarjan or Kosaraju)
- Articulation points, bridges, biconnected components for undirected graphs
- BC-tree builder
- Tests:
  - SCC condensation is acyclic
  - Every undirected edge belongs to exactly one block

### planarity
- Planarity test with embedding output:
  - If planar: rotation system + optional outer face hint
  - If nonplanar: Kuratowski witness (edge set or subgraph structure)
- Deterministic embedding output
- Tests:
  - planar graphs satisfy Euler characteristic after face build
  - witness graphs are nonplanar in regression set (K5, K3,3, etc.)

### embedding
- Rotation system compilation to half-edge (DCEL-like)
- Face enumeration, boundary traversal, dual adjacency utilities
- Invariants:
  - each half-edge has twin
  - next/prev cycles are consistent
  - face boundaries close
  - dual mappings consistent

### decomp
- SPQR-tree for each biconnected block:
  - node types S/P/R/Q
  - skeletons with virtual edges
  - embedding choice utilities (flip/permute where valid)
- Tests: structural validity on known graphs + random planar biconnected graphs

### order
- st-numbering (given biconnected graph + s,t)
- bipolar orientation for embedded planar graph (outer face s,t)
- Tests:
  - st property: each internal vertex has lower and higher numbered neighbors
  - bipolar: acyclic; unique source/sink; internal vertices meet constraints

### dual
- buildDual(halfEdge)
- dualShortestPath(faceSetA, faceSetB, weightFn)
- edge insertion route: returns crossed primal edges + face sequence

### flow
- solver interface:
  - capacities, costs, supplies/demands OR circulation
- built-in min-cost flow solver (successive shortest augmenting path + potentials is OK)
- tests on small known instances

### layout
- Planar straight-line layout:
  - provide at least one robust algorithm:
    - Tutte (for 3-connected with fixed outer face) OR
    - canonical ordering / Schnyder-style for triangulations + triangulate fallback
- Orthogonal layout:
  - implement Tamassia-style min-bend orthogonal representation via min-cost flow
  - compaction step to integer grid (separate x/y constraint graphs)
- Planarization pipeline:
  - maximal planar subgraph heuristic (incremental edge add + planarity test)
  - fixed-embedding insertion using dual shortest path
  - convert crossings to dummy vertices, run planar layout, unroll crossings

## “Done” definition
- Library builds, typechecks, passes tests, and has docs.
- Showcase demonstrates EVERY module with interactive visuals and JSON inspection.
