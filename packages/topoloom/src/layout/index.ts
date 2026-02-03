import { GraphBuilder } from '../graph';
import type { Graph, EdgeId, VertexId } from '../graph';
import { buildHalfEdgeMesh, selectOuterFace } from '../embedding';
import type { HalfEdgeMesh, FaceId } from '../embedding';
import { buildDual, routeEdgeFixedEmbedding } from '../dual';
import { testPlanarity } from '../planarity';
import { minCostFlow } from '../flow';

export type Point = { x: number; y: number };
export type EdgePath = { edge: EdgeId; points: Point[] };

export type LayoutResult = {
  positions: Map<VertexId, Point>;
  edges: EdgePath[];
  stats: {
    bends: number;
    area: number;
    crossings: number;
  };
};

type Direction = 'N' | 'E' | 'S' | 'W';

export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const orient = (p: Point, q: Point, r: Point) => {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (Math.abs(val) < 1e-9) return 0;
    return val > 0 ? 1 : 2;
  };

  const onSegment = (p: Point, q: Point, r: Point) => {
    return (
      Math.min(p.x, r.x) <= q.x + 1e-9 &&
      q.x <= Math.max(p.x, r.x) + 1e-9 &&
      Math.min(p.y, r.y) <= q.y + 1e-9 &&
      q.y <= Math.max(p.y, r.y) + 1e-9
    );
  };

  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
}

const polygonArea = (points: Point[]): number => {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    if (!p1 || !p2) continue;
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(area / 2);
};

const uniqueCycle = (vertices: VertexId[]) => {
  const cycle: VertexId[] = [];
  for (const v of vertices) {
    if (cycle.length === 0 || cycle[cycle.length - 1] !== v) cycle.push(v);
  }
  if (cycle.length > 1 && cycle[0] === cycle[cycle.length - 1]) {
    cycle.pop();
  }
  return cycle;
};

const buildTriangulatedAdjacency = (mesh: HalfEdgeMesh): Array<Set<VertexId>> => {
  const vertexCount = Math.max(...mesh.origin) + 1;
  const neighbors: Array<Set<VertexId>> = Array.from({ length: vertexCount }, () => new Set());
  const addEdge = (u: VertexId, v: VertexId) => {
    if (u === v) return;
    neighbors[u]?.add(v);
    neighbors[v]?.add(u);
  };

  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    addEdge(u, v);
  }

  mesh.faces.forEach((cycle) => {
    const verts = uniqueCycle(cycle.map((h) => mesh.origin[h] ?? 0));
    if (verts.length <= 3) return;
    const root = verts[0]!;
    for (let i = 2; i < verts.length - 1; i += 1) {
      addEdge(root, verts[i]!);
    }
  });

  return neighbors;
};

const connectedComponents = (neighbors: Array<Set<VertexId>>) => {
  const n = neighbors.length;
  const seen = Array(n).fill(false);
  const components: VertexId[][] = [];
  for (let v = 0; v < n; v += 1) {
    if (seen[v]) continue;
    const stack = [v];
    const comp: VertexId[] = [];
    seen[v] = true;
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) continue;
      comp.push(cur as VertexId);
      for (const next of neighbors[cur] ?? []) {
        if (!seen[next]) {
          seen[next] = true;
          stack.push(next);
        }
      }
    }
    components.push(comp);
  }
  return components;
};

const solveLinearSystem = (A: number[][], b: number[]): number[] => {
  const n = b.length;
  const x = Array(n).fill(0);
  const M = A.map((row) => [...row]);
  const rhs = [...b];

  for (let i = 0; i < n; i += 1) {
    let pivot = i;
    let max = Math.abs(M[i]?.[i] ?? 0);
    for (let r = i + 1; r < n; r += 1) {
      const val = Math.abs(M[r]?.[i] ?? 0);
      if (val > max) {
        max = val;
        pivot = r;
      }
    }
    if (pivot !== i) {
      [M[i], M[pivot]] = [M[pivot]!, M[i]!];
      [rhs[i], rhs[pivot]] = [rhs[pivot]!, rhs[i]!];
    }
    const diag = M[i]?.[i] ?? 0;
    if (Math.abs(diag) < 1e-12) continue;
    for (let r = i + 1; r < n; r += 1) {
      const factor = (M[r]?.[i] ?? 0) / diag;
      if (!Number.isFinite(factor)) continue;
      for (let c = i; c < n; c += 1) {
        M[r]![c] = (M[r]![c] ?? 0) - factor * (M[i]![c] ?? 0);
      }
      rhs[r] = (rhs[r] ?? 0) - factor * (rhs[i] ?? 0);
    }
  }

  for (let i = n - 1; i >= 0; i -= 1) {
    let sum = rhs[i] ?? 0;
    for (let j = i + 1; j < n; j += 1) {
      sum -= (M[i]?.[j] ?? 0) * (x[j] ?? 0);
    }
    const diag = M[i]?.[i] ?? 0;
    x[i] = Math.abs(diag) < 1e-12 ? 0 : sum / diag;
  }
  return x;
};

const snapPositionsToGrid = (positions: Map<VertexId, Point>, spacing = 20) => {
  const snapped = new Map<VertexId, Point>();
  const values = [...positions.values()];
  if (values.length === 0) return snapped;

  const rankAxis = (vals: number[]) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const unique: number[] = [];
    for (const val of sorted) {
      if (!unique.length || Math.abs(val - unique[unique.length - 1]!) > 1e-6) {
        unique.push(val);
      }
    }
    const findRank = (value: number) => {
      let lo = 0;
      let hi = unique.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const cur = unique[mid] ?? 0;
        if (Math.abs(cur - value) <= 1e-6) return mid;
        if (cur < value) lo = mid + 1;
        else hi = mid - 1;
      }
      return Math.max(0, Math.min(unique.length - 1, lo));
    };
    return { unique, findRank };
  };

  const xs = values.map((p) => p.x);
  const ys = values.map((p) => p.y);
  const rx = rankAxis(xs);
  const ry = rankAxis(ys);

  positions.forEach((p, v) => {
    const ix = rx.findRank(p.x);
    const iy = ry.findRank(p.y);
    snapped.set(v, { x: ix * spacing, y: iy * spacing });
  });
  return snapped;
};

const compactOrthogonalGrid = (
  positions: Map<VertexId, Point>,
  edges: EdgePath[],
  spacing = 20,
) => {
  const xs = new Set<number>();
  const ys = new Set<number>();
  positions.forEach((p) => {
    xs.add(p.x);
    ys.add(p.y);
  });
  edges.forEach((edge) => {
    edge.points.forEach((p) => {
      xs.add(p.x);
      ys.add(p.y);
    });
  });

  const mapAxis = (values: Set<number>) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mapping = new Map<number, number>();
    sorted.forEach((v, idx) => mapping.set(v, idx * spacing));
    return mapping;
  };

  const xMap = mapAxis(xs);
  const yMap = mapAxis(ys);
  const nextPositions = new Map<VertexId, Point>();
  positions.forEach((p, v) => {
    nextPositions.set(v, {
      x: xMap.get(p.x) ?? p.x,
      y: yMap.get(p.y) ?? p.y,
    });
  });

  const nextEdges = edges.map((edge) => ({
    edge: edge.edge,
    points: edge.points.map((p) => ({
      x: xMap.get(p.x) ?? p.x,
      y: yMap.get(p.y) ?? p.y,
    })),
  }));

  return { positions: nextPositions, edges: nextEdges };
};

export function planarStraightLine(mesh: HalfEdgeMesh): LayoutResult {
  const vertexCount = Math.max(...mesh.origin) + 1;
  const positions = new Map<VertexId, Point>();
  if (vertexCount === 0) {
    return { positions, edges: [], stats: { bends: 0, area: 0, crossings: 0 } };
  }

  const outer = selectOuterFace(mesh);
  const boundary = uniqueCycle((mesh.faces[outer] ?? []).map((h) => mesh.origin[h] ?? 0));
  const boundarySet = new Set(boundary);
  const neighbors = buildTriangulatedAdjacency(mesh);

  const components = connectedComponents(neighbors);
  const mainComponent = components.find((comp) => comp.some((v) => boundarySet.has(v))) ?? components[0] ?? [];
  const radius = Math.max(30, boundary.length * 12);
  boundary.forEach((v, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, boundary.length);
    positions.set(v, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });

  const interior = mainComponent.filter((v) => !boundarySet.has(v));
  if (boundary.length >= 3 && interior.length > 0) {
    const index = new Map<VertexId, number>();
    interior.forEach((v, idx) => index.set(v, idx));
    const size = interior.length;
    const Ax: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
    const Ay: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
    const bx: number[] = Array(size).fill(0);
    const by: number[] = Array(size).fill(0);

    for (const v of interior) {
      const row = index.get(v);
      if (row === undefined) continue;
      const neigh = Array.from(neighbors[v] ?? []);
      const degree = neigh.length || 1;
      const axRow = Ax[row];
      const ayRow = Ay[row];
      if (!axRow || !ayRow) continue;
      axRow[row] = 1;
      ayRow[row] = 1;
      for (const n of neigh) {
        if (boundarySet.has(n)) {
          const pos = positions.get(n) ?? { x: 0, y: 0 };
          bx[row] = (bx[row] ?? 0) + pos.x / degree;
          by[row] = (by[row] ?? 0) + pos.y / degree;
        } else if (index.has(n)) {
          const col = index.get(n)!;
          axRow[col] = (axRow[col] ?? 0) - 1 / degree;
          ayRow[col] = (ayRow[col] ?? 0) - 1 / degree;
        }
      }
    }

    const solvedX = solveLinearSystem(Ax, bx);
    const solvedY = solveLinearSystem(Ay, by);
    interior.forEach((v, idx) => {
      positions.set(v, { x: solvedX[idx] ?? 0, y: solvedY[idx] ?? 0 });
    });
  }

  let offsetX = radius * 2.5;
  for (const comp of components) {
    if (comp === mainComponent) continue;
    const r = Math.max(20, comp.length * 8);
    comp.forEach((v, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, comp.length);
      positions.set(v, { x: offsetX + Math.cos(angle) * r, y: Math.sin(angle) * r });
    });
    offsetX += r * 3;
  }

  const edges: EdgePath[] = [];
  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    if (u === v) {
      const p = positions.get(u) ?? { x: 0, y: 0 };
      const r = 10;
      edges.push({
        edge: e,
        points: [
          { x: p.x + r, y: p.y },
          { x: p.x + r, y: p.y + r },
          { x: p.x, y: p.y + r },
          { x: p.x, y: p.y },
        ],
      });
    } else {
      edges.push({
        edge: e,
        points: [positions.get(u) ?? { x: 0, y: 0 }, positions.get(v) ?? { x: 0, y: 0 }],
      });
    }
  }

  const boundaryPoints = boundary.map((v) => positions.get(v) ?? { x: 0, y: 0 });
  const area = boundaryPoints.length >= 3 ? polygonArea(boundaryPoints) : 0;

  let crossings = 0;
  const shared = (p: Point, q: Point) => p.x === q.x && p.y === q.y;
  for (let i = 0; i < edges.length; i += 1) {
    for (let j = i + 1; j < edges.length; j += 1) {
      const e1 = edges[i]!;
      const e2 = edges[j]!;
      const [a1, a2] = e1.points;
      const [b1, b2] = e2.points;
      if (!a1 || !a2 || !b1 || !b2) continue;
      if (shared(a1, b1) || shared(a1, b2) || shared(a2, b1) || shared(a2, b2)) continue;
      if (segmentsIntersect(a1, a2, b1, b2)) crossings += 1;
    }
  }

  return {
    positions,
    edges,
    stats: {
      bends: 0,
      area,
      crossings,
    },
  };
}

const incidentFacesInOrder = (mesh: HalfEdgeMesh, vertex: VertexId): FaceId[] => {
  const start = mesh.origin.findIndex((v) => v === vertex);
  if (start < 0) return [];
  const faces: FaceId[] = [];
  let h = start;
  const guardLimit = mesh.halfEdgeCount;
  let guard = 0;
  do {
    const f = mesh.face[h] ?? -1;
    if (!faces.includes(f)) faces.push(f as FaceId);
    const twin = mesh.twin[h] ?? -1;
    const next = mesh.next[twin] ?? -1;
    h = next;
    guard += 1;
  } while (h !== start && guard < guardLimit);
  return faces;
};

const incidentHalfEdgesInOrder = (mesh: HalfEdgeMesh, vertex: VertexId): number[] => {
  const start = mesh.origin.findIndex((v) => v === vertex);
  if (start < 0) return [];
  const order: number[] = [];
  let h = start;
  const guardLimit = mesh.halfEdgeCount;
  let guard = 0;
  do {
    order.push(h);
    const twin = mesh.twin[h] ?? -1;
    const next = mesh.next[twin] ?? -1;
    h = next;
    guard += 1;
  } while (h !== start && guard < guardLimit);
  return order;
};

const buildPortAssignments = (
  mesh: HalfEdgeMesh,
  positions: Map<VertexId, Point>,
  spacing = 20,
) => {
  const portMap = new Map<string, { point: Point; dir: Direction }>();
  const directions: Direction[] = ['E', 'N', 'W', 'S'];
  const vertexCount = Math.max(...mesh.origin) + 1;
  const offset = Math.max(6, Math.round(spacing * 0.4));
  const spread = Math.max(4, Math.round(spacing * 0.35));

  for (let v = 0; v < vertexCount; v += 1) {
    const base = positions.get(v as VertexId) ?? { x: 0, y: 0 };
    const halfEdges = incidentHalfEdgesInOrder(mesh, v as VertexId);
    if (!halfEdges.length) continue;
    const buckets: Record<Direction, Array<{ edgeId: EdgeId }>> = {
      N: [],
      E: [],
      S: [],
      W: [],
    };
    halfEdges.forEach((h, idx) => {
      const edgeId = Math.floor(h / 2) as EdgeId;
      const dir = directions[idx % directions.length] ?? 'E';
      buckets[dir].push({ edgeId });
    });

    (Object.keys(buckets) as Direction[]).forEach((dir) => {
      const items = buckets[dir];
      const count = items.length;
      items.forEach((item, idx) => {
        const offsetIndex = idx - (count - 1) / 2;
        let point: Point;
        if (dir === 'N' || dir === 'S') {
          point = {
            x: Math.round(base.x + offsetIndex * spread),
            y: Math.round(base.y + (dir === 'N' ? -offset : offset)),
          };
        } else {
          point = {
            x: Math.round(base.x + (dir === 'E' ? offset : -offset)),
            y: Math.round(base.y + offsetIndex * spread),
          };
        }
        portMap.set(`${item.edgeId}:${v}`, { point, dir });
      });
    });
  }

  return portMap;
};

const computeBends = (mesh: HalfEdgeMesh) => {
  const faceCount = mesh.faces.length;
  const outer = selectOuterFace(mesh);
  const vertexCount = Math.max(...mesh.origin) + 1;
  const edgeCount = mesh.halfEdgeCount / 2;
  const faceRotation = Array(faceCount).fill(0);
  let relaxedDegree = false;

  for (let v = 0; v < vertexCount; v += 1) {
    const faces = incidentFacesInOrder(mesh, v);
    const degree = faces.length;
    if (degree === 0) continue;
    const angles = Array(degree).fill(1);
    if (degree === 1) {
      // single face around a dangling edge: treat as 360°
      angles[0] = 4;
    } else if (degree === 2) {
      angles[0] = 2;
      angles[1] = 2;
    } else if (degree === 3) {
      let idx = faces.indexOf(outer);
      if (idx < 0) idx = 0;
      angles[idx] = 2;
    } else if (degree === 4) {
      // all 90° already
    } else {
      // Allow higher degree by treating extra incidences as 90° ports.
      relaxedDegree = true;
      for (let i = 0; i < angles.length; i += 1) angles[i] = 1;
    }

    for (let i = 0; i < faces.length; i += 1) {
      const f = faces[i]!;
      const angle = angles[i] ?? 1;
      faceRotation[f] += 2 - angle;
    }
  }

  const demands = Array(faceCount).fill(0);
  for (let f = 0; f < faceCount; f += 1) {
    const required = f === outer ? -4 : 4;
    demands[f] = required - (faceRotation[f] ?? 0);
  }

  const dual = buildDual(mesh);
  const arcs: Array<{ from: number; to: number; upper: number; cost: number }> = [];
  const edgeArcIndex: Array<{ forward: number; backward: number }> = [];
  const capacity = 1000;

  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const faces = dual.edgeFaces[e];
    const left = faces?.left ?? 0;
    const right = faces?.right ?? 0;
    const forward = arcs.length;
    arcs.push({ from: left, to: right, upper: capacity, cost: 1 });
    const backward = arcs.length;
    arcs.push({ from: right, to: left, upper: capacity, cost: 1 });
    edgeArcIndex[e] = { forward, backward };
  }

  const result = minCostFlow({ nodeCount: faceCount, arcs, demands });
  if (!result.feasible) {
    if (relaxedDegree) {
      return Array(edgeCount).fill(0);
    }
    throw new Error('Orthogonal representation flow is infeasible.');
  }

  const bendsPerEdge: number[] = [];
  for (let e = 0; e < edgeCount; e += 1) {
    const idx = edgeArcIndex[e];
    if (!idx) {
      bendsPerEdge[e] = 0;
      continue;
    }
    const forward = result.flowByArc[idx.forward] ?? 0;
    const backward = result.flowByArc[idx.backward] ?? 0;
    bendsPerEdge[e] = forward + backward;
  }
  return bendsPerEdge;
};

const dedupePoints = (points: Point[]) => {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    if (!prev || prev.x !== p.x || prev.y !== p.y) out.push(p);
  }
  return out;
};

const orthogonalizeEdgePath = (points: Point[]) => {
  if (points.length < 2) return points;
  const out: Point[] = [points[0]!];
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (a.x === b.x || a.y === b.y) {
      out.push(b);
      continue;
    }
    out.push({ x: a.x, y: b.y });
    out.push(b);
  }
  return dedupePoints(out);
};

const countBends = (edges: EdgePath[]) =>
  edges.reduce((sum, edge) => sum + Math.max(0, edge.points.length - 2), 0);

const routeOrthogonal = (
  start: Point,
  end: Point,
  bends: number,
  spacing: number,
  seed: number,
): Point[] => {
  let path: Point[];
  if (start.x === end.x || start.y === end.y) {
    path = [start, end];
  } else {
    const midA = { x: start.x, y: end.y };
    const midB = { x: end.x, y: start.y };
    const distA = Math.abs(start.x - midA.x) + Math.abs(start.y - midA.y);
    const distB = Math.abs(start.x - midB.x) + Math.abs(start.y - midB.y);
    const mid = distA <= distB ? midA : midB;
    path = [start, mid, end];
  }

  let extra = bends - (path.length - 2);
  if (extra > 0) {
    const sign = seed % 2 === 0 ? 1 : -1;
    const detour = Math.max(4, Math.round(spacing * 0.4));
    while (extra > 0) {
      const a = path[0]!;
      const b = path[1]!;
      if (a.x === b.x) {
        const midY = Math.round((a.y + b.y) / 2);
        const xOff = a.x + sign * detour;
        const p1 = { x: xOff, y: a.y };
        const p2 = { x: xOff, y: midY };
        const p3 = { x: a.x, y: midY };
        path.splice(1, 0, p1, p2, p3);
      } else {
        const midX = Math.round((a.x + b.x) / 2);
        const yOff = a.y + sign * detour;
        const p1 = { x: a.x, y: yOff };
        const p2 = { x: midX, y: yOff };
        const p3 = { x: midX, y: a.y };
        path.splice(1, 0, p1, p2, p3);
      }
      extra -= 2;
    }
  }
  return dedupePoints(path);
};

export function orthogonalLayout(mesh: HalfEdgeMesh): LayoutResult {
  const base = planarStraightLine(mesh);
  const positions = snapPositionsToGrid(base.positions, 20);
  const bendsPerEdge = computeBends(mesh);
  const portMap = buildPortAssignments(mesh, positions, 20);
  const edges: EdgePath[] = [];

  for (let e = 0; e < mesh.halfEdgeCount / 2; e += 1) {
    const h0 = e * 2;
    const h1 = e * 2 + 1;
    const u = mesh.origin[h0] ?? 0;
    const v = mesh.origin[h1] ?? 0;
    const startPort = portMap.get(`${e}:${u}`);
    const endPort = portMap.get(`${e}:${v}`);
    const p1 = startPort?.point ?? positions.get(u) ?? { x: 0, y: 0 };
    const p2 = endPort?.point ?? positions.get(v) ?? { x: 0, y: 0 };
    const edgeBends = bendsPerEdge[e] ?? 0;
    const path = routeOrthogonal(p1, p2, edgeBends, 20, e);
    edges.push({ edge: e, points: path });
  }

  const compacted = compactOrthogonalGrid(positions, edges, 20);
  const xs = [...compacted.positions.values()].map((p) => p.x);
  const ys = [...compacted.positions.values()].map((p) => p.y);
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 0;
  const area = Math.max(0, maxX - minX) * Math.max(0, maxY - minY);

  return {
    positions: compacted.positions,
    edges: compacted.edges,
    stats: {
      bends: countBends(compacted.edges),
      area,
      crossings: 0,
    },
  };
}

export type PlanarizationResult = {
  baseGraph: Graph;
  remainingEdges: EdgeId[];
  routes: Array<{ edge: EdgeId; crossed: EdgeId[] }>;
  layout: LayoutResult;
};

export type PlanarizationLayoutOptions = {
  mode?: 'straight' | 'orthogonal';
};

export function planarizationLayout(
  graph: Graph,
  options: PlanarizationLayoutOptions = {},
): PlanarizationResult {
  const kept: Array<{ u: VertexId; v: VertexId; id: EdgeId }> = [];
  const remaining: EdgeId[] = [];

  for (const edge of graph.edges()) {
    const builder = new GraphBuilder();
    for (const v of graph.vertices()) builder.addVertex(v);
    for (const keptEdge of kept) builder.addEdge(keptEdge.u, keptEdge.v, false);
    builder.addEdge(edge.u, edge.v, false);
    const test = testPlanarity(builder.build());
    if (test.planar) {
      kept.push({ u: edge.u, v: edge.v, id: edge.id });
    } else {
      remaining.push(edge.id);
    }
  }

  const baseBuilder = new GraphBuilder();
  for (const v of graph.vertices()) baseBuilder.addVertex(v);
  for (const keptEdge of kept) baseBuilder.addEdge(keptEdge.u, keptEdge.v, false);
  const baseGraph = baseBuilder.build();
  const routes: Array<{ edge: EdgeId; crossed: EdgeId[] }> = [];

  type WorkingEdge = { u: VertexId; v: VertexId; originalEdge: EdgeId };
  const insertDummyInPath = (path: VertexId[], u: VertexId, v: VertexId, dummy: VertexId) => {
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i]!;
      const b = path[i + 1]!;
      if ((a === u && b === v) || (a === v && b === u)) {
        path.splice(i + 1, 0, dummy);
        return true;
      }
    }
    return false;
  };

  let currentVertexCount = baseGraph.vertexCount();
  const currentEdges: WorkingEdge[] = baseGraph.edges().map((edge) => ({
    u: edge.u,
    v: edge.v,
    originalEdge: kept[edge.id]?.id ?? edge.id,
  }));

  const paths = new Map<EdgeId, VertexId[]>();
  baseGraph.edges().forEach((edge) => {
    const original = kept[edge.id]?.id ?? edge.id;
    paths.set(original, [edge.u, edge.v]);
  });

  const buildCurrentGraph = () => {
    const builder = new GraphBuilder();
    for (let i = 0; i < currentVertexCount; i += 1) builder.addVertex(i);
    for (const edge of currentEdges) builder.addEdge(edge.u, edge.v, false);
    return builder.build();
  };

  for (const edgeId of remaining) {
    const currentGraph = buildCurrentGraph();
    const embedding = testPlanarity(currentGraph);
    if (!embedding.planar) {
      throw new Error('Planarization graph should remain planar during insertion.');
    }
    const mesh = buildHalfEdgeMesh(currentGraph, embedding.embedding);
    const edge = graph.edge(edgeId);
    const route = routeEdgeFixedEmbedding(mesh, edge.u, edge.v);
    const crossed = route?.crossedPrimalEdges ?? [];
    const crossedOriginal = crossed.map((id) => currentEdges[id]?.originalEdge ?? id);
    routes.push({ edge: edgeId, crossed: crossedOriginal });

    const dummyMap = new Map<EdgeId, VertexId>();
    const path: VertexId[] = [edge.u];
    crossed.forEach((crossedId) => {
      const dummy = currentVertexCount as VertexId;
      currentVertexCount += 1;
      dummyMap.set(crossedId, dummy);
      path.push(dummy);
    });
    path.push(edge.v);
    paths.set(edgeId, path);

    const splitList = [...crossed].sort((a, b) => b - a);
    for (const crossedId of splitList) {
      const dummy = dummyMap.get(crossedId);
      if (dummy === undefined) continue;
      const crossedEdge = currentEdges[crossedId];
      if (!crossedEdge) continue;
      const original = crossedEdge.originalEdge;
      const originalPath = paths.get(original) ?? [crossedEdge.u, crossedEdge.v];
      insertDummyInPath(originalPath, crossedEdge.u, crossedEdge.v, dummy);
      paths.set(original, originalPath);
      const first: WorkingEdge = { u: crossedEdge.u, v: dummy, originalEdge: original };
      const second: WorkingEdge = { u: dummy, v: crossedEdge.v, originalEdge: original };
      currentEdges.splice(crossedId, 1, first, second);
    }

    for (let i = 0; i < path.length - 1; i += 1) {
      currentEdges.push({ u: path[i]!, v: path[i + 1]!, originalEdge: edgeId });
    }
  }

  const planarGraph = buildCurrentGraph();
  const planarEmbedding = testPlanarity(planarGraph);
  if (!planarEmbedding.planar) {
    throw new Error('Planarization graph should be planar');
  }

  const planarMesh = buildHalfEdgeMesh(planarGraph, planarEmbedding.embedding);
  const mode = options.mode ?? 'straight';
  const baseLayout = mode === 'orthogonal' ? orthogonalLayout(planarMesh) : planarStraightLine(planarMesh);

  const finalEdges: EdgePath[] = [];
  paths.forEach((path, edgeId) => {
    const points = path.map((v) => baseLayout.positions.get(v) ?? { x: 0, y: 0 });
    const routed = mode === 'orthogonal' ? orthogonalizeEdgePath(points) : points;
    finalEdges.push({ edge: edgeId, points: routed });
  });

  return {
    baseGraph,
    remainingEdges: remaining,
    routes,
    layout: {
      positions: baseLayout.positions,
      edges: finalEdges,
      stats: {
        bends: mode === 'orthogonal' ? countBends(finalEdges) : baseLayout.stats.bends,
        area: baseLayout.stats.area,
        crossings: currentVertexCount - baseGraph.vertexCount(),
      },
    },
  };
}
