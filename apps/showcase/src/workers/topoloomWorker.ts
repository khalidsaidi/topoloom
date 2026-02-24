import { GraphBuilder } from '@khalidsaidi/topoloom/graph';
import { testPlanarity } from '@khalidsaidi/topoloom/planarity';
import { buildHalfEdgeMesh, type RotationSystem } from '@khalidsaidi/topoloom/embedding';
import { orthogonalLayout, planarStraightLine, planarizationLayout } from '@khalidsaidi/topoloom/layout';
import { biconnectedComponents } from '@khalidsaidi/topoloom/dfs';
import { spqrDecomposeSafe } from '@khalidsaidi/topoloom/decomp';

import type { DatasetMode } from '@/data/datasets';
import type {
  BoundarySelection,
  WorkerComputePayload,
  WorkerPartial,
  WorkerResult,
  WorkerStage,
} from '@/lib/workerClient';

const HARD_NODE_CAP = 350;
const HARD_EDGE_CAP = 1200;
const COORD_LIMIT = 1e7;
const MIN_SOLVER_STAGE_MS = 2200;

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

type Point = { x: number; y: number };

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

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const fract = (value: number) => value - Math.floor(value);

function deterministicHairballPoint(datasetId: string, sampleId: string, seed: number, id: number, n: number): Point {
  const key = `${datasetId}:${sampleId}:${seed}:${id}`;
  const h = hash32(key) / 4294967296;
  const h2 = hash32(`${key}:j`) / 4294967296;
  const radiusMax = 260 + Math.sqrt(Math.max(1, n)) * 18;
  const angle = Math.PI * 2 * fract(h);
  const radius = Math.pow(fract(h * 1.7), 0.35) * radiusMax;
  const jitterAngle = Math.PI * 2 * fract(h2 * 1.13);
  const jitterMag = 7 + fract(h2 * 3.7) * 11;
  return {
    x: Math.cos(angle) * radius + Math.cos(jitterAngle) * jitterMag,
    y: Math.sin(angle) * radius + Math.sin(jitterAngle) * jitterMag,
  };
}

function uniqueCycle(vertices: number[]) {
  const cycle: number[] = [];
  for (const vertex of vertices) {
    if (cycle.length === 0 || cycle[cycle.length - 1] !== vertex) cycle.push(vertex);
  }
  if (cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]) cycle.pop();
  return cycle;
}

function getFaceBoundary(mesh: ReturnType<typeof buildHalfEdgeMesh>, faceId: number): number[] {
  const cycle = mesh.faces[faceId] ?? [];
  return uniqueCycle(cycle.map((halfEdge) => mesh.origin[halfEdge] ?? 0));
}

function chooseBoundaryFace(
  mesh: ReturnType<typeof buildHalfEdgeMesh>,
  strategy: BoundarySelection,
): number {
  if (mesh.faces.length === 0) return 0;

  const vertexCount = Math.max(0, ...mesh.origin) + 1;
  const target = Math.max(3, Math.min(90, Math.max(18, Math.round(4 * Math.sqrt(Math.max(1, vertexCount))))));
  const low = Math.max(3, Math.floor(Math.min(20, vertexCount / 6)));
  const high = Math.max(low, Math.floor(Math.min(80, vertexCount / 2)));

  const candidates = mesh.faces
    .map((_, faceId) => ({
      faceId,
      len: getFaceBoundary(mesh, faceId).length,
    }))
    .filter((candidate) => candidate.len >= 3);

  if (candidates.length === 0) return 0;

  if (strategy === 'largest') {
    return candidates.reduce((best, next) => (next.len > best.len ? next : best)).faceId;
  }

  if (strategy === 'small') {
    return candidates.reduce((best, next) => (next.len < best.len ? next : best)).faceId;
  }

  const closestToTarget = (items: typeof candidates, applyHugePenalty: boolean) => {
    return items
      .slice()
      .sort((a, b) => {
        const hugeA = applyHugePenalty && a.len > high ? (a.len - high) * 2.4 : 0;
        const hugeB = applyHugePenalty && b.len > high ? (b.len - high) * 2.4 : 0;
        const da = Math.abs(a.len - target) + hugeA;
        const db = Math.abs(b.len - target) + hugeB;
        if (da !== db) return da - db;
        if (a.len !== b.len) return a.len - b.len;
        return a.faceId - b.faceId;
      })[0]!.faceId;
  };

  if (strategy === 'medium') {
    return closestToTarget(candidates, false);
  }

  const preferred = candidates.filter((candidate) => candidate.len >= low && candidate.len <= high);
  if (preferred.length > 0) return closestToTarget(preferred, true);
  const antiRing = candidates.filter((candidate) => candidate.len <= Math.max(high, Math.round(target * 1.35)));
  return closestToTarget(antiRing.length > 0 ? antiRing : candidates, true);
}

type GeographicCoords = {
  x: number[];
  y: number[];
};

function buildSampledGeographic(geo: WorkerComputePayload['geographic'], sampled: SampleResult): GeographicCoords | null {
  if (!geo) return null;
  if (!Array.isArray(geo.x) || !Array.isArray(geo.y)) return null;
  if (geo.x.length !== geo.y.length || geo.x.length === 0) return null;
  if (geo.x.length < Math.max(...sampled.selectedOriginalNodeIndices, 0) + 1) return null;

  const x = sampled.selectedOriginalNodeIndices.map((originalId) => clampCoordinate(geo.x[originalId] ?? 0));
  const y = sampled.selectedOriginalNodeIndices.map((originalId) => clampCoordinate(geo.y[originalId] ?? 0));
  return { x, y };
}

function buildGeoBoundaryPlacement(boundary: number[], geo: GeographicCoords): Map<number, Point> | null {
  if (boundary.length < 3) return null;
  const coords = boundary.map((id) => ({
    x: geo.x[id] ?? 0,
    y: geo.y[id] ?? 0,
  }));

  let meanX = 0;
  let meanY = 0;
  for (const p of coords) {
    meanX += p.x;
    meanY += p.y;
  }
  meanX /= coords.length;
  meanY /= coords.length;

  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (const p of coords) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  cxx /= Math.max(1, coords.length - 1);
  cxy /= Math.max(1, coords.length - 1);
  cyy /= Math.max(1, coords.length - 1);

  const trace = cxx + cyy;
  const delta = Math.sqrt(Math.max(0, (cxx - cyy) * (cxx - cyy) + 4 * cxy * cxy));
  const lambda1 = Math.max(1e-6, (trace + delta) / 2);
  const lambda2 = Math.max(1e-6, (trace - delta) / 2);
  const ratio = Math.max(0.35, Math.min(0.95, Math.sqrt(lambda2 / lambda1)));
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const e1 = { x: Math.cos(angle), y: Math.sin(angle) };
  const e2 = { x: -Math.sin(angle), y: Math.cos(angle) };

  const cumulative = new Array<number>(boundary.length).fill(0);
  let perimeter = 0;
  for (let i = 1; i < boundary.length; i += 1) {
    const p1 = coords[i - 1]!;
    const p2 = coords[i]!;
    perimeter += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    cumulative[i] = perimeter;
  }
  const closing = Math.hypot(coords[0]!.x - coords[coords.length - 1]!.x, coords[0]!.y - coords[coords.length - 1]!.y);
  perimeter += closing;
  if (perimeter <= 1e-6) return null;

  const baseRadius = Math.max(120, boundary.length * 8);
  const a = baseRadius;
  const b = baseRadius * ratio;
  const placement = new Map<number, Point>();
  for (let i = 0; i < boundary.length; i += 1) {
    const t = cumulative[i]! / perimeter;
    const theta = t * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    placement.set(boundary[i]!, {
      x: a * cos * e1.x + b * sin * e2.x,
      y: a * cos * e1.y + b * sin * e2.y,
    });
  }
  return placement;
}

function buildCircleBoundaryPlacement(boundary: number[], nodeCount: number): Map<number, Point> {
  const placement = new Map<number, Point>();
  const radius = Math.max(120, boundary.length * 10 + Math.sqrt(Math.max(1, nodeCount)) * 10);
  boundary.forEach((vertex, index) => {
    const angle = (index / Math.max(1, boundary.length)) * Math.PI * 2;
    placement.set(vertex, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  });
  return placement;
}

function segmentCross(a: Point, b: Point, c: Point, d: Point) {
  const orient = (p: Point, q: Point, r: Point) => {
    const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(value) < 1e-9) return 0;
    return value > 0 ? 1 : 2;
  };
  const onSeg = (p: Point, q: Point, r: Point) =>
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x + 1e-9 >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y + 1e-9 >= Math.min(p.y, r.y);

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(a, c, b)) return true;
  if (o2 === 0 && onSeg(a, d, b)) return true;
  if (o3 === 0 && onSeg(c, a, d)) return true;
  if (o4 === 0 && onSeg(c, b, d)) return true;
  return false;
}

function countDrawingCrossings(positions: Point[], edges: Array<[number, number]>) {
  let count = 0;
  for (let i = 0; i < edges.length; i += 1) {
    const [u1, v1] = edges[i]!;
    const a = positions[u1];
    const b = positions[v1];
    if (!a || !b) continue;
    for (let j = i + 1; j < edges.length; j += 1) {
      const [u2, v2] = edges[j]!;
      if (u1 === u2 || u1 === v2 || v1 === u2 || v1 === v2) continue;
      const c = positions[u2];
      const d = positions[v2];
      if (!c || !d) continue;
      if (segmentCross(a, b, c, d)) count += 1;
    }
  }
  return count;
}

function buildLayoutFromPositions(
  mesh: ReturnType<typeof buildHalfEdgeMesh>,
  positions: Map<number, Point>,
  drawingCrossings = 0,
) {
  const edges: Array<{ edge: number; points: Point[] }> = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const updateBounds = (point: Point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };

  for (const point of positions.values()) {
    updateBounds(point);
  }

  for (let edgeId = 0; edgeId < mesh.halfEdgeCount / 2; edgeId += 1) {
    const h0 = edgeId * 2;
    const h1 = edgeId * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    const p1 = positions.get(u) ?? { x: 0, y: 0 };
    const p2 = positions.get(v) ?? { x: 0, y: 0 };
    edges.push({
      edge: edgeId,
      points: [p1, p2],
    });
    updateBounds(p1);
    updateBounds(p2);
  }

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  if (!Number.isFinite(maxY)) maxY = 0;

  return {
    positions,
    edges,
    stats: {
      bends: 0,
      area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY),
      crossings: Math.max(0, drawingCrossings),
    },
  };
}

function buildStraightLayoutFromSample(
  sampledEdges: Array<[number, number]>,
  points: Point[],
) {
  const positions = new Map<number, Point>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let id = 0; id < points.length; id += 1) {
    const point = {
      x: clampCoordinate(points[id]?.x ?? 0),
      y: clampCoordinate(points[id]?.y ?? 0),
    };
    positions.set(id, point);
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const edges = sampledEdges.map((edge, edgeId) => {
    const a = positions.get(edge[0]) ?? { x: 0, y: 0 };
    const b = positions.get(edge[1]) ?? { x: 0, y: 0 };
    return {
      edge: edgeId,
      points: [a, b],
    };
  });

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  if (!Number.isFinite(maxY)) maxY = 0;

  return {
    positions,
    edges,
    stats: {
      bends: 0,
      area: Math.max(0, maxX - minX) * Math.max(0, maxY - minY),
      crossings: countDrawingCrossings(points, sampledEdges),
    },
  };
}

function toPositionPartial(positions: Point[]) {
  return positions.map((point, id) => [id, clampCoordinate(point.x), clampCoordinate(point.y)] as [number, number, number]);
}

async function sleepWithCancel(requestId: string, ms: number) {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), ms);
    if (cancelledRequests.has(requestId)) {
      clearTimeout(timer);
      resolve();
    }
  });
  checkCancelled(requestId);
}

async function runRelaxationSolver(args: {
  requestId: string;
  datasetId: string;
  sampleId: string;
  seed: number;
  nodeCount: number;
  adjacency: number[][];
  edges: Array<[number, number]>;
  boundary?: number[];
  boundaryPlacement?: Map<number, Point> | null;
  startPositions?: Point[];
  targetPositions?: Point[];
  targetWeight?: number;
  iterMax: number;
  emitEvery: number;
  metricEvery: number;
  stream: boolean;
}) {
  const {
    requestId,
    datasetId,
    sampleId,
    seed,
    nodeCount,
    adjacency,
    edges,
    boundary: boundaryArg,
    boundaryPlacement,
    startPositions,
    targetPositions,
    targetWeight,
    iterMax,
    emitEvery,
    metricEvery,
    stream,
  } = args;
  const positions = startPositions
    ? startPositions.map((point) => ({ x: point.x, y: point.y }))
    : Array.from({ length: nodeCount }, (_, id) =>
        deterministicHairballPoint(datasetId, sampleId, seed, id, nodeCount),
      );

  const boundary = boundaryArg ?? [];
  const boundarySet = new Set(boundary);
  const placement = boundary.length > 0
    ? (boundaryPlacement ?? buildCircleBoundaryPlacement(boundary, nodeCount))
    : null;
  if (placement) {
    for (const [vertex, point] of placement.entries()) {
      positions[vertex] = { ...point };
    }
  }

  const interior = boundary.length > 0
    ? Array.from({ length: nodeCount }, (_, id) => id).filter((id) => !boundarySet.has(id))
    : Array.from({ length: nodeCount }, (_, id) => id);
  const emitCount = Math.max(1, Math.ceil(iterMax / emitEvery));
  const pacing = stream ? Math.max(0, Math.floor(MIN_SOLVER_STAGE_MS / emitCount) - 2) : 0;
  const targetMix = Math.max(0, Math.min(0.86, targetWeight ?? 0));

  if (stream) {
    postPartial(requestId, {
      kind: 'positions',
      positions: toPositionPartial(positions),
      iter: 0,
    });
  }

  for (let iter = 1; iter <= iterMax; iter += 1) {
    checkCancelled(requestId);
    let residual = 0;
    for (const vertex of interior) {
      const neighbors = adjacency[vertex] ?? [];
      if (neighbors.length === 0) continue;
      let sumX = 0;
      let sumY = 0;
      for (const neighbor of neighbors) {
        const point = positions[neighbor] ?? { x: 0, y: 0 };
        sumX += point.x;
        sumY += point.y;
      }
      const avgX = sumX / neighbors.length;
      const avgY = sumY / neighbors.length;
      const old = positions[vertex]!;
      const target = targetPositions?.[vertex];
      const nextX = (() => {
        if (!target) return old.x * 0.28 + avgX * 0.72;
        const currentWeight = 0.18;
        const neighborWeight = Math.max(0.08, 1 - targetMix - currentWeight);
        const total = currentWeight + neighborWeight + targetMix;
        return (
          old.x * (currentWeight / total) +
          avgX * (neighborWeight / total) +
          target.x * (targetMix / total)
        );
      })();
      const nextY = (() => {
        if (!target) return old.y * 0.28 + avgY * 0.72;
        const currentWeight = 0.18;
        const neighborWeight = Math.max(0.08, 1 - targetMix - currentWeight);
        const total = currentWeight + neighborWeight + targetMix;
        return (
          old.y * (currentWeight / total) +
          avgY * (neighborWeight / total) +
          target.y * (targetMix / total)
        );
      })();
      residual += Math.hypot(nextX - old.x, nextY - old.y);
      positions[vertex] = { x: nextX, y: nextY };
    }

    if (stream && metricEvery > 0 && (iter % metricEvery === 0 || iter === iterMax)) {
      postPartial(requestId, {
        kind: 'metric',
        crossings: countDrawingCrossings(positions, edges),
        residual: interior.length > 0 ? residual / interior.length : 0,
      });
    }

    if (stream && (iter % emitEvery === 0 || iter === iterMax)) {
      postPartial(requestId, {
        kind: 'positions',
        positions: toPositionPartial(positions),
        iter,
      });
      await sleepWithCancel(requestId, pacing);
    }
  }
  return positions.map((point) => ({
    x: clampCoordinate(point.x),
    y: clampCoordinate(point.y),
  }));
}

function buildNodeTargetPositions(
  layoutPositions: Map<number, Point>,
  args: {
    nodeCount: number;
    datasetId: string;
    sampleId: string;
    seed: number;
  },
) {
  const { nodeCount, datasetId, sampleId, seed } = args;
  return Array.from({ length: nodeCount }, (_, id) => {
    const target = layoutPositions.get(id);
    if (target) {
      return {
        x: clampCoordinate(target.x),
        y: clampCoordinate(target.y),
      };
    }
    return deterministicHairballPoint(datasetId, sampleId, seed, id, nodeCount);
  });
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
          kind: 'sampleVisited',
          visited: visitedNodeIds,
        });
      },
    );
  });

  const sampledGeographic = buildSampledGeographic(payload.geographic, sampled);

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

  const embeddingRotation = await trackStage<RotationSystem | null>(
    'embedding',
    'resolving deterministic rotation system',
    () => {
      if (!planarityResult.planar || !('embedding' in planarityResult)) {
        return null;
      }
      return planarityResult.embedding;
    },
  );

  const meshBundle = await trackStage('mesh', 'building half-edge mesh', () => {
    if (!embeddingRotation) {
      return {
        mesh: null as ReturnType<typeof buildHalfEdgeMesh> | null,
        faces: undefined as WorkerResult['report']['faces'] | undefined,
      };
    }
    const mesh = buildHalfEdgeMesh(graphBundle.graph, embeddingRotation);
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

  const layoutBundle = await trackStage('layout', 'computing layout', async () => {
    const resolvedMode = resolveMode(payload.settings.mode, Boolean(planarityResult.planar));
    const liveSolve = payload.settings.liveSolve === true;
    const adjacency = buildAdjacency(sampled.nodes.length, sampled.edges);
    const boundaryStrategy = payload.settings.boundarySelection ?? 'auto';

    if (resolvedMode === 'planar-straight') {
      if (!meshBundle.mesh) {
        throw new Error('Planar straight-line layout requires planar embedding.');
      }
      const faceStrategy = boundaryStrategy === 'geo-shaped' ? 'auto' : boundaryStrategy;
      const faceId = chooseBoundaryFace(meshBundle.mesh, faceStrategy);
      const boundary = getFaceBoundary(meshBundle.mesh, faceId);
      const useGeoBoundary = boundaryStrategy === 'geo-shaped' || (boundaryStrategy === 'auto' && sampledGeographic);
      const geoBoundaryPlacement = useGeoBoundary && sampledGeographic
        ? buildGeoBoundaryPlacement(boundary, sampledGeographic)
        : null;
      const streamed = await runRelaxationSolver({
        requestId,
        datasetId: payload.datasetId,
        sampleId: payload.sampleId,
        seed: payload.settings.seed,
        nodeCount: sampled.nodes.length,
        adjacency,
        edges: sampled.edges,
        boundary,
        boundaryPlacement: geoBoundaryPlacement,
        iterMax: liveSolve ? 140 : 60,
        emitEvery: 2,
        metricEvery: 10,
        stream: liveSolve,
      });
      const converged = await runRelaxationSolver({
        requestId,
        datasetId: payload.datasetId,
        sampleId: payload.sampleId,
        seed: payload.settings.seed,
        nodeCount: sampled.nodes.length,
        adjacency,
        edges: sampled.edges,
        boundary,
        boundaryPlacement: geoBoundaryPlacement,
        startPositions: streamed,
        iterMax: 220,
        emitEvery: 4,
        metricEvery: 0,
        stream: false,
      });
      const finalCrossings = countDrawingCrossings(converged, sampled.edges);
      const finalMap = new Map<number, Point>();
      converged.forEach((point, id) => {
        finalMap.set(id, point);
      });
      const layout = buildLayoutFromPositions(meshBundle.mesh, finalMap, finalCrossings);
      return {
        mode: resolvedMode,
        layout,
      };
    }

    if (resolvedMode === 'orthogonal') {
      if (!meshBundle.mesh) {
        throw new Error('Orthogonal layout requires planar embedding.');
      }
      let mode: DatasetMode = resolvedMode;
      let finalLayout;
      try {
        finalLayout = orthogonalLayout(meshBundle.mesh);
      } catch {
        mode = 'planar-straight';
        finalLayout = planarStraightLine(meshBundle.mesh);
      }
      if (liveSolve) {
        const targetPositions = buildNodeTargetPositions(finalLayout.positions, {
          nodeCount: sampled.nodes.length,
          datasetId: payload.datasetId,
          sampleId: payload.sampleId,
          seed: payload.settings.seed,
        });
        await runRelaxationSolver({
          requestId,
          datasetId: payload.datasetId,
          sampleId: payload.sampleId,
          seed: payload.settings.seed,
          nodeCount: sampled.nodes.length,
          adjacency,
          edges: sampled.edges,
          boundary: [],
          startPositions: Array.from({ length: sampled.nodes.length }, (_, id) =>
            deterministicHairballPoint(payload.datasetId, payload.sampleId, payload.settings.seed, id, sampled.nodes.length),
          ),
          targetPositions,
          targetWeight: 0.56,
          iterMax: 120,
          emitEvery: 2,
          metricEvery: 8,
          stream: true,
        });
      }
      return {
        mode,
        layout: finalLayout,
      };
    }

    if (resolvedMode === 'planarization-straight' || resolvedMode === 'planarization-orthogonal') {
      let mode: DatasetMode = resolvedMode;
      let planarized: ReturnType<typeof planarizationLayout> | null = null;
      if (resolvedMode === 'planarization-orthogonal') {
        try {
          planarized = planarizationLayout(graphBundle.graph, { mode: 'orthogonal' });
        } catch {
          mode = 'planarization-straight';
          try {
            planarized = planarizationLayout(graphBundle.graph, { mode: 'straight' });
          } catch {
            const fallback = await runRelaxationSolver({
              requestId,
              datasetId: payload.datasetId,
              sampleId: payload.sampleId,
              seed: payload.settings.seed,
              nodeCount: sampled.nodes.length,
              adjacency,
              edges: sampled.edges,
              boundary: [],
              startPositions: Array.from({ length: sampled.nodes.length }, (_, id) =>
                deterministicHairballPoint(payload.datasetId, payload.sampleId, payload.settings.seed, id, sampled.nodes.length),
              ),
              iterMax: liveSolve ? 180 : 240,
              emitEvery: 2,
              metricEvery: 8,
              stream: liveSolve,
            });
            return {
              mode,
              layout: buildStraightLayoutFromSample(sampled.edges, fallback),
            };
          }
        }
      } else {
        try {
          planarized = planarizationLayout(graphBundle.graph, { mode: 'straight' });
        } catch {
          const fallback = await runRelaxationSolver({
            requestId,
            datasetId: payload.datasetId,
            sampleId: payload.sampleId,
            seed: payload.settings.seed,
            nodeCount: sampled.nodes.length,
            adjacency,
            edges: sampled.edges,
            boundary: [],
            startPositions: Array.from({ length: sampled.nodes.length }, (_, id) =>
              deterministicHairballPoint(payload.datasetId, payload.sampleId, payload.settings.seed, id, sampled.nodes.length),
            ),
            iterMax: liveSolve ? 180 : 240,
            emitEvery: 2,
            metricEvery: 8,
            stream: liveSolve,
          });
          return {
            mode,
            layout: buildStraightLayoutFromSample(sampled.edges, fallback),
          };
        }
      }
      if (!planarized) {
        throw new Error('Planarization layout failed unexpectedly.');
      }
      if (liveSolve) {
        const targetPositions = buildNodeTargetPositions(planarized.layout.positions, {
          nodeCount: sampled.nodes.length,
          datasetId: payload.datasetId,
          sampleId: payload.sampleId,
          seed: payload.settings.seed,
        });
        await runRelaxationSolver({
          requestId,
          datasetId: payload.datasetId,
          sampleId: payload.sampleId,
          seed: payload.settings.seed,
          nodeCount: sampled.nodes.length,
          adjacency,
          edges: sampled.edges,
          boundary: [],
          startPositions: Array.from({ length: sampled.nodes.length }, (_, id) =>
            deterministicHairballPoint(payload.datasetId, payload.sampleId, payload.settings.seed, id, sampled.nodes.length),
          ),
          targetPositions,
          targetWeight: 0.58,
          iterMax: 130,
          emitEvery: 2,
          metricEvery: 8,
          stream: true,
        });
      }
      return {
        mode,
        layout: planarized.layout,
      };
    }

    const planarized = planarizationLayout(graphBundle.graph, { mode: 'straight' });
    return {
      mode: 'planarization-straight',
      layout: planarized.layout,
    };
  });

  postPartial(requestId, {
    kind: 'positions',
    positions: [...layoutBundle.layout.positions.entries()]
      .map(([id, point]) => [id, clampCoordinate(point.x), clampCoordinate(point.y)] as [number, number, number])
      .sort((a, b) => a[0] - b[0]),
    iter: 9999,
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
        embeddingAvailable: Boolean(meshBundle.mesh),
      },
      report: {
        ...(meshBundle.faces ? { faces: meshBundle.faces } : {}),
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
