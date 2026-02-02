import { EdgeId, Graph, VertexId } from '../graph';
import { RotationSystem, rotationFromAdjacency } from '../embedding';

export type PlanarityWitness = {
  type: 'K5' | 'K3,3';
  vertices: VertexId[];
  edges: EdgeId[];
};

export type PlanarityResult =
  | { planar: true; embedding: RotationSystem }
  | { planar: false; witness: PlanarityWitness };

type SimpleGraph = {
  vertices: VertexId[];
  adj: Map<VertexId, Set<VertexId>>;
  edgePaths: Map<string, EdgeId[]>; // key: u-v sorted
};

const edgeKey = (u: VertexId, v: VertexId) => (u < v ? `${u}-${v}` : `${v}-${u}`);

function buildSimpleGraph(graph: Graph): SimpleGraph {
  const adj = new Map<VertexId, Set<VertexId>>();
  const edgePaths = new Map<string, EdgeId[]>();
  const vertices = graph.vertices();

  for (const v of vertices) adj.set(v, new Set());

  for (const edge of graph.edges()) {
    if (edge.u === edge.v) continue;
    const key = edgeKey(edge.u, edge.v);
    if (!edgePaths.has(key)) {
      edgePaths.set(key, [edge.id]);
      adj.get(edge.u)?.add(edge.v);
      adj.get(edge.v)?.add(edge.u);
    } else {
      const path = edgePaths.get(key) ?? [];
      path.push(edge.id);
      edgePaths.set(key, path);
    }
  }

  return { vertices, adj, edgePaths };
}

function suppressDegreeTwo(simple: SimpleGraph): SimpleGraph {
  const adj = new Map<VertexId, Set<VertexId>>();
  const edgePaths = new Map<string, EdgeId[]>();
  for (const [v, neighbors] of simple.adj.entries()) {
    adj.set(v, new Set(neighbors));
  }
  for (const [key, path] of simple.edgePaths.entries()) {
    edgePaths.set(key, [...path]);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const v of [...adj.keys()]) {
      const neighbors = adj.get(v);
      if (!neighbors) continue;
      const degree = neighbors.size;
      if (degree === 0) {
        adj.delete(v);
        changed = true;
        continue;
      }
      if (degree === 1) {
        const [n] = neighbors;
        adj.get(n)?.delete(v);
        adj.delete(v);
        edgePaths.delete(edgeKey(v, n));
        changed = true;
        continue;
      }
      if (degree === 2) {
        const [a, b] = [...neighbors];
        if (a === b) {
          adj.delete(v);
          changed = true;
          continue;
        }
        const key1 = edgeKey(v, a);
        const key2 = edgeKey(v, b);
        const path1 = edgePaths.get(key1) ?? [];
        const path2 = edgePaths.get(key2) ?? [];
        adj.get(a)?.delete(v);
        adj.get(b)?.delete(v);
        adj.delete(v);
        edgePaths.delete(key1);
        edgePaths.delete(key2);
        const newKey = edgeKey(a, b);
        const merged = [...path1, ...path2];
        if (!edgePaths.has(newKey)) {
          edgePaths.set(newKey, merged);
          adj.get(a)?.add(b);
          adj.get(b)?.add(a);
        }
        changed = true;
      }
    }
  }

  return { vertices: [...adj.keys()], adj, edgePaths };
}

function findK5(simple: SimpleGraph): PlanarityWitness | null {
  const verts = simple.vertices;
  if (verts.length < 5) return null;
  for (let i = 0; i < verts.length; i += 1) {
    for (let j = i + 1; j < verts.length; j += 1) {
      for (let k = j + 1; k < verts.length; k += 1) {
        for (let l = k + 1; l < verts.length; l += 1) {
          for (let m = l + 1; m < verts.length; m += 1) {
            const subset = [verts[i], verts[j], verts[k], verts[l], verts[m]];
            let complete = true;
            const witnessEdges: EdgeId[] = [];
            for (let a = 0; a < subset.length; a += 1) {
              for (let b = a + 1; b < subset.length; b += 1) {
                const u = subset[a];
                const v = subset[b];
                if (!simple.adj.get(u)?.has(v)) {
                  complete = false;
                  break;
                }
                const path = simple.edgePaths.get(edgeKey(u, v)) ?? [];
                witnessEdges.push(...path);
              }
              if (!complete) break;
            }
            if (complete) {
              return { type: 'K5', vertices: subset, edges: [...new Set(witnessEdges)] };
            }
          }
        }
      }
    }
  }
  return null;
}

function findK33(simple: SimpleGraph): PlanarityWitness | null {
  const verts = simple.vertices;
  if (verts.length < 6) return null;
  for (let i = 0; i < verts.length; i += 1) {
    for (let j = i + 1; j < verts.length; j += 1) {
      for (let k = j + 1; k < verts.length; k += 1) {
        const left = [verts[i], verts[j], verts[k]];
        const remaining = verts.filter((v) => !left.includes(v));
        for (let a = 0; a < remaining.length; a += 1) {
          for (let b = a + 1; b < remaining.length; b += 1) {
            for (let c = b + 1; c < remaining.length; c += 1) {
              const right = [remaining[a], remaining[b], remaining[c]];
              let complete = true;
              const witnessEdges: EdgeId[] = [];
              for (const u of left) {
                for (const v of right) {
                  if (!simple.adj.get(u)?.has(v)) {
                    complete = false;
                    break;
                  }
                  const path = simple.edgePaths.get(edgeKey(u, v)) ?? [];
                  witnessEdges.push(...path);
                }
                if (!complete) break;
              }
              if (complete) {
                return {
                  type: 'K3,3',
                  vertices: [...left, ...right],
                  edges: [...new Set(witnessEdges)],
                };
              }
            }
          }
        }
      }
    }
  }
  return null;
}

export function testPlanarity(graph: Graph): PlanarityResult {
  const simple = suppressDegreeTwo(buildSimpleGraph(graph));
  const k5 = findK5(simple);
  if (k5) return { planar: false, witness: k5 };
  const k33 = findK33(simple);
  if (k33) return { planar: false, witness: k33 };

  return { planar: true, embedding: rotationFromAdjacency(graph) };
}
