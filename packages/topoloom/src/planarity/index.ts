import type { EdgeId, Graph, VertexId } from '../graph';
import { assertGraph } from '../graph';
import type { RotationSystem } from '../embedding';
import { allocInt32Ptr, getPlanarityWasm, viewInt32 } from './wasm';
import { planarityLeftRight, planarityWitness, type PlanarityEdgeSpec } from './ts';

export type PlanarityWitness = {
  type: 'K5' | 'K3,3';
  vertices: VertexId[];
  edges: EdgeId[];
};

export type PlanarityOptions = {
  treatDirectedAsUndirected?: boolean;
  allowSelfLoops?: 'reject' | 'ignore';
  backend?: 'auto' | 'wasm' | 'ts';
  maxTsVertices?: number;
};

export type PlanarityMeta = {
  ignoredSelfLoops?: EdgeId[];
  treatedDirectedAsUndirected?: boolean;
};

export type PlanarityResult =
  | ({ planar: true; embedding: RotationSystem } & PlanarityMeta)
  | ({ planar: false; witness: PlanarityWitness } & PlanarityMeta);

const EMBEDFLAGS_PLANAR = 1;
const OK = 1;
const NONEMBEDDABLE = -1;

const toPlanarityEdges = (edges: ReturnType<Graph['edges']>): PlanarityEdgeSpec[] => {
  return edges.map((edge) => ({ id: edge.id, u: edge.u, v: edge.v }));
};

// Lay each parallel edge directly beside its representative so every bundle
// bounds empty digon faces: after the representative at its first endpoint,
// before it at the other.
const insertParallelEdges = (
  order: RotationSystem['order'],
  parallels: Map<EdgeId, { u: VertexId; v: VertexId; ids: EdgeId[] }>,
) => {
  parallels.forEach(({ u, v, ids }, rep) => {
    const atU = order[u] ?? [];
    const atV = order[v] ?? [];
    const iu = atU.findIndex((entry) => entry.edge === rep);
    const iv = atV.findIndex((entry) => entry.edge === rep);
    if (iu < 0 || iv < 0) throw new Error(`Planarity embedding is missing edge ${rep}.`);
    atU.splice(iu + 1, 0, ...ids.map((edge) => ({ edge, to: v })));
    atV.splice(iv, 0, ...ids.slice().reverse().map((edge) => ({ edge, to: u })));
  });
};

export function testPlanarity(graph: Graph, options: PlanarityOptions = {}): PlanarityResult {
  assertGraph(graph, 'testPlanarity');
  const n = graph.vertexCount();
  const edges = graph.edges();
  const treatDirected = options.treatDirectedAsUndirected ?? true;
  const allowSelfLoops = options.allowSelfLoops ?? 'ignore';
  const backend = options.backend ?? 'auto';
  const maxTsVertices = options.maxTsVertices ?? 250;
  const ignoredSelfLoops: EdgeId[] = [];
  const loopsByVertex: EdgeId[][] = Array.from({ length: n }, () => []);
  let included: typeof edges = [];

  if (n === 0) {
    return { planar: true, embedding: { order: [] } };
  }

  for (const edge of edges) {
    if (edge.u === edge.v) {
      if (allowSelfLoops === 'ignore') {
        ignoredSelfLoops.push(edge.id);
        loopsByVertex[edge.u]?.push(edge.id);
        continue;
      }
      throw new Error('Planarity test does not support self-loops.');
    }
    if (edge.directed && !treatDirected) {
      throw new Error('Planarity test requires an undirected graph.');
    }
    included.push(edge);
  }

  // Parallel edges never change planarity, and neither core accepts them (the
  // native core does not terminate, the LR core rejects planar multigraphs), so
  // test the underlying simple graph and re-insert the bundles afterwards.
  const parallels = new Map<EdgeId, { u: VertexId; v: VertexId; ids: EdgeId[] }>();
  const representative = new Map<string, EdgeId>();
  included = included.filter((edge) => {
    const key = edge.u < edge.v ? `${edge.u}:${edge.v}` : `${edge.v}:${edge.u}`;
    const rep = representative.get(key);
    if (rep === undefined) {
      representative.set(key, edge.id);
      return true;
    }
    const bundle = parallels.get(rep) ?? { u: edge.u, v: edge.v, ids: [] };
    bundle.ids.push(edge.id);
    parallels.set(rep, bundle);
    return false;
  });
  const edgeMap: EdgeId[] = included.map((edge) => edge.id);

  if (included.length === 0) {
    const order: RotationSystem['order'] = Array.from({ length: n }, () => []);
    loopsByVertex.forEach((loops, v) => {
      if (!loops.length) return;
      loops.sort((a, b) => a - b);
      for (const edgeId of loops) {
        order[v]?.push({ edge: edgeId, to: v });
        order[v]?.push({ edge: edgeId, to: v });
      }
    });
    const meta: PlanarityMeta = {};
    if (ignoredSelfLoops.length) meta.ignoredSelfLoops = ignoredSelfLoops;
    if (treatDirected) meta.treatedDirectedAsUndirected = true;
    return { planar: true, embedding: { order }, ...meta };
  }

  const meta: PlanarityMeta = {};
  if (ignoredSelfLoops.length) meta.ignoredSelfLoops = ignoredSelfLoops;
  if (treatDirected) meta.treatedDirectedAsUndirected = true;

  const planarityEdges = toPlanarityEdges(included);
  const useTs =
    backend === 'ts' ||
    (backend === 'auto' &&
      (typeof WebAssembly === 'undefined' || n <= Math.max(1, maxTsVertices)));

  if (useTs) {
    const embedding = planarityLeftRight(n, planarityEdges);
    if (embedding) {
      insertParallelEdges(embedding.order, parallels);
      loopsByVertex.forEach((loops, v) => {
        if (!loops.length) return;
        loops.sort((a, b) => a - b);
        const list = embedding.order[v] ?? [];
        for (const edgeId of loops) {
          list.push({ edge: edgeId, to: v });
          list.push({ edge: edgeId, to: v });
        }
        embedding.order[v] = list;
      });
      return { planar: true, embedding, ...meta };
    }
    const witness = planarityWitness(n, planarityEdges);
    return { planar: false, witness, ...meta };
  }

  const wasm = getPlanarityWasm();
  const uPtr = allocInt32Ptr(wasm, included.length);
  const vPtr = allocInt32Ptr(wasm, included.length);
  const uView = viewInt32(wasm, uPtr, included.length);
  const vView = viewInt32(wasm, vPtr, included.length);

  for (let i = 0; i < included.length; i += 1) {
    const edge = included[i];
    if (!edge) continue;
    uView[i] = edge.u;
    vView[i] = edge.v;
  }

  const edgeBuckets: Array<Map<VertexId, EdgeId[]>> = Array.from({ length: n }, () => new Map());
  for (const edge of included) {
    const addEdge = (u: VertexId, v: VertexId, id: EdgeId) => {
      const bucket = edgeBuckets[u]?.get(v) ?? [];
      bucket.push(id);
      edgeBuckets[u]?.set(v, bucket);
    };
    addEdge(edge.u, edge.v, edge.id);
    addEdge(edge.v, edge.u, edge.id);
  }
  edgeBuckets.forEach((map) => {
    map.forEach((bucket, key) => {
      bucket.sort((a, b) => a - b);
      map.set(key, bucket);
    });
  });

  let result: PlanarityResult;
  try {
    const embedResult = wasm.tl_planarity_run(n, included.length, uPtr, vPtr, EMBEDFLAGS_PLANAR);
    if (embedResult === OK) {
      const rotationSize = wasm.tl_planarity_rotation_size();
      const offsetsPtr = allocInt32Ptr(wasm, n + 1);
      const edgePtr = allocInt32Ptr(wasm, rotationSize);
      const neighborPtr = allocInt32Ptr(wasm, rotationSize);
      const offsetsView = viewInt32(wasm, offsetsPtr, n + 1);
      try {
        wasm.tl_planarity_write_rotation(offsetsPtr, edgePtr, neighborPtr);
        const offsets = Array.from(offsetsView);
        const neighborView = viewInt32(wasm, neighborPtr, rotationSize);
        const order: RotationSystem['order'] = Array.from({ length: n }, () => []);

        for (let v = 0; v < n; v += 1) {
          const start = offsets[v] ?? 0;
          const end = offsets[v + 1] ?? start;
          const list = order[v];
          for (let idx = start; idx < end; idx += 1) {
            const to = neighborView[idx] as VertexId;
            const bucket = edgeBuckets[v]?.get(to);
            if (!bucket || bucket.length === 0) {
              throw new Error(`Planarity core returned invalid neighbor ${to} for vertex ${v}.`);
            }
            const edgeId = bucket.shift() as EdgeId;
            list?.push({ edge: edgeId, to });
          }
        }
        insertParallelEdges(order, parallels);
        loopsByVertex.forEach((loops, v) => {
          if (!loops.length) return;
          loops.sort((a, b) => a - b);
          const list = order[v] ?? [];
          for (const edgeId of loops) {
            list.push({ edge: edgeId, to: v });
            list.push({ edge: edgeId, to: v });
          }
          order[v] = list;
        });
        result = { planar: true, embedding: { order }, ...meta };
      } finally {
        wasm.free(offsetsPtr);
        wasm.free(edgePtr);
        wasm.free(neighborPtr);
      }
    } else if (embedResult === NONEMBEDDABLE) {
      const edgeCount = wasm.tl_planarity_witness_edge_count();
      const vertexCount = wasm.tl_planarity_witness_vertex_count();
      const witnessType = wasm.tl_planarity_witness_type();

      const edgePtr = allocInt32Ptr(wasm, edgeCount);
      const vertexPtr = allocInt32Ptr(wasm, vertexCount);
      const edgeView = viewInt32(wasm, edgePtr, edgeCount);
      const vertexView = viewInt32(wasm, vertexPtr, vertexCount);

      try {
        wasm.tl_planarity_write_witness_edges(edgePtr);
        wasm.tl_planarity_write_witness_vertices(vertexPtr);

        const edgesOut = Array.from(edgeView)
          .filter((id) => id >= 0)
          .map((idx) => edgeMap[idx] ?? -1)
          .filter((id) => id >= 0) as EdgeId[];
        const verticesOut = Array.from(vertexView).filter((id) => id >= 0) as VertexId[];

        result = {
          planar: false,
          witness: {
            type: witnessType === 5 ? 'K5' : 'K3,3',
            vertices: verticesOut,
            edges: edgesOut,
          },
          ...meta,
        };
      } finally {
        wasm.free(edgePtr);
        wasm.free(vertexPtr);
      }
    } else {
      throw new Error('Planarity test failed in native core.');
    }
  } finally {
    wasm.free(uPtr);
    wasm.free(vPtr);
    wasm.tl_planarity_free();
  }

  return result;
}
