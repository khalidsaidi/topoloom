import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { testPlanarity } from '../src/planarity';
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

  it('accepts multi-edges but rejects self-loops', () => {
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
    expect(() => testPlanarity(loopGraph)).toThrow(/self-loops/i);
    const ignored = testPlanarity(loopGraph, { allowSelfLoops: 'ignore' });
    expect(ignored.planar).toBe(true);
    expect(ignored.ignoredSelfLoops).toEqual([loopId]);
  });

  it('rejects directed graphs', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    builder.addEdge(a, b, true);
    const g = builder.build();
    expect(() => testPlanarity(g)).toThrow(/undirected/i);
    const relaxed = testPlanarity(g, { treatDirectedAsUndirected: true });
    expect(relaxed.planar).toBe(true);
    expect(relaxed.treatedDirectedAsUndirected).toBe(true);
  });
});
