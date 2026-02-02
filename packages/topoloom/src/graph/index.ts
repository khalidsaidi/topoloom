export type VertexId = number;
export type EdgeId = number;

export type EdgeRecord = {
  id: EdgeId;
  u: VertexId;
  v: VertexId;
  directed: boolean;
};

export type AdjEntry = {
  edge: EdgeId;
  to: VertexId;
  dir: 'out' | 'in' | 'undirected';
};

export type GraphJSON = {
  labels?: Array<string | number | null>;
  edges: Array<{ u: VertexId; v: VertexId; directed: boolean }>;
};

export class Graph {
  private readonly _labels: Array<string | number | null>;
  private readonly _edges: EdgeRecord[];
  private readonly _adj: AdjEntry[][];

  constructor(labels: Array<string | number | null>, edges: EdgeRecord[], adj: AdjEntry[][]) {
    this._labels = labels;
    this._edges = edges;
    this._adj = adj;
  }

  static fromJSON(json: GraphJSON): Graph {
    const labels = json.labels ? [...json.labels] : [];
    const builder = new GraphBuilder();
    const maxVertex = labels.length > 0 ? labels.length : 0;
    for (let i = 0; i < maxVertex; i += 1) {
      builder.addVertex(labels[i] ?? null);
    }
    for (const edge of json.edges) {
      builder.addEdge(edge.u, edge.v, edge.directed);
    }
    return builder.build();
  }

  toJSON(): GraphJSON {
    return {
      labels: [...this._labels],
      edges: this._edges.map((edge) => ({ u: edge.u, v: edge.v, directed: edge.directed })),
    };
  }

  vertexCount(): number {
    return this._labels.length;
  }

  edgeCount(): number {
    return this._edges.length;
  }

  vertices(): VertexId[] {
    return this._labels.map((_, i) => i as VertexId);
  }

  edges(): EdgeRecord[] {
    return [...this._edges];
  }

  label(v: VertexId): string | number | null {
    return this._labels[v] ?? null;
  }

  edge(e: EdgeId): EdgeRecord {
    const record = this._edges[e];
    if (!record) throw new Error(`Edge ${e} not found`);
    return record;
  }

  adjacency(v: VertexId): ReadonlyArray<AdjEntry> {
    return this._adj[v] ?? [];
  }

  incidentEdges(v: VertexId): EdgeId[] {
    return this.adjacency(v).map((entry) => entry.edge);
  }

  outEdges(v: VertexId): EdgeId[] {
    return this.adjacency(v)
      .filter((entry) => entry.dir === 'out' || entry.dir === 'undirected')
      .map((entry) => entry.edge);
  }

  inEdges(v: VertexId): EdgeId[] {
    return this.adjacency(v)
      .filter((entry) => entry.dir === 'in' || entry.dir === 'undirected')
      .map((entry) => entry.edge);
  }

  neighbors(v: VertexId): VertexId[] {
    return this.adjacency(v).map((entry) => entry.to);
  }

  toEdgeList(): Array<[VertexId, VertexId, boolean]> {
    return this._edges.map((edge) => [edge.u, edge.v, edge.directed]);
  }

  toAdjList(): Array<Array<{ to: VertexId; edge: EdgeId; dir: AdjEntry['dir'] }>> {
    return this._adj.map((list) => list.map((entry) => ({ ...entry })));
  }
}

export class GraphBuilder {
  private labels: Array<string | number | null> = [];
  private edges: EdgeRecord[] = [];
  private adj: AdjEntry[][] = [];

  addVertex(label: string | number | null = null): VertexId {
    const id = this.labels.length as VertexId;
    this.labels.push(label);
    this.adj.push([]);
    return id;
  }

  addEdge(u: VertexId, v: VertexId, directed = false): EdgeId {
    if (u < 0 || v < 0 || u >= this.labels.length || v >= this.labels.length) {
      throw new Error(`Invalid vertex id(s) ${u}, ${v}`);
    }
    const id = this.edges.length as EdgeId;
    const record: EdgeRecord = { id, u, v, directed };
    this.edges.push(record);

    if (directed) {
      this.adj[u]?.push({ edge: id, to: v, dir: 'out' });
      this.adj[v]?.push({ edge: id, to: u, dir: 'in' });
    } else {
      this.adj[u]?.push({ edge: id, to: v, dir: 'undirected' });
      this.adj[v]?.push({ edge: id, to: u, dir: 'undirected' });
    }

    return id;
  }

  build(): Graph {
    return new Graph([...this.labels], [...this.edges], this.adj.map((list) => [...list]));
  }
}

export type EdgeListInput = Array<[string | number, string | number] | [string | number, string | number, boolean]>;

export function fromEdgeList(edges: EdgeListInput): Graph {
  const builder = new GraphBuilder();
  const map = new Map<string | number, VertexId>();

  const getVertex = (key: string | number): VertexId => {
    const existing = map.get(key);
    if (existing !== undefined) return existing;
    const id = builder.addVertex(key);
    map.set(key, id);
    return id;
  };

  for (const entry of edges) {
    const [a, b, directed = false] = entry;
    const u = getVertex(a);
    const v = getVertex(b);
    builder.addEdge(u, v, directed);
  }

  return builder.build();
}

export type AdjListInput = Record<string, Array<string | number>> | Array<Array<string | number>>;

export function fromAdjList(adj: AdjListInput, directed = false): Graph {
  const builder = new GraphBuilder();
  const map = new Map<string | number, VertexId>();
  const getVertex = (key: string | number): VertexId => {
    const existing = map.get(key);
    if (existing !== undefined) return existing;
    const id = builder.addVertex(key);
    map.set(key, id);
    return id;
  };

  const addEdgePair = (uKey: string | number, vKey: string | number) => {
    const u = getVertex(uKey);
    const v = getVertex(vKey);
    builder.addEdge(u, v, directed);
  };

  if (Array.isArray(adj)) {
    adj.forEach((neighbors, index) => {
      const uKey = index;
      for (const vKey of neighbors) {
        addEdgePair(uKey, vKey);
      }
    });
  } else {
    for (const [uKey, neighbors] of Object.entries(adj)) {
      for (const vKey of neighbors) {
        addEdgePair(uKey, vKey as string | number);
      }
    }
  }

  return builder.build();
}

export function toEdgeList(graph: Graph): Array<[VertexId, VertexId, boolean]> {
  return graph.toEdgeList();
}

export function toAdjList(graph: Graph): Array<Array<{ to: VertexId; edge: EdgeId; dir: AdjEntry['dir'] }>> {
  return graph.toAdjList();
}
