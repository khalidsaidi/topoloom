import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { testPlanarity } from '../src/planarity';
import { planarityWitness } from '../src/planarity/ts';
import { buildHalfEdgeMesh, validateMesh } from '../src/embedding';

const edgeListToGraph = (edges: Array<[number, number]>): GraphBuilder => {
  const builder = new GraphBuilder();
  const max = edges.reduce((acc, [u, v]) => Math.max(acc, u, v), -1);
  for (let i = 0; i <= max; i += 1) builder.addVertex(i);
  for (const [u, v] of edges) builder.addEdge(u, v, false);
  return builder;
};

const gridGraph = (rows: number, cols: number) => {
  const edges: Array<[number, number]> = [];
  const id = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (c + 1 < cols) edges.push([id(r, c), id(r, c + 1)]);
      if (r + 1 < rows) edges.push([id(r, c), id(r + 1, c)]);
    }
  }
  return edgeListToGraph(edges).build();
};

describe('planarity', () => {
  it('detects planar graphs', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();
    const result = testPlanarity(g);
    expect(result.planar).toBe(true);
    if (result.planar) {
      const mesh = buildHalfEdgeMesh(g, result.embedding);
      const validation = validateMesh(mesh);
      expect(validation.ok).toBe(true);
      expect(g.vertexCount() - g.edgeCount() + mesh.faces.length).toBe(2);
    }
  });

  it('detects planar grids', () => {
    const g = gridGraph(4, 4);
    const result = testPlanarity(g);
    expect(result.planar).toBe(true);
    if (result.planar) {
      const mesh = buildHalfEdgeMesh(g, result.embedding);
      const validation = validateMesh(mesh);
      expect(validation.ok).toBe(true);
    }
  });

  it('detects K5 as nonplanar', () => {
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) edges.push([i, j]);
    }
    const g = edgeListToGraph(edges).build();
    const result = testPlanarity(g);
    expect(result.planar).toBe(false);
    if (!result.planar) {
      const witnessGraph = edgeListToGraph(
        result.witness.edges.map((edgeId) => {
          const edge = g.edge(edgeId);
          return [edge.u, edge.v];
        }),
      ).build();
      expect(testPlanarity(witnessGraph).planar).toBe(false);
    }
  });

  it('detects K3,3 as nonplanar', () => {
    const left = [0, 1, 2];
    const right = [3, 4, 5];
    const edges: Array<[number, number]> = [];
    for (const u of left) {
      for (const v of right) edges.push([u, v]);
    }
    const g = edgeListToGraph(edges).build();
    const result = testPlanarity(g);
    expect(result.planar).toBe(false);
  });

  it('detects subdivisions of K3,3 as nonplanar', () => {
    const edges: Array<[number, number]> = [];
    const left = [0, 1, 2];
    const right = [3, 4, 5];
    for (const u of left) {
      for (const v of right) edges.push([u, v]);
    }
    // Subdivide edge (0,3) with vertex 6
    const subdivided = edges.filter(([u, v]) => !(u === 0 && v === 3));
    subdivided.push([0, 6]);
    subdivided.push([6, 3]);
    const g = edgeListToGraph(subdivided).build();
    const result = testPlanarity(g);
    expect(result.planar).toBe(false);
  });

  it('accepts multi-edges and can ignore self-loops', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, false);
    builder.addEdge(a, b, false);
    const g = builder.build();
    expect(testPlanarity(g).planar).toBe(true);

    const loopBuilder = new GraphBuilder();
    const x = loopBuilder.addVertex('x');
    const loopId = loopBuilder.addEdge(x, x, false);
    const loopGraph = loopBuilder.build();
    const ignored = testPlanarity(loopGraph);
    expect(ignored.planar).toBe(true);
    expect(ignored.ignoredSelfLoops).toEqual([loopId]);
    if (ignored.planar) {
      const mesh = buildHalfEdgeMesh(loopGraph, ignored.embedding);
      const validation = validateMesh(mesh);
      expect(validation.ok).toBe(true);
    }
    expect(() => testPlanarity(loopGraph, { allowSelfLoops: 'reject' })).toThrow(/self-loops/i);
  });

  it('rejects directed graphs', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, true);
    const g = builder.build();
    const relaxed = testPlanarity(g);
    expect(relaxed.planar).toBe(true);
    expect(relaxed.treatedDirectedAsUndirected).toBe(true);
    expect(() => testPlanarity(g, { treatDirectedAsUndirected: false })).toThrow(/undirected/i);
  });

  it('supports wasm backend for planar embeddings', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();
    const result = testPlanarity(g, { backend: 'wasm' });
    expect(result.planar).toBe(true);
    if (result.planar) {
      const mesh = buildHalfEdgeMesh(g, result.embedding);
      const validation = validateMesh(mesh);
      expect(validation.ok).toBe(true);
    }
  });

  it('supports wasm backend for nonplanar witnesses', () => {
    const left = [0, 1, 2];
    const right = [3, 4, 5];
    const edges: Array<[number, number]> = [];
    for (const u of left) {
      for (const v of right) edges.push([u, v]);
    }
    const g = edgeListToGraph(edges).build();
    const result = testPlanarity(g, { backend: 'wasm' });
    expect(result.planar).toBe(false);
    if (!result.planar) {
      expect(result.witness.edges.length).toBeGreaterThan(0);
      expect(result.witness.vertices.length).toBeGreaterThan(0);
    }
  });

  it('auto backend can be forced to wasm via maxTsVertices', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, false);
    const g = builder.build();
    const result = testPlanarity(g, { backend: 'auto', maxTsVertices: 0 });
    expect(result.planar).toBe(true);
  });

  it('prunes redundant edges when extracting a witness', () => {
    const builder = new GraphBuilder();
    for (let i = 0; i < 6; i += 1) builder.addVertex(i);
    const left = [0, 1, 2];
    const right = [3, 4, 5];
    for (const u of left) {
      for (const v of right) builder.addEdge(u, v, false);
    }
    // Add a redundant edge that keeps the graph nonplanar even when removed.
    builder.addEdge(0, 1, false);
    const g = builder.build();
    const witness = planarityWitness(
      g.vertexCount(),
      g.edges().map((edge) => ({ id: edge.id, u: edge.u, v: edge.v })),
    );
    expect(witness.edges.length).toBe(9);
  });

  it('classifies non-bipartite 6-vertex 9-edge witnesses as K3,3 fallback', () => {
    const builder = new GraphBuilder();
    for (let i = 0; i < 6; i += 1) builder.addVertex(i);
    const left = [0, 1, 2];
    const right = [3, 4, 5];
    for (const u of left) {
      for (const v of right) {
        if ((u === 2 && v === 5) || (u === 1 && v === 4)) continue;
        builder.addEdge(u, v, false);
      }
    }
    // Add same-side edges to break bipartiteness while keeping 9 edges
    // and avoid degree-2 suppression.
    builder.addEdge(1, 2, false);
    builder.addEdge(4, 5, false);
    const g = builder.build();
    const witness = planarityWitness(
      g.vertexCount(),
      g.edges().map((edge) => ({ id: edge.id, u: edge.u, v: edge.v })),
    );
    expect(witness.type).toBe('K3,3');
  });
});
