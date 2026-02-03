<div align="center">

# TopoLoom

**Topology-first graph drawing kernel for JavaScript.**  
Embeddings, dual routing, decompositions, and coordinate pipelines — built for deterministic, testable layouts.

**Live Showcase:** https://topoloom.web.app/ • **API Docs:** https://topoloom.web.app/api/ • **GitHub:** https://github.com/khalidsaidi/topoloom

<img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.6/docs/screenshots/npm/hero.png" alt="TopoLoom showcase" width="100%" />

</div>

---

## What it is

TopoLoom is a **modular algorithmic kernel** for coordinate-based graph drawing.

It gives you **explicit topology artifacts** (embeddings, faces, decompositions, dual routes) and **coordinate-ready constraints**, so you can build:
- planar straight-line drawings
- orthogonal layouts
- planarization-based layouts for nonplanar graphs

No renderer lock-in: use SVG/Canvas/WebGL/React Flow/D3 — your choice.

---

## Install

```bash
npm i @khalidsaidi/topoloom
```

---

## What you can expect (visual)

<p>
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.6/docs/screenshots/npm/planarity.png" alt="Planarity + embedding" width="49%" />
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.6/docs/screenshots/npm/dual.png" alt="Dual routing" width="49%" />
</p>
<p>
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.6/docs/screenshots/npm/orthogonal.png" alt="Orthogonal layout" width="49%" />
  <img src="https://raw.githubusercontent.com/khalidsaidi/topoloom/v0.2.6/docs/screenshots/npm/planarization.png" alt="Planarization pipeline" width="49%" />
</p>

---

## Core capabilities

- **Planarity + embedding output** (rotation systems + operational half-edge navigation)
- **BC / SPQR decomposition** primitives for structure + embedding decisions
- **st-numbering + bipolar orientation** building blocks
- **Dual graph construction + shortest paths in dual** for fixed-embedding edge insertion
- **Min-cost flow interface** for orthogonal / optimization reductions
- **Deterministic, testable invariants** (kernel modules are unit-tested)

---

## Links

- Showcase: https://topoloom.web.app/
- API docs: https://topoloom.web.app/api/
- Health: https://topoloom.web.app/healthz.json
- Issues: https://github.com/khalidsaidi/topoloom/issues

---

## Status

TopoLoom is **0.x** (fast iteration).  
Some pipelines have constraints (e.g., undirected planar inputs only). The live showcase is the source of truth for what’s currently supported.

---

## License

MIT
