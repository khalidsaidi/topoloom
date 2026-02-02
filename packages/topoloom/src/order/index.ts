import { Graph, GraphBuilder, VertexId, EdgeId } from '../graph';
import { HalfEdgeMesh } from '../embedding';

export type StNumbering = {
  order: VertexId[];
  numberOf: number[];
};

export function validateStNumbering(graph: Graph, s: VertexId, t: VertexId, numbering: StNumbering) {
  const n = graph.vertexCount();
  if (numbering.order.length !== n) throw new Error('st-numbering does not cover all vertices');
  if (numbering.order[0] !== s) throw new Error('st-numbering must start with s');
  if (numbering.order[numbering.order.length - 1] !== t) throw new Error('st-numbering must end with t');

  for (let v = 0; v < n; v += 1) {
    if (v === s || v === t) continue;
    const num = numbering.numberOf[v];
    let hasLower = false;
    let hasHigher = false;
    for (const adj of graph.adjacency(v)) {
      const w = adj.to;
      if (numbering.numberOf[w] < num) hasLower = true;
      if (numbering.numberOf[w] > num) hasHigher = true;
    }
    if (!hasLower || !hasHigher) {
      throw new Error(`Vertex ${v} violates st-numbering property`);
    }
  }
}

export function stNumbering(graph: Graph, s: VertexId, t: VertexId): StNumbering {
  const n = graph.vertexCount();
  const vertices = graph.vertices().filter((v) => v !== s && v !== t);
  const placed = new Set<VertexId>([s]);
  const order: VertexId[] = [s];

  const neighbors = (v: VertexId) => graph.adjacency(v).map((adj) => adj.to);

  const search = (depth: number): boolean => {
    if (depth === n - 1) {
      order.push(t);
      return true;
    }

    const candidates = vertices.filter((v) => !placed.has(v));
    candidates.sort((a, b) => a - b);
    for (const v of candidates) {
      const neigh = neighbors(v);
      const hasLower = neigh.some((u) => placed.has(u));
      const hasHigher = neigh.some((u) => !placed.has(u) && u !== v) || t === v;
      if (!hasLower || (!hasHigher && v !== t)) continue;

      placed.add(v);
      order.push(v);
      if (search(depth + 1)) return true;
      order.pop();
      placed.delete(v);
    }
    return false;
  };

  if (!search(1)) {
    throw new Error('Failed to compute st-numbering; ensure graph is biconnected and s,t are valid.');
  }

  const numberOf = Array(n).fill(-1);
  order.forEach((v, idx) => {
    numberOf[v] = idx + 1;
  });

  const result = { order, numberOf };
  validateStNumbering(graph, s, t, result);
  return result;
}

export type BipolarOrientation = {
  order: VertexId[];
  numberOf: number[];
  edgeDirections: Array<{ edge: EdgeId; from: VertexId; to: VertexId }>;
};

export function bipolarOrientation(mesh: HalfEdgeMesh, s: VertexId, t: VertexId): BipolarOrientation {
  const builder = new GraphBuilder();
  const vertexCount = Math.max(...mesh.origin) + 1;
  for (let i = 0; i < vertexCount; i += 1) builder.addVertex(i);
  const edgeCount = mesh.halfEdgeCount / 2;
  for (let e = 0; e < edgeCount; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0];
    const v = mesh.origin[h1];
    builder.addEdge(u, v, false);
  }
  const graph = builder.build();
  const numbering = stNumbering(graph, s, t);

  const edgeDirections = graph.edges().map((edge) => {
    const from = numbering.numberOf[edge.u] < numbering.numberOf[edge.v] ? edge.u : edge.v;
    const to = from === edge.u ? edge.v : edge.u;
    return { edge: edge.id, from, to };
  });

  return { order: numbering.order, numberOf: numbering.numberOf, edgeDirections };
}
