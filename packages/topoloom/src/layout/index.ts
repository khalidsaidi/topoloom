import { GraphBuilder } from '../graph';
import type { Graph, EdgeId, VertexId } from '../graph';
import { selectOuterFace, buildHalfEdgeMesh } from '../embedding';
import type { HalfEdgeMesh } from '../embedding';
import { routeEdgeFixedEmbedding } from '../dual';
import { testPlanarity } from '../planarity';

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

function polygonArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    if (!p1 || !p2) continue;
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area / 2);
}

export function planarStraightLine(mesh: HalfEdgeMesh): LayoutResult {
  const vertexCount = Math.max(...mesh.origin) + 1;
  const positions = new Map<VertexId, Point>();
  const outer = selectOuterFace(mesh);
  const boundary = (mesh.faces[outer] ?? []).map((h) => mesh.origin[h] ?? 0);
  const uniqueBoundary = [...new Set(boundary)].filter((v) => v !== undefined);
  const radius = 10;
  const step = (2 * Math.PI) / uniqueBoundary.length;

  uniqueBoundary.forEach((v, i) => {
    positions.set(v, { x: Math.cos(step * i) * radius, y: Math.sin(step * i) * radius });
  });

  for (let v = 0; v < vertexCount; v += 1) {
    if (!positions.has(v)) positions.set(v, { x: 0, y: 0 });
  }

  // Iterative relaxation for interior vertices
  const adj: number[][] = Array.from({ length: vertexCount }, () => []);
  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    adj[u]?.push(v);
    adj[v]?.push(u);
  }

  for (let iter = 0; iter < 200; iter += 1) {
    for (let v = 0; v < vertexCount; v += 1) {
      if (uniqueBoundary.includes(v)) continue;
      const neighbors = adj[v] ?? [];
      if (neighbors.length === 0) continue;
      let x = 0;
      let y = 0;
      for (const n of neighbors) {
        const p = positions.get(n) ?? { x: 0, y: 0 };
        x += p.x;
        y += p.y;
      }
      positions.set(v, { x: x / neighbors.length, y: y / neighbors.length });
    }
  }

  // Snap to integer grid
  positions.forEach((p, v) => {
    positions.set(v, { x: Math.round(p.x), y: Math.round(p.y) });
  });

  const edges: EdgePath[] = [];
  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    edges.push({ edge: e, points: [positions.get(u) ?? { x: 0, y: 0 }, positions.get(v) ?? { x: 0, y: 0 }] });
  }

  const boundaryPoints = uniqueBoundary.map((v) => positions.get(v) ?? { x: 0, y: 0 });
  const area = polygonArea(boundaryPoints);

  return {
    positions,
    edges,
    stats: {
      bends: 0,
      area,
      crossings: 0,
    },
  };
}

export function orthogonalLayout(mesh: HalfEdgeMesh): LayoutResult {
  const base = planarStraightLine(mesh);
  const edges: EdgePath[] = [];
  let bends = 0;

  for (const edge of base.edges) {
    const [p1, p2] = edge.points;
    if (!p1 || !p2) continue;
    if (p1.x === p2.x || p1.y === p2.y) {
      edges.push(edge);
    } else {
      const mid: Point = { x: p1.x, y: p2.y };
      edges.push({ edge: edge.edge, points: [p1, mid, p2] });
      bends += 1;
    }
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
  const mesh = buildHalfEdgeMesh(baseGraph, baseEmbedding.embedding);
  const routes: Array<{ edge: EdgeId; crossed: EdgeId[] }> = [];
  for (const edgeId of remaining) {
    const edge = graph.edge(edgeId);
    const route = routeEdgeFixedEmbedding(mesh, edge.u, edge.v);
    routes.push({ edge: edgeId, crossed: route?.crossedPrimalEdges ?? [] });
  }

  const layout = planarStraightLine(mesh);
  return { baseGraph, remainingEdges: remaining, routes, layout };
}
