import { GraphBuilder } from '../graph';
import type { Graph, EdgeId, VertexId } from '../graph';
import { buildHalfEdgeMesh, selectOuterFace } from '../embedding';
import type { HalfEdgeMesh, FaceId } from '../embedding';
import { buildDual, routeEdgeFixedEmbedding } from '../dual';
import { testPlanarity } from '../planarity';
import { minCostFlow } from '../flow';

export type Point = { x: number; y: number };
export type EdgePath = { edge: EdgeId; points: Point[] };

export type LayoutResult = {
  positions: Map<VertexId, Point>;
  edges: EdgePath[];
  stats: {
    bends: number;
    area: number;
    crossings: number;
  };
};

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const orient = (p: Point, q: Point, r: Point) => {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < 1e-9) return 0;
    return val > 0 ? 1 : 2;
  };

  const onSegment = (p: Point, q: Point, r: Point) => {
    return (
      Math.min(p.x, r.x) <= q.x + 1e-9 &&
      q.x <= Math.max(p.x, r.x) + 1e-9 &&
      Math.min(p.y, r.y) <= q.y + 1e-9 &&
      q.y <= Math.max(p.y, r.y) + 1e-9
    );
  };

  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

const polygonArea = (points: Point[]): number => {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    if (!p1 || !p2) continue;
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area / 2);
};

const uniqueCycle = (vertices: VertexId[]) => {
  const cycle: VertexId[] = [];
  for (const v of vertices) {
    if (cycle.length === 0 || cycle[cycle.length - 1] !== v) cycle.push(v);
  }
  if (cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]) {
    cycle.pop();
  }
  return cycle;
};

const buildAugmentedAdjacency = (mesh: HalfEdgeMesh, outer: FaceId) => {
  const vertexCount = Math.max(...mesh.origin) + 1;
  const neighbors: Array<Set<VertexId>> = Array.from({ length: vertexCount }, () => new Set());
  const addEdge = (u: VertexId, v: VertexId) => {
    if (u === v) return;
    neighbors[u]?.add(v);
    neighbors[v]?.add(u);
  };

  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    addEdge(u, v);
  }

  mesh.faces.forEach((cycle, faceId) => {
    if (faceId === outer) return;
    const verts = uniqueCycle(cycle.map((h) => mesh.origin[h] ?? 0));
    if (verts.length <= 3) return;
    const root = verts[0]!;
    for (let i = 2; i < verts.length - 1; i += 1) {
      addEdge(root, verts[i]!);
    }
  });

  return neighbors;
};

export function planarStraightLine(mesh: HalfEdgeMesh): LayoutResult {
  const vertexCount = Math.max(...mesh.origin) + 1;
  const positions = new Map<VertexId, Point>();
  const outer = selectOuterFace(mesh);
  const boundary = uniqueCycle((mesh.faces[outer] ?? []).map((h) => mesh.origin[h] ?? 0));
  const boundarySet = new Set(boundary);
  const neighbors = buildAugmentedAdjacency(mesh, outer);

  const radius = Math.max(10, boundary.length * 5);
  boundary.forEach((v, i) => {
    const angle = (2 * Math.PI * i) / boundary.length;
    positions.set(v, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });

  for (let v = 0; v < vertexCount; v += 1) {
    if (!positions.has(v)) positions.set(v, { x: 0, y: 0 });
  }

  const maxIter = 500;
  for (let iter = 0; iter < maxIter; iter += 1) {
    let maxDelta = 0;
    for (let v = 0; v < vertexCount; v += 1) {
      if (boundarySet.has(v)) continue;
      const neigh = Array.from(neighbors[v] ?? []);
      if (neigh.length === 0) continue;
      let x = 0;
      let y = 0;
      for (const n of neigh) {
        const p = positions.get(n) ?? { x: 0, y: 0 };
        x += p.x;
        y += p.y;
      }
      x /= neigh.length;
      y /= neigh.length;
      const prev = positions.get(v) ?? { x: 0, y: 0 };
      maxDelta = Math.max(maxDelta, Math.abs(prev.x - x) + Math.abs(prev.y - y));
      positions.set(v, { x, y });
    }
    if (maxDelta < 1e-4) break;
  }

  const scale = 10;
  positions.forEach((p, v) => {
    positions.set(v, { x: Math.round(p.x * scale), y: Math.round(p.y * scale) });
  });

  const edges: EdgePath[] = [];
  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    edges.push({ edge: e, points: [positions.get(u) ?? { x: 0, y: 0 }, positions.get(v) ?? { x: 0, y: 0 }] });
  }

  const boundaryPoints = boundary.map((v) => positions.get(v) ?? { x: 0, y: 0 });
  const area = polygonArea(boundaryPoints);

  let crossings = 0;
  const shared = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const e1 = edges[i]!;
      const e2 = edges[j]!;
      const [a1, a2] = e1.points;
      const [b1, b2] = e2.points;
      if (!a1 || !a2 || !b1 || !b2) continue;
      if (shared(a1, b1) || shared(a1, b2) || shared(a2, b1) || shared(a2, b2)) continue;
      if (segmentsIntersect(a1, a2, b1, b2)) crossings += 1;
    }
  }

  return {
    positions,
    edges,
    stats: {
      bends: 0,
      area,
      crossings,
    },
  };
}

const incidentFacesInOrder = (mesh: HalfEdgeMesh, vertex: VertexId): FaceId[] => {
  const start = mesh.origin.findIndex((v) => v === vertex);
  if (start < 0) return [];
  const faces: FaceId[] = [];
  let h = start;
  const guardLimit = mesh.halfEdgeCount;
  let guard = 0;
  do {
    const f = mesh.face[h] ?? -1;
    if (!faces.includes(f)) faces.push(f as FaceId);
    const twin = mesh.twin[h] ?? -1;
    const next = mesh.next[twin] ?? -1;
    h = next;
    guard += 1;
  } while (h !== start && guard < guardLimit);
  return faces;
};

const computeBends = (mesh: HalfEdgeMesh) => {
  const faceCount = mesh.faces.length;
  const outer = selectOuterFace(mesh);
  const vertexCount = Math.max(...mesh.origin) + 1;
  const faceRotation = Array(faceCount).fill(0);

  for (let v = 0; v < vertexCount; v += 1) {
    const faces = incidentFacesInOrder(mesh, v);
    const degree = faces.length;
    if (degree === 0) continue;
    if (degree === 1) {
      faceRotation[faces[0]!] += -2;
    } else if (degree === 2) {
      // straight by default
      faceRotation[faces[0]!] += 0;
      faceRotation[faces[1]!] += 0;
    } else if (degree === 3) {
      let zeroFace = faces[0]!;
      if (faces.includes(outer)) zeroFace = outer;
      for (const f of faces) {
        faceRotation[f] += f === zeroFace ? 0 : 1;
      }
    } else if (degree === 4) {
      for (const f of faces) faceRotation[f] += 1;
    }
  }

  const demands = Array(faceCount).fill(0);
  for (let f = 0; f < faceCount; f += 1) {
    const required = f === outer ? -4 : 4;
    demands[f] = required - (faceRotation[f] ?? 0);
  }

  const dual = buildDual(mesh);
  const arcs: Array<{ from: number; to: number; upper: number; cost: number }> = [];
  const edgeArcIndex: Array<{ forward: number; backward: number }> = [];
  const capacity = 1000;

  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const faces = dual.edgeFaces[e];
    const left = faces?.left ?? 0;
    const right = faces?.right ?? 0;
    const forward = arcs.length;
    arcs.push({ from: left, to: right, upper: capacity, cost: 1 });
    const backward = arcs.length;
    arcs.push({ from: right, to: left, upper: capacity, cost: 1 });
    edgeArcIndex[e] = { forward, backward };
  }

  const result = minCostFlow({ nodeCount: faceCount, arcs, demands });
  if (!result.feasible) {
    throw new Error('Orthogonal representation flow is infeasible.');
  }

  const bendsPerEdge: number[] = [];
  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const idx = edgeArcIndex[e];
    if (!idx) {
      bendsPerEdge[e] = 0;
      continue;
    }
    const forward = result.flowByArc[idx.forward] ?? 0;
    const backward = result.flowByArc[idx.backward] ?? 0;
    bendsPerEdge[e] = forward + backward;
  }
  return bendsPerEdge;
};

const routeOrthogonal = (start: Point, end: Point, bends: number): Point[] => {
  const points: Point[] = [start];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let segments = bends + 1;
  if (segments === 1 && start.x !== end.x && start.y !== end.y) segments = 2;

  let horizontalFirst = Math.abs(dx) >= Math.abs(dy);
  const hSegments = horizontalFirst ? Math.ceil(segments / 2) : Math.floor(segments / 2);
  const vSegments = segments - hSegments;
  if (hSegments === 0 && dx !== 0) horizontalFirst = true;
  if (vSegments === 0 && dy !== 0) horizontalFirst = false;

  const hSegs = horizontalFirst ? Math.ceil(segments / 2) : Math.floor(segments / 2);
  const vSegs = segments - hSegs;
  const dxStep = hSegs > 0 ? dx / hSegs : 0;
  const dyStep = vSegs > 0 ? dy / vSegs : 0;

  let current = { ...start };
  let hCount = 0;
  let vCount = 0;
  for (let i = 0; i < segments; i += 1) {
    const horizontal = horizontalFirst ? i % 2 === 0 : i % 2 === 1;
    if (horizontal) {
      hCount += 1;
      current = { x: start.x + dxStep * hCount, y: current.y };
    } else {
      vCount += 1;
      current = { x: current.x, y: start.y + dyStep * vCount };
    }
    points.push({ ...current });
  }
  points[points.length - 1] = { ...end };
  return points;
};

export function orthogonalLayout(mesh: HalfEdgeMesh): LayoutResult {
  const base = planarStraightLine(mesh);
  const bendsPerEdge = computeBends(mesh);
  const edges: EdgePath[] = [];
  let bends = 0;

  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    const p1 = base.positions.get(u) ?? { x: 0, y: 0 };
    const p2 = base.positions.get(v) ?? { x: 0, y: 0 };
    const edgeBends = bendsPerEdge[e] ?? 0;
    const path = routeOrthogonal(p1, p2, edgeBends);
    bends += Math.max(0, path.length - 2);
    edges.push({ edge: e, points: path });
  }

  return {
    positions: base.positions,
    edges,
    stats: {
      bends,
      area: base.stats.area,
      crossings: 0,
    },
  };
}

export type PlanarizationResult = {
  baseGraph: Graph;
  remainingEdges: EdgeId[];
  routes: Array<{ edge: EdgeId; crossed: EdgeId[] }>;
  layout: LayoutResult;
};

export function planarizationLayout(graph: Graph): PlanarizationResult {
  const kept: Array<{ u: VertexId; v: VertexId; id: EdgeId }> = [];
  const remaining: EdgeId[] = [];

  for (const edge of graph.edges()) {
    const builder = new GraphBuilder();
    for (const v of graph.vertices()) builder.addVertex(v);
    for (const keptEdge of kept) builder.addEdge(keptEdge.u, keptEdge.v, false);
    builder.addEdge(edge.u, edge.v, false);
    const test = testPlanarity(builder.build());
    if (test.planar) {
      kept.push({ u: edge.u, v: edge.v, id: edge.id });
    } else {
      remaining.push(edge.id);
    }
  }

  const baseBuilder = new GraphBuilder();
  for (const v of graph.vertices()) baseBuilder.addVertex(v);
  for (const keptEdge of kept) baseBuilder.addEdge(keptEdge.u, keptEdge.v, false);
  const baseGraph = baseBuilder.build();
  const baseEmbedding = testPlanarity(baseGraph);
  if (!baseEmbedding.planar) {
    throw new Error('Base planar subgraph should be planar');
  }
  const baseMesh = buildHalfEdgeMesh(baseGraph, baseEmbedding.embedding);

  const routes: Array<{ edge: EdgeId; crossed: EdgeId[] }> = [];
  const edgePaths: Array<VertexId[]> = Array(baseGraph.edgeCount())
    .fill(0)
    .map((_v, idx) => {
      const e = baseGraph.edge(idx);
      return [e.u, e.v];
    });

  let nextVertexId = baseGraph.vertexCount();
  const insertedEdges: Array<{ original: EdgeId; path: VertexId[] }> = [];

  for (const edgeId of remaining) {
    const edge = graph.edge(edgeId);
    const route = routeEdgeFixedEmbedding(baseMesh, edge.u, edge.v);
    const crossed = route?.crossedPrimalEdges ?? [];
    routes.push({ edge: edgeId, crossed });
    const path: VertexId[] = [edge.u];
    for (const crossedEdge of crossed) {
      const dummy = nextVertexId as VertexId;
      nextVertexId += 1;
      const existing = edgePaths[crossedEdge] ?? [];
      if (existing.length === 0) {
        const baseEdge = baseGraph.edge(crossedEdge);
        edgePaths[crossedEdge] = [baseEdge.u, dummy, baseEdge.v];
      } else {
        edgePaths[crossedEdge] = [...existing.slice(0, -1), dummy, existing[existing.length - 1]!];
      }
      path.push(dummy);
    }
    path.push(edge.v);
    insertedEdges.push({ original: edgeId, path });
  }

  const planarBuilder = new GraphBuilder();
  for (let i = 0; i < nextVertexId; i += 1) planarBuilder.addVertex(i);
  const edgeSegments: Array<{ edge: EdgeId; path: VertexId[] }> = [];

  edgePaths.forEach((path) => {
    for (let i = 0; i < path.length - 1; i += 1) {
      const u = path[i]!;
      const v = path[i + 1]!;
      const id = planarBuilder.addEdge(u, v, false);
      edgeSegments.push({ edge: id, path: [u, v] });
    }
  });

  insertedEdges.forEach((inserted) => {
    for (let i = 0; i < inserted.path.length - 1; i += 1) {
      const u = inserted.path[i]!;
      const v = inserted.path[i + 1]!;
      planarBuilder.addEdge(u, v, false);
    }
  });

  const planarGraph = planarBuilder.build();
  const planarEmbedding = testPlanarity(planarGraph);
  if (!planarEmbedding.planar) {
    throw new Error('Planarization graph should be planar');
  }

  const planarMesh = buildHalfEdgeMesh(planarGraph, planarEmbedding.embedding);
  const layout = planarStraightLine(planarMesh);

  const finalEdges: EdgePath[] = [];
  for (const inserted of insertedEdges) {
    const points = inserted.path.map((v) => layout.positions.get(v) ?? { x: 0, y: 0 });
    finalEdges.push({ edge: inserted.original, points });
  }

  edgePaths.forEach((_path, idx) => {
    const edge = baseGraph.edge(idx);
    const points = edgePaths[idx]!.map((v) => layout.positions.get(v) ?? { x: 0, y: 0 });
    finalEdges.push({ edge: edge.id, points });
  });

  return {
    baseGraph,
    remainingEdges: remaining,
    routes,
    layout: {
      positions: layout.positions,
      edges: finalEdges,
      stats: {
        bends: layout.stats.bends,
        area: layout.stats.area,
        crossings: nextVertexId - baseGraph.vertexCount(),
      },
    },
  };
}
