import { GraphBuilder } from '@khalidsaidi/topoloom/graph';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { buildHalfEdgeMesh } from '@khalidsaidi/topoloom/embedding';
import { orthogonalLayout, planarizationLayout, planarStraightLine } from '@khalidsaidi/topoloom/layout';
import { biconnectedComponents } from '@khalidsaidi/topoloom/dfs';
import { spqrDecomposeSafe } from '@khalidsaidi/topoloom/decomp';

import type { DatasetMode } from '@/data/datasets';
import type { WorkerComputePayload, WorkerPartial, WorkerResult, WorkerStage } from '@/lib/workerClient';

const HARD_NODE_CAP = 350;
const HARD_EDGE_CAP = 1200;
const COORD_LIMIT = 1e7;

type ComputeRequestMessage = {
  type: 'compute';
  requestId: string;
  payload: WorkerComputePayload;
};

type CancelRequestMessage = {
  type: 'cancel';
  requestId: string;
};

type WorkerRequestMessage = ComputeRequestMessage | CancelRequestMessage;

type WorkerResponseMessage =
  | {
      type: 'progress';
      requestId: string;
      stage: WorkerStage;
      detail?: string;
    }
  | {
      type: 'partial';
      requestId: string;
      partial: WorkerPartial;
    }
  | {
      type: 'result';
      requestId: string;
      result: WorkerResult;
    }
  | {
      type: 'error';
      requestId: string;
      error: { stage?: string; message: string; stack?: string };
    };

type SampleResult = {
  nodes: string[];
  edges: Array<[number, number]>;
  selectedOriginalNodeIndices: number[];
  components: number;
  maxDegree: number;
};

const cancelledRequests = new Set<string>();

const clampCoordinate = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  if (value > COORD_LIMIT) return COORD_LIMIT;
  if (value < -COORD_LIMIT) return -COORD_LIMIT;
  return value;
};

const normalizeEdge = (u: number, v: number): [number, number] => (u < v ? [u, v] : [v, u]);

const sortEdgeLex = (a: [number, number], b: [number, number]) => {
  if (a[0] !== b[0]) return a[0] - b[0];
  return a[1] - b[1];
};

function buildAdjacency(nodeCount: number, edges: Array<[number, number]>) {
  const adjacency = Array.from({ length: nodeCount }, () => [] as number[]);
  for (const [u, v] of edges) {
    if (u < 0 || v < 0 || u >= nodeCount || v >= nodeCount || u === v) continue;
    adjacency[u].push(v);
    adjacency[v].push(u);
  }
  for (const list of adjacency) {
    list.sort((a, b) => a - b);
  }
  return adjacency;
}

function computeComponentAndDegreeStats(adjacency: number[][]) {
  const visited = new Array(adjacency.length).fill(false);
  let components = 0;
  let maxDegree = 0;

  for (let i = 0; i < adjacency.length; i += 1) {
    maxDegree = Math.max(maxDegree, adjacency[i]?.length ?? 0);
    if (visited[i]) continue;
    components += 1;
    const queue = [i];
    visited[i] = true;

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) continue;
      for (const next of adjacency[current] ?? []) {
        if (visited[next]) continue;
        visited[next] = true;
        queue.push(next);
      }
    }
  }

  return { components, maxDegree };
}

function deterministicSample(
  nodes: string[],
  edges: Array<[number, number]>,
  seed: number,
  maxNodes: number,
  maxEdges: number,
  onVisitBatch?: (visitedNodeIds: number[]) => void,
): SampleResult {
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      selectedOriginalNodeIndices: [],
      components: 0,
      maxDegree: 0,
    };
  }

  const nodeCap = Math.max(1, Math.min(HARD_NODE_CAP, Math.floor(maxNodes), nodes.length));
  const edgeCap = Math.max(1, Math.min(HARD_EDGE_CAP, Math.floor(maxEdges)));
  const adjacency = buildAdjacency(nodes.length, edges);
  const start = ((Math.trunc(seed) % nodes.length) + nodes.length) % nodes.length;

  const visited = new Set<number>([start]);
  const queue = [start];
  const visitedOrder = [start];
  const batchSize = 24;

  onVisitBatch?.([start]);

  while (queue.length > 0 && visited.size < nodeCap) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const next of adjacency[current] ?? []) {
      if (visited.size >= nodeCap) break;
      if (visited.has(next)) continue;
      visited.add(next);
      queue.push(next);
      visitedOrder.push(next);
      if (visitedOrder.length % batchSize === 0) {
        onVisitBatch?.([...visitedOrder]);
      }
    }
  }

  if (visitedOrder.length % batchSize !== 0) {
    onVisitBatch?.([...visitedOrder]);
  }

  const selectedOriginalNodeIndices = [...visited].sort((a, b) => a - b);
  const selectedSet = new Set(selectedOriginalNodeIndices);
  const remap = new Map<number, number>();
  selectedOriginalNodeIndices.forEach((originalIndex, idx) => {
    remap.set(originalIndex, idx);
  });

  const sampledNodes = selectedOriginalNodeIndices.map((originalIndex) => nodes[originalIndex] ?? String(originalIndex));

  const dedupe = new Set<string>();
  let sampledEdges: Array<[number, number]> = [];

  for (const [u, v] of edges) {
    if (!selectedSet.has(u) || !selectedSet.has(v)) continue;
    const su = remap.get(u);
    const sv = remap.get(v);
    if (su === undefined || sv === undefined || su === sv) continue;
    const [a, b] = normalizeEdge(su, sv);
    const key = `${a},${b}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    sampledEdges.push([a, b]);
  }

  sampledEdges.sort(sortEdgeLex);
  if (sampledEdges.length > edgeCap) {
    sampledEdges = sampledEdges.slice(0, edgeCap);
  }

  const sampledAdj = buildAdjacency(sampledNodes.length, sampledEdges);
  const stats = computeComponentAndDegreeStats(sampledAdj);

  return {
    nodes: sampledNodes,
    edges: sampledEdges,
    selectedOriginalNodeIndices,
    components: stats.components,
    maxDegree: stats.maxDegree,
  };
}

function checkCancelled(requestId: string) {
  if (cancelledRequests.has(requestId)) {
    const err = new Error('Computation cancelled');
    err.name = 'TopoloomWorkerCancelled';
    throw err;
  }
}

function postMessageSafe(message: WorkerResponseMessage) {
  const maybeWorker = globalThis as unknown as { postMessage?: (value: unknown) => void };
  if (typeof maybeWorker.postMessage === 'function') {
    maybeWorker.postMessage(message);
  }
}

function postProgress(requestId: string, stage: WorkerStage, detail?: string) {
  postMessageSafe({ type: 'progress', requestId, stage, detail });
}

function postPartial(requestId: string, partial: WorkerPartial) {
  postMessageSafe({ type: 'partial', requestId, partial });
}

function mapWitnessKind(kind: string | undefined): 'K5' | 'K33' | 'unknown' {
  if (kind === 'K5') return 'K5';
  if (kind === 'K3,3') return 'K33';
  return 'unknown';
}

function serializeLayout(
  layoutResult: {
    positions: Map<number, { x: number; y: number }>;
    edges: Array<{ edge: number; points: Array<{ x: number; y: number }> }>;
    stats: { bends?: number; crossings?: number };
  },
  sampledEdges: Array<[number, number]>,
  mode: string,
) {
  const positions: Array<[number, { x: number; y: number }]> = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [vertexId, point] of layoutResult.positions.entries()) {
    const x = clampCoordinate(point.x);
    const y = clampCoordinate(point.y);
    positions.push([vertexId, { x, y }]);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  positions.sort((a, b) => a[0] - b[0]);

  const edgeRoutes: Array<{ edge: [number, number]; points: Array<{ x: number; y: number }> }> = [];

  for (const route of layoutResult.edges) {
    const endpoints = sampledEdges[route.edge] ?? [0, 0];
    const points = route.points.map((p) => ({ x: clampCoordinate(p.x), y: clampCoordinate(p.y) }));
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    edgeRoutes.push({ edge: [endpoints[0], endpoints[1]], points });
  }

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  if (!Number.isFinite(maxY)) maxY = 0;

  return {
    mode,
    crossings: Math.max(0, Number(layoutResult.stats.crossings ?? 0)),
    bends: Math.max(0, Number(layoutResult.stats.bends ?? 0)),
    positions,
    edgeRoutes,
    bbox: {
      minX,
      minY,
      maxX,
      maxY,
    },
  };
}

function computeSpqrSummary(sampledGraph: ReturnType<GraphBuilder['build']>) {
  try {
    const safe = spqrDecomposeSafe(sampledGraph, {
      block: 'largest',
      treatDirectedAsUndirected: true,
      allowSelfLoops: 'ignore',
    });

    const counts = { S: 0, P: 0, R: 0, Q: 0 };
    for (const node of safe.tree.nodes) {
      if (node.type in counts) {
        counts[node.type] += 1;
      }
    }

    return {
      nodes: safe.tree.nodes.length,
      counts,
    };
  } catch {
    return undefined;
  }
}

function resolveMode(mode: DatasetMode, isPlanar: boolean): DatasetMode {
  if (mode === 'planar-straight' && !isPlanar) return 'planarization-straight';
  if (mode === 'orthogonal' && !isPlanar) return 'planarization-orthogonal';
  if (mode === 'planarization-straight' && isPlanar) return 'planar-straight';
  if (mode === 'planarization-orthogonal' && isPlanar) return 'orthogonal';
  return mode;
}

export async function computeWorkerResult(
  requestId: string,
  payload: WorkerComputePayload,
): Promise<WorkerResult> {
  const timingsMs: Record<string, number> = {};
  const mark = () => performance.now();

  const trackStage = async <T>(
    stage: WorkerStage,
    detail: string,
    fn: () => Promise<T> | T,
  ): Promise<T> => {
    postProgress(requestId, stage, detail);
    const start = mark();
    checkCancelled(requestId);
    const value = await fn();
    checkCancelled(requestId);
    timingsMs[stage] = Math.round((timingsMs[stage] ?? 0) + (mark() - start));
    return value;
  };

  const sampled = await trackStage('sample', 'deterministic BFS sampling', () => {
    return deterministicSample(
      payload.nodes,
      payload.edges,
      payload.settings.seed,
      payload.settings.maxNodes,
      payload.settings.maxEdges,
      (visitedNodeIds) => {
        checkCancelled(requestId);
        postPartial(requestId, {
          kind: 'sample',
          visited: visitedNodeIds,
        });
      },
    );
  });

  const graphBundle = await trackStage('build-graph', 'constructing TopoLoom graph', () => {
    const builder = new GraphBuilder();
    for (const label of sampled.nodes) {
      builder.addVertex(label);
    }
    for (const [u, v] of sampled.edges) {
      builder.addEdge(u, v, false);
    }
    const graph = builder.build();
    return { graph };
  });

  const planarityResult = await trackStage('planarity', 'running planarity test', () => {
    return testPlanarity(graphBundle.graph, {
      treatDirectedAsUndirected: true,
      allowSelfLoops: 'ignore',
    });
  });

  if (!planarityResult.planar && payload.settings.showWitness) {
    const witnessEdges = [...planarityResult.witness.edges]
      .map((edgeId) => {
        const edge = graphBundle.graph.edge(edgeId);
        return normalizeEdge(edge.u, edge.v);
      })
      .sort(sortEdgeLex);

    postPartial(requestId, {
      kind: 'witness',
      witnessKind: mapWitnessKind(planarityResult.witness.type),
      edges: witnessEdges,
    });
  }

  const embeddingBundle = await trackStage('embedding', 'building embedding + face mesh', () => {
    if (!planarityResult.planar) {
      return {
        mesh: null as ReturnType<typeof buildHalfEdgeMesh> | null,
        faces: undefined as WorkerResult['report']['faces'] | undefined,
      };
    }

    const mesh = buildHalfEdgeMesh(graphBundle.graph, planarityResult.embedding);
    const sizes = mesh.faces.map((cycle) => cycle.length).sort((a, b) => a - b);
    const faces = {
      count: mesh.faces.length,
      sizes,
    };

    postPartial(requestId, {
      kind: 'faces',
      faceSizes: faces.sizes,
    });

    return {
      mesh,
      faces,
    };
  });

  const layoutBundle = await trackStage('layout', 'computing layout', () => {
    const resolvedMode = resolveMode(payload.settings.mode, Boolean(planarityResult.planar));

    if (resolvedMode === 'planar-straight') {
      if (!embeddingBundle.mesh) {
        throw new Error('Planar straight-line layout requires planar embedding.');
      }
      const layout = planarStraightLine(embeddingBundle.mesh);
      return {
        mode: resolvedMode,
        layout,
      };
    }

    if (resolvedMode === 'orthogonal') {
      if (!embeddingBundle.mesh) {
        throw new Error('Orthogonal layout requires planar embedding.');
      }
      const layout = orthogonalLayout(embeddingBundle.mesh);
      return {
        mode: resolvedMode,
        layout,
      };
    }

    if (resolvedMode === 'planarization-straight') {
      const planarized = planarizationLayout(graphBundle.graph, { mode: 'straight' });
      return {
        mode: resolvedMode,
        layout: planarized.layout,
      };
    }

    const planarized = planarizationLayout(graphBundle.graph, { mode: 'orthogonal' });
    return {
      mode: resolvedMode,
      layout: planarized.layout,
    };
  });

  postPartial(requestId, {
    kind: 'layoutTarget',
    positions: [...layoutBundle.layout.positions.entries()]
      .map(([id, point]) => [id, clampCoordinate(point.x), clampCoordinate(point.y)] as [number, number, number])
      .sort((a, b) => a[0] - b[0]),
  });

  const reportBundle = await trackStage('report', 'collecting report-card metrics', () => {
    const bcc = biconnectedComponents(graphBundle.graph, {
      treatDirectedAsUndirected: true,
      allowSelfLoops: 'ignore',
    });

    const articulationPoints = [...bcc.articulationPoints].sort((a, b) => a - b);
    const bridges = [...bcc.bridges]
      .map((edgeId) => {
        const edge = graphBundle.graph.edge(edgeId);
        return normalizeEdge(edge.u, edge.v);
      })
      .sort(sortEdgeLex);

    const witnessEdges = !planarityResult.planar
      ? planarityResult.witness.edges
          .map((edgeId) => {
            const edge = graphBundle.graph.edge(edgeId);
            return normalizeEdge(edge.u, edge.v);
          })
          .sort(sortEdgeLex)
      : undefined;

    const spqr = computeSpqrSummary(graphBundle.graph);

    return {
      biconnected: {
        blocks: bcc.blocks.length,
        articulationPoints: articulationPoints.length,
        bridges: bridges.length,
      },
      articulationPoints,
      bridges,
      witnessEdges,
      spqr,
    };
  });

  const serialized = await trackStage('serialize', 'serializing output payload', () => {
    const layout = serializeLayout(layoutBundle.layout, sampled.edges, layoutBundle.mode);

    const witness = !planarityResult.planar && payload.settings.showWitness
      ? {
          kind: mapWitnessKind(planarityResult.witness.type),
          edgePairs: (reportBundle.witnessEdges ?? []).map(
            (edge) => [edge[0], edge[1]] as [number, number],
          ),
          edgeIds: [...planarityResult.witness.edges].sort((a, b) => a - b),
        }
      : undefined;

    const result: WorkerResult = {
      timingsMs,
      sampledGraph: {
        nodes: sampled.nodes,
        edges: sampled.edges,
        originalNodeIndices: sampled.selectedOriginalNodeIndices,
      },
      sampledStats: {
        nodes: sampled.nodes.length,
        edges: sampled.edges.length,
        components: sampled.components,
        maxDegree: sampled.maxDegree,
      },
      planarity: {
        isPlanar: Boolean(planarityResult.planar),
        ...(witness ? { witness } : {}),
        embeddingAvailable: Boolean(embeddingBundle.mesh),
      },
      report: {
        ...(embeddingBundle.faces ? { faces: embeddingBundle.faces } : {}),
        biconnected: reportBundle.biconnected,
        ...(reportBundle.spqr ? { spqr: reportBundle.spqr } : {}),
      },
      layout,
      highlights: {
        ...(payload.settings.showWitness && reportBundle.witnessEdges
          ? { witnessEdges: reportBundle.witnessEdges }
          : {}),
        articulationPoints: reportBundle.articulationPoints,
        bridges: reportBundle.bridges,
      },
    };

    return result;
  });

  return serialized;
}

async function onWorkerMessage(event: MessageEvent<WorkerRequestMessage>) {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'cancel') {
    cancelledRequests.add(message.requestId);
    return;
  }

  if (message.type !== 'compute') return;

  try {
    const result = await computeWorkerResult(message.requestId, message.payload);
    cancelledRequests.delete(message.requestId);
    postMessageSafe({
      type: 'result',
      requestId: message.requestId,
      result,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    if (err.name === 'TopoloomWorkerCancelled') {
      cancelledRequests.delete(message.requestId);
      postMessageSafe({
        type: 'error',
        requestId: message.requestId,
        error: {
          message: 'Computation cancelled',
        },
      });
      return;
    }

    cancelledRequests.delete(message.requestId);
    postMessageSafe({
      type: 'error',
      requestId: message.requestId,
      error: {
        message: err.message,
        stack: err.stack,
      },
    });
  }
}

if (typeof self !== 'undefined' && 'addEventListener' in self) {
  self.addEventListener('message', (event) => {
    void onWorkerMessage(event as MessageEvent<WorkerRequestMessage>);
  });
}
