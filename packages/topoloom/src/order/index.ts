import { GraphBuilder } from '../graph';
import type { Graph, VertexId, EdgeId } from '../graph';
import type { HalfEdgeMesh } from '../embedding';
import { biconnectedComponents } from '../dfs';

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
      const wNum = numbering.numberOf[w];
      if (wNum !== undefined && num !== undefined && wNum < num) hasLower = true;
      if (wNum !== undefined && num !== undefined && wNum > num) hasHigher = true;
    }
    if (!hasLower || !hasHigher) {
      throw new Error(`Vertex ${v} violates st-numbering property`);
    }
  }
}

export function stNumbering(graph: Graph, s: VertexId, t: VertexId): StNumbering {
  const n = graph.vertexCount();
  if (s === t) throw new Error('st-numbering requires distinct s and t.');
  if (s < 0 || t < 0 || s >= n || t >= n) throw new Error('Invalid s or t.');
  for (const edge of graph.edges()) {
    if (edge.directed) throw new Error('st-numbering requires an undirected graph.');
    if (edge.u === edge.v) throw new Error('st-numbering does not support self-loops.');
  }

  const bcc = biconnectedComponents(graph);
  if (bcc.blocks.length !== 1 || bcc.articulationPoints.length > 0) {
    throw new Error('st-numbering requires a biconnected graph.');
  }

  const adjacency: Array<Array<{ to: VertexId; edge: EdgeId }>> = Array.from({ length: n }, () => []);
  graph.edges().forEach((edge) => {
    adjacency[edge.u]?.push({ to: edge.v, edge: edge.id });
    adjacency[edge.v]?.push({ to: edge.u, edge: edge.id });
  });

  let hasEdgeST = false;
  for (const edge of graph.edges()) {
    if ((edge.u === s && edge.v === t) || (edge.u === t && edge.v === s)) {
      hasEdgeST = true;
      break;
    }
  }
  const extraEdgeId = graph.edgeCount();
  if (!hasEdgeST) {
    adjacency[s]?.push({ to: t, edge: extraEdgeId });
    adjacency[t]?.push({ to: s, edge: extraEdgeId });
  }

  const dfsNum = Array(n).fill(-1);
  const lowNum = Array(n).fill(0);
  const parent = Array(n).fill(-1);
  const parentEdge = Array(n).fill(-1);
  const postOrder: VertexId[] = [];
  let time = 0;

  const dfs = (v: VertexId) => {
    dfsNum[v] = time;
    lowNum[v] = time;
    time += 1;

    const neighbors = adjacency[v] ?? [];
    for (const adj of neighbors) {
      const w = adj.to;
      const e = adj.edge;
      if (dfsNum[w] === -1) {
        parent[w] = v;
        parentEdge[w] = e;
        dfs(w);
        if (lowNum[w] < lowNum[v]) {
          lowNum[v] = lowNum[w];
        }
      } else if (e !== parentEdge[v]) {
        if (dfsNum[w] < lowNum[v]) {
          lowNum[v] = dfsNum[w];
        }
      }
    }
    postOrder.push(v);
  };

  dfs(s);

  if (dfsNum[t] === -1) {
    throw new Error('st-numbering requires s and t to be connected.');
  }

  const prev = Array(n).fill(-1);
  const next = Array(n).fill(-1);
  let head = s;
  prev[s] = -1;
  next[s] = t;
  prev[t] = s;
  next[t] = -1;

  const insertBefore = (v: VertexId, anchor: VertexId) => {
    const p = prev[anchor];
    prev[v] = p;
    next[v] = anchor;
    prev[anchor] = v;
    if (p !== -1) {
      next[p] = v;
    } else {
      head = v;
    }
  };

  const insertAfter = (v: VertexId, anchor: VertexId) => {
    const nNext = next[anchor];
    next[v] = nNext;
    prev[v] = anchor;
    next[anchor] = v;
    if (nNext !== -1) {
      prev[nNext] = v;
    }
  };

  const processOrder = postOrder.slice().reverse();
  for (const v of processOrder) {
    if (v === s || v === t) continue;
    const parentV = parent[v];
    if (parentV === -1) continue;
    if (lowNum[v] < dfsNum[parentV]) {
      insertBefore(v, parentV);
    } else {
      insertAfter(v, parentV);
    }
  }

  const order: VertexId[] = [];
  for (let v = head; v !== -1; v = next[v]) {
    order.push(v as VertexId);
  }

  if (order.length !== n) {
    throw new Error('st-numbering failed to order all vertices.');
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
    const u = mesh.origin[h0] as VertexId;
    const v = mesh.origin[h1] as VertexId;
    builder.addEdge(u, v, false);
  }
  const graph = builder.build();

  const incidentFaces = (vertex: VertexId) => {
    const faces = new Set<number>();
    for (let h = 0; h < mesh.halfEdgeCount; h += 1) {
      if (mesh.origin[h] === vertex) faces.add(mesh.face[h] ?? -1);
    }
    return faces;
  };

  const facesS = incidentFaces(s);
  const facesT = incidentFaces(t);
  const hasSharedFace = [...facesS].some((f) => facesT.has(f));
  if (!hasSharedFace) {
    throw new Error('Bipolar orientation requires s and t to share a face in the embedding.');
  }

  const numbering = stNumbering(graph, s, t);

  const edgeDirections = graph.edges().map((edge) => {
    const numU = numbering.numberOf[edge.u] ?? 0;
    const numV = numbering.numberOf[edge.v] ?? 0;
    const from = numU < numV ? edge.u : edge.v;
    const to = from === edge.u ? edge.v : edge.u;
    return { edge: edge.id, from, to };
  });

  return { order: numbering.order, numberOf: numbering.numberOf, edgeDirections };
}
