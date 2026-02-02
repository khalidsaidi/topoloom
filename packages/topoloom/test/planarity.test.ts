import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { testPlanarity } from '../src/planarity';
import { buildHalfEdgeMesh, validateMesh } from '../src/embedding';

const edgeListToGraph = (edges: Array<[number, number]>): GraphBuilder => {
  const builder = new GraphBuilder();
  const max = edges.reduce((acc, [u, v]) => Math.max(acc, u, v), 0);
  for (let i = 0; i <= max; i += 1) builder.addVertex(i);
  for (const [u, v] of edges) builder.addEdge(u, v, false);
  return builder;
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
});
