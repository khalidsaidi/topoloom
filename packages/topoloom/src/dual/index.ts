import { GraphBuilder } from '../graph';
import type { EdgeId, Graph, VertexId } from '../graph';
import type { FaceId, HalfEdgeMesh } from '../embedding';
import { buildHalfEdgeMesh } from '../embedding';
import { testPlanarity, type PlanarityOptions } from '../planarity';

export type DualGraph = {
  graph: ReturnType<GraphBuilder['build']>;
  dualEdgeToPrimalEdge: EdgeId[];
  primalEdgeToDualEdge: EdgeId[];
  edgeFaces: Array<{ left: FaceId; right: FaceId }>;
};

export function buildDual(mesh: HalfEdgeMesh): DualGraph {
  const builder = new GraphBuilder();
  const faceCount = mesh.faces.length;
  for (let i = 0; i < faceCount; i += 1) builder.addVertex(i);

  const dualEdgeToPrimalEdge: EdgeId[] = [];
  const primalEdgeToDualEdge: EdgeId[] = Array(mesh.halfEdgeCount / 2).fill(-1);
  const edgeFaces: Array<{ left: FaceId; right: FaceId }> = [];

  for (let edgeId = 0; edgeId < mesh.halfEdgeCount / 2; edgeId += 1) {
    const h0 = edgeId * 2;
    const h1 = edgeId * 2 + 1;
    const left = mesh.face[h0] as FaceId;
    const right = mesh.face[h1] as FaceId;
    const dualEdge = builder.addEdge(left, right, false);
    dualEdgeToPrimalEdge[dualEdge] = edgeId;
    primalEdgeToDualEdge[edgeId] = dualEdge;
    edgeFaces[edgeId] = { left, right };
  }

  return { graph: builder.build(), dualEdgeToPrimalEdge, primalEdgeToDualEdge, edgeFaces };
}

export type DualPath = {
  faces: FaceId[];
  dualEdges: EdgeId[];
  primalEdges: EdgeId[];
  distance: number;
};

export function dualShortestPath(
  dual: DualGraph,
  startFaces: FaceId[],
  goalFaces: FaceId[],
  weightFn: (edge: EdgeId, primalEdge: EdgeId) => number = () => 1,
): DualPath | null {
  const faceCount = dual.graph.vertexCount();
  const dist = Array(faceCount).fill(Infinity);
  const prevEdge: Array<EdgeId | null> = Array(faceCount).fill(null);
  const prevFace: Array<FaceId | null> = Array(faceCount).fill(null);

  const targetSet = new Set(goalFaces);
  const queue: Array<{ face: FaceId; d: number }> = [];

  for (const f of startFaces) {
    dist[f] = 0;
    queue.push({ face: f, d: 0 });
  }

  const popMin = (): { face: FaceId; d: number } | undefined => {
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      const current = queue[i];
      const best = queue[bestIndex];
      if (current && best && current.d < best.d) bestIndex = i;
    }
    return queue.splice(bestIndex, 1)[0];
  };

  while (queue.length > 0) {
    const current = popMin();
    if (!current) break;
    const u = current.face;
    if (current.d !== dist[u]) continue;
    if (targetSet.has(u)) {
      break;
    }

    for (const adj of dual.graph.adjacency(u)) {
      const v = adj.to;
      const edgeId = adj.edge;
      const primalEdge = dual.dualEdgeToPrimalEdge[edgeId] ?? 0;
      const weight = weightFn(edgeId, primalEdge);
      const nd = dist[u] + weight;
      if (nd < dist[v]) {
        dist[v] = nd;
        prevEdge[v] = edgeId;
        prevFace[v] = u;
        queue.push({ face: v, d: nd });
      }
    }
  }

  let target: FaceId | null = null;
  for (const f of goalFaces) {
    if (dist[f] < Infinity) {
      target = f;
      break;
    }
  }
  if (target === null) return null;

  const faces: FaceId[] = [target];
  const dualEdges: EdgeId[] = [];
  const primalEdges: EdgeId[] = [];
  let current = target;
  while (prevFace[current] !== null) {
    const e = prevEdge[current];
    if (e === null || e === undefined) break;
    dualEdges.push(e);
    primalEdges.push(dual.dualEdgeToPrimalEdge[e] ?? 0);
    const p = prevFace[current];
    if (p === null || p === undefined) break;
    faces.push(p);
    current = p;
  }
  faces.reverse();
  dualEdges.reverse();
  primalEdges.reverse();

  return { faces, dualEdges, primalEdges, distance: dist[target] };
}

export function routeEdgeFixedEmbedding(
  mesh: HalfEdgeMesh,
  u: VertexId,
  v: VertexId,
  weightFn?: (edge: EdgeId, primalEdge: EdgeId) => number,
): { crossedPrimalEdges: EdgeId[]; faces: FaceId[] } | null {
  const incidentFaces = (vertex: VertexId): FaceId[] => {
    const faces = new Set<FaceId>();
    for (let h = 0; h < mesh.halfEdgeCount; h += 1) {
      if (mesh.origin[h] === vertex) {
        faces.add(mesh.face[h] as FaceId);
      }
    }
    return [...faces.values()];
  };

  const startFaces = incidentFaces(u);
  const goalFaces = incidentFaces(v);
  const dual = buildDual(mesh);
  const path = dualShortestPath(dual, startFaces, goalFaces, weightFn);
  if (!path) return null;
  return { crossedPrimalEdges: path.primalEdges, faces: path.faces };
}

export type RouteOnGraphOptions = {
  planarityFallback?: boolean;
  planarityOptions?: PlanarityOptions;
};

export type RouteOnGraphResult = {
  crossedPrimalEdges: EdgeId[];
  faces: FaceId[];
  note?: string;
  droppedEdges?: EdgeId[];
};

const buildMaximalPlanarSubgraph = (graph: Graph, options?: PlanarityOptions) => {
  const kept: Array<{ u: VertexId; v: VertexId; original: EdgeId }> = [];
  const dropped: EdgeId[] = [];
  const treatDirected = options?.treatDirectedAsUndirected ?? false;
  const allowSelfLoops = options?.allowSelfLoops ?? 'reject';

  for (const edge of graph.edges()) {
    if (edge.u === edge.v) {
      if (allowSelfLoops === 'ignore') {
        dropped.push(edge.id);
        continue;
      }
      throw new Error('Dual routing does not support self-loops.');
    }
    if (edge.directed && !treatDirected) {
      throw new Error('Dual routing requires an undirected graph.');
    }
    const builder = new GraphBuilder();
    for (const v of graph.vertices()) builder.addVertex(graph.label(v));
    for (const keptEdge of kept) builder.addEdge(keptEdge.u, keptEdge.v, false);
    builder.addEdge(edge.u, edge.v, false);
    const test = testPlanarity(builder.build(), options);
    if (test.planar) {
      kept.push({ u: edge.u, v: edge.v, original: edge.id });
    } else {
      dropped.push(edge.id);
    }
  }

  const baseBuilder = new GraphBuilder();
  for (const v of graph.vertices()) baseBuilder.addVertex(graph.label(v));
  const edgeMap: EdgeId[] = [];
  for (const keptEdge of kept) {
    const id = baseBuilder.addEdge(keptEdge.u, keptEdge.v, false);
    edgeMap[id] = keptEdge.original;
  }
  return { graph: baseBuilder.build(), edgeMap, dropped };
};

export function routeEdgeOnGraph(
  graph: Graph,
  u: VertexId,
  v: VertexId,
  options: RouteOnGraphOptions = {},
): RouteOnGraphResult | null {
  const planarity = testPlanarity(graph, options.planarityOptions);
  if (planarity.planar) {
    const mesh = buildHalfEdgeMesh(graph, planarity.embedding);
    const route = routeEdgeFixedEmbedding(mesh, u, v);
    if (!route) return null;
    const note = planarity.ignoredSelfLoops?.length
      ? `Ignored ${planarity.ignoredSelfLoops.length} self-loop(s) during planarity check.`
      : undefined;
    return note ? { ...route, note } : route;
  }

  if (!options.planarityFallback) return null;

  const { graph: base, edgeMap, dropped } = buildMaximalPlanarSubgraph(
    graph,
    options.planarityOptions,
  );
  const basePlanarity = testPlanarity(base, options.planarityOptions);
  if (!basePlanarity.planar) return null;
  const mesh = buildHalfEdgeMesh(base, basePlanarity.embedding);
  const route = routeEdgeFixedEmbedding(mesh, u, v);
  if (!route) return null;
  const mapped = route.crossedPrimalEdges.map((edgeId) => edgeMap[edgeId] ?? edgeId);
  const result: RouteOnGraphResult = {
    crossedPrimalEdges: mapped,
    faces: route.faces,
    note: `Nonplanar input: routed on a maximal planar backbone (dropped ${dropped.length} edge(s)).`,
  };
  if (dropped.length) result.droppedEdges = dropped;
  return result;
}
