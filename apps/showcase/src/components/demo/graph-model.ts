import { GraphBuilder } from 'topoloom/graph';

export type GraphNode = {
  id: number;
  label: string;
  x: number;
  y: number;
};

export type GraphEdge = {
  id: number;
  source: number;
  target: number;
  directed: boolean;
};

export type GraphState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  directed: boolean;
  nextNodeId: number;
  nextEdgeId: number;
};

export const createGraphState = (
  nodes: Array<{ id: number; label?: string; x?: number; y?: number }>,
  edges: Array<{ source: number; target: number; directed?: boolean }>,
  directed = false,
): GraphState => {
  const maxNode = nodes.reduce((acc, node) => Math.max(acc, node.id), -1);
  const maxEdge = edges.length - 1;
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      label: node.label ?? String(node.id),
      x: node.x ?? Math.random() * 120 - 60,
      y: node.y ?? Math.random() * 120 - 60,
    })),
    edges: edges.map((edge, idx) => ({
      id: idx,
      source: edge.source,
      target: edge.target,
      directed: edge.directed ?? directed,
    })),
    directed,
    nextNodeId: maxNode + 1,
    nextEdgeId: maxEdge + 1,
  };
};

export const presets = {
  triangle: createGraphState(
    [
      { id: 0, x: -40, y: -30 },
      { id: 1, x: 40, y: -30 },
      { id: 2, x: 0, y: 40 },
    ],
    [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 0 },
    ],
  ),
  squareDiagonal: createGraphState(
    [
      { id: 0, x: -50, y: -50 },
      { id: 1, x: 50, y: -50 },
      { id: 2, x: 50, y: 50 },
      { id: 3, x: -50, y: 50 },
    ],
    [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 0 },
      { source: 0, target: 2 },
    ],
  ),
  k4: createGraphState(
    [
      { id: 0, x: -40, y: -40 },
      { id: 1, x: 40, y: -40 },
      { id: 2, x: 40, y: 40 },
      { id: 3, x: -40, y: 40 },
    ],
    [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 0 },
      { source: 0, target: 2 },
      { source: 1, target: 3 },
    ],
  ),
  k5: createGraphState(
    [
      { id: 0, x: -50, y: 0 },
      { id: 1, x: -15, y: -50 },
      { id: 2, x: 30, y: -30 },
      { id: 3, x: 35, y: 30 },
      { id: 4, x: -10, y: 50 },
    ],
    [
      { source: 0, target: 1 },
      { source: 0, target: 2 },
      { source: 0, target: 3 },
      { source: 0, target: 4 },
      { source: 1, target: 2 },
      { source: 1, target: 3 },
      { source: 1, target: 4 },
      { source: 2, target: 3 },
      { source: 2, target: 4 },
      { source: 3, target: 4 },
    ],
  ),
  k33: createGraphState(
    [
      { id: 0, x: -60, y: -40 },
      { id: 1, x: -60, y: 0 },
      { id: 2, x: -60, y: 40 },
      { id: 3, x: 60, y: -40 },
      { id: 4, x: 60, y: 0 },
      { id: 5, x: 60, y: 40 },
    ],
    [
      { source: 0, target: 3 },
      { source: 0, target: 4 },
      { source: 0, target: 5 },
      { source: 1, target: 3 },
      { source: 1, target: 4 },
      { source: 1, target: 5 },
      { source: 2, target: 3 },
      { source: 2, target: 4 },
      { source: 2, target: 5 },
    ],
  ),
} as const;

export function toTopoGraph(state: GraphState) {
  const builder = new GraphBuilder();
  const idMap = new Map<number, number>();
  for (const node of state.nodes) {
    const id = builder.addVertex(node.label);
    idMap.set(node.id, id);
  }
  for (const edge of state.edges) {
    const u = idMap.get(edge.source) ?? 0;
    const v = idMap.get(edge.target) ?? 0;
    builder.addEdge(u, v, edge.directed);
  }
  return builder.build();
}
