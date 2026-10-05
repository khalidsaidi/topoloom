import { describe, expect, it } from 'vitest';

import { GraphBuilder, fromEdgeList } from '../src/graph';
import type { Graph } from '../src/graph';
import { testPlanarity } from '../src/planarity';
import { buildHalfEdgeMesh } from '../src/embedding';
import { planarizationLayout } from '../src/layout';

const BACKENDS = ['ts', 'wasm'] as const;

const build = (n: number, edges: Array<[number, number]>): Graph => {
  const builder = new GraphBuilder();
  for (let i = 0; i < n; i += 1) builder.addVertex(i);
  for (const [u, v] of edges) builder.addEdge(u, v, false);
  return builder.build();
};

// A rotation system is planar iff its face count satisfies Euler's formula.
// The mesh gives every connected component its own outer face, so the target
// is E - V + 2C over the non-isolated vertices.
const expectedFaces = (edges: Array<[number, number]>) => {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const [u, v] of edges) parent.set(find(u), find(v));
  const used = new Set(edges.flat());
  const components = new Set([...used].map(find)).size;
  return edges.length - used.size + 2 * components;
};

const expectPlanarEmbedding = (n: number, edges: Array<[number, number]>) => {
  const graph = build(n, edges);
  for (const backend of BACKENDS) {
    const result = testPlanarity(graph, { backend });
    expect(result.planar, `${backend} planar`).toBe(true);
    if (!result.planar) continue;
    const faces = buildHalfEdgeMesh(graph, result.embedding).faces.length;
    expect(faces, `${backend} faces`).toBe(expectedFaces(edges));
  }
};

const lcg = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

describe('planarity embeddings', () => {
  it('embeds the graph from issue #33 with a genus-0 rotation system', () => {
    // Intermediate planarization graph on which the LR core used to return a
    // planar verdict with a genus-1 embedding (9 faces instead of 11).
    expectPlanarEmbedding(22, [
      [0, 1], [2, 1], [3, 1], [3, 4], [5, 6], [7, 8], [9, 2], [9, 0], [9, 10], [9, 11], [9, 12],
      [13, 20], [20, 2], [13, 0], [13, 10], [14, 2], [14, 11], [15, 0], [15, 12], [16, 8],
      [16, 21], [21, 10], [16, 11], [17, 6], [17, 4], [18, 5], [19, 9], [19, 7], [18, 20],
      [20, 21], [21, 7],
    ]);
  });

  it('satisfies Euler on random planar graphs for both backends', () => {
    const rnd = lcg(12345);
    for (let trial = 0; trial < 300; trial += 1) {
      const n = 4 + Math.floor(rnd() * 24);
      const edges: Array<[number, number]> = [];
      const seen = new Set<string>();
      for (let k = 0; k < 3 * n; k += 1) {
        const u = Math.floor(rnd() * n);
        const v = Math.floor(rnd() * n);
        const key = u < v ? `${u}:${v}` : `${v}:${u}`;
        if (u === v || seen.has(key)) continue;
        if (!testPlanarity(build(n, [...edges, [u, v]]), { backend: 'wasm' }).planar) continue;
        seen.add(key);
        edges.push([u, v]);
      }
      if (edges.length) expectPlanarEmbedding(n, edges);
    }
  });

  it('handles parallel edges on both backends', () => {
    // The native core never returned on this input; the LR core called planar
    // multigraphs non-planar.
    expectPlanarEmbedding(3, [[2, 0], [0, 1], [0, 1], [2, 0], [1, 2]]);
    expectPlanarEmbedding(4, [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3], [1, 0], [0, 1], [3, 2]]);
    expectPlanarEmbedding(5, [[2, 3], [0, 1], [0, 1], [0, 1], [4, 0], [0, 4], [4, 3], [2, 0], [2, 1], [2, 0]]);
  });

  it('still rejects K5 with parallel edges', () => {
    const edges: Array<[number, number]> = [];
    for (let u = 0; u < 5; u += 1) for (let v = u + 1; v < 5; v += 1) edges.push([u, v], [v, u]);
    for (const backend of BACKENDS) {
      expect(testPlanarity(build(5, edges), { backend }).planar).toBe(false);
    }
  });
});

describe('planarizationLayout on non-planar graphs', () => {
  it('planarizes the graph from issue #33', () => {
    const result = planarizationLayout(
      fromEdgeList([
        ['REAL1', 'ELEM4'], ['REAL5', 'ELEM4'], ['DEC2', 'ELEM4'], ['DEC2', 'INV2'],
        ['DEC3', 'INV1'], ['DEC4', 'INV4'], ['DEC8', 'REAL5'], ['DEC8', 'REAL1'],
        ['DEC8', 'INV21'], ['DEC8', 'INV22'], ['DEC8', 'POL20'], ['DEC9', 'REAL5'],
        ['DEC9', 'REAL1'], ['DEC9', 'INV21'], ['DEC10', 'REAL5'], ['DEC10', 'INV22'],
        ['DEC15', 'REAL1'], ['DEC15', 'POL20'], ['DEC16', 'INV4'], ['DEC16', 'INV21'],
        ['DEC16', 'INV22'], ['DEC41', 'INV1'], ['DEC41', 'INV2'], ['CHG2', 'DEC3'],
        ['CHG2', 'DEC4'], ['CHG4', 'DEC8'], ['CHG4', 'DEC4'], ['CHG4', 'DEC2'],
      ]),
    );
    expect(result.remainingEdges.length).toBeGreaterThan(1);
    expect(result.layout.edges).toHaveLength(28);
  });

  it('never fails on random graphs, with or without parallel edges', () => {
    const rnd = lcg(777);
    for (let trial = 0; trial < 150; trial += 1) {
      const n = 6 + Math.floor(rnd() * 24);
      const edges: Array<[number, number]> = [];
      for (let k = 0; k < n + Math.floor(rnd() * 2 * n); k += 1) {
        const u = Math.floor(rnd() * n);
        const v = Math.floor(rnd() * n);
        if (u !== v) edges.push([u, v]);
      }
      expect(() => planarizationLayout(build(n, edges))).not.toThrow();
    }
  });
});
