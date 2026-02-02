import type { EdgeId, Graph, VertexId } from '../graph';

export type HalfEdgeId = number;
export type FaceId = number;

export type HalfEdgeRef = {
  edge: EdgeId;
  to: VertexId;
};

export type RotationSystem = {
  order: HalfEdgeRef[][]; // per-vertex cyclic order of outgoing half-edges
};

export type HalfEdgeMesh = {
  halfEdgeCount: number;
  origin: VertexId[];
  twin: HalfEdgeId[];
  next: HalfEdgeId[];
  prev: HalfEdgeId[];
  edge: EdgeId[];
  face: FaceId[];
  faces: HalfEdgeId[][];
};

export function rotationFromAdjacency(graph: Graph): RotationSystem {
  const order: HalfEdgeRef[][] = [];
  for (const v of graph.vertices()) {
    const list: HalfEdgeRef[] = [];
    for (const adj of graph.adjacency(v)) {
      list.push({ edge: adj.edge, to: adj.to });
    }
    order[v] = list;
  }
  return { order };
}

export function buildHalfEdgeMesh(graph: Graph, rotation: RotationSystem): HalfEdgeMesh {
  const halfEdgeCount = graph.edgeCount() * 2;
  const origin: VertexId[] = Array(halfEdgeCount).fill(0);
  const twin: HalfEdgeId[] = Array(halfEdgeCount).fill(0);
  const next: HalfEdgeId[] = Array(halfEdgeCount).fill(0);
  const prev: HalfEdgeId[] = Array(halfEdgeCount).fill(0);
  const edge: EdgeId[] = Array(halfEdgeCount).fill(0);
  const face: FaceId[] = Array(halfEdgeCount).fill(-1);

  const halfEdgeOf = new Map<string, HalfEdgeId>();

  graph.edges().forEach((edgeRecord) => {
    if (edgeRecord.u === edgeRecord.v) {
      throw new Error('Embedding does not support self-loops in half-edge compilation.');
    }
    const h0 = edgeRecord.id * 2;
    const h1 = edgeRecord.id * 2 + 1;
    origin[h0] = edgeRecord.u;
    origin[h1] = edgeRecord.v;
    twin[h0] = h1;
    twin[h1] = h0;
    edge[h0] = edgeRecord.id;
    edge[h1] = edgeRecord.id;
    halfEdgeOf.set(`${edgeRecord.id}:${edgeRecord.u}`, h0);
    halfEdgeOf.set(`${edgeRecord.id}:${edgeRecord.v}`, h1);
  });

  // Build next/prev based on rotation system
  for (let v = 0; v < rotation.order.length; v += 1) {
    const cyclic = rotation.order[v] ?? [];
    if (cyclic.length === 0) continue;
    for (let i = 0; i < cyclic.length; i += 1) {
      const ref = cyclic[i]!;
      const h = halfEdgeOf.get(`${ref.edge}:${v}`);
      if (h === undefined) {
        throw new Error(`Rotation system missing half-edge for vertex ${v} edge ${ref.edge}`);
      }
      const twinH = twin[h];
      const nextRef = cyclic[(i + 1) % cyclic.length]!;
      const nextHalfEdge = halfEdgeOf.get(`${nextRef.edge}:${v}`);
      if (nextHalfEdge === undefined) {
        throw new Error(`Rotation system missing next half-edge for vertex ${v} edge ${nextRef.edge}`);
      }
      if (twinH !== undefined) {
        next[twinH] = nextHalfEdge;
        prev[nextHalfEdge] = twinH;
      }
    }
  }

  const faces: HalfEdgeId[][] = [];
  for (let h = 0; h < halfEdgeCount; h += 1) {
    if (face[h] !== -1) continue;
    const cycle: HalfEdgeId[] = [];
    let current = h;
    while (true) {
      if (face[current] !== -1) break;
      face[current] = faces.length;
      cycle.push(current);
      const nextH = next[current];
      if (nextH === undefined) break;
      current = nextH;
      if (current === h) break;
    }
    faces.push(cycle);
  }

  return { halfEdgeCount, origin, twin, next, prev, edge, face, faces };
}

export function faces(mesh: HalfEdgeMesh): FaceId[] {
  return mesh.faces.map((_, i) => i as FaceId);
}

export function walkFace(mesh: HalfEdgeMesh, faceId: FaceId): HalfEdgeId[] {
  return mesh.faces[faceId] ?? [];
}

export function validateMesh(mesh: HalfEdgeMesh): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (let h = 0; h < mesh.halfEdgeCount; h += 1) {
    const t = mesh.twin[h];
    if (t === undefined || mesh.twin[t] !== h) errors.push(`Twin mismatch at half-edge ${h}`);
    const prevH = mesh.prev[h];
    if (prevH === undefined || mesh.next[prevH] !== h) {
      errors.push(`Prev/next mismatch at half-edge ${h}`);
    }
  }
  const seen = new Set<number>();
  mesh.faces.forEach((cycle, faceId) => {
    if (cycle.length === 0) errors.push(`Empty face ${faceId}`);
    for (const h of cycle) {
      if (seen.has(h)) errors.push(`Half-edge ${h} appears in multiple faces`);
      seen.add(h);
    }
  });
  if (seen.size !== mesh.halfEdgeCount) {
    errors.push('Not all half-edges are assigned to faces');
  }
  return { ok: errors.length === 0, errors };
}

export function selectOuterFace(mesh: HalfEdgeMesh, positions?: Map<VertexId, { x: number; y: number }>): FaceId {
  if (!positions) {
    let maxSize = -1;
    let chosen = 0;
    mesh.faces.forEach((cycle, idx) => {
      if (cycle.length > maxSize) {
        maxSize = cycle.length;
        chosen = idx;
      }
    });
    return chosen as FaceId;
  }

  const faceAreas = mesh.faces.map((cycle) => {
    let area = 0;
    for (let i = 0; i < cycle.length; i += 1) {
      const h = cycle[i];
      const hId = h as number;
      const v = (mesh.origin[hId] ?? 0) as VertexId;
      const nextH = cycle[(i + 1) % cycle.length] as number;
      const w = (mesh.origin[nextH] ?? 0) as VertexId;
      const p1 = positions.get(v);
      const p2 = positions.get(w);
      if (!p1 || !p2) continue;
      area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area);
  });

  let max = -Infinity;
  let chosen = 0;
  faceAreas.forEach((area, idx) => {
    if (area > max) {
      max = area;
      chosen = idx;
    }
  });
  return chosen as FaceId;
}
