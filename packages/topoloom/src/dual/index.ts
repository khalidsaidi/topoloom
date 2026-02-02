import { GraphBuilder, EdgeId, VertexId } from '../graph';
import { FaceId, HalfEdgeMesh } from '../embedding';

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
      if (queue[i].d < queue[bestIndex].d) bestIndex = i;
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
      const primalEdge = dual.dualEdgeToPrimalEdge[edgeId];
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
    if (e === null) break;
    dualEdges.push(e);
    primalEdges.push(dual.dualEdgeToPrimalEdge[e]);
    const p = prevFace[current];
    if (p === null) break;
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
