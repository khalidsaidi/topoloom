import type { EdgeId, Graph, VertexId } from '../graph';
import type { RotationSystem } from '../embedding';
import { allocInt32Ptr, getPlanarityWasm, viewInt32 } from './wasm';

export type PlanarityWitness = {
  type: 'K5' | 'K3,3';
  vertices: VertexId[];
  edges: EdgeId[];
};

export type PlanarityResult =
  | { planar: true; embedding: RotationSystem }
  | { planar: false; witness: PlanarityWitness };

const EMBEDFLAGS_PLANAR = 1;
const OK = 1;
const NONEMBEDDABLE = -1;

export function testPlanarity(graph: Graph): PlanarityResult {
  const n = graph.vertexCount();
  const edges = graph.edges();

  if (n === 0) {
    return { planar: true, embedding: { order: [] } };
  }

  for (const edge of edges) {
    if (edge.directed) {
      throw new Error('Planarity test requires an undirected graph.');
    }
    if (edge.u === edge.v) {
      throw new Error('Planarity test does not support self-loops.');
    }
  }

  const wasm = getPlanarityWasm();
  const uPtr = allocInt32Ptr(wasm, edges.length);
  const vPtr = allocInt32Ptr(wasm, edges.length);
  const uView = viewInt32(wasm, uPtr, edges.length);
  const vView = viewInt32(wasm, vPtr, edges.length);

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (!edge) continue;
    uView[i] = edge.u;
    vView[i] = edge.v;
  }

  let result: PlanarityResult;
  try {
    const embedResult = wasm.tl_planarity_run(n, edges.length, uPtr, vPtr, EMBEDFLAGS_PLANAR);
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
          const edgeBuckets = new Map<VertexId, EdgeId[]>();
          for (const adj of graph.adjacency(v)) {
            if (adj.dir !== 'undirected') continue;
            const bucket = edgeBuckets.get(adj.to) ?? [];
            bucket.push(adj.edge);
            edgeBuckets.set(adj.to, bucket);
          }
          edgeBuckets.forEach((bucket) => bucket.sort((a, b) => a - b));
          for (let idx = start; idx < end; idx += 1) {
            const to = neighborView[idx] as VertexId;
            const bucket = edgeBuckets.get(to);
            if (!bucket || bucket.length === 0) {
              throw new Error(`Planarity core returned invalid neighbor ${to} for vertex ${v}.`);
            }
            const edgeId = bucket.shift() as EdgeId;
            list?.push({ edge: edgeId, to });
          }
        }
        result = { planar: true, embedding: { order } };
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

        const edgesOut = Array.from(edgeView).filter((id) => id >= 0) as EdgeId[];
        const verticesOut = Array.from(vertexView).filter((id) => id >= 0) as VertexId[];

        result = {
          planar: false,
          witness: {
            type: witnessType === 5 ? 'K5' : 'K3,3',
            vertices: verticesOut,
            edges: edgesOut,
          },
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
