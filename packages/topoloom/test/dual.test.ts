import { describe, expect, it } from 'vitest';

import { GraphBuilder } from '../src/graph';
import { buildHalfEdgeMesh, rotationFromAdjacency } from '../src/embedding';
import { buildDual, dualShortestPath, routeEdgeFixedEmbedding, routeEdgeOnGraph } from '../src/dual';

describe('dual', () => {
  it('builds dual graph with face adjacency', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();

    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const dual = buildDual(mesh);
    expect(dual.graph.vertexCount()).toBe(2);
    expect(dual.graph.edgeCount()).toBe(3);

    const path = dualShortestPath(dual, [0], [1]);
    expect(path?.faces.length).toBeGreaterThanOrEqual(2);
    expect(path?.primalEdges.length).toBe(1);
  });

  it('routes edges via dual shortest path', () => {
    const builder = new GraphBuilder();
    const a = builder.addVertex('a');
    const b = builder.addVertex('b');
    const c = builder.addVertex('c');
    builder.addEdge(a, b, false);
    builder.addEdge(b, c, false);
    builder.addEdge(c, a, false);
    const g = builder.build();

    const mesh = buildHalfEdgeMesh(g, rotationFromAdjacency(g));
    const route = routeEdgeFixedEmbedding(mesh, a, b);
    expect(route).not.toBeNull();
    expect(route?.crossedPrimalEdges.length).toBeGreaterThanOrEqual(0);
  });

  it('routes on graphs with planar fallback', () => {
    const builder = new GraphBuilder();
    for (let i = 0; i < 5; i += 1) builder.addVertex(i);
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) builder.addEdge(i, j, false);
    }
    const g = builder.build();
    const route = routeEdgeOnGraph(g, 0, 3, { planarityFallback: true });
    expect(route).not.toBeNull();
    expect(route?.crossedPrimalEdges.length).toBeGreaterThanOrEqual(0);
    expect(route?.note).toMatch(/maximal planar/i);
  });
});
