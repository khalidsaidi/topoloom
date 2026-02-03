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
  const origin: VertexId[] = Array(halfEdgeCount).fill(-1);
  const twin: HalfEdgeId[] = Array(halfEdgeCount).fill(-1);
  const next: HalfEdgeId[] = Array(halfEdgeCount).fill(-1);
  const prev: HalfEdgeId[] = Array(halfEdgeCount).fill(-1);
  const edge: EdgeId[] = Array(halfEdgeCount).fill(-1);
  const face: FaceId[] = Array(halfEdgeCount).fill(-1);

  const halfEdgeOf = new Map<string, HalfEdgeId[]>();

  graph.edges().forEach((edgeRecord) => {
    if (edgeRecord.directed) {
      throw new Error('Embedding does not support directed edges in half-edge compilation.');
    }
    const h0 = edgeRecord.id * 2;
    const h1 = edgeRecord.id * 2 + 1;
    origin[h0] = edgeRecord.u;
    origin[h1] = edgeRecord.v;
    twin[h0] = h1;
    twin[h1] = h0;
    edge[h0] = edgeRecord.id;
    edge[h1] = edgeRecord.id;
    const pushHalfEdge = (key: string, half: HalfEdgeId) => {
      const bucket = halfEdgeOf.get(key) ?? [];
      bucket.push(half);
      halfEdgeOf.set(key, bucket);
    };
    pushHalfEdge(`${edgeRecord.id}:${edgeRecord.u}`, h0);
    pushHalfEdge(`${edgeRecord.id}:${edgeRecord.v}`, h1);
  });

  // Validate rotation system against the graph.
  for (let v = 0; v < graph.vertexCount(); v += 1) {
    const adj = graph.adjacency(v);
    for (const entry of adj) {
      if (entry.dir !== 'undirected') {
        throw new Error('Rotation system requires an undirected graph.');
      }
    }
    const expected = new Map<EdgeId, { to: VertexId; count: number }>();
    for (const entry of adj) {
      const current = expected.get(entry.edge);
      if (!current) {
        expected.set(entry.edge, { to: entry.to, count: 1 });
      } else {
        if (current.to !== entry.to) {
          throw new Error(`Rotation system has inconsistent endpoints for edge ${entry.edge} at vertex ${v}.`);
        }
        current.count += 1;
      }
    }
    const cyclic = rotation.order[v] ?? [];
    if (cyclic.length !== adj.length) {
      throw new Error(`Rotation system for vertex ${v} has wrong degree.`);
    }
    const seen = new Map<EdgeId, number>();
    for (const ref of cyclic) {
      const to = expected.get(ref.edge);
      if (!to) {
        throw new Error(`Rotation system lists non-incident edge ${ref.edge} at vertex ${v}.`);
      }
      if (to.to !== ref.to) {
        throw new Error(`Rotation system has mismatched endpoint for edge ${ref.edge} at vertex ${v}.`);
      }
      seen.set(ref.edge, (seen.get(ref.edge) ?? 0) + 1);
    }
    for (const [edgeId, info] of expected.entries()) {
      if ((seen.get(edgeId) ?? 0) !== info.count) {
        throw new Error(`Rotation system has wrong multiplicity for edge ${edgeId} at vertex ${v}.`);
      }
    }
  }

  // Build next/prev based on rotation system
  for (let v = 0; v < rotation.order.length; v += 1) {
    const cyclic = rotation.order[v] ?? [];
    if (cyclic.length === 0) continue;
    const halfEdges = cyclic.map((ref) => {
      const key = `${ref.edge}:${v}`;
      const bucket = halfEdgeOf.get(key);
      if (!bucket || bucket.length === 0) {
        throw new Error(`Rotation system missing half-edge for vertex ${v} edge ${ref.edge}`);
      }
      const half = bucket.shift();
      if (half === undefined) {
        throw new Error(`Rotation system missing half-edge for vertex ${v} edge ${ref.edge}`);
      }
      return half;
    });
    for (let i = 0; i < cyclic.length; i += 1) {
      const h = halfEdges[i]!;
      const twinH = twin[h] ?? -1;
      if (twinH === undefined || twinH < 0) {
        throw new Error(`Rotation system missing twin for half-edge ${h}`);
      }
      const nextHalfEdge = halfEdges[(i + 1) % cyclic.length]!;
      next[twinH] = nextHalfEdge;
      const prevValue = prev[nextHalfEdge];
      if (prevValue !== undefined && prevValue !== -1 && prevValue !== twinH) {
        throw new Error(`Rotation system conflicts on prev for half-edge ${nextHalfEdge}`);
      }
      prev[nextHalfEdge] = twinH;
    }
  }

  for (let h = 0; h < halfEdgeCount; h += 1) {
    if (next[h] === -1 || prev[h] === -1) {
      throw new Error(`Rotation system left half-edge ${h} without next/prev.`);
    }
  }

  const faces: HalfEdgeId[][] = [];
  for (let h = 0; h < halfEdgeCount; h += 1) {
    if (face[h] !== -1) continue;
    const cycle: HalfEdgeId[] = [];
    let current = h;
    let guard = 0;
    while (guard <= halfEdgeCount) {
      if (face[current] !== -1) {
        break;
      }
      face[current] = faces.length;
      cycle.push(current);
      const nextH = next[current];
      if (nextH === -1 || nextH === undefined) {
        throw new Error(`Half-edge ${current} has no next pointer.`);
      }
      current = nextH;
      if (current === h) break;
      guard += 1;
    }
    if (current !== h) {
      throw new Error('Face traversal did not close.');
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
    if (t === undefined || t < 0 || mesh.twin[t] !== h) errors.push(`Twin mismatch at half-edge ${h}`);
    const prevH = mesh.prev[h];
    if (prevH === undefined || prevH < 0 || mesh.next[prevH] !== h) {
      errors.push(`Prev/next mismatch at half-edge ${h}`);
    }
    const nextH = mesh.next[h];
    if (nextH === undefined || nextH < 0 || mesh.prev[nextH] !== h) {
      errors.push(`Next/prev mismatch at half-edge ${h}`);
    }
  }
  const seen = new Set<number>();
  mesh.faces.forEach((cycle, faceId) => {
    if (cycle.length === 0) errors.push(`Empty face ${faceId}`);
    for (let i = 0; i < cycle.length; i += 1) {
      const h = cycle[i]!;
      if (seen.has(h)) errors.push(`Half-edge ${h} appears in multiple faces`);
      seen.add(h);
      const nextH = mesh.next[h];
      if (nextH !== cycle[(i + 1) % cycle.length]) {
        errors.push(`Face ${faceId} not consistent with next pointers at ${h}`);
      }
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
