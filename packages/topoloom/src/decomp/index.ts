import { Graph, GraphBuilder, EdgeId, VertexId } from '../graph';
import { RotationSystem, rotationFromAdjacency } from '../embedding';

export type SPQRNodeType = 'S' | 'P' | 'R' | 'Q';

export type SPQRNode = {
  id: number;
  type: SPQRNodeType;
  skeleton: Graph;
  realEdges: EdgeId[];
};

export type SPQRTree = {
  nodes: SPQRNode[];
  edges: Array<[number, number]>;
};

function isCycle(graph: Graph): boolean {
  if (graph.vertexCount() < 3) return false;
  return graph.vertices().every((v) => graph.adjacency(v).length === 2);
}

function isParallel(graph: Graph): boolean {
  return graph.vertexCount() === 2 && graph.edgeCount() > 1;
}

export function spqrDecompose(graph: Graph): SPQRTree {
  let type: SPQRNodeType = 'R';
  if (graph.edgeCount() === 1) type = 'Q';
  else if (isParallel(graph)) type = 'P';
  else if (isCycle(graph)) type = 'S';

  const node: SPQRNode = {
    id: 0,
    type,
    skeleton: graph,
    realEdges: graph.edges().map((e) => e.id),
  };

  return {
    nodes: [node],
    edges: [],
  };
}

export function flipSkeleton(node: SPQRNode): RotationSystem {
  const rotation = rotationFromAdjacency(node.skeleton);
  const order = rotation.order.map((list) => [...list].reverse());
  return { order };
}

export function permuteParallel(node: SPQRNode, order: EdgeId[]): RotationSystem {
  const rotation = rotationFromAdjacency(node.skeleton);
  if (node.type !== 'P') return rotation;
  const v0 = node.skeleton.edge(order[0]).u;
  const v1 = node.skeleton.edge(order[0]).v;
  const lookup = new Map<EdgeId, { edge: EdgeId; to: VertexId }>();
  for (const edge of order) {
    const record = node.skeleton.edge(edge);
    const to = record.u === v0 ? record.v : record.u;
    lookup.set(edge, { edge, to });
  }
  const newOrder = rotation.order.map((list, idx) => {
    if (idx !== v0 && idx !== v1) return list;
    const reordered: { edge: EdgeId; to: VertexId }[] = [];
    for (const edge of order) {
      const ref = lookup.get(edge);
      if (ref) reordered.push(ref);
    }
    return reordered;
  });
  return { order: newOrder };
}

export function materializeEmbedding(node: SPQRNode): RotationSystem {
  return rotationFromAdjacency(node.skeleton);
}

export function buildSkeletonFromEdges(vertices: number, edges: Array<[VertexId, VertexId]>): Graph {
  const builder = new GraphBuilder();
  for (let i = 0; i < vertices; i += 1) builder.addVertex(i);
  for (const [u, v] of edges) builder.addEdge(u, v, false);
  return builder.build();
}
